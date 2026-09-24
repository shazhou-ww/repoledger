import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveIdeaState,
  isValidUlid,
  parseIdeaStatus,
  serializeIdeaStatus,
} from "../../src/ideas.js";

const id = "01M36QGPNTXEPP61DA4KP4AVZF";
const revision = "0123456789abcdef0123456789abcdef01234567";
const innerRevision = "1123456789abcdef0123456789abcdef01234567";
const outerRevision = "2123456789abcdef0123456789abcdef01234567";
const revisions = {
  idealRevision: revision,
  implementationRevision: innerRevision,
  deploymentRevision: outerRevision,
};

test("parses and serializes canonical idea status YAML", () => {
  const source = `version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
language: zh-CN
approvedRevision: 0123456789abcdef0123456789abcdef01234567
implementationAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
`;

  const status = {
    version: 1,
    id,
    alias: "publish-documentation",
    language: "zh-CN",
    approvedRevision: revision,
    implementationAcceptedRevision: revision,
  };
  assert.deepEqual(parseIdeaStatus(source, { objectIdLength: 40 }), status);
  assert.equal(serializeIdeaStatus(status, { objectIdLength: 40 }), source);
});

test("parses and serializes canonical status without an alias", () => {
  const source = `version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
`;
  const status = { version: 1, id };

  assert.deepEqual(parseIdeaStatus(source), status);
  assert.equal(serializeIdeaStatus(status), source);
  assert.throws(
    () => serializeIdeaStatus({ ...status, alias: "" }),
    /alias/i,
  );
});

test("validates canonical ULIDs and idea status fields", () => {
  assert.equal(isValidUlid(id), true);
  for (const invalid of [
    id.toLowerCase(),
    `8${id.slice(1)}`,
    `${id.slice(0, -1)}I`,
    id.slice(1),
  ]) {
    assert.equal(isValidUlid(invalid), false);
  }

  const valid = { version: 1, id, alias: "发布文档" };
  assert.doesNotThrow(() => serializeIdeaStatus(valid));
  for (const invalid of [
    { ...valid, version: 2 },
    { ...valid, alias: " leading" },
    { ...valid, alias: "line\nbreak" },
    { ...valid, language: "zh-cn" },
    { ...valid, language: "en_US" },
    { ...valid, abandoned: false },
    { ...valid, approvedRevision: "a" },
    { ...valid, approvedRevision: revision.toUpperCase() },
    { ...valid, approvedRevision: revision.slice(1) },
    { ...valid, state: "preparing" },
  ]) {
    assert.throws(
      () => serializeIdeaStatus(invalid, { objectIdLength: 40 }),
      /idea status/i,
    );
  }
});

test("rejects schema-invalid object IDs without repository context", () => {
  const status = {
    version: 1,
    id,
    alias: "publish-documentation",
    approvedRevision: "a",
    implementationAcceptedRevision: "a",
    deploymentAcceptedRevision: "a",
  };

  assert.throws(() => serializeIdeaStatus(status), /Git object ID/);
  assert.throws(() => deriveIdeaState({ ...revisions, idealRevision: "a" }, status), /Git object ID/);
});

test("rejects noncanonical and unsupported status YAML", () => {
  const fixtures = [
    `id: ${id}\nversion: 1\nalias: publish-documentation\n`,
    `version: 1\nid: ${id}\nalias: publish-documentation\nabandoned: false\n`,
    `version: 1\nid: ${id}\nalias: publish-documentation # comment\n`,
  ];
  for (const source of fixtures) {
    assert.throws(() => parseIdeaStatus(source), /idea status/i);
  }
});

test("derives idea state from ordered acceptance facts", () => {
  const base = { version: 1, id, alias: "publish-documentation" };
  assert.equal(deriveIdeaState(revisions, base), "preparing");
  assert.equal(
    deriveIdeaState(revisions, { ...base, approvedRevision: revision }),
    "implementing",
  );
  assert.equal(
    deriveIdeaState(revisions, {
      ...base,
      approvedRevision: revision,
      implementationAcceptedRevision: innerRevision,
    }),
    "deploying",
  );
  assert.equal(
    deriveIdeaState(revisions, {
      ...base,
      approvedRevision: revision,
      implementationAcceptedRevision: innerRevision,
      deploymentAcceptedRevision: outerRevision,
    }),
    "completed",
  );
  assert.equal(
    deriveIdeaState(revisions, {
      ...base,
      abandoned: true,
      approvedRevision: revision,
      implementationAcceptedRevision: innerRevision,
      deploymentAcceptedRevision: outerRevision,
    }),
    "abandoned",
  );
});

test("cascades world changes through ordered lifecycle states", () => {
  const completed = {
    version: 1,
    id,
    approvedRevision: revision,
    implementationAcceptedRevision: innerRevision,
    deploymentAcceptedRevision: outerRevision,
  };
  assert.equal(
    deriveIdeaState({ ...revisions, idealRevision: "a".repeat(40) }, completed),
    "preparing",
  );
  assert.equal(
    deriveIdeaState(
      { ...revisions, implementationRevision: "b".repeat(40) },
      completed,
    ),
    "implementing",
  );
  assert.equal(
    deriveIdeaState({ ...revisions, deploymentRevision: "c".repeat(40) }, completed),
    "deploying",
  );
});