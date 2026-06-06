# ADR: Skill as Prompt-Chains — phases DSL 退化为 IDC 下的轻量工作流

## 状态

Accepted — implemented before public launch (2026-04-26)

## 当前实现快照（2026-04-26）

- 旧 phase 类型与 manifest 字段已从类型契约移除；新 Skill 只能在正文中使用 prompt-chain 章节表达工作流程。
- `validateSkillManifest()` 不再接收 `phases` 调度语义；未上线前不保留 legacy parser / 兼容注入路径。
- slash Skill 带参数执行时不再依赖 `phases` / `pipelines` 判断 IDC 入口；显式 Skill 执行交由 Agent + IDC artifact 状态判断。
- `SkillInjectionCoordinator` 只注入 Skill body / tool permissions，不再处理旧 phase 兼容路径。
- 由于该能力尚未公开上线，本 ADR 不需要自动迁移 CLI 或 6-12 个月兼容期。

## 背景

neko Skill 当前设计承载了机器可读的编排 DSL（`phases`、`pipelines`），意图通过结构化字段描述工作流程：

```yaml
---
name: cut-tiktok-creator
phases:
  - name: review
    artifacts: [draft]
    approvalRequired: true
  - name: edit
    artifacts: [plan, apply]
  - name: export
    approvalRequired: true
pipelines:
  - id: standard
    steps: [...]
---
```

这一设计在初期看起来"工整、机器可分析、UI 可展示"，但经过实际落地与跨生态对比后，发现是 §11.6 反模式 #4（**硬编码 LLM 行为策略**）的具体实例，违反 §11.5（**AI 原生执行**）核心原则。本 ADR 把 phases / pipelines 从 DSL 退化为 markdown 章节惯例（**prompt-chains**），把 Skill 工作流表达降为 **IDC 框架下的轻量化工作流提示**，用于帮助 Agent 判断先理解、再计划、后执行等先后关系；同时保留必要的安全/权限 DSL 边界。

### 问题 1：违反 §11.5 AI 原生执行原则

§11.5 第 2 条不变原则明确："AI 原生执行（DSL 只是 AI 的输入，不是独立调度器）"。但当前 `phases` 是**真正的独立调度器**——StagePlanner 读取 phases 后驱动状态机，AI 失去自主调整顺序的权利。

```
当前实际行为：
  phases.review → StagePlanner 强制激活 review 阶段
  phases.edit   → 必须等 review 完成才进 edit
  AI 想跳过 review 做快速 edit？被 DSL 锁死。

§11.5 期望行为：
  IDC 框架给出 Draft / Plan / Apply 的阶段边界
  prompt-chains 给出 Skill 领域内的轻量先后流程
  AI 在该范围内根据任务复杂度自主合并、跳过、迭代
```

### 问题 2：违反 §11.6.4 反模式

§11.6.4 反模式 #4 明确："不硬编码 LLM 行为策略"——把"AI 该按什么顺序工作"硬编码为 schema 字段，违反此条。`pipelines.steps[]` 是更明显的违反——把 AI 该怎么决策做成了 DAG 图。

### 问题 3：演化能力受限

[agent-evolution-capacity.md](./agent-evolution-capacity.md) 把 Skill 评级为 **A-**，主要扣分项是 phases / pipelines DSL：

- LLM 变强后，AI 自主编排能力提升 → DSL 反而限制发挥
- 新编排模式（多 Reviewer 并发 / 自适应 phase 跳过）需要改 parser
- DSL 是冻结结构，markdown 是流动文本——后者天然受益于 LLM 演化

### 问题 4：维护成本高

phases / pipelines 需要：

- TypeScript schema 类型
- Skill 加载期 validator
- StagePlanner 状态机消费
- ArtifactWatcher 与 phases 阶段对齐
- UI 需要解析 phases 显示进度

而**所有这些功能都可以由其他机制无损承载**（见决策 4）。维护一套 DSL 基础设施纯属负担。

### 问题 5：破坏跨平台互通

