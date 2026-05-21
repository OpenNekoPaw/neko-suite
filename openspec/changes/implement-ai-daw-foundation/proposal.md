## Why

`neko-audio` already has multi-track editing, renderable effects, Agent tools, and Extension-owned project execution, but it still lacks the beat-aware editing and time-varying mix control expected from an AI DAW. Automation must be contract-first because it crosses `.nka` persistence, undo/redo operations, Agent tools, Webview UI, TypeScript mix config, and Rust mixdown.

## What Changes

- Add a beat-grid foundation for `.nka` v2.2: `TempoMap`, time signature events, PPQ ticks, bars/beats formatting, and snap/grid behavior.
- Keep `bpm` as a compatibility shortcut while making `tempoMap` the source of truth when present; redirect `audio.setBpm` to update the first tempo event.
- Add track automation lanes for volume, pan, and effect parameters using tick-based `AutomationPoint` data and structured `AutomationTarget` identities.
- Move audio effect parameter metadata needed for automation validation into shared `neko-types` contracts so validator, Agent tools, Webview, and Engine-facing config do not depend on Webview-only definitions.
- Add `SetTrackAutomation` Agent execution through the existing Extension-side `AudioToolBridge`.
- Propagate automation into Engine-facing mix configs and apply it in mix stream/export rendering.
- Add AI operation visibility in the audio timeline using `EditOperation.meta.source === 'ai'` so Agent edits can be highlighted without Webview re-executing them.
- Keep P1 mixer improvements, MIDI/Piano Roll, record-arm, and FX editing outside this change except where required to avoid blocking the P0 automation foundation.

## Capabilities

### New Capabilities

- `audio-tempo-grid`: Beat-grid source of truth, `.nka` v2.2 `TempoMap`, tick/seconds/bars conversion, BPM compatibility, and snap/grid behavior.
- `audio-automation-lanes`: Persisted automation lane contract, validation, edit operations, Webview lane editing, Agent automation tool, and Engine mix application.
- `audio-ai-operation-feedback`: Timeline-visible feedback for AI-originated audio project operations.

### Modified Capabilities

- `audio-project-state-contract`: Add `.nka` v2.2 tempo/automation fields, shared parameter metadata ownership, operation routing, validation, migration, and downgrade behavior.
- `audio-mix-render-contract`: Extend `buildMixConfig` and Engine `MixdownConfig` with automation and tempo-derived seconds while keeping Engine independent from `.nka` editing.
- `audio-agent-edit-execution`: Add Extension-side `SetTrackAutomation` execution and honest validation failures.
- `audio-webview-control-protocol`: Preserve `project:sync` semantics for AI operation metadata and add beat-grid UI/edit sync expectations without overloading `audio:*` runtime messages.

## Impact

- Affected packages: `packages/neko-types`, `packages/neko-audio`, `packages/neko-engine`, and existing audio tests.
- Affected contracts: `.nka` codec/validator, `AudioProjectData`, `TrackMixOperation`, `AudioOperation`, `MixStreamConfig`/Engine mixdown config, Agent tool schemas, and Webview project sync state.
- Compatibility: `.nka v2.1` projects load by deriving a default `TempoMap` from `bpm ?? 120`; `.nka v2.2` saves `tempoMap` and backfills `bpm` for current single-tempo compatibility.
- Dependency constraints: shared audio contracts must remain free of React, Webview, VSCode, and Node-only APIs; Webview effect definitions must reuse shared parameter metadata rather than becoming the validation source.
