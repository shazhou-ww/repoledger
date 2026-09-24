<p align="center">
  <img src="./assets/silvermoon.svg" width="960" alt="Silvermoon, the spirit of your project">
</p>

<p align="center">
  English | <a href="./README.zh-CN.md">简体中文</a>
</p>

# Silvermoon（银月）

**The spirit of your project.**

> *Silvermoon (银月) is named after the artifact spirit and steadfast companion
> in **A Record of a Mortal's Journey to Immortality** (RMJI; 凡人修仙传).
> Like her, this Silvermoon lives with the artifacts, understands their state,
> and helps its companions navigate what comes next: the spirit of your
> project.*

Silvermoon is a shared tool for humans and agents. It checks the repository's
real state, preserves facts both can understand, guards decision boundaries,
and answers one question: **what's next?**

It does not act as a personal assistant or make human decisions. Silvermoon
belongs to the project itself, so every collaborator observes the same state
and the same highest-priority next action.

Silvermoon has three public commands:

```sh
silvermoon whats-next [idea]
silvermoon create-idea
silvermoon check [--remote | --commit <revision> | --staged | --worktree]
```

`whats-next` fetches and observes but never edits, checks out, merges, commits,
stashes, deletes, resets, fast-forwards, or pushes. It returns one
highest-priority action. `check` validates storage and Git facts for humans,
hooks, and CI. `create-idea` runs the same hygiene preflight, then creates one
structured idea scaffold without staging, committing, pushing, or recording
approval.

## Install

```sh
npm install --save-dev silvermoon
npx skills add shazhou-ww/silvermoon --skill silvermoon
```

Requires Node.js 22 or newer and Git access to the configured primary branch.

## Configure

Create `.silvermoon/config.yaml`:

```yaml
version: 1
primaryRepository: https://github.com/example/repository.git
primaryBranch: main
```

Repository URLs are canonical credential-free HTTPS shared state. Credentials,
named remotes, and URL rewrites remain local Git concerns. Metadata paths are
fixed and cannot be overridden by configuration.

## Store Ideas

Each idea is self-contained under one canonical uppercase ULID folder:

```text
.silvermoon/
|-- config.yaml
`-- ideas/
    `-- 01M36QGPNTXEPP61DA4KP4AVZF/
        |-- status.yaml
        |-- ledger.md
        `-- outer/
            |-- Deployment.md
            `-- inner/
                |-- Implementation.md
                `-- ideal/
                    `-- Idea.md
```

The three nested worlds have canonical English and Chinese names:

- **Ideal World (道心):** `Idea.md` defines the ideal.
- **Inner World (内景):** `Implementation.md` defines implementation.
- **Outer World (现世):** `Deployment.md` defines deployment.

道心立意，内景成形，现世验真。

Every world may contain additional files or directories. Ideal World artifacts
support `Idea.md`, Inner World artifacts support `Implementation.md`, and Outer
World artifacts support `Deployment.md`; supporting material never replaces
the canonical same-world entry.

Each world is an opaque Git tree. `idealRevision` identifies `ideal/`,
`implementationRevision` identifies `inner/` and therefore includes the Ideal
World, and `deploymentRevision` identifies `outer/` and therefore includes both
nested worlds. This creates deterministic cascading invalidation. `status.yaml`
and required `ledger.md` are outside all three world trees.

The Silvermoon Agent skill authors implementation and deployment plans under
`## Steps` and outcome contracts under `## Acceptance criteria`. Every item
uses a stable level-three `I-Sxx`, `I-ACxx`, `D-Sxx`, or `D-ACxx` heading.
Each criterion contains both its observable outcome and the method that proves
it. World contracts never use task-list checkboxes.

The required idea-root `ledger.md` mirrors stable IDs and short titles under
Implementation and Deployment Steps and Acceptance criteria checklists.
Silvermoon requires the regular file but does not parse it, include it in world
revisions, or infer a human decision from `[x]`. Agents update world headings
and ledger entries together, reset materially changed completed items, and
derive the next work from `whats-next`, the contracts, and unchecked entries.

