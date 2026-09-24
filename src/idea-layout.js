import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { deriveIdeaState, isValidUlid, parseIdeaStatus } from "./ideas.js";
import { gitObjectIdLength, runGit, worktreePathTree } from "./git.js";

const STATUS_SUFFIX = ".status.yaml";

function displayPath(root, path) {
  return relative(root, path).replaceAll("\\", "/");
}

function error(code, path, message, remediation) {
  return { code, level: "error", path, message, remediation };
}

async function metadata(path) {
  try {
    return await lstat(path);
  } catch (caught) {
    if (caught.code === "ENOENT") return null;
    throw caught;
  }
}

function validateRevisionObjects(root, statusPath, status, diagnostics) {
  for (const key of [
    "approvedRevision",
    "implementationAcceptedRevision",
    "deploymentAcceptedRevision",
  ]) {
    if (!status[key]) continue;
    const type = runGit(root, ["cat-file", "-t", status[key]]);
    if (!type.ok || type.stdout !== "tree") {
      diagnostics.push(error(
        "idea.revision.invalid-object",
        `${statusPath}#${key}`,
        `${key} must resolve to a Git tree object: ${status[key]}`,
        "Use the current idea folder tree object ID from Git.",
      ));
    }
  }
}

function validateRevisionHistory(root, commit, idea, diagnostics) {
  for (const key of [
    "approvedRevision",
    "implementationAcceptedRevision",
    "deploymentAcceptedRevision",
  ]) {
    const revision = idea.status[key];
    if (!revision) continue;
    const history = runGit(root, [
      "log",
      "--reverse",
      "--format=%H",
      "-S",
      `${key}: ${revision}`,
      commit,
      "--",
      idea.statusPath,
    ]);
    const evidenceCommit = history.ok
      ? history.stdout.split(/\r?\n/).filter(Boolean)[0]
      : null;
    if (!evidenceCommit) {
      const shallow = runGit(root, ["rev-parse", "--is-shallow-repository"]);
      diagnostics.push(error(
        shallow.ok && shallow.stdout === "true"
          ? "history.incomplete"
          : "idea.revision.history-missing",
        `${idea.statusPath}#${key}`,
        `Primary history does not prove when ${key} recorded ${revision}.`,
        "Fetch complete primary history or repair the acceptance through a forward commit.",
      ));
      continue;
    }
    const tree = runGit(root, ["rev-parse", `${evidenceCommit}:${idea.relativePath}`]);
    if (!tree.ok || tree.stdout !== revision) {
      diagnostics.push(error(
        "idea.revision.history-mismatch",
        `${idea.statusPath}#${key}`,
        `${key} was not bound to the idea tree in commit ${evidenceCommit}.`,
        "Record acceptance only for the idea tree in the same candidate commit.",
      ));
    }
  }
}

function validateCandidateRevisions(root, baseRevision, idea, diagnostics, objectIdLength) {
  let previous = {};
  if (baseRevision) {
    const previousSource = runGit(root, ["show", `${baseRevision}:${idea.statusPath}`]);
    if (previousSource.ok) {
      try {
        previous = parseIdeaStatus(previousSource.stdout + "\n", { objectIdLength });
      } catch {
        previous = {};
      }
    }
  }
  for (const key of [
    "approvedRevision",
    "implementationAcceptedRevision",
    "deploymentAcceptedRevision",
  ]) {
    if (idea.status[key] === previous[key] || idea.status[key] === undefined) continue;
    if (idea.status[key] !== idea.revision) {
      diagnostics.push(error(
        "idea.revision.candidate-mismatch",
        `${idea.statusPath}#${key}`,
        `${key} must equal the idea tree in the same candidate snapshot.`,
        `Use ${idea.revision} for the current idea revision or omit the stale mutation.`,
      ));
    }
  }
}

