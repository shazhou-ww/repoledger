# Deployment

## Steps

### D-S01: 验证 primary 上的文档入口

把包含本 deployment contract 的候选通过普通非强制 Git 发布到 authoritative
`main`，然后从 GitHub 按该精确 commit 读取英文和简体中文 README，确认两个公开文档及
其双向语言入口在远端真实可用。

### D-S02: 验证发布提交的仓库检查

等待该精确 primary commit 的 GitHub Actions `CI` workflow 完成，确认所有 required
jobs 成功；同时对 authoritative primary 运行 `silvermoon check --remote`，验证
deployment revision 及历史 acceptance facts。

## Acceptance criteria

### D-AC01: GitHub 提供完整的双语 README

authoritative `main` 的精确部署提交同时包含 `README.md` 和 `README.zh-CN.md`，英文
README 链接到简体中文版本，简体中文 README 链接回英文版本。通过 GitHub API 按部署
commit 读取两个文件并检查相对链接证明。

### D-AC02: 精确部署提交通过远端验证

精确部署提交对应的 GitHub Actions `CI` workflow 以 `success` 完成，且
`silvermoon check --remote` 对同一 authoritative primary 返回成功。通过 workflow
run 的 `headSha`、`status`、`conclusion` 及 Silvermoon 输出证明。
