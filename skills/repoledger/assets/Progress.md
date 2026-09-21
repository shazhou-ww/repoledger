# Progress

Updated: YYYY-MM-DD

## Current state

The latest verified state and the next concrete action.

## Decisions

- Decision and rationale.

## Human approvals

Copy all five checkpoints from `Task.md`. Use `Pending`, `Approved`,
`Not applicable`, or `Reopened`. A status may include a human-readable note
after a colon or dash; the leading value remains the canonical fact. An
approval entry names the human reviewer, date, reviewed artifact, and decision
evidence. A not-applicable entry repeats the task-specific rationale. Task
creation, invocation, silence, and routine Git authorization are not approval.
Record only decisions known when publishing an implementation delta. Delivery
may remain Pending here; `task complete --approved-commit` binds the later
delivery decision without a Progress-only commit.

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Pending | Planned artifact and next review action. |
| Interface | `<Pending or Not applicable>` | Match the applicability and plan in `Task.md`. |
| Business and data model | `<Pending or Not applicable>` | Match the applicability and plan in `Task.md`. |
| Architecture | `<Pending or Not applicable>` | Match the applicability and plan in `Task.md`. |
| Delivery acceptance | Pending | Published implementation and acceptance evidence. |

## Validation

Link evidence stored in this task directory using a file-relative path. Link
other repository-local evidence using the project's declared root-relative or
portable file-relative convention.

- Command or behavior checked, with its result.

## Blockers

- None.

## Outcome

Describe the implementation outcome and remaining delivery action. Lifecycle
state remains authoritative in `tasks/status.yaml`.