export async function inspectIdeaLayout({
  baseRevision,
  config,
  historyCommit,
  root,
  gitRoot = root,
  snapshotTree,
  validateCandidate = false,
}) {
  const diagnostics = [];
  const ideasRoot = resolve(root, config.ideasDirectory);
  const ideasRootMetadata = await metadata(ideasRoot);
  if (!ideasRootMetadata) {
    return {
      diagnostics: [error(
        "layout.ideas.missing",
        config.ideasDirectory,
        `Configured ideas directory does not exist: ${config.ideasDirectory}`,
        `Create ${config.ideasDirectory} as a repository-owned directory.`,
      )],
      ideas: [],
    };
  }
  if (!ideasRootMetadata.isDirectory() || ideasRootMetadata.isSymbolicLink()) {
    return {
      diagnostics: [error(
        "layout.ideas.invalid",
        config.ideasDirectory,
        "The configured ideas path must be a repository-owned directory.",
        `Replace ${config.ideasDirectory} with a regular directory.`,
      )],
      ideas: [],
    };
  }

  let objectIdLength;
  try {
    objectIdLength = gitObjectIdLength(gitRoot);
  } catch (caught) {
    return {
      diagnostics: [error(
        "git.object-format.unavailable",
        config.ideasDirectory,
        caught.message,
        "Run Repoledger inside a Git repository with a supported object format.",
      )],
      ideas: [],
    };
  }

  const folders = new Map();
  const statuses = new Map();
  const caseNames = new Map();
  for (const entry of await readdir(ideasRoot, { withFileTypes: true })) {
    const path = resolve(ideasRoot, entry.name);
    const pathMetadata = await lstat(path);
    const relativePath = displayPath(root, path);
    const rawId = entry.name.endsWith(STATUS_SUFFIX)
      ? entry.name.slice(0, -STATUS_SUFFIX.length)
      : entry.name;
    const folded = rawId.toUpperCase();
    const existingCase = caseNames.get(folded);
    if (existingCase && existingCase !== rawId) {
      diagnostics.push(error(
        "idea.id.case-collision",
        relativePath,
        `Idea identities collide by case: ${existingCase} and ${rawId}.`,
        "Keep exactly one canonical uppercase ULID identity.",
      ));
    } else {
      caseNames.set(folded, rawId);
    }
    if (!isValidUlid(rawId)) {
      diagnostics.push(error(
        "idea.id.invalid",
        relativePath,
        `Idea entries must use canonical ULID identities: ${entry.name}`,
        "Rename the folder and sibling status file to the same canonical ULID.",
      ));
      continue;
    }
    if (entry.name.endsWith(STATUS_SUFFIX)) {
      if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink()) {
        diagnostics.push(error(
          "idea.status.invalid-file",
          relativePath,
          "Idea status must be a repository-owned regular file.",
          "Replace it with a regular canonical YAML file.",
        ));
      } else {
        statuses.set(rawId, { path, relativePath });
      }
    } else if (!pathMetadata.isDirectory() || pathMetadata.isSymbolicLink()) {
      diagnostics.push(error(
        "idea.folder.invalid",
        relativePath,
        "Idea definition must be a repository-owned directory.",
        "Replace it with a regular directory.",
      ));
    } else {
      folders.set(rawId, { path, relativePath });
    }
  }

  const aliases = new Map();
  const ideas = [];
  for (const id of [...new Set([...folders.keys(), ...statuses.keys()])].sort()) {
    const folder = folders.get(id);
    const statusFile = statuses.get(id);
    if (!folder || !statusFile) {
      diagnostics.push(error(
        "idea.pair.missing",
        folder?.relativePath ?? statusFile?.relativePath,
        `Idea ${id} must have both a folder and sibling status file.`,
        `Create the missing ${folder ? `${id}${STATUS_SUFFIX}` : `${id}/`} entry.`,
      ));
      continue;
    }
    let status;
    try {
      status = parseIdeaStatus(await readFile(statusFile.path, "utf8"), { objectIdLength });
    } catch (caught) {
      diagnostics.push(error(
        "idea.status.invalid",
        statusFile.relativePath,
        caught.message,
        "Rewrite the sibling status file in canonical form.",
      ));
      continue;
    }
    if (status.id !== id) {
      diagnostics.push(error(
        "idea.status.id-mismatch",
        `${statusFile.relativePath}#id`,
        `Status id ${status.id} does not match ${id}.`,
        "Use the same canonical ULID in the folder, filename, and status id.",
      ));
    }
    if (status.alias !== undefined) {
      const aliasOwner = aliases.get(status.alias);
      if (aliasOwner) {
        diagnostics.push(error(
          "idea.alias.duplicate",
          `${statusFile.relativePath}#alias`,
          `Alias ${status.alias} is shared by ${aliasOwner} and ${id}.`,
          "Assign a unique exact case-sensitive alias in the observed primary.",
        ));
      } else {
        aliases.set(status.alias, id);
      }
    }

    let revision;
    try {
      if (snapshotTree) {
        const resolved = runGit(gitRoot, ["rev-parse", `${snapshotTree}:${folder.relativePath}`]);
        if (!resolved.ok) throw new Error(resolved.stderr || `Cannot resolve ${folder.relativePath}`);
        revision = resolved.stdout;
      } else {
        revision = worktreePathTree(root, folder.relativePath);
      }
    } catch (caught) {
      diagnostics.push(error(
        "idea.revision.unavailable",
        folder.relativePath,
        caught.message,
        "Ensure the idea folder can be represented as a Git tree.",
      ));
      continue;
    }
    validateRevisionObjects(gitRoot, statusFile.relativePath, status, diagnostics);
    const idea = {
      id,
      path: folder.path,
      relativePath: folder.relativePath,
      revision,
      state: deriveIdeaState(revision, status),
      status,
      statusPath: statusFile.relativePath,
    };
    if (status.alias !== undefined) idea.alias = status.alias;
    if (validateCandidate) {
      validateCandidateRevisions(gitRoot, baseRevision, idea, diagnostics, objectIdLength);
    }
    if (historyCommit) validateRevisionHistory(gitRoot, historyCommit, idea, diagnostics);
    ideas.push(idea);
  }

  return { diagnostics, ideas };
}