# neko-agent 架构

> AI Agent 系统，提供对话、MCP 工具、技能系统、多模型 LLM 等能力。

---

## 系统定位

neko-agent 是 Neko Suite 的 AI 能力中枢。它将 LLM 对话、工具执行、技能系统、MCP 协议整合为统一的 Agent 运行时，支持 VSCode 扩展和 CLI 两种接入方式。

---

## 子包结构

```
packages/neko-agent/
├── packages/
│   ├── agent/        # @neko/agent — Agent 运行时（核心，零 VSCode 依赖）
│   ├── platform/     # @neko/platform — AI 服务平台（LLM 适配 + 媒体生成）
│   ├── extension/    # @neko-agent/extension — VSCode Extension Host（纯胶水层）
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

> **说明**：`agent` 通过 `@neko/shared` 的 `IService` 接口抽象 LLM 调用，`platform` 提供具体实现。
> `cli-tui` 直接复用 `@neko/platform`，通过 `createCLIPlatform()` 创建实例，`toSharedService()` 适配为 `IService`。
> 两种接入方式（Extension / CLI）共享同一套 LLM 和 Provider 管理。

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
│  │    ├─ MessageHandler (消息编排)           │           │
│  │    ├─ ConversationHandler (会话持久化)    │           │
│  │    ├─ SystemPromptManager (代理 Builder)  │           │
│  │    ├─ AgentRunner (薄包装 AgentSession)   │           │
│  │    ├─ AgentManager (LRU 多会话池)         │           │
│  │    ├─ ConfigBridge (配置消息路由)          │           │
│  │    ├─ AgentStreamProcessor (事件→UI)      │           │
│  │    └─ 10 个专用 Handler (task/skill/plan...)│         │
│  └──────────┬───────────────────────────────┘           │
│             │                                            │
│  ┌──────────▼──────────┐     ┌────────────────────────┐ │
│  │    @neko/agent       │────→│    @neko/platform      │ │
│  │                     │     │                        │ │
│  │  AgentSession        │     │  LLM Adapters          │ │
│  │  ├─ AgentExecutor    │     │  ├─ Anthropic          │ │
│  │  │  (ReAct 循环)     │     │  ├─ OpenAI             │ │
│  │  ├─ ToolRegistry     │     │  ├─ Google/Azure       │ │
│  │  ├─ SkillService     │     │  ├─ Ollama/Generic     │ │
│  │  ├─ MCPManager       │     │  │                     │ │
│  │  ├─ ContextManager   │     │  MediaService           │ │
│  │  ├─ PermissionSystem │     │  ├─ Runway/Luma        │ │
│  │  ├─ HookComposer     │     │  ├─ MiniMax/Suno      │ │
│  │  └─ SkillInjection   │     │  └─ Vidu/Midjourney   │ │
│  │    Coordinator       │     │                        │ │
│  └─────────────────────┘     │  ConfigManager          │ │
│         ▲ postMessage         │  ├─ User Config         │ │
│  ┌──────┴──────────────────┐ │  └─ Workspace MCP       │ │
│  │  Webview (React)        │ │                          │ │
│  │  @neko-agent/webview    │ │  ModelSelector            │ │
│  │                         │ │  (优先级 fallback)        │ │
│  │  ChatView + ContentBlock│ └────────────────────────┘ │
│  │  Zustand State          │                             │
│  │  Handler Registry       │                             │
│  └─────────────────────────┘                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  CLI 终端（独立进程）                      │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │     @neko/cli (cli-tui)  — Ink React     │           │
│  │                                          │           │
│  │  App                                     │           │
│  │    ├─ ChatView + Input + StatusBar       │           │
│  │    ├─ Zustand Stores                     │           │
│  │    │  (agent/conversation/config/ui)     │           │
│  │    └─ useAgentSession Hook               │           │
│  │                                          │           │
│  │  createCLIPlatform()                     │           │
│  │    ├─ createPlatform(...)                │           │
│  │    ├─ collectEnvApiKeys()                │           │
│  │    └─ toSharedService() → IService       │           │
│  └──────────┬───────────────────────────────┘           │
│             │                                            │
│  ┌──────────▼──────────┐     ┌────────────────────────┐ │
│  │    @neko/agent       │────→│    @neko/platform      │ │
│  │  AgentSession        │     │  (与 Extension 共享)    │ │
│  └─────────────────────┘     └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 核心模块

### @neko/agent — Agent 运行时

Agent 的核心执行引擎，零 VSCode 依赖，CLI/Extension 复用。109 个源文件。

| 模块 | 职责 |
|------|------|
| `executor/` | AgentExecutor — ReAct 循环（think-phase → act-phase → hook-runner） |
| `session/` | AgentSession 生命周期 + stepToEvents/recordStepInHistory 纯函数 + Initializer |
| `tools/` | ToolRegistry + 内置工具（Read/Write/Bash/Grep）+ ToolSet 双层注入（always/dynamic）+ 元工具 |
| `skill/` | SkillService + SkillRegistry + Loader + Matcher + 4-track 原子注入（Coordinator + Injector + ToolGuard） |
| `mcp/` | MCP Client（Stdio/HTTP）+ 工具桥接 + 测试服务 |
| `context/` | ContextManager + TokenBudgetManager + ConversationCompressor |
| `permission/` | IPermissionManager 接口 + 规则匹配（plan/ask/auto 三模式） |
| `hooks/` | ExecutorHooks + composeHooks + factory |
| `hook-loader/` | HookLoader — 用户自定义 Hook 加载（.hook/ 目录，IHookFileSystem/IHookCompiler 接口） |
| `prompt/` | SystemPromptComposer（分层合成）+ SystemPromptBuilder（多语言 + AGENTS.md） |
| `plan/` | Plan 管理器 + Markdown 解析 |
| `input/` | InputProcessor — @ 文件引用解析（IFileReader 接口） |
| `subagent/` | 子 Agent 管理 |
| `task/` | 后台任务管理器 + 持久化 + 恢复 |
| `validation/` | 输出验证器（Image/Output/Mermaid/JSON/Length） |
| `memory/` | InMemorySessionMemory |
| `commands/` | 内置斜杠命令处理 |
| `errors/` | 统一错误类型 |

### @neko/platform — AI 服务平台

LLM 适配和媒体生成服务。62 个源文件。

```
配置策略：
├─ Providers/Models: 用户配置（~/.neko/config.json），首次运行生成默认值
├─ MCP Servers: 用户配置 + 工作区配置（workspace 按 id 覆盖 user）
└─ 标量设置: 用户配置 + @neko/shared DEFAULT_CONFIG fallback

