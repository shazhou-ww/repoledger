import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalLanguage,
  resolveTaskLanguage,
  taskLanguageMetadata,
  validCanonicalLanguage,
} from "../src/language.js";

test("canonicalizes BCP 47 task languages", () => {
  assert.equal(canonicalLanguage("zh-cn"), "zh-CN");
  assert.equal(canonicalLanguage("EN-us"), "en-US");
  assert.equal(canonicalLanguage("iw"), "he");
});

test("rejects invalid task languages", () => {
  for (const value of [undefined, "", "en_US", "not a language", "x".repeat(256)]) {
    assert.equal(canonicalLanguage(value), null, String(value));
  }
});

test("recognizes only canonical persisted task languages", () => {
  assert.equal(validCanonicalLanguage("zh-CN"), true);
  assert.equal(validCanonicalLanguage("en"), true);
  assert.equal(validCanonicalLanguage("zh-cn"), false);
  assert.equal(validCanonicalLanguage("en_US"), false);
});

test("parses task language metadata with a legacy en fallback", () => {
  assert.deepEqual(taskLanguageMetadata("# Legacy\n\n## Goal\n"), {
    issues: [],
    language: "en",
    present: false,
  });
  assert.deepEqual(
    taskLanguageMetadata("# Task\n\nCreated: 2026-09-21\nLanguage: zh-CN\n\n## Goal\n"),
    { issues: [], language: "zh-CN", present: true },
  );
});

test("rejects invalid, duplicate, and misplaced task language metadata", () => {
  assert.deepEqual(
    taskLanguageMetadata("# Task\nLanguage: zh-cn\n\n## Goal\n"),
    { issues: ["invalid"], language: null, present: true },
  );
  assert.deepEqual(
    taskLanguageMetadata("# Task\nLanguage: en\nLanguage: zh-CN\n\n## Goal\n"),
    { issues: ["duplicate"], language: null, present: true },
  );
  assert.deepEqual(
    taskLanguageMetadata("# Task\n\n## Goal\n\nLanguage: en\n"),
    { issues: ["misplaced"], language: null, present: true },
  );
});

test("resolves override, project, preference, and default task-language precedence", () => {
  assert.deepEqual(
    resolveTaskLanguage({
      override: "fr-fr",
      project: "de",
      preference: "zh-CN",
    }),
    { language: "fr-FR", source: "override" },
  );
  assert.deepEqual(
    resolveTaskLanguage({ project: "de", preference: "zh-CN" }),
    { language: "de", source: "project" },
  );
  assert.deepEqual(resolveTaskLanguage({ preference: "zh-CN" }), {
    language: "zh-CN",
    source: "preference",
  });
  assert.deepEqual(resolveTaskLanguage(), {
    language: "en",
    source: "default",
  });
  assert.equal(resolveTaskLanguage({ override: "en_US" }), null);
  assert.equal(resolveTaskLanguage({ project: "en_US" }), null);
});