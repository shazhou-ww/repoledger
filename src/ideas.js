import { parseStrictYaml, stringifyCanonicalYaml } from "./yaml.js";
import { isCanonicalLanguageTag } from "./language.js";

export const IDEA_STATES = [
  "preparing",
  "implementing",
  "deploying",
  "completed",
  "abandoned",
];

const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const STATUS_KEYS = new Set([
  "version",
  "id",
  "alias",
  "language",
  "abandoned",
  "approvedRevision",
  "implementationAcceptedRevision",
  "deploymentAcceptedRevision",
]);
const REVISION_KEYS = [
  "approvedRevision",
  "implementationAcceptedRevision",
  "deploymentAcceptedRevision",
];

function ideaStatusError(message) {
  return new Error(`Invalid idea status: ${message}`);
}

function isMapping(value) {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function isValidAlias(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    [...value].length <= 120 &&
    !CONTROL_CHARACTER.test(value)
  );
}

export function isValidUlid(value) {
  return typeof value === "string" && ULID.test(value);
}

export function validateIdeaStatus(value, { objectIdLength } = {}) {
  if (!isMapping(value)) throw ideaStatusError("document must be a mapping");
  for (const key of Object.keys(value)) {
    if (!STATUS_KEYS.has(key)) throw ideaStatusError(`unknown field: ${key}`);
  }
  for (const key of ["version", "id"]) {
    if (!Object.hasOwn(value, key)) throw ideaStatusError(`missing ${key}`);
  }
  if (value.version !== 1) throw ideaStatusError("version must be 1");
  if (!isValidUlid(value.id)) throw ideaStatusError("id must be a canonical ULID");
  if (Object.hasOwn(value, "alias") && !isValidAlias(value.alias)) {
    throw ideaStatusError("alias must be 1 to 120 trimmed characters without controls");
  }
  if (
    Object.hasOwn(value, "language") &&
    !isCanonicalLanguageTag(value.language)
  ) {
    throw ideaStatusError("language must be a canonical BCP 47 language tag");
  }
  if (Object.hasOwn(value, "abandoned") && value.abandoned !== true) {
    throw ideaStatusError("abandoned must be omitted or true");
  }
  if (
    objectIdLength !== undefined &&
    (!Number.isInteger(objectIdLength) || objectIdLength <= 0)
  ) {
    throw ideaStatusError("objectIdLength must be a positive integer");
  }
  for (const key of REVISION_KEYS) {
    if (!Object.hasOwn(value, key)) continue;
    if (
      typeof value[key] !== "string" ||
      !OBJECT_ID.test(value[key]) ||
      (objectIdLength !== undefined && value[key].length !== objectIdLength)
    ) {
      throw ideaStatusError(`${key} must be a lowercase hexadecimal Git object ID`);
    }
  }
  return value;
}

export function serializeIdeaStatus(value, options) {
  validateIdeaStatus(value, options);
  const canonical = {
    version: 1,
    id: value.id,
  };
  if (Object.hasOwn(value, "alias")) canonical.alias = value.alias;
  if (Object.hasOwn(value, "language")) canonical.language = value.language;
  if (value.abandoned === true) canonical.abandoned = true;
  for (const key of REVISION_KEYS) {
    if (Object.hasOwn(value, key)) canonical[key] = value[key];
  }
  return stringifyCanonicalYaml(canonical);
}

export function parseIdeaStatus(source, options) {
  const normalizedSource = source.replaceAll("\r\n", "\n");
  let value;
  try {
    value = parseStrictYaml(normalizedSource);
  } catch (error) {
    throw ideaStatusError(error.message);
  }
  validateIdeaStatus(value, options);
  if (serializeIdeaStatus(value, options) !== normalizedSource) {
    throw ideaStatusError("status is not canonical");
  }
  return value;
}

export function deriveIdeaState(revisions, status) {
  if (revisions === null || Array.isArray(revisions) || typeof revisions !== "object") {
    throw ideaStatusError("revisions must be a mapping");
  }
  for (const key of ["idealRevision", "implementationRevision", "deploymentRevision"]) {
    if (typeof revisions[key] !== "string" || !OBJECT_ID.test(revisions[key])) {
      throw ideaStatusError(`${key} must be a lowercase hexadecimal Git object ID`);
    }
  }
  validateIdeaStatus(status);
  if (status.abandoned) return "abandoned";
  if (status.approvedRevision !== revisions.idealRevision) return "preparing";
  if (
    status.implementationAcceptedRevision !== revisions.implementationRevision
  ) return "implementing";
  if (status.deploymentAcceptedRevision !== revisions.deploymentRevision) return "deploying";
  return "completed";
}