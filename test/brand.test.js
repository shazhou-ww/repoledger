import assert from "node:assert/strict";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const previousBrand = ["repo", "ledger"].join("");

async function currentFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "ideas", "node_modules"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await currentFiles(path)));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

test("keeps previous-brand references confined to explicit rejection tests", async () => {
  const occurrences = [];
  for (const path of await currentFiles(repositoryRoot)) {
    const repositoryPath = relative(repositoryRoot, path).replaceAll("\\", "/");
    assert.equal(repositoryPath.toLowerCase().includes(previousBrand), false, repositoryPath);
    if (!(await lstat(path)).isFile()) continue;
    const source = await readFile(path, "utf8");
    const matches = source.toLowerCase().matchAll(new RegExp(previousBrand, "g"));
    for (const match of matches) {
      occurrences.push({ path: repositoryPath, offset: match.index });
    }
  }

  assert.deepEqual(
    occurrences.map(({ path }) => path),
    ["scripts/smoke-pack.js", "test/config-v1.test.js"],
  );
});
