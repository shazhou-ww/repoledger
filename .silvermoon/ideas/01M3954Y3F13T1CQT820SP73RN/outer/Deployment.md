# 验证公开 JSON Schema 入口

Created: 2026-09-24
Language: zh-CN

## Deployment plan

本 idea 不创建 npm release，也不修改外部服务配置。部署是将 accepted implementation
保留在 authoritative `main`，并验证 repository 公开 raw URL 与下一次 npm package 所使用的
文件布局一致。

发布包含本 Deployment contract 的 Outer World 后：

1. 从 GitHub `main` 的公开 raw URL 读取三个 `.schema.json` 文件。
2. 确认每个响应是可解析 JSON，且 `$id` 与实际公开 URL 一致。
3. 确认 config 和 idea status 入口的相对 `$ref` 都指向同目录
   `definitions.schema.json`。
4. 确认旧 `schema/v1.json` 在当前 `main` 不再存在。
5. 重新运行 `silvermoon check --remote --json`，证明 authoritative primary history
   包含当前 world revisions 和 acceptance facts。

`pnpm check` 中的 package contents check 与 installed-package smoke 已验证下一次正常 npm
release 会携带三个新 schema 文件。npm publication 只能由单独、显式的 release intent 触发，
不属于本 deployment。

## Rollback

若任一公开 URL、`$id` 或 `$ref` 验证失败，不记录 deployment acceptance。通过普通后续提交
修正 Outer World 或 implementation；不得恢复含义模糊的聚合入口作为 success-shaped fallback，
不得 force-push 或改写已经发布的 primary history。

## Deployment acceptance criteria

- GitHub `main` 上的 `schema/v1/config.schema.json` 可公开读取、可解析，且 `$id` 与该 raw
  URL 一致。
- GitHub `main` 上的 `schema/v1/idea-status.schema.json` 可公开读取、可解析，且 `$id`
  与该 raw URL 一致。
- GitHub `main` 上的 `schema/v1/definitions.schema.json` 可公开读取、可解析，且 `$id`
  与该 raw URL 一致。
- 两个文档入口的所有外部 `$ref` 都相对引用同目录的 `definitions.schema.json`。
- GitHub `main` 不再提供当前路径 `schema/v1.json`。
- `pnpm check` 的 package contents check 和 installed-package smoke 已证明三个 schema 会进入
  npm package，且旧 schema 不会进入 package。
- `silvermoon check --remote --json` 通过并验证 authoritative primary 上的当前 idea history。
- 本 deployment 不触发 npm publish、release tag 或其他未经明确请求的外部发布。