[Claude Code Skill](https://docs.anthropic.com/) / Codex Skill 都不使用编排 DSL——它们靠 prompt-chains（自然语言描述 + AI 自主推理）。neko 的 phases 让 Skill 无法直接复制到 `.claude/skills/`，需要复杂的 bridge 和 `x-neko-*` 兼容前缀（前一轮 Skill 互通讨论的结论）。

退化 phases 后，**neko Skill 可直接复制到 Claude Code 使用**——零兼容成本。

### 问题 6：Anthropic 实证证据

Anthropic 自家最成功的 coding agent（Claude Code / Codex）**完全不使用编排 DSL**——全靠 prompt-chains。这是**强工程实证**：DSL 不是必需品，prompt-chains 在生产环境完全可行。

### 与既有 ADR 的关系

| ADR                                                                              | 关系                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [agent-unified-workflow.md §5.2](./agent-unified-workflow.md)                    | Skill 现行 phases / pipelines 字段所在；本 ADR 标记其 deprecated |
| [agent-unified-workflow.md §11.5](./agent-unified-workflow.md)                   | "AI 原生执行"原则的进一步落实                                    |
| [agent-unified-workflow.md §11.6.4](./agent-unified-workflow.md)                 | 反模式 #4（不硬编码 LLM 行为策略）的具体应用                     |
| [agent-evolution-capacity.md §3.1](./agent-evolution-capacity.md)                | Skill 层评级 A- → A 的关键路径                                   |
| [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) | StagePlanner 不再读 Skill phases，只看 artifact 状态             |
| [agent-multi-agent-federation.md](./agent-multi-agent-federation.md)             | SubAgent 编排不依赖 pipelines DSL                                |
| [adr-capability-protocol.md](./adr-capability-protocol.md)                       | CapabilityContribution.skillFiles 期望的 Skill 格式更新          |
| [adr-provider-expression-context.md](./adr-provider-expression-context.md)       | ProviderCard 不受影响（其字段是技术参数，是合法 DSL）            |

## 决策

### 1. phases / pipelines 退化为 IDC 下的 markdown 轻量工作流

**Skill 不再以 DSL 字段承载编排**——取而代之的是 persona body 中的自然语言描述，遵循约定的 markdown 章节惯例。prompt-chains 不是“无流程”，而是**轻量化工作流**：它在 IDC 的 Draft / Plan / Apply 大框架内，向 Agent 说明某个 Skill 的典型执行先后、关键判断点和失败恢复方式。

职责边界如下：

| 层                               | 职责                                                                          | 是否机器调度 |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| IDC ControlPlane / StagePlanner  | 决定当前轮次处于 Draft / Plan / Apply 哪个阶段，处理模式、风险、artifact 状态 | 是           |
| Skill prompt-chains              | 描述该 Skill 在 IDC 阶段内应如何理解任务、产出方案、执行动作、处理失败        | 否           |
| Tool / Approval / Compliance DSL | 限制可调用工具、审批门槛、安全策略                                            | 是           |

因此，prompt-chains 的目标是**帮助 Agent 在 IDC 框架下确定执行先后流程**，而不是替代 IDC，也不是重新引入可由程序解析的 workflow DSL：

```yaml
---
name: cut-tiktok-creator
version: 1.2.0
description: TikTok 短视频创作师...
trustLevel: core
allowedTools:
  - cut.trim_clip
  - cut.add_effect
  - timeline.export
requiredSubpackages: [@neko/cut]
compliance:
  approvalRules:
    - tool: timeline.export
      mode: ask
recommendedStages: [plan, apply]   # optional 软提示
---

你是 TikTok 短视频创作师...

## 工作流程

当用户要求创作 TikTok 视频时，通常按以下方式工作；若任务很小，可合并相邻步骤，若风险较高，可多轮回到 Draft / Plan：

1. **理解**：先用 Read 看相关素材，用 Grep 找参考案例
2. **方案**：写 Draft 描述创意方向，列出 3-5 个钩子设计
3. **计划**：把已确认的 Draft 编译为 Plan / Task 清单
4. **执行**：进入 Apply 后用 cut.trim_clip 剪辑核心镜头
5. **导出**：timeline.export 时记得选 9:16 竖屏 / 30fps

## 关键决策点

- 时长控制在 15-30 秒
- 前 3 秒必须有强钩子
- 配合 BGM 节拍点剪切

## 失败处理

- 素材不足时主动建议补充
- 导出失败先检查 timeline 空白片段

## 与其他 Skill 协作

- 需要复杂特效时 spawn `vfx-artist` SubAgent
- 需要分镜方案时切到 `cinematographer` Skill
```

### 2. DSL 边界判定原则

**字段属于 DSL** 当且仅当满足以下**全部**条件：

- ✅ 有非 AI 消费者（程序消费）
- ✅ 必须严格类型化（不能是自由文本）
- ✅ 跨多个 Skill 需要统一 schema

**字段退化为 prompt-chains** 当满足任一条件：

- ✅ 唯一消费者是 AI
- ✅ 内容是创作指导 / 流程描述 / 决策依据
- ✅ AI 应该有自主调整权

按此原则审视 Skill 字段：

| 字段                       | 当前    | 修正后                      | 理由                                |
| -------------------------- | ------- | --------------------------- | ----------------------------------- |
| `name`                     | DSL     | DSL                         | Registry 索引消费                   |
| `version`                  | DSL     | DSL                         | Market 版本管理消费                 |
| `description`              | DSL     | DSL                         | SkillService.match() + AI 双消费    |
| `trustLevel`               | DSL     | DSL                         | 安全分级必须严格 enum               |
| `allowedTools`             | DSL     | DSL                         | ToolInjectionManager 消费（硬约束） |
| `requiredSubpackages`      | DSL     | DSL                         | CapabilityDiscovery 消费            |
| `compliance.approvalRules` | DSL     | DSL                         | ApprovalEngine 消费                 |
| `recommendedStages`        | DSL     | DSL（optional 软提示）      | SkillService.match() 优化           |
| `referencedSkills`         | DSL     | DSL                         | GetContext / SkillService 发现协作 Skill |
| `mediaWorkflow`            | DSL     | DSL（非编排提示）          | 媒体 Skill 发现、过滤、校验和 UI 投影 |
| **`phases`**               | **DSL** | **❌ 退化为 markdown 章节** | 唯一消费者是 AI                     |
| **`pipelines`**            | **DSL** | **❌ 退化为 markdown 章节** | 唯一消费者是 AI                     |

`mediaWorkflow` 是本 ADR 的一个重要边界案例。它可以被程序消费，但只能表达“这个 Skill 适合哪些输入、可能产出哪些结构化 artifact、成本/风险大概如何、send-to 前需要哪些 validator”。它不能表达“先做 A 再做 B”的流程。换句话说，它属于 discovery / validation metadata，不属于 orchestration metadata。

### 3. Stage 信息由 Artifact 状态自然推断

**关键设计**：StagePlanner 不再读 Skill phases，stage 信息由 IDC artifact 文件存在性 + 状态自然推断：

```
draft 阶段     ⇔   .neko/drafts/draft-<runId>.md 存在
plan 阶段      ⇔   .neko/plans/plan-<runId>.md 存在
apply 阶段     ⇔   .neko/tasks/task-<runId>.md 存在 + 有未完成任务
完成           ⇔   所有 task 已 completed
```

`StageTracker` 监听文件系统 + ArtifactWatcher 即可，不需要 Skill 显式声明"现在应该是 draft 阶段"。这恰好对齐 [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) 的"Artifact 驱动 stage 推进"思路——**stage 是 artifact 状态的投影，不是 Skill 的声明**。

### 4. 当前 phases 功能的无损迁移映射

phases 现有的所有"功能"都可以由更优机制承载：

| phases 当前价值            | 替代方案                                                        | 优势                             |
| -------------------------- | --------------------------------------------------------------- | -------------------------------- |
| UI 显示进度                | Task artifact 的 `status` 字段（pending/in_progress/completed） | 颗粒度更细（按 task 而非 phase） |
| 阶段级 approval 门控       | `compliance.approvalRules` 绑定**工具**而非阶段                 | 更精准（工具级 vs 阶段级）       |
| StageTracker 状态推进      | Artifact 文件存在性自然推断                                     | 自然语义，无需显式声明           |
| 调试可见性                 | Journal 记录每个工具调用                                        | 信息更完整                       |
| 用户中断点                 | AbortController + approval mode                                 | 已覆盖                           |
| 跨 Skill 编排（pipelines） | AI 在 body 里描述"如需 X，spawn skill Y"                        | AI 主导更灵活                    |

**结论**：phases 没有真正不可替代的功能。所有"价值"都可由其他机制承载，且**更优**。

### 5. prompt-chains 写作约定（推荐章节）

虽然不是 DSL，仍约定 markdown 章节结构作为最佳实践。这里的“工作流程”是 **IDC 下的轻量化先后指导**：它应让 Agent 知道通常先做什么、后做什么、哪些条件下跳过或回退，但不应让运行时解析成强制状态机。

| 章节                   | 用途                                                | 必填 |
| ---------------------- | --------------------------------------------------- | ---- |
| `## 工作流程`          | 描述 IDC 框架内的典型先后流程、可跳过条件和回退条件 | 推荐 |
| `## 关键决策点`        | 列出判断准则与标准                                  | 推荐 |
| `## 失败处理`          | 常见错误及恢复策略                                  | 推荐 |
| `## 与其他 Skill 协作` | 何时切换 / spawn 其他 Skill                         | 可选 |
| `## 反模式`            | 明确不该做什么                                      | 可选 |
| `## 示例对话`          | few-shot 样本                                       | 可选 |

**关键**：这些章节**不是机器解析的**——AI 阅读后形成认知，用来在 IDC 阶段内安排先后流程。是 prompt-chains 写作惯例（类似 README 的 Installation/Usage 章节惯例），约定俗成而非强制。

### 6. 跨平台互通自然达成

退化 phases 后，neko Skill 与 Claude Code Skill **frontmatter 必填字段完全一致**（name + description）。可选字段差异：

```yaml
# neko Skill (新设计)
---
name: cut-tiktok-creator
description: TikTok 短视频创作师...
allowedTools: [cut.trim_clip] # neko 私有，CC 忽略
trustLevel: core # neko 私有，CC 忽略
compliance: { ... } # neko 私有，CC 忽略
---
你是 TikTok 短视频创作师...
```

```yaml
# Claude Code Skill
---
name: cut-tiktok-creator
description: TikTok 短视频创作师...
---
你是 TikTok 短视频创作师...
```

**互通形态**：

- **neko → CC**：直接复制到 `.claude/skills/`，CC 忽略 neko 私有字段，persona 完整保留 ✅
- **CC → neko**：直接复制到 neko `skills/`，neko 默认 allowedTools 全开 + trustLevel='untrusted'，persona 完整保留 ✅
- **配合 [@neko/mcp-export](#)**：工具引用层互通（前一轮 ADR 讨论） ✅

**不再需要 `x-neko-*` 前缀的复杂兼容方案**——因为没有 phases 这种 neko 私有结构需要承载。

### 7. SubAgent 编排不依赖 pipelines DSL

`pipelines.steps[]` 想要表达的"多 Skill 协作 DAG"，正确做法是 AI 在 body 里描述触发条件：

```markdown
## 与其他 Skill 协作

- 当用户要求复杂视觉特效时，调用 `Task(subagent='vfx-artist')`
  并在 query 里说明"需要为 [shot 描述] 设计粒子特效"
- 当用户对分镜不满意时，切换到 `cinematographer` Skill 重新构图
- 完成剪辑后，可选 spawn `quality-checker` 做最终评审
```

AI 在 think 阶段判断条件并自主调用 Task 工具——这是 §11.5 的标准用法。pipelines DSL 只是把这个判断**提前冻结到 schema**，反而限制 AI 灵活性。

### 8. 不能矫枉过正：哪些仍必须是 DSL

虽然支持 prompt-chains，但**安全/权限边界不能让 AI 在每次激活时重新解析**：

| 反模式                                     | 为什么必须 DSL                                                        |
| ------------------------------------------ | --------------------------------------------------------------------- |
| 把 `allowedTools` 写到 body 里             | ToolInjectionManager 是程序消费，不能依赖 AI 解析 markdown 中的字符串 |
| 把 `compliance.approvalRules` 写成自然语言 | ApprovalEngine 是确定性程序，需要严格 schema                          |
| 把 `requiredSubpackages` 写成 body 提示    | Capability Discovery 期校验需要结构化字段                             |
| 把 `referencedSkills` 写成 body 唯一来源   | GetContext 需要在完整加载 Skill body 前提示候选协作 Skill             |
| 把 `mediaWorkflow` 提示写成 body 唯一来源  | 媒体 Skill 过滤、artifact validator、send-to 启用状态需要确定性元数据 |
| 把 `trustLevel` 写成形容词                 | 安全分级必须严格 enum，AI 解析有概率性误判                            |

**判断标准**：**AI 解析有概率性，安全边界需要确定性**——这是 DSL 与 prompt-chains 的硬分界线。

### 9. 媒体 Skill 的 manifest 写作约定

媒体工作流 Skill 仍遵守 prompt-chain 原则：正文描述怎么工作，manifest 只提供运行时必须提前知道的提示。典型文件结构：

```text
media-to-video/
  SKILL.md        # prompt-chain body: 工作流程、关键决策点、失败处理、与其他 Skill 协作
  manifest.json   # deterministic metadata: discovery, permission, validation hints
```

`manifest.json` 示例：

```json
{
  "version": "1.0.0",
  "domain": "media",
  "referencedSkills": [
    { "id": "comic-to-storyboard", "relationship": "delegator" },
    { "id": "storyboard-to-animation-plan", "relationship": "delegator" }
  ],
  "mediaWorkflow": {
    "acceptedModalities": ["comic", "image", "storyboard"],
    "inputArtifacts": ["storyboard-table"],
    "producedArtifacts": ["storyboard-table", "animation-plan"],
    "tags": ["media-to-video", "storyboard"],
    "costLevel": "medium",
    "riskLevel": "medium",
    "validationRequirements": ["StoryboardTable"],
    "optionalTools": ["ReadImage", "ReadDocumentImage"]
  }
}
```

`SKILL.md` 正文应该说明：

- 输入检查：先判断是漫画文档、独立图片、已有分镜表还是已生成媒体。
- 子 Skill 选择：漫画证据交给 `comic-to-storyboard`，已有分镜交给 `storyboard-to-animation-plan`，需要 Cut payload 时交给 `animation-plan-to-cut`。
- 工具使用：真实读图、OCR、生成、Canvas、Cut、export 必须通过工具结果，不能凭空声称完成。
- 结构化输出：分镜、动画计划、Canvas/Cut payload、执行摘要以 validated structured artifact 为准，markdown 只做说明。
- 媒体引用：只引用真实 tool-result 或 generated asset，不写 base64、绝对缓存路径、blob URL 或编造 id。
- 审批边界：批量生成、上色、破坏性时间线替换、长时间导出必须先确认，除非用户明确要求自动执行且策略允许。

禁止在 `mediaWorkflow` 中出现这些字段：

```json
{
  "mediaWorkflow": {
    "steps": ["inspect", "storyboard", "generate"],
    "routes": [{ "from": "comic", "to": "video" }],
    "workflow": { "start": "comic-to-storyboard" },
    "dag": { "nodes": [], "edges": [] },
    "stages": ["draft", "apply"],
    "priority": 10
  }
}
```

这些字段会把 Skill 重新变成固定流程 DSL。正确写法是把“通常先做什么、什么条件下切换哪个 Skill、哪些步骤可以跳过”写进 `SKILL.md` 的 prompt-chain 章节，让 Agent 在 IDC 和工具反馈中自行调整。

### 10. 新媒体工作流的回归要求

新增媒体流程的默认验收方式是“只加 Skill 文件，发现能力变化”。例如新增 `audio-to-music-video` 时，应先提供：

- `audio-to-music-video/SKILL.md`
- `audio-to-music-video/manifest.json`，声明 `acceptedModalities`、`producedArtifacts`、`referencedSkills`
- registry / loader fixture，证明 GetContext 能看到新 Skill 和 `mediaWorkflow`

只有当现有 Skill runtime 无法发现、懒加载、注入工具、校验 artifact 或投影 send-to action 时，才允许修改 Agent 运行时代码。不得为了新流程新增 `MediaToVideoRouter`、`route catalog`、`flow executor`、`workflow DAG` 或类似固定编排模块。

## 明确不做的事

本 ADR **不包含**：

1. **不引入新的 markdown 编排 DSL**（如 mermaid 图）替代 phases——纯自然语言更符合 §11.5
2. **不动 ProviderCard 的字段设计**——ProviderCard 的 Syntax/Concept/Training Profile 是技术参数，是合法 DSL
3. **不动 Tool / Operation 的 schema 严格度**——§11.6.2 二分原则保留
4. **不在 Skill body 里塞机器可读结构**（如 `<phase id="...">` 标签）——markdown 自由文本就是终态
5. **不要求所有 Skill 必须使用推荐章节**——是惯例非强制
6. **不引入 Skill 编排测试 DSL**——AI 行为测试走端到端，不走 schema 校验

## 结果与影响

### 正面影响

1. **演化能力 Skill 层 A- → A**——纯 markdown，LLM 变强直接受益（[agent-evolution-capacity.md §3.1](./agent-evolution-capacity.md)）
2. **维护成本下降**：去除 phases parser / validator / pipelines DAG 执行器
3. **跨平台互通自然达成**：neko Skill ↔ Claude Code Skill 双向直接复制
4. **§11.5 完美对齐**：AI 真正"原生执行"，不被 DSL 锁死
5. **§11.6.4 完全合规**：不再硬编码 LLM 行为策略
6. **Skill 写作门槛降低**：写自然语言比配置 DSL 容易
7. **AI 自主优化空间**：AI 可在执行中调整顺序，不被预设 phase 序列限制

### 代价与约束

1. **失去"机器可分析编排"的能力**——但实际上从未真正利用过（无下游消费者）
2. **UI 进度展示需切到 Task artifact 颗粒度**——颗粒度变细但需要 UI 适配
3. **Skill 写作惯例需要文档化**——推荐章节标准需要写作指南

### 演化评级影响

| 控制面 / 层                                                                   | 当前 | 本 ADR 后                                                                                                        |
| ----------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| Skill 层（[agent-evolution-capacity.md §3.1](./agent-evolution-capacity.md)） | A-   | **A**                                                                                                            |
| Prompt 平面                                                                   | A    | A（保持）                                                                                                        |
| Schema 平面                                                                   | A    | A（保持）                                                                                                        |
| Orchestration 层                                                              | B+   | A-（DSL 一减反而前进，与 [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) 协同） |

## 后续演进

未公开上线前直接清理 legacy schema，避免形成兼容承诺。剩余演进只保留面向新格式的增强项。

| Stage    | 目标                                                              | 工作量 | 依赖     |
| -------- | ----------------------------------------------------------------- | ------ | -------- |
| **完成** | 删除旧 phase 类型 / manifest 字段 / validator / runtime inference | —      | —        |
| **后续** | 新 Skill 写作指南；官方模板统一 prompt-chain 章节                 | 0.5-1d | —        |
| **后续** | Marketplace 模板与审核指南：不再引导 workflow DSL 字段            | 0.5d   | 模板稳定 |

### 回滚策略

本字段尚未公开上线，直接删除 legacy parser/schema，不提供 `phases` 回滚开关，避免把错误抽象固化成实验维度。若未来需要对比，只能通过独立分支或 fixture 重放历史实现，不进入生产配置。

### 推荐 Skill 写法示例

```yaml
---
name: cut-tiktok-creator
description: TikTok 短视频创作师。Use when creating short-form vertical videos.
allowedTools:
  - cut.trim_clip
  - cut.export_mp4
compliance:
  approvalRules:
    - tool: cut.export_mp4
      mode: ask
---
```

正文：

```yaml
---
name: cut-tiktok-creator
## 工作流程

按以下方式工作：

1. **Review 阶段**：先生成 Draft 描述创意方向（需用户审批后继续）
2. **Edit 阶段**：写 Plan 列出剪辑步骤，逐步执行 Apply
3. **Export 阶段**：导出前向用户确认参数
```

## 反模式清单

| #   | 反模式                                                | 为什么错                                                      |
| --- | ----------------------------------------------------- | ------------------------------------------------------------- |
| 1   | 把 phases 字段保留但内容写空                          | 作为 "我已经迁移" 的伪装；应彻底删除字段                      |
| 2   | 把 allowedTools 写到 body markdown 里                 | 安全约束需要程序消费，不能依赖 AI 解析                        |
| 3   | 在 body 里塞 `<phase>` 自定义标签                     | 把 DSL 隐藏在 markdown 里，没解决问题                         |
| 4   | 用 mermaid 图描述工作流                               | mermaid 是结构化 DSL 的另一种表达，违反 §11.5                 |
| 5   | 推荐章节强制必填                                      | 是惯例非强制，强制等于变相 DSL                                |
| 6   | 把 stage 名字写死在 body 里（"必须先 Draft 再 Plan"） | 锁死 IDC 三阶段，AI 应能跳过简单情况的 Draft                  |
| 7   | 把"工作流程"章节写成不可跳过的硬顺序                  | 推荐写成 IDC 下的典型先后流程，并说明可合并 / 跳过 / 回退条件 |
| 8   | StagePlanner 还读 phases 字段                         | 应该改为读 artifact 状态（决策 3）                            |
| 9   | UI 仍按 phases 渲染进度                               | 应该改为渲染 task status                                      |
| 10  | 把 SubAgent 协作做成 pipelines DSL                    | 应让 AI 在 body 描述触发条件                                  |
| 11  | 重新引入"轻量编排 DSL"（如 YAML 工作流）              | §11.5 的根本问题不在重不重，在 DSL vs 自然语言                |
| 12  | 把现有 phases 视为"高级特性"保留给老用户              | 未上线前不保留兼容债务，应直接移除                            |

## 与其他 ADR 的关系

本 ADR 合入后需同步更新：

| ADR                                                                              | 更新内容                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [agent-unified-workflow.md §5.2](./agent-unified-workflow.md)                    | 移除 phases / pipelines 字段示例；新增 Skill prompt-chain 写作惯例                          |
| [agent-unified-workflow.md §11.6.4](./agent-unified-workflow.md)                 | 反模式 #4 增补"phases / pipelines DSL"作为具体实例                                          |
| [agent-evolution-capacity.md §3.1](./agent-evolution-capacity.md)                | Skill 层评级 A- → A；§3.3 Orchestration 评级同步抬升                                        |
| [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) | StagePlanner 实现说明：只读 artifact 状态                                                   |
| [agent-multi-agent-federation.md](./agent-multi-agent-federation.md)             | SubAgent 编排原则：靠 AI 在 body 描述触发条件，非 pipelines DSL                             |
| [adr-capability-protocol.md](./adr-capability-protocol.md)                       | CapabilityContribution.skillFiles 期望的 Skill 格式更新（去除 phases / pipelines 字段示例） |
| [adr-provider-expression-context.md](./adr-provider-expression-context.md)       | 不受影响——ProviderCard 的字段是技术参数，是合法 DSL                                         |
| [marketplace.md](./marketplace.md)                                               | Skill 分发审核标准：不再引导 workflow DSL 字段                                              |

### 不纳入本 ADR 的延伸议题

以下属于本 ADR 的自然延伸，但不在当前范围：

1. **Skill 写作 Linter**——检测反模式（如 body 里塞 `<phase>` 标签）
2. **Skill 质量评分**——基于推荐章节覆盖度的健康度指标
3. **Skill 跨平台格式标准**——与 Anthropic 协商扩展 Skill schema（远期生态合作）
4. **Skill 行为回归测试框架**——AI 行为测试走端到端，不在本 ADR 设计范围
5. **AI 自主跳过 IDC 阶段的判定逻辑**——属于 [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) StageController 范围
6. **Skill 编排可视化**——若仍需要"看 Skill 怎么工作"，应基于 Journal 重放而非静态 phases 解析

---

**核心承诺**：本 ADR 把 neko Skill 从"半 DSL 半自然语言"修正为"安全/权限 DSL + IDC 下的轻量工作流 prompt-chains"——前者是程序必需的硬约束（allowedTools / compliance / trustLevel），后者让 AI 在 IDC 框架内理解领域流程、判断执行先后、按任务复杂度合并 / 跳过 / 回退（§11.5 AI 原生执行）。退化 phases / pipelines 后，**演化能力 Skill 层 A- → A、跨平台互通自然达成、维护成本下降、§11.5 / §11.6.4 完美对齐**——是架构上的纯收益修正，对齐 Claude Code 实证经验，关闭"对称美学诱导债"的最后入口。
