# Whatsnext detailed design

This document is the detailed design artifact for the outcome defined by
[Task.md](./Task.md). Narrative prose follows the task language; protocol
markers, field names, commands, and status values remain English.

## Design principles

1. `tasks/status.yaml` is the primary-branch coordination ledger. It records
   only the coarse task lifecycle: `backlog`, `ongoing`, `completed`, or
   `abandoned`.
2. `planning`, `implementing`, and `finalizing` are phases inside `ongoing`.
  While ongoing, their authoritative state and structured evidence live in
  one task-owned `State.yaml` on the advertised source branch. After a
  terminal primary transition, the primary copy owns terminal closure.
3. `State.yaml` and `tasks/status.yaml` are Repoledger-owned machine protocol.
   Agents and humans do not edit them directly.
4. Every phase check evaluates the cumulative changes since the commit that
   entered the current phase. It never infers phase validity from only the
   latest commit.
5. The phase base is derived from immutable Git history. It is not copied into
   `State.yaml` or `tasks/status.yaml`.
6. A persisted commit hash may identify only a commit that already exists and
   is an ancestor of the transaction commit's parent. No file may refer to the
   commit that contains that file revision.
7. Git hooks provide early feedback. Repoledger commands and required CI use
   the same validator and form the enforcement boundary.

## Authority model

### Primary ledger

The primary branch owns the task record in `tasks/status.yaml`:

```yaml
example-task:
  state: ongoing
  generation: 1
  sourceBranch: task/example-task/g1
  createdAt: "2026-09-22T00:00:00Z"
  updatedAt: "2026-09-22T00:10:00Z"
```

`sourceRepository` remains optional when the source repository differs from
the configured primary repository. `generation` is shared lifecycle identity,
not a phase. It starts at 1 and increments only during reactivation.

The primary record never stores:

- `planning`, `implementing`, or `finalizing`;
- a phase base or phase-transition commit;
- implementation validation results;
- prompt output or next action;
- worktree, task-folder, source-tip, or primary-tip snapshots;
- deployment, smoke-test, or manual-acceptance receipts.

While a task is active, primary always reports `state: ongoing`. Phase changes
on the source branch do not produce `tasks/status.yaml` commits and do not
create primary coordination churn.

### Task state

While primary reports `ongoing`, the advertised source branch owns the
authoritative `tasks/<task>/State.yaml`. A copy may appear on primary after
normal source integration, but `whatsnext` ignores that potentially lagging
copy until the task becomes terminal. The file merges phase and evidence into
one canonical document:

```yaml
version: 1
generation: 1
phase: implementing
guidance:
  planningBundleDigest: sha256:...
planning:
  contractDigest: sha256:...
  reviews:
    scope:
      status: approved
      artifactDigest: sha256:...
      reviewer: accountable-owner
      decidedAt: "2026-09-22T00:15:00Z"
implementation:
  criteria:
    AC-1:
      status: satisfied
      evidence: test/example.test.js
  validations:
    unit-tests:
      status: passed
      subjectCommit: 0123456789abcdef0123456789abcdef01234567
      evidence: pnpm test
finalization:
  targetCommit: null
  promptBundleDigest: null
  steps: {}
closure: null
```

The schema is strict and canonically serialized. Unknown fields, duplicate
stable IDs, noncanonical ordering, invalid phase-specific fields, secrets, and
hashes that do not resolve to permitted ancestors are errors.

`State.yaml` stores only the current generation. Earlier generations and
superseded evidence remain available through Git history. A completion,
abandonment, or reactivation transaction writes the primary copy together
with the coarse status transition. From that terminal or backlog commit until
the next start, primary owns the current closure or reset envelope.

### Human-readable artifacts

- `Task.md` is the durable outcome contract.
- `Progress.md` is the implementation journal.
- `UserAcceptance.md` contains manual test instructions when needed.
- Other task-folder files may hold non-secret logs, reports, or screenshots.

Facts that change `whatsnext` output must also be represented structurally in
`State.yaml`. Free-form prose is evidence for a human, not implicit machine
state.

## Lifecycle and phase graph

The primary lifecycle remains:

```text
absent -> backlog -> ongoing -> completed
                    |       \
                    |        -> abandoned
                    -> abandoned

completed|abandoned -> backlog  # explicit reactivation
```

The source-branch phase graph exists only while primary says `ongoing`:

```text
planning -> implementing -> finalizing
    ^            ^             |
    |            +-------------+
    +--------------------------+
```

The reverse transitions mean:

- `implementing -> planning`: the contract or approved plan needs revision;
- `finalizing -> implementing`: finalization found a required project change;
- `finalizing -> planning`: finalization found a goal or scope change.

Abandonment and completion are coarse primary lifecycle operations, not source
phase values.

## State ownership and mutation

All `State.yaml` writes use intent-specific Repoledger commands. There is no
generic `set-state` or arbitrary YAML patch command.

Conceptual events include:

- `phase-entered`;
- `review-recorded`;
- `criterion-recorded`;
- `validation-recorded`;
- `finalization-step-recorded`;
- `external-wait-recorded`.

Exact public command names remain an interface-review decision. Each event
executes the same transaction protocol:

1. Fetch primary and the advertised source ref.
2. Resolve the task record and canonical source identity.
3. Require the caller's expected source tip or snapshot digest to equal the
   fetched source tip.
4. Validate the event against the current generation, lifecycle, phase, and
   cumulative phase range.
5. Serialize the new `State.yaml` canonically.
6. Create a one-parent commit that changes only
   `tasks/<task>/State.yaml`.
7. Add canonical commit trailers describing the event.
8. Push the source ref non-force and verify the published result.

This State-only protocol applies while the task is ongoing. Coarse completion,
abandonment, and reactivation are primary lifecycle transactions and may
atomically modify exactly `tasks/status.yaml` and the current task's
`State.yaml`; they still contain no implementation or unrelated task paths.

A representative commit is:

```text
task: enter implementing example-task

Repoledger-Task: example-task
Repoledger-Generation: 1
Repoledger-State-Event: phase-entered
Repoledger-Phase: implementing
```

The checker cannot prove which executable created a structurally identical
commit. It guarantees transaction shape and state-machine validity. Signed
actor identity is a separate governance feature and is not required here.

## Start transaction

Starting a backlog task creates two commits from one fetched primary baseline:

```text
P0 -- S  primary
       \
        P  source
```

- `S` is a primary commit that changes only `tasks/status.yaml` from
  `backlog` to `ongoing` and records the generation-specific source identity.
- `P` is a source commit whose parent is `S`. It creates or resets
  `State.yaml` for the same generation with `phase: planning`.
- When the source repository is primary, one `git push --atomic` updates
  primary from expected `P0` to `S` and creates source at `P`. If the server
  lacks atomic-push support or either lease fails, neither ref may advance;
  Repoledger does not fall back to sequential same-repository pushes.
- For a cross-repository source, Repoledger pushes `P` to the new source ref
  first, then publishes `S` to primary. If primary publication fails, retry
  recognizes the exact `S`/`P` topology, unchanged primary baseline, source
  identity, and State content, then rolls forward by publishing the existing
  `S`; it never creates a second phase base or overwrites a different source.
- `P`, not `S`, is the first planning phase base.

## Phase-transition commits

A phase transition is an isolated `phase-entered` State transaction. Before
creating it, Repoledger validates the complete range for the phase being
closed.

For a transition commit `T`:

- `T` has exactly one parent;
- `T` is on the advertised source first-parent lineage;
- only `tasks/<task>/State.yaml` changes;
- parent and child parse as canonical state documents;
- `generation` is unchanged and matches the primary record;
- parent phase to child phase is a legal edge;
- event trailers match the parsed task, generation, and child phase;
- newly persisted hashes resolve to the parent or an earlier ancestor;
- no field contains `T` itself, a descendant, or a future primary commit.

The transition commit is the base for the phase it enters. It is excluded from
that phase's cumulative change range and is validated separately.

Evidence-only State transactions also touch `State.yaml`, but keep `phase`
unchanged and therefore never become a phase base.

## Deriving the phase base

Given advertised source candidate `C`, task `N`, and generation `G`:

1. Enumerate only `C`'s first-parent chain, newest to oldest.
2. For each chain commit that modifies `tasks/N/State.yaml`, parse that tree
  and its first-parent tree.
3. A marker is a structurally valid `phase-entered` commit where `phase`
  changed, or where generation `G` first introduced `phase: planning`.
4. Reject every malformed State-changing commit before considering later
  markers; an evidence commit may change State only with phase unchanged.
