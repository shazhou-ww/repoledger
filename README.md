# repoledger

Derive the next action for repository-owned ideas from Git facts.

Repoledger vNext has two public commands:

```sh
repoledger whatsnext [idea]
repoledger check [--remote | --commit <revision> | --staged | --unstaged]
```

`whatsnext` fetches and observes but never edits, checks out, merges, commits,
stashes, deletes, resets, fast-forwards, or pushes. It returns one
highest-priority action. `check` validates storage and Git evidence for humans,
hooks, and CI.

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
|   |-- Idea.md
|   `-- Design.md
`-- 01M36QGPNTXEPP61DA4KP4AVZF.status.yaml
```

`Idea.md` must exist but has no required headings. Put every shared definition
artifact inside the idea folder. The folder's Git tree object ID is its
`ideaRevision`, so any definition change invalidates old acceptance for the
current revision without deleting history.

```yaml
version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
approvedRevision: 0123456789abcdef0123456789abcdef01234567
implementationAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
deploymentAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
```

`version`, `id`, and `alias` are required. Optional fields, in canonical order,
are `abandoned: true` and the three revision fields shown above. Explicit
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
repoledger whatsnext
repoledger whatsnext 01M36QGPNTXEPP61DA4KP4AVZF
repoledger whatsnext publish-documentation --json
```

Without a selector, Repoledger asks you to choose among multiple active ideas,
continue one active idea, or create a new idea. With a ULID or exact unique
alias, it checks branch, conflicts, dirty worktree, and local/remote primary
ancestry before rendering state guidance.

JSON reports contain `observedPrimaryCommit`, `selectedIdea`, and exactly one
`action`. Use the observed commit as the expected remote tip for later writes.
If primary moves, fetch and reobserve rather than replaying a stale decision.

Repoledger has no approval or acceptance mutation commands. After an explicit
decision, edit the sibling status file, run `repoledger check --staged`, commit
the status fact, and non-force push through ordinary Git.

## Validate

- `check` validates the current worktree, including untracked idea files.
- `check --staged` validates the index snapshot.
- `check --unstaged` validates the index plus tracked and untracked worktree
  changes.
- `check --commit <revision>` validates one local commit snapshot.
- `check --remote` fetches configured primary, validates its immutable tip, and
  proves retained revision facts against complete reachable primary history.

Targets are mutually exclusive and never change the caller's branch, index, or
worktree. Exit status `0` means success, `1` means validation or operational
failure, and `2` means invalid CLI usage. Use `--json` for the complete stable
report envelope.

The schema is [schema/v3.json](schema/v3.json). Runtime checks additionally
verify canonical YAML, repository-owned regular paths, folder/status pairing,
unique aliases, current Git object format, tree object types, candidate revision
binding, and acceptance history.

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
