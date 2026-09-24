# Release and verify Silvermoon 0.0.2

## Intent

Publish Silvermoon 0.0.2 from an approved repository snapshot and prove that
the npm package, rendered README, immutable documentation assets, and installed
CLI all match that release.

## Context

Silvermoon 0.0.1 was published from a tag that predates the reader-first
documentation restructure. Its npm README therefore contains the older
documentation layout. Its relative image reference was also resolved through
the mutable repository default branch and broke when the artwork moved.

The compatibility path on `main` repairs the 0.0.1 image, but future package
pages should remain correct without depending on mutable branch contents.

## Desired outcome

The npm registry serves Silvermoon 0.0.2 as the latest stable version from its
immutable release tag. Its package README uses the current reader-first
structure and resolves images and repository documentation against that exact
release snapshot. The published tarball contains the intended files, a clean
installation runs the expected CLI, and the npm package page visibly renders
the README and artwork correctly.

## Scope

### In scope

- Make npm-facing README references immutable for a release without making the
  repository README unusable before its release tag exists.
- Prepare and validate the Silvermoon 0.0.2 package contents and version.
- Publish through the protected GitHub Actions trusted-publishing workflow.
- Verify registry metadata, tarball contents, clean installation, CLI behavior,
  provenance, dist-tag selection, and the rendered npm package page.
- Preserve evidence for the exact release tag and published package.

### Out of scope

- Replacing or mutating the already published Silvermoon 0.0.1 tarball.
- Unrelated CLI features, schema changes, or documentation redesigns.
- Local npm publication, npm write tokens, movable release tags, or force
  pushes.

## Constraints

- Follow `docs/npm-package-releases.md`: publish only through
  `.github/workflows/publish-npm.yml` from an immutable
  `npm/silvermoon/v0.0.2` tag on a commit reachable from `origin/main`.
- The tag version and committed package version must match exactly, and 0.0.2
  must be absent from npm before publication.
- Repository checks, package checks, and installed-package tests must pass for
  the exact candidate before the release tag is created.
- Release-specific README generation must be deterministic and validated; it
  must not silently publish documentation or assets from `main` or `HEAD`.
- Human approval and acceptance boundaries must be completed before advancing
  from preparation to implementation and deployment.