5. Keep markers whose parsed generation is `G`. Their first-parent order is a
  total order by construction.
6. The current phase base is the first marker in newest-to-oldest order. Its
  child phase must equal the candidate State phase.
7. Reject a missing marker, generation discontinuity, illegal edge, or any
  merge commit that changes State outside the event protocol.

The result is `phaseBase(C)`. No phase-base hash is persisted. A canonical
title or trailer accelerates lookup and improves diagnostics, but is never
sufficient without structural validation.

Repeated phases are separate intervals keyed by marker commit, not coalesced
by phase name. For example:

```text
P(planning) -- p -- I1(implementing) -- i -- F1(finalizing)
                                           \
                                            -- f -- I2(implementing) -- C
```

The intervals are `P..parent(I1)`, `I1..parent(F1)`,
`F1..parent(I2)`, and current `I2..C`. `I2`, not `I1`, is the current
implementing base.

Tags are not used. They would add a mutable global ref namespace, separate
fetch and permission behavior, and a second publication transaction without
adding evidence that the immutable source commit does not already provide.

## Source first-parent contract

Phase derivation requires a stable task first-parent lineage:

- source refs are never force-pushed or rebased after publication;
- task commits and Repoledger State transactions extend the source tip;
- when primary must be synchronized into source, the current source tip is the
  merge commit's first parent and refreshed primary is its second parent;
- phase transitions are never merge commits;
- primary integration must preserve source-tip ancestry; squash integration
  does not satisfy delivery or phase-history validation.

This contract lets the checker treat a merge commit as one task-lineage commit
and inspect its diff against its first parent. It does not enumerate the merged
second-parent commits as though the task authored them individually.

For example, if `M` synchronizes primary while implementing, source history is:

```text
I -- task commits -- M -- more task commits
                    \
                     primary tip   # second parent
```

`M` remains one node on the source first-parent chain. Its changed paths are
the tree difference from its task-source first parent. A merge whose first
parent is not the previous source tip violates the source-lineage contract.

Planning and finalizing normally do not merge primary because imported project
paths would violate their task-folder-only range. Implementing may synchronize
primary when necessary.

## Cumulative phase changes

For phase base `B` and candidate `C`, the checker derives two complementary
views.

### Path union

Walk first-parent commits after `B` through `C`. For every commit, collect the
paths changed against its first parent. For a merge, compare the merge tree to
its first parent. Union those paths with candidate overlay paths.

This catches a forbidden path even when a later commit reverts it.

### Net tree delta

Compare the tree at `B` with the candidate tree. This determines the resulting
content delta and supports freshness checks for recorded evidence.

Checks must not substitute one view for the other:

- path permissions use the cumulative path union;
- resulting contract and evidence consistency use the net tree delta;
- hash freshness uses ancestry plus path-scoped tree comparison.

## Candidate forms

The same range validator accepts these candidate forms:

### Committed candidate

For `check --commit C`, `C` is the candidate commit. The checker derives the
phase base and all closed phase intervals from its reachable source history.

### Remote candidate

For `check --remote`, the fetched advertised source tip is `C`. Stale local
tracking refs are never substituted for a failed fetch.

### Staged candidate

For `check --staged`, history through `HEAD` is committed history and the
index tree is a synthetic candidate overlay. The checker combines:

- first-parent changed paths in `B..HEAD`;
- staged paths in `HEAD..index`;
- net tree delta from `B` to the index tree.

An unstaged worktree does not alter the staged candidate. A path with staged
and unstaged edits uses only the index blob for this candidate. Renames are
normalized to deleted and added paths for path-union checks while tree content
comes from the index result.

### Local worktree candidate

When a local command explicitly checks working changes, candidate content is
constructed in this order:

1. committed `HEAD` tree;
2. index overlay, including staged additions and deletions;
3. tracked worktree overlay, which wins over index content for the same path;
4. nonignored untracked files as additions.

Ignored untracked files are excluded; tracked ignored files remain tracked.
Submodules contribute their gitlink path and object ID, not the nested
worktree's files. Symlinks use Git's symlink blob semantics. Path union keeps
every normalized add/delete path observed in committed history and overlays,
even when the final net tree no longer contains it.

## Closed phase validation

Required CI cannot trust that a local transition command ran its closing
check. It reconstructs the complete phase history.

For first-parent-ordered transition markers `T1 ... Tn`:

- phase `i` begins at `Ti`;
- a closed phase ends at the parent of `T(i+1)`;
- the current open phase ends at candidate `C`;
- intervals are keyed by marker identity and may repeat the same phase name;
- a first-parent sync merge is an ordinary node inside its containing interval;
- every transition commit is validated separately;
- every closed interval and the current interval are revalidated from Git.

No phase-transition commit belongs to either adjacent phase interval. The
previous interval stops at its parent, and the next interval starts after the
transition commit. Evidence-only State commits are ordinary commits inside the
current interval because they do not change phase.

Thus bypassing a hook or manually imitating a transition cannot hide an
earlier invalid phase range.

## Phase range rules

### Planning

For `planningBase..candidate`:

- cumulative changed paths must stay under `tasks/<task>/`;
- `tasks/status.yaml` and all project paths are forbidden;
- the current Task contract, planning guidance digest, required reviews, and
  approval bindings must be structurally consistent;
- entering implementing requires every applicable planning review to be
  approved against the current contract and guidance digests.

### Implementing

For `implementingBase..candidate`:

- project paths and the current task folder may change;
- changes to other task folders and `tasks/status.yaml` are forbidden;
- intermediate commits may be code-only or task-only;
- readiness checks evaluate the complete cumulative range, not the latest
  commit;
- before a source checkpoint, `whatsnext` requery, or finalizing transition,
  the range must include an external project delta and the required current
  Progress/State evidence;
- a Progress-only latest commit is valid when the cumulative implementing
  range contains the corresponding project delta;
- validations refer to an existing ancestor subject. They remain fresh only
  when no relevant project path differs between that subject and candidate.

There is no requirement that one individual commit contain both implementation
and Progress changes.

### Finalizing

For `finalizingBase..candidate`:

- cumulative changed paths must stay under `tasks/<task>/`;
- `tasks/status.yaml` and all project paths are forbidden;
- finalization instructions are frozen when entering the phase;
- `phase-entered: finalizing` stores the compiled bundle digest, ordered stable
  step IDs, and concrete executable instruction for each step in State;
- later project configuration is never re-read to add, remove, or rewrite a
  step for that generation;
- `targetCommit`, bundle digest, step order, step IDs, instructions, and each
  instruction source digest are immutable throughout one finalizing interval;
- step transactions may change only the selected step's status, non-secret
  external ID, evidence reference, attempt metadata, and timestamps according
  to the legal step-state graph;
- every receipt binds the frozen step ID, bundle digest, and `targetCommit`;
  a mismatch is corrupt/stale State and blocks further external side effects;
- a changed project configuration does not stale a frozen finalization plan;
  a changed desired target requires returning to implementing, and a changed
  contract requires returning to planning;
- deployment, smoke-test, manual-acceptance, and other external results are
  recorded through State transactions using non-secret stable IDs;
- a required project change forces a tool-owned transition to implementing;
- a goal or contract change forces a tool-owned transition to planning.

## Check profiles

The range engine supports increasingly strong profiles:

- `structural`: State schema, transition commits, ancestry, binding, and phase
  path permissions;
- `checkpoint`: structural rules plus cumulative implementing Progress and
  evidence requirements before source publication or `whatsnext` requery;
- `close-phase`: checkpoint rules plus all conditions required to enter the
  requested next phase;
- `delivery`: all closed phases, finalization receipts, source containment in
  primary, and exact human-approved primary target.

Hooks may run a cheaper profile for feedback. Repoledger publication and
transition commands always run the required stronger profile themselves.

## Hash safety

`State.yaml` may persist a full commit hash only when all of these hold:

1. the referenced commit existed before the State transaction began;
2. it is the transaction parent or an ancestor of that parent;
3. its semantic role is explicit, such as `subjectCommit`,
   `artifactCommit`, or `targetCommit`;
4. freshness can be recomputed from Git and the current state.

The following hashes are never persisted:

- the current State transaction commit;
- a phase base or phase-transition commit merely for navigation;
- a future integration or completion commit;
- the current source or primary tip merely as a cache;
- a synthetic staged or worktree candidate identity.

Examples:

- A validation State commit may refer to the already committed code parent it
  validated.
- A finalizing transition may refer to a primary commit only after source has
  synchronized that commit into its ancestry.
- A completion commit may record its already approved primary parent, never
  itself.

