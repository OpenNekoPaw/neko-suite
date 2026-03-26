# AI Capabilities 路线图

> neko-agent AI 能力演进：Phase 2 已完成，本文档聚焦开发方案与架构决策

---

## 已完成基座

### Phase 2: Pipeline 核心 ✅

- 6 种创作流程（flowA-F），10 个内置 Skill，~2695 LOC + 109 tests
- Pipeline 5 阶段：readDocument → parseStoryboard → generatePrompts → batchGenerate → arrangeOnTimeline
- 文档格式：PDF/DOCX/PPTX/EPUB/CBZ/CBR/XLSX/FDX
- QualityCheck 智能工具（多模态 LLM 评估，按需激活）
- VSCode 命令 + Slash 命令（`/pipeline` + `/pipeline-retry`）

### Phase 2.5: 流水线质量保障 ✅

- **执行报告**（P0）：`PipelineRunReport` 自动收集各阶段状态/耗时/错误，`GetPipelineReport` / `ListPipelineReports` 工具供 Agent 查询
- **Gate 预览增强**（P1）：confirm gate 暂停时向 WebView 推送丰富预览数据（场景摘要 + 媒体路径 + 失败标记），帮助用户快速审核
- **诊断 Skill**（P1）：`pipeline-diagnostics` 语义触发 + `/pipeline-diagnostics` 命令，Agent 引导分析失败原因并建议修复
- **设计原则**：质量判断由用户在 Gate 完成，不采用 LLM 评 LLM 自动评测；Agent 仅在用户主动询问时分析报告

### Agent 能力现状

```
规划与决策    ██████████░░░░░░  60%  — 重试/校验 ✅，缺任务拆解和自我反思
记忆管理      ██████████████░░  88%  — memory+LSP 够用，压缩完善
工具与技能    ████████████████  95%  — 无需沙箱，Permission 足够
协作与通信    ██████████████░░  80%  — SubAgent 就绪，缺调用引导
环境感知/HITL ██████████████░░  80%  — ask 模式完整，缺 trace
```

---

## 开发方案

### Sprint 1: Pipeline 增强（~4 天）

解决 Pipeline 最关键的两个弱点：动态扩展性和风格浪费。

#### 1.1 Hook Registry（2 天）

Pipeline 加新步骤（敏感词过滤、配音）需改所有 flow，扩展性差。Hook 类型已定义（`StageHookConfig`），executor 中是 placeholder。

**实现**：
- 新建 `agent/src/pipeline/hook-registry.ts`：`action` → handler 映射注册表
- 修改 `agent/src/pipeline/pipeline-executor.ts`：`runHooks()` 从 log-only 改为执行注册的 handler
- handler 签名：`(ctx: PipelineContext, stageName: string) → Promise<PipelineContext>`
- 内置 2 个 hook：`contentFilter`（敏感词检测）、`promptQualityCheck`（prompt 质量评估）

**效果**：新功能以 hook 插入，不改 flow 定义：
```
flowF + contentFilter(after prompts): parse → prompts → [filter] → generate → arrange
```

#### 1.2 generatePilot stage（1 天）

batchGenerate 一次生成全部 scene，风格方向错了浪费资源。

**实现**：
- 新建 `agent/src/pipeline/stages/generate-pilot.ts`：linear stage，gate=auto
- 只生成 scene 0，调 QualityCheck 评估，通过后继续 batchGenerate
- 不通过时返回评估结果，由后续 gate=confirm 或 hook 决定是否调整 prompt

**flow 增强**：
```
parse → prompts → [gate] → pilot → [QA hook] → batch → arrange
```

#### ~~1.3 PipelineContext 角色字典~~ → 推迟，独立于 Agent

角色字典是项目级创意资产，消费者不只是 Agent（neko-story/neko-cut/neko-canvas/neko-assets 都需要）。

**架构决策**：不放 Agent 内部（PipelineContext），放 `@neko/shared` 定义类型 + 项目目录存储文件（`.nkchar` 或 `characters.json`），任意扩展可读写。

