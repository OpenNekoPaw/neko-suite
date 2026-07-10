## Context

`@neko/markdown` now owns a host-neutral normalized CommonMark/GFM document, annotations, immutable resolution association, diagnostics and append/finalize `MarkdownStreamingSession`. Agent TUI consumes that contract through a terminal projector/layout/Ink adapter. Agent Webview still owns a second parser in `MessageContent/MarkdownRenderer.tsx` through `react-markdown + remark-gfm`, and uses that parser AST for ordinary elements, code languages and creative tables while separately consulting Neko extension/resource projections.

The bounded inventory is recorded in `../normalize-agent-tui-markdown-rendering/webview-audit.md`. Production entry points are `MessageItem`, `ContentBlockItem` and `ThinkingBlock`; all route to the same `MarkdownRenderer`. The Webview sandbox, CSP, `postMessage`, VS Code theme, resource render URI and Canvas handoff boundaries remain unchanged.

This is an L3 cross-cutting presentation migration: it touches shared semantic contracts, streaming identity, Webview React composition, dependency cleanup and Extension Development Host runtime acceptance. It does not add cloud services, cross-process renderers or a repository-wide UI DSL.

### Five-layer analysis

- **Responsibility**: `@neko/markdown` owns source interpretation, identities, ranges, annotations and parser diagnostics. Agent message/timeline state owns source/session identity. Webview owns React composition, VS Code theme/accessibility, resource presentation, Mermaid/composite/creative-table components and localized diagnostics. Extension/resource services own authorization and runtime render URIs.
- **Dependency**: Layer 0 `@neko/markdown` has no React/DOM/VS Code dependency. Webview depends inward on normalized contracts and existing shared UI/resource services. Extension does not import React, and Webview does not import `vscode` or Node APIs.
- **Interface**: introduce a small Webview adapter input containing normalized snapshot, optional immutable resolution snapshot, locale/theme presentation context and registered extension renderers. It returns React elements/presentation models; it never accepts a parser AST or raw-source fallback callback.
- **Extension**: standard node rendering is exhaustive; Neko extensions and Webview-only rich blocks use typed registries/strategies keyed by normalized variants. A new node requires a compile-time/exhaustive adapter update, not edits to all message callers.
- **Testing**: shared semantic fixtures verify parser truth; Webview unit/component tests verify React projection; path poison tests verify no legacy parser invocation; the built extension is accepted in Extension Development Host with `vscode-extension-debugger` for CSP, lifecycle, theme, focus, selection/copy and streaming behavior.

## Goals / Non-Goals

**Goals:**

- One semantic authority for TUI and Webview CommonMark/GFM interpretation.
- One session identity from first Webview delta through finalize, with historical messages finalized through the same adapter.
- Exhaustive normalized-node React presentation while preserving Webview-specific rich rendering.
- Revision-associated resource resolution and fail-visible diagnostics without parser IO.
- Removal and poisoning of direct Webview parser dependencies.
- Shared semantic fixtures and real VS Code Webview runtime evidence.

**Non-Goals:**

- Sharing React/Ink components, layout engines, theme tokens or terminal metrics.
- Moving resource authorization, render URI creation, Canvas mutation or VS Code APIs into `@neko/markdown`.
- Changing durable message Markdown, Canvas handoff schema or Markdown syntax.
- Retaining a dual-parser feature flag or compatibility fallback.

## Decisions

### 1. Webview consumes normalized snapshots, not raw-source parser callbacks

Message/timeline lifecycle creates or retrieves a message-scoped `MarkdownStreamingSession`; the React adapter receives its current snapshot. Raw source remains available for copy/provenance but MUST NOT be reparsed in Webview production code.

Alternative rejected: wrap `react-markdown` behind an interface. This preserves two semantic authorities and cannot prove range/table/streaming equivalence.

### 2. Session ownership follows stable content identity

The owner closest to message/timeline state maintains session identity keyed by stable conversation/message/content-block identity. Streaming updates append to that session; finalization finalizes it. Historical messages create an immediately finalized session through the same factory. `ThinkingBlock` receives an explicit stable key and follows the same rule if it continues to render Markdown.

A replacement source for an existing append-only session fails visibly; it does not reset to another renderer. Lifecycle cleanup releases session-associated adapter/resolution state when the content identity leaves the retained message model.

### 3. Standard node adapter is exhaustive; rich Webview behavior uses typed extension strategies

The standard CommonMark/GFM node union maps to Webview presentation models/components with an exhaustive switch. Annotation and resolution lookups are separate from the node tree. Mermaid, composite content, creative tables, resource chips/images and Canvas handoff remain Webview-local strategies consuming normalized code/table/image/link/annotation data.

