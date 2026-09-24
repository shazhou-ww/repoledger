# Ledger

## Implementation

### Implementation steps

- [x] **I-S01:** 投影 whats-next onboarding gap
- [x] **I-S02:** 精简人类可读渲染
- [x] **I-S03:** 固化契约并更新文档

### Implementation acceptance criteria

- [x] **I-AC01:** Ready 报告保持安静
- [x] **I-AC02:** Blocked 报告只包含可操作 gap
- [x] **I-AC03:** 路由与完整诊断行为不回归

### 实现证据

- `node --test "test/unit/cli-v1.test.js" "test/integration/whatsnext.test.js"`：28 项通过。
- `pnpm check`：unit/contract/integration、打包、installed-package e2e 和 skill 校验全部通过。

## Deployment

### Deployment steps

- [x] **D-S01:** 发布并锁定现世契约
- [x] **D-S02:** 验证 ready 消费体验
- [x] **D-S03:** 验证 packaged consumer 的 gap 体验
- [x] **D-S04:** 执行发布级回归

### Deployment acceptance criteria

- [x] **D-AC01:** Ready 输出不展示 onboarding 流水账
- [x] **D-AC02:** Blocked 输出只展示完整 gap
- [x] **D-AC03:** 发布候选保持兼容且可交付

### 现世证据

- 稳定 deployment revision：`2d980bdb7e5304b6d9c7360629126d0adacd64c8`。
- source checkout 人类可读输出无 `onboarding` 行；JSON `result` 无 `onboarding` 属性，二者 action 均为 `deploy-idea`。
- `pnpm check`：integration 62 项通过、2 项跳过；package smoke、installed-package e2e 和 skill consistency 全部通过。
