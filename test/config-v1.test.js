import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  await writeFile(join(root, "silvermoon.yaml"), source);
  return root;
}

test("loads canonical version 1 configuration with the default ideas directory", async () => {
  const source = `version: 1
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`;
  const loaded = await loadConfig({ root: await writeConfig(source) });

  assert.deepEqual(loaded.diagnostics, []);
  assert.deepEqual(loaded.config, {
    version: 1,
    ideasDirectory: "ideas",
    primaryRepository: "https://example.com/owner/repository.git",
    primaryBranch: "main",
  });
  assert.equal(
    serializeConfig(loaded.config),
    `version: 1
ideasDirectory: ideas
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`,
  );
});

test("loads an explicit canonical ideas directory", async () => {
  const source = `version: 1
ideasDirectory: project/ideas
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`;
  const loaded = await loadConfig({ root: await writeConfig(source) });

  assert.deepEqual(loaded.diagnostics, []);
  assert.equal(loaded.config.ideasDirectory, "project/ideas");
});

test("treats a repository with only the previous product config as unconfigured", async () => {
  const root = await mkdtemp(join(tmpdir(), "silvermoon-config-previous-product-"));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, "repoledger.yaml"),
    "version: 3\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n",
  );

  const loaded = await loadConfig({ root });

  assert.equal(loaded.config, null);
  assert.equal(loaded.diagnostics[0].code, "config.missing");
  assert.equal(loaded.diagnostics[0].path, "silvermoon.yaml");
});

test("rejects unsupported Silvermoon configuration versions", async () => {
  for (const version of [0, 2, 3]) {
    const root = await writeConfig(`version: ${version}\ntasksDirectory: tasks\n`);
    const loaded = await loadConfig({ root });
    assert.equal(loaded.config, null);
    assert.equal(
      loaded.diagnostics.some(({ code }) => code === "config.unsupported-version"),
      true,
    );
  }
});

test("rejects invalid version 1 paths, unknown keys, and noncanonical order", async () => {
  const fixtures = [
    `version: 1\nideasDirectory: ../ideas\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n`,
    `version: 1\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n`,
    `primaryRepository: https://example.com/owner/repository.git\nversion: 1\nprimaryBranch: main\n`,
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