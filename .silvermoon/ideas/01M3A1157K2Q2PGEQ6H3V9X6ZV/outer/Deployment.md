# Deployment

## Steps

### D-S01: 发布并锁定现世契约

先将本 Deployment 契约发布到主分支，并以随后 `whats-next` 报告的稳定 deployment revision 作为全部外部验证对象；验证期间不再修改三界内容。

### D-S02: 验证 ready 消费体验

在主分支 source checkout 上分别执行人类可读和 `--json` 的 `whats-next`，确认 onboarding 无 gap 时输出直接聚焦唯一 lifecycle action，且不出现 onboarding 成功流水账。

### D-S03: 验证 packaged consumer 的 gap 体验

执行 installed-package e2e，将当前包安装到隔离消费者仓库，验证未完成 onboarding 与 skill drift 场景只暴露可操作 gap，并保留 remediation、recommended action 和 recheck。

### D-S04: 执行发布级回归

对稳定 deployment revision 对应的主分支候选运行 `pnpm check`，覆盖 Markdown、unit、contract、integration、package contents、installed-package e2e 和 skill consistency。

## Acceptance criteria

### D-AC01: Ready 输出不展示 onboarding 流水账

source checkout 的人类可读输出不含 `onboarding` 行，JSON `result` 不含 `onboarding` 属性，同时两者仍显示同一唯一 lifecycle action；以实际 CLI 命令输出和 installed-package ready 断言证明。

### D-AC02: Blocked 输出只展示完整 gap

隔离消费者的 blocked JSON 仅在 `onboarding.gaps` 中列出未通过 requirement，不含 `satisfied` 或 `inapplicable` 项；每个 gap 保留 ID、标题、状态、blocking、dependencies、observed 和 remediation，action details 引用同一组 gap。以 installed-package e2e 的 bootstrap 与 drift 断言证明。

### D-AC03: 发布候选保持兼容且可交付

完整 `pnpm check` 通过，既有 Git hygiene、idea lifecycle、完整 adoption 诊断和 package smoke 行为无回归；以命令退出码和各测试阶段摘要证明。
