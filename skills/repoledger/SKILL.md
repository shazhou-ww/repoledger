---
name: repoledger
description: "Navigate repository-owned ideas with repoledger whatsnext, execute one safe action, and reobserve only after an observable delta."
argument-hint: "[idea ULID or alias]"
user-invocable: true
---

# Repoledger

Use Repoledger as a read-only navigator over the configured remote primary.
The CLI derives idea state; the Agent performs the suggested repository or
external action through ordinary tools and Git.

## Start From Primary

1. Run `repoledger whatsnext [idea] --json` from the repository root. Pass the
   selector only when the user supplied or previously selected one.
2. Treat `observedPrimaryCommit`, `selectedIdea`, and `action` as one immutable
   observation. Do not combine guidance from different reports.
3. Execute only the highest-priority action. Do not skip worktree, conflict,
   sync, or selection guidance to reach a later idea-state action.

`whatsnext` may fetch and inspect. It never checkout, merges, edits, commits,
stashes, deletes, resets, fast-forwards, or pushes.

## Preserve Work

- Read exact staged, unstaged, and untracked diffs before deciding ownership.
- Preserve unknown, unrelated, or user-authored changes. Isolate them in
  another worktree or use an explicitly described stash only when needed.
- Delete only paths created by the current operation or paths the user names
  after reviewing the current diff.
- Never use force-push, `reset --hard`, broad clean commands, or silent history
  rewrites to satisfy guidance.
- Publish with the observed primary tip as the expected remote tip. On rejection
  or concurrent movement, fetch and call `whatsnext` again; never replay a stale
  approval or acceptance automatically.

## Execute Actions

- `select-active-idea`: show the ordered candidates and obtain one explicit
  ULID or alias selection.
- `continue-active-idea`: call `whatsnext <id>` to obtain state guidance.
- `create-idea`: discuss the goal, create one canonical ULID folder with
  `Idea.md`, and create its sibling status file. `Idea.md` has no required
  headings; keep all shared expectations inside the idea folder.
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

## Write Status Facts

Repoledger has no approval, acceptance, or abandonment mutation commands.
Update the sibling status YAML with ordinary file editing:

1. Reconfirm the decision applies to the selected idea and current
   `ideaRevision`.
2. Add or update only the corresponding revision field, or add/remove canonical
   `abandoned: true` after an explicit human decision.
3. Run `repoledger check --staged --json` on the exact candidate.
4. Commit the status decision separately when practical, then non-force push
   with the observation's `observedPrimaryCommit` as expected tip.

Never infer a human decision from silence, prose, Git activity, or an outer
command. Old revision values remain as history and become inactive naturally
when the idea folder changes.

## Advance The Loop

Call `whatsnext` again only after an expected repository delta, an unexpected
input change, or a newly arrived external result. End the current turn when
waiting for human/external input. Report an actionable error with its recovery
condition, or report no progress and stop if guidance completed without a
delta. Never poll the same observation.

Follow [adoption.md](./references/adoption.md) when creating or explicitly
converting a repository to vNext.