import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import { checkRepository } from "../src/index.js";
import { initRepository } from "../src/init.js";
import { mutateTask } from "../src/publication.js";
import { statusRepository } from "../src/status.js";

const temporaryDirectories = [];
const PRIMARY_REPOSITORY = "https://primary.example.test/owner/repository.git";
const SOURCE_REPOSITORY = "https://source.example.test/owner/repository.git";

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function configureRepositoryUrl(root, repository, path) {
  git(root, "config", `url.${pathToFileURL(path).href}.insteadOf`, repository);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRemoteRepository() {
  const base = await mkdtemp(join(tmpdir(), "repoledger-publication-"));
  temporaryDirectories.push(base);
  const root = join(base, "work");
  const remote = join(base, "remote.git");
  await mkdir(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "repoledger test");
  git(root, "config", "user.email", "repoledger@example.invalid");
  await writeFile(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "Initialize fixture");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "--set-upstream", "origin", "main");
  configureRepositoryUrl(root, PRIMARY_REPOSITORY, remote);
  return { base, primaryRepository: PRIMARY_REPOSITORY, remote, root };
}

const TASK = `# Publication task

Created: 2026-09-19

## Goal

Exercise primary-only publication.

## Context

Integration fixture.

## Scope

- Publish lifecycle state.

## Out of scope

- Provider APIs.

## Acceptance criteria

- [ ] The lifecycle completes.

## Constraints

- Preserve caller state.

## Human review checkpoints

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | Fixture owner | Fixture scope. | Implementation. |
| Interface | Not applicable: no interface. | Not applicable | Not applicable. | Not applicable. |
| Business and data model | Not applicable: no model. | Not applicable | Not applicable. | Not applicable. |
| Architecture | Not applicable: no architecture. | Not applicable | Not applicable. | Not applicable. |
| Delivery acceptance | Required | Fixture owner | Published fixture. | Completion. |

## References

- None.
`;

const PROGRESS = `# Progress

Updated: 2026-09-19

## Current state

Implemented and accepted.

## Decisions

- Use primary-only publication.

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Approved | Fixture owner approved scope on 2026-09-19. |
| Interface | Not applicable | No interface. |
| Business and data model | Not applicable | No model. |
| Architecture | Not applicable | No architecture. |
| Delivery acceptance | Approved | Fixture owner approved delivery on 2026-09-19. |

## Validation

- Integration test passed.

## Blockers

- None.

## Outcome

Completed. Fixture accepted.
`;

