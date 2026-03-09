# TUI vs Webview Capability Analysis

> Comparison of @neko/cli (TUI) and @neko-agent/webview feature sets

## Architecture

| Dimension | TUI (Ink + Terminal) | Webview (React + VSCode) |
|-----------|---------------------|--------------------------|
| Renderer | Ink 5 (React → Terminal) | React 18 + Tailwind (DOM) |
| State | Zustand 5 (4 stores) | Custom hooks + Refs + Maps |
| Communication | Direct AgentSession call | postMessage ↔ Extension Host |
| Styling | Chalk colors + Unicode chars | CSS + VSCode theme variables |
| Data Flow | AgentEvent → EventAdapter → Stores | Extension messages → MessageHandlerRegistry → State |

## Feature Matrix

| Feature | TUI | Webview | Notes |
|---------|:---:|:-------:|-------|
| **Streaming text** | ✅ | ✅ | TUI: StreamingText + cursor |
| **Extended thinking** | ✅ | ✅ | TUI: preview first 3 lines; Webview: collapsible |
| **Tool call status** | ✅ | ✅ | TUI: icon+name only; Webview: expandable details |
| **Tool confirmation** | ✅ | ✅ | TUI: keyboard y/n; Webview: buttons |
| **Diff preview** | ✅ | ✅ | TUI: unified diff; Webview: accept/reject buttons |
| **Command preview** | ✅ | ✅ | — |
| **Markdown rendering** | ✅ | ✅ | TUI: simplified (no tables); Webview: full GFM |
| **Syntax highlighting** | ✅ basic | ✅ full | TUI: 4 languages keyword-based; Webview: Prism |
| **Mermaid diagrams** | ❌ | ✅ | Terminal cannot render SVG |
| **Media preview** | ❌ | ✅ | Image/video/audio preview |
| **Todo list** | ✅ | ❌ | TUI has TodoList component |
| **Slash commands** | ✅ | ✅ | TUI: 6 built-in; Webview: includes skill commands |
| **Multi-line input** | ✅ | ✅ | TUI: Shift+Enter; Webview: textarea |
| **Command history** | ✅ | ❌ | TUI: Up/Down arrow navigation |
| **Token usage bar** | ✅ | ✅ | TUI: progress bar; Webview: count + compress button |
| **Multi-session/tabs** | ❌ | ✅ | Webview: multi-tab management |
| **Session persistence** | ❌ | ✅ | Webview: via Extension Host |
| **Context compression** | ❌ | ✅ | Webview: trigger compressContext |
| **File attachments** | ❌ | ✅ | Webview: drag-drop + @-reference + caching |
| **File reference (@)** | ✅ basic | ✅ full | TUI: InputProcessor only; Webview: search menu |
| **Model selection** | ❌ | ✅ | Webview: dropdown picker |
| **Execution mode switch** | ✅ | ✅ | TUI: /plan /ask /auto; Webview: UI buttons |
| **Plan review** | ❌ | ✅ | Webview: per-step approve/reject/modify |
| **Skill system** | ❌ | ✅ | Webview: skill confirmation + active indicator |
| **Background tasks** | ❌ | ✅ | Webview: TaskCard + progress |
| **Message queue** | ❌ | ✅ | Webview: queue + dedup while thinking |
| **SSO/auth** | ❌ | ✅ | Webview: onboarding + session |
| **i18n** | ❌ | ✅ | Webview: en + zh-cn |
| **Keyboard shortcuts** | ✅ | ✅ | TUI: Esc/Ctrl+L/Ctrl+C; Webview: Cmd+K etc. |
| **Error boundary** | ✅ | ✅ | — |
| **NO_COLOR support** | ✅ | N/A | Terminal-specific |
| **Terminal resize** | ✅ | N/A | resize event tracking |
| **Non-interactive run** | ✅ | ❌ | `nekoagent run <prompt>` single-shot |
| **Config management CLI** | ✅ | ❌ | `nekoagent config show/providers/models` |

## Gap Analysis

### Webview has, TUI lacks (high-value)

1. **Multi-session management** — Webview supports multi-tab, conversation switching, persistence; TUI is single-session only
2. **Plan review flow** — Webview supports per-step approve/reject/modify; TUI has no plan review UI
3. **Skill system** — Webview has skill confirmation and active indicator; TUI not integrated
4. **File attachments** — Webview supports drag-drop, attachment caching, @-search menu; TUI has basic @file only
5. **Context compression** — Webview displays token count and triggers compression; TUI lacks this capability
6. **Media preview** — Terminal inherent limitation, cannot display images/video
7. **Mermaid diagrams** — Terminal cannot render SVG diagrams
8. **Message queue dedup** — Webview queues messages while agent thinks; TUI has no such mechanism
9. **i18n** — Webview has integrated i18n; TUI is hardcoded English
10. **Runtime model switching** — Webview has dropdown selector; TUI requires CLI args or slash commands

### TUI has, Webview lacks

1. **Non-interactive `run` mode** — Scripted single-shot execution for CI/automation
2. **Config management CLI** — `config show/providers/models` command-line management
3. **Command history** — Up/Down arrow history navigation
4. **Todo list rendering** — Real-time task tracking (Webview has no standalone TodoList)

## Conclusion

**TUI is a functional subset of Webview**, covering core conversation capabilities (streaming, thinking, tool calls, approval, markdown), but lacking Webview's advanced interaction features (multi-session, plan review, skills, attachments, media preview, i18n). TUI's unique strengths are **non-interactive mode** and **CLI config management** — essential for server/SSH scenarios.

### Priority backfill recommendations (for TUI)

1. **Plan review** — Server scenarios still need plan approval
2. **Context compression** — Long session management
3. **i18n** — Align with Webview's i18n infrastructure
