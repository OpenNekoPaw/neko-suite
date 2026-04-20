# Perception-First 多模态闭环路线图

**状态**: Proposed
**日期**: 2026-04-20
**决策者**: Neko Suite Architecture Team
**关联范围**: neko-agent · neko-engine · neko-story · neko-canvas · neko-cut · neko-puppet · neko-model
**关联文档**:
- [dual-flow-architecture.md](./dual-flow-architecture.md) - 双流架构（创作流 + 执行流）术语规范与分层
- [agent-media-architecture.md](./agent-media-architecture.md) - GeneratedAsset 协议
- [neko-agent-media-requirements-fit.md](./neko-agent-media-requirements-fit.md) - AgentCapabilityProvider
- [creative-consistency.md](./creative-consistency.md) - Reference Chain / QualityGate
- [model-runtime.md](./model-runtime.md) - Engine ML 推理策略

---

## 术语对齐（与双流架构一致）

本文所有术语遵循 [dual-flow-architecture.md](./dual-flow-architecture.md) 的权威术语表：

- **创作流（外环）**：Orchestration → Proposal → Review → Execution → Status
- **执行流（内环）**：Plan → TODO → Approve → Apply → Step
- **Skill 层**：creation-flow.md / execution-flow.md
- **自愈链条**：5 级（重试 → 降级 → 替代 → Subagent → 用户汇报）

---

## 背景

基于对 Neko Suite 现状的多模态工作流分析（输入 → 感知 → 处理 → 输出），发现架构层存在**三重结构性断裂**：

| 断裂点 | 现状 | 影响 |
|--------|------|------|
| **能力断裂** | `runtime-ml`（CLIP/Whisper/Upscale/Denoise）就位但未注册为 AgentCapability | Agent 无法「看懂」用户素材 |
| **反馈断裂** | QualityGate 产出 `ConsistencyReport` 但无触发重跑 Operation | Agent 不能基于评估结果自修正 |
| **模态断裂** | 3D/Puppet/Manga Operation 层缺失或不完整 | Agent 只能文件替换，无法精准编辑 |

当前工作流是**单向生成式管道**（text → image → timeline），不是**感知-生成-评估闭环**。这限制了 Agent 从「素材生产者」升级为「创作协同者」。

架构层已按 Operation-centric + GeneratedAsset 文件协议奠基，**Perception 维度完全缺席**是打通闭环的第一张多米诺骨牌。

---

## 决策

采用 **Perception-First 战略**，按季度分阶段推进四张骨牌：

```
Q2 2026  ─► Perception 能力工具化（看懂）
Q3 2026  ─► 闭环反馈管道（自改正）
Q4 2026  ─► Operation 层横向补齐（精编辑）
2027 Q1  ─► 多模态输出扩展（Manga + 3D Anim）
```

### 核心原则

1. **引擎能力优先复用**：`runtime-ml` 已有的 ONNX 推理能力通过 `AgentCapabilityProvider` 暴露，不新建感知引擎
2. **Operation-centric 不动摇**：所有新增模态能力遵循 [operations/types.ts](../../packages/neko-types/src/operations/types.ts) 的联合类型 + apply/invert 模式
3. **文件/状态二元协议稳定**：GeneratedAsset 负责二进制媒体，EditOperation 负责项目状态变更，边界不模糊
4. **闭环而非规模**：每季度交付一个完整的感知→生成→评估→修正回路，而非并行铺开多个模态

---

## Q2 2026: Perception Capability Exposure

**目标**：让 Agent「看见、听见、理解」用户素材。

### ADR-P1: PerceptionCapabilityProvider 协议

扩展现有 [agent-capability.ts](../../packages/neko-types/src/types/agent-capability.ts)，新增 `PerceptionTool` 子类型，约束：

- **输入模态声明**：`image | audio | video | 3d | text`
- **输出 schema**：结构化 JSON（embedding / label / timestamps / shots）
- **成本元数据**：估算 token 成本、是否需要 GPU、是否可缓存
- **幂等性标注**：同一输入是否可复用上次结果（减少重复推理）