test("initializes and publishes a complete task lifecycle without touching caller dirt", async () => {
  const { primaryRepository, remote, root } = await createRemoteRepository();
  await writeFile(join(root, "caller-dirt.txt"), "preserve me\n");

  const initialized = await initRepository({
    primaryBranch: "main",
    primaryRepository,
    root,
  });
  assert.equal(initialized.ok, true, JSON.stringify(initialized.diagnostics));
  assert.equal(await readFile(join(root, "caller-dirt.txt"), "utf8"), "preserve me\n");
  assert.match(git(root, "status", "--short"), /\?\? caller-dirt\.txt/);

  git(root, "pull", "--ff-only");
  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);

  const registered = await mutateTask({
    now: new Date("2026-09-19T10:00:00Z"),
    operation: "register",
    root,
    taskName: "publication-task",
  });
  assert.equal(registered.ok, true, JSON.stringify(registered.diagnostics));
  assert.equal(registered.result.transition, "absent -> backlog");
  assert.match(git(root, "status", "--short"), /\?\? caller-dirt\.txt/);
  const registeredAgain = await mutateTask({
    operation: "register",
    root,
    taskName: "publication-task",
  });
  assert.equal(registeredAgain.ok, true, JSON.stringify(registeredAgain.diagnostics));
  assert.equal(registeredAgain.result.publication, "already-published");

  const started = await mutateTask({
    now: new Date("2026-09-19T10:00:01Z"),
    operation: "start",
    root,
    taskName: "publication-task",
  });
  assert.equal(started.ok, true, JSON.stringify(started.diagnostics));
  assert.equal(started.result.transition, "backlog -> ongoing");
  assert.equal(started.result.sourceRepository, primaryRepository);
  assert.equal(started.result.sourceBranch, "task/publication-task");
  assert.match(
    git(root, "ls-remote", "--heads", remote, "refs/heads/task/publication-task"),
    new RegExp(`^${started.result.commit}`),
  );

  const remoteStatus = await statusRepository({ root, taskName: "publication-task" });
  assert.equal(remoteStatus.ok, true, JSON.stringify(remoteStatus.diagnostics));
  assert.equal(remoteStatus.result.state, "ongoing");
  assert.equal(remoteStatus.result.source, "remote");
  assert.equal(remoteStatus.result.sourceRepository, primaryRepository);
  assert.equal(remoteStatus.result.sourceBranch, "task/publication-task");
  const sourceChecked = await checkRepository({ remote: true, root });
  assert.equal(sourceChecked.ok, true, JSON.stringify(sourceChecked.diagnostics));
  assert.deepEqual(sourceChecked.result.sourceRefs, [{
    task: "publication-task",
    repository: primaryRepository,
    branch: "task/publication-task",
    tip: started.result.commit,
  }]);

  await rm(taskPath, { recursive: true });
  git(root, "pull", "--ff-only");
  await writeFile(join(root, "implementation.txt"), "implemented\n");
  await writeFile(join(taskPath, "Task.md"), TASK.replace("- [ ]", "- [x]"));
  await writeFile(join(taskPath, "Progress.md"), PROGRESS);
  git(root, "add", "implementation.txt", "tasks/publication-task");
  git(root, "commit", "-m", "Implement publication task");
  git(root, "push", "origin", "main");
  const approvedCommit = git(root, "rev-parse", "HEAD");

  const completed = await mutateTask({
    approvedCommit,
    now: new Date("2026-09-19T10:00:02Z"),
    operation: "complete",
    root,
    taskName: "publication-task",
  });
  assert.equal(completed.ok, true, JSON.stringify(completed.diagnostics));
  assert.equal(completed.result.transition, "ongoing -> completed");
  const completedStatus = await statusRepository({ root, taskName: "publication-task" });
  assert.equal(completedStatus.result.sourceRepository, undefined);
  assert.equal(completedStatus.result.sourceBranch, undefined);
  assert.notEqual(
    git(root, "ls-remote", "--heads", remote, "refs/heads/task/publication-task"),
    "",
  );
  assert.match(git(root, "status", "--short"), /\?\? caller-dirt\.txt/);
  const completedAgain = await mutateTask({
    approvedCommit,
    operation: "complete",
    root,
    taskName: "publication-task",
  });
  assert.equal(completedAgain.ok, true, JSON.stringify(completedAgain.diagnostics));
  assert.equal(completedAgain.result.publication, "already-published");
  const checked = await checkRepository({ remote: true, root });
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
});

test("rejects completion for a commit other than fetched primary", async () => {
  const { primaryRepository, root } = await createRemoteRepository();
  const initialized = await initRepository({ primaryBranch: "main", primaryRepository, root });
  assert.equal(initialized.ok, true);
  git(root, "pull", "--ff-only");

  const report = await mutateTask({
    approvedCommit: git(root, "rev-parse", "HEAD"),
    operation: "complete",
    root,
    taskName: "missing-task",
  });

  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, "task.selection.missing");
});

test("remote check rejects a bookkeeping-only Progress commit", async () => {
  const { primaryRepository, root } = await createRemoteRepository();
  const initialized = await initRepository({ primaryBranch: "main", primaryRepository, root });
  assert.equal(initialized.ok, true);
  git(root, "pull", "--ff-only");
  await mkdir(join(root, "tasks", "ghost-task"));
  await writeFile(join(root, "tasks", "ghost-task", "Progress.md"), "# Progress\n");
  git(root, "add", "tasks/ghost-task/Progress.md");
  git(root, "commit", "-m", "Add bookkeeping-only progress");
  git(root, "push", "origin", "main");

  const checked = await checkRepository({ remote: true, root });

  assert.equal(checked.ok, false);
  assert.ok(
    checked.diagnostics.some(({ code }) => code === "progress.history.bookkeeping-only"),
  );
});

test("remote check ignores an old bookkeeping-only Progress commit", async () => {
  const { primaryRepository, root } = await createRemoteRepository();
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");
  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "publication-task" })).ok,
    true,
  );
  assert.equal(
    (await mutateTask({ operation: "start", root, taskName: "publication-task" })).ok,
    true,
  );
  await rm(taskPath, { recursive: true });
  git(root, "pull", "--ff-only");
  await writeFile(join(taskPath, "Progress.md"), PROGRESS);
  git(root, "add", "tasks/publication-task/Progress.md");
  git(root, "commit", "-m", "Add bookkeeping-only progress");
  git(root, "push", "origin", "main");
  await writeFile(join(root, "implementation.txt"), "implemented\n");
  git(root, "add", "implementation.txt");
  git(root, "commit", "-m", "Implement after progress update");
  git(root, "push", "origin", "main");

  const checked = await checkRepository({ remote: true, root });

  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  assert.ok(
    !checked.diagnostics.some(({ code }) => code === "progress.history.bookkeeping-only"),
  );
});

