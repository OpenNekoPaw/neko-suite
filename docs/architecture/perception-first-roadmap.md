# Agent-First 多模态感知闭环路线图

**状态**: Strategy Revised / Agent-First
**日期**: 2026-04-20（2026-04-26 现状核对；Agent-first 策略修订）
**决策者**: Neko Suite Architecture Team
**关联范围**: neko-agent · neko-engine · neko-story · neko-canvas · neko-cut · neko-puppet · neko-model
**关联文档**:
- [agent-unified-workflow.md](./agent-unified-workflow.md) - IDC 工作流、分层术语与约束平面
- [agent-media-architecture.md](./agent-media-architecture.md) - GeneratedAsset 协议
- [neko-agent-media-requirements-fit.md](./neko-agent-media-requirements-fit.md) - AgentCapabilityProvider
- [creative-consistency.md](./creative-consistency.md) - Reference Chain / QualityGate
- [model-runtime.md](./model-runtime.md) - Engine ML 推理策略

---

## 术语对齐（与双流架构一致）

本文所有术语遵循 [agent-unified-workflow.md](./agent-unified-workflow.md) 的权威术语表：

- **创作流（外环）**：Orchestration → Proposal → Review → Execution → Status
- **执行流（内环）**：Plan → TODO → Approve → Apply → Step
- **Skill 层**：creation-flow.md / execution-flow.md
- **自愈链条**：5 级（重试 → 降级 → 替代 → Subagent → 用户汇报）

---

## 背景

基于对 Neko Suite 现状的多模态工作流分析（输入 → 感知 → 处理 → 输出），发现架构层存在**三重结构性断裂**：

| 断裂点 | 现状 | 影响 |
|--------|------|------|
| **能力断裂** | `runtime-ml`（CLIP/Whisper/Upscale/Denoise）已有零散入口，CLIP/Whisper 已可经 `models:*` / Agent 工具部分调用，但尚未统一为 PerceptionCapability | Agent 能处理部分感知任务，但缺少统一协议、命名空间、成本元数据与缓存策略 |
| **反馈断裂** | QualityGate 产出 `ConsistencyReport` 但无触发重跑 Operation | Agent 不能基于评估结果自修正 |
| **模态断裂** | 3D/Puppet/Manga Operation 层缺失或不完整 | Agent 只能文件替换，无法精准编辑 |

当前工作流是**单向生成式管道**（text → image → timeline），不是**感知-生成-评估闭环**。这限制了 Agent 从「素材生产者」升级为「创作协同者」。

架构层已按 Operation-centric + GeneratedAsset 文件协议奠基，下一步不是让工具替代 Agent 感知，而是把 **Agent 作为主感知与主决策主体**，并将工具能力协议化为可选增强、校验与证据来源。

### 2026-04-26 现状核对

本路线图的战略方向仍成立，但 Q2 的若干实现假设已与代码现状产生偏移：

- Engine 侧当前主要通过 `models:*` action 暴露 ML 能力，而不是独立 `/perception/*` REST controller。
- `host-api/src/controllers/models.rs` 已覆盖 `clip` 与 `transcribe`；`PerceptionController` / `PerceptionRegistry` 尚未落地。
- `@neko/neko-client` 已有 CLIP similarity 与 Whisper transcription 的扁平方法，但尚未提供 `EngineClient.perception.*` facade。
- `neko-agent` extension 已有音频转写工具和 `QualityCheckConsistency`，但尚未形成 lazy-loaded `PerceptionToolGroup`。
- `GeneratedAsset` 协议与资产索引已存在，可继续作为感知工具输入输出边界。
- `partialRerun` / Q4 Operation 在 `apply-primitive` 相关抽象中已有前置痕迹，但闭环反馈管道仍未完整实现。

因此，后续实现应以 Agent 感知为核心，统一并协议化已有零散工具能力作为可选增强。

### 2026-04-26 Agent-first 策略修订

