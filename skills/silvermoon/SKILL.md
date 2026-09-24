---
name: silvermoon
description: "Navigate or create repository-owned ideas, execute one safe action, and reobserve only after an observable delta."
argument-hint: "[new | idea ULID or alias]"
user-invocable: true
---

# Silvermoon

Use Silvermoon to navigate or explicitly create ideas against the configured
remote primary. The CLI derives idea state and checks repository hygiene; the
Agent performs suggested repository or external actions through ordinary tools
and Git.

## Start From Primary

1. Preserve the user's intent when choosing the entry command:
   - For `/silvermoon new` or any other explicit request to create a new idea,
     run `silvermoon create-idea --json`.
   - Otherwise run `silvermoon whats-next [idea] --json`. Pass the selector only
     when the user supplied or previously selected one.
2. Treat the command, request, `observedPrimaryCommit`, `selectedIdea`, and
   action or created idea as one immutable observation. Do not combine guidance
   from different reports.
3. Read the complete `onboarding` doctor report. It lists every requirement,
   status, blocking flag, dependency, structured remediation, recommended
   action, and recheck command. For `adopt-silvermoon`, execute only the
   recommended explicit remediation (or safely resolve its conflict), then
   recheck; do not route idea work while blocking findings remain.
4. Execute only the highest-priority action. Do not skip worktree, conflict,
   sync, or selection guidance to reach a later idea-state action. An explicit
   create request is not idea selection: after resolving a blocking hygiene
   action, retry `create-idea`, not selector-less `whats-next`.

`whats-next` may fetch and inspect. It never checkout, merges, edits, commits,
stashes, deletes, resets, fast-forwards, or pushes. `create-idea` runs the same
hygiene preflight and, only when it passes, creates the structured idea scaffold.
Dependency installation and skill registration are separate explicit
operations. The packaged skill is canonical, while registration and updates
belong to the supported `npx skills add` interface. Silvermoon reports
configuration and skill findings but owns no onboarding mutation command.

## Preserve Work

- Read exact staged, unstaged, and untracked diffs before deciding ownership.
- Preserve unknown, unrelated, or user-authored changes. Isolate them in
  another worktree or use an explicitly described stash only when needed.
- Delete only paths created by the current operation or paths the user names
  after reviewing the current diff.
- Never use force-push, `reset --hard`, broad clean commands, or silent history
  rewrites to satisfy guidance.
- Publish with the observed primary tip as the expected remote tip. On rejection
  or concurrent movement, fetch and call `whats-next` again; never replay a stale
  approval or acceptance automatically.

## Execute Actions

- `select-active-idea`: show the ordered candidates and obtain one explicit
  ULID or alias selection.
- `continue-active-idea`: call `whats-next <id>` to obtain state guidance.
- `create-idea`: this action is internal to the explicit `create-idea` command's
  preflight; do not replace the user's create intent with active-idea
  selection. After hygiene passes, the command creates one self-contained idea
  with structured `Idea.md`, `Implementation.md`, `Deployment.md`, and
  `ledger.md` entries plus alias-less `status.yaml`. It never stages, commits,
  pushes, or records a decision. Review every generated path before
  publication. During initial preparation, replace the `Idea.md` guidance with
  the requested Ideal World contract, but keep the Implementation, Deployment,
  and matching ledger placeholders synchronized until their lifecycle actions.
  An Agent may add a concise, unique alias derived from the user's request;
  do not interrupt the user only to ask them to name it.
- `switch-to-primary`, `resolve-conflicts`, `inspect-worktree-changes`,
  `fast-forward-primary`, `integrate-primary`, `publish-primary`: perform the
  exact Git hygiene step without discarding either history or unknown work.
- `prepare-idea`: edit `Idea.md` and supporting files in the Ideal World
  (道心). Supporting files must serve `Idea.md`, never replace it as a second
  contract. After lifecycle hygiene, use the reported `ledgerPath` to resume
  relevant unfinished work. After explicit approval, write the reported
  `idealRevision` to `approvedRevision`.
- `implement-idea`: edit `Implementation.md`, its supporting Inner World
  (内景) files, and repository deliverables. Do not change the nested Ideal
  World unless the ideal truly changed and should return to preparing. After
  lifecycle hygiene, use the reported `ledgerPath` to resume relevant
  unfinished work. After explicit acceptance, write the reported
  `implementationRevision` to `implementationAcceptedRevision`.
