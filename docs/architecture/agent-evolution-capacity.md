# Agent 系统演化能力审视

**状态**: Proposed
**日期**: 2026-04-23
**关联范围**: neko-agent · @neko/shared · 所有贡献 Skill/Tool/Operation 的子包
**关联文档**:

- [agent-unified-workflow.md](./agent-unified-workflow.md) — 本文档的上层 ADR，定义 IDC 三阶段 + 四层架构 + 六层控制平面
- [workflow-orchestration.md](./workflow-orchestration.md) — orchestration 编排实现（Phase 1-6）
- [creative-context-compression.md](./creative-context-compression.md) — Memory 层 7 级压缩策略
- [perception-first-roadmap.md](./perception-first-roadmap.md) — 多模态感知路线图

---

## 1. 本文档的角色

架构的价值不只看"当下能跑"，还要看"外部条件变化时能否吸收**不改代码**"。本文档是对 **agent-unified-workflow.md** 定义的 IDC 三阶段 + 四层架构 + 六层控制平面的**抗演化性审计**，回答：

- 当 LLM 模型能力**几何级提升**时，哪些模块自动受益，哪些要重写？
- 当 Skill 市场从 10 个扩展到 1000+ 个时，匹配/依赖/冲突仲裁会不会崩？
- 当 engine 新增 50 类 Operation 能力时，现有 Skill 能否透明适配？
- 当新 prompt / 编排模式涌现时（LangGraph / DSPy / 未知），系统能否吸收？

本文档**不改变**上层架构决策，只**标注脆弱点**并**规定演化纪律**（§7）。

---

## 2. 演化压力的四个来源 × 吸收机制

```
外部变化                           系统层承接                      吸收机制
───────                            ──────                         ──────
① LLM 模型能力 ↑                  → Skill prompts + personas      叙事式 markdown（非 DSL）
② 生成/媒体模型 ↑                 → Operation 工具 + costProfile   扁平能力池 + 版本字段
③ Engine 能力 ↑（新 effect/ML）   → Tool 贡献 + 子包注册          CapabilityKind 判别式联合
④ Skill 生态 ↑（10→1000 个）     → 三级懒加载 + matching          description.When 语义匹配
```

四类外部变化是**独立轴**，按层分别吸收。没有任何一类会让架构**整体崩溃**，但每类都有**特定断点**（§5）。

---

## 3. 按层审视抗演化能力

### 3.1 Skill 层 — 评级 **A-**

| 演化场景 | 现设计表现 |
|-------|---------|
| 模型变聪明（GPT-5 / Claude 5 级别）| ✅ Skill 正文是**自然语言 prompt**，智能越高越能自主判断章节何时跳过；不需要改 Skill |
| Skill 数量从 10 → 1000 | ✅ 三级懒加载（frontmatter 常驻 → 正文按需加载 → 资源按需）覆盖 token 成本；⚠️ matching 仍依赖 `description.When` 关键词，需进化为语义向量匹配 |
| Skill 质量参差 | ✅ `compliance.approvalRules[]` + `autoInvoke: false` 可屏蔽高危；⚠️ 无信誉评分 / 社区投票机制 |
| Skill 依赖子包版本升级 | ✅ `requiredSubpackages.minVersion` 已定义；⚠️ 无 **Skill 自身版本兼容矩阵**（Skill v1.0 能否在 Engine v2.0 下跑？）|
| 多 Skill 域重叠（两个都声明 `domain: cut`）| ❌ 无仲裁机制——先激活的赢 |

**主要优势**：Skill 是 Markdown + YAML，**改 prompt 不发版**，对新 prompt 技术（CoT / self-consistency / ReAct 变体）全透明。

**主要断点**：Skill matching 的语义粒度 + 域冲突仲裁。

---

### 3.2 Prompt 层 — 评级 **A**

| 演化场景 | 现设计表现 |
|-------|---------|
| 新 Prompt 技术（CoT / self-consistency / ReAct 变体 / Plan-and-Solve）| ✅ 100% Markdown 可写——任何模式可表达，改 prompt 不发版 |
| 需要注入运行时变量（runId / stage / memory）| ✅ §11.6.9 三件套之一的 "可见性" 已设计好数据通路；`{runId}` / `{stage}` 占位符已实现 |
| 模型理解能力差异化 | ✅ persona 用"**可选自评**"/"**指引**"而非"强制规则"——聪明模型自主决定，弱模型按部就班 |
| Prompt 策略需要按数据演化 | ✅ `CreativeMemoryHooks` 把经验写回 memory，persona 下次激活时注入回来——**策略自演化** |
| 潜在隐患 | ⚠️ persona 正文经常多次被改写，无**版本化机制**——回退到旧行为需要翻 git log |

**主要优势**：Prompt 层是**纯数据**（非代码），演化完全去中心化；CreativeMemoryHooks 提供了 **prompt 策略随数据自动演化**的通道（未来"LLM 自动调优 persona"的种子已埋下）。

