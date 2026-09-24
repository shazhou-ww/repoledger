# Silvermoon repository instructions

## Idea workflow

- Handle small, well-scoped tasks directly. For substantial, multi-step work
  that needs durable scope, decisions, or progress tracking, suggest an idea
  and wait for confirmation before creating it.
- Load [`silvermoon`](skills/silvermoon/SKILL.md) and apply
  [`docs/repository-tasks.md`](docs/repository-tasks.md) only when the user
  invokes `/silvermoon`, requests a new idea, or asks to navigate or continue
  an existing one.
- Start new ideas with `silvermoon create-idea --json`; otherwise start with
  `silvermoon whats-next [idea] --json`. Execute only the highest-priority
  action and preserve creation intent across hygiene retries.
- Preserve unknown and concurrent work. Never force-push, reset, clean, or
  silently replay a stale decision.
- Record approval, acceptance, and abandonment only as explicit status facts,
  validate the exact candidate, and publish through ordinary non-force Git.
- Requery only after an observable change. Yield on human or external waits;
  stop on actionable errors or lack of progress.

## Validation

- Run `pnpm check` after CLI, schema, repository model, release, or skill changes.
- Run `pnpm check:skills` after changing skill frontmatter or structure.
- Do not commit secrets, credentials, tokens, or private customer data.

## npm releases

- Follow [`docs/npm-package-releases.md`](docs/npm-package-releases.md).
- Publish only through `.github/workflows/publish-npm.yml`, using an immutable
  `npm/silvermoon/v<version>` tag on a commit reachable from `origin/main`.
  Never publish locally or add npm tokens.
