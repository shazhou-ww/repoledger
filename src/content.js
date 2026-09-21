import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { taskLanguageMetadata } from "./language.js";
import { parseMarkdown, sectionText } from "./markdown.js";

const TASK_HEADINGS = [
  "Goal",
  "Context",
  "Scope",
  "Out of scope",
  "Acceptance criteria",
  "Constraints",
  "References",
];
const PROGRESS_HEADINGS = [
  "Current state",
  "Decisions",
  "Validation",
  "Blockers",
  "Outcome",
];
const USER_ACCEPTANCE_HEADINGS = [
  "Purpose",
  "Test target",
  "Preconditions",
  "Steps",
  "Expected results",
  "Report outcome",
  "Status",
];
const HUMAN_REVIEW_CHECKPOINTS = [
  "Scope",
  "Interface",
  "Business and data model",
  "Architecture",
  "Delivery acceptance",
];
const REQUIRED_HUMAN_REVIEW_CHECKPOINTS = new Set([
  "Scope",
  "Delivery acceptance",
]);
const HUMAN_APPROVAL_STATUSES = new Set([
  "Pending",
  "Approved",
  "Not applicable",
  "Reopened",
]);
const REVIEW_APPLICABILITIES = new Set([
  "Required",
  "Not applicable",
  "Assess during execution",
]);
const PLACEHOLDER_VALUES = new Set([
  "<Required, Not applicable: reason, or Assess during execution: trigger>",
  "<Reviewer or role>",
  "<Pending or Not applicable>",
]);

function diagnostic(code, level, path, message, remediation) {
  return { code, level, path, message, remediation };
}

function error(code, path, message, remediation) {
  return diagnostic(code, "error", path, message, remediation);
}

function warning(code, path, message, remediation) {
  return diagnostic(code, "warning", path, message, remediation);
}

function info(code, path, message, remediation) {
  return diagnostic(code, "info", path, message, remediation);
}

function displayPath(root, path) {
  return relative(root, path).replaceAll("\\", "/");
}

async function isFile(path) {
  try {
    const metadata = await lstat(path);
    return metadata.isFile() && !metadata.isSymbolicLink();
  } catch (caught) {
    if (caught.code === "ENOENT") return false;
    throw caught;
  }
}

async function validateArtifactTree({ diagnostics, root, path }) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    const artifactPath = displayPath(root, entryPath);
    const metadata = await lstat(entryPath);
    if (metadata.isSymbolicLink()) {
      diagnostics.push(
        error(
          "task.artifact.symlink",
          artifactPath,
          `Task artifacts must not be symbolic links: ${artifactPath}`,
          "Replace the link with a regular repository-owned file or directory.",
        ),
      );
      continue;
    }
    if (metadata.isDirectory()) {
      await validateArtifactTree({ diagnostics, root, path: entryPath });
    } else if (!metadata.isFile()) {
      diagnostics.push(
        error(
          "task.artifact.invalid-type",
          artifactPath,
          `Unsupported task artifact type: ${artifactPath}`,
          "Use regular repository-owned files and directories only.",
        ),
      );
    }
  }
}

function missingHeadings(document, required) {
  return required.filter((heading) => !document.headings.has(heading));
}

function firstList(section) {
  return section.find(({ type }) => type === "list");
}

function validateAcceptanceCriteria({
  diagnostics,
  document,
  filePath,
  outcome,
  root,
  state,
}) {
  const list = firstList(document.section("Acceptance criteria"));
  const taskItems = list?.items.filter(({ task }) => task) ?? [];
  if (taskItems.length === 0) {
    diagnostics.push(
      error(
        "task.acceptance.missing-checklist",
        displayPath(root, filePath),
        "Acceptance criteria must contain at least one task-list item.",
        "Express each observable acceptance criterion as a Markdown checkbox.",
      ),
    );
    return;
  }
  if (
    state === "completed" &&
    outcome === "Completed" &&
    taskItems.some(({ checked }) => checked !== true)
  ) {
    diagnostics.push(
      error(
        "task.acceptance.incomplete",
        displayPath(root, filePath),
        "Completed task acceptance criteria contain unchecked items.",
        "Record the actual result before completion, or mark the task abandoned.",
      ),
    );
  }
}

function namedTableRows(document, sectionName) {
  const table = document
    .section(sectionName)
    .find(({ type }) => type === "table");
  if (!table) return null;
  return new Map(
    table.rows.map((row) => [
      row[0]?.text.trim(),
      row.map((cell) => cell.text.trim()),
    ]),
  );
}

