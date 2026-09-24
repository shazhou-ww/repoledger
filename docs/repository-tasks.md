# Repository idea workflow

This repository uses the local [Silvermoon skill](/skills/silvermoon/SKILL.md)
and the fixed `.silvermoon/` metadata layout.

## Authority

The shared authority is `https://github.com/shazhou-ww/silvermoon.git` on
`main`. Fetch and observe that primary before idea work. Feature branches are
optional transport and are not protocol state.

```sh
silvermoon whats-next [idea] --json
silvermoon create-idea --json
silvermoon check
silvermoon check --worktree
silvermoon check --staged
silvermoon check --commit HEAD
silvermoon check --remote
```

Use the report's `observedPrimaryCommit` as the expected remote tip. When
primary moves, reobserve instead of replaying approval or acceptance.

Choose the entry command from the user's intent. Explicit new-idea requests use
`silvermoon create-idea --json` even when unrelated active ideas exist; all
navigation uses `silvermoon whats-next [idea] --json`. Both commands apply the
same branch, conflict, worktree, and ancestry hygiene. If hygiene blocks an
explicit creation, perform only that blocking action and then retry
`create-idea` so active-idea selection cannot replace the pending create intent.

## Decisions And Publication

`whats-next` is read-only. Human approvals, implementation acceptance,
deployment acceptance, and abandonment are ordinary edits to one idea
`status.yaml` after an explicit decision. Validate the candidate and publish a
normal non-force commit. Prefer status-only decision commits when practical.

The required idea-root `ledger.md` is the Agent continuation surface. After
repository hygiene and lifecycle routing, combine the reported action, world
contracts, and unchecked Implementation or Deployment ledger entries to infer
the next work. Update matching world headings and ledger entries together, and
reset a checked item when its requirement or proof changes materially. Ledger
checkboxes are Agent notes only and never imply approval or acceptance.

Preserve unknown changes, concurrent history, and previous revision facts.
Never force-push, reset, broadly clean, or automatically delete feature
branches.

## Repository Checks

- Run `pnpm test` for the fast unit-and-contract developer suite.
- Run `pnpm test:integration` for real filesystem and Git behavior, and
  `pnpm test:e2e` for the installed package.
- Run `pnpm check` after CLI, schema, repository model, release, or skill
  changes; it remains the complete release-grade validation entrypoint.
- Run `pnpm check:skills` after skill changes.
- Validate package contents, installed-package smoke behavior, Markdown links,
  and `git diff --check` before delivery review.
- Use `silvermoon check --commit HEAD` for checked-out CI and
  `silvermoon check --remote` for complete primary-history evidence.
