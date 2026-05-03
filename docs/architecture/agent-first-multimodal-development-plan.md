# Agent-First 多模态开发方案

**状态**: Proposed / Implementation Plan (ADJUST applied)
**日期**: 2026-04-26
**关联范围**: neko-agent · neko-client · neko-types · neko-engine
**关联文档**:

- [Agent-First 多模态感知闭环路线图](./perception-first-roadmap.md)
- [Agent-First 多模态上下文解析与感知输入分层](./agent-first-multimodal-context-resolution.md)
- [IDC 控制面独立 + Stage Registry + FeedbackArbiter](./adr-control-plane-feedback-arbiter.md)
- [Subagent 使用边界分析](./agent-subagent-usage-boundary.md)
- [Multi-Agent Federation](./agent-multi-agent-federation.md)
- [Agent Media Architecture](./agent-media-architecture.md)
- [Capability Protocol](./adr-capability-protocol.md)
- Memory Unification ADR (2026-04-24)
- Provider Expression Context ADR (2026-04-26 COMPLETE)
- [Skill as Prompt Chains](./adr-skill-as-prompt-chains.md)

---

## 1. 总体目标

建立 Agent-first 多模态主链路：

```text
AgentObservation → DecisionRationale → Skill Prompt-Chain Guidance → Tool(optional evidence / operation)
```

核心约束：

- Agent 是图片、视频、音频、数据与上下文的主感知和主决策主体。
- 工具、QualityReview、Subagent、Memory、User 都只提供 evidence 或 recommendation。
- Operation 对齐 Capability Protocol：Operation 是 Tool 的一种 `kind`，不是与 Tool 并列的第二套执行协议。
- 不新增 PipelineAction / partialRerun 执行器；恢复与修正只作为 Skill prompt-chain 指导，由 Agent 在 IDC artifact 状态内自主安排。
- 任何工具操作、回退建议或用户确认都必须能追溯到 `DecisionRationale`。
- 只有会修改项目/画布/时间线/模型状态的工具才映射为 `Tool(kind=operation)` 并产出 `EditOperation`；感知、评审、缓存和 evidence 工具不走 `EditOperation`。
- ControlPlane / FeedbackArbiter 只处理流程、预算、审批、重试、回退、终止、升级和 Journal。
- 单图问答、单次生成、参考图传递、用户交互、低风险修正建议必须保留主 Agent 快路径。
- Federation 是 Future Work，不进入当前 MVP。

---

## 2. 架构原则

### 2.1 架构三问

1. **是否符合现有架构？**
   - 符合。复用现有 Agent session、Journal、FeedbackCoordinator、ToolGroup、EngineClient、SubAgentManager，不引入工具主导的新管道。
2. **如何降低耦合？**
   - `AgentObservation` / `DecisionRationale` 是核心契约；工具、QualityReview、Subagent 都只产出 evidence 或 recommendation。
3. **是否易扩展与测试？**
   - 易扩展。可单测 observation/rationale 记录、evidence 合并、policy 触发、tool optional mode；模型质量与 LLM 行为用 mock evidence 隔离。

### 2.2 五层分析

| 层面 | 结论                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Agent 负责感知与决策；工具负责证据；Subagent 负责隔离推理；ControlPlane 负责流程边界；Journal 负责审计。                               |
| 依赖 | 主链路不依赖工具、不依赖 Subagent、不依赖 Federation；增强层通过接口注入。                                                             |
| 接口 | 核心新增 `AgentObservation`、`PerceptionEvidence`、`DecisionRationale`、`FeedbackDecision`；不新增 PipelineAction / partialRerun DSL。 |
| 扩展 | 可追加 PerceptionTool、QualityReviewer、Skill prompt-chain 章节、Subagent reviewer、Federation。                                       |
| 测试 | 先测契约、记录、引用关系和策略，不测模型质量；工具/子代理用 mock evidence。                                                            |

### 2.3 与现有 ADR 的关系矩阵

