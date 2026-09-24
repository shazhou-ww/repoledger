import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

async function findMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if ([".git", "ideas", "node_modules"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) matches.push(...(await findMarkdownFiles(path)));
    if (entry.isFile() && entry.name.endsWith(".md")) matches.push(path);
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
      "Navigate repository-owned ideas with repoledger whats-next, execute one safe action, and reobserve only after an observable delta.",
    "argument-hint": "[idea ULID or alias]",
    "user-invocable": true,
  });

  for (const required of [
    "repoledger whats-next [idea] --json",
    "repoledger create-idea --json",
    "Execute only the highest-priority action",
    "Preserve unknown, unrelated, or user-authored changes",
    "Never use force-push",
    "Repoledger has no approval, acceptance, or abandonment mutation commands",
    "## Implementation acceptance criteria",
    "## Deployment acceptance criteria",
    "Do not use task-list checkboxes",
    "criteriaEvidence",
    "criteria.evidence.missing",
    "verifyCriteriaEvidence",
    "I01",
    "I14",
    "repoledger check --worktree --json",
    "repoledger check --staged --json",
    "observedPrimaryCommit",
    "Never infer a human decision",
    "Never poll the same observation",
  ]) {
    assert.ok(source.includes(required), `repoledger skill is missing: ${required}`);
  }
  assert.doesNotMatch(
    source,
    /repoledger task |repoledger status|repoledger whatsnext|taskLanguage/,
  );
  assert.doesNotMatch(source, /^\s*- \[[ xX]\]/m);

  for (const [, target] of source.matchAll(/\[[^\]]+\]\((\.\/[^)#]+)(?:#[^)]+)?\)/g)) {
    const referenced = resolve(dirname(path), target);
    await assert.doesNotReject(() => readFile(referenced));
  }
});

test("registers the canonical repoledger skill for this project", async () => {
  const canonical = resolve(repositoryRoot, "skills", "repoledger");
  const registration = resolve(repositoryRoot, ".github", "skills", "repoledger");
  let target;
  try {
    target = (await readlink(registration)).replaceAll("\\", "/");
    assert.equal(await realpath(registration), await realpath(canonical));
  } catch (caught) {
    if (caught.code !== "EINVAL") throw caught;
    target = (await readFile(registration, "utf8")).trim().replaceAll("\\", "/");
    const indexed = spawnSync(
      "git",
      ["-C", repositoryRoot, "ls-files", "-s", ".github/skills/repoledger"],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(indexed.status, 0, indexed.stderr);
    assert.match(indexed.stdout, /^120000 /);
  }

  assert.equal(target, "../../skills/repoledger");
});

test("documents explicit vNext adoption and conversion", async () => {
  const readme = await readFile(resolve(repositoryRoot, "README.md"), "utf8");
  const adoption = await readFile(
    resolve(repositoryRoot, "skills", "repoledger", "references", "adoption.md"),
    "utf8",
  );
  const normalized = adoption.replaceAll("\r\n", " ").replaceAll("\n", " ");
  assert.match(adoption, /version: 3/);
  for (const source of [readme, adoption]) {
    assert.match(source, /opaque Git tree/);
    assert.match(source, /Implementation acceptance criteria/);
    assert.match(source, /Deployment acceptance criteria/);
    assert.match(source, /check --worktree/);
    assert.match(source, /create-idea/);
    assert.match(source, /whats-next/);
    assert.doesNotMatch(source, /repoledger whatsnext/);
  }
  assert.match(normalized, /no runtime compatibility mode or in-place migration command/);
});

test("uses only approved command spellings in non-historical Markdown", async () => {
  const files = await findMarkdownFiles(repositoryRoot);
  for (const path of files) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /repoledger whatsnext|repoledger newidea|repoledger new-idea/,
      path,
    );
  }
});