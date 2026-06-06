## Context

`neko-audio` has a solid workstation base: `.nka` project state, typed `EditOperation` dispatch, Extension-owned Agent edit execution, TypeScript `buildMixConfig`, and Rust Engine mixdown. The remaining AI DAW gap is not full DAW parity; it is the lack of a shared beat-time contract and time-varying mix parameters that AI tools and users can both inspect and edit.

Five-layer analysis:

- Responsibilities: `neko-types` owns serializable contracts, codecs, validators, operations, tempo math, and shared audio effect parameter metadata; `neko-audio` owns Webview UI/store and Extension Agent bridges; `neko-engine` owns render-time automation application.
- Dependencies: Webview and Extension depend on shared contracts; Engine receives render configs, not `.nka` edit operations; shared contracts do not import React, VSCode, Webview, or Node-only APIs.
- Interfaces: `.nka v2.2` adds `tempoMap` and track automation, `audio.setBpm` remains compatible, `track.mix.setAutomation` becomes the undoable edit operation, and `SetTrackAutomation` becomes the Agent tool.
- Extension: automation targets are structured identities and effect ranges are derived from shared parameter metadata, so adding new automatable parameters does not require changing project-file shape.
- Tests: codec/validator, tempo conversion, operation apply/invert, Webview store, Agent bridge, mix config builder, and Engine mixdown all need focused tests because automation crosses every layer.

Architecture questions before implementation:

- Does this match the existing architecture? Yes. It extends the existing `.nka`/operation/mix-config pipeline instead of introducing Webview-only state or Engine-side project mutation.
- How does it reduce coupling? Shared contracts own tempo math and effect parameter metadata, Agent tools execute through Extension-owned sessions, and Engine consumes render configs rather than `.nka` operations.
- Is it extensible and testable? Yes. `TempoMap`, `AutomationTarget`, and shared parameter definitions are small typed contracts with pure conversion/validation functions and deterministic operation tests.

## Goals / Non-Goals

**Goals:**

- Add `.nka v2.2` beat-grid state with deterministic tick/seconds/bars conversion.
- Keep current BPM UI and `audio.setBpm` semantics working while making `tempoMap` the v2.2 source of truth.
- Add persisted automation lanes for track volume, track pan, and effect parameters.
- Ensure automation target validation uses shared `neko-types` parameter metadata, not Webview-only definitions.
- Expose automation through undoable Webview edits, Extension-side Agent tools, and Engine mix stream/export rendering.
- Highlight AI-originated audio project operations in the Webview without reapplying project mutations.

**Non-Goals:**

- MIDI track and Piano Roll editing.
- Full DAW routing, bus/send graphs, VST/AU/LV2 support, SMPTE sync, punch in/out, or take comping.
- P1 mixer polish such as vertical faders, real-time meters, master strip UI, record-arm UI, and clickable FX slots, except for any small integration needed to avoid blocking automation.
- Multi-tempo editing UI beyond preserving the contract and converting against `TempoMap`.

## Decisions

### Use tick-based TempoMap as the time source of truth

Automation points use PPQ ticks, not seconds. `tempoMap` contains serialized `ppq`, tempo events, and time signature events. `ticksToSeconds`, `secondsToTicks`, `ticksToBarBeat`, and `barBeatToTicks` are pure shared functions.

Rationale: AI, UI, validator, and Engine need a stable musical coordinate system. Seconds-only automation would force a migration when MIDI, time-signature changes, or tempo changes arrive.

Alternatives considered:

- Store seconds only: simpler initially, but breaks musical editing and later tempo changes.
- Store both ticks and seconds: easier debugging, but creates two sources of truth and drift.

### Keep `audio.setBpm` but redirect it to TempoMap

In v2.2, `audio.setBpm` updates `tempoMap.tempoEvents[0].bpm`. The legacy `bpm` field is retained as a compatibility shortcut and codec output backfill.

Rationale: current UI/store/Agent paths remain simple for the common single-tempo case, while the project file gains a complete tempo contract.

Alternatives considered:

- Introduce only `audio.tempoMap.update`: more complete, but unnecessary complexity for the first implementation and common single-tempo projects.

### Persist automation targets as identities only

`AutomationTarget` stores `kind`, plus `effectId` and `param` for effect parameters. It does not store `valueRange`.

Rationale: ranges are contract metadata. Persisting ranges in project files would allow stale or contradictory validation data.

Alternatives considered:

- Store `valueRange` on each lane: self-contained but unsafe when effect definitions evolve.
- Store raw string targets: compact but hard to validate and easy for Agent tools to misconstruct.

### Move audio effect parameter metadata to shared contracts

The minimal metadata needed for automation validation belongs in `neko-types`, for example parameter key, value kind, numeric min/max/step/unit, and automatable flag. Webview effect definitions can reuse this registry for UI display.

Rationale: validators, Agent tools, Webview, and Engine-facing config cannot depend on Webview-only modules.

Alternatives considered:

- Keep parameter definitions in Webview: violates dependency direction and blocks shared validation.
- Duplicate ranges in Agent and validator: creates drift.

### Engine receives render config, not `.nka` edits

`buildMixConfig` resolves automation to Engine-facing mix config data. Engine mixdown applies automation during render and stream playback but does not load, migrate, or edit `.nka`.

Rationale: this follows the existing separation where Rust is render authority and TypeScript owns `.nka` project orchestration.

Alternatives considered:

- Send `EditOperation` to Engine: couples Engine to project editing and undo semantics.
- Let Webview build automation render config: duplicates Extension-owned path resolution and mix construction.

### AI operation feedback uses operation metadata

AI-originated operations are identified by `EditOperation.meta.source === 'ai'` after `project:sync`. Webview highlights affected tracks/clips/effects without reapplying the operation.

Rationale: the existing operation metadata already records source, and Webview sync is a state replacement path.

Alternatives considered:

- Add separate Agent UI commands: creates a second event stream and can desynchronize from project state.

## Risks / Trade-offs

- Tempo math bugs can shift automation timing → Keep conversion functions pure, heavily tested, and shared by Agent/validator/UI paths.
- `audio.setBpm` redirection can surprise future multi-tempo editing → Document that it only edits the first tempo event and add `audio.tempoMap.update` later.
- Shared parameter registry may diverge from Engine-supported params → Treat `neko-types` as the source of truth for serializable metadata and add tests mapping renderable effect definitions.
- Automation hot-update can be expensive during playback → First implementation can rebuild full mix config, matching existing hot-update direction; optimize later only if profiling shows a bottleneck.
- AI highlights can become noisy → Use time-limited badges/highlights and keep undo behavior unchanged.

## Migration Plan

1. Introduce shared tempo and effect parameter contracts without changing UI behavior.
2. Add `.nka v2.2` load/save support: v2.1 data derives a default `TempoMap` from `bpm ?? 120`; v2.2 save writes `tempoMap` and backfills `bpm`.
3. Redirect `audio.setBpm` apply/invert and Webview display to `tempoMap` when present.
4. Add automation contract, operation, codec validation, and Webview store CRUD.
5. Add `SetTrackAutomation` Agent execution through `AudioToolBridge`.
6. Extend mix config and Engine mixdown/stream application.
7. Add Webview automation lanes and AI operation feedback.

Rollback strategy: if automation rendering fails, `.nka` automation fields can remain persisted but disabled in mix config behind a feature flag while tempo-grid and operation contracts continue to load.

## Open Questions

- Which effect parameters should be marked automatable in the first pass: all numeric renderable parameters, or a curated subset?
- Should automation interpolation happen sample-accurately in Engine from the start, or per render block with documented smoothing?