| ADR                                               | 接合点                                                       | 本方案约束                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability Protocol (2026-04-25)                  | Tool / Skill / Provider 能力注册；Operation 已降为 Tool kind | 主链路使用 `Tool(kind=operation)`，PerceptionTool 与 OperationTool 共享 Capability metadata，不新建平行协议。                                 |
| Memory Unification (2026-04-24)                   | Journal 是 SSOT，Memory 是投影                               | `agent.observation.created` / `agent.evidence.attached` / `agent.rationale.created` 是 first-class Journal event；Recorder 不持有第二事件源。 |
| ControlPlane Feedback Arbiter                     | FeedbackDecision / FlowAction / policy                       | Arbiter 只产生 guidance / flow decision，不直接调用工具；决策引用 observation/rationale/evidence。                                            |
| Provider Expression Context (2026-04-26 COMPLETE) | ProviderCard / provider adaptation 影响 prompt 与表达倾向    | Observation / evidence 必须携带 provider adaptation metadata；低信任 provider 可触发补证据 guidance。                                         |
| Skill as Prompt Chains (2026-04-26)               | Skill 编排退化为 markdown 章节                               | Observation / Rationale / Recovery 是 Skill markdown 章节约定，不放进额外 DSL 编排器；禁止新增 PipelineAction / partialRerun 调度 DSL。       |
| Multimodal Context Resolution (2026-04-26)         | UI selection、项目/引擎状态、素材文件与感知输入分层           | UI 只提供只读上下文和选择引用；素材/引擎提供权威数据；Agent 消费 `MultimodalContextPacket` 后形成 observation，工具只补 evidence。           |

### 2.4 Provider 维度对 observation 可信度的影响

ProviderCard 是软提示注入，会影响 Agent 对同一图片、视频或数据的描述风格和判断粒度。因此：

- `AgentObservation` 必须记录 `providerContext`，至少包含 `providerId`、`providerCardId`、`trustLevel`、`adaptationHash`。
- `PerceptionEvidence` 若来自工具或模型，也应记录 `providerContext` 或 `modelContext`，便于比较不同 provider 下的输出差异。
- 不同 provider 下的 observation 默认不可直接视为等价；合并时需保留来源。
- `trustLevel: 'untrusted'` 或 provider adaptation 缺失时，`FeedbackPolicy` 不直接强制调用工具，只生成补充 evidence 的 guidance。
- 低信任 provider 与低置信 observation 同时出现时，可升级为 ask-user 或建议调用 QualityReview / PerceptionTool。

### 2.5 ConfidenceLevel 定义

`ConfidenceLevel` 是 Agent-first 的关键控制开关，必须在 Sprint 1 前固定。

```typescript
type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';
```

| Level     | 含义                                                               | 默认处理                                                |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| `high`    | Agent 对 observation / rationale 有明确把握，且无显著冲突 evidence | 走主 Agent 快路径；不要求工具 evidence。                |
| `medium`  | Agent 有可解释判断，但存在局部不确定或少量缺失                     | 可继续；Feedback 可提示“如需更稳可补 evidence”。        |
| `low`     | Agent 明确表示不确定、素材不足、冲突明显或高风险                   | Arbiter 只发 guidance，建议补工具 evidence 或询问用户。 |
| `unknown` | 旧数据、迁移数据或未声明置信度                                     | 按 `medium` 兼容处理，但 Journal scanner 标记为待补全。 |

判定主体：

1. **Agent 自报**：`AgentObservation.confidence` 是主来源。
2. **Arbiter 校验**：FeedbackPolicy 可以根据缺失字段、provider trust、conflicting evidence 将有效置信度下调，但不能上调。
3. **Evidence 对账**：工具 evidence 可挑战或补强 Agent 判断，但不覆盖 Agent observation；最终仍由 Agent 形成新的 `DecisionRationale`。

配置位置：

- 默认策略在 `FeedbackPolicy` 中声明。
- 实验开关通过 AblationToggle 暴露：`agentFirst.confidencePolicy`、`agentFirst.toolEvidenceMode`。

### 2.6 RiskLevel 矩阵

任何项目状态修改、工具操作或恢复建议必须先评估 risk。Risk 不由工具决定，而由 Agent 在 `DecisionRationale` 中说明，并由 ControlPlane / FeedbackPolicy 做流程级约束。

| 维度       | Low                                  | Medium                      | High                           |
| ---------- | ------------------------------------ | --------------------------- | ------------------------------ |
| 影响范围   | 单 shot / 单局部元素                 | 多 shot / 单 track / 单页面 | 全项目 / 多 track / 全局风格   |
| 可逆性     | 有明确 invert / undo                 | 可重做但成本较高            | 不可逆或依赖外部状态           |
| 预算成本   | 低 token / 低 provider 成本 / 短耗时 | 中等生成或渲染成本          | 高额生成、长渲染、外部付费调用 |
| 用户可见性 | 不改变用户确认过的方向               | 可能改变局部表达            | 改变已批准创作方向             |

默认规则：

- 任一维度为 High → `riskLevel = high`。
- 两个及以上 Medium → `riskLevel = medium`。
- 其余为 Low。

处理策略：

