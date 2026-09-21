# Repoledger repository instructions

## Task workflow

Load and follow [`repoledger`](skills/repoledger/SKILL.md) only when the user
explicitly invokes `/repoledger`, or asks to manage an existing registered
repository task. Apply the repository profile in
[`docs/repository-tasks.md`](docs/repository-tasks.md). Ordinary implementation
requests remain task-free.

- Create a task only through an explicit `/repoledger new` invocation.
- Use `repoledger task list`, `status`, and `check --remote` before task work.
- Publish routine task state and source refs non-force; never discard unrelated
  or concurrent work.
- Update `Progress.md` only with an implementation change outside `tasks/**`.
- Require explicit human decisions at applicable review gates and exact-commit
  delivery approval before completion.
- Keep terminal task paths stable and never force-push.

## Validation

- Run `pnpm check` after CLI, schema, release, or skill changes.
- Run `pnpm check:skills` after changing skill frontmatter or structure.
- Do not commit secrets, credentials, tokens, or private customer data.

## npm releases

Before preparing or troubleshooting a release, follow
[`docs/npm-package-releases.md`](docs/npm-package-releases.md). Publish only
through `.github/workflows/publish-npm.yml` using an immutable
`npm/repoledger/v<version>` tag on a commit reachable from `origin/main`.
Never publish from a development machine or add npm tokens.