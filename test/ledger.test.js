import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nextTimestamp,
  parseStatusFile,
  serializeStatusFile,
  transitionRecord,
} from "../src/ledger.js";

const status = {
  version: 2,
  tasks: {
    "alpha-task": {
      state: "ongoing",
      sourceBranch: "task/alpha-task",
      createdAt: "2026-09-18T08:30:00Z",
      updatedAt: "2026-09-19T10:15:42Z",
    },
    "zeta-task": {
      state: "backlog",
      createdAt: "2026-09-19T12:00:00Z",
      updatedAt: "2026-09-19T12:00:00Z",
    },
  },
};

test("parses and serializes canonical status YAML", () => {
  const source = `version: 2
tasks:
  alpha-task:
    state: ongoing
    sourceBranch: task/alpha-task
    createdAt: "2026-09-18T08:30:00Z"
    updatedAt: "2026-09-19T10:15:42Z"
  zeta-task:
    state: backlog
    createdAt: "2026-09-19T12:00:00Z"
    updatedAt: "2026-09-19T12:00:00Z"
`;

  assert.deepEqual(parseStatusFile(source), status);
  assert.equal(serializeStatusFile(status), source);
});

test("supports an empty canonical task map", () => {
  const source = "version: 2\ntasks: {}\n";
  assert.deepEqual(parseStatusFile(source), { version: 2, tasks: {} });
  assert.equal(serializeStatusFile({ version: 2, tasks: {} }), source);
});

test("rejects unknown fields and noncanonical order", () => {
  const fixtures = [
    `version: 2\ntasks:\n  alpha-task:\n    state: ongoing\n    branch: task/alpha-task\n    sourceBranch: task/alpha-task\n    createdAt: "2026-09-18T08:30:00Z"\n    updatedAt: "2026-09-19T10:15:42Z"\n`,
    `version: 2\ntasks:\n  zeta-task:\n    state: backlog\n    createdAt: "2026-09-19T12:00:00Z"\n    updatedAt: "2026-09-19T12:00:00Z"\n  alpha-task:\n    state: ongoing\n    sourceBranch: task/alpha-task\n    createdAt: "2026-09-18T08:30:00Z"\n    updatedAt: "2026-09-19T10:15:42Z"\n`,
  ];

  for (const source of fixtures) {
    assert.throws(() => parseStatusFile(source), /status/i);
  }
});

test("enforces the ongoing source ref union and canonical source field order", () => {
  const forked = structuredClone(status);
  forked.tasks["alpha-task"].sourceRepository = "https://example.com/fork/repository.git";
  const options = { primaryRepository: "https://example.com/owner/repository.git" };
  const source = serializeStatusFile(forked, options);
  assert.match(
    source,
    /state: ongoing\n    sourceRepository: https:\/\/example\.com\/fork\/repository\.git\n    sourceBranch: task\/alpha-task/,
  );
  assert.deepEqual(parseStatusFile(source, options), forked);

  assert.throws(() => serializeStatusFile(forked), /primaryRepository/i);
  const redundant = structuredClone(status);
  redundant.tasks["alpha-task"].sourceRepository = options.primaryRepository;
  assert.throws(
    () => serializeStatusFile(redundant, options),
    /must be omitted/i,
  );

  const missingBranch = structuredClone(status);
  delete missingBranch.tasks["alpha-task"].sourceBranch;
  assert.throws(() => serializeStatusFile(missingBranch), /sourceBranch/i);

  const terminalSource = structuredClone(status);
  terminalSource.tasks["alpha-task"].state = "completed";
  assert.throws(() => serializeStatusFile(terminalSource), /ongoing/i);
});

test("requires migration for version 1 status", () => {
  assert.throws(
    () => parseStatusFile("version: 1\ntasks: {}\n"),
    /migration/i,
  );
});

test("rejects invalid states, names, and timestamps", () => {
  const invalid = structuredClone(status);
  invalid.tasks["alpha-task"].state = "archived";
  assert.throws(() => serializeStatusFile(invalid), /state/i);

  const invalidName = structuredClone(status);
  invalidName.tasks["Alpha Task"] = invalidName.tasks["alpha-task"];
  delete invalidName.tasks["alpha-task"];
  assert.throws(() => serializeStatusFile(invalidName), /name/i);

  const invalidTime = structuredClone(status);
  invalidTime.tasks["alpha-task"].updatedAt = "2026-09-17T00:00:00Z";
  assert.throws(() => serializeStatusFile(invalidTime), /timestamp/i);
});

test("maintains monotonic timestamps and legal transitions", () => {
  assert.equal(
    nextTimestamp("2026-09-19T10:15:42Z", new Date("2026-09-19T10:15:41Z")),
    "2026-09-19T10:15:43Z",
  );
  assert.deepEqual(
    transitionRecord(
      status.tasks["zeta-task"],
      "ongoing",
      new Date("2026-09-19T12:00:00Z"),
      { sourceBranch: "task/zeta-task" },
    ),
    {
      state: "ongoing",
      createdAt: "2026-09-19T12:00:00Z",
      updatedAt: "2026-09-19T12:00:01Z",
      sourceBranch: "task/zeta-task",
    },
  );
  assert.deepEqual(
    transitionRecord(status.tasks["alpha-task"], "completed", new Date("2026-09-19T12:00:00Z")),
    {
      state: "completed",
      createdAt: "2026-09-18T08:30:00Z",
      updatedAt: "2026-09-19T12:00:00Z",
    },
  );
  assert.throws(
    () => transitionRecord(status.tasks["zeta-task"], "completed", new Date()),
    /transition/i,
  );
});