模型选择: 优先级 fallback（显式指定 → 配置默认 → 首个可用）
```

| 模块 | 职责 |
|------|------|
| `llm/adapter/` | 7 个 LLM 适配器（Anthropic/OpenAI/Google/Azure/Ollama/Generic + AI-SDK 统一）+ AdapterRegistry + StreamAggregator |
| `provider/` | ProviderRegistry（适配器查找）+ PlatformError（统一错误分类） |
| `config/` | ConfigManager（用户配置 + 工作区 MCP 合并）+ ChatModelService + 导入导出 + 首次运行默认值 |
| `media/` | MediaService + 8 个适配器（Runway/Luma/MiniMax/Suno/Vidu/Midjourney/LibLib/OpenAI-compat）+ 路由 + 任务执行 |
| `service/` | IService 门面 + ModelSelector（优先级 fallback）+ PromptManager + ToolRegistry |
| `core/` | BaseRegistry + HttpClient + ConcurrencyPool（re-export from @neko/shared） |
| `types/` | Provider/Model/Config 类型定义 |

### @neko-agent/extension — VSCode 扩展

纯 VSCode 集成层（胶水代码），不含 AI 业务逻辑。52 个源文件。

所有 AI 功能委托给 `@neko/agent` 和 `@neko/platform`。Extension 只负责：
- VSCode EventEmitter 桥接
- postMessage 消息路由
- 文件系统操作（IFileReader/IHookFileSystem 的 VSCode 实现）
- Webview 生命周期管理

| 模块 | 职责 |
|------|------|
| `bootstrap/` | 服务初始化 + ServiceCollection 组装 |
| `chat/` | ChatViewProvider + MessageHandler + 10 个专用 Handler（task/skill/plan/provider/settings/context/conversation/file/integration/slashCommand） |
| `chat/message/` | AgentStreamProcessor（AgentEvent → postMessage）+ AttachmentProcessor |
| `ai/` | AgentRunner（薄包装 AgentSession）+ AgentManager（LRU 多会话池，max=10）+ HookManager（esbuild 编译）+ AgentContext |
| `services/` | ConfigBridge（配置消息路由）+ SkillFileService/PromptFileService/HookFileService（文件监听）+ ConnectionStateManager |
| `editor/` | EditorModel + EditorRegistry（活动编辑器抽象） |
| `tools/` | 扩展工具注册（NekoCut/NekoCanvas API 桥接） |

### @neko-agent/webview — 对话 UI

React 对话界面，通过 postMessage 与 Extension Host 通信。117 个源文件。

| 模块 | 职责 |
|------|------|
| `components/` | ChatView + ContentBlocks 时序渲染 + SettingsView + ToolCallDisplay + MermaidBlock |
| `handlers/` | 消息处理注册表（streaming/tool/conversation/config/task） |
| `hooks/` | Zustand 状态管理（多会话隔离：conversation/config/ui/resource） |
| `messages/` | type-safe postMessage 构建器 |
| `config/` | 预设配置（providers/prompts/MCP servers） |
| `i18n/` | 国际化 |

### @neko/cli — 命令行界面

独立可执行 CLI，直接复用 `@neko/agent` + `@neko/platform`。52 个源文件。

CLI 特有的 bootstrap 层（`createCLIPlatform()`）负责：
- 从环境变量注入 API Key（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
- 基于文件的用户配置（`~/.neko/config.json`，与 Extension 共享）
- `toSharedService()` 适配 platform Service → `@neko/shared.IService`

| 模块 | 职责 |
|------|------|
| `components/` | Ink React 组件（ChatView/Input/StatusBar/ToolCallDisplay） |
| `adapters/` | LLMServiceAdapter（IService 桥接） |
| `stores/` | Zustand 状态（agent/conversation/config/ui） |
| `hooks/` | useAgentSession + useKeyboardShortcuts |
| `core/` | createCLIPlatform + bootstrap |

---

## 通信模式

### Extension ↔ Webview（postMessage）

```
Webview → Extension:
  sendMessage, confirmTool, stopAgent,
  newConversation, switchConversation, deleteConversation,
  getSettings, updateSettings, invokeSlashCommand,
  executeSkill, cancelSkill, planApprove/Reject,
  searchProjectFiles, getTasks, cancelTask

