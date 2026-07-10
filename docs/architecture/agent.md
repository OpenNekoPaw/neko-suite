# Agent 横切架构

更新日期：2026-07-09

Agent 是 Neko Suite 的横切创作智能层，不是一个创作领域。它为视频、音频、模型、2D 和互动创作提供意图理解、计划、工具调用、上下文压缩、审阅和修复能力。

## 设计目标

- 让 Agent 能组合各创作领域能力，而不直接耦合 Webview 或子包实现。
- 将 Prompt、Skill、Tool、Memory、Provider、Approval、Evaluation 分成可测试控制面。
- 让 Agent 产出的媒体、实体和项目事实重新接地到 Assets、Entity、Search、Engine 或领域格式。

## 核心原则

- Agent-first：创作意图先进入 Agent runtime，由 runtime 决定是否需要领域工具、Engine、素材库、实体或市场能力。
- API-first：跨层交互先定义 shared contract、command、provider、port 或 message schema，再接 UI 和具体实现。
- Prompt-first：Prompt 只表达上下文、角色、约束和行为策略，不隐藏宿主副作用。
- Creation-first：创作 lifecycle、stage、iteration、validator feedback、review 和 approval 归 Agent 原生创作能力所有；IDC 只是 profile。
- Skill-first：Skill 描述领域方法、prompt-chain guidance、创作语义、输出标准和适用条件；具体工具协议、命令列表和子包 schema 由系统提示词、子包 capability 和 tool schema 提供，不成为私有 workflow engine。
- Tool-as-capability：Tool 是可审计能力入口，必须有来源、权限、schema、trust、输入输出 contract。
- Provider-neutral：runtime 不依赖具体模型供应商语义，provider adapter 负责 tool calling、structured output、多模态消息投影差异。
- Grounded-output：Agent 输出要进入持久上下文，必须接地到 `ResourceRef`、asset/entity ID、Search source、Engine output 或领域项目格式。
- Human-governed：不可逆、高成本、外部副作用、信任边界变化和项目事实改写必须经过 Approval/Policy。
- Host-agnostic runtime：Agent runtime 不知道 VS Code、React、Webview、Node 文件系统细节；这些都通过 host adapter 注入。
- Workspace-shared business plane：同一工作区的配置、会话身份、Skill/command catalog、任务事实、上下文和资源缓存策略必须复用共享 contract；平台差异保留在 host adapter 和 projection。
- Projection-only UI：Webview 展示消息、任务、Agent-native creation 状态、artifact 和设置投影，不拥有 Agent 业务策略。

## 分层

| 层            | 职责                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| `agent-types` | Webview/Extension/runtime 共享协议、消息、投影和状态 contract                         |
| `agent`       | host-agnostic runtime、Agent-native creation、prompt、skill、memory、tool、evaluation |
| `ai-sdk`      | Provider/AI SDK adapter，不承载 UI 或 VS Code 逻辑                                    |
| `platform`    | host-agnostic 平台桥、配置、provider glue 和能力注入                                  |
| `extension`   | VS Code commands、配置桥、host adapters、会话入口、资源授权                           |
| `webview`     | Chat UI、输入、消息投影、用户反馈、短生命周期 UI 状态                                 |
| `cli-tui`     | Terminal TUI/headless shell，复用 runtime 能力                                        |

## 包职责边界

| 包/层         | 可以做                                                                                                                    | 不可以做                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `agent-types` | 定义 Webview/Extension/runtime 共享消息、Agent-native creation、provider、prompt schema、work item、artifact projection   | 导入 runtime、VS Code、React 或 provider SDK         |
| `agent`       | session、turn assembly、creation profile/stage/iteration、prompt/schema、memory、tool orchestration、approval、evaluation | 读写 VS Code API、渲染 UI、直接访问 Webview          |
| `ai-sdk`      | provider adapter、model invocation、tool/structured-output projection、多模态消息投影                                     | 拥有创作 lifecycle、读取项目文件、决定领域语义       |
| `platform`    | host-agnostic platform glue、tool provider、market skill adapter、配置解析、能力注入                                      | 依赖 React/Webview，实现 VS Code UI                  |
| `extension`   | VS Code command、Webview bridge、file/resource/auth/engine/entity/search host adapter、lifecycle/disposable               | 沉淀 Agent runtime 决策或 prompt 拼装                |
| `webview`     | Chat、settings、skill catalog、creation/task/artifact projection、用户确认                                                | 导入 runtime/platform/ai-sdk，执行工具或访问文件系统 |
| `cli-tui`     | Terminal TUI/headless shell 和 TUI adapter                                                                                | 绕过 runtime 另建 Agent 业务路径                     |

