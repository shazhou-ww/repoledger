# Repoledger vNext adoption

## New repositories

Install the package and skill, then create the configuration and empty ideas
directory with ordinary repository edits:

```yaml
version: 3
ideasDirectory: ideas
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
```

`ideasDirectory` is optional and resolves to `ideas` when omitted. The URL is
credential-free canonical HTTPS shared state; local Git credentials and URL
rewrites remain machine-local.

Commit the configuration and directory on primary, then run:

```sh
repoledger check --commit HEAD
repoledger check --remote
repoledger whatsnext
```

## Idea storage

Each idea has one canonical ULID folder and one sibling status file:

```text
ideas/
|-- 01M36QGPNTXEPP61DA4KP4AVZF/
|   `-- Brief.md
`-- 01M36QGPNTXEPP61DA4KP4AVZF.status.yaml
```

Core treats the folder as an opaque Git tree and requires no particular file,
heading, or criteria format. Keep every document that changes the shared ideal
inside the folder so its Git tree object changes the `ideaRevision`. Only the
sibling status file is interpreted by Repoledger.

The Repoledger skill creates `Idea.md` by default. Write completion conditions
as plain list items under `## Implementation acceptance criteria` and
`## Deployment acceptance criteria`; do not use task-list checkboxes as state.

```yaml
version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
```

Status may additionally contain canonical `abandoned: true`,
`approvedRevision`, `implementationAcceptedRevision`, and
`deploymentAcceptedRevision` in that order. Alias comparison is exact and
case-sensitive, and aliases must be unique in observed primary.

## Converting v1 or v2

vNext deliberately has no runtime compatibility mode or in-place migration
command. Keep using the matching old release until one reviewed conversion
commit is ready.

1. Validate and refresh the old primary with the old release.
2. Inventory every legacy task and unintegrated source branch. Integrate or
   preserve unfinished work before removing source locators.
3. Assign each retained outcome a canonical ULID and convert its ideal contract
   into an opaque `ideas/<ULID>/` definition tree. Follow the phase-specific
   `Idea.md` convention above unless the project defines another format.
4. Create sibling status files. Map explicit abandonment to `abandoned: true`.
   Record revision acceptance only when the corresponding legacy evidence is
   strong enough; otherwise let the idea derive an earlier state.
5. Replace the old configuration with version 3 and remove legacy task storage
   only after reviewing the converted idea set.
6. Run `repoledger check --worktree`, stage the candidate, run the staged and
   commit checks, publish non-force, then run the remote check against complete
   primary history.

Preserve old Git history. Never make old task fields look like vNext facts by
guessing approvals or external outcomes.
