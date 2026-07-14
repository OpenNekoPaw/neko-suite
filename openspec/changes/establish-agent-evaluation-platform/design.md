## Context

当前 `scripts/agent-eval/protocol-smoke.mjs` 通过 TUI debug automation 执行真实 session，但只编排单 prompt，v1 manifests 混合 Skill、Agent runtime 和创作 workflow，部分 `judge` 字段只作为 metadata 存在。`session.facts` 对 Skill injection、effective config、task/artifact result、usage 和 diagnostics 的投影不足，成功结果也只有 stdout JSON。

平台必须保持 Neko Agent 是被测系统。TUI App/session owner、输入队列、AgentSession、Skill lifecycle、tool/task/provider、artifact delivery 和持久 conversation path 都必须真实执行；外部脚本拥有测试意图、变体、断言、Judge、报告和基线。该平台同时服务普通行为 Evaluation、后续 Prompt/Skill 优化和消融，但不吸收后两者的专属策略。

## Goals / Non-Goals

**Goals:**

- 为新增或修改 Agent 行为提供统一、可审计的 Evaluation authoring 决策。
- 建立跨 target 的 v2 suite/scenario、真实 TUI runner、配置矩阵、路径/产物硬门禁、可选领域 Judge 和版本化报告。
- 用通用 facts 证明 effective config、canonical path、no-fallback、流程终态和 artifact identity。
- 先形成最小可用闭环，再纵向扩展多轮、质量、baseline 和 CI。

**Non-Goals:**

- 不实现 Prompt/Skill candidate 生成、批准或接受/拒绝状态机。
- 不内置消融 presets，也不在 Agent runtime 中增加 experiment/variant/pass/fail 语义。
- 不新增 `neko eval`、第二套 AgentSession assembly 或按 package 复制 runner。
- 不把同一模型的一次输出或 Judge 分数当作稳定性结论。
- 不拥有 Skill Market package id、semver、发布、安装或分发历史。

## Decisions

### 1. 平台只有一个外部 owner 和一条真实执行路径

目录收敛为：

```text
scripts/agent-eval/
  runner/
  schemas/
  suites/
    skills/<skill-id>/
    agent-runtime/<capability>/
  shared-fixtures/
  reports/
```

Runner 只通过 debug automation 创建/恢复 TUI session、提交消息、取消、等待 idle、读取 facts 和释放 session。外部 controller 可以决定下一条输入，但每条消息必须进入 TUI input queue。拒绝直接 import Agent turn runner，因为这会形成无法覆盖 TUI runtime assembly 的平行事实来源。

### 2. Authoring 决策先于场景文本

每个相关 change 先输出 `reuse | update | create | excluded` 决策，包含 target、user behavior、canonical path、forbidden fallback、observable evidence、expected result/failure、fixtures、runtime/model matrix 和 coverage delta。Change-to-suite selector 只提供确定性候选，最终决策仍需由 change owner 审阅；无法证明的 evidence 记录为 blocker，不能降级成文本断言。

### 3. v2 使用严格、可组合的判别式契约

`neko.agent-eval.suite.v2` 拥有 owner、target、runtime/model policies、fixtures、case index、baseline policy 和 report policy；`scenario.v2` 拥有 case group、steps、hard assertions、artifact checks 和可选 rubric。Target kind 限定为 Skill、Prompt、Capability、Tool、Model、Runtime 或 Workflow，case group 限定为 canonical、paraphrase、boundary、failure、workflow、artifact、quality、regression 或 holdout。

未知字段、未知 kind、未实现 evaluator 或不兼容 schema 在 TUI spawn 前失败。拒绝“宽松读取未知字段”，因为当前 metadata-only Judge 已证明这会制造假绿色。

### 4. Runtime profile 只表达真实支持的配置

Suite 可以声明 session-scoped immutable runtime profiles 和模型矩阵。TUI runtime 通过 canonical config/session assembly 应用允许的配置，并在 facts 中返回有效配置投影和 digest。Runner 同时记录 requested 与 effective identity；不一致、未知或未生效配置属于 configuration invalid。

Profile 不能承载只为 Evaluation 存在的开关。需要移除内部实现的比较由后续消融 change 使用隔离 revision/build，而不是向生产 session 增加 eval-only flag。

### 5. Facts 保持中立、类型化和有界

Debug facts 增加：Skill `name + source/provenance + rootId + relativePath + fingerprint`、slot/owner/trigger/injection fragments/tool policy；target 与媒体模型；tool/task/continuation；stable artifact refs/revision/digest/provenance/validator status；typed diagnostics；usage/timing/retry；每个有界集合的 dropped count。

