# Core Concepts

Silvermoon belongs to the project. It gives humans and Agents one
repository-owned account of intent, implementation, and real-world truth.

## The Problems It Solves

### Less continuous supervision

People should not have to shepherd every mechanical step. They define and
approve the desired outcome, accept the implementation, and accept the
real-world result. Between those decisions, an Agent can continue from
repository facts and stop only when human judgment or an external result is
required.

### Task state that agrees with code

A task card can say "done" while the code has moved on. Silvermoon instead
derives lifecycle state from current world revisions and explicit decisions.
When a depended-on world changes, stale acceptance no longer matches.

### Continuity beyond one conversation

The durable context lives with the project in Git, not inside a chat transcript
or one machine. Another device, Agent, session, or hosting platform can observe
the same primary history and continue from the same facts.

## Three Nested Worlds

**Ideal World (道心)** is the canonical intent in `Idea.md`. It defines the
outcome, scope, and constraints without prescribing implementation.

**Inner World (内景)** is the canonical implementation contract in
`Implementation.md` plus the repository deliverables that give the ideal form.

**Outer World (现世)** is the canonical deployment contract in `Deployment.md`
plus evidence that the implementation is true where it must operate.

> 道心立意，内景成形，现世验真。

The directory structure makes the relationship concrete: the Inner World
contains the Ideal World, and the Outer World contains both. Each world is an
opaque Git tree. Its revision therefore includes every nested world. Changing
the ideal changes all three revisions; changing implementation changes the
inner and outer revisions; changing only deployment changes the outer
revision.

This cascading invalidation is the point. A conclusion remains accepted only
while it refers to the exact artifacts that were reviewed.

## Decisions And Continuation

Humans own four decisions: approval of the ideal, acceptance of the
implementation, acceptance of the deployment, and abandonment. Silvermoon has
no mutation command for these decisions and never infers them from prose,
checklists, Git activity, or silence.

Agents own continuation. The project skill combines `whats-next`, the world
contracts, the idea ledger, and Git facts to choose one safe action. The ledger
is operational memory: it mirrors stable contract IDs and records completed
work, but a checked item is not approval or acceptance.

## One Project, Shared Facts

`whats-next` observes the configured remote primary and returns the exact
`observedPrimaryCommit` used for its guidance. Writers use that commit as the
expected shared tip. If primary moves, they fetch and reobserve rather than
replaying a stale decision. This is coordination through ordinary Git, not a
distributed lock.
