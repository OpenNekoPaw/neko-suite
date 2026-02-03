# chat/

AI 聊天面板模块，提供 AI 助手的 Webview UI 集成。

## 职责

实现 VSCode 侧边栏的 AI 聊天面板，处理消息和设置。

## 结构

```
chat/
├── index.ts              # 模块导出
├── chatProvider.ts       # Webview 视图提供者
├── conversationHandler.ts # 对话处理
├── messageHandler.ts     # 消息处理
├── settingsManager.ts    # 设置管理
├── providerManager.ts    # 提供商管理
├── systemPromptManager.ts # 系统提示词管理
├── types.ts              # 类型定义
└── handlers/             # 消息处理器
    └── index.ts
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `ChatViewProvider` | 类 | Webview 视图提供者 |
| `ConversationHandler` | 类 | 对话处理 |
| `MessageHandler` | 类 | 消息分发 |
| `SettingsManager` | 类 | 配置管理 |
| `ProviderManager` | 类 | 提供商管理 |

## 依赖

```
→ ai/                 # Agent 执行
→ bootstrap/          # Platform 获取
→ @neko/assistant  # 聊天 UI
← extension.ts        # 视图注册
```

## 消息流程

```
Webview (React)
    ↓ postMessage
ChatViewProvider.onMessage()
    ↓
MessageHandler.handle()
    ↓
ConversationHandler / SettingsManager
    ↓
Platform.service.chat()
```
