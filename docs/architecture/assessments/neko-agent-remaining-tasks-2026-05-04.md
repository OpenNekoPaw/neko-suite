# neko-agent 剩余任务分析

**状态**: P0 未发现新增阻断项 | P1 运行时边界已收敛 | P2/P3 保留兼容清理与验证债
**日期**: 2026-05-04  
**范围**: `packages/neko-agent`

---

## 执行摘要

本次检查的核心目标是确认 `neko-agent` 当前是否继续符合以下分层方向：

- Webview 负责 UI 渲染和交互逻辑。
- Extension 负责 VSCode 桥接、Host 能力注入和 `postMessage` 路由。
- Agent / Runtime / Platform 承载具体业务逻辑、运行时状态、任务投影、上下文、subagent、skill、IDC 等领域能力。

结论：当前主方向已经基本正确，没有发现新的 P0 阻断问题。前几轮清理后，market、connection state、generation progress、MCP test result 等无效 bridge 没有反弹；异步任务、media task、subagent 也已经按 `conversationId` 进入协议与 Webview 状态隔离链路。

2026-05-04 的 `unify-neko-agent-runtime-workflow-boundaries` 变更已经完成 P1 主体迁移：Extension 侧 `AgentTurnBridge` 降为 host adapter，`AgentRunner` 对齐 `AgentRunnerPort`，IDC / workflow / capability injection / prompt-schema / multimodal packet / eval harness 均有 runtime contract 与 targeted tests。剩余工作主要是 P2/P3 兼容清理、barrel 导出收敛、`AgentSession` 更深层接入 prompt/schema facade，以及全量 `@neko/agent` 类型债的后续清理。

---

## 当前已收口项

### 1. 异步任务与 subagent 已按会话隔离

以下协议已经带 `conversationId`：

- `tasksUpdated`
- `taskCreated`
- `taskUpdated`
- `taskRemoved`
- `mediaTaskCreated`
- `mediaTaskProgress`
- `subagentEvent`

Webview 侧也已经使用按会话隔离的 `AgentWorkItemStore`，而不是全局数组覆盖。`tasksUpdated` 当前是会话级 merge，不再是全局替换。

关键位置：

- `packages/neko-agent/packages/agent-types/src/webview-protocol.ts`
- `packages/neko-agent/packages/webview/src/handlers/task-handlers.ts`
- `packages/neko-agent/packages/webview/src/handlers/subagent-handlers.ts`
- `packages/neko-agent/packages/webview/src/presenters/work-item-state-presenter.ts`
- `packages/neko-agent/packages/agent/src/runtime/subagent-event-runtime.ts`
- `packages/neko-agent/packages/agent/src/runtime/media-turn-webview-runtime.ts`
- `packages/neko-agent/packages/agent/src/task/task-runtime.ts`

### 2. 重复投影逻辑已下沉到共享契约

之前 Review 中确认的重复实现已经基本收口：

- work-item projector 已集中到 `@neko-agent/types/work-item-projector`。
- tool summary 已集中到 `@neko-agent/types/tool-summary`。
- plan message updater 已集中到 `@neko-agent/types/plan-message-updater`。
- slash command normalize 已集中到 `@neko-agent/types/slash-command-utils`。
- `PLAN_MODE_SYSTEM_REMINDER` 已统一从 `agent/src/permission/types.ts` 使用。

关键位置：

- `packages/neko-agent/packages/agent-types/src/work-item-projector.ts`
- `packages/neko-agent/packages/agent-types/src/tool-summary.ts`
- `packages/neko-agent/packages/agent-types/src/plan-message-updater.ts`
- `packages/neko-agent/packages/agent-types/src/slash-command-utils.ts`
- `packages/neko-agent/packages/agent/src/permission/types.ts`
- `packages/neko-agent/packages/agent/src/session/agent-session.ts`

### 3. Extension 与 Webview 的硬边界未破坏

当前扫描未发现：

- `agent` / `platform` / `agent-types` / `webview` 直接导入 `vscode`。
- `extension` / `agent` / `platform` 直接导入 React。

这符合 VSCode Webview 沙箱约束和仓库层级隔离约束。

### 4. market 管理方向已收敛

