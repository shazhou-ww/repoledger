import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { parseStatusFile, STATUS_FILE_NAME } from "./ledger.js";
import { effectiveSourceRepository } from "./repository.js";

const PORTABLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export async function inspectLayout({ config, root }) {
  const diagnostics = [];
  const tasksRoot = resolve(root, config.tasksDirectory);
  const tasksMetadata = await metadata(tasksRoot);
  if (!tasksMetadata) {
    diagnostics.push(
      error(
        "layout.tasks.missing",
        config.tasksDirectory,
        `Configured task directory does not exist: ${config.tasksDirectory}`,
        `Create ${config.tasksDirectory} and ${config.tasksDirectory}/${STATUS_FILE_NAME}.`,
      ),
    );
    return { diagnostics, status: null, tasks: [] };
  }
  if (tasksMetadata.isSymbolicLink()) {
    diagnostics.push(
      error(
        "layout.tasks.symlink",
        config.tasksDirectory,
        "The configured task directory must not be a symbolic link.",
        "Replace it with a repository-owned directory.",
      ),
    );
    return { diagnostics, status: null, tasks: [] };
  }
  if (!tasksMetadata.isDirectory()) {
    diagnostics.push(
      error(
        "layout.tasks.not-directory",
        config.tasksDirectory,
        "The configured task path must be a directory.",
        `Replace ${config.tasksDirectory} with a directory.`,
      ),
    );
    return { diagnostics, status: null, tasks: [] };
  }

  const statusPath = resolve(tasksRoot, STATUS_FILE_NAME);
  const statusMetadata = await metadata(statusPath);
  let status = null;
  if (!statusMetadata || !statusMetadata.isFile() || statusMetadata.isSymbolicLink()) {
    diagnostics.push(
      error(
        statusMetadata ? "status.invalid-file" : "status.missing",
        displayPath(root, statusPath),
        `The task status file must be a regular file: ${displayPath(root, statusPath)}`,
        `Create a canonical ${STATUS_FILE_NAME}.`,
      ),
    );
  } else {
    try {
      status = parseStatusFile(await readFile(statusPath, "utf8"), {
        primaryRepository: config.primaryRepository,
      });
    } catch (caught) {
      diagnostics.push(
        error(
          "status.invalid",
          displayPath(root, statusPath),
          caught.message,
          `Rewrite ${displayPath(root, statusPath)} in canonical form.`,
        ),
      );
    }
  }

  const directoryNames = new Set();
  for (const entry of await readdir(tasksRoot, { withFileTypes: true })) {
    if (entry.name === STATUS_FILE_NAME) continue;
    const path = resolve(tasksRoot, entry.name);
    const pathMetadata = await metadata(path);
    const relativePath = displayPath(root, path);
    if (!PORTABLE_NAME.test(entry.name)) {
      diagnostics.push(
        error(
          "task.invalid-name",
          relativePath,
          `Task names must use lowercase kebab-case: ${entry.name}`,
          "Rename the task directory and its status key.",
        ),
      );
      continue;
    }
    if (!entry.isDirectory() || pathMetadata?.isSymbolicLink()) {
      diagnostics.push(
        error(
          "task.not-directory",
          relativePath,
          `Every task entry must be a repository-owned directory: ${relativePath}`,
          "Replace or remove the invalid task entry.",
        ),
      );
      continue;
    }
    directoryNames.add(entry.name);
  }

  const tasks = [];
  if (status) {
    const sourceOwners = new Map();
    for (const [name, record] of Object.entries(status.tasks)) {
      if (record.state !== "ongoing") continue;
      const repository = effectiveSourceRepository(config, record);
      if (
        repository === config.primaryRepository &&
        record.sourceBranch === config.primaryBranch
      ) {
        diagnostics.push(
          error(
            "task.source.primary-branch",
            `${config.tasksDirectory}/${STATUS_FILE_NAME}#tasks.${name}.sourceBranch`,
            `Ongoing task ${name} cannot use the primary branch as its source branch.`,
            `Use a dedicated branch such as task/${name}.`,
          ),
        );
      }
      const key = `${repository}\0${record.sourceBranch}`;
      const existing = sourceOwners.get(key);
      if (existing) {
        diagnostics.push(
          error(
            "task.source.duplicate",
            `${config.tasksDirectory}/${STATUS_FILE_NAME}#tasks.${name}.sourceBranch`,
            `Ongoing tasks ${existing} and ${name} advertise the same source ref.`,
            "Assign each ongoing task a unique source repository and branch pair.",
          ),
        );
      } else {
        sourceOwners.set(key, name);
      }
    }
    for (const [name, record] of Object.entries(status.tasks)) {
      const path = resolve(tasksRoot, name);
      if (!directoryNames.has(name)) {
        diagnostics.push(
          error(
            "task.directory.missing",
            displayPath(root, path),
            `Task record ${name} has no matching directory.`,
            `Create ${config.tasksDirectory}/${name} or remove the stale record through an approved migration.`,
          ),
        );
        continue;
      }
      tasks.push({
        name,
        path,
        record,
        relativePath: displayPath(root, path),
        state: record.state,
      });
    }
    for (const name of [...directoryNames].sort()) {
      if (!Object.hasOwn(status.tasks, name)) {
        const path = resolve(tasksRoot, name);
        tasks.push({
          name,
          path,
          record: { state: "unregistered" },
          relativePath: displayPath(root, path),
          state: "unregistered",
        });
      }
    }
  }

  return { diagnostics, status, statusPath, tasks };
}
