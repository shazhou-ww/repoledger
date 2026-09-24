# Implementation

## Steps

### I-S01: Separate tests by execution boundary

Create `test/unit/`, `test/integration/`, `test/contract/`, and `test/e2e/`.
Move tests whose whole file already has one boundary, and split mixed CLI, Git,
release, and navigation suites so each resulting file satisfies its directory's
dependency rules. Update relative imports and repository artifact paths without
changing the assertions or behavior cases being protected.

Move the installed-package smoke scenario from `scripts/` into `test/e2e/`.
It must continue to build a real tarball, install it in a fresh consumer
repository, and invoke the public package interfaces.

### I-S02: Expose deterministic validation commands

Define package scripts for `test:unit`, `test:contract`, `test:integration`, and
`test:e2e`. Keep `test` as the fast unit-plus-contract developer default, add a
quick check that includes CLI syntax, and keep `check` as the complete
repository-required validation entrypoint.

The complete entrypoint must compose every layer plus package contents and
external skill discovery exactly once. A layer-specific command must not depend
on default test discovery outside its named directory.

### I-S03: Reshape CI and publish validation

Change ordinary CI so unit tests retain the supported OS and Node matrix while
contract and integration tests run once on Ubuntu with the current Node
version. Keep skill discovery with the representative contract job and exclude
installed-package E2E from ordinary push and pull-request runs.

Change the npm publish workflow to run syntax, unit, contract, integration,
skill discovery, selected-package contents, and installed-package E2E as
explicit pre-publication steps. Preserve trusted publishing, ancestry,
allowlist, immutable version, and selected package-directory controls.

### I-S04: Align documentation and executable contracts

Update repository validation and npm release instructions to name the new
commands and explain which checks run in ordinary CI versus publication.
Update workflow, behavior-manifest, branding, and other repository contract
tests for the new paths and step names without weakening their assertions.

## Acceptance criteria

### I-AC01: Every automated test has an accurate layer

Every existing test case remains discoverable under exactly one of
`test/unit/`, `test/integration/`, `test/contract/`, or `test/e2e/`. Unit tests
do not invoke Git or use test-owned temporary filesystem fixtures; contract
tests only read repository artifacts; integration tests may use local temporary
Git repositories but no remote service; E2E installs and exercises the actual
tarball. Prove this by running all four layer-specific scripts successfully and
reviewing the split mixed suites.

### I-AC02: Ordinary CI gives fast pre-merge feedback

The CI workflow runs unit tests across Ubuntu, Windows, and macOS on Node 22 and
24, while contract plus skill discovery and real-Git integration each run once
on Ubuntu/Node 24. It does not run package installation E2E. Prove this through
the workflow contract tests and successful unit, contract, and integration
commands.

### I-AC03: Publication is guarded by the complete suite

Before `npm publish`, the publish workflow explicitly runs syntax, unit,
contract, integration, skill discovery, selected-package contents, and
installed-package E2E checks, with no check repeated through a nested aggregate
command. Prove ordering, selected working directory, and required steps in the
release workflow contract tests.

### I-AC04: Repository validation remains compatible and complete

`pnpm test` provides the documented fast unit-plus-contract default, and
`pnpm check` remains the complete validation command required by repository
instructions. Prove the refactor with `pnpm check`, `git diff --check`, and
`silvermoon check --worktree --json`, with no product behavior or public API
change.
