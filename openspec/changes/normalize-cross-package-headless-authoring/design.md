## Context

Canvas now has a headless `.nkc` authoring path, but adjacent packages still expose durable writes through active editor or Webview assumptions:

- Cut has partial `ProjectSessionService` and `TimelineToolExecutor` support, but import flows such as generated clip/storyboard/canvas draft still route through active Webview or open-editor side effects.
- Sketch saves and imports through Webview snapshots/messages. Agent image operations require an active sketch editor even when the desired result is a durable `.nks` project mutation.
- Audio already keeps Extension Host project cache as the authoritative state, but `documentUri` tools resolve only against open cached sessions and fail for unopened `.nka` files.
- Model has `ModelDocument` load/save utilities, but asset import still creates temporary projects and opens the editor; runtime scene tools correctly require an active editor when they control Engine viewport/runtime state.
- Assets and Agent transfer planning still emit old UI-bound commands such as `neko.cut.importGeneratedClip`, `neko.sketch.importAsset`, and `neko.model.importAsset`.

The common architecture gap is not "all editor behavior must be headless". The gap is narrower: host-originated durable `nk*` project mutations must not require a visible Webview, active editor panel, or Webview snapshot as the production executor.

This change is L3/L4 because it touches project file authoring, command contracts, Agent transfer behavior, shared content access, and multiple creative workflows. It should follow the Canvas headless authoring pattern while keeping domain ownership inside each package.

## Goals / Non-Goals

**Goals:**

- Make durable project mutations for `.nkv`, `.nks`, `.nka`, and `.nkm` executable from Extension Host with no active Webview.
- Keep package-owned authoring services responsible for domain data, codec use, validation, file save, and open-editor synchronization.
- Define a small shared authoring target/result contract for cross-package callers: explicit `documentUri`, active document hints, create-new policy, optional reveal, diagnostics, and written document URI.
- Route Assets dispatch and Agent/plugin transfer through canonical headless authoring commands/capabilities.
- Remove or fail-close old UI-bound default success paths inside the migrated boundary.
- Keep runtime-only operations explicit and fail-visible when no active editor/runtime exists.
- Prove path-level behavior with tests that poison old Webview routes, not only final result assertions.

**Non-Goals:**

- Do not make playback, preview, viewport, selection, keyboard focus, camera, animation playback, or stream controls headless when they are runtime/interactive operations.
- Do not centralize every package's data model in one shared authoring service.
- Do not move media decode/probe/render/model runtime work out of Rust Engine or `@neko/neko-client`.
- Do not introduce remote, multi-user, CRDT, cloud job, or distributed service architecture.
- Do not preserve old command aliases as compatibility success paths for migrated flows.

## Decisions

### Decision 1: Use package-owned authoring services, not a generic mega service

Each durable editor package owns a small authoring service:

- `CutProjectAuthoringService` for `.nkv`.
- `SketchProjectAuthoringService` for `.nks`.
- `AudioProjectAuthoringService` or an upgraded audio session gateway for `.nka`.
- `ModelProjectAuthoringService` for `.nkm`.

The services load/create projects through `ProjectFileStore` and the package codec, apply domain edits, save, return typed diagnostics/results, and notify open Webviews for the same document if needed.

Shared code is limited to DTOs and helpers that are genuinely cross-package: target resolution input/output, reveal policy, authoring result envelope, source diagnostics, and path-level test helpers.

Alternative considered: one shared `ProjectAuthoringService<TProject>` abstraction. Rejected because it would either know too much about each creative format or add indirection without reducing real local-client complexity.

### Decision 2: Classify operations before migration

Every command/capability touched by this change must be classified:

- `document-authoring`: writes durable `nk*` facts and must be headless.
- `interactive-editor`: requires selection, focused editor, viewport, keyboard state, stream state, or live Engine runtime and may remain active-editor-only.
- `projection-only`: displays previews/status and must not imply durable success.

If the same user feature has both modes, split it. For example, Model asset import into `.nkm` is document-authoring, while orbit camera and animation playback remain interactive-editor. Sketch inpaint from the active selection remains interactive-editor unless the request includes an explicit document target plus mask/source refs.

Alternative considered: force every command to work without UI. Rejected because it would either fake runtime state or move viewport semantics into file facts.

### Decision 3: Target resolution is explicit and side-effect controlled

Canonical durable authoring target resolution:

1. If `target.documentUri` is provided, load/create that package file and write it.
2. Else if `target.kind === 'active'`, use the active document of the matching package only when the package can identify one safely.
3. Else if `target.kind === 'new'` or the operation contract allows create-new, create a new project file in the workspace/project-authoring location.
4. Else return a fail-visible `missing-target` diagnostic.
5. Open/reveal a Webview only after a successful write and only when `reveal === true`.

No migrated operation may open a hidden editor as a prerequisite to mutate state, write to an arbitrary background editor, or treat UI reveal as proof that data was saved.

Alternative considered: keep "open editor then post command" wrappers. Rejected because that is the current failure mode for Canvas/Agent/TUI/Electron handoffs.

### Decision 4: Webviews become synchronized projections for host writes

When a headless authoring service writes a document and an editor for that same URI is open, the package posts a typed update/reload message or updates the provider cache, then lets the Webview re-render. If no editor is open, nothing is opened unless reveal was requested.

Webview-originated edits may continue to use existing typed operation streams where they are already authoritative through Extension Host, but saves must not depend on an unavailable Webview snapshot for host-originated writes.

Alternative considered: host writes file and then requests a Webview snapshot to reconcile. Rejected because it keeps Webview as the final production source and fails without UI.

### Decision 5: Content identity is resolved before authoring saves

All source-bearing authoring requests use shared content access, path policy, generated asset promotion, and project-file source normalization before persistence. Authoring services must persist only stable source refs, `ContentFileSourceRef`, `ContentDocumentSourceRef`, `ResourceRef`, asset/entity IDs, workspace-relative paths, `${VAR}/path`, or project-owned JSON facts.

Runtime handles such as Webview URI, blob URL, temp path, cache path, Engine token, range URL, stream id, or preview URL must return diagnostics before save.

Alternative considered: let downstream Webview import code normalize sources. Rejected because source identity and authorization belong at the Host/content boundary, not in UI projection.

### Decision 6: Agent and transfer callers target canonical authoring capabilities

Agent/plugin transfer planning and Assets dispatch should not emit old UI-bound command IDs for durable writes. They should call package authoring commands/capabilities that expose target, reveal, stable refs, and diagnostics.

The Agent remains responsible for deciding whether to call a package tool; the package remains responsible for data validation, project mutation, and source binding. Skill text should describe the package capability semantics and when an operation is interactive-only, not hide mutation through a UI shortcut.

Alternative considered: keep plugin-transfer command names and make each old command smarter. Rejected because old names encode the wrong semantics and let tests continue passing through UI-bound routes.

### Decision 7: Keep authoring core client-neutral and adapters thin

The canonical authoring implementation should be callable from VSCode Extension Host services, TUI host actions, Electron host actions, package typed APIs, and Agent tools with the same target/source/result contract. VSCode commands are one adapter over that service, not the service itself.

Client adapters may add host-specific behavior:

- VSCode adapter: command registration, `vscode.Uri` conversion, custom editor reveal, and open-Webview synchronization.
- TUI adapter: filesystem/workspace target resolution, textual diagnostics, and no Webview reveal.
- Electron adapter: native window/document reveal, desktop file picker integration, and local resource projection.
- Agent adapter: capability schemas, tool descriptions, lifecycle approval, and diagnostic projection.

The shared/package authoring core must not depend on VSCode window APIs, React, DOM, Webview panels, terminal UI components, or Electron BrowserWindow state. Host adapters convert client-specific inputs into the shared authoring target/source contract and convert results back into client UI.

Canonical command names should make the authoring boundary visible. New or migrated commands should use an authoring-oriented shape such as `neko.<domain>.authoring.<operation>` or a typed package API with the same semantics. Old names such as `neko.cut.importGeneratedClip`, `neko.sketch.importAsset`, and `neko.model.importAsset` may only remain as UI-only wrappers or fail-closed migration diagnostics; they must not be the default durable-write target for Agent/Assets transfer.

Alternative considered: make VSCode command handlers the canonical entry point and let TUI/Electron invoke equivalent commands indirectly. Rejected because it bakes VSCode UI lifecycle into non-UI clients and repeats the Canvas failure mode.

### Decision 8: Break migrated success paths instead of retaining compatibility fallback

Within the selected boundary, old production routes must be deleted or changed to fail-closed diagnostics. Tests should poison legacy Webview commands/message handlers and assert migrated requests still succeed through the package authoring service.

Migration-only or rejection tests may exercise old shapes, but they must not be default acceptance evidence for new flows.

Alternative considered: dual-run old and new paths during migration. Rejected because this project is prelaunch and dual success paths hide broken canonical behavior.

## Five-Layer Analysis

### Responsibility

