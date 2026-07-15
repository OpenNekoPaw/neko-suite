# Reuse And Ownership Audit

Date: 2026-07-15

This audit records implementation evidence for tasks 1.1-1.5. Paths are repository-relative and describe the current working tree; implementation and tests remain the behavioral source of truth.

## 1. Canvas Board, authoring, and catalog

- `.nkc` IO stays on `ProjectFileStore`, `createDefaultProjectFormatCodecRegistry()`, and `nkcSourcePathPolicy` from `@neko/shared`. `CanvasProjectAuthoringService` is the canonical Extension Host mutation owner; Webview and Agent must not write raw Canvas JSON.
- `CanvasBoardSummary`, `CanvasBoardIndexEntry`, `summarizeCanvasBoard()`, `projectCanvasBoardSummaryForIndex()`, and `validateCanvasBoardRef()` in `packages/neko-types/src/types/canvas-creative-scope.ts` are the public Layer 0 Board vocabulary to extend. They currently lack document ref, revision, directory-scoped query, binding, and resolver result contracts.
- `CanvasProjectAuthoringService.resolveTarget()` currently resolves explicit URI/new, then active Canvas, then creates in the workspace root. Unspecified Agent routing must replace only that implicit active/root behavior with a Canvas-owned `neko/boards/` resolver; explicit `active`, `file`, and `new` callers remain explicit behaviors.
- Canvas revision is currently owned by the Custom Editor/document path, while headless authoring returns `QualityProjectRef`. The new immutable write target must carry document/Canvas/revision identity and be checked by the authoring owner, not inferred from the active editor.
- Canvas Board navigation already validates durable refs in `CanvasApp.tsx` and `canvasEditorProvider.ts`. These are reveal/navigation paths, not a safe Agent index, so Agent must consume a bounded Canvas query rather than navigation state.
- The right dock already defaults to `basic` and Professional already composes all `WebviewSubsystemRegistry.manifests`. Basic incorrectly projects the full Storyboard manifest and `createStoryboardNodeTypeDescriptors()`. The implementation reuses owning descriptors and filters Basic to core `media`, `annotation`, `group`, `text` plus existing neutral `artboard`, `script`, and `document` descriptors. It does not add a profile, schema, node union, or second renderer registry.
- Markdown review and structured Storyboard capabilities already exist in Canvas capability/authoring code. Normal Markdown delivery must use the review/document path; `canvas.createStoryboardFromMarkdown` remains explicit professional authoring only.
- Repository search found no existing `neko/boards/` resolver/caller. The directory convention is therefore a new query scope over ordinary Canvas documents, not a migration of an existing Board format.

## 2. Agent routing, delivery, and observability

- Explicit historical/external Canvas handoff is typed by `requestCanvasAuthoringHandoff` in `packages/neko-agent/packages/agent-types/src/webview-protocol.ts`, routed by `messageRoutes.ts`, and initiated by `SendToMenu.tsx`. Its Storyboard branch currently promotes unspecified table content to structured scene/shot creation; it must not be the auto-retention path.
- `TaskDeliveryBridge` replays terminal `DashboardTask` projections to a conversation-scoped Webview cursor. It does not author Canvas content. Its cursor/idempotency behavior is reusable, but Canvas delivery needs its own stable artifact/output identity and immutable target.
- `mediaTaskDeliveryHost.ts` already retains image/audio/video results under the canonical generated-output root and projects render URIs only for the current Webview. `pluginTransferBridge.ts` provides explicit cross-plugin ingest and is not the new automatic Board delivery owner.
- Runtime continuation/backfill is owned by `backfill-coordinator.ts`, `tool-result-backfill.ts`, conversation projection stores, and task runtime/projection code. Frozen Canvas targets must be captured before these asynchronous paths start and passed through typed task/run state; completion must never re-read active UI state.
- Conversation persistence exists in Agent session/runtime stores, but there is no Canvas binding contract. Binding should be a small conversation/task-to-immutable-write-target record, stored with conversation runtime/persistence and removed independently of Canvas/generated files.
- VSCode runtime facts and task projection are richer than Home/TUI Canvas integration. Home and TUI should observe typed delivery facts/diagnostics without importing VSCode or Canvas Extension internals; actual `.nkc` authoring remains host capability work.
- Ordinary assistant prose, reasoning, raw tool logs, scratch, unselected search hits, failed non-reviewable results, render URIs, cache paths, and process/runtime handles have no eligible delivery type and must remain excluded.

## 3. UI and Canvas component reuse

