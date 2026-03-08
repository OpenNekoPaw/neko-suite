# handlers/

> 消息处理器模块，使用注册表模式管理 WebView 消息

## Quick Reference

| 处理器 | 消息类型 |
|--------|---------|
| `streaming-handlers` | thinking, response, streamText, streamComplete, streamThinking, thinkingComplete, messageCancelled, messageQueued, agentPhase, agentStateSnapshot |
| `tool-handlers` | toolCall, toolResult, toolConfirmation, planStepStatusUpdate, planStatusUpdate |
| `message-updater` | 统一 current/nonCurrent 路由（`updateConversation`）|
| `conversation-handlers` | error, historyCleared, conversationList, activeConversation |
| `config-handlers` | settingsData, projectFiles, configState, configChanged |
| `task-handlers` | tasksUpdated, taskCreated, taskUpdated, taskRemoved |

**结构**：
```
handlers/
├── index.ts                  # 模块导出
├── registry.ts               # 消息处理器注册表
├── useMessageHandler.ts      # 消息处理 Hook
├── message-updater.ts        # 统一会话更新路由（updateConversation）
├── streaming-handlers.ts     # 流式消息处理
├── tool-handlers.ts          # 工具调用处理（contentBlocks 为数据源）
├── conversation-handlers.ts  # 会话消息处理
├── config-handlers.ts        # 配置消息处理
└── task-handlers.ts          # 任务消息处理
```

## 使用方式

```typescript
import { useMessageHandler } from '@/handlers';

function AIAssistant() {
  const { handleMessage } = useMessageHandler({
    streamingMessageId,
    setMessages,
    setIsThinking,
    // ...
  });

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);
}
```

## 扩展新消息类型

```typescript
// 1. 在处理器文件添加函数
const handleNewMessage: MessageHandler = (message, context) => { ... };

// 2. 添加到导出数组
export const myHandlers: HandlerRegistration[] = [
  { type: 'newMessage', handler: handleNewMessage },
];

// 3. 在 index.ts 注册
registry.registerAll(myHandlers);
```

## 工具消息定位机制

`tool-handlers.ts` 中 `findTargetMessageForToolCall` 优先级：

1. **streamingMessageIdRef** - 当前流式输出的消息 ID
2. **isStreaming 标志** - 最后一个 `isStreaming=true` 的 assistant 消息
3. **位置回退** - 最后一个用户消息之后的 assistant 消息

**重要**：发送新消息时必须清除 `streamingMessageId`，否则工具卡片会被添加到错误消息。

## 会话更新模式

`message-updater.ts` 提供 `updateConversation()` 统一处理 current/nonCurrent 分发：

```typescript
// Before: 每个 handler 重复 if/else 分支
if (context.isCurrentConversation(conversationId)) {
  context.setMessages(prev => ...);
} else if (conversationId) {
  context.updateNonCurrentConversation(conversationId, (msgs, streaming) => ...);
}

// After: 统一路由
updateConversation(context, conversationId, (msgs, streamingId) => ({
  messages: updatedMessages,
  streamingMessageId: newId,  // optional
  isThinking: false,          // optional
}));
```

## toolCalls 派生

`toolCalls[]` 不再直接更新，由 `utils/message-helpers.ts` 从 contentBlocks 自动派生：

```typescript
import { deriveToolCalls, updateToolCallInBlocks } from '../utils/message-helpers';

const updatedBlocks = updateToolCallInBlocks(msg.contentBlocks || [], toolCallId, tc => ({ ...tc, result }));
return { ...msg, contentBlocks: updatedBlocks, toolCalls: deriveToolCalls(updatedBlocks) };
```

## 设计原则

- **开闭原则**：添加新消息类型无需修改现有代码
- **单一职责**：每个处理器文件只处理一类消息
- **依赖注入**：通过 context 注入状态和操作
- **单一数据源**：contentBlocks 为 tool call 数据的唯一来源
