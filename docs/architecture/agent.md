# Agent 横切架构

更新日期：2026-06-15

Agent 是 Neko Suite 的横切创作智能层，不是一个创作领域。它为视频、音频、模型、2D 和互动创作提供意图理解、计划、工具调用、上下文压缩、审阅和修复能力。

## 设计目标

- 让 Agent 能组合各创作领域能力，而不直接耦合 Webview 或子包实现。
- 将 Prompt、Skill、Tool、Memory、Provider、Approval、Evaluation 分成可测试控制面。
- 让 Agent 产出的媒体、实体和项目事实重新接地到 Assets、Entity、Search、Engine 或领域格式。

## 核心原则

- Agent-first：创作意图先进入 Agent runtime，由 runtime 决定是否需要领域工具、Engine、素材库、实体或市场能力。
- API-first：跨层交互先定义 shared contract、command、provider、port 或 message schema，再接 UI 和具体实现。
- Prompt-first：Prompt 只表达上下文、角色、约束和行为策略，不隐藏宿主副作用。
- Skill-first：Skill 描述领域策略、工具组合、prompt fragments 和适用条件，不成为私有 workflow engine。
- Tool-as-capability：Tool 是可审计能力入口，必须有来源、权限、schema、trust、输入输出 contract。
- Provider-neutral：runtime 不依赖具体模型供应商语义，provider adapter 负责 tool calling、structured output、多模态消息投影差异。
- Grounded-output：Agent 输出要进入持久上下文，必须接地到 `ResourceRef`、asset/entity ID、Search source、Engine output 或领域项目格式。
- Human-governed：不可逆、高成本、外部副作用、信任边界变化和项目事实改写必须经过 Approval/Policy。
- Host-agnostic runtime：Agent runtime 不知道 VS Code、React、Webview、Node 文件系统细节；这些都通过 host adapter 注入。
- Projection-only UI：Webview 展示消息、任务、workflow、artifact 和设置投影，不拥有 Agent 业务策略。

## 分层

| 层            | 职责                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| `agent-types` | Webview/Extension/runtime 共享协议、消息、投影和状态 contract            |
| `agent`       | host-agnostic runtime、workflow、prompt、skill、memory、tool、evaluation |
| `ai-sdk`      | Provider/AI SDK adapter，不承载 UI 或 VS Code 逻辑                       |
| `platform`    | host-agnostic 平台桥、配置、provider glue 和能力注入                     |
| `extension`   | VS Code commands、配置桥、host adapters、会话入口、资源授权              |
| `webview`     | Chat UI、输入、消息投影、用户反馈、短生命周期 UI 状态                    |
| `cli-tui`     | 非 VS Code shell，复用 runtime 能力                                      |

## 包职责边界

| 包/层         | 可以做                                                                                                      | 不可以做                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `agent-types` | 定义 Webview/Extension/runtime 共享消息、workflow、provider、prompt schema、work item、artifact projection  | 导入 runtime、VS Code、React 或 provider SDK         |
| `agent`       | session、turn assembly、IDC workflow、prompt/schema、memory、tool orchestration、approval、evaluation       | 读写 VS Code API、渲染 UI、直接访问 Webview          |
| `ai-sdk`      | provider adapter、model invocation、tool/structured-output projection、多模态消息投影                       | 拥有业务 workflow、读取项目文件、决定领域语义        |
| `platform`    | host-agnostic platform glue、tool provider、market skill adapter、配置解析、能力注入                        | 依赖 React/Webview，实现 VS Code UI                  |
| `extension`   | VS Code command、Webview bridge、file/resource/auth/engine/entity/search host adapter、lifecycle/disposable | 沉淀 Agent runtime 决策或 prompt 拼装                |
| `webview`     | Chat、settings、skill catalog、workflow/task/artifact projection、用户确认                                  | 导入 runtime/platform/ai-sdk，执行工具或访问文件系统 |
| `cli-tui`     | 非 VS Code shell 和 TUI adapter                                                                             | 绕过 runtime 另建 Agent 业务路径                     |

## 架构视图

```text
Webview / CLI projection
  -> Extension or shell host adapter
  -> Agent runtime
  -> Platform, provider, skill and capability adapters
  -> Domain services, Engine, Assets, Entity, Search, Market
```

### 五层设计约束

