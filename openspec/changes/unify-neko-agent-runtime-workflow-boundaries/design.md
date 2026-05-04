## Context

`neko-agent` 当前已经具备 IDC 三阶段、skill 注入、prompt composer、subagent、异步 task、media task、market install target、capability runtime 和 Webview work-item projection。2026-05-04 的剩余任务评估显示没有新增 P0，但仍有两个 P1 结构性问题：

- `AgentTurnBridge` 在 Extension 层装配 settings、provider、system prompt、plan mode、active skill、workspace、timeline、stream、subagent、task manager。
- `AgentRunner` 仍把 core runner contract 暴露为 `vscode.Event` / `vscode.Disposable` 形态。

这些问题暂时没有破坏硬边界，但会阻碍 CLI/TUI/test runtime 复用、market skill 动态注入、统一 workflow、prompt/schema 动态生成、多模态工具链和消融实验的可测性。本变更以现有 ADR 为基础：`agent-unified-workflow.md`、`adr-capability-protocol.md`、`agent-multi-agent-federation.md`、`ablation-experiment-framework.md` 和 `neko-agent-remaining-tasks-2026-05-04.md`。

## Goals / Non-Goals

**Goals:**

- 固化 Webview / Extension / Agent runtime / Platform / AI SDK 的职责边界，并用架构 guard 防回归。
- 把 turn assembly、runner contract、IDC stage、workflow、skill/capability injection、prompt/schema generation 下沉到 host-agnostic runtime。
- 支持 market skill 安装后的动态发现、校验、注册和按需注入。
- 支持统一 workflow：IDC Draft / Plan / Apply、plan mode 切换、prompt-chain、tool-chain、subagent-chain、异步 task 和 multi-agent projection。
- 支持统一多模态上下文和多模态工具调用 schema。
- 支持消融实验、效果验证和动态演化记录，验证各能力不是“只存在于架构图里”。

**Non-Goals:**

- 不重写现有聊天 UI、Webview 组件树或视觉设计。
- 不把 `neko-agent` 变成独立音视频工作站；专业编辑仍由 `neko-cut`、`neko-canvas`、`neko-audio`、`neko-model` 等子包承担。
- 不引入跨进程或跨机器 multi-agent federation；本变更只要求 host-agnostic contract 和现有 subagent/task 链路统一。
- 不改变 `neko-market` 的核心安装职责；agent 只消费安装后的 skill/capability projection。
- 不在 Extension 中实现新的 agent 策略、LLM 规划器或 workflow planner。

## Decisions

### Decision 1: Runtime owns turn assembly; Extension owns host adapters

新增或收敛 `AgentTurnAssemblyInput`、`AgentTurnHostAdapters`、`AgentTurnRuntimeServices`。Extension 传入 VSCode/Webview 相关 adapter，runtime 负责组合 settings snapshot、provider source、base prompt、plan mode、active skill、context packet、timeline packet、task manager 和 subagent subscription policy。

替代方案是继续让 `AgentTurnBridge` 做“薄一点的组装”。该方案仍会让每个新增上下文来源都修改 Extension，并继续把 agent 策略散落在 bridge 中。

目标调用形态：

```text
Webview message
  -> Extension route validates protocol and creates host adapters
  -> @neko/agent/runtime assembles turn context and runs workflow
  -> Platform/AI SDK/tool runtime execute
  -> Extension stream adapter posts typed projections to Webview
```

### Decision 2: AgentRunnerPort is host-agnostic

在 `@neko/agent/runtime` 定义 `AgentRunnerPort`、`AgentRunnerEventSource` 和 `DisposableLike`。Extension 中的 `AgentRunner` 改为 `VSCodeAgentRunnerAdapter` 或保留类名但内部只桥接 VSCode EventEmitter。`AgentManager` 逐步依赖 port，而不是依赖 `vscode.Event`。

替代方案是在 extension 层继续 re-export `IAgentRunner`。它会把 VSCode 类型泄漏给测试、CLI 和未来非 VSCode host。

### Decision 3: Capability registration and injection remain separate

Capability runtime 采用两阶段：Registration 只发现并校验能力，Injection 按当前 workflow node、IDC stage、active skill、trust、host requirement、tool budget 和 ablation toggles 决定是否进入 LLM context。

替代方案是安装 skill 后立即注入全部 prompt/tool。它会导致 token 膨胀、权限不可审计，并让消融实验无法隔离 skill discovery 与 skill injection。

### Decision 4: Workflow is the single orchestration envelope

定义 `AgentWorkflowDefinition`、`AgentWorkflowRun`、`AgentWorkflowNode`、`AgentWorkflowTransition`。IDC Draft / Plan / Apply 是 workflow stage profile；prompt-chain、tool-chain、subagent-chain 和 media generation task 都是 node 类型。PlanMode 不是 Webview toggle，而是 runtime 选择完整 IDC profile 的 mode signal。

替代方案是保留 pipeline、IDC、subagent、async task、slash command 各自编排。该方案短期可运行，但每新增一个创作流程都要重复定义 stage、prompt、task、artifact 和 UI 投影。

### Decision 5: Prompt and schema generation is a runtime service

新增 `AgentPromptSchemaGenerator`，输入 `PromptGenerationContext`，输出：

