## Context

The current Markdown-to-Canvas path already moved away from old plugin-transfer storyboard payloads and toward Canvas Markdown capabilities. However, the implementation still has a hard split between a generic table path and a storyboard-draft path:

- `canvas.createTableFromMarkdown` creates a generic table from a GFM table.
- `canvas.createStoryboardDraftFromMarkdown` creates a review-first storyboard table with hardcoded storyboard aliases and follow-up actions.
- Agent Webview's default `Send to Canvas` path can still treat any GFM table as generic unless a caller explicitly supplies a more specific capability.
- Canvas preserves unknown table columns, but it does not know whether those fields are user review facts, suggested plan inputs, or executable actions.

The product direction is not a fixed StoryboardDraft protocol. The table is the user-reviewable creative artifact; storyboard is one profile among future profiles such as image preparation, prompt batches, approval matrices, generated-asset review, and interactive video branch maps. Ordinary tables should also render media references where stable resource refs are available.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Agent skills own output guidance and may express intent/profile hints. Agent Webview owns presentation, resource render projections, and one primary `Send to Canvas` affordance. Agent Extension owns typed Webview-to-Canvas request routing and lifecycle approval mediation. Canvas owns Markdown ingest, table parsing, profile resolution, resource binding, node creation, persisted table metadata, diagnostics, and follow-up action definitions. Trusted domain capability providers own actual image/video/Cut/Canvas execution. |
| Dependency | Shared DTOs live in `@neko/shared` only when Agent Webview, Agent Extension, and Canvas all need static types. Canvas profile implementation stays in `neko-canvas` and must not import Agent/Webview internals. Webview must not import Canvas handlers or VSCode APIs. Table Core pure helpers can remain Canvas-private until another owning package needs them. |
| Interface | The cross-package interface is an ingest request/result: Markdown, source format, stable resources, target, provenance, optional intent/profile hints, resolved kind/profile, diagnostics, preview, node refs, and lifecycle actions. It is not `CanvasNode[]`, `StoryboardDraftNormalized`, `CreativeDraftDocument`, or a fixed storyboard row DTO. |
| Extension | New table behavior is added by registering a Canvas-owned `CreativeTableProfile` descriptor and optional trusted action adapters. Skill-added fields can be displayed and grouped by roles when the active profile declares them; otherwise they remain preserved unknown columns. New execution actions must resolve to a registered capability, not arbitrary Markdown text. |
| Testing | Unit tests cover DTO validation, table parsing, media-token extraction, resource binding, profile resolution, generic fallback, and action readiness. Webview presenter tests prove a single `Send to Canvas` invokes ingest and does not expose generic/creative/storyboard as the primary choice. Extension route tests prove lifecycle actions can be approved and re-invoked. Path-level tests poison plugin-transfer/storyboard compiler routes. VSCode Webview runtime smoke remains the final interaction check. |
| Proportionality | This is a local VSCode client capability facade, not a remote tool platform. A small Canvas-owned registry is justified because at least storyboard, image-prep, prompt batch, and review tables need the same field-role/resource/action semantics. There is no dynamic package scanning, remote schema registry, multi-tenant policy layer, or generic workflow scheduler. |
| Fail-visible behavior | Unknown profiles, invalid profile descriptors, duplicate field aliases, unsafe resource identities, unsupported execution actions, missing required execution fields, unresolved resource tokens, and attempts to hit old compiler paths return diagnostics or fail tests. Generic fallback is display-only and must not be reported as creative/action success. |

## Goals / Non-Goals

**Goals:**

- Give Agent Webview one primary Markdown `Send to Canvas` entry point.
- Let Canvas resolve Markdown into a note, generic table, or creative table using explicit hints and safe detection.
- Extract a media-aware Table Core so ordinary tables and creative tables both preserve columns/rows/cells and render stable media/resource references.
- Define Creative Table profiles with field roles: `approval`, `plan`, and `execution`.
- Keep generic tables as safe display fallback for unsupported creative profiles or uncertain table semantics.
- Recast storyboard as a built-in creative profile/preset, with `storyboard-draft` as a compatibility alias only.
- Render Canvas-returned lifecycle actions as actionable approval/execute UI instead of plain text.
- Keep all resource identity stable and reject Webview URIs, blob URLs, cache paths, temp paths, Engine tokens, and chat attachment order as durable identity.

