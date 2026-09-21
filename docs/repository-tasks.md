# Repository tasks

This repository uses the local [`repoledger`](/skills/repoledger/SKILL.md)
skill with `repoledger.yaml` and `tasks/status.yaml`.

## Admission

Begin intake only after an explicit `/repoledger new` invocation. Admit one
accepted outcome only when it is expected to change at least one path outside
`tasks/**`. Questions, planning-only work, validation-only work, external-only
work, and task-ledger maintenance remain task-free.

## Publication

The shared authority is `https://github.com/shazhou-ww/repoledger.git` on
`main`. Every ongoing task advertises a resumable source branch and optionally
a fork repository. Publish source and primary changes non-force, preserve
concurrent work, and never delete source branches as a lifecycle side effect.

Use:

```sh
repoledger task list
repoledger status <task-name>
repoledger check <task-name> --remote
repoledger check --commit HEAD
repoledger check --staged
repoledger task register <task-name>
repoledger task start <task-name> [--source-repository <url>] [--source-branch <branch>]
repoledger task complete <task-name> --approved-commit <commit>
repoledger task abandon <task-name>
```

## Progress And Review

Create or update `Progress.md` only in a commit that also changes at least one
path outside `tasks/**`. Scope and delivery review are required. Interface,
business/data model, and architecture review apply when affected. Completion
uses the exact delivery-approved primary commit.

## Repository Checks

- Run `pnpm check` after CLI, schema, task, configuration, or release changes.
- Run `pnpm check:skills` after skill changes.
- Use `repoledger check --commit HEAD` for the checked-out CI commit and
    `repoledger check --remote` when refreshed source refs must also be checked.
- Validate package contents, installed-package smoke behavior, Markdown links,
  and `git diff --check` before delivery review.