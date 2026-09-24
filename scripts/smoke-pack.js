import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const npmCli = process.env.npm_execpath;
const id = "01M36QGPNTXEPP61DA4KP4AVZF";

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
  assert.ok(npmCli && /^npm-cli\.js$/i.test(basename(npmCli)));
  process.stdout.write(`SMOKE_NPM ${args[0]}\n`);
  return run(process.execPath, [npmCli, ...args], cwd);
}

function npmResult(args, cwd) {
  assert.ok(npmCli && /^npm-cli\.js$/i.test(basename(npmCli)));
  return spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "repoledger-pack-smoke-"));
try {
  const packed = JSON.parse(
    npm(["pack", "--json", "--pack-destination", temporaryRoot], packageRoot),
  )[0];
  const tarball = join(temporaryRoot, packed.filename);
  const consumer = join(temporaryRoot, "consumer");
  const primary = join(temporaryRoot, "primary.git");
  const idea = join(consumer, "ideas", id);
  await mkdir(idea, { recursive: true });
  await writeFile(
    join(consumer, "repoledger.yaml"),
    "version: 3\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  await writeFile(join(consumer, ".gitignore"), "node_modules/\n");
  await writeFile(join(idea, "Idea.md"), "# Installed package smoke\n");
  await writeFile(
    join(consumer, "ideas", `${id}.status.yaml`),
    `version: 1\nid: ${id}\nalias: installed-smoke\n`,
  );
  run("git", ["init", "--initial-branch=main"], consumer);
  run("git", ["config", "user.name", "repoledger smoke"], consumer);
  run("git", ["config", "user.email", "repoledger@example.invalid"], consumer);
  run("git", ["add", "."], consumer);
  run("git", ["commit", "-m", "Initialize smoke fixture"], consumer);

  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);
  run("git", ["add", "package.json", "package-lock.json", ".gitignore"], consumer);
  run("git", ["commit", "-m", "Install packed Repoledger"], consumer);
  run("git", ["init", "--bare", "--initial-branch=main", primary], consumer);
  run("git", ["push", primary, "main"], consumer);
  run(
    "git",
    ["config", `url.${pathToFileURL(primary).href}.insteadOf`, "https://example.com/owner/repository.git"],
    consumer,
  );
  const help = npm(["exec", "--", "repoledger", "--help"], consumer);
  assert.match(help, /repoledger whats-next/);
  assert.match(help, /repoledger create-idea/);
  assert.match(help, /repoledger check/);
  assert.doesNotMatch(help, /repoledger whatsnext|repoledger task|repoledger status|repoledger init/);
  assert.equal(npm(["exec", "--", "repoledger", "--version"], consumer), packed.version);
  const exported = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { checkRepository, createIdea, deriveIdeaState, generateUlid, implementationCriterionIds, parseIdeaStatus, verifyCriteriaEvidence, whatsNext } from 'repoledger'; console.log([checkRepository, createIdea, deriveIdeaState, generateUlid, implementationCriterionIds, parseIdeaStatus, verifyCriteriaEvidence, whatsNext].map((value) => typeof value).join(','));",
    ],
    consumer,
  );
  assert.equal(exported, "function,function,function,function,function,function,function,function");
  const created = JSON.parse(npm(["exec", "--", "repoledger", "create-idea", "--json"], consumer));
  assert.equal(created.ok, true);
  assert.equal(created.command, "create-idea");
  assert.match(created.result.createdIdea.id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(
    await readFile(join(consumer, created.result.createdIdea.ideaPath, "Idea.md"), "utf8"),
    "",
  );
  assert.equal(
    await readFile(join(consumer, created.result.createdIdea.statusPath), "utf8"),
    `version: 1\nid: ${created.result.createdIdea.id}\n`,
  );
  const legacy = npmResult(["exec", "--", "repoledger", "whatsnext"], consumer);
  assert.equal(legacy.status, 2, legacy.stderr);
  const checked = JSON.parse(npm(["exec", "--", "repoledger", "check", "--json"], consumer));
  assert.equal(checked.ok, true);
  assert.equal(checked.result.ideas[0].alias, "installed-smoke");
  const worktree = JSON.parse(
    npm(["exec", "--", "repoledger", "check", "--worktree", "--json"], consumer),
  );
  const createdSummary = worktree.result.ideas.find(({ id: ideaId }) =>
    ideaId === created.result.createdIdea.id
  );
  assert.equal(worktree.ok, true);
  assert.equal(Object.hasOwn(createdSummary, "alias"), false);
  process.stdout.write(`PACK_SMOKE_OK name=${packed.name} version=${packed.version}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}