- `low`：可由高置信 `DecisionRationale` 直接执行，不要求工具 evidence。
- `medium`：需要 rationale + 可选 evidence；AskMode 下询问用户。
- `high`：需要用户确认；低置信时建议补 evidence 后再询问。

---

## 3. MVP 边界

### 3.1 包含

- Agent observation / rationale 类型与 Journal 记录。
- Prompt / Skill 要求 Agent 先观察、再决策。
- FeedbackDecision 引用 observation / rationale。
- QualityReview 作为旧能力的 evidence wrapper。
- PerceptionTool 元数据和至少一个可选 evidence 工具。

### 3.2 不包含

- Rust `/perception/*` controller。
- Federation MessageBus / AgentRegistry。
- Subagent 默认接管质量评估。
- ArtifactKind `task → apply` 强迁移。
- 任意动态 stage 注册。

---

## 4. Verification Fixtures

Phase 0 必须提交 canonical fixtures，后续阶段围绕这些 fixtures 扩展测试。

### 4.1 Fixture A：单图问答

输入：用户上传单张角色图并询问“这个角色是什么发色？”

预期：

- 主 Agent 直接形成 `AgentObservation`。
- `confidence` 可为 `high | medium | low`。
- 无工具 evidence 时也可回答。
- 若 `confidence=low`，Feedback guidance 可建议调用 `perception.image.classify`，但不自动调用。

### 4.2 Fixture B：shot 失败重跑

输入：5 shots 中 shot 3 风格明显漂移。

预期：

- 主 Agent 形成 observation：shot 3 与整体风格不一致。
- QualityReview 可作为 evidence 补充相似度或一致性报告。
- Agent 形成 `DecisionRationale`，引用 observation/evidence。
- Skill prompt-chain 给出恢复建议（例如重试、换模型、询问用户），但运行时不解析为 PipelineAction / partialRerun DSL。

---

## 5. 分阶段方案

### 阶段 0：契约层（已完成最小闭环）

**目标**：定义 Agent-first SSOT。

**新增类型**：

- `AgentObservation`
- `PerceptionEvidence`
- `DecisionRationale`
- `EvidenceSource`
- `ConfidenceLevel`
- `RiskLevel`

**建议路径**：

- `packages/neko-types/src/types/agent-observation.ts`
- `packages/neko-types/src/types/perception-evidence.ts`
- `packages/neko-types/src/types/decision-rationale.ts`

**验收**：

- 类型严格，无 `any`。
- 支持 `image | video | audio | data | text | mixed`。
- `DecisionRationale` 能引用 observation/evidence；持久化写入前必须校验引用存在。
- Agent-first Journal 记录必须携带 `contextPacketId`，临时工具结果可在 recorder 写入时由当前 context packet 补齐。
- Fixture A / B 的 JSON 样例通过 schema 校验。

### 阶段 1：Journal 与 Runtime Recorder（已完成最小闭环）

**目标**：Agent 感知和决策可记录、回放、审计。

**新增事件**：

- `agent.observation.created`
- `agent.evidence.attached`
- `agent.rationale.created`

**新增服务**：

- `AgentObservationRecorder`
- `recordObservation()`
- `attachEvidence()`
- `recordDecisionRationale()`

**建议路径**：

- `packages/neko-agent/packages/agent/src/runtime/agent-observation-recorder.ts`
- `packages/neko-agent/packages/agent/src/session/` 事件读写扩展

**Journal SSOT 约束**：

- Recorder 只是 Journal writer 的 typed facade，不保留独立状态。
- `agent.observation.created` / `agent.evidence.attached` / `agent.rationale.created` 是 first-class Journal event；当前未上线无存量数据，不保留旧下划线事件名兼容。
- ConversationRecord / session projection 应包含 observation summary、rationale summary 与 evidence refs。
- Memory 只能消费 Journal 投影，不直接读取 recorder 内存。

**验收**：

- 无工具调用也能记录 observation/rationale。
- Journal reader 可回放事件。
- rationale 引用不存在的 observation/evidence 时校验失败。
- observation event 写入延迟 P95 < 50ms（mock fs / in-memory journal）。

### 阶段 2：Prompt / Skill 接入（已完成基础接入，Recovery Guidance 已补）

**目标**：让 Agent 行为符合 Agent-first。

**改动点**：

- Skill markdown 新增章节惯例：`## Observation`、`## Rationale`。
- Execution persona 引用章节规则：先 observation，再 rationale，再 operation。
- Creation persona：Proposal 必须可追溯到 observation。
- Feedback guidance：修复动作必须说明 rationale。
- Tool guidance：工具是 optional evidence provider。

**建议路径**：

