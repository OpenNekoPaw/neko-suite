## Why

Canvas authoring currently depends on an active Webview for production writes such as node creation, composite creation, markdown storyboard creation, and Agent content application. This blocks Send to Canvas, Agent tools, TUI, Electron, and other host-driven flows when no `.nkc` editor is open, and it makes UI reveal a hidden side effect of data mutation.

This change makes Canvas project facts writable from the Extension Host without requiring a visible Canvas Webview, while keeping Webview rendering and interaction as an optional projection over the same `.nkc` document state.

## What Changes

- Introduce a headless Canvas authoring service that can load, create, mutate, and save `.nkc` files through `ProjectFileStore`, the `.nkc` codec, Canvas operation planners, and shared content access.
- Route Agent Canvas tools, Send to Canvas storyboard creation, Canvas markdown production creation, and media/resource imports through the headless authoring path by default.
- Add explicit Canvas target resolution:
  - write to the active selected Canvas when one exists;
  - write to an explicit `documentUri` when provided;
  - create a new `.nkc` when no target exists;
  - reveal/open the Webview only when requested.
- Keep Webview UI responsible for rendering, selection, interactive editing, previews, keyboard actions, and inspector workflows, not as the required executor for Agent or host-originated writes.
- Preserve durable identity rules: Canvas nodes and storyboard payloads store stable refs such as `ResourceRef`, `DocumentArchiveResourceRef`, workspace-relative paths, `${VAR}/path`, asset/entity IDs, and prompt/document data; they do not store Webview URIs, cache paths, temp paths, Engine tokens, or blob URLs.
- **BREAKING** for unreleased internal behavior: remove the default success path where production Canvas writes silently depend on `CanvasEditorProvider.createNode/createComposite/updateBlock/applyAgentContent`. New production requests must hit the headless authoring service or fail with diagnostics.

## Capabilities

### New Capabilities

- `headless-canvas-authoring`: Defines host-side Canvas `.nkc` authoring, target resolution, Agent/Send to Canvas write behavior, durable resource identity, Webview synchronization, and fail-visible diagnostics when headless writing cannot proceed.

### Modified Capabilities

None. Existing project file IO and cross-domain content access requirements remain the foundation; this change consumes them from Canvas rather than changing their external behavior.

## Impact

- `packages/neko-canvas/packages/extension`
  - Add `CanvasProjectAuthoringService` and route Canvas API, Agent capability provider, storyboard import, markdown production creation, and media/resource import through it.
  - Replace `ensureCanvasEditorFor*Mutation` write gates with target resolution plus optional reveal.
  - Notify open Canvas Webviews after host-side writes instead of requiring Webviews before writes.
- `packages/neko-canvas/packages/webview`
  - Consume Host-applied operation/reload notifications and remain the interactive editor/projection surface.
  - Stop being the only production executor for Agent-originated node/composite writes.
- `packages/neko-types`
  - Add or refine shared Canvas authoring DTOs, operation planners, and `.nkc` operation application helpers where they are host-agnostic.
- Agent Canvas tools and Send to Canvas flows
  - Production storyboard creation uses `canvas.createStoryboardFromMarkdown` / scene-shot creation against `.nkc` files without requiring an already open Canvas editor.
  - Review-only markdown ingestion remains review/table behavior and must not be reported as successful production storyboard node creation.
- Tests and validation
  - Add unit and contract tests proving headless `.nkc` writes work with no active Webview.
  - Add poison tests proving legacy Webview executor paths are not used for production headless requests.
  - Add resource identity tests proving runtime handles are rejected or stripped before persistence.
