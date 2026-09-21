# User acceptance

Updated: YYYY-MM-DD

This guide records manual test execution, not the delivery approval decision.
Delivery approval is bound by `task complete --approved-commit`; do not create
a Progress-only commit to repeat it. A single response satisfies both manual
acceptance and delivery approval only when the user explicitly reports both.

## Purpose

State the user-visible behavior or decision this guide validates.

## Test target

- Published implementation: `<primary-repository>#<primary-branch>` and
  release, build, or deployment identifier when applicable.
- Environment or entry point: Exact location the user should open or operate.

Use a file-relative link for any target stored in this task directory.

## Preconditions

- Required setup, account, data, device, or access. Do not include secrets.

## Steps

1. Exact user action.

## Expected results

1. Observable result for the matching step.

## Report outcome

Report one of these outcomes:

- `Accepted`
- `Failed at step <number>: <observed result>`

Include a screenshot or non-secret log reference when it helps explain a
failure.

## Status

Pending. Record only the acceptance or failure the user actually reports,
including the date and relevant evidence.
