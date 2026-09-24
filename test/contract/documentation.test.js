import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const youtube = "https://www.youtube.com/watch?v=GJgezoCBIHM";
const bilibili = "https://www.bilibili.com/bangumi/play/ep1231558";
const reading = [
  "./docs/getting-started.md",
  "./docs/core-concepts.md",
  "./docs/operations.md",
  "./docs/reference.md",
  "./docs/maintaining.md",
];

test("keeps both READMEs reader-first and structurally aligned", async () => {
  const [english, chinese] = await Promise.all([
    readFile(resolve(repositoryRoot, "README.md"), "utf8"),
    readFile(resolve(repositoryRoot, "README.zh-CN.md"), "utf8"),
  ]);

  assert.ok(english.indexOf("## Quick Start") < english.indexOf("## Why Silvermoon"));
  assert.ok(chinese.indexOf("## 快速开始") < chinese.indexOf("## 为什么需要 Silvermoon"));
  assert.match(english, /\*\*The artifact spirit of the project\.\*\*/);
  assert.match(chinese, /\*\*项目的器灵。\*\*/);

  for (const source of [english, chinese]) {
    assert.match(source, /docs\/assets\/silvermoon\.svg/);
    assert.match(source, /docs\/assets\/silvermoon-avatar\.svg" width="128"/);
    assert.match(source, /<table>[\s\S]*silvermoon-avatar\.svg[\s\S]*<\/table>/);
    assert.doesNotMatch(
      source.match(/<table>[\s\S]*?<\/table>/)?.[0] ?? "",
      /youtube\.com|bilibili\.com/,
    );
    assert.ok(source.includes(youtube));
    assert.ok(source.includes(bilibili));
    for (const target of reading) assert.ok(source.includes(target), target);
  }
});

test("keeps the approved biography bounded and accurate", async () => {
  const [english, chinese] = await Promise.all([
    readFile(resolve(repositoryRoot, "README.md"), "utf8"),
    readFile(resolve(repositoryRoot, "README.zh-CN.md"), "utf8"),
  ]);
  const normalizedEnglish = english.replaceAll(/\s+/g, " ");
  const normalizedChinese = chinese.replaceAll(/\s+/g, "");

  for (const phrase of [
    "the Silvermoon Wolf Clan in the Spirit Realm",
    "one of the split souls of Ling Long",
    "wolf-headed jade scepter",
    "Bamboo Cloudswarm Swords",
  ]) {
    assert.ok(normalizedEnglish.includes(phrase), phrase);
  }
  for (const phrase of ["灵界的银月狼族", "玲珑公主", "狼首玉如意", "青竹蜂云剑"]) {
    assert.ok(normalizedChinese.includes(phrase), phrase);
  }
  assert.match(
    english,
    /- YouTube: \[Episode 150: Overseas Turmoil 26\]\([^)]+"A Record of a Mortal's Journey to Immortality — Episode 150: Overseas Turmoil 26"\)/,
  );
  assert.match(
    english,
    /- Bilibili: \[Episode 150: Overseas Turmoil 26\]/,
  );
  assert.match(chinese, /- YouTube：\[第 150 话：外海风云 26\]/);
  assert.match(chinese, /- 哔哩哔哩：\[第 150 话：外海风云 26\]/);
  assert.doesNotMatch(chinese, /share_source=/);
});

test("resolves repository-local links in reader documentation", async () => {
  const paths = [
    "README.md",
    "README.zh-CN.md",
    "docs/getting-started.md",
    "docs/core-concepts.md",
    "docs/operations.md",
    "docs/reference.md",
    "docs/maintaining.md",
  ];

  for (const path of paths) {
    const absolute = resolve(repositoryRoot, path);
    const source = await readFile(absolute, "utf8");
    for (const match of source.matchAll(/(?:src="|\[[^\]]+\]\()(\.?\.?\/[^)"#]+)(?:#[^)"\s]+)?/g)) {
      const target = resolve(dirname(absolute), match[1]);
      await assert.doesNotReject(() => readFile(target), `${path}: ${match[1]}`);
    }
  }
});
