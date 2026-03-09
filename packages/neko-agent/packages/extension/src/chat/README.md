# chat/

AI 聊天面板模块，提供 AI 助手的 Webview UI 集成。

## 职责

实现 VSCode 侧边栏的 AI 聊天面板，处理消息和设置。

## 结构

```
chat/
├── index.ts              # 模块导出（仅 ChatViewProvider）
├── chatProvider.ts       # Webview 视图提供者（入口编排）
├── conversationHandler.ts # 对话管理
├── messageHandler.ts     # AI 消息分发（Provider 选择 + Agent 调用）
├── settingsManager.ts    # 设置管理
├── providerManager.ts    # 提供商读取/查询
├── systemPromptManager.ts # 系统提示词管理
├── types.ts              # UI 层类型定义
└── handlers/             # 消息处理器（按领域拆分，均支持 updateDeps()）
    ├── conversationHandler.ts # 对话 CRUD + Agent 控制（confirmTool/cancel/stop）
    ├── taskHandler.ts
    ├── modelPresetHandler.ts  # Stub — 配置操作由 ConfigBridge 处理
    ├── skillHandler.ts
    ├── fileOperationHandler.ts
    ├── planModeHandler.ts
    ├── providerHandler.ts
    ├── settingsHandler.ts
    ├── contextHandler.ts
    ├── slashCommandHandler.ts
    └── integrationHandler.ts
```

## 接口

| 导出               | 类型 | 用途                               |
| ------------------ | ---- | ---------------------------------- |
| `ChatViewProvider` | 类   | Webview 视图提供者（唯一公开 API） |

其余类（`ConversationHandler`、`MessageHandler`、`SettingsManager`、`ProviderManager` 等）为模块内部使用，不对外导出。

## 依赖

```
→ ai/                 # Agent 执行（AgentRunner/AgentManager）
→ services/           # ConfigBridge（统一配置消息）、ConnectionStateManager
→ bootstrap/          # Platform / TaskManager 获取
→ editor/common/      # EditorRegistry
→ @neko-agent/webview  # 聊天 UI
← index.ts            # 视图注册入口
```

## 消息流程

```
Webview (React)
    ↓ postMessage
ChatViewProvider._setupMessageHandlers()
    ├─ ConfigBridge.handleMessage()   # 配置 CRUD（Provider/Prompt/Skill/Hook）
    └─ switch(message.type)           # 聊天特定消息
        ├─ ConversationMessageHandler # 对话管理 + Agent 控制
        ├─ MessageHandler             # AI 对话（sendMessage）
        ├─ TaskHandler                # 任务管理
        ├─ SkillHandler               # 技能系统
        ├─ PlanModeHandler            # 计划模式
        ├─ ProviderHandler            # Provider 开关
        ├─ SettingsHandler            # 设置读写
        ├─ ContextHandler             # 上下文压缩
        ├─ SlashCommandHandler        # 斜杠命令
        ├─ FileOperationHandler       # 文件操作
        └─ IntegrationHandler         # MCP 集成
```
