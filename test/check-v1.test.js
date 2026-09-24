import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import { checkRepository } from "../src/index.js";
import { observeGitCommands } from "../src/git.js";
import { serializeIdeaStatus } from "../src/ideas.js";
import { ideaPaths } from "../src/layout.js";

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
  const base = await mkdtemp(join(tmpdir(), "silvermoon-check-v1-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "remote.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "silvermoon test");
  git(root, "config", "user.email", "silvermoon@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const repository = pathToFileURL(remote).href;
  await mkdir(join(root, ".silvermoon"), { recursive: true });
  await writeFile(join(root, ".silvermoon", "config.yaml"), `version: 1
primaryRepository: https://example.test/owner/repository.git
primaryBranch: main
`);
  const paths = ideaPaths(id);
  await mkdir(join(root, ...paths.idealPath.split("/")), { recursive: true });
  await writeFile(join(root, ...paths.ideaDocumentPath.split("/")), "# Fixture\n");
  await writeFile(join(root, ...paths.implementationDocumentPath.split("/")), "");
  await writeFile(join(root, ...paths.deploymentDocumentPath.split("/")), "");
  await writeFile(join(root, ...paths.ledgerPath.split("/")), "# Ledger\n");
  await writeFile(
    join(root, ...paths.statusPath.split("/")),
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
    idealRevision: git(root, "rev-parse", `HEAD:${ideaPaths(id).idealPath}`),
    implementationRevision: git(root, "rev-parse", `HEAD:${ideaPaths(id).innerPath}`),
    deploymentRevision: git(root, "rev-parse", `HEAD:${ideaPaths(id).outerPath}`),
    state: "preparing",
  });
});