Agent Webview / Extension 内嵌 marketplace bridge 已删除。Skill 安装目标现在由 `neko-market` core 统一提供，platform 侧通过 alias 使用，不再存在两个独立 `SkillInstallTarget` 实现。

关键位置：

- `packages/neko-market/packages/core/src/install/skill-install-target.ts`
- `packages/neko-agent/packages/platform/src/market/skill-market-service.ts`
- `packages/neko-agent/packages/platform/src/market/__tests__/skill-install-target.test.ts`

### 5. Webview message 路由已加入编译期穷尽检查

`WEBVIEW_TO_EXTENSION_MESSAGE_TYPES`、`CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES`、`CONFIG_BRIDGE_MESSAGE_TYPES` 仍然分层维护，但 `chatWebviewMessageRouter.ts` 已加入 type-level `never` 断言：

- 新增 Webview message 后，若未归属到 chat router 或 ConfigBridge，`tsc` 会直接失败。
- chat router 与 ConfigBridge 若声明重复 message type，`tsc` 会直接失败。
- Vitest 中的 runtime 覆盖检查继续保留，作为运行时防线。

关键位置：

- `packages/neko-agent/packages/extension/src/chat/chatWebviewMessageRouter.ts`
- `packages/neko-agent/packages/extension/src/chat/__tests__/chatWebviewMessageRouter.test.ts`

### 6. 无发送端的控制消息已清理

`stopAgent` 与 Webview→Extension `togglePlanMode` 均已从 Webview 协议和 Extension router 中删除：

- `stopAgent` 的 Webview→Extension message、Extension route、handler、runtime `runStopAgentRuntime`、`agentStopped` Extension→Webview 投影链路均已删除。
- Webview→Extension `togglePlanMode` message 已删除；`/plan` slash command 仍通过 `PlanModeHandler.handleTogglePlanMode` 与 prompt runtime 走内部链路。
- `parseWebviewToExtensionMessage({ type: 'togglePlanMode' })` 测试已同步为返回 `null`，避免协议删除后测试仍期望旧消息可解析。
- `neko-canvas` 对已删除命令 `neko.agent.reportGenerationProgress` 的 fire-and-forget 调用已删除，保留 canvas 自己的 `generationProgress` Webview 进度链路。

关键位置：

- `packages/neko-agent/packages/agent-types/src/webview-protocol.ts`
- `packages/neko-agent/packages/agent-types/src/__tests__/webview-protocol.test.ts`
- `packages/neko-agent/packages/extension/src/chat/router/conversationRoutes.ts`
- `packages/neko-agent/packages/extension/src/chat/router/planRoutes.ts`
- `packages/neko-agent/packages/agent/src/session/conversation-control-runtime.ts`
- `packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts`

### 7. P1 runtime boundary 已完成主体迁移

`AgentTurnBridge` 不再拥有 turn assembly 策略。Extension 现在负责收集 VSCode/Webview host 输入并创建 adapter，runtime 通过 `AgentTurnHostAdapters`、`AgentTurnAssemblyInput`、`AgentTurnRuntimeServices` 统一组装 provider/settings/prompt/context/timeline/task/subagent 输入。

关键位置：

- `packages/neko-agent/packages/agent/src/runtime/agent-turn-assembly.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-turn-runtime.ts`
- `packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts`
- `packages/neko-agent/packages/agent/src/runtime/__tests__/agent-turn-runtime.test.ts`

`AgentRunner` 已对齐 host-agnostic runner port。核心 contract 使用 `AgentRunnerPort`、`AgentRunnerPortEvent`、`DisposableLike`，Extension 侧保留 VSCode `EventEmitter` 作为 adapter surface，用于兼容现有 VSCode consumers。

关键位置：

- `packages/neko-agent/packages/agent/src/runtime/agent-runner-port.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-runtime-manager.ts`
- `packages/neko-agent/packages/extension/src/ai/agentRunner.ts`
- `packages/neko-agent/packages/agent/src/runtime/__tests__/agent-runner-port.test.ts`
- `packages/neko-agent/packages/extension/src/ai/agentRunner.test.ts`

### 8. IDC / workflow / skill / prompt / multimodal / eval 已形成统一 runtime 基线

新增或收敛的核心运行时能力：

