import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import { inspectTaskContents } from "./content.js";
import {
  commitChangedPaths,
  fetchPrimary,
  fetchRepositoryBranch,
  indexSnapshot,
  resolveCommit,
  runGit,
  unstagedSnapshot,
  withTemporaryTree,
  withTemporaryWorktree,
} from "./git.js";
import { inspectLayout } from "./layout.js";
import { effectiveSourceRepository } from "./repository.js";

function selectionDiagnostic(name) {
  return {
    code: "task.selection.missing",
    level: "error",
    message: `Task ${name} does not exist in the repository ledger.`,
    path: name,
    remediation: "Choose a task name reported by repoledger task list.",
    task: name,
  };
}

function validateProgressChanges(config, { commit, paths, target }) {
  const progressPattern = new RegExp(
    `^${config.tasksDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+/Progress\\.md$`,
  );
  const changesProgress = paths.some((path) => progressPattern.test(path));
  const changesOutsideTasks = paths.some(
    (path) => path !== config.tasksDirectory && !path.startsWith(`${config.tasksDirectory}/`),
  );
  if (!changesProgress || changesOutsideTasks) return [];
  const subject = commit ? `Commit ${commit}` : `The ${target} target`;
  return [{
    code: "progress.history.bookkeeping-only",
    level: "error",
    message: `${subject} changes Progress.md without an implementation path outside ${config.tasksDirectory}.`,
    remediation: "Keep Progress.md changes with an implementation change outside the task directory.",
    actual: commit ? { commit, paths } : { target, paths },
  }];
}

function sourceIntroductionCommit(root, config, primary, taskName) {
  const statusPath = `${config.tasksDirectory}/status.yaml`;
  const started = runGit(root, [
    "log",
    "-1",
    "--format=%H",
    "--fixed-strings",
    `--grep=task: start ${taskName}`,
    primary,
    "--",
    statusPath,
  ]);
  if (started.ok && started.stdout) return started.stdout;
  const migrated = runGit(root, [
    "log",
    "--reverse",
    "--format=%H",
    "-S",
    "version: 2",
    primary,
    "--",
    statusPath,
  ]);
  return migrated.ok && migrated.stdout
    ? migrated.stdout.split(/\r?\n/, 1)[0]
    : null;
}

function validateRemoteSources(root, config, primary, tasks) {
  const diagnostics = [];
  const sourceRefs = [];
  const fetched = new Map();
  for (const { name, record } of tasks) {
    if (record.state !== "ongoing") continue;
    const repository = effectiveSourceRepository(config, record);
    const key = `${repository}\0${record.sourceBranch}`;
    let tip = fetched.get(key);
    if (!tip) {
      try {
        tip = fetchRepositoryBranch(root, repository, record.sourceBranch);
        fetched.set(key, tip);
      } catch (caught) {
        diagnostics.push({
          code: "task.source.unavailable",
          level: "error",
          message: caught.message,
          remediation: "Restore or republish the recorded source branch, then retry remote validation.",
          task: name,
        });
        continue;
      }
    }
    const introduced = sourceIntroductionCommit(root, config, primary, name);
    if (!introduced) {
      diagnostics.push({
        code: "task.source.introduction-missing",
        level: "error",
        message: `Cannot find the published source-ref introduction for ${name}.`,
        remediation: "Repair the task lifecycle history through an approved forward migration.",
        task: name,
      });
      continue;
    }
    if (!runGit(root, ["merge-base", "--is-ancestor", introduced, tip]).ok) {
      diagnostics.push({
        code: "task.source.history-diverged",
        level: "error",
        message: `Source branch ${record.sourceBranch} does not retain the task's published start history.`,
        remediation: "Republish the recorded branch at the start commit or a descendant without force-rewriting shared work.",
        expected: introduced,
        actual: tip,
        task: name,
      });
      continue;
    }
    sourceRefs.push({
      task: name,
      repository,
      branch: record.sourceBranch,
      tip,
    });
  }
  return { diagnostics, sourceRefs };
}

async function inspectSnapshot({ root, taskName }) {
  const repositoryRoot = resolve(root);
  const loaded = await loadConfig({ root: repositoryRoot });
  const layout = loaded.config
    ? await inspectLayout({ config: loaded.config, root: repositoryRoot })
    : { diagnostics: [], tasks: [] };
  const matchingTask = taskName
    ? layout.tasks.find(({ name }) => name === taskName)
    : null;
  const selectedTasks = taskName
    ? matchingTask
      ? [matchingTask]
      : []
    : layout.tasks;
  const contents = loaded.config
    ? await inspectTaskContents({ root: repositoryRoot, tasks: selectedTasks })
    : { diagnostics: [] };
  const diagnostics = [
    ...loaded.diagnostics,
    ...layout.diagnostics,
    ...(taskName && !matchingTask ? [selectionDiagnostic(taskName)] : []),
    ...contents.diagnostics,
  ];

  const report = {
    command: "check",
    ok: diagnostics.every(({ level }) => level !== "error"),
    root: repositoryRoot,
    diagnostics,
    result: {
      checked: selectedTasks.length,
      source: "local",
      total: layout.tasks.length,
    },
  };
  return { config: loaded.config, layout, report };
}

