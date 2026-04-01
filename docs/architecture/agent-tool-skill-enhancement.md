# neko-agent 工具/技能/MCP 系统增强方案

> 对标 [claude-code-analysis](https://github.com/liuup/claude-code-analysis) 的 Tool Call / Skills / MCP 实现，结合 AI 图文音视频创作场景的增强需求。

---

## 对比基线：neko-agent vs Claude Code

### Tool 系统

| 维度 | Claude Code | neko-agent | 差距 |
|------|-------------|------------|------|
| Tool 抽象 | 20+ 方法的运行时协议：`call()` + `isConcurrencySafe()` + `isReadOnly()` + `isDestructive()` + `checkPermissions()` + `renderToolUseMessage()` + `interruptBehavior()` | `Tool` 接口：`name` + `description` + `parameters` + `category` + `execute()` | neko 较薄，缺并发/安全/UI 渲染协议 |
| 工具构建 | `buildTool()` 强制 Fail-Closed 默认值（并发不安全、非只读） | 无统一构建函数 | 缺安全默认值策略 |
| 工具池组装 | `assembleToolPool()` 内建 + MCP 融合，`uniqBy` 内建优先 | `ToolInjectionManager` 两层注入（always + dynamic） | neko 分层更灵活，缺冲突解决 |
| 并发调度 | `partitionToolCalls()` 按 `isConcurrencySafe()` 自动分批 | `AgentExecutor` 顺序执行 | **关键缺失** |
| Streaming 执行 | `StreamingToolExecutor` 状态机（queued→executing→completed→yielded） | 无 | 缺失 |
| 输入校验 | 三层：Zod schema → `validateInput()` → `backfillObservableInput()` | 单层：参数直接传给 `execute()` | 缺 schema 校验和语义校验 |
| 错误回流 | schema 校验失败 → 异常栈返回 LLM 自动纠正重试 | `ToolResult.error` 返回 | 缺自动重试引导 |
| Hook 管线 | `runPreToolUseHooks()` 可拦截 + 可修改 input | `ExecutorHooks.onToolCall()` | Claude Code 的 Hook 能动态修改输入 |

### Skill 系统

| 维度 | Claude Code | neko-agent | 差距 |
|------|-------------|------------|------|
| 技能格式 | `SKILL.md` YAML + Markdown | `SKILL.md` YAML + Markdown | 基本一致 |
| 来源 | File-based + Bundled + MCP Skills | File-based + Builtin + MCP | 结构一致 |
| 发现机制 | 多目录并行扫描 + `memoize` + inode 去重 | `SkillLoader.loadLazy()` 懒加载 | neko 懒加载更高效，缺多层目录和 memoize |
| frontmatter | `name`, `description`, `when_to_use`, `allowed_tools`, `model`, `effort`, `user_invocable`, **`paths`**, `shell`, `context`, `agent` | `name`, `description`, `command`, `enabled`, `allowedTools`, `model`, `supportsArguments` | **缺 `paths`（条件触发）、`effort`、`shell`** |
| 条件触发 | `paths` 字段 — 文件变更自动激活 | 无 | **关键缺失** |
| 内嵌 Shell | `` !`command` `` 语法，prompt 注入前执行 Shell | 无 | 缺失 |
| 变量替换 | `$ARGUMENTS`, `$1`-`$99`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_SESSION_ID}` | `$ARGUMENTS`, `$1`-`$99` | 缺内置环境变量 |
| 注入机制 | 单轨：直接注入 prompt | 三轨原子注入：Prompt + Permission + ToolGuard | **neko 更强** |
| 状态管理 | `Command` 无状态 | `SkillInjectionCoordinator` 原子 apply/remove | **neko 更完善** |
| 工具限制 | `allowed_tools` frontmatter 声明 | `allowedTools` + `ToolGuard` 运行时强制 | **neko 更严格** |

### MCP 系统

| 维度 | Claude Code | neko-agent | 差距 |
|------|-------------|------------|------|
| 传输协议 | 4 种：stdio / SSE / WebSocket / Streamable HTTP | 抽象接口 | Claude Code 更完整 |
| 连接管理 | `connectToServer()` + `memoize` + 连接复用 | `MCPManager.connect()` + 连接池 | 结构类似 |
| 命名规范 | `mcp__${serverName}__${toolName}` | `MCPToolWrapper` 适配 | 缺统一命名规范 |
| 并发控制 | `pMap` 本地 3 / 远程 20 | 无显式并发控制 | 缺失 |
| 认证 | OAuth + Step-up + 15min Auth Cache 防雪崩 | 无 | 缺失（VSCode 场景可能不需要） |
| Session 重连 | HTTP 404 + JSON-RPC -32001 → 自动重连 | 无 | 缺失 |
| 描述截断 | `MAX_MCP_DESCRIPTION_LENGTH = 2048` | 无 | 缺失 |
| 超时控制 | `wrapFetchWithTimeout()` | 无 | 缺失 |

### neko-agent 的优势（保持并强化）

1. **三轨原子注入**（SkillInjectionCoordinator）— Prompt + Permission + ToolGuard 协调 + 回滚
2. **两层工具注入**（always + dynamic）— 独立 token 预算
3. **四级权限系统** — Skill 级 → Permission 规则 → ToolTraits → Settings Hook
4. **懒加载 Skill** — 只加载 frontmatter，内容按需
5. **语义匹配**（SkillMatcher）— 关键词相关度自动发现
6. **SystemPromptComposer** — 分层 prompt 合成 + token 预算管理

---

## 创作场景增强需求

### P0 — 直接影响创作质量和效率

#### 1. Tool 并发安全声明 + 分批调度

**痛点**：Pipeline `batchGenerate` 阶段并发 3-5 个 AI 生成任务，当前 `AgentExecutor` 顺序执行。

```
当前：GenerateImage(scene1) → GenerateImage(scene2) → GenerateImage(scene3)  // 串行
期望：[GenerateImage(scene1), GenerateImage(scene2), GenerateImage(scene3)]  // 并行
      ↓
      ArrangeOnTimeline(results)  // 串行（依赖前面结果）
