import { fromMarkdown } from "mdast-util-from-markdown";

const EVIDENCE_TYPES = new Set(["test", "check", "artifact"]);
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function text(node) {
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  return (node.children ?? []).map(text).join("");
}

function firstStrong(node) {
  if (node.type === "strong") return node;
  for (const child of node.children ?? []) {
    const found = firstStrong(child);
    if (found) return found;
  }
  return null;
}

export function implementationCriterionIds(source) {
  const document = fromMarkdown(source);
  const ids = [];
  let inSection = false;
  for (const node of document.children) {
    if (node.type === "heading" && node.depth === 2) {
      if (inSection) break;
      inSection = text(node).trim().toLowerCase() === "implementation acceptance criteria";
      continue;
    }
    if (!inSection || node.type !== "list") continue;
    for (const item of node.children) {
      const label = firstStrong(item);
      const match = label ? /^(I\d{2})\b/.exec(text(label).trim()) : null;
      if (!match) throw new Error("Implementation criteria must start with a strong I## identifier");
      ids.push(match[1]);
    }
  }
  if (!inSection && ids.length === 0) {
    throw new Error("Missing Implementation acceptance criteria section");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Implementation criterion identifiers must be unique");
  }
  return ids;
}

function validEvidence(entry) {
  return (
    entry !== null &&
    !Array.isArray(entry) &&
    typeof entry === "object" &&
    EVIDENCE_TYPES.has(entry.type) &&
    typeof entry.locator === "string" &&
    entry.locator.trim().length > 0
  );
}

export function verifyCriteriaEvidence(implementationSource, artifact, implementationRevision) {
  let expected;
  try {
    expected = implementationCriterionIds(implementationSource);
  } catch (caught) {
    return {
      ok: false,
      diagnostics: [{
        code: "criteria.definition.invalid",
        level: "error",
        message: caught.message,
        remediation: "Use unique I## identifiers on implementation acceptance criteria.",
      }],
    };
  }

  const entries = artifact?.criteriaEvidence;
  const diagnostics = [];
  if (
    !OBJECT_ID.test(implementationRevision) ||
    artifact?.implementationRevision !== implementationRevision
  ) {
    diagnostics.push({
      code: "criteria.evidence.revision-mismatch",
      level: "error",
      path: "implementationRevision",
      message: "Criteria evidence is not bound to the current Inner World revision.",
      remediation: "Record the current implementationRevision in the evidence artifact.",
    });
  }
  for (let index = 0; index < expected.length; index += 1) {
    const criterion = expected[index];
    const entry = Array.isArray(entries) ? entries[index] : undefined;
    if (
      entry?.criterion !== criterion ||
      !Array.isArray(entry.evidence) ||
      entry.evidence.length === 0 ||
      !entry.evidence.every(validEvidence)
    ) {
      diagnostics.push({
        code: "criteria.evidence.missing",
        level: "error",
        path: `criteriaEvidence[${index}]`,
        message: `Missing valid evidence for ${criterion}.`,
        remediation: `Add ordered test, check, or artifact evidence for ${criterion}.`,
      });
    }
  }
  if (Array.isArray(entries) && entries.length > expected.length) {
    diagnostics.push({
      code: "criteria.evidence.unexpected",
      level: "error",
      path: `criteriaEvidence[${expected.length}]`,
      message: "Criteria evidence contains entries not present in the idea definition.",
      remediation: "Keep exactly one ordered entry for each implementation criterion.",
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}