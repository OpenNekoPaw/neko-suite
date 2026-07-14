## Context

Canvas production authoring is currently tied to `CanvasEditorProvider` and its active Webview panel. `canvas.createNode`, `canvas.createComposite`, `canvas.updateBlock`, `canvas.applyAgentContent`, storyboard import, and markdown storyboard creation all eventually require a ready `activeWebviewPanel`. When no `.nkc` editor is open, the extension opens or creates a Canvas editor as a side effect before mutating data.

That coupling makes Canvas different from the intended `nk*` project model. `.nkc` facts are JSON project data and already have a shared codec through `ProjectFileStore`. Agent, Send to Canvas, TUI, Electron, and background creation flows need to write those facts without relying on a visible editor. Webview should remain the interactive projection and editor, not the only production mutation executor.

Relevant constraints:

- `.nkc` project facts must be read and written through project-file IO and Canvas codecs, not Engine or cache.
- Durable Canvas facts must not persist Webview URIs, blob URLs, cache paths, temp paths, Engine tokens, or preview handles.
- Binary/media/document resource materialization must go through shared content access before runtime projection.
- VSCode Webview sandbox remains strict: Webview cannot write files or call VSCode APIs directly.
- This is prelaunch cleanup. The change may break unreleased internal call paths, but old success paths must be removed or made fail-visible instead of acting as fallback.

## Goals / Non-Goals

**Goals:**

- Let Canvas production authoring create and mutate `.nkc` files with no active Canvas Webview.
- Make target selection explicit: active Canvas, explicit document URI, or newly created Canvas file.
- Route Agent tools, Send to Canvas, storyboard markdown creation, media/resource imports, and production composite creation through one host-side authoring path.
- Keep review-only markdown table ingestion distinct from production scene/shot node creation.
- Notify open Canvas Webviews after host-side writes without requiring Webviews before writes.
- Preserve stable resource identity and reject runtime/cache handles before persistence.
- Provide path-level tests proving the headless service is used and the legacy Webview executor is not used for production headless requests.

**Non-Goals:**

- Rewriting the Canvas Webview UI, inspector layout, selection model, keyboard handling, or rendering engine.
- Moving media decode, preview generation, thumbnails, or document entry extraction into Canvas project-file code.
- Introducing CRDT/multi-user collaboration or remote service architecture.
- Making every interactive Canvas command headless in the first phase. Selection-dependent and viewport-dependent actions may remain Webview-only if they are explicitly marked interactive.
- Migrating valuable existing user `.nkc` data outside this scoped authoring path.

## Decisions

### Decision 1: Extension Host owns production Canvas authoring

Introduce `CanvasProjectAuthoringService` in `neko-canvas/packages/extension`. It loads or creates the target `.nkc`, applies Canvas authoring operations, saves through `ProjectFileStore`, and emits diagnostics/results. Agent and command APIs call this service by default.

Alternative considered: keep opening Webview and invoking `nodes.createComposite`. Rejected because it preserves UI as hidden mutation infrastructure, keeps Send to Canvas blocked by lifecycle timing, and cannot support TUI/Electron/headless clients consistently.

### Decision 2: Shared pure planners build Canvas operations

Move host-agnostic planning into `@neko/shared` where it does not need VSCode, React, DOM, or feature package imports. This includes:

- request validation for node/composite/storyboard creation;
- scene/shot composite planning from storyboard markdown or structured payloads;
- stable ID/layout generation;
- Canvas operation batches that mutate `CanvasData`;
- durable data normalization for prompt blocks and resource refs.

The extension service owns file IO and content access; the shared planner owns pure data construction.

Alternative considered: duplicate planner logic in the extension while leaving Webview logic in place. Rejected because it creates two sources of truth for node shape, layout, and storyboard creation.

### Decision 3: Target resolution is explicit and side-effect controlled

Define a host-side target resolver:

1. If `target.documentUri` is provided, write that file.
2. Else if there is an active selected Canvas document, write that file.
3. Else create a new `.nkc` file in the workspace with a deterministic title.
4. Only open/reveal the Canvas Webview when `reveal: true` is requested.