```

**方案**：
- `Tool` 接口新增 `isConcurrencySafe(): boolean`（默认 false）
- `Tool` 接口新增 `isReadOnly(): boolean`（默认 false）
- `AgentExecutor` act-phase 按标记自动分批：安全的并发、不安全的串行
- 创作工具标记：
  - 并发安全：`GenerateImage` / `GenerateVideo` / `GenerateTTS` / `GenerateMusic` / `GenerateCharacter`
  - 只读安全：`GetTimelineInfo` / `ListElements` / `GetKeyframes` / `ListEffects`

**对标**：Claude Code `partitionToolCalls()` + `isConcurrencySafe()`

#### 2. Tool 输入 Schema 校验 + LLM 重试引导

**痛点**：LLM 调用 `GenerateVideo` 参数错误（如 `duration: "10s"` 而非 `duration: 10`），当前直接失败，不引导重试。

**方案**：
- `ToolRegistry.execute()` 前加 Zod schema 校验
- 校验失败 → 错误信息（含期望格式）作为 `tool_result` 回流 LLM → 自动纠正
- 对创作工具特别重要：参数组合复杂（resolution + aspectRatio + fps + duration 合法组合）

**对标**：Claude Code 三层校验（Zod → `validateInput()` → `backfillObservableInput()`）

#### 3. Skill 内嵌 Shell（`!`command`` 语法）

**痛点**：Skill 无法获取实时上下文。「自动配乐」skill 需要先知道时间线长度和场景列表。

**方案**：
```markdown
---
name: scene-to-music
description: auto-score scenes with matching BGM
---
Current timeline:
!`neko-cli timeline info --json`

Scene list:
!`neko-cli timeline list-scenes --format brief`