- Shared contracts define target/result/diagnostic vocabulary only.
- Each package authoring service owns its project format, default document creation, domain edit planning, validation, save, and open-editor sync.
- `ProjectFileStore` owns JSON `nk*` file IO, serialization, migration, and write diagnostics.
- Shared content access owns source/ref resolution, authorization, cache projection, and Engine file registration.
- Webviews own rendering, focus, selection, viewport controls, and interactive editing projections.
- Agent/Skills/Assets own intent routing and capability selection, not package state mutation internals.

### Dependency

- Layer 0 DTOs/helpers live in shared packages and must not import VSCode, React, DOM, or feature package internals.
- Extension services may import shared contracts, project-file utilities, content access adapters, and their owning package domain code.
- Feature packages must not import other feature package internals; cross-package dispatch uses commands, typed APIs, or shared capability contracts.
- Webviews consume typed messages and Webview-safe shared subpaths only.
- TUI and Electron host adapters consume the same package authoring services through client-neutral contracts; they must not reimplement package-local file IO, path policy, or cache/source rules.

### Interface

The shared contract should stay small:

```ts
type NekoAuthoringTargetKind = 'active' | 'file' | 'new';

interface NekoAuthoringTarget {
  readonly kind?: NekoAuthoringTargetKind;
  readonly documentUri?: string;
  readonly title?: string;
  readonly reveal?: boolean;
}

interface NekoAuthoringResult<TData = unknown> {
  readonly ok: boolean;
  readonly documentUri?: string;
  readonly created?: boolean;
  readonly revealed?: boolean;
  readonly diagnostics: readonly NekoAuthoringDiagnostic[];
  readonly data?: TData;
}
```

Package services expose domain-specific methods rather than a generic mutation API. Examples:

- `cut.importGeneratedClip(request)`
- `cut.importStoryboard(request)`
- `sketch.importImageLayer(request)`
- `sketch.applyGeneratedImage(request)`
- `audio.applyProjectOperation(request)`
- `model.importAsset(request)`

Every method returns the shared result envelope plus domain-specific output such as clip IDs, layer IDs, track IDs, model source refs, or applied operation IDs.

### Extension

New packages can adopt the pattern by adding a package authoring service and mapping durable commands to it. Runtime-only tools can continue to require active editors if they return explicit diagnostics and do not pretend to mutate project files.

The pattern extends to TUI/Electron because callers pass stable target/source refs and receive diagnostics without depending on VSCode Webview state. VSCode-specific reveal/sync remains an adapter concern.

Client adapters can be added without changing package authoring internals as long as they provide the required host services: project-file read/write, content access/path policy, generated asset promotion, diagnostics projection, and optional reveal behavior.

### Testing

- Shared contract tests for target parsing, diagnostics, runtime-handle rejection, and result envelope typing.
- Package unit tests for no-active-Webview authoring with explicit `documentUri`.
- Create-new tests proving a project file is created and populated when allowed.
- Poison tests where old Webview postMessage/import commands throw or are absent.
- Save/reopen tests proving facts persist without Webview cache, active editor state, or cache paths.
- Transfer planner tests proving old UI-bound command IDs are no longer emitted for migrated flows.
- VSCode Webview runtime smoke only for reveal/synchronization behavior after host-side writes.

### Proportionality

This proposal uses one small shared contract plus package-local services because the real commonality is target/source/diagnostic behavior, not the domain mutation itself. It reuses existing `ProjectFileStore`, codecs, content access, generated asset lifecycle, and EngineClient paths instead of adding a new storage or runtime layer.

### Fail-Visible Behavior

- Missing target returns `missing-authoring-target` unless the operation explicitly allows create-new.
- Missing workspace for create-new returns `workspace-required`.
- Runtime-only commands without an active editor return `interactive-editor-required`.
- Source refs outside authorized roots return content-access diagnostics and block save.
- Runtime/cache/Webview handles in durable fields return `runtime-handle-persisted` or `cache-source-persisted`.
- Unknown format, future project version, codec failure, migration failure, and write failure use project-file diagnostics.
- Old UI-bound command/message paths in migrated flows cannot return success.

## Package Migration Plan

1. Define shared authoring target/result/diagnostic DTOs and test utilities.
2. Cut:
   - Promote `ProjectSessionService` into the canonical `.nkv` authoring service or wrap it with an authoring facade.
   - Migrate generated clip, storyboard/canvas draft, source insert, and create-new flows.
   - Keep selection/export panel/playback UI commands interactive.