- IDC Draft / Plan / Apply：通过 `AgentWorkflowDefinition`、`AgentWorkflowRun`、`AgentWorkflowNode`、`AgentWorkflowTransition` 表达，PlanMode / AutoMode 由 runtime 选择 workflow profile，而不是 Webview 只切 UI 状态。
- market/local/builtin/plugin/MCP/provider capability：统一为 `AgentCapabilityContribution`，registration 与 injection 分离，trust、host requirement、permission、workflow node、tool budget、ablation toggle 均在 runtime 注入前判定。
- slash command catalog：由 runtime-normalized capability projection 生成，Webview 只展示和发送 typed invocation。
- prompt/schema：`AgentPromptSchemaGenerator` 基于 base、locale、settings、AGENTS.md overlay、IDC stage、PlanMode、active skill、workflow node、capability fragments、provider fragments、memory/multimodal summary、tool schemas 生成 per-turn prompt 与 structured schemas。
- 多模态：`MultimodalContextPacket` 统一 text/image/audio/video/canvas/timeline/editor/file/artifact/evidence；tool 使用 `AgentToolModalityDeclaration` 声明输入/输出媒体能力；AI SDK/platform adapter 负责 provider-specific projection。
- subagent / multi-agent：runtime coordinator 负责 spawn/cancel/budget/depth/event projection/linkage，Extension 只桥接事件。
- 消融实验与动态演化：workflow evaluation harness 记录 workflow metrics、prompt/schema hash、capability evolution events，并能在 mock host adapter / no Webview 环境运行。

关键位置：

- `packages/neko-agent/packages/agent-types/src/workflow.ts`
- `packages/neko-agent/packages/agent-types/src/capability.ts`
- `packages/neko-agent/packages/agent-types/src/prompt-schema.ts`
- `packages/neko-agent/packages/agent-types/src/multimodal-tooling.ts`
- `packages/neko-types/src/types/multimodal-context.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-workflow-runtime.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-capability-injection-runtime.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-prompt-schema-generator.ts`
- `packages/neko-agent/packages/agent/src/runtime/multimodal-context-packet.ts`
- `packages/neko-agent/packages/ai-sdk/src/multimodal-message-projection.ts`
- `packages/neko-agent/packages/agent/src/experiment/workflow-evaluation-harness.ts`

---

## 剩余 P1 兼容风险

### P1-1：`AgentRunner` VSCode event 兼容面继续收口

核心 port 已经存在，但 Extension `IAgentRunner` 为兼容现有 consumers 仍暴露 `vscode.Event` 形态的 `onDidStart`、`onDidStop`、`onDidRequestConfirmation`、`onDidSubAgentEvent`。`onDidRunnerEvent` 已作为统一 port event 增加，后续应逐步让 Extension 内部 consumer 依赖 `AgentRunnerPortEvent`，最终把单独 VSCode event 视为纯 adapter 表面。

关键位置：

- `packages/neko-agent/packages/extension/src/ai/agentRunner.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-runtime-manager.ts`

### P1-2：prompt/schema facade 继续接入 `AgentSession` 深水区

`AgentPromptSchemaGenerator` 已形成 runtime service，但 `AgentSession` 历史路径中仍有部分 prompt composer / module 写入点。当前不构成 Webview/Extension 违背设计的问题，但后续应把 per-turn prompt/schema facade 更深接入 `AgentSession`，让 IDC workflow node、capability fragments、provider expression card、多模态 summary 和 structured output schema 都从同一 facade 进入。

关键位置：

- `packages/neko-agent/packages/agent/src/runtime/agent-prompt-schema-generator.ts`
- `packages/neko-agent/packages/agent/src/session/agent-session.ts`
- `packages/neko-agent/packages/agent/src/prompt/`

## 剩余 P2 任务

### P2-1：barrel 导出继续收敛

当前仍存在少量重复来源导出：

- `packages/neko-agent/packages/agent/src/index.ts`
- `packages/neko-agent/packages/agent-types/src/index.ts`

观察到的重复多为 value/type split，不是功能风险，但会增加 IDE auto-import 路径不稳定。

建议：

- 不做大规模重排。
- 每次只收敛一个入口文件。
- 保持 `tsc --noEmit` 和最小相关测试通过。

### P2-2：`SkillFileService` 可进一步变成纯 watcher adapter

