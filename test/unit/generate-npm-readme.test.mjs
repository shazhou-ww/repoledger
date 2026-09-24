import assert from "node:assert/strict";
import { test } from "node:test";

import { generateNpmReadme } from "../../scripts/generate-npm-readme.mjs";

const commit = "a".repeat(40);

test("rewrites raw.githubusercontent.com main refs to the release commit", () => {
  const source =
    '![logo](https://raw.githubusercontent.com/shazhou-ww/silvermoon/main/assets/silvermoon.svg)';
  const output = generateNpmReadme({ source, commit });
  assert.equal(
    output,
    `![logo](https://raw.githubusercontent.com/shazhou-ww/silvermoon/${commit}/assets/silvermoon.svg)`,
  );
});

test("rewrites Markdown relative links to immutable blob URLs", () => {
  const source = "[Getting Started](./docs/getting-started.md)";
  assert.equal(
    generateNpmReadme({ source, commit }),
    `[Getting Started](https://github.com/shazhou-ww/silvermoon/blob/${commit}/docs/getting-started.md)`,
  );
});

test("rewrites HTML relative hrefs to immutable blob URLs", () => {
  const source = '<a href="./README.zh-CN.md">简体中文</a>';
  assert.equal(
    generateNpmReadme({ source, commit }),
    `<a href="https://github.com/shazhou-ww/silvermoon/blob/${commit}/README.zh-CN.md">简体中文</a>`,
  );
});

test("preserves fragment identifiers on rewritten relative links", () => {
  const source = [
    "[Section](./docs/reference.md#cli)",
    '<a href="./docs/operations.md#publish">Publish</a>',
  ].join("\n");
  const output = generateNpmReadme({ source, commit });
  assert.equal(
    output,
    [
      `[Section](https://github.com/shazhou-ww/silvermoon/blob/${commit}/docs/reference.md#cli)`,
      `<a href="https://github.com/shazhou-ww/silvermoon/blob/${commit}/docs/operations.md#publish">Publish</a>`,
    ].join("\n"),
  );
});

test("is deterministic for the same source and commit", () => {
  const source = [
    "https://raw.githubusercontent.com/shazhou-ww/silvermoon/main/assets/silvermoon.svg",
    "[Docs](./docs/getting-started.md)",
    '<a href="./README.zh-CN.md">zh</a>',
  ].join("\n");
  assert.equal(
    generateNpmReadme({ source, commit }),
    generateNpmReadme({ source, commit }),
  );
});

test("rejects malformed release commits", () => {
  assert.throws(
    () => generateNpmReadme({ source: "# ok", commit: "abc" }),
    /full hexadecimal Git object ID/,
  );
  assert.throws(
    () => generateNpmReadme({ source: "# ok", commit: "g".repeat(40) }),
    /full hexadecimal Git object ID/,
  );
  assert.throws(
    () => generateNpmReadme({ source: "# ok", commit: undefined }),
    /full hexadecimal Git object ID/,
  );
});

test("fails closed on unrecognized relative repository links", () => {
  assert.throws(
    () => generateNpmReadme({ source: "[Docs](docs/getting-started.md)", commit }),
    /Unrecognized relative repository Markdown link/,
  );
  assert.throws(
    () => generateNpmReadme({ source: '<img src="./assets/silvermoon.svg">', commit }),
    /Unrecognized relative repository HTML reference/,
  );
  assert.throws(
    () => generateNpmReadme({ source: "[Up](../package.json)", commit }),
    /Unrecognized relative repository Markdown link/,
  );
});

test("does not mutate the provided source string", () => {
  const source =
    "See [Getting Started](./docs/getting-started.md) and https://raw.githubusercontent.com/shazhou-ww/silvermoon/main/assets/silvermoon.svg";
  const snapshot = source.slice();
  generateNpmReadme({ source, commit });
  assert.equal(source, snapshot);
});

test("fails closed on empty source instead of emitting an empty README", () => {
  for (const source of ["", "   \n\t \n"]) {
    assert.throws(
      () => generateNpmReadme({ source, commit }),
      /README source is empty/,
    );
  }
});