The resolver must not reveal arbitrary background Canvas editors. It must not write to a hidden background Canvas just because one exists.

Alternative considered: keep current "open/create editor before write" behavior. Rejected because it conflates target selection, file creation, UI reveal, and mutation execution.

### Decision 4: Webview becomes a synchronized projection

When a Canvas Webview is open for a mutated document, the host service sends an operation-applied or document-reload message. The Webview updates its store from the host result and remains interactive.

If no Webview is open, no Webview is created unless `reveal: true`.

Webview-originated edits continue to send typed operations to the extension host. The host applies them to its document/session state and saves via project-file IO. This gradually moves Canvas toward the Audio-style "Extension cache is authoritative" model while keeping Webview editing responsive.

Alternative considered: host writes file then waits for Webview snapshot to reconcile. Rejected because it keeps Webview as the final source and is fragile when no Webview exists.

### Decision 5: Resource identity validation happens before `.nkc` save

Canvas authoring accepts stable references only:

- `ResourceRef` / resource variant refs;
- `DocumentArchiveResourceRef` / content document source refs plus locator or entry;
- workspace-relative paths;
- `${VAR}/path`;
- asset/entity IDs;
- prompt/document facts and provenance.

Runtime projections are allowed only in transient response/display DTOs. If an operation attempts to persist a Webview URI, blob URL, cache path, temp path, Engine token, stream id, or preview URL, the service returns a diagnostic and does not save the invalid project facts.

Alternative considered: let Webview materialization convert runtime paths to display data during createComposite. Rejected because materialization belongs to content-access projection, not durable Canvas identity.

### Decision 6: Review ingestion and production creation remain separate

`canvas.ingestMarkdown` remains review-first and may create notes/tables/review nodes. Production storyboard creation uses `canvas.createStoryboardFromMarkdown` with `mode=create-nodes` and lifecycle approval. If production creation is blocked, the agent must report diagnostics and must not claim success through review/table fallback.

Alternative considered: make `canvas.ingestMarkdown` auto-upgrade storyboard tables into production nodes. Rejected because it hides approval and target semantics behind a generic markdown operation.

### Decision 7: Break old default success paths inside this boundary

For production headless requests, `CanvasEditorProvider.createNode/createComposite/updateBlock/applyAgentContent` must not be the default executor. Tests should poison those methods and assert headless creation still succeeds. Interactive commands may still use Webview methods if their contract requires selection, viewport state, or immediate UI manipulation.

Alternative considered: support both old and new production paths. Rejected because fallback would hide broken headless behavior and recreate the current bug pattern.

## Five-Layer Analysis

### Responsibility

- `CanvasProjectAuthoringService` owns `.nkc` target resolution, load/create, operation application, save, diagnostics, and open-Webview notification.
- `@neko/shared` owns pure Canvas authoring DTOs, operation planning, validation, and host-agnostic reducers.
- `ContentAccessService` owns source/ref resolution and runtime projection.
- `CanvasEditorProvider` owns Webview lifecycle and interactive projection, not production headless writes.
- Agent tools own request construction and diagnostics reporting, not path fixing or cache inspection.

### Dependency

- Layer 0 shared planners must not import VSCode, DOM, React, or `neko-canvas` internals.
- Extension service may import `@neko/shared` and `@neko/shared/vscode/extension`.
- Webview consumes typed messages and shared DTOs through Webview-safe subpaths only.
- Feature packages do not import each other's internals.

### Interface

Minimal service surface:

```ts
interface CanvasAuthoringTarget {
  readonly kind?: 'active' | 'file' | 'new';
  readonly documentUri?: string;
  readonly title?: string;
  readonly reveal?: boolean;
}

interface CanvasProjectAuthoringService {
  resolveTarget(target?: CanvasAuthoringTarget): Promise<ResolvedCanvasAuthoringTarget>;
  applyOperations(request: CanvasApplyOperationsRequest): Promise<CanvasAuthoringResult>;
  createComposite(request: CanvasCreateCompositeAuthoringRequest): Promise<CanvasCreateCompositeResult>;
  createStoryboardFromMarkdown(request: CanvasCreateStoryboardFromMarkdownAuthoringRequest): Promise<CanvasMarkdownCapabilityResult>;
}
```