3. Sketch:
   - Add `.nks` authoring service for loading, creating, importing image/PSD/layer data, applying generated images, and saving.
   - Replace host-originated active-Webview import/apply paths with service calls.
   - Keep selection-dependent inpaint/mask/context snapshot tools active-editor-only until explicit source/mask refs are supplied.
4. Audio:
   - Upgrade session gateway/provider to load `.nka` from `documentUri` when not cached, apply operations, save, and sync open panels.
   - Keep stream playback and recording UI commands runtime/editor-bound.
5. Model:
   - Add `.nkm` authoring service for asset import and durable project updates.
   - Keep Engine scene query/mutate/playback tools active-editor/runtime-bound unless a durable file mutation contract is explicitly added.
6. Assets:
   - Dispatch imports to canonical package authoring commands/capabilities.
7. Agent/Skills:
   - Update transfer planner, command bridge, and capability text to use canonical commands and expose diagnostics.
8. VSCode/TUI/Electron adapters:
   - Register or update adapter-specific command/action entry points that call the same package authoring services.
   - Keep reveal/sync UI behavior in the adapter after successful writes.
9. Puppet/Story:
   - Confirm existing headless/document paths; add fail-visible diagnostics where runtime-only active editor assumptions remain.
10. Remove or fail-close old default success paths and add path-level guard tests.

Rollback strategy is fail-closed: if a migrated headless authoring path is incomplete, the command returns a diagnostic. It must not fall back to opening a Webview and reporting success through the old route.

## Risks / Trade-offs

- [Risk] Package services may duplicate target resolution details.  
  Mitigation: keep shared target/result helpers small and package-agnostic; add contract tests for all packages.

- [Risk] Open Webview state may diverge from host-side writes.  
  Mitigation: sync by document URI after save through provider cache updates or typed reload messages; validate with runtime smoke for reveal/sync only.

- [Risk] Sketch host-side image edits may need raster/layer serialization logic currently only present in Webview.  
  Mitigation: split operations into headless-importable durable layer/file facts first; leave pixel-selection operations interactive until explicit source/mask contracts exist.

- [Risk] Model scene tools mix durable `.nkm` facts and Engine runtime state.  
  Mitigation: classify import/project updates separately from runtime scene controls and keep active-editor diagnostics for runtime tools.

- [Risk] Old command names remain in transfer tests and hide migrated path failures.  
  Mitigation: update planner tests, poison old command IDs, and run legacy-debt checks for old route names.

- [Risk] No-active-UI workflows might create files in surprising locations.  
  Mitigation: require explicit `documentUri` or `kind: 'new'` with workspace/project placement policy; return diagnostics when placement is ambiguous.

## Open Questions

- Should each package expose a public typed extension API in addition to VSCode commands, or are commands plus Agent capability providers enough for the first implementation?
- What should be the default create-new folder for Cut/Sketch/Audio/Model when a caller requests `kind: 'new'` without a path: workspace root, package subfolder, or project setting?
- Should Sketch host-side raster/layer mutation introduce a package-level raster document reducer now, or should phase one only cover source/layer imports and AI result insertion as files?
- Which old command IDs should be deleted immediately versus retained as UI-only wrappers or fail-closed migration diagnostics?
- Should canonical authoring commands be registered in every client adapter immediately, or should TUI/Electron first consume typed package APIs while VSCode keeps command wrappers?

## Active-Editor Audit Notes

These package-local dependencies remain intentionally interactive-editor, not durable authoring:

- Puppet face parameter writes
  - Owner: `neko-puppet`.
  - Reason: parameters are applied to the active puppet runtime/document and synchronized to the renderer Webview; there is no selected `.nkp` file target or stable parameter-edit authoring contract for background writes in this change.
  - Contract: `NekoPuppetAPI.isActive()` gates parameter writes; missing active editor returns `interactive-editor-required` diagnostics from the Agent capability provider, and `setFaceParams` fails visibly instead of no-op.
  - Coverage: `packages/neko-puppet/packages/extension/src/__tests__/agentCapabilityProvider.test.ts`.
- Story inline diff application and preview navigation
  - Owner: `neko-story`.
  - Reason: applying a suggested text edit is confirmation-gated UI behavior that opens/highlights a range and waits for user acceptance. Story index/query/scene planning are headless through `@neko-story/headless`.
  - Contract: provider-level requirements do not require `activeEditor`; only `story_apply_suggestion` declares `{ vscode: true, activeEditor: true }`.
  - Coverage: `packages/neko-story/packages/extension/src/__tests__/protocol.test.ts` and `packages/neko-story/packages/headless/src/__tests__/agentHeadlessCapabilityProvider.test.ts`.
