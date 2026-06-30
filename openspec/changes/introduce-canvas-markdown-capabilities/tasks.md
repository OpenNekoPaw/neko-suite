## 1. Contract and Boundary Audit

- [x] 1.1 Audit current Agent-to-Canvas Markdown/storyboard paths, including plugin transfer payloads, Canvas capability provider tools, Agent MarkdownRenderer, creative draft presenter code, and `@neko/draft-runtime` imports.
- [x] 1.2 Choose the DTO home for Canvas Markdown capability contracts (`@neko/shared` vs Canvas public extension API) and record the reason in code comments/docs or the implementation summary.
- [x] 1.3 Define `CanvasMarkdownCapabilityInput`, `CanvasMarkdownCapabilityResult`, diagnostics, resource refs, target, action, status, and source format types.
- [x] 1.4 Add strict validators/type guards for capability input/output and rejection cases for unknown capability ids, unsupported source formats, invalid targets, and runtime-only resource handles.
- [x] 1.5 Add focused contract tests for valid DTOs, invalid DTO diagnostics, and resource identity rejection.

## 2. Canvas Capability Provider

- [x] 2.1 Register Canvas Markdown capabilities in the Canvas capability provider with confirmation/risk metadata aligned to note/table/draft/create-node actions.
- [x] 2.2 Implement validation-only handlers for `canvas.validateMarkdownStoryboard` and shared diagnostic mapping before any mutating handlers return success.
- [x] 2.3 Implement `canvas.createMarkdownNote` using Canvas-owned note/text node creation and target handling.
- [x] 2.4 Implement `canvas.createTableFromMarkdown` using Canvas-owned table/draft representation and diagnostics for malformed Markdown tables.
- [x] 2.5 Implement `canvas.createStoryboardDraftFromMarkdown` as review-first Canvas draft/table creation with resource status, prompts/plan metadata, and follow-up actions.
- [x] 2.6 Implement `canvas.createStoryboardFromMarkdown` as explicit production node creation gated by validation and confirmation-ready invocation.
- [x] 2.7 Implement `canvas.attachResource` for stable `ResourceRef` / `DocumentArchiveResourceRef` attachment to existing Canvas targets.
- [x] 2.8 Add Canvas unit/contract tests proving created node ids, diagnostics, and `needs-review` / `blocked` / `created` statuses are returned correctly.

## 3. Resource Binding and Markdown Parsing

- [x] 3.1 Move or rewrite useful pure Markdown table/token/duration/alias helpers behind Canvas capability implementation without exposing `@neko/draft-runtime` as the public contract.
- [x] 3.2 Implement resource token binding from capability `resources[]`, preserving stable refs and rejecting cache paths, Webview URIs, blob URLs, Engine tokens, system temp paths, and provider-private handles.
- [x] 3.3 Implement missing and ambiguous resource diagnostics with safe candidate summaries that exclude raw private paths and runtime projection URIs.
- [x] 3.4 Preserve extra Markdown table columns as draft/display metadata unless a Canvas profile consumes them.
- [x] 3.5 Add tests for one-image-to-many-shots, many-images-to-one-shot, scene grouping hints, extra columns, missing visual/content fields as diagnostics, and no binding by image/chat order.

## 4. Agent Webview Rendering

- [x] 4.1 Replace creative draft renderer dependencies on `@neko/draft-runtime` with renderer-local or shared display helpers that do not define the handoff protocol.
- [x] 4.2 Enhance Markdown table cells to show resource token status, projected thumbnails, safe summaries, and missing/ambiguous diagnostics.
- [x] 4.3 Add CommonMark image resolution/projection support through the Extension/content-access boundary and render diagnostics for unauthorized or unprojectable images.
- [x] 4.4 Define the Phase 2 Neko resource-reference parser/resolver boundary for `![[...]]` and `[[...]]`; implement only if needed for first acceptance, otherwise leave fail-visible unsupported-extension diagnostics and tests.
- [x] 4.5 Ensure rendered Webview URIs remain presentation-only and are never written back into Markdown, memory, Canvas capability input, or durable draft data.
- [x] 4.6 Add renderer tests for GFM tables, token thumbnails, missing tokens, ambiguous tokens, CommonMark images, projection failures, and disabled Neko resource-reference embeds.

## 5. Send to Canvas Invocation Path

