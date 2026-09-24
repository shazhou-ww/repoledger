import { cp, lstat, readFile, readdir, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const canonical = resolve(repositoryRoot, "skills", "silvermoon");
const registration = resolve(repositoryRoot, ".github", "skills", "silvermoon");
const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === "--check";

if (args.length > 0 && !checkOnly) {
  throw new Error("Usage: node scripts/sync-skills.mjs [--check]");
}

async function files(root) {
  const result = new Map();

  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        result.set(relative(root, path).split(sep).join("/"), await readFile(path));
      } else {
        throw new Error(`Skill contains a non-regular path: ${path}`);
      }
    }
  }

  await visit(root);
  return result;
}

async function assertSynchronized() {
  const expected = await files(canonical);
  let actual;
  try {
    const metadata = await lstat(registration);
    if (!metadata.isDirectory()) {
      throw new Error(`Skill registration is not a directory: ${registration}`);
    }
    actual = await files(registration);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Skill registration is missing: ${registration}`);
    }
    throw error;
  }

  const differences = [];
  for (const [path, contents] of expected) {
    if (!actual.has(path)) {
      differences.push(`missing ${path}`);
    } else if (!contents.equals(actual.get(path))) {
      differences.push(`changed ${path}`);
    }
  }
  for (const path of actual.keys()) {
    if (!expected.has(path)) differences.push(`unexpected ${path}`);
  }
  if (differences.length > 0) {
    throw new Error(
      `Repository skill is out of sync; run pnpm sync:skills:\n${differences.join("\n")}`,
    );
  }

  return expected.size;
}

if (!checkOnly) {
  await rm(registration, { force: true, recursive: true });
  await cp(canonical, registration, { errorOnExist: true, recursive: true });
}

const count = await assertSynchronized();
process.stdout.write(`${checkOnly ? "SKILLS_CHECK_OK" : "SKILLS_SYNC_OK"} files=${count}\n`);
