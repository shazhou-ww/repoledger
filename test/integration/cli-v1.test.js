import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../../src/cli.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

function gitStatus() {
  const result = spawnSync("git", ["-C", repositoryRoot, "status", "--porcelain=v1"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function capture() {
  return {
    error: () => {},
    log: () => {},
  };
}

test("rejects legacy command spellings without changing the repository", async () => {
  const before = gitStatus();

  for (const command of ["whatsnext", "new", "newidea", "new-idea"]) {
    assert.equal(await runCli([command], capture()), 2, command);
  }
  assert.equal(gitStatus(), before);
});
