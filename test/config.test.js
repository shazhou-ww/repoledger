import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { DEFAULT_CONFIG_NAME, loadConfig } from "../src/config.js";
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
  const root = await mkdtemp(join(tmpdir(), "repoledger-config-"));
  temporaryDirectories.push(root);
  await writeFile(join(root, DEFAULT_CONFIG_NAME), source);
  return root;
}

test("loads the strict versioned YAML configuration", async () => {
  const root = await writeConfig(`version: 2
tasksDirectory: tasks
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`);

  const loaded = await loadConfig({ root });

  assert.deepEqual(loaded.diagnostics, []);
  assert.deepEqual(loaded.config, {
    version: 2,
    tasksDirectory: "tasks",
    primaryRepository: "https://example.com/owner/repository.git",
    primaryBranch: "main",
  });
  assert.equal(DEFAULT_CONFIG_NAME, "repoledger.yaml");
});

test("requires every property and rejects unknown properties", async () => {
  const root = await writeConfig(`version: 2
tasksDirectory: tasks
extra: true
`);

  const loaded = await loadConfig({ root });
  const codes = loaded.diagnostics.map(({ code }) => code);

  assert.equal(loaded.config, null);
  assert.ok(codes.includes("config.missing-primary-repository"));
  assert.ok(codes.includes("config.missing-primary-branch"));
  assert.ok(codes.includes("config.unknown-key"));
});

test("requires migration for the clone-local version 1 remote contract", async () => {
  const root = await writeConfig(`version: 1
tasksDirectory: tasks
remote: origin
primaryBranch: main
`);

  const loaded = await loadConfig({ root });

  assert.equal(loaded.config, null);
  assert.equal(loaded.diagnostics[0].code, "config.migration-required");
});

test("rejects unsupported YAML features and duplicate keys", async () => {
  const fixtures = [
    `version: 2\nversion: 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n`,
    `version: &version 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n`,
    `version: 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main # comment\n`,
    `%YAML 1.2\n---\nversion: 2\ntasksDirectory: tasks\nprimaryRepository: https://example.com/owner/repository.git\nprimaryBranch: main\n`,
  ];

  for (const source of fixtures) {
    const root = await writeConfig(source);
    const loaded = await loadConfig({ root });
    assert.equal(loaded.config, null, source);
    assert.ok(
      loaded.diagnostics.some(({ code }) => code === "config.invalid-yaml"),
      source,
    );
  }
});

test("validates version, safe paths, repository URLs, and primary branches", async () => {
  const root = await writeConfig(`version: 3
tasksDirectory: ../tasks
primaryRepository: https://token@example.com/owner/repository.git
primaryBranch: refs/heads/main
`);

  const loaded = await loadConfig({ root });
  const codes = loaded.diagnostics.map(({ code }) => code);

  assert.equal(loaded.config, null);
  assert.ok(codes.includes("config.unsupported-version"));
  assert.ok(codes.includes("config.invalid-tasks-directory"));
  assert.ok(codes.includes("config.invalid-primary-repository"));
  assert.ok(codes.includes("config.invalid-primary-branch"));
});

test("rejects noncanonical and unsafe repository URLs", async () => {
  const repositories = [
    "http://example.com/owner/repository.git",
    "https://example.com/owner/repository.git/",
    "https://EXAMPLE.com/owner/repository.git",
    "https://example.com/owner/../repository.git",
    "https://example.com/owner%2Frepository.git",
    "https://example.com/owner/repository.git?token=secret",
    "git@example.com:owner/repository.git",
  ];

  for (const repository of repositories) {
    const root = await writeConfig(`version: 2
tasksDirectory: tasks
primaryRepository: ${repository}
primaryBranch: main
`);
    const loaded = await loadConfig({ root });
    assert.equal(loaded.config, null, repository);
    assert.ok(
      loaded.diagnostics.some(({ code }) => code === "config.invalid-primary-repository"),
      repository,
    );
  }
});

test("keeps schema repository URL constraints aligned with runtime validation", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../schema/v2.json", import.meta.url), "utf8"),
  );
  const pattern = new RegExp(schema.$defs.repository.pattern);
  const accepted = [
    "https://example.com/owner/repository.git",
    "https://example.com:8443/Owner/Repository",
  ];
  const rejected = [
    "https://EXAMPLE.com/owner/repository.git",
    "https://example.com/owner/../repository.git",
    "https://example.com/owner/%2E%2E/repository.git",
    "https://example.com:443/owner/repository.git",
    "https://invalid_host/owner/repository.git",
    "https://example.com/owner//repository.git",
  ];

  for (const repository of accepted) {
    assert.equal(pattern.test(repository), true, repository);
    assert.equal(validRepository(repository), true, repository);
  }
  for (const repository of rejected) {
    assert.equal(pattern.test(repository), false, repository);
    assert.equal(validRepository(repository), false, repository);
  }
});

test("rejects noncanonical YAML", async () => {
  const root = await writeConfig(`primaryRepository: https://example.com/owner/repository.git
version: 2
tasksDirectory: tasks
primaryBranch: main
`);

  const loaded = await loadConfig({ root });

  assert.equal(loaded.config, null);
  assert.equal(loaded.diagnostics[0].code, "config.noncanonical");
});

test("rejects a tasks directory beneath a symlinked segment", async () => {
  const root = await writeConfig(`version: 2
tasksDirectory: linked/tasks
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
`);
  const outside = await mkdtemp(join(tmpdir(), "repoledger-config-outside-"));
  temporaryDirectories.push(outside);
  await mkdir(join(outside, "tasks"));
  await symlink(
    outside,
    join(root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const loaded = await loadConfig({ root });

  assert.equal(loaded.config, null);
  assert.ok(
    loaded.diagnostics.some(({ code }) => code === "config.invalid-tasks-directory"),
  );
});
