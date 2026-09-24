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

test("extracts ordered implementation criterion ids from Markdown", () => {
  assert.deepEqual(implementationCriterionIds(idea), ["I01", "I02"]);
});

test("accepts one or more typed evidence locators for every criterion", () => {
  const report = verifyCriteriaEvidence(idea, {
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
  });

  assert.deepEqual(report, { ok: true, diagnostics: [] });
});

test("rejects missing, reordered, or empty criterion evidence", () => {
  for (const artifact of [
    { criteriaEvidence: [{ criterion: "I01", evidence: [{ type: "test", locator: "x" }] }] },
    {
      criteriaEvidence: [
        { criterion: "I02", evidence: [{ type: "test", locator: "x" }] },
        { criterion: "I01", evidence: [{ type: "test", locator: "y" }] },
      ],
    },
    {
      criteriaEvidence: [
        { criterion: "I01", evidence: [] },
        { criterion: "I02", evidence: [{ type: "test", locator: "x" }] },
      ],
    },
  ]) {
    const report = verifyCriteriaEvidence(idea, artifact);
    assert.equal(report.ok, false);
    assert.ok(report.diagnostics.some(({ code }) => code === "criteria.evidence.missing"));
  }
});

test("missing evidence trajectory performs no status write or push", () => {
  const artifact = {
    criteriaEvidence: [
      { criterion: "I01", evidence: [{ type: "test", locator: "unit:first" }] },
    ],
  };
  const events = [];

  const report = verifyCriteriaEvidence(idea, artifact);
  if (report.ok) {
    events.push("status-write", "push");
  }

  assert.equal(report.ok, false);
  assert.ok(report.diagnostics.some(({ code }) => code === "criteria.evidence.missing"));
  assert.deepEqual(events, []);
});