Unknown node/version/registered extension states produce explicit diagnostics or test/build failures. There is no raw-text success fallback for contract violations.

Alternative rejected: move existing `MarkdownRenderer.tsx` wholesale into `@neko/markdown`. That would invert Layer 0 dependencies and couple the shared contract to React, VS Code styling and Agent domain semantics.

### 4. Resource resolution is revision-associated and authorization-aware

Parsing remains pure. Existing Agent content/resource services create an immutable resolution snapshot associated with `{sessionId, revision}`. The adapter uses stable refs plus runtime-only render URIs; it never persists Webview URI/blob/cache paths. Streaming revisions may defer enhancement, but ordinary normalized text remains visible and diagnostics are explicit.

### 5. Shared fixtures encode semantics, host tests encode presentation

A shared fixture corpus stores source and normalized expectations for nodes/ranges/tables/links/images/raw HTML/extensions/Unicode/streaming transitions. TUI and Webview consume these fixtures while maintaining host-specific layout/DOM assertions. Existing creative table/resource/composite/Mermaid cases remain Webview adapter fixtures layered on normalized semantics.

Alternative rejected: duplicate source strings and expected parsing independently in each host, which permits semantic drift.

### 6. Legacy parser removal is a poison-gated cutover

The replacement sequence is:

1. Add normalized session/document adapter and exhaustive tests.
2. Migrate `MessageItem`, `ContentBlockItem`, `ThinkingBlock` and tests.
3. Poison direct parser modules/imports in path-level tests and prove streaming/final/historical/failure/retry paths succeed without them.
4. Delete parser imports, AST-specific callbacks and package dependencies.
5. Search the built source/bundle and repository for remaining production ownership.

No compatibility branch or fallback flag is retained. Rollback before release reverts the whole migration commit/change; it does not reactivate a hidden runtime parser.

### 7. Runtime acceptance uses Extension Development Host

Unit/JSDOM/build checks precede runtime smoke. Final acceptance launches the actual extension and inspects the Webview via `vscode-extension-debugger`. It covers streaming/final/historical/timeline/thinking content, tables, code, Unicode, links, resources, Mermaid/composite content, Canvas handoff, CSP, theme, focus, selection/copy and poison evidence.

Ordinary browser/Vite/Playwright can only supplement browser compatibility; it cannot satisfy the acceptance gate.

### 8. Reuse audit and proportionality

Reuse `@neko/markdown`, existing message/content-block presenters, Webview resource presenter, RichContent registry, Mermaid/CodeBlock components, i18n, VS Code theme CSS and shared `@neko/ui` primitives. Do not create a second Webview design system or a cross-host renderer registry. Add only the adapter/session boundary and extension strategies required by current entry points.

## Risks / Trade-offs

- **[Streaming React churn or session leaks]** → stable identity ownership, explicit disposal, revision/generation rejection and lifecycle tests.
- **[Feature regression in the large legacy renderer]** → inventory each current component mapping and rich extension, migrate through exhaustive fixtures before deleting dependencies.
- **[Resource enhancement races]** → associate immutable results with session/revision and discard stale/cancelled results.
- **[DOM/source mismatch affects copy]** → retain authoritative source ranges and add selection/copy acceptance in real Webview runtime.
- **[Parser dependency remains transitively hidden]** → package/dependency search, bundle inspection and poison tests are removal gates.
- **[Cross-host visuals differ]** → accepted; semantics converge, presentation remains host-owned.
- **[Runtime gate unavailable locally]** → record the exact Extension Development Host/debugger blocker and do not archive until evidence exists.

## Migration Plan

1. Freeze the bounded entry-point/dependency inventory and shared fixture plan.
2. Define Webview adapter/session contracts and tests before concrete React rendering.
3. Implement standard node, annotation, diagnostic and resolution presentation.
4. Adapt existing code, Mermaid, composite, creative-table, resource and handoff behaviors.
5. Migrate all three production entry points and historical/failure/retry presentations.
6. Add poison tests; remove direct parser code/dependencies and inspect bundle/dependency graph.
7. Run package tests/build/checks and Extension Development Host runtime acceptance.
8. Update ADR/package docs and archive only when the poison and runtime gates pass.

## Open Questions

- Whether thinking/reasoning content remains Markdown is a product decision; either outcome must be explicit. If Markdown remains, it uses the normalized path. If it becomes plain text, the entry point must be renamed/typed so it cannot accept assistant Markdown accidentally.
- The exact shared fixture file format should reuse existing Vitest/TypeScript fixture conventions discovered during implementation; no new serialized durable contract is required.
