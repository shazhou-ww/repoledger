import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const configuredNpmCli = process.env.npm_execpath;
const npmCli = configuredNpmCli && /^npm-cli\.js$/i.test(basename(configuredNpmCli))
  ? configuredNpmCli
  : resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const id = "01M36QGPNTXEPP61DA4KP4AVZF";

function ideaPaths(ideaId) {
  const idea = join(".silvermoon", "ideas", ideaId);
  return {
    status: join(idea, "status.yaml"),
    ledger: join(idea, "ledger.md"),
    outer: join(idea, "outer"),
    deployment: join(idea, "outer", "Deployment.md"),
    inner: join(idea, "outer", "inner"),
    implementation: join(idea, "outer", "inner", "Implementation.md"),
    ideal: join(idea, "outer", "inner", "ideal"),
    idea: join(idea, "outer", "inner", "ideal", "Idea.md"),
  };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stderr || result.error?.message}`);
  return result.stdout.trim();
}

function npm(args, cwd) {
  process.stdout.write(`SMOKE_NPM ${args[0]}\n`);
  const result = npmResult(args, cwd);
  assert.equal(
    result.status,
    0,
    `npm ${args.join(" ")} failed:\n${result.stderr || result.error?.message}`,
  );
  return result.stdout.trim();
}

function npmResult(args, cwd) {
  return spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "silvermoon-pack-smoke-"));
try {
  const packed = JSON.parse(
    npm(["pack", "--json", "--pack-destination", temporaryRoot], packageRoot),
  )[0];
  const tarball = join(temporaryRoot, packed.filename);
  const bootstrap = join(temporaryRoot, "bootstrap");
  await mkdir(bootstrap);
  run("git", ["init", "--initial-branch=main"], bootstrap);
  npm(["init", "-y"], bootstrap);
  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], bootstrap);
  const bootstrapReport = JSON.parse(
    npm(["exec", "--", "silvermoon", "whats-next", "--json"], bootstrap),
  );
  assert.equal(bootstrapReport.result.action.code, "adopt-silvermoon");
  assert.equal(bootstrapReport.result.onboarding.executionSource.kind, "project-local");
  assert.deepEqual(
    bootstrapReport.result.onboarding.findings.map(({ id }) => id),
    ["package.manifest", "skill.repository-local", "repository.configuration"],
  );
  assert.equal(bootstrapReport.result.onboarding.recommendedAction.executable, "npm");

  const consumer = join(temporaryRoot, "consumer");
  const primary = join(temporaryRoot, "primary.git");
  const paths = ideaPaths(id);
  await mkdir(join(consumer, paths.ideal), { recursive: true });
  await writeFile(
    join(consumer, ".silvermoon", "config.yaml"),
    "version: 1\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  await writeFile(join(consumer, ".gitignore"), "node_modules/\n");
  await writeFile(join(consumer, paths.idea), "# Installed package smoke\n");
  await writeFile(join(consumer, paths.implementation), "");
  await writeFile(join(consumer, paths.deployment), "");
  await writeFile(join(consumer, paths.ledger), "# Ledger\n");
  await writeFile(
    join(consumer, paths.status),
    `version: 1\nid: ${id}\nalias: installed-smoke\n`,
  );
  run("git", ["init", "--initial-branch=main"], consumer);
  run("git", ["config", "user.name", "silvermoon smoke"], consumer);
  run("git", ["config", "user.email", "silvermoon@example.invalid"], consumer);
  run("git", ["add", "."], consumer);
  run("git", ["commit", "-m", "Initialize smoke fixture"], consumer);

  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);
  const consumerManifestPath = join(consumer, "package.json");
  const consumerManifest = JSON.parse(await readFile(consumerManifestPath, "utf8"));
  delete consumerManifest.dependencies;
  consumerManifest.devDependencies = { silvermoon: packed.version };
  await writeFile(consumerManifestPath, `${JSON.stringify(consumerManifest, null, 2)}\n`);
  npm([
    "exec",
    "--yes",
    "--package",
    "skills",
    "--",
    "skills",
    "add",
    "./node_modules/silvermoon/skills",
    "--skill",
    "silvermoon",
    "--agent",
    "github-copilot",
    "--yes",
    "--copy",
  ], consumer);
  assert.match(
    await readFile(join(consumer, "node_modules", "silvermoon", "README.zh-CN.md"), "utf8"),
    /# Silvermoon（银月）/,
  );
  for (const schema of [
    "config.schema.json",
    "definitions.schema.json",
    "idea-status.schema.json",
  ]) {
    JSON.parse(
      await readFile(
        join(consumer, "node_modules", "silvermoon", "schema", "v1", schema),
        "utf8",
      ),
    );
  }
  await assert.rejects(
    readFile(join(consumer, "node_modules", ".bin", "repoledger"), "utf8"),
    { code: "ENOENT" },
  );
  run(
    "git",
    ["add", "package.json", "package-lock.json", ".gitignore", ".agents", "skills-lock.json"],
    consumer,
  );
  run("git", ["commit", "-m", "Install packed Silvermoon"], consumer);
  run("git", ["init", "--bare", "--initial-branch=main", primary], consumer);
  run("git", ["push", primary, "main"], consumer);
  run(
    "git",
    ["config", `url.${pathToFileURL(primary).href}.insteadOf`, "https://example.com/owner/repository.git"],
    consumer,
  );
  const help = npm(["exec", "--", "silvermoon", "--help"], consumer);
  assert.match(help, /silvermoon whats-next/);
  assert.match(help, /silvermoon create-idea/);
  assert.match(help, /silvermoon check/);
  assert.doesNotMatch(
    help,
    /silvermoon whatsnext|silvermoon task|silvermoon status|silvermoon init|silvermoon skill/,
  );
  assert.equal(npm(["exec", "--", "silvermoon", "--version"], consumer), packed.version);
  const exported = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import * as silvermoon from 'silvermoon'; const names = ['checkRepository', 'createIdea', 'deriveIdeaState', 'generateUlid', 'parseIdeaStatus', 'whatsNext']; console.log(`${names.map((name) => typeof silvermoon[name]).join(',')}|${Object.hasOwn(silvermoon, 'implementationCriterionIds')},${Object.hasOwn(silvermoon, 'verifyCriteriaEvidence')}`);",
    ],
    consumer,
  );
  assert.equal(exported, "function,function,function,function,function,function|false,false");
  const created = JSON.parse(npm(["exec", "--", "silvermoon", "create-idea", "--json"], consumer));
  assert.equal(created.ok, true);
  assert.equal(created.command, "create-idea");
  assert.match(created.result.createdIdea.id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(
    await readFile(join(consumer, created.result.createdIdea.ideaDocumentPath), "utf8"),
    `# Idea