function hasPlaceholder(value) {
  const normalized = value?.replace(/^`([^`]*)`$/, "$1");
  return !normalized || PLACEHOLDER_VALUES.has(normalized);
}

function containsFact(value, facts) {
  return [...facts].some((fact) => {
    const start = value.indexOf(fact);
    if (start === -1) return false;
    const before = value[start - 1];
    const after = value[start + fact.length];
    return (!before || /[^A-Za-z]/.test(before)) && (!after || /[^A-Za-z]/.test(after));
  });
}

function parseAnnotatedFact(value, facts, separators = ":-–—") {
  const separatorPattern = separators.replace(/[\\\]^\-]/g, "\\$&");
  const ordered = [...facts].sort((left, right) => right.length - left.length);
  for (const fact of ordered) {
    if (value === fact) return { annotation: "", fact };
    if (!value.startsWith(fact)) continue;
    const remainder = value.slice(fact.length);
    const match = new RegExp(`^\\s*[${separatorPattern}]\\s*(\\S[\\s\\S]*)$`).exec(remainder);
    if (!match || containsFact(match[1], facts)) return null;
    return { annotation: match[1], fact };
  }
  return null;
}

function parseOutcome(value) {
  const facts = new Set(["Completed", "Abandoned"]);
  const match = /^(Completed|Abandoned)(?=$|[\s.,:;!?–—-])/.exec(value);
  if (!match || containsFact(value.slice(match[0].length), facts)) return null;
  return match[1];
}

function parseAcceptanceStatus(value) {
  const result = parseAnnotatedFact(value, new Set(["Pending", "Accepted"]), ".:-–—");
  if (result) return result.fact;
  if (/^Failed at step [1-9]\d*:\s+\S/.test(value)) return "Failed";
  return null;
}

function validateHumanReviewPlan({ diagnostics, document, filePath, root, state }) {
  const path = displayPath(root, filePath);
  if (!document.headings.has("Human review checkpoints")) {
    if (!["completed", "abandoned"].includes(state)) {
      diagnostics.push(
        error(
          "task.human-review.missing",
          path,
          "Active task is missing its human review checkpoint plan.",
          "Add the Human review checkpoints section from the current task template.",
        ),
      );
    }
    return null;
  }

  const rows = namedTableRows(document, "Human review checkpoints");
  if (!rows) {
    diagnostics.push(
      error(
        "task.human-review.table-missing",
        path,
        "Human review checkpoints are missing their planning table.",
        "Add the checkpoint, applicability, reviewer, artifact, and approval-gate table from the current task template.",
      ),
    );
    return new Map();
  }

  for (const checkpoint of HUMAN_REVIEW_CHECKPOINTS) {
    const row = rows.get(checkpoint);
    if (!row) {
      diagnostics.push(
        error(
          "task.human-review.row-missing",
          path,
          `Human review plan is missing the ${checkpoint} checkpoint.`,
          `Add the ${checkpoint} row from the current task template.`,
        ),
      );
      continue;
    }

    const applicability = row[1] ?? "";
    const parsedApplicability = parseAnnotatedFact(applicability, REVIEW_APPLICABILITIES);
    const required = parsedApplicability?.fact === "Required";
    const notApplicable = parsedApplicability?.fact === "Not applicable";
    const assessLater = parsedApplicability?.fact === "Assess during execution";
    if (
      hasPlaceholder(applicability) ||
      !parsedApplicability ||
      (!required && !notApplicable && !assessLater) ||
      ((notApplicable || assessLater) && !parsedApplicability.annotation) ||
      (REQUIRED_HUMAN_REVIEW_CHECKPOINTS.has(checkpoint) && !required)
    ) {
      diagnostics.push(
        error(
          "task.human-review.applicability-invalid",
          path,
          `Human review checkpoint ${checkpoint} has invalid applicability: ${applicability || "missing"}.`,
          REQUIRED_HUMAN_REVIEW_CHECKPOINTS.has(checkpoint)
            ? `Mark ${checkpoint} as Required.`
            : `Use Required, Not applicable: <reason>, or Assess during execution: <decision trigger>.`,
        ),
      );
      continue;
    }

    if (row.slice(2, 5).some(hasPlaceholder)) {
      diagnostics.push(
        error(
          "task.human-review.details-missing",
          path,
          `Human review checkpoint ${checkpoint} contains an unresolved review detail.`,
          notApplicable
            ? "Replace remaining placeholders with Not applicable."
            : "Replace every placeholder with task-specific reviewer, artifact, and gate details.",
        ),
      );
    }
  }

  return rows;
}

function validateHumanApprovals({
  diagnostics,
  document,
  filePath,
  outcome,
  reviewPlan,
  root,
  state,
}) {
  const path = displayPath(root, filePath);
  const rows = namedTableRows(document, "Human approvals");
  if (!rows) {
    diagnostics.push(
      error(
        "progress.human-approvals.table-missing",
        path,
        "Progress is missing its human approval table.",
        "Copy all five checkpoints from Task.md and record their current status and evidence.",
      ),
    );
    return;
  }

  for (const checkpoint of HUMAN_REVIEW_CHECKPOINTS) {
    const row = rows.get(checkpoint);
    if (!row) {
      diagnostics.push(
        error(
          "progress.human-approvals.row-missing",
          path,
          `Human approvals are missing the ${checkpoint} checkpoint.`,
          `Add the ${checkpoint} row and copy its applicability from Task.md.`,
        ),
      );
      continue;
    }

    const statusText = row[1] ?? "";
    const status = parseAnnotatedFact(statusText, HUMAN_APPROVAL_STATUSES)?.fact;
    const evidence = row[2] ?? "";
    if (!status) {
      diagnostics.push(
        error(
          "progress.human-approvals.status-invalid",
          path,
          `Human approval checkpoint ${checkpoint} has invalid status: ${statusText || "missing"}.`,
          "Start with Pending, Approved, Not applicable, or Reopened; separate any annotation with a colon or dash.",
        ),
      );
      continue;
    }

    const applicability = parseAnnotatedFact(
      reviewPlan.get(checkpoint)?.[1] ?? "",
      REVIEW_APPLICABILITIES,
    )?.fact;
    if (
      (applicability === "Required" && status === "Not applicable") ||
      (applicability === "Not applicable" && status !== "Not applicable")
    ) {
      diagnostics.push(
        error(
          "progress.human-approvals.plan-conflict",
          path,
          `Human approval status for ${checkpoint} conflicts with Task.md applicability.`,
          "Update the task plan and progress status together before proceeding.",
        ),
      );
    }

    if (
      status === "Approved" &&
      (hasPlaceholder(evidence) || !/\b\d{4}-\d{2}-\d{2}\b/.test(evidence))
    ) {
      diagnostics.push(
        error(
          "progress.human-approvals.evidence-invalid",
          path,
          `Approved checkpoint ${checkpoint} lacks dated decision evidence.`,
          "Record the human reviewer, YYYY-MM-DD date, reviewed artifact, and decision evidence.",
        ),
      );
    }
    if (status === "Not applicable" && hasPlaceholder(evidence)) {
      diagnostics.push(
        error(
          "progress.human-approvals.evidence-invalid",
          path,
          `Not-applicable checkpoint ${checkpoint} lacks a rationale.`,
          "Repeat the task-specific reason from Task.md.",
        ),
      );
    }
    if (["Pending", "Reopened"].includes(status)) {
      const completedTask = state === "completed" && outcome === "Completed";
      diagnostics.push(
        warning(
          completedTask
            ? "progress.human-approvals.incomplete"
            : "progress.human-approvals.pending",
          path,
          completedTask
            ? `Completed task has unresolved ${checkpoint} approval status: ${status}.`
            : `Human approval checkpoint ${checkpoint} remains ${status}.`,
          completedTask
            ? "Obtain and record approval, or mark a conditional checkpoint not applicable with its rationale."
            : "Complete and record the review when its approval gate is reached.",
        ),
      );
    }
  }
}

async function validateProgress({
  diagnostics,
  reviewPlan,
  root,
  state,
  strict,
  task,
}) {
  const filePath = resolve(task.path, "Progress.md");
  const path = displayPath(root, filePath);
  const exists = await isFile(filePath);

  if (["backlog", "unregistered"].includes(state)) {
    if (exists) {
      diagnostics.push(
        error(
          "progress.unexpected",
          path,
          "Tasks that have not started must not contain Progress.md.",
          "Remove Progress.md until the task is claimed.",
        ),
      );
    }
    return { outcome: null, strict: true };
  }
  if (!exists && state === "completed") {
    diagnostics.push(
      error(
        "progress.missing",
        path,
        "Completed tasks must contain Progress.md.",
        "Create Progress.md from the task-ledger progress template.",
      ),
    );
    return { outcome: null, strict: true };
  }
  if (!exists) return { outcome: null, strict: true };

  const document = parseMarkdown(await readFile(filePath, "utf8"));
  const usesCurrentSchema = strict ?? reviewPlan !== null;
  const required = [...PROGRESS_HEADINGS];
  if (reviewPlan) required.push("Human approvals");
  for (const heading of missingHeadings(document, required)) {
    diagnostics.push(
      error(
        "progress.heading.missing",
        path,
        `Progress.md is missing the ${heading} heading.`,
        `Add ## ${heading} from the current progress template.`,
      ),
    );
  }

  const outcomeText = sectionText(document.section("Outcome"));
  const outcome = parseOutcome(outcomeText);
  if (
    (state === "completed" && outcome === "Abandoned") ||
    (state === "abandoned" && outcome === "Completed")
  ) {
    diagnostics.push(
      error(
        "progress.outcome.conflict",
        path,
        `Progress outcome ${outcome} conflicts with task state ${state}.`,
        "Correct the lifecycle state or the explicitly recorded outcome.",
      ),
    );
  }
  if (reviewPlan) {
    validateHumanApprovals({
      diagnostics,
      document,
      filePath,
      outcome,
      reviewPlan,
      root,
      state,
    });
  }
  return { outcome, strict: usesCurrentSchema };
}

