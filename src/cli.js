import { readFileSync } from "node:fs";
import { Command, CommanderError, Option } from "commander";

import { checkRepository } from "./index.js";
import { createIdea } from "./create-idea.js";
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

function renderIdeaIdentity(idea) {
  return idea.alias === undefined ? idea.id : `${idea.id} (${idea.alias})`;
}

function renderRemediation(remediation) {
  return remediation.kind === "command"
    ? `${remediation.executable} ${remediation.args.join(" ")}`
    : `${remediation.description} (${remediation.path})`;
}

function renderWhatsNext(result, io) {
  if (result.onboarding) {
    io.log(`onboarding ${result.onboarding.status}`);
    for (const item of result.onboarding.gaps) {
      io.log(
        `  ${item.status.padEnd(12)} ${item.id}${item.blocking ? " [blocking]" : " [non-blocking]"}: ${item.title}`,
      );
      io.log(`    depends  ${item.dependencies.length ? item.dependencies.join(", ") : "none"}`);
      io.log(`    observed ${JSON.stringify(item.observed)}`);
      if (item.remediation) io.log(`    fix      ${renderRemediation(item.remediation)}`);
    }
    if (result.onboarding.recommendedAction) {
      io.log(`  next     ${renderRemediation(result.onboarding.recommendedAction)}`);
    }
    io.log(`  recheck  ${renderRemediation(result.onboarding.recheck)}`);
  }
  io.log(`${result.action.code}: ${result.action.message}`);
  io.log(`  language ${result.language.tag} (${result.language.source})`);
  if (result.observedPrimaryCommit) io.log(`  primary  ${result.observedPrimaryCommit}`);
  if (result.selectedIdea) {
    io.log(`  idea     ${renderIdeaIdentity(result.selectedIdea)}`);
    io.log(`  state    ${result.selectedIdea.state}`);
    io.log(`  ideal   ${result.selectedIdea.idealRevision}`);
    io.log(`  inner   ${result.selectedIdea.implementationRevision}`);
    io.log(`  outer   ${result.selectedIdea.deploymentRevision}`);
  }
  if (result.action.details?.world) {
    const world = result.action.details.world;
    io.log(`  world    ${world.name} (${world.displayName})`);
    io.log(`  entry    ${world.documentPath}`);
    io.log(`  support  ${world.auxiliaryRoot}`);
    io.log(`  decision ${world.decisionField}: ${world.revision}`);
    io.log(`  cascade  ${world.cascade}`);
  }
  for (const idea of result.action.details?.ideas ?? []) {
    io.log(`  option   ${renderIdeaIdentity(idea)}  ${idea.state}`);
  }
}

function renderCreateIdea(result, io) {
  if (!result.createdIdea) {
    renderWhatsNext(result, io);
    return;
  }
  io.log(`created: ${result.createdIdea.id}`);
  io.log(`  idea    ${result.createdIdea.ideaPath}`);
  io.log(`  ledger  ${result.createdIdea.ledgerPath}`);
  io.log(`  status  ${result.createdIdea.statusPath}`);
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
  if (report.command === "whats-next") {
    renderWhatsNext(report.result, io);
    return;
  }
  if (report.command === "create-idea") {
    renderCreateIdea(report.result, io);
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
    .name("silvermoon")
    .description("Derive and validate repository-owned idea state.")
    .version(VERSION, "-v, --version", "display the installed version")
    .addHelpCommand(false)
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
  $ silvermoon whats-next
  $ silvermoon whats-next <idea>
  $ silvermoon whats-next <idea> --json
  $ silvermoon create-idea
  $ silvermoon check
  $ silvermoon check --worktree
  $ silvermoon check --staged
  $ silvermoon check --commit HEAD
  $ silvermoon check --remote`);

  addCommonOptions(
    program
      .command("whats-next [idea]")
      .description("fetch primary and render the highest-priority next action"),
  ).action(async (idea, options) => {
    const report = await whatsNext({ enforceOnboarding: true, idea, root: options.root });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  addCommonOptions(
    program
      .command("create-idea")
      .description("create one structured idea scaffold after primary hygiene")
      .option("--language <tag>", "persist a canonical language override on the new idea"),
  ).action(async (options) => {
    const report = await createIdea({
      language: options.language,
      root: options.root,
    });
    render(report, options.json, io);
    program.setOptionValue("resultCode", report.ok ? 0 : 1);
  });

  addCommonOptions(
    program
      .command("check")
      .description("validate Silvermoon configuration, idea state, and an optional Git target")
      .addOption(new Option("--remote", "fetch and validate the primary tip selected by HEAD").conflicts(["commit", "staged", "worktree"]))
      .addOption(new Option("--commit <revision>", "validate one local commit snapshot").conflicts(["remote", "staged", "worktree"]))
      .addOption(new Option("--staged", "validate the index snapshot").conflicts(["remote", "commit", "worktree"]))
      .addOption(new Option("--worktree", "validate HEAD plus all staged, unstaged, and untracked changes").conflicts(["remote", "commit", "staged"])),
  ).action(async (options) => {
    const report = await checkRepository({
      commit: options.commit,
      remote: options.remote,
      root: options.root,
      staged: options.staged,
      worktree: options.worktree,
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
    io.error(`ERROR command.failed: ${caught.message}`);
    return 1;
  }
  return program.getOptionValue("resultCode") ?? 0;
}