```yaml
version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
approvedRevision: 0123456789abcdef0123456789abcdef01234567
implementationAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
deploymentAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
```

`version` and `id` are required. `alias` is optional; when present it is an
exact, unique, case-sensitive selector. Other optional fields, in canonical
order, are `abandoned: true` and the three revision fields shown above. Explicit
`abandoned: false`, derived state, criteria mirrors, source locators, unknown
keys, aliases/anchors, comments, and noncanonical YAML are rejected.

State is derived in order:

1. `abandoned` when `abandoned: true`.
2. `preparing` when `approvedRevision` differs from `idealRevision`.
3. `implementing` when `implementationAcceptedRevision` differs from
   `implementationRevision`.
4. `deploying` when `deploymentAcceptedRevision` differs from
   `deploymentRevision`.
5. `completed` when all three revisions match.

## Navigate

```sh
silvermoon whats-next
silvermoon whats-next 01M36QGPNTXEPP61DA4KP4AVZF
silvermoon whats-next publish-documentation --json
```

Without a selector, Silvermoon asks you to choose among multiple active ideas,
continue one active idea, or create a new idea. With a ULID or exact unique
alias, it renders state guidance. Every invocation first checks the configured
primary branch, conflicts, dirty worktree, and local/remote primary ancestry.

JSON reports contain `observedPrimaryCommit`, `selectedIdea`, and exactly one
`action`. Use the observed commit as the expected remote tip for later writes.
If primary moves, fetch and reobserve rather than replaying a stale decision.

## Create An Idea

```sh
silvermoon create-idea --json
```

After branch, conflict, dirty-worktree, and primary-ancestry hygiene passes, the
command generates a canonical ULID, structured `Idea.md`, `Implementation.md`,
`Deployment.md`, and `ledger.md` documents, plus a canonical `status.yaml`
containing only `version` and `id`. It does not require or invent an alias. The
new files are intentionally untracked, so the next `whats-next <ULID>` reports
`inspect-worktree-changes` until you complete the initial `Idea.md`, review the
candidate, and publish it through ordinary Git. An Agent may add a concise,
unique alias derived from the user's request while preparing the idea; users
need not stop to name it.

Silvermoon has no approval or acceptance mutation commands. After an explicit
decision, edit the idea's status file, run `silvermoon check --staged`, commit
the status fact, and non-force push through ordinary Git.

## Validate

- `check` validates only the committed `HEAD` snapshot and reads primary
  coordinates from that snapshot.
- `check --worktree` validates the hypothetical commit containing HEAD, the
  index, unstaged changes, and nonignored untracked files. It reads primary
  coordinates from that complete candidate.
- `check --staged` validates the index snapshot.
- `check --commit <revision>` validates one local commit snapshot.
- `check --remote` uses committed HEAD coordinates to fetch primary, validates
  its immutable tip, and proves retained revision facts against complete
  reachable primary history.

Targets are mutually exclusive and never change the caller's branch, index, or
worktree. Exit status `0` means success, `1` means validation or operational
failure, and `2` means invalid CLI usage. Use `--json` for the complete stable
report envelope.

The repository configuration schema is
[schema/v1/config.schema.json](schema/v1/config.schema.json), and the idea
status schema is
[schema/v1/idea-status.schema.json](schema/v1/idea-status.schema.json). Both
use the shared definitions in
[schema/v1/definitions.schema.json](schema/v1/definitions.schema.json).
Runtime checks additionally verify canonical YAML, regular fixed metadata
paths, three world entries, unique aliases, current Git object format, tree
object types, per-world candidate revision binding, and acceptance history.

## Adopt Silvermoon

Silvermoon is a direct breaking cutover from the previous product. It recognizes
only `.silvermoon/config.yaml` version 1 and does not read, convert, or diagnose
previous layouts. Preserve Git history and record only acceptance facts
supported by explicit review. See the installed skill's `references/adoption.md` for
the adoption sequence.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:skills
```