本路线图从 **Perception-tool-first** 调整为 **Agent-first perception, tools-as-augmentation**：

- Agent 是图片、视频、音频、数据与上下文的默认感知入口和创作判断主体。
- Perception tools 是 Agent 的外置感官，用于增强、验证、加速或补齐高精度证据，不作为主链路硬依赖。
- QualityGate 从“强制判定器”降级为“可调用 reviewer / evidence provider”；除非用户、策略或安全边界明确要求，否则不默认阻塞主链路。
- PipelineAction、partialRerun、修复策略由 Agent 基于 observation / rationale 发起；工具输出只能作为 evidence，不直接决定创作方向或项目状态。
- ControlPlane 只管理预算、审批、重试、升级、Journal 与 stage transition，不判断内容质量。
- Subagent 仍是可选 Recovery Executor，不是感知能力或闭环 MVP 的前置依赖。

---

## 决策

采用 **Agent-First Perception 战略**，按季度分阶段推进四张骨牌：

```
Q2 2026  ─► Agent 感知结构化 + 工具可选增强（看懂）
Q3 2026  ─► Agent 驱动闭环反馈管道（自改正）
Q4 2026  ─► Operation 层横向补齐（精编辑）
2027 Q1  ─► 多模态输出扩展（Manga + 3D Anim）
```

### 核心原则

1. **Agent 主感知**：图片、视频、音频、数据与上下文优先由 Agent 直接理解、归纳和判断。
2. **工具可选增强**：`runtime-ml` 已有的 ONNX 推理能力通过 `AgentCapabilityProvider` 暴露为可选 evidence provider，不替代 Agent 判断。
3. **Operation-centric 不动摇**：所有新增模态能力遵循 [operations/types.ts](../../packages/neko-types/src/operations/types.ts) 的联合类型 + apply/invert 模式。
4. **文件/状态二元协议稳定**：GeneratedAsset 负责二进制媒体，EditOperation 负责项目状态变更，边界不模糊。
5. **闭环由 Agent 驱动**：每季度交付一个 Agent observation → rationale → optional tool evidence → operation → review 的闭环，而非工具强制管道。

---

## Q2 2026: Agent-First Perception Foundation

**目标**：让 Agent 以自身多模态理解为核心「看见、听见、理解」用户素材，并在需要时调用工具补充证据。

### ADR-P0: AgentObservation / DecisionRationale 协议

新增 Agent-first 感知与操作理由协议，作为所有图片、视频、音频、数据理解和后续操作的主记录：

```typescript
interface AgentObservation {
  id: string;
  modality: 'image' | 'video' | 'audio' | 'data' | 'text' | 'mixed';
  summary: string;
  detectedEntities?: string[];
  issues?: string[];
  confidence: 'low' | 'medium' | 'high';
  evidence: PerceptionEvidence[];
}

interface PerceptionEvidence {
  source: 'agent' | 'tool' | 'user' | 'memory' | 'engine';
  toolName?: string;
  summary: string;
  confidence?: number;
  data?: unknown;
}

interface DecisionRationale {
  decision: string;
  reason: string;
  observationIds: string[];
  evidenceIds: string[];
  requiresUserApproval?: boolean;
}
```

约束：

- Agent observation 是主链路 SSOT；工具结果只作为 `PerceptionEvidence` 追加。
- 所有状态修改、PipelineAction、partialRerun 之前必须能追溯到 `DecisionRationale`。
- 低置信度 observation 可建议调用工具或询问用户，但不能由工具自动覆盖 Agent 判断。

### ADR-P1: PerceptionCapabilityProvider 协议

**2026-04-26 状态**：仍需实现，但优先级从“主感知地基”调整为“Agent 可选增强能力”。当前 `AgentCapabilityProvider` 已有工具/Skill/ToolGroup 扩展协议，但缺少专门的 `PerceptionTool` 子类型、模态声明、成本元数据、缓存幂等性声明。

