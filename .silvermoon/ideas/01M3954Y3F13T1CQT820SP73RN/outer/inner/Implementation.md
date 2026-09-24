# 拆分并验证 Silvermoon v1 JSON Schema

Created: 2026-09-24
Language: zh-CN

## Implementation plan

1. 将 `schema/v1.json` 中的共享定义、repository config 根 schema 和 idea status
   `$defs` 拆分到 `schema/v1/` 下三个以 `.schema.json` 结尾的文件。
2. 让两个文档入口通过相对 `$ref` 引用 `definitions.schema.json`，并为每个文件设置与
   published raw URL 一致的绝对 `$id`。
3. 使用 Draft 2020-12 validator 编译两个公开入口，覆盖 config 和 idea status 的有效与
   无效 fixture，同时保留 schema pattern 与 runtime helper 的一致性检查。
4. 更新 README、npm package contents check 和 installed-package smoke，使发布产物只包含
   新 schema 路径并能从安装目录读取全部 schema。
5. 删除旧 `schema/v1.json`，搜索并消除实现、测试和当前文档中的旧路径引用；Ideal World
   中解释 cutover 的历史文字保留。
6. 运行 targeted schema tests、`pnpm check`、`git diff --check` 和 Silvermoon
   worktree/staged checks，确认 candidate 可发布。

## Schema layout

```text
schema/v1/
├── config.schema.json
├── definitions.schema.json
└── idea-status.schema.json
```

- `definitions.schema.json` 仅提供 `$defs.branch`、`$defs.repository`、
  `$defs.ulid` 和 `$defs.objectId`。
- `config.schema.json` 保持当前 version、primary repository 和 primary branch
  contract，不接受额外字段。
- `idea-status.schema.json` 保持当前 identity、alias、abandonment 和三个 decision
  revision contract，不接受额外字段。
- 两个入口都直接编译为对应 YAML 文档的根 validator；调用方不再引用另一个入口的内部
  fragment。

## Validation strategy

测试使用 JSON Schema Draft 2020-12 validator 加载三个本地文件。definitions schema
先按其 `$id` 注册，两个入口的相对 `$ref` 必须在不改写 schema 的情况下成功解析。测试至少
覆盖：

- canonical config 和 canonical idea status；
- 缺少 required field；
- unsupported version；
- unknown property；
- invalid repository、branch、ULID、alias 和 object ID；
- 40 与 64 位 lowercase object ID；
- schema patterns 与 `validRepository`、`isValidUlid` runtime helper 的代表性一致性；
- npm dry-run package file list 和安装后 schema 文件存在性。

Canonical YAML 的属性顺序、换行、comments、anchors、固定路径和 Git history binding 继续由
现有 runtime tests 负责，不重复伪装成 JSON Schema 能力。

## Implementation acceptance criteria

- `schema/v1/config.schema.json` 是 `.silvermoon/config.yaml` 的独立 Draft 2020-12
  根 schema，并保持现有 config 字段和值域。
- `schema/v1/idea-status.schema.json` 是 idea `status.yaml` 的独立 Draft 2020-12
  根 schema，并保持现有 status 字段和值域。
- 所有 JSON Schema 文件均以 `.schema.json` 结尾，共享约束只定义在
  `schema/v1/definitions.schema.json`。
- 两个入口使用相对 `$ref`，能由 Draft 2020-12 validator 从本地文件和 published `$id`
  关系成功解析。
- 正反例测试覆盖两个公开入口，并验证 repository、ULID 和 object ID 核心约束与 runtime
  helper 一致。
- README 分别链接 config 和 idea status schema，并明确 runtime-only validation 边界。
- npm package contents check 和 installed-package smoke 覆盖全部三个新 schema 文件，
  发布产物不包含 `schema/v1.json`。
- 除解释 breaking cutover 的 Ideal World 历史文字外，repository implementation、测试、
  scripts 和当前用户文档不再引用 `schema/v1.json`。
- 不新增或读取 user-level/global configuration，不改变任何 YAML 字段、版本、canonical
  serialization 或 repository metadata path。
- `pnpm check`、`git diff --check`、`silvermoon check --worktree` 和
  `silvermoon check --staged` 全部通过。