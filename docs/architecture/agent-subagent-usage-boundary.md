# Subagent 使用边界分析

> **状态**: Analysis (2026-04-26)
> **类型**: 架构判断 / 设计原则
> **关联 ADR**:
> - [agent-multi-agent-federation.md](./agent-multi-agent-federation.md) (Proposed)
> - [agent-media-architecture.md](./agent-media-architecture.md)
> - [adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md)
> - [agent-unified-workflow.md](./agent-unified-workflow.md)

## 摘要

本文档回答两个相关问题:

1. **多模态内容读取**是否需要 subagent?
2. **生成类工具调用**是否需要 subagent?

核心结论统一为一条**使用边界原则**:

> **Subagent 是上下文隔离器,不是异步执行器,也不是并发控制器。** 只有当工作满足"多轮 LLM 推理 + 主 agent 不必直接参与"两个条件时,subagent 才有架构价值。否则增加的 ReAct token 开销和序列化成本会压倒收益。

---

## 一、核心原则

### 1.1 Subagent 的真正价值

| 维度 | Subagent **是** | Subagent **不是** |
|------|----------------|------------------|
| 上下文 | 隔离主 agent 上下文,避免 vision/长内容污染 | 后台 worker (后台任务由 TaskManager / Provider 层负责) |
| 推理 | 多轮 LLM 工作的容器 | 单次工具调用的包装器 |
| 并发 | 不同上下文的并行推理 | 单工具的并发调度 (Provider/Executor 层负责) |
| 决策 | 把"摘要"还给主 agent | 替主 agent 做最终决策 |

### 1.2 工作类型四分

任何 agent 工作都可以按下面两个维度归类:

```
                主 agent 是否需要"亲眼"看 / 全程参与决策?
                     ┌──────────┬──────────┐
                     │ 是       │ 否       │
        ┌─────────┬──┼──────────┼──────────┤
  上下  │ 大      │  │ 直调主   │ ★ Sub-   │
  文压  │ (多轮   │  │ agent +  │   agent  │
  力?  │  vision │  │ 限轮数   │   隔离   │
        │  /大体  │  │          │          │
        │  量)    │  │          │          │
        ├─────────┼──┼──────────┼──────────┤
        │ 小      │  │ 直调主   │ 直调主   │
        │ (单次/  │  │ agent    │ agent    │
        │  无评估)│  │          │          │
        └─────────┴──┴──────────┴──────────┘
```

只有右上角 (大压力 + 不必直看) 是 subagent 的领地。

---

## 二、多模态内容读取

### 2.1 拆开两层

不能把"读取多模态内容"作为单一概念讨论,必须拆开:

| 层面 | 性质 | 运行位置 | 消耗 agent context? |
|------|------|---------|---------------------|
| **A. 预处理** (解码/resize/keyframe/base64) | 纯计算 | Extension 进程 ([mediaPreprocessor.ts](../../packages/neko-agent/packages/extension/src/chat/message/mediaPreprocessor.ts)) | ❌ 否 |
| **B. 消费** (LLM 通过 vision tokens "看"内容) | LLM 推理 | 主 agent 上下文 | ✅ 是 |

### 2.2 对预处理 (A): **不需要 subagent**

理由:
- Subagent 是 LLM 上下文,预处理是纯计算 (Sharp / FFmpeg),用 LLM 调用 FFmpeg 是错配
- 已经在 Extension 进程,不在 agent context 内,不存在污染问题
- 真正的痛点 (串行 keyframe 抽取、无缓存、无 token 预算) 用**异步调度 + 缓存 + token 计费**解决,不是 subagent 能解决的

### 2.3 对消费 (B): **条件性需要 subagent**

当前实现把 base64 图像块直接 inline 到主 agent 的消息数组:

```
4-8 frames × ~258 vision tokens/帧 = 1k-2k vision tokens/视频
+ base64 字符串体积保留在 turn 历史里 (多轮累积放大)
```

**适合 subagent 隔离**:

| 场景 | 主 agent 拿到 |
|------|--------------|
| 长视频逐帧分析 (>30s, >8 frames) | 文本摘要 |
| 批量一致性校验 ([image-validator](../../packages/neko-agent/packages/agent/src/quality/) 类) | pass/fail + 理由 |
| 多视频比较 (各自独立分析) | 每段的描述 |
| OCR / 字幕提取 | 提取后的文本 |

**共同特征**: 主 agent 不需要"亲眼看",只需要文本抽象。

**不适合 subagent**:

| 场景 | 原因 |
|------|------|
| 用户刚上传单图,正在对话讨论 | 主 agent 必须直接感知 |
| 生成任务的参考图 | 上下文小,单次性 |
| 截图驱动下一步决策 (如 UI 自动化) | 视觉→决策回路不能割断 |
| 单截图问答 | 序列化成本压倒收益 |

---

## 三、生成类工具调用

### 3.1 关键观察: 当前架构已经解耦得很好

[ai-generate.ts](../../packages/neko-agent/packages/agent/src/skill/builtins/ai-generate.ts) + [media-agent-tools.ts](../../packages/neko-agent/packages/platform/src/media/media-agent-tools.ts) 的生成调用本身已经是非阻塞的:

