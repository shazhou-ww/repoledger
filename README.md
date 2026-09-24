<!-- markdownlint-disable-file MD041 -->

<p align="center">
  <!-- markdownlint-disable-next-line MD013 -->
  <img src="https://raw.githubusercontent.com/shazhou-ww/silvermoon/main/assets/silvermoon.svg" width="960" alt="Silvermoon, the artifact spirit of the project">
</p>

<p align="center">
  <!-- markdownlint-disable-next-line MD013 -->
  <a href="https://npmx.dev/package/silvermoon"><img src="https://img.shields.io/npm/v/silvermoon?style=flat-square" alt="npm version"></a>
  <!-- markdownlint-disable-next-line MD013 -->
  <a href="https://npmx.dev/package/silvermoon"><img src="https://img.shields.io/node/v/silvermoon?style=flat-square" alt="Node.js version"></a>
  <!-- markdownlint-disable-next-line MD013 -->
  <a href="https://npmx.dev/package/silvermoon"><img src="https://img.shields.io/npm/unpacked-size/silvermoon?style=flat-square" alt="npm unpacked size"></a>
  <!-- markdownlint-disable-next-line MD013 -->
  <a href="https://github.com/shazhou-ww/silvermoon/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/shazhou-ww/silvermoon/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status"></a>
</p>

<p align="center">
  English | <a href="./README.zh-CN.md">简体中文</a>
</p>

# Silvermoon

**The artifact spirit of the project.**

## Quick Start

Silvermoon needs Node.js 22 or newer and Git access to the repository's primary
branch.

```sh
npm install --save-dev silvermoon
npx skills add ./node_modules/silvermoon/skills --skill silvermoon --agent github-copilot --yes --copy
```

Create `.silvermoon/config.yaml`:

```yaml
version: 1
primaryRepository: https://github.com/example/repository.git
primaryBranch: main
preferredLanguage: en
```

`preferredLanguage` is optional. A specific idea can override it with
`language` in `status.yaml`, and `create-idea --language <tag>` can set that
override when the idea is created. Otherwise Silvermoon checks
`~/.config/silvermoon/config.yaml` and finally defaults to `en-US`.

Then create an idea and let the registered Silvermoon skill guide one safe
next action at a time:

```sh
npx silvermoon create-idea --json
npx silvermoon whats-next <idea> --json
```

Describe the desired world in the generated `Idea.md`, review it, and approve
that exact revision. From then on, Silvermoon keeps the goal, implementation,
repository state, and real-world result connected. See
[Getting Started](./docs/getting-started.md) for the complete first workflow.

## Why Silvermoon

Long-running Agent work usually asks people to carry too much invisible state.
Someone must remember what was intended, whether the code still matches the
task, and which conversation or machine knows the latest truth. Silvermoon
makes those concerns part of the project instead.

It lets people step back from continuous supervision and return at the
decisions that belong to them: approving the intended outcome, accepting the
implementation, and accepting that the result is true in the outside world.
Between those boundaries, an Agent can inspect repository facts and continue
the highest-priority safe action.

It also refuses to let a detached task card declare success. Current artifacts
and explicit decisions jointly determine state, so a changed goal or
implementation naturally invalidates conclusions that depended on the older
revision. Because those facts live in Git, work can continue across devices,
sessions, Agents, and hosting platforms.

## The Project's Artifact Spirit

> Fellow Daoist, you wouldn't want your lifebound project to be without an
> artifact spirit, would you?

<table>
  <tr>
    <td width="160" align="center" valign="top">
      <!-- markdownlint-disable-next-line MD013 -->
      <img src="https://raw.githubusercontent.com/shazhou-ww/silvermoon/main/docs/assets/silvermoon-avatar.svg" width="128" alt="Line portrait of Silvermoon, the project's artifact spirit">
    </td>
    <td valign="top">
      Silvermoon is named after a character in <em>A Record of a Mortal's
      Journey to Immortality</em>. She comes from the Silvermoon Wolf Clan in
      the Spirit Realm and is one of the split souls of Ling Long. After losing
      part of her memory in the human realm, she lives as an artifact spirit
      first in a wolf-headed jade scepter and later in Han Li's Bamboo
      Cloudswarm Swords.
      <br><br>
      That image fits this project: Silvermoon does not belong to one operator
      or one chat. It lives with the project's artifacts, understands their
      state, and helps each companion find what comes next. The biography is
      inspiration, not a prerequisite for using the tool.
    </td>
  </tr>
</table>

Watch *A Record of a Mortal's Journey to Immortality*:

<!-- markdownlint-disable-next-line MD013 -->
- YouTube: [Episode 150: Overseas Turmoil 26](https://www.youtube.com/watch?v=GJgezoCBIHM "A Record of a Mortal's Journey to Immortality — Episode 150: Overseas Turmoil 26")
<!-- markdownlint-disable-next-line MD013 -->
- Bilibili: [Episode 150: Overseas Turmoil 26](https://www.bilibili.com/bangumi/play/ep1231558 "A Record of a Mortal's Journey to Immortality — Episode 150: Overseas Turmoil 26")

## From Ideal To Real

A project is more than a task list or a transcript. It is an ideal becoming
real through three nested worlds.

**Ideal World (道心)** names the outcome worth pursuing. **Inner World (内景)**
gives that intent shape in repository artifacts. **Outer World (现世)** asks
whether the shaped work is true where it must actually operate.

> 道心立意，内景成形，现世验真。

The worlds nest from the inside out. Implementation contains the ideal it
serves, and deployment contains both. This is an engineering relationship, not
just a metaphor: when an inner world changes, conclusions from an outer world
no longer have the same foundation and must be proven again.

Humans own approval and acceptance. Agents own continuation: they read the
contracts, the ledger, and Git facts; preserve concurrent work; execute one
safe action; and reobserve only after something changes. The context belongs to
the project, not to a fleeting conversation.

## Further Reading

- [Getting Started](./docs/getting-started.md) — installation, configuration,
  and the first idea.
- [Core Concepts](./docs/core-concepts.md) — project ownership, the three
  worlds, revisions, and decision boundaries.
- [Operating Silvermoon](./docs/operations.md) — navigation, creation,
  publication, hygiene, and continuation.
- [Technical Reference](./docs/reference.md) — storage, derived state, CLI
  reports, validation targets, and schemas.
- [Maintaining Silvermoon](./docs/maintaining.md) — development checks,
  documentation ownership, and release guidance.
