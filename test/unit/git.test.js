import assert from "node:assert/strict";
import { test } from "node:test";

import { parseWorktreeChanges, sanitizeGitMessage } from "../../src/git.js";

test("redacts credentials and sensitive query values from Git messages", () => {
  const message = [
    "fatal: https://",
    "user:secret",
    "@example.test/repository.git?token=abc123 and ",
    "ghp_abcdefghijklmnopqrstuvwxyz",
  ].join("");
  const sanitized = sanitizeGitMessage(message);

  assert.doesNotMatch(sanitized, /user:secret|abc123|ghp_/);
  assert.match(sanitized, /https:\/\/\[redacted\]@example\.test/);
  assert.match(sanitized, /token=\[redacted\]/);
});

test("parses porcelain v2 worktree changes into stable arrays", () => {
  const hash = "a".repeat(40);
  const source = [
    `2 R. N... 100644 100644 100644 ${hash} ${hash} R100 renamed.txt`,
    "old.txt",
    `1 .M N... 100644 100644 100644 ${hash} ${hash} modified.txt`,
    "? new.txt",
    `u UU N... 100644 100644 100644 100644 ${hash} ${hash} ${hash} conflict.txt`,
    "",
  ].join("\0");

  assert.deepEqual(parseWorktreeChanges(source), {
    staged: [{ path: "renamed.txt", kind: "renamed", originalPath: "old.txt" }],
    unstaged: [{ path: "modified.txt", kind: "modified" }],
    untracked: [{ path: "new.txt" }],
    conflicted: [{ path: "conflict.txt", kind: "both-modified" }],
  });
});
