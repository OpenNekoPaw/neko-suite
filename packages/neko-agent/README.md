# NekoAgent

> AI 大脑：接收自然语言意图，分发创作指令

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host (Agent/Platform) + Webview (React 对话 UI) + CLI (Ink TUI)
- 规范：[CLAUDE.md](../../CLAUDE.md)
- 详细架构：[ARCHITECTURE.md](./ARCHITECTURE.md)
- Runtime ADR：[adr-agent-runtime-bootstrap.md](../../docs/architecture/adr-agent-runtime-bootstrap.md)

## Quick Reference

- **职责**：自然语言 → 多模型 LLM 推理 → 工具调用 / AI 生成 API
- **入口**：`packages/extension/src/index.ts`（Extension）、`packages/cli-tui/src/cli.tsx`（CLI）
- **子包**：`agent`（运行时）、`platform`（LLM 路由）、`extension`（VSCode 宿主）、`webview`（对话 UI）、`cli-tui`（终端 TUI）
- **依赖**：`@neko/agent`、`@neko/platform`、`@neko/shared`
- **激活依赖**：neko-engine、neko-tools、neko-preview

## Architecture

```
用户自然语言输入
  │
  ├─ VSCode ──→ Webview (React) ──postMessage──→ Extension Host
  │                                                  │
  └─ Terminal ──→ CLI (Ink TUI) ─────────────────────┤
                                                     │
                                               @neko/agent
                                          ReAct: Think → Act → Observe
                                                     │
                                    ┌────────────────┼────────────────┐
                                    │                │                │
                             @neko/platform    ToolRegistry      SkillSystem
                           (多模型 LLM 路由)   (内置/MCP/扩展)   (技能注入)
                                    │
                        ┌───────────┼───────────┐
                        │           │           │
                     Claude      OpenAI      Google/Ollama/Generic
```

### 包结构

```
packages/
├── agent/      # @neko/agent — Agent 运行时（零 VSCode 依赖，CLI/Extension 复用）
│   ├── executor/     ReAct 循环引擎（think-phase + act-phase + hook-runner）
│   ├── session/      Agent 会话生命周期 + 事件转换
│   ├── skill/        技能系统（SkillService + 3-track 原子注入 + ToolGuard + 斜杠命令）
│   ├── tools/        工具注册 + 双层注入（always/dynamic）+ 元工具
│   ├── mcp/          MCP Client（Stdio/HTTP）+ 工具桥接
│   ├── context/      分层上下文管理 + token 预算 + 对话压缩
│   ├── permission/   工具权限（plan/ask/auto 三模式）
│   ├── hooks/        可组合中间件（ExecutorHooks + factory）
│   ├── hook-loader/  用户自定义 Hook 加载器（.hook/ 目录）
│   ├── prompt/       SystemPromptComposer + Builder（多语言）
│   ├── runtime/      统一 runtime bootstrap 契约 + helper
│   ├── plan/         Plan 管理器
│   ├── input/        InputProcessor（@ 文件引用解析）
│   ├── subagent/     子 Agent 委托
│   ├── task/         后台任务管理 + 持久化
│   ├── validation/   输出验证器（Image/Output/Mermaid/JSON/Length）
│   ├── memory/       项目记忆（.neko/memory.md）+ recall / extraction
│   ├── commands/     内置斜杠命令处理（help/status/clear/config/skills/tools/plan 等）
│   └── errors/       统一错误类型
├── platform/   # @neko/platform — AI 服务平台
│   ├── llm/adapter/  7 个 LLM 适配器（Anthropic/OpenAI/Google/Azure/Ollama/Generic + AI-SDK）
│   ├── config/       ConfigManager（用户配置 + 工作区 MCP 合并）+ 首次运行默认值
│   ├── media/        媒体生成服务（8 个适配器：Runway/Luma/MiniMax/Suno/Vidu/Midjourney/LibLib/OpenAI-compat）
│   ├── provider/     ProviderRegistry（适配器路由）+ PlatformError（错误分类）
│   ├── service/      IService 门面 + ModelSelector + PromptManager + ToolRegistry
│   └── core/         BaseRegistry + HttpClient + ConcurrencyPool
├── extension/  # @neko-agent/extension — VSCode 扩展宿主（纯胶水层）
│   ├── bootstrap/    服务初始化 + ServiceCollection
│   ├── chat/         ChatViewProvider + Webview 消息 Router + 专用桥接 Handler
│   ├── chat/message/ AgentMessageTurnHandler + AgentTurnBridge + AgentStreamProcessor
│   ├── ai/           AgentRunner（薄包装）+ AgentManager（runtime 多会话池）+ HookManager
│   ├── services/     ConfigBridge + SkillFileService + HookFileService
│   ├── editor/       EditorModel + EditorRegistry
│   └── tools/        扩展工具注册（NekoCut/NekoCanvas 桥接）
├── webview/    # @neko-agent/webview — React 对话 UI
│   ├── components/   ChatView + ContentBlocks 时序渲染 + SettingsView
│   ├── handlers/     消息处理注册（streaming/tool/conversation/config）
│   ├── hooks/        Zustand 状态管理（多会话隔离）
│   ├── messages/     type-safe postMessage 构建器
│   ├── config/       预设配置
│   └── i18n/         国际化
└── cli-tui/    # @neko/cli — Ink TUI 终端界面
    ├── components/   Ink React 组件（ChatView/Input/StatusBar/ToolCall）
    ├── adapters/     LLMServiceAdapter（IService 桥接）
    ├── stores/       Zustand 终端状态（agent/conversation/config/ui）
    ├── hooks/        useAgentSession + useKeyboardShortcuts
    └── core/         createCLIPlatform + bootstrap
```

