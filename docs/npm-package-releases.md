# npm package releases

This repository publishes an allowlisted package when an authorized
tag under `npm/` reaches GitHub. The tag is a release instruction; the package
manifest at the tagged commit remains authoritative for the package name and
version.

The current release mapping is:

| Release key | Package | Directory |
| --- | --- | --- |
| `silvermoon` | `silvermoon` | `.` |

A stable tag such as `npm/silvermoon/v0.1.1` publishes with the npm `latest`
dist-tag. A named prerelease such as `npm/silvermoon/v0.2.0-beta.1` publishes
with the `beta` dist-tag. Numeric-only prerelease channels are intentionally
rejected.

## One-time configuration

### npm trusted publisher

In the npm package settings, add a GitHub Actions trusted publisher with these
exact values:

- Organization or user: `shazhou-ww`
- Repository: `silvermoon`
- Workflow filename: `publish-npm.yml`
- Environment: `npm`
- Allowed action: direct `npm publish`

The workflow filename is identity-sensitive on npm. If it changes, update the
npm trusted-publisher configuration before attempting another release. Do not
create an npm automation token or store `NPM_TOKEN` or `NODE_AUTH_TOKEN` in
GitHub secrets; the workflow uses GitHub OIDC with `id-token: write`.

### GitHub environment

Create an environment named `npm`. Limit deployments to protected tags in the
`npm/**` namespace. Add required reviewers when the repository needs a manual
release approval; the workflow itself does not require a repository secret.

The npm trusted publisher and the workflow environment name must remain the
same. A mismatch prevents npm from accepting the OIDC identity.

The workflow uses a GitHub-hosted runner, `id-token: write`, Node 24,
`actions/setup-node` with `registry-url: https://registry.npmjs.org`, and a
pinned npm CLI version at or above `11.5.1`. These are source-controlled OIDC
preconditions; do not replace them with a write token.

### Tag ruleset

Create an active GitHub tag ruleset targeting `npm/**`. Restrict tag creation,
update, and deletion to the release maintainers or a dedicated release team.
Do not allow release tags to be moved after creation. The workflow independently
fetches `origin/main` and rejects a tagged commit that is not reachable from
that refreshed branch.

Tag protection is part of the trust boundary: GitHub loads a workflow from the
tagged commit, so only authorized maintainers should be able to create tags in
the release namespace.

## Publish a version

1. Update the selected package's `version` in its committed `package.json`.
2. Run `pnpm install --frozen-lockfile` and `pnpm check`. The complete check
   includes unit, contract, integration, package contents, installed-package
   E2E, and skill discovery.
3. Merge the version change to `main`; do not tag an unmerged branch or local
   working tree.
4. When the release is a deployment criterion of an active Silvermoon idea,
   record implementation acceptance for the approved current idea revision,
   publish that status-only commit, and require `silvermoon whats-next <idea>` to
   return `deploy-idea`. Never create the release tag while the idea still
   derives `implementing`.
5. Fetch the current primary branch and tags.
6. Create the package-specific tag at `origin/main` and push that exact tag.

For `silvermoon@0.1.1`:

```sh
git fetch origin main --tags
git tag npm/silvermoon/v0.1.1 origin/main
git push origin refs/tags/npm/silvermoon/v0.1.1
```

The tag version must exactly equal [`package.json`](../package.json). The
workflow never edits a manifest or chooses a version.

The [`publish-npm.yml`](../.github/workflows/publish-npm.yml) workflow then:

1. verifies the tagged commit is reachable from refreshed `origin/main`;
2. installs the frozen pnpm dependencies;
3. runs the allowlisted release planner and confirms the version is absent
   from npm;
4. runs `pnpm test:unit`, `pnpm test:contract`, `pnpm test:integration`, and
   `pnpm check:skills`;
5. runs the selected package's `npm run pack:check` and
   `npm run test:e2e`; and
6. publishes only the selected directory with provenance and the derived npm
   dist-tag.

Release runs are serialized within this repository. The registry preflight and
`npm publish` cannot form one cross-system transaction, so an external
publisher could still win that interval; npm then atomically rejects the
duplicate publication without replacing the existing version.

## Failure behavior

Publication stops before `npm publish` when the tag is malformed, the release
key is unknown, the package is private, the package name or version differs
from the mapping and tag, the npm publish configuration is not public npmjs,
the commit is outside `origin/main`, the version already exists, registry state
cannot be verified, or validation fails.

For a transient GitHub or registry failure before publication, rerun the same
workflow run. Do not move or recreate the tag. For a source, manifest, or
validation failure, make a new commit on `main`, choose a new version, and push
a new tag after the fix is merged. npm versions and release tags are immutable.

## Add another package

1. Give the package a committed canonical `name`, SemVer `version`, and
   `publishConfig` with `access: public` and registry
   `https://registry.npmjs.org/`.
2. Add a fixed release-key entry to `RELEASE_PACKAGES` in
   [`prepare-npm-release.mjs`](../scripts/prepare-npm-release.mjs). Never derive
   a filesystem path directly from tag text.
3. Extend the release tests with the package selection, identity, version, and
   dist-tag cases.
4. Add the same `publish-npm.yml` trusted publisher to that npm package, using
   the `npm` environment.
5. Keep its tags under the protected `npm/<release-key>/v<semver>` convention.

Run `node --test test/unit/prepare-npm-release.test.mjs
test/integration/prepare-npm-release.test.mjs
test/contract/npm-release.test.mjs` for focused release validation and
`pnpm check` for the complete repository suite before merging the mapping
change.