function targetFailure(root, code, message, remediation) {
  return {
    command: "check",
    ok: false,
    root,
    diagnostics: [{ code, level: "error", message, remediation }],
    result: null,
  };
}

function finishTarget({ commit, inspected, paths, result, root, source }) {
  const report = inspected.report;
  report.root = root;
  report.result = { ...report.result, source, ...result };
  if (inspected.config) {
    report.diagnostics.push(...validateProgressChanges(inspected.config, {
      commit,
      paths,
      target: source,
    }));
  }
  report.ok = report.diagnostics.every(({ level }) => level !== "error");
  return report;
}

export async function checkRepository({
  commit,
  remote = false,
  root = process.cwd(),
  staged = false,
  taskName,
  unstaged = false,
} = {}) {
  const repositoryRoot = resolve(root);
  const targetCount = [remote, commit !== undefined, staged, unstaged].filter(Boolean).length;
  if (targetCount > 1) {
    return targetFailure(
      repositoryRoot,
      "check.target.conflict",
      "Check targets are mutually exclusive.",
      "Choose exactly one of remote, commit, staged, or unstaged.",
    );
  }

  if (remote) {
    const local = await loadConfig({ root: repositoryRoot });
    if (!local.config) return (await inspectSnapshot({ root: repositoryRoot, taskName })).report;
    try {
      const primary = fetchPrimary(repositoryRoot, local.config);
      const inspected = await withTemporaryWorktree(repositoryRoot, primary, (worktree) =>
        inspectSnapshot({ root: worktree, taskName }),
      );
      let sources = { diagnostics: [], sourceRefs: [] };
      if (inspected.report.ok && inspected.config) {
        const selectedTasks = taskName
          ? inspected.layout.tasks.filter(({ name }) => name === taskName)
          : inspected.layout.tasks;
        sources = validateRemoteSources(
          repositoryRoot,
          inspected.config,
          primary,
          selectedTasks,
        );
      }
      inspected.report.diagnostics.push(...sources.diagnostics);
      return finishTarget({
        commit: primary,
        inspected,
        paths: commitChangedPaths(repositoryRoot, primary),
        result: { primary, sourceRefs: sources.sourceRefs },
        root: repositoryRoot,
        source: "remote",
      });
    } catch (caught) {
      return targetFailure(
        repositoryRoot,
        "git.fetch.failed",
        caught.message,
        "Check remote access and retry.",
      );
    }
  }

  if (commit !== undefined) {
    let resolvedCommit;
    try {
      resolvedCommit = resolveCommit(repositoryRoot, commit);
    } catch (caught) {
      return targetFailure(
        repositoryRoot,
        "git.commit.invalid",
        caught.message,
        "Choose a commit available in the local repository.",
      );
    }
    try {
      const inspected = await withTemporaryWorktree(repositoryRoot, resolvedCommit, (worktree) =>
        inspectSnapshot({ root: worktree, taskName }),
      );
      return finishTarget({
        commit: resolvedCommit,
        inspected,
        paths: commitChangedPaths(repositoryRoot, resolvedCommit),
        result: { commit: resolvedCommit },
        root: repositoryRoot,
        source: "commit",
      });
    } catch (caught) {
      return targetFailure(
        repositoryRoot,
        "git.snapshot.failed",
        caught.message,
        "Resolve the repository state and retry the commit check.",
      );
    }
  }

  if (staged) {
    try {
      const snapshot = indexSnapshot(repositoryRoot);
      const inspected = await withTemporaryTree(repositoryRoot, snapshot.tree, (worktree) =>
        inspectSnapshot({ root: worktree, taskName }),
      );
      return finishTarget({
        inspected,
        paths: snapshot.paths,
        root: repositoryRoot,
        source: "staged",
      });
    } catch (caught) {
      return targetFailure(
        repositoryRoot,
        "git.snapshot.failed",
        caught.message,
        "Resolve the index state and retry the staged check.",
      );
    }
  }

  if (unstaged) {
    try {
      const snapshot = unstagedSnapshot(repositoryRoot);
      const inspected = await withTemporaryWorktree(repositoryRoot, snapshot.commit, (worktree) =>
        inspectSnapshot({ root: worktree, taskName }),
      );
      return finishTarget({
        inspected,
        paths: snapshot.paths,
        root: repositoryRoot,
        source: "unstaged",
      });
    } catch (caught) {
      return targetFailure(
        repositoryRoot,
        "git.snapshot.failed",
        caught.message,
        "Resolve the worktree state and retry the unstaged check.",
      );
    }
  }

  return (await inspectSnapshot({ root: repositoryRoot, taskName })).report;
}

export { listTasks, statusRepository } from "./status.js";
export { initRepository } from "./init.js";
export { prepareV1Migration } from "./migration.js";
export { mutateTask } from "./publication.js";
