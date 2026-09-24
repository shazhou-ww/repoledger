# Repoledger repository instructions

## Idea workflow

Load and follow [`repoledger`](skills/repoledger/SKILL.md) when the user invokes
`/repoledger` or asks to navigate or continue a repository idea. Apply the
repository profile in [`docs/repository-tasks.md`](docs/repository-tasks.md).

- For an explicit new-idea request, start with `repoledger create-idea --json`;
  otherwise start with `repoledger whats-next [idea] --json`. Execute only the
  highest-priority action and preserve create intent across hygiene retries.
- Preserve unknown work and both sides of concurrent history; never force-push,
  reset, clean, or silently replay a stale decision.
- Record approval, acceptance, and abandonment only as explicit status facts,
  validate the exact candidate, and publish through ordinary non-force Git.
- Requery only after an observable delta. Yield on human/external waits and stop
  on actionable errors or no progress.

## Validation

- Run `pnpm check` after CLI, schema, repository model, release, or skill changes.
- Run `pnpm check:skills` after changing skill frontmatter or structure.
- Do not commit secrets, credentials, tokens, or private customer data.

## npm releases

Before preparing or troubleshooting a release, follow
[`docs/npm-package-releases.md`](docs/npm-package-releases.md). Publish only
through `.github/workflows/publish-npm.yml` using an immutable
`npm/repoledger/v<version>` tag on a commit reachable from `origin/main`.
Never publish from a development machine or add npm tokens.
