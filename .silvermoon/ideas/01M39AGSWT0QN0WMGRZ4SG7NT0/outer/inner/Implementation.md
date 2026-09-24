# Implementation

## Steps

### I-S01: Package the canonical skill

Include `skills/silvermoon/**` in the npm package and expose package-owned
helpers that identify its exact version and canonical skill content. Preserve
the source checkout exception so this repository's `npx --no-install
silvermoon` resolves and exercises the current checkout.

### I-S02: Diagnose complete adoption state

Add a read-only onboarding inspection ahead of lifecycle routing. Report the
execution source, package manager, exact manifest and installed versions,
repository-local skill content, repository configuration, every requirement's
status and blocking nature, dependency ordering, structured remediation,
recommended action, and recheck command.

### I-S03: Delegate remediation to existing owners

Keep Silvermoon diagnosis read-only and preserve the existing three-command
surface. Express dependency installation through the detected package manager,
skill registration through the supported `npx skills add` interface, and
configuration repair through ordinary reviewed file editing. Add no Silvermoon
init, setup, install, or skill mutation command.

### I-S04: Integrate onboarding with lifecycle routing

Allow temporary package execution to diagnose and recommend adoption, require
normal consumers to use an exact project-local package and matching skill, and
block lifecycle routing until all blocking findings are resolved. Preserve
existing lifecycle actions and Git safety after an adopted repository is ready.

### I-S05: Document and verify the product contract

Update both READMEs, the canonical skill, and adoption guidance. Add unit,
contract, integration, and installed-package coverage for package contents,
bootstrap reporting, source and project-local execution, synchronization and
drift, and adopted lifecycle behavior.

## Acceptance criteria

### I-AC01: Published package is self-contained and aligned

The packed artifact contains the canonical skill and installed consumers can
prove its content matches the repository-local discovery surface exactly.
`npm run pack:check` and the installed-package e2e test prove the package file
surface, version authority, and executable behavior.

### I-AC02: Bootstrap diagnosis is complete and read-only

An unfamiliar Git repository receives all known onboarding requirements and
findings in one human-readable or JSON observation, including statuses,
blocking flags, dependencies, structured remediation, a recommended action,
and recheck command, without filesystem or Git mutation. Integration tests
snapshot repository state around `whats-next` and assert the complete report.

### I-AC03: Execution authority and drift are enforced

Reports distinguish source checkout, project-local, temporary, global, and
unknown sources. Consumer lifecycle routing proceeds only when the exact
declared and installed CLI version matches the exact packaged skill content;
missing or drifted state blocks with deterministic findings. Unit and e2e tests
prove source dogfooding, installed-package readiness, and drift detection.

### I-AC04: Remediation ownership remains separated

`whats-next` never writes package, skill, configuration, or metadata paths.
Structured remediation uses the detected package manager, points skill work to
the verified `npx skills add` syntax, and directs configuration repair through
ordinary file editing. CLI and e2e tests prove Silvermoon retains only
`whats-next`, `create-idea`, and `check`.

### I-AC05: Adopted lifecycle behavior does not regress

Once onboarding is ready, existing selection, hygiene, revision, creation, and
validation behavior remains compatible. The focused unit/contract/integration/
e2e suites and final `pnpm check` prove both the new contract and prior
lifecycle scenarios.
