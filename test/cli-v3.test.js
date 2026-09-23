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

test("returns usage exit code 2 for conflicting check targets", async () => {
  const { io } = capture();
  assert.equal(await runCli(["check", "--remote", "--staged"], io), 2);
});