## 多模型支持

| 提供商 | 配置方式 | 特殊能力 |
|--------|---------|---------|
| Anthropic | `~/.neko/config.json` | Extended Thinking、Beta headers |
| OpenAI | `~/.neko/config.json` | DALL-E 图像生成 |
| Google | `~/.neko/config.json` | Gemini 多模态 |
| Azure | `~/.neko/config.json` | OpenAI 兼容 |
| Ollama | 本地，无需 key | 私有部署 |
| Generic | 自定义 apiUrl | OpenAI 兼容代理（newapi/one-api） |

**模型选择**：优先级 fallback（显式指定 → 配置默认 → 首个可用），无复杂路由策略。

**媒体模型默认值**：在 `~/.neko/config.json` 中通过 `defaultMediaModels` 为各媒体类型配置默认模型：

```json
{
  "defaultMediaModels": {
    "image": "flux-kontext-pro",
    "video": "sora-2",
    "audio": "tts-1",
    "music": "suno-v4"
  }
}
```

值为 `models[]` 中对应模型的 `id`。Webview 启动时自动应用为初始选择；用户在 AgentMediaBar 中手动切换后，运行时选择优先。`ModelConfig.type` 字段（`llm` / `image` / `video` / `audio` / `music`）控制模型在选择器中的分组。

## 核心概念

### 执行模式

| 模式 | 行为 | 场景 |
|------|------|------|
| `plan` | 生成计划后展示，逐步批准执行 | 高风险操作 |
| `ask` | 每个工具调用需用户确认 | 需要监督 |
| `auto` | 按规则自动执行工具 | 可信操作 |

### 技能系统

从 `.neko/skills/<name>/SKILL.md` 加载技能（YAML frontmatter + Markdown body），3-track 原子注入/移除：

| Track | 注入内容 |
|-------|---------|
| A | 系统提示词 section（SystemPromptComposer） |
| B | 权限允许规则（PermissionHooks） |
| C | 工具白名单（ToolGuard，运行时 isToolAllowed） |

技能支持可选的斜杠命令触发（frontmatter 中 `command: commit`），支持参数插值（`$ARGUMENTS`, `$1-$99`）。

### 工具系统

- **所有工具始终可见**（1M context，无需动态注入）
- **元工具**：`GetContext` / `ActivateSkill` / `DeactivateSkill` — AI 自主发现和激活技能
- **来源**：内置（Read/Write/Bash/Grep）、MCP 服务器、扩展工具（NekoCut/NekoCanvas）

### MCP 集成

支持 Stdio 和 HTTP 两种传输协议，配置在 `~/.neko/config.json` 或 `.neko/config.json`（工作区）。

## 内部 API（跨扩展命令）

`neko.agent.internalChat` — 允许其他 Neko 扩展借用已配置的 LLM，无需重复引入 `@neko/platform` 依赖。

```typescript
// 其他扩展调用示例
const result = await vscode.commands.executeCommand<string | null>(
  'neko.agent.internalChat',
  [
    { role: 'system', content: 'You are a classifier.' },
    { role: 'user', content: 'Classify: warrior.png' },
  ],
  { maxTokens: 800 },
);
// neko-agent 未激活时返回 null，调用方自行降级处理
```

**合约**：`messages` 参数为 `ChatMessage[]`，`options.maxTokens` 可选（默认 1000）。返回模型第一条文本回复，非文本内容或任何错误均返回 `null`。

## 文档格式支持

NekoAgent 支持读取多种文档格式用于 AI 内容分析和视频生成工作流：

### 支持的格式

| 类型 | 格式 | 说明 |
|------|------|------|
| **文本文档** | PDF, DOC/DOCX, MD, TXT, Fountain, HTML, JSON, YAML | 提取文本和结构信息 |
| **电子书** | EPUB | 提取章节文本；图像型 EPUB 返回页面图片路径和图片元数据 |
| **漫画档案** | CBZ, CBR | 提取图片页面及宽高/MIME/大小信息供 AI 视觉分析 |
| **网页内容** | URL (HTTP/HTTPS) | 抓取网页主要内容 |
| **演示/表格** | PPT/PPTX, XLS/XLSX | 读取文本/表格数据，提取内嵌图片 |
| **专业剧本** | Final Draft (FDX) | 影视行业标准格式 |

解析由扩展内部库完成，不要求创作者安装 Python、unzip、unrar 等外部命令行工具。图片页基础元数据通过 `ReadDocument.imageInfo` 返回，Skill 不应再调用外部命令探测尺寸。

### 法律声明

- **仅支持 DRM-free 内容**（DRM 保护的文件会被拒绝）
- 用户必须拥有文件的合法使用权
- 不支持盗版内容或未授权分发
- 本工具仅用于本地内容处理，不分发内容

详细文档：[DOCUMENT_FORMATS.md](./DOCUMENT_FORMATS.md)

## 开发

```bash
pnpm build:neko-agent       # 构建（extension + webview）
pnpm test                   # 运行测试
pnpm check                  # 代码质量检查
```

**调试**：
- Extension Host：`console.log('[Extension]', data)`
- Webview DevTools：`Cmd+Shift+P → Developer: Open Webview Developer Tools`
- CLI：直接终端输出

## 测试

- 61 test files / 1192 tests（Vitest v4）
- 测试覆盖：executor、skill system、context、permission、validation、tools
- 已知：extension 3 files / 21 tests 历史失败（非 Vitest v4 引起）
