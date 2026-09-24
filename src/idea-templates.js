export const IDEA_TEMPLATE = `# Idea

## Intent

<!-- State the desired outcome in one or two sentences. -->

## Context

<!-- Describe the current problem, situation, or opportunity. -->

## Desired outcome

<!-- Describe the externally meaningful state that should become true. -->

## Scope

### In scope

<!-- Describe what this idea includes. -->

### Out of scope

<!-- Describe adjacent work this idea intentionally excludes. -->

## Constraints

<!-- Record material product, repository, compatibility, or operational constraints. -->

## Open questions

<!-- Record unresolved decisions. Remove this section when none remain. -->
`;

export const IMPLEMENTATION_TEMPLATE = `# Implementation

## Steps

<!--
Give every step a stable I-Sxx identifier and a level-three heading.
Describe what will change, its boundaries, and important design details.
Do not use task-list checkboxes in this document.
-->

### I-S01: Step title

<!-- Describe this implementation step. -->

## Acceptance criteria

<!--
Give every criterion a stable I-ACxx identifier and a level-three heading.
Describe both the observable outcome and the method that proves it.
Do not create a separate validation section or use task-list checkboxes.
-->

### I-AC01: Criterion title

<!-- Describe the required outcome and how an Agent can prove it. -->
`;

export const DEPLOYMENT_TEMPLATE = `# Deployment

## Steps

<!--
Give every step a stable D-Sxx identifier and a level-three heading.
Describe deployment or external-world verification work.
Do not use task-list checkboxes in this document.
-->

### D-S01: Step title

<!-- Describe this deployment or external-verification step. -->

## Acceptance criteria

<!--
Give every criterion a stable D-ACxx identifier and a level-three heading.
Describe both the observable external outcome and the method that proves it.
Do not create a separate validation section or use task-list checkboxes.
-->

### D-AC01: Criterion title

<!-- Describe the required external outcome and how an Agent can prove it. -->
`;

export const LEDGER_TEMPLATE = `# Ledger

## Implementation

### Steps

- [ ] **I-S01:** Step title

### Acceptance criteria

- [ ] **I-AC01:** Criterion title

## Deployment

### Steps

- [ ] **D-S01:** Step title

### Acceptance criteria

- [ ] **D-AC01:** Criterion title
`;