test("registers matching published task contents and rejects divergent contents", async () => {
  const { primaryRepository, root } = await createRemoteRepository();
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");

  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);
  git(root, "add", "tasks/publication-task");
  git(root, "commit", "-m", "Add unregistered task");
  git(root, "push", "origin", "main");

  const registered = await mutateTask({
    now: new Date("2026-09-19T10:00:00Z"),
    operation: "register",
    root,
    taskName: "publication-task",
  });
  assert.equal(registered.ok, true, JSON.stringify(registered.diagnostics));
  assert.equal(registered.result.transition, "absent -> backlog");
  git(root, "pull", "--ff-only");

  const conflictingPath = join(root, "tasks", "conflicting-task");
  await mkdir(conflictingPath);
  await writeFile(join(conflictingPath, "Task.md"), TASK.replace("Publication task", "Conflicting task"));
  git(root, "add", "tasks/conflicting-task");
  git(root, "commit", "-m", "Add another unregistered task");
  git(root, "push", "origin", "main");
  await writeFile(join(conflictingPath, "Task.md"), TASK.replace("Publication task", "Changed task"));

  const conflicted = await mutateTask({
    operation: "register",
    root,
    taskName: "conflicting-task",
  });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.diagnostics[0].code, "task.register.content-conflict");
});

test("rejects unsafe init paths and task names before filesystem access", async () => {
  const { primaryRepository, root } = await createRemoteRepository();

  const initialized = await initRepository({
    primaryBranch: "main",
    primaryRepository,
    root,
    tasksDirectory: "../outside",
  });
  assert.equal(initialized.ok, false);
  assert.equal(initialized.diagnostics[0].code, "config.invalid-tasks-directory");

  await writeFile(
    join(root, "repoledger.yaml"),
    `version: 2\ntasksDirectory: tasks\nprimaryRepository: ${primaryRepository}\nprimaryBranch: main\n`,
  );
  const mutation = await mutateTask({ operation: "register", root, taskName: "../escape" });
  assert.equal(mutation.ok, false);
  assert.equal(mutation.diagnostics[0].code, "task.name.invalid");
});

test("recomposes an unrelated concurrent task update", async () => {
  const { base, primaryRepository, remote, root } = await createRemoteRepository();
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");
  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "publication-task" })).ok,
    true,
  );

  const concurrent = join(base, "concurrent");
  git(base, "clone", remote, concurrent);
  git(concurrent, "config", "user.name", "concurrent test");
  git(concurrent, "config", "user.email", "concurrent@example.invalid");
  configureRepositoryUrl(concurrent, primaryRepository, remote);
  const unrelated = join(concurrent, "tasks", "unrelated-task");
  await mkdir(unrelated);
  await writeFile(join(unrelated, "Task.md"), TASK.replaceAll("Publication task", "Unrelated task"));

  const started = await mutateTask({
    _beforePush: async ({ attempt }) => {
      if (attempt !== 0) return;
      const published = await mutateTask({
        operation: "register",
        root: concurrent,
        taskName: "unrelated-task",
      });
      assert.equal(published.ok, true, JSON.stringify(published.diagnostics));
    },
    operation: "start",
    root,
    taskName: "publication-task",
  });

  assert.equal(started.ok, true, JSON.stringify(started.diagnostics));
  assert.equal(started.result.transition, "backlog -> ongoing");
  const targetStatus = await statusRepository({ root, taskName: "publication-task" });
  const unrelatedStatus = await statusRepository({ root, taskName: "unrelated-task" });
  assert.equal(targetStatus.result.state, "ongoing");
  assert.equal(unrelatedStatus.result.state, "backlog");
});