## 架构视图

```text
Webview / Terminal TUI projection
  -> Extension or shell host adapter
  -> Agent runtime
  -> Platform, provider, skill and capability adapters
  -> Domain services, Engine, Assets, Entity, Search, Market
```

### 五层设计约束

| 维度   | 约束                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责   | Webview/Terminal TUI 只投影交互；Extension/shell 只注入宿主能力；Agent runtime 拥有 turn、creation profile/stage/iteration、skill、prompt、tool、memory、approval、evaluation；Platform/AI SDK 只适配 provider；领域服务拥有具体创作事实 |
| 依赖   | Webview 依赖 `agent-types`，不依赖 runtime；Extension 可依赖 runtime 和 platform，但不沉淀策略；`agent`、`platform`、`ai-sdk` 保持 host-agnostic；领域包通过 capability、command、facade 或 shared contract 接入                         |
| 接口   | Webview protocol、runtime ports、provider adapter、capability contribution、tool schema、artifact projection 和 grounded refs 分层定义，不能用自由 JSON 在层间扩散                                                                       |
| 扩展   | 新 provider、新 skill、新 market capability、新领域工具先进入 registration，再按 creation profile/context/policy 注入；扩展点不能绕过 approval、grounding 和 diagnostics                                                                 |
| 可测性 | 通过 prompt snapshot/hash、protocol schema、adapter fake、creation profile/iteration、tool/capability policy、boundary import guard 和 projection fixture 固化行为，不依赖真实 UI 或真实 provider 才能验证核心策略                               |

## 运行时入口与平面

Agent runtime 的宿主入口不应直接暴露零散构造参数。宿主应组装统一 runtime config，再创建 session。

```text
host bootstrap
  -> runtime config
      creationGuidance
      artifactStore
      capabilityRuntime
      feedbackLoop
  -> AgentSession
```

| 平面                | 职责                                                                                            | 约束                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `creationGuidance`  | Agent-native creation profile guidance、stage projection、validator feedback、review projection | 不拥有 lifecycle/state，不执行领域副作用，不创建 workflow run/node/transition |
| `artifactStore`     | workspace artifact、journal writer、artifact projection、grounded output refs                   | 不保存 Webview URI、runtime token、临时绝对路径或 provider secret             |
| `capabilityRuntime` | skill、toolGroup、prompt fragments、provider cards、capability diagnostics                      | registration 与 injection 分离，不能注册即注入 LLM                            |
| `feedbackLoop`      | memory recall/extraction、evaluation signal、recovery decision、user feedback                   | feedback 是控制信号，不是私有阶段 runtime                                     |

宿主显式配置优先于 runtime 默认值。Extension、Terminal TUI 和 headless 工具不应各自维护一套 session bootstrap 映射；差异通过 host adapter 注入。

## 工作区 Runtime 共享与宿主差异

Webview/Extension 与 Terminal TUI/headless 是不同本地宿主，不要求功能完全一致。差异本身不是债务：VS Code API、`postMessage`、Webview URI、watcher、memento/recovery、Extension command、Ink 键盘流、终端进程生命周期、stdout/stderr 报告和真实 API 验证 lane 都可以保留在各自宿主。债务来自两端为同一工作区重复实现配置、会话、Skill、命令、任务、上下文或缓存业务规则。

同一工作区必须共享以下业务数据面：

| 数据面                    | 共享规则                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective config snapshot | `~/.neko/config.toml`、`.neko/config.toml`、环境凭据和账号 catalog 统一解析；Webview/TUI 对 provider、model、scalar、MCP 得到同一结果或同一 diagnostic。运行时模型/参数选择只影响当前 session，不自动重写 TOML。  |
| Conversation/session      | 交互式会话使用 canonical runtime assembly 和 workspace-scoped canonical conversation id；旧 `cli-*` id 不作为 TUI resume 兼容输入，旧 runtime state source 也不能作为共享状态成功读入。                           |
| Skill/command catalog     | 标准用户/工作区来源是 `~/.neko/skills`、`~/.neko/commands`、`.neko/skills`、`.neko/commands`；`skillsDir` 之类非标准来源不能让 TUI/headless 单独看到不同 catalog，必须通过显式 source provider 暴露 diagnostics。 |
| Async task facts          | 可跨宿主观察的任务状态进入 workspace-visible task record；live handle、lease、recovery token 和 no-workspace state 保持 host-private。                                                                            |
| Context/memory            | project memory、AGENTS overlays、context settings、授权读根和 capability prompt fragments 通过 shared runtime assembly 注入。                                                                                     |
| Content/cache             | 工作区资源使用 project resource-cache root、manifest、quota 和 GC 策略；cache path、Webview URI、blob URL 和 provider-private payload 不是 durable identity。                                                     |
| Dependency diagnostics    | 文档、图片和可选解析依赖由 host content-access runtime 注入；缺失依赖返回 typed diagnostic，不在某个宿主静默降级为空结果。                                                                                        |

