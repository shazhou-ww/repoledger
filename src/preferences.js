import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, posix, win32 } from "node:path";

import {
  canonicalLanguage,
  DEFAULT_TASK_LANGUAGE,
  validCanonicalLanguage,
} from "./language.js";
import { parseStrictYaml, stringifyCanonicalYaml } from "./yaml.js";

export { DEFAULT_TASK_LANGUAGE };
export const USER_PREFERENCES_NAME = "preferences.yaml";

const PREFERENCE_KEYS = ["version", "taskLanguage"];

function diagnostic(code, path, message, remediation) {
  return { code, level: "error", path, message, remediation };
}

function configuredBase(value, paths) {
  return typeof value === "string" && value.length > 0 && paths.isAbsolute(value)
    ? value
    : null;
}

export function userPreferencesPath({
  env = process.env,
  home = homedir(),
  platform = process.platform,
} = {}) {
  const paths = platform === "win32" ? win32 : posix;
  let base;
  if (platform === "win32") {
    base = configuredBase(env.APPDATA, paths) ?? paths.join(home, "AppData", "Roaming");
  } else {
    base = configuredBase(env.XDG_CONFIG_HOME, paths);
    if (!base) {
      base = platform === "darwin"
        ? paths.join(home, "Library", "Application Support")
        : paths.join(home, ".config");
    }
  }
  return paths.join(base, "repoledger", USER_PREFERENCES_NAME);
}

export function serializeUserPreferences(preferences) {
  return stringifyCanonicalYaml({
    version: preferences.version,
    taskLanguage: preferences.taskLanguage,
  });
}

async function replacePreferences(path, source) {
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  await mkdir(directory, { recursive: true });
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(source, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, path);
  } finally {
    if (handle) await handle.close().catch(() => { });
    await rm(temporaryPath, { force: true }).catch(() => { });
  }
}

export async function loadUserPreferences({ path = userPreferencesPath() } = {}) {
  let source;
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw Object.assign(new Error("Preferences must be a regular file"), {
        code: "EINVAL",
      });
    }
    source = await readFile(path, "utf8");
  } catch (caught) {
    if (caught.code === "ENOENT") {
      return {
        diagnostics: [],
        exists: false,
        path,
        preferences: { version: 1, taskLanguage: null },
      };
    }
    return {
      diagnostics: [
        diagnostic(
          "preferences.invalid-file",
          path,
          `Cannot read user preferences: ${caught.message}`,
          `Replace ${path} with a regular user-owned file.`,
        ),
      ],
      exists: true,
      path,
      preferences: null,
    };
  }

  const normalizedSource = source.replaceAll("\r\n", "\n");
  let value;
  try {
    value = parseStrictYaml(normalizedSource);
  } catch (caught) {
    return {
      diagnostics: [
        diagnostic(
          "preferences.invalid-yaml",
          path,
          `Cannot parse user preferences: ${caught.message}`,
          `Replace ${path} with canonical Repoledger user preferences.`,
        ),
      ],
      exists: true,
      path,
      preferences: null,
    };
  }

  const diagnostics = [];
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    diagnostics.push(
      diagnostic(
        "preferences.invalid-type",
        path,
        "User preferences must be a YAML mapping.",
        `Replace ${path} with the documented mapping.`,
      ),
    );
  } else {
    for (const key of Object.keys(value).sort()) {
      if (!PREFERENCE_KEYS.includes(key)) {
        diagnostics.push(
          diagnostic(
            "preferences.unknown-key",
            `${path}#${key}`,
            `Unknown user preference: ${key}`,
            `Remove ${key}.`,
          ),
        );
      }
    }
    for (const key of PREFERENCE_KEYS) {
      if (!Object.hasOwn(value, key)) {
        diagnostics.push(
          diagnostic(
            "preferences.missing-key",
            `${path}#${key}`,
            `Missing user preference key: ${key}`,
            `Add ${key} to ${path}.`,
          ),
        );
      }
    }
    if (Object.hasOwn(value, "version") && value.version !== 1) {
      diagnostics.push(
        diagnostic(
          "preferences.unsupported-version",
          `${path}#version`,
          `Unsupported user preferences version: ${String(value.version)}`,
          "Use version: 1.",
        ),
      );
    }
    if (
      Object.hasOwn(value, "taskLanguage") &&
      !validCanonicalLanguage(value.taskLanguage)
    ) {
      diagnostics.push(
        diagnostic(
          "preferences.invalid-task-language",
          `${path}#taskLanguage`,
          `Invalid canonical BCP 47 task language: ${String(value.taskLanguage)}`,
          "Use a canonical language tag such as en or zh-CN.",
        ),
      );
    }
    if (diagnostics.length === 0 && serializeUserPreferences(value) !== normalizedSource) {
      diagnostics.push(
        diagnostic(
          "preferences.noncanonical",
          path,
          "User preferences are valid but not canonical.",
          `Rewrite ${path} in version, taskLanguage order with LF endings.`,
        ),
      );
    }
  }

  return {
    diagnostics,
    exists: true,
    path,
    preferences: diagnostics.length === 0 ? value : null,
  };
}

export async function saveTaskLanguagePreference({
  language,
  path = userPreferencesPath(),
} = {}) {
  const canonical = canonicalLanguage(language);
  if (!canonical) {
    return {
      diagnostics: [
        diagnostic(
          "preferences.invalid-task-language",
          `${path}#taskLanguage`,
          `Invalid BCP 47 task language: ${String(language)}`,
          "Use a language tag such as en or zh-CN.",
        ),
      ],
      language: null,
      path,
    };
  }

  const existing = await loadUserPreferences({ path });
  if (existing.diagnostics.length > 0) {
    return { diagnostics: existing.diagnostics, language: null, path };
  }

  try {
    await replacePreferences(
      path,
      serializeUserPreferences({ version: 1, taskLanguage: canonical }),
    );
  } catch (caught) {
    return {
      diagnostics: [
        diagnostic(
          "preferences.write-failed",
          path,
          `Cannot write user preferences: ${caught.message}`,
          `Verify that ${dirname(path)} is writable and retry.`,
        ),
      ],
      language: null,
      path,
    };
  }

  return { diagnostics: [], language: canonical, path };
}