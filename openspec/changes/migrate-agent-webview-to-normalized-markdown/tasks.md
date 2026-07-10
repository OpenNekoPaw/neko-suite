## 1. Inventory and Contract Scaffolding

- [ ] 1.1 Reconfirm every production/test `MarkdownRenderer`, `ReactMarkdown`, `remarkGfm`, parser-AST node, code-language regex, resource projection, creative-table, Mermaid, composite-content and Canvas handoff call site; update the bounded audit if repository state changed.
- [ ] 1.2 Audit `@neko/ui`, existing RichContent/CodeBlock/Mermaid/table/resource components, message/session identity hooks and adjacent Webview adapters before adding new components; record reuse and package-local ownership.
- [ ] 1.3 Define contract-first Webview normalized-session/document adapter inputs, stable content identity, immutable resolution association, localized diagnostic presentation and exhaustive renderer strategy interfaces.
- [ ] 1.4 Add path instrumentation and poison scaffolding for direct `react-markdown`/remark parser invocation, raw-source fallback, final-only renderer and session replacement.

## 2. Shared Semantic Fixture Corpus

- [ ] 2.1 Extract a shared typed fixture corpus for CommonMark/GFM nodes, half-open UTF-16 ranges, tables/alignment/ragged rows/escaped pipes, links/images/raw HTML, Unicode, extensions, diagnostics and incomplete streaming/finalization.
- [ ] 2.2 Migrate `@neko/markdown` semantic tests to consume the shared corpus without weakening current exhaustive contract assertions.
- [ ] 2.3 Consume the same semantic fixtures from TUI and Webview adapter tests while keeping terminal layout and DOM presentation expectations host-local.

## 3. Webview Session and Standard Node Adapter

- [ ] 3.1 Implement message/content-block scoped `MarkdownStreamingSession` ownership with append-only updates, same-session finalize, historical immediate-finalize, cleanup and stale revision/generation rejection.
- [ ] 3.2 Implement exhaustive React presentation for all normalized block/inline CommonMark/GFM node variants, source provenance, table alignment/ragged shape, code language identity, task lists, references, raw HTML policy, images and links.
- [ ] 3.3 Implement annotation and host-localized diagnostic presentation separately from semantic node traversal; unknown contract/version/registration states must fail visibly.
- [ ] 3.4 Implement authorization-aware revision-associated resource resolution using existing Agent content/resource services and runtime-only render URIs; discard stale/cancelled results.

## 4. Webview Rich Presentation Adapters

- [ ] 4.1 Adapt existing code/pre and Mermaid components to normalized code-block inputs without class-name/source regex parsing.
- [ ] 4.2 Adapt NEKO composite/structured content presentation to typed normalized fenced-code inputs and preserve streaming incomplete-source behavior.
- [ ] 4.3 Adapt creative/storyboard table presentation, localized field/value labels and prompt-span rendering to normalized table nodes/annotations without react-markdown AST access.
- [ ] 4.4 Adapt resource image/chip/diagnostic presentation and Canvas handoff assembly to normalized nodes plus immutable resolution snapshots, preserving stable refs and excluding runtime URIs from durable payloads.
- [ ] 4.5 Add exhaustive Webview adapter tests for ordinary Markdown, all standard nodes, tables, code, Unicode, unsafe links/resources, diagnostics, Mermaid, composite content, creative tables and Canvas handoff.

## 5. Entry-Point Cutover

- [ ] 5.1 Migrate `MessageItem` assistant streaming/final/historical/failure/retry Markdown to stable normalized sessions.
- [ ] 5.2 Migrate `ContentBlockItem` active timeline and finalized Markdown to stable normalized sessions without creating a second adapter path.
- [ ] 5.3 Decide and implement the explicit `ThinkingBlock` contract: normalized Markdown with stable identity, or a renamed/typed non-Markdown plain-text presentation that cannot accept assistant Markdown.
- [ ] 5.4 Update barrels, props, presenters and tests so no production caller can instantiate a raw-source legacy Markdown renderer.

## 6. Legacy Parser Removal Gate

- [ ] 6.1 Run path-level poison tests for first delta, intermediate streaming, same-session finalize, historical message, timeline block, thinking content and failure/retry presentation; assert zero legacy parser/fallback invocations.
- [ ] 6.2 Delete `ReactMarkdown`/`remarkGfm` production imports, AST callback assumptions, code-language regex parser and raw/final-only compatibility branches after poison tests pass.
- [ ] 6.3 Remove `react-markdown`, `remark-gfm` and parser-only dependencies from `packages/neko-agent/packages/webview/package.json` and lockfile when repository search proves no remaining owner.
- [ ] 6.4 Inspect production source and built Webview bundle/dependency graph to prove no direct or hidden legacy parser can return success.

## 7. Validation and Runtime Acceptance

- [ ] 7.1 Run focused normalized-contract, Webview component/presenter and session/race tests plus strict TypeScript and Webview/extension builds; fix all scoped failures.
- [ ] 7.2 Run `pnpm check:agent-boundaries`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:openspec` and applicable broader `pnpm check`/`pnpm ci:local` gates.
- [ ] 7.3 Use Extension Development Host with `vscode-extension-debugger` to verify streaming/final/historical/timeline/thinking content, tables, code, Unicode, links, resources, Mermaid/composite content, Canvas handoff, CSP, theme, focus, selection/copy and session cleanup.
- [ ] 7.4 Re-run the runtime smoke with legacy parser poison enabled or equivalent bundle instrumentation and prove the removed path is unreachable; browser-only/JSDOM evidence cannot satisfy this task.
- [ ] 7.5 Apply `neko-quality-review`, resolve blocking findings and record exact external/runtime blockers and residual risk; do not archive while Extension Development Host or poison evidence is missing.

## 8. Documentation and Completion

- [ ] 8.1 Update `@neko/markdown`, Agent architecture and unified Markdown/resource ADR documentation to mark Webview semantic convergence complete only after the removal/runtime gates pass.
- [ ] 8.2 Re-run OpenSpec validation, confirm proposal/design/spec/tasks match implementation evidence and archive the change only when all tasks and acceptance gates are complete.