function orderedListLength(document, sectionName) {
  const list = firstList(document.section(sectionName));
  return list?.ordered ? list.items.length : 0;
}

async function validateUserAcceptance({ diagnostics, outcome, root, state, task }) {
  const filePath = resolve(task.path, "UserAcceptance.md");
  if (!(await isFile(filePath))) return;
  const path = displayPath(root, filePath);
  if (["backlog", "unregistered"].includes(state)) {
    diagnostics.push(
      error(
        "acceptance.unexpected",
        path,
        "Tasks that have not started must not contain a user acceptance guide.",
        "Create UserAcceptance.md only after implementation begins and manual acceptance is required.",
      ),
    );
  }

  const document = parseMarkdown(await readFile(filePath, "utf8"));
  for (const heading of missingHeadings(document, USER_ACCEPTANCE_HEADINGS)) {
    diagnostics.push(
      error(
        "acceptance.heading.missing",
        path,
        `UserAcceptance.md is missing the ${heading} heading.`,
        `Add ## ${heading} from the current user-acceptance template.`,
      ),
    );
  }
  const steps = orderedListLength(document, "Steps");
  const expected = orderedListLength(document, "Expected results");
  if (steps === 0 || steps !== expected) {
    diagnostics.push(
      error(
        "acceptance.steps.invalid",
        path,
        `User acceptance has ${steps} numbered step(s) and ${expected} expected result(s).`,
        "Provide at least one numbered step and one matching expected result per step.",
      ),
    );
  }
  const status = sectionText(document.section("Status"));
  if (!status) {
    diagnostics.push(
      error(
        "acceptance.status.missing",
        path,
        "User acceptance status is empty.",
        "Record Pending or the actual user-reported result.",
      ),
    );
  } else if (!parseAcceptanceStatus(status)) {
    diagnostics.push(
      error(
        "acceptance.status.invalid",
        path,
        "User acceptance status does not contain a recognized result.",
        "Record Pending, Accepted, or Failed at step <number>: <observed result>.",
      ),
    );
  } else if (
    state === "completed" &&
    outcome === "Completed" &&
    parseAcceptanceStatus(status) !== "Accepted"
  ) {
    diagnostics.push(
      error(
        "acceptance.status.not-accepted",
        path,
        "Completed task user acceptance does not record an Accepted result.",
        "Record only the user's actual Accepted result before completion.",
      ),
    );
  }
}