- [x] 5.1 Add or update the Agent Webview-to-Extension request/response message for invoking Canvas Markdown capabilities through the typed bridge.
- [x] 5.2 Update Send to Canvas menu/actions so Markdown note, table, storyboard draft, storyboard node creation, and attach-resource actions call the matching Canvas Markdown capability.
- [x] 5.3 Pass original Markdown, stable resource refs, target, provenance, and source format hints rather than rendered HTML, DOM state, projected URIs, or compiler output.
- [x] 5.4 Surface Canvas capability diagnostics and follow-up actions back in Agent Webview after invocation.
- [x] 5.5 Add bridge tests proving Send to Canvas invokes the capability path and does not call `neko.canvas.importAgentContent` structured fallback for Markdown storyboard requests.

## 6. Skill and Prompt Updates

- [x] 6.1 Update storyboard/creative planning skill prompts to request Markdown plus Canvas actions instead of `neko-composite` storyboard JSON for authoring drafts.
- [x] 6.2 Add skill output declarations for `gfm-table`, `commonmark-image`, optional `resource-reference`, preferred resource token syntax, forbidden runtime handles, and preferred Canvas actions.
- [x] 6.3 Update prompt snapshots/fixtures so generated tables include plan/execution fields, prompts, resources, scenes, shots, and next actions while allowing skill-specific extra fields.
- [x] 6.4 Add tests or snapshot checks that prompts do not instruct the model to output Webview URIs, blob URLs, cache paths, system temp paths, Engine tokens, or Canvas node JSON.

## 7. Legacy Cleanup

- [x] 7.1 Remove, fail-close, or isolate old storyboard draft compiler transfer paths for new Markdown Send to Canvas requests.
- [x] 7.2 Remove `@neko/draft-runtime` as a canonical public handoff dependency; delete the package if no remaining owning implementation needs it, or document any temporary private migration owner and removal condition.
- [x] 7.3 Clean `neko-composite` storyboard authoring examples/tests that now conflict with Markdown capability authoring, while preserving validated structured content rendering tests.
- [x] 7.4 Add poison-path tests or spies proving new Markdown storyboard requests cannot return success through old compiler, `canvasStructuredContent`, or direct `canvasStoryboard` fallback.
- [x] 7.5 Update architecture/OpenSpec references that still describe the old draft-runtime/compiler path as canonical.

Legacy cleanup notes:

- `canvasStoryboard`, `canvasText`, and `canvasStructuredContent` plugin transfer kinds remain only for validated structured tool results, asset transfer, and existing command bridge paths. Markdown authoring drafts must use Canvas Markdown capability invocation.
- Remove the Canvas plugin transfer storyboard path only after all validated `StoryboardTable` / `CanvasStoryboardPayload` producers have an owning Canvas capability or domain command replacement and path-level tests prove Markdown authoring drafts cannot succeed through plugin transfer fallback.

## 8. Validation

- [x] 8.1 Run focused unit tests for the shared/Canvas Markdown capability DTO validators.
- [x] 8.2 Run Canvas capability provider tests and Canvas Webview/store tests for note/table/storyboard draft/storyboard creation.
- [x] 8.3 Run Agent Webview Markdown renderer tests and Send to Canvas bridge tests.
- [x] 8.4 Run resource/content-access focused tests proving stable refs and projection services are used instead of raw path/cache/Webview URI fallback.
- [x] 8.5 Run package compile/typecheck for affected packages: `neko-agent`, `neko-canvas`, shared contract package, and any package touched by cleanup.
- [x] 8.6 Run `pnpm check:agent-boundaries`, relevant dependency/boundary checks, and legacy debt/unused checks for removed draft-runtime paths.
- [x] 8.7 Run VS Code Webview runtime smoke with `vscode-extension-debugger` for rendering a Markdown table with images and invoking Send to Canvas.
- [x] 8.8 Run `openspec validate introduce-canvas-markdown-capabilities --strict` and record any residual validation gaps before implementation is considered complete.

Validation notes:

- `/Users/feng/Library/pnpm/.tools/pnpm/10.29.2/bin/pnpm run check:unused` was run and still reports pre-existing unused dependencies/exports unrelated to this change (`adm-zip`, `cheerio`, `@neko/content`, and webview logger exports). New Canvas Markdown presenter unused exports were removed.