- system prompt fragments
- workflow node prompt
- active skill prompt
- provider expression prompt
- multimodal context summary
- tool allowlist and schemas
- structured output schema
- evaluator/self-check schema

Webview 只选择模式、skill、command 和附件；Extension 只读取文件/编辑器/配置；runtime 决定 prompt/schema。

### Decision 6: Multimodal context is one packet with typed evidence

定义 `MultimodalContextPacket`，统一 text、image、audio、video、canvas、timeline、editor selection、file reference、engine perception evidence。Tool/Model 声明 `acceptedModalities`、`producedModalities`、`evidenceRequirements`。AI SDK adapter 负责把 packet 转换为具体 provider message。

替代方案是继续按 attachment/image/media task 分散处理。它会让音频/视频仍偏“文本引用”，难以被 workflow planner 和 evaluator 统一消费。

### Decision 7: Evaluation and evolution are first-class but non-blocking

消融实验不作为 IDC stage，也不进入普通用户主路径。它作为 runtime/eval harness 读取 workflow run、task results、tool metrics、prompt/schema snapshot 和 artifact evidence，对比 baseline 与 toggled variants。

替代方案是在每个 workflow 中内嵌评估 step。该方案会混淆创作流程与研发验证流程，并增加用户路径延迟。

## Contract Placement

- `packages/neko-agent/packages/agent-types`: workflow/capability/prompt-schema/multimodal/eval 的共享协议、parse/build helper、Webview protocol projection。
- `packages/neko-agent/packages/agent/src/runtime`: turn assembly、runner port、workflow runtime、IDC controller、prompt/schema generator、task/subagent coordinator。
- `packages/neko-agent/packages/agent/src/skill` 和 `agent/src/capability`: skill manifest loader、market/local skill projection、prompt/tool/rule/workflow fragment normalization。
- `packages/neko-agent/packages/platform`: provider/tool/capability concrete bindings、market skill service、media/perception provider routing。
- `packages/neko-agent/packages/ai-sdk`: provider message adapter、tool schema conversion、structured output bridge、多模态 message bridge。
- `packages/neko-agent/packages/extension`: VSCode command/webview/workspace/file/extension API adapters；不得拥有 agent strategy。
- `packages/neko-agent/packages/webview`: UI state、catalog display、workflow/task/subagent/artifact projection、用户操作消息发送。

## Risks / Trade-offs

- [范围过大] → 拆成 runtime boundaries、workflow、capability injection、prompt/schema、multimodal、evaluation 六个 capability，按任务顺序小步迁移。
- [迁移期间双接口并存] → 保留 compatibility wrapper，每个 wrapper 都有 TODO(P1) 和 deprecation test，避免隐性永久化。
- [Prompt/schema generator 过度抽象] → 首版只覆盖当前已有 sources：base prompt、plan mode、active skill、capability fragments、tool schemas、multimodal summaries。
- [Workflow runtime 与已有 pipeline 重叠] → pipeline 首先作为 workflow adapter，不立即删除旧 pipeline。
- [Skill manifest 生态不稳定] → manifest loader 先支持最小 schema 和 strict validation，未知字段保留但不注入。
- [多模态 provider 差异大] → AI SDK adapter 做 provider-specific projection，runtime 只持有 provider-neutral packet。
- [消融指标不代表创作品质] → 同时记录确定性指标和可插拔 evaluator 结果，不把单一分数当作发布闸门。

## Migration Plan

1. 新增 runtime boundary contracts 和 architecture guard tests，确认 `agent/platform/ai-sdk/webview` 不依赖 VSCode，Extension 不依赖 React。
2. 将 `AgentTurnBridge` 的 settings/provider/prompt/context/timeline assembly 下沉到 runtime assembler，Extension 只传 host adapters。
3. 抽 `AgentRunnerPort`，让 Extension runner 成为 VSCode adapter，保留旧接口兼容层。
4. 建立 workflow runtime skeleton，把现有 IDC plan mode、task manager、subagent event、media task 投影接入统一 run/node model。
5. 建立 capability injection schema，接入 market/local skill manifest、slash command catalog、tool/prompt/workflow fragments。
6. 建立 prompt/schema generator，替换分散的 prompt 拼装入口，增加 snapshot tests。
7. 建立 multimodal packet 和 AI SDK adapter，优先覆盖现有 text/image/canvas/timeline，再扩展 audio/video evidence。
8. 接入 evaluation/ablation harness，新增 baseline fixtures 和能力开关。
9. 更新架构文档与 remaining-tasks assessment，运行最小质量门禁。

## Rollback Strategy

每个迁移阶段都保留原 runtime function 的 wrapper。若某阶段回归，可以将 Extension adapter 重新指向旧 runtime entry，同时保留新 contract 的类型和测试。不得通过恢复 Webview/Extension 业务逻辑来回滚。

## Open Questions

- Skill manifest 首版是否只支持 `SKILL.md` frontmatter + sidecar manifest，还是同时支持市场 plugin manifest；建议首版同时解析但只注入最小字段。
- `AgentWorkflowDefinition` 是否作为 public market artifact 暴露；建议首版作为 internal schema，稳定后再进入 market contract。
- 多模态 audio/video evidence 首版依赖 engine perception 还是轻量 metadata extractor；建议 packet 先支持 evidence 引用，具体 extractor 分批接入。
