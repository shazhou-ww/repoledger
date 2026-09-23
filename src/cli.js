import { readFileSync } from "node:fs";
import { Command, CommanderError, Option } from "commander";

import { checkRepository } from "./index.js";
import { whatsNext } from "./whatsnext.js";

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

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
  for (const item of report.diagnostics) {
    const location = item.path ? ` ${item.path}` : "";
    const output = item.level === "error" ? io.error : io.log;
    output(`${item.level.toUpperCase()} ${item.code}${location}: ${item.message}`);
    output(`  Fix: ${item.remediation}`);
  }
}

function renderWhatsNext(result, io) {
  io.log(`${result.action.code}: ${result.action.message}`);
  io.log(`  primary  ${result.observedPrimaryCommit}`);
  if (result.selectedIdea) {
    io.log(`  idea     ${result.selectedIdea.id} (${result.selectedIdea.alias})`);
    io.log(`  state    ${result.selectedIdea.state}`);
    io.log(`  revision ${result.selectedIdea.revision}`);
  }
  for (const idea of result.action.details?.ideas ?? []) {
    io.log(`  option   ${idea.id} (${idea.alias})  ${idea.state}`);
  }
}

export function render(report, json, io) {
  if (json) {
    io.log(JSON.stringify(report, null, 2));
    return;
  }
  renderDiagnostics(report, io);
  if (!report.ok) {
    io.error("FAILED");
    return;
  }
  if (report.command === "whatsnext") {
    renderWhatsNext(report.result, io);
    return;
  }
  io.log(`OK: ${report.command}`);
  io.log(`  target  ${report.result.target}`);
  if (report.result.commit) io.log(`  commit  ${report.result.commit}`);
  io.log(`  ideas   ${report.result.checked}`);
}

export function createProgram(io = console) {
  const program = new Command();
  program
    .name("repoledger")
    .description("Derive and validate repository-owned idea state.")
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
  $ repoledger whatsnext
  $ repoledger whatsnext <idea>
  $ repoledger whatsnext <idea> --json
  $ repoledger check
  $ repoledger check --staged
  $ repoledger check --commit HEAD
  $ repoledger check --remote`);

  addCommonOptions(
    program
      .command("whatsnext [idea]")
      .description("fetch primary and render the highest-priority next action"),
  ).action(async (idea, options) => {
    const report = await whatsNext({ idea, root: options.root });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  addCommonOptions(
    program
      .command("check")
      .description("validate vNext configuration, idea state, and an optional Git target")
      .addOption(new Option("--remote", "fetch and validate the configured primary tip").conflicts(["commit", "staged", "unstaged"]))
      .addOption(new Option("--commit <revision>", "validate one local commit snapshot").conflicts(["remote", "staged", "unstaged"]))
      .addOption(new Option("--staged", "validate the index snapshot").conflicts(["remote", "commit", "unstaged"]))
      .addOption(new Option("--unstaged", "validate tracked and untracked worktree changes").conflicts(["remote", "commit", "staged"])),
  ).action(async (options) => {
    const report = await checkRepository({
      commit: options.commit,
      remote: options.remote,
      root: options.root,
      staged: options.staged,
      unstaged: options.unstaged,
    });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  return program;
}

export async function runCli(args, io = console) {
  const program = createProgram(io);
  try {
    await program.parseAsync(args.length === 0 ? ["--help"] : args, { from: "user" });
  } catch (caught) {
    if (caught instanceof CommanderError) return caught.exitCode === 0 ? 0 : 2;
    throw caught;
  }
  return program.getOptionValue("resultCode") ?? 0;
}