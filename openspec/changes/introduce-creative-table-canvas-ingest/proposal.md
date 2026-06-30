## Why

Agent-generated Markdown tables are now the preferred authoring surface for storyboard plans, image-prep plans, prompt batches, and other creative handoffs, but the current Canvas Markdown path still treats generic tables and storyboard drafts as separate hardcoded cases. This keeps "StoryboardDraft" too central, makes Skill-added fields only passively preserved, and leaves the user-facing `Send to Canvas` flow split between display tables, creative planning, and follow-up execution.

Neko needs one media-aware table ingest path where ordinary tables can still show images/resources, while creative tables can opt into approval/plan/execution field roles and approval-gated actions without defining a fixed storyboard protocol.

## What Changes

- Add a Canvas-owned Markdown ingest facade for Agent/Webview `Send to Canvas` that accepts Markdown, stable resource refs, target, provenance, and optional intent/profile hints, then resolves to a Markdown note, generic table, or creative table.
- Introduce a shared Table Core contract for GFM table parse results, columns, rows, cells, unknown-column preservation, resource/media bindings, render diagnostics, and display fallback.
- Introduce Creative Table profiles as Canvas-owned descriptors layered on Table Core. Profiles define fields, aliases, value types, media/resource behavior, prompt fields, action fields, and field roles: `approval`, `plan`, and `execution`.
- Recast storyboard as a built-in Creative Table profile/preset rather than an independent runtime or protocol. Keep `storyboard-draft` only as a compatibility alias where needed.
- Make generic tables a safe display fallback for creative-table recognition failures: content and media previews may be preserved, but creative semantics and execution actions must remain blocked until a supported profile validates.
- Keep Webview UI simple with one primary `Send to Canvas` action. Webview may pass intent/profile hints from Agent output or user context, but Canvas remains the authority for parsing, profile resolution, validation, resource binding, node creation, and follow-up actions.
- Add lifecycle action projection so Canvas-returned follow-up actions can become explicit approval-gated UI/actions instead of plain `Next actions` text.
- Update Skill guidance to describe creative table field roles and stable media references without requiring the model to output Canvas node JSON, fixed StoryboardDraft DTOs, or old plugin-transfer payloads.
- **BREAKING**: New Markdown-to-Canvas requests must not target `@neko/storyboard-draft`, `@neko/draft-runtime`, `StoryboardDraftNormalized`, `canvasStructuredContent`, or direct storyboard compiler payloads as canonical success paths.

### Non-Goals

- Do not build a universal Markdown-to-Canvas compiler or a generic workflow engine.
- Do not let Agent or Agent Webview write `CanvasNode[]` or production Canvas/Cut payloads directly.
- Do not make creative field roles a durable project-file schema outside Canvas-owned table metadata in this change.
- Do not execute Markdown-declared actions unless they resolve to trusted local capabilities and pass lifecycle approval.
- Do not require every ordinary Markdown table to become a creative table.

## Capabilities

### New Capabilities

- `creative-table-canvas-ingest`: Canvas-owned Markdown ingest, media-aware Table Core, Creative Table profiles, generic display fallback, and approval/plan/execution field roles for Canvas table creation.
- `agent-canvas-markdown-handoff`: Agent Webview single-button Send to Canvas behavior, intent/profile hint projection, lifecycle action result UI, and fail-visible routing to Canvas ingest.

### Modified Capabilities

- None.

## Impact

- Shared contracts:
  - Extend `@neko/shared` Canvas Markdown DTOs with a unified ingest input/result shape, resolved table kind/profile metadata, table/media diagnostics, and optional Creative Table profile descriptors where cross-package types are required.
  - Keep implementation functions in `neko-canvas`; do not reintroduce `@neko/draft-runtime` as a cross-package boundary.
- Canvas extension:
  - Refactor `markdownCapabilities.ts` into Table Core helpers plus registered Canvas-owned profiles.
  - Add `canvas.ingestMarkdown` or equivalent capability/facade that dispatches note/generic/creative/storyboard behavior and returns typed diagnostics/actions.
  - Convert the current storyboard draft handler into a built-in creative profile and compatibility capability wrapper.
- Agent Webview and Extension:
  - Change Markdown `Send to Canvas` to invoke the unified ingest/facade by default.
  - Preserve a simple primary action; optional secondary validation/debug choices may exist but should not expose generic/creative/storyboard as the main user decision.
  - Render returned lifecycle actions as actionable approval/execute controls instead of only appending text.
- Skills and prompts:
  - Update comic/storyboard and media-to-video guidance to describe creative table roles, media references, action suggestions, and Canvas ingest intent.
  - Stop presenting `StoryboardDraft` as a standalone protocol.
- Cleanup and validation:
  - Remove or poison old storyboard draft/compiler success paths for new Markdown handoff requests.
  - Add path-level tests proving the default path hits Canvas ingest, not plugin-transfer fallback or old compiler routes.