```
agent 调 GenerateImage(prompt)
  └─► tool 立即返回 { backgroundMode: true, taskId }   ← 不等
        ├─► TaskManager 后台轮询 (5s × 360)             ← 不在 agent context
        ├─► 结果落盘 .neko/generated/ + JSON reference  ← 不进 message 数组
        └─► 进度通过 callback → webview                  ← 不进 reasoning loop
```

这意味着常见的"生成慢、要用 subagent 异步"前提**在 neko-agent 里不成立**:

- 生成不阻塞 agent ❌ (已是 fire-and-forget)
- 生成结果污染上下文 ❌ (已是 JSON 引用而非 base64)
- 主 agent 等 30 分钟 ❌ (callback 模式)

### 3.2 再拆三层

| 层 | 性质 | 上下文成本 | 决策依赖主 agent? |
|----|------|-----------|-------------------|
| **L1 提交** (写 prompt、选 provider、submit) | 文本计算 | 小 (JSON 参数) | ✅ 是 |
| **L2 轮询/状态** (taskId → 完成) | 纯调度 | 小 (callback) | ❌ 否 |
| **L3 评估/迭代** (quality check → regen → assemble) | LLM + vision | **大** (vision tokens × N) | ⚠️ 依场景 |

L1 和 L2 已经设计良好,**不需要也不应该 subagent**。真正的问题在 L3。

### 3.3 不需要 subagent 的场景 (多数情况)

| 场景 | 原因 |
|------|------|
| 单图生成 + 用户继续对话 | 已经 fire-and-forget,subagent 多一层 ReAct 损耗 |
| 生成参考图给后续 tool | 提交即返回 JSON 引用,后续工具直接用 `localPath` |
| 小批量生成 (≤4 张) | `GenerateImage` 自带 `n` 参数,Provider 层并行 |
| TTS / 音乐生成单条 | 输入小、结果即引用,链路本来就轻 |
| 用户和主 agent 对生成结果实时讨论 | 主 agent 必须"亲眼"看 |

### 3.4 真正需要 subagent 的场景 (少数但价值高)

#### 场景 A: 质量评估闭环 (高置信度推荐)

[quality-assessment.ts](../../packages/neko-agent/packages/agent/src/skill/builtins/quality-assessment.ts) 的循环:

- 每轮 vision LLM ~258 tokens × 多张候选 × 多轮 → 主上下文很快被污染
- 评估只需返回"通过/失败 + 改进建议" → 文本抽象
- [creative-presets.ts](../../packages/neko-agent/packages/agent/src/subagent/creative-presets.ts) 的 `quality-checker` 预设就是为此设计
- 主 agent 拿到结论,不是 vision 数据

#### 场景 B: 大批量协同生成 (>5 项 + 需要互相参照)

例: 为画布上 50 个分镜节点各生成图,要求风格一致

- 主 agent 直接做: 50 个 taskId + 50 条进度回调挤进消息历史 (噪音问题)
- 用 `creative-director` subagent 接管:
  - 内部维护 batch 表
  - spawn `spawnBatch()` 并行 (max 5)
  - 一致性校验在 subagent 内部循环
  - 只把批次完成事件 + 摘要还给主 agent

#### 场景 C: 迭代精修

"把这张图调到能用为止"——多轮 vision + 多次 prompt 改写:

- 每轮主 agent 看图 → 主上下文每轮+一帧
- 改 5 轮 = 主上下文堆 5 张引用 + 多轮推理
- 用 subagent 跑闭环 → 主 agent 只看最终一张

#### 场景 D: 跨模态组合

例: 生成图 → 看图写音乐 prompt → 生成音乐 → 对齐节奏

- 中间产物只是过程材料,最终交付只是"作品"
- 主 agent 不需要持有所有中间结果

---

## 四、统一决策矩阵

把读取和生成两侧合并:

| 工作类型 | 主 agent 是否参与? | 推荐方案 |
|---------|-------------------|----------|
| 多模态读取 — 预处理 | ❌ 不消耗 context | 异步调度 + 缓存 (**不**用 subagent) |
| 多模态读取 — 单图/单截图消费 | ✅ 直接讨论 | 主 agent 直看 |
| 多模态读取 — 长视频/批量评估 | ❌ 只要结论 | ★ subagent |
| 生成 — 单次提交 | ✅ 决策依赖 | 主 agent 直调 (已非阻塞) |
| 生成 — taskId 轮询 | ❌ 机械调度 | TaskManager 后台 (**不**用 subagent) |
| 生成 — 质量/迭代闭环 | ❌ 只要结论 | ★ subagent |
| 生成 — 大批量协同 | ❌ 只要批次摘要 | ★ subagent |

---

## 五、反模式清单

下列做法**应当避免**:

1. ❌ **把 subagent 当 worker pool**: 用 subagent 跑非 LLM 计算 (FFmpeg/Sharp/编码),错配 LLM 上下文成本
2. ❌ **把 subagent 当并发控制器**: 单工具的并发应该在 Provider/Executor 层做,subagent 不能让 Provider 更快
3. ❌ **给所有 `GenerateXxx` 工具默认套 subagent**: 简单生成调用本来就轻,subagent 包装反而增加成本
4. ❌ **让 subagent 接管 taskId 轮询**: 已经是 callback 后台任务,subagent 反而引入额外推理轮次
5. ❌ **把 `GenerateImage(n=4)` 拆成 4 个 subagent**: Provider 层就能并行,subagent 是错配
6. ❌ **用 subagent 处理"用户正在讨论"的内容**: 主 agent 必须直接感知,subagent 摘要会丢失关键信息
7. ❌ **subagent 嵌套过深**: Federation ADR 限制 depth=3 是有原因的,深嵌套会让上下文反而更难追溯

---

## 六、对 neko-agent 的实施建议

按 [CLAUDE.md](../../CLAUDE.md) "先低耦合后优化、不为假想需求设计"原则,**按优先级**:

### P0: 先补观测 (所有后续决策依赖于此)

- 在 [MediaPreprocessor](../../packages/neko-agent/packages/extension/src/chat/message/mediaPreprocessor.ts) 出口加 vision token 估算 (~258 tok/image)
- 接到现有的 `token-budget-manager`
- 没有数据就讨论"是否需要 subagent"是空对空

### P1: 低成本结构性改进 (不需要 subagent)

1. **预处理结果缓存**: keyframe 按 `file_path + mtime` 缓存,跨轮次复用
2. **Tool 结果中的图像块**改成 `GeneratedAsset 引用 + 按需拉取` (协议已在 [agent-media-architecture.md](./agent-media-architecture.md) 定义,但 [act-phase.ts](../../packages/neko-agent/packages/agent/src/executor/act-phase.ts) 仍在 inline base64)

### P2: 第一个 subagent 试点 — 质量评估闭环

唯一一个数据明确的场景:

- 复用现成的 `quality-checker` preset
- 入口: `qualityAssessmentSkill` 显式调用时
- 主 agent 拿到 `{ passed, score, issues, recommendations }`,不再自己看图
- 失败成本低、可观测、容易回滚

### P3: 长视频摘要 subagent

- 仅当用户上传 >30s 视频时启用
- 复用 `SubAgentManager` 的 specialized preset 模式
- 不依赖未实现的 [Federation ADR](./agent-multi-agent-federation.md) (仍 Proposed)
- 输入: 视频 file path + 关注点
- 输出: 时间轴摘要 (text)

### P4: 批量生成协调器 subagent

- 仅当用户请求 ≥5 项生成时启用
- 复用 `creative-director` preset
- 内部用 `spawnBatch()` + 一致性 prompt
- 主 agent 拿到批次完成 + 摘要

### 永远保留的"快路径"

- 单图问答、单次生成、参考图传递、用户交互对话 → **直接调,不走 subagent**
- 这条快路径必须明确保留,否则 token 开销会失控

---

## 七、与现有 ADR 的关系

### 与 [agent-multi-agent-federation.md](./agent-multi-agent-federation.md)

Federation ADR 提的是 *peer reasoning* (对等推理),本文档讨论的是 *parent-child context isolation* (父子上下文隔离)。两者关系:

- **本文档**: 主 agent → SubAgent 单向 spawn (现有 SubAgentManager 能力,无需 Federation)
- **Federation ADR**: SubAgent ↔ SubAgent + SubAgent → Parent 反向消息 (需要 MessageBus 等基础设施)

P0-P4 建议**全部不依赖 Federation ADR**,可在当前 SubAgentManager 上落地。

### 与 [adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md)

Skill as Prompt-Chains 主张"薄编排,厚 prompt"。本文档延续同一原则:

- 让 prompt 推理 (在 subagent 里) 解决问题,而不是 DSL 编排 (在主 agent 上下文里) 解决
- Subagent 是"另一段 prompt 上下文",而不是"另一个执行节点"

### 与 [agent-evolution-capacity.md](./agent-evolution-capacity.md)

Evolution Capacity 关注"系统能否随能力增长而扩展"。本文档的 subagent 边界让:

- 主 agent 上下文大小**不随生成/评估轮次线性膨胀**
- LLM 能力增强时,subagent 内的多轮工作自动受益,主 agent 接口不变

### 与 [agent-media-architecture.md](./agent-media-architecture.md)

Agent Media Architecture 已经定义"GeneratedAsset on-disk + JSON 引用 + 零 base64"协议。本文档**强化**这一协议:

- Subagent 不应破坏零 base64 原则,内部依然走 GeneratedAsset 引用
- Subagent 之间传递媒体只传引用,不传内容

---

## 八、一句话结论

> **Subagent 是上下文隔离器,不是异步执行器。在 neko-agent 中,绝大多数"读取"和"生成"调用不需要 subagent;subagent 的真正领地是"多轮 LLM 工作 + 主 agent 不必参与"的少数场景 (质量评估闭环、大批量协同、长媒体摘要、跨模态精修)。任何把 subagent 当 worker pool 或并发控制使用的设计都是错配。**

---

## 九、修订记录

- **2026-04-26**: 初版,基于多模态读取与生成调用两次设计审查整理。
