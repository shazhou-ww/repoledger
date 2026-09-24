import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createProgram, render, runCli } from "../src/cli.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function gitStatus() {
  const result = spawnSync("git", ["-C", repositoryRoot, "status", "--porcelain=v1"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

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
  assert.deepEqual(
    program.commands.map((command) => command.name()).sort(),
    ["check", "create-idea", "whats-next"],
  );
});

test("help lists exactly the three public subcommands", async () => {
  const { io, logs } = capture();

  assert.equal(await runCli(["--help"], io), 0);
  const help = logs.join("\n");
  assert.match(help, /\bcheck\b/);
  assert.match(help, /\bcreate-idea\b/);
  assert.match(help, /\bwhats-next\b/);
  assert.doesNotMatch(help, /help \[command\]|\bwhatsnext\b|\bnewidea\b|\bnew-idea\b/);
});

test("renders a created idea scaffold", () => {
  const report = {
    command: "create-idea",
    ok: true,
    root: "C:/repository",
    diagnostics: [],
    result: {
      request: { kind: "create-idea" },
      createdIdea: {
        id: "01M38K00000000000000000001",
        ideaPath: "ideas/01M38K00000000000000000001",
        statusPath: "ideas/01M38K00000000000000000001.status.yaml",
      },
    },
  };
  const output = capture();

  render(report, false, output.io);

  assert.match(output.logs.join("\n"), /01M38K00000000000000000001/);
  assert.match(output.logs.join("\n"), /ideas\/01M38K00000000000000000001\.status\.yaml/);
});

test("renders deterministic whats-next human and JSON output", () => {
  const report = {
    command: "whats-next",
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

test("renders active idea options in human whats-next output", () => {
  const report = {
    command: "whats-next",
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

test("renders an alias-less idea without empty parentheses", () => {
  const report = {
    command: "whats-next",
    ok: true,
    root: "C:/repository",
    diagnostics: [],
    result: {
      observedPrimaryCommit: "a".repeat(40),
      request: { kind: "select-idea", selector: "01M36QGPNTXEPP61DA4KP4AVZF" },
      selectedIdea: {
        id: "01M36QGPNTXEPP61DA4KP4AVZF",
        revision: "b".repeat(40),
        state: "preparing",
      },
      action: { code: "prepare-idea", message: "Prepare it.", details: {} },
    },
  };
  const output = capture();

  render(report, false, output.io);

  assert.match(output.logs.join("\n"), /idea\s+01M36QGPNTXEPP61DA4KP4AVZF/);
  assert.doesNotMatch(output.logs.join("\n"), /undefined|\(\)/);
});

test("exposes worktree and rejects conflicting check targets", async () => {
  const { io } = capture();
  const program = createProgram(io);
  const check = program.commands.find((command) => command.name() === "check");
  assert.ok(check.options.some(({ long }) => long === "--worktree"));
  assert.ok(!check.options.some(({ long }) => long === "--unstaged"));
  assert.equal(await runCli(["check", "--remote", "--worktree"], io), 2);
});

test("rejects legacy and competing create/navigation spellings", async () => {
  const { io } = capture();
  const before = gitStatus();

  for (const command of ["whatsnext", "new", "newidea", "new-idea"]) {
    assert.equal(await runCli([command], io), 2, command);
  }
  assert.equal(gitStatus(), before);
});