- `packages/neko-agent/packages/agent/src/skill/builtins/execution-persona.ts`
- `packages/neko-agent/packages/agent/src/skill/builtins/` 内相关 Skill markdown / prompt chain
- `packages/neko-agent/packages/agent/src/prompt/modules/`
- Golden snapshot

**Skill as Prompt Chains 对齐**：

- 不新增 DSL 编排器。
- Observation / Rationale 是 markdown section convention。
- 现有 8 个 golden snapshot 应新增或更新 observation/rationale 相关断言。

**验收**：

- Prompt 明确“不默认调用工具”。
- Prompt 明确“工具不替代 Agent 判断”。
- Snapshot 更新通过。

### 阶段 3：Feedback 集成（已完成基础接入）

**目标**：反馈控制引用 Agent rationale，但不替代内容判断。

**改动点**：

- `FeedbackSignal` 增加 `agent-observation`、`decision-rationale`。
- `FeedbackDecision` 增加 `observationIds`、`evidenceIds`、`rationaleId`。
- `FeedbackPolicy` 增加：
  - `agentObservationRequired`
  - `toolEvidenceMode: off | optional | required-for-low-confidence`

**toolEvidenceMode 状态机**：

| Mode                          | 行为                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `off`                         | Arbiter 不因 low confidence 建议工具，只可 ask-user 或 continue。                                                            |
| `optional`                    | Arbiter 可发 guidance：建议 Agent 自行决定是否调用工具。                                                                     |
| `required-for-low-confidence` | Arbiter 仍不直接调用工具；只阻止高风险自动执行，并发出 guidance：需要 Agent 补 evidence 或 ask-user 后再形成新的 rationale。 |

该状态机不允许 Arbiter 直接调用 PerceptionTool，避免违反 Agent-first 原则。

**建议路径**：

- 拆分 `packages/neko-agent/packages/agent/src/feedback/feedback-coordinator.ts`
- 新增 `feedback-types.ts`、`feedback-policy.ts`

**验收**：

- Arbiter 不直接调用工具。
- low confidence 只生成 guidance：建议补 evidence 或询问用户。
- 无 evidence 高置信路径占比 ≥ 70%（fixture / integration 样本，用于验证主链路快路径未被工具化）。

### 阶段 4：QualityReview Evidence Wrapper（已完成 QualityCheck 最小接入）

**目标**：先包装旧能力，避免新旧 evidence 协议并存窗口扩大。

**改动点**：

- `QualityCheckConsistency` 输出包装为 `PerceptionEvidence` 或 `QualityReviewEvidence`。
- `ConsistencyReport` 不直接生成最终操作。
- `suggestedActions` / `remediations` 只能作为自然语言 recommendation / Skill prompt-chain 输入，经 Agent `DecisionRationale` 解释后再决定是否调用工具或询问用户；不落为 PipelineAction DSL。
- QualityReview evidence 的 `data.recommendations[]` 保留原自然语言建议，`remediationCount` 仅作为统计字段。

**建议路径**：

- `packages/neko-agent/packages/extension/src/tools/consistencyCheckTools.ts`
- 相关 validation / quality 模块

**验收**：

- QualityReview 失败不默认阻塞主链路。
- Agent 可引用 report 生成 rationale。
- Journal 可记录 evidence。

### 阶段 5：PerceptionTool 可选增强（已完成 describe/audio/image similarity/classify 最小闭环）

**目标**：工具统一为 evidence provider。

**改动点**：

- `PerceptionTool` metadata：modality、schema、cost、GPU、cacheable、idempotent。
- `TOOL_NAMES.perception.*`
- `PerceptionToolGroup`
- `perception.describeInput`：Agent 整理输入描述为 evidence。
- `perception.audio.transcribe`：通过 `@neko/neko-client` 的 `EngineClient.perception.transcribe` facade 产出音频 evidence。
- `perception.image.similarity`：通过 `@neko/neko-client` 的 `EngineClient.perception.similarity` facade 产出图文相似度 evidence。
- `perception.image.classify`：通过 `@neko/neko-client` 的 `EngineClient.perception.classify` facade 对候选 labels 排序并产出分类 evidence。
- VSCode extension runner 负责懒连接 `neko-engine`，并把 `EngineClient` 作为 perception client 注入 AgentSession。
- 工具输出统一包装 `PerceptionEvidence`。

**建议路径**：

- `packages/neko-types/src/types/agent-capability.ts`
- `packages/neko-types/src/types/tool-names.ts`
- `packages/neko-agent/packages/extension/src/tools/perceptionToolGroup.ts`

**验收**：