Generate matching BGM for each scene based on mood analysis.
```

- `SkillInjector` 增加 Shell 替换（复用 `BashTool`）
- MCP 来源跳过执行（安全隔离）
- 创作场景常用：获取时间线状态、资产清单、项目配置

**对标**：Claude Code `executeShellCommandsInPrompt()`

---

### P1 — 提升创作工作流智能化

#### 4. Skill 条件触发（`paths` 字段）

**痛点**：编辑 `.fountain` 剧本后需手动调用 `/script-to-timeline`。

**方案**：
```yaml
---
name: script-to-timeline
paths: ["**/*.fountain", "**/*.fdx"]
---
```

- frontmatter 加 `paths: string[]`
- 监听 `vscode.workspace.onDidSaveTextDocument`
- 文件匹配时自动激活 skill 并注入上下文
- 典型触发规则：
  - `*.fountain` → 剧本转时间线
  - `*.nkv` → 时间线诊断
  - `*.cbz` / `*.cbr` → 漫画转分镜
  - `storyboard.json` → 分镜转视频

**对标**：Claude Code `paths` 字段 — 条件 Skill Hook 订阅

#### 5. 长时间任务 Progress Streaming

**痛点**：`GenerateVideo` 运行 30-120 秒无进度反馈；Pipeline 批量生成 20 个场景，总耗时 10+ 分钟。

**方案**：
- `Tool` 接口加 `onProgress?: (progress: ToolProgress) => void`
- `ToolProgress`: `{ percent: number, stage: string, preview?: string }`
- `AgentSession` 将 progress 作为 `AgentEvent` 流式推送 UI
- Pipeline 级聚合：`5/20 scenes completed, 2 failed, ETA ~3min`

**对标**：Claude Code `ToolCallProgress<P>` + `onProgress` 回调

#### 6. MCP 描述截断 + 连接健壮性

**痛点**：ComfyUI MCP Server 工具描述可能非常长（workflow JSON schema），占大量 context。

**方案**：
- `MCPToolWrapper` 转换时截断 `description` 到 2048 字符
- `MCPManager.connectAll()` 加并发限制（本地 3 / 远程 10）
- 加 session 过期检测 + 自动重连

**对标**：Claude Code `MAX_MCP_DESCRIPTION_LENGTH` + `pMap` + `isMcpSessionExpiredError()`

#### 7. 创作迭代版本锚点

**痛点**：用户说「回到之前那个暖色调版本」，需追溯历史版本。

**方案**：
- `CreativeSummarizer` P3（version_anchor）关联到实际生成参数快照
- `AgentSession` 维护 `CreativeVersionLog`：每次 AI 生成的参数 + 结果路径 + 用户评价
- 支持 `/rollback [version-id]` 恢复到某锚点参数重新生成

---

### P2 — 打磨创作体验

#### 8. 多模态 Tool Result

**痛点**：`GenerateImage` 返回文件路径，LLM 无法「看到」结果来判断质量。

**方案**：
- `ToolResult` 支持 `attachments: Array<{ type: 'image'|'audio'|'video', path: string }>`
- 生成类工具自动附加结果预览
- LLM 视觉能力评估质量 → 不合格自动重试
- 与 `QualityCheck` 协同：自动质检 → 不合格 → 调参重试

#### 9. Tool Fail-Closed 默认值 + 创作安全分级

**痛点**：`DeleteElement` 不可逆但无安全标记。

**方案**：
- `buildTool()` 工厂函数，默认保守（`isDestructive: false`, `isConcurrencySafe: false`）
- 创作工具分级：

| 级别 | 工具示例 | 标记 |
|------|---------|------|
| 安全只读 | `GetTimelineInfo`, `ListElements`, `GetKeyframes` | `isReadOnly: true`, `isConcurrencySafe: true` |
| 安全写入 | `AddElement`, `AddKeyframe` | 可撤销 |
| 破坏性写入 | `DeleteElement`, `DeleteTrack` | `isDestructive: true`，需确认 |
| AI 生成 | `GenerateImage`, `GenerateVideo` | `isConcurrencySafe: true`，消耗资源 |

#### 10. SubAgent 创作专家

**痛点**：复杂创作任务（如「把 10 分钟 vlog 重剪为 3 个精华片段」）需多轮规划 + 执行。

**方案**：
- 支持 SubAgent 模式：主 Agent 调用创作 SubAgent
- SubAgent 独立 context window + tool 权限
- 已规划的 SubAgent Skills：
  - Seed Manager（种子一致性管理）
  - Audio Mixer（专业混音）
  - Camera Language（镜头语言专家）

**对标**：Claude Code `AgentTool` — 启动子 Agent 独立执行任务

---

## 实施路线

```
Phase A (P0, 基础能力补齐) ✅ COMPLETED 2026-04-01:
├─ A.1 Tool 接口扩展 (isConcurrencySafe/isReadOnly/isDestructive)  ✅
│   ├─ Tool 接口新增 3 个安全元数据字段 (Fail-Closed 默认 false)
│   ├─ ToolResult 新增 validationErrors + attachments
│   ├─ ToolProgress + ToolExecuteOptions 类型定义
│   ├─ BuiltinTool 基类 + createTool() 工厂支持新字段
│   └─ 所有现有工具已标记 (Read/Grep→readOnly, Write/Bash→destructive, Generate*→concurrencySafe)
├─ A.2 AgentExecutor 并发分批调度 (partitionToolCalls)  ✅
│   ├─ partitionToolCalls() 纯函数 (executor/partition-tool-calls.ts)
│   ├─ act-phase.ts: 安全工具 Promise.allSettled 并行 → 不安全工具顺序执行
│   └─ 7 单测通过
├─ A.3 Schema 校验 + LLM 错误重试引导  ✅
│   ├─ schema-validator.ts: 轻量 JSON Schema 子集校验 (~160 LOC, 无 Zod 依赖)
│   ├─ ToolRegistry.execute() 前自动校验，结构化错误引导 LLM 自动纠正
│   └─ 21 单测通过
└─ A.4 SkillInjector Shell 替换  ✅
    ├─ shell-replacer.ts: !`command` 模式替换 (execFile, 5s 超时)
    ├─ injectSkill() sync→async，变量替换后执行 Shell
    ├─ SkillFrontmatter 新增 shell/paths 字段
    └─ 6 单测通过

