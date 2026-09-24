# 分层测试与发布前完整验证

## Intent

按验证边界组织自动化测试，并让 CI 根据反馈速度和风险选择对应层级。普通变更应快速获得
unit 与 repository contract 反馈，同时仍在合并前以单一环境验证真实 Git 集成；发布流程
必须执行完整 integration、package 和已安装 CLI 的端到端验证。

## Context

当前 `test/` 下的测试全部由同一个 `node --test` 命令发现，但实际混合了四种性质不同的
验证：

- 直接调用纯函数或进程内接口的 unit tests；
- 创建临时目录、真实 Git repository 和 local bare remote 的 integration tests；
- 校验 schema、文档链接、skill、workflow、品牌和 package surface 的 repository
  contract tests；
- `scripts/smoke-pack.js` 中打包、安装 tarball 并通过 `npm exec silvermoon` 使用产品的
  packaged CLI end-to-end test。

`pnpm check` 当前把这些验证、package contents check、installed-package smoke 和 skill
discovery 串在一起。普通 CI 又在三个操作系统和两个 Node 版本的矩阵中完整执行它，导致
真实 Git 场景、打包安装和外部工具发现被重复运行。测试层级和命令入口不明确，也无法为
本地快速反馈、跨平台兼容检查和发布门禁选择不同成本的验证集合。

真实 Git 测试通过模块 API 驱动 Silvermoon，并没有从已安装产品的用户入口执行完整流程，
因此应命名为 `integration`，而不是 `e2e`。只有从 tarball 安装后经公开 CLI 和 package
exports 验证发布产物的场景使用 `e2e` 名称。

## Desired outcome

测试按 `unit`、`integration`、`contract` 和 `e2e` 四种明确边界组织，并拥有可独立运行的
npm script。混合测试文件按用例性质拆开，使目录名称真实反映依赖边界，而不只是移动文件。

普通 pull request 和 push CI：

- 在受支持的 OS 与 Node 矩阵上运行快速 unit tests；
- 在一个 Linux/current Node 组合运行快速 repository contract tests；
- 在一个 Linux/current Node 组合运行一次真实 Git integration tests，避免把关键 Git
  回归推迟到不可变 release tag 创建之后才发现；
- 不重复执行 tarball 安装 E2E。

npm publish workflow 在 `npm publish` 前执行 unit、contract、integration、package
contents 和 installed-package E2E 全集。任一层失败都阻止发布。开发者既能运行快速默认
检查，也能显式运行某一层或完整的 release-grade 检查。

## Scope

### In scope

- 将现有测试按行为边界迁入 `test/unit/`、`test/integration/` 和 `test/contract/`。
- 拆分同时包含纯函数、真实 Git 或 workflow contract 用例的混合测试文件。
- 将 installed-package smoke 明确建模为 `test/e2e/` 层；保留其真实 pack、install、
  public CLI、exports 和 packaged schema 验证能力。
- 提供 `test:unit`、`test:integration`、`test:contract` 和 `test:e2e` 等职责清晰的
  package scripts，并定义快速默认检查与 release-grade 完整检查。
- 调整普通 CI 的 jobs 和 matrix，使 unit tests 保留跨平台、跨受支持 Node 版本覆盖，
  contract 与 integration 只在指定代表环境运行一次。
- 调整 npm publish workflow，使发布前显式执行全部测试层级和 package contents check，
  且不会通过嵌套命令无意重复同一检查。
- 更新 repository instructions、release documentation、skill 或测试中的命令契约，
  使开发、CI 和发布说明与新的测试入口一致。
- 保持所有现有有效断言和行为场景的覆盖；移动或拆分不能借机删除失败、耗时或平台相关
  用例。

### Out of scope

- 改变 Silvermoon CLI、repository model、idea lifecycle、schema 或 package public API
  的产品行为。
- 用 mock Git 替代 integration tests 中用于证明真实 Git 行为的仓库操作。
- 引入第三方 test runner、coverage service、remote repository 或外部网络测试环境。
- 把 integration tests 延迟到 release tag 创建后才首次运行。
- 发布 npm package、修改 package version 或创建 release tag。
- 以测试重组为由重写无关测试风格或扩大现有产品需求。

## Constraints

- 目录名使用 `integration`，不使用 `integrated`；`e2e` 只表示通过公开安装产物入口完成的
  黑盒流程。
- unit tests 不得创建真实 Git repository、调用 Git subprocess、依赖 repository
  worktree 状态或读写测试专用临时文件。
- integration tests 可以使用临时文件系统和本地 Git/bare remote，但不得访问真实远端
  服务或依赖开发者凭据。
- contract tests 可以读取 repository-owned artifacts，但不得修改工作区或依赖网络。
- e2e 必须从实际生成的 tarball 安装，不能退化为直接 import checkout 中的源码。
- 所有测试层都必须可独立运行；完整检查必须具有显式、确定的组成，不能依赖模糊的默认
  test discovery。
- 测试移动后仍须在 Windows 使用兼容路径和进程调用，并清理自己创建的临时资源。
- publish workflow 继续遵守 trusted publishing、immutable tag、`origin/main`
  reachability 和禁止本地发布的现有安全边界。

## Open questions

无。测试分类、CI 层级和发布前完整验证策略已经确认。
