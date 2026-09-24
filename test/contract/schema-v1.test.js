import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { isValidUlid } from "../../src/ideas.js";
import { validRepository } from "../../src/repository.js";

async function readSchema(name) {
  return JSON.parse(
    await readFile(new URL(`../../schema/v1/${name}.schema.json`, import.meta.url), "utf8"),
  );
}

async function validators() {
  const [definitions, config, ideaStatus, userConfig] = await Promise.all([
    readSchema("definitions"),
    readSchema("config"),
    readSchema("idea-status"),
    readSchema("user-config"),
  ]);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    formats: { uri: true },
  });
  ajv.addSchema(definitions);
  return {
    config: ajv.compile(config),
    definitions,
    ideaStatus: ajv.compile(ideaStatus),
    userConfig: ajv.compile(userConfig),
  };
}

test("publishes independently compilable version 1 schema entrypoints", async () => {
  const { config, definitions, ideaStatus, userConfig } = await validators();

  assert.equal(
    config({
      version: 1,
      primaryRepository: "https://example.com/owner/repository.git",
      primaryBranch: "main",
      preferredLanguage: "zh-CN",
    }),
    true,
    JSON.stringify(config.errors),
  );
  assert.equal(
    ideaStatus({
      version: 1,
      id: "01M36QGPNTXEPP61DA4KP4AVZF",
      alias: "publish-documentation",
      language: "zh-CN",
      approvedRevision: "a".repeat(40),
      implementationAcceptedRevision: "b".repeat(64),
    }),
    true,
    JSON.stringify(ideaStatus.errors),
  );
  assert.equal(
    userConfig({ version: 1, preferredLanguage: "zh-CN" }),
    true,
    JSON.stringify(userConfig.errors),
  );

  assert.equal(Object.hasOwn(definitions.$defs, "ideasDirectory"), false);
});

test("rejects invalid repository configuration through its public schema", async () => {
  const { config } = await validators();
  const valid = {
    version: 1,
    primaryRepository: "https://example.com/owner/repository.git",
    primaryBranch: "main",
  };
  for (const candidate of [
    { ...valid, version: 2 },
    { version: 1, primaryRepository: valid.primaryRepository },
    { ...valid, primaryRepository: "http://example.com/owner/repository.git" },
    { ...valid, primaryBranch: "refs/heads/main" },
    { ...valid, preferredLanguage: "zh-cn" },
    { ...valid, ideasDirectory: "ideas" },
  ]) {
    assert.equal(config(candidate), false, JSON.stringify(candidate));
  }
});

test("rejects invalid idea status through its public schema", async () => {
  const { ideaStatus } = await validators();
  const valid = {
    version: 1,
    id: "01M36QGPNTXEPP61DA4KP4AVZF",
  };
  for (const candidate of [
    { version: 1 },
    { ...valid, version: 2 },
    { ...valid, id: valid.id.toLowerCase() },
    { ...valid, alias: " leading" },
    { ...valid, language: "zh-cn" },
    { ...valid, abandoned: false },
    { ...valid, approvedRevision: "a" },
    { ...valid, state: "preparing" },
  ]) {
    assert.equal(ideaStatus(candidate), false, JSON.stringify(candidate));
  }
});

test("rejects invalid user configuration through its public schema", async () => {
  const { userConfig } = await validators();
  for (const candidate of [
    {},
    { version: 2 },
    { version: 1, preferredLanguage: "zh-cn" },
    { version: 1, language: "zh-CN" },
  ]) {
    assert.equal(userConfig(candidate), false, JSON.stringify(candidate));
  }
});

test("keeps shared schema definitions aligned with runtime identity constraints", async () => {
  const { definitions } = await validators();
  const repositoryPattern = new RegExp(definitions.$defs.repository.pattern);
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

  const ulidPattern = new RegExp(definitions.$defs.ulid.pattern);
  for (const value of ["01M36QGPNTXEPP61DA4KP4AVZF", "01M36QGPNTXEPP61DA4KP4AVG0"]) {
    assert.equal(ulidPattern.test(value), true, value);
    assert.equal(isValidUlid(value), true, value);
  }

  const objectIdPattern = new RegExp(definitions.$defs.objectId.pattern);
  assert.equal(objectIdPattern.test("a".repeat(40)), true);
  assert.equal(objectIdPattern.test("a".repeat(64)), true);
  assert.equal(objectIdPattern.test("A".repeat(40)), false);
});
