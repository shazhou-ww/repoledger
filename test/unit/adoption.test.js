import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  detectExecutionSource,
  inspectAdoption,
  SILVERMOON_VERSION,
} from "../../src/adoption.js";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryRepository() {
  const root = await mkdtemp(join(tmpdir(), "silvermoon-adoption-"));
  temporaryDirectories.push(root);
  return root;
}

test("reports every bootstrap requirement in one read-only observation", async () => {
  const root = await temporaryRepository();
  await mkdir(join(root, ".git"));
  const before = await readFile(new URL("../../package.json", import.meta.url), "utf8");

  const report = await inspectAdoption({ root });

  assert.equal(report.status, "blocked");
  assert.deepEqual(
    report.requirements.map(({ id }) => id),
    [
      "repository.git",
      "runtime.execution-source",
      "package.manifest",
      "package.installed",
      "skill.repository-local",
      "repository.configuration",
    ],
  );
  assert.ok(report.findings.length >= 5);
  assert.equal(report.recheck.executable, "npx");
  assert.equal(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    before,
  );
});

test("classifies a symlinked project-local package by resolved path", async () => {
  const root = await temporaryRepository();
  const storePackage = join(root, ".pnpm-store", "silvermoon");
  const localPackage = join(root, "node_modules", "silvermoon");
  await mkdir(storePackage, { recursive: true });
  await mkdir(join(root, "node_modules"), { recursive: true });
  await symlink(
    storePackage,
    localPackage,
    process.platform === "win32" ? "junction" : "dir",
  );

  const source = await detectExecutionSource({
    root,
    runtimeRoot: storePackage,
  });
  assert.equal(source.kind, "project-local");
  assert.equal(source.kind, "project-local");
});

test("delegates skill registration to the supported npx skills interface", async () => {
  const root = await temporaryRepository();
  assert.equal(
    spawnSync("git", ["-C", root, "init", "--initial-branch=main"], {
      encoding: "utf8",
      windowsHide: true,
    }).status,
    0,
  );
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ devDependencies: { silvermoon: SILVERMOON_VERSION } })}\n`,
  );
  await mkdir(join(root, "node_modules", "silvermoon"), { recursive: true });
  await writeFile(
    join(root, "node_modules", "silvermoon", "package.json"),
    `${JSON.stringify({ name: "silvermoon", version: SILVERMOON_VERSION })}\n`,
  );

  const report = await inspectAdoption({ root });
  const skill = report.requirements.find(({ id }) => id === "skill.repository-local");

  assert.deepEqual(skill.remediation, {
    kind: "command",
    executable: "npx",
    args: [
      "skills",
      "add",
      "./node_modules/silvermoon/skills",
      "--skill",
      "silvermoon",
      "--agent",
      "github-copilot",
      "--yes",
      "--copy",
    ],
    description:
      "Register the installed package's canonical skill through the supported npx skills interface.",
  });
  assert.equal(
    report.requirements.find(({ id }) => id === "repository.configuration")
      .remediation.kind,
    "manual",
  );
});