**推迟原因**：
- 现有 Skill prompt 的参考图策略已可用
- 结构化角色字典需改 2 个 stage 接口（parseStoryboard + generatePrompts），不是加字段
- 无用户反馈"角色不一致是痛点"
- generatePilot + gate=confirm 已让用户在风格确认阶段检查角色

**触发条件**：用户反馈角色跨场景不一致且参考图策略不够用

---

### Sprint 2: Agent 能力补齐（~3 天）

修复 Agent 五大能力中的关键短板。

#### 2.1 任务拆解引导（0.5 天）

**位置**：`agent/src/prompt/builtin-prompts.ts`

在 system prompt 中加入：
```
遇到多步任务时：
1. 先列出步骤，评估是否可并行
2. 独立子任务用 SubAgent 并行执行
3. 强耦合任务顺序执行
```

#### 2.2 ~~自我反思 hook~~ → 降级 P3

创作流水线各环节已有完整质量机制（JSON schema 校验 / Gate 用户审核 / QualityCheck 评估+重试 / 确定性操作），不需要额外反思 hook。降级为 Agent 通用对话质量改进（P3）。

#### 2.3 ✅ SubAgent 描述优化

**位置**：`agent/src/subagent/task-tool.ts`

已完成：`task` 工具描述重写，加入 When to Use / When NOT / Type Selection Guide / Parallel Execution 四段。

#### 2.4 ✅ token 使用统计

**位置**：`neko-types/src/types/agent.ts`、`agent/src/executor/think-phase.ts`、`agent/src/session/agent-session.ts`

已完成：
- `AgentStep` + `AgentResult` 新增 `usage?` 字段
- think-phase 捕获 `response.usage`（非流式）和 `chunk.usage`（流式 done chunk）
- agent-session 累加每步 usage，`done` 事件输出真实 API token
- 修复 bug：之前 inputTokens 是历史估算值、outputTokens 硬编码 0

**使用量统计边界**（见 ADR-6）：主 Agent / SubAgent / 媒体生成各自独立统计，不混合。

---

### Sprint 3: 领域知识（~3 天）

Pipeline 架构的差距不在编排模式，而在领域知识。

#### 3.1 Seed_Manager Skill（1 天）

管理角色 Seed / LoRA 触发词，跨 scene 复用。读写 `PipelineContext.characters[]`。

#### 3.2 Audio_Mixer Skill（1 天）

根据 scene 情绪标签（从 `StoryboardScene.mood` 提取）匹配 BGM 库，调用 `GenerateMusic` 工具。

#### 3.3 镜头语言扩展（1 天）

将 `comic-to-storyboard` Skill 的 Cinematography 部分（camera angle、lighting、movement）提取为通用 Skill，适用于所有 flow。

---

### 后续迭代（按需）

| 任务 | 工作量 | 触发条件 |
|------|--------|---------|
| ~~QualityCheck P1 视频帧~~ | ~~1 天~~ | 重新评估：质量判断由用户在 Gate 完成，不再做 LLM 自动评测 |
| Canvas 分镜可视化 | 3-4 天 | 用户需要可视化分镜编排 |
| 执行 trace | 2-3 天 | 调试复杂多轮交互困难 |
| 高级循环 Stage | 4-5 天 | QualityCheck 工具能力不够用 |
| 角色一致性研究 | 研究 | 提供商支持 Embedding/LoRA |
| Workflow 引擎 | 3-4 周 | 用户需要自定义 DAG 编排 |
| neko-diff CLI（Git diff driver） | 0.5 天 | 用户使用 Git LFS 管理素材 |
| pHash 感知哈希 | 1 天 | 素材去重 / diff 摘要需求 |

> 项目数据管理（变更记录/二进制素材/协作）策略详见 [project-data-management.md](./project-data-management.md)

---

## 架构决策记录

### ADR-1: QualityCheck — 智能工具 vs ReactiveStage vs SubAgent

