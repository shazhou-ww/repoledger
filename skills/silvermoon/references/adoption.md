# Silvermoon adoption

## New repositories

Create `.silvermoon/config.yaml` with the fixed version 1 contract:

```yaml
version: 1
primaryRepository: https://example.com/owner/repository.git
primaryBranch: main
```

The URL is credential-free canonical HTTPS shared state; local Git credentials
and URL rewrites remain machine-local. Metadata and idea paths are fixed.

Commit the configuration, then run:

```sh
silvermoon check --commit HEAD
silvermoon check --remote
silvermoon create-idea --json
silvermoon whats-next <ULID> --json
```

## Idea storage

Each idea is self-contained:

```text
.silvermoon/ideas/<ULID>/
|-- status.yaml
|-- ledger.md
`-- outer/
    |-- Deployment.md
    `-- inner/
        |-- Implementation.md
        `-- ideal/
            `-- Idea.md
```

Ideal World (道心) uses `Idea.md`, Inner World (内景) uses
`Implementation.md`, and Outer World (现世) uses `Deployment.md`: 道心立意，
内景成形，现世验真. Each world may have supporting files and directories,
but they serve rather than replace the canonical same-world entry.

The nested opaque Git trees produce `idealRevision`,
`implementationRevision`, and `deploymentRevision`. Inner World includes Ideal
World; Outer World includes both nested worlds. `status.yaml` and required
`ledger.md` are outside all three revisions. Silvermoon requires ledger as a
regular file but does not parse its body.

Write implementation and deployment plans under `## Steps` and their outcome
contracts under `## Acceptance criteria`. Give every item a stable level-three
`I-Sxx`, `I-ACxx`, `D-Sxx`, or `D-ACxx` heading. Each criterion describes both
the observable outcome and how to prove it. Keep task-list checkboxes out of
world contracts.

Agents mirror those stable IDs and short titles into the required `ledger.md`
under Implementation and Deployment Steps and Acceptance criteria checklists.
Update both files together, and reset a checked item when its requirement or
proof changes materially. Checkboxes record Agent work only, never human
approval or acceptance.

```yaml
version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
```

Status may additionally contain canonical `abandoned: true`,
`approvedRevision`, `implementationAcceptedRevision`, and
`deploymentAcceptedRevision` in that order. Decisions must bind to their
corresponding current world revision.

For a new scaffold, run `silvermoon create-idea --json`. It generates the ULID,
four structured documents and alias-less status; it does not stage, commit,
push, approve, or accept.

## Adopting from another layout

Silvermoon deliberately has no runtime compatibility mode or in-place migration
command. It recognizes only `.silvermoon/config.yaml` and the fixed nested
world layout. A repository containing only another configuration or idea layout
is unconfigured.

Prepare one reviewed cutover commit with ordinary repository tools. Preserve
old Git history, inspect every retained outcome, and record only decisions that
have explicit evidence for the exact corresponding world revision. Silvermoon
does not read, merge, move, delete, diagnose, or infer facts from old layouts.

Run `silvermoon check --worktree`, stage the candidate, run the staged and
commit checks, publish non-force, then run the remote check against complete
primary history.
