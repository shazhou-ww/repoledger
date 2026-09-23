import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { repositoryNamespace } from "./repository.js";

export function runGit(root, args, { env } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env,
    windowsHide: true,
  });
  return {
    error: result.error ?? null,
    ok: result.status === 0,
    status: result.status,
    stderr: result.stderr?.trim() ?? "",
    stdout: result.stdout?.trim() ?? "",
  };
}

export function sanitizeGitMessage(value) {
  return String(value)
    .replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi,
      "$1[redacted]@",
    )
    .replace(
      /([?&](?:access_token|auth|credential|key|password|signature|token)=)[^&#\s]+/gi,
      "$1[redacted]",
    )
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[redacted]");
}

function requireGit(root, args, label, options) {
  const result = runGit(root, args, options);
  if (!result.ok) {
    const safeResult = {
      ...result,
      stderr: sanitizeGitMessage(result.stderr),
    };
    const error = new Error(`${label}: ${safeResult.stderr || result.error?.message || "Git failed"}`);
    error.git = safeResult;
    throw error;
  }
  return result.stdout;
}

export function gitObjectIdLength(root) {
  const format = requireGit(
    root,
    ["rev-parse", "--show-object-format"],
    "Cannot determine Git object format",
  );
  if (format === "sha1") return 40;
  if (format === "sha256") return 64;
  throw new Error(`Unsupported Git object format: ${format}`);
}

export function worktreePathTree(root, path) {
  const directory = mkdtempSync(join(tmpdir(), "repoledger-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, "index") };
  try {
    const populated = runGit(root, ["read-tree", "HEAD"], { env });
    if (!populated.ok) {
      requireGit(root, ["read-tree", "--empty"], "Cannot initialize snapshot index", { env });
    }
    requireGit(
      root,
      ["add", "--all", "--", path],
      `Cannot snapshot ${path}`,
      { env },
    );
    const tree = requireGit(root, ["write-tree"], "Cannot write snapshot tree", { env });
    const object = requireGit(
      root,
      ["rev-parse", `${tree}:${path}`],
      `Cannot resolve tree for ${path}`,
    );
    const type = requireGit(root, ["cat-file", "-t", object], `Cannot inspect ${path}`);
    if (type !== "tree") throw new Error(`${path} does not resolve to a Git tree`);
    return object;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
export function worktreeSnapshot(root) {
  const directory = mkdtempSync(join(tmpdir(), "repoledger-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, "index") };
  try {
    const populated = runGit(root, ["read-tree", "HEAD"], { env });
    if (!populated.ok) {
      requireGit(root, ["read-tree", "--empty"], "Cannot initialize snapshot index", { env });
    }
    requireGit(root, ["add", "--all"], "Cannot snapshot worktree", { env });
    return {
      tree: requireGit(root, ["write-tree"], "Cannot write worktree snapshot", { env }),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function paths(stdout) {
  return stdout.split(/\r?\n/).filter(Boolean);
}

export function resolveCommit(root, revision) {
  return requireGit(
    root,
    ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`],
    `Cannot resolve commit ${revision}`,
  );
}

export function commitChangedPaths(root, commit) {
  const parent = runGit(root, ["rev-parse", "--verify", `${commit}^1`]);
  const changed = parent.ok
    ? requireGit(root, ["diff", "--name-only", parent.stdout, commit, "--"], `Cannot inspect commit ${commit}`)
    : requireGit(
      root,
      ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit, "--"],
      `Cannot inspect root commit ${commit}`,
    );
  return paths(changed);
}

export function indexSnapshot(root) {
  return {
    paths: paths(requireGit(root, ["diff", "--cached", "--name-only", "--"], "Cannot inspect staged changes")),
    tree: requireGit(root, ["write-tree"], "Cannot snapshot the index"),
  };
}

export function repositoryTrackingRef(repository, branch) {
  return `refs/repoledger/remotes/${repositoryNamespace(repository)}/heads/${branch}`;
}

export function fetchRepositoryBranch(root, repository, branch) {
  const localRef = repositoryTrackingRef(repository, branch);
  requireGit(
    root,
    [
      "fetch",
      "--no-tags",
      repository,
      `+refs/heads/${branch}:${localRef}`,
    ],
    `Cannot fetch ${branch}`,
  );
  return requireGit(root, ["rev-parse", localRef], `Cannot resolve fetched ${branch}`);
}

export function fetchPrimary(root, config) {
  return fetchRepositoryBranch(
    root,
    config.primaryRepository,
    config.primaryBranch,
  );
}

export async function withTemporaryWorktree(root, commit, callback) {
  const directory = await mkdtemp(join(tmpdir(), "repoledger-worktree-"));
  let added = false;
  try {
    requireGit(root, ["worktree", "add", "--detach", "--no-checkout", directory, commit], "Cannot create isolated worktree");
    added = true;
    requireGit(directory, ["reset", "--hard", commit], "Cannot populate isolated worktree");
    return await callback(directory);
  } finally {
    if (added) runGit(root, ["worktree", "remove", "--force", directory]);
    await rm(directory, { recursive: true, force: true });
    runGit(root, ["worktree", "prune"]);
  }
}

export async function withTemporaryTree(root, tree, callback) {
  const directory = await mkdtemp(join(tmpdir(), "repoledger-tree-"));
  let added = false;
  try {
    requireGit(root, ["worktree", "add", "--detach", "--no-checkout", directory, "HEAD"], "Cannot create isolated tree worktree");
    added = true;
    requireGit(directory, ["read-tree", tree], "Cannot populate isolated index");
    requireGit(directory, ["checkout-index", "--all", "--force"], "Cannot populate isolated tree worktree");
    return await callback(directory);
  } finally {
    if (added) runGit(root, ["worktree", "remove", "--force", directory]);
    await rm(directory, { recursive: true, force: true });
    runGit(root, ["worktree", "prune"]);
  }
}
