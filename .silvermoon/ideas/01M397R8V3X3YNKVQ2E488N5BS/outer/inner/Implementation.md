# Implementation

## Steps

### I-S01: 编写完整的简体中文入口

新增根目录 `README.zh-CN.md`，以当前英文 README、CLI help、package metadata 和
schema 为事实来源，按中文读者的使用路径覆盖产品定位、安装、配置、idea 存储与三个
世界、导航、创建、验证、迁移和开发。命令、路径、字段名及 canonical English world
names 保持原样，内部链接相对中文文件正确解析。

### I-S02: 建立对称语言导航

在英文 README 顶部图片之后添加简洁的 `English | 简体中文` 导航，并在中文 README
相同位置提供 `English | 简体中文` 导航。除语言入口外不改写英文内容。

### I-S03: 将中文 README 纳入发布契约

把 `README.zh-CN.md` 加入 npm package files，更新 package contents 精确清单，并让
installed-package smoke test 读取中文 README，确保发布产物中的中文入口真实可用。

## Acceptance criteria

### I-AC01: 中文文档完整且事实准确

`README.zh-CN.md` 独立说明英文 README 的全部公开用户主题，命令和配置示例与实际 CLI
及 schema 一致。通过人工逐节对照 `README.md`、四个 CLI help 输出、`package.json`
和 schema 链接，并运行仓库 Markdown 链接测试证明。

### I-AC02: 双向语言入口可发现

英文和中文 README 顶部均显示对称语言入口，且链接指向彼此。通过 Markdown 链接测试和
直接检查两个文档证明。

### I-AC03: 中文 README 随 npm 包发布

`npm pack --dry-run` 的精确文件清单包含 `README.zh-CN.md`，安装 tarball 后可读取该
文件且内容具有中文文档标题。通过 `pnpm pack:check` 和 `pnpm smoke:pack` 证明。

### I-AC04: 仓库质量门保持通过

改动不放宽既有断言并通过 `pnpm check`、`pnpm check:skills`、`git diff --check` 和
`silvermoon check --worktree`，以各命令零退出码证明。