Phase B (P1, 智能化增强): ✅ COMPLETED
├─ B.1 Auto-Compact 熔断器 ✅
│   ├─ auto-compact.ts: 纯函数 + 熔断器 (3次失败熔断, 30min 冷却)
│   ├─ AgentSession.execute() 每步后检查 shouldCompress → 自动压缩
│   ├─ 压缩后 _syncSystemPrompt() 重注入 Skill + ToolSet
│   └─ 9 单测通过
├─ B.2 ToolProgress streaming ✅
│   ├─ AgentEventType 新增 'tool_progress'
│   ├─ AgentEvent.toolProgress: toolCallId/toolName/percent/stage/preview
│   ├─ ToolRegistry.execute() 传递 ToolExecuteOptions(onProgress)
│   ├─ act-phase 收集 ToolProgressEvent → AgentStep.toolProgress
│   ├─ step-event-converter 先 yield progress 再 yield result
│   └─ 4 新增单测通过
├─ B.3 MCP 健壮性 ✅
│   ├─ MCPTool 描述截断 2048 字符 (truncateDescription)
│   ├─ MCPManager.callTool() 自动重连 (disconnect → reconnect → retry)
│   ├─ MCPManager.connectAll() 并发限制 (batch 3)
│   └─ 8 新增单测通过 (mcp-tool 5 + mcp-manager 3)
├─ B.4 Skill paths 条件触发 ✅
│   ├─ path-matcher.ts: globMatch + matchSkillPaths 纯函数 (无外部依赖)
│   ├─ Skill 接口新增 paths?: string[]，createSkill() 映射 frontmatter.paths
│   ├─ SkillFileService: onDidSaveTextDocument → matchSkillPaths → emit onSkillPathTriggered
│   └─ 11 单测通过
└─ B.5 多模态 ToolResult attachments ✅
    ├─ buildToolResultMessages: attachments → ContentPart[] (image → ImagePart, audio/video → 文本引用)
    ├─ AgentEvent.toolResult 新增 attachments 字段
    ├─ step-event-converter 传递 attachments
    └─ 4 新增单测通过

