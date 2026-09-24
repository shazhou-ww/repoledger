# Operating Silvermoon

This guide is the authoritative routine workflow for navigating, changing, and
publishing Silvermoon ideas.

## Navigate

```sh
npx silvermoon whats-next
npx silvermoon whats-next 01M36QGPNTXEPP61DA4KP4AVZF
npx silvermoon whats-next publish-documentation --json
```

Without a selector, Silvermoon asks for a choice among multiple active ideas,
continues a single active idea, or reports that a new idea can be created. A
selector is either a canonical uppercase ULID or an exact, unique,
case-sensitive alias.

Each successful report includes the effective `language` tag and its `idea`,
`project`, `global`, or `default` source. Its action guidance requires the
Agent to use that language for world entries, same-world supporting artifacts,
the ledger, and user-facing explanations. Commands, identifiers, schema fields,
protocol markers, and verbatim tool output retain their original form.

Every invocation first checks the configured primary branch, merge conflicts,
worktree changes, and local/remote primary ancestry. It may fetch and inspect,
but it never edits, checks out, merges, commits, stashes, deletes, resets,
fast-forwards, or pushes.

## Create An Idea

Explicit creation uses:

```sh
npx silvermoon create-idea --json
npx silvermoon create-idea --language zh-cn --json
```

Creation intent is distinct from active-idea selection. If hygiene blocks the
command, perform only the reported remediation and retry `create-idea`; do not
replace the request with selector-less navigation.

`--language` is the only command-level language override. It normalizes a valid
BCP 47 tag and writes it to the new idea's `status.yaml`. Without the option,
creation writes no language field and the idea dynamically inherits project,
user, or `en-US` defaults. `whats-next` and `check` do not accept the option.

The generated files remain untracked for review. Complete `Idea.md`, optionally
add a concise unique alias, inspect every path, and publish the initial idea
through ordinary Git.

## Execute One Action

Treat the command, request, `observedPrimaryCommit`, selected idea, and action
as one immutable observation. Execute only the highest-priority action.

Repository hygiene actions take precedence over lifecycle work. Inspect exact
staged, unstaged, untracked, and conflicted paths; preserve unknown and
concurrent work. Never force-push, use `reset --hard`, broadly clean the
worktree, or silently rewrite history to satisfy guidance.

After an observable change, run `whats-next` again. Do not poll an unchanged
observation.

## Author World Contracts

`Idea.md` is the Ideal World entry. `Implementation.md` and `Deployment.md`
contain `## Steps` and `## Acceptance criteria`. Every item uses a stable
level-three heading:

- implementation steps: `I-Sxx`
- implementation criteria: `I-ACxx`
- deployment steps: `D-Sxx`
- deployment criteria: `D-ACxx`

Each criterion states both the observable outcome and how an Agent can prove
it. World contracts do not use task-list checkboxes.

The required idea-root `ledger.md` mirrors those IDs and short titles as
checkboxes under Implementation and Deployment. Update a world heading and its
ledger entry together. Add new items unchecked, and reset a completed item when
its requirement or proof changes materially.

## Record A Human Decision

After an explicit decision, reconfirm that it applies to the selected idea and
the current reported world revision. Edit only the corresponding status fact:

- `approvedRevision`
- `implementationAcceptedRevision`
- `deploymentAcceptedRevision`
- canonical `abandoned: true`, or remove it after an explicit reversal

Validate the complete candidate:

```sh
npx silvermoon check --worktree --json
git add .silvermoon/ideas/<ULID>/status.yaml
npx silvermoon check --staged --json
```

Prefer a status-only decision commit, publish through the repository's normal
non-force path, and verify the commit is reachable from refreshed primary.

## Publish Work

Before publication, compare with the observed primary tip, run checks focused
on the change, and inspect the exact diff. On push rejection, branch movement,
or a newly discovered conflict, preserve both histories, fetch, and reobserve.
Never replay approval or acceptance automatically against a new revision.