扩展现有 [agent-capability.ts](../../packages/neko-types/src/types/agent-capability.ts)，新增 `PerceptionTool` 子类型，约束：

- **输入模态声明**：`image | audio | video | 3d | text`
- **输出 schema**：结构化 JSON（embedding / label / timestamps / shots）
- **成本元数据**：估算 token 成本、是否需要 GPU、是否可缓存
- **幂等性标注**：同一输入是否可复用上次结果（减少重复推理）

### ADR-P2: 引擎侧能力注册

**2026-04-26 状态**：原设计部分被当前 `models:*` action 路径替代。为降低耦合，不建议 Agent 直接绑定 `models:*` 细节；建议在 client / tool 层增加 Perception facade，内部复用现有 `models:clip`、`models:transcribe` 等能力。该 facade 是 Agent 的可选外置感官，不是主链路硬依赖。

`runtime-ml` 增补 `PerceptionRegistry`，作为 CLIP/Whisper 等模型的统一入口。`host-api` 新增 `PerceptionController`，暴露 REST：

| Endpoint | 模型 | 用途 |
|----------|------|------|
| `POST /perception/image/embed` | CLIP | 图像向量化 |
| `POST /perception/image/classify` | CLIP zero-shot | 图像零样本分类 |
| `POST /perception/image/similarity` | CLIP | 双向相似度 |
| `POST /perception/audio/transcribe` | Whisper | 音频转文字 + 时间戳 |
| `POST /perception/video/shots` | FFmpeg scene | 镜头切分 |

> 注：以上 `/perception/*` endpoint 是原始目标形态。若继续沿用当前 dispatch/action 架构，可等价映射为 `perception:image_embed`、`perception:audio_transcribe` 等 action，或保留 `models:*` 作为内部实现细节。

### ADR-P3: Agent 侧 Tool 注册

**2026-04-26 状态**：部分实现但未统一。音频转写与一致性检查已有工具入口；`TOOL_NAMES` 的 `perception.*` 分类、lazy-loaded `PerceptionToolGroup`、Creation/Execution 双 Skill 提示差异仍未落地。工具注册应表达“可用能力”，不强制 Agent 每轮调用。

- [TOOL_NAMES](../../packages/neko-types/src/types/tool-names.ts) 新增 `perception.*` 分类（~12 工具）
- `neko-agent` 注册 lazy-loaded `PerceptionToolGroup`（参考现有分级加载策略）
- 所有感知工具接受 `GeneratedAsset` 或文件路径输入，保持与媒体管道一致
- **双 Skill 归属**：
  - Creation Skill 暴露感知工具用于 Orchestration/Proposal 阶段（理解用户素材、评估美学）
  - Execution Skill 暴露感知工具用于 Apply/Step 阶段（质量评估、产出验证）
  - 同一工具在两 Skill 下的 system prompt 提示词不同（业务语气 vs 技术语气）

### ADR-P4: EngineClient 方法补齐

**2026-04-26 状态**：部分实现但命名空间不一致。当前 client 已有 CLIP similarity 与 Whisper transcription 的扁平方法；推荐补 `perception` facade，保持外部契约稳定，内部委托既有方法。

`@neko/neko-client` 新增 `perception` 命名空间：
```
EngineClient.perception.embedImage(asset) -> Float32Array
EngineClient.perception.transcribe(asset, options) -> { segments, language }
EngineClient.perception.detectShots(asset) -> Shot[]
EngineClient.perception.classify(asset, labels) -> LabelScore[]
EngineClient.perception.similarity(a, b) -> number
```

### 交付清单

