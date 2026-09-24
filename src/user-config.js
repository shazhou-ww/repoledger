import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { isCanonicalLanguageTag } from "./language.js";
import { parseStrictYaml, stringifyCanonicalYaml } from "./yaml.js";

export const USER_CONFIG_PATH = ".config/silvermoon/config.yaml";

const USER_CONFIG_KEYS = new Set(["version", "preferredLanguage"]);

function diagnostic(code, path, message, remediation) {
  return { code, level: "error", path, message, remediation };
}

function serializeUserConfig(config) {
  const canonical = { version: 1 };
  if (config.preferredLanguage !== undefined) {
    canonical.preferredLanguage = config.preferredLanguage;
  }
  return stringifyCanonicalYaml(canonical);
}

export async function loadUserConfig({ home = homedir() } = {}) {
  const configPath = resolve(home, USER_CONFIG_PATH);
  let metadata;
  let source;
  try {
    metadata = await lstat(configPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw Object.assign(new Error("User configuration must be a regular file"), {
        code: "EINVAL",
      });
    }
    source = await readFile(configPath, "utf8");
  } catch (caught) {
    if (caught.code === "ENOENT") {
      return { config: null, configPath, diagnostics: [] };
    }
    return {
      config: null,
      configPath,
      diagnostics: [diagnostic(
        "user-config.invalid-file",
        configPath,
        `Cannot read Silvermoon user configuration: ${caught.message}`,
        `Replace ${configPath} with a readable regular file or remove it.`,
      )],
    };
  }

  const normalizedSource = source.replaceAll("\r\n", "\n");
  let value;
  try {
    value = parseStrictYaml(normalizedSource);
  } catch (caught) {
    return {
      config: null,
      configPath,
      diagnostics: [diagnostic(
        "user-config.invalid-yaml",
        configPath,
        `Cannot parse Silvermoon user configuration: ${caught.message}`,
        `Use the strict YAML contract in ${configPath}.`,
      )],
    };
  }

  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return {
      config: null,
      configPath,
      diagnostics: [diagnostic(
        "user-config.invalid-type",
        configPath,
        "The Silvermoon user configuration must be a YAML mapping.",
        `Replace ${configPath} with the documented mapping.`,
      )],
    };
  }

  const diagnostics = [];
  for (const key of Object.keys(value).sort()) {
    if (!USER_CONFIG_KEYS.has(key)) {
      diagnostics.push(diagnostic(
        "user-config.unknown-key",
        `${configPath}#${key}`,
        `Unknown Silvermoon user configuration key: ${key}`,
        `Remove ${key}.`,
      ));
    }
  }
  if (!Object.hasOwn(value, "version")) {
    diagnostics.push(diagnostic(
      "user-config.missing-version",
      `${configPath}#version`,
      "Missing required key: version",
      `Add version: 1 to ${configPath}.`,
    ));
  } else if (value.version !== 1) {
    diagnostics.push(diagnostic(
      "user-config.unsupported-version",
      `${configPath}#version`,
      `Unsupported Silvermoon user configuration version: ${String(value.version)}`,
      "Use version: 1.",
    ));
  }
  if (
    Object.hasOwn(value, "preferredLanguage") &&
    !isCanonicalLanguageTag(value.preferredLanguage)
  ) {
    diagnostics.push(diagnostic(
      "user-config.invalid-preferred-language",
      `${configPath}#preferredLanguage`,
      "preferredLanguage must be a canonical BCP 47 language tag.",
      "Use a canonical tag such as en or zh-CN.",
    ));
  }
  if (diagnostics.length === 0 && serializeUserConfig(value) !== normalizedSource) {
    diagnostics.push(diagnostic(
      "user-config.noncanonical",
      configPath,
      "The Silvermoon user configuration is valid but not canonical.",
      "Rewrite properties in version, preferredLanguage order with LF endings.",
    ));
  }

  return {
    config: diagnostics.length === 0 ? value : null,
    configPath,
    diagnostics,
  };
}

export { serializeUserConfig };
