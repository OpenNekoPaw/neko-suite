# components/

> AI 助手 UI 组件库

## Quick Reference

| 组件 | 用途 |
|------|------|
| `AIAssistant` | 主入口组件，管理状态和消息处理 |
| `ChatView` | 聊天界面（消息列表、输入框）|
| `AccountBar` | 账户状态栏（SSO / 自定义 Key / 未配置）|
| `OnboardingFlow` | 首次配置 AI 服务的引导流程 |
| `Header` | 顶部导航栏 |
| `TaskListView` | 后台任务状态展示 |

**结构**：
```
components/
├── index.tsx             # 主组件入口（AIAssistant）
├── types.ts              # 类型定义
├── ChatView/             # 聊天视图
├── AccountBar/           # 账户状态栏（替代设置齿轮）
├── OnboardingFlow/       # 首次配置引导
├── Header/               # 顶部导航
├── TaskListView.tsx      # 后台任务列表
└── hooks/                # 组件级 Hooks
```

## 消息发送流程

`index.tsx` 中的 `handleSend` 函数：

```typescript
const handleSend = () => {
  // 1. 清除上一轮流式状态（防止工具卡片添加到错误消息）
  setStreamingMessageId(null);
  streamingMessageIdRef.current = null;

  // 2. 添加用户消息到列表
  setMessages(prev => [...prev, userMessage]);

  // 3. 发送到 Extension Host
  VSCodeMessages.sendMessage(text, providerId, modelId);
};
```

## 依赖关系

```
→ config/         # 配置管理
→ hooks/          # 自定义 Hooks
→ handlers/       # 消息处理器
→ i18n/           # 国际化
← main.tsx        # 应用入口
```