跨宿主请求遇到 host-private 能力时，应返回 host-private/unavailable diagnostic，不能 no-op、转成普通 prompt、读取另一端私有缓存或回退旧实现。共享 command catalog 的 surface scope 使用 `tui` / `extension`；headless 只作为执行 lane，不伪装成交互式 CLI surface。新增 Agent 能力默认先进入共享 contract 和 path-level 测试，再由 Webview/Extension 与 Terminal TUI/headless 分别实现 adapter 与 projection。

### 异步任务结果观察

后台任务的业务闭环归共享 runtime，而不是 Webview 或 TUI 私有实现：

- `agent` 层拥有 task-result observation runtime，负责识别终态 task、记录 observation/evidence、根据 delivery policy 请求继续或自动续跑。
- `platform` 层拥有媒体任务到 Agent task-result 的投影，负责把 provider/model、stable result refs、generated assets、host output paths 和 delivery policy 转成共享任务事实。
- VS Code Extension、Terminal TUI、Desktop/Electron 只提供 host delivery port，例如 Webview URI、通知、Node workspace 保存目录、Electron IPC 或终端诊断。
- 同一工作区的媒体生成结果必须能被任一宿主通过 workspace-visible task record、conversation journal、`ResourceRef` 或 generated asset index 观察；Webview URI、blob URL、临时下载路径和 host-private live handle 不能作为业务事实。

TUI 不读取 VS Code 注入设置，也不模拟 Webview 消息；它通过 Node adapter 复用 `AgentEventStreamRuntimeProcessor`、task-result observation runtime 和 platform media delivery projection。Webview/Extension 可以有 VS Code 专属资源投影、setting bridge 和通知，但不能因此复制一套 task observation 或 token/usage 计算路径。

## 控制面

```text
Intent
  -> Agent-native creation profile/stage
  -> Prompt context
  -> Skill strategy
  -> Tool and capability injection
  -> Provider message projection
  -> Approval and policy
  -> Execution trace
  -> Evaluation and feedback
  -> Grounded artifacts
```

控制面必须分离：

- Prompt 只描述上下文、角色和行为策略，不执行宿主副作用。
- Skill 描述领域方法、创作语义和输出标准，不描述运行时工具协议，也不成为工作流引擎。
- Tool 是能力调用入口，必须有来源、权限和输入输出 contract。
- Memory 保存可追溯上下文，不替代项目事实。
- Provider 适配模型/服务差异，不拥有创作领域逻辑。
- Approval/Policy 管不可逆、高成本或外部副作用动作。
- Evaluation 负责审阅、反馈和修复建议，不绕过权限边界。

### 约束归属平面

| 平面                  | 负责                                                                                   | 不负责                                     |
| --------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| System Prompt         | 默认 Agent 人设、通用工具协议、Markdown/引用/视觉证据规则、安全边界、失败处理          | 子包字段、运行时参数表、领域 authoring 细节 |
| Capability Injection  | 子包工具/operation 名称、参数 schema、validation、diagnostics、资源绑定、能力目录       | 通用人设、跨领域 Markdown 协议、Skill 方法论 |
| Skill Content         | 扩展能力、领域方法论、创作语义、任务判断、输出风格和提示词写作规则                     | 运行时工具协议、子包内部 schema、权限授予  |
| Metadata / Schema     | tool arguments、structured output、creation artifact、recovery decision、allowed tools | 决定是否执行工具                           |
| Runtime               | turn assembly、creation iteration、tool orchestration、artifact projection             | 读取 VS Code API 或渲染 UI                 |
| Policy                | permission mode、trust level、approval gate、secret boundary、host availability        | 用 prompt 文案替代权限判断                 |
| Memory                | journal、conversation projection、project memory、semantic recall                      | 替代 Assets、Entity、Engine 或领域项目格式 |
| Evaluation            | deterministic checks、LLM judge adapter、diagnostics、recovery signal                  | 直接改 confirmed fact 或绕过 approval      |

控制面是横切约束，不是 IDC 的第四阶段。内置 IDC profile 可以提供 Draft、Plan、Apply 三个默认 stage；其他 profile 可以声明更多或更少 stage。评估、记忆、审批和恢复只在需要时介入。

## Agent 原生阶段式创作

