# Repository task-ledger adoption

## New repositories

Install the CLI and Agent Skill, then initialize the repository:

```sh
npm install --save-dev repoledger
npx skills add shazhou-ww/repoledger --skill repoledger
```

```sh
repoledger init \
  --primary-repository https://example.com/owner/repository.git \
  --primary-branch main
```

The command publishes `repoledger.yaml` and an empty `tasks/status.yaml` to the
existing primary repository and branch. It refuses existing or partial
ledgers. The repository URL contains no credentials; each clone may use Git
credential helpers or `url.*.insteadOf` configuration for local transport.

Add repository instructions that:

- require explicit `/repoledger new` invocation for intake;
- admit only outcomes expected to change a path outside `tasksDirectory`;
- name the repository task profile;
- authorize routine non-force publication to primary;
- require `repoledger check --remote` in CI; and
- prohibit standalone `Progress.md` bookkeeping commits.

No Git identity, worktree lane, `.gitkeep`, or archive directory is required.
Repoledger creates a shared source branch when a task starts.

## Storage contract

```yaml
# repoledger.yaml
version: 2
tasksDirectory: tasks
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
```

```yaml
# tasks/status.yaml
version: 2
tasks:
  example-task:
    state: ongoing
    sourceBranch: task/example-task
    createdAt: "2026-09-19T10:00:00Z"
    updatedAt: "2026-09-19T10:01:00Z"
```

Each record key has exactly one matching stable task directory. An ongoing
record requires `sourceBranch` and may add `sourceRepository` when work lives
in a fork; omission inherits `primaryRepository`. Only repoledger writes
lifecycle records, source locators, and timestamps.

## Legacy layout migration

Migration is a coordinated repository change, not a public command.

1. Refresh primary and require the legacy ledger to pass its complete checks.
2. Inventory backlog, every identity-scoped ongoing lane, and archived tasks;
   stop on duplicate names or unknown outcomes.
3. Move every complete task directory to `<tasksDirectory>/<task-name>`.
4. Map backlog and ongoing locations directly. Map archived tasks to
   `completed` or `abandoned` from their unambiguous Progress outcome.
5. Derive `createdAt` from the first primary commit introducing `Task.md`. Use
   one UTC second as `updatedAt` for all first-written canonical records.
6. Rewrite only move-sensitive repository-local links. Task-local links remain
   relative and move with their directory.
7. Replace legacy configuration with `repoledger.yaml`, create sorted
   `status.yaml`, and remove identity markers and empty status directories.
8. Update skills, repository instructions, CI, package docs, and tests.
9. Run local and remote checks, publish without force, fetch, and verify every
   task and record from primary.

After migration, corrections are forward commits. Never rewrite published
history or preserve identity/move commands as a permanent compatibility layer.

## Version 1 repository-ref migration

Version 1 stores a clone-local remote name and cannot be interpreted portably.
Upgrade the CLI before a coordinated v2 migration:

1. Fetch and validate the v1 primary branch with the previous CLI.
2. Select one credential-free canonical HTTPS URL for that repository. Review
   it explicitly when the local remote has different fetch and push URLs.
3. Assign each ongoing task one unique source branch. Use
   `task/<task-name>` in primary unless collaboration requires an explicit fork
   URL.
4. Use the package's side-effect-free `prepareV1Migration` API to validate the
   canonical v1 documents and prepare both v2 YAML sources from the reviewed
   primary URL, source assignments, and one migration timestamp. Review the
   result before writing it. The transform preserves task state, `createdAt`,
   artifacts, and terminal timestamps; it advances only the changed ongoing
   records' `updatedAt`.
5. Create same-repository source branches at that candidate and atomically push
   them with primary. Publish and verify fork refs first, then publish primary.
6. Run local and remote checks with the upgraded CLI. Existing v1 clients fail
   with `config.migration-required` rather than guessing a local remote.

```js
import { prepareV1Migration } from "repoledger";

const prepared = prepareV1Migration({
  configSource,
  statusSource,
  primaryRepository: "https://example.com/owner/repository.git",
  sourceRefs: {
    "fork-task": {
      sourceRepository: "https://example.com/contributor/repository.git",
      sourceBranch: "task/fork-task",
    },
  },
  now: new Date("2026-09-20T12:00:00Z"),
});

// Review prepared.configSource and prepared.statusSource before writing both.
```

## Progress history policy

After migration, every primary commit that creates or edits a task
`Progress.md` must also change at least one tracked path outside
`tasksDirectory`. Review artifacts, status transitions, checks, approvals,
resumes, and handoffs do not justify progress-only commits.
