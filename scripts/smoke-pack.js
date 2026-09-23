import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const temporaryRoot = await mkdtemp(join(tmpdir(), "repoledger-pack-smoke-"));
try {
  const packed = JSON.parse(
    npm(["pack", "--json", "--pack-destination", temporaryRoot], packageRoot),
  )[0];
  const tarball = join(temporaryRoot, packed.filename);
  const consumer = join(temporaryRoot, "consumer");
  const idea = join(consumer, "ideas", id);
  await mkdir(idea, { recursive: true });
  await writeFile(
    join(consumer, "repoledger.yaml"),
    "version: 3\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
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
  const help = npm(["exec", "--", "repoledger", "--help"], consumer);
  assert.match(help, /repoledger whatsnext/);
  assert.match(help, /repoledger check/);
  assert.doesNotMatch(help, /repoledger task|repoledger status|repoledger init/);
  assert.equal(npm(["exec", "--", "repoledger", "--version"], consumer), packed.version);
  const exported = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { checkRepository, deriveIdeaState, parseIdeaStatus, whatsNext } from 'repoledger'; console.log([checkRepository, deriveIdeaState, parseIdeaStatus, whatsNext].map((value) => typeof value).join(','));",
    ],
    consumer,
  );
  assert.equal(exported, "function,function,function,function");
  const checked = JSON.parse(npm(["exec", "--", "repoledger", "check", "--json"], consumer));
  assert.equal(checked.ok, true);
  assert.equal(checked.result.ideas[0].alias, "installed-smoke");
  process.stdout.write(`PACK_SMOKE_OK name=${packed.name} version=${packed.version}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}