## Why

Canvas already owns semantic ordering through containers, nodes, connections, and `CanvasPlaybackPlan`, but the current preview path still points toward a separate preview surface and does not give Canvas, Cut, and Agent a single route handoff contract. This change implements the accepted ADR by merging Canvas editing and playback preview into one Canvas Editor Webview, making the playback route visible and actionable without turning Canvas into a Cut timeline.

## What Changes

- Add a Canvas Editor Webview `PlaybackWorkspace` that contains:
  - a hideable Canvas viewport pane,
  - a hideable playback stage,
  - a hideable playback route strip,
  - a `PlaybackSession` for route id, current unit, playhead, focus, and playback state.
- Replace the separate Canvas preview Webview path with a same-Webview reveal/focus flow.
- Keep `CanvasPlaybackPlan` as the only playback order projection for Canvas preview, Agent summaries, and Cut draft creation.
- Introduce a `CanvasCutDraftPayload` contract and projection path from selected Canvas route to Cut-importable draft.
- Add Agent-facing capability semantics for:
  - reading Canvas playback plans/routes,
  - revealing the Canvas playback workspace,
  - creating a Cut draft from a selected route,
  - confirming route reorder or Cut import actions.
- Preserve Cut ownership of `.nkv`, timeline, clips, effects, subtitles, audio, export, and playback after import.
- Remove or poison the legacy separate Canvas Preview Webview as the default runtime path once the same-Webview workspace is implemented.

### Non-Goals

- Implement a Cut-style timeline inside Canvas.
- Reuse Cut Webview timeline components or Cut internal store in Canvas.
- Make Agent a video player or owner of playhead/video stream lifecycle.
- Add bidirectional live synchronization between `.nkc` order and `.nkv` timeline edits.
- Redesign Cut export or deliverable management.
- Move every playback UI primitive into `@neko/ui` in the first implementation; shared primitives may be extracted only after owning-package behavior stabilizes.

### Compatibility

This is a prelaunch internal behavior migration. Existing `.nkc` playback metadata remains the source for playback entry/order. Existing separate Canvas Preview commands may be replaced by same-Webview reveal commands or retained only as fail-visible migration shims during the change. Existing `.nkv` projects are not migrated.

## Capabilities

### New Capabilities

- `canvas-playback-workspace`: Defines the same-Webview Canvas playback workspace, route strip, playback session, focus/keyboard behavior, and media lifecycle.
- `canvas-cut-draft-handoff`: Defines the Canvas route to Cut draft snapshot contract, source mapping, stale-plan handling, and minimal Cut-to-Canvas sync behavior.
- `agent-playback-surface-dispatch`: Defines how Agent reads, displays, confirms, and dispatches playback route actions without owning playback or timeline runtime.

### Modified Capabilities

- None.

## Impact

- Shared contracts:
  - `packages/neko-types/src/types/canvas-playback.ts`
  - new or updated `CanvasCutDraftPayload` types under `packages/neko-types/src/types/`
  - existing `CanvasTimelineSyncPayload` utilities and guards
- Canvas extension and Webview:
  - `CanvasEditorProvider`
  - current `NarrativePreviewBridge` / preview runtime migration path
  - Canvas toolbar action and Webview message protocol
  - Canvas store/playback session state and route highlighting
  - `packages/neko-canvas/ARCHITECTURE.md`
- Cut extension and Webview:
  - import command contract, likely replacing or extending `neko.cut.importStoryboard`
  - Cut timeline import adapter and source mapping metadata
- Agent:
  - Canvas and Cut capability providers
  - Agent message/action projection for playback route cards
  - approval/confirmation metadata for reorder and import actions
- Validation:
  - shared type/contract tests,
  - Canvas Webview component/store tests,
  - Canvas Extension message tests,
  - Cut import contract tests,
  - Agent capability tests,
  - VS Code Extension Development Host runtime smoke through `vscode-extension-debugger`.