## Intent

<!-- State the desired outcome in one or two sentences. -->

## Context

<!-- Describe the current problem, situation, or opportunity. -->

## Desired outcome

<!-- Describe the externally meaningful state that should become true. -->

## Scope

### In scope

<!-- Describe what this idea includes. -->

### Out of scope

<!-- Describe adjacent work this idea intentionally excludes. -->

## Constraints

<!-- Record material product, repository, compatibility, or operational constraints. -->

## Open questions

<!-- Record unresolved decisions. Remove this section when none remain. -->
`,
  );
  assert.match(
    await readFile(join(consumer, created.result.createdIdea.ledgerPath), "utf8"),
    /## Implementation[\s\S]*I-S01[\s\S]*## Deployment[\s\S]*D-AC01/,
  );
  assert.equal(
    await readFile(join(consumer, created.result.createdIdea.statusPath), "utf8"),
    `version: 1\nid: ${created.result.createdIdea.id}\n`,
  );
  const legacy = npmResult(["exec", "--", "silvermoon", "whatsnext"], consumer);
  assert.equal(legacy.status, 2, legacy.stderr);
  const checked = JSON.parse(npm(["exec", "--", "silvermoon", "check", "--json"], consumer));
  assert.equal(checked.ok, true);
  assert.equal(checked.result.ideas[0].alias, "installed-smoke");
  const worktree = JSON.parse(
    npm(["exec", "--", "silvermoon", "check", "--worktree", "--json"], consumer),
  );
  const createdSummary = worktree.result.ideas.find(({ id: ideaId }) =>
    ideaId === created.result.createdIdea.id
  );
  assert.equal(worktree.ok, true);
  assert.equal(Object.hasOwn(createdSummary, "alias"), false);
  const lifecycle = JSON.parse(
    npm(["exec", "--", "silvermoon", "whats-next", "installed-smoke", "--json"], consumer),
  );
  assert.equal(lifecycle.result.onboarding.status, "ready");
  assert.equal(lifecycle.result.onboarding.executionSource.kind, "project-local");
  await writeFile(
    join(consumer, ".agents", "skills", "silvermoon", "SKILL.md"),
    "drift\n",
  );
  const drift = JSON.parse(
    npm(["exec", "--", "silvermoon", "whats-next", "installed-smoke", "--json"], consumer),
  );
  assert.equal(drift.result.action.code, "adopt-silvermoon");
  assert.equal(
    drift.result.onboarding.findings.find(({ id: finding }) =>
      finding === "skill.repository-local"
    ).status,
    "mismatched",
  );
  process.stdout.write(`PACK_SMOKE_OK name=${packed.name} version=${packed.version}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}