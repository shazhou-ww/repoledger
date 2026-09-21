import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const ENCODED_SEPARATOR = /%(?:2f|5c)/i;
const CANONICAL_HOST = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])$/;
const INVALID_BRANCH_CHARACTER = /[\u0000-\u0020\u007f~^:?*\[\\]/;

export function canonicalRepository(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    CONTROL_CHARACTER.test(value) ||
    value.includes("\\")
  ) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    !CANONICAL_HOST.test(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname === "/" ||
    parsed.pathname.endsWith("/") ||
    parsed.pathname.includes("//") ||
    ENCODED_SEPARATOR.test(parsed.pathname) ||
    parsed.href !== value
  ) {
    return null;
  }

  return parsed.href;
}

export function validRepository(value) {
  return canonicalRepository(value) !== null;
}

export function repositoryNamespace(value) {
  const canonical = canonicalRepository(value);
  if (!canonical) throw new Error(`Invalid repository URL: ${String(value)}`);
  return createHash("sha256").update(canonical).digest("hex");
}

export function validBranchName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value === "@" ||
    value.startsWith("-") ||
    value.startsWith("refs/") ||
    value.startsWith("remotes/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes("//") ||
    value.includes("..") ||
    value.includes("@{") ||
    INVALID_BRANCH_CHARACTER.test(value)
  ) {
    return false;
  }

  const structurallyValid = value
    .split("/")
    .every((component) => component && !component.startsWith(".") && !component.endsWith(".lock"));
  if (!structurallyValid) return false;

  const checked = spawnSync("git", ["check-ref-format", "--branch", value], {
    encoding: "utf8",
    windowsHide: true,
  });
  return checked.status === 0;
}

export function effectiveSourceRepository(config, record) {
  return record.sourceRepository ?? config.primaryRepository;
}