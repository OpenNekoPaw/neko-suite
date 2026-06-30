## Context

The current Agent-to-Canvas content path has three overlapping ideas:

- plain Markdown rendered in Agent Webview through `react-markdown` and `remark-gfm`;
- plugin transfer payloads such as `canvasText`, `canvasStructuredContent`, and `canvasStoryboard`;
- the newer storyboard draft runtime/compiler work that parses Markdown tables into a typed draft document and projects them toward Canvas/Storyboard structures.

That direction solves some table-normalization problems, but it makes the wrong boundary canonical. A compiler package starts to know about Markdown parsing, resource binding, storyboard field aliases, render projections, prompt/action readiness, and future Canvas creation policy. The next creative scenario, such as interactive video planning or branching story maps, would either add another compiler or expand the existing one until it becomes a hidden Canvas authoring runtime.

This change adopts the boundary recorded in `docs/architecture/adr-unified-markdown-resource-rendering.md`: Agent produces Markdown and intent, Agent Webview enhanced-renders Markdown and resource diagnostics, and Canvas exposes typed MCP-like capabilities that validate Markdown and create Canvas-owned nodes.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Agent runtime owns turn assembly, skill output guidance, and capability invocation intent. Agent Webview owns display, user-triggered Send to Canvas UI, and runtime-only Webview resource projections. Canvas extension owns capability registration, input validation, resource binding, diagnostics, node creation, persistence, and follow-up action results. Shared/content-access foundations own stable refs, authorization, cache hiding, and Webview URI projection. |
| Dependency | Shared DTOs or Canvas extension API types must be Layer 0/1-safe and must not import React, Canvas internals, Agent internals, or Webview code. Agent Webview must not import Canvas implementation modules. Canvas must not import Agent Webview presenters or `@neko/draft-runtime` as its public protocol. Resource projection stays behind Extension/content-access boundaries. |
| Interface | The cross-package contract is `CanvasMarkdownCapabilityInput` / `CanvasMarkdownCapabilityResult`: Markdown text, source format hint, stable resource refs, target, provenance, diagnostics, node/action ids. It is not `CanvasNode[]`, `CreativeDraftDocument`, or a fixed storyboard row protocol. |
| Extension | New creative flows add Canvas capabilities or profile handlers behind Canvas capability registration. Skills can add Markdown table columns or output declarations without changing the shared DTO, because unknown/extra columns remain Canvas-owned draft/display metadata unless a specific capability profile consumes them. |
| Testing | Unit tests cover DTO validators, capability routing, Markdown table/resource parsing helpers, resource diagnostics, and profile handlers. Contract and bridge tests prove Agent Webview Send to Canvas invokes capability APIs. Webview tests cover rendered tables/images/diagnostics. Path-level tests poison old compiler/transfer paths so new tests cannot pass through fallback. VS Code Webview runtime smoke is required for final visual/interaction acceptance. |
| Proportionality | This is not a remote service framework. Capability invocation is a local VSCode Extension/Webview command/API boundary modeled after MCP tool contracts because Agent already understands tools/capabilities and Canvas already owns local state. There is no extra server, tenant layer, generic orchestration engine, or durable Markdown compiler registry. |
| Fail-visible behavior | Unknown capability ids, unsupported source formats, invalid resource refs, raw runtime handles, missing resource tokens, unsupported image projections, unregistered profile handlers, and old-path storyboard compiler requests fail with diagnostics or thrown test failures. They must not silently fall back to row order, raw paths, cache paths, or `canvasStructuredContent` success. |

## Goals / Non-Goals

**Goals:**

- Define typed Canvas Markdown capability DTOs and a local invocation path for Agent Webview and Agent tools.
- Make Canvas the owner of Markdown validation, resource binding, node creation, and capability diagnostics.
- Let Agent Webview render Markdown tables and image references with resource status, thumbnails when projected, and actionable diagnostics.
- Support skill-extensible Markdown fields by preserving extra table columns as draft/display metadata and consuming them only through Canvas-owned profiles.
- Make storyboard creation review-first by default: Markdown drafts can show prompts, next actions, resources, and plan/execution state before creating production nodes.
- Clean or fail-close old storyboard draft runtime/compiler paths so the new capability route is the canonical path.

**Non-Goals:**

- Build a universal Markdown-to-Canvas compiler.
- Turn Markdown into a durable Canvas project format.
- Let Agent generate Canvas node JSON, Cut timeline JSON, or resource cache paths.
- Implement full resource-reference transclusion, document section embedding, or bidirectional Markdown document editing in the first phase.
- Replace existing `CompositeArtifact` / `GenericTable` contracts for validated tool results that are not Markdown authoring drafts.

## Decisions

1. **Use Canvas MCP-like capabilities as the canonical authoring boundary.**
   - Canvas will expose local capabilities such as `canvas.createMarkdownNote`, `canvas.createTableFromMarkdown`, `canvas.createStoryboardDraftFromMarkdown`, `canvas.createStoryboardFromMarkdown`, `canvas.attachResource`, and `canvas.validateMarkdownStoryboard`.
   - Agent and Agent Webview pass Markdown plus intent and resource refs; Canvas returns diagnostics, created node ids, and follow-up actions.
   - Alternative considered: continue expanding `@neko/draft-runtime` as a shared compiler. Rejected because it centralizes Canvas authoring policy outside Canvas and would grow with every new draft scenario.

2. **Keep the shared DTO action-oriented and field-light.**
   - The capability input carries Markdown, `sourceFormat`, resources, target, and provenance. It does not define permanent storyboard columns such as visual, motion, prompt, character, or duration.
   - Capability profiles may interpret known fields for storyboard creation, but unknown fields remain available as display/draft metadata and diagnostics.
   - Alternative considered: define one large fixed storyboard draft DTO. Rejected because the user goal is plan/review/execute, and skills need to add fields without changing a core protocol every time.