async function markdownFiles(path, files = []) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) await markdownFiles(entryPath, files);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

function escapesRoot(root, path) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot);
}

async function validateLinks({ diagnostics, root, task }) {
  const realRoot = await realpath(root);
  for (const filePath of await markdownFiles(task.path)) {
    const document = parseMarkdown(await readFile(filePath, "utf8"));
    for (const rawTarget of document.links) {
      if (/^[a-z]:[/\\]/i.test(rawTarget)) {
        diagnostics.push(
          error(
            "link.absolute-machine-path",
            displayPath(root, filePath),
            `Link uses a machine-local absolute path: ${rawTarget}`,
            "Use the repository's declared local-link convention.",
          ),
        );
        continue;
      }
      if (
        !rawTarget ||
        rawTarget.startsWith("#") ||
        rawTarget.startsWith("//") ||
        /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
      ) {
        continue;
      }
      const pathTarget = rawTarget.split(/[?#]/, 1)[0].replace(/^<|>$/g, "");
      let decoded;
      try {
        decoded = decodeURIComponent(pathTarget);
      } catch {
        diagnostics.push(
          error(
            "link.encoding.invalid",
            displayPath(root, filePath),
            `Link has invalid percent encoding: ${rawTarget}`,
            "Use valid UTF-8 percent encoding or an unescaped Markdown path.",
          ),
        );
        continue;
      }
      const rootRelative = decoded.startsWith("/");
      const targetPath = rootRelative
        ? resolve(root, decoded.replace(/^[/\\]+/, ""))
        : resolve(dirname(filePath), decoded);
      if (rootRelative && !escapesRoot(task.path, targetPath)) {
        diagnostics.push(
          error(
            "link.task-local.root-relative",
            displayPath(root, filePath),
            `Task-local link uses a repository-root path: ${rawTarget}`,
            "Use a path relative to the linking file so it moves with the task directory.",
          ),
        );
      }
      if (escapesRoot(root, targetPath)) {
        diagnostics.push(
          error(
            "link.repository.escape",
            displayPath(root, filePath),
            `Local link escapes the repository: ${rawTarget}`,
            "Point the link to a repository file or use an external URL.",
          ),
        );
        continue;
      }
      try {
        await access(targetPath);
        const realTarget = await realpath(targetPath);
        if (escapesRoot(realRoot, realTarget)) {
          diagnostics.push(
            error(
              "link.target.symlink-escape",
              displayPath(root, filePath),
              `Local link resolves outside the repository: ${rawTarget}`,
              "Replace the escaping symlink with a repository-local target.",
            ),
          );
        }
      } catch {
        diagnostics.push(
          error(
            "link.target.missing",
            displayPath(root, filePath),
            `Local link target does not exist: ${rawTarget}`,
            `Create the target or correct the link in ${displayPath(root, filePath)}.`,
          ),
        );
      }
    }
  }
}

export async function inspectTaskContents({ root, tasks }) {
  const diagnostics = [];
  const taskLanguages = {};

  for (const task of tasks) {
    await validateArtifactTree({ diagnostics, root, path: task.path });
    const taskFile = resolve(task.path, "Task.md");
    const taskPath = displayPath(root, taskFile);
    if (!(await isFile(taskFile))) {
      diagnostics.push(
        error(
          "task.file.missing",
          taskPath,
          `${task.relativePath} is missing Task.md.`,
          "Create Task.md from the task-ledger task template.",
        ),
      );
      await validateProgress({
        diagnostics,
        root,
        state: task.state,
        strict: false,
        task,
      });
      continue;
    }

    const taskText = await readFile(taskFile, "utf8");
    const language = taskLanguageMetadata(taskText);
    taskLanguages[task.name] = language.language;
    for (const issue of language.issues) {
      const details = {
        duplicate: {
          message: "Task.md contains more than one Language metadata field.",
          remediation: "Keep one Language field before the first section heading.",
        },
        invalid: {
          message: "Task.md Language must contain one canonical BCP 47 tag.",
          remediation: "Use canonical metadata such as Language: en or Language: zh-CN.",
        },
        misplaced: {
          message: "Task.md Language metadata appears after the first section heading.",
          remediation: "Move Language directly below the Created metadata.",
        },
      }[issue];
      diagnostics.push(
        error(
          `task.language.${issue}`,
          taskPath,
          details.message,
          details.remediation,
        ),
      );
    }
    const document = parseMarkdown(taskText);
    for (const heading of missingHeadings(document, TASK_HEADINGS)) {
      diagnostics.push(
        error(
          "task.heading.missing",
          taskPath,
          `Task.md is missing the ${heading} heading.`,
          `Add ## ${heading} from the current task template.`,
        ),
      );
    }
    const reviewPlan = validateHumanReviewPlan({
      diagnostics,
      document,
      filePath: taskFile,
      root,
      state: task.state,
    });

    const progress = await validateProgress({
      diagnostics,
      reviewPlan,
      root,
      state: task.state,
      task,
    });
    if (["completed", "abandoned"].includes(task.state) && !progress.strict) {
      diagnostics.push(
        info(
          "task.terminal.legacy",
          taskPath,
          "Terminal task predates the current human review plan format.",
          "Keep historical content unchanged; current checks still validate universal invariants.",
        ),
      );
    }
    validateAcceptanceCriteria({
      diagnostics,
      document,
      filePath: taskFile,
      outcome: progress.outcome,
      root,
      state: task.state,
    });
    await validateUserAcceptance({
      diagnostics,
      outcome: progress.outcome,
      root,
      state: task.state,
      task,
    });
    await validateLinks({ diagnostics, root, task });
  }

  return { diagnostics, taskLanguages };
}
