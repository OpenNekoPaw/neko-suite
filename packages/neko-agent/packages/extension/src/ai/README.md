# ai/

Agent 管理模块，提供 AI Agent 的创建和执行管理。

## 职责

封装 platform 的 Agent 能力，提供 VSCode 上下文感知的 Agent 管理。

## 结构

```
ai/
├── index.ts              # 模块导出
├── agentContext.ts       # Agent 上下文
├── agentRunner.ts        # Agent 执行器
└── agentManager.ts       # Agent 管理器
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `IAgentContext` | 接口 | Agent 上下文定义 |
| `createDefaultAgentContext()` | 函数 | 创建默认上下文 |
| `AgentRunner` | 类 | Agent 执行器 |
| `AgentManager` | 类 | Agent 生命周期管理 |

## 依赖

```
→ @neko/platform   # Agent 执行器
→ bootstrap/          # 服务获取
← chat/               # 聊天面板调用
```
