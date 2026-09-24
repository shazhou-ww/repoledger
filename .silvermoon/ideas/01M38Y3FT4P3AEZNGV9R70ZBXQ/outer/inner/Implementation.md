# 实现三层世界模型

## Implementation acceptance criteria

- **I01 固定 metadata layout：** 使用唯一的 `.silvermoon/` layout contract。
- **I02 Silvermoon v1 配置：** 只从 `.silvermoon/config.yaml` 读取不含 `ideasDirectory` 的配置。
- **I03 自包含 idea validation：** 校验 canonical idea folder、status 和三层固定入口。
- **I04 三层 revision：** 分别计算 ideal、implementation 和 deployment Git tree revision。
- **I05 级联矩阵：** 精确验证道心、内景和现世变化的单向级联。
- **I06 状态推进：** 三个 decision 分别绑定对应的当前 world revision。
- **I07 Create scaffold 与回滚：** 原子创建三个入口与 status，并安全处理碰撞和 partial failure。
- **I08 Snapshot 一致性：** 所有 check target 对相同内容返回相同三层 revision。
- **I09 文档与辅助材料归属：** 每层支持辅助文件，但只有同层入口定义 contract。
- **I10 世界术语：** 当前表面统一使用 Ideal World（道心）、Inner World（内景）和 Outer World（现世）。
- **I11 Criteria 与 evidence：** 从 `Implementation.md` 读取 criteria，并绑定当前 implementation revision。
- **I12 Skill 与 whats-next guidance：** 三阶段 guidance 显示入口、辅助范围、revision 和级联影响。
- **I13 导航与 publication：** 保留 hygiene、request context 和 non-force publication 安全语义。
- **I14 Clean break 与当前表面：** 不读取、迁移、合并或诊断旧布局。
- **I15 完整验证：** trajectory、package smoke、`pnpm check` 和格式检查全部通过。