| 路径 | 方案 | 结论 |
|------|------|------|
| A. ReactiveStage | Pipeline executor 新增 reactive 分支 | ❌ 评估需要 LLM 推理，多了一层 |
| B. Agent ReAct | 主 Agent 逐个调 evaluateMedia | ⚠️ N 次评估污染上下文 |
| **B'. 智能工具** | **工具内封装循环，返回结构化摘要** | **✅ 采用** |
| C. SubAgent | spawn 质检 SubAgent | ⚠️ 可行但过重（完整 ReAct 循环） |

ReactiveStage 类型定义保留（`type: 'reactive'`），executor 不实现。

### ADR-2: 创作流水线 — Skill+Pipeline vs 专用 SubAgent

**决策**：采用 Skill + Pipeline，不采用专用 SubAgent + Blackboard。

**映射关系**：

| 提案 SubAgent | 现有 Stage | 为何不需要 SubAgent |
|--------------|-----------|-------------------|
| Writer | `parseStoryboard` + `ILLMAnalyzer` | 单次 LLM 转换 |
| Visual | `generatePrompts` + gate=confirm | 单步操作 + 用户审核 |
| Production | `batchGenerate` + `QualityCheck` | 并发生成 + 自动重试 |
| Editor | `arrangeOnTimeline` + NekoCut | 确定性操作 |

**核心理由**：
- Pipeline Stage 是无 ReAct 开销的专家链（每步 1 次 LLM 调用 vs SubAgent 完整循环）
- PipelineContext 即 Blackboard（结构化状态传递，无需独立服务）
- 1M 上下文 + ConversationCompressor 解决"忘事"问题

**SubAgent 升级触发条件**：从零原创剧本（多轮推理）/ 跨作品风格融合 / 交互式导演审片。

### ADR-2 补充: Pipeline 弱点深度分析

| 质疑 | 评估 | 应对 |
|------|------|------|
| 逻辑自愈（跨 stage 回溯） | 当前因果链短，不需要 | 复杂流程增加后再评估 |
| Gate 交互成本（阻塞式 vs 自动） | QualityCheck 已是自动审核 | 扩展 prompt 质量评估（Sprint 1 Hook） |
| **动态扩展性（加步骤改所有 flow）** | **Pipeline 真正弱点** | **Hook Registry（Sprint 1）** |

### ADR-3: 不使用沙箱

音视频创作场景：操作以创建为主（非破坏性）、用户即操作者（隔离阻碍工作流）、Permission ask 模式已拦截高风险操作、沙箱 I/O 开销影响实时预览。

### ADR-4: 动态路由依赖 LLM

不使用结构化 intent classifier。LLM 上下文理解能力远超关键词匹配，工具/Skill 描述已提供选择依据。改进方向：优化描述质量（Sprint 2.3）。

### ADR-5: 长期记忆使用 memory + LSP

不引入 RAG/向量数据库。项目记忆是策展性质（关键决策/偏好），LSP 提供代码结构检索，向量索引成本与项目规模不匹配。

### ADR-6: 使用量统计 — 分离成本中心

三类成本完全独立统计，不混合到一个 `totalTokens` 中：

| 成本中心 | 计费模型 | 统计位置 | 状态 |
|---------|---------|---------|------|
| 主 Agent LLM token | 按 token | `AgentStep.usage` → `done` 事件累加 | ✅ 已实现 |
| SubAgent LLM token | 按 token | `SubAgentResult.usage`，通过 `task_output` 查询 | ✅ 已有 |
| 媒体生成任务 | 按次/按秒 | `MediaTask.status`，`PipelineContext.generatedPaths[]` | ✅ 已有 |

**不合并 SubAgent token 到父级的理由**：
- 合并后父级 token 数无法解释（"为什么这轮用了 50K？"→因为 SubAgent 用了 40K）
- SubAgent 独立计费更清晰，用户可分别评估主 Agent 和 SubAgent 的成本效率
- `task_output` 已返回每个 SubAgent 的独立 usage