**Non-Goals:**

- Do not create a new `@neko/draft-runtime` or resurrect `@neko/storyboard-draft`.
- Do not let a Skill dynamically register arbitrary executable actions from Markdown.
- Do not require ordinary tables to opt into creative roles.
- Do not make Markdown tables a durable project file format outside Canvas-owned node metadata.
- Do not implement full Obsidian-style transclusion or document embedding in this change.
- Do not replace existing domain tools for image generation, video generation, Cut import, or Canvas production node creation.

## Decisions

1. **Use a Canvas ingest facade as the default Webview handoff.**
   - The primary Webview action sends `canvas.ingestMarkdown` or equivalent typed input with Markdown, resources, target, provenance, and optional hints.
   - Canvas resolves `resolvedKind: markdown-note | generic-table | creative-table` and returns diagnostics/actions.
   - Existing specific capabilities may remain as wrappers or lower-level handlers, but default `Send to Canvas` uses ingest.
   - Alternative rejected: expose menu-first choices such as "Send as Generic Table", "Send as Storyboard Draft", and "Send as Creative Table". This leaks internal taxonomy to users and will not scale to future profiles.
   - Alternative rejected: let Agent alone choose the path. User button clicks must work without another model turn, and Canvas must be the authority for validation and resource binding.

2. **Make Table Core media-aware and semantics-light.**
   - Table Core parses one GFM table, stores original Markdown, columns, rows, cells, source ranges when available, unknown columns, and diagnostics.
   - Table Core extracts media tokens from configured resource-like columns and CommonMark image targets when stable resources are supplied by the host.
   - Table Core can render thumbnails/status for ordinary tables without assigning approval/plan/execution roles.
   - Alternative rejected: keep media rendering only in storyboard logic. Ordinary tables need image/resource display too, and resource identity rules are shared.

3. **Layer Creative Table roles on top of Table Core.**
   - A `CreativeTableProfile` descriptor declares fields, aliases, labels, value types, field role, resource behavior, prompt behavior, action behavior, and validation requirements.
   - Field roles mean creative information, not lifecycle phases:
     - `approval`: user-review facts such as text, source image, IP/character references, scene, visual description, risk, keep/skip decision.
     - `plan`: next-step suggestions such as split/redraw/complete-shot/generate-video, prompts, parameters, duration, motion, decision reason.
     - `execution`: trusted executable action references, status, result refs, generated resource refs, created node refs.
   - Alternative rejected: map the three roles directly to lifecycle `review/apply/execute`. Capability lifecycle governs tool invocation safety; field roles describe the creative artifact content.

4. **Treat storyboard as a built-in Creative Table profile.**
   - The current storyboard aliases and validations become a built-in profile such as `storyboard`.
   - `storyboard-draft`, `markdown-storyboard-draft`, and `canvas.tableProfile.storyboard-draft` remain accepted aliases during migration but are not the architectural center.
   - Alternative rejected: keep a standalone StoryboardDraft implementation. That repeats the fixed-protocol problem and makes interactive video or image-prep tables add parallel implementations.

5. **Use generic table as display fallback, not semantic fallback.**
   - If creative profile resolution is unknown or invalid, Canvas may create or preview a generic table with diagnostics.
   - The result must not expose creative actions, execution readiness, or production node creation as successful.
   - Alternative rejected: silently downgrade creative failure to generic success. That hides profile errors and violates fail-visible behavior.

