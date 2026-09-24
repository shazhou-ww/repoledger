export const DEFAULT_LANGUAGE = "en-US";

export function canonicalizeLanguageTag(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("language tag must be a non-empty trimmed string");
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    if (!canonical) throw new Error("language tag is empty");
    return canonical;
  } catch {
    throw new Error(`invalid BCP 47 language tag: ${value}`);
  }
}

export function isCanonicalLanguageTag(value) {
  try {
    return canonicalizeLanguageTag(value) === value;
  } catch {
    return false;
  }
}

export function resolveLanguage({ idea, project, global } = {}) {
  if (idea !== undefined) return { tag: idea, source: "idea" };
  if (project !== undefined) return { tag: project, source: "project" };
  if (global !== undefined) return { tag: global, source: "global" };
  return { tag: DEFAULT_LANGUAGE, source: "default" };
}
