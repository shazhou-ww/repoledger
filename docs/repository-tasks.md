# Repository idea workflow

This repository uses the local [Repoledger skill](/skills/repoledger/SKILL.md),
`repoledger.yaml`, and the `ideas/` directory.

## Authority

The shared authority is `https://github.com/shazhou-ww/repoledger.git` on
`main`. Fetch and observe that primary before idea work. Feature branches are
optional transport and are not protocol state.

```sh
repoledger whatsnext [idea] --json
repoledger check
repoledger check --worktree
repoledger check --staged
repoledger check --commit HEAD
repoledger check --remote
```

Use the report's `observedPrimaryCommit` as the expected remote tip. When
primary moves, reobserve instead of replaying approval or acceptance.

## Decisions And Publication

`whatsnext` is read-only. Human approvals, implementation acceptance,
deployment acceptance, and abandonment are ordinary edits to one sibling idea
status file after an explicit decision. Validate the candidate and publish a
normal non-force commit. Prefer status-only decision commits when practical.

Preserve unknown changes, concurrent history, and previous revision facts.
Never force-push, reset, broadly clean, or automatically delete feature
branches.

## Repository Checks

- Run `pnpm check` after CLI, schema, repository model, release, or skill
  changes.
- Run `pnpm check:skills` after skill changes.
- Validate package contents, installed-package smoke behavior, Markdown links,
  and `git diff --check` before delivery review.
- Use `repoledger check --commit HEAD` for checked-out CI and
  `repoledger check --remote` for complete primary-history evidence.
