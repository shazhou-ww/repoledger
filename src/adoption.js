import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.js";
import { runGit } from "./git.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
export const SILVERMOON_VERSION = packageJson.version;
export const REPOSITORY_SKILL_PATHS = [
  ".agents/skills/silvermoon",
  ".github/skills/silvermoon",
];

async function metadata(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function jsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return { __invalid: error.message };
  }
}

async function directoryDigest(root) {
  const hash = createHash("sha256");
  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        hash.update(relative(root, path).split(sep).join("/"));
        hash.update("\0");
        hash.update(await readFile(path));
        hash.update("\0");
      } else {
        throw new Error(`Skill contains a non-regular path: ${path}`);
      }
    }
  }
  await visit(root);
  return hash.digest("hex");
}

async function skillDigest(path) {
  const entry = await lstat(path);
  if (entry.isFile()) {
    const pointer = (await readFile(path, "utf8")).trim();
    if (!pointer) throw new Error(`Skill pointer is empty: ${path}`);
    return directoryDigest(resolve(dirname(path), pointer));
  }
  if (!entry.isDirectory() && !entry.isSymbolicLink()) {
    throw new Error(`Skill discovery path is not a directory: ${path}`);
  }
  return directoryDigest(path);
}

function command(executable, args, description) {
  return { kind: "command", executable, args, description };
}

function manual(path, description) {
  return { kind: "manual", path, description };
}

function requirement(id, title, status, blocking, dependencies, observed, remediation = null) {
  return { id, title, status, blocking, dependencies, observed, remediation };
}

async function detectPackageManager(root, manifest) {
  for (const [file, name] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"],
  ]) {
    if (await metadata(resolve(root, file))) return name;
  }
  const declared = manifest?.packageManager?.split("@")[0];
  return ["pnpm", "npm", "yarn", "bun"].includes(declared) ? declared : "npm";
}

