# repoledger

Derive the next action for repository-owned ideas from Git facts.

Repoledger vNext has three public commands:

```sh
repoledger whats-next [idea]
repoledger create-idea
repoledger check [--remote | --commit <revision> | --staged | --worktree]
```

`whats-next` fetches and observes but never edits, checks out, merges, commits,
stashes, deletes, resets, fast-forwards, or pushes. It returns one
highest-priority action. `check` validates storage and Git evidence for humans,
hooks, and CI. `create-idea` runs the same hygiene preflight, then creates one
empty idea scaffold without staging, committing, pushing, or recording approval.

## Install

```sh
npm install --save-dev repoledger
npx skills add shazhou-ww/repoledger --skill repoledger
```

Requires Node.js 22 or newer and Git access to the configured primary branch.

## Configure

Create `repoledger.yaml` at the repository root:

```yaml
version: 3
ideasDirectory: ideas
primaryRepository: https://github.com/example/repository.git
primaryBranch: main
```

`ideasDirectory` is optional and defaults to `ideas`. Repository URLs are
canonical credential-free HTTPS shared state. Credentials, named remotes, and
URL rewrites remain local Git concerns.

## Store Ideas

Each idea uses a canonical uppercase ULID folder and a sibling status file:

```text
ideas/
|-- 01M36QGPNTXEPP61DA4KP4AVZF/
|   |-- Brief.md
|   `-- Design.md
`-- 01M36QGPNTXEPP61DA4KP4AVZF.status.yaml
```

Core treats the idea folder as an opaque Git tree: it requires no filename,
heading, or criteria format, and nested `.status.yaml` files are ordinary idea
content. Put every shared definition artifact inside the folder. Its Git tree
object ID is the `ideaRevision`, so any definition change invalidates old
acceptance for the current revision without deleting history. Only the sibling
status file is interpreted by Repoledger.

The Repoledger Agent skill uses `Idea.md` by default and authors criteria as
plain list items under `## Implementation acceptance criteria` and
`## Deployment acceptance criteria`. It does not use task-list checkboxes to
record progress; the sibling revision fields are the only acceptance state.

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
2. `preparing` when `approvedRevision` differs from the current tree.
3. `implementing` when `implementationAcceptedRevision` differs.
4. `deploying` when `deploymentAcceptedRevision` differs.
5. `completed` when all three revisions match.

## Navigate

```sh
repoledger whats-next
repoledger whats-next 01M36QGPNTXEPP61DA4KP4AVZF
repoledger whats-next publish-documentation --json
```

Without a selector, Repoledger asks you to choose among multiple active ideas,
continue one active idea, or create a new idea. With a ULID or exact unique
alias, it renders state guidance. Every invocation first checks the configured
primary branch, conflicts, dirty worktree, and local/remote primary ancestry.

JSON reports contain `observedPrimaryCommit`, `selectedIdea`, and exactly one
`action`. Use the observed commit as the expected remote tip for later writes.
If primary moves, fetch and reobserve rather than replaying a stale decision.

## Create An Idea

```sh
repoledger create-idea --json
```

After branch, conflict, dirty-worktree, and primary-ancestry hygiene passes, the
command generates a canonical ULID, an empty `Idea.md`, and a canonical sibling
status containing only `version` and `id`. It does not require or invent an
alias. The new files are intentionally untracked, so the next
`whats-next <ULID>` reports `inspect-worktree-changes` until you review and
publish them through ordinary Git.

Repoledger has no approval or acceptance mutation commands. After an explicit
decision, edit the sibling status file, run `repoledger check --staged`, commit
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

The schema is [schema/v3.json](schema/v3.json). Runtime checks additionally
verify canonical YAML, regular configuration and sibling status paths,
folder/status pairing, unique aliases, current Git object format, tree object
types, candidate revision binding, and acceptance history.

## Convert Older Repositories

vNext is a direct breaking cutover. It does not interpret v1/v2 task storage,
keep a runtime compatibility mode, or provide an in-place migration command.
Old repositories must use their matching old release until a reviewed explicit
conversion commit is ready. Preserve Git history, convert durable task ideals
to ULID idea folders, and record only acceptance facts supported by evidence.
See the installed skill's `references/adoption.md` for the conversion sequence.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:skills
```
