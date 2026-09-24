import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import { createIdea } from "../../src/create-idea.js";
import { observeGitCommands } from "../../src/git.js";
import {
  DEPLOYMENT_TEMPLATE,
  IDEA_TEMPLATE,
  IMPLEMENTATION_TEMPLATE,
  LEDGER_TEMPLATE,
} from "../../src/idea-templates.js";
import { serializeIdeaStatus } from "../../src/ideas.js";
import { ideaPaths } from "../../src/layout.js";
import { whatsNext } from "../../src/whatsnext.js";

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
  const base = await mkdtemp(join(tmpdir(), "silvermoon-create-idea-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "primary.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "silvermoon test");
  git(root, "config", "user.email", "silvermoon@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const repository = pathToFileURL(remote).href;
  await mkdir(join(root, ".silvermoon", "ideas"), { recursive: true });
  await writeFile(join(root, ".silvermoon", "config.yaml"), `version: 1
primaryRepository: https://example.test/owner/repository.git
primaryBranch: main
`);
  const existing = ideaPaths(existingId);
  await mkdir(join(root, ...existing.idealPath.split("/")), { recursive: true });
  await writeFile(join(root, ...existing.ideaDocumentPath.split("/")), "# Existing\n");
  await writeFile(join(root, ...existing.implementationDocumentPath.split("/")), "");
  await writeFile(join(root, ...existing.deploymentDocumentPath.split("/")), "");
  await writeFile(join(root, ...existing.ledgerPath.split("/")), "# Ledger\n");
  await writeFile(
    join(root, ...existing.statusPath.split("/")),
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
  const base = await mkdtemp(join(tmpdir(), "silvermoon-create-first-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "primary.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "silvermoon test");
  git(root, "config", "user.email", "silvermoon@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const repository = pathToFileURL(remote).href;
  await mkdir(join(root, ".silvermoon"));
  await writeFile(join(root, ".silvermoon", "config.yaml"), `version: 1
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
    ideaPath: `.silvermoon/ideas/${createdId}`,
    statusPath: `.silvermoon/ideas/${createdId}/status.yaml`,
    ideaDocumentPath: `.silvermoon/ideas/${createdId}/outer/inner/ideal/Idea.md`,
    implementationDocumentPath: `.silvermoon/ideas/${createdId}/outer/inner/Implementation.md`,
    deploymentDocumentPath: `.silvermoon/ideas/${createdId}/outer/Deployment.md`,
    ledgerPath: `.silvermoon/ideas/${createdId}/ledger.md`,
  });
  const created = ideaPaths(createdId);
  for (const [path, source] of [
    [created.ideaDocumentPath, IDEA_TEMPLATE],
    [created.implementationDocumentPath, IMPLEMENTATION_TEMPLATE],
    [created.deploymentDocumentPath, DEPLOYMENT_TEMPLATE],
    [created.ledgerPath, LEDGER_TEMPLATE],
  ]) {
    assert.equal(await readFile(join(root, ...path.split("/")), "utf8"), source);
  }
  assert.match(IDEA_TEMPLATE, /^# Replace with a specific title for this idea$/m);
  assert.doesNotMatch(IDEA_TEMPLATE, /^# Idea$/m);
  const ledgerHeadings = [...LEDGER_TEMPLATE.matchAll(/^#{1,6} (.+)$/gm)]
    .map(([, heading]) => heading);
  assert.equal(new Set(ledgerHeadings).size, ledgerHeadings.length);
  for (const heading of [
    "Implementation steps",
    "Implementation acceptance criteria",
    "Deployment steps",
    "Deployment acceptance criteria",
  ]) {
    assert.ok(ledgerHeadings.includes(heading));
  }
  assert.equal(
    await readFile(join(root, ...created.statusPath.split("/")), "utf8"),
    `version: 1\nid: ${createdId}\n`,
  );
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  assert.equal(git(root, "write-tree"), index);
  assert.equal(git(root, "for-each-ref", "--format=%(refname) %(objectname)"), localRefs);
  assert.equal(git(root, "ls-remote", repository), remoteRefs);
  assert.deepEqual(
    git(root, "status", "--porcelain=v1", "--untracked-files=all").split(/\r?\n/).sort(),
    [
      `?? .silvermoon/ideas/${createdId}/outer/Deployment.md`,
      `?? .silvermoon/ideas/${createdId}/outer/inner/Implementation.md`,
      `?? .silvermoon/ideas/${createdId}/outer/inner/ideal/Idea.md`,
      `?? .silvermoon/ideas/${createdId}/ledger.md`,
      `?? .silvermoon/ideas/${createdId}/status.yaml`,
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

test("creates the first idea in the fixed missing ideas directory", async () => {
  const { root } = await createEmptyRepository();

  const report = await createIdea({ generateId: () => createdId, root });

  assert.equal(report.ok, true);
  const paths = ideaPaths(createdId);
  assert.equal(report.result.createdIdea.ideaPath, paths.ideaPath);
  assert.equal(
    await readFile(join(root, ...paths.ideaDocumentPath.split("/")), "utf8"),
    IDEA_TEMPLATE,
  );
  assert.equal(
    await readFile(join(root, ...paths.ledgerPath.split("/")), "utf8"),
    LEDGER_TEMPLATE,
  );
  assert.equal(
    await readFile(join(root, ...paths.statusPath.split("/")), "utf8"),
    `version: 1\nid: ${createdId}\n`,
  );
});

test("normalizes and persists only an explicit language override", async () => {
  const explicit = await createEmptyRepository();
  const report = await createIdea({
    generateId: () => createdId,
    language: "zh-cn",
    root: explicit.root,
  });
  const paths = ideaPaths(createdId);
  assert.equal(report.ok, true);
  assert.equal(report.result.createdIdea.language, "zh-CN");
  assert.equal(
    await readFile(join(explicit.root, ...paths.statusPath.split("/")), "utf8"),
    `version: 1\nid: ${createdId}\nlanguage: zh-CN\n`,
  );

  const inherited = await createEmptyRepository();
  const inheritedReport = await createIdea({
    generateId: () => createdId,
    root: inherited.root,
  });
  assert.equal(inheritedReport.ok, true);
  assert.equal(
    Object.hasOwn(inheritedReport.result.createdIdea, "language"),
    false,
  );
  assert.equal(
    await readFile(join(inherited.root, ...paths.statusPath.split("/")), "utf8"),
    `version: 1\nid: ${createdId}\n`,
  );
});

test("rejects an invalid language before Git or filesystem mutation", async () => {
  const { repository, root } = await createRepository();
  const before = repositoryState(root, repository);
  const commands = [];

  const report = await observeGitCommands(
    (args) => commands.push(args),
    () => createIdea({
      generateId: () => createdId,
      language: "not_a_tag",
      root,
    }),
  );

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, "idea.language.invalid");
  assert.equal(report.result.createdIdea, null);
  assert.deepEqual(commands, []);
  assert.deepEqual(repositoryState(root, repository), before);
});

test("[ulid-collision] retries an identity collision without changing existing bytes", async () => {
  const { root } = await createRepository();
  const existing = ideaPaths(existingId);
  const originalIdea = await readFile(join(root, ...existing.ideaDocumentPath.split("/")));
  const originalStatus = await readFile(join(root, ...existing.statusPath.split("/")));
  const generated = [existingId, createdId];

  const report = await createIdea({ generateId: () => generated.shift(), root });

  assert.equal(report.ok, true);
  assert.equal(report.result.createdIdea.id, createdId);
  assert.deepEqual(await readFile(join(root, ...existing.ideaDocumentPath.split("/"))), originalIdea);
  assert.deepEqual(
    await readFile(join(root, ...existing.statusPath.split("/"))),
    originalStatus,
  );
});

test("[partial-write-failure] removes only owned scaffold paths after a partial status write", async () => {
  const { root } = await createRepository();
  const existing = ideaPaths(existingId);
  const created = ideaPaths(createdId);
  const originalIdea = await readFile(join(root, ...existing.ideaDocumentPath.split("/")));
  const originalStatus = await readFile(join(root, ...existing.statusPath.split("/")));
  const injected = Object.assign(new Error("injected status failure"), { code: "EIO" });

  const report = await createIdea({
    generateId: () => createdId,
    operations: {
      writeFile: async (path, value, options) => {
        await writeFile(path, value, options);
        if (path.endsWith("status.yaml")) throw injected;
      },
    },
    root,
  });

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, "idea.create.failed");
  await assert.rejects(readFile(join(root, ...created.ideaDocumentPath.split("/"))), { code: "ENOENT" });
  await assert.rejects(readFile(join(root, ...created.ledgerPath.split("/"))), { code: "ENOENT" });
  await assert.rejects(readFile(join(root, ...created.statusPath.split("/"))), { code: "ENOENT" });
  assert.deepEqual(await readFile(join(root, ...existing.ideaDocumentPath.split("/"))), originalIdea);
  assert.deepEqual(
    await readFile(join(root, ...existing.statusPath.split("/"))),
    originalStatus,
  );
});

test("preserves a concurrently changed status during rollback", async () => {
  const { root } = await createRepository();
  const created = ideaPaths(createdId);
  const injected = Object.assign(new Error("injected concurrent write"), { code: "EIO" });

  const report = await createIdea({
    generateId: () => createdId,
    operations: {
      writeFile: async (path, value, options) => {
        await writeFile(path, value, options);
        if (path.endsWith("status.yaml")) {
          await writeFile(path, "concurrent\n");
          throw injected;
        }
      },
    },
    root,
  });

  assert.equal(report.ok, false);
  assert.equal(
    await readFile(join(root, ...created.statusPath.split("/")), "utf8"),
    "concurrent\n",
  );
});

test("preserves a concurrently created status after EEXIST", async () => {
  const { root } = await createRepository();
  const created = ideaPaths(createdId);

  const report = await createIdea({
    generateId: () => createdId,
    operations: {
      writeFile: async (path, value, options) => {
        if (path.endsWith("status.yaml")) await writeFile(path, "concurrent\n");
        await writeFile(path, value, options);
      },
    },
    root,
  });

  assert.equal(report.ok, false);
  assert.equal(
    await readFile(join(root, ...created.statusPath.split("/")), "utf8"),
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
  const created = ideaPaths(createdId);
  await assert.rejects(readFile(join(root, ...created.statusPath.split("/"))), { code: "ENOENT" });
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