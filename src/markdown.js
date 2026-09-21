import { marked } from "marked";

export function parseMarkdown(text) {
  const tokens = marked.lexer(text);
  return {
    headings: new Set(
      tokens
        .filter(({ type, depth }) => type === "heading" && depth === 2)
        .map(({ text: heading }) => heading.trim()),
    ),
    links: collectLinks(tokens),
    section(name) {
      const start = tokens.findIndex(
        ({ type, depth, text: heading }) =>
          type === "heading" && depth === 2 && heading.trim() === name,
      );
      if (start === -1) return [];
      const section = [];
      for (const token of tokens.slice(start + 1)) {
        if (token.type === "heading" && token.depth <= 2) break;
        section.push(token);
      }
      return section;
    },
  };
}

export function sectionText(tokens) {
  return tokens
    .map((token) => token.text ?? token.raw ?? "")
    .join("\n")
    .trim();
}

function collectLinks(tokens) {
  const links = [];
  const visited = new WeakSet();

  function visit(value) {
    if (value === null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if ((value.type === "link" || value.type === "image") && value.href) {
      links.push(value.href);
    }
    for (const nested of Object.values(value)) {
      if (Array.isArray(nested)) {
        for (const item of nested) visit(item);
      } else if (nested && typeof nested === "object") {
        visit(nested);
      }
    }
  }

  visit(tokens);
  return links;
}
