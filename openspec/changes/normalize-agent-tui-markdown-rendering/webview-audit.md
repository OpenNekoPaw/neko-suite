# Agent Webview Markdown Entry-Point Audit

日期：2026-07-10
Owner：`@neko-agent/webview`（presentation adapter）；`@neko/markdown`（normalized semantic contract）

本审计限定于 Agent Webview assistant/thinking Markdown 展示链。它记录当前 direct parser、全部调用入口、与 normalized contract/现有 fixture corpus 的差距，并作为 linked change `migrate-agent-webview-to-normalized-markdown` 的输入；它不宣称 Webview migration 已完成。

## Current canonical and direct-parser boundary

唯一直接 CommonMark/GFM parser 入口是：

```text
packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.tsx
  -> react-markdown
  -> remark-gfm
  -> host-local react-markdown Components mapping
```

直接 package dependencies 位于：

```text
packages/neko-agent/packages/webview/package.json
  react-markdown
  remark-gfm
```

`MarkdownRenderer.tsx` 同时承担以下职责：

- 调用 `ReactMarkdown` / `remarkGfm` 解释普通 Markdown/GFM。
- 基于 react-markdown AST `node` 识别 creative/storyboard tables。
- 通过 `/language-([^\s]+)/` 从 code class name 重新识别 fenced-code language。
- 映射 paragraph/headings/lists/link/blockquote/table/strong/emphasis/delete/image/hr/code/pre 等 React components。
- 承载 Mermaid、NEKO composite/structured artifact、creative table 和 resource-aware presentation。
- 调用 `projectNekoMarkdownGenerationPromptParts` 以及 package-local resource rendering presenter；这些 projection 与 direct parser 并存，并未形成单一 normalized document path。

因此当前 Webview 的 CommonMark/GFM 语义仍由 host-local parser AST 决定；`@neko/markdown` 只覆盖部分扩展 projection，尚不能证明 TUI/Webview cross-host semantic convergence。

## Exhaustive entry points and call sites

| Entry point | Source and streaming state | Current call path | Migration obligation |
| --- | --- | --- | --- |
| Assistant message block | `MessageItem.tsx` 的 `projection.renderKind === 'markdown'`; `projection.renderStreaming` 同时覆盖 streaming/final/historical message | `MarkdownRenderer(content, isStreaming, markdownResources)` | 从首 delta 到 final/historical source 使用 message-scoped normalized session/document；不能继续由 `ReactMarkdown` 重解析。 |
| Flattened/active timeline content block | `ContentBlockItem.tsx` 的 `renderKind === 'markdown'`; active streaming 与 finalized block 共用该入口 | `MarkdownRenderer(content, isStreaming, markdownResources)` | 保持 timeline identity，流式更新与 finalize 关联到同一 session；failure/retry 后的 assistant markdown 也必须进入同一 adapter。 |
| Thinking/reasoning block | `ThinkingBlock.tsx`; `isComplete` 决定 streaming flag | `MarkdownRenderer(content, !isComplete)` | 明确 thinking Markdown 是否采用同一 normalized contract；若保留 Markdown，则必须迁移，不能成为 direct-parser 旁路。 |
| Markdown renderer barrel | `MessageContent/index.ts` | re-export `MarkdownRenderer` | 只导出 normalized-document adapter；legacy component 必须移除或 poison。 |
| Renderer tests | `MarkdownRenderer.test.tsx` | 直接 mount legacy renderer | 迁移为 shared semantic fixtures + Webview adapter assertions，并增加 direct parser poison test。 |

没有发现第二个 `ReactMarkdown` / `remarkGfm` 生产调用点。`MessageItem` 与 `ContentBlockItem` 是两种消息/时间线 composition 入口，不应各自创建新的 parser 或 adapter。

## Normalized contract gap

当前 Webview 尚未消费以下 `@neko/markdown` canonical data as source of truth：

- exhaustive normalized node union and half-open UTF-16 source ranges `[startOffset, endOffset)`；
- `MarkdownStreamingSession` identity、revision、stable prefix、mutable tail 与 same-session finalize；
- parser/content diagnostics 与 host-localized diagnostic presentation；
- node/annotation/resolution snapshot 分层；
- normalized table alignment、ragged row shape、escaped pipes、raw HTML/image/link safety semantics；
- normalized fenced-code language identity；
- revision-associated authorization-aware resource resolution snapshot。

Webview-specific presentation仍应留在 Webview：React components、VS Code theme tokens、resource thumbnails/chips、Mermaid、structured artifact presenter、Canvas handoff UI。迁移只替换 semantic interpretation boundary，不把 React/VS Code presentation 下沉到 `@neko/markdown`。

## Shared fixture-corpus mapping

当前可复用语义证据分散在以下测试中，linked change 必须提取或引用一个 shared fixture corpus，避免复制期望：

| Semantic area | Existing evidence | Webview migration requirement |
| --- | --- | --- |
| CommonMark/GFM nodes, ranges, links, images, raw HTML | `packages/neko-markdown/src/__tests__/parser.test.ts` | Webview adapter consumes normalized nodes without host-local reparsing. |
| Annotation overlap, resolution association, identities | `packages/neko-markdown/src/__tests__/contracts.test.ts` | React adapter joins annotations/resolution by typed IDs/ranges. |
| Stable streaming/finalize and incomplete syntax | `packages/neko-markdown/src/__tests__/streaming.test.ts` and TUI canonical renderer tests | Webview streaming and final message preserve one session identity. |
| Table alignment/ragged rows/escaped pipes | parser tests and TUI `projector-layout.test.ts` | Webview table components receive normalized alignment/source row shape. |
| Unicode/source fidelity | parser and TUI text-metrics tests | DOM copy/source behavior uses authoritative source ranges, not display reconstruction. |
| Unsafe links/resources | parser tests and TUI `theme-security.test.ts` | Webview scheme/resource authorization remains host-owned but consumes normalized targets. |
| Creative tables/resources/composite/Mermaid | current `MarkdownRenderer.test.tsx` | Preserve Webview presentation through exhaustive normalized adapter fixtures. |

The shared corpus should contain source plus normalized semantic expectations. Host-specific TUI/DOM assertions may extend, but must not redefine parser semantics.

## Dependency cleanup and poison gate

The linked migration is not complete until all of the following are true:

1. Production Webview code has no direct `react-markdown`, `remark-gfm`, unified/remark parser, or equivalent fallback import.
2. `packages/neko-agent/packages/webview/package.json` removes parser dependencies when repository search proves no remaining owner.
3. Every assistant/timeline/thinking Markdown entry consumes a normalized document/session adapter.
4. Legacy parser entry is poisoned in path-level tests, and successful streaming/final/historical/failure presentations prove the poison was not invoked.
5. No compatibility branch can return a successful Webview render by re-entering the legacy parser.

## Runtime acceptance gate

Unit/Vitest/JSDOM evidence is necessary but insufficient. Final acceptance must run the built Agent extension in **VS Code Extension Development Host** and use the `vscode-extension-debugger` workflow to verify:

- streaming continuity and same-session finalize;
- historical/failure/timeline/thinking entry-point coverage;
- tables, links, code, Unicode, resources, Mermaid, composite content and Canvas handoff;
- CSP, Webview messaging, focus/selection/copy behavior and VS Code theme changes;
- legacy parser poison remains unreachable in the real Webview bundle/runtime.

Plain Vite/browser/Chrome/Playwright output cannot replace this gate.