test("rejects completion until the advertised source tip reaches approved primary", async () => {
  const { base, primaryRepository, remote, root } = await createRemoteRepository();
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");
  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "publication-task" })).ok,
    true,
  );
  assert.equal(
    (await mutateTask({ operation: "start", root, taskName: "publication-task" })).ok,
    true,
  );

  const sourceWork = join(base, "source-work");
  git(base, "clone", "--branch", "task/publication-task", remote, sourceWork);
  git(sourceWork, "config", "user.name", "source test");
  git(sourceWork, "config", "user.email", "source@example.invalid");
  await writeFile(join(sourceWork, "source-only.txt"), "not integrated\n");
  git(sourceWork, "add", "source-only.txt");
  git(sourceWork, "commit", "-m", "Advance source only");
  git(sourceWork, "push", "origin", "HEAD:task/publication-task");

  const primary = git(root, "ls-remote", remote, "refs/heads/main").split(/\s+/, 1)[0];
  const completed = await mutateTask({
    approvedCommit: primary,
    operation: "complete",
    root,
    taskName: "publication-task",
  });

  assert.equal(completed.ok, false);
  assert.equal(completed.diagnostics[0].code, "task.complete.source-not-integrated");
});

test("remote check rejects a missing ongoing source branch", async () => {
  const { primaryRepository, remote, root } = await createRemoteRepository();
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");
  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "publication-task" })).ok,
    true,
  );
  assert.equal(
    (await mutateTask({ operation: "start", root, taskName: "publication-task" })).ok,
    true,
  );
  git(root, "push", remote, "--delete", "task/publication-task");

  const checked = await checkRepository({ remote: true, root });

  assert.equal(checked.ok, false);
  assert.ok(
    checked.diagnostics.some(({ code }) => code === "task.source.unavailable"),
  );
});

test("recovers a cross-repository start after source-only partial publication", async () => {
  const { base, primaryRepository, root } = await createRemoteRepository();
  const sourceRemote = join(base, "source.git");
  git(root, "init", "--bare", "--initial-branch=main", sourceRemote);
  configureRepositoryUrl(root, SOURCE_REPOSITORY, sourceRemote);
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");
  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "publication-task" })).ok,
    true,
  );

  const missing = join(base, "missing.git");
  const partial = await mutateTask({
    _beforePush: async () => {
      git(
        root,
        "config",
        `url.${pathToFileURL(missing).href}.pushInsteadOf`,
        primaryRepository,
      );
    },
    operation: "start",
    root,
    sourceRepository: SOURCE_REPOSITORY,
    taskName: "publication-task",
  });
  git(
    root,
    "config",
    "--unset-all",
    `url.${pathToFileURL(missing).href}.pushInsteadOf`,
  );

  assert.equal(partial.ok, false);
  assert.equal(partial.diagnostics[0].code, "git.start.primary-pending");
  assert.equal(partial.result.publication, "partially-published");
  assert.match(
    git(root, "ls-remote", "--heads", sourceRemote, "refs/heads/task/publication-task"),
    new RegExp(`^${partial.result.commit}`),
  );

  const sourceWork = join(base, "advanced-source");
  git(base, "clone", "--branch", "task/publication-task", sourceRemote, sourceWork);
  git(sourceWork, "config", "user.name", "source test");
  git(sourceWork, "config", "user.email", "source@example.invalid");
  await writeFile(join(sourceWork, "continued.txt"), "continued\n");
  git(sourceWork, "add", "continued.txt");
  git(sourceWork, "commit", "-m", "Continue source work");
  git(sourceWork, "push", "origin", "HEAD:task/publication-task");
  const advancedTip = git(sourceWork, "rev-parse", "HEAD");

  const recovered = await mutateTask({
    operation: "start",
    root,
    sourceRepository: SOURCE_REPOSITORY,
    taskName: "publication-task",
  });
  assert.equal(recovered.ok, true, JSON.stringify(recovered.diagnostics));
  assert.equal(recovered.result.commit, partial.result.commit);
  assert.equal(recovered.result.sourceTip, advancedTip);
  const status = await statusRepository({ root, taskName: "publication-task" });
  assert.equal(status.result.sourceRepository, SOURCE_REPOSITORY);
  assert.equal(status.result.sourceBranch, "task/publication-task");
});