Inputs and outputs must use typed diagnostics and stable refs. Runtime projections are response-only and cannot become saved source identity.

### Extension

The first phase covers production node/composite/storyboard writes, block updates, Agent content application, review ingestion, and media/resource imports. The same service shape can later support route creation, batch prompt updates, and project-level metadata updates without adding new Webview-only command paths.

Interactive-only actions must declare why they need Webview state. If the same operation can be expressed as document facts, it should move to the authoring service.

### Testing

- Pure planner tests in `@neko/shared`.
- Extension unit tests for target resolution, file create/load/save, diagnostics, and open-Webview notification.
- Poison tests where Webview executor methods throw and headless production requests still succeed.
- Runtime handle rejection tests.
- Existing Canvas markdown/storyboard tests updated to assert production creation hits the headless service.
- A real VS Code Webview functional scenario only for UI synchronization/reveal behavior, not as the sole evidence for headless project writes.

### Proportionality

This introduces one domain service because Canvas now has multiple non-Webview callers: Agent, Send to Canvas, commands, TUI, and Electron. It reuses existing project-file IO, content access, codecs, and diagnostics instead of creating a new storage abstraction. It does not add remote collaboration, background daemon infrastructure, or cloud-style service layers.

### Fail-Visible Behavior

- Missing workspace for a new file returns a diagnostic/error; it does not silently no-op.
- Invalid target URI returns a diagnostic; it does not write to an arbitrary active editor.
- Missing approval for production storyboard creation remains blocked.
- Runtime/cache handles in durable fields block save.
- Unknown node type, preset, block field, or storyboard profile returns diagnostics or throws in tests.
- If legacy Webview executor is hit for a production headless request, tests must fail.

## Risks / Trade-offs

- [Risk] Host and Webview state can diverge during the transition.  
  Mitigation: introduce document revision values, operation-applied notifications, and reload messages for open panels; tests cover open-Webview synchronization.

- [Risk] Composite creation currently relies on Webview materialization and layout details.  
  Mitigation: move deterministic layout and durable data planning into shared planners; keep only display projection in Webview.

- [Risk] Some operations truly require selection or viewport state.  
  Mitigation: classify operations as `document-authoring` or `interactive-editor`; only document-authoring paths must be headless.

- [Risk] Existing tests may pass through old fallback paths.  
  Mitigation: add poisoned legacy path tests and remove/default-disable fallback success paths in the scoped boundary.

- [Risk] Resource preview fields may accidentally be persisted.  
  Mitigation: add validation before save and fixture tests that scan `.nkc` output for Webview URI, cache path, temp path, and Engine token patterns.

## Migration Plan

1. Define shared Canvas authoring DTOs, target DTOs, operation result envelopes, and diagnostics.
2. Add pure planners/reducers for node, composite, storyboard markdown, and basic block updates.
3. Add `CanvasProjectAuthoringService` using `ProjectFileStore`, `.nkc` codec, source policy, and shared content access.
4. Route Canvas API, Agent capability provider, storyboard import, markdown production creation, and media/resource import through the service.
5. Add Webview synchronization messages for already-open documents.
6. Remove or fail-close default production Webview executor fallback paths.
7. Update tests to assert canonical headless path usage and legacy path non-participation.
8. Run targeted Canvas/shared tests and compile; run VSCode Webview smoke only for reveal/sync behavior.

Rollback strategy is scoped: if the new headless path fails in development, production requests should return diagnostics instead of falling back to Webview execution. Interactive Webview editing can remain available because it is a separate contract.

## Open Questions

- Should the first implementation make `CanvasEditorProvider` consume the same host session for all user edits immediately, or should it first synchronize by operation/reload notifications while the existing Webview store remains local?
- Which Canvas operations beyond scene/shot/storyboard production should be classified as phase-one document-authoring after media attach, `updateBlock`, and markdown note/table creation: route creation, route reorder, or project-level metadata updates?
- Should new headless-created `.nkc` files default to workspace root or a `canvas/` subdirectory when no active target exists?
