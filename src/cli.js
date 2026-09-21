import { readFileSync } from "node:fs";
import { Command, CommanderError, Option } from "commander";

import { checkRepository } from "./index.js";
import { initRepository } from "./init.js";
import { isTimestamp, TASK_STATES } from "./ledger.js";
import { resolveTaskLanguage } from "./language.js";
import {
  DEFAULT_TASK_LANGUAGE,
  loadUserPreferences,
  saveTaskLanguagePreference,
  userPreferencesPath,
} from "./preferences.js";
import { mutateTask } from "./publication.js";
import { listTasks, statusRepository } from "./status.js";

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/;
const RELATIVE_DURATION = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/;
const TIME_OPTION_KEYS = ["createdSince", "createdBefore", "updatedSince", "updatedBefore"];
const TIME_EXAMPLES = "2026-09-20, 2026-09-20T00:00:00Z, 2026-09-20T00:00:00+08:00, today, 6h30m";

function write(method, value) {
  const text = value.replace(/\n$/, "");
  if (text) method(text);
}

function addCommonOptions(command) {
  return command
    .option("--json", "emit the complete machine-readable report")
    .option("-r, --root <path>", "repository root", process.cwd());
}

function renderDiagnostics(report, io) {
  for (const diagnostic of report.diagnostics) {
    const location = diagnostic.path ? ` ${diagnostic.path}` : "";
    const output = diagnostic.level === "error" ? io.error : io.log;
    output(`${diagnostic.level.toUpperCase()} ${diagnostic.code}${location}: ${diagnostic.message}`);
    output(`  Fix: ${diagnostic.remediation}`);
  }
}

function renderPublication(result, io) {
  io.log(`${result.publication}: ${result.transition}`);
  io.log(`  commit         ${result.commit.slice(0, 12)}`);
  if (result.primaryBefore) {
    io.log(`  primary before  ${result.primaryBefore.slice(0, 12)}`);
  }
  if (result.primaryAfter) {
    io.log(`  primary after   ${result.primaryAfter.slice(0, 12)}`);
  }
  if (result.sourceRepository) {
    io.log(`  source          ${result.sourceRepository}#${result.sourceBranch}`);
    io.log(`  source tip      ${result.sourceTip.slice(0, 12)}`);
  }
}

export function render(report, json, io) {
  if (json) {
    io.log(JSON.stringify(report, null, 2));
    return;
  }
  renderDiagnostics(report, io);
  if (!report.ok) {
    if (report.result?.publication) renderPublication(report.result, io);
    io.error("FAILED");
    return;
  }
  if (report.command === "config get") {
    const result = report.result;
    io.log(
      result.configured
        ? `${result.key}  ${result.value}`
        : `${result.key}  unset (default ${result.defaultValue})`,
    );
    return;
  }
  if (report.command === "config set") {
    io.log(`${report.result.key}  ${report.result.value}`);
    return;
  }
  if (report.command === "config resolve") {
    io.log(`${report.result.key}  ${report.result.value} (${report.result.source})`);
    return;
  }
  if (report.command === "task list") {
    const tasks = report.result.tasks;
    if (tasks.length === 0) io.log("No tasks.");
    for (const task of tasks) {
      const timestamps = task.createdAt
        ? `  ${task.createdAt}  ${task.updatedAt}`
        : "";
      io.log(`${task.task}  ${task.state}${timestamps}`);
      if (task.state === "ongoing") {
        io.log(`  source  ${task.sourceRepository}#${task.sourceBranch}`);
      }
    }
    return;
  }
  if (report.command === "status") {
    const result = report.result;
    io.log(`${result.task}  ${result.state}`);
    if (result.createdAt) {
      io.log(`  created  ${result.createdAt}`);
      io.log(`  updated  ${result.updatedAt}`);
    }
    if (result.language !== undefined) {
      io.log(`  language ${result.language ?? "invalid"}`);
    }
    if (result.state === "ongoing") {
      io.log(`  source   ${result.sourceRepository}#${result.sourceBranch}`);
    }
    if (result.primary) io.log(`  primary  ${result.primary}`);
    return;
  }
  if (report.result?.publication) {
    renderPublication(report.result, io);
    return;
  }
  io.log(`OK: ${report.command}`);
}

