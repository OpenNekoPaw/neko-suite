# neko-agent 架构

> AI Agent 系统，提供对话、MCP 工具、技能系统、多模型路由等能力。

---

## 系统定位

neko-agent 是 Neko Suite 的 AI 能力中枢。它将 LLM 对话、工具执行、技能系统、MCP 协议整合为统一的 Agent 运行时，支持 VSCode 扩展和 CLI 两种接入方式。

---

## 子包结构

```
packages/neko-agent/
├── packages/
│   ├── agent/        # @neko/agent — Agent 运行时（核心）
│   ├── platform/     # @neko/platform — AI 服务平台（多模型路由）
│   ├── extension/    # @neko-agent/extension — VSCode Extension Host
│   ├── webview/      # @neko-agent/webview — React 对话 UI
│   └── cli-tui/      # @neko/cli — Ink TUI 终端界面
```

**依赖方向**（严格单向）：

```
webview ──(postMessage)──→ extension ──→ agent ──→ platform ──→ shared
                               │                      │
                               └──→ shared             └──→ ai-sdk

cli-tui ──→ agent ──→ platform ──→ shared
  │                      │
  └──→ shared            └──→ ai-sdk
```

> **说明**：`agent` 通过 `IService` 接口抽象 LLM 调用，`platform` 提供 `IService` 的具体实现（多模型路由）。
> `cli-tui` 同样通过 `LLMServiceAdapter` 实现 `IService`，桥接内置 `LLMClient` 到 `agent` 层。

---

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                   VSCode Extension Host                  │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │     @neko-agent/extension                │           │
│  │                                          │           │
│  │  Bootstrap → ChatViewProvider            │           │
│  │         │         │                      │           │
│  │  ServiceCollection                       │           │
│  │    ├─ ChatMessageHandler                 │           │
│  │    ├─ ConversationManager                │           │
│  │    ├─ SystemPromptManager                │           │
│  │    ├─ AgentRunner / AgentManager         │           │
│  │    └─ ConfigBridge                       │           │
│  └──────────┬───────────────────────────────┘           │
│             │                                            │
│  ┌──────────▼──────────┐     ┌────────────────────────┐ │
│  │    @neko/agent       │────→│    @neko/platform      │ │
│  │                     │     │                        │ │
│  │  AgentExecutor      │     │  LLMRoutingMgr         │ │
│  │  ├─ ToolRegistry    │     │  ├─ Adapters (Claude,  │ │
│  │  ├─ SkillRegistry   │     │  │   OpenAI, Google,   │ │
│  │  ├─ MCPClient       │     │  │   Ollama)           │ │
│  │  ├─ ConvCompressor  │     │  ├─ MediaService       │ │
│  │  ├─ PermissionSystem│     │  └─ ToolRegistry       │ │
│  │  └─ HookComposer    │     └────────────────────────┘ │
│  └─────────────────────┘                                 │
│         ▲ postMessage                                    │
│  ┌──────┴──────────────────────────────┐                │
│  │     Webview (React)                  │                │
│  │     @neko-agent/webview             │                │
│  │                                     │                │
│  │  ChatView → MessageItem             │                │
│  │  ToolCallDisplay / SettingsView     │                │
│  │  Zustand State (conversation/config)│                │
│  └─────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  CLI 终端（独立进程）                      │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │     @neko/cli (cli-tui)  — UI 展示层     │           │
│  │                                          │           │
│  │  App (Ink React)                         │           │
│  │    ├─ ChatView + Input + StatusBar       │           │
│  │    ├─ Zustand Stores                     │           │
│  │    │  (agent/conversation/config/ui)     │           │
│  │    └─ useAgentSession Hook               │           │
│  │         │                                │           │
│  │  LLMClient → LLMServiceAdapter(IService) │           │
│  └──────────┬───────────────────────────────┘           │
│             │                                            │
│  ┌──────────▼──────────┐                                │
│  │    @neko/agent       │                                │
│  │  AgentSession        │                                │
│  │  ├─ ToolRegistry     │                                │
│  │  ├─ MCPManager       │                                │
│  │  ├─ SkillService     │                                │
│  │  └─ SystemPromptBuilder                              │
│  └─────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

---

## 核心模块

### @neko/agent — Agent 运行时

Agent 的核心执行引擎，无 VSCode 依赖，可复用于 CLI 场景。

| 模块 | 职责 |
|------|------|
| `executor/` | AgentExecutor — ReAct 循环（Reasoning → Action → Observation） |
| `tools/` | ToolRegistry + 内置工具（Read/Write/Bash/Grep）+ 注入管理 |
| `skill/` | SkillRegistry + Loader + Matcher + Injector — 兼容 Claude Code 的技能系统 |
| `mcp/` | MCP Client（Stdio/HTTP）+ 工具创建 + 测试服务 |
| `hooks/` | Hook 组合器（Retry、Memory 等可组合的中间件） |
| `memory/` | InMemorySessionMemory — 会话记忆存储 |
| `context/` | ConversationCompressor（对话压缩）、LayeredContextManager（分层上下文）、持久化 |
| `permission/` | 工具权限系统 — 规则匹配 + 权限 Hook |
| `validation/` | 输出验证器（Image/Output/Mermaid/JSON/Length） |
| `subagent/` | 子 Agent 管理 |
| `prompt/` | Prompt 管理器 + 链式执行 |
| `session/` | Agent 会话生命周期 |
| `task/` | 任务管理器 + 持久化 + 恢复 |
| `commands/` | 内置斜杠命令处理 |

