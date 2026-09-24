import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import { isReachableFromPrimary } from "../../scripts/prepare-npm-release.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

test("checks real Git ancestry against the refreshed origin/main ref", async () => {
  const root = await mkdtemp(join(tmpdir(), "npm-release-ancestry-"));
  temporaryDirectories.push(root);
  git(root, ["init", "--initial-branch=main"]);
  git(root, ["config", "user.name", "release test"]);
  git(root, ["config", "user.email", "release@example.invalid"]);
  await writeFile(join(root, "main.txt"), "main\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "main"]);
  const mainCommit = git(root, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/remotes/origin/main", mainCommit]);

  git(root, ["checkout", "--orphan", "unrelated"]);
  git(root, ["rm", "-rf", "."]);
  await writeFile(join(root, "unrelated.txt"), "unrelated\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "unrelated"]);
  const unrelatedCommit = git(root, ["rev-parse", "HEAD"]);

  assert.equal(isReachableFromPrimary(mainCommit, { root }), true);
  assert.equal(isReachableFromPrimary(unrelatedCommit, { root }), false);
  assert.throws(
    () => isReachableFromPrimary("--is-ancestor", { root }),
    /full hexadecimal Git object ID/,
  );
});
