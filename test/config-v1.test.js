import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { loadConfig, serializeConfig } from "../src/config.js";
import { isValidUlid } from "../src/ideas.js";
import { validRepository } from "../src/repository.js";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function writeConfig(source) {
  const root = await mkdtemp(join(tmpdir(), "silvermoon-config-v1-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, ".silvermoon"));
  await writeFile(join(root, ".silvermoon", "config.yaml"), source);
  return root;
}

test("loads canonical version 1 configuration from the fixed metadata path", async () => {
  const source = `version: 1
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`;
  const loaded = await loadConfig({ root: await writeConfig(source) });

  assert.deepEqual(loaded.diagnostics, []);
  assert.deepEqual(loaded.config, {
    version: 1,
    primaryRepository: "https://example.com/owner/repository.git",
    primaryBranch: "main",
  });
  assert.equal(serializeConfig(loaded.config), source);
});

test("rejects ideasDirectory and ignores previous layouts", async () => {
  const root = await writeConfig(`version: 1
ideasDirectory: project/ideas
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`);
  const loaded = await loadConfig({ root });
  assert.equal(loaded.config, null);
  assert.equal(loaded.diagnostics[0].code, "config.unknown-key");

  for (const legacy of ["silvermoon.yaml", "repoledger.yaml"]) {
    const legacyRoot = await mkdtemp(join(tmpdir(), "silvermoon-config-legacy-"));
    temporaryDirectories.push(legacyRoot);
    await writeFile(
      join(legacyRoot, legacy),
      "version: 1\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
    );
    const ignored = await loadConfig({ root: legacyRoot });
    assert.equal(ignored.config, null);
    assert.equal(ignored.diagnostics[0].code, "config.missing");
    assert.equal(ignored.diagnostics[0].path, ".silvermoon/config.yaml");
  }
});

test("rejects symlinked metadata roots and configuration files", async (context) => {
  if (process.platform === "win32") {
    context.skip("Windows symlink creation requires privileges unavailable in standard CI");
    return;
  }
  const root = await mkdtemp(join(tmpdir(), "silvermoon-config-symlink-"));
  const target = await mkdtemp(join(tmpdir(), "silvermoon-config-target-"));
  temporaryDirectories.push(root, target);
  await writeFile(
    join(target, "config.yaml"),
    "version: 1\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );
  await symlink(target, join(root, ".silvermoon"), "dir");

  const loaded = await loadConfig({ root });
  assert.equal(loaded.config, null);
  assert.equal(loaded.diagnostics[0].code, "config.invalid-file");
});

test("rejects unsupported versions, unknown keys, and noncanonical order", async () => {
  const fixtures = [
    `version: 2
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`,
    `version: 1
tasksDirectory: tasks
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`,
    `primaryRepository: https://example.com/owner/repository.git
version: 1
primaryBranch: main
`,
  ];
  for (const source of fixtures) {
    const loaded = await loadConfig({ root: await writeConfig(source) });
    assert.equal(loaded.config, null, source);
  }
});

test("keeps the version 1 schema aligned with runtime identity constraints", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../schema/v1.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(schema.$defs.ideaStatus.required, ["version", "id"]);
  assert.equal(Object.hasOwn(schema.properties, "ideasDirectory"), false);
  assert.equal(Object.hasOwn(schema.$defs, "ideasDirectory"), false);
  const repositoryPattern = new RegExp(schema.$defs.repository.pattern);
  for (const repository of [
    "https://example.com/owner/repository.git",
    "https://example.com:8443/Owner/Repository",
  ]) {
    assert.equal(repositoryPattern.test(repository), true, repository);
    assert.equal(validRepository(repository), true, repository);
  }
  for (const repository of [
    "http://example.com/owner/repository.git",
    "https://EXAMPLE.com/owner/repository.git",
    "https://example.com/owner/../repository.git",
  ]) {
    assert.equal(repositoryPattern.test(repository), false, repository);
    assert.equal(validRepository(repository), false, repository);
  }

  const ulidPattern = new RegExp(schema.$defs.ulid.pattern);
  for (const value of ["01M36QGPNTXEPP61DA4KP4AVZF", "01M36QGPNTXEPP61DA4KP4AVG0"]) {
    assert.equal(ulidPattern.test(value), true, value);
    assert.equal(isValidUlid(value), true, value);
  }
  const objectIdPattern = new RegExp(schema.$defs.objectId.pattern);
  assert.equal(objectIdPattern.test("a".repeat(40)), true);
  assert.equal(objectIdPattern.test("a".repeat(64)), true);
  assert.equal(objectIdPattern.test("A".repeat(40)), false);
});
