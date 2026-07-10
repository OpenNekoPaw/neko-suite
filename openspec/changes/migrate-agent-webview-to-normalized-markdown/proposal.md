## Why

Agent Webview still reparses assistant and thinking Markdown through `react-markdown + remark-gfm` while the TUI now consumes the Neko-owned normalized Markdown document/session contract. This leaves two semantic authorities for tables, ranges, links, streaming finalization, extensions and diagnostics, so cross-host output can diverge and legacy parser fallback can silently survive.

## What Changes

- Make every Agent Webview assistant, timeline and thinking Markdown entry point consume `@neko/markdown` normalized documents and message-scoped streaming sessions.
- Add a Webview-local React presentation adapter for exhaustive normalized nodes, annotations, revision-associated resolution snapshots and host-localized diagnostics.
- Preserve Webview-only presentation capabilities—VS Code theme styling, Mermaid, structured/composite content, creative table review, resource previews/chips and Canvas handoff—behind typed adapter/renderer contracts rather than parser AST callbacks.
- Establish a shared semantic fixture corpus used by `@neko/markdown`, TUI and Webview adapter tests without forcing host-specific rendering into a shared UI layer.
- **BREAKING**: remove direct production imports and package dependencies for `react-markdown`, `remark-gfm` and any equivalent Webview Markdown parser fallback after exhaustive adapter coverage.
- **BREAKING**: poison the legacy Webview parser path and fail visibly on unknown normalized node/annotation/version contracts instead of falling back to raw or legacy success.
- Require runtime acceptance in VS Code Extension Development Host with `vscode-extension-debugger`; browser-only/JSDOM evidence is not sufficient.

Non-goals:

- Do not unify TUI and Webview visual components, CSS, theme tokens or layout engines.
- Do not move React, VS Code, DOM, resource authorization or Canvas mutation logic into `@neko/markdown`.
- Do not redesign Markdown syntax or Canvas authoring capabilities.

## Capabilities

### New Capabilities

- `agent-webview-normalized-markdown-presentation`: Webview consumption of normalized Markdown sessions/documents, exhaustive React adapter behavior, streaming identity, resource/extension presentation, legacy parser removal and Extension Development Host acceptance.

### Modified Capabilities

None. This change depends on the normalized document contract introduced by `normalize-agent-tui-markdown-rendering` and does not redefine that contract.

## Impact

- Primary owner: `packages/neko-agent/packages/webview`.
- Shared contract dependency: `packages/neko-markdown`.
- Affected entry points: `MessageItem`, `ContentBlockItem`, `ThinkingBlock`, `MessageContent/MarkdownRenderer` and their tests/presenters.
- Dependency cleanup: `react-markdown`, `remark-gfm` and transitive parser-only code when repository search proves no remaining owner.
- Runtime surface: Agent VS Code Extension Webview, including CSP, message lifecycle, theme, selection/copy, resource rendering and Canvas handoff.
- Compatibility: authoritative Markdown source and durable messages remain unchanged; this is a prelaunch internal presentation-path replacement. No legacy parser fallback remains after the removal gate.
- Rollback: revert the entire migration before removal; do not ship a dual-parser runtime or silent fallback flag.