- 工具声明为 optional evidence。
- Agent 可调用 `perception.describeInput` / `perception.audio.transcribe` / `perception.image.similarity` / `perception.image.classify`，但主链路不强制。
- 至少一个工具输出 `PerceptionEvidence`。

### 阶段 6：EngineClient Perception Facade（已完成 transcribe/similarity/classify）

**目标**：屏蔽 `models:*`，提供稳定工具入口。

**改动点**：

- `EngineClient.perception.transcribe()`
- `EngineClient.perception.similarity()`
- `EngineClient.perception.classify()`
- 后续 `detectShots()`

**建议路径**：

- `packages/neko-client/src/EngineClient.ts`

**约束**：

- 内部委托现有扁平方法。
- 不新增 Rust controller。
- 旧方法不破坏。

**验收**：

- facade 单测通过。
- 工具层不直接耦合 `models:*`。

### 阶段 6.7：OperationToolAdapter 契约（已完成最小契约）

**目标**：明确 Agent 工具调用与 `EditOperation` 的边界：不是所有 Tool 都走 EditOperation，只有项目可见状态修改才走 operation adapter。

**改动点**：

- 已新增 `OperationToolIntent` / `OperationToolPlan` / `IOperationToolAdapter` / `IOperationToolAdapterRegistry` 共享契约。
- 已新增 Tool 层判别字段 `kind: 'standard' | 'perception' | 'operation'`；`OperationTool` 要求 `kind: 'operation'` 且不能同时携带 perception metadata。
- 已新增 `OperationTool` metadata：`operation.kind: 'operation'`、domain、`editOperationTypes`、`requiresRationale: true`、reversible。
- 已新增 `OperationToolAdapterRegistry`、`createOperationToolAdapterRegistry()`、`isOperationTool()` 与 `isOperationToolPlanTraceable()` helper。
- Adapter 输出 `EditOperation[]`，必须引用 `DecisionRationale`；perception / review / evidence / cache 工具不依赖 adapter。

**约束**：

- Operation 仍是 Tool 的一种 kind，不新增独立能力类型。
- Agent 可根据 rationale 决定是否调用 operation tool，但 adapter 只负责把已批准的修改意图映射到子包 `EditOperation`。
- 高风险或不可逆 operation 仍必须走 approval / permission。

**建议路径**：

- `packages/neko-types/src/types/operation-tool-adapter.ts`
- 已完成 timeline `element.update` / `element.move` / trim-update / `element.splitAt` / `element.splitKeepLeft` / `element.splitKeepRight`、canvas `canvas.node.update` / `canvas.node.reorder`、model scene3d / puppet `element.update` adapter MVP 与 extension 默认 registry 工厂；后续继续扩展高级 domain adapter。

### 阶段 6.5：Multimodal Context Packet（Canvas / Timeline selection 最小接入 / P2）

**目标**：把 UI selection、项目/引擎状态与素材文件解析成 Agent 可消费的上下文包，避免 Agent 直接读取全量 UI 或让 UI 代替内容判断。

**改动点**：

- 已定义 `SelectionRef` / `ArtifactRef` / `ProjectObjectRef` / `PerceptionInputRef` / `MultimodalContextPacket` 最小契约。
- 已定义只读 `UIContextProvider` 接口；Canvas selection 已通过 extension ambient context 构建 `MultimodalContextPacket`，timeline selection 已通过 active editor selection/state/project content 构建 `MultimodalContextPacket`，viewport 后续接入。
- 增加 `ProjectStateProvider` / `EngineStateProvider`，通过 `@neko/neko-client` 连接 `neko-engine` 解析权威对象状态。
- 已定义 `PerceptionInputResolver` 接口；Canvas node 先以 `structured-data` perception input 接入；timeline video clip 先映射为 `video-frame` perception input，并可通过 `@neko/neko-client` / `EngineClient.extractFrame()` 解析为 project cache image-file；audio clip 映射为 `audio-segment`，resolver 已支持 `@neko/neko-client` / `EngineClient.extractAudioSegment()` 走 `neko-engine` 的 `audios:segment` 写入 project cache audio-file；Canvas visual node 可映射为 `canvas-crop`，resolver 已支持 `@neko/neko-client` / `EngineClient.captureImage()` 走 `neko-engine` 的 `images:capture` 写入 project cache image-file，缺能力时保持原输入；model viewport snapshot 后续接入。
- 已将 `MultimodalContextPacket` 透传到 AgentSession metadata，并通过 `contextPacketId` 写入 `AgentObservation` / `PerceptionEvidence` / `DecisionRationale` 与 Journal projection；recorder 写入强制要求 context packet，保证可追溯。
- Context packet id 已改为 `ctx-{scope}-{uuid}`，避免同毫秒创建多个 packet 时碰撞；字段名仍沿用 `MultimodalContextPacket.id`，写入记录时作为 `contextPacketId` 引用。