## Primary integration and finalizing

To enter finalizing:

1. Validate the implementing range at the advertised source tip.
2. Integrate that source tip into primary without squash and fetch commit `M`,
  which must equal current remote primary and contain the source tip.
3. Synchronize `M` back into source with the old source tip as first parent and
  `M` as second parent.
4. Run required validation against exact target `M`.
5. Record validation against the now-historical target commit.
6. Freeze concrete finalization instructions in State.
7. Create the isolated `phase-entered: finalizing` commit.

If primary changes before the finalizing transition publishes, expected-tip
CAS fails and the integration/validation sequence restarts against the new
primary. Once published, `M` is immutable `targetCommit` for that finalizing
interval. The finalizing transition commit becomes the new phase base. Primary
still reports `ongoing`.

Before completion, finalization task commits are integrated into primary while
preserving source ancestry. The human approves the exact resulting primary
commit. Repoledger then creates an independent primary lifecycle commit that:

- changes `tasks/status.yaml` from `ongoing` to `completed`;
- removes the source locator;
- records terminal closure in the primary copy of `State.yaml`;
- refers only to the approved parent commit;
- contains no implementation or unrelated task changes.

Abandonment uses the same independent primary-transaction rule and preserves
the source branch for audit and recovery. If the source contains unintegrated
work, the primary closure records the decision, generation, primary parent,
and source identity but never persists a nonancestor source-tip hash. Detailed
abandoned phase evidence remains on the retained source branch.

After either terminal transition, the primary lifecycle commit owns the
terminal State envelope. The former source State remains immutable audit
history and is no longer consulted by default guidance.

CI validating a terminal lifecycle commit reads its first-parent task record,
which is still `ongoing`, to recover the generation and advertised source
identity. It verifies the fetched source tip is contained in the approved
parent and validates that source first-parent phase history before accepting
the terminal status commit. The source branch remains retained after terminal
transition, so later remote audit does not depend on a deleted ref.

## Reactivation

Explicit reactivation is a primary lifecycle transaction:

1. Require an explicit human decision bound to the terminal task and current
   generation.
2. Increment `generation` in the primary task record.
3. Change terminal status to `backlog` and keep source fields absent.
4. Reset the current-generation State envelope while retaining old evidence in
   Git history.
5. Publish an independent primary commit.

A later start creates a new generation-specific source identity and planning
base. Old source branches are not deleted or reused.

## Lifecycle and generation transition table

| Event | Primary before | Primary after | Generation | Source identity | State authority |
| --- | --- | --- | --- | --- | --- |
| `register` | absent | backlog | initialize 1 | absent | primary reset envelope or absent legacy State |
| `start` | backlog | ongoing | unchanged | create `task/<name>/g<generation>` or explicit equivalent | source planning commit |
| `complete` | ongoing | completed | unchanged | remove from status | primary terminal envelope |
| `abandon` | backlog/ongoing | abandoned | unchanged | remove from status when present | primary terminal envelope; retained source is audit |
| `reactivate` | completed/abandoned | backlog | increment exactly once | absent | primary reset envelope |

`start` rejects reuse of any prior generation's source identity. Reactivation
does not create a source branch; the later start transaction does.

## Worktree binding

No worktree-local task marker exists. Observer derives binding by comparing:

```text
canonicalPushTarget(currentBranch)
    == effectiveSourceTarget(primaryTaskRecord)
```

Remote aliases are resolved to canonical credential-free repository URLs and
short branch names. Detached HEAD, missing push destination, unknown URL
identity, or multiple matching active records is ambiguous and blocks task
writes. A matching target with diverged history remains bound but requires
normal non-force integration.

One worktree may mutate at most one active task. Other tasks remain available
for read-only list, status, and check operations.

## Guidance pipeline

The command separates four concerns:

```text
route(invocation, ledgerIndex)
observe(selectedTask, repository, worktree, configuration)
render(snapshot)
advance(before, expectedDelta, executionOutcome, after)
```

- `route`, `render`, and `advance` are pure functions.
- `observe` performs I/O and normalizes all Git and file facts.
- `render` receives phase base, cumulative path union, net delta, evidence
  freshness, ref ancestry, worktree binding, and phase guidance as explicit
  snapshot facts.
- human replies, external-system results, and semantic discoveries are
  execution outcomes, not hidden snapshot predicates.
