# Implementation

## Steps

### I-S01: 投影 whats-next onboarding gap

保留 `inspectAdoption` 作为完整诊断来源，在 `whats-next` 边界增加专用投影：无 gap 时省略 `onboarding`；存在 gap 时只输出状态、完整 gap 列表、推荐动作和 recheck。`adopt-silvermoon` 的 action details 引用同一组 gap，避免维护第二套事实。

### I-S02: 精简人类可读渲染

调整 CLI renderer，使其只在报告包含 onboarding gap 时打印 gap，并保留 requirement ID、状态、阻塞性、依赖、观测事实、修复方式、推荐动作及 recheck；ready 路径不打印 onboarding 成功流水账。

### I-S03: 固化契约并更新文档

更新 unit、integration/e2e 契约测试，覆盖 ready 省略、blocked 仅含 gap、action 优先级不变和输出确定性；同步命令参考文档，明确完整矩阵仍由 `check`/内部诊断承担。

## Acceptance criteria

### I-AC01: Ready 报告保持安静

当 onboarding 没有 gap 时，人类可读与 JSON `whats-next` 均不包含 onboarding 状态、requirement、执行来源或 recheck；通过 CLI unit test 与 installed-package e2e 对 ready 报告的缺失字段和输出文本进行证明。

### I-AC02: Blocked 报告只包含可操作 gap

当 onboarding 阻塞时，JSON 只包含未通过 gap，且每项保留 ID、标题、状态、blocking、dependencies、observed 和 remediation；人类可读输出显示同一信息以及 recommended action 和 recheck。通过 unit test 与 installed-package e2e 构造缺失、漂移场景并断言不存在已通过 requirement。

### I-AC03: 路由与完整诊断行为不回归

`whats-next` 仍返回唯一最高优先级 action，Git hygiene、idea 生命周期和 `inspectAdoption` 的完整 requirement 矩阵保持原行为；通过现有 integration/contract 测试和 `pnpm check` 全量验证证明。