3. **Make review-first the default for storyboard Markdown.**
   - `canvas.createStoryboardDraftFromMarkdown` creates a Canvas-owned draft/review node with table display, resource status, prompts, next actions, and diagnostics.
   - `canvas.createStoryboardFromMarkdown` creates production storyboard nodes only when the user or confirmed Agent action explicitly requests node creation.
   - Alternative considered: always compile valid tables directly into storyboard nodes. Rejected because image-to-shot mapping, scene grouping, prompt quality, and next-step execution often need review before mutation.

4. **Resource references are stable identities; render URIs are runtime projections.**
   - Inputs may include `ResourceRef`, `DocumentArchiveResourceRef`, workspace-relative paths, or `${VAR}/path` only when allowed by existing content-access policy.
   - Webview display may use projected URIs created by Host/content-access services, but those URIs never write back to Markdown, drafts, Canvas nodes, or transfer payloads.
   - Alternative considered: allow table cells to contain filenames or image order references. Rejected because the Agent only knows conversation order, while Canvas needs stable resource identity and visible diagnostics.

5. **Phase Markdown enhancements.**
   - Phase 1 supports existing GFM rendering, table token projection, CommonMark image `![alt](assets/cover.png)` via host resolution/projection, and diagnostics.
   - Phase 2 adds Neko resource-reference `![[...]]` embeds and `[[...]]` links through a remark plugin, resolver, and ambiguity rules.
   - Alternative considered: implement every Markdown extension before Canvas capability work. Rejected because Send to Canvas and resource identity are the current workflow blocker; full resource-reference document embedding is larger and should not block the core path.

6. **Skills declare Markdown output features instead of embedding protocol payloads.**
   - Skill metadata or prompt guidance can declare `markdownExtensions`, preferred resource reference syntaxes, forbidden runtime handles, and preferred Canvas actions.
   - The declaration guides model output and renderer expectations, but Canvas still validates every capability invocation.
   - Alternative considered: ask skills to output Canvas capability JSON directly. Rejected because Markdown is the reviewable user artifact and JSON tool payloads are better assembled by local UI/tool adapters.

7. **Clean old paths before accepting new-path validation.**
   - New-path tests must assert the Canvas capability route is called. Legacy `canvasStructuredContent` storyboard compiler behavior and `@neko/draft-runtime` imports in Agent Webview are removed, isolated, or poisoned for new requests.
   - Alternative considered: keep old compiler fallback while adding capabilities. Rejected because fallback would hide broken capability behavior and preserve conflicting sources of truth.

## Risks / Trade-offs

- [Risk] Capability DTOs become too generic and lose useful validation. -> Mitigation: keep the boundary field-light, but define strict validators for capability ids, source formats, resources, targets, diagnostics, and status; profile-specific validation lives in Canvas.
- [Risk] Canvas profile handlers become a hidden compiler registry. -> Mitigation: keep handlers action-specific and Canvas-private; add a new public capability only when the user-facing action changes, not for every column alias.
- [Risk] Agent Webview renderer grows into a document engine. -> Mitigation: phase Neko resource-reference parsing and keep document/resource resolution behind host adapters with diagnostics.
- [Risk] Removing `@neko/draft-runtime` breaks recent tests. -> Mitigation: migrate useful pure test fixtures to Canvas capability tests or renderer tests, then delete compiler-specific fixtures that no longer represent canonical behavior.
- [Risk] Resource matching remains confusing for users. -> Mitigation: show token status, missing/ambiguous diagnostics, candidate summaries, and never bind by image order or raw filename guesswork.
- [Risk] Existing `neko-composite` examples keep steering the model toward JSON authoring. -> Mitigation: update prompts/fixtures to prefer Markdown plus Canvas actions, while retaining composite rendering for validated tool results.

## Migration Plan

1. Define the Canvas Markdown capability DTOs and validators in the selected public contract location.
2. Add Canvas capability registration and no-op/validation-first handlers that return typed diagnostics before node creation is implemented.
3. Replace Agent Webview Send to Canvas for Markdown/storyboard drafts with capability invocation and remove new-path reliance on `canvasStructuredContent` or `@neko/draft-runtime`.
4. Implement Phase 1 Agent Markdown resource rendering: table token projection, CommonMark image resolution/projection, and diagnostic UI.
5. Implement Canvas handlers for Markdown note/table/storyboard draft creation, then explicit storyboard node creation.
6. Update skill/prompt declarations and tests so models output Markdown with stable resource tokens/ref syntax and preferred Canvas actions.
7. Delete or fail-close obsolete storyboard draft runtime/compiler package exports and fixtures after all canonical callers move.
8. Add validation and smoke coverage, including path-level tests proving old compiler transfer paths do not return success for new requests.

Rollback is local because no new durable public file format is introduced in the first phase. If node creation handlers are not ready, Canvas can keep validation/draft creation enabled and return `needs-review` or `blocked` diagnostics for production storyboard creation without restoring the old compiler path.

## Open Questions

- Should the minimal DTO live in `@neko/shared`, or should Canvas expose it through a public Canvas extension API subpath first and promote only if more packages import it directly?
- Should Phase 2 Neko resource-reference parsing live in Agent Webview only, or become a small shared Markdown extension parser if Canvas preview surfaces also need it?
- Which Canvas node type should represent a review-first storyboard draft: a specialized draft node, a table node with metadata, or a text/document node with structured attachments?
