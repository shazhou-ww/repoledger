import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let commandObserver = null;

export function runGit(root, args, { env } = {}) {
  if (commandObserver) commandObserver([...args]);
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

export async function observeGitCommands(observer, callback) {
  if (commandObserver) throw new Error("Git command observation is already active");
  commandObserver = observer;
  try {
    return await callback();
  } finally {
    commandObserver = null;
  }
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

const CHANGE_KINDS = {
  A: "added",
  C: "copied",
  D: "deleted",
  M: "modified",
  R: "renamed",
  T: "type-changed",
  U: "unmerged",
};

const CONFLICT_KINDS = {
  AA: "both-added",
  AU: "added-by-us",
  DD: "both-deleted",
  DU: "deleted-by-us",
  UA: "added-by-them",
  UD: "deleted-by-them",
  UU: "both-modified",
};

function recordFields(record, count) {
  const fields = [];
  let offset = 2;
  for (let index = 0; index < count; index += 1) {
    const separator = record.indexOf(" ", offset);
    if (separator < 0) throw new Error(`Malformed Git status record: ${record}`);
    fields.push(record.slice(offset, separator));
    offset = separator + 1;
  }
  return { fields, path: record.slice(offset) };
}

function changeEntry(path, code, originalPath) {
  const entry = { path, kind: CHANGE_KINDS[code] ?? "unknown" };
  if (originalPath !== undefined) entry.originalPath = originalPath;
  return entry;
}

function sortChanges(changes) {
  changes.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function parseWorktreeChanges(source) {
  const result = { staged: [], unstaged: [], untracked: [], conflicted: [] };
  const records = source.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.startsWith("? ")) {
      result.untracked.push({ path: record.slice(2) });
      continue;
    }
    if (record.startsWith("! ") || record.startsWith("# ")) continue;
    if (record.startsWith("u ")) {
      const { fields, path } = recordFields(record, 9);
      result.conflicted.push({ path, kind: CONFLICT_KINDS[fields[0]] ?? "unmerged" });
      continue;
    }
    if (record.startsWith("1 ") || record.startsWith("2 ")) {
      const renamed = record.startsWith("2 ");
      const { fields, path } = recordFields(record, renamed ? 8 : 7);
      const [indexCode, worktreeCode] = fields[0];
      const originalPath = renamed ? records[++index] : undefined;
      if (indexCode !== ".") {
        result.staged.push(changeEntry(path, indexCode, originalPath));
      }
      if (worktreeCode !== ".") {
        result.unstaged.push(changeEntry(path, worktreeCode));
      }
      continue;
    }
    throw new Error(`Unsupported Git status record: ${record}`);
  }
  for (const changes of Object.values(result)) sortChanges(changes);
  return result;
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

export function fetchRepositoryBranch(root, repository, branch) {
  const remoteRef = `refs/heads/${branch}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const advertised = requireGit(
      root,
      ["ls-remote", "--refs", repository, remoteRef],
      `Cannot inspect ${branch}`,
    );
    const [primary, advertisedRef] = advertised.split(/\s+/);
    if (!primary || advertisedRef !== remoteRef) {
      throw new Error(`Cannot resolve remote branch ${branch}`);
    }
    requireGit(
      root,
      [
        "fetch",
        "--no-tags",
        "--no-write-fetch-head",
        repository,
        remoteRef,
      ],
      `Cannot fetch ${branch}`,
    );
    if (runGit(root, ["cat-file", "-e", `${primary}^{commit}`]).ok) return primary;
  }
  throw new Error(`Remote branch ${branch} moved repeatedly while fetching`);
}

export function fetchPrimary(root, config) {
  return fetchRepositoryBranch(
    root,
    config.primaryRepository,
    config.primaryBranch,
  );
}

export async function withTemporaryWorktree(root, commit, callback) {
  const tree = requireGit(root, ["rev-parse", `${commit}^{tree}`], `Cannot resolve tree for ${commit}`);
  return withTemporaryTree(root, tree, callback);
}

export async function withTemporaryTree(root, tree, callback) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "repoledger-tree-"));
  const directory = join(temporaryRoot, "snapshot");
  const env = { ...process.env, GIT_INDEX_FILE: join(temporaryRoot, "index") };
  try {
    await mkdir(directory);
    requireGit(root, ["read-tree", tree], "Cannot populate isolated index", { env });
    const prefix = `${directory.replaceAll("\\", "/")}/`;
    requireGit(
      root,
      ["checkout-index", "--all", "--force", `--prefix=${prefix}`],
      "Cannot populate isolated tree snapshot",
      { env },
    );
    return await callback(directory, tree);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
