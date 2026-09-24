# Technical Reference

This page is the authoritative reference for Silvermoon storage, revisions,
derived state, CLI reports, and validation.

## Fixed Storage Layout

Each idea is self-contained under one canonical uppercase ULID:

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

Every world may contain supporting files and directories, but they serve the
canonical same-world entry and never define another contract. Metadata paths
are fixed regular files and directories.

## World Revisions

Each world is an opaque Git tree:

- `idealRevision` identifies `ideal/`.
- `implementationRevision` identifies `inner/` and includes the Ideal World.
- `deploymentRevision` identifies `outer/` and includes both nested worlds.

`status.yaml` and `ledger.md` are outside all three world trees. The repository
object format in use determines revision shape; Silvermoon validates object
types and candidate bindings rather than interpreting world contents.

## Status File

```yaml
version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
approvedRevision: 0123456789abcdef0123456789abcdef01234567
implementationAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
deploymentAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
```

`version` and `id` are required. `alias` is optional. Other optional keys, in
canonical order, are `abandoned: true` and the three revision fields shown
above. Explicit `abandoned: false`, derived state, criteria mirrors, source
locators, unknown keys, YAML aliases or anchors, comments, and noncanonical
YAML are rejected.

State is derived in order:

1. `abandoned` when `abandoned: true`.
2. `preparing` when `approvedRevision` differs from `idealRevision`.
3. `implementing` when `implementationAcceptedRevision` differs from
   `implementationRevision`.
4. `deploying` when `deploymentAcceptedRevision` differs from
   `deploymentRevision`.
5. `completed` when all three revisions match.

## Public Commands

```sh
silvermoon whats-next [idea]
silvermoon create-idea
silvermoon check [--remote | --commit <revision> | --staged | --worktree]
```

`whats-next` returns one highest-priority action after repository and onboarding
diagnosis. JSON reports include `observedPrimaryCommit`, `selectedIdea`, and
exactly one `action`. They also include `onboarding`, whose requirements expose
stable IDs, statuses, blocking flags, dependencies, observed facts, structured
remediation, a recommended action, and a recheck command.

Execution source is classified as `source-checkout`, `project-local`,
`temporary`, `global`, or `unknown`. Temporary execution can bootstrap
diagnosis; normal idea work requires the exact project dependency, installed
package, and matching repository-local skill.

`create-idea` applies the same hygiene preflight and then creates one canonical
scaffold. It does not stage, commit, push, or record approval.

## Validation Targets

- `check` validates only the committed `HEAD` snapshot and reads primary
  coordinates from that snapshot.
- `check --worktree` validates the hypothetical commit formed from `HEAD`, the
  index, unstaged changes, and nonignored untracked files.
- `check --staged` validates the index snapshot.
- `check --commit <revision>` validates one local commit snapshot.
- `check --remote` fetches primary using committed coordinates, validates its
  immutable tip, and proves retained revision facts against complete reachable
  primary history.

Targets are mutually exclusive and never change the caller's branch, index, or
worktree. Exit status `0` means success, `1` means validation or operational
failure, and `2` means invalid CLI usage. `--json` emits the stable report
envelope.

Runtime checks verify canonical YAML, fixed paths, the three world entries,
unique aliases, Git object format, tree object types, per-world candidate
revision binding, and acceptance history.

## Schemas

- [Repository configuration](../schema/v1/config.schema.json)
- [Idea status](../schema/v1/idea-status.schema.json)
- [Shared definitions](../schema/v1/definitions.schema.json)
