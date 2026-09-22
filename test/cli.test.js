import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { render, runCli } from "../src/cli.js";
import { serializeStatusFile } from "../src/ledger.js";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function captureIo() {
  const output = [];
  const errors = [];
  return {
    errors,
    io: {
      error: (...values) => errors.push(values.join(" ")),
      log: (...values) => output.push(values.join(" ")),
    },
    output,
  };
}

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "repoledger-cli-time-"));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, "repoledger.yaml"),
    "version: 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  await mkdir(join(root, "tasks", "sample-task"), { recursive: true });
  await writeFile(
    join(root, "tasks", "status.yaml"),
    serializeStatusFile({
      version: 2,
      tasks: {
        "sample-task": {
          state: "backlog",
          createdAt: "2026-09-20T00:00:00Z",
          updatedAt: "2026-09-20T06:15:00Z",
        },
      },
    }),
  );
  return root;
}

test("renders the approved command surface without legacy commands", async () => {
  const capture = captureIo();
  const exitCode = await runCli([], capture.io);
  const help = capture.output.join("\n");

  assert.equal(exitCode, 0);
  assert.match(help, /check \[options\] \[task-name\]/);
  assert.match(help, /config\s+manage task language settings and user\s+preferences/);
  assert.match(help, /init \[options\]/);
  assert.match(help, /status \[options\] <task-name>/);
  assert.match(help, /task\s+query or mutate task lifecycle state/);
  assert.doesNotMatch(help, /doctor/);
  assert.doesNotMatch(help, /claim/);
  assert.doesNotMatch(help, /archive/);
  assert.doesNotMatch(help, /--config/);
});