| 维度   | 约束                                                                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责   | Webview/CLI 只投影交互；Extension/shell 只注入宿主能力；Agent runtime 拥有 turn、workflow、skill、prompt、tool、memory、approval、evaluation；Platform/AI SDK 只适配 provider；领域服务拥有具体创作事实          |
| 依赖   | Webview 依赖 `agent-types`，不依赖 runtime；Extension 可依赖 runtime 和 platform，但不沉淀策略；`agent`、`platform`、`ai-sdk` 保持 host-agnostic；领域包通过 capability、command、facade 或 shared contract 接入 |
| 接口   | Webview protocol、runtime ports、provider adapter、capability contribution、tool schema、artifact projection 和 grounded refs 分层定义，不能用自由 JSON 在层间扩散                                               |
| 扩展   | 新 provider、新 skill、新 market capability、新领域工具先进入 registration，再按 workflow/context/policy 注入；扩展点不能绕过 approval、grounding 和 diagnostics                                                 |
| 可测性 | 通过 prompt snapshot/hash、protocol schema、adapter fake、workflow transition、tool allowlist、boundary import guard 和 projection fixture 固化行为，不依赖真实 UI 或真实 provider 才能验证核心策略              |

## 运行时入口与平面

Agent runtime 的宿主入口不应直接暴露零散构造参数。宿主应组装统一 runtime config，再创建 session。

```text
host bootstrap
  -> runtime config
      workflowRuntime
      artifactStore
      capabilityRuntime
      feedbackLoop
  -> AgentSession
```

| 平面                | 职责                                                                          | 约束                                                              |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `workflowRuntime`   | IDC stage、workflow run/node/transition、PlanMode/AutoMode 入口               | 不读取 VS Code 或 Webview 状态，只消费宿主投影                    |
| `artifactStore`     | workspace artifact、journal writer、artifact projection、grounded output refs | 不保存 Webview URI、runtime token、临时绝对路径或 provider secret |
| `capabilityRuntime` | skill、toolGroup、prompt fragments、provider cards、capability diagnostics    | registration 与 injection 分离，不能注册即注入 LLM                |
| `feedbackLoop`      | memory recall/extraction、evaluation signal、recovery decision、user feedback | feedback 是控制信号，不是普通 IDC 阶段                            |

宿主显式配置优先于 runtime 默认值。Extension、CLI 和 TUI 不应各自维护一套 session bootstrap 映射；差异通过 host adapter 注入。

## 控制面

```text
Intent
  -> Workflow / IDC
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
- Skill 描述领域策略和工具组织，不成为工作流引擎。
- Tool 是能力调用入口，必须有来源、权限和输入输出 contract。
- Memory 保存可追溯上下文，不替代项目事实。
- Provider 适配模型/服务差异，不拥有创作领域逻辑。
- Approval/Policy 管不可逆、高成本或外部副作用动作。
- Evaluation 负责审阅、反馈和修复建议，不绕过权限边界。

### 约束归属平面

| 平面       | 负责                                                                               | 不负责                                     |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------ |
| Prompt     | 角色、语言、上下文摘要、行为偏好、skill fragments                                  | 执行工具、保存事实、注入 secret            |
| Schema     | tool arguments、structured output、workflow artifact、recovery decision 的结构约束 | 决定是否执行工具                           |
| Runtime    | turn assembly、IDC transition、tool orchestration、artifact projection             | 读取 VS Code API 或渲染 UI                 |
| Policy     | permission mode、trust level、approval gate、secret boundary、host availability    | 用 prompt 文案替代权限判断                 |
| Memory     | journal、conversation projection、project memory、semantic recall                  | 替代 Assets、Entity、Engine 或领域项目格式 |
| Evaluation | deterministic checks、LLM judge adapter、diagnostics、recovery signal              | 直接改 confirmed fact 或绕过 approval      |

控制面是横切约束，不是 IDC 的第四阶段。普通创作主路径仍是 Draft、Plan、Apply；评估、记忆、审批和恢复只在需要时介入。

## IDC 工作流

IDC 是 Intent-Driven Creation，面向创作目标而不是软件开发任务。默认骨架是 Draft、Plan、Apply 三阶段。

```text
User intent
  -> Draft
      clarify creative goal, references, constraints, missing context
  -> Plan
      choose capability path, tools, assets, entities, engine/runtime needs
  -> Apply
      execute tools, produce grounded artifacts, update projections
  -> Observe / Evaluate
      validate result, collect feedback, suggest recovery
