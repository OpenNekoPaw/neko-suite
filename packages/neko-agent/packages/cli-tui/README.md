# @neko/cli

> Unified CLI for Neko AI Agent — Ink TUI + core CLI capabilities (config, runner, LLM client)

## Context Summary

- Project: Neko Suite — VSCode creative work suite
- Architecture: Ink 5 + Zustand 5 + React 18 component-based TUI
- Merged from: former `@neko/cli` (core) + `@neko/cli-tui` (TUI) into single package
- Spec: [CLAUDE.md](../../../../CLAUDE.md)

## Quick Reference

- **Purpose**: Full CLI for AI agent — interactive TUI mode, single-shot `run` mode, config management
- **Entry**: `src/cli.tsx` (Commander + Ink render)
- **Dependencies**: `@neko/agent` (session), `@neko/shared` (types/utils)
- **Build**: `pnpm build` → `dist/cli.js` (ESM, tsup)
- **Binary**: `nekoagent` — `nekoagent interactive` | `nekoagent run <prompt>` | `nekoagent config show`

## Commands

| Command | Description |
|---------|-------------|
| `nekoagent interactive` (default) | Full interactive TUI mode |
| `nekoagent run <prompt>` | Single-shot execution with `-s` streaming, `-f` format |
| `nekoagent config show` | Display current configuration |
| `nekoagent config providers` | List available AI providers |
| `nekoagent config models` | List models for current provider |

## Architecture

### Component Tree (Interactive Mode)

```
<App>                              — Root layout + ErrorBoundary
├── <ChatView>                     — Scrollable message list
│   ├── <MessageItem>              — Full rendering pipeline
│   │   ├── <ThinkingBlock>        — Collapsible extended thinking
│   │   ├── <StreamingText>        — text_delta accumulation + cursor
│   │   ├── <MarkdownRenderer>     — Markdown → Ink components
│   │   │   └── <CodeBlock>        — Syntax highlighted code
│   │   ├── <TodoList>             — Real-time task list
│   │   └── ToolCallLine           — Tool call status icons
│   └── <ToolApprovalPanel>        — Context-aware approval (y/n/a)
│       ├── <DiffPreview>          — Unified diff for file tools
│       └── <CommandPreview>       — Shell command preview
├── <InputEditor>                  — Multi-line input + history
│   └── <SlashCommandMenu>         — Fuzzy-match command dropdown
└── <StatusBar>                    — Model, mode, tokens, time
    └── <TokenUsage>               — Progress bar with color thresholds
```

### Data Flow

```
User Input → InputEditor → useAgentSession.submit()
  → AgentSession.execute() → AsyncIterable<AgentEvent>
  → EventAdapter → Zustand stores (4 slices)
  → React subscription → Ink re-render → Terminal
```

### State Management (Zustand 5)

| Store | Responsibility |
|-------|---------------|
| `conversation-store` | Messages, streaming delta, thinking, tool calls, todos |
| `agent-store` | Status, execution mode, iteration, token usage |
| `config-store` | CLIConfig bridge |
| `ui-store` | Pending approval, scroll, focus, terminal size |

## Directory Structure

```
src/
├── cli.tsx                       # Entry (Commander + Ink render)
├── index.ts                      # Public API barrel
├── core/                         # Core CLI modules (merged from old @neko/cli)
│   ├── types.ts                  # CLIConfig, RunOptions, PROVIDERS
│   ├── config.ts                 # loadConfig, validateConfig, save*
│   ├── llm-client.ts             # BuiltinLLMClient (Anthropic/OpenAI/DeepSeek)
│   ├── llm-service-adapter.ts    # ILLMClient → IService adapter
│   ├── slash-commands.ts         # Slash command handling
│   ├── runner.ts                 # runAgent (single-shot execution)
│   ├── formatter.ts              # Output formatting (text/json/markdown)
│   └── theme.ts                  # Chalk wrappers for non-interactive output
├── types/                        # State + theme types
├── stores/                       # 4 Zustand stores
├── hooks/                        # React hooks (session, timer, keyboard, etc.)
├── adapters/                     # AgentEvent → store bridge
├── components/                   # Ink components
│   ├── ChatView/                 # Message rendering pipeline
│   ├── ToolApproval/             # Tool approval panel
│   ├── Markdown/                 # Markdown + code highlighting
│   ├── Input/                    # Multi-line editor + slash menu
│   ├── StatusBar/                # Bottom status bar
│   └── shared/                   # Spinner, Badge, Divider, ErrorBoundary
├── theme/                        # Semantic color tokens (TUI mode)
└── utils/                        # Markdown parser, syntax highlight, terminal detection
```

## Key Features

- **Interactive TUI**: Streaming output, markdown rendering, syntax highlighting, tool approval
- **Single-shot run**: `nekoagent run "prompt"` with streaming, format options, timeout
- **Config management**: Multi-layer config (global/user/workspace), provider management
- **Slash commands**: `/help`, `/model`, `/clear`, `/plan`, `/auto`, `/ask`, `/exit`
- **Error boundaries**: Graceful degradation with fallback UI
- **NO_COLOR / TERM**: Environment variable support for accessibility
- **Responsive layout**: Terminal resize tracking
