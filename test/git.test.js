import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import {
  commitChangedPaths,
  commitPaths,
  fetchPrimary,
  indexSnapshot,
  pushPrimary,
  pushStartAtomic,
  repositoryTrackingRef,
  resolveCommit,
  sanitizeGitMessage,
  unstagedSnapshot,
  verifySource,
  withTemporaryTree,
  withTemporaryWorktree,
} from "../src/git.js";

const temporaryDirectories = [];
const repository = "https://example.test/owner/repository.git";

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRepository() {
  const base = await mkdtemp(join(tmpdir(), "repoledger-git-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "remote.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "repoledger test");
  git(root, "config", "user.email", "repoledger@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  await writeFile(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "Initialize fixture");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "push", remote, "main");
  git(
    root,
    "config",
    `url.${pathToFileURL(remote).href}.insteadOf`,
    repository,
  );
  return {
    config: {
      version: 2,
      tasksDirectory: "tasks",
      primaryRepository: repository,
      primaryBranch: "main",
    },
    root,
  };
}

test("fetches and publishes by URL without a named Git remote", async () => {
  const { config, root } = await createRepository();
  assert.equal(git(root, "remote"), "");

  const primary = fetchPrimary(root, config);
  assert.equal(
    git(root, "rev-parse", repositoryTrackingRef(repository, "main")),
    primary,
  );

  const published = await withTemporaryWorktree(root, primary, async (worktree) => {
    await writeFile(join(worktree, "published.txt"), "published\n");
    const commit = commitPaths(worktree, ["published.txt"], "Publish by URL");
    pushPrimary(worktree, config, primary);
    return commit;
  });

  assert.equal(fetchPrimary(root, config), published);
});

test("atomically creates a source branch while advancing primary", async () => {
  const { config, root } = await createRepository();
  const primary = fetchPrimary(root, config);

  const published = await withTemporaryWorktree(root, primary, async (worktree) => {
    await writeFile(join(worktree, "started.txt"), "started\n");
    const commit = commitPaths(worktree, ["started.txt"], "Start task");
    pushStartAtomic(worktree, config, {
      commit,
      primaryBefore: primary,
      sourceBranch: "task/example",
    });
    return commit;
  });

  assert.equal(fetchPrimary(root, config), published);
  assert.equal(
    verifySource(root, repository, "task/example", published),
    published,
  );
});

test("redacts credentials and sensitive query values from Git messages", () => {
  const message = "fatal: https://user:secret@example.test/repository.git?token=abc123 and ghp_abcdefghijklmnopqrstuvwxyz";
  const sanitized = sanitizeGitMessage(message);

  assert.doesNotMatch(sanitized, /user:secret|abc123|ghp_/);
  assert.match(sanitized, /https:\/\/\[redacted\]@example\.test/);
  assert.match(sanitized, /token=\[redacted\]/);
});

test("resolves commits and reports root commit paths", async () => {
  const { root } = await createRepository();
  const commit = resolveCommit(root, "HEAD");

  assert.equal(commit, git(root, "rev-parse", "HEAD"));
  assert.deepEqual(commitChangedPaths(root, commit), ["README.md"]);
  assert.throws(() => resolveCommit(root, "missing-revision"), /Cannot resolve commit/);
});

test("materializes staged and tracked unstaged snapshots without changing caller state", async () => {
  const { root } = await createRepository();
  await writeFile(join(root, "staged.txt"), "staged\n");
  git(root, "add", "staged.txt");
  await writeFile(join(root, "README.md"), "unstaged\n");
  await writeFile(join(root, "untracked.txt"), "untracked\n");
  git(root, "config", "--unset", "user.name");
  git(root, "config", "--unset", "user.email");
  const status = git(root, "status", "--short");

  const staged = indexSnapshot(root);
  assert.deepEqual(staged.paths, ["staged.txt"]);
  await withTemporaryTree(root, staged.tree, async (worktree) => {
    assert.equal(await readFile(join(worktree, "README.md"), "utf8"), "fixture\n");
    assert.equal(await readFile(join(worktree, "staged.txt"), "utf8"), "staged\n");
    await assert.rejects(readFile(join(worktree, "untracked.txt"), "utf8"), { code: "ENOENT" });
  });

  const unstaged = unstagedSnapshot(root);
  assert.deepEqual(unstaged.paths, ["README.md"]);
  await withTemporaryWorktree(root, unstaged.commit, async (worktree) => {
    assert.equal(await readFile(join(worktree, "README.md"), "utf8"), "unstaged\n");
    assert.equal(await readFile(join(worktree, "staged.txt"), "utf8"), "staged\n");
    await assert.rejects(readFile(join(worktree, "untracked.txt"), "utf8"), { code: "ENOENT" });
  });

  assert.equal(git(root, "status", "--short"), status);
  assert.equal(git(root, "branch", "--show-current"), "main");
  assert.equal(git(root, "stash", "list"), "");
});