```

### 阶段语义

| 阶段             | 回答                               | 主要产物                                             | 不应承担               |
| ---------------- | ---------------------------------- | ---------------------------------------------------- | ---------------------- |
| Draft            | 用户想创作什么，约束和参考是什么   | intent summary、context refs、draft artifacts        | 直接执行不可逆工具     |
| Plan             | 用哪些能力、顺序和审批完成目标     | workflow nodes、tool allowlist、artifact expectation | 私自扩大权限或隐藏工具 |
| Apply            | 执行工具、生成媒体、写入事实或产物 | tool results、artifacts、entity/asset/resource refs  | 重新解释用户目标       |
| Observe/Evaluate | 结果是否达标，如何恢复             | diagnostics、feedback、repair suggestions            | 绕过审批自动改事实     |

IDC 不要求每个 turn 都完整走三阶段。简单、低风险、无副作用问题可以直接进入 Apply；多步骤、跨领域、高成本、写项目事实或需要媒体生成的请求应显式进入 Draft/Plan。

### 进入策略

| 用户意图                                   | 默认路径                           | 说明                                                                   |
| ------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| 解释、查询、只读总结                       | 直接回答或轻量 Apply               | 不创建完整 workflow，除非需要持久 artifact                             |
| 单一低风险工具                             | 隐式 Draft -> Apply                | runtime 可内部选择工具，但仍保留 tool trace                            |
| 多领域创作、媒体生成、批量变更             | Draft -> Plan -> Apply             | 明确目标、参考、能力路径、预期产物和审批点                             |
| 删除、覆盖、安装、外部副作用、信任边界变化 | Draft -> Plan -> Approval -> Apply | Policy 决定是否需要用户确认和更高信任能力                              |
| 结果不达标或工具失败                       | Observe/Evaluate -> recovery       | recovery 可以 retry、regress、restart 或 escalate-user，但不能自动越权 |

### Workflow 投影

`AgentWorkflowDefinition` 描述稳定流程结构，`AgentWorkflowRun` 描述一次运行，`AgentWorkflowNode` 表达 IDC stage、prompt、tool、media-task、approval、evaluator 或 artifact 节点，`AgentWorkflowTransition` 记录切换原因。UI 只展示 projection，不推导流程策略。

异步 task、media task、subagent event 和 artifact projection 应尽量携带 `conversationId`，在可用时携带 `workflowDefinitionId`、`workflowRunId`、`workflowNodeId`。这样 Webview 可以恢复视图，Agent runtime 也能把结果重新接回当前创作意图。

## Agent 交互协议

Agent 有三类协议面，不能混用：

| 协议面            | 参与方                            | 内容                                                                           | 约束                                                 |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Webview protocol  | Webview ↔ Extension               | `sendMessage`、confirm tool、plan action、slash command、settings、open/reveal | 只传投影和用户意图，不传 secret 和 runtime internals |
| Runtime protocol  | Extension adapter ↔ Agent runtime | turn assembly、workflow run、tool call、approval、memory、artifact projection  | host-agnostic，使用 ports/adapters                   |
| Provider protocol | Runtime/AI SDK ↔ model provider   | messages、tool schemas、structured output、多模态 payload                      | provider-specific 差异在 adapter 内消化              |

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

## Capability、Skill、Prompt

Capability 分 Registration 和 Injection 两个阶段：

```text
Registration
  builtin / package / market / local / MCP / provider contribution
  -> registry, diagnostics, trust, host requirements
        |
        v
Injection
  active skill + workflow node + provider capability + policy + context budget
  -> prompt fragments + tool schemas + allowlist + structured output schemas