**约束**：

- UI 只负责“用户指向什么”和“当前视图是什么”，不输出最终内容判断。
- 素材文件 / engine state 是结构与内容权威来源；Agent 是 observation 与 rationale 的唯一 owner。
- perception tools 仍是 optional evidence provider，不因 context packet 引入 pipeline 或自动修复执行器。

**参考**：

- [Agent-First 多模态上下文解析与感知输入分层](./agent-first-multimodal-context-resolution.md)

### 阶段 7：Skill Prompt-Chain 恢复指导（已完成可追溯契约）

**目标**：闭环修正由 Agent 在 IDC artifact 状态内自主发起，运行时不新增 PipelineAction / partialRerun 调度器。

**新增/调整**：

- 在 Execution / Iteration Skill markdown 中约定 `## Observation`、`## Rationale`、`## Recovery Guidance` 章节。
- QualityReview / PerceptionTool / Subagent 只提供 evidence 或 recommendation。
- Agent 用 `DecisionRationale` 解释是否重试、换模型、调整 prompt、接受当前结果或询问用户。
- `RecoveryGuidanceRecommendation` 必须引用 `rationaleId`，作为 prompt-chain guidance 的审计锚点。
- `agentFirst.recoveryGuidance=false` 时，Feedback 仍记录 cycle，但不向 prompt 注入 pending recovery guidance。
- 具体操作仍通过既有 Tool / artifact / approval 路径执行，不引入新的 pipeline DSL。

**约束**：

- 低风险修正建议可无工具 evidence，但必须说明 rationale。
- 低置信度或高风险需要用户确认或补 evidence。
- 工具结果不能直接触发重跑或项目状态修改。
- Skill 章节是 prompt-chain 写作惯例，不被运行时解析成状态机。

**验收**：

- shot 3 失败 → Agent observation/rationale → traceable recovery guidance 建议最小修正。
- `shotRecoveryGuidanceRecommendationFixture` 可追溯到 `shotRecoveryGuidanceRationaleFixture`。
- 失败超过阈值 → ask user。
- 所有修正建议可在 Journal 中追溯到 observation / rationale / evidence。
- 代码库不新增 `PipelineAction` / `PartialRerunRequest` 类型或 stage。

### 阶段 8：Subagent 可选 Reviewer / Recovery Guidance（已完成 reviewer-only 契约）

**目标**：只在上下文隔离有价值时启用；Subagent 不成为执行器、worker pool 或主感知入口。

**新增/调整接口**：

- 已新增 `ISubagentReviewer`：输入 observation / evidence / artifact 摘要，输出 review evidence / recommendation。
- 已新增 `SubagentReviewRequest` / `SubagentReviewResult` 结构化契约。
- 不新增 `IRecoveryExecutor` / `SubagentRecoveryExecutor` 运行时执行器；恢复仍由主 Agent 按 Skill prompt-chain guidance 自主决策。

**策略**：

- 默认 inline，无 Subagent 依赖。
- Subagent 只返回 evidence / recommendation，不直接调用工具、不修改 artifact、不触发重跑。
- `SubagentReviewResult` 可显式提交到 Feedback/Journaling：evidence 写入 Agent-first Journal graph，recommendation 只转为 guidance，由主 Agent 最终决策。
- 主 Agent 形成最终 `DecisionRationale`，并决定是否继续、换模型、调整 prompt 或询问用户。

**适用场景**：

- 长视频摘要。
- 可选质量 reviewer。
- 大批量素材对照。
- 复杂恢复建议复核。

**验收**：

- 关闭 Subagent 时流程可运行。
- Subagent 输出写入 `PerceptionEvidence` 或 `RecoveryGuidanceRecommendation`。
- 不污染主 Agent 上下文。
- 不依赖 Federation。
- 不新增 recovery executor / pipeline DSL。

### 阶段 9：ControlPlane / StageRegistry（已完成最小契约）

**目标**：流程控制可扩展，但不判断内容。

**改动点**：

- 已新增 `StageDescriptor` / `IReadonlyStageRegistry` 只读阶段描述视图；`StageRegistry` 仍提供 register/unregister 作为启动期装配 API，`ControlPlane` 只暴露只读视图。
- 已新增 `IStageController` / `FeedbackStageController`，只把 `FeedbackDecision` 映射为 stage guidance，不直接执行修复。
- 已新增 `IControlPlane` / `ControlPlane` / `createControlPlane()`，记录可审计 guidance history。
- `AgentRuntimeConfig.workflowRuntime.controlPlane?: IControlPlane` 已作为 optional runtime 注入点。

