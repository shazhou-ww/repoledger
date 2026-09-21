import { isAlias, isMap, parseDocument, stringify, visit } from "yaml";

function unsupportedFeature(document) {
  if (document.commentBefore || document.comment) return true;
  if (document.directives?.docStart || document.directives?.docEnd) return true;
  if (document.directives?.yaml?.explicit) return true;
  const tags = Object.entries(document.directives?.tags ?? {});
  if (
    tags.length !== 1 ||
    tags[0]?.[0] !== "!!" ||
    tags[0]?.[1] !== "tag:yaml.org,2002:"
  ) {
    return true;
  }

  let unsupported = false;
  visit(document, (_key, node) => {
    if (
      isAlias(node) ||
      node?.anchor ||
      node?.tag ||
      node?.commentBefore ||
      node?.comment
    ) {
      unsupported = true;
      return visit.BREAK;
    }
    if (
      isMap(node) &&
      node.items.some((item) => item.key?.value === "<<")
    ) {
      unsupported = true;
      return visit.BREAK;
    }
    return undefined;
  });
  return unsupported;
}

export function parseStrictYaml(source) {
  const document = parseDocument(source, {
    maxAliasCount: 0,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new Error(
      document.errors[0]?.message ?? document.warnings[0]?.message ?? "Invalid YAML",
    );
  }
  if (unsupportedFeature(document)) {
    throw new Error("Comments, directives, anchors, aliases, merge keys, and tags are not supported");
  }
  return document.toJS({ maxAliasCount: 0 });
}

export function stringifyCanonicalYaml(value) {
  return stringify(value, {
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
    indent: 2,
    lineWidth: 0,
  });
}
