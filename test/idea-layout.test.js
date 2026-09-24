import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { inspectIdeaLayout } from "../src/idea-layout.js";
import { serializeIdeaStatus } from "../src/ideas.js";

const temporaryDirectories = [];
const id = "01M36QGPNTXEPP61DA4KP4AVZF";

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "silvermoon-ideas-"));
  temporaryDirectories.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "silvermoon test");
  git(root, "config", "user.email", "silvermoon@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const folder = join(root, "ideas", id);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "Idea.md"), "# Publish documentation\n");
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({ version: 1, id, alias: "publish-documentation" }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Create idea");
  return root;
}

const config = {
  version: 1,
  ideasDirectory: "ideas",
  primaryRepository: "https://example.com/owner/repository.git",
  primaryBranch: "main",
};

test("inspects paired idea folders and derives their current tree revision", async () => {
  const root = await createRepository();
  const inspected = await inspectIdeaLayout({ config, root });

  assert.deepEqual(inspected.diagnostics, []);
  assert.equal(inspected.ideas.length, 1);
  assert.equal(inspected.ideas[0].id, id);
  assert.equal(inspected.ideas[0].state, "preparing");
  assert.equal(inspected.ideas[0].revision, git(root, "rev-parse", `HEAD:ideas/${id}`));
});

test("inspects an idea without inventing an alias", async () => {
  const root = await createRepository();
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({ version: 1, id }),
  );

  const inspected = await inspectIdeaLayout({ config, root });

  assert.deepEqual(inspected.diagnostics, []);
  assert.equal(Object.hasOwn(inspected.ideas[0], "alias"), false);
});

test("includes uncommitted idea content in the derived tree revision", async () => {
  const root = await createRepository();
  const original = git(root, "rev-parse", `HEAD:ideas/${id}`);
  await writeFile(join(root, "ideas", id, "Design.md"), "New definition\n");

  const inspected = await inspectIdeaLayout({ config, root });

  assert.equal(inspected.diagnostics.length, 0);
  assert.notEqual(inspected.ideas[0].revision, original);
});

test("treats idea-folder contents as an opaque Git tree", async () => {
  const root = await createRepository();
  const folder = join(root, "ideas", id);
  await rm(join(folder, "Idea.md"));
  await writeFile(join(folder, "Brief.md"), "Project-defined idea format\n");
  await writeFile(join(folder, "nested.status.yaml"), "Project-defined content\n");

  const inspected = await inspectIdeaLayout({ config, root });

  assert.deepEqual(inspected.diagnostics, []);
  assert.equal(inspected.ideas.length, 1);
});

test("rejects missing pairs, duplicate aliases, and mismatched status ids", async () => {
  const root = await createRepository();
  const second = "01M36QGPQ4H3R0K4N7Y6W2S8JC";
  await mkdir(join(root, "ideas", second));
  await writeFile(join(root, "ideas", second, "Idea.md"), "# Other\n");
  await writeFile(
    join(root, "ideas", `${second}.status.yaml`),
    serializeIdeaStatus({ version: 1, id, alias: "publish-documentation" }),
  );
  const orphan = "01M36QGPR4H3R0K4N7Y6W2S8JC";
  await mkdir(join(root, "ideas", orphan));

  const inspected = await inspectIdeaLayout({ config, root });
  const codes = inspected.diagnostics.map(({ code }) => code);

  assert.ok(codes.includes("idea.status.id-mismatch"));
  assert.ok(codes.includes("idea.alias.duplicate"));
  assert.ok(codes.includes("idea.pair.missing"));
});

test("validates acceptance revision evidence against primary history", async () => {
  const root = await createRepository();
  const revision = git(root, "rev-parse", `HEAD:ideas/${id}`);
  await writeFile(
    join(root, "ideas", `${id}.status.yaml`),
    serializeIdeaStatus({
      version: 1,
      id,
      alias: "publish-documentation",
      approvedRevision: revision,
    }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Approve idea");
  const commit = git(root, "rev-parse", "HEAD");

  const inspected = await inspectIdeaLayout({ config, historyCommit: commit, root });

  assert.deepEqual(inspected.diagnostics, []);
  assert.equal(inspected.ideas[0].state, "implementing");
});