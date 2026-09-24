import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import { createIdea } from "../src/create-idea.js";
import { observeGitCommands } from "../src/git.js";
import { serializeIdeaStatus } from "../src/ideas.js";
import { whatsNext } from "../src/whatsnext.js";

const temporaryDirectories = [];
const existingId = "01M36QGPNTXEPP61DA4KP4AVZF";
const createdId = "01M38K00000000000000000001";

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repositoryState(root, repository) {
  return {
    status: git(root, "status", "--porcelain=v2", "--untracked-files=all"),
    index: git(root, "ls-files", "--stage", "-z"),
    head: git(root, "rev-parse", "HEAD"),
    localRefs: git(root, "for-each-ref", "--format=%(refname) %(objectname)"),
    remoteRefs: git(root, "ls-remote", repository),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRepository() {
  const base = await mkdtemp(join(tmpdir(), "repoledger-create-idea-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "primary.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "repoledger test");
  git(root, "config", "user.email", "repoledger@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const repository = pathToFileURL(remote).href;
  await writeFile(join(root, "repoledger.yaml"), `version: 3
primaryRepository: https://example.test/owner/repository.git
primaryBranch: main
`);
  await mkdir(join(root, "ideas", existingId), { recursive: true });
  await writeFile(join(root, "ideas", existingId, "Idea.md"), "# Existing\n");
  await writeFile(
    join(root, "ideas", `${existingId}.status.yaml`),
    serializeIdeaStatus({ version: 1, id: existingId, alias: "existing" }),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Create fixture");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "push", repository, "main");
  git(root, "config", `url.${repository}.insteadOf`, "https://example.test/owner/repository.git");
  return { repository, root };
}

async function createEmptyRepository() {
  const base = await mkdtemp(join(tmpdir(), "repoledger-create-first-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "primary.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "repoledger test");
  git(root, "config", "user.email", "repoledger@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const repository = pathToFileURL(remote).href;
  await writeFile(join(root, "repoledger.yaml"), `version: 3
ideasDirectory: docs/ideas
primaryRepository: https://example.test/owner/repository.git
primaryBranch: main
`);
  git(root, "add", ".");
  git(root, "commit", "-m", "Configure empty repository");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "push", repository, "main");
  git(root, "config", `url.${repository}.insteadOf`, "https://example.test/owner/repository.git");
  return { root };
}

test("[unrelated-active-create] creates an exact alias-less scaffold without Git mutations", async () => {
  const { repository, root } = await createRepository();
  const head = git(root, "rev-parse", "HEAD");
  const index = git(root, "write-tree");
  const localRefs = git(root, "for-each-ref", "--format=%(refname) %(objectname)");
  const remoteRefs = git(root, "ls-remote", repository);
  const commands = [];

  const report = await observeGitCommands(
    (args) => commands.push(args),
    () => createIdea({ generateId: () => createdId, root }),
  );

  assert.equal(report.ok, true);
  assert.equal(report.command, "create-idea");
  assert.deepEqual(report.result.request, { kind: "create-idea" });
  assert.deepEqual(report.result.createdIdea, {
    id: createdId,
    ideaPath: `ideas/${createdId}`,
    statusPath: `ideas/${createdId}.status.yaml`,
  });
  assert.equal(await readFile(join(root, "ideas", createdId, "Idea.md"), "utf8"), "");
  assert.equal(
    await readFile(join(root, "ideas", `${createdId}.status.yaml`), "utf8"),
    `version: 1\nid: ${createdId}\n`,
  );
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  assert.equal(git(root, "write-tree"), index);
  assert.equal(git(root, "for-each-ref", "--format=%(refname) %(objectname)"), localRefs);
  assert.equal(git(root, "ls-remote", repository), remoteRefs);
  assert.deepEqual(
    git(root, "status", "--porcelain=v1", "--untracked-files=all").split(/\r?\n/).sort(),
    [
      `?? ideas/${createdId}.status.yaml`,
      `?? ideas/${createdId}/Idea.md`,
    ].sort(),
  );
  assert.equal(commands.filter(([command]) => command === "fetch").length, 1);
  assert.equal(
    commands.some(([command]) => ["add", "commit", "push"].includes(command)),
    false,
  );

  const next = await whatsNext({ idea: createdId, root });
  assert.deepEqual(next.result.request, { kind: "select-idea", selector: createdId });
  assert.equal(next.result.selectedIdea, null);
  assert.equal(next.result.action.code, "inspect-worktree-changes");

  git(root, "add", ".");
  git(root, "commit", "-m", "Publish created scaffold");
  git(root, "push", repository, "main");
  const published = await whatsNext({ idea: createdId, root });
  assert.equal(published.result.selectedIdea.id, createdId);
  assert.equal(published.result.action.code, "prepare-idea");
});

test("creates the first idea in a missing nested ideas directory", async () => {
  const { root } = await createEmptyRepository();

  const report = await createIdea({ generateId: () => createdId, root });

  assert.equal(report.ok, true);
  assert.equal(report.result.createdIdea.ideaPath, `docs/ideas/${createdId}`);
  assert.equal(await readFile(join(root, "docs", "ideas", createdId, "Idea.md"), "utf8"), "");
  assert.equal(
    await readFile(join(root, "docs", "ideas", `${createdId}.status.yaml`), "utf8"),
    `version: 1\nid: ${createdId}\n`,
  );
});

test("[ulid-collision] retries an identity collision without changing existing bytes", async () => {
  const { root } = await createRepository();
  const originalIdea = await readFile(join(root, "ideas", existingId, "Idea.md"));
  const originalStatus = await readFile(join(root, "ideas", `${existingId}.status.yaml`));
  const generated = [existingId, createdId];

  const report = await createIdea({ generateId: () => generated.shift(), root });

  assert.equal(report.ok, true);
  assert.equal(report.result.createdIdea.id, createdId);
  assert.deepEqual(await readFile(join(root, "ideas", existingId, "Idea.md")), originalIdea);
  assert.deepEqual(
    await readFile(join(root, "ideas", `${existingId}.status.yaml`)),
    originalStatus,
  );
});

test("[partial-write-failure] removes only owned scaffold paths after a partial status write", async () => {
  const { root } = await createRepository();
  const originalIdea = await readFile(join(root, "ideas", existingId, "Idea.md"));
  const originalStatus = await readFile(join(root, "ideas", `${existingId}.status.yaml`));
  const injected = Object.assign(new Error("injected status failure"), { code: "EIO" });

  const report = await createIdea({
    generateId: () => createdId,
    operations: {
      writeFile: async (path, value, options) => {
        await writeFile(path, value, options);
        if (path.endsWith(".status.yaml")) throw injected;
      },
    },
    root,
  });

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, "idea.create.failed");
  await assert.rejects(readFile(join(root, "ideas", createdId, "Idea.md")), { code: "ENOENT" });
  await assert.rejects(readFile(join(root, "ideas", `${createdId}.status.yaml`)), { code: "ENOENT" });
  assert.deepEqual(await readFile(join(root, "ideas", existingId, "Idea.md")), originalIdea);
  assert.deepEqual(
    await readFile(join(root, "ideas", `${existingId}.status.yaml`)),
    originalStatus,
  );
});

test("preserves a concurrently changed status during rollback", async () => {
  const { root } = await createRepository();
  const injected = Object.assign(new Error("injected concurrent write"), { code: "EIO" });

  const report = await createIdea({
    generateId: () => createdId,
    operations: {
      writeFile: async (path, value, options) => {
        await writeFile(path, value, options);
        if (path.endsWith(".status.yaml")) {
          await writeFile(path, "concurrent\n");
          throw injected;
        }
      },
    },
    root,
  });

  assert.equal(report.ok, false);
  assert.equal(
    await readFile(join(root, "ideas", `${createdId}.status.yaml`), "utf8"),
    "concurrent\n",
  );
});

test("does not allocate or write an idea when hygiene blocks creation", async () => {
  const { root } = await createRepository();
  await writeFile(join(root, "dirty.txt"), "preserve me\n");
  let generated = 0;

  const report = await createIdea({
    generateId: () => {
      generated += 1;
      return createdId;
    },
    root,
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.result.request, { kind: "create-idea" });
  assert.equal(report.result.action.code, "inspect-worktree-changes");
  assert.equal(report.result.createdIdea, undefined);
  assert.equal(generated, 0);
  await assert.rejects(readFile(join(root, "ideas", `${createdId}.status.yaml`)), { code: "ENOENT" });
});

test("routes all create hygiene states without changing repository state", async () => {
  const cases = [
    {
      name: "wrong branch",
      action: "switch-to-primary",
      setup: async ({ root }) => git(root, "checkout", "-b", "feature"),
    },
    {
      name: "conflict",
      action: "resolve-conflicts",
      setup: async ({ repository, root }) => {
        await writeFile(join(root, "conflict.txt"), "base\n");
        git(root, "add", ".");
        git(root, "commit", "-m", "Add conflict fixture");
        git(root, "push", repository, "main");
        git(root, "checkout", "-b", "other");
        await writeFile(join(root, "conflict.txt"), "other\n");
        git(root, "add", ".");
        git(root, "commit", "-m", "Other side");
        git(root, "checkout", "main");
        await writeFile(join(root, "conflict.txt"), "main\n");
        git(root, "add", ".");
        git(root, "commit", "-m", "Main side");
        const merged = spawnSync("git", ["-C", root, "merge", "other"], {
          encoding: "utf8",
          windowsHide: true,
        });
        assert.notEqual(merged.status, 0);
      },
    },
    {
      name: "dirty",
      action: "inspect-worktree-changes",
      setup: async ({ root }) => writeFile(join(root, "dirty.txt"), "dirty\n"),
    },
    {
      name: "behind",
      action: "fast-forward-primary",
      setup: async ({ repository, root }) => {
        const initial = git(root, "rev-parse", "HEAD");
        await writeFile(join(root, "remote.txt"), "remote\n");
        git(root, "add", ".");
        git(root, "commit", "-m", "Remote ahead");
        git(root, "push", repository, "main");
        git(root, "reset", "--hard", initial);
      },
    },
    {
      name: "ahead",
      action: "publish-primary",
      setup: async ({ root }) => {
        await writeFile(join(root, "local.txt"), "local\n");
        git(root, "add", ".");
        git(root, "commit", "-m", "Local ahead");
      },
    },
    {
      name: "diverged",
      action: "integrate-primary",
      setup: async ({ repository, root }) => {
        const initial = git(root, "rev-parse", "HEAD");
        await writeFile(join(root, "remote.txt"), "remote\n");
        git(root, "add", ".");
        git(root, "commit", "-m", "Remote side");
        git(root, "push", repository, "main");
        git(root, "reset", "--hard", initial);
        await writeFile(join(root, "local.txt"), "local\n");
        git(root, "add", ".");
        git(root, "commit", "-m", "Local side");
      },
    },
  ];

  for (const fixture of cases) {
    const repository = await createRepository();
    await fixture.setup(repository);
    await whatsNext({ create: true, root: repository.root });
    const before = repositoryState(repository.root, repository.repository);
    let generated = 0;

    const report = await createIdea({
      generateId: () => {
        generated += 1;
        return createdId;
      },
      root: repository.root,
    });

    assert.equal(report.result.action.code, fixture.action, fixture.name);
    assert.deepEqual(repositoryState(repository.root, repository.repository), before, fixture.name);
    assert.equal(generated, 0, fixture.name);
  }
});