**主要断点**：persona 的版本化 + A/B 对照机制缺失。

---

### 3.3 Orchestration 层 — 评级 **B+**

| 演化场景 | 现设计表现 |
|-------|---------|
| 新编排模式涌现（并发 subagent / parallel reviewer / plan-as-data）| ✅ Skill 可内嵌 `phases + pipelines` DSL；⚠️ 但 IDC 3 阶段本身是硬编码，加 "Review 并行阶段" 需要改 StagePlanner 代码 |
| AI 想跳过阶段（简单任务无需 Draft）| ✅ AutoMode §3.2 六条入口规则 + StagePlanner 状态机已支持 |
| 新 ExecutorHooks 类型加入 | ✅ 现有 hook 链是可组合的（memory / validation / retry / observation）；新类型 `implements ExecutorHooks` 即可接入 |
| Operation 工具重命名 | ⚠️ Skill 通过名字引用 Tool——工具改名 Skill 静默失效；无 rename alias 机制 |
| Tool 的 schema 演进（新字段 / 枚举扩展）| ✅ Operation 参数是 JSON Schema，AI 在 prompt 引导下能自适应；⚠️ 但旧 Skill 若硬编码了旧 schema 用法则需手动更新 |

**主要优势**：ExecutorHooks 架构 + Skill 内嵌 phases DSL 提供了**两个扩展面**——hook 为 runtime 扩展，Skill phases 为编排扩展。

**主要断点**：IDC 三阶段骨架硬编码（stage-activation-matrix / stage-planner），突破性新模式需改代码。

---

### 3.4 控制层（约束分级六平面）— 评级 **A / A- / A- / B / A / A**

按 [agent-unified-workflow.md §11.6](./agent-unified-workflow.md) 六平面分别审视：

| 平面 | 抗演化评级 | 关键点 |
|----|---------|-----|
| **Prompt** | **A** | 100% 数据化，模型越强越受益 |
| **Schema** | **A-** | Tool/Operation 二分稳健；Tool 名字硬引用是唯一断点 |
| **Runtime** | **A-** | hook 链可组合；StagePlanner 硬编码是断点 |
| **Policy** | **B** | preferences.md 声明式规则可演化；**团队级 Policy / 规则冲突仲裁缺失** |
| **Memory** | **A** | CreativeMemoryHooks + 7 级压缩已验证；未来 CharacterAgent/SeriesSpec memory 可加 |
| **Evaluator** | **A** | §11.6.9 明确"AI 自评优先，不建 LLM-judge 组件"——从设计上规避了固化策略风险 |

Evaluator 层得 A 而非 A+ 的唯一原因：**确定性指标打分器**（CLIP 相似度 / FPS / 分辨率）虽然明确应"按需建"，但当前只有 ConsistencyChecker 一个实现，演化到真需要时会有**零到一**的工程成本。

---

## 4. 最强演化锚点（三原则共振）

```
§11.5 AI 原生执行          §11.6.9 AI 自评优先         §11 轻量化原则
    │                           │                           │
    └──────────────┬────────────┴───────────┬───────────────┘
                   ▼                        ▼
         "AI 是最强的编排执行器"      "AI 是最强的判断引擎"
                   │                        │
                   └────────┬───────────────┘
                            ▼
              LLM 能力提升 = 系统自动增强
              不需要改代码、不需要 schema 升级
              改 prompt / 加 skill / 写 memory 即可
```

**核心承诺**：只要 LLM 变强，**不改一行代码**，系统的意图理解、编排、审美判断、工具选用、错误恢复等能力**自动受益**。

这是当前架构最大的演化资产——来自三条一致的不变原则：

1. **§11.5 第 2 条不变原则："AI 原生执行（DSL 只是 AI 的输入，不是独立调度器）"**
2. **§11.6.9 Evaluator 建设边界："主观创作判断 → AI 自评三件套，不建组件"**
3. **§11 轻量化原则："按需升级路径 P0 → P3，不 pre-build"**

三原则**互相加强**。任一条被破坏（哪怕单独看很合理），演化能力都会退化。例如：

- 如果违反 §11.6.9 建了 IntentValidator 组件 → LLM 升级后这个组件被架空但代码还在
- 如果违反 §11 在 P0 就建了严格 Workflow DSL → 新编排模式来了要推翻 DSL
- 如果违反 §11.5 让程序写 Skill frontmatter 语义字段 → AI 能力升级不影响这些字段

---

## 5. 最脆弱的三处演化断点

| # | 断点 | 症状 | 建议缓解 |
|---|----|----|----|
| **1** | **Tool 名字作为 Skill 的硬引用**（无 alias）| 子包改 Tool 名 → 引用它的 Skill 全部静默失败 | `TOOL_NAMES` 常量升级为带 alias 映射（TODO 已有 P0 项）；tool-registry 增加 resolve-by-alias 路径 |
| **2** | **Skill Matching 仍是关键词**（基于 description.When）| Skill 增多后误匹配率上升 | 升级为 CLIP / sentence-embedding 向量匹配（workflow-orchestration Phase 4.2 已规划 CLIP napi）|
| **3** | **Persona prompt 无版本化**（直接覆写）| 改动 persona 后难以 A/B 对照 / 回滚 | persona.md 入 git 外**独立 version tag**，或 Memory 中记录"本次用的 persona version"让自评可溯源；更激进方案：Skill frontmatter 增加 `promptVersion` 字段 |

