import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import { checkRepository } from "../src/index.js";
import { serializeIdeaStatus } from "../src/ideas.js";

const temporaryDirectories = [];
const id = "01M36QGPNTXEPP61DA4KP4AVZF";

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
  const base = await mkdtemp(join(tmpdir(), "repoledger-check-v3-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "remote.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "repoledger test");
  git(root, "config", "user.email", "repoledger@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const repository = pathToFileURL(remote).href;
  await writeFile(join(root, "repoledger.yaml"), `version: 3
primaryRepository: https://example.test/owner/repository.git
primaryBranch: main
`);
  const folder = join(root, "ideas", id);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "Idea.md"), "# Fixture\n");
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({ version: 1, id, alias: "fixture" }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Create vNext fixture");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "push", repository, "main");
  git(root, "config", `url.${repository}.insteadOf`, "https://example.test/owner/repository.git");
  return root;
}

test("checks the committed HEAD idea snapshot", async () => {
  const root = await createRepository();
  const report = await checkRepository({ root });

  assert.equal(report.ok, true);
  assert.equal(report.result.target, "head");
  assert.equal(report.result.checked, 1);
  assert.deepEqual(report.result.ideas[0], {
    id,
    alias: "fixture",
    revision: git(root, "rev-parse", `HEAD:ideas/${id}`),
    state: "preparing",
  });
});

test("checks isolated staged and commit snapshots", async () => {
  const root = await createRepository();
  await writeFile(join(root, "ideas", id, "Design.md"), "staged\n");
  git(root, "add", ".");
  const staged = await checkRepository({ root, staged: true });
  const committed = await checkRepository({ root, commit: "HEAD" });

  assert.equal(staged.ok, true);
  assert.equal(staged.result.target, "staged");
  assert.notEqual(staged.result.ideas[0].revision, committed.result.ideas[0].revision);
  assert.equal(committed.result.commit, git(root, "rev-parse", "HEAD"));
});

test("fetches and validates the authoritative primary snapshot", async () => {
  const root = await createRepository();
  const report = await checkRepository({ root, remote: true });

  assert.equal(report.ok, true);
  assert.equal(report.result.target, "remote");
  assert.equal(report.result.commit, git(root, "rev-parse", "HEAD"));
  assert.equal(resolve(report.root), resolve(root));
});

test("rejects conflicting check targets", async () => {
  const root = await createRepository();
  const report = await checkRepository({ root, remote: true, staged: true });

  assert.equal(report.ok, false);
  assert.equal(report.result, null);
  assert.equal(report.diagnostics[0].code, "check.target.conflict");
});

test("rejects a changed acceptance field in staged and worktree candidates", async () => {
  const root = await createRepository();
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({
      version: 1,
      id,
      alias: "fixture",
      approvedRevision: "0".repeat(40),
    }),
  );
  git(root, "add", ".");

  const staged = await checkRepository({ root, staged: true });
  const worktree = await checkRepository({ root, worktree: true });

  for (const report of [staged, worktree]) {
    assert.equal(report.ok, false);
    assert.ok(report.diagnostics.some(({ code }) => code === "idea.revision.candidate-mismatch"));
  }
});

test("rejects a mismatched acceptance introduced in the root commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "repoledger-check-v3-root-"));
  temporaryDirectories.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "repoledger test");
  git(root, "config", "user.email", "repoledger@example.invalid");
  await writeFile(join(root, "repoledger.yaml"), `version: 3
primaryRepository: https://example.test/owner/repository.git
primaryBranch: main
`);
  const folder = join(root, "ideas", id);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "Idea.md"), "# Fixture\n");
  const unrelatedTree = git(root, "mktree");
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({
      version: 1,
      id,
      alias: "fixture",
      approvedRevision: unrelatedTree,
    }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Create invalid root idea");

  const report = await checkRepository({ root, commit: "HEAD" });

  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.some(({ code }) => code === "idea.revision.candidate-mismatch"));
});

test("keeps default check on HEAD and includes untracked files only with worktree", async () => {
  const root = await createRepository();
  const before = git(root, "rev-parse", `HEAD:ideas/${id}`);
  await writeFile(join(root, "ideas", id, "Design.md"), "untracked\n");

  const head = await checkRepository({ root });
  const worktree = await checkRepository({ root, worktree: true });

  assert.equal(head.ok, true);
  assert.equal(head.result.target, "head");
  assert.equal(head.result.ideas[0].revision, before);
  assert.equal(worktree.ok, true);
  assert.equal(worktree.result.target, "worktree");
  assert.notEqual(worktree.result.ideas[0].revision, before);
});

test("reads configuration from the selected snapshot target", async () => {
  const root = await createRepository();
  await writeFile(join(root, "repoledger.yaml"), "version: 2\n");

  const head = await checkRepository({ root });
  const remote = await checkRepository({ root, remote: true });
  const worktree = await checkRepository({ root, worktree: true });
  git(root, "add", "repoledger.yaml");
  const staged = await checkRepository({ root, staged: true });

  assert.equal(head.ok, true);
  assert.equal(remote.ok, true);
  assert.equal(worktree.ok, false);
  assert.equal(worktree.diagnostics[0].code, "config.migration-required");
  assert.equal(staged.ok, false);
  assert.equal(staged.diagnostics[0].code, "config.migration-required");
});