Agent 原生创作能力拥有 lifecycle、stage、iteration、validation feedback、review、approval 和后续 action 判断。IDC 是 Intent-Driven Creation 的默认 creation profile，不是独立 runtime，也不是全局固定三阶段。

```text
User intent
  -> creation profile
  -> stage: Draft
      clarify creative goal, references, constraints, missing context
  -> stage: Plan
      choose capability path, tools, assets, entities, engine/runtime needs
  -> stage: Apply
      execute tools, produce grounded artifacts, update projections
  -> validation / review feedback
      validate result, collect feedback, suggest recovery
```

### 阶段语义

| 阶段             | 回答                               | 主要产物                                                  | 不应承担               |
| ---------------- | ---------------------------------- | --------------------------------------------------------- | ---------------------- |
| Draft            | 用户想创作什么，约束和参考是什么   | intent summary、context refs、draft artifacts             | 直接执行不可逆工具     |
| Plan             | 用哪些能力、顺序和审批完成目标     | next actions、tool/capability hints、artifact expectation | 私自扩大权限或隐藏工具 |
| Apply            | 执行工具、生成媒体、写入事实或产物 | tool results、artifacts、entity/asset/resource refs       | 重新解释用户目标       |
| Observe/Evaluate | 结果是否达标，如何恢复             | diagnostics、feedback、repair suggestions                 | 绕过审批自动改事实     |

内置 IDC profile 不要求每个 turn 都完整走三阶段。简单、低风险、无副作用问题可以直接回答或进入轻量执行；多步骤、跨领域、高成本、写项目事实或需要媒体生成的请求应让 Agent 显式说明当前 stage、validator 和下一步。

### 进入策略

| 用户意图                                   | 默认路径                           | 说明                                                                   |
| ------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| 解释、查询、只读总结                       | 直接回答或轻量 Apply               | 不创建 workflow run，除非需要持久 artifact 或 creation iteration       |
| 单一低风险工具                             | 隐式 Draft -> Apply                | runtime 可内部选择工具，但仍保留 tool trace                            |
| 多领域创作、媒体生成、批量变更             | Draft -> Plan -> Apply             | 明确目标、参考、能力路径、预期产物和审批点                             |
| 删除、覆盖、安装、外部副作用、信任边界变化 | Draft -> Plan -> Approval -> Apply | Policy 决定是否需要用户确认和更高信任能力                              |
| 结果不达标或工具失败                       | Observe/Evaluate -> recovery       | recovery 可以 retry、regress、restart 或 escalate-user，但不能自动越权 |

### Legacy Trace 投影

`AgentWorkflowDefinition`、`AgentWorkflowRun`、`AgentWorkflowNode` 和 `AgentWorkflowTransition` 只能作为 legacy trace/projection 或兼容观察存在，不是新的 Agent 创作身份、阶段状态或执行权威。新代码应使用 Agent 现有 session/turn/capability 边界承接创作状态，只在具体投影需要时增加小型 contract，并用 prompt-chain observation 记录 Skill 方法指导的采纳、跳过、重排和完成。

异步 task、media task、subagent event 和 artifact projection 应尽量携带 `conversationId`、`creationId` 和 `iterationId`。仍需保留 `workflowDefinitionId`、`workflowRunId`、`workflowNodeId` 时，必须标记为 legacy trace，并且缺失这些字段不得阻断 Agent-native creation 状态、validator feedback 或 review projection。

## Agent 交互协议

Agent 有三类协议面，不能混用：

| 协议面            | 参与方                            | 内容                                                                                | 约束                                                 |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Webview protocol  | Webview ↔ Extension               | `sendMessage`、confirm tool、plan action、slash command、settings、open/reveal      | 只传投影和用户意图，不传 secret 和 runtime internals |
| Runtime protocol  | Extension adapter ↔ Agent runtime | turn assembly、creation iteration、tool call、approval、memory、artifact projection | host-agnostic，使用 ports/adapters                   |
| Provider protocol | Runtime/AI SDK ↔ model provider   | messages、tool schemas、structured output、多模态 payload                           | provider-specific 差异在 adapter 内消化              |

### 消息与产物

- `Message` 是对话投影，不等于 provider 原始消息。
- `ContentBlock` 表达 thinking、text、tool call、code diff、plan、composite 等顺序展示单元。
- `ToolCall` 是内部工具调用投影，不是 provider function-call 原始 wire。
- Artifact projection 只传 compact ref、metadata、provenance 和可展示摘要；二进制内容通过资源/缓存服务按 intent 读取。
- Webview confirmation 只表达用户批准或拒绝；Approval/Policy 决策仍归 runtime/Extension adapter。

