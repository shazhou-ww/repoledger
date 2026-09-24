# Deployment

## Steps

### D-S01: Observe the layered CI workflow on primary

Publish this deployment contract to `main` through the ordinary non-force path
and observe the GitHub Actions `CI` run whose head SHA is that exact published
commit. Do not trigger the npm publish workflow or create a release tag.

Inspect the run's jobs rather than treating the overall conclusion alone as
proof. The run must contain the six unit matrix jobs for Ubuntu, Windows, and
macOS on Node 22 and 24, one repository contract job, and one Git integration
job. No installed-package E2E or package publish job should run in ordinary CI.

## Acceptance criteria

### D-AC01: GitHub Actions proves the intended CI topology

The `CI` workflow run for the exact deployment-contract commit completes with
overall conclusion `success`. Every one of the six unit matrix jobs, the
repository contract job, and the Git integration job succeeds, and the run has
no E2E or publish job. Prove this from GitHub Actions run and job metadata tied
to the exact head SHA; a local test run or a run for a different commit is not
sufficient.