### ADR-P2: 引擎侧能力注册

`runtime-ml` 增补 `PerceptionRegistry`，作为 CLIP/Whisper 等模型的统一入口。`host-api` 新增 `PerceptionController`，暴露 REST：

| Endpoint | 模型 | 用途 |
|----------|------|------|
| `POST /perception/image/embed` | CLIP | 图像向量化 |
| `POST /perception/image/classify` | CLIP zero-shot | 图像零样本分类 |
| `POST /perception/image/similarity` | CLIP | 双向相似度 |
| `POST /perception/audio/transcribe` | Whisper | 音频转文字 + 时间戳 |
| `POST /perception/video/shots` | FFmpeg scene | 镜头切分 |

### ADR-P3: Agent 侧 Tool 注册

- [TOOL_NAMES](../../packages/neko-types/src/types/tool-names.ts) 新增 `perception.*` 分类（~12 工具）
- `neko-agent` 注册 lazy-loaded `PerceptionToolGroup`（参考现有分级加载策略）
- 所有感知工具接受 `GeneratedAsset` 或文件路径输入，保持与媒体管道一致
- **双 Skill 归属**：
  - Creation Skill 暴露感知工具用于 Orchestration/Proposal 阶段（理解用户素材、评估美学）
  - Execution Skill 暴露感知工具用于 Apply/Step 阶段（质量评估、产出验证）
  - 同一工具在两 Skill 下的 system prompt 提示词不同（业务语气 vs 技术语气）

### ADR-P4: EngineClient 方法补齐

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
| Rust PerceptionController | `host-api/src/controllers/perception.rs` | 新增 |
| Rust PerceptionRegistry | `runtime-ml/src/registry.rs` | 扩充 |
| TS PerceptionTool 类型 | `@neko/shared/types/agent-capability.ts` | 扩展 |
| TS EngineClient perception | `@neko/neko-client/src/EngineClient.ts` | 新增 |
| TS PerceptionToolGroup | `neko-agent/.../perceptionToolGroup.ts` | 新增 |

### 验收

- Agent 可响应「这张参考图里的角色是什么发色？」→ 调用 `perception.image.classify`
- 单元测试覆盖 5 个核心工具
- Token 成本：感知工具 schema resident 层 ≤ 1.5K token

---

## Q3 2026: Closed-Loop Feedback Pipeline

**目标**：QualityGate 从终点变触发器，闭环修正作为**执行流自愈链条第 4 级**的具体形态。

### 与双流架构的集成

Q3 闭环反馈不是独立的"重试机制"，而是**执行流自愈链条**在创作语境下的落地：

```
Step 失败 / 质量不达标
    │
    ├─► 自愈级别 1-3（Execution Skill 内尝试）
    │      重试 / 降级 / 替代模型
    │
    ├─► 自愈级别 4（本季度新建）
    │      派发 Recovery Subagent
    │      使用 Perception 工具定位问题
    │      产出 PipelineAction
    │      触发 partialRerun
    │
    └─► 自愈级别 5（所有手段失败）
           上报 Status → Creation Skill
           附完整诊断 + 建议方案
```

### ADR-C1: ConsistencyReport → Action 分派

扩展 QualityGate stage 输出，`ConsistencyReport` 新增 `suggestedActions: PipelineAction[]`：

```typescript
type PipelineAction =
  | { type: 'regenerate'; shotId: string; hints: GenerationHint[] }
  | { type: 'adjust-prompt'; shotId: string; promptDiff: string }
  | { type: 'replace-reference'; shotId: string; newRef: GeneratedAsset }
  | { type: 'accept'; shotId: string }
  | { type: 'defer-human'; shotId: string; reason: string };
```

