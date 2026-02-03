# NekoAgent

> AI 大脑：接收自然语言意图，分发 Neko-Script 指令

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：AI Agent，自然语言驱动创作
- **规范**：[README.md](../../README.md)

---

## 概述

**NekoAgent** 是 Neko Suite 的 AI 大脑，接收用户的自然语言意图，将其转化为 Neko-Script 指令流，直接操作渲染引擎。支持多种 AI 提供商、MCP 协议扩展、以及丰富的 AI 生成能力。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **自然语言交互** | 用对话方式控制视频编辑 |
| **多提供商支持** | Claude、OpenAI、Google、Azure、Ollama |
| **MCP 集成** | Model Context Protocol 扩展工具 |
| **AI 生成** | 图像、视频、音乐、TTS、字幕生成 |
| **脚本生成** | 自动生成视频脚本 |
| **分镜生成** | AI 辅助生成分镜脚本 |

---

## AI 生成能力

| 能力 | 说明 |
|------|------|
| **图像生成** | AI 生成图像并添加到时间线 |
| **视频生成** | AI 生成视频片段 |
| **TTS** | 文字转语音，多种声音 |
| **音乐生成** | AI 生成背景音乐 |
| **角色生成** | AI 生成角色形象 |
| **风格迁移** | 视频风格迁移 |
| **视频增强** | AI 视频增强 |
| **音频优化** | AI 音频优化 |
| **字幕生成** | AI 自动生成字幕 |

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.agent.provider` | `anthropic` | AI 提供商 |
| `neko.agent.model` | `claude-sonnet-4-20250514` | 默认模型 |
| `neko.agent.apiKey.anthropic` | `""` | Anthropic API Key |
| `neko.agent.apiKey.openai` | `""` | OpenAI API Key |
| `neko.agent.mcp.servers` | `[]` | MCP 服务器配置 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `NekoAgent: Chat` | 打开 AI 对话 |
| `NekoAgent: Generate Image` | 生成图像 |
| `NekoAgent: Generate Video` | 生成视频 |
| `NekoAgent: Generate TTS` | 生成语音 |
| `NekoAgent: Generate Music` | 生成音乐 |
| `NekoAgent: Generate Subtitles` | 生成字幕 |
| `NekoAgent: Generate Script` | 生成脚本 |
| `NekoAgent: Generate Storyboard` | 生成分镜 |

---

## 工作流

```
用户意图 (自然语言)
    │
    ▼
┌─────────────────┐
│   NekoAgent     │
│   (LLM)         │
├─────────────────┤
│ • 意图理解      │
│ • 任务分解      │
│ • 工具调用      │
└─────────────────┘
    │
    ├─→ Neko-Script 指令
    │       │
    │       └─→ neko-cut / neko-canvas 执行
    │
    └─→ AI 生成任务
            │
            └─→ 媒体生成服务
```

---

## MCP 集成

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

---

## 依赖关系

```
neko-agent
    ├── @neko/agent (Agent 框架)
    ├── @neko/platform (平台服务)
    └── @neko/shared (类型)
```

---

## 技术栈

- **LLM**：Claude API / OpenAI API
- **协议**：MCP (Model Context Protocol)
- **UI**：React 18 + Zustand
- **类型**：@neko/shared

---

## License

MIT