- Node creation UI reuses `NodeLibraryPanel`, `createNodeLibraryGroups()`, `TreeView`, shared descriptor adapters, `nodeLibraryPolicy`, and the existing Basic/Professional segmented dock. No new panel or design system is needed.
- Foundational renderers already exist: core media/text/annotation/group renderers and Storyboard-owned `ScriptNode`/`DocumentNode` renderers. Existing professional renderers remain loaded from document node types even when their creation entries are hidden in Basic.
- `media` is the canonical Canvas node for image/audio/video sources; file selection and media type inference already flow through Canvas source-add/import. Separate image/audio/video node unions would duplicate the schema.
- Markdown UI primitives and diagnostics are public through `@neko/ui/markdown`; Canvas also has `DocumentNode` and inline text editing. Reuse these instead of a specialized Basic Storyboard table.
- Keyboard/focus behavior is already centralized in `@neko/ui/keyboard`, Canvas root boundaries, and `TreeView`; node library buttons expose native focus rings and ARIA expansion state. `TreeView` already virtualizes large lists, while `InfiniteCanvas` owns off-screen/viewport behavior.
- Media preview, missing-source projection, and current-session render refs are owned by `PreviewRendererRegistry` and Canvas content access. `WebviewErrorBoundary` is reused through Canvas `ErrorBoundary`.
- Existing NodeLibrary, renderer, keyboard, preview, i18n, and layout tests are the extension points. The Basic catalog slice needs focused descriptor/group/component tests plus authoritative Extension Host acceptance; it does not need copied accessibility or virtualization implementations.

## 4. Generated output and Assets boundary

- `WORKSPACE_GENERATED_ASSET_ROOT = 'neko/generated'`, `GENERATED_ASSET_DIRS`, and `resolveWorkspaceGeneratedAssetRelativeDirectory()` in `generated-asset.ts` are the canonical durable roots for image/audio/video/storyboard/file outputs.
- `MediaTaskDeliveryHost` already derives workspace output directories from this contract and `GeneratedAssetIndex` supplies stable generated identities. Current Webview URIs are projections and must not be persisted.
- `.neko/.cache/resources`, provider scratch, render URIs, blobs, absolute paths, and temp paths are runtime/cache identities. Existing content-access and generated-asset validators already reject them as durable public identities; Board delivery must reuse those guards.
- `AssetLibrary`/`AssetRegistry` owns curated membership and explicit ingest. Canvas/Cut/Audio already consume stable `ResourceRef`/generated sources without requiring an `AssetEntity`. Board reference, professional document use, and Asset Library registration therefore remain independent relationships.
- No new media store is needed. New Board-local, root-level `generated/`, or `.neko/generated/` locations would create competing ownership and break existing recovery/index behavior.
- Cleanup is not currently a Board responsibility. Valuable generated output must remain until an explicit reference-aware/user-confirmed policy exists; conversation archive/delete may remove bindings and projections only.

## 5. Agent Evaluation selection

| Surface | Disposition | Evidence/update required |
| --- | --- | --- |
| `skill.storyboard` | update | Change exploratory/unspecified expectations from fixed production schema to flexible Markdown; preserve canonical Skill identity/fingerprint checks and add explicit structured-professional case. |
| `skill.image` / `skill.video` / `skill.audio-mixing` | reuse + update | Reuse generation quality/routing cases; add durable `neko/generated/<kind>/` identity and frozen Board delivery facts where the suite owns the output. Audio generation needs a new focused case if no owning generation scenario exists. |
| `agent-runtime.creative-media-workflow` | update | Add retained generated-output and frozen Canvas target evidence; forbid cache/render/Asset-membership fallbacks. |
| `agent-runtime.workflow-controller` | update | Reuse task continuation, persistence/recovery, queue and resume cases; add immutable Board binding, replay idempotency, switch-Canvas/restart, and stale-target facts. |
| `agent-runtime.skill-runtime` / prompt composition | reuse | Skill injection and anti-protocol-backflow remain deterministic owners; update Storyboard fingerprint after content changes. |
| Canvas Basic catalog | excluded from real Agent quality suite | Deterministic Webview/component and Extension Development Host functional tests are authoritative; Agent Evaluation may assert only exposed runtime facts. |
| Asset registration/cleanup | excluded until an Agent action owns it | Validate deterministically in generated-output/Assets tests; do not invent an Agent-owned registration path. |

Required facts: resolver source (`explicit | conversation | exact-index | created`), conversation/task/run identity, sanitized Canvas document/canvas/revision identity, delivery kind and stable artifact/output identity, generated-output ref, idempotency/replay result, and actionable diagnostics. Forbidden fallbacks: global active/recent Canvas, Canvas outside `neko/boards/`, cross-conversation implicit reuse, semantic/filename-only selection, raw `.nkc`, generic Send-to-Canvas retention, legacy storyboard compiler, specialized Storyboard node fallback, cache/render URI, and inferred Asset membership.

The canonical TUI does not load the VSCode Canvas extension or its `NekoCanvasAPI`, so Board resolver source, `.nkc` revision, file creation, and Canvas delivery facts are not observable in real TUI Evaluation. Those behaviors remain deterministic Extension/Canvas tests plus Extension Development Host functional acceptance; adding TUI-only Board flags or a second Canvas runtime is rejected. `skill.storyboard` is updated with script/document and ordered-image-sequence paraphrases plus an adjacent informational negative. Actual explicit structured Canvas authoring remains blocked in real TUI Evaluation until the owning Canvas capability is available there; current deterministic capability routing tests prove the explicit-vs-unspecified branch without claiming real Agent acceptance.

Key-free validation must cover suite discovery/schema/fingerprints and selected-case dry validation. Real cases require configured provider/model identities; repeated samples are required only for claims about quality stability. Skill edits require recomputing the Host-derived builtin fingerprint in suite and case identities rather than manually weakening identity assertions.
