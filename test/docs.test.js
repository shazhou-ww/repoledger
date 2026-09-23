import assert from "node:assert/strict";
import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

function links(node, result = []) {
  if (node.type === "link") result.push(node.url);
  for (const child of node.children ?? []) links(child, result);
  return result;
}

test("keeps repository-local Markdown links resolvable", async () => {
  for (const path of await markdownFiles(repositoryRoot)) {
    const source = await readFile(path, "utf8");
    for (const url of links(fromMarkdown(source))) {
      if (/^(?:[a-z]+:|#)/i.test(url)) continue;
      const target = decodeURIComponent(url.split(/[?#]/, 1)[0]);
      const absolute = target.startsWith("/")
        ? resolve(repositoryRoot, target.slice(1))
        : resolve(dirname(path), target);
      await assert.doesNotReject(
        lstat(absolute),
        `${path} links to missing repository path ${url}`,
      );
    }
  }
});