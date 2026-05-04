# neko-agent 剩余任务分析

**状态**: P0 未发现新增阻断项 | P1/P2 待收敛 | P1-3 已处理  
**日期**: 2026-05-04  
**范围**: `packages/neko-agent`

---

## 执行摘要

本次检查的核心目标是确认 `neko-agent` 当前是否继续符合以下分层方向：

- Webview 负责 UI 渲染和交互逻辑。
- Extension 负责 VSCode 桥接、Host 能力注入和 `postMessage` 路由。
- Agent / Runtime / Platform 承载具体业务逻辑、运行时状态、任务投影、上下文、subagent、skill、IDC 等领域能力。

结论：当前主方向已经基本正确，没有发现新的 P0 阻断问题。前几轮清理后，market、connection state、generation progress、MCP test result 等无效 bridge 没有反弹；异步任务、media task、subagent 也已经按 `conversationId` 进入协议与 Webview 状态隔离链路。

剩余工作主要是 P1/P2 级别的架构收敛：继续压薄 Extension 的 turn 组装层、抽象 VSCode Event 形态、收敛 barrel 导出和少量命名/注释漂移。

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
- `neko-canvas` 对已删除命令 `neko.agent.reportGenerationProgress` 的 fire-and-forget 调用已删除，保留 canvas 自己的 `generationProgress` Webview 进度链路。

关键位置：

- `packages/neko-agent/packages/agent-types/src/webview-protocol.ts`
- `packages/neko-agent/packages/extension/src/chat/router/conversationRoutes.ts`
- `packages/neko-agent/packages/extension/src/chat/router/planRoutes.ts`
- `packages/neko-agent/packages/agent/src/session/conversation-control-runtime.ts`
- `packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts`

---

## 剩余 P1 任务

### P1-1：继续压薄 `AgentTurnBridge`

`AgentTurnBridge` 仍然是当前最厚的 Extension 桥接点。它同时装配：

- `conversationId`
- chat model / media model / media model selections
- provider source
- settings snapshot
- base system prompt
- plan mode
- active skill
- workspace root
- ambient canvas
- timeline context packet
- stream processor
- subagent event subscription
- task manager

关键位置：

- `packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-turn-runtime.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-turn-context.ts`
- `packages/neko-agent/packages/agent/src/runtime/timeline-context-runtime.ts`

建议方向：

1. 在 `@neko/agent/runtime` 定义更明确的 `AgentTurnHostAdapters` / `AgentTurnAssemblyInput`。
2. 将 provider/settings/prompt/context/timeline 的组装规则进一步下沉到 runtime。
3. Extension 只提供 `getWorkspaceRoot`、`postMessage`、`getActiveEditor`、`processStream` 等 Host adapter。

目标边界：

```text
Webview
  -> postMessage schema
Extension
  -> VSCode host adapters + dependency injection
Agent runtime
  -> turn assembly / prompt / model / context / stream rule
Platform
  -> provider / media / config / task concrete capabilities
```

### P1-2：抽象 `AgentRunner` 的 VSCode Event 接口

`AgentRunner` 当前已经基本是 VSCode wrapper，但接口仍直接继承 `vscode.Disposable` 并暴露 `vscode.Event`。这会让 extension 外的消费者难以复用同一 runner contract。

关键位置：

- `packages/neko-agent/packages/extension/src/ai/agentRunner.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-session-runner.ts`
- `packages/neko-agent/packages/agent/src/runtime/agent-runtime-session-controller.ts`

建议方向：

1. 在 `@neko/agent/runtime` 定义 host-agnostic 的 `AgentRunnerPort`。
2. Extension 侧保留 `VSCodeAgentRunnerAdapter`，负责把 runtime event 转为 `vscode.EventEmitter`。
3. `AgentManager` 后续依赖 port，而不是直接依赖 VSCode 形态。

收益：

- CLI / TUI / 测试环境可以复用同一 contract。
- Extension 的职责更明确：只适配 VSCode lifecycle 和事件机制。
- subagent、context、skill、tool confirmation 的接口能统一到 runtime contract。

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

---

## 建议处理顺序

1. 先处理 P1-1：围绕 `AgentTurnBridge` 抽 runtime assembly contract，分批迁移 settings/provider/prompt/context 组装。
2. 再处理 P1-2：抽 `AgentRunnerPort`，Extension 保留 VSCode adapter。
3. 然后处理 P2-1/P2-2：barrel cleanup 和 watcher adapter 进一步瘦身。
4. 最后继续 P2/P3 dead-code scan，优先确认真实 UI/跨扩展调用后再删。

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