export async function detectExecutionSource({
  root,
  runtimeRoot = packageRoot,
} = {}) {
  const runtime = await realpath(runtimeRoot);
  let repository;
  try {
    repository = await realpath(root);
  } catch {
    repository = resolve(root);
  }
  let local = null;
  try {
    local = await realpath(resolve(repository, "node_modules", "silvermoon"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const normalizedRuntime = runtime.toLowerCase();
  const normalizedRoot = repository.toLowerCase();
  const normalizedLocal = local?.toLowerCase() ?? null;
  let kind = "unknown";
  if (normalizedRuntime === normalizedRoot && await metadata(resolve(runtime, ".git"))) {
    kind = "source-checkout";
  } else if (normalizedRuntime === normalizedLocal) {
    kind = "project-local";
  } else if (/(^|[\\/])_npx([\\/]|$)/i.test(runtime)) {
    kind = "temporary";
  } else if (normalizedRuntime.includes(`${sep}node_modules${sep}`) && !normalizedRuntime.startsWith(normalizedRoot + sep)) {
    kind = "global";
  }
  return { kind, packageRoot: runtime, version: SILVERMOON_VERSION };
}

function installCommand(manager, version) {
  if (manager === "pnpm") {
    return command("pnpm", ["add", "--save-dev", "--save-exact", `silvermoon@${version}`], `Declare Silvermoon ${version} and install it locally.`);
  }
  if (manager === "yarn") {
    return command("yarn", ["add", "--dev", "--exact", `silvermoon@${version}`], `Declare Silvermoon ${version} and install it locally.`);
  }
  if (manager === "bun") {
    return command("bun", ["add", "--dev", "--exact", `silvermoon@${version}`], `Declare Silvermoon ${version} and install it locally.`);
  }
  return command("npm", ["install", "--save-dev", "--save-exact", `silvermoon@${version}`], `Declare Silvermoon ${version} and install it locally.`);
}

export async function inspectAdoption({ root, selector } = {}) {
  const repositoryRoot = resolve(root ?? process.cwd());
  const source = await detectExecutionSource({ root: repositoryRoot });
  const manifest = await jsonFile(resolve(repositoryRoot, "package.json"));
  const manager = await detectPackageManager(repositoryRoot, manifest);
  const sourceCheckout = source.kind === "source-checkout";
  const desiredVersion = source.version;
  const declared = manifest?.devDependencies?.silvermoon ?? manifest?.dependencies?.silvermoon ?? null;
  const installedManifest = sourceCheckout
    ? packageJson
    : await jsonFile(resolve(repositoryRoot, "node_modules", "silvermoon", "package.json"));
  const installedVersion = installedManifest?.version ?? null;
  const requirements = [];

  const git = runGit(repositoryRoot, ["rev-parse", "--show-toplevel"]);
  requirements.push(requirement(
    "repository.git",
    "Git repository",
    git.ok ? "satisfied" : "missing",
    true,
    [],
    { root: git.ok ? git.stdout : null },
    git.ok ? null : command("git", ["init"], "Initialize this directory as a Git repository."),
  ));

  requirements.push(requirement(
    "runtime.execution-source",
    "Authoritative execution source",
    ["source-checkout", "project-local", "temporary"].includes(source.kind)
      ? "satisfied"
      : source.kind === "global" ? "conflicting" : "unknown",
    !sourceCheckout && !["project-local", "temporary"].includes(source.kind),
    ["global", "unknown"].includes(source.kind)
      ? ["repository.git", "package.installed"]
      : ["repository.git"],
    source,
    ["global", "unknown"].includes(source.kind)
      ? command("npx", ["--no-install", "silvermoon", "whats-next", ...(selector ? [selector] : []), "--json"], "Re-run with the repository-local CLI.")
      : null,
  ));

  requirements.push(requirement(
    "package.manifest",
    "Exact project dependency",
    sourceCheckout
      ? "inapplicable"
      : declared === desiredVersion ? "satisfied" : declared ? "mismatched" : "missing",
    !sourceCheckout,
    ["repository.git"],
    { packageManager: manager, declared, expected: sourceCheckout ? null : desiredVersion },
    sourceCheckout ? null : installCommand(manager, desiredVersion),
  ));

  const installStatus = sourceCheckout
    ? "satisfied"
    : installedVersion === desiredVersion ? "satisfied" : installedVersion ? "mismatched" : "missing";
  requirements.push(requirement(
    "package.installed",
    "Installed project CLI",
    installStatus,
    true,
    sourceCheckout ? ["runtime.execution-source"] : ["package.manifest"],
    { installedVersion, expected: desiredVersion },
    installStatus === "satisfied"
      ? null
      : command(manager, ["install"], `Install the lockfile-resolved Silvermoon ${desiredVersion} dependency.`),
  ));

  const packagedSkill = resolve(packageRoot, "skills", "silvermoon");
  let skillStatus = "blocked";
  const skillObserved = { paths: [], expectedDigest: null };
  if (installStatus === "satisfied") {
    const expectedDigest = await directoryDigest(packagedSkill);
    skillObserved.expectedDigest = expectedDigest;
    for (const path of REPOSITORY_SKILL_PATHS) {
      try {
        skillObserved.paths.push({
          path,
          digest: await skillDigest(resolve(repositoryRoot, ...path.split("/"))),
        });
      } catch (error) {
        if (error.code !== "ENOENT") {
          skillObserved.paths.push({ path, error: error.message });
        }
      }
    }
    skillStatus = skillObserved.paths.length === 0
      ? "missing"
      : skillObserved.paths.every(({ digest }) => digest === expectedDigest)
        ? "satisfied"
        : skillObserved.paths.some(({ error }) => error)
          ? "conflicting"
          : "mismatched";
  }
  requirements.push(requirement(
    "skill.repository-local",
    "Repository-local canonical skill",
    skillStatus,
    true,
    ["package.installed"],
    skillObserved,
    skillStatus === "satisfied" || skillStatus === "blocked"
      ? null
      : command(
        "npx",
        [
          "skills",
          "add",
          "./node_modules/silvermoon/skills",
          "--skill",
          "silvermoon",
          "--agent",
          "github-copilot",
          "--yes",
          "--copy",
        ],
        "Register the installed package's canonical skill through the supported npx skills interface.",
      ),
  ));

  const loadedConfig = await loadConfig({ root: repositoryRoot });
  const missingConfig = loadedConfig.diagnostics.some(({ code }) => code === "config.missing");
  const configStatus = loadedConfig.config
    ? "satisfied"
    : missingConfig ? "missing" : "conflicting";
  requirements.push(requirement(
    "repository.configuration",
    "Silvermoon repository configuration",
    configStatus,
    true,
    ["repository.git"],
    { path: ".silvermoon/config.yaml", diagnostics: loadedConfig.diagnostics },
    configStatus === "satisfied"
      ? null
      : missingConfig
        ? manual(".silvermoon/config.yaml", "Create the documented configuration through ordinary reviewed file editing.")
        : manual(".silvermoon/config.yaml", "Repair the reported configuration conflicts without overwriting unrelated content."),
  ));

  const blockingFindings = requirements.filter(({ blocking, status }) =>
    blocking && !["satisfied", "inapplicable"].includes(status)
  );
  const recommended = requirements.find(({ remediation, status, dependencies }) =>
    remediation
    && !["satisfied", "inapplicable"].includes(status)
    && dependencies.every((id) => {
      const dependency = requirements.find((item) => item.id === id);
      return dependency && ["satisfied", "inapplicable"].includes(dependency.status);
    })
  );
  return {
    status: blockingFindings.length === 0 ? "ready" : "blocked",
    executionSource: source,
    packageManager: manager,
    desiredVersion,
    requirements,
    findings: requirements.filter(({ status }) => !["satisfied", "inapplicable"].includes(status)),
    recommendedAction: recommended?.remediation ?? null,
    recheck: command(
      "npx",
      ["--no-install", "silvermoon", "whats-next", ...(selector ? [selector] : []), "--json"],
      "Re-run the complete diagnosis after an observable change.",
    ),
  };
}