### @neko/platform — AI 服务平台

多模型路由和 AI 服务抽象层。

```
三级配置：Builtin Presets → User Config → Workspace Config

路由策略：
├─ Priority（优先级）
├─ Round-Robin（轮询）
├─ Weighted（加权）
├─ Cost/Latency-Optimal（成本/延迟最优）
└─ Capability-Match（能力匹配）
```

| 模块 | 职责 |
|------|------|
| `core/` | Registry、Strategy、Router、HealthMonitor、CircuitBreaker、RateLimiter |
| `llm/` | LLM 路由管理 + Adapter 注册（Claude/OpenAI/Google/Ollama） |
| `provider/` | Provider 注册、分组、重试执行器 |
| `config/` | 三级配置管理器 |
| `tools/` | AI 工具（图像/视频/音频生成、分析、文档） |
| `media/` | 媒体生成服务 + 路由 + 任务执行 |
| `service/` | 服务层 — 工具注册、Prompt 管理 |

### @neko-agent/extension — VSCode 扩展

桥接 UI 和 Agent 后端。

| 模块 | 职责 |
|------|------|
| `bootstrap/` | 服务初始化、核心服务组装 |
| `chat/` | ChatViewProvider + 消息处理 + 会话管理 + 设置管理 |
| `chat/handlers/` | 专用处理器（模型预设、集成、计划模式、任务、文件操作、技能） |
| `ai/` | AgentRunner + AgentManager + Context + Hooks |
| `services/` | ConfigBridge、文件服务（hooks/prompts/skills）、连接状态 |
| `tools/` | 扩展级工具注册（NekoCut、NekoCanvas 工具） |

### @neko-agent/webview — 对话 UI

React 对话界面，通过 postMessage 与 Extension Host 通信。

| 模块 | 职责 |
|------|------|
| `components/` | ChatView、MessageItem、ToolCallDisplay、MermaidBlock、SettingsView |
| `handlers/` | 消息处理注册（streaming、tool、conversation） |
| `hooks/` | 全局状态（conversation/config/ui/resource） |
| `config/` | 预设配置（providers、prompts、MCP servers） |

### @neko/cli — 命令行界面

独立可执行 CLI，复用 @neko/agent 核心。

```
nekoagent run "prompt"       # 单次执行
nekoagent interactive        # 交互模式
nekoagent config show/set    # 配置管理
```

---

## 通信模式

### Extension ↔ Webview（postMessage）

```
Webview → Extension:
  sendMessage, newConversation, switchConversation,
  updateProvider, getSettings, cancelTask

Extension → Webview:
  thinking, streamText, streamThinking, toolCall,
  toolResult, streamComplete, taskUpdated
```

### Agent 执行流

```
用户输入
  │
  ▼
ChatMessageHandler（Extension）
  │
  ▼
AgentRunner → AgentExecutor（ReAct 循环）
  │
  ├─ LLM 调用 → @neko/platform → Claude/OpenAI/Google API（流式）
  │
  ├─ 工具调用 → ToolRegistry → 内置/MCP/扩展工具
  │     ├─ 权限检查 → PermissionSystem
  │     └─ Hook 链 → Retry/Memory/Validation
  │
  ├─ 技能匹配 → SkillRegistry → 发现 + 注入
  │
  └─ 上下文管理 → ConversationCompressor → 压缩/摘要
```

---

## 关键设计模式

| 模式 | 应用 |
|------|------|
| **Factory** | `createPlatform()`、`createAgent()` — 统一实例化 |
| **Registry** | ToolRegistry、SkillRegistry、ProviderRegistry、AdapterRegistry |
| **Strategy** | SelectionStrategy、RoutingStrategy、LLMRoutingStrategy |
| **Adapter** | LLMAdapter（Claude/OpenAI/Google/Ollama）— Provider 抽象 |
| **Chain/Composite** | ChainPromptExecutor、composeHooks — 多步执行 |
| **Facade** | Service（platform）、ChatViewProvider（extension） |
| **Observer** | EventEmitter — hooks 和 handlers 中的响应式通知 |
| **依赖注入** | 构造函数注入 — 解耦依赖 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| Extension Host | VSCode Extension API + TypeScript + esbuild |
| Webview | React 18 + Zustand + Tailwind + Vite |
| AI SDK | Vercel AI SDK (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google) |
| MCP | MCP Protocol（Stdio/HTTP 传输） |
| CLI | commander + chalk + ora + inquirer |
| 测试 | Vitest |
