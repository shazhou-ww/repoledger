import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import {
  DEPLOYMENT_TEMPLATE,
  IDEA_TEMPLATE,
  IMPLEMENTATION_TEMPLATE,
  LEDGER_TEMPLATE,
} from "./idea-templates.js";
import { isValidUlid, serializeIdeaStatus } from "./ideas.js";
import { canonicalizeLanguageTag } from "./language.js";
import { IDEAS_ROOT, ideaPaths } from "./layout.js";
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
          throw new Error(`Silvermoon path segment is not a regular directory: ${current}`);
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
  language,
  operations = {},
  root = process.cwd(),
  userHome,
} = {}) {
  const repositoryRoot = resolve(root);
  let canonicalLanguage;
  if (language !== undefined) {
    try {
      canonicalLanguage = canonicalizeLanguageTag(language);
    } catch (caught) {
      return {
        command: "create-idea",
        ok: false,
        root: repositoryRoot,
        diagnostics: [{
          code: "idea.language.invalid",
          level: "error",
          message: caught.message,
          remediation: "Use a valid BCP 47 tag such as en or zh-CN.",
        }],
        result: {
          observedPrimaryCommit: null,
          request: { kind: "create-idea" },
          selectedIdea: null,
          action: null,
          createdIdea: null,
        },
      };
    }
  }
  const preflight = await whatsNext({
    create: true,
    root: repositoryRoot,
    userHome,
  });
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
  let rootDirectories;
  try {
    rootDirectories = await ensureDirectoryPath(
      repositoryRoot,
      IDEAS_ROOT,
      inspect,
      makeDirectory,
      removeDirectory,
    );
  } catch (caught) {
    return failure(repositoryRoot, preflight, caught);
  }

  const failRoot = async (caught) => {
    await removeCreatedDirectories(rootDirectories, removeDirectory);
    return failure(repositoryRoot, preflight, caught);
  };

  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const id = await generateId();
    if (!isValidUlid(id)) {
      return failRoot(new Error(`Generated idea id is not a canonical ULID: ${id}`));
    }
    const paths = ideaPaths(id);
    const folder = resolve(repositoryRoot, paths.ideaPath);
    if (await pathExists(folder, inspect)) continue;

    const directoryPaths = [
      paths.ideaPath,
      paths.outerPath,
      paths.innerPath,
      paths.idealPath,
    ];
    const files = [
      [paths.ideaDocumentPath, IDEA_TEMPLATE],
      [paths.implementationDocumentPath, IMPLEMENTATION_TEMPLATE],
      [paths.deploymentDocumentPath, DEPLOYMENT_TEMPLATE],
      [paths.ledgerPath, LEDGER_TEMPLATE],
      [paths.statusPath, serializeIdeaStatus({
        version: 1,
        id,
        ...(canonicalLanguage === undefined ? {} : { language: canonicalLanguage }),
      })],
    ];
    const createdDirectories = [];
    const cleanupFiles = [];
    try {
      for (const relativePath of directoryPaths) {
        const absolutePath = resolve(repositoryRoot, relativePath);
        await makeDirectory(absolutePath);
        createdDirectories.push(absolutePath);
      }
      for (const [relativePath, source] of files) {
        const absolutePath = resolve(repositoryRoot, relativePath);
        const cleanup = [absolutePath, source];
        cleanupFiles.push(cleanup);
        try {
          await write(absolutePath, source, { flag: "wx" });
        } catch (caught) {
          if (caught.code === "EEXIST") cleanupFiles.pop();
          throw caught;
        }
      }
      return {
        command: "create-idea",
        ok: true,
        root: repositoryRoot,
        diagnostics: [],
        result: {
          observedPrimaryCommit: preflight.result.observedPrimaryCommit,
          request: { kind: "create-idea" },
          selectedIdea: null,
          createdIdea: {
            id,
            ideaPath: paths.ideaPath,
            statusPath: paths.statusPath,
            ideaDocumentPath: paths.ideaDocumentPath,
            implementationDocumentPath: paths.implementationDocumentPath,
            deploymentDocumentPath: paths.deploymentDocumentPath,
            ledgerPath: paths.ledgerPath,
            ...(canonicalLanguage === undefined ? {} : { language: canonicalLanguage }),
          },
        },
      };
    } catch (caught) {
      for (const [path, source] of [...cleanupFiles].reverse()) {
        await removeOwnedFile(path, source, read, remove).catch(() => { });
      }
      await removeCreatedDirectories(createdDirectories, removeDirectory);
      if (caught.code === "EEXIST") continue;
      return failRoot(caught);
    }
  }

  return failRoot(
    new Error(`Could not allocate a unique idea id after ${MAX_ID_ATTEMPTS} attempts.`),
  );
}
