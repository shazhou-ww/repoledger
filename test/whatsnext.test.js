import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import { serializeIdeaStatus } from "../src/ideas.js";
import { observeGitCommands } from "../src/git.js";
import { stateAction, whatsNext } from "../src/whatsnext.js";

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
  const base = await mkdtemp(join(tmpdir(), "silvermoon-whatsnext-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "remote.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "silvermoon test");
  git(root, "config", "user.email", "silvermoon@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const repository = pathToFileURL(remote).href;
  await writeFile(join(root, "silvermoon.yaml"), `version: 1
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
  git(root, "commit", "-m", "Create fixture idea");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "push", repository, "main");
  git(root, "config", `url.${repository}.insteadOf`, "https://example.test/owner/repository.git");
  return { remote, repository, root };
}

test("[selector-none] selects a single active idea before state guidance", async () => {
  const { root } = await createRepository();
  const report = await whatsNext({ root });

  assert.equal(report.ok, true);
  assert.deepEqual(report.result.request, { kind: "navigate" });
  assert.equal(report.result.selectedIdea.id, id);
  assert.equal(report.result.action.code, "continue-active-idea");
});

test("observes primary without Git worktree commands", async () => {
  const { root } = await createRepository();
  const commands = [];

  const report = await observeGitCommands(
    (args) => commands.push(args),
    () => whatsNext({ idea: id, root }),
  );

  assert.equal(report.ok, true);
  assert.equal(commands.some(([command]) => command === "worktree"), false);
});

test("reports invalid primary layout without Git worktree commands", async () => {
  const { repository, root } = await createRepository();
  await rm(join(root, "ideas"), { recursive: true });
  git(root, "add", "--all");
  git(root, "commit", "-m", "Remove idea layout");
  git(root, "push", repository, "main");
  const commands = [];

  const report = await observeGitCommands(
    (args) => commands.push(args),
    () => whatsNext({ root }),
  );

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, "layout.ideas.missing");
  assert.equal(commands.some(([command]) => command === "worktree"), false);
});

test("[dirty] prioritizes dirty worktree hygiene over idea state guidance", async () => {
  const { root } = await createRepository();
  await writeFile(join(root, "local.txt"), "preserve me\n");
  const report = await whatsNext({ idea: "fixture", root });

  assert.equal(report.ok, true);
  assert.deepEqual(report.result.request, { kind: "select-idea", selector: "fixture" });
  assert.equal(report.result.selectedIdea, null);
  assert.equal(report.result.action.code, "inspect-worktree-changes");
  assert.deepEqual(report.result.action.details, {
    staged: [],
    unstaged: [],
    untracked: [{ path: "local.txt" }],
    conflicted: [],
  });
});

test("[structured-changes] reports staged, unstaged, and untracked changes as stable arrays", async () => {
  const { repository, root } = await createRepository();
  await writeFile(join(root, "old.txt"), "rename me\n");
  await writeFile(join(root, "modified.txt"), "original\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Add change fixtures");
  git(root, "push", repository, "main");
  git(root, "mv", "old.txt", "renamed.txt");
  await writeFile(join(root, "modified.txt"), "modified\n");
  await writeFile(join(root, "new.txt"), "untracked\n");

  const report = await whatsNext({ idea: id, root });

  assert.equal(report.result.action.code, "inspect-worktree-changes");
  assert.deepEqual(report.result.action.details, {
    staged: [{ path: "renamed.txt", kind: "renamed", originalPath: "old.txt" }],
    unstaged: [{ path: "modified.txt", kind: "modified" }],
    untracked: [{ path: "new.txt" }],
    conflicted: [],
  });
});

test("[conflict] reports merge conflicts with structured conflict details", async () => {
  const { repository, root } = await createRepository();
  await writeFile(join(root, "conflict.txt"), "base\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Add conflict fixture");
  git(root, "push", repository, "main");
  git(root, "checkout", "-b", "other");
  await writeFile(join(root, "conflict.txt"), "other\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Change other side");
  git(root, "checkout", "main");
  await writeFile(join(root, "conflict.txt"), "main\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Change main side");
  const merged = spawnSync("git", ["-C", root, "merge", "other"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.notEqual(merged.status, 0);

  const report = await whatsNext({ idea: id, root });

  assert.equal(report.result.action.code, "resolve-conflicts");
  assert.deepEqual(report.result.action.details, {
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [{ path: "conflict.txt", kind: "both-modified" }],
  });
});

test("[selector-known] renders preparing guidance for a clean synchronized primary", async () => {
  const { root } = await createRepository();
  const report = await whatsNext({ idea: id, root });

  assert.equal(report.ok, true);
  assert.equal(report.result.selectedIdea.state, "preparing");
  assert.equal(report.result.action.code, "prepare-idea");
  assert.equal(report.result.action.details.revision, report.result.selectedIdea.revision);
});

test("[alias-absent] selects an alias-less idea by ULID without inventing display text", async () => {
  const { repository, root } = await createRepository();
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({ version: 1, id }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Remove fixture alias");
  git(root, "push", repository, "main");

  const report = await whatsNext({ idea: id, root });

  assert.equal(report.ok, true);
  assert.equal(Object.hasOwn(report.result.selectedIdea, "alias"), false);
  assert.equal(report.result.action.code, "prepare-idea");
  assert.match(report.result.action.message, new RegExp(id));
  assert.doesNotMatch(report.result.action.message, /undefined/);

  const missing = await whatsNext({ idea: "missing-alias", root });
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0].code, "idea.not-found");
});

test("[selector-unknown] reports an unknown explicit idea without guessing", async () => {
  const { root } = await createRepository();
  const report = await whatsNext({ idea: "unknown", root });

  assert.equal(report.ok, false);
  assert.deepEqual(report.result.request, { kind: "select-idea", selector: "unknown" });
  assert.equal(report.result.selectedIdea, null);
  assert.equal(report.result.action, null);
  assert.equal(report.diagnostics[0].code, "idea.not-found");
});

test("preserves an unknown selector behind dirty and branch hygiene", async () => {
  {
    const { root } = await createRepository();
    await writeFile(join(root, "dirty.txt"), "dirty\n");
    const report = await whatsNext({ idea: "unknown", root });
    assert.deepEqual(report.result.request, { kind: "select-idea", selector: "unknown" });
    assert.equal(report.result.selectedIdea, null);
    assert.equal(report.result.action.code, "inspect-worktree-changes");
    assert.deepEqual(report.diagnostics, []);
  }
  {
    const { root } = await createRepository();
    git(root, "checkout", "-b", "feature");
    const report = await whatsNext({ idea: "unknown", root });
    assert.deepEqual(report.result.request, { kind: "select-idea", selector: "unknown" });
    assert.equal(report.result.selectedIdea, null);
    assert.equal(report.result.action.code, "switch-to-primary");
    assert.deepEqual(report.diagnostics, []);
  }
});

test("explicit create intent bypasses active-idea selection after hygiene", async () => {
  const { root } = await createRepository();

  const report = await whatsNext({ create: true, root });

  assert.equal(report.ok, true);
  assert.deepEqual(report.result.request, { kind: "create-idea" });
  assert.equal(report.result.selectedIdea, null);
  assert.equal(report.result.action.code, "create-idea");
});

test("maps every derived state to one deterministic action", () => {
  const idea = {
    id,
    alias: "fixture",
    revision: "a".repeat(40),
    relativePath: `ideas/${id}`,
    statusPath: `ideas/${id}.status.yaml`,
  };
  const expected = new Map([
    ["preparing", "prepare-idea"],
    ["implementing", "implement-idea"],
    ["deploying", "deploy-idea"],
    ["completed", "review-completed"],
    ["abandoned", "review-abandoned"],
  ]);
  for (const [state, code] of expected) {
    assert.equal(stateAction({ ...idea, state }).code, code);
  }
});

test("lists multiple active ideas and creates when none remain active", async () => {
  const { repository, root } = await createRepository();
  const second = "01M36QGPNTXEPP61DA4KP4AVG0";
  await mkdir(join(root, "ideas", second));
  await writeFile(join(root, "ideas", second, "Idea.md"), "# Second\n");
  await writeFile(
    join(root, "ideas", `${second}.status.yaml`),
    serializeIdeaStatus({ version: 1, id: second, alias: "second" }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Add second idea");
  git(root, "push", repository, "main");

  const multiple = await whatsNext({ root });
  assert.equal(multiple.result.action.code, "select-active-idea");
  assert.deepEqual(
    multiple.result.action.details.ideas.map(({ id: ideaId }) => ideaId),
    [id, second].sort(),
  );

  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({ version: 1, id, alias: "fixture", abandoned: true }),
  );
  await writeFile(
    join(root, "ideas", `${second}.status.yaml`),
    serializeIdeaStatus({ version: 1, id: second, alias: "second", abandoned: true }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Abandon fixture ideas");
  git(root, "push", repository, "main");

  const none = await whatsNext({ root });
  assert.equal(none.result.action.code, "create-idea");
});

test("runs worktree hygiene before creating an idea when none are active", async () => {
  const { repository, root } = await createRepository();
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({ version: 1, id, alias: "fixture", abandoned: true }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Abandon fixture idea");
  git(root, "push", repository, "main");
  await writeFile(join(root, "dirty.txt"), "preserve me\n");

  const report = await whatsNext({ root });

  assert.equal(report.ok, true);
  assert.equal(report.result.action.code, "inspect-worktree-changes");
});

test("[branch-mismatch] prioritizes configured primary branch before state guidance", async () => {
  const { root } = await createRepository();
  git(root, "checkout", "-b", "feature");

  const report = await whatsNext({ idea: id, root });

  assert.equal(report.result.action.code, "switch-to-primary");
});

test("[primary-relocation] adopts relocated primary coordinates across two observations", async () => {
  const { repository, root } = await createRepository();
  const base = join(root, "..");
  const secondary = join(base, "secondary.git");
  const secondaryUrl = pathToFileURL(secondary).href;
  const canonicalSecondary = "https://example.test/owner/secondary.git";
  const original = git(root, "rev-parse", "HEAD");

  await writeFile(join(root, "silvermoon.yaml"), `version: 1
primaryRepository: ${canonicalSecondary}
primaryBranch: trunk
`);
  git(root, "add", ".");
  git(root, "commit", "-m", "Relocate primary");
  const relocation = git(root, "rev-parse", "HEAD");
  git(root, "push", repository, "main");

  git(root, "init", "--bare", "--initial-branch=trunk", secondary);
  git(root, "push", secondaryUrl, "HEAD:trunk");
  await writeFile(join(root, "secondary.txt"), "secondary primary\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Advance relocated primary");
  const relocatedTip = git(root, "rev-parse", "HEAD");
  git(root, "push", secondaryUrl, "HEAD:trunk");
  git(root, "reset", "--hard", original);
  git(root, "config", `url.${secondaryUrl}.insteadOf`, canonicalSecondary);

  const first = await whatsNext({ idea: id, root });
  assert.equal(first.result.observedPrimaryCommit, relocation);
  assert.equal(first.result.selectedIdea, null);
  assert.equal(first.result.action.code, "fast-forward-primary");

  git(root, "merge", "--ff-only", relocation);
  const second = await whatsNext({ idea: id, root });
  assert.equal(second.result.observedPrimaryCommit, relocatedTip);
  assert.equal(second.result.action.code, "switch-to-primary");
  assert.equal(second.result.action.details.expected, "refs/heads/trunk");
});

test("[ahead] [behind] [diverged] [publish-coordinates] routes clean primary ancestry", async () => {
  {
    const { root } = await createRepository();
    const expectedRemoteTip = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "ahead.txt"), "ahead\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "Local ahead");
    const commit = git(root, "rev-parse", "HEAD");
    const report = await whatsNext({ idea: id, root });
    assert.equal(report.result.action.code, "publish-primary");
    assert.deepEqual(report.result.action.details, {
      repository: "https://example.test/owner/repository.git",
      branch: "main",
      commit,
      expectedRemoteTip,
      validation: { target: "commit", revision: commit },
    });
  }

  {
    const { repository, root } = await createRepository();
    const initial = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "remote.txt"), "remote\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "Remote ahead");
    git(root, "push", repository, "main");
    git(root, "reset", "--hard", initial);
    const report = await whatsNext({ idea: id, root });
    assert.equal(report.result.action.code, "fast-forward-primary");
  }

  {
    const { repository, root } = await createRepository();
    const initial = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "remote.txt"), "remote\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "Remote side");
    git(root, "push", repository, "main");
    git(root, "reset", "--hard", initial);
    await writeFile(join(root, "local.txt"), "local\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "Local side");
    const report = await whatsNext({ idea: id, root });
    assert.equal(report.result.action.code, "integrate-primary");
  }
});

test("[publish-concurrent-move] rejects a stale ordinary push", async () => {
  const { repository, root } = await createRepository();
  const initial = git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "local.txt"), "local\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Local publication candidate");
  const local = git(root, "rev-parse", "HEAD");
  const report = await whatsNext({ idea: id, root });
  assert.equal(report.result.action.code, "publish-primary");

  git(root, "reset", "--hard", initial);
  await writeFile(join(root, "competing.txt"), "competing\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Competing primary commit");
  const competing = git(root, "rev-parse", "HEAD");
  git(root, "push", repository, "main");
  git(root, "reset", "--hard", local);

  const pushed = spawnSync(
    "git",
    [
      "-C",
      root,
      "push",
      report.result.action.details.repository,
      `${report.result.action.details.commit}:refs/heads/${report.result.action.details.branch}`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  assert.notEqual(pushed.status, 0);
  assert.match(pushed.stderr, /rejected|non-fast-forward/i);
  assert.equal(
    git(root, "ls-remote", repository, "refs/heads/main").split(/\s+/)[0],
    competing,
  );
});