| 模块 | 路径 | 状态 |
|------|------|------|
| Rust PerceptionController | `host-api/src/controllers/perception.rs` | 未实现；当前由 `models:*` action 承载部分能力 |
| Rust PerceptionRegistry | `runtime-ml/src/registry.rs` | 未实现；当前 ML 能力分散在 runtime / models controller |
| TS PerceptionTool 类型 | `@neko/shared/types/agent-capability.ts` | 未实现；需在现有 AgentCapability 协议上扩展 |
| TS EngineClient perception | `@neko/neko-client/src/EngineClient.ts` | 部分实现；已有扁平 CLIP/Whisper 方法，缺 `perception` facade |
| TS PerceptionToolGroup | `neko-agent/.../perceptionToolGroup.ts` | 部分实现；已有音频转写/一致性检查工具，缺统一分组与双 Skill 注册 |

### 验收

- Agent 可响应「这张参考图里的角色是什么发色？」→ 调用 `perception.image.classify`
- 单元测试覆盖 5 个核心工具
- Token 成本：感知工具 schema resident 层 ≤ 1.5K token

### Q2 修订后落地顺序

1. **Agent 契约层**：新增 `AgentObservation` / `DecisionRationale`，把 Agent 对图片、视频、音频、数据的理解和操作理由结构化。
2. **工具契约层**：在 `agent-capability.ts` 增加 `PerceptionTool` 元数据，不改变现有 Tool 执行接口。
3. **Client 层**：补 `EngineClient.perception` facade，内部委托现有 `clip` / `transcribe`，避免上层耦合 `models:*`。
4. **Tool 层**：把现有音频转写、一致性检查与后续图像分类工具收敛到 `PerceptionToolGroup`，作为 Agent 可选 evidence provider。
5. **Engine 层**：短期保留 `models:*`；仅当 HTTP / REST 直连成为硬需求时再新增 `PerceptionController`。

---

## Q3 2026: Closed-Loop Feedback Pipeline

**目标**：Agent 从自身 observation / rationale 出发触发闭环修正；QualityGate 作为可调用 reviewer / evidence provider 参与执行流自愈链条，而不是替代 Agent 判断。

### 与双流架构的集成

Q3 闭环反馈不是独立的"重试机制"，而是**Agent 驱动的执行流自愈链条**在创作语境下的落地：

```
Agent 判断需修正 / Step 失败 / 质量不达标
    │
    ├─► 自愈级别 1-3（Execution Skill 内尝试）
    │      重试 / 降级 / 替代模型
    │
    ├─► 自愈级别 4（本季度新建）
    │      派发 Recovery Subagent
    │      使用 AgentObservation 定位问题，必要时调用 Perception 工具补充证据
    │      基于 DecisionRationale 产出 PipelineAction
    │      触发 partialRerun
    │
    └─► 自愈级别 5（所有手段失败）
           上报 Status → Creation Skill
           附完整诊断 + 建议方案
```

### ADR-C1: AgentObservation / ConsistencyReport → Action 分派

扩展 Agent observation 与可选 QualityGate report 的合流协议：`DecisionRationale` 可引用 `ConsistencyReport`，并由 Agent 产出 `suggestedActions: PipelineAction[]`：

```typescript
type PipelineAction =
  | { type: 'regenerate'; shotId: string; hints: GenerationHint[] }
  | { type: 'adjust-prompt'; shotId: string; promptDiff: string }
  | { type: 'replace-reference'; shotId: string; newRef: GeneratedAsset }
  | { type: 'accept'; shotId: string }
  | { type: 'defer-human'; shotId: string; reason: string };
```

**归属**：`PipelineAction` 是**执行流内环**的自愈动作候选集，由 Agent / Execution Skill 消费。QualityGate 和 Perception 工具只能提供 evidence；最终动作必须能追溯到 Agent 的 `DecisionRationale`。若所有 PipelineAction 均失败（如连续 `regenerate` 仍不达标），则升级为 `defer-human` → 上报创作流 Status。

### ADR-C2: 增量重跑 Stage（partialRerun）

