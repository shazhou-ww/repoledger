# Ledger

## Implementation

### Steps

当前 contract 未单独定义 implementation steps。

### Acceptance criteria

- [x] **I01:** 固定 metadata layout
- [x] **I02:** Silvermoon v1 配置
- [x] **I03:** 自包含 idea validation
- [x] **I04:** 三层 revision
- [x] **I05:** 级联矩阵
- [x] **I06:** 状态推进
- [x] **I07:** Create scaffold 与回滚
- [x] **I08:** Snapshot 一致性
- [x] **I09:** 文档与辅助材料归属
- [x] **I10:** 世界术语
- [x] **I11:** Criteria 与 evidence
- [x] **I12:** Skill 与 whats-next guidance
- [x] **I13:** 导航与 publication
- [x] **I14:** Clean break 与当前表面
- [x] **I15:** 完整验证

## Deployment

### Steps

当前 contract 未单独定义 deployment steps。

### Acceptance criteria

- [x] **D01:** 新仓库 lifecycle
- [x] **D02:** 生产级联验证

### Evidence

- 2026-09-24: Packed and installed `silvermoon@0.0.1` in a new temporary
  fixed-layout Git repository. The installed candidate CLI derived
  `preparing`, `implementing`, `deploying`, and `completed` as each acceptance
  fact was added.
- 2026-09-24: Starting from the completed candidate, isolated changes under
  `outer/`, `outer/inner/`, and `outer/inner/ideal/` derived `deploying`,
  `implementing`, and `preparing` respectively; removing each change restored
  `completed`.
