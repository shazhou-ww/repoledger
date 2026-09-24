import assert from "node:assert/strict";
import { test } from "node:test";

import { createProgram, render, runCli } from "../src/cli.js";

function capture() {
  const logs = [];
  const errors = [];
  return {
    errors,
    io: {
      error: (value) => errors.push(value),
      log: (value) => logs.push(value),
    },
    logs,
  };
}

test("registers only the approved vNext command surface", () => {
  const { io } = capture();
  const program = createProgram(io);
  assert.deepEqual(program.commands.map((command) => command.name()).sort(), ["check", "whatsnext"]);
});

test("renders deterministic whatsnext human and JSON output", () => {
  const report = {
    command: "whatsnext",
    ok: true,
    root: "C:/repository",
    diagnostics: [],
    result: {
      observedPrimaryCommit: "a".repeat(40),
      selectedIdea: {
        id: "01M36QGPNTXEPP61DA4KP4AVZF",
        alias: "fixture",
        revision: "b".repeat(40),
        state: "preparing",
      },
      action: { code: "prepare-idea", message: "Prepare it.", details: {} },
    },
  };
  const human = capture();
  render(report, false, human.io);
  assert.match(human.logs.join("\n"), /prepare-idea: Prepare it\./);
  assert.match(human.logs.join("\n"), /state    preparing/);

  const json = capture();
  render(report, true, json.io);
  assert.deepEqual(JSON.parse(json.logs[0]), report);
});

test("renders active idea options in human whatsnext output", () => {
  const report = {
    command: "whatsnext",
    ok: true,
    root: "C:/repository",
    diagnostics: [],
    result: {
      observedPrimaryCommit: "a".repeat(40),
      selectedIdea: null,
      action: {
        code: "select-active-idea",
        message: "Select one active idea.",
        details: {
          ideas: [
            {
              id: "01M36QGPNTXEPP61DA4KP4AVG0",
              alias: "first-idea",
              revision: "b".repeat(40),
              state: "preparing",
            },
            {
              id: "01M36QGPNTXEPP61DA4KP4AVZF",
              alias: "second-idea",
              revision: "c".repeat(40),
              state: "implementing",
            },
          ],
        },
      },
    },
  };
  const human = capture();

  render(report, false, human.io);

  assert.match(
    human.logs.join("\n"),
    /option   01M36QGPNTXEPP61DA4KP4AVG0 \(first-idea\)  preparing/,
  );
  assert.match(
    human.logs.join("\n"),
    /option   01M36QGPNTXEPP61DA4KP4AVZF \(second-idea\)  implementing/,
  );
});

test("exposes worktree and rejects conflicting check targets", async () => {
  const { io } = capture();
  const program = createProgram(io);
  const check = program.commands.find((command) => command.name() === "check");
  assert.ok(check.options.some(({ long }) => long === "--worktree"));
  assert.ok(!check.options.some(({ long }) => long === "--unstaged"));
  assert.equal(await runCli(["check", "--remote", "--worktree"], io), 2);
});