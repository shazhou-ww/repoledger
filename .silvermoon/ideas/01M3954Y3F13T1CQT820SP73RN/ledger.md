---
idealRevision: 3d4e8ec9a0eef46ace02fa1a55899c89eff6e7d5
implementationRevision: 62653b52b3593ea63bf964b255bcb0b3a9b80286
deploymentRevision: 47e804c752c5204e47ff93483428e20dfedf5cfa
---

# Ledger

## Current

- State: implementing
- Focus: implementation acceptance
- Blocked: awaiting explicit human acceptance

## Work

- [x] Split the version 1 schema into config, idea status, and shared definitions entrypoints.
- [x] Add Draft 2020-12 compilation and positive/negative validation tests.
- [x] Update README, package contents checks, and installed-package smoke coverage.
- [x] Remove current implementation, test, script, and user-documentation references to `schema/v1.json`.

## Checks

- [x] Targeted schema and config tests: 7 passed, 1 skipped.
- [x] `pnpm check`: 93 passed, 1 skipped; package, installed smoke, and skill checks passed.
- [x] `git diff --check`: passed.
- [x] `silvermoon check --worktree --json`: passed.

## Next

1. Obtain explicit implementation acceptance for revision `62653b52b3593ea63bf964b255bcb0b3a9b80286`.