### 协议治理规则

- 跨 Webview 边界的消息必须由 `agent-types` 或共享 contract 定义，不在组件里临时拼自由对象。
- Provider 原始 tool call、stream event 和多模态 payload 不穿透到 Webview；runtime/AI SDK 负责投影成 `Message`、`ContentBlock`、`ToolCall` 或 artifact projection。
- Webview 不接收 secret、provider credential、native path capability 或无界二进制 payload。
- `confirmTool`、`planApprove`、`planReject` 等用户确认消息只绑定明确 id；重复确认应可幂等处理。
- `openFile`、`revealAsset`、`sendToPlugin`、`revealDocumentLocator` 是宿主意图，不是文件系统授权本身；Extension adapter 负责解析、授权和审计。
- 错误和降级应返回 typed diagnostic，避免只把 provider/工具原始错误文本塞进 assistant message。

### 创作表面调度

Agent 可以把领域状态投影成消息卡片、确认清单和操作按钮，但不拥有领域 Webview 的运行时状态。对于 Canvas/Cut/Preview，Agent 的职责是理解、展示、确认和调度：

| 能力            | Agent 负责                                                                   | Owning surface 负责                                                                             |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Canvas 播放顺序 | 读取 `CanvasPlaybackPlan`，展示 route 摘要、有序清单、诊断和导入确认         | Canvas 保存顺序事实，Canvas Editor Webview 内的 `PlaybackWorkspace` 拥有 route playback session |
| Canvas 预览播放 | 发起 `revealCanvasPlaybackWorkspace(sourceCanvasUri, routeId, unitId?)` 意图 | Canvas Editor Webview 显示/聚焦 `PlaybackWorkspace`、seek、播放、维护 playhead 和当前 unit      |
| Cut 剪辑结果    | 读取 timeline 摘要、展示导入或审阅建议                                       | Cut 管理 `.nkv`、timeline、clip、trim、效果、字幕、音频和播放                                   |
| 媒体预览        | 展示缩略图、poster、probe、关键帧和资源卡片                                  | `neko-preview` / Engine 负责解码、stream、seek、音频同步和资源授权                              |

Agent Chat 不应复制完整播放器、route timeline 或剪辑 timeline。Chat 内只展示轻量预览卡片，例如缩略图、当前 shot 图片、时长、素材状态、diagnostic、source mapping 和按钮：

```text
当前路线：Shot 1 · 20 units · 约 1:00
诊断：2 个镜头缺预览图，入口为自动推断
[在 Canvas 中播放] [发送到 Cut] [查看完整顺序]
```

这些按钮发送的是 reveal/open 或 confirmation intent，不是直接文件访问或 Webview store mutation。Extension adapter 负责解析资源、检查 policy、显示或聚焦对应 Webview 区域，并返回可审计 diagnostic。

Agent 可以分析视频内容，但分析路径应调用 Engine、Preview、Media LSP 或领域工具读取 probe、关键帧、字幕、音频峰值、质量诊断和 ResourceRef，而不是通过在 Chat 内播放视频来获得状态。

### Package Authoring Transfer

当 Agent/Assets/Skill 要把生成结果、分镜、素材或模型写入 Cut、Sketch、Audio、Model 或 Canvas 项目时，Agent 只负责选择能力、传递 stable source/ref、`target`、`reveal` 和 provenance，并展示 structured diagnostics。项目事实写入必须走 owning package 的 canonical authoring service/command，遵循 [`headless-project-authoring.md`](headless-project-authoring.md)；旧 UI-bound command、隐藏打开 Webview、Webview pending import、temp project 和“打开即成功”都不是 durable authoring 成功路径。

## Capability、Skill、Prompt

Capability 分 Registration 和 Injection 两个阶段：

```text
Registration
  builtin / package / market / local / MCP / provider contribution
  -> registry, diagnostics, trust, host requirements
        |
        v
Injection
  active skill + subpackage capability + creation stage/profile + provider capability + policy + context budget
  -> system / skill / capability prompt fragments + tool schemas + metadata allowlists + structured output schemas
```

### 能力边界