### 次级脆弱点（不紧急但值得记录）

| # | 断点 | 触发条件 |
|---|----|-----|
| 4 | IDC 三阶段骨架硬编码 | 真出现"Review 并发 Reviewer"等突破性新编排模式 |
| 5 | Skill 版本兼容矩阵缺失 | 同一 Skill 要同时服务多个 Engine / Agent 版本 |
| 6 | 多 Skill 域重叠仲裁 | 市场开放后社区 Skill 常见问题 |
| 7 | Policy 团队级缺失 | 多人协作场景普及时 |

---

## 6. 演化测试：三年后自测

假设 2029 年到来时各维度变化：

| 外部变化 | 现架构表现 |
|-------|---------|
| **新 LLM** 能看 10M token 视频并自判意图 | ✅ 直接受益：§11.6.9 AI 自评原生适配；多模态不走 extractor 管线；Memory 压缩策略可调高阈值 |
| **Skill 市场 10000+ 个** | ✅ 三级懒加载扛住 token 成本；⚠️ **CLIP matching（P2 Rust milestone）必须完成**，否则 description.When 关键词匹配会崩 |
| **新一代 engine 有 50 类 Operation** | ✅ 扁平能力池 + CapabilityKind 可吸收；子包各自贡献无中心瓶颈；`costProfile` 阈值可按新成本模型调整 |
| **新编排模式 "多 Reviewer 并发"** | ⚠️ IDC 3 阶段硬编码需重构 stage-planner 代码；但 **Skill 内嵌 `phases`** DSL 可局部突破（单个 Skill 内定义自己的并发 phases 不用改全局）|
| **Prompt 技术升级到不可预见的 X** | ✅ Prompt 层 100% 数据化，任何新技术都能以 markdown 写入 Skill/persona |

**总体结论**：**大部分演化场景系统自动受益**；需要编码介入的只有**突破性新编排模式**（断点 #4）。

---

## 7. 演化维护纪律（后续决策指南）

以下六条纪律**保护上述演化能力**。每次新功能设计决策时按这个清单复核：

### 7.1 不建 LLM-as-judge 组件（§11.6.9）

每次看到"我们需要一个 XXXValidator"时先问：**这个判断是确定性的吗？** 是 → 建；否 → AI 自评三件套（可见性 + 引导 + 积累）。

### 7.2 不把语义 schema 化（§11.6.4 反模式）

`intent` / `style` / `mood` / `emotion` 这类主观字段**永远不拆成 YAML 枚举**。放进 Markdown 正文 + 章节惯例让 AI 和人都能读。

### 7.3 不 pre-build 复杂度（§11.4）

每条新抽象先证明"现在真有 3 个以上用户"，否则留在 P0 简化版。避免"将来 maybe 用得上"的 DSL / Manager / Registry。

### 7.4 不硬编码 LLM 行为策略（§11.5）

策略写进 prompt（可改），不写进代码（要发版）。persona 引导 AI 做什么，Runtime 不 enforce。

### 7.5 不让程序写 AI 的语义产物（§7.2）

Draft / Plan / Task 正文只能由 AI 写；程序只做 I/O（读写文件）、事件广播、索引构建。Frontmatter 最小化，承载 id / 时间戳等**纯机器字段**。

### 7.6 不把 Memory 写进产物（§11.6.4 反模式）

Memory 有独立存储（`~/.claude/.../memory/` / `.neko/memory.md`），产物只引用**本次运行**的事实。跨会话累积由 Memory 层独立管理。

---

## 8. 一句话总结

**Prompt + Skill + Memory 层演化能力 A 级**（零代码改动适配 LLM 能力提升）；**Orchestration 层 B+**（3 阶段骨架相对固定，但 Skill 内嵌 phases 提供局部逃生阀）。

**最大杠杆不在加新组件，而在 §7 六条维护纪律的执行**——每次按住"加个 XXXManager 吧"的冲动时，演化能力自然保持最强。

---

## 9. 变更历史

| 日期 | 变更 | 作者 |
|-----|-----|-----|
| 2026-04-23 | 初版：对 agent-unified-workflow.md 定义的 IDC 三阶段 + 四层架构 + 六层控制平面做抗演化审计。按 Skill / Prompt / Orchestration / 控制六平面 分别评级 A- / A / B+ / (A/A-/A-/B/A/A)；识别三个最脆弱断点（Tool 硬引用 / Skill matching 关键词 / persona 无版本化）；提炼三原则共振作为最强演化锚点；总结六条演化维护纪律作为后续决策指南 | Architecture Team |
