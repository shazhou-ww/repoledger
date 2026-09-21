import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { checkRepository } from "../src/index.js";
import { serializeStatusFile } from "../src/ledger.js";

const temporaryDirectories = [];

const config = `version: 2
tasksDirectory: tasks
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`;

const taskDocument = `# Fixture task

Created: 2026-09-20

## Goal

Validate one outcome.

## Context

Fixture context.

## Scope

- Included.

## Out of scope

- Excluded.

## Acceptance criteria

- [ ] Observable result.

## Constraints

- Preserve fixture state.

## Human review checkpoints

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | Fixture owner | Fixture scope. | Implementation. |
| Interface | Not applicable: no interface. | Not applicable | Not applicable | Not applicable |
| Business and data model | Not applicable: no model. | Not applicable | Not applicable | Not applicable |
| Architecture | Not applicable: no architecture. | Not applicable | Not applicable | Not applicable |
| Delivery acceptance | Required | Fixture owner | Published fixture. | Completion. |

## References

- None.
`;

const progressDocument = `# Progress

Updated: 2026-09-21

## Current state

Implementation is in progress.

## Decisions

- Keep the fixture focused.

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Approved | Fixture owner approved Task.md scope on 2026-09-21. |
| Interface | Not applicable | No interface. |
| Business and data model | Not applicable | No model. |
| Architecture | Not applicable | No architecture. |
| Delivery acceptance | Pending | Awaiting delivery. |

## Validation

- Target check pending.

## Blockers

- None.

## Outcome

Implementation remains ongoing.
`;

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function record(state, createdAt = "2026-09-18T08:30:00Z") {
  return { state, createdAt, updatedAt: createdAt };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRepository(tasks = {}) {
  const root = await mkdtemp(join(tmpdir(), "repoledger-check-"));
  temporaryDirectories.push(root);
  await writeFile(join(root, "repoledger.yaml"), config);
  await mkdir(join(root, "tasks"));
  await writeFile(
    join(root, "tasks", "status.yaml"),
    serializeStatusFile({ version: 2, tasks }),
  );
  for (const name of Object.keys(tasks)) {
    await mkdir(join(root, "tasks", name));
  }
  return root;
}

function initializeGit(root) {
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "repoledger test");
  git(root, "config", "user.email", "repoledger@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  git(root, "add", ".");
  git(root, "commit", "-m", "Initialize fixture");
  return git(root, "rev-parse", "HEAD");
}

async function createOngoingGitRepository({ progress = false } = {}) {
  const root = await createRepository({
    "target-task": {
      ...record("ongoing"),
      sourceBranch: "task/target-task",
    },
  });
  const taskPath = join(root, "tasks", "target-task");
  await writeFile(join(taskPath, "Task.md"), taskDocument);
  if (progress) await writeFile(join(taskPath, "Progress.md"), progressDocument);
  await writeFile(join(root, "implementation.txt"), "baseline\n");
  const initial = initializeGit(root);
  return { initial, root, taskPath };
}

test("accepts an empty stable task ledger", async () => {
  const root = await createRepository();

  const report = await checkRepository({ root });

  assert.equal(report.ok, true);
  assert.equal(report.command, "check");
  assert.equal(report.result.checked, 0);
  assert.deepEqual(report.diagnostics, []);
});

test("requires one directory for every record and accepts a valid unregistered directory", async () => {
  const root = await createRepository({ "missing-directory": record("backlog") });
  await rm(join(root, "tasks", "missing-directory"), { recursive: true });
  await mkdir(join(root, "tasks", "missing-record"));
  await writeFile(join(root, "tasks", "missing-record", "Task.md"), taskDocument);

  const report = await checkRepository({ root });
  const codes = report.diagnostics.map(({ code }) => code);

  assert.equal(report.ok, false);
  assert.ok(codes.includes("task.directory.missing"));
  assert.ok(!codes.includes("task.record.missing"));
  assert.equal(report.result.checked, 1);
});

test("checks required artifacts for unregistered directories", async () => {
  const root = await createRepository();
  await mkdir(join(root, "tasks", "unregistered-task"));

  const report = await checkRepository({ root });

  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.some(({ code }) => code === "task.file.missing"));
  assert.ok(!report.diagnostics.some(({ code }) => code === "task.record.missing"));
});

test("accepts a valid unregistered task directory", async () => {
  const root = await createRepository();
  await mkdir(join(root, "tasks", "unregistered-task"));
  await writeFile(join(root, "tasks", "unregistered-task", "Task.md"), taskDocument);

  const report = await checkRepository({ root });

  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.equal(report.result.checked, 1);
  assert.deepEqual(report.diagnostics, []);
});

test("rejects duplicate source refs and primary as a source branch", async () => {
  const root = await createRepository({
    "alpha-task": {
      ...record("ongoing"),
      sourceBranch: "task/shared",
    },
    "beta-task": {
      ...record("ongoing"),
      sourceBranch: "task/shared",
    },
    "primary-task": {
      ...record("ongoing"),
      sourceBranch: "main",
    },
  });

  const report = await checkRepository({ root });
  const codes = report.diagnostics.map(({ code }) => code);

  assert.equal(report.ok, false);
  assert.ok(codes.includes("task.source.duplicate"));
  assert.ok(codes.includes("task.source.primary-branch"));
});

test("focuses content checks while retaining repository structure checks", async () => {
  const root = await createRepository({
    "alpha-task": record("backlog"),
    "beta-task": record("backlog"),
  });

  const report = await checkRepository({ root, taskName: "alpha-task" });

  assert.equal(report.ok, false);
  assert.equal(report.result.checked, 1);
  assert.equal(report.result.total, 2);
  assert.ok(report.diagnostics.some(({ path }) => path.includes("alpha-task")));
  assert.ok(!report.diagnostics.some(({ path }) => path.includes("beta-task")));
});

