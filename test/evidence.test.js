import assert from "node:assert/strict";
import { test } from "node:test";

import {
  implementationCriterionIds,
  verifyCriteriaEvidence,
} from "../src/evidence.js";

const idea = `# Fixture

## Implementation acceptance criteria

- **I01 First:** First condition.
- **I02 Second:** Second condition.

## Deployment acceptance criteria

- **D01 Deploy:** Deployment condition.
`;
const revision = "a".repeat(40);

test("extracts ordered implementation criterion ids from Markdown", () => {
  assert.deepEqual(implementationCriterionIds(idea), ["I01", "I02"]);
});

test("accepts one or more typed evidence locators for every criterion", () => {
  const report = verifyCriteriaEvidence(idea, {
    implementationRevision: revision,
    criteriaEvidence: [
      { criterion: "I01", evidence: [{ type: "test", locator: "unit:first" }] },
      {
        criterion: "I02",
        evidence: [
          { type: "check", locator: "pnpm check" },
          { type: "artifact", locator: "artifacts/result.json" },
        ],
      },
    ],
  }, revision);

  assert.deepEqual(report, { ok: true, diagnostics: [] });
});

test("rejects missing, reordered, or empty criterion evidence", () => {
  for (const artifact of [
    {
      implementationRevision: revision,
      criteriaEvidence: [{ criterion: "I01", evidence: [{ type: "test", locator: "x" }] }],
    },
    {
      implementationRevision: revision,
      criteriaEvidence: [
        { criterion: "I02", evidence: [{ type: "test", locator: "x" }] },
        { criterion: "I01", evidence: [{ type: "test", locator: "y" }] },
      ],
    },
    {
      implementationRevision: revision,
      criteriaEvidence: [
        { criterion: "I01", evidence: [] },
        { criterion: "I02", evidence: [{ type: "test", locator: "x" }] },
      ],
    },
  ]) {
    const report = verifyCriteriaEvidence(idea, artifact, revision);
    assert.equal(report.ok, false);
    assert.ok(report.diagnostics.some(({ code }) => code === "criteria.evidence.missing"));
  }
});

test("missing evidence trajectory performs no status write or push", () => {
  const artifact = {
    implementationRevision: revision,
    criteriaEvidence: [
      { criterion: "I01", evidence: [{ type: "test", locator: "unit:first" }] },
    ],
  };
  const events = [];

  const report = verifyCriteriaEvidence(idea, artifact, revision);
  if (report.ok) {
    events.push("status-write", "push");
  }

  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.some(({ code }) => code === "criteria.evidence.missing"));
  assert.deepEqual(events, []);
});

test("rejects evidence bound to a stale Inner World revision", () => {
  const artifact = {
    implementationRevision: "b".repeat(40),
    criteriaEvidence: [
      { criterion: "I01", evidence: [{ type: "test", locator: "unit:first" }] },
      { criterion: "I02", evidence: [{ type: "test", locator: "unit:second" }] },
    ],
  };
  const report = verifyCriteriaEvidence(idea, artifact, revision);
  assert.equal(report.ok, false);
  assert.ok(
    report.diagnostics.some(({ code }) => code === "criteria.evidence.revision-mismatch"),
  );
});