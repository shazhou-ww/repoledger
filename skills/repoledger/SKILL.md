---
name: repoledger
description: "Navigate or create repository-owned ideas, execute one safe action, and reobserve only after an observable delta."
argument-hint: "[new | idea ULID or alias]"
user-invocable: true
---

# Repoledger

Use Repoledger to navigate or explicitly create ideas against the configured
remote primary. The CLI derives idea state and checks repository hygiene; the
Agent performs suggested repository or external actions through ordinary tools
and Git.

## Start From Primary

1. Preserve the user's intent when choosing the entry command:
   - For `/repoledger new` or any other explicit request to create a new idea,
     run `repoledger create-idea --json`.
   - Otherwise run `repoledger whats-next [idea] --json`. Pass the selector only
     when the user supplied or previously selected one.
2. Treat the command, request, `observedPrimaryCommit`, `selectedIdea`, and
   action or created idea as one immutable observation. Do not combine guidance
   from different reports.
3. Execute only the highest-priority action. Do not skip worktree, conflict,
   sync, or selection guidance to reach a later idea-state action. An explicit
   create request is not idea selection: after resolving a blocking hygiene
   action, retry `create-idea`, not selector-less `whats-next`.

`whats-next` may fetch and inspect. It never checkout, merges, edits, commits,
stashes, deletes, resets, fast-forwards, or pushes. `create-idea` runs the same
hygiene preflight and, only when it passes, creates the empty idea scaffold.

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
  selection. After hygiene passes, the command creates a canonical ULID folder
  with an empty `Idea.md` and an alias-less sibling status. It never stages,
  commits, pushes, or records approval. Review the resulting untracked paths
  before adding substantive idea content.
- `switch-to-primary`, `resolve-conflicts`, `inspect-worktree-changes`,
  `fast-forward-primary`, `integrate-primary`, `publish-primary`: perform the
  exact Git hygiene step without discarding either history or unknown work.
- `prepare-idea`: edit only the ideal definition until the user explicitly
  approves the current revision. Then write `approvedRevision` in the sibling
  status file.
- `implement-idea`: change repository deliverables until the current idea is
  satisfied. Then write `implementationAcceptedRevision`.
- `deploy-idea`: do not change repository deliverables as deployment work.
  Drive and verify the external world, then write
  `deploymentAcceptedRevision`. If the ideal must change, edit the idea folder
  and return naturally to preparing.
- `review-abandoned`: keep `abandoned: true`, remove it after an explicit human
  decision, or create a different idea.
- `review-completed`: revise the existing idea definition or create a new idea.

## Author Acceptance Criteria

When creating or revising `Idea.md`, define phase-specific criteria under these
headings:

```markdown
## Implementation acceptance criteria

- Describe a repository-deliverable completion condition.

## Deployment acceptance criteria

- Describe an external-world completion condition.
```

Use plain list items. Do not use task-list checkboxes to represent progress or
completion: changing a checkbox changes `ideaRevision`, while acceptance state
belongs only in the sibling status file. The headings are a skill authoring
convention, not a core storage requirement; a project skill may organize the
opaque idea tree more specifically.

## Verify Criteria Evidence

Before the first implementation publication, enumerate the current idea's
implementation criteria by their stable IDs (`I01` through `I14` for the
current ergonomics idea). Produce a visible verification artifact outside the
idea tree with this shape:

```json
{
  "criteriaEvidence": [
    {
      "criterion": "I01",
      "evidence": [{ "type": "test", "locator": "test name or result" }]
    }
  ]
}
```

Keep entries in criterion order and require at least one nonempty `test`,
`check`, or `artifact` locator for every criterion. If any entry is missing,
report `criteria.evidence.missing`, remain in `implement-idea`, and do not write
implementation acceptance or push an implementation-acceptance commit. Do not
store this progress with checkboxes or by editing the idea definition.

Validate the visible artifact with the package API before acceptance:

```js
import { verifyCriteriaEvidence } from "repoledger";

const report = verifyCriteriaEvidence(ideaSource, artifact);
if (!report.ok) {
  console.error(JSON.stringify(report.diagnostics));
  process.exitCode = 1;
}
```

## Write Status Facts

Repoledger has no approval, acceptance, or abandonment mutation commands.
Update the sibling status YAML with ordinary file editing:

1. Reconfirm the decision applies to the selected idea and current
   `ideaRevision`.
2. Add or update only the corresponding revision field, or add/remove canonical
   `abandoned: true` after an explicit human decision.
3. Run `repoledger check --worktree --json` while reviewing the complete
  candidate, then stage it and run `repoledger check --staged --json`.
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
converting a repository to vNext.