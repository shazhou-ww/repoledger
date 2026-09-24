import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CONFIG_PATH, METADATA_ROOT } from "./layout.js";
import { isCanonicalLanguageTag } from "./language.js";
import { validBranchName, validRepository } from "./repository.js";
import { parseStrictYaml, stringifyCanonicalYaml } from "./yaml.js";

export const DEFAULT_CONFIG_NAME = CONFIG_PATH;

const CONFIG_KEYS = [
  "version",
  "primaryRepository",
  "primaryBranch",
  "preferredLanguage",
];

function configDiagnostic(code, path, message, remediation) {
  return { code, level: "error", path, message, remediation };
}

async function regularRepositoryFile(root) {
  const metadataRoot = resolve(root, METADATA_ROOT);
  const absolutePath = resolve(root, CONFIG_PATH);
  try {
    const directoryMetadata = await lstat(metadataRoot);
    if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
      throw Object.assign(new Error(`${METADATA_ROOT} must be a regular directory`), {
        code: "EINVAL",
      });
    }
    const fileMetadata = await lstat(absolutePath);
    if (!fileMetadata.isFile() || fileMetadata.isSymbolicLink()) {
      throw Object.assign(new Error("Configuration must be a regular file"), {
        code: "EINVAL",
      });
    }
    return { absolutePath, source: await readFile(absolutePath, "utf8") };
  } catch (error) {
    const missing = error.code === "ENOENT";
    return {
      absolutePath,
      diagnostic: configDiagnostic(
        missing ? "config.missing" : "config.invalid-file",
        CONFIG_PATH,
        missing
          ? `Missing Silvermoon configuration: ${CONFIG_PATH}`
          : `Cannot read Silvermoon configuration: ${error.message}`,
        missing
          ? `Create ${CONFIG_PATH}.`
          : `Replace ${METADATA_ROOT} and ${CONFIG_PATH} with repository-owned regular paths.`,
      ),
    };
  }
}

export function validPrimaryBranch(_root, value) {
  return validBranchName(value);
}

export function serializeConfig(config) {
  const canonical = {
    version: config.version,
    primaryRepository: config.primaryRepository,
    primaryBranch: config.primaryBranch,
  };
  if (config.preferredLanguage !== undefined) {
    canonical.preferredLanguage = config.preferredLanguage;
  }
  return stringifyCanonicalYaml(canonical);
}

export async function loadConfig({ root }) {
  const loaded = await regularRepositoryFile(root);
  if (loaded.diagnostic) {
    return {
      config: null,
      configPath: loaded.absolutePath,
      diagnostics: [loaded.diagnostic],
    };
  }

  const normalizedSource = loaded.source.replaceAll("\r\n", "\n");
  let value;
  try {
    value = parseStrictYaml(normalizedSource);
  } catch (error) {
    return {
      config: null,
      configPath: loaded.absolutePath,
      diagnostics: [configDiagnostic(
        "config.invalid-yaml",
        CONFIG_PATH,
        `Cannot parse Silvermoon configuration: ${error.message}`,
        `Use the strict YAML contract in ${CONFIG_PATH}.`,
      )],
    };
  }

  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return {
      config: null,
      configPath: loaded.absolutePath,
      diagnostics: [configDiagnostic(
        "config.invalid-type",
        CONFIG_PATH,
        "The Silvermoon configuration must be a YAML mapping.",
        `Replace ${CONFIG_PATH} with the documented mapping.`,
      )],
    };
  }

  const diagnostics = [];
  for (const key of Object.keys(value).sort()) {
    if (!CONFIG_KEYS.includes(key)) {
      diagnostics.push(configDiagnostic(
        "config.unknown-key",
        `${CONFIG_PATH}#${key}`,
        `Unknown Silvermoon configuration key: ${key}`,
        `Remove ${key}.`,
      ));
    }
  }
  for (const [key, code] of [
    ["version", "config.missing-version"],
    ["primaryRepository", "config.missing-primary-repository"],
    ["primaryBranch", "config.missing-primary-branch"],
  ]) {
    if (!Object.hasOwn(value, key)) {
      diagnostics.push(configDiagnostic(
        code,
        `${CONFIG_PATH}#${key}`,
        `Missing required key: ${key}`,
        `Add ${key} to ${CONFIG_PATH}.`,
      ));
    }
  }
  if (Object.hasOwn(value, "version") && value.version !== 1) {
    diagnostics.push(configDiagnostic(
      "config.unsupported-version",
      `${CONFIG_PATH}#version`,
      `Unsupported Silvermoon version: ${String(value.version)}`,
      "Use version: 1.",
    ));
  }
  if (
    Object.hasOwn(value, "primaryRepository") &&
    !validRepository(value.primaryRepository)
  ) {
    diagnostics.push(configDiagnostic(
      "config.invalid-primary-repository",
      `${CONFIG_PATH}#primaryRepository`,
      "primaryRepository must be a canonical credential-free HTTPS repository URL.",
      "Use a canonical HTTPS repository URL without credentials, query, fragment, or trailing slash.",
    ));
  }
  if (
    Object.hasOwn(value, "primaryBranch") &&
    !validPrimaryBranch(root, value.primaryBranch)
  ) {
    diagnostics.push(configDiagnostic(
      "config.invalid-primary-branch",
      `${CONFIG_PATH}#primaryBranch`,
      "primaryBranch must be a valid short Git branch name.",
      "Use a branch such as main without refs/ or remote prefixes.",
    ));
  }
  if (
    Object.hasOwn(value, "preferredLanguage") &&
    !isCanonicalLanguageTag(value.preferredLanguage)
  ) {
    diagnostics.push(configDiagnostic(
      "config.invalid-preferred-language",
      `${CONFIG_PATH}#preferredLanguage`,
      "preferredLanguage must be a canonical BCP 47 language tag.",
      "Use a canonical tag such as en or zh-CN.",
    ));
  }
  if (diagnostics.length === 0 && serializeConfig(value) !== normalizedSource) {
    diagnostics.push(configDiagnostic(
      "config.noncanonical",
      CONFIG_PATH,
      "The Silvermoon configuration is valid but not canonical.",
      "Rewrite properties in version, primaryRepository, primaryBranch, preferredLanguage order with LF endings.",
    ));
  }

  return {
    config: diagnostics.length === 0 ? value : null,
    configPath: loaded.absolutePath,
    diagnostics,
  };
}
