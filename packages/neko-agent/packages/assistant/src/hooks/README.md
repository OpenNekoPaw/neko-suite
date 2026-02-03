# hooks/

> 自定义 Hooks 模块，提供状态管理功能

## Quick Reference

| Hook | 管理的状态 |
|------|----------|
| `useUIState` | activeTab, inputValue, selectedModel |
| `useConversationState` | messages, isThinking, streamingMessageId, conversations, openTabs |
| `useConfigState` | settings, modelPresets, projectFiles |
| `useResourceState` | backgroundTasks |

**结构**：
```
hooks/
├── index.ts                  # 模块导出
├── useUIState.ts             # UI 状态管理
├── useConversationState.ts   # 会话状态管理
├── useConfigState.ts         # 配置状态管理
└── useResourceState.ts       # 资源状态管理
```

## 使用方式

```typescript
import { useUIState, useConversationState, useConfigState, useResourceState } from '@/hooks';

function AIAssistant() {
  const ui = useUIState();
  const conversation = useConversationState();
  const config = useConfigState();
  const resource = useResourceState();

  const handleSend = () => {
    if (!ui.inputValue.trim()) return;
    conversation.addMessage({ ... });
    ui.clearInput();
  };
}
```

## streamingMessageIdRef

`useConversationState` 提供 `streamingMessageIdRef` 用于异步消息处理：

```typescript
const {
  streamingMessageId,      // React state（渲染用）
  setStreamingMessageId,   // state setter
  streamingMessageIdRef,   // ref（异步处理用）
} = useConversationState();
```

**为什么需要 ref？**
- React state 更新是异步的，在 `setMessages` 回调中可能拿到旧值
- ref 更新是同步的，工具处理器能立即获取最新 ID
- 两者通过 `useEffect` 保持同步

**使用注意**：
- 发送新消息时必须清除两者
- 工具处理器优先使用 `streamingMessageIdRef.current`

## 设计原则

- **关注点分离**：每个 Hook 只管理一类状态
- **封装复杂性**：复杂逻辑封装在 Hook 内部
- **便捷方法**：除 setter 外提供常用操作方法
- **类型安全**：完整 TypeScript 类型定义
