import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { repositoryNamespace } from "./repository.js";

export function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
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

function requireGit(root, args, label) {
  const result = runGit(root, args);
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

export function readRemoteBranch(root, repository, branch) {
  const reference = `refs/heads/${branch}`;
  const result = runGit(root, ["ls-remote", "--exit-code", "--heads", repository, reference]);
  if (result.status === 2) return null;
  if (!result.ok) {
    const error = new Error(
      `Cannot inspect ${branch}: ${sanitizeGitMessage(result.stderr) || result.error?.message || "Git failed"}`,
    );
    error.git = { ...result, stderr: sanitizeGitMessage(result.stderr) };
    throw error;
  }
  const [commit] = result.stdout.split(/\s+/, 1);
  return commit || null;
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

export function commitPaths(worktree, paths, message) {
  requireGit(worktree, ["add", "--all", "--", ...paths], "Cannot stage operation-owned paths");
  const staged = runGit(worktree, ["diff", "--cached", "--quiet", "--", ...paths]);
  if (staged.ok) return requireGit(worktree, ["rev-parse", "HEAD"], "Cannot resolve unchanged commit");
  requireGit(worktree, ["commit", "-m", message, "--", ...paths], "Cannot create publication commit");
  return requireGit(worktree, ["rev-parse", "HEAD"], "Cannot resolve publication commit");
}

export function pushPrimary(worktree, config, expectedCommit, commit = "HEAD") {
  const primaryRef = `refs/heads/${config.primaryBranch}`;
  const lease = expectedCommit
    ? [`--force-with-lease=${primaryRef}:${expectedCommit}`]
    : [];
  return requireGit(
    worktree,
    ["push", ...lease, config.primaryRepository, `${commit}:${primaryRef}`],
    "Cannot publish primary",
  );
}

export function pushSourceCreate(worktree, repository, branch, commit = "HEAD") {
  const sourceRef = `refs/heads/${branch}`;
  return requireGit(
    worktree,
    [
      "push",
      `--force-with-lease=${sourceRef}:`,
      repository,
      `${commit}:${sourceRef}`,
    ],
    "Cannot create source branch",
  );
}

export function pushStartAtomic(
  worktree,
  config,
  { commit = "HEAD", primaryBefore, sourceBranch },
) {
  const primaryRef = `refs/heads/${config.primaryBranch}`;
  const sourceRef = `refs/heads/${sourceBranch}`;
  return requireGit(
    worktree,
    [
      "push",
      "--atomic",
      `--force-with-lease=${primaryRef}:${primaryBefore}`,
      `--force-with-lease=${sourceRef}:`,
      config.primaryRepository,
      `${commit}:${primaryRef}`,
      `${commit}:${sourceRef}`,
    ],
    "Cannot publish task start",
  );
}

export function verifyPrimary(root, config, expectedCommit) {
  const actual = fetchPrimary(root, config);
  if (!runGit(root, ["merge-base", "--is-ancestor", expectedCommit, actual]).ok) {
    throw new Error(`Published commit ${expectedCommit} is not reachable from primary ${actual}`);
  }
  return actual;
}

export function verifySource(root, repository, branch, expectedCommit) {
  const actual = fetchRepositoryBranch(root, repository, branch);
  if (actual !== expectedCommit) {
    throw new Error(
      `Source ${repository} ${branch} is ${actual}, expected ${expectedCommit}`,
    );
  }
  return actual;
}