6. **Keep Skill configuration advisory unless registered by Canvas.**
   - Skills may describe preferred columns, field roles, media reference policy, and preferred Canvas intent/profile hints in prompt guidance or metadata.
   - Canvas only consumes roles/actions from registered profiles or trusted profile descriptors installed with the application/extension, not arbitrary Markdown cells.
   - If a Skill emits extra fields not known to Canvas, they are preserved and displayed as extension fields, with diagnostics if the user attempted a creative action requiring registered semantics.
   - Alternative rejected: allow models to define executable schemas inline. It would be easy to spoof action ids or bypass approval.

7. **Project lifecycle actions into Webview controls.**
   - Canvas ingest/review results may return action descriptors with capability id, phase, source ref, required approval, and payload snapshot.
   - Agent Webview should render these as buttons or review controls that invoke the same lifecycle backend with approval context when the user confirms.
   - Alternative rejected: append `Next actions` as inert assistant text. It informs the user but does not close the approval-to-execution loop.

## Risks / Trade-offs

- [Risk] The ingest facade becomes a hidden compiler. -> Mitigation: keep the facade limited to Markdown/table classification, Table Core, profile resolution, Canvas node creation, and action descriptors; actual media generation/video/Cut execution remains in trusted domain capabilities.
- [Risk] Profile descriptors grow too dynamic. -> Mitigation: profiles are registered code/config owned by Canvas or trusted extensions, validated at startup, and fail on duplicate aliases, unknown actions, or unsupported field types.
- [Risk] Generic fallback hides mistakes. -> Mitigation: fallback status and diagnostics must say the table is display-only; creative/action results remain blocked.
- [Risk] Webview action UI duplicates plan-mode approval. -> Mitigation: Webview action buttons invoke the same Agent capability lifecycle route and approval context instead of inventing a second approval system.
- [Risk] Resource matching remains ambiguous for user-readable tokens. -> Mitigation: show token status, candidate summaries, and never bind by row order or attachment order.
- [Risk] Renaming storyboard profile breaks existing tests/prompts. -> Mitigation: keep alias compatibility for `storyboard-draft` while updating new documentation and tests to assert creative profile behavior.

## Migration Plan

1. Define shared ingest/profile/result DTOs and validators needed across Agent Webview, Agent Extension, and Canvas.
2. Refactor Canvas `markdownCapabilities.ts` toward Table Core helpers and a validated profile registry while preserving existing behavior through tests.
3. Add built-in `generic` and `storyboard` profiles; map old `storyboard-draft` aliases to `storyboard`.
4. Implement Canvas ingest facade with display fallback and diagnostics before changing Webview default routing.
5. Change Agent Webview `Send to Canvas` to call ingest by default and pass resource refs plus optional intent/profile hints.
6. Add lifecycle action projection UI and route follow-up approval/execution through the existing lifecycle backend.
7. Update Skill prompts/tests to describe Creative Table field roles and Canvas ingest intent.
8. Remove or poison obsolete new-request paths that use storyboard draft runtime/compiler or plugin-transfer storyboard payloads.
9. Run focused unit/contract tests, affected package typechecks, OpenSpec strict validation, and VSCode Webview runtime smoke for the button/action loop.

Rollback before persisted Canvas table metadata changes is straightforward: keep specific Canvas Markdown capabilities and route Webview back to `createTableFromMarkdown`/`createStoryboardDraftFromMarkdown` while leaving old compiler paths disabled. If new creative table metadata has been persisted, rollback must either keep read-only display of that metadata or migrate it to generic table markdown metadata with a visible diagnostic.

## Open Questions

- Should the public capability id be `canvas.ingestMarkdown`, `canvas.createTableFromMarkdown` with an `intentHint`, or `canvas.createCreativeTableFromMarkdown` plus a note/table dispatcher?
- Should trusted Creative Table profiles live entirely in Canvas extension code first, or should a minimal descriptor type be exported from `@neko/shared` immediately?
- How much of the lifecycle action UI belongs in existing message result rendering versus a reusable action-card component shared with plan/diff/tool approval surfaces?
