import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function findSkillFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) matches.push(...(await findSkillFiles(path)));
    if (entry.isFile() && entry.name === "SKILL.md") matches.push(path);
  }
  return matches;
}

test("exposes one consolidated repoledger skill", async () => {
  const skillFiles = await findSkillFiles(repositoryRoot);
  assert.equal(skillFiles.length, 1);

  const path = skillFiles[0];
  const source = await readFile(path, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  assert.ok(frontmatter, "repoledger skill is missing YAML frontmatter");

  const document = parseDocument(frontmatter[1]);
  assert.deepEqual(document.errors, []);
  assert.deepEqual(document.toJS(), {
    name: "repoledger",
    description:
      "Create, execute, inspect, complete, or abandon explicitly opted-in repository tasks through Repoledger. Ordinary implementation requests remain task-free.",
    "argument-hint": "<new|exec|status|complete|abandon> [task or context]",
    "user-invocable": true,
  });

  for (const required of [
    "`new [context]`",
    "`exec [task]`",
    "`status [task]`",
    "`complete [task]`",
    "`abandon [task]`",
    "The invocation itself is not delivery approval",
    "For a missing or unknown verb",
  ]) {
    assert.ok(source.includes(required), `repoledger skill is missing: ${required}`);
  }
  assert.doesNotMatch(source, /`task-new`|`task-exec`/);

  for (const [, target] of source.matchAll(/\[[^\]]+\]\((\.\/[^)#]+)(?:#[^)]+)?\)/g)) {
    const referenced = resolve(dirname(path), target);
    await assert.doesNotReject(() => readFile(referenced));
  }
});