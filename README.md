# repoledger

Query, validate, and publish Git-native repository task lifecycle state.

Repoledger combines two surfaces:

- a deterministic npm CLI for storage, validation, queries, and publication;
- one Agent Skill for the human and agent workflow around that state.

## Install

Install the CLI in a repository:

```sh
npm install --save-dev repoledger
```

Install the Agent Skill:

```sh
npx skills add shazhou-ww/repoledger --skill repoledger
```

The skill exposes one command namespace:

```text
/repoledger new [context]
/repoledger exec [task]
/repoledger status [task]
/repoledger complete [task]
/repoledger abandon [task]
```

`new` is the only task-creation route. `complete` resumes the protected
delivery flow; it never treats the invocation itself as delivery approval.

Development before the standalone repository split remains in the
[`shazhou-ww/skills`](https://github.com/shazhou-ww/skills) history. This
repository is the canonical home for subsequent Repoledger development and
releases.

## Requirements

- Node.js 22 or newer.
- Git access to an existing primary repository and branch.
- Stable task directories under the configured task directory.

## Storage

`repoledger.yaml` names the coordination target:

```yaml
version: 2
tasksDirectory: tasks
primaryRepository: https://github.com/example/repository.git
primaryBranch: main
```

`primaryRepository` is a canonical credential-free HTTPS URL shared by every
clone. Local remote names are irrelevant. Git credential helpers and
`url.*.insteadOf` or `url.*.pushInsteadOf` may provide machine-specific access.

`tasks/status.yaml` contains one sorted record per registered
`tasks/<task-name>/` directory:

```yaml
version: 2
tasks:
  example-task:
    state: ongoing
    sourceBranch: task/example-task
    createdAt: "2026-09-19T10:00:00Z"
    updatedAt: "2026-09-19T10:01:00Z"
```

States are `backlog`, `ongoing`, `completed`, and `abandoned`. Every ongoing
record requires `sourceBranch`; `sourceRepository` is stored only for a fork
and otherwise inherits `primaryRepository`. Terminal and backlog records reject
both source fields. Records never store a person, device, worktree, credential,
or local remote name.

A task directory without a status record has the derived `unregistered` state.
It is visible to list, status, and check commands but is never written to
`status.yaml`; `task register` is the only transition from `unregistered` to
the persisted `backlog` state.

## Commands

```text
repoledger init --primary-repository <https-url> --primary-branch <branch>
                [--tasks-directory <path>]
repoledger task list [--state <state>...] [--created-since <time>]
                     [--created-before <time>] [--updated-since <time>]
                     [--updated-before <time>] [--sort <name|created|updated>]
                     [--limit <count>] [--local]
repoledger status <task-name> [--local]
repoledger check [<task-name>] [--remote]
repoledger task register <task-name>
repoledger task start <task-name> [--source-repository <https-url>]
                                  [--source-branch <branch>]
repoledger task complete <task-name> --approved-commit <commit>
repoledger task abandon <task-name>
```

Remote reads fetch configured primary by URL and inspect an isolated temporary
worktree. `--local` explicitly reads the current worktree snapshot. List and
status report the effective source locator without fetching it.

Task-list time bounds accept these forms:

- `2026-09-20` means `2026-09-20T00:00:00Z`, not local midnight.
- `2026-09-20T12:30:00Z` is an exact UTC second-precision timestamp.
- `2026-09-20T00:00:00+08:00` uses a two-digit colonized offset and
  normalizes to `2026-09-19T16:00:00Z`. Use an explicit offset when a local
  calendar-day boundary is intended.
- `today` means midnight at the start of the current UTC date.
- `6h`, `6h30m`, and `5d12h` subtract positive elapsed durations from one
  reference instant captured for the command. Components use `d`, `h`, and
  `m` at most once in that order.

All accepted bounds normalize to `YYYY-MM-DDTHH:mm:ssZ` before validation and
filtering. Time filters use half-open intervals: `since` is inclusive and
`before` is exclusive. JSON reports contain the normalized bounds actually
applied. Invalid dates, times, offsets, or duration syntax are usage errors
with copyable examples and exit status `2`.

Unregistered tasks have no fabricated creation or update timestamps. Time
filters exclude unregistered tasks. Sorting by `created` or `updated` places
them after timestamped tasks and sorts them by name.

```sh
repoledger task list --state completed --updated-since 2026-09-20
repoledger task list --updated-since 6h30m --updated-before 15m
repoledger task list --created-since 2026-09-20T00:00:00+08:00
```

Mutation commands fetch primary, build and validate an isolated commit, push
without overwriting concurrent refs, fetch again, and verify publication. A
same-repository start atomically creates the source branch and advances
primary. A fork start publishes source first and reports an explicit recoverable
partial result if primary publication then fails. Completion requires the
fetched source tip to be contained in the approved primary commit; terminal
transitions remove the locator but never delete the branch. Commands leave the
caller's branch, index, staged files, and unrelated working files unchanged.

Use `--json` for stable structured reports. Exit status `0` means success, `1`
means validation or operational failure, and `2` means invalid CLI usage.

## Validation

`check` validates strict canonical YAML, registered-directory correspondence,
lifecycle records and timestamps, source-ref uniqueness, required task
artifacts, human review facts, acceptance state, and repository-local Markdown
links. Unregistered directories are valid pre-registration state, while their
task artifacts are still validated. `check --remote` reads from refreshed
primary and verifies every selected ongoing source branch and its start
ancestry.

The current package schema at `schema/v2.json` defines both configuration and
task status record shapes. `schema/v1.json` remains historical; v2 commands
return `config.migration-required` instead of interpreting its clone-local
remote name. Runtime parsing additionally rejects duplicate keys, comments,
directives, anchors, aliases, merge keys, custom tags, noncanonical property
order, unsafe URLs, and invalid timestamp ordering.

## Migrating version 1

Migration is one coordinated repository change. Select and review a canonical
HTTPS URL for the primary repository, assign every ongoing task a unique source
branch, then change both YAML files to version 2 in one candidate. Preserve
task states, creation times, artifacts, and terminal update times; advance the
changed ongoing records' update times. Atomically publish same-repository
source branches with primary, publish fork refs first, and finish with
`repoledger check --remote`. See the Repoledger skill's adoption guide for
the complete procedure.

The exported `prepareV1Migration` helper parses canonical v1 configuration and
status sources and returns validated `configSource` and `statusSource` for
review. It has no filesystem or Git side effects; migration publication remains
an explicit coordinated repository operation.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:skills
```
