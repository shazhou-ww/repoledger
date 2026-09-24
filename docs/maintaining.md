# Maintaining Silvermoon

This page is the entry point for repository contributors and package
maintainers.

## Development

Install the locked dependency graph:

```sh
pnpm install --frozen-lockfile
```

Use the smallest check that covers a change:

```sh
pnpm sync:skills       # refresh the generated GitHub Copilot skill copy
pnpm test              # fast unit and repository contract tests
pnpm test:integration  # real filesystem and Git behavior
pnpm test:e2e          # packed and installed CLI behavior
pnpm check             # complete release-grade validation
pnpm check:skills      # skill discovery and structure
```

Edit the canonical skill only under `skills/silvermoon`, then run
`pnpm sync:skills`. The checked-in `.github/skills/silvermoon` directory is a
generated copy so repository skill discovery works without symbolic-link
support. `pnpm check:skills` rejects a stale or manually edited copy.

Run `pnpm check` after CLI, schema, repository model, release, or skill changes.
Documentation work must also preserve Markdown links, package contents,
installed-package rendering surfaces, and `git diff --check`.

## Documentation Ownership

- [Getting Started](./getting-started.md) owns installation, configuration,
  first use, and adoption entry.
- [Core Concepts](./core-concepts.md) owns product reasoning, nested worlds,
  decision boundaries, and continuity.
- [Operating Silvermoon](./operations.md) owns the routine Agent and Git loop.
- [Technical Reference](./reference.md) owns exact storage, revision, state,
  command-report, validation, and schema details.
- The English and Chinese READMEs remain synchronized reader-first entrances;
  they link to these authoritative pages instead of duplicating full
  specifications.

## Repository Work And Releases

Use [Repository idea workflow](./repository-tasks.md) for this repository's
Silvermoon coordination rules.

Use [npm package releases](./npm-package-releases.md) for trusted publishing,
tag rules, release validation, and failure recovery. Publishing occurs only
through `.github/workflows/publish-npm.yml` from an immutable
`npm/silvermoon/v<version>` tag whose commit is reachable from `origin/main`.
Never publish locally or add an npm token.
