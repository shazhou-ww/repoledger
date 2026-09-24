# Unify Silvermoon onboarding and local tooling versions

## Intent

Make `silvermoon whats-next` the single discovery and onboarding entry point for
both adopted and unfamiliar repositories. Ensure every repository uses a
project-local Silvermoon CLI together with the exact matching repository-local
Agent skill.

## Context

Silvermoon currently publishes its CLI through npm while its Agent skill is
installed separately from the source repository. The two surfaces can drift,
global or temporary CLI resolution can hide the version a repository actually
uses, and an unfamiliar repository has no single command that explains all
adoption requirements.

Agents need a complete diagnosis comparable to `brew doctor`: one observation
should describe the desired onboarded state, every currently unmet condition,
their dependencies and safe remediation. An Agent may repair all deterministic
findings in dependency order or re-run the diagnosis between repairs.

## Desired outcome

Running `silvermoon whats-next` in any Git repository returns a complete,
structured report of Silvermoon onboarding and hygiene before routing idea
lifecycle work.

The report distinguishes Silvermoon's execution source, verifies the declared
and installed project dependency, and verifies that the discoverable
repository-local skill exactly matches the skill shipped with that installed
CLI version. It reports every known satisfied, missing, mismatched, blocked,
conflicting, or inapplicable requirement, identifies blocking versus
recommended findings, expresses dependencies between remediations, and gives a
recommended action and recheck command.

An invocation from a temporary package may diagnose an unfamiliar repository
and instruct it to adopt that exact Silvermoon version. Normal idea work uses
the repository's installed package and never silently depends on a global or
freshly downloaded version. In the Silvermoon source repository,
`npx --no-install silvermoon` executes the current checkout so development and
CI exercise the implementation under test.

The canonical skill ships in the npm package. Adoption explicitly synchronizes
it into a repository-visible, commit-capable discovery surface; dependency
installation does not silently modify tracked repository files. After
deterministic remediation, a fresh `whats-next` observation proves whether the
repository is ready before idea lifecycle work proceeds.

## Scope

### In scope

- Package the canonical Silvermoon skill with the CLI and keep their versions
  and contents verifiably aligned.
- Detect whether the CLI is executing from the Silvermoon source checkout, a
  project-local installation, a temporary package invocation, a global
  installation, or an unknown source.
- Define and report the complete onboarding and skill-version hygiene contract
  through human-readable and JSON `whats-next` output.
- Detect the repository package manager and provide deterministic remediation
  metadata without automatically changing the repository.
- Support explicit installation or synchronization of the packaged skill into
  the repository's Agent discovery surface.
- Preserve the existing safety model: diagnosis is read-only, mutations are
  explicit, and lifecycle work cannot cross unresolved blocking findings.
- Cover package contents, installed-package behavior, source-repository
  dogfooding, bootstrap diagnosis, skill synchronization, drift detection, and
  lifecycle routing with automated tests and documentation.

### Out of scope

- Automatically running package installation or mutating tracked files from
  `whats-next`, npm lifecycle hooks, or dependency installation.
- Making a global Silvermoon installation authoritative for a repository.
- Silently overwriting a locally modified skill or conflicting repository
  instructions.
- Requiring an Agent to repair every reported finding in one uninterrupted
  sequence; the report supports both batched remediation and repeated
  observation.
- General-purpose dependency health checks unrelated to Silvermoon adoption.

## Constraints

- `whats-next` remains observational: it may inspect and fetch according to its
  existing contract but does not install, edit, stage, commit, or push.
- Reports describe required invariants and observed facts, not merely shell
  command strings. Suggested commands use structured executable and argument
  data and respect the detected package manager.
- The installed package is the runtime authority in consumer repositories:
  its exact resolved version and packaged skill content must match the
  repository-local skill. Manifest ranges alone are insufficient evidence.
- The Silvermoon source repository is a deliberate exception: its own package
  entry point must resolve to the current checkout without a duplicate
  `node_modules` installation.
- Canonical skill content and repository-specific supplemental instructions
  remain separate so local policy does not masquerade as the versioned
  Silvermoon protocol.
- Existing conflict, unknown-work, ancestry, and non-force publication
  protections continue to take precedence where proceeding could discard or
  misattribute work.