- `advance` re-runs guidance only after the declared input delta occurs; yield,
  actionable error, and no-progress outcomes stop the current turn.

## Prompt extensions

Project configuration may add phase-specific prompt files for planning,
implementing, and finalizing. Repoledger validates paths and compiles only the
current phase bundle.

- Core lifecycle, path, security, approval, and publication rules cannot be
  overridden.
- Planning approval binds both the Task contract digest and compiled planning
  bundle digest.
- A changed planning bundle makes that approval stale.
- Concrete finalization step IDs and instructions are frozen into State when
  entering finalizing; later configuration changes do not mutate an active or
  terminal generation.

## Enforcement layers

1. `whatsnext` emits the legal next macro-step and expected delta.
2. Optional Git hooks call the shared range validator for early feedback.
3. Repoledger State, phase, source-publication, and lifecycle commands call the
   validator before writing or pushing.
4. Required CI reconstructs all phase intervals and rejects invalid history.
5. Branch protection prevents failed candidates from entering primary.

No local hook or prompt is treated as the trust boundary.

## Legacy migration

Existing version 2 ongoing records have a source branch but no canonical
`State.yaml` phase marker. Repoledger must not infer a phase from Task or
Progress prose.

For reads, a record without `generation` has effective generation 1. An
ongoing legacy task is migration-required when its fetched source first-parent
history has no valid generation-1 phase marker. Migration requires an explicit
human-selected phase; Repoledger never chooses from prose or changed paths.

The migration transaction first publishes generation 1 to the still-ongoing
primary record when absent, then creates one isolated State transition commit
on the existing source branch using expected-tip CAS. Same-repository updates
use atomic multi-ref publication when the topology permits it; cross-repository
failure uses explicit roll-forward recovery. The State commit becomes the
selected phase base. Backlog and terminal records persist generation lazily
during their next lifecycle mutation or through explicit repository migration.

| Legacy observable shape | Deterministic action |
| --- | --- |
| backlog/completed/abandoned without generation | Read as effective generation 1; persist 1 on the next lifecycle mutation or explicit migration. |
| ongoing without generation and without State | Require explicit human choice of planning, implementing, or finalizing; publish generation 1 and one initial marker. |
| ongoing without generation with one valid generation-1 marker chain | Validate the chain, persist generation 1 in primary, and retain its current phase without creating a second marker. |
| ongoing with malformed, multiple-lineage, or generation-conflicting State history | Return migration-conflict; do not write either ref until the history is explicitly repaired. |
| ongoing whose chosen finalizing phase lacks an ancestor integrated target and frozen steps | Reject finalizing migration; choose planning/implementing or first create valid historical evidence. |

The explicit phase choice is a human decision bound to the task, source tip,
and primary tip. It is never inferred from changed paths, filenames, Task
checkboxes, Progress prose, or the presence of deployment tooling.

## Failure and recovery

- Every State and primary lifecycle mutation uses expected-tip compare-and-set.
- A source push that succeeds before a primary start push uses the existing
  recoverable partial-publication protocol.
- An invalid or missing phase marker blocks writes; Repoledger never silently
  creates a replacement base in the middle of history.
- Ambiguous first-parent history, direct State edits, nonancestor hash
  references, and squash integration are hard errors.
- Recovery always adds valid history or republishes an existing valid tip;
  it never force-pushes or rewrites shared commits.

## Required test matrix

- canonical State parsing and serialization;
- tool-owned State event shapes and stale-tip CAS;
- start transaction with primary status commit and source planning commit;
- repeated phase transitions and nearest-base derivation;
- evidence-only State commits ignored as phase markers;
- path-union detection when a forbidden change is later reverted;
- net-delta and evidence-freshness checks;
- staged synthetic candidate, commit candidate, and fetched remote candidate;
- first-parent merge handling and ambiguous history rejection;
- planning/finalizing task-folder-only enforcement;
- implementing cumulative Progress/evidence requirements without same-commit
  pairing;
- closed-phase reconstruction in CI;
- persisted-hash ancestor validation and self-reference rejection;
- non-squash primary integration and source containment;
- finalization freeze, external wait, manual acceptance, and completion;
- abandonment and generation-based reactivation;
- legacy ongoing migration without heuristic phase inference;
- worktree binding from canonical push target without local metadata;
- deterministic guidance output and no-progress loop termination.