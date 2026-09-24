import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import {
  commitChangedPaths,
  fetchPrimary,
  indexSnapshot,
  observeGitCommands,
  resolveCommit,
  worktreePathTree,
  worktreeSnapshot,
  withTemporaryTree,
  withTemporaryWorktree,
} from "../../src/git.js";

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
  const base = await mkdtemp(join(tmpdir(), "silvermoon-git-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "remote.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "silvermoon test");
  git(root, "config", "user.email", "silvermoon@example.invalid");
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
      version: 1,
      primaryRepository: repository,
      primaryBranch: "main",
    },
    root,
  };
}

test("fetches primary by URL without a named Git remote", async () => {
  const { config, root } = await createRepository();
  assert.equal(git(root, "remote"), "");
  const refs = git(root, "for-each-ref", "--format=%(refname) %(objectname)");

  const primary = fetchPrimary(root, config);
  git(root, "cat-file", "-e", `${primary}^{commit}`);
  assert.equal(git(root, "for-each-ref", "--format=%(refname) %(objectname)"), refs);
});

test("resolves commits and reports root commit paths", async () => {
  const { root } = await createRepository();
  const commit = resolveCommit(root, "HEAD");

  assert.equal(commit, git(root, "rev-parse", "HEAD"));
  assert.deepEqual(commitChangedPaths(root, commit), ["README.md"]);
  assert.throws(() => resolveCommit(root, "missing-revision"), /Cannot resolve commit/);
});

test("materializes staged and full worktree snapshots without changing caller state", async () => {
  const { root } = await createRepository();
  await writeFile(join(root, "staged.txt"), "staged\n");
  git(root, "add", "staged.txt");
  await writeFile(join(root, "README.md"), "unstaged\n");
  await writeFile(join(root, "untracked.txt"), "untracked\n");
  await mkdir(join(root, "folder"));
  await writeFile(join(root, "folder", "definition.md"), "definition\n");
  git(root, "config", "--unset", "user.name");
  git(root, "config", "--unset", "user.email");
  const status = git(root, "status", "--short");

  const staged = indexSnapshot(root);
  assert.deepEqual(staged.paths, ["staged.txt"]);
  await withTemporaryTree(root, staged.tree, async (worktree) => {
    assert.equal(await readFile(join(worktree, "README.md"), "utf8"), "fixture\n");
    assert.equal(await readFile(join(worktree, "staged.txt"), "utf8"), "staged\n");
    await assert.rejects(readFile(join(worktree, "untracked.txt"), "utf8"), {
      code: "ENOENT",
    });
  });

  const worktree = worktreeSnapshot(root);
  await withTemporaryTree(root, worktree.tree, async (worktree) => {
    assert.equal(await readFile(join(worktree, "README.md"), "utf8"), "unstaged\n");
    assert.equal(await readFile(join(worktree, "staged.txt"), "utf8"), "staged\n");
    assert.equal(await readFile(join(worktree, "untracked.txt"), "utf8"), "untracked\n");
  });
  assert.equal(
    worktreePathTree(root, "folder"),
    git(root, "rev-parse", `${worktree.tree}:folder`),
  );

  assert.equal(git(root, "status", "--short"), status);
  assert.equal(git(root, "branch", "--show-current"), "main");
  assert.equal(git(root, "stash", "list"), "");
});

test("materializes immutable commits without Git worktree commands", async () => {
  const { root } = await createRepository();
  const commands = [];

  await observeGitCommands(
    (args) => commands.push(args),
    () => withTemporaryWorktree(root, "HEAD", async (snapshot) => {
      assert.equal(await readFile(join(snapshot, "README.md"), "utf8"), "fixture\n");
    }),
  );

  assert.equal(
    commands.some(([command]) => command === "worktree"),
    false,
    JSON.stringify(commands),
  );
});
