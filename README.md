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
/repoledger new [--language <tag>] [context]
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
taskLanguage: zh-CN
primaryRepository: https://github.com/example/repository.git
primaryBranch: main
```

`taskLanguage` is an optional shared default for newly created tasks. It must
be a canonical BCP 47 tag. Omitting it preserves the existing user-preference
and `en` fallback behavior.

`primaryRepository` is a canonical credential-free HTTPS URL shared by every
clone. Local remote names are irrelevant. Git credential helpers and
`url.*.insteadOf` or `url.*.pushInsteadOf` may provide machine-specific access.

The per-user task-language preference remains user state, not repository
state. It is used only when the project has no `taskLanguage`. The preference
is stored in `%APPDATA%\repoledger\preferences.yaml` on Windows,
`$XDG_CONFIG_HOME/repoledger/preferences.yaml` when XDG is configured,
`~/Library/Application Support/repoledger/preferences.yaml` on macOS, or
`~/.config/repoledger/preferences.yaml` on other Unix systems. It never changes
`repoledger.yaml` or the Git worktree.

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
repoledger config get --global task-language
repoledger config set --global task-language <tag>
repoledger config resolve task-language [-r <repository>] [--language <tag>]
repoledger config resolve --global task-language [--language <tag>]
repoledger task list [--state <state>...] [--created-since <time>]
                     [--created-before <time>] [--updated-since <time>]
                     [--updated-before <time>] [--sort <name|created|updated>]
                     [--limit <count>] [--local]
repoledger status <task-name> [--local]
repoledger check [<task-name>]
                 [--remote | --commit <revision> | --staged | --unstaged]
repoledger task register <task-name>
repoledger task start <task-name> [--source-repository <https-url>]
                                  [--source-branch <branch>]
repoledger task complete <task-name> --approved-commit <commit>
repoledger task abandon <task-name>
```

Check target options are mutually exclusive:

- With no target option, `check` validates the current worktree snapshot and
  does not apply a commit-level `Progress.md` change policy.
- `--remote` fetches configured primary by URL, validates its tip snapshot and
  first-parent diff, and verifies selected ongoing source refs. This is the
  only check target that accesses a remote repository.
- `--commit <revision>` resolves an existing local commit, validates that
  snapshot, and checks only its diff from the first parent.
- `--staged` validates the index snapshot and checks only paths staged relative
  to `HEAD`; unstaged and untracked files do not affect it.
- `--unstaged` validates the index plus tracked worktree changes and checks
  only paths changed relative to the index. Untracked files are ignored.

Commit, staged, and unstaged targets build isolated snapshots from local Git
objects without changing the caller's branch, index, or worktree. List and
status use `--local` to explicitly read the current worktree without fetching.

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

## Task language

`config set` accepts a BCP 47 language tag and persists its canonical form, for
example normalizing `zh-cn` to `zh-CN`. `config get` distinguishes an unset
preference from a configured value. Project-aware `config resolve` is read-only
and applies the task-creation precedence: a one-command `--language` override,
then `repoledger.yaml#taskLanguage`, then the user preference, then `en`.
`config resolve --global` skips the project layer for use outside repositories.
Structured results identify `override`, `project`, `preference`, or `default`
as the effective source.

Every newly registered `Task.md` records the resolved value near its creation
date:

```md
Created: 2026-09-21
Language: zh-CN
```

That value is the task's stable language track. Later `Progress.md` and
`UserAcceptance.md` narrative content follows it even when another user or
machine resumes the task. During `/repoledger new`, agent-authored user-facing
narrative replies use the resolved value; during `/repoledger exec` and
`/repoledger complete`, they use the task's recorded value. Required headings,
checkpoint names, lifecycle and approval values, outcome values, acceptance
statuses, commands, identifiers, and quoted tool output remain unchanged.
Existing tasks without `Language` deterministically use `en`; Repoledger does
not guess from prose or translate historical artifacts.

## Validation

`check` validates strict canonical YAML, registered-directory correspondence,
lifecycle records and timestamps, source-ref uniqueness, required task
artifacts, canonical task-language metadata, human review facts, acceptance
state, and repository-local Markdown links. Unregistered directories are valid
pre-registration state, while their task artifacts are still validated.
Explicit Git targets also enforce that a selected change to any task
`Progress.md` includes a tracked path outside `tasksDirectory`. Remote and
commit checks compare merge commits with their first parent and root commits
with the empty tree; they do not scan earlier commits for this policy.
`check --commit HEAD` is suitable for CI validating the checked-out commit.
`check --remote` additionally reads refreshed primary and verifies every
selected ongoing source branch and its start ancestry.

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
