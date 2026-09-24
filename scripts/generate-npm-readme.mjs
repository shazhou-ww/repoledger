import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const repository = "shazhou-ww/silvermoon";
const rawMainPrefix = `https://raw.githubusercontent.com/${repository}/main/`;
const relativeFilePattern =
  /^(?:\.\.?(?:\/|$)|(?![a-z][a-z0-9+.-]*:|#)[^/\s]+\/|[A-Za-z0-9_.-]+\.(?:md|svg|png|jpe?g|gif|webp|html?|json|ya?ml|js|mjs|cjs|ts|txt|sh)(?:#|$))/i;

function validateCommit(commit) {
  if (!/^[0-9a-f]{40,64}$/i.test(commit ?? "")) {
    throw new Error("Release commit must be a full hexadecimal Git object ID.");
  }
  return commit;
}

function blobUrl(commit, path, anchor = "") {
  return `https://github.com/${repository}/blob/${commit}/${path}${anchor}`;
}

function rewriteMarkdownRelativeLinks(source, commit) {
  return source.replace(
    /\]\(\.\/([^)\s#]+)(#[^)\s]*)?(?:\s+(?:"[^"]*"|'[^']*'))?\)/g,
    (_match, path, anchor = "") => `](${blobUrl(commit, path, anchor)})`,
  );
}

function rewriteHtmlRelativeHrefs(source, commit) {
  return source.replace(
    /href="\.\/([^"#\s]+)(#[^"]*)?"/g,
    (_match, path, anchor = "") => `href="${blobUrl(commit, path, anchor)}"`,
  );
}

function stripMarkdownLinkTitle(destination) {
  const titled = /^(.*?)\s+(?:"[^"]*"|'[^']*')$/.exec(destination);
  return titled ? titled[1] : destination;
}

function assertNoMovableOrRelativeRefs(source) {
  if (source.includes(`https://raw.githubusercontent.com/${repository}/main`)) {
    throw new Error(
      "Generated README still references raw.githubusercontent.com/.../main; refusing movable refs.",
    );
  }

  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const destination = stripMarkdownLinkTitle(match[1].trim());
    if (relativeFilePattern.test(destination)) {
      throw new Error(
        `Unrecognized relative repository Markdown link: ${destination}`,
      );
    }
  }

  for (const match of source.matchAll(/\b(?:href|src)="([^"]+)"/gi)) {
    const destination = match[1].trim();
    if (relativeFilePattern.test(destination)) {
      throw new Error(
        `Unrecognized relative repository HTML reference: ${destination}`,
      );
    }
  }
}

export function generateNpmReadme({ source, commit }) {
  const releaseCommit = validateCommit(commit);
  if (typeof source !== "string") {
    throw new Error("README source must be a string.");
  }

  let result = source.replaceAll(
    rawMainPrefix,
    `https://raw.githubusercontent.com/${repository}/${releaseCommit}/`,
  );
  result = rewriteMarkdownRelativeLinks(result, releaseCommit);
  result = rewriteHtmlRelativeHrefs(result, releaseCommit);
  assertNoMovableOrRelativeRefs(result);
  return result;
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!value || option !== "--commit") {
      throw new Error("Usage: node scripts/generate-npm-readme.mjs --commit <sha>");
    }
    values.commit = value;
  }
  if (!values.commit) {
    throw new Error("Usage: node scripts/generate-npm-readme.mjs --commit <sha>");
  }
  return values;
}

async function main() {
  const { commit } = parseArguments(process.argv.slice(2));
  const source = await readFile(resolve(repositoryRoot, "README.md"), "utf8");
  process.stdout.write(generateNpmReadme({ source, commit }));
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`npm README generation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
