import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { parseDocument } from "yaml";

const packageUrl = new URL("../../package.json", import.meta.url);
const workflowUrl = new URL("../../.github/workflows/ci.yml", import.meta.url);

function step(job, name) {
  return job.steps.find((candidate) => candidate.name === name);
}

test("runs fast layered validation in ordinary CI", async () => {
  const [manifestSource, workflowSource] = await Promise.all([
    readFile(packageUrl, "utf8"),
    readFile(workflowUrl, "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  const document = parseDocument(workflowSource);
  assert.deepEqual(document.errors, []);

  assert.equal(
    manifest.scripts.test,
    "npm run test:unit && npm run test:contract",
  );
  assert.equal(
    manifest.scripts.check,
    "npm run check:quick && npm run test:integration && npm run pack:check && npm run test:e2e && npm run check:skills",
  );

  const workflow = document.toJS();
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ["contract", "integration", "unit"]);

  const { unit, contract, integration } = workflow.jobs;
  assert.deepEqual(unit.strategy.matrix, {
    os: ["ubuntu-latest", "windows-latest", "macos-latest"],
    node: [22, 24],
  });
  assert.equal(step(unit, "Validate CLI syntax").run, "node --check bin/silvermoon.js");
  assert.equal(step(unit, "Run unit tests").run, "pnpm test:unit");

  assert.equal(contract["runs-on"], "ubuntu-latest");
  assert.equal(step(contract, "Set up Node.js").with["node-version"], 24);
  assert.equal(step(contract, "Run contract tests").run, "pnpm test:contract");
  assert.equal(step(contract, "Discover skills").run, "pnpm check:skills");

  assert.equal(integration["runs-on"], "ubuntu-latest");
  assert.equal(step(integration, "Set up Node.js").with["node-version"], 24);
  assert.equal(
    step(integration, "Run integration tests").run,
    "pnpm test:integration",
  );

  assert.doesNotMatch(workflowSource, /test:e2e|pack:check|pnpm check(?:\s|$)/m);
});