function collect(value, previous) {
  return [...previous, value];
}

function positiveInteger(value) {
  if (!/^[1-9]\d*$/.test(value)) throw new CommanderError(2, "repoledger.invalid-limit", "Limit must be a positive integer");
  return Number(value);
}

function utcMilliseconds(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return undefined;
  }
  return date.valueOf();
}

function canonicalTimestamp(milliseconds) {
  const date = new Date(milliseconds);
  if (Number.isNaN(date.valueOf())) return undefined;
  const value = date.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value)) return undefined;
  return value.replace(".000Z", "Z");
}

function normalizeAbsoluteTime(value) {
  if (isTimestamp(value)) return value;

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    return utcMilliseconds(year, month, day) === undefined
      ? undefined
      : `${value}T00:00:00Z`;
  }

  const offsetTimestamp = OFFSET_TIMESTAMP.exec(value);
  if (!offsetTimestamp) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, sign, offsetHourText, offsetMinuteText] = offsetTimestamp;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHourText,
    offsetMinuteText,
  ].map(Number);
  const localMilliseconds = utcMilliseconds(year, month, day, hour, minute, second);
  if (localMilliseconds === undefined || offsetHour > 23 || offsetMinute > 59) return undefined;
  const offsetMilliseconds = (offsetHour * 60 + offsetMinute) * 60_000;
  return canonicalTimestamp(localMilliseconds + (sign === "+" ? -offsetMilliseconds : offsetMilliseconds));
}

function normalizeRelativeTime(value, referenceInstant) {
  if (value === "today") {
    return `${referenceInstant.toISOString().slice(0, 10)}T00:00:00Z`;
  }
  const duration = RELATIVE_DURATION.exec(value);
  if (!duration || !duration.slice(1).some(Boolean)) return undefined;
  const components = duration.slice(1);
  if (components.some((component) => component !== undefined && !/^[1-9]\d*$/.test(component))) {
    return undefined;
  }
  const [days = "0", hours = "0", minutes = "0"] = components;
  const durationMilliseconds = (
    BigInt(days) * 24n * 60n +
    BigInt(hours) * 60n +
    BigInt(minutes)
  ) * 60_000n;
  if (durationMilliseconds === 0n) return undefined;
  const result = BigInt(referenceInstant.valueOf()) - durationMilliseconds;
  if (result < -8_640_000_000_000_000n || result > 8_640_000_000_000_000n) return undefined;
  return canonicalTimestamp(Math.floor(Number(result) / 1000) * 1000);
}

function normalizeTime(value, referenceInstant) {
  return normalizeAbsoluteTime(value) ?? normalizeRelativeTime(value, referenceInstant);
}

function normalizeTimestampOptions(program, options, referenceInstant) {
  for (const key of TIME_OPTION_KEYS) {
    if (options[key] === undefined) continue;
    const normalized = normalizeTime(options[key], referenceInstant);
    if (!normalized) {
      program.error(`error: option --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} requires a valid time (examples: ${TIME_EXAMPLES}; offsets use +HH:MM or -HH:MM; durations use each of d, h, m at most once in d, h, m order)`, {
        exitCode: 2,
        code: "repoledger.invalid-timestamp",
      });
    }
    options[key] = normalized;
  }
  for (const field of ["created", "updated"]) {
    if (options[`${field}Since`] && options[`${field}Before`] && options[`${field}Since`] >= options[`${field}Before`]) {
      program.error(`error: --${field}-since must be earlier than --${field}-before`, {
        exitCode: 2,
        code: "repoledger.invalid-time-range",
      });
    }
  }
}