- `deploy-idea`: use `Deployment.md` and its supporting Outer World (现世)
  files to drive and verify the external world. Do not change repository
  deliverables as deployment work or modify a nested world unless that earlier
  contract truly changed. Publish a newly authored or materially changed
  deployment contract first, reobserve its stable `deploymentRevision`, then
  execute external checks against that revision and record their completion in
  the ledger. After lifecycle hygiene, use the reported `ledgerPath` to resume
  relevant unfinished work. After explicit acceptance, write the reported
  `deploymentRevision` to `deploymentAcceptedRevision`.
- `review-abandoned`: keep `abandoned: true`, remove it after an explicit human
  decision, or create a different idea.
- `review-completed`: revise the existing idea definition or create a new idea.

## Author The Three Worlds

Every idea uses this fixed structure:

```text
.silvermoon/ideas/<ULID>/
├── status.yaml
├── ledger.md
└── outer/
    ├── Deployment.md
    └── inner/
        ├── Implementation.md
        └── ideal/
            └── Idea.md
```

`Idea.md` is the canonical Ideal World (道心) entry, `Implementation.md` is the
canonical Inner World (内景) entry, and `Deployment.md` is the canonical Outer
World (现世) entry: 道心立意，内景成形，现世验真. Each world may contain
additional files and nested directories, but those artifacts support their
same-world entry and do not define a second contract.

In `Implementation.md` and `Deployment.md`, put plans under `## Steps` and
outcome contracts under `## Acceptance criteria`. Give every step and criterion
a stable level-three heading: `I-Sxx`, `I-ACxx`, `D-Sxx`, or `D-ACxx`. A
criterion must describe both its observable outcome and the method that proves
it; do not add a separate validation section. Keep checkboxes out of world
contracts. World content changes its world revision and every containing world
revision; `status.yaml` and `ledger.md` stay outside all three world trees.

## Continue From The Ledger

Every idea has an Agent-owned `ledger.md` at the path reported by `whats-next`.
It is operational state, not a fourth world, normative contract, or human
decision. Silvermoon requires the regular file but does not parse its body or
derive lifecycle state from it.

Mirror stable IDs and short titles from both world contracts:

```markdown
# Ledger

## Implementation

### Steps

- [x] **I-S01:** Completed step
- [ ] **I-S02:** Remaining step

### Acceptance criteria

- [x] **I-AC01:** Proven criterion
- [ ] **I-AC02:** Unproven criterion

## Deployment

### Steps

- [ ] **D-S01:** Deployment step

### Acceptance criteria

- [ ] **D-AC01:** Deployment criterion
```

When adding or removing a world step or criterion, update the matching ledger
entry in the same change. Keep its stable ID when only the title or details are
refined. Add new entries unchecked. If a completed item's requirement or proof
method changes materially, reset its checkbox and re-run the work or proof.
Infer the next action from `whats-next`, the world contracts, and unchecked
ledger entries; do not maintain duplicate Current or Next summaries.
If relevant ledger entries remain unchecked, continue the reported world
action. If all relevant entries are checked, their evidence remains valid, and
the candidate is published, stop editing and request explicit acceptance for
the exact revision reported by `whats-next`.

`[x]` means only that the Agent recorded work or a check as complete. It never
approves an Ideal World, accepts implementation or deployment, changes
`status.yaml`, or authorizes publication. Record test names, commands,
artifacts, and results in the corresponding world criterion or concise ledger
notes without creating a separate evidence schema or public API contract.

## Write Status Facts

Silvermoon has no approval, acceptance, or abandonment mutation commands.
Update the idea's `status.yaml` with ordinary file editing:

1. Reconfirm the decision applies to the selected idea and current
   world revision reported by `whats-next`.
2. Add or update only the corresponding revision field, or add/remove canonical
   `abandoned: true` after an explicit human decision.
3. Run `silvermoon check --worktree --json` while reviewing the complete
  candidate, then stage it and run `silvermoon check --staged --json`.
4. Commit the status decision separately when practical, then non-force push
   with the observation's `observedPrimaryCommit` as expected tip.

Never infer a human decision from silence, prose, Git activity, or an outer
command. Old revision values remain as history and become inactive naturally
when the idea folder changes.

## Advance The Loop

Re-run the intent-preserving entry command only after an expected repository
delta, an unexpected input change, or a newly arrived external result: use
`create-idea` for a pending explicit creation and `whats-next` otherwise. End
the current turn when waiting for human/external input. Report an actionable
error with its recovery condition, or report no progress and stop if guidance
completed without a delta. Never poll the same observation.

Follow [adoption.md](./references/adoption.md) when creating or explicitly
converting a repository to Silvermoon.