**延后项**：

- `task → apply` 强迁移。
- 任意 stage 动态注册。

**验收**：

- 默认行为不变：未注入 ControlPlane 时不改变 AgentSession 行为。
- stage guidance 可审计：`ControlPlane.getDecisionHistory()` 返回完整 guidance history。
- ControlPlane 不直接调用 PerceptionTool / Subagent / EditOperation，只输出 guidance。

### 阶段 10：Federation Future Work

**启动条件**：

- 需要 parent 向运行中 subagent 追加约束。
- 需要 subagent 主动询问 parent。
- 需要 sibling agents 直接协作。
- 需要 recursive spawn。
- 需要长期 AgentRegistry / MessageBus / Inbox。

**当前不做**：

- MessageBus。
- AgentRegistry。
- AgentSessionAgent adapter。
- FederationBudget。
- Inbox polling。

**原因**：

- Agent-first MVP 不依赖。
- 当前 `SubAgentManager` 足够支持单向 reviewer/recovery。

---

## 5.1 P1 收尾状态（2026-04-26）

**已完成**：

- Agent-first 契约、fixtures、Journal event、recorder 与 projection。
- FeedbackCoordinator 支持 observation / rationale / QualityReview evidence / Subagent review evidence。
- Recovery guidance 可追溯到 `DecisionRationale`，且 `agentFirst.recoveryGuidance=false` 会阻止 pending guidance 注入。
- Perception evidence ToolSet 已覆盖 `describeInput`、`audio.transcribe`、`image.similarity`、`image.classify`、`video.detectShots`。
- VSCode extension runner 通过 `@neko/neko-client` 的 `EngineClient` 懒连接 `neko-engine`，并缓存懒连接 client 以复用 perception facade。
- Subagent reviewer-only 契约与显式 Feedback/Journaling 接入；不自动 spawn、不作为 executor。
- `MultimodalContextPacket` 共享契约与 traceability helper 已开始落地，覆盖 UI selection、artifact、project object 与 perception input 引用关系。
- Canvas selection 已可构建 `MultimodalContextPacket` 并透传到 AgentSession metadata；media / shot 等带 visual asset 的节点可携带 asset uri、bounds，并生成 `canvas-crop` perception input；不让 UI 输出内容判断。
- Timeline selection 已可从 active editor 的 selected element / timeRange / currentTime / project tracks 解析 source uri、track、start/duration、trimStart/trimEnd、source in/out、resourceId、lineage 与稳定 `engineObjectId=timeline:{trackId}:{elementId}`，并可将 video-frame 解析为 project cache image-file；audio-segment resolver 已接入 `EngineClient.extractAudioSegment()` / `audios:segment` 片段导出能力；不直接依赖 webview store。
- `contextPacketId` 已接入 Agent-first recorder 与 Journal projection；recorder 强制持久化记录携带 context packet，QualityReview / Subagent evidence 可追溯到当前多模态上下文包。
- Context packet id 已从 timestamp-only 改为 UUID 后缀，避免同毫秒碰撞。
- QualityReview evidence 保留自然语言 `recommendations[]`，不只保留 remediationCount。
- Tool 层已增加 `kind` 判别并校验 perception / operation metadata 互斥。
- `OperationToolAdapter` 与 registry 最小共享契约已落地，extension 默认 registry 已注册 timeline `element.update` / `element.move` / trim-update / split adapter、canvas `canvas.node.update` / `canvas.node.reorder` adapter，以及 model scene3d / puppet `element.update` adapter，可从 Agent intent + ProjectData / CanvasData 规划可追溯 `EditOperation`。

**P1 可选增强 / P2 候选**：

- 长视频 reviewer 场景；`perception.video.detectShots` 已作为基于 engine keyframes 的候选边界 evidence 工具落地，后续可替换为更精确的镜头切分模型。
- Canvas selection 的更完整素材解析：从 canvas node id 补 engine object id，并接入真实 canvas viewport / crop capture API。
- Timeline engine state 后续可继续补运行时状态快照（缓存命中、解码状态、代理状态等）；audio segment 真实 `extractAudioSegment` 导出 API 已落地。
- neko-model adapter 已覆盖 scene3d / puppet 元素的 animation、camera、expression、parameter override 最小可逆规划（映射为 timeline `element.update`）；neko-canvas adapter 已覆盖 `canvas.node.update` / `canvas.node.reorder` 最小可逆规划；timeline adapter 后续继续扩展 ripple、group、transition 等高级剪辑操作。
- Canvas node crop 已接入 `EngineClient.captureImage()` / `images:capture` 整图导出；后续若需要严格节点裁剪，再补 canvas viewport 或 engine crop rectangle API。
- Perception evidence cache / budget 统计（基于 metadata 的 `cost/cacheable/idempotent`）。
- ControlPlane / StageRegistry 只做流程治理，不做内容判断。

---

## 6. 推荐开发顺序

| Sprint    | 内容                                     |
| --------- | ---------------------------------------- |
| Sprint 1  | 阶段 0 + 阶段 1                          |
| Sprint 2  | 阶段 2 + 阶段 3                          |
| Sprint 3  | 阶段 4                                   |
| Sprint 4  | 阶段 5 + 阶段 6                          |
| Sprint 5  | 阶段 7（可追溯契约已完成；端到端 UI/运行时 guidance 可继续增强） |
| Sprint 6  | 阶段 8（reviewer-only 契约与显式 Feedback/Journaling 接入已完成；不自动 spawn） |
| Sprint 7+ | 阶段 9 已完成最小契约；Federation 另开 Future Work Epic |

### 首个最小 PR

- 新增 `AgentObservation` / `PerceptionEvidence` / `DecisionRationale` 类型。
- 新增 `ConfidenceLevel` / `RiskLevel`。
- 新增 Fixture A / B JSON 样例。
- 新增基础 Journal event 类型。
- 新增 recorder 的纯函数/接口骨架。
- 不改 prompt、不接工具、不接 Subagent。

### 第二个 PR

- Prompt / Skill 接入 Agent-first 规则。
- Golden snapshot 更新。
- 基础测试：多模态任务 prompt 包含 observation/rationale 要求。

### 第三个 PR

- FeedbackSignal / FeedbackDecision 引用 observation/rationale。
- `toolEvidenceMode` 策略。
- low confidence guidance。

---

## 7. 回退策略与 AblationToggle

### 7.1 单一 kill switch

```typescript
agentFirst: boolean;
```

`agentFirst=false` 时：

- 不要求 observation / rationale。
- Feedback 不强制引用 rationale。
- QualityReview 回到 legacy report 行为。
- Tool evidence wrapper 仅记录 debug，不参与 policy。

### 7.2 分项开关

| Toggle                             | 作用                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `agentFirst.observation`           | 启用 observation/rationale Journal event。                  |
| `agentFirst.toolEvidence`          | 启用 evidence wrapper 与 tool evidence policy。             |
| `agentFirst.recoveryGuidance`      | 启用 Skill prompt-chain / feedback recovery guidance 注入；关闭时清空并跳过 pending guidance，不启用 pipeline DSL。 |
| `agentFirst.confidencePolicy`      | 控制 confidence 下调与 unknown 兼容策略。                   |

---

## 8. 风险控制

| 风险              | 控制策略                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Token 成本失控    | 保留主 Agent 快路径；长媒体才考虑 Subagent。                                                                 |
| 过度工具化        | 工具只作为 evidence，不直接触发操作；`toolEvidenceMode` 只发 guidance，不直接调工具。                        |
| 过度代理化        | Subagent 默认关闭/可选，不接管主感知。                                                                       |
| ControlPlane 膨胀 | 只做流程，不做内容判断。                                                                                     |
| 迁移破坏          | 所有新能力 optional 注入，旧路径保留。                                                                       |
| 测试脆弱          | 先测结构与引用，不测模型语义。                                                                               |
| 过渡期半旧并存    | 每个 Sprint 后运行 Journal 完整性扫描；孤儿 observation / evidence 标记为 `expired`，不进入 FeedbackPolicy。 |

---

## 9. 最终落点

- 主 Agent 能独立完成多模态理解和操作理由记录。
- 工具、QualityReview、Subagent 都能补 evidence。
- 恢复建议必须引用 Agent rationale；不新增 PipelineAction / partialRerun 功能。
- ControlPlane 只控制流程。
- Federation 明确延后，不阻塞当前开发。

---

## 10. 变更历史

| 日期       | 变更                                                                                                                                                                                                | 作者  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2026-04-26 | 初版：汇总 Agent-first perception、ControlPlane、Subagent boundary、Federation Future Work 后的统一开发方案                                                                                         | Codex |
| 2026-04-26 | Review ADJUST 修订：补齐 ConfidenceLevel、toolEvidenceMode、RiskLevel、Capability/Memory/Provider/Skill ADR 对齐、fixtures、可测验收、回退策略与迁移治理；调整 QualityReview 与 PerceptionTool 顺序 | Codex |
