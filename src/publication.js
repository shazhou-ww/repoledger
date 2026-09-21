import { createHash } from "node:crypto";
import { cp, lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { loadConfig } from "./config.js";
import {
  commitPaths,
  fetchRepositoryBranch,
  fetchPrimary,
  pushPrimary,
  pushSourceCreate,
  pushStartAtomic,
  readRemoteBranch,
  runGit,
  verifyPrimary,
  verifySource,
  withTemporaryWorktree,
} from "./git.js";
import { checkRepository } from "./index.js";
import {
  createRecord,
  isTaskName,
  serializeStatusFile,
  transitionRecord,
} from "./ledger.js";
import { inspectLayout } from "./layout.js";
import {
  effectiveSourceRepository,
  validBranchName,
  validRepository,
} from "./repository.js";

function error(code, message, remediation, extra = {}) {
  return { code, level: "error", message, remediation, ...extra };
}

function report(command, root, diagnostics, result = null) {
  return {
    command,
    ok: diagnostics.every(({ level }) => level !== "error"),
    root,
    diagnostics,
    result,
  };
}

async function snapshotDirectory(path, base = path, hash = createHash("sha256")) {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(path, entry.name);
    const relativePath = relative(base, entryPath).replaceAll("\\", "/");
    const metadata = await lstat(entryPath);
    if (metadata.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${relativePath}`);
    hash.update(`${entry.isDirectory() ? "d" : "f"}:${relativePath}\0`);
    if (entry.isDirectory()) await snapshotDirectory(entryPath, base, hash);
    else if (entry.isFile()) {
      const content = await readFile(entryPath);
      hash.update(content.includes(0) ? content : content.toString("utf8").replaceAll("\r\n", "\n"));
    }
    else throw new Error(`Unsupported task artifact: ${relativePath}`);
  }
  return hash.digest("hex");
}

export async function remoteSnapshot(root, callback) {
  const loaded = await loadConfig({ root });
  if (!loaded.config) return report("snapshot", root, loaded.diagnostics);
  try {
    const commit = fetchPrimary(root, loaded.config);
    return await withTemporaryWorktree(root, commit, (worktree) =>
      callback({ commit, config: loaded.config, worktree }),
    );
  } catch (caught) {
    return report("snapshot", root, [
      error("git.fetch.failed", caught.message, "Check network access, authentication, remote, and primary branch."),
    ]);
  }
}

function messageFor(operation, taskName) {
  return `task: ${operation} ${taskName}`;
}

function operationCommit(root, primary, operation, taskName, statusRelative) {
  const found = runGit(root, [
    "log",
    "-1",
    "--format=%H",
    "--fixed-strings",
    `--grep=${messageFor(operation, taskName)}`,
    primary,
    "--",
    statusRelative,
  ]);
  return found.ok && found.stdout ? found.stdout : primary;
}

function cleanInternal(reportValue) {
  const { _observed, _retryable, ...publicReport } = reportValue;
  return publicReport;
}

function requestedSource(config, taskName, sourceRepository, sourceBranch) {
  const repository = sourceRepository ?? config.primaryRepository;
  const branch = sourceBranch ?? `task/${taskName}`;
  if (!validRepository(repository)) {
    throw Object.assign(
      new Error("sourceRepository must be a canonical credential-free HTTPS repository URL."),
      { code: "task.source.invalid-repository" },
    );
  }
  if (!validBranchName(branch)) {
    throw Object.assign(
      new Error("sourceBranch must be a valid short Git branch name."),
      { code: "task.source.invalid-branch" },
    );
  }
  if (repository === config.primaryRepository && branch === config.primaryBranch) {
    throw Object.assign(
      new Error("sourceBranch must differ from primaryBranch in the primary repository."),
      { code: "task.source.primary-branch" },
    );
  }
  return {
    branch,
    repository,
    storedRepository: repository === config.primaryRepository ? undefined : repository,
  };
}

async function findPendingStart({
  config,
  primaryBefore,
  root,
  source,
  statusRelative,
  taskName,
}) {
  const sourceTip = fetchRepositoryBranch(root, source.repository, source.branch);
  if (!runGit(root, ["merge-base", "--is-ancestor", primaryBefore, sourceTip]).ok) {
    return null;
  }
  const listed = runGit(root, [
    "rev-list",
    "--reverse",
    "--ancestry-path",
    `${primaryBefore}..${sourceTip}`,
  ]);
  if (!listed.ok || !listed.stdout) return null;
  const candidate = listed.stdout.split(/\r?\n/, 1)[0];
  const parents = runGit(root, ["show", "-s", "--format=%P", candidate]);
  const message = runGit(root, ["show", "-s", "--format=%B", candidate]);
  const changed = runGit(root, ["diff", "--name-only", primaryBefore, candidate, "--"]);
  if (
    !parents.ok ||
    parents.stdout !== primaryBefore ||
    !message.ok ||
    message.stdout !== messageFor("start", taskName) ||
    !changed.ok ||
    changed.stdout !== statusRelative
  ) {
    return null;
  }

  const valid = await withTemporaryWorktree(root, candidate, async (worktree) => {
    const loaded = await loadConfig({ root: worktree });
    if (!loaded.config || JSON.stringify(loaded.config) !== JSON.stringify(config)) return false;
    const layout = await inspectLayout({ config, root: worktree });
    if (layout.diagnostics.some(({ level }) => level === "error")) return false;
    const record = layout.status.tasks[taskName];
    return Boolean(
      record?.state === "ongoing" &&
      record.sourceBranch === source.branch &&
      effectiveSourceRepository(config, record) === source.repository,
    );
  });
  return valid ? { candidate, sourceTip } : null;
}

async function attemptMutation({
  _beforePush,
  attempt,
  approvedCommit,
  baseline,
  now = new Date(),
  operation,
  root = process.cwd(),
  sourceBranch,
  sourceRepository,
  taskName,
} = {}) {
  if (!isTaskName(taskName)) {
    return report(`task ${operation}`, root, [
      error("task.name.invalid", `Task name must use lowercase kebab-case: ${String(taskName)}`, "Use a name such as example-task.", { task: taskName }),
    ]);
  }
  const loaded = await loadConfig({ root });
  if (!loaded.config) return report(`task ${operation}`, root, loaded.diagnostics);
  const config = loaded.config;
  let source;
  if (operation === "start") {
    try {
      source = requestedSource(
        config,
        taskName,
        sourceRepository,
        sourceBranch,
      );
    } catch (caught) {
      return report(`task ${operation}`, root, [
        error(caught.code, caught.message, "Use a dedicated short branch and a canonical credential-free HTTPS repository URL.", { task: taskName }),
      ]);
    }
  }
  let primaryBefore;
  try {
    primaryBefore = fetchPrimary(root, config);
  } catch (caught) {
    return report(`task ${operation}`, root, [
      error("git.fetch.failed", caught.message, "Check network access, authentication, remote, and primary branch."),
    ]);
  }

  try {
    return await withTemporaryWorktree(root, primaryBefore, async (worktree) => {
      const remoteConfig = await loadConfig({ root: worktree });
      if (!remoteConfig.config || JSON.stringify(remoteConfig.config) !== JSON.stringify(config)) {
        return report(`task ${operation}`, root, [
          ...remoteConfig.diagnostics,
          error("config.primary-mismatch", "Local configuration does not match fetched primary.", "Refresh the local primary branch before retrying."),
        ]);
      }
      const layout = await inspectLayout({ config, root: worktree });
      if (layout.diagnostics.some(({ level }) => level === "error")) {
        return report(`task ${operation}`, root, layout.diagnostics);
      }

      const existing = layout.status.tasks[taskName];
      const taskRelative = `${config.tasksDirectory}/${taskName}`;
      const taskPath = resolve(worktree, taskRelative);
      const statusRelative = `${config.tasksDirectory}/status.yaml`;
      const remoteTask = layout.tasks.find(({ name }) => name === taskName);
      const remoteHash = remoteTask ? await snapshotDirectory(taskPath) : null;
      const observed = { record: existing ?? null, taskHash: remoteHash };
      let sourceHash;
      if (operation === "register") {
        const sourcePath = resolve(root, taskRelative);
        try {
          const metadata = await lstat(sourcePath);
          if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("source is not a regular directory");
          sourceHash = await snapshotDirectory(sourcePath);
        } catch (caught) {
          return report(`task ${operation}`, root, [
            error("task.register.invalid-source", `Cannot import ${taskRelative}: ${caught.message}`, "Prepare a stable task directory containing Task.md before registration.", { task: taskName, path: taskRelative }),
          ]);
        }
        if (existing) {
          if (existing.state === "backlog" && sourceHash === remoteHash) {
            const commit = operationCommit(root, primaryBefore, operation, taskName, statusRelative);
            return report(`task ${operation}`, root, [], {
              task: taskName,
              transition: "absent -> backlog",
              publication: "already-published",
              primaryBefore,
              primaryAfter: primaryBefore,
              commit,
            });
          }
          return report(`task ${operation}`, root, [
            error("task.register.exists", `Task ${taskName} is already registered.`, "Choose a new task name or inspect the existing task.", { task: taskName }),
          ]);
        }
        if (baseline && JSON.stringify(observed) !== JSON.stringify(baseline)) {
          return report(`task ${operation}`, root, [
            error("task.concurrent-conflict", `Task ${taskName} changed during publication.`, "Refresh the task and coordinate the same-task change before retrying.", { expected: baseline, actual: observed, task: taskName }),
          ]);
        }
        if (remoteHash && sourceHash !== remoteHash) {
          return report(`task ${operation}`, root, [
            error("task.register.content-conflict", `Published unregistered task ${taskName} differs from the local task directory.`, "Reconcile the local and primary task contents before retrying registration.", { task: taskName, path: taskRelative }),
          ]);
        }
        if (!remoteHash) {
          await cp(sourcePath, taskPath, { recursive: true, errorOnExist: true, force: false });
        }
        layout.status.tasks[taskName] = createRecord(now);
      } else {
        if (!existing) {
          return report(`task ${operation}`, root, [
            error("task.selection.missing", `Task ${taskName} does not exist.`, "Choose a task reported by repoledger task list.", { task: taskName }),
          ]);
        }
        const target = operation === "start"
          ? "ongoing"
          : operation === "complete"
            ? "completed"
            : operation === "abandon"
              ? "abandoned"
              : null;
        if (!target) {
          return report(`task ${operation}`, root, [
            error("task.operation.invalid", `Unknown task operation: ${operation}`, "Use register, start, complete, or abandon."),
          ]);
        }
        if (existing.state === target) {
          const commit = operationCommit(root, primaryBefore, operation, taskName, statusRelative);
          if (operation !== "complete" || !approvedCommit) {
            if (operation === "start") {
              const existingRepository = effectiveSourceRepository(config, existing);
              if (
                existingRepository !== source.repository ||
                existing.sourceBranch !== source.branch
              ) {
                return report(`task ${operation}`, root, [
                  error("task.source.conflict", `Task ${taskName} is already ongoing from a different source ref.`, "Use the source ref reported by repoledger status.", { actual: existing, task: taskName }),
                ]);
              }
              try {
                const sourceTip = fetchRepositoryBranch(
                  root,
                  existingRepository,
                  existing.sourceBranch,
                );
                return report(`task ${operation}`, root, [], {
                  task: taskName,
                  transition: `${baseline?.record?.state ?? existing.state} -> ${target}`,
                  publication: "already-published",
                  primaryBefore,
                  primaryAfter: primaryBefore,
                  sourceRepository: existingRepository,
                  sourceBranch: existing.sourceBranch,
                  sourceTip,
                  commit,
                });
              } catch (caught) {
                return report(`task ${operation}`, root, [
                  error("task.source.unavailable", caught.message, "Republish the recorded source branch and retry.", { task: taskName }),
                ]);
              }
            }
            return report(`task ${operation}`, root, [], {
              task: taskName,
              transition: `${baseline?.record?.state ?? existing.state} -> ${target}`,
              publication: "already-published",
              primaryBefore,
              primaryAfter: primaryBefore,
              commit,
            });
          }
          const resolved = runGit(root, ["rev-parse", "--verify", `${approvedCommit}^{commit}`]);
          const parents = runGit(root, ["show", "-s", "--format=%P", commit]);
          if (resolved.ok && parents.ok && parents.stdout.split(" ").includes(resolved.stdout)) {
            return report(`task ${operation}`, root, [], {
              task: taskName,
              transition: "ongoing -> completed",
              publication: "already-published",
              primaryBefore,
              primaryAfter: primaryBefore,
              commit,
            });
          }
        }
        if (baseline && JSON.stringify(observed) !== JSON.stringify(baseline)) {
          return report(`task ${operation}`, root, [
            error("task.concurrent-conflict", `Task ${taskName} changed during publication.`, "Refresh the task and coordinate the same-task change before retrying.", { expected: baseline, actual: observed, task: taskName }),
          ]);
        }
        if (operation === "complete") {
          const resolved = approvedCommit
            ? runGit(root, ["rev-parse", "--verify", `${approvedCommit}^{commit}`])
            : { ok: false };
          if (!resolved.ok || resolved.stdout !== primaryBefore) {
            return report(`task ${operation}`, root, [
              error("task.complete.approval-mismatch", "The approved commit is not the fetched primary tip.", "Obtain delivery approval for the current primary commit and retry with --approved-commit.", { expected: primaryBefore, actual: resolved.stdout ?? null, task: taskName }),
            ]);
          }
          const existingRepository = effectiveSourceRepository(config, existing);
          let sourceTip;
          try {
            sourceTip = fetchRepositoryBranch(
              root,
              existingRepository,
              existing.sourceBranch,
            );
          } catch (caught) {
            return report(`task ${operation}`, root, [
              error("task.complete.source-unavailable", caught.message, "Restore the recorded source branch before completing the task.", { task: taskName }),
            ]);
          }
          if (!runGit(root, ["merge-base", "--is-ancestor", sourceTip, resolved.stdout]).ok) {
            return report(`task ${operation}`, root, [
              error("task.complete.source-not-integrated", "The recorded source branch tip is not contained in the approved primary commit.", "Integrate the fetched source tip into primary, validate it, and obtain delivery approval for the new primary commit.", { actual: sourceTip, expected: resolved.stdout, task: taskName }),
            ]);
          }
        }
        try {
          layout.status.tasks[taskName] = transitionRecord(
            existing,
            target,
            now,
            operation === "start"
              ? {
                sourceBranch: source.branch,
                sourceRepository: source.storedRepository,
              }
              : undefined,
          );
        } catch (caught) {
          return report(`task ${operation}`, root, [
            error("task.state.conflict", caught.message, "Refresh task status and choose a legal lifecycle operation.", { actual: existing, task: taskName }),
          ]);
        }
      }

      await writeFile(
        resolve(worktree, statusRelative),
        serializeStatusFile(layout.status, {
          primaryRepository: config.primaryRepository,
        }),
      );
      const prospective = await checkRepository({ root: worktree });
      if (prospective.diagnostics.some(({ level }) => level === "error")) {
        return report(`task ${operation}`, root, prospective.diagnostics);
      }

      if (operation === "register") {
        const sourcePath = resolve(root, taskRelative);
        if (await snapshotDirectory(sourcePath) !== sourceHash) {
          return report(`task ${operation}`, root, [
            error("task.register.source-changed", `Task ${taskName} changed during publication.`, "Review the local task directory and retry registration."),
          ]);
        }
      }

      const ownedPaths = operation === "register"
        ? [statusRelative, taskRelative]
        : [statusRelative];
      const commit = commitPaths(worktree, ownedPaths, messageFor(operation, taskName));
      if (operation === "start") {
        let existingSource;
        try {
          existingSource = readRemoteBranch(root, source.repository, source.branch);
        } catch (caught) {
          return report(`task ${operation}`, root, [
            error("git.source.inspect-failed", caught.message, "Check source repository access and retry.", { task: taskName }),
          ]);
        }

        if (existingSource) {
          if (source.repository === config.primaryRepository) {
            return report(`task ${operation}`, root, [
              error("task.source.exists", `Source branch ${source.branch} already exists in the primary repository.`, "Choose a new source branch or resume the task already advertising this ref.", { actual: existingSource, task: taskName }),
            ]);
          }
          const pending = await findPendingStart({
            config,
            primaryBefore,
            root,
            source,
            statusRelative,
            taskName,
          });
          if (!pending) {
            return report(`task ${operation}`, root, [
              error("task.source.exists", `Source branch ${source.branch} already exists and is not a recoverable start publication.`, "Choose a new source branch or coordinate cleanup of the existing ref.", { actual: existingSource, task: taskName }),
            ]);
          }
          try {
            if (_beforePush) await _beforePush({ attempt, primaryBefore });
            pushPrimary(worktree, config, primaryBefore, pending.candidate);
            verifyPrimary(root, config, pending.candidate);
          } catch (caught) {
            return report(`task ${operation}`, root, [
              error("git.start.primary-pending", caught.message, "Retry while primary remains at the candidate's original parent, or choose a new source branch.", { task: taskName }),
            ], {
              task: taskName,
              transition: "backlog -> ongoing",
              publication: "partially-published",
              primaryBefore,
              primaryAfter: null,
              sourceRepository: source.repository,
              sourceBranch: source.branch,
              sourceTip: pending.sourceTip,
              commit: pending.candidate,
            });
          }
          return report(`task ${operation}`, root, prospective.diagnostics, {
            task: taskName,
            transition: "backlog -> ongoing",
            publication: "published",
            primaryBefore,
            primaryAfter: pending.candidate,
            sourceRepository: source.repository,
            sourceBranch: source.branch,
            sourceTip: pending.sourceTip,
            commit: pending.candidate,
          });
        }

        if (source.repository === config.primaryRepository) {
          try {
            if (_beforePush) await _beforePush({ attempt, primaryBefore });
            pushStartAtomic(worktree, config, {
              commit,
              primaryBefore,
              sourceBranch: source.branch,
            });
            verifyPrimary(root, config, commit);
            verifySource(root, source.repository, source.branch, commit);
          } catch (caught) {
            return {
              ...report(`task ${operation}`, root, [
                error("git.publish.failed", caught.message, "Refresh primary and source refs, then retry without force-pushing.", { task: taskName }),
              ]),
              _observed: observed,
              _retryable: true,
            };
          }
        } else {
          try {
            pushSourceCreate(worktree, source.repository, source.branch, commit);
            verifySource(root, source.repository, source.branch, commit);
          } catch (caught) {
            return report(`task ${operation}`, root, [
              error("git.source.publish-failed", caught.message, "Check source repository access, branch availability, and permissions before retrying.", { task: taskName }),
            ]);
          }
          try {
            if (_beforePush) await _beforePush({ attempt, primaryBefore });
            pushPrimary(worktree, config, primaryBefore);
            verifyPrimary(root, config, commit);
          } catch (caught) {
            return report(`task ${operation}`, root, [
              error("git.start.primary-pending", caught.message, "Retry while primary remains at the candidate's original parent, or choose a new source branch.", { task: taskName }),
            ], {
              task: taskName,
              transition: "backlog -> ongoing",
              publication: "partially-published",
              primaryBefore,
              primaryAfter: null,
              sourceRepository: source.repository,
              sourceBranch: source.branch,
              sourceTip: commit,
              commit,
            });
          }
        }

        return report(`task ${operation}`, root, prospective.diagnostics, {
          task: taskName,
          transition: "backlog -> ongoing",
          publication: "published",
          primaryBefore,
          primaryAfter: commit,
          sourceRepository: source.repository,
          sourceBranch: source.branch,
          sourceTip: commit,
          commit,
        });
      }
      try {
        if (_beforePush) await _beforePush({ attempt, primaryBefore });
        pushPrimary(worktree, config, primaryBefore);
        verifyPrimary(root, config, commit);
      } catch (caught) {
        return {
          ...report(`task ${operation}`, root, [
            error("git.publish.failed", caught.message, "Refresh primary, resolve the reported conflict, and retry without force-pushing.", { task: taskName }),
          ]),
          _observed: observed,
          _retryable: true,
        };
      }

      return report(`task ${operation}`, root, prospective.diagnostics, {
        task: taskName,
        transition: operation === "register" ? "absent -> backlog" : `${existing.state} -> ${layout.status.tasks[taskName].state}`,
        publication: "published",
        primaryBefore,
        primaryAfter: commit,
        commit,
      });
    });
  } catch (caught) {
    return report(`task ${operation}`, root, [
      error("git.operation.failed", caught.message, "Resolve the Git or filesystem failure and retry."),
    ]);
  }
}

export async function mutateTask(options = {}) {
  let baseline = null;
  let lastReport;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastReport = await attemptMutation({ ...options, attempt, baseline });
    if (!baseline && lastReport._observed) baseline = lastReport._observed;
    if (!lastReport._retryable) return cleanInternal(lastReport);
  }
  return cleanInternal(lastReport);
}
