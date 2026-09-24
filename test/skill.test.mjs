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

test("exposes one consolidated silvermoon skill", async () => {
  const skillFiles = await findSkillFiles(repositoryRoot);
  const silvermoonSkills = [];
  for (const path of skillFiles) {
    const source = await readFile(path, "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
    if (!frontmatter) continue;
    const document = parseDocument(frontmatter[1]);
    if (document.get("name") === "silvermoon") {
      silvermoonSkills.push({ document, path, source });
    }
  }
  assert.equal(silvermoonSkills.length, 1);

  const [{ document, path, source }] = silvermoonSkills;
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  assert.ok(frontmatter, "silvermoon skill is missing YAML frontmatter");

  assert.deepEqual(document.errors, []);
  assert.deepEqual(document.toJS(), {
    name: "silvermoon",
    description:
      "Navigate or create repository-owned ideas, execute one safe action, and reobserve only after an observable delta.",
    "argument-hint": "[new | idea ULID or alias]",
    "user-invocable": true,
  });

  for (const required of [
    "/silvermoon new",
    "retry `create-idea`, not selector-less `whats-next`",
    "silvermoon whats-next [idea] --json",
    "silvermoon create-idea --json",
    "keep the Implementation, Deployment,",
    "matching ledger placeholders synchronized until their lifecycle actions",
    "An Agent may add a concise, unique alias",
    "do not interrupt the user only to ask them to name it",
    "Execute only the highest-priority action",
    "Preserve unknown, unrelated, or user-authored changes",
    "Never use force-push",
    "Silvermoon has no approval, acceptance, or abandonment mutation commands",
    "Ideal World (道心)",
    "Inner World (内景)",
    "Outer World (现世)",
    "supporting files",
    ".silvermoon/ideas/<ULID>/",
    "## Steps",
    "## Acceptance criteria",
    "I-Sxx",
    "I-ACxx",
    "D-Sxx",
    "D-ACxx",
    "Continue From The Ledger",
    "ledger.md",
    "reset its checkbox",
    "do not maintain duplicate Current or Next summaries",
    "It never",
    "implementationRevision",
    "silvermoon check --worktree --json",
    "silvermoon check --staged --json",
    "observedPrimaryCommit",
    "Never infer a human decision",
    "Never poll the same observation",
  ]) {
    assert.ok(source.includes(required), `silvermoon skill is missing: ${required}`);
  }
  assert.doesNotMatch(
    source,
    /silvermoon task |silvermoon status|silvermoon whatsnext|taskLanguage|criteriaEvidence|verifyCriteriaEvidence|implementationCriterionIds|ledger\.md \(optional\)|revision frontmatter/,
  );

  for (const [, target] of source.matchAll(/\[[^\]]+\]\((\.\/[^)#]+)(?:#[^)]+)?\)/g)) {
    const referenced = resolve(dirname(path), target);
    await assert.doesNotReject(() => readFile(referenced));
  }
});

test("registers the canonical silvermoon skill for this project", async () => {
  const canonical = resolve(repositoryRoot, "skills", "silvermoon");
  const registration = resolve(repositoryRoot, ".github", "skills", "silvermoon");
  let target;
  try {
    target = (await readlink(registration)).replaceAll("\\", "/");
    assert.equal(await realpath(registration), await realpath(canonical));
  } catch (caught) {
    if (caught.code !== "EINVAL") throw caught;
    target = (await readFile(registration, "utf8")).trim().replaceAll("\\", "/");
    const indexed = spawnSync(
      "git",
      ["-C", repositoryRoot, "ls-files", "-s", ".github/skills/silvermoon"],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(indexed.status, 0, indexed.stderr);
    assert.match(indexed.stdout, /^120000 /);
  }

  assert.equal(target, "../../skills/silvermoon");
});

test("documents explicit Silvermoon adoption and conversion", async () => {
  const readme = await readFile(resolve(repositoryRoot, "README.md"), "utf8");
  const adoption = await readFile(
    resolve(repositoryRoot, "skills", "silvermoon", "references", "adoption.md"),
    "utf8",
  );
  const normalized = adoption.replaceAll("\r\n", " ").replaceAll("\n", " ");
  assert.match(adoption, /version: 1/);
  for (const source of [readme, adoption]) {
    assert.match(source, /opaque Git tree/);
    assert.match(source, /\.silvermoon\/config\.yaml/);
    assert.match(source, /Ideal World \(道心\)/);
    assert.match(source, /Inner World \(内景\)/);
    assert.match(source, /Outer World \(现世\)/);
    assert.match(source, /## Steps/);
    assert.match(source, /## Acceptance criteria/);
    assert.match(source, /I-Sxx/);
    assert.match(source, /D-ACxx/);
    assert.match(source, /ledger\.md/);
    assert.match(source, /check --worktree/);
    assert.match(source, /create-idea/);
    assert.match(source, /whats-next/);
    assert.doesNotMatch(source, /silvermoon whatsnext/);
  }
  assert.match(normalized, /no runtime compatibility mode or in-place migration command/);
});

test("uses only approved command spellings in non-historical Markdown", async () => {
  const files = await findMarkdownFiles(repositoryRoot);
  for (const path of files) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /silvermoon whatsnext|silvermoon newidea|silvermoon new-idea/,
      path,
    );
  }
});