test("publishes a fork source ref and rejects an unrelated existing branch", async () => {
  const { base, primaryRepository, root } = await createRemoteRepository();
  const sourceRemote = join(base, "source.git");
  git(root, "init", "--bare", "--initial-branch=main", sourceRemote);
  configureRepositoryUrl(root, SOURCE_REPOSITORY, sourceRemote);
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");
  const firstPath = join(root, "tasks", "publication-task");
  await mkdir(firstPath);
  await writeFile(join(firstPath, "Task.md"), TASK);
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "publication-task" })).ok,
    true,
  );

  const started = await mutateTask({
    operation: "start",
    root,
    sourceBranch: "work/publication-task",
    sourceRepository: SOURCE_REPOSITORY,
    taskName: "publication-task",
  });
  assert.equal(started.ok, true, JSON.stringify(started.diagnostics));
  assert.match(
    git(root, "ls-remote", "--heads", sourceRemote, "refs/heads/work/publication-task"),
    new RegExp(`^${started.result.commit}`),
  );

  const sourceWork = join(base, "fork-completion");
  git(base, "clone", "--branch", "work/publication-task", sourceRemote, sourceWork);
  git(sourceWork, "config", "user.name", "source test");
  git(sourceWork, "config", "user.email", "source@example.invalid");
  await writeFile(join(sourceWork, "implementation.txt"), "implemented in fork\n");
  await writeFile(
    join(sourceWork, "tasks", "publication-task", "Task.md"),
    TASK.replace("- [ ]", "- [x]"),
  );
  await writeFile(
    join(sourceWork, "tasks", "publication-task", "Progress.md"),
    PROGRESS,
  );
  git(sourceWork, "add", "implementation.txt", "tasks/publication-task");
  git(sourceWork, "commit", "-m", "Implement fork publication task");
  git(sourceWork, "push", "origin", "HEAD:work/publication-task");
  const sourceTip = git(sourceWork, "rev-parse", "HEAD");
  git(root, "fetch", sourceRemote, "work/publication-task");
  git(root, "push", "origin", "FETCH_HEAD:main");

  const completed = await mutateTask({
    approvedCommit: sourceTip,
    operation: "complete",
    root,
    taskName: "publication-task",
  });
  assert.equal(completed.ok, true, JSON.stringify(completed.diagnostics));
  const completedStatus = await statusRepository({
    root,
    taskName: "publication-task",
  });
  assert.equal(completedStatus.result.state, "completed");
  assert.equal(completedStatus.result.sourceRepository, undefined);
  assert.equal(completedStatus.result.sourceBranch, undefined);
  assert.match(
    git(root, "ls-remote", "--heads", sourceRemote, "refs/heads/work/publication-task"),
    new RegExp(`^${sourceTip}`),
  );

  await rm(firstPath, { recursive: true });
  git(root, "pull", "--ff-only");
  const secondPath = join(root, "tasks", "second-task");
  await mkdir(secondPath);
  await writeFile(join(secondPath, "Task.md"), TASK.replaceAll("Publication task", "Second task"));
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "second-task" })).ok,
    true,
  );
  git(root, "fetch", "origin", "main");
  git(root, "push", sourceRemote, "origin/main:refs/heads/existing-source");

  const collision = await mutateTask({
    operation: "start",
    root,
    sourceBranch: "existing-source",
    sourceRepository: SOURCE_REPOSITORY,
    taskName: "second-task",
  });
  assert.equal(collision.ok, false);
  assert.equal(collision.diagnostics[0].code, "task.source.exists");
});

test("does not reuse a partial fork candidate after primary moves", async () => {
  const { base, primaryRepository, remote, root } = await createRemoteRepository();
  const sourceRemote = join(base, "source.git");
  git(root, "init", "--bare", "--initial-branch=main", sourceRemote);
  configureRepositoryUrl(root, SOURCE_REPOSITORY, sourceRemote);
  assert.equal(
    (await initRepository({ primaryBranch: "main", primaryRepository, root })).ok,
    true,
  );
  git(root, "pull", "--ff-only");
  const taskPath = join(root, "tasks", "publication-task");
  await mkdir(taskPath);
  await writeFile(join(taskPath, "Task.md"), TASK);
  assert.equal(
    (await mutateTask({ operation: "register", root, taskName: "publication-task" })).ok,
    true,
  );

  const concurrent = join(base, "concurrent-primary");
  git(base, "clone", remote, concurrent);
  git(concurrent, "config", "user.name", "concurrent test");
  git(concurrent, "config", "user.email", "concurrent@example.invalid");
  const partial = await mutateTask({
    _beforePush: async () => {
      await writeFile(join(concurrent, "concurrent.txt"), "primary moved\n");
      git(concurrent, "add", "concurrent.txt");
      git(concurrent, "commit", "-m", "Move primary concurrently");
      git(concurrent, "push", "origin", "main");
    },
    operation: "start",
    root,
    sourceRepository: SOURCE_REPOSITORY,
    taskName: "publication-task",
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.diagnostics[0].code, "git.start.primary-pending");

  const retried = await mutateTask({
    operation: "start",
    root,
    sourceRepository: SOURCE_REPOSITORY,
    taskName: "publication-task",
  });
  assert.equal(retried.ok, false);
  assert.equal(retried.diagnostics[0].code, "task.source.exists");
});