| 概念                        | 负责                                                                      | 不负责                              |
| --------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| Skill                       | 领域方法、prompt-chain guidance、创作语义、输出标准、适用场景；可通过 metadata 引用所需工具 | 拥有 durable profile schema、执行副作用、保存项目事实、在正文描述工具协议 |
| Artifact Profile            | 持久 artifact/table 形状、字段、schema ref、资源模态、校验和建议 action   | 激活 Skill、执行工具、写项目事实    |
| Creation Profile            | Agent creation stage、transition、stage persona Skill id、审批/复核/恢复策略 | 充当 workflow engine、执行工具、创建 workflow run |
| ProviderCard / Expression Profile | provider/model 表达偏好、输入输出模态、generation capability、结构化输出支持 | 保存凭证、adapter wire mapping、改写领域事实 |
| Tool                        | 原子能力调用、schema、权限、来源、结果和附件                              | 决定何时进入 LLM 上下文             |
| ToolGroup                   | 跨 Skill 共享的一组能力                                                   | 为了视觉分组滥建                    |
| PromptFragment              | 可组合提示片段                                                            | 执行工具或读取文件                  |
| MCP                         | 外部 tool/resource/prompt 后端                                            | 替代 Skill 或 Policy                |

### Profile 贡献边界

Profile 是独立 capability contribution，不是 Skill 的私有提示词。内置 Artifact Profile、Creation Profile 和 ProviderCard 只是一组 standard-library contribution；market、personal、project 或 package provider 可以通过同一 registry 路径贡献新的 profile。Skill 可以随包一起分发 profile，也可以只引用其他包贡献的 profile id；注册后 profile 以 `profileId + version + kind + source` 作为稳定契约被验证和组合。

Profile-only package 合法存在，用于分发团队表结构、创作 lifecycle 或 provider/model expression profile，而不会生成可运行 Skill catalog entry。安装和加载前必须通过 trust、signature/verified publisher、host requirement 与 descriptor path 检查。

`skill-local` profile 只允许用于单轮临时推理 schema，不得作为 persisted artifact、project fact 或跨 Skill contract 的 profile id。持久 artifact 引用缺失、版本不支持或 `skill-local` profile 时必须返回可见 diagnostic，不允许静默当成 generic artifact。

ProviderCard 保留为兼容名称；架构上它是 provider/model expression profile 的当前实现。它描述“某厂商或某模型适合怎样表达生成意图”，不描述 credential、adapter 请求格式或用户账号配置。模型目录和 TOML 只能引用 `providerExpressionProfileId`，不能内联定义 expression prompt/schema。

### Skill 生命周期

| 阶段       | 设计规则                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Discover   | 从 builtin、workspace、market、local、MCP 或 provider contribution 发现，不执行副作用                                                  |
| Validate   | 校验 manifest、schema、trust、host requirements、metadata tool references、prompt fragment 形状                                        |
| Register   | 进入 registry，产出 diagnostics 和 capability metadata                                                                                 |
| Activate   | 根据用户意图、slash command、active skill、creation stage/profile 或领域上下文选择候选                                                 |
| Inject     | 在 policy、token budget、provider capability 和 creation stage/profile 允许时注入 Skill prompt fragments；工具 schema、capability prompt 和 structured schemas 由对应 runtime/capability 提供 |
| Observe    | 记录 capability diagnostics、tool result metadata、artifact refs 和 feedback signal                                                    |
| Deactivate | 切换会话、清除 active skill、失去 trust/host requirement 或上下文不再匹配时移出 injection set                                          |

Skill-first 的含义是“领域方法包先行”，不是“Skill 拥有执行引擎或工具协议”。`allowedTools`、`optionalTools` 和 `toolDefinitions` 可以作为机器可读 metadata、registry 或测试 fixture 存在，但 Skill prompt content 不应以自然语言教程形式描述具体工具名、命令参数、轮询协议、缓存/Webview/path 协议或子包 authoring 细节。跨领域创作应通过多个 capability 的显式注入组合完成，而不是在某个 skill 中硬编码对其他包的内部调用。

### Prompt 层次

| 层          | 内容                                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| base        | 项目级行为边界、安全规则、Agent 角色、通用工具/Markdown/引用/视觉证据协议        |
| schema      | 工具参数、creation artifact、structured output、recovery decision                |
| capability  | 子包领域能力目录、operation 语义、validation/diagnostics 和资源绑定规则          |
| skill       | active skill 的领域方法、创作语义、输出标准和任务判断                           |
| environment | locale、custom instructions settings、AGENTS.md overlay、provider expression、memory/context summary |
| ephemeral   | 当前 creation stage/iteration、selected context、tool/capability policy、多模态 evidence |

Prompt 生成应输出 prompt snapshot/hash 和 diagnostics，便于追踪 drift。Provider 不支持 native tool calling 或 structured output 时，由 adapter 决定 prompt-only 投影或返回 capability diagnostic。

Prompt-first 的边界：