test("reports a missing focused task", async () => {
  const root = await createRepository();

  const report = await checkRepository({ root, taskName: "missing-task" });

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, "task.selection.missing");
});

test("rejects a symbolic-link task root", async () => {
  const root = await mkdtemp(join(tmpdir(), "repoledger-symlink-root-"));
  temporaryDirectories.push(root);
  const externalTasks = join(root, "external-tasks");
  await writeFile(join(root, "repoledger.yaml"), config);
  await mkdir(externalTasks);
  await writeFile(
    join(externalTasks, "status.yaml"),
    serializeStatusFile({ version: 2, tasks: {} }),
  );
  await symlink(
    externalTasks,
    join(root, "tasks"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const report = await checkRepository({ root });

  assert.equal(report.ok, false);
  assert.ok(
    report.diagnostics.some(({ code }) => code === "config.invalid-tasks-directory"),
  );
});

test("checks one commit snapshot and diff without fetching history", async () => {
  const { initial, root, taskPath } = await createOngoingGitRepository();
  const rootReport = await checkRepository({ commit: initial, root });
  assert.equal(rootReport.ok, true, JSON.stringify(rootReport.diagnostics));
  assert.equal(rootReport.result.source, "commit");

  await writeFile(join(taskPath, "Progress.md"), progressDocument);
  git(root, "add", "tasks/target-task/Progress.md");
  git(root, "commit", "-m", "Add progress only");
  const progressOnly = git(root, "rev-parse", "HEAD");
  const rejected = await checkRepository({ commit: progressOnly, root });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.diagnostics.some(({ code }) => code === "progress.history.bookkeeping-only"));

  await writeFile(join(root, "implementation.txt"), "implemented\n");
  await writeFile(join(taskPath, "Progress.md"), progressDocument.replace("Target check pending.", "Target check passed."));
  git(root, "add", "implementation.txt", "tasks/target-task/Progress.md");
  git(root, "commit", "-m", "Implement with progress");
  const accepted = await checkRepository({ commit: "HEAD", root });
  assert.equal(accepted.ok, true, JSON.stringify(accepted.diagnostics));
  assert.equal(accepted.result.commit, git(root, "rev-parse", "HEAD"));

  const invalid = await checkRepository({ commit: "missing-revision", root });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostics[0].code, "git.commit.invalid");
});

test("checks staged and unstaged targets without mixing change sets", async () => {
  const stagedFixture = await createOngoingGitRepository();
  await writeFile(join(stagedFixture.taskPath, "Progress.md"), progressDocument);
  git(stagedFixture.root, "add", "tasks/target-task/Progress.md");
  await writeFile(join(stagedFixture.root, "implementation.txt"), "unstaged implementation\n");
  const stagedStatus = git(stagedFixture.root, "status", "--short");

  const stagedRejected = await checkRepository({ root: stagedFixture.root, staged: true });
  assert.equal(stagedRejected.ok, false);
  assert.ok(stagedRejected.diagnostics.some(({ code }) => code === "progress.history.bookkeeping-only"));
  assert.equal(git(stagedFixture.root, "status", "--short"), stagedStatus);

  git(stagedFixture.root, "add", "implementation.txt");
  const stagedAccepted = await checkRepository({ root: stagedFixture.root, staged: true });
  assert.equal(stagedAccepted.ok, true, JSON.stringify(stagedAccepted.diagnostics));
  assert.equal(stagedAccepted.result.source, "staged");

  const unstagedFixture = await createOngoingGitRepository({ progress: true });
  await writeFile(join(unstagedFixture.root, "implementation.txt"), "staged implementation\n");
  git(unstagedFixture.root, "add", "implementation.txt");
  await writeFile(join(unstagedFixture.taskPath, "Progress.md"), progressDocument.replace("Target check pending.", "Target check rerun."));
  await writeFile(join(unstagedFixture.root, "untracked.txt"), "ignored implementation\n");
  const unstagedStatus = git(unstagedFixture.root, "status", "--short");

  const unstagedRejected = await checkRepository({ root: unstagedFixture.root, unstaged: true });
  assert.equal(unstagedRejected.ok, false);
  assert.ok(unstagedRejected.diagnostics.some(({ code }) => code === "progress.history.bookkeeping-only"));
  assert.equal(git(unstagedFixture.root, "status", "--short"), unstagedStatus);

  git(unstagedFixture.root, "restore", "--staged", "implementation.txt");
  const unstagedAccepted = await checkRepository({ root: unstagedFixture.root, unstaged: true });
  assert.equal(unstagedAccepted.ok, true, JSON.stringify(unstagedAccepted.diagnostics));
  assert.equal(unstagedAccepted.result.source, "unstaged");
});

test("checks merge commits against their first parent", async () => {
  const { root, taskPath } = await createOngoingGitRepository({ progress: true });
  git(root, "switch", "-c", "progress-branch");
  await writeFile(join(taskPath, "Progress.md"), progressDocument.replace("Target check pending.", "Merge target pending."));
  git(root, "add", "tasks/target-task/Progress.md");
  git(root, "commit", "-m", "Update progress on branch");
  git(root, "switch", "main");
  await writeFile(join(root, "implementation.txt"), "main implementation\n");
  git(root, "add", "implementation.txt");
  git(root, "commit", "-m", "Implement on main");
  git(root, "merge", "--no-ff", "progress-branch", "-m", "Merge progress branch");

  const report = await checkRepository({ commit: "HEAD", root });

  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.some(({ code }) => code === "progress.history.bookkeeping-only"));
});
