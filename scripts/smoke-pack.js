import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const npmCli = process.env.npm_execpath;
const id = "01M36QGPNTXEPP61DA4KP4AVZF";

function ideaPaths(ideaId) {
  const idea = join(".silvermoon", "ideas", ideaId);
  return {
    status: join(idea, "status.yaml"),
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

const temporaryRoot = await mkdtemp(join(tmpdir(), "silvermoon-pack-smoke-"));
try {
  const packed = JSON.parse(
    npm(["pack", "--json", "--pack-destination", temporaryRoot], packageRoot),
  )[0];
  const tarball = join(temporaryRoot, packed.filename);
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
  await assert.rejects(
    readFile(join(consumer, "node_modules", ".bin", "repoledger"), "utf8"),
    { code: "ENOENT" },
  );
  run("git", ["add", "package.json", "package-lock.json", ".gitignore"], consumer);
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
  assert.doesNotMatch(help, /silvermoon whatsnext|silvermoon task|silvermoon status|silvermoon init/);
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
    "",
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
  process.stdout.write(`PACK_SMOKE_OK name=${packed.name} version=${packed.version}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}