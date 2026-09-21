import { serializeConfig, validTasksDirectory } from "./config.js";
import {
  isTaskName,
  isTimestamp,
  nextTimestamp,
  serializeStatusFile,
  TASK_STATES,
} from "./ledger.js";
import {
  effectiveSourceRepository,
  validBranchName,
  validRepository,
} from "./repository.js";
import { parseStrictYaml } from "./yaml.js";

const LEGACY_CONFIG_KEYS = ["version", "tasksDirectory", "remote", "primaryBranch"];
const LEGACY_RECORD_KEYS = ["state", "createdAt", "updatedAt"];
const LEGACY_REMOTE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function migrationError(message) {
  return new Error(`Invalid version 1 migration: ${message}`);
}

function exactKeys(value, expected) {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0")
  );
}

function serializeLegacyConfig(config) {
  return [
    "version: 1",
    `tasksDirectory: ${config.tasksDirectory}`,
    `remote: ${config.remote}`,
    `primaryBranch: ${config.primaryBranch}`,
    "",
  ].join("\n");
}

function serializeLegacyStatus(status) {
  const names = Object.keys(status.tasks).sort();
  if (names.length === 0) return "version: 1\ntasks: {}\n";
  const lines = ["version: 1", "tasks:"];
  for (const name of names) {
    const record = status.tasks[name];
    lines.push(
      `  ${name}:`,
      `    state: ${record.state}`,
      `    createdAt: \"${record.createdAt}\"`,
      `    updatedAt: \"${record.updatedAt}\"`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function parseLegacyConfig(source) {
  const normalized = source.replaceAll("\r\n", "\n");
  let config;
  try {
    config = parseStrictYaml(normalized);
  } catch (caught) {
    throw migrationError(caught.message);
  }
  if (!exactKeys(config, LEGACY_CONFIG_KEYS) || config.version !== 1) {
    throw migrationError("configuration must match the complete version 1 contract");
  }
  if (!validTasksDirectory(config.tasksDirectory)) {
    throw migrationError("tasksDirectory is invalid");
  }
  if (
    typeof config.remote !== "string" ||
    !LEGACY_REMOTE.test(config.remote) ||
    config.remote.includes("..") ||
    config.remote.endsWith(".lock")
  ) {
    throw migrationError("remote is invalid");
  }
  if (!validBranchName(config.primaryBranch)) {
    throw migrationError("primaryBranch is invalid");
  }
  if (serializeLegacyConfig(config) !== normalized) {
    throw migrationError("configuration is not canonical");
  }
  return config;
}

function parseLegacyStatus(source) {
  const normalized = source.replaceAll("\r\n", "\n");
  let status;
  try {
    status = parseStrictYaml(normalized);
  } catch (caught) {
    throw migrationError(caught.message);
  }
  if (!exactKeys(status, ["version", "tasks"]) || status.version !== 1) {
    throw migrationError("status must match the version 1 contract");
  }
  if (status.tasks === null || Array.isArray(status.tasks) || typeof status.tasks !== "object") {
    throw migrationError("tasks must be a mapping");
  }
  for (const [name, record] of Object.entries(status.tasks)) {
    if (!isTaskName(name) || !exactKeys(record, LEGACY_RECORD_KEYS)) {
      throw migrationError(`record ${name} is invalid`);
    }
    if (
      !TASK_STATES.includes(record.state) ||
      !isTimestamp(record.createdAt) ||
      !isTimestamp(record.updatedAt) ||
      record.createdAt > record.updatedAt
    ) {
      throw migrationError(`record ${name} has invalid lifecycle data`);
    }
  }
  if (serializeLegacyStatus(status) !== normalized) {
    throw migrationError("status is not canonical");
  }
  return status;
}

export function prepareV1Migration({
  configSource,
  now = new Date(),
  primaryRepository,
  sourceRefs = {},
  statusSource,
}) {
  const legacyConfig = parseLegacyConfig(configSource);
  const legacyStatus = parseLegacyStatus(statusSource);
  if (!validRepository(primaryRepository)) {
    throw migrationError("primaryRepository must be a canonical credential-free HTTPS URL");
  }
  if (sourceRefs === null || Array.isArray(sourceRefs) || typeof sourceRefs !== "object") {
    throw migrationError("sourceRefs must be a task-name mapping");
  }
  for (const name of Object.keys(sourceRefs)) {
    if (legacyStatus.tasks[name]?.state !== "ongoing") {
      throw migrationError(`source ref supplied for non-ongoing task ${name}`);
    }
  }

  const config = {
    version: 2,
    tasksDirectory: legacyConfig.tasksDirectory,
    primaryRepository,
    primaryBranch: legacyConfig.primaryBranch,
  };
  const status = { version: 2, tasks: {} };
  const owners = new Map();
  for (const [name, record] of Object.entries(legacyStatus.tasks)) {
    if (record.state !== "ongoing") {
      status.tasks[name] = { ...record };
      continue;
    }
    const requested = sourceRefs[name] ?? {};
    if (
      requested === null ||
      Array.isArray(requested) ||
      typeof requested !== "object" ||
      Object.keys(requested).some(
        (key) => !["sourceRepository", "sourceBranch"].includes(key),
      )
    ) {
      throw migrationError(`source ref for ${name} is invalid`);
    }
    const sourceRepository = requested.sourceRepository ?? primaryRepository;
    const sourceBranch = requested.sourceBranch ?? `task/${name}`;
    if (!validRepository(sourceRepository) || !validBranchName(sourceBranch)) {
      throw migrationError(`source ref for ${name} is invalid`);
    }
    if (
      sourceRepository === primaryRepository &&
      sourceBranch === legacyConfig.primaryBranch
    ) {
      throw migrationError(`source ref for ${name} targets primary`);
    }
    const migrated = {
      state: "ongoing",
      ...(sourceRepository === primaryRepository ? {} : { sourceRepository }),
      sourceBranch,
      createdAt: record.createdAt,
      updatedAt: nextTimestamp(record.updatedAt, now),
    };
    const effectiveRepository = effectiveSourceRepository(config, migrated);
    const key = `${effectiveRepository}\0${sourceBranch}`;
    if (owners.has(key)) {
      throw migrationError(`source ref for ${name} duplicates ${owners.get(key)}`);
    }
    owners.set(key, name);
    status.tasks[name] = migrated;
  }

  return {
    config,
    configSource: serializeConfig(config),
    status,
    statusSource: serializeStatusFile(status, { primaryRepository }),
  };
}