## 1. Shared Tempo and Parameter Contracts

- [x] 1.1 Add `TempoMap`, `TempoEvent`, `TimeSignatureEvent`, `BarBeatPosition`, and PPQ constants to `packages/neko-types`.
- [x] 1.2 Implement and export pure `ticksToSeconds`, `secondsToTicks`, `ticksToBarBeat`, and `barBeatToTicks` helpers with tests for 4/4, 6/8, 3/2, tempo changes, and nearest-tick rounding.
- [x] 1.3 Add shared audio effect parameter metadata for renderable effect parameters, including numeric ranges and automatable flags, without importing Webview modules.
- [x] 1.4 Refactor Webview audio effect definitions to reuse or validate against the shared parameter metadata.

## 2. `.nka` v2.2 State and Operations

- [x] 2.1 Extend `AudioProjectData` with `tempoMap` and extend `AudioTrackMixState` with `automation`.
- [x] 2.2 Update `.nka` codec and validator for v2.2 tempo/automation fields, including v2.1-to-v2.2 tempo derivation and v2.2 save backfill of `bpm`.
- [x] 2.3 Redirect `audio.setBpm` apply/invert to update `tempoMap.tempoEvents[0].bpm` when `tempoMap` is present, with tests.
- [x] 2.4 Add `audio.setMasterVolume` operation apply/invert/store support before building the Master strip UI.
- [x] 2.5 Add `track.mix.setAutomation` operation apply/invert validation and tests for add/edit/remove lane collections.

## 3. Webview Beat Grid

- [x] 3.1 Update `audioProjectStore` to read project BPM from `tempoMap` when present and dispatch compatible BPM operations.
- [x] 3.2 Add snap/grid state and helpers that snap timeline interactions in tick space and commit seconds back to existing element fields.
- [x] 3.3 Extend `TimelineRuler` and `TransportBar` to display bars/beats and time signature controls from `TempoMap`.
- [x] 3.4 Add focused Webview tests for BPM compatibility, bars/beats formatting, and snap-to-beat clip movement.

## 4. Webview Automation Editing

- [x] 4.1 Add automation CRUD methods to `audioProjectStore` that dispatch `track.mix.setAutomation` and synchronize with Extension.
- [x] 4.2 Add TrackHeader automation expand/collapse control and per-track AutomationLane components.
- [x] 4.3 Implement point creation, drag/edit, delete, enable/disable, and curve selection for track volume and pan lanes.
- [x] 4.4 Add effect-parameter lane selection using shared parameter metadata and reject unsupported parameters in UI.
- [x] 4.5 Add tests for automation UI/store behavior, undo/redo, and project sync replacement.

## 5. Agent Automation Execution

- [x] 5.1 Add `SetTrackAutomation` to shared audio tool names and `NekoAudioCapabilityProvider` schema using tick-based points and structured targets.
- [x] 5.2 Implement `AudioToolBridge` handling for `SetTrackAutomation` through Extension-owned project sessions.
- [x] 5.3 Validate track IDs, effect IDs, parameter metadata, point ordering, tick values, and value ranges before applying operations.
- [x] 5.4 Return honest failure results for invalid automation requests and sync successful AI operations to the targeted Webview.
- [x] 5.5 Add bridge tests for success, missing project, missing track, missing effect, unsupported parameter, and out-of-range values.

## 6. Mix Config and Engine Automation Rendering

- [x] 6.1 Extend TypeScript `MixStreamConfig`/track config and `buildMixConfig` to include validated enabled automation lanes.
- [x] 6.2 Extend Rust Engine mixdown config types to deserialize automation data without depending on `.nka` edit operations.
- [x] 6.3 Implement deterministic automation evaluation for track volume and pan in mix stream/export paths.
- [x] 6.4 Implement supported effect-parameter automation evaluation or explicitly reject unsupported effect automation with warnings.
- [x] 6.5 Add TypeScript and Rust tests proving stream/export semantics agree for representative automation curves.

## 7. AI Operation Feedback

- [x] 7.1 Add Webview state for transient AI operation highlights keyed by operation ID and affected entity IDs.
- [x] 7.2 Derive affected tracks/clips/effects from AI-originated operations received through `project:sync`.
- [x] 7.3 Render AI action badges/highlights in TrackHeader, AudioClip, and relevant effect UI without reapplying operations.
- [x] 7.4 Preserve undo/redo behavior for AI operations recorded from sync and add tests for no re-dispatch loops.

## 8. Validation and Documentation

- [x] 8.1 Update audio README or architecture references for `.nka v2.2`, TempoMap, and automation editing behavior.
- [x] 8.2 Run targeted TypeScript tests for `neko-types` audio codec/operations and `neko-audio` Webview/Extension suites.
- [x] 8.3 Run targeted Rust tests for Engine audio mixdown automation.
- [x] 8.4 Run `pnpm check` or the smallest available repository-level type check covering changed TypeScript packages.
