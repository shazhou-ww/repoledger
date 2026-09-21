import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { serializeStatusFile } from "../src/ledger.js";
import { listTasks, statusRepository } from "../src/status.js";

const temporaryDirectories = [];

const tasks = {
  "alpha-task": {
    state: "ongoing",
    sourceBranch: "task/alpha-task",
    createdAt: "2026-09-17T08:00:00Z",
    updatedAt: "2026-09-19T10:00:00Z",
  },
  "beta-task": {
    state: "backlog",
    createdAt: "2026-09-19T09:00:00Z",
    updatedAt: "2026-09-19T09:00:00Z",
  },
  "done-task": {
    state: "completed",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-18T18:00:00Z",
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "repoledger-status-"));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, "repoledger.yaml"),
    "version: 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  await mkdir(join(root, "tasks"));
  await writeFile(
    join(root, "tasks", "status.yaml"),
    serializeStatusFile({ version: 2, tasks }),
  );
  for (const name of Object.keys(tasks)) {
    await mkdir(join(root, "tasks", name));
    await writeFile(
      join(root, "tasks", name, "Task.md"),
      name === "alpha-task"
        ? "# Alpha task\n\nCreated: 2026-09-17\nLanguage: zh-CN\n\n## Goal\n"
        : `# ${name}\n\nCreated: 2026-09-17\n\n## Goal\n`,
    );
  }
  return root;
}

test("returns one local task status", async () => {
  const root = await createRepository();

  const report = await statusRepository({ local: true, root, taskName: "alpha-task" });

  assert.equal(report.ok, true);
  assert.equal(report.command, "status");
  assert.deepEqual(report.result, {
    source: "local",
    task: "alpha-task",
    ...tasks["alpha-task"],
    language: "zh-CN",
    sourceRepository: "https://example.com/owner/repository.git",
  });
});

test("reports en for a legacy task without Language metadata", async () => {
  const root = await createRepository();

  const report = await statusRepository({ local: true, root, taskName: "beta-task" });

  assert.equal(report.ok, true);
  assert.equal(report.result.language, "en");
});

test("returns and filters an unregistered task without fabricated timestamps", async () => {
  const root = await createRepository();
  await mkdir(join(root, "tasks", "unregistered-task"));

  const status = await statusRepository({
    local: true,
    root,
    taskName: "unregistered-task",
  });
  const list = await listTasks({
    filters: { states: ["unregistered"] },
    local: true,
    root,
    sort: "updated",
  });

  assert.equal(status.ok, true);
  assert.deepEqual(status.diagnostics, []);
  assert.deepEqual(status.result, {
    source: "local",
    task: "unregistered-task",
    state: "unregistered",
  });
  assert.deepEqual(list.result.tasks, [{
    task: "unregistered-task",
    state: "unregistered",
  }]);
});

test("places unregistered tasks after timestamped tasks and excludes them from time filters", async () => {
  const root = await createRepository();
  await mkdir(join(root, "tasks", "unregistered-task"));

  const sorted = await listTasks({ local: true, root, sort: "updated" });
  const filtered = await listTasks({
    filters: { updatedSince: "2026-09-01T00:00:00Z" },
    local: true,
    root,
  });

  assert.deepEqual(sorted.result.tasks.map(({ task }) => task), [
    "alpha-task",
    "beta-task",
    "done-task",
    "unregistered-task",
  ]);
  assert.ok(!filtered.result.tasks.some(({ task }) => task === "unregistered-task"));
});

test("filters list state and half-open update interval before sorting and limiting", async () => {
  const root = await createRepository();

  const report = await listTasks({
    filters: {
      states: ["backlog", "ongoing"],
      updatedSince: "2026-09-19T00:00:00Z",
      updatedBefore: "2026-09-20T00:00:00Z",
    },
    limit: 1,
    local: true,
    root,
    sort: "updated",
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.result.filters, {
    states: ["backlog", "ongoing"],
    updatedSince: "2026-09-19T00:00:00Z",
    updatedBefore: "2026-09-20T00:00:00Z",
  });
  assert.deepEqual(report.result.tasks, [
    {
      task: "alpha-task",
      ...tasks["alpha-task"],
      sourceRepository: "https://example.com/owner/repository.git",
    },
  ]);
});

test("applies exclusive before bounds", async () => {
  const root = await createRepository();

  const report = await listTasks({
    filters: { updatedBefore: "2026-09-19T09:00:00Z" },
    local: true,
    root,
  });

  assert.deepEqual(report.result.tasks.map(({ task }) => task), ["done-task"]);
});

test("rejects invalid and reversed filter intervals", async () => {
  const root = await createRepository();

  const report = await listTasks({
    filters: {
      createdSince: "2026-09-20T00:00:00Z",
      createdBefore: "2026-09-19T00:00:00Z",
    },
    local: true,
    root,
  });

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, "task.list.invalid-created-range");
});