Phase C (P2, 体验打磨):
├─ C.1 buildTool() 工厂 + 安全分级
├─ C.2 Session 持久化 JSONL
└─ C.3 Prompt Cache Boundary
```

---

## 深度对标：Claude Code 全架构中的创作场景参考

> 以下分析来自 [claude-code-analysis](https://github.com/liuup/claude-code-analysis) 的架构总览、Memory、Context、Prompt、Multi-Agent、Sandbox、Session Storage 七篇文档。

### 一、Multi-Agent 架构 → 创作协作系统

Claude Code 有三层并存的多 agent 模型，对创作场景高度参考：

| Claude Code 模型 | 创作场景映射 | neko-agent 现状 |
|-----------------|-------------|----------------|
| **SubAgent** — 主 agent 派出独立子代理，继承上下文和工具池 | Pipeline 中的独立生成任务（每个场景的视频生成） | 无 SubAgent 机制 |
| **Coordinator Mode** — 主线程变成调度器，worker 做具体执行 | Pipeline orchestrator：主 agent 规划分镜 → 多个 worker 并行生成 → 主 agent 汇总排列 | Pipeline 有类似概念但未接入 agent 层 |
| **Swarm Teammates** — 显式 team + mailbox + shared task list | 协作创作：导演 agent + 摄影 agent + 配乐 agent + 剪辑 agent | 无 |

**关键设计值得借鉴**：

1. **Coordinator 显式分相**：Research → Synthesis → Implementation → Verification

   创作映射：场景分析 → 提示词生成（用户确认 gate）→ 并行媒体生成 → 质检/重试

2. **Worker 结果回流为 `<task-notification>`**（XML 格式的结构化事件）

   创作映射：每个生成任务完成后以结构化事件通知 coordinator：
   ```xml
   <task-notification>
     <task-id>scene-3-video</task-id>
     <status>completed</status>
     <result>{ "path": "/output/scene3.mp4", "duration": 4.2 }</result>
   </task-notification>
   ```

3. **In-process teammate**：用 `AsyncLocalStorage` 在同一进程隔离多个 agent 上下文

   创作映射：VSCode Extension Host 是单进程，多个创作 SubAgent 需要同进程隔离。可直接复用此模式。

4. **Teammate 权限桥接**：teammate 的权限 ask 回流到 leader 的 UI，不独立弹窗

   创作映射：当子 agent 的 `GenerateVideo` 需要确认（费用/质量），统一回到主 agent 的确认队列。

5. **Shared Task List + claim 机制**：

   创作映射：Pipeline 的 20 个场景 = 20 个 task，多个 worker agent 从 task pool 中 claim → execute → report。

**增强建议 (P1)**：

```
Phase B.5: Creative Coordinator Mode
├─ B.5.1 AgentTool 统一入口（复用 Claude Code 的 subagent/teammate 路由逻辑）
├─ B.5.2 Coordinator prompt 模板（创作分相：分析→生成→质检→排列）
├─ B.5.3 In-process SubAgent 隔离（AsyncLocalStorage）
├─ B.5.4 Task notification 结构化回流
└─ B.5.5 Leader permission bridge（统一确认 UI）
```

---

### 二、Memory 系统 → 创作记忆与风格持久化

Claude Code 的四层 Memory 对创作场景映射：

| Memory 层 | Claude Code 用途 | 创作场景用途 |
|-----------|-----------------|-------------|
| **Auto Memory** | 用户/项目长期偏好 | 用户审美偏好（暖色调、电影感、16:9）、常用提示词模板、喜欢的配乐风格 |
| **Session Memory** | 当前会话摘要（后台 forked subagent 提取） | 当前创作会话的迭代历史摘要（已确认的风格、已生成的资产清单） |
| **Agent Memory** | 某类 agent 的专属长期记忆（user/project/local 三 scope） | 创作 agent 的领域知识（「这个项目的角色一致性种子」「用户常用的转场风格」） |
| **Relevant Recall** | 轻量检索器，每轮只选 ≤5 个相关 memory | 从历史创作 memory 中选取与当前任务相关的（如当前做科幻片 → 召回科幻风格 memory） |
| **Agent Memory Snapshot** | agent memory 可随项目分发和升级 | 创作模板项目可以内置 agent memory（预配的风格偏好、预设的工作流） |

**关键设计值得借鉴**：

1. **Memory 是文件化的**（MEMORY.md 索引 + 独立 topic 文件），不是隐藏数据库。用户可以直接浏览和编辑。

   创作映射：用户可以直接查看和编辑 agent 记住的风格偏好。

2. **Session Memory 由后台 forked subagent 提取**，不阻塞主线程。subagent 权限被严格限制为只能 `FileEditTool` 操作特定路径。

   创作映射：长时间创作会话中，后台 agent 自动提取「已确认的视觉风格」「已生成的资产清单」作为 session memory。

3. **Agent Memory Snapshot 机制**：snapshot 可以随项目分发，新用户 clone 项目后 agent 自动获得初始记忆。

   创作映射：「科幻短片模板项目」可以内置预配的 agent memory（角色设定、视觉风格、配乐偏好），用户开箱即用。

4. **Relevant Recall 不是全塞 prompt**：用轻量模型从 manifest（文件名+描述）中选 ≤5 个最相关的 memory 文件。

   创作映射：创作 agent 可能积累了大量 memory，每轮只召回与当前任务最相关的（避免 token 浪费）。

**增强建议 (P2)**：

```
Phase C.4: Creative Agent Memory
├─ C.4.1 三 scope memory（user: 跨项目风格偏好 / project: 本项目角色设定 / local: 本次创作记录）
├─ C.4.2 Session Memory 后台提取（forked subagent 自动摘要创作决策）
├─ C.4.3 Agent Memory Snapshot（创作模板预置 memory）
└─ C.4.4 Relevant Recall（每轮选取最相关的创作 memory）
```

---

### 三、Context 管理 → 创作长会话生存

Claude Code 的 Context 管理对创作场景至关重要，因为创作会话通常非常长。

**关键机制**：

1. **Auto-Compact 双重保护**：
   - 缓冲界限：上下文还剩 13K tokens 时触发压缩
   - 熔断机制：连续压缩失败 3 次 → 停止该会话的自动压缩（避免死循环 API 调用）

   创作映射：Pipeline 生成 20 个视频后，tool_result 可能占满 context → 需要自动压缩。

2. **Session Memory 直挂 Compact**：如果已有 Session Memory，压缩时**不再调 API 生成摘要**，而是直接用 Session Memory 文件作为断点。

   创作映射：`CreativeSummarizer` 已有分类摘要 → 可以直接作为 compact 的摘要源，不浪费额外 API 调用。

3. **状态重建补偿（State Re-injection）**：compact 后自动重新注入：
   - 当前打开的文件（FileAttachments）
   - 活跃的 Plan
   - 所有 MCP/外部工具声明

   创作映射：compact 后需要重新注入：
   - 当前时间线状态
   - 活跃的 Pipeline 进度
   - 已生成的资产清单
   - 活跃的 Skill 和 ToolSet

4. **PTL（Prompt Too Long）防御**：压缩请求本身太大 → 每次剥掉 20% 旧消息重试。

   创作映射：创作会话中可能有大量图片 attachment → 压缩前先 `stripImagesFromMessages()`。

**增强建议（已部分覆盖在 CreativeSummarizer 中，需要补强）**：

```
Phase B.6: Creative Context Survival
├─ B.6.1 Auto-Compact 熔断器（避免 compact 死循环）
├─ B.6.2 CreativeSummarizer 直挂 Compact（不额外调 API）
├─ B.6.3 Compact 后状态补偿（时间线/Pipeline/资产/ToolSet 重注入）
└─ B.6.4 PTL 防御（图片/视频预览先剥离再压缩）
```

---

### 四、Prompt 管理 → 创作 Prompt Runtime

Claude Code 的 Prompt 是一套 6 层 runtime，不是固定字符串：

| 层 | 作用 | 创作映射 |
|----|------|---------|
| 1. 默认 system prompt（静态段 + 动态段） | agent 身份和规则 | 创作 agent 的角色定义 + 创作规则 |
| 2. Effective prompt 组装器 | override > coordinator > agent > custom > default + append | 不同创作模式切换（视频编辑/配乐/字幕） |
| 3. 运行时 context 注入 | CLAUDE.md + currentDate + git status | 项目 context + 当前时间线状态 |
| 4. 启动期 addendum | CLI 参数 + proactive mode | Pipeline 模式 + 创作偏好注入 |
| 5. Prompt 缓存 | section cache + dynamic boundary | 静态段缓存 + Skill 注入在 boundary 之后 |
| 6. 专项 prompt | compact / session memory / memory extraction | 创作摘要 / 质检报告 / 版本对比 |

**关键设计值得借鉴**：

1. **`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`**：把 prompt 分为「可缓存的静态前缀」和「每轮变化的动态后缀」，利用 API 的 prompt prefix cache。

   创作映射：neko-agent 的 `SystemPromptComposer` 已有分层（base → skill → environment → ephemeral），可以在 base 和 skill 之间插入 cache boundary。

2. **专项 prompt 严格约束**：compact prompt 直接写 `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.`

   创作映射：质检 prompt、版本对比 prompt 也应该严格约束（只返回 JSON 评分，不调用工具）。

3. **Prompt 可观测性**：`dump-prompts` 把完整 API 请求落到 JSONL，`/context` 可以查看每个 section 的 token 消耗。

   创作映射：调试创作 agent 时需要知道 prompt 成本分布（base prompt vs skill 注入 vs 时间线 context）。

**增强建议 (P2)**：

```
Phase C.5: Prompt Cache Optimization
├─ C.5.1 SystemPromptComposer 加 cache boundary（base 段缓存）
├─ C.5.2 专项 prompt 模板（质检/版本对比/摘要提取 — 严格无工具）
└─ C.5.3 Prompt 可观测性（section token 统计 + dump 审计）
```

---

### 五、Session Storage / Resume → 创作会话持久化

Claude Code 的会话持久化是 append-only JSONL 事件流，不是快照：

**关键设计值得借鉴**：

1. **Append-only JSONL + 恢复时修复**：写入极简（只追加），复杂性压到恢复路径。

   创作映射：Pipeline 执行过程中如果 VSCode 崩溃，恢复时需要从 JSONL 重建 Pipeline 状态。

2. **Metadata 尾部重挂**：title/tag/mode/worktree 等元数据定期重挂到文件尾部，使列表页可以只读头尾 64KB。

   创作映射：创作会话的元数据（项目名/Pipeline 状态/生成资产数量）应定期重挂到尾部。

3. **SubAgent sidechain transcript**：子 agent 的 transcript 写入独立 JSONL，不和主链混写。

   创作映射：Pipeline 中每个生成任务的 agent 有独立 transcript，主 agent 保持干净。

4. **Resume 是运行时状态接管**：恢复的不只是消息，还有 sessionId、agent identity、worktree、permission context、Plan 状态。

   创作映射：恢复创作会话时需要重建：Pipeline 状态、已生成资产清单、活跃 Skill、时间线快照。

5. **Resume 会检测中断 turn 并注入 `Continue from where you left off.`**

   创作映射：Pipeline 执行到一半中断 → 恢复时注入「Pipeline 执行了 12/20 个场景，3 个失败，请继续」。

**增强建议 (P2)**：

```
Phase C.6: Creative Session Persistence
├─ C.6.1 Pipeline 状态持久化（append-only，可从 JSONL 重建 Pipeline 进度）
├─ C.6.2 SubAgent sidechain（每个生成任务独立 transcript）
├─ C.6.3 Resume 创作状态接管（Pipeline/资产/Skill/Timeline 重建）
└─ C.6.4 中断恢复提示（注入 Pipeline 执行进度上下文）
```

---

### 六、Sandbox → 创作工具安全

Claude Code 的 Sandbox 与创作场景的关系较间接，但有一个关键参考：

**`excludedCommands` + `autoAllowBashIfSandboxed`**：sandbox 内的命令默认放行（不弹权限），但显式 deny/ask 规则仍然优先。

创作映射：AI 生成工具（调用外部 API）应该有类似分级：
- 低成本生成（TTS、缩略图）→ auto-allow
- 高成本生成（4K 视频、长视频）→ ask 确认
- 破坏性操作（删除已生成资产）→ deny by default

这与 P2.9 Tool 安全分级 + P1.5 Permission Creative Analysis 已有的方案一致。

---

## 更新后的完整实施路线

```
Phase A (P0, 基础能力补齐) ✅ COMPLETED 2026-04-01:
├─ A.1 Tool 接口扩展 (isConcurrencySafe/isReadOnly/isDestructive)  ✅
├─ A.2 AgentExecutor 并发分批调度 (partitionToolCalls)  ✅
├─ A.3 Schema 校验 + LLM 错误重试引导 (轻量 JSON Schema, 无 Zod)  ✅
└─ A.4 SkillInjector Shell 替换 (!`command` 语法)  ✅

