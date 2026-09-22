import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

import {
  assertVersionUnpublished,
  createReleasePlan,
  deriveNpmDistTag,
  formatGitHubOutput,
  isReachableFromPrimary,
  parseReleaseTag,
} from "../scripts/prepare-npm-release.mjs";

const commit = "a".repeat(40);
const releaseGuidePath = fileURLToPath(
  new URL("../docs/npm-package-releases.md", import.meta.url),
);
const workflowPath = fileURLToPath(
  new URL("../.github/workflows/publish-npm.yml", import.meta.url),
);
const publishSkillPath = fileURLToPath(
  new URL("../.github/skills/publish/SKILL.md", import.meta.url),
);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

function manifest(version = "0.1.1") {
  return {
    name: "repoledger",
    version,
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
  };
}

function plan(overrides = {}) {
  return createReleasePlan({
    commit,
    manifest: manifest(),
    reachableFromPrimary: true,
    tag: "npm/repoledger/v0.1.1",
    ...overrides,
  });
}

test("selects the allowlisted package from a canonical stable release tag", () => {
  assert.deepEqual(plan(), {
    commit,
    distTag: "latest",
    packageDirectory: ".",
    packageName: "repoledger",
    releaseKey: "repoledger",
    version: "0.1.1",
  });
});

test("rejects malformed tags and unknown release keys", () => {
  for (const tag of ["v0.1.1", "npm/repoledger/0.1.1", "npm/repoledger/v01.1.0"]) {
    assert.throws(() => parseReleaseTag(tag));
  }
  assert.throws(
    () => plan({ tag: "npm/unknown/v0.1.1" }),
    /Unknown npm release key: unknown/,
  );
});

test("requires the allowlisted package identity and requested manifest version", () => {
  assert.throws(
    () => plan({ manifest: { ...manifest(), name: "other-package" } }),
    /Package name mismatch/,
  );
  assert.throws(
    () => plan({ manifest: { ...manifest(), version: "0.1.0" } }),
    /Version mismatch.*0\.1\.1.*0\.1\.0/,
  );
  assert.throws(
    () => plan({ manifest: { ...manifest(), private: true } }),
    /is private/,
  );
});

test("requires public npmjs publish configuration", () => {
  assert.throws(
    () => plan({ manifest: { ...manifest(), publishConfig: { access: "public" } } }),
    /must publish to https:\/\/registry\.npmjs\.org/,
  );
  assert.throws(
    () =>
      plan({
        manifest: {
          ...manifest(),
          publishConfig: { registry: "https://registry.npmjs.org/" },
        },
      }),
    /publishConfig\.access to public/,
  );
});

test("rejects a release commit outside refreshed origin/main", () => {
  assert.throws(
    () => plan({ reachableFromPrimary: false }),
    /not reachable from origin\/main/,
  );
});

