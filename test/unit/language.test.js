import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalizeLanguageTag,
  DEFAULT_LANGUAGE,
  isCanonicalLanguageTag,
  resolveLanguage,
} from "../../src/language.js";

test("canonicalizes valid BCP 47 language tags", () => {
  assert.equal(canonicalizeLanguageTag("zh-cn"), "zh-CN");
  assert.equal(canonicalizeLanguageTag("EN-us"), "en-US");
  assert.equal(isCanonicalLanguageTag("zh-CN"), true);
  assert.equal(isCanonicalLanguageTag("zh-cn"), false);
});

test("rejects invalid or non-string language tags", () => {
  for (const value of ["", " zh-CN", "en_US", 42, null]) {
    assert.throws(() => canonicalizeLanguageTag(value), /language tag|BCP 47/);
    assert.equal(isCanonicalLanguageTag(value), false);
  }
});

test("resolves language from the most specific configured layer", () => {
  assert.deepEqual(
    resolveLanguage({ idea: "fr", project: "zh-CN", global: "de" }),
    { tag: "fr", source: "idea" },
  );
  assert.deepEqual(
    resolveLanguage({ project: "zh-CN", global: "de" }),
    { tag: "zh-CN", source: "project" },
  );
  assert.deepEqual(
    resolveLanguage({ global: "de" }),
    { tag: "de", source: "global" },
  );
  assert.deepEqual(
    resolveLanguage(),
    { tag: DEFAULT_LANGUAGE, source: "default" },
  );
});
