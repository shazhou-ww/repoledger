import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { inspectTaskContents } from "../src/content.js";

const temporaryDirectories = [];

const TASK = `# Fixture task

Created: 2026-09-15

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
| Interface | Not applicable: no interface. | Not applicable | Not applicable. | Not applicable. |
| Business and data model | Not applicable: no model. | Not applicable | Not applicable. | Not applicable. |
| Architecture | Not applicable: no architecture. | Not applicable | Not applicable. | Not applicable. |
| Delivery acceptance | Required | Fixture owner | Published fixture. | Completion. |

## References

- [Notes](./notes.md)
`;

const PROGRESS = `# Progress

Updated: 2026-09-15

## Current state

Implemented.

## Decisions

- None.

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Approved | Fixture owner approved scope on 2026-09-15. |
| Interface | Not applicable | No interface. |
| Business and data model | Not applicable | No model. |
| Architecture | Not applicable | No architecture. |
| Delivery acceptance | Approved | Fixture owner approved delivery on 2026-09-15. |

## Validation

- Passed.

## Blockers

- None.

## Outcome

Completed. Fixture accepted.
`;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createTask(state, { progress = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "repoledger-content-"));
  temporaryDirectories.push(root);
  const path = join(root, "tasks", "fixture-task");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "Task.md"), TASK);
  await writeFile(join(path, "notes.md"), "# Notes\n");
  if (progress) await writeFile(join(path, "Progress.md"), PROGRESS);
  return {
    root,
    task: {
      name: "fixture-task",
      path,
      relativePath: "tasks/fixture-task",
      state,
    },
  };
}

test("allows an ongoing task before its first implementation progress", async () => {
  const { root, task } = await createTask("ongoing");
  const result = await inspectTaskContents({ root, tasks: [task] });
  assert.deepEqual(result.diagnostics.filter(({ level }) => level === "error"), []);
  assert.deepEqual(result.taskLanguages, { "fixture-task": "en" });
});

test("accepts one canonical task language before the first section", async () => {
  const { root, task } = await createTask("backlog");
  await writeFile(
    join(task.path, "Task.md"),
    TASK.replace("Created: 2026-09-15", "Created: 2026-09-15\nLanguage: zh-CN"),
  );

  const result = await inspectTaskContents({ root, tasks: [task] });

  assert.deepEqual(result.diagnostics.filter(({ level }) => level === "error"), []);
  assert.deepEqual(result.taskLanguages, { "fixture-task": "zh-CN" });
});

test("rejects noncanonical, duplicate, and misplaced task languages", async () => {
  for (const [source, code] of [
    [TASK.replace("Created: 2026-09-15", "Created: 2026-09-15\nLanguage: zh-cn"), "task.language.invalid"],
    [TASK.replace("Created: 2026-09-15", "Created: 2026-09-15\nLanguage: en\nLanguage: zh-CN"), "task.language.duplicate"],
    [TASK.replace("## Goal", "## Goal\n\nLanguage: en"), "task.language.misplaced"],
  ]) {
    const { root, task } = await createTask("backlog");
    await writeFile(join(task.path, "Task.md"), source);
    const result = await inspectTaskContents({ root, tasks: [task] });
    assert.ok(result.diagnostics.some(({ code: actual }) => actual === code), code);
    assert.deepEqual(result.taskLanguages, { "fixture-task": null });
  }
});

test("allows an unregistered task definition but rejects implementation progress", async () => {
  const withoutProgress = await createTask("unregistered");
  const valid = await inspectTaskContents({
    root: withoutProgress.root,
    tasks: [withoutProgress.task],
  });
  assert.deepEqual(valid.diagnostics.filter(({ level }) => level === "error"), []);

  const withProgress = await createTask("unregistered", { progress: true });
  const invalid = await inspectTaskContents({
    root: withProgress.root,
    tasks: [withProgress.task],
  });
  assert.ok(invalid.diagnostics.some(({ code }) => code === "progress.unexpected"));
});

test("requires completed tasks to include progress", async () => {
  const { root, task } = await createTask("completed");
  const result = await inspectTaskContents({ root, tasks: [task] });
  assert.ok(result.diagnostics.some(({ code }) => code === "progress.missing"));
});

test("requires completed acceptance criteria", async () => {
  const { root, task } = await createTask("completed", { progress: true });
  const result = await inspectTaskContents({ root, tasks: [task] });
  assert.ok(result.diagnostics.some(({ code }) => code === "task.acceptance.incomplete"));
});

test("accepts completed artifacts with approvals and checked criteria", async () => {
  const { root, task } = await createTask("completed", { progress: true });
  await writeFile(join(task.path, "Task.md"), TASK.replace("- [ ]", "- [x]"));
  const result = await inspectTaskContents({ root, tasks: [task] });
  assert.deepEqual(result.diagnostics.filter(({ level }) => level === "error"), []);
});

test("rejects missing task-local link targets", async () => {
  const { root, task } = await createTask("backlog");
  await rm(join(task.path, "notes.md"));
  const result = await inspectTaskContents({ root, tasks: [task] });
  assert.ok(result.diagnostics.some(({ code }) => code === "link.target.missing"));
});

test("rejects symlinked task artifacts", async () => {
  const { root, task } = await createTask("ongoing");
  const outside = join(root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "notes.md"), "# Outside\n");
  await symlink(
    outside,
    join(task.path, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const result = await inspectTaskContents({ root, tasks: [task] });

  assert.ok(result.diagnostics.some(({ code }) => code === "task.artifact.symlink"));
});