test("omits alias from checker summaries when status has none", async () => {
  const root = await createRepository();
  await writeFile(
    join(root, ...ideaPaths(id).statusPath.split("/")),
    serializeIdeaStatus({ version: 1, id }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Remove fixture alias");

  const report = await checkRepository({ root });

  assert.equal(report.ok, true);
  assert.equal(Object.hasOwn(report.result.ideas[0], "alias"), false);
});

test("checks isolated staged and commit snapshots", async () => {
  const root = await createRepository();
  await writeFile(
    join(root, ...ideaPaths(id).idealPath.split("/"), "Design.md"),
    "staged\n",
  );
  git(root, "add", ".");
  const staged = await checkRepository({ root, staged: true });
  const committed = await checkRepository({ root, commit: "HEAD" });

  assert.equal(staged.ok, true);
  assert.equal(staged.result.target, "staged");
  assert.notEqual(
    staged.result.ideas[0].idealRevision,
    committed.result.ideas[0].idealRevision,
  );
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

test("rejects a missing required ledger in candidate snapshots", async () => {
  const root = await createRepository();
  const ledger = join(root, ...ideaPaths(id).ledgerPath.split("/"));
  await rm(ledger);

  const head = await checkRepository({ root });
  const worktree = await checkRepository({ root, worktree: true });
  git(root, "add", "--all");
  const staged = await checkRepository({ root, staged: true });

  assert.equal(head.ok, true);
  for (const report of [worktree, staged]) {
    assert.equal(report.ok, false);
    assert.ok(
      report.diagnostics.some(({ code }) => code === "idea.ledger.missing-file"),
    );
  }
});

test("rejects a changed acceptance field in staged and worktree candidates", async () => {
  const root = await createRepository();
  await writeFile(
    join(root, ...ideaPaths(id).statusPath.split("/")),
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
  const root = await mkdtemp(join(tmpdir(), "silvermoon-check-v1-root-"));
  temporaryDirectories.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "silvermoon test");
  git(root, "config", "user.email", "silvermoon@example.invalid");
  await mkdir(join(root, ".silvermoon"), { recursive: true });
  await writeFile(join(root, ".silvermoon", "config.yaml"), `version: 1
primaryRepository: https://example.test/owner/repository.git
primaryBranch: main
`);
  const paths = ideaPaths(id);
  await mkdir(join(root, ...paths.idealPath.split("/")), { recursive: true });
  await writeFile(join(root, ...paths.ideaDocumentPath.split("/")), "# Fixture\n");
  await writeFile(join(root, ...paths.implementationDocumentPath.split("/")), "");
  await writeFile(join(root, ...paths.deploymentDocumentPath.split("/")), "");
  await writeFile(join(root, ...paths.ledgerPath.split("/")), "# Ledger\n");
  const unrelatedTree = git(root, "mktree");
  await writeFile(
    join(root, ...paths.statusPath.split("/")),
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
  const before = git(root, "rev-parse", `HEAD:${ideaPaths(id).idealPath}`);
  await writeFile(
    join(root, ...ideaPaths(id).idealPath.split("/"), "Design.md"),
    "untracked\n",
  );

  const head = await checkRepository({ root });
  const worktree = await checkRepository({ root, worktree: true });

  assert.equal(head.ok, true);
  assert.equal(head.result.target, "head");
  assert.equal(head.result.ideas[0].idealRevision, before);
  assert.equal(worktree.ok, true);
  assert.equal(worktree.result.target, "worktree");
  assert.notEqual(worktree.result.ideas[0].idealRevision, before);
});

test("reads configuration from the selected snapshot target", async () => {
  const root = await createRepository();
  await writeFile(
    join(root, ".silvermoon", "config.yaml"),
    "version: 2\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );

  const head = await checkRepository({ root });
  const remote = await checkRepository({ root, remote: true });
  const worktree = await checkRepository({ root, worktree: true });
  git(root, "add", ".silvermoon/config.yaml");
  const staged = await checkRepository({ root, staged: true });

  assert.equal(head.ok, true);
  assert.equal(remote.ok, true);
  assert.equal(worktree.ok, false);
  assert.equal(worktree.diagnostics[0].code, "config.unsupported-version");
  assert.equal(staged.ok, false);
  assert.equal(staged.diagnostics[0].code, "config.unsupported-version");
});

test("immutable check targets do not invoke Git worktree commands", async () => {
  const root = await createRepository();
  const commands = [];

  const reports = await observeGitCommands(
    (args) => commands.push(args),
    () => Promise.all([
      checkRepository({ root }),
      checkRepository({ commit: "HEAD", root }),
      checkRepository({ remote: true, root }),
    ]),
  );

  assert.ok(reports.every(({ ok }) => ok));
  assert.equal(commands.some(([command]) => command === "worktree"), false);
});

test("immutable check failures do not invoke Git worktree commands", async () => {
  {
    const root = await createRepository();
    await writeFile(
      join(root, ".silvermoon", "config.yaml"),
      "version: 2\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
    );
    git(root, "add", ".");
    git(root, "commit", "-m", "Invalid config candidate");
    const commands = [];
    const report = await observeGitCommands(
      (args) => commands.push(args),
      () => checkRepository({ root }),
    );
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics[0].code, "config.unsupported-version");
    assert.equal(commands.some(([command]) => command === "worktree"), false);
  }
  {
    const root = await createRepository();
    await writeFile(
      join(root, ...ideaPaths(id).statusPath.split("/")),
      serializeIdeaStatus({
        version: 1,
        id,
        alias: "fixture",
        approvedRevision: "0".repeat(40),
      }),
    );
    git(root, "add", ".");
    git(root, "commit", "-m", "Invalid acceptance candidate");
    const commands = [];
    const report = await observeGitCommands(
      (args) => commands.push(args),
      () => checkRepository({ commit: "HEAD", root }),
    );
    assert.equal(report.ok, false);
    assert.ok(report.diagnostics.some(({ code }) => code === "idea.revision.candidate-mismatch"));
    assert.equal(commands.some(([command]) => command === "worktree"), false);
  }
});