```

### 能力边界

| 概念           | 负责                                                          | 不负责                   |
| -------------- | ------------------------------------------------------------- | ------------------------ |
| Skill          | 领域策略、prompt fragments、allowed tools、适用场景、信任要求 | 执行副作用、保存项目事实 |
| Tool           | 原子能力调用、schema、权限、来源、结果和附件                  | 决定何时进入 LLM 上下文  |
| ToolGroup      | 跨 Skill 共享的一组能力                                       | 为了视觉分组滥建         |
| ProviderCard   | 模型能力、输入输出模态、表达偏好、结构化输出支持              | 改写领域事实             |
| PromptFragment | 可组合提示片段                                                | 执行工具或读取文件       |
| MCP            | 外部 tool/resource/prompt 后端                                | 替代 Skill 或 Policy     |

### Skill 生命周期

| 阶段       | 设计规则                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Discover   | 从 builtin、workspace、market、local、MCP 或 provider contribution 发现，不执行副作用                                          |
| Validate   | 校验 manifest、schema、trust、host requirements、tool references、prompt fragment 形状                                         |
| Register   | 进入 registry，产出 diagnostics 和 capability metadata                                                                         |
| Activate   | 根据用户意图、slash command、active skill、workflow node 或领域上下文选择候选                                                  |
| Inject     | 在 policy、token budget、provider capability 和 workflow stage 允许时注入 prompt fragments、tool schemas 和 structured schemas |
| Observe    | 记录 capability diagnostics、tool result metadata、artifact refs 和 feedback signal                                            |
| Deactivate | 切换会话、清除 active skill、失去 trust/host requirement 或上下文不再匹配时移出 injection set                                  |

Skill-first 的含义是“领域策略包先行”，不是“Skill 拥有执行引擎”。跨领域创作应通过多个 capability 的显式注入组合完成，而不是在某个 skill 中硬编码对其他包的内部调用。

### Prompt 层次

| 层          | 内容                                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| base        | 项目级行为边界、安全规则、Agent 角色                                             |
| schema      | 工具参数、IDC artifact、structured output、recovery decision                     |
| skill       | active skill 和 capability prompt fragments                                      |
| environment | locale、settings、AGENTS.md overlay、provider expression、memory/context summary |
| ephemeral   | 当前 workflow node、selected context、tool allowlist、多模态 evidence            |

Prompt 生成应输出 prompt snapshot/hash 和 diagnostics，便于追踪 drift。Provider 不支持 native tool calling 或 structured output 时，由 adapter 决定 prompt-only 投影或返回 capability diagnostic。

Prompt-first 的边界：

- Prompt fragment 必须有稳定 id、来源、优先级和适用条件。
- Prompt 不携带 provider credential、Webview URI、绝对路径、runtime token 或一次性 stream id。
- Prompt 不隐藏工具调用或权限要求；需要工具时由 schema/allowlist 显式暴露。
- Provider expression fragment 只能描述模型表达偏好，不能改写领域事实。
- AGENTS.md overlay 属于 environment layer；它影响行为边界，不替代 package/domain contract。

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
| untrusted/local capability 注入                   | 默认不自动执行，不进入高风险 tool allowlist                              |
| secret/token/provider credential                  | 只通过 Auth/config/provider adapter，不写 prompt、skill 或 Webview state |

Approval 是运行时 gate，不应埋在 prompt 文案里。Policy 可以影响 tool allowlist、workflow stage、provider choice 和 recovery path。

## Evaluation 与 Recovery

Evaluation 是横切审阅面，不是默认 IDC 阶段。

- deterministic evaluator 适合格式、尺寸、duration、schema、引用完整性、权限合规检查。
- LLM-as-judge 只通过 Provider adapter 接入，并保留 provider/model/prompt snapshot。
- 失败结果可以生成 retry、regress、restart、escalate-user 等 recovery signal。
- Recovery 不得绕过 Approval/Policy，也不得把 evaluator 建议直接写入 confirmed fact。
- 普通用户流不应隐式插入消融或评测节点；研发验证与普通创作主路径分离。

| Recovery signal | 含义                                 | 约束                            |
| --------------- | ------------------------------------ | ------------------------------- |
| retry-tool      | 同一工具参数或小范围修正后重试       | 只适合幂等或可回滚工具          |
| retry-stage     | 保持用户目标，重新执行当前 IDC stage | 需要保留失败 diagnostics        |
| regress         | 回到 Draft 或 Plan 修正目标/方案     | 不自动丢弃用户已确认内容        |
| restart-run     | 重新创建 workflow run                | 需要明确 lineage 和用户可见说明 |
| escalate-user   | 请求用户决策、授权或补充素材         | 不用模型臆造缺失事实            |

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
| Extension 拼 prompt 或决定 workflow            | Host adapter 变成业务层            | runtime 负责 prompt/workflow，Extension 注入能力 |
| Skill 内藏执行逻辑                             | Skill 变成不可审计 workflow engine | Skill 只声明策略、片段、工具范围                 |
| 注册能力即注入 LLM                             | token 爆炸和权限泄漏               | Registration 与 Injection 分离                   |
| Tool 结果直接写项目事实                        | 副作用不可审计                     | 通过领域服务、审批和事实层                       |
| Provider adapter 拥有领域逻辑                  | 模型供应商影响业务语义             | provider 只做消息/工具/多模态投影                |
| Memory 替代素材/实体事实                       | 事实漂移、难以协作                 | Memory 只保存上下文和 evidence refs              |
| Evaluation 自动改 confirmed fact               | 审阅绕过用户意图                   | 输出 repair suggestion，等待 policy/approval     |

## 与创作领域的关系

| 创作领域 | Agent 参与方式                                    |
| -------- | ------------------------------------------------- |
| 视频     | 分镜、视频理解、自动后期、剪辑建议、质量审阅      |
| 音频     | 转写、效果链建议、混音/后期建议、音频质量审阅     |
| 模型     | LookDev、材质/灯光建议、捏脸、场景编辑和验证      |
| 2D       | 图像准备、PSD 分层建议、Puppet 辅助、角色素材整理 |
| 互动     | 流程生成、状态解释、自动连接、运行态审阅与修复    |

领域文档应说明 Agent 如何参与某个创作目标；本文只定义 Agent 自身横切边界。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- Agent unified workflow / IDC
- Agent runtime boundary guard
- Capability Protocol
- Agent media architecture
- Agent memory unification
- multimodal perception and provider-aware delivery
- skill as prompt chains
- agent host boundary review
