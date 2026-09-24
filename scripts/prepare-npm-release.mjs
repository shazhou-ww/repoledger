import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import semver from "semver";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const npmRegistry = "https://registry.npmjs.org";

export const RELEASE_PACKAGES = Object.freeze({
  silvermoon: Object.freeze({
    directory: ".",
    packageName: "silvermoon",
  }),
});

function validateCommit(commit) {
  if (!/^[0-9a-f]{40,64}$/i.test(commit ?? "")) {
    throw new Error("Release commit must be a full hexadecimal Git object ID.");
  }
  return commit;
}

export function parseReleaseTag(tag) {
  const match = /^npm\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\/v(.+)$/.exec(tag ?? "");
  if (!match) {
    throw new Error("Release tag must match npm/<release-key>/v<semver>.");
  }

  const [, releaseKey, requestedVersion] = match;
  const version = semver.valid(requestedVersion);
  if (!version || version !== requestedVersion) {
    throw new Error(`Release tag version is not canonical SemVer: ${requestedVersion}`);
  }
  return { releaseKey, version };
}

export function deriveNpmDistTag(version) {
  const prerelease = semver.prerelease(version);
  if (!prerelease) return "latest";

  const channel = prerelease[0];
  if (typeof channel !== "string" || !/^[a-z][a-z0-9-]*$/i.test(channel)) {
    throw new Error(
      `Prerelease ${version} must begin with a named channel such as alpha, beta, or rc.`,
    );
  }
  if (channel.toLowerCase() === "latest") {
    throw new Error("Prerelease channel must not use the latest npm dist-tag.");
  }
  return channel.toLowerCase();
}

export function createReleasePlan({
  commit,
  manifest,
  reachableFromPrimary,
  releases = RELEASE_PACKAGES,
  tag,
}) {
  const { releaseKey, version } = parseReleaseTag(tag);
  const release = releases[releaseKey];
  if (!release) {
    throw new Error(`Unknown npm release key: ${releaseKey}`);
  }
  validateCommit(commit);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`Package manifest is invalid: ${release.directory}/package.json`);
  }
  if (manifest.name !== release.packageName) {
    throw new Error(
      `Package name mismatch for ${releaseKey}: expected ${release.packageName}, found ${manifest.name ?? "missing"}.`,
    );
  }
  if (manifest.private === true) {
    throw new Error(`Package ${manifest.name} is private and cannot be published.`);
  }
  if (manifest.version !== version) {
    throw new Error(
      `Version mismatch for ${manifest.name}: tag requests ${version}, manifest has ${manifest.version ?? "missing"}.`,
    );
  }
  const registry = manifest.publishConfig?.registry?.replace(/\/$/, "");
  if (registry !== npmRegistry) {
    throw new Error(`Package ${manifest.name} must publish to ${npmRegistry}.`);
  }
  if (manifest.publishConfig?.access !== "public") {
    throw new Error(`Package ${manifest.name} must set publishConfig.access to public.`);
  }
  if (reachableFromPrimary !== true) {
    throw new Error(`Release commit ${commit} is not reachable from origin/main.`);
  }

  return {
    commit,
    distTag: deriveNpmDistTag(version),
    packageDirectory: release.directory,
    packageName: release.packageName,
    releaseKey,
    version,
  };
}

export async function assertVersionUnpublished(
  { packageName, version },
  { fetchImpl = globalThis.fetch } = {},
) {
  let response;
  try {
    response = await fetchImpl(`${npmRegistry}/${encodeURIComponent(packageName)}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error(`Could not verify ${packageName}@${version} on npm: ${error.message}`);
  }

  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(
      `Could not verify ${packageName}@${version} on npm: registry returned ${response.status}.`,
    );
  }

  let metadata;
  try {
    metadata = await response.json();
  } catch (error) {
    throw new Error(`Could not parse npm metadata for ${packageName}: ${error.message}`);
  }
  if (!metadata?.versions || typeof metadata.versions !== "object") {
    throw new Error(`npm metadata for ${packageName} does not contain a versions object.`);
  }
  if (Object.hasOwn(metadata.versions, version)) {
    throw new Error(`Package version is already published: ${packageName}@${version}`);
  }
}

export function isReachableFromPrimary(commit, { root = repositoryRoot } = {}) {
  validateCommit(commit);
  const result = spawnSync("git", ["merge-base", "--is-ancestor", commit, "origin/main"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `Could not verify origin/main reachability: ${result.stderr || result.error?.message || "git failed"}`,
  );
}

export function formatGitHubOutput(plan) {
  return [
    `release_key=${plan.releaseKey}`,
    `package_name=${plan.packageName}`,
    `package_directory=${plan.packageDirectory}`,
    `version=${plan.version}`,
    `dist_tag=${plan.distTag}`,
  ].join("\n");
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!value || !["--commit", "--tag"].includes(option)) {
      throw new Error("Usage: node scripts/prepare-npm-release.mjs --tag <tag> --commit <sha>");
    }
    values[option.slice(2)] = value;
  }
  return values;
}

export async function prepareNpmRelease({ commit, fetchImpl, root = repositoryRoot, tag }) {
  const parsed = parseReleaseTag(tag);
  const release = RELEASE_PACKAGES[parsed.releaseKey];
  if (!release) throw new Error(`Unknown npm release key: ${parsed.releaseKey}`);

  const manifestPath = resolve(root, release.directory, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const plan = createReleasePlan({
    commit,
    manifest,
    reachableFromPrimary: isReachableFromPrimary(commit, { root }),
    tag,
  });
  await assertVersionUnpublished(plan, { fetchImpl });
  return plan;
}

async function main() {
  const { commit, tag } = parseArguments(process.argv.slice(2));
  const plan = await prepareNpmRelease({ commit, tag });
  const output = formatGitHubOutput(plan);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${output}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Release validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}