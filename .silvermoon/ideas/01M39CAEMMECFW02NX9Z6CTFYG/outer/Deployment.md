# Verify preferred language from an installed package artifact

Registry publication is intentionally deferred. This deployment proves the
accepted implementation in an isolated consumer environment built from the
current primary commit; it does not create or move an npm tag, publish an npm
version, or record registry availability.

## Steps

### D-S01: Build and inspect the package artifact

Create an npm tarball from the accepted primary commit in session-owned
temporary storage. Confirm its package identity and inspect the packed file
list for the preferred-language runtime modules, all version 1 schemas,
documentation, and the synchronized canonical skill.

### D-S02: Exercise installed-package language resolution

Install the tarball into a disposable consumer repository with an isolated
home directory. Drive the installed `silvermoon` binary against local bare Git
primary fixtures and verify default, user, project, and idea language sources,
including precedence and a changed inherited preference on a later
`whats-next` observation.

### D-S03: Exercise installed create-idea overrides

In disposable repositories, verify that an explicit noncanonical interactive
tag is normalized and persisted, omission leaves `language` absent, and an
invalid tag fails before any Git or filesystem mutation. Confirm `whats-next`
and `check` reject a language override option.

### D-S04: Confirm primary health and remove temporary state

Confirm the accepted implementation and status commits are reachable from
`origin/main`, and that repository CI for the deployed primary is successful.
Remove only the session-owned tarball, consumer repositories, bare remotes,
and isolated homes, then confirm the source worktree and real user
configuration were not changed.

## Acceptance criteria

### D-AC01: The packed consumer surface is complete

An `npm pack` result from current primary reports `silvermoon@0.0.1`, and its
file list contains `src/language.js`, `src/user-config.js`,
`schema/v1/user-config.schema.json`, the updated repository and idea schemas,
the user documentation, and the canonical Silvermoon skill. Installing that
tarball in a clean consumer must make the packaged CLI executable.

### D-AC02: Installed resolution is layered, explainable, and dynamic

Captured installed-CLI JSON must report `{ tag: "en-US", source: "default" }`
without configuration, then the expected `global`, `project`, and `idea`
sources under layered fixtures. A second observation after changing an
inherited preference must report the new value while the idea status bytes
remain unchanged.

### D-AC03: Installed creation preserves override boundaries

Installed-CLI evidence must show `create-idea --language zh-cn` writes
`language: zh-CN`, creation without the option omits the field, and an invalid
tag leaves Git and filesystem state unchanged. CLI usage checks must show that
only `create-idea` accepts `--language`.

### D-AC04: Verification is externally healthy and leaves no residue

Git evidence must show the accepted commits reachable from refreshed
`origin/main`, and GitHub Actions must report successful CI for the deployed
primary. After cleanup, all session-owned deployment paths are absent, the
source worktree is clean, and the real `~/.config/silvermoon/config.yaml` was
neither created nor modified.