Extension → Webview:
  thinking, streamText, streamThinking,
  toolCall, toolResult, toolConfirmation,
  streamComplete, agentPhase, error,
  taskCreated, taskUpdated, contextTokenCount,
  conversations, activeConversation, settings, tabState
```

### Agent 执行流

```
用户输入
  │
  ▼
MessageHandler（Extension — 消息编排）
  ├─ InputProcessor 解析 @ 文件引用
  ├─ AttachmentProcessor 处理附件
  │
  ▼
AgentRunner → AgentSession → AgentExecutor（ReAct 循环）
  │
  ├─ LLM 调用 → IService → @neko/platform → Claude/OpenAI/Google API（流式）
  │
  ├─ 工具调用 → ToolRegistry → 内置/MCP/扩展工具
  │     ├─ 权限检查 → PermissionSystem（plan/ask/auto）
  │     ├─ ToolGuard → 技能白名单
  │     └─ Hook 链 → ExecutorHooks
  │
  ├─ 技能 → SkillService → 发现 + 4-track 原子注入
  │
  └─ 上下文 → ContextManager + TokenBudgetManager → 压缩/摘要
         │
         ▼
AgentStreamProcessor（Extension — 事件翻译）
  └─ AgentEvent → webview.postMessage
```

---

## 关键设计模式

| 模式 | 应用 |
|------|------|
| **Factory** | `createPlatform()`、`createAgentSession()`、`createCLIPlatform()` |
| **Registry** | ToolRegistry、SkillRegistry、ProviderRegistry、AdapterRegistry、MediaAdapterRegistry |
| **Adapter** | 7 个 LLMAdapter + 8 个 MediaAdapter — 统一接口适配异构 API |
| **Facade** | Service（platform 门面）、ChatViewProvider（extension 门面） |
| **Observer** | vscode.EventEmitter（AgentRunner）、onProgress（MediaService） |
| **Strategy** | ExecutionMode（plan/ask/auto）、ToolInjectionLayer（always/dynamic） |
| **Composite** | composeHooks — 多个 ExecutorHooks 组合 |
| **Coordinator** | SkillInjectionCoordinator — 4-track 原子注入/回滚 |
| **LRU Cache** | AgentManager — 多会话池化（max=10，驱逐非运行中最久未用） |
| **依赖注入** | 构造函数注入 — AgentSession/Service/ConfigManager 均通过接口解耦 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| Extension Host | VSCode Extension API + TypeScript + esbuild |
| Webview | React 18 + Zustand + Tailwind + Vite |
| AI SDK | Vercel AI SDK (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google) |
| MCP | MCP Protocol（Stdio/HTTP 传输） |
| CLI | Ink 5 + React 18 + Zustand + commander + chalk |
| 测试 | Vitest v4 |
