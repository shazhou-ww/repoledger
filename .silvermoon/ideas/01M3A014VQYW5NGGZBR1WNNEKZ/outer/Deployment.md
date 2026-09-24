# 部署

## 步骤

### D-S01: 通过受保护工作流发布并验证 npm 注册表状态

在 `origin/main` 的精确候选提交上创建不可变标签 `npm/silvermoon/v<version>`
并推送，由 `.github/workflows/publish-npm.yml` 通过 GitHub OIDC 可信发布完成
`npm publish`。发布后核验：workflow 全部步骤成功、npm 注册表将新版本作为
`latest` dist-tag 提供、tarball 文件集合符合白名单、生成的 README 非空且
全部仓库引用钉死到发布提交、全新安装后 `silvermoon --version` 与
`silvermoon --help` 正常，并保留来源证明。

### D-S02: 处置 0.0.2 发布事故并以 0.0.3 完成发布

首次发布 `npm/silvermoon/v0.0.2` 时，workflow 的 README 生成步骤使用 shell
重定向 `> README.md`，在生成器读取之前将源文件截断为空，导致已发布的
0.0.2 tarball 中 README 为 0 字节（CLI 功能不受影响）。npm 版本不可变，
无法撤回修复，因此：在 `main` 上修复生成器（`--out` 原子写入、空内容
fail-closed、`pack:check` 拒绝空 README、契约测试钉死 `--out` 形状），将版本
升级为 0.0.3，重新走完整验证后创建标签 `npm/silvermoon/v0.0.3` 发布。
0.0.2 保留在注册表中作为事故记录，不再作为推荐版本。

## 验收标准

### D-AC01: npm 注册表提供 README 正确的最新稳定版本

`npm view silvermoon dist-tags` 显示 `latest` 指向 0.0.3；从注册表拉取的
`silvermoon-0.0.3.tgz` 中 `README.md` 非空（约 7.4kB），其中所有
raw.githubusercontent.com 图片引用与 blob 文档链接均钉死到标签提交
`95f48bd2cd07fd43267f7b6a0c9471d2a8d0ca95`，不含指向 `main` 的可移动引用；
四枚 npm 徽章保留。通过 `npm pack` 拉取已发布 tarball 并直接检查文件内容
证明。

### D-AC02: 发布经过可信工作流且安装行为正确

`npm/silvermoon/v0.0.3` 的发布 workflow run 全部步骤成功（含 Generate
immutable npm README、pack:check、installed-package E2E、provenance 签名），
注册表元数据带有来源证明；在全新目录 `npm install silvermoon@0.0.3` 后，
`silvermoon --version` 输出 `0.0.3`，`silvermoon --help` 正常展示命令。
通过 workflow run 日志、注册表元数据和全新安装冒烟证明。