**归属**：`PipelineAction` 是**执行流内环**的自愈动作候选集，由 Execution Skill 消费。若所有 PipelineAction 均失败（如连续 `regenerate` 仍不达标），则升级为 `defer-human` → 上报创作流 Status。

### ADR-C2: 增量重跑 Stage（partialRerun）

Pipeline 新增 `partialRerun` stage（执行流内环 Apply 的子类型）：
- 入参 `PipelineAction[]`
- 配置 `targetShots?: string[]`，只对指定镜头重走 `generatePrompts → batchGenerate`
- 复用 Reference Chain（Phase 5.4）保证一致性
- **审批路径**：走执行流审批策略包（execution pack）
  - 微修正（单 shot 重跑）→ 自动通过
  - 中修正（多 shot 或变 prompt）→ AskMode 询问，AutoMode 自动
  - 宏修正（改 Scheme 结构）→ 回退创作流（Review pack）

### ADR-C3: Perception-Augmented QualityGate

QualityGate 内部调用 Q2 的 `perception.image.similarity` / `clip.classify` 产出**量化指标**（替代现有的启发式评分）。阈值由 `ProjectConfig.qualityThresholds` 驱动，不再硬编码。

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
| QualityGate 重构 | `neko-agent/.../qualityGate.ts` | 产出 suggestedActions | 执行流 |
| partialRerun stage | `neko-agent/.../stages/partialRerun.ts` | 增量重跑 | 执行流 |
| Iteration Skill | `neko-agent/.../skills/creative-iteration-loop/` | 自愈级别 4 Skill | 执行流扩展 |
| PipelineAction 类型 | `@neko/shared/types/pipeline-action.ts` | SSOT | L1 原语 |
| RecoverySubagent | `neko-agent/.../subagents/recovery/` | 自愈级别 4 载体 | 执行流 |
| Execution Pack 扩展 | `neko-agent/.../approval/packs/execution.pack.ts` | partialRerun 审批 | 审批引擎 |

### 验收

- 端到端测试：输入 5 shots，故意让 shot 3 低一致性 → Agent 自动识别 → 仅重跑 shot 3 → 二次 QualityGate 通过
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
复用 Q2 Perception 做画风一致性检查。

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
| Q2 | Perception 工具（~12 个）| L3 微能力 | 注册到 Creation Skill，用于 Proposal 评估 | 注册到 Execution Skill，用于 Step 验证 |
| Q3 | partialRerun + PipelineAction | L1 执行流原语 + L3 stage | Status 新增"自修正中"状态 | 自愈级别 4 载体；Approval Engine 执行策略包扩展 |
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

**关键路径**：Q2 必须按时交付，否则 Q3 闭环无量化基础。

### 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| ONNX 推理在 Apple Silicon 性能不足 | 中 | 高 | 预留 fallback 到远程推理服务 |
| Operation 类型爆炸（Q4 ~35 新操作）apply 分支难维护 | 中 | 中 | 引入代码生成（proto-driven dispatch） |
| Agent 闭环陷入死循环（反复修正同一 shot） | 中 | 高 | iteration budget + 人工介入 gate |
| 新 Skill 膨胀 system prompt | 低 | 中 | 强制走 lazy-loading，监控 token baseline |

---

## 后续动作

1. **本周**：本 ADR 评审 + 合入 `docs/architecture/`
2. **2 周内**：Q2 任务拆分为 Epic（PerceptionController / AgentTool / EngineClient 扩展）
3. **4 周内**：完成 `perception.image.embed` + `perception.audio.transcribe` 两个 MVP 工具，端到端验证架构

---

## 变更历史

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-04-20 | 初版 Proposed | Architecture Team |
| 2026-04-20 | 对齐 [dual-flow-architecture.md](./dual-flow-architecture.md)：新增术语对齐小节、双 Skill 归属、自愈链条集成、Q3 ADR-C5（RecoverySubagent）、Q4 ADR-O5（Operation 双流集成）、季度集成矩阵 | Architecture Team |