test("checks real Git ancestry against the refreshed origin/main ref", async () => {
  const root = await mkdtemp(join(tmpdir(), "npm-release-ancestry-"));
  temporaryDirectories.push(root);
  git(root, ["init", "--initial-branch=main"]);
  git(root, ["config", "user.name", "release test"]);
  git(root, ["config", "user.email", "release@example.invalid"]);
  await writeFile(join(root, "main.txt"), "main\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "main"]);
  const mainCommit = git(root, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/remotes/origin/main", mainCommit]);

  git(root, ["checkout", "--orphan", "unrelated"]);
  git(root, ["rm", "-rf", "."]);
  await writeFile(join(root, "unrelated.txt"), "unrelated\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "unrelated"]);
  const unrelatedCommit = git(root, ["rev-parse", "HEAD"]);

  assert.equal(isReachableFromPrimary(mainCommit, { root }), true);
  assert.equal(isReachableFromPrimary(unrelatedCommit, { root }), false);
  assert.throws(
    () => isReachableFromPrimary("--is-ancestor", { root }),
    /full hexadecimal Git object ID/,
  );
});

test("derives named prerelease channels without using latest", () => {
  assert.equal(deriveNpmDistTag("1.0.0-beta.2"), "beta");
  assert.equal(deriveNpmDistTag("1.0.0-RC.1"), "rc");
  assert.throws(() => deriveNpmDistTag("1.0.0-1"), /named channel/);
  assert.throws(() => deriveNpmDistTag("1.0.0-latest.1"), /must not use the latest/);
});

test("fails closed for published versions and registry errors", async () => {
  const release = plan();
  await assert.doesNotReject(() =>
    assertVersionUnpublished(release, {
      fetchImpl: async () => ({ status: 404 }),
    }),
  );
  await assert.doesNotReject(() =>
    assertVersionUnpublished(release, {
      fetchImpl: async () => ({
        json: async () => ({ versions: { "0.1.0": {} } }),
        ok: true,
        status: 200,
      }),
    }),
  );
  await assert.rejects(
    () =>
      assertVersionUnpublished(release, {
        fetchImpl: async () => ({
          json: async () => ({ versions: { "0.1.1": {} } }),
          ok: true,
          status: 200,
        }),
      }),
    /already published/,
  );
  await assert.rejects(
    () =>
      assertVersionUnpublished(release, {
        fetchImpl: async () => ({ ok: false, status: 503 }),
      }),
    /registry returned 503/,
  );
});

test("emits fixed GitHub outputs for later workflow steps", () => {
  assert.equal(
    formatGitHubOutput(plan()),
    [
      "release_key=repoledger",
      "package_name=repoledger",
      "package_directory=.",
      "version=0.1.1",
      "dist_tag=latest",
    ].join("\n"),
  );
});

test("uses a protected, least-privilege trusted-publishing workflow", async () => {
  const source = await readFile(workflowPath, "utf8");
  const document = parseDocument(source);
  assert.deepEqual(document.errors, []);

  const workflow = document.toJS();
  assert.deepEqual(workflow.on.push.tags, ["npm/**"]);
  assert.deepEqual(workflow.permissions, {});

  const publish = workflow.jobs.publish;
  assert.equal(publish["runs-on"], "ubuntu-latest");
  assert.equal(publish.environment, "npm");
  assert.deepEqual(publish.permissions, {
    contents: "read",
    "id-token": "write",
  });
  assert.deepEqual(workflow.concurrency, {
    group: "npm-publish",
    "cancel-in-progress": false,
  });

  const stepNames = publish.steps.map(({ name }) => name);
  assert.ok(
    stepNames.indexOf("Refresh primary branch and verify ancestry") <
    stepNames.indexOf("Install frozen dependencies"),
  );
  assert.ok(
    stepNames.indexOf("Validate release instruction") <
    stepNames.indexOf("Publish selected package"),
  );

  const checkout = publish.steps.find(({ name }) => name === "Check out full history");
  const ancestry = publish.steps.find(
    ({ name }) => name === "Refresh primary branch and verify ancestry",
  );
  const install = publish.steps.find(({ name }) => name === "Install frozen dependencies");
  const workspace = publish.steps.find(({ name }) => name === "Validate workspace");
  const tarball = publish.steps.find(({ name }) => name === "Verify selected package tarball");
  const publication = publish.steps.find(({ name }) => name === "Publish selected package");
  assert.equal(checkout.with["fetch-depth"], 0);
  assert.match(ancestry.run, /refs\/heads\/main:refs\/remotes\/origin\/main/);
  assert.match(ancestry.run, /git merge-base --is-ancestor/);
  assert.equal(install.run, "pnpm install --frozen-lockfile");
  assert.equal(workspace.run, "pnpm check");
  assert.equal(
    tarball["working-directory"],
    "${{ steps.release.outputs.package_directory }}",
  );
  assert.equal(tarball.run, "npm run pack:check");
  assert.equal(
    publication["working-directory"],
    "${{ steps.release.outputs.package_directory }}",
  );
  assert.match(publication.run, /npm publish --access public --provenance/);
  assert.doesNotMatch(source, /NODE_AUTH_TOKEN|NPM_TOKEN/);
});

test("documents trusted-publisher setup and the protected release procedure", async () => {
  const guide = await readFile(releaseGuidePath, "utf8");
  for (const required of [
    "Organization or user: `shazhou-ww`",
    "Repository: `repoledger`",
    "Workflow filename: `publish-npm.yml`",
    "Environment: `npm`",
    "tag ruleset targeting `npm/**`",
    "git tag npm/repoledger/v0.1.1 origin/main",
    "RELEASE_PACKAGES",
    "Do not move or recreate the tag",
  ]) {
    assert.ok(guide.includes(required), `Release guide is missing: ${required}`);
  }
  assert.match(guide, /Do not\s+create an npm automation token/);
  assert.match(guide, /new commit on `main`, choose a new version/);
});

test("provides an explicit project publish skill with immutable release safeguards", async () => {
  const source = await readFile(publishSkillPath, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  assert.ok(frontmatter, "publish skill is missing YAML frontmatter");
  const document = parseDocument(frontmatter[1]);
  assert.deepEqual(document.errors, []);
  assert.deepEqual(document.toJS(), {
    name: "publish",
    description:
      "Publish the allowlisted npm package from this repository through the protected GitHub Actions trusted-publishing workflow. Use only when the user explicitly invokes /publish with a release key and version intent.",
    "argument-hint": "[repoledger] [major|minor|patch|x.y.z]",
    "user-invocable": true,
    "disable-model-invocation": true,
  });
  for (const required of [
    "docs/npm-package-releases.md",
    "scripts/prepare-npm-release.mjs",
    ".github/workflows/publish-npm.yml",
    "Never run",
    "npm publish",
    "pnpm install --frozen-lockfile",
    "npm run pack:check",
    "git tag npm/<release-key>/v<version> origin/main",
    "Require the workflow conclusion to be `success`",
  ]) {
    assert.ok(source.includes(required), `publish skill is missing: ${required}`);
  }
  assert.match(source, /Never\r?\n\s+move, delete, or recreate a release tag/);
  assert.doesNotMatch(source, /NPM_TOKEN\s*=|NODE_AUTH_TOKEN\s*=/);
});

