---
idealRevision: 3d4e8ec9a0eef46ace02fa1a55899c89eff6e7d5
implementationRevision: 62653b52b3593ea63bf964b255bcb0b3a9b80286
deploymentRevision: 2adc0e523930a05408b393a3b6c0ebf5fe8afe6b
---

# Ledger

## Current

- State: deploying
- Focus: public schema endpoint verification
- Blocked: awaiting explicit human deployment acceptance

## Work

- [x] Split the version 1 schema into config, idea status, and shared definitions entrypoints.
- [x] Add Draft 2020-12 compilation and positive/negative validation tests.
- [x] Update README, package contents checks, and installed-package smoke coverage.
- [x] Remove current implementation, test, script, and user-documentation references to `schema/v1.json`.
- [x] Record explicit implementation acceptance for revision `62653b52b3593ea63bf964b255bcb0b3a9b80286`.
- [x] Verify the published raw schema endpoints and authoritative remote history.

## Checks

- [x] Targeted schema and config tests: 7 passed, 1 skipped.
- [x] `pnpm check`: 93 passed, 1 skipped; package, installed smoke, and skill checks passed.
- [x] `git diff --check`: passed.
- [x] `silvermoon check --worktree --json`: passed.
- [x] All three GitHub raw schema endpoints returned parseable JSON with matching `$id` values.
- [x] Both entrypoints use relative `definitions.schema.json` references.
- [x] The removed `schema/v1.json` endpoint returned HTTP 404.
- [x] `silvermoon check --remote --json`: passed at commit `20b170d511453dca209a2057a11fd6a6c53cd1fb`.

## Next

1. Obtain explicit deployment acceptance for revision `2adc0e523930a05408b393a3b6c0ebf5fe8afe6b`.
