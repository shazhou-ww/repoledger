# Deployment

## Steps

### D-S01: Publish a stable deployment contract

Publish this Deployment contract on the authoritative `main` branch before
performing external checks. Reobserve the idea and bind all evidence to the
resulting stable `deploymentRevision`.

### D-S02: Verify the public repository documentation surface

Confirm that the authoritative GitHub `main` branch serves both READMEs, every
Further Reading page, and both SVGs from their committed paths. Verify that the
English and Chinese entry pages point to the same internal destinations and to
the approved animation URLs without tracking parameters.

### D-S03: Verify the distributable package surface

Build and install the npm tarball from the authoritative deployment commit.
Confirm that both READMEs, every linked English documentation page, and both
SVGs are readable from the installed package and that the installed CLI smoke
workflow still succeeds.

## Acceptance criteria

### D-AC01: Authoritative primary contains the accepted implementation

The refreshed `origin/main` tip contains the accepted implementation commit
and the stable deployment contract, with no unpublished or dirty repository
changes. Prove this with Git ancestry and status checks plus
`silvermoon check --remote --json`.

### D-AC02: GitHub serves a complete reader-first documentation journey

Public GitHub URLs for both READMEs, the five Further Reading pages, the hero,
and the avatar return the content from the authoritative commit. Prove this by
retrieving each immutable raw URL and checking expected headings or SVG roots,
then verify the README links resolve to those committed paths.

### D-AC03: The installed package preserves every documented entry point

The packed artifact has the exact allowlisted contents, and an isolated
consumer can read both READMEs, all linked docs, and both SVGs while completing
the CLI smoke workflow. Prove this with `pnpm pack:check` and
`pnpm test:e2e` against the stable deployment revision.
