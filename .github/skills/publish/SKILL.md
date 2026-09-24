---
name: publish
description: "Publish the allowlisted npm package from this repository through the protected GitHub Actions trusted-publishing workflow. Use only when the user explicitly invokes /publish with a release key and version intent."
argument-hint: "[silvermoon] [major|minor|patch|x.y.z]"
user-invocable: true
disable-model-invocation: true
---

# Publish npm package

Publish the allowlisted package through this repository's protected
tag-triggered GitHub Actions workflow. Never publish directly from the
development machine.

## Safety boundary

- Run this workflow only after the user explicitly invokes `/publish`. Natural
  language discussion about versions or releases is not an invocation.
- Read the repository instructions and
  [`docs/npm-package-releases.md`](../../../docs/npm-package-releases.md) before
  changing the manifest, creating a tag, rerunning a workflow, or troubleshooting
  a release.
- Treat `scripts/prepare-npm-release.mjs` as the allowlist and release-key
  authority. Do not derive a package path from user text.
- Publish only through `.github/workflows/publish-npm.yml`. Never run
  `npm publish` locally and never create or request `NPM_TOKEN` or
  `NODE_AUTH_TOKEN`.
- Release versions and `npm/<release-key>/v<version>` tags are immutable. Never
  move, delete, or recreate a release tag to repair source or validation.
- Preserve unrelated worktree changes. Stop if they prevent an isolated,
  reviewable release commit.
- Before creating a tag, require the workflow to use a GitHub-hosted runner,
  `id-token: write`, Node `22.14.0` or newer, npm CLI `11.5.1` or newer, and
  `actions/setup-node` with `registry-url: https://registry.npmjs.org`. Treat
  these as release source requirements, not npm account workarounds.

## Resolve the release

1. Resolve the release key from the invocation. When omitted and exactly one
   package is allowlisted, use that key; otherwise ask for the key.
2. Resolve one explicit version intent: `major`, `minor`, `patch`, or an exact
   canonical SemVer. Use stable SemVer unless the user explicitly requests a
   named prerelease channel.
3. Read the package manifest, current npm versions, existing release tags, and
   the latest package-specific release tag. Calculate the target from the
   highest relevant stable version rather than assuming the working manifest is
   already published.
4. Fetch `origin/main` and tags. Require the release worktree to be reconciled
   with current `origin/main` before preparing the release.
5. Stop if the target npm version or exact release tag already exists. Report
   the immutable existing release rather than attempting to replace it.

## Prepare and publish the release commit

1. Update the package's `version` in `package.json` and synchronize exact-version
   installation examples and version assertions that belong to the same release.
2. Do not add unrelated feature work to a release-only change. If unreleased
   implementation is already integrated on `main`, the version commit may
   contain only release metadata and release-skill maintenance.
3. Run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm check
   git diff --check
   ```

4. Confirm the packed candidate has the requested package name and version and
   contains only the allowlisted files.
5. Commit the validated version change on `main`, push it through the normal
   non-force path, refresh `origin/main`, and verify the full commit is reachable
   from that branch. Do not tag an unpublished local commit or side branch.

## Silvermoon phase handoff

Apply this section when the release is a deployment criterion of an active
Silvermoon idea. Independent package releases skip it.

1. Run `silvermoon whats-next <idea> --json` after the validated release commit
   is published to primary.
2. Require the selected idea to be the approved current revision and the action
   to be `implement-idea`. If guidance reports worktree, sync, or another higher
   priority action, resolve that first and reobserve.
3. When the release commit and repository validation satisfy the idea's
   implementation expectations, record `implementationAcceptedRevision` for
   that exact idea revision in a separate status-only commit. Validate and
   publish it through ordinary non-force Git.
4. Requery the exact idea and require `deploy-idea` before creating the release
   tag. Never create the tag while the release idea still derives
   `implementing`.

The package version commit remains the release candidate. The later status-only
acceptance commit advances Silvermoon state and may become the tagged primary
commit because it leaves package contents unchanged.

## Create the release instruction

1. Fetch `origin/main` and tags again immediately before tagging.
2. Require a clean worktree, local `HEAD` equal to `origin/main`, an absent
   target tag, and an absent npm target version.
3. Run the release planner locally against the exact candidate:

   ```sh
   node scripts/prepare-npm-release.mjs \
     --tag npm/<release-key>/v<version> \
     --commit <full-origin-main-commit>
   ```

4. Create the immutable tag at the refreshed primary branch and push only that
   tag:

   ```sh
   git tag npm/<release-key>/v<version> origin/main
   git push origin refs/tags/npm/<release-key>/v<version>
   ```

The tag is the release instruction. Do not run a second publication command.

## Verify GitHub Actions and npm

1. Locate the `Publish npm package` run whose ref is the exact release tag and
   whose commit is the tagged `origin/main` commit. Do not mistake an older run
   for this release.
2. Follow the run to completion with GitHub CLI or the Actions API. If the npm
   environment requires a human reviewer, report that exact pending gate and
   wait rather than bypassing it.
3. Require the workflow conclusion to be `success`. Capture its run URL and
   immutable database ID.
4. Query npm for the exact package version and verify the stable `latest`
   dist-tag or requested named prerelease dist-tag points to it. Report the
   package version, release commit, tag, workflow URL, and registry result.

## Failure handling

- For a transient infrastructure or registry failure before publication,
  rerun the same workflow run without changing the tag.
- For source, manifest, or validation defects, leave the failed version and tag
  immutable. Fix the source on `main`, choose a new version, and create a new
  tag only after validation.
- If the registry shows the exact version even though workflow reporting is
  ambiguous, treat npm as immutable published state and investigate before any
  rerun.
- Authentication, tag protection, environment approval, branch protection, or
  failed validation are real blockers. Never bypass them with force pushes,
  local publication, or credentials routed through chat.
