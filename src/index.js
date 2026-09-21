import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import { inspectTaskContents } from "./content.js";
import {
  fetchPrimary,
  fetchRepositoryBranch,
  runGit,
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

function validateProgressHistory(root, config, primary) {
  const statusPath = `${config.tasksDirectory}/status.yaml`;
  const introduced = runGit(root, [
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--reverse",
    primary,
    "--",
    statusPath,
  ]);
  if (!introduced.ok || !introduced.stdout) return [];
  const migration = introduced.stdout.split(/\r?\n/, 1)[0];
  const listed = runGit(root, ["rev-list", "--first-parent", "--reverse", `${migration}..${primary}`]);
  if (!listed.ok || !listed.stdout) return [];
  const diagnostics = [];
  const progressPattern = new RegExp(
    `^${config.tasksDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+/Progress\\.md$`,
  );
  for (const commit of listed.stdout.split(/\r?\n/).filter(Boolean)) {
    const parent = runGit(root, ["rev-parse", `${commit}^1`]);
    if (!parent.ok) continue;
    const changed = runGit(root, [
      "diff",
      "--name-only",
      parent.stdout,
      commit,
      "--",
    ]);
    if (!changed.ok) continue;
    const paths = changed.stdout.split(/\r?\n/).filter(Boolean);
    const changesProgress = paths.some((path) => progressPattern.test(path));
    const changesOutsideTasks = paths.some(
      (path) => path !== config.tasksDirectory && !path.startsWith(`${config.tasksDirectory}/`),
    );
    if (changesProgress && !changesOutsideTasks) {
      diagnostics.push({
        code: "progress.history.bookkeeping-only",
        level: "error",
        message: `Commit ${commit} changes Progress.md without an implementation path outside ${config.tasksDirectory}.`,
        remediation: "Revert the bookkeeping-only change with a forward commit and keep future progress updates with implementation changes.",
        actual: { commit, paths },
      });
    }
  }
  return diagnostics;
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

export async function checkRepository({
  remote = false,
  root = process.cwd(),
  taskName,
} = {}) {
  const repositoryRoot = resolve(root);
  const loaded = await loadConfig({ root: repositoryRoot });
  if (remote && loaded.config) {
    try {
      const primary = fetchPrimary(repositoryRoot, loaded.config);
      const report = await withTemporaryWorktree(repositoryRoot, primary, (worktree) =>
        checkRepository({ root: worktree, taskName }),
      );
      report.root = repositoryRoot;
      let sources = { diagnostics: [], sourceRefs: [] };
      if (report.ok) {
        const layout = await withTemporaryWorktree(
          repositoryRoot,
          primary,
          (worktree) => inspectLayout({ config: loaded.config, root: worktree }),
        );
        const selectedTasks = taskName
          ? layout.tasks.filter(({ name }) => name === taskName)
          : layout.tasks;
        sources = validateRemoteSources(
          repositoryRoot,
          loaded.config,
          primary,
          selectedTasks,
        );
      }
      report.result = {
        ...report.result,
        source: "remote",
        primary,
        sourceRefs: sources.sourceRefs,
      };
      report.diagnostics.push(...sources.diagnostics);
      report.diagnostics.push(...validateProgressHistory(repositoryRoot, loaded.config, primary));
      report.ok = report.diagnostics.every(({ level }) => level !== "error");
      return report;
    } catch (caught) {
      return {
        command: "check",
        ok: false,
        root: repositoryRoot,
        diagnostics: [{
          code: "git.fetch.failed",
          level: "error",
          message: caught.message,
          remediation: "Check remote access and retry.",
        }],
        result: null,
      };
    }
  }
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

  return {
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
}

export { listTasks, statusRepository } from "./status.js";
export { initRepository } from "./init.js";
export { prepareV1Migration } from "./migration.js";
export { mutateTask } from "./publication.js";
