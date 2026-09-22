import assert from "node:assert/strict";
import { readdir, readFile, readlink, realpath } from "node:fs/promises";
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
  const repoledgerSkills = [];
  for (const path of skillFiles) {
    const source = await readFile(path, "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
    if (!frontmatter) continue;
    const document = parseDocument(frontmatter[1]);
    if (document.get("name") === "repoledger") {
      repoledgerSkills.push({ document, path, source });
    }
  }
  assert.equal(repoledgerSkills.length, 1);

  const [{ document, path, source }] = repoledgerSkills;
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  assert.ok(frontmatter, "repoledger skill is missing YAML frontmatter");

  assert.deepEqual(document.errors, []);
  assert.deepEqual(document.toJS(), {
    name: "repoledger",
    description:
      "Create, execute, inspect, complete, or abandon explicitly opted-in repository tasks through Repoledger. Ordinary implementation requests remain task-free.",
    "argument-hint": "<new [--language <tag>] [context]|exec [task]|status [task]|complete [task]|abandon [task]>",
    "user-invocable": true,
  });

  for (const required of [
    "`new [--language <tag>] [context]`",
    "`exec [task]`",
    "`status [task]`",
    "`complete [task]`",
    "`abandon [task]`",
    "The invocation itself is not delivery approval",
    "For a missing or unknown verb",
    "config resolve --global task-language",
    "`Language: <canonical-tag>`",
    "A legacy task without `Language` uses `en`",
    "`primaryAfter` commit",
    "fast-forward the caller's checked-out primary branch",
    "Preserve unrelated index and worktree changes",
  ]) {
    assert.ok(source.includes(required), `repoledger skill is missing: ${required}`);
  }
  assert.doesNotMatch(source, /`task-new`|`task-exec`/);

  for (const [, target] of source.matchAll(/\[[^\]]+\]\((\.\/[^)#]+)(?:#[^)]+)?\)/g)) {
    const referenced = resolve(dirname(path), target);
    await assert.doesNotReject(() => readFile(referenced));
  }
});

test("registers the canonical repoledger skill for this project", async () => {
  const canonical = resolve(repositoryRoot, "skills", "repoledger");
  const registration = resolve(repositoryRoot, ".github", "skills", "repoledger");
  const target = (await readlink(registration)).replaceAll("\\", "/");

  assert.equal(target, "../../skills/repoledger");
  assert.equal(await realpath(registration), await realpath(canonical));
});

test("keeps task-language instructions aligned across artifact templates", async () => {
  const skillRoot = resolve(repositoryRoot, "skills", "repoledger");
  const task = await readFile(resolve(skillRoot, "assets", "Task.md"), "utf8");
  const progress = await readFile(resolve(skillRoot, "assets", "Progress.md"), "utf8");
  const acceptance = await readFile(resolve(skillRoot, "assets", "UserAcceptance.md"), "utf8");

  assert.match(task, /^Language: en$/m);
  assert.match(progress, /language recorded by `Task\.md`/);
  assert.match(acceptance, /language recorded by `Task\.md`/);
  assert.match(progress, /approval statuses, and outcome values in English/);
  assert.match(acceptance, /acceptance status values in English/);
});