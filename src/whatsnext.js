import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import {
  fetchPrimary,
  parseWorktreeChanges,
  runGit,
  withTemporaryWorktree,
} from "./git.js";
import { inspectIdeaLayout } from "./idea-layout.js";

const ACTIVE_STATES = new Set(["preparing", "implementing", "deploying"]);

function diagnostic(code, message, remediation, path) {
  return { code, level: "error", ...(path ? { path } : {}), message, remediation };
}

function failed(root, diagnostics, request, observedPrimaryCommit = null) {
  return {
    command: "whats-next",
    ok: false,
    root,
    diagnostics,
    result: request
      ? { observedPrimaryCommit, request, selectedIdea: null, action: null }
      : null,
  };
}

function ideaName(idea) {
  return idea.alias ?? idea.id;
}

function summary(idea) {
  const value = {
    id: idea.id,
    revision: idea.revision,
    state: idea.state,
  };
  if (idea.alias !== undefined) value.alias = idea.alias;
  return value;
}

function action(code, message, details = {}) {
  return { code, message, details };
}

function success(root, observedPrimaryCommit, request, selectedIdea, nextAction) {
  return {
    command: "whats-next",
    ok: true,
    root,
    diagnostics: [],
    result: {
      observedPrimaryCommit,
      request,
      selectedIdea: selectedIdea ? summary(selectedIdea) : null,
      action: nextAction,
    },
  };
}

export function stateAction(idea) {
  if (idea.state === "abandoned") {
    return action(
      "review-abandoned",
      `Review abandoned idea ${ideaName(idea)} and decide whether to keep it abandoned or revise it.`,
      { statusPath: idea.statusPath },
    );
  }
  if (idea.state === "preparing") {
    return action(
      "prepare-idea",
      `Clarify idea ${ideaName(idea)}, update its definition, and record approval for revision ${idea.revision}.`,
      { ideaPath: idea.relativePath, revision: idea.revision, statusPath: idea.statusPath },
    );
  }
  if (idea.state === "implementing") {
    return action(
      "implement-idea",
      `Implement idea ${ideaName(idea)} and accept repository results for revision ${idea.revision}.`,
      { ideaPath: idea.relativePath, revision: idea.revision, statusPath: idea.statusPath },
    );
  }
  if (idea.state === "deploying") {
    return action(
      "deploy-idea",
      `Drive the external world from primary for idea ${ideaName(idea)} and accept deployment for revision ${idea.revision}.`,
      { ideaPath: idea.relativePath, revision: idea.revision, statusPath: idea.statusPath },
    );
  }
  return action(
    "review-completed",
    `Review completed idea ${ideaName(idea)} and decide whether to revise it or create a new idea.`,
    { ideaPath: idea.relativePath, revision: idea.revision, statusPath: idea.statusPath },
  );
}

function selectIdea(ideas, selector) {
  if (!selector) return null;
  return ideas.find(({ id, alias }) => id === selector || alias === selector) ?? null;
}

