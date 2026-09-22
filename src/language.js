export const DEFAULT_TASK_LANGUAGE = "en";

export function canonicalLanguage(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) {
    return null;
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return canonical ?? null;
  } catch {
    return null;
  }
}

export function validCanonicalLanguage(value) {
  return canonicalLanguage(value) === value;
}

export function resolveTaskLanguage({ override, project, preference } = {}) {
  if (override !== undefined) {
    const language = canonicalLanguage(override);
    return language ? { language, source: "override" } : null;
  }
  if (project !== undefined && project !== null) {
    const language = canonicalLanguage(project);
    return language ? { language, source: "project" } : null;
  }
  if (preference !== undefined && preference !== null) {
    const language = canonicalLanguage(preference);
    return language ? { language, source: "preference" } : null;
  }
  return { language: DEFAULT_TASK_LANGUAGE, source: "default" };
}

export function taskLanguageMetadata(source) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const firstSection = lines.findIndex((line) => /^##(?:\s|$)/.test(line));
  const entries = [];
  for (const [index, line] of lines.entries()) {
    const match = /^Language:(.*)$/.exec(line);
    if (match) entries.push({ index, line, value: match[1].trim() });
  }

  if (entries.length === 0) {
    return { issues: [], language: DEFAULT_TASK_LANGUAGE, present: false };
  }

  const issues = [];
  if (entries.length > 1) issues.push("duplicate");
  const entry = entries[0];
  if (firstSection !== -1 && entry.index > firstSection) issues.push("misplaced");
  if (
    entry.line !== `Language: ${entry.value}` ||
    !validCanonicalLanguage(entry.value)
  ) {
    issues.push("invalid");
  }
  return {
    issues,
    language: issues.length === 0 ? entry.value : null,
    present: true,
  };
}