**不统计媒体生成 token 的理由**：
- 媒体 API（Runway/DALL-E/Kling）不按 token 计费
- 已通过 `MediaTask` 追踪任务状态和数量
- `QualityCheckResult.evaluations[].attempts` 追踪重试次数

---

## Agent 能力详情

### 1. 规划与决策

| 子能力 | 状态 | 说明 |
|--------|------|------|
| 任务拆解 | ⚠️ 被动 | Plan Mode 手动触发 + Pipeline 固定链。Sprint 2.1 优化 |
| 错误重试 | ✅ | RetryHooks 指数退避 + 模型 fallback |
| 输出校验 | ✅ | ValidationHooks 格式校验→自动重试 |
| 自我反思 | ❌ | Sprint 2.2 实现规则检查 |
| 动态路由 | ✅ | LLM 驱动（ADR-4） |

### 2. 记忆管理

| 子能力 | 状态 | 说明 |
|--------|------|------|
| 短期记忆 | ✅ | 上下文窗口 + 对话历史 |
| 长期记忆 | ✅ | memory + LSP（ADR-5） |
| 上下文压缩 | ✅ | ConversationCompressor + 四层 token 预算 |
| 状态管理 | ⚠️ | 历史消息即状态，无 checkpoint |

### 3. 工具与技能

| 子能力 | 状态 | 说明 |
|--------|------|------|
| 工具集成 | ✅ | 14 ToolSet + 两层注入 |
| 安全执行 | ✅ | Permission ask + Gate（ADR-3 无需沙箱） |
| 自主发现 | ✅ | SearchToolSets / ActivateToolSet 元工具 |
| Skill 系统 | ✅ | 10 Skill + 3-track 原子注入 |

### 4. 协作与通信

| 子能力 | 状态 | 说明 |
|--------|------|------|
| SubAgent 架构 | ✅ | 5 preset + batch + background + 事件系统 |
| 调用决策 | ⚠️ | Sprint 2.3 优化工具描述 |

**SubAgent 使用判断**：单步→工具，固定链→Pipeline，多轮推理→SubAgent。

### 5. 环境感知

| 子能力 | 状态 | 说明 |
|--------|------|------|
| 感知反馈 | ✅ | 工具结果→observe→下轮推理 |
| 人工确认 | ✅ | ask 模式 + Gate |
| 可观测性 | ✅ token / ⚠️ trace | Sprint 2.4 token 统计已完成（ADR-6）；trace 后续迭代 |

---

## 依赖关系图

```
已完成基座:
  ✅ ReAct + 14 ToolSet + 10 Skill + SubAgent 5 preset
  ✅ Pipeline 5 stage + 6 flow + QualityCheck
  ✅ memory+LSP + 压缩 + Permission ask

Sprint 1 — Pipeline 增强 (~4d):
  Hook Registry ← 解决动态扩展性
  generatePilot ← 风格确认
  角色字典 ← 独立于 Agent，@neko/shared 类型 + 项目文件（按需）

Sprint 2 — Agent 能力 (~3d):
  任务拆解引导 ← prompt 优化
  自我反思 hook ← afterThink 规则检查
  SubAgent 描述 ← task 工具 description
  token 统计 ← AgentResult.usage

Sprint 3 — 领域知识 (~3d):
  Seed_Manager Skill
  Audio_Mixer Skill
  镜头语言通用 Skill

后续迭代（按需）:
  QualityCheck P1 / Canvas 分镜 / 执行 trace
  高级循环 Stage / 角色一致性 / Workflow 引擎
```

---

## 技术债务

- 无阻塞性债务。Pipeline 109 tests，架构符合 SOLID
- ReactiveStage 类型保留，executor 不实现（按需启用）
- 潜在优化：批量并发数配置（硬编码 3-5）、Pipeline 中断恢复、结构化日志

---

*最后更新: 2026-03-24*
