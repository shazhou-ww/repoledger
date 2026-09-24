import assert from "node:assert/strict";
import { test } from "node:test";

import * as silvermoon from "../../src/index.js";

test("does not expose the removed criteria evidence contract", () => {
  assert.equal(Object.hasOwn(silvermoon, "implementationCriterionIds"), false);
  assert.equal(Object.hasOwn(silvermoon, "verifyCriteriaEvidence"), false);
});