Skill identity 和 fingerprint 复用 portable Skill/Host projection SSOT。`name` 必须与目录名一致；同名但 source/root/location 不同的 Skill 是不同 Host identity；`fingerprint` 是 Host 对完整 canonical Skill package 计算的开发内容快照。Evaluation 不读取或生成 Market package id、semver、发布或安装状态。

Facts 不出现 suite、case、variant、assertion、rubric、score、baseline 或 report path。Prompt 只投影 fragment id/source/order/version/hash，不暴露完整隐藏 prompt、凭据或未经授权内容。

### 6. Hard gates、领域质量和 Judge 分层

硬门禁覆盖 intent/trigger、injection/model、process/idle、output contract、artifact contract、permission 和 no-fallback。领域 validator/QualityEvidence 负责真实文件和媒体质量事实。Judge 只评价意图满足、方法遵循、相关性、完整性、具体性、一致性、恢复清晰度和领域 rubric，且只能读取 allowlisted evidence projection。

任一硬门禁失败时 case 保持失败，Judge 结果只能作为补充。通用 Judge 不替代 Storyboard、Canvas、图片、视频或其他 owning domain validator。

### 7. 报告区分事实、结果和归因假设

每次真实运行输出 `result.json`、`evidence.json`、`artifact-manifest.json`，按需要输出 `judge.json`、`baseline-diff.json`，并生成 `quality-report.md`。Outcome 限定为 pass、case fail、infrastructure fail、configuration invalid 或 non-comparable。

失败分析分别记录 observed failure、evidence refs、suspected owner、confidence 和 missing evidence。Owner taxonomy 为 Skill content、Prompt、routing、Capability/Tool、Runtime/Session、Provider infrastructure、Artifact authoring 或 Evaluation infrastructure；报告不得把低置信推断表述为已证实根因。

### 8. Baseline 比较要求可比输入

Baseline 绑定 target identity/content fingerprint、repository revision、fixture digest、runtime/model profile、sampling、budget、validator/Judge identity、hard gates 和 score distribution。Skill baseline 必须绑定完整 Host identity 与 fingerprint；比较前必须验证这些条件相同或显式允许，不满足时返回 non-comparable，而不是计算误导性提升。

Raw reports 保持 gitignored；可提交 baseline 和摘要必须脱敏。Blind A/B、candidate worktree 和候选接受/拒绝属于后续优化 change，平台只提供通用 comparison primitive。

### 9. 纵向里程碑交付

实施顺序为：M1 authoring + v2 + 单场景真实 TUI 报告；M2 typed Skill/model/config/artifact facts；M3 多轮/队列/task/recovery controller；M4 Judge、重复采样和 baseline；M5 suite migration 与 CI lanes。每个里程碑都必须拥有可运行 pilot、负向 case 和 key-free harness tests。

## Risks / Trade-offs

- [Risk] Facts 扩展泄露隐藏 prompt、凭据或本地内容。 -> 使用 allowlist、hash projection、redaction/adversarial tests 和 dropped-count evidence。
- [Risk] Suite v2 变成覆盖一切的 mega-schema。 -> 将 target、step、assertion、artifact check 和 rubric 设计为有界判别式结构，未知字段 fail-visible。
- [Risk] 真实模型评估成本和波动较大。 -> 默认 CI key-free，可信 focused 使用最小 cases，nightly Debug Functional 才扩大矩阵并保留全部样本。
- [Risk] 多个 active changes 同时修改 facts 或 suites。 -> 平台先稳定公共 contract；消费者只依赖已完成 capability，不建立临时 schema/runner。
- [Risk] v1 migration 影响现有场景。 -> 提供 validation-only converter，迁移完成后删除 v1 执行路径和 metadata-only fields。

## Migration Plan

1. 定义 v2 authoring、suite/scenario、facts、report 和 baseline contracts，并用 key-free tests 固定 fail-visible 行为。
2. 实现单场景 TUI driver 和最小结构化报告，迁移一个 Agent-runtime pilot。
3. 扩展通用 facts/config projection，迁移一个 Skill + artifact pilot。
4. 实现多轮 controller、hard assertions、Judge、重复采样和 baseline comparison。
5. 迁移所有 v1 scenarios，删除平铺 manifests、metadata-only Judge 和 v1 execution。
6. 接入 key-free/focused/nightly Debug Functional lanes，更新架构、Skill 方法论、README 和贡献指南。

Rollback 只能阻塞未完成的 v2 Evaluation；不得恢复 `neko eval`、direct Agent runner、v1 silent execution 或 generic-completion success。

## Open Questions

- Approved baseline 的脱敏样本与聚合数据是 suite-local 保存，还是由统一 quality index 引用。
- 首批公开 artifact validator 覆盖哪些 `.nk*` 格式；缺失 validator 时 case 必须标记 evidence unavailable。
- 可信 CI 的 target/controller/Judge provider 预算与默认独立性需要在部署前确定。
