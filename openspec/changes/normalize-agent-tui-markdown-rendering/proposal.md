# Agent TUI Markdown 渲染规范化

状态：Proposed（grilling 已完成，21 项设计决策已确认）

## Why

`neko-agent` TUI 当前在 assistant message streaming 阶段使用纯文本展示，完成后再切换到 package-local 正则 Markdown parser、Ink renderer 和逐行正则代码高亮。该双路径无法稳定表达完整 CommonMark/GFM、嵌套 inline 结构、表格对齐、Unicode display width、多行代码语法状态和流式 mutable-tail 语义，也让 TUI 与 Agent Webview 分别拥有 Markdown 解释逻辑。

本变更建立一个由 `@neko/markdown` 拥有的 host-agnostic normalized semantic contract，并将 Agent TUI 收敛为其 terminal presentation adapter。目标是在本地 VSCode/TUI 产品边界内获得可测试、可扩展、fail-visible 的 Markdown 渲染链，而不是引入跨进程渲染服务、全仓库 terminal DSL 或新的 design-system/runtime。

## What Changes

- 由 `@neko/markdown` 使用 remark/micromark GFM 生态作为内部实现，向宿主只暴露 Neko-owned、穷尽 typed 的 normalized Markdown document。
- 保留权威 Markdown source，以及所有 source-backed node 的半开 UTF-16 range `[startOffset, endOffset)`；区分 source offset、code point、grapheme 和 terminal display column。
- 将 source-occupying semantic nodes、可重叠 annotations 和 context-dependent resolution snapshots 分离；parser 不调用 workspace/entity/resource IO。
- 引入 append/finalize `MarkdownStreamingSession`、stable prefix、mutable tail、active-table holdback、session ID、document revision 和 session-local deterministic node/annotation identity。
- 将 assistant message 从首个 delta 到 finalize 收敛为同一 canonical path，移除 TUI regex parser、逐行 regex highlighter和 plain-streaming/rich-final renderer 切换。
- 在 `cli-tui` 内引入纯、Markdown-specific 的 terminal projector/layout model；Ink 仅保留薄适配层，不创建 repository-wide terminal DSL。
- 在 TUI presentation boundary 引入 canonical `TerminalTextMetrics`，统一 grapheme segmentation、display width、styled wrapping 和 display-width padding/alignment。
- 提供 aligned-grid、vertical-record 和 stacked-record 三种自适应表格模式，支持 GFM left/center/right alignment、内容画像、ragged-row 保真和确定性 fallback。
- 使用 package-local whole-block syntax highlighter port，支持多行语法、generation/cancellation、stale-result rejection、plain-code bounded presentation，且不回退 legacy regex highlighter。
- 通过已有 TUI theme runtime 扩展 semantic Markdown roles；默认继承背景，明确 `NO_COLOR`、ASCII border 和 terminal capability resolution。
- 将 link、local resource authorization 和 terminal control encoding视为显式信任边界；provider Markdown 不能直接执行 ANSI/CSI/OSC/C0/C1 控制。
- 定义 contract violation、source/content diagnostic、external enhancement failure 和 stale async 四类失败语义，并由宿主本地化最终 diagnostic 文案。
- 引入集中、package-local 的 `MarkdownResourcePolicy`，区分 source hard limit 与 table/highlight/cache 等 soft enhancement budgets。
- 建立分层验收矩阵：shared semantic contracts、pure terminal layout、async races、legacy poison tests、安全/resource boundaries、真实 PTY/Ink 和聚焦 Agent evaluation。

## Capabilities

### New Capabilities

- `normalized-markdown-document`: Neko-owned CommonMark/GFM semantic document、source provenance、extensions、annotations、resolution association、streaming stability 和 identity contract。
- `agent-tui-markdown-presentation`: normalized document 到 terminal blocks/layout/lines/Ink 的投影、Unicode metrics、theme/capability resolution、自适应 tables、whole-block highlighting、links/security 和 diagnostics。

## Affected Runtime Paths

- Agent assistant-message TUI projection：streaming 与 final message 改为同一 Markdown session/canonical renderer path。
- Agent Markdown extension projection：images、mentions、resource references、creative tables、prompt spans 和 handoff references 按 node/annotation/resolution 分层迁移。

## Breaking Changes

- **BREAKING**：受影响的内部 Markdown range 从 `{ start, end }` 改为 `{ startOffset, endOffset }`，不保留长期兼容 alias。
- **BREAKING**：TUI package-local regex parser、逐行 regex highlighter及其 assistant-message canonical entrypoints 被移除，不提供默认 legacy fallback。
- **BREAKING**：assistant finalization 必须 finalize 已存在的 streaming session，不能替换成第二套 renderer state。
- **BREAKING**：host adapters 消费 Neko normalized node/annotation/resolution contracts，而不是依赖 host-local source regex projection。

这些是 prelaunch 内部 API 和渲染路径调整。权威历史消息仍保存 Markdown source，因此无需迁移 durable rendered data；旧消息由新 canonical path 重新解析。不得静默删除或改变用户保存的 Markdown source。

## Impact

主要影响：

- `packages/neko-markdown`
- `packages/neko-agent/packages/cli-tui`
- Agent assistant-message streaming/final projection
- Markdown extension projection and resolution adapters
- TUI theme/capability roles
- Markdown parser、terminal layout、syntax highlighting 和 evaluation fixtures

Agent Webview 暂时保留为有明确退出条件的 legacy host implementation。关联变更 [`migrate-agent-webview-to-normalized-markdown`](../migrate-agent-webview-to-normalized-markdown/) 已建立并拥有 owner、spec、tasks、dependency cleanup、shared fixtures、Extension Development Host acceptance 和 legacy-parser poison removal gate；在该 gate 完成前，不得声称所有 Markdown host 已完成语义统一，也不得将该结论提升为 Accepted ADR。

## Non-Goals

- 引入 OpenTUI 或替换 Ink/TUI runtime。
- 让 `@neko/markdown` 依赖 React、Ink、DOM、VSCode、ANSI 或 terminal viewport state。
- 创建全仓库通用 terminal rendering DSL、第二套 theme runtime 或共享 syntax-runtime package。
- 控制终端实际字体 family、size、line-height 或用户终端配色。
- 在首版暴露 table/highlight/resource thresholds 为用户配置。
- 自动打开链接或允许 model-generated arbitrary `file://` target。
- 解释或执行 raw HTML、provider-authored terminal control sequence。
- 在本次 TUI implementation slice 内同步重写完整 Agent Webview renderer。
- 为未发布内部 renderer 保留长期 dual-path、compatibility shim 或 fallback-on-failure。

## Validation Direction

实现必须至少提供：

- CommonMark/GFM、source ranges、extensions、annotations、streaming identity/stability contract tests。
- Unicode/grapheme/display-width、styled wrapping、table modes/alignment、code fragments 和 theme capability 的 pure layout tests。
- stale highlight/resolution/layout generation tests。
- assistant-message canonical-path integration tests，并 poison legacy parser/renderer/highlighter。
- terminal-control injection、safe links、raw HTML 和 fatal-boundary tests。
- 每个 resource policy 的 `limit - 1`、`limit`、`limit + 1` tests。
- 真实 PTY/Ink resize、`NO_COLOR`、streaming/final continuity acceptance。
- 按 `.codex/skills/neko-agent-evaluation/SKILL.md` 执行聚焦的脚本驱动 Agent evaluation；`pnpm test:agent:eval` 只能作为 harness 自测证据。
