import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import { fetchPrimary, withTemporaryWorktree } from "./git.js";
import { taskLanguageMetadata } from "./language.js";
import { inspectLayout } from "./layout.js";
import { isTimestamp, TASK_STATES } from "./ledger.js";
import { effectiveSourceRepository } from "./repository.js";

const LIST_STATES = [...TASK_STATES, "unregistered"];

function diagnostic(code, message, remediation) {
  return { code, level: "error", message, remediation };
}

async function localSnapshot(root) {
  const loaded = await loadConfig({ root });
  const layout = loaded.config
    ? await inspectLayout({ config: loaded.config, root })
    : { diagnostics: [], tasks: [] };
  return {
    config: loaded.config,
    diagnostics: [...loaded.diagnostics, ...layout.diagnostics],
    tasks: layout.tasks,
  };
}

function resolvedRecord(config, record) {
  if (record.state !== "ongoing") return record;
  return {
    ...record,
    sourceRepository: effectiveSourceRepository(config, record),
  };
}

async function taskLanguage(task) {
  try {
    const source = await readFile(resolve(task.path, "Task.md"), "utf8");
    return taskLanguageMetadata(source).language;
  } catch (caught) {
    if (caught.code === "ENOENT") return undefined;
    throw caught;
  }
}

function validateFilters(filters, sort, limit) {
  const diagnostics = [];
  if (filters.states) {
    for (const state of filters.states) {
      if (!LIST_STATES.includes(state)) {
        diagnostics.push(
          diagnostic(
            "task.list.invalid-state",
            `Unknown task state: ${state}`,
            `Use one of ${LIST_STATES.join(", ")}.`,
          ),
        );
      }
    }
  }
  for (const key of [
    "createdSince",
    "createdBefore",
    "updatedSince",
    "updatedBefore",
  ]) {
    if (filters[key] !== undefined && !isTimestamp(filters[key])) {
      diagnostics.push(
        diagnostic(
          `task.list.invalid-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
          `${key} must be an exact UTC second-precision timestamp.`,
          "Use YYYY-MM-DDTHH:mm:ssZ.",
        ),
      );
    }
  }
  for (const field of ["created", "updated"]) {
    const since = filters[`${field}Since`];
    const before = filters[`${field}Before`];
    if (isTimestamp(since) && isTimestamp(before) && since >= before) {
      diagnostics.push(
        diagnostic(
          `task.list.invalid-${field}-range`,
          `${field}Since must be earlier than ${field}Before.`,
          "Use a non-empty half-open interval [since, before).",
        ),
      );
    }
  }
  if (!new Set(["name", "created", "updated"]).has(sort)) {
    diagnostics.push(
      diagnostic(
        "task.list.invalid-sort",
        `Unknown task sort: ${sort}`,
        "Use name, created, or updated.",
      ),
    );
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    diagnostics.push(
      diagnostic(
        "task.list.invalid-limit",
        "Task list limit must be a positive integer.",
        "Use an integer greater than zero.",
      ),
    );
  }
  return diagnostics;
}

function normalizedFilters(filters) {
  const result = {};
  if (filters.states?.length) result.states = [...new Set(filters.states)];
  for (const key of [
    "createdSince",
    "createdBefore",
    "updatedSince",
    "updatedBefore",
  ]) {
    if (filters[key] !== undefined) result[key] = filters[key];
  }
  return result;
}

function matchesFilters(record, filters) {
  return (
    (!filters.states?.length || filters.states.includes(record.state)) &&
    (!filters.createdSince || record.createdAt >= filters.createdSince) &&
    (!filters.createdBefore || record.createdAt < filters.createdBefore) &&
    (!filters.updatedSince || record.updatedAt >= filters.updatedSince) &&
    (!filters.updatedBefore || record.updatedAt < filters.updatedBefore)
  );
}

function compareTasks(sort) {
  if (sort === "name") return (left, right) => left.task.localeCompare(right.task);
  const field = sort === "created" ? "createdAt" : "updatedAt";
  return (left, right) => {
    if (!left[field]) return right[field] ? 1 : left.task.localeCompare(right.task);
    if (!right[field]) return -1;
    return right[field].localeCompare(left[field]) || left.task.localeCompare(right.task);
  };
}

export async function listTasks({
  filters = {},
  limit,
  local = false,
  root = process.cwd(),
  sort = "name",
} = {}) {
  const repositoryRoot = resolve(root);
  if (!local) {
    const loaded = await loadConfig({ root: repositoryRoot });
    if (!loaded.config) {
      return { command: "task list", ok: false, root: repositoryRoot, diagnostics: loaded.diagnostics, result: null };
    }
    try {
      const primary = fetchPrimary(repositoryRoot, loaded.config);
      const remote = await withTemporaryWorktree(repositoryRoot, primary, (worktree) =>
        listTasks({ filters, limit, local: true, root: worktree, sort }),
      );
      if (remote.result) remote.result = { ...remote.result, source: "remote", primary };
      remote.root = repositoryRoot;
      return remote;
    } catch (caught) {
      return {
        command: "task list",
        ok: false,
        root: repositoryRoot,
        diagnostics: [diagnostic("git.fetch.failed", caught.message, "Check remote access and retry.")],
        result: null,
      };
    }
  }
  const snapshot = await localSnapshot(repositoryRoot);
  const normalized = normalizedFilters(filters);
  const filterDiagnostics = validateFilters(normalized, sort, limit);
  const diagnostics = [...snapshot.diagnostics, ...filterDiagnostics];
  if (diagnostics.some(({ level }) => level === "error")) {
    return { command: "task list", ok: false, root: repositoryRoot, diagnostics, result: null };
  }

  let tasks = snapshot.tasks
    .map(({ name, record }) => ({ task: name, ...resolvedRecord(snapshot.config, record) }))
    .filter((record) => matchesFilters(record, normalized))
    .sort(compareTasks(sort));
  if (limit !== undefined) tasks = tasks.slice(0, limit);

  return {
    command: "task list",
    ok: true,
    root: repositoryRoot,
    diagnostics,
    result: { source: "local", filters: normalized, sort, tasks },
  };
}

export async function statusRepository({
  local = false,
  root = process.cwd(),
  taskName,
} = {}) {
  const repositoryRoot = resolve(root);
  if (!local) {
    const loaded = await loadConfig({ root: repositoryRoot });
    if (!loaded.config) {
      return { command: "status", ok: false, root: repositoryRoot, diagnostics: loaded.diagnostics, result: null };
    }
    try {
      const primary = fetchPrimary(repositoryRoot, loaded.config);
      const remote = await withTemporaryWorktree(repositoryRoot, primary, (worktree) =>
        statusRepository({ local: true, root: worktree, taskName }),
      );
      if (remote.result) remote.result = { ...remote.result, source: "remote", primary };
      remote.root = repositoryRoot;
      return remote;
    } catch (caught) {
      return {
        command: "status",
        ok: false,
        root: repositoryRoot,
        diagnostics: [diagnostic("git.fetch.failed", caught.message, "Check remote access and retry.")],
        result: null,
      };
    }
  }
  const snapshot = await localSnapshot(repositoryRoot);
  const task = snapshot.tasks.find(({ name }) => name === taskName);
  const diagnostics = [...snapshot.diagnostics];
  if (!task) {
    diagnostics.push({
      ...diagnostic(
        "task.selection.missing",
        `Task ${taskName} does not exist in the repository ledger.`,
        "Choose a task name reported by repoledger task list.",
      ),
      task: taskName,
    });
  }
  const language = task ? await taskLanguage(task) : undefined;
  return {
    command: "status",
    ok: diagnostics.every(({ level }) => level !== "error"),
    root: repositoryRoot,
    diagnostics,
    result: task
      ? {
        source: "local",
        task: task.name,
        ...resolvedRecord(snapshot.config, task.record),
        ...(language === undefined ? {} : { language }),
      }
      : null,
  };
}
