# Getting Started

This guide is the authoritative setup and first-use path for Silvermoon.

## Prerequisites

- Node.js 22 or newer.
- A Git repository whose shared primary branch is reachable over HTTPS.
- Permission to fetch that branch and to publish ordinary non-force commits
  through the repository's normal collaboration path.

## Install The Project Dependency

Install Silvermoon in the repository so every collaborator uses the declared
version:

```sh
npm install --save-dev silvermoon
```

Register the canonical packaged skill through the supported `skills` interface:

```sh
npx skills add ./node_modules/silvermoon/skills --skill silvermoon --agent github-copilot --yes --copy
```

Silvermoon diagnoses whether the project dependency, installed package, and
repository-local skill match. It does not install dependencies or mutate skill
registration itself.

## Configure The Shared Primary

Create `.silvermoon/config.yaml`:

```yaml
version: 1
primaryRepository: https://github.com/example/repository.git
primaryBranch: main
```

The repository URL is credential-free, canonical shared state. Credentials,
named remotes, and URL rewrites remain local Git concerns. Silvermoon metadata
paths are fixed and cannot be overridden by configuration.

## Create The First Idea

Run:

```sh
npx silvermoon create-idea --json
```

The command first applies the same repository, worktree, conflict, and ancestry
hygiene used by navigation. When those checks pass, it creates one untracked
idea scaffold with `Idea.md`, `Implementation.md`, `Deployment.md`,
`ledger.md`, and `status.yaml`. It never stages, commits, pushes, or records a
human decision.

Replace the guidance in `Idea.md` with the desired outcome, scope, and
constraints. Keep implementation and deployment placeholders synchronized
until their lifecycle phases. Review every generated path and publish the
prepared idea through ordinary Git.

Then ask what comes next with the generated ULID or an exact unique alias:

```sh
npx silvermoon whats-next <idea> --json
```

The report contains one highest-priority action. Execute only that action. Run
the same command again only after an expected repository change, an unexpected
input change, or a newly arrived external result.

## Make Decisions Explicit

Silvermoon never infers approval or acceptance. After a person explicitly
approves the current ideal, accepts the current implementation, or accepts the
current deployment, record the exact revision reported by `whats-next` in the
corresponding `status.yaml` field. Validate the full candidate, stage it,
validate the staged snapshot, and publish a normal non-force commit.

Continue with [Core Concepts](./core-concepts.md) before changing lifecycle
contracts, or use [Operating Silvermoon](./operations.md) for the routine
navigation and publication loop.

## Adopt Silvermoon In An Existing Repository

Adoption is a direct breaking cutover. Silvermoon recognizes only
`.silvermoon/config.yaml` version 1 and does not read, convert, or diagnose
previous layouts. Preserve Git history and record only decision facts supported
by explicit review. Follow the canonical installed skill's
`references/adoption.md` for the full adoption sequence.