test("reads and writes the global task language outside repositories", async () => {
  const root = await mkdtemp(join(tmpdir(), "repoledger-cli-preferences-"));
  temporaryDirectories.push(root);
  const preferencesPath = join(root, "user", "preferences.yaml");
  const missing = captureIo();
  const fallback = captureIo();
  const set = captureIo();
  const get = captureIo();
  const preferred = captureIo();
  const overridden = captureIo();

  assert.equal(
    await runCli(
      ["config", "get", "--global", "task-language"],
      missing.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(missing.output, ["task-language  unset (default en)"]);

  assert.equal(
    await runCli(
      ["config", "resolve", "--global", "task-language"],
      fallback.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(fallback.output, ["task-language  en (default)"]);

  assert.equal(
    await runCli(
      ["config", "set", "--global", "task-language", "zh-cn"],
      set.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(set.output, ["task-language  zh-CN"]);

  assert.equal(
    await runCli(
      ["config", "get", "--global", "task-language", "--json"],
      get.io,
      { preferencesPath },
    ),
    0,
  );
  const report = JSON.parse(get.output.join("\n"));
  assert.deepEqual(report.result, {
    configured: true,
    defaultValue: "en",
    key: "task-language",
    path: preferencesPath,
    value: "zh-CN",
  });

  assert.equal(
    await runCli(
      ["config", "resolve", "--global", "task-language"],
      preferred.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(preferred.output, ["task-language  zh-CN (preference)"]);

  assert.equal(
    await runCli(
      ["config", "resolve", "--global", "task-language", "--language", "fr-fr"],
      overridden.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(overridden.output, ["task-language  fr-FR (override)"]);
  assert.equal(
    await readFile(preferencesPath, "utf8"),
    "version: 1\ntaskLanguage: zh-CN\n",
  );
});

test("resolves project task language before user preference", async () => {
  const root = await mkdtemp(join(tmpdir(), "repoledger-cli-project-language-"));
  temporaryDirectories.push(root);
  const preferencesPath = join(root, "user", "preferences.yaml");
  await mkdir(join(root, "user"), { recursive: true });
  await writeFile(preferencesPath, "version: 1\ntaskLanguage: fr\n");
  await writeFile(
    join(root, "repoledger.yaml"),
    "version: 2\ntasksDirectory: tasks\ntaskLanguage: zh-CN\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  const project = captureIo();
  const overridden = captureIo();
  const preferred = captureIo();
  const fallback = captureIo();

  assert.equal(
    await runCli(
      ["config", "resolve", "task-language", "--root", root, "--json"],
      project.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(JSON.parse(project.output.join("\n")).result, {
    configPath: join(root, "repoledger.yaml"),
    key: "task-language",
    preferencesPath,
    source: "project",
    value: "zh-CN",
  });

  assert.equal(
    await runCli(
      ["config", "resolve", "task-language", "--root", root, "--language", "de"],
      overridden.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(overridden.output, ["task-language  de (override)"]);
  assert.equal(
    await readFile(join(root, "repoledger.yaml"), "utf8"),
    "version: 2\ntasksDirectory: tasks\ntaskLanguage: zh-CN\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );

  await writeFile(
    join(root, "repoledger.yaml"),
    "version: 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  assert.equal(
    await runCli(
      ["config", "resolve", "task-language", "--root", root],
      preferred.io,
      { preferencesPath },
    ),
    0,
  );
  assert.deepEqual(preferred.output, ["task-language  fr (preference)"]);

  assert.equal(
    await runCli(
      ["config", "resolve", "task-language", "--root", root],
      fallback.io,
      { preferencesPath: join(root, "missing", "preferences.yaml") },
    ),
    0,
  );
  assert.deepEqual(fallback.output, ["task-language  en (default)"]);
  assert.equal(
    await readFile(preferencesPath, "utf8"),
    "version: 1\ntaskLanguage: fr\n",
  );
});

test("rejects invalid task languages and non-global preference commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "repoledger-cli-preferences-"));
  temporaryDirectories.push(root);
  const preferencesPath = join(root, "preferences.yaml");
  const invalid = captureIo();
  const missingScope = captureIo();
  const unsupported = captureIo();

  assert.equal(
    await runCli(
      ["config", "set", "--global", "task-language", "en_US"],
      invalid.io,
      { preferencesPath },
    ),
    1,
  );
  assert.match(invalid.errors.join("\n"), /Invalid BCP 47 task language/);

  assert.equal(
    await runCli(
      ["config", "get", "task-language"],
      missingScope.io,
      { preferencesPath },
    ),
    2,
  );
  assert.match(missingScope.errors.join("\n"), /required option '--global'/);

  assert.equal(
    await runCli(
      ["config", "get", "--global", "unknown"],
      unsupported.io,
      { preferencesPath },
    ),
    2,
  );
  assert.match(unsupported.errors.join("\n"), /unsupported user preference/);
});

test("reports malformed preferences even when resolution has an override", async () => {
  const root = await mkdtemp(join(tmpdir(), "repoledger-cli-preferences-"));
  temporaryDirectories.push(root);
  const preferencesPath = join(root, "preferences.yaml");
  await writeFile(preferencesPath, "version: 1\ntaskLanguage: zh-cn\n");
  const capture = captureIo();

  const exitCode = await runCli(
    ["config", "resolve", "--global", "task-language", "--language", "fr-FR"],
    capture.io,
    { preferencesPath },
  );

  assert.equal(exitCode, 1);
  assert.match(capture.errors.join("\n"), /Invalid canonical BCP 47 task language/);
});

test("renders task list time and state filters", async () => {
  const capture = captureIo();
  const exitCode = await runCli(["task", "list", "--help"], capture.io);
  const help = capture.output.join("\n");

  assert.equal(exitCode, 0);
  for (const option of [
    "--state <state>",
    "--created-since <time>",
    "--created-before <time>",
    "--updated-since <time>",
    "--updated-before <time>",
    "--sort <key>",
    "--limit <count>",
    "--local",
  ]) {
    assert.match(help, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const example of [
    "2026-09-20",
    "2026-09-20T00:00:00Z",
    "2026-09-20T00:00:00+08:00",
    "today",
    "6h30m",
  ]) {
    assert.match(help, new RegExp(example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("renders unregistered list and status results without undefined timestamps", () => {
  const list = captureIo();
  const status = captureIo();
  const task = { task: "draft-task", state: "unregistered" };

  render({
    command: "task list",
    diagnostics: [],
    ok: true,
    result: { tasks: [task] },
  }, false, list.io);
  render({
    command: "status",
    diagnostics: [],
    ok: true,
    result: task,
  }, false, status.io);

  assert.deepEqual(list.output, ["draft-task  unregistered"]);
  assert.deepEqual(status.output, ["draft-task  unregistered"]);
});

test("renders the task language in status output", () => {
  const capture = captureIo();

  render({
    command: "status",
    diagnostics: [],
    ok: true,
    result: {
      language: "zh-CN",
      source: "remote",
      state: "backlog",
      task: "localized-task",
    },
  }, false, capture.io);

  assert.deepEqual(capture.output, [
    "localized-task  backlog",
    "  language zh-CN",
  ]);
});

test("documents ergonomic task list time inputs", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  for (const example of [
    "2026-09-20",
    "2026-09-20T12:30:00Z",
    "2026-09-20T00:00:00+08:00",
    "today",
    "6h30m",
    "5d12h",
  ]) {
    assert.match(readme, new RegExp(example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(readme, /current UTC date/);
  assert.match(readme, /one\s+reference instant captured for the command/);
  assert.match(readme, /Components use `d`, `h`, and\s+`m` at most once in that order/);
  assert.match(readme, /JSON reports contain the normalized bounds/);
  assert.match(readme, /derived `unregistered` state/);
  assert.match(readme, /time\s+filters exclude unregistered tasks/i);
});

test("renders portable repository and source ref options", async () => {
  const init = captureIo();
  const start = captureIo();

  assert.equal(await runCli(["init", "--help"], init.io), 0);
  assert.match(init.output.join("\n"), /--primary-repository <url>/);
  assert.doesNotMatch(init.output.join("\n"), /--remote/);

  assert.equal(await runCli(["task", "start", "--help"], start.io), 0);
  assert.match(start.output.join("\n"), /--source-repository <url>/);
  assert.match(start.output.join("\n"), /--source-branch <branch>/);
});

test("normalizes absolute and relative task list bounds with one reference instant", async () => {
  const root = await createRepository();
  const capture = captureIo();
  let clockCalls = 0;

  const exitCode = await runCli([
    "task",
    "list",
    "--local",
    "--root",
    root,
    "--json",
    "--created-since",
    "2026-09-20",
    "--created-before",
    "2026-09-21T08:00:00+08:00",
    "--updated-since",
    "today",
    "--updated-before",
    "6h",
  ], capture.io, {
    now: () => {
      clockCalls += 1;
      return new Date("2026-09-20T12:30:00.987Z");
    },
  });
  const report = JSON.parse(capture.output.join("\n"));

  assert.equal(exitCode, 0);
  assert.equal(clockCalls, 1);
  assert.deepEqual(report.result.filters, {
    createdSince: "2026-09-20T00:00:00Z",
    createdBefore: "2026-09-21T00:00:00Z",
    updatedSince: "2026-09-20T00:00:00Z",
    updatedBefore: "2026-09-20T06:30:00Z",
  });
  assert.deepEqual(report.result.tasks.map(({ task }) => task), ["sample-task"]);
});

test("normalizes documented relative task list examples", async () => {
  const root = await createRepository();
  const examples = new Map([
    ["today", "2026-09-20T00:00:00Z"],
    ["6h", "2026-09-20T06:30:00Z"],
    ["6h30m", "2026-09-20T06:00:00Z"],
    ["5d12h", "2026-09-15T00:30:00Z"],
  ]);

  for (const [input, expected] of examples) {
    const capture = captureIo();
    const exitCode = await runCli([
      "task",
      "list",
      "--local",
      "--root",
      root,
      "--json",
      "--updated-since",
      input,
    ], capture.io, { now: () => new Date("2026-09-20T12:30:00Z") });

    assert.equal(exitCode, 0, input);
    assert.equal(JSON.parse(capture.output.join("\n")).result.filters.updatedSince, expected);
  }
});

test("accepts every time input family for all four task list bounds", async () => {
  const root = await createRepository();
  const options = new Map([
    ["--created-since", "createdSince"],
    ["--created-before", "createdBefore"],
    ["--updated-since", "updatedSince"],
    ["--updated-before", "updatedBefore"],
  ]);
  const examples = new Map([
    ["2026-09-20", "2026-09-20T00:00:00Z"],
    ["2026-09-20T12:30:00Z", "2026-09-20T12:30:00Z"],
    ["2026-09-20T00:00:00+08:00", "2026-09-19T16:00:00Z"],
    ["2026-09-20T00:00:00-08:00", "2026-09-20T08:00:00Z"],
    ["today", "2026-09-20T00:00:00Z"],
    ["6h30m", "2026-09-20T06:00:00Z"],
  ]);

  for (const [option, filter] of options) {
    for (const [input, expected] of examples) {
      const capture = captureIo();
      const exitCode = await runCli([
        "task",
        "list",
        "--local",
        "--root",
        root,
        "--json",
        option,
        input,
      ], capture.io, { now: () => new Date("2026-09-20T12:30:00Z") });

      assert.equal(exitCode, 0, `${option} ${input}`);
      assert.equal(
        JSON.parse(capture.output.join("\n")).result.filters[filter],
        expected,
        `${option} ${input}`,
      );
    }
  }
});

test("rejects invalid time filters with actionable examples", async () => {
  const invalidInputs = [
    "2026-02-30",
    "2026-02-30T00:00:00+08:00",
    "2026-09-20T00:00",
    "2026-09-20T00:00:00",
    "2026-09-20T00:00:00+8:00",
    "2026-09-20T00:00:00+24:00",
    "2026-09-20T00:00:00+08:60",
    "2026-09-20T00:00:00.000Z",
    "2026-09-20t00:00:00z",
    "0m",
    "0d1h",
    "06h",
    "+2h",
    "2w",
    "1h2d",
    "1h30h",
    "1.5h",
    "yesterday",
  ];

  for (const input of invalidInputs) {
    const capture = captureIo();
    assert.equal(
      await runCli(["task", "list", "--created-since", input], capture.io),
      2,
      input,
    );
    const error = capture.errors.join("\n");
    for (const example of ["2026-09-20", "2026-09-20T00:00:00Z", "+08:00", "today", "6h30m"]) {
      assert.match(error, new RegExp(example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), input);
    }
    assert.match(error, /d, h, m order/, input);
  }
});

test("validates task list ranges after UTC normalization", async () => {
  const reversed = captureIo();

  assert.equal(
    await runCli([
      "task",
      "list",
      "--updated-since",
      "2026-09-20T00:00:00-08:00",
      "--updated-before",
      "2026-09-20T01:00:00Z",
    ], reversed.io),
    2,
  );
  assert.match(reversed.errors.join("\n"), /--updated-since must be earlier than --updated-before/);
});

test("returns a stable JSON validation report", async () => {
  const root = await mkdtemp(join(tmpdir(), "repoledger-cli-invalid-"));
  temporaryDirectories.push(root);
  const capture = captureIo();

  const exitCode = await runCli(["check", "--root", root, "--json"], capture.io);
  const report = JSON.parse(capture.output.join("\n"));

  assert.equal(exitCode, 1);
  assert.equal(report.command, "check");
  assert.equal(report.ok, false);
  assert.equal(report.result.checked, 0);
  assert.equal(report.diagnostics[0].code, "config.missing");
});

test("renders mutually exclusive Git check targets", async () => {
  const helpCapture = captureIo();
  assert.equal(await runCli(["check", "--help"], helpCapture.io), 0);
  const help = helpCapture.output.join("\n");
  for (const option of ["--remote", "--commit <revision>", "--staged", "--unstaged"]) {
    assert.match(help, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const conflicts = [
    ["--remote", "--commit", "HEAD"],
    ["--remote", "--staged"],
    ["--remote", "--unstaged"],
    ["--commit", "HEAD", "--staged"],
    ["--commit", "HEAD", "--unstaged"],
    ["--staged", "--unstaged"],
  ];
  for (const args of conflicts) {
    const capture = captureIo();
    assert.equal(await runCli(["check", ...args], capture.io), 2, args.join(" "));
    assert.match(capture.errors.join("\n"), /cannot be used with option/);
  }
});

test("requires explicit init coordination target and completion approval", async () => {
  const init = captureIo();
  const complete = captureIo();

  assert.equal(await runCli(["init"], init.io), 2);
  assert.match(init.errors.join("\n"), /--primary-repository/);
  assert.equal(await runCli(["task", "complete", "sample-task"], complete.io), 2);
  assert.match(complete.errors.join("\n"), /--approved-commit/);
});

test("renders source and primary coordinates for complete and partial starts", () => {
  const result = {
    task: "sample-task",
    transition: "backlog -> ongoing",
    publication: "published",
    primaryBefore: "1111111111111111111111111111111111111111",
    primaryAfter: "2222222222222222222222222222222222222222",
    sourceRepository: "https://example.com/owner/repository.git",
    sourceBranch: "task/sample-task",
    sourceTip: "2222222222222222222222222222222222222222",
    commit: "2222222222222222222222222222222222222222",
  };
  const complete = captureIo();
  render({ command: "task start", ok: true, diagnostics: [], result }, false, complete.io);
  const output = complete.output.join("\n");
  assert.match(output, /primary before\s+111111111111/);
  assert.match(output, /primary after\s+222222222222/);
  assert.match(output, /source\s+https:\/\/example\.com\/owner\/repository\.git#task\/sample-task/);
  assert.match(output, /source tip\s+222222222222/);

  const partial = captureIo();
  render({
    command: "task start",
    ok: false,
    diagnostics: [{ code: "git.start.primary-pending", level: "error", message: "pending", remediation: "retry" }],
    result: { ...result, publication: "partially-published", primaryAfter: null },
  }, false, partial.io);
  assert.match(partial.output.join("\n"), /partially-published/);
  assert.match(partial.errors.join("\n"), /FAILED/);
});