function worktreeAction(root, config, observedPrimaryCommit) {
  const symbolic = runGit(root, ["symbolic-ref", "--quiet", "HEAD"]);
  const expectedBranch = `refs/heads/${config.primaryBranch}`;
  if (!symbolic.ok || symbolic.stdout !== expectedBranch) {
    return action(
      "switch-to-primary",
      `Preserve current work, then switch to configured primary branch ${config.primaryBranch}.`,
      { actual: symbolic.ok ? symbolic.stdout : null, expected: expectedBranch },
    );
  }

  const status = runGit(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
  if (!status.ok) {
    return action(
      "inspect-worktree-changes",
      "Worktree changes could not be inspected; repair Git state before continuing.",
      { error: status.stderr },
    );
  }
  let changes;
  try {
    changes = parseWorktreeChanges(status.stdout);
  } catch (caught) {
    return action(
      "inspect-worktree-changes",
      "Worktree changes could not be parsed; inspect Git state before continuing.",
      { error: caught.message },
    );
  }
  if (changes.conflicted.length > 0) {
    return action(
      "resolve-conflicts",
      "Resolve worktree conflicts without discarding either side, then run whats-next again.",
      changes,
    );
  }
  if (changes.staged.length > 0 || changes.unstaged.length > 0 || changes.untracked.length > 0) {
    return action(
      "inspect-worktree-changes",
      "Inspect the exact worktree diff; preserve unknown work and commit, isolate, or explicitly handle each path.",
      changes,
    );
  }

  const local = runGit(root, ["rev-parse", "HEAD"]);
  if (!local.ok) {
    return action(
      "integrate-primary",
      "Local HEAD is unavailable; repair the primary checkout before continuing.",
      { error: local.stderr },
    );
  }
  if (local.stdout === observedPrimaryCommit) return null;
  if (runGit(root, ["merge-base", "--is-ancestor", local.stdout, observedPrimaryCommit]).ok) {
    return action(
      "fast-forward-primary",
      `Fast-forward local ${config.primaryBranch} to observed primary ${observedPrimaryCommit}.`,
      { from: local.stdout, to: observedPrimaryCommit },
    );
  }
  if (runGit(root, ["merge-base", "--is-ancestor", observedPrimaryCommit, local.stdout]).ok) {
    return action(
      "publish-primary",
      `Validate and publish local primary ${local.stdout} with expected remote tip ${observedPrimaryCommit}.`,
      {
        repository: config.primaryRepository,
        branch: config.primaryBranch,
        commit: local.stdout,
        expectedRemoteTip: observedPrimaryCommit,
        validation: { target: "commit", revision: local.stdout },
      },
    );
  }
  return action(
    "integrate-primary",
    "Preserve both local and remote primary histories and integrate them without force-pushing.",
    { local: local.stdout, remote: observedPrimaryCommit },
  );
}

export async function whatsNext({ create = false, idea: selector, root = process.cwd() } = {}) {
  const repositoryRoot = resolve(root);
  const request = create
    ? { kind: "create-idea" }
    : selector === undefined
      ? { kind: "navigate" }
      : { kind: "select-idea", selector };
  let local;
  try {
    local = await withTemporaryWorktree(repositoryRoot, "HEAD", (worktree) =>
      loadConfig({ root: worktree }),
    );
  } catch (caught) {
    return failed(repositoryRoot, [diagnostic(
      "head.observation-failed",
      caught.message,
      "Restore a valid committed HEAD snapshot and retry.",
    )], request);
  }
  if (!local.config) return failed(repositoryRoot, local.diagnostics, request);

  let observedPrimaryCommit;
  try {
    observedPrimaryCommit = fetchPrimary(repositoryRoot, local.config);
  } catch (caught) {
    return failed(repositoryRoot, [diagnostic(
      "primary.refresh-failed",
      caught.message,
      "Check network, authorization, repository URL, and primary branch, then retry.",
    )], request);
  }

  let observed;
  try {
    observed = await withTemporaryWorktree(
      repositoryRoot,
      observedPrimaryCommit,
      async (worktree, tree) => {
        const loaded = await loadConfig({ root: worktree });
        if (!loaded.config) return { config: null, diagnostics: loaded.diagnostics, ideas: [] };
        const layout = await inspectIdeaLayout({
          config: loaded.config,
          gitRoot: repositoryRoot,
          historyCommit: observedPrimaryCommit,
          root: worktree,
          snapshotTree: tree,
        });
        return { config: loaded.config, ...layout };
      },
    );
  } catch (caught) {
    return failed(repositoryRoot, [diagnostic(
      "primary.observation-failed",
      caught.message,
      "Repair the fetched primary snapshot and retry.",
    )], request, observedPrimaryCommit);
  }
  const observationDiagnostics = create
    ? observed.diagnostics.filter(({ code }) => code !== "layout.ideas.missing")
    : observed.diagnostics;
  if (observationDiagnostics.length > 0) {
    return failed(repositoryRoot, observationDiagnostics, request, observedPrimaryCommit);
  }

  const hygiene = worktreeAction(repositoryRoot, local.config, observedPrimaryCommit);
  if (hygiene) return success(repositoryRoot, observedPrimaryCommit, request, null, hygiene);

  if (create) {
    return success(repositoryRoot, observedPrimaryCommit, request, null, action(
      "create-idea",
      "Create one new idea scaffold in the configured ideas directory.",
    ));
  }

  if (!selector) {
    const active = observed.ideas.filter(({ state }) => ACTIVE_STATES.has(state));
    if (active.length > 1) {
      return success(repositoryRoot, observedPrimaryCommit, request, null, action(
        "select-active-idea",
        "Select one active idea by ULID or unique alias.",
        { ideas: active.map(summary) },
      ));
    }
    if (active.length === 1) {
      return success(repositoryRoot, observedPrimaryCommit, request, active[0], action(
        "continue-active-idea",
        `Continue active idea ${ideaName(active[0])}.`,
        { idea: summary(active[0]) },
      ));
    }
    return success(repositoryRoot, observedPrimaryCommit, request, null, action(
      "create-idea",
      "Discuss the next goal and create one new idea folder with its sibling status file.",
    ));
  }

  const selected = selectIdea(observed.ideas, selector);
  if (!selected) {
    return failed(repositoryRoot, [diagnostic(
      "idea.not-found",
      `Idea ${selector} does not exist in observed primary ${observedPrimaryCommit}.`,
      "Choose a ULID or exact alias reported by silvermoon whats-next.",
      selector,
    )], request, observedPrimaryCommit);
  }

  return success(repositoryRoot, observedPrimaryCommit, request, selected, stateAction(selected));
}