# 为 Silvermoon YAML 提供独立的 JSON Schema 入口

Created: 2026-09-24
Language: zh-CN

## Goal

将当前同时承载 repository config 和 idea status 定义的单一
`schema/v1.json` 拆分为按文档类型直接寻址的 JSON Schema，并统一采用
`.schema.json` 后缀：

```text
schema/
└── v1/
    ├── config.schema.json
    ├── idea-status.schema.json
    └── definitions.schema.json
```

`.silvermoon/config.yaml` 和
`.silvermoon/ideas/<IDEA_ID>/status.yaml` 必须分别拥有稳定、公开、可直接用于
编辑器和验证工具的 schema 入口。共享的 branch、repository、ULID 和 Git object ID
约束由 definitions schema 定义，避免两份入口 schema 漂移。

## Context

当前 `schema/v1.json` 的根 schema 验证 `.silvermoon/config.yaml`，而 idea status
只存在于 `$defs.ideaStatus`。运行时能够使用内部定义验证 `status.yaml`，但外部工具若直接
关联 `schema/v1.json`，得到的仍是 config contract；它们必须知道并引用内部 fragment
`#/$defs/ideaStatus` 才能验证 status。

这使公开 contract 存在几个问题：

- 文件名没有表达它是 JSON Schema；
- 一个 URL 的根类型只代表 config，却被文档笼统称为 Silvermoon schema；
- idea status 没有与 config 对等的一等入口和独立 `$id`；
- 编辑器、CI 和其他消费者必须了解内部 `$defs` 结构；
- 两类 YAML 后续独立演进时，兼容边界和错误信息不清晰。

Silvermoon 还需要明确区分 repository-owned shared configuration 与可能的
user-level local preferences。当前 `.silvermoon/config.yaml` 中的 primary repository
和 primary branch 是项目共享事实，必须随 Git 版本化，并能从 worktree、index、commit
和 remote snapshot 确定性读取。它们不能被执行者 HOME 中的文件隐式覆盖。

## Schema contract

### Public entrypoints

- `schema/v1/config.schema.json` 的根 schema 只验证
  `.silvermoon/config.yaml`。
- `schema/v1/idea-status.schema.json` 的根 schema 只验证
  `.silvermoon/ideas/<IDEA_ID>/status.yaml`。
- 两个入口都拥有与文件 URL 一致的稳定 `$id`，标题和描述明确指出对应 YAML 文档。
- 所有公开 JSON Schema 文件统一以 `.schema.json` 结尾；不保留含义模糊的
  `schema/v1.json` 作为第三个聚合入口。

### Shared definitions

- `schema/v1/definitions.schema.json` 保存 branch、repository、ULID、Git object ID
  等真正被多个文档复用的定义。
- 入口 schema 通过相对 `$ref` 引用共享定义，使 npm package、本地 checkout 和远程 URL
  三种使用方式都能解析。
- definitions schema 不是 config 或 status 的替代入口，不能让消费者通过任选根类型或
  `oneOf` 猜测文档种类。
- schema 继续使用 JSON Schema Draft 2020-12，并保持当前字段语义和严格的
  `additionalProperties: false`。

### Runtime and canonical YAML

JSON Schema 只表达结构和值域。Silvermoon runtime 继续负责 schema 无法完整表达的
canonical YAML、属性顺序、LF、无 aliases/anchors、固定 metadata path、status id 与目录
一致性、alias uniqueness、revision history 和 Git object binding。

拆分 schema 不得放宽现有 config 或 status validation，也不得让 schema validation
取代 runtime checks。测试必须证明入口 schema 与运行时接受和拒绝的核心字段约束保持一致。

## Configuration scope

Repository configuration 的唯一发现路径继续是：

```text
<repository>/.silvermoon/config.yaml
```

本 idea 不引入 `$HOME/.silvermoon/config.yaml`，不定义全局到 repository 的配置合并，
也不允许 user-level 文件覆盖 primary repository、primary branch 或任何 repository
validation 输入。

如果未来出现明确的本地偏好需求，可以由独立 idea 定义
`$HOME/.silvermoon/config.yaml` 或平台原生配置目录。该文件必须拥有独立 schema、明确的
允许字段和优先级，并且不能影响 `check --commit`、`check --staged`、`check --remote`
等需要 repository snapshot 可复现性的行为。它不应因为文件名同为 `config.yaml` 就与
repository config 共享根 schema。

## Scope

- 将现有 `schema/v1.json` 拆分为
  `schema/v1/config.schema.json`、
  `schema/v1/idea-status.schema.json` 和
  `schema/v1/definitions.schema.json`。
- 为三个 schema 设置稳定、准确的 `$id`、title、description 和引用关系。
- 更新 runtime schema loading 或测试辅助代码，使 config 与 idea status 使用各自入口。
- 更新 README、skill/reference 文档、package contents checks、installed-package smoke
  checks 和所有旧 schema 路径。
- 增加针对两个公开入口的正反例测试，并验证共享 definitions 的引用在打包产物中可解析。
- 确保 npm package 包含完整的 `schema/v1/` 目录，且不存在对已删除
  `schema/v1.json` 的引用。

## Out of scope

- 新增 global/user-level configuration。
- 改变 `.silvermoon/config.yaml` 或 `status.yaml` 的字段、语义、canonical order 或版本号。
- 改变固定 `.silvermoon/` metadata layout。
- 从 JSON Schema 推导 approval、acceptance、abandonment 或 lifecycle state。
- 为编辑器引入 vendor-specific workspace settings；公开 `$id` 和文档映射说明是跨工具契约。
- 保留旧 schema URL 的兼容 wrapper、迁移器或双读路径。Silvermoon 当前采用直接
  breaking cutover，所有 repository-owned 引用随实现同步更新。

## Desired outcome

完成后，用户看到任一 Silvermoon YAML 都能选择名称明确的 schema：

```text
.silvermoon/config.yaml
  -> schema/v1/config.schema.json

.silvermoon/ideas/<IDEA_ID>/status.yaml
  -> schema/v1/idea-status.schema.json
```

外部消费者不需要知道 Silvermoon 的内部 `$defs` 布局，也不会把 config schema 错用于
idea status。repository configuration 继续作为可版本化、可审计、可从任意候选 snapshot
重现的项目共享事实。
