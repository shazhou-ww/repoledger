# Deployment

## Steps

### D-S01: Build and inspect the publishable artifact

Create the npm tarball through the ordinary package workflow without
publishing it. Inspect its manifest and file list to prove that the canonical
`skills/silvermoon/**` tree, CLI entry point, runtime modules, schemas, and
documentation are all present in one self-contained artifact.

### D-S02: Exercise unfamiliar-project diagnosis

Install that tarball into a newly initialized Git/npm consumer project and run
its project-local `silvermoon whats-next --json`. Capture the complete
onboarding requirements and findings, including execution source, blocking
flags, dependencies, structured remediation, recommended action, and recheck,
and compare Git status before and after to prove diagnosis is read-only.

### D-S03: Verify registration, readiness, and drift

Use the supported `npx skills add` interface to register the skill shipped by
the installed package into the consumer repository. Re-run `whats-next` to
prove exact CLI/skill alignment is ready, then alter the registered skill in
the isolated fixture and prove the mismatch blocks lifecycle routing.

### D-S04: Verify source-checkout dogfooding and command boundaries

Run `npx --no-install silvermoon` in the Silvermoon repository and prove it
identifies the current checkout as `source-checkout`. Inspect CLI help and
installed-package behavior to prove the public command surface remains limited
to `whats-next`, `create-idea`, and `check`, with no Silvermoon-owned init,
setup, install, or skill mutation command.

### D-S05: Execute release-grade validation

Run the package check, installed-package e2e suite, repository worktree check,
diff hygiene check, and complete `pnpm check` pipeline. Record completion only
when every command exits successfully and no npm publication occurs.

## Acceptance criteria

### D-AC01: Canonical skill ships in the npm artifact

The dry-run/packed npm artifact contains both canonical skill files at their
versioned package paths and passes the exact package allowlist. Prove this with
`npm run pack:check` and the tarball inspection performed by the installed
package e2e test.

### D-AC02: Bootstrap diagnosis is complete and observational

In a newly initialized Git/npm project, the installed project-local CLI reports
all stable onboarding requirement IDs and current findings in one invocation,
with dependencies, blocking state, remediation, recommended action, and
recheck. Git status is byte-for-byte unchanged before and after the invocation;
the installed-package e2e assertions provide the proof.

### D-AC03: Registered skill alignment gates readiness

After registration via `npx skills`, a consumer report identifies
`project-local` execution and reaches onboarding `ready` only when registered
skill content exactly matches the installed package. Deliberate fixture drift
changes the skill finding to `mismatched` and returns `adopt-silvermoon`;
installed-package e2e assertions provide the proof.

### D-AC04: Source checkout dogfoods without expanding mutation authority

In this repository, `npx --no-install silvermoon whats-next ... --json`
reports `source-checkout` and the checkout's current version/content. CLI help,
source search, and package e2e assertions prove there are no Silvermoon-owned
init, setup, install, or skill mutation commands.

### D-AC05: Release-grade checks pass without publication

`pnpm check`, `npx --no-install silvermoon check --worktree --json`, and
`git diff --check` all succeed after the deployment contract and evidence are
recorded. No npm publish command or release workflow is executed.