- Prompt fragment 必须有稳定 id、来源、优先级和适用条件。
- Prompt 不携带 provider credential、Webview URI、绝对路径、runtime token 或一次性 stream id。
- Prompt 不隐藏工具调用或权限要求；需要工具时由 schema、capability catalog 和 tool policy 显式暴露。
- Provider expression fragment 只能描述模型表达偏好，不能改写领域事实。
- AGENTS.md overlay 和设置里的自定义指令属于 environment layer；它们影响用户/项目偏好，不替代 base system prompt、tool protocol、capability schema 或 package/domain contract。

## Context、Memory 与 Grounding

Agent 上下文分三类：

| 类型            | 来源                                                                              | 持久化规则             |
| --------------- | --------------------------------------------------------------------------------- | ---------------------- |
| Runtime context | 当前消息、选区、打开文件、Webview UI 状态、临时工具结果                           | 不作为项目事实         |
| Project context | `ResourceRef`、asset/entity ID、Search source、domain project refs                | 可进入 durable payload |
| Memory context  | conversation journal、working summary、semantic memory、character memory evidence | 不替代项目事实         |

Memory 保存可追溯上下文，不是实体、素材或领域项目格式的权威来源。Agent 生成内容若要进入项目，应通过对应事实层：素材进 Asset Library，身份进 Unified Entity，媒体进 Resource/Generated source，Engine 输出进 source ref 或领域格式。

### Agent-first 多模态解析

```text
UI selection / open editors / viewport state
  -> Project and domain state
  -> Engine perception or media evidence
  -> Perception input resolver
  -> Multimodal context packet
  -> Agent observation and decision rationale
```

Agent-first 不表示忽略 UI 或素材文件。UI 提供“用户正在指什么”，项目/领域服务提供“对象是什么”，Engine/ML/搜索提供“证据是什么”，Agent runtime 最后形成可解释的观察和决策。

| 来源                 | 角色                                                          | 约束                                     |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| UI context           | selection、viewport、active tab、playhead、用户焦点           | 短生命周期，不写项目事实                 |
| Project/domain state | timeline clip、canvas node、scene node、entity、asset binding | 由领域服务或 facade 查询                 |
| Engine evidence      | frame、audio、scene snapshot、ML embedding、transcript        | 通过 descriptor/ref 传递，二进制按需读取 |
| Search/Memory        | 语义召回、历史依据、用户偏好                                  | 必须保留来源和置信边界                   |

对 Canvas、Timeline、Scene、Asset、Entity 的改动采用 query-first mutation：先查询目标上下文和能力，再提交 typed intent。Agent 或 Agent Webview 不拼目标包内部 patch。

## Approval、Policy 与 Trust

| 动作                                              | 默认策略                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| 只读查询、搜索、解释                              | 可自动                                                                   |
| 写项目事实、修改文件、安装 market package         | 需要 policy 允许，必要时用户确认                                         |
| 删除、覆盖、外部网络、执行本地命令、native plugin | 高信任门槛和明确 approval                                                |
| untrusted/local capability 注入                   | 默认不自动执行，不进入高风险 tool policy                                 |
| secret/token/provider credential                  | 只通过 Auth/config/provider adapter，不写 prompt、skill 或 Webview state |

Approval 是运行时 gate，不应埋在 prompt 文案里。Policy 可以影响 tool policy、creation stage、provider choice 和 recovery path。

## Evaluation 与 Recovery

Evaluation 是横切审阅面，不是默认 IDC 阶段，也不是独立 workflow runtime。

- deterministic evaluator 适合格式、尺寸、duration、schema、引用完整性、权限合规检查。
- LLM-as-judge 只通过 Provider adapter 接入，并保留 provider/model/prompt snapshot。
- 失败结果可以生成 retry、regress、restart、escalate-user 等 recovery signal。
- Recovery 不得绕过 Approval/Policy，也不得把 evaluator 建议直接写入 confirmed fact。
- 普通用户流不应隐式插入消融或评测节点；研发验证与普通创作主路径分离。

### 开发期 Agent Evaluation

开发期 Agent evaluation 是仓库脚本能力，不是 Agent 产品能力或独立的 CLI 业务编排：

- `packages/neko-agent` 只提供通用的 `debug automation --stdio` 控制面和事实投影；session、输入队列、Skill 生命周期、任务观察和产物投影必须继续走 canonical TUI runtime。
- `scripts/agent-eval` 拥有 manifest、场景编排、controller/judge、确定性断言、post-check、报告和退出码；不得把这些职责重新放回 `cli-tui`、Agent capability 或 runtime Skill。
- debug automation 只能增加对本地开发自动化普遍有用的控制或可观察事实，不能暴露 evaluation-specific pass/fail、rubric 或报告概念。
- Agent 行为验收必须断言 canonical path、禁止 fallback 的证据和 assertion-level 结果；只看最终文本、mock-only 或 direct turn injection 不能替代真实路径证据。
- 原始运行产物保留在本地忽略目录；需要进入 OpenSpec、PR 或发布记录时，提交经过脱敏的命令、case id、证据摘要、失败分类和残余风险。

