import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const npmCli = process.env.npm_execpath;

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
  await mkdir(join(consumer, "tasks"), { recursive: true });
  await writeFile(
    join(consumer, "repoledger.yaml"),
    "version: 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  await writeFile(join(consumer, "tasks", "status.yaml"), "version: 2\ntasks: {}\n");

  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);
  const help = npm(["exec", "--", "repoledger", "--help"], consumer);
  assert.match(help, /repoledger task list/);
  assert.doesNotMatch(help, /doctor/);
  assert.equal(npm(["exec", "--", "repoledger", "--version"], consumer), packed.version);
  const exported = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { checkRepository, initRepository, listTasks, mutateTask, prepareV1Migration, statusRepository } from 'repoledger'; console.log([checkRepository, initRepository, listTasks, mutateTask, prepareV1Migration, statusRepository].map((value) => typeof value).join(','));",
    ],
    consumer,
  );
  assert.equal(exported, "function,function,function,function,function,function");
  const checked = JSON.parse(npm(["exec", "--", "repoledger", "check", "--json"], consumer));
  assert.equal(checked.ok, true);
  await mkdir(join(consumer, "tasks", "sample-task"));
  await writeFile(
    join(consumer, "tasks", "status.yaml"),
    "version: 2\ntasks:\n  sample-task:\n    state: backlog\n    createdAt: \"2026-09-20T00:00:00Z\"\n    updatedAt: \"2026-09-20T06:15:00Z\"\n",
  );
  const listed = JSON.parse(npm([
    "exec",
    "--",
    "repoledger",
    "task",
    "list",
    "--local",
    "--json",
    "--updated-since",
    "2026-09-20",
    "--updated-before",
    "2026-09-20T15:00:00+08:00",
  ], consumer));
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.result.filters, {
    updatedSince: "2026-09-20T00:00:00Z",
    updatedBefore: "2026-09-20T07:00:00Z",
  });
  assert.deepEqual(listed.result.tasks.map(({ task }) => task), ["sample-task"]);
  process.stdout.write(`PACK_SMOKE_OK name=${packed.name} version=${packed.version}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