Pipeline 新增 `partialRerun` stage（执行流内环 Apply 的子类型）：
- 入参 `PipelineAction[]`
- 配置 `targetShots?: string[]`，只对指定镜头重走 `generatePrompts → batchGenerate`
- 复用 Reference Chain（Phase 5.4）保证一致性
- **审批路径**：走执行流审批策略包（execution pack）
  - 微修正（单 shot 重跑）→ 自动通过
  - 中修正（多 shot 或变 prompt）→ AskMode 询问，AutoMode 自动
  - 宏修正（改 Scheme 结构）→ 回退创作流（Review pack）

### ADR-C3: Agent-Augmented Quality Review

Quality review 由 Agent 先形成 `AgentObservation` 和 `DecisionRationale`；QualityGate 可按需调用 Q2 的 `perception.image.similarity` / `clip.classify` 产出**量化证据**，用于补强或挑战 Agent 判断。阈值由 `ProjectConfig.qualityThresholds` 驱动，不再硬编码，但阈值命中默认只生成 evidence / recommendation，不直接替代 Agent 发起项目状态修改。

**事件命名**（对齐双流事件分流）：
- `execution.quality.evaluated` — 质检完成，内环事件
- `execution.autoheal.triggered` — 触发自愈，内环事件
- `execution.autoheal.succeeded` — 自愈成功，内环事件
- `creation.status.degraded` — 仅在级别 5 升级时触发，外环事件

### ADR-C4: Creative Iteration Loop Skill

新增 Skill `creative-iteration-loop`（归属 Execution Skill 的自愈扩展）：
- 注入的 ToolSet：perception + partialRerun + quality-report-reader
- System prompt 模板：「评估→定位问题→选择最小修正动作」
- 通过 SkillInjectionCoordinator 4-track 原子管理
- **与 execution-flow Skill 关系**：作为执行流 Skill 的**子技能**，在自愈级别 4 激活；不直接面向用户

### ADR-C5: Recovery Subagent

新增 `RecoverySubagent`（自愈级别 4 的载体）：
- 独立上下文（避免污染主会话）
- 工具集：perception + quality-report-reader + diagnostic
- 产出结构化 PipelineAction[] 回流主 Agent
- 若 Subagent 亦无解，返回 `defer-human` 附诊断上下文

### 交付清单

| 模块 | 路径 | 目的 | 归属 |
|------|------|------|------|
| Quality Review 重构 | `neko-agent/.../qualityGate.ts` | 产出 evidence / recommendations，供 Agent rationale 引用 | 执行流 |
| partialRerun stage | `neko-agent/.../stages/partialRerun.ts` | 增量重跑 | 执行流 |
| Iteration Skill | `neko-agent/.../skills/creative-iteration-loop/` | 自愈级别 4 Skill | 执行流扩展 |
| PipelineAction 类型 | `@neko/shared/types/pipeline-action.ts` | SSOT | L1 原语 |
| RecoverySubagent | `neko-agent/.../subagents/recovery/` | 自愈级别 4 载体 | 执行流 |
| Execution Pack 扩展 | `neko-agent/.../approval/packs/execution.pack.ts` | partialRerun 审批 | 审批引擎 |

### 验收

- 端到端测试：输入 5 shots，故意让 shot 3 低一致性 → Agent 形成 observation / rationale → 可选 QualityGate 补充 evidence → 仅重跑 shot 3 → Agent review 通过
- **关键指标**：
  - 闭环自修正通过率 ≥ 70%
  - 增量重跑耗时 / 全量重跑 ≤ 30%
  - 自愈级别 1-4 解决比例 ≥ 80%（符合双流架构自愈目标）
  - 升级到创作流 Status 的频率 ≤ 5%

---

## Q4 2026: Operation Layer Horizontal Coverage

**目标**：所有已有模态（Puppet / Model）可被 Agent 精准编辑。

### ADR-O1: PuppetOperation 完整化

补齐面部参数时间线 Operation：
- `puppet.param.add/remove/update/interpolate`（面部 32 参数 + inox2d 动态参数）
- `puppet.bone.transform.update`（骨骼 FK/IK 关键帧）
- `puppet.layer.add/remove/visibility`（inox2d 图层）

