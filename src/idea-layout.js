import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { deriveIdeaState, isValidUlid, parseIdeaStatus } from "./ideas.js";
import { gitObjectIdLength, runGit, worktreePathTree } from "./git.js";
import { IDEAS_ROOT, ideaPaths } from "./layout.js";

const REVISION_BINDINGS = {
  approvedRevision: "idealRevision",
  implementationAcceptedRevision: "implementationRevision",
  deploymentAcceptedRevision: "deploymentRevision",
};

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
  for (const key of Object.keys(REVISION_BINDINGS)) {
    if (!status[key]) continue;
    const type = runGit(root, ["cat-file", "-t", status[key]]);
    if (!type.ok || type.stdout !== "tree") {
      diagnostics.push(error(
        "idea.revision.invalid-object",
        `${statusPath}#${key}`,
        `${key} must resolve to a Git tree object: ${status[key]}`,
        "Use the current corresponding world tree object ID from Git.",
      ));
    }
  }
}

function validateRevisionHistory(root, commit, idea, diagnostics) {
  for (const [statusKey, revisionKey] of Object.entries(REVISION_BINDINGS)) {
    const revision = idea.status[statusKey];
    if (!revision) continue;
    const history = runGit(root, [
      "log",
      "--reverse",
      "--format=%H",
      "-S",
      `${statusKey}: ${revision}`,
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
        `${idea.statusPath}#${statusKey}`,
        `Primary history does not prove when ${statusKey} recorded ${revision}.`,
        "Fetch complete primary history or repair the decision through a forward commit.",
      ));
      continue;
    }
    const tree = runGit(root, ["rev-parse", `${evidenceCommit}:${idea.worlds[revisionKey].path}`]);
    if (!tree.ok || tree.stdout !== revision) {
      diagnostics.push(error(
        "idea.revision.history-mismatch",
        `${idea.statusPath}#${statusKey}`,
        `${statusKey} was not bound to its world tree in commit ${evidenceCommit}.`,
        "Record the decision only for the corresponding world tree in the same candidate commit.",
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
  for (const [statusKey, revisionKey] of Object.entries(REVISION_BINDINGS)) {
    if (
      idea.status[statusKey] === previous[statusKey] ||
      idea.status[statusKey] === undefined
    ) continue;
    const expected = idea.revisions[revisionKey];
    if (idea.status[statusKey] !== expected) {
      diagnostics.push(error(
        "idea.revision.candidate-mismatch",
        `${idea.statusPath}#${statusKey}`,
        `${statusKey} must equal the corresponding world tree in the same candidate snapshot.`,
        `Use ${expected} for ${revisionKey} or omit the stale mutation.`,
      ));
    }
  }
}

async function requireDirectory(root, path, diagnostics) {
  const absolute = resolve(root, path);
  const value = await metadata(absolute);
  if (!value || !value.isDirectory() || value.isSymbolicLink()) {
    diagnostics.push(error(
      "idea.world.invalid-directory",
      path,
      `Required world path must be a repository-owned regular directory: ${path}`,
      `Create ${path} as a regular directory without symlinks.`,
    ));
    return false;
  }
  return true;
}

async function requireDocument(root, path, diagnostics) {
  const absolute = resolve(root, path);
  const value = await metadata(absolute);
  if (!value || !value.isFile() || value.isSymbolicLink()) {
    diagnostics.push(error(
      "idea.world.missing-document",
      path,
      `Required world entry must be a repository-owned regular file: ${path}`,
      `Create ${path} as a regular file without symlinks.`,
    ));
    return false;
  }
  return true;
}

async function rejectSymlinks(root, path, diagnostics) {
  const absolute = resolve(root, path);
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const entryPath = `${path}/${entry.name}`;
    const value = await lstat(resolve(root, entryPath));
    if (value.isSymbolicLink()) {
      diagnostics.push(error(
        "idea.world.symlink",
        entryPath,
        `World content must not use symlinks: ${entryPath}`,
        "Replace the symlink with repository-owned regular content.",
      ));
      continue;
    }
    if (value.isDirectory()) await rejectSymlinks(root, entryPath, diagnostics);
  }
}

function resolveTree({ gitRoot, root, snapshotTree }, path) {
  if (snapshotTree) {
    const resolved = runGit(gitRoot, ["rev-parse", `${snapshotTree}:${path}`]);
    if (!resolved.ok) throw new Error(resolved.stderr || `Cannot resolve ${path}`);
    return resolved.stdout;
  }
  return worktreePathTree(root, path);
}

export async function inspectIdeaLayout({
  baseRevision,
  config: _config,
  historyCommit,
  root,
  gitRoot = root,
  snapshotTree,
  validateCandidate = false,
}) {
  const diagnostics = [];
  const ideasRoot = resolve(root, IDEAS_ROOT);
  const ideasRootMetadata = await metadata(ideasRoot);
  if (!ideasRootMetadata) {
    return {
      diagnostics: [error(
        "layout.ideas.missing",
        IDEAS_ROOT,
        `Silvermoon ideas directory does not exist: ${IDEAS_ROOT}`,
        `Create ${IDEAS_ROOT} as a repository-owned directory.`,
      )],
      ideas: [],
    };
  }
  if (!ideasRootMetadata.isDirectory() || ideasRootMetadata.isSymbolicLink()) {
    return {
      diagnostics: [error(
        "layout.ideas.invalid",
        IDEAS_ROOT,
        "The Silvermoon ideas path must be a repository-owned regular directory.",
        `Replace ${IDEAS_ROOT} with a regular directory.`,
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
        IDEAS_ROOT,
        caught.message,
        "Run Silvermoon inside a Git repository with a supported object format.",
      )],
      ideas: [],
    };
  }

  const aliases = new Map();
  const ideas = [];
  const caseNames = new Map();
  for (const entry of await readdir(ideasRoot, { withFileTypes: true })) {
    const folderPath = resolve(ideasRoot, entry.name);
    const folderMetadata = await lstat(folderPath);
    const relativePath = displayPath(root, folderPath);
    const folded = entry.name.toUpperCase();
    const existingCase = caseNames.get(folded);
    if (existingCase && existingCase !== entry.name) {
      diagnostics.push(error(
        "idea.id.case-collision",
        relativePath,
        `Idea identities collide by case: ${existingCase} and ${entry.name}.`,
        "Keep exactly one canonical uppercase ULID identity.",
      ));
    } else {
      caseNames.set(folded, entry.name);
    }
    if (!isValidUlid(entry.name)) {
      diagnostics.push(error(
        "idea.id.invalid",
        relativePath,
        `Idea folders must use canonical ULID identities: ${entry.name}`,
        "Rename the folder to one canonical uppercase ULID.",
      ));
      continue;
    }
    if (!folderMetadata.isDirectory() || folderMetadata.isSymbolicLink()) {
      diagnostics.push(error(
        "idea.folder.invalid",
        relativePath,
        "Idea must be a repository-owned regular directory.",
        "Replace it with a regular directory.",
      ));
      continue;
    }

    const paths = ideaPaths(entry.name);
    for (const child of await readdir(folderPath, { withFileTypes: true })) {
      if (child.name === "status.yaml" || child.name === "outer") continue;
      diagnostics.push(error(
        child.name.toLowerCase().includes("status")
          ? "idea.status.unexpected-file"
          : "idea.entry.unexpected",
        `${paths.ideaPath}/${child.name}`,
        `Unexpected entry at the idea root: ${child.name}`,
        "Keep only status.yaml and outer/ at the idea root; put supporting files in their world.",
      ));
    }
    const requiredDirectories = [
      paths.outerPath,
      paths.innerPath,
      paths.idealPath,
    ];
    const requiredDocuments = [
      paths.deploymentDocumentPath,
      paths.implementationDocumentPath,
      paths.ideaDocumentPath,
    ];
    const validDirectories = (await Promise.all(
      requiredDirectories.map((path) => requireDirectory(root, path, diagnostics)),
    )).every(Boolean);
    const validDocuments = (await Promise.all(
      requiredDocuments.map((path) => requireDocument(root, path, diagnostics)),
    )).every(Boolean);
    if (validDirectories) await rejectSymlinks(root, paths.outerPath, diagnostics);

    const statusMetadata = await metadata(resolve(root, paths.statusPath));
    if (!statusMetadata || !statusMetadata.isFile() || statusMetadata.isSymbolicLink()) {
      diagnostics.push(error(
        "idea.status.invalid-file",
        paths.statusPath,
        "Idea status must be a repository-owned regular file named status.yaml.",
        `Create ${paths.statusPath} as canonical YAML.`,
      ));
      continue;
    }

    let status;
    try {
      status = parseIdeaStatus(
        await readFile(resolve(root, paths.statusPath), "utf8"),
        { objectIdLength },
      );
    } catch (caught) {
      diagnostics.push(error(
        "idea.status.invalid",
        paths.statusPath,
        caught.message,
        "Rewrite status.yaml in canonical form.",
      ));
      continue;
    }
    if (status.id !== entry.name) {
      diagnostics.push(error(
        "idea.status.id-mismatch",
        `${paths.statusPath}#id`,
        `Status id ${status.id} does not match ${entry.name}.`,
        "Use the same canonical ULID in the folder and status id.",
      ));
    }
    if (status.alias !== undefined) {
      const aliasOwner = aliases.get(status.alias);
      if (aliasOwner) {
        diagnostics.push(error(
          "idea.alias.duplicate",
          `${paths.statusPath}#alias`,
          `Alias ${status.alias} is shared by ${aliasOwner} and ${entry.name}.`,
          "Assign a unique exact case-sensitive alias.",
        ));
      } else {
        aliases.set(status.alias, entry.name);
      }
    }
    if (
      !validDirectories ||
      !validDocuments ||
      diagnostics.some(({ code, path }) =>
        code === "idea.world.symlink" && path.startsWith(`${paths.outerPath}/`)
      )
    ) continue;

    let revisions;
    try {
      revisions = {
        idealRevision: resolveTree({ gitRoot, root, snapshotTree }, paths.idealPath),
        implementationRevision: resolveTree(
          { gitRoot, root, snapshotTree },
          paths.innerPath,
        ),
        deploymentRevision: resolveTree(
          { gitRoot, root, snapshotTree },
          paths.outerPath,
        ),
      };
    } catch (caught) {
      diagnostics.push(error(
        "idea.revision.unavailable",
        paths.ideaPath,
        caught.message,
        "Ensure every world can be represented as a Git tree.",
      ));
      continue;
    }

    validateRevisionObjects(gitRoot, paths.statusPath, status, diagnostics);
    const worlds = {
      idealRevision: {
        name: "Ideal World",
        displayName: "道心",
        path: paths.idealPath,
        documentPath: paths.ideaDocumentPath,
      },
      implementationRevision: {
        name: "Inner World",
        displayName: "内景",
        path: paths.innerPath,
        documentPath: paths.implementationDocumentPath,
      },
      deploymentRevision: {
        name: "Outer World",
        displayName: "现世",
        path: paths.outerPath,
        documentPath: paths.deploymentDocumentPath,
      },
    };
    const idea = {
      id: entry.name,
      path: folderPath,
      relativePath: paths.ideaPath,
      revisions,
      ...revisions,
      state: deriveIdeaState(revisions, status),
      status,
      statusPath: paths.statusPath,
      worlds,
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