Phase B (P1, 智能化增强) ✅ COMPLETED 2026-04-01:
├─ B.1 Auto-Compact 熔断器（auto-compact + 熔断器 + 状态补偿）  ✅
├─ B.2 ToolProgress streaming（onProgress callback → AgentEvent）  ✅
├─ B.3 MCP 健壮性 (描述截断 + 自动重连 + 并发限制)  ✅
├─ B.4 Skill paths 条件触发（globMatch + onDidSave → 自动激活）  ✅
├─ B.5 多模态 ToolResult attachments（image/audio/video → ContentPart[]）  ✅
├─ B.6 Creative Coordinator Mode（SubAgent + task notification + permission bridge）
└─ B.7 CreativeVersionLog 版本锚点

Phase C (P2, 体验打磨):
├─ C.1 buildTool() 工厂 + 安全分级
├─ C.2 Session 持久化 JSONL（append-only + sidechain + resume）
├─ C.3 Prompt Cache Optimization（boundary + 专项模板 + 可观测性）
├─ C.4 Creative Agent Memory（三 scope + snapshot + relevant recall）
└─ C.5 SubAgent 创作专家模式
```

---

## 架构理念对比

```
Claude Code:
├─ Pipeline 管线模式 — 多层包装（schema→语义→hook→权限→执行）
├─ Fail-Closed 安全 — 一切默认不安全，显式声明放行
├─ Transcript 唯一真理 — 所有结果标准化为对话流回流模型
└─ 工具即协议对象 — Tool 是完整的运行时契约

neko-agent:
├─ 注册表模式 — 四个 Registry 分离关注点
├─ 分层注入 — always + dynamic 双层 + token 预算
├─ 三轨协调 — Prompt/Permission/Guard 原子操作
└─ 契约优先 — 接口定义先行，实现后置

核心差异：
Claude Code 是成熟的生产系统，工程打磨深（并发/恢复/认证）
neko-agent 架构设计更现代，关注点分离和状态管理更优，工程打磨需补强
```