`SkillFileService` 已把扫描、创建、删除、路径触发匹配委托给 `@neko/agent` 的 skill file runtime。剩余 Extension 职责主要是：

- `vscode.workspace.createFileSystemWatcher`
- workspace folder 变更监听
- document save 监听
- VSCode EventEmitter

这是可接受状态。后续如继续压薄，可让 runtime 生成 watch plan，Extension 只执行 watch plan。

关键位置：

- `packages/neko-agent/packages/extension/src/services/SkillFileService.ts`
- `packages/neko-agent/packages/agent/src/skill/skill-file-runtime.ts`

### P2-3：继续 dead-code scan，但避免误删有效链路

以下链路当前仍有效，不应误删：

- `getSkills` / `skillsList`：Webview slash command catalog 使用。
- `tasksUpdated` / `taskCreated` / `taskUpdated` / `taskRemoved`：Work item UI 使用。
- `subagentEvent`：SubAgentCard / work item merge 使用。
- `sendToPlugin` / `pluginsAvailable`：生成资产发送到插件使用。
- `dnd:start`：拖拽生成资产使用。
- `neko.agent.generateForNode`：跨插件命令入口。
- `neko.agent.buildPrompt`：跨插件 prompt 构建入口。

### P2-4：`@neko/agent` 全量 typecheck 仍有既有类型债

targeted runtime / agent-types / ai-sdk tests 已能覆盖本轮新增契约，但 `packages/neko-agent/packages/agent` 的全量 `tsc --noEmit` 仍会暴露较大范围历史类型债。后续不应把这些问题绕回 Extension 或 Webview，而应在 runtime/session/prompt/validation 子域内按契约逐步清理。

### P2-5：ai-sdk Vitest include 未覆盖包内测试

`packages/neko-agent/packages/ai-sdk/src/multimodal-message-projection.test.ts` 当前由 `tsc` 覆盖类型，但 root vitest 默认 include 没有拾取该测试。后续可为 `ai-sdk` 增加轻量 vitest config 或把包级测试纳入统一 test include。

---

## 建议处理顺序

1. 先把 Extension 内部 consumer 从单独 VSCode event 迁到 `AgentRunnerPortEvent`。
2. 再把 `AgentPromptSchemaGenerator` 深接入 `AgentSession` / workflow node 执行路径。
3. 然后处理 P2-1/P2-2：barrel cleanup 和 watcher adapter 进一步瘦身。
4. 并行补 `@neko/agent` 全量 typecheck 类型债与 ai-sdk vitest include。
5. 最后继续 P2/P3 dead-code scan，优先确认真实 UI/跨扩展调用后再删。

---

## 验证建议

每批改动至少运行：

```bash
pnpm --filter @neko-agent/types exec tsc --noEmit
pnpm --filter @neko-agent/webview exec tsc --noEmit
pnpm --filter @neko-agent/extension exec tsc --noEmit
pnpm --filter @neko-agent/extension exec vitest run src/chat/__tests__/chatWebviewMessageRouter.test.ts
```

涉及 work item / subagent / task 时追加：

```bash
pnpm --filter @neko-agent/webview exec vitest run src/handlers/__tests__/work-item-handlers.test.ts
pnpm --filter @neko-agent/webview exec vitest run src/presenters/__tests__/work-item-state-presenter.test.ts
```

涉及 runtime turn assembly 时追加：

```bash
pnpm --filter @neko/agent exec vitest run src/runtime/__tests__/agent-turn-runtime.test.ts
pnpm --filter @neko/agent exec vitest run src/runtime/__tests__/message-runtime.test.ts
```

涉及统一 workflow / capability / prompt-schema / multimodal / eval 时追加：

```bash
pnpm --dir packages/neko-agent exec vitest run \
  packages/agent/src/runtime/__tests__/agent-workflow-runtime.test.ts \
  packages/agent/src/runtime/__tests__/agent-capability-injection-runtime.test.ts \
  packages/agent/src/runtime/__tests__/agent-prompt-schema-generator.test.ts \
  packages/agent/src/runtime/__tests__/multimodal-context-packet.test.ts \
  packages/agent/src/experiment/__tests__/workflow-evaluation-harness.test.ts
pnpm check:agent-boundaries
openspec validate unify-neko-agent-runtime-workflow-boundaries --strict
```