| Recovery signal  | 含义                                      | 约束                            |
| ---------------- | ----------------------------------------- | ------------------------------- |
| retry-tool       | 同一工具参数或小范围修正后重试            | 只适合幂等或可回滚工具          |
| retry-stage      | 保持用户目标，重新执行当前 creation stage | 需要保留失败 diagnostics        |
| regress          | 回到 Draft 或 Plan 修正目标/方案          | 不自动丢弃用户已确认内容        |
| restart-creation | 重新创建 creation session 或 iteration    | 需要明确 lineage 和用户可见说明 |
| escalate-user    | 请求用户决策、授权或补充素材              | 不用模型臆造缺失事实            |

## 跨领域接入规则

领域包若希望被 Agent 使用，应暴露 capability-friendly contract，而不是要求 Agent 了解内部实现。

| 领域能力      | Agent 需要的最小入口                                                  |
| ------------- | --------------------------------------------------------------------- |
| 只读上下文    | query API、selection/context projection、source/entity/asset refs     |
| 修改领域项目  | typed command、preview/validate/apply 分离、undo 或 revision contract |
| 媒体生成/处理 | tool schema、provider/engine requirements、output artifact refs       |
| 长任务        | work item projection、progress、cancel/retry、artifact/result refs    |
| 展示富内容    | `ContentBlock`/composite projection 或 target package 自己的 renderer |

领域文档描述“Agent 如何参与创作目标”；本文只规定 Agent 以什么协议和约束参与。

## 边界规则

- `agent`、`platform`、`ai-sdk`、`agent-types` 保持 host-agnostic，不导入 `vscode`、React、Webview 或 Extension API。
- Webview 不导入 `@neko/agent`、`@neko/platform`、`@neko/ai-sdk` 或 Extension 实现。
- Extension 可以注册 commands 和 host adapter，但不沉淀 Agent runtime 业务。
- Agent 调用创作能力时走 provider、shared contract、Engine client、entity facade、market capability 或 command bridge。
- 生成媒体和结构化结果必须接地到 `ResourceRef`、asset/entity ID、Search index、Engine output 或领域项目格式后，才成为持久上下文。
- 兼容桥必须声明 owner、replacement 和过期边界，避免长期成为新的耦合入口。

## 反模式

| 反模式                                         | 风险                               | 正确边界                                         |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| Webview 直接导入 `@neko/agent` 或 provider SDK | UI 与 runtime 互相缠死             | Webview 只消费 `agent-types` 投影                |
| Extension 拼 prompt 或决定 creation stage      | Host adapter 变成业务层            | runtime 负责 prompt/creation，Extension 注入能力 |
| Skill 内藏执行逻辑或工具协议                   | Skill 变成不可审计 workflow engine | Skill 只声明领域方法、创作语义和输出标准         |
| 注册能力即注入 LLM                             | token 爆炸和权限泄漏               | Registration 与 Injection 分离                   |
| Tool 结果直接写项目事实                        | 副作用不可审计                     | 通过领域服务、审批和事实层                       |
| Provider adapter 拥有领域逻辑                  | 模型供应商影响业务语义             | provider 只做消息/工具/多模态投影                |
| Memory 替代素材/实体事实                       | 事实漂移、难以协作                 | Memory 只保存上下文和 evidence refs              |
| Evaluation 自动改 confirmed fact               | 审阅绕过用户意图                   | 输出 repair suggestion，等待 policy/approval     |

## 与创作领域的关系

| 创作领域 | Agent 参与方式                                     |
| -------- | -------------------------------------------------- |
| 视频     | 分镜、视频理解、自动后期、剪辑建议、质量审阅       |
| 音频     | 转写、效果链建议、混音/后期建议、音频质量审阅      |
| 模型     | LookDev、材质/灯光建议、捏脸、场景编辑和验证       |
| 2D       | 图像准备、PSD 分层建议、Puppet 辅助、角色素材整理  |
| 互动     | 交互结构生成、状态解释、自动连接、运行态审阅与修复 |

领域文档应说明 Agent 如何参与某个创作目标；本文只定义 Agent 自身横切边界。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- Agent-native creation / IDC profile
- Agent runtime boundary guard
- Capability Protocol
- Agent media architecture
- Agent memory unification
- multimodal perception and provider-aware delivery
- skill as prompt chains
- agent host boundary review
