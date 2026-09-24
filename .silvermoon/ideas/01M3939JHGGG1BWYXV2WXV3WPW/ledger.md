---
idealRevision: e040b49e03fc0fcb91213ccd7e5beedc551a553a
implementationRevision: 925b1af1bb4a3a21cc46c05d0461e15cb59f6e8d
deploymentRevision: 07210a74bffb8a39a4995d94bb8cc3e01e6216e7
---

# Ledger

## Current

- State: deploying
- Focus: request deployment acceptance
- Blocked: explicit human deployment acceptance required

## Work

- [x] Allow optional idea-root `ledger.md` as a regular repository-owned file.
- [x] Keep ledger add, edit, and removal outside all three world revisions.
- [x] Expose `ledgerPath` through selected-idea and lifecycle guidance.
- [x] Document revision frontmatter and Current, Work, Checks, and Next conventions.
- [x] Require stale ledger records to be re-reviewed before continuation.
- [x] Keep Agent checkboxes separate from human lifecycle decisions.
- [x] Remove criteria evidence parsing, verification, tests, and package exports.
- [x] Migrate the layered-world record to its idea ledger.
- [x] Align README, repository guidance, skill, package allowlist, and smoke checks.

## Checks

- [x] Targeted Node tests: 30 passed.
- [x] `pnpm check`: 90 passed, 1 skipped.
- [x] Package allowlist and installed-package smoke passed.
- [x] Skill validation passed.
- [x] `silvermoon check --worktree --json` passed with unchanged world revisions.
- [x] `git diff --check` passed.
- [x] D01: published `whats-next`, skill, and ledger expose the action and continuation context.
- [x] D02: add, edit, and removal tests preserve all world revisions; remote state remains deploying until an explicit decision.
- [x] D03: package smoke confirms the criteria evidence exports are absent; current guidance has no root evidence requirement.
- [x] `silvermoon check --remote --json` passed at primary commit `9545f3387c50a3b8962e0cf73541654cfbb20a88`.

## Next

1. Publish this deployment verification update.
2. Request explicit acceptance for deployment revision `07210a74bffb8a39a4995d94bb8cc3e01e6216e7`.
