# NekoAgent

> AI 大脑：接收自然语言意图，分发创作指令

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host (Agent/Platform) + Webview (React 对话 UI)
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：自然语言 → 多模型 LLM 推理 → 调用 Neko-Script / AI 生成 API
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`agent`（框架）、`platform`（LLM 路由）、`cli`（命令行）、`webview`（UI）
- **依赖**：`@neko/agent`、`@neko/platform`、`@neko/shared`
- **激活依赖**：neko-engine、neko-tools、neko-preview

## Architecture

```
用户自然语言输入
  │
  ▼
Webview (React 对话 UI)
  │ postMessage
  ▼
Extension Host
  ├── @neko/platform  → LLM 路由（Claude / OpenAI / Google / Azure / Ollama）
  ├── @neko/agent     → 意图解析、工具调用、MCP 集成
  └── 执行结果
        ├── Neko-Script → neko-cut 时间线操作
        └── AI 生成 API → 图像/视频/TTS/音乐
```

### 包结构

```
packages/
├── agent/      # Agent 框架：意图理解、任务分解、工具调用
├── platform/   # AI 平台服务：多模型路由、流式响应
├── extension/  # VSCode 扩展：命令注册、Webview 管理
├── webview/    # React 对话 UI：聊天界面、历史记录
└── cli/        # CLI 工具：脚本式调用
```

## Deep Dive

### 多模型支持

| 提供商 | 配置 key |
|--------|---------|
| Anthropic | `neko.agent.apiKey.anthropic` |
| OpenAI | `neko.agent.apiKey.openai` |
| Google | `neko.agent.apiKey.google` |
| Azure | `neko.agent.apiKey.azure` |
| Ollama | 本地，无需 key |

### MCP 集成

```json
{
  "neko.agent.mcp.servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "enabled": true
    }
  ]
}
```

### AI 生成能力

图像生成、视频生成、TTS 语音、音乐生成、字幕生成、分镜脚本自动生成
