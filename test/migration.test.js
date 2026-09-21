import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareV1Migration } from "../src/migration.js";

const configSource = `version: 1
tasksDirectory: tasks
remote: origin
primaryBranch: main
`;

const statusSource = `version: 1
tasks:
  done-task:
    state: completed
    createdAt: "2026-09-18T08:00:00Z"
    updatedAt: "2026-09-19T08:00:00Z"
  fork-task:
    state: ongoing
    createdAt: "2026-09-19T10:00:00Z"
    updatedAt: "2026-09-19T10:00:00Z"
  primary-task:
    state: ongoing
    createdAt: "2026-09-19T09:00:00Z"
    updatedAt: "2026-09-19T09:00:00Z"
`;

test("prepares canonical v2 documents while preserving lifecycle facts", () => {
  const migrated = prepareV1Migration({
    configSource,
    now: new Date("2026-09-20T12:00:00Z"),
    primaryRepository: "https://example.com/owner/repository.git",
    sourceRefs: {
      "fork-task": {
        sourceRepository: "https://example.com/contributor/repository.git",
        sourceBranch: "work/fork-task",
      },
    },
    statusSource,
  });

  assert.equal(migrated.configSource, `version: 2
tasksDirectory: tasks
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`);
  assert.equal(migrated.status.tasks["done-task"].updatedAt, "2026-09-19T08:00:00Z");
  assert.deepEqual(migrated.status.tasks["primary-task"], {
    state: "ongoing",
    sourceBranch: "task/primary-task",
    createdAt: "2026-09-19T09:00:00Z",
    updatedAt: "2026-09-20T12:00:00Z",
  });
  assert.deepEqual(migrated.status.tasks["fork-task"], {
    state: "ongoing",
    sourceRepository: "https://example.com/contributor/repository.git",
    sourceBranch: "work/fork-task",
    createdAt: "2026-09-19T10:00:00Z",
    updatedAt: "2026-09-20T12:00:00Z",
  });
  assert.equal(migrated.statusSource.startsWith("version: 2\ntasks:\n"), true);
});

test("rejects noncanonical v1 input and invalid source assignments", () => {
  assert.throws(
    () => prepareV1Migration({
      configSource: configSource.replace("remote: origin\n", "remote: origin # local\n"),
      primaryRepository: "https://example.com/owner/repository.git",
      statusSource,
    }),
    /version 1 migration/i,
  );
  assert.throws(
    () => prepareV1Migration({
      configSource,
      primaryRepository: "https://example.com/owner/repository.git",
      sourceRefs: {
        "done-task": { sourceBranch: "task/done-task" },
      },
      statusSource,
    }),
    /non-ongoing/i,
  );
});