export function createProgram(io = console, {
  now = () => new Date(),
  preferencesPath = userPreferencesPath(),
} = {}) {
  const program = new Command();
  program
    .name("repoledger")
    .description("Query and publish repository-owned task lifecycle state.")
    .version(VERSION, "-v, --version", "display the installed version")
    .showHelpAfterError("(run with --help for usage)")
    .showSuggestionAfterError()
    .configureHelp({ sortOptions: true, sortSubcommands: true })
    .configureOutput({
      outputError: (value, output) => output(value),
      writeErr: (value) => write(io.error, value),
      writeOut: (value) => write(io.log, value),
    })
    .exitOverride()
    .addHelpText("after", `
Examples:
  $ repoledger config set --global task-language zh-CN
  $ repoledger config get --global task-language
  $ repoledger config resolve --global task-language --language fr-FR
  $ repoledger task list --state ongoing --sort updated
  $ repoledger status <task-name>
  $ repoledger check --remote
  $ repoledger task start <task-name>`);

  const config = program.command("config").description("manage user preferences");
  config
    .command("get <key>")
    .description("read one user preference")
    .requiredOption("--global", "read the per-user preference outside repositories")
    .option("--json", "emit the complete machine-readable report")
    .action(async (key, options) => {
      if (key !== "task-language") {
        program.error(`error: unsupported user preference: ${key}`, {
          exitCode: 2,
          code: "repoledger.invalid-preference",
        });
      }
      const loaded = await loadUserPreferences({ path: preferencesPath });
      const report = {
        command: "config get",
        diagnostics: loaded.diagnostics,
        ok: loaded.diagnostics.length === 0,
        result: loaded.diagnostics.length === 0
          ? {
            configured: loaded.exists,
            defaultValue: DEFAULT_TASK_LANGUAGE,
            key,
            path: loaded.path,
            value: loaded.preferences.taskLanguage,
          }
          : null,
      };
      render(report, options.json, io);
      program.setOptionValue("resultCode", report.ok ? 0 : 1);
    });

  config
    .command("set <key> <value>")
    .description("set one user preference")
    .requiredOption("--global", "write the per-user preference outside repositories")
    .option("--json", "emit the complete machine-readable report")
    .action(async (key, value, options) => {
      if (key !== "task-language") {
        program.error(`error: unsupported user preference: ${key}`, {
          exitCode: 2,
          code: "repoledger.invalid-preference",
        });
      }
      const saved = await saveTaskLanguagePreference({
        language: value,
        path: preferencesPath,
      });
      const report = {
        command: "config set",
        diagnostics: saved.diagnostics,
        ok: saved.diagnostics.length === 0,
        result: saved.diagnostics.length === 0
          ? { key, path: saved.path, value: saved.language }
          : null,
      };
      render(report, options.json, io);
      program.setOptionValue("resultCode", report.ok ? 0 : 1);
    });

  config
    .command("resolve <key>")
    .description("resolve one effective user preference without changing it")
    .requiredOption("--global", "read the per-user preference outside repositories")
    .option("--language <tag>", "one-command task language override")
    .option("--json", "emit the complete machine-readable report")
    .action(async (key, options) => {
      if (key !== "task-language") {
        program.error(`error: unsupported user preference: ${key}`, {
          exitCode: 2,
          code: "repoledger.invalid-preference",
        });
      }
      const loaded = await loadUserPreferences({ path: preferencesPath });
      if (loaded.diagnostics.length > 0) {
        const report = {
          command: "config resolve",
          diagnostics: loaded.diagnostics,
          ok: false,
          result: null,
        };
        render(report, options.json, io);
        program.setOptionValue("resultCode", 1);
        return;
      }
      const resolved = resolveTaskLanguage({
        override: options.language,
        preference: loaded.preferences.taskLanguage,
      });
      if (!resolved) {
        program.error(`error: invalid BCP 47 task language: ${options.language}`, {
          exitCode: 2,
          code: "repoledger.invalid-task-language",
        });
      }
      const report = {
        command: "config resolve",
        diagnostics: [],
        ok: true,
        result: {
          key,
          path: preferencesPath,
          source: resolved.source,
          value: resolved.language,
        },
      };
      render(report, options.json, io);
      program.setOptionValue("resultCode", 0);
    });

  addCommonOptions(
    program
      .command("check [task-name]")
      .description("validate task configuration, status, artifacts, and optional remote history")
      .option("--remote", "fetch and validate the configured primary branch"),
  ).action(async (taskName, options) => {
    const report = await checkRepository({ remote: options.remote, root: options.root, taskName });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  addCommonOptions(
    program
      .command("init")
      .description("initialize and publish a new task ledger")
      .requiredOption("--primary-repository <url>", "canonical HTTPS primary repository URL")
      .requiredOption("--primary-branch <branch>", "shared primary branch")
      .option("--tasks-directory <path>", "repository-relative task directory", "tasks"),
  ).action(async (options) => {
    const report = await initRepository({
      primaryBranch: options.primaryBranch,
      primaryRepository: options.primaryRepository,
      root: options.root,
      tasksDirectory: options.tasksDirectory,
    });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  addCommonOptions(
    program
      .command("status <task-name>")
      .description("show one task record")
      .option("--local", "read the worktree snapshot without fetching"),
  ).action(async (taskName, options) => {
    const report = await statusRepository({ local: options.local, root: options.root, taskName });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  const task = program.command("task").description("query or mutate task lifecycle state");
  const list = addCommonOptions(
    task
      .command("list")
      .description("list and filter task records")
      .addOption(new Option("--state <state>", "include a lifecycle state").choices(TASK_STATES).argParser(collect).default([]))
      .option("--created-since <time>", "inclusive creation lower bound")
      .option("--created-before <time>", "exclusive creation upper bound")
      .option("--updated-since <time>", "inclusive update lower bound")
      .option("--updated-before <time>", "exclusive update upper bound")
      .addOption(new Option("--sort <key>", "sort key").choices(["name", "created", "updated"]).default("name"))
      .option("--limit <count>", "maximum result count", positiveInteger)
      .option("--local", "read the worktree snapshot without fetching"),
  );
  list.addHelpText("after", `
Time examples:
  2026-09-20                   UTC midnight on that date
  2026-09-20T00:00:00Z         exact UTC timestamp
  2026-09-20T00:00:00+08:00    timestamp with a colonized offset
  today                        midnight on the current UTC date
  6h30m                        captured command time minus 6 hours 30 minutes

Offsets require +HH:MM or -HH:MM. Durations use positive d, h, and m
components at most once in that order.`);
  list.action(async (options) => {
    const referenceInstant = now();
    if (!(referenceInstant instanceof Date) || Number.isNaN(referenceInstant.valueOf())) {
      throw new Error("Invalid task list reference instant");
    }
    normalizeTimestampOptions(program, options, referenceInstant);
    const report = await listTasks({
      filters: {
        states: options.state,
        createdSince: options.createdSince,
        createdBefore: options.createdBefore,
        updatedSince: options.updatedSince,
        updatedBefore: options.updatedBefore,
      },
      limit: options.limit,
      local: options.local,
      root: options.root,
      sort: options.sort,
    });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  for (const operation of ["register", "abandon"]) {
    addCommonOptions(
      task.command(`${operation} <task-name>`).description(`${operation} one task`),
    ).action(async (taskName, options) => {
      const report = await mutateTask({ operation, root: options.root, taskName });
      render(report, options.json, io);
      program.setOptionValue("resultCode", report.ok ? 0 : 1);
    });
  }

  addCommonOptions(
    task
      .command("start <task-name>")
      .description("start one task and publish its shared source ref")
      .option("--source-repository <url>", "canonical HTTPS source repository URL")
      .option("--source-branch <branch>", "shared source branch"),
  ).action(async (taskName, options) => {
    const report = await mutateTask({
      operation: "start",
      root: options.root,
      sourceBranch: options.sourceBranch,
      sourceRepository: options.sourceRepository,
      taskName,
    });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  addCommonOptions(
    task
      .command("complete <task-name>")
      .description("complete one approved task")
      .requiredOption("--approved-commit <commit>", "exact primary commit approved for delivery"),
  ).action(async (taskName, options) => {
    const report = await mutateTask({
      approvedCommit: options.approvedCommit,
      operation: "complete",
      root: options.root,
      taskName,
    });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  return program;
}

export async function runCli(args, io = console, dependencies = {}) {
  const program = createProgram(io, dependencies);
  try {
    await program.parseAsync(args.length === 0 ? ["--help"] : args, { from: "user" });
  } catch (caught) {
    if (caught instanceof CommanderError) return caught.exitCode === 0 ? 0 : 2;
    throw caught;
  }
  return program.getOptionValue("resultCode") ?? 0;
}
