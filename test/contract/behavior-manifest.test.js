import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const expected = [
  "ahead",
  "alias-absent",
  "behind",
  "branch-mismatch",
  "conflict",
  "dirty",
  "diverged",
  "partial-write-failure",
  "primary-relocation",
  "publish-concurrent-move",
  "publish-coordinates",
  "selector-known",
  "selector-none",
  "selector-unknown",
  "structured-changes",
  "ulid-collision",
  "unrelated-active-create",
];

test("executes the approved behavior case manifest", async () => {
  const sources = await Promise.all([
    readFile(new URL("../integration/create-idea.test.js", import.meta.url), "utf8"),
    readFile(new URL("../integration/whatsnext.test.js", import.meta.url), "utf8"),
  ]);
  const actual = [];
  for (const source of sources) {
    for (const title of source.matchAll(/test\("([^"]+)"/g)) {
      for (const tag of title[1].matchAll(/\[([a-z][a-z-]+)\]/g)) {
        actual.push(tag[1]);
      }
    }
  }

  assert.deepEqual(actual.sort(), expected);
});