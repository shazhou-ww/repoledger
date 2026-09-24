import assert from "node:assert/strict";
import { test } from "node:test";

import { ideaPaths } from "../../src/layout.js";
import { stateAction } from "../../src/whatsnext.js";

const id = "01M36QGPNTXEPP61DA4KP4AVZF";

test("maps every derived state to one deterministic action", () => {
  const paths = ideaPaths(id);
  const idea = {
    id,
    alias: "fixture",
    idealRevision: "a".repeat(40),
    implementationRevision: "b".repeat(40),
    deploymentRevision: "c".repeat(40),
    revisions: {
      idealRevision: "a".repeat(40),
      implementationRevision: "b".repeat(40),
      deploymentRevision: "c".repeat(40),
    },
    relativePath: paths.ideaPath,
    statusPath: paths.statusPath,
    ledgerPath: paths.ledgerPath,
    worlds: {
      idealRevision: {
        name: "Ideal World",
        displayName: "道心",
        path: paths.idealPath,
        documentPath: paths.ideaDocumentPath,
      },
      implementationRevision: {
        name: "Inner World",
        displayName: "内景",
        path: paths.innerPath,
        documentPath: paths.implementationDocumentPath,
      },
      deploymentRevision: {
        name: "Outer World",
        displayName: "现世",
        path: paths.outerPath,
        documentPath: paths.deploymentDocumentPath,
      },
    },
  };
  const expected = new Map([
    ["preparing", "prepare-idea"],
    ["implementing", "implement-idea"],
    ["deploying", "deploy-idea"],
    ["completed", "review-completed"],
    ["abandoned", "review-abandoned"],
  ]);
  for (const [state, code] of expected) {
    assert.equal(stateAction({ ...idea, state }).code, code);
  }
  const preparing = stateAction({ ...idea, state: "preparing" });
  assert.match(preparing.message, /Ideal World \(道心\)/);
  assert.equal(preparing.details.ledgerPath, paths.ledgerPath);
  assert.equal(preparing.details.world.nestedWorldPath, undefined);
  const implementing = stateAction({ ...idea, state: "implementing" });
  assert.match(implementing.message, /Inner World \(内景\)/);
  assert.equal(implementing.details.ledgerPath, paths.ledgerPath);
  assert.equal(implementing.details.world.nestedWorldPath, paths.idealPath);
  assert.match(implementing.details.world.cascade, /return to preparing/);
  const deploying = stateAction({ ...idea, state: "deploying" });
  assert.match(deploying.message, /Outer World \(现世\)/);
  assert.equal(deploying.details.ledgerPath, paths.ledgerPath);
  assert.equal(deploying.details.world.nestedWorldPath, paths.innerPath);
  assert.match(deploying.details.world.cascade, /deployment acceptance only/);
});