同步 `applyPuppetOperation` + `invertPuppetOperation`，位置 [operations/](../../packages/neko-types/src/operations/)。

### ADR-O2: ModelOperation 新增（3D 域）

3D 动画编辑 Operation：
- `model.ikKeyframe.add/remove/update`（FABRIK/CCD/TwoBone 关键帧）
- `model.animation.blend.update` / `model.animation.crossfade.update`
- `model.morphTarget.weight.update`（blend shape / 面部 22 参数）
- `model.bone.transform.update`

复用 bevy_ecs runtime-scene 状态模型，Operation 作用于 ECS 组件。

### ADR-O3: 双向导出能力

- `neko-model` 补齐 glTF/VRM 导出路径（目前只读）
- `neko-puppet` 导出 `.nkp` + 可选 inox2d `.psd` 回写
- 导出触发 `GeneratedAsset` 产出 → 可回流 Agent 上下文

### ADR-O4: Agent Capability 注册

按 [neko-agent-media-requirements-fit.md](./neko-agent-media-requirements-fit.md) 的混合发现模式，Puppet/Model 子包注册 `AgentCapabilityProvider`。TOOL_NAMES 新增 ~20 工具。

### ADR-O5: Operation 与双流架构的集成

Puppet/Model Operation **归属执行流内环**，通过以下方式接入：

- **Apply 入口**：Operation 执行走 Apply 原语（commit 动作），带成本预估 + 审计日志
- **Step 反馈**：每个 Operation 执行产生 Step 记录，聚合为 Status 回流创作流
- **双 Skill 可见性**：
  - Execution Skill 可直接调用 Operation（执行动作）
  - Creation Skill 可查询 Operation 元信息（成本、能力）用于 Proposal 设计
- **审批策略**：
  - 单个 Operation：execution pack 自动审批（低风险）
  - BatchOperation：execution pack AskMode 询问（中风险）
  - 破坏性 Operation（如 `puppet.layer.remove`）：强制审批

### 交付清单

| 模块 | 操作数 | 主要场景 |
|------|--------|----------|
| PuppetOperation | ~12 种 | 面部动画、骨骼关键帧、图层 |
| ModelOperation | ~15 种 | IK 关键帧、动画混合、形变 |
| Export 适配器 | 2 类 | glTF / nkp+psd |
| Agent 工具 | ~20 | 精准编辑入口 |

### 验收

- Agent 可响应「让角色在 0:03 处眨眼并挥手」→ 产出 `BatchOperation(puppet.param.add + puppet.bone.transform.update)`
- 每个 Operation 具备 invert，undo/redo 测试 100% 覆盖
- 导出 glTF 可被 Blender/Unity 正确读取

---

## 2027 Q1: Multimodal Output Extension

**目标**：补齐 Manga / 3D 动画生成等新模态。

### ADR-M1: neko-comic 新包（漫画）

- Layer 0: `@neko-comic/types` - Panel/Balloon/ReadingOrder schema
- 扩展 `neko-canvas` 或新建 `neko-comic` 扩展，复用 Canvas Operation 基础设施
- 新 Operation 类型：
  - `comic.panel.{add/remove/resize/reorder}`
  - `comic.balloon.{add/update/tail}`
  - `comic.readingFlow.update`
- 导出：CBZ、PDF、连续图像
- Story 管道新增 `arrangeOnComic` stage（与 `arrangeOnTimeline` 并列）

### ADR-M2: Motion Generation Pipeline

基于 Q4 ModelOperation，新增 `generateMotion` stage：
- 输入：文本描述 / 参考视频（Q2 perception 抽运动）
- 输出：IK 关键帧序列 → `BatchOperation`
- 路由策略（[model-runtime.md](./model-runtime.md)）：优先 MCP-Blender，fallback 本地简单合成

### ADR-M3: flowC 新管道

Story→Comic 管道 `flowC`：
```
parseStoryboard → generatePanelLayout → generateBalloon → arrangeOnComic
```
复用 Q2 AgentObservation 做画风判断；必要时调用 Perception 工具补充一致性证据。

**双流映射**：
- 创作流视角：用户看到"Orchestration → Proposal (Comic 方案) → Review → Execution → Status"
- 执行流视角：flowC 展开为 TODO 列表，经 Approve → Apply → Step 执行
- Creation Skill 主导 flowC 选择与 Proposal 编辑
- Execution Skill 主导 Apply 后的实际生成与错误自愈

### 验收

- 输入剧本 → 产出 8 页漫画（PDF）
- 输入文本「走路」→ 产出 3D 角色行走 IK 关键帧序列
- flowC 端到端成功率 ≥ 80%

---

## 与双流架构的季度集成

每季度交付物在双流架构下的具体落点：

| 季度 | 新增能力 | 归属层 | 对创作流影响 | 对执行流影响 |
|------|---------|------|------------|------------|
| Q2 | AgentObservation + Perception 工具（可选）| L2/L3 感知与微能力 | Agent 形成 Proposal observation，工具可补充 evidence | Agent 形成 Apply rationale，工具可补充验证 evidence |
| Q3 | partialRerun + PipelineAction | L1 执行流原语 + L3 stage | Status 新增"自修正中"状态 | Agent rationale 驱动自愈；Approval Engine 执行策略包扩展 |
| Q3 | RecoverySubagent | L2 模式层扩展 | 对用户透明（自愈成功不惊扰）| 主 Agent 派发子任务 |
| Q4 | PuppetOperation + ModelOperation | L3 中能力 | Proposal 可引用 Operation 作为创作"动作" | Apply 执行 Operation，Step 记录结果 |
| 2027 Q1 | neko-comic + flowC | L3 宏能力 + L2 模式 | Creation Skill 支持选择 comic Workflow | Execution Skill 新增 comic 生成 TODO |
| 2027 Q1 | Motion Generation | L3 中能力 | Proposal 可描述动作意图 | Apply IK 关键帧序列，Step 反馈动画帧 |

**关键原则**：
- 新能力**先在 L3 注册**，再被双 Skill 引用
- 不直接修改 L1/L2，除非 Q3 的 PipelineAction/Subagent 机制这种基础扩展
- 任何新工具都必须声明所属 Skill（Creation/Execution/Both）

---

## 否决的替代方案

| 方案 | 否决原因 |
|------|----------|
| **A. 先补 Operation 层（Q4 前置到 Q2）** | Operation 补齐本身收益有限；没有 perception，Agent 不知道「要编辑什么」，会沦为手动操作转发器 |
| **B. 先建 Manga（单模态纵深）** | 新模态无复用引擎能力，ROI 低；不解决现有模态的闭环缺失 |
| **C. Story 管道多模态深化（TTS + 图回灌）** | 主链路深化但不解决结构性断裂；perception 缺席下即便加 TTS 也是盲飞 |
| **D. 全量并行四个方向** | 团队规模不匹配；易形成「全部开始、全部半成品」 |

---

## 后果

### 正面

- **Agent 从「素材生产者」升级为「创作协同者」**：看得见、能反馈、能精修
- **架构一致性增强**：Operation + GeneratedAsset 二元协议贯穿所有模态
- **引擎投资兑现**：`runtime-ml` 已有能力对 Agent 可见
- **每季度可独立发布**：每阶段都是闭环增值，非「集齐龙珠」式依赖

### 负面

- **短期无新模态**：Manga 和 3D 动画要等到 2027 Q1，用户感知层面「慢」
- **Token 成本上升**：Perception 工具 schema + Action 反馈增加每 turn 开销（Q2 约束 ≤ 1.5K resident）
- **测试复杂度激增**：闭环 pipeline 的端到端测试矩阵大，需 CI 算力投入

### 中性

- `runtime-ml` 需从「按需加载」升级为「常驻推理服务」（影响 engine 启动时间）
- Skill 系统将新增一组「闭环类」Skill，需要 SkillRegistry 分类扩展

---

## 指标门槛

| 季度 | 北极星指标 | 阈值 |
|------|-----------|------|
| Q2 | Perception 工具调用成功率 | ≥ 95% |
| Q2 | Perception resident token | ≤ 1.5K |
| Q3 | Agent 闭环自修正通过率 | ≥ 70% |
| Q3 | 增量重跑时间 / 全量重跑时间 | ≤ 30% |
| Q4 | Puppet+Model 编辑动作 Operation 化覆盖率 | ≥ 90% |
| Q4 | Undo/Redo 测试覆盖 | 100% operation types |
| 2027 Q1 | flowC 端到端成功率 | ≥ 80% |

---

## 依赖与风险

### 外部依赖

- **ONNX Runtime** 稳定性（CLIP/Whisper 推理性能）
- **bevy_ecs 0.15** API 稳定性（ModelOperation 依赖 ECS 组件访问）
- **Blender MCP Server** 就绪度（2027 Q1 Motion generation 备选路径）

### 内部依赖链

```
Q2 Perception ──► Q3 闭环 ──► Q4 Operation 扩展
      │                             │
      └──────────► 2027 Q1 Manga/Motion ◄────┘
```

**关键路径**：Q2 必须完成 Agent observation / rationale 结构化与工具能力协议化，否则 Q3 闭环只能依赖隐式 prompt 判断或零散工具，难以形成可审计、可回放的质量反馈基础。

### 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| ONNX 推理在 Apple Silicon 性能不足 | 中 | 高 | 预留 fallback 到远程推理服务 |
| Operation 类型爆炸（Q4 ~35 新操作）apply 分支难维护 | 中 | 中 | 引入代码生成（proto-driven dispatch） |
| Agent 闭环陷入死循环（反复修正同一 shot） | 中 | 高 | iteration budget + 人工介入 gate |
| 新 Skill 膨胀 system prompt | 低 | 中 | 强制走 lazy-loading，监控 token baseline |

---

## 后续动作

1. **本周**：确认 Agent-first 策略边界：Agent 是主感知与主决策主体，工具是可选 evidence provider。
2. **2 周内**：拆分 Q2 收敛 Epic（`AgentObservation` / `DecisionRationale` / `PerceptionTool` 元数据 / `EngineClient.perception` facade / `PerceptionToolGroup`）。
3. **4 周内**：完成 Agent observation 记录、`perception.audio.transcribe` facade 化与一个图像工具 evidence MVP，端到端验证 Creation / Execution 双 Skill 注册。
4. **Q3 前**：为 `AgentObservation → DecisionRationale → PipelineAction → partialRerun` 补齐最小闭环契约，避免 QualityGate 或工具输出直接替代 Agent 判断。

---

## 变更历史

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-04-20 | 初版 Proposed | Architecture Team |
| 2026-04-20 | 对齐双流探索：新增术语对齐小节、双 Skill 归属、自愈链条集成、Q3 ADR-C5（RecoverySubagent）、Q4 ADR-O5（Operation 双流集成）、季度集成矩阵；现由 [agent-unified-workflow.md](./agent-unified-workflow.md) 收口 | Architecture Team |
| 2026-04-26 | 现状核对：标记路线图为 Partially Adopted / Needs Refresh；补充 `models:*` 与原 `/perception/*` 方案的偏移、Q2 交付状态、修订后落地顺序与后续动作 | Codex |
| 2026-04-26 | 策略修订：从 Perception-tool-first 调整为 Agent-first perception；新增 AgentObservation / DecisionRationale，明确工具作为可选增强与 evidence provider，不替代 Agent 判断 | Codex |
