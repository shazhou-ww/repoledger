# Implementation

## Steps

### I-S01: Establish the reader-first documentation architecture

Refactor both READMEs around the same reading path: brand and positioning,
Quick Start, the problems Silvermoon solves, its artifact-spirit identity, the
three nested worlds, and Further Reading. Move exact operational and protocol
details into a small English documentation set with one authoritative home for
getting started, concepts, operation, technical reference, and maintenance.

### I-S02: Move documentation artwork under docs

Move the existing hero and avatar SVGs from `assets/` to `docs/assets/` without
redesigning them. Update repository, README, package, and test references, and
place the avatar beside the Silvermoon biography with accurate alternative
text and a displayed width of 128 pixels.

### I-S03: Preserve the public documentation contract

Carry every existing behavioral guarantee, prerequisite, command, schema link,
adoption rule, validation mode, and maintainer workflow into its new
authoritative page. Keep the English and Chinese READMEs structurally aligned,
use the approved product positioning and biography details, present the avatar
and biography in a left-right table, and give the approved official-animation
links descriptive titles and link text.

### I-S04: Update package and verification surfaces

Ship both READMEs, the English documentation set, and both documentation SVGs
in the npm package. Update exact package-content checks, installed-package
smoke coverage, artwork contract tests, and Markdown-link expectations for the
new paths and reader-first content.

## Acceptance criteria

### I-AC01: Both READMEs provide the same reader-first journey

Immediately after the brand and one-line positioning, each README presents an
executable Quick Start before protocol detail. Their major sections, promises,
biography, three-world explanation, and Further Reading destinations
correspond; prove this by reviewing both rendered source structures and by
contract tests that assert the ordering and required links.

### I-AC02: Technical detail has one discoverable authoritative home

Installation and first use, core concepts, routine operation, storage and
revision semantics, CLI and validation behavior, adoption, development, and
release guidance remain discoverable without duplicating full specifications
across READMEs and docs. Prove this with a documentation inventory review and
the repository Markdown-link contract.

### I-AC03: Artifact-spirit identity and biography are accurate and bounded

English user-visible positioning says “the artifact spirit of the project”
and Chinese positioning says “项目的器灵”. Both biographies contain only the
approved Silvermoon Wolf Clan, Ling Long split-soul, wolf-headed jade scepter,
and Bamboo Cloudswarm Swords facts, show the unchanged 128-pixel avatar to the
left of the biography, and link to the approved YouTube and Bilibili pages with
descriptive titles. Prove this with targeted README contract assertions.

### I-AC04: Documentation assets work from source and the installed package

The hero and avatar exist only under `docs/assets/`, render through relative
README links, retain the artwork safety and contrast guarantees, and are
present with every linked docs page in the packed and installed package. Prove
this with contract tests, `npm pack --dry-run`, and installed-package E2E tests.

### I-AC05: Repository behavior remains unchanged and validation passes

No CLI, schema, repository model, lifecycle, or revision behavior changes.
Prove this by running `pnpm check`, `git diff --check`, Silvermoon worktree and
staged checks, and by confirming the diff is limited to documentation,
packaging metadata, tests, and the active idea artifacts.
