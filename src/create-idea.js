import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import { isValidUlid, serializeIdeaStatus } from "./ideas.js";
import { whatsNext } from "./whatsnext.js";

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_ID_ATTEMPTS = 32;

function encode(value, length) {
  let encoded = "";
  for (let index = 0; index < length; index += 1) {
    encoded = ULID_ALPHABET[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return encoded;
}

export function generateUlid({ now = Date.now(), random = randomBytes(10) } = {}) {
  return encode(BigInt(now), 10) + encode(BigInt(`0x${Buffer.from(random).toString("hex")}`), 16);
}

async function pathExists(path, inspect) {
  try {
    await inspect(path);
    return true;
  } catch (caught) {
    if (caught.code === "ENOENT") return false;
    throw caught;
  }
}

async function removeOwnedFile(path, expected, read, remove) {
  let current;
  try {
    current = await read(path);
  } catch (caught) {
    if (caught.code === "ENOENT") return;
    throw caught;
  }
  const expectedBytes = Buffer.from(expected);
  if (
    current.length <= expectedBytes.length &&
    expectedBytes.subarray(0, current.length).equals(current)
  ) {
    await remove(path, { force: true });
  }
}

async function removeCreatedDirectories(created, removeDirectory) {
  for (const path of [...created].reverse()) {
    try {
      await removeDirectory(path);
    } catch {
      return;
    }
  }
}

async function ensureDirectoryPath(root, relativePath, inspect, makeDirectory, removeDirectory) {
  const created = [];
  let current = root;
  try {
    for (const segment of relativePath.split("/")) {
      current = resolve(current, segment);
      let metadata;
      try {
        metadata = await inspect(current);
      } catch (caught) {
        if (caught.code !== "ENOENT") throw caught;
      }
      if (metadata) {
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw new Error(`Ideas path segment is not a regular directory: ${current}`);
        }
        continue;
      }
      try {
        await makeDirectory(current);
        created.push(current);
      } catch (caught) {
        if (caught.code !== "EEXIST") throw caught;
        metadata = await inspect(current);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw caught;
      }
    }
    return created;
  } catch (caught) {
    await removeCreatedDirectories(created, removeDirectory);
    throw caught;
  }
}

function failure(root, preflight, caught) {
  return {
    command: "create-idea",
    ok: false,
    root,
    diagnostics: [{
      code: "idea.create.failed",
      level: "error",
      message: caught.message,
      remediation: "Preserve existing paths, resolve the filesystem error, and retry.",
    }],
    result: {
      observedPrimaryCommit: preflight.result?.observedPrimaryCommit ?? null,
      request: { kind: "create-idea" },
      selectedIdea: null,
      action: null,
      createdIdea: null,
    },
  };
}

export async function createIdea({
  generateId = generateUlid,
  operations = {},
  root = process.cwd(),
} = {}) {
  const repositoryRoot = resolve(root);
  const preflight = await whatsNext({ create: true, root: repositoryRoot });
  const routed = { ...preflight, command: "create-idea" };
  if (!preflight.ok || preflight.result.action?.code !== "create-idea") return routed;

  const loaded = await loadConfig({ root: repositoryRoot });
  if (!loaded.config) return { ...routed, ok: false, diagnostics: loaded.diagnostics };

  const inspect = operations.lstat ?? lstat;
  const makeDirectory = operations.mkdir ?? mkdir;
  const read = operations.readFile ?? readFile;
  const remove = operations.rm ?? rm;
  const removeDirectory = operations.rmdir ?? rmdir;
  const write = operations.writeFile ?? writeFile;
  let createdDirectories;
  try {
    createdDirectories = await ensureDirectoryPath(
      repositoryRoot,
      loaded.config.ideasDirectory,
      inspect,
      makeDirectory,
      removeDirectory,
    );
  } catch (caught) {
    return failure(repositoryRoot, preflight, caught);
  }

  const fail = async (caught) => {
    await removeCreatedDirectories(createdDirectories, removeDirectory);
    return failure(repositoryRoot, preflight, caught);
  };

  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const id = await generateId();
    if (!isValidUlid(id)) {
      return fail(new Error(`Generated idea id is not a canonical ULID: ${id}`));
    }
    const ideaPath = `${loaded.config.ideasDirectory}/${id}`;
    const statusPath = `${loaded.config.ideasDirectory}/${id}.status.yaml`;
    const folder = resolve(repositoryRoot, ideaPath);
    const ideaDocument = resolve(folder, "Idea.md");
    const statusFile = resolve(repositoryRoot, statusPath);
    const statusSource = serializeIdeaStatus({ version: 1, id });

    if (await pathExists(folder, inspect) || await pathExists(statusFile, inspect)) continue;

    let folderCreated = false;
    let ideaCreated = false;
    let ideaAttempted = false;
    let statusCreated = false;
    let statusAttempted = false;
    try {
      await makeDirectory(folder);
      folderCreated = true;
      ideaAttempted = true;
      await write(ideaDocument, "", { flag: "wx" });
      ideaCreated = true;
      statusAttempted = true;
      await write(
        statusFile,
        statusSource,
        { flag: "wx" },
      );
      statusCreated = true;
      return {
        command: "create-idea",
        ok: true,
        root: repositoryRoot,
        diagnostics: [],
        result: {
          observedPrimaryCommit: preflight.result.observedPrimaryCommit,
          request: { kind: "create-idea" },
          selectedIdea: null,
          createdIdea: { id, ideaPath, statusPath },
        },
      };
    } catch (caught) {
      if (statusCreated || (statusAttempted && caught.code !== "EEXIST")) {
        await removeOwnedFile(statusFile, statusSource, read, remove).catch(() => { });
      }
      if (ideaCreated || (ideaAttempted && caught.code !== "EEXIST")) {
        await removeOwnedFile(ideaDocument, "", read, remove).catch(() => { });
      }
      if (folderCreated) await removeDirectory(folder).catch(() => { });
      if (caught.code === "EEXIST") continue;
      return fail(caught);
    }
  }

  return fail(
    new Error(`Could not allocate a unique idea id after ${MAX_ID_ATTEMPTS} attempts.`),
  );
}