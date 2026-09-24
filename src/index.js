import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import {
  fetchPrimary,
  indexSnapshot,
  resolveCommit,
  runGit,
  worktreeSnapshot,
  withTemporaryTree,
  withTemporaryWorktree,
} from "./git.js";
import { inspectIdeaLayout } from "./idea-layout.js";

function ideaSummary(idea) {
  return {
    id: idea.id,
    alias: idea.alias,
    revision: idea.revision,
    state: idea.state,
  };
}

async function inspectSnapshot({
  baseRevision,
  historyCommit,
  root,
  target = "local",
  validateCandidate = false,
}) {
  const repositoryRoot = resolve(root);
  const loaded = await loadConfig({ root: repositoryRoot });
  const layout = loaded.config
    ? await inspectIdeaLayout({
      baseRevision,
      config: loaded.config,
      historyCommit,
      root: repositoryRoot,
      validateCandidate,
    })
    : { diagnostics: [], ideas: [] };
  const diagnostics = [
    ...loaded.diagnostics,
    ...layout.diagnostics,
  ];

  const report = {
    command: "check",
    ok: diagnostics.every(({ level }) => level !== "error"),
    root: repositoryRoot,
    diagnostics,
    result: {
      target,
      checked: layout.ideas.length,
      ideas: layout.ideas.map(ideaSummary),
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

function finishTarget({ commit, inspected, root, target }) {
  const report = inspected.report;
  report.root = root;
  report.result = { ...report.result, target };
  if (commit) report.result.commit = commit;
  report.ok = report.diagnostics.every(({ level }) => level !== "error");
  return report;
}

export async function checkRepository({
  commit,
  remote = false,
  root = process.cwd(),
  staged = false,
  worktree = false,
} = {}) {
  const repositoryRoot = resolve(root);
  const targetCount = [remote, commit !== undefined, staged, worktree].filter(Boolean).length;
  if (targetCount > 1) {
    return targetFailure(
      repositoryRoot,
      "check.target.conflict",
      "Check targets are mutually exclusive.",
      "Choose exactly one of remote, commit, staged, or worktree.",
    );
  }

  if (remote) {
    try {
      const head = resolveCommit(repositoryRoot, "HEAD");
      const bootstrap = await withTemporaryWorktree(repositoryRoot, head, (worktreeRoot) =>
        inspectSnapshot({ root: worktreeRoot, target: "remote" }),
      );
      if (!bootstrap.config) {
        return finishTarget({ inspected: bootstrap, root: repositoryRoot, target: "remote" });
      }
      const primary = fetchPrimary(repositoryRoot, bootstrap.config);
      const inspected = await withTemporaryWorktree(repositoryRoot, primary, (worktree) =>
        inspectSnapshot({ historyCommit: primary, root: worktree, target: "remote" }),
      );
      return finishTarget({
        commit: primary,
        inspected,
        root: repositoryRoot,
        target: "remote",
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

  if (commit !== undefined || (!staged && !worktree)) {
    const revision = commit ?? "HEAD";
    const target = commit === undefined ? "head" : "commit";
    let resolvedCommit;
    try {
      resolvedCommit = resolveCommit(repositoryRoot, revision);
    } catch (caught) {
      return targetFailure(
        repositoryRoot,
        "git.commit.invalid",
        caught.message,
        commit === undefined
          ? "Create or restore a valid HEAD commit."
          : "Choose a commit available in the local repository.",
      );
    }
    try {
      const parent = runGit(repositoryRoot, ["rev-parse", `${resolvedCommit}^1`]);
      const inspected = await withTemporaryWorktree(repositoryRoot, resolvedCommit, (worktree) =>
        inspectSnapshot({
          baseRevision: parent.ok ? parent.stdout : null,
          root: worktree,
          target,
          validateCandidate: true,
        }),
      );
      return finishTarget({
        commit: resolvedCommit,
        inspected,
        root: repositoryRoot,
        target,
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
        inspectSnapshot({
          baseRevision: "HEAD",
          root: worktree,
          target: "staged",
          validateCandidate: true,
        }),
      );
      return finishTarget({
        inspected,
        root: repositoryRoot,
        target: "staged",
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

  if (worktree) {
    try {
      const snapshot = worktreeSnapshot(repositoryRoot);
      const inspected = await withTemporaryTree(repositoryRoot, snapshot.tree, (worktree) =>
        inspectSnapshot({
          baseRevision: "HEAD",
          root: worktree,
          target: "worktree",
          validateCandidate: true,
        }),
      );
      return finishTarget({
        inspected,
        root: repositoryRoot,
        target: "worktree",
      });
    } catch (caught) {
      return targetFailure(
        repositoryRoot,
        "git.snapshot.failed",
        caught.message,
        "Resolve the worktree state and retry the worktree check.",
      );
    }
  }

  throw new Error("Unreachable check target");
}

export {
  deriveIdeaState,
  isValidUlid,
  parseIdeaStatus,
  serializeIdeaStatus,
  validateIdeaStatus,
} from "./ideas.js";
export { whatsNext } from "./whatsnext.js";
