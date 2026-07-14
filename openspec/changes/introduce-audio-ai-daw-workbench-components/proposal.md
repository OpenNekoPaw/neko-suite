## Why

`neko-audio` is intended to be a lightweight AI DAW embedded in VS Code, but the current surface exposes the timeline, compact bottom mixer, left toolbar, transport bar, and basic/professional right dock without a clear set of high-frequency audio editing and AI workflow components. This makes the editor feel like a sparse timeline panel instead of a focused local AI audio workbench.

This change defines the component set needed to make common audio cleanup, editing, AI repair, review, mixing, and export flows visible and fast while keeping the product boundary smaller than a standalone openDAW-style full DAW.

## What Changes

- Add a workbench component contract for the lightweight AI DAW surface:
  - selection action bar for clip/region operations;
  - clip/track inspector in the right dock;
  - AI operation panel with prompt input, quick actions, operation queue, and result review;
  - timeline tool mode bar for select, split, trim, fade, gain, marker, and automation modes;
  - add-track/import strip for empty and active projects;
  - markers/regions navigation panel;
  - compact master/loudness strip for export readiness;
  - effects mini rack for common track/master chains;
  - AI result compare controls for A/B review before applying destructive or render-affecting changes.
- Keep the current top transport, left toolbar, timeline, bottom compact mixer, and basic/professional right dock as the host layout foundation.
- Define which components appear in basic mode and which require professional mode.
- Keep VS Code Explorer, command palette, and project file flow as the primary file navigation surface instead of introducing a standalone openDAW-style browser.
- Keep advanced DAW features such as full plugin browser, large device graph, MIDI piano roll, sends/routing matrix, and multi-window mixer outside this change.
- No durable `.nka` schema migration, Rust Engine endpoint change, Protobuf change, or new cloud/service abstraction is included.

## Capabilities

### New Capabilities

- `audio-ai-daw-workbench-components`: Defines the lightweight AI DAW component behavior, mode placement, selection/AI/mixing review flows, and VS Code integration expectations for `neko-audio`.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-audio/packages/webview`: React components, Zustand selectors/UI state, i18n strings, keyboard/focus behavior, timeline selection affordances, right dock panels, and component tests.
  - `packages/neko-audio/packages/extension`: only if existing commands need to open or focus the new panels through the current Webview message/command paths.
  - `packages/neko-ui`: only for low-semantic primitives or layout helpers that are useful across creative editors; audio domain models remain owned by `neko-audio`.
- Affected user flows:
  - create or open `.nka`;
  - import or record audio;
  - select a clip or region;
  - run common edit/cleanup/AI operations;
  - inspect clip/track/master state;
  - compare AI results;
  - export with loudness/clipping readiness visible.
- Validation focus:
  - component placement and mode gating;
  - timeline selection and action routing;
  - AI operation queue/review behavior;
  - effect/mixer/loudness state projection;
  - Real VS Code Webview functional scenarios for layout, focus, keyboard, side panel behavior, and runtime errors.
