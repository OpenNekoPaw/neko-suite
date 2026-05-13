## Context

`neko-audio` currently spans Webview UI, VSCode Extension orchestration, shared TypeScript contracts, and Rust Engine DSP. The existing implementation has useful pieces but no stable foundation for DAW-like growth:

- Track mix fields such as volume, pan, solo, and effect chain are initialized from `.nka` data but then mutated as local Webview `trackUIState`, so changes are not reliably persisted, undoable, or synced to the Extension cache.
- Single-file effect operations call `audioService.transcode(..., { effects })`, but the Rust request/domain options do not carry effects, so the Engine silently ignores them.
- Effect type names drift between TS, Agent schemas, presets, and Rust DSP factory aliases.
- Webview currently builds and sends mix configs for project playback, even though path resolution and project save authority live in the Extension.
- Agent project-edit tools post messages to Webview and return success before the edit is actually applied.
- `.nka` version handling is inconsistent and unknown future versions have no explicit read-only/downgrade behavior.

The change follows the architecture decision in `docs/architecture/adr-audio-workstation-evolution.md`: Extension owns project metadata and "what to render"; Engine owns binary audio processing and "how to render"; Webview renders state and sends user intents.

## Goals / Non-Goals

**Goals:**

- Establish `.nka` project data as the persisted source of truth for track mix state.
- Make track mix edits go through typed `EditOperation` apply/invert paths and sync to the Extension cache.
- Define canonical hyphenated audio effect types and explicit planned-only handling.
- Enable transcode effects and trim in Rust without coupling domain options to DSP types.
- Define `MixdownConfig`/`MixStreamConfig` as the Engine render instruction built from project metadata plus path-resolution context.
- Ensure Webview user actions use a typed `audio:*` control protocol while WebSocket audio frames remain direct Engine-to-Webview data.
- Execute Agent project edits in Extension through an injectable project session gateway and notify Webview with `project:sync`.
- Clarify `.nka` version compatibility, future-version read-only behavior, and destructive downgrade schema stripping.

**Non-Goals:**

- Do not implement full P1/P2 DAW features such as send/return buses, automation rendering, plugin hosting, MIDI, instruments, or VST/AU/CLAP loading.
- Do not implement spectral noise reduction, pitch shifting, time stretching, or stem separation.
- Do not make Webview call VSCode/Node APIs or perform path resolution for Engine-readable file paths.
- Do not make Rust `engine-kernel` parse, edit, migrate, or save `.nka` project documents.
- Do not make Agent edits depend on Webview acknowledgement.
- Do not model project state/edit notifications (`project:init`, `project:sync`, `operationApplied`, `project:importAudio`, `project:dropImportAudio`) as `audio:*` runtime controls.

## Decisions

### Decision 1: Extension is the project metadata source of truth

The Extension maintains the authoritative `.nka` `AudioProjectData` cache for project documents. Webview may optimistically apply user edits for responsiveness, but the Extension cache is the save/revert source and the source for playback/export config construction.

Rationale:

- Extension has access to VSCode document lifecycle, dirty events, workspace path settings, and project file locations.
- Engine should not learn `.nka` editing semantics.
- Webview cannot safely resolve all file paths or access VSCode APIs.

Alternative considered: keep Webview as the mix config builder and source of truth. Rejected because it preserves path-resolution drift and save/revert inconsistency.

### Decision 2: Track mix state becomes persisted project data driven by operations

`trackUIState` is split into persisted mix state and local view state. Volume, pan, solo, and effect chains move into `AudioProjectData.trackMix` and are mutated through `TrackMixOperation` entries in the shared `EditOperation` union. Color, height, selection, zoom, and panel visibility remain local UI state.

Rationale:

- Persisted mix state must survive save, reopen, revert, and tab switch.
- Undo/redo requires operation inversion, not ad hoc Zustand setters.
- TrackHeader, future MixerPanel, and Agent tools must converge on the same mutation path.

Alternative considered: mirror local `trackUIState` back into project data on save. Rejected because it creates a dual-source model and loses undo semantics.

### Decision 3: Mix config construction is a pure Extension-side mapping with injected path resolution

`buildMixConfig(data, ctx)` maps `AudioProjectData` to `MixStreamConfig`/`MixdownConfig` using a `MixConfigContext` that provides project directory and path resolution. Extension calls this for project playback, export, and Agent MixExport. Webview sends `audio:playback` and `audio:export` intents rather than configs.

Rust CLI does not import the TypeScript function. Instead, `host-cli` owns a read-only `NkaLoader` that implements the equivalent `.nka → MixdownConfig` mapping using Rust `ProjectContext`; parity is maintained with shared examples and tests.

Rationale:

- `.nka` stores relative or `${VAR}` paths, while Engine requires decode-ready file paths.
- Extension can use the existing `PathResolver` and workspace settings.
- CLI must remain independent of VSCode and TypeScript runtime.

Alternative considered: store absolute paths in `.nka`. Rejected because project path strategy forbids absolute paths in persisted project files.

### Decision 4: Engine endpoints accept explicit render contracts

`audios:transcode` gains effects and trim fields. `audios:mix_stream`, `audios:mix_export`, and `audios:mixdown` require `config: MixdownConfig` for project mix rendering. Because this foundation has not shipped, legacy `audios:mixdown` `{ tracks, sampleRate, channels, time }` input is removed in the same change rather than retained as a compatibility path.

Rationale:

- New callers need a single render instruction shape.
- No released caller depends on the old mixdown request shape.
- Removing fallback parsing prevents a second render contract from becoming permanent.

Alternative considered: create a separate `audios:mixdown_v2` action. Rejected because it would duplicate behavior and make cleanup harder.

### Decision 5: Effect support is explicit and never silently disappears

Engine-supported effect types use hyphenated names matching Rust factory behavior. Planned-only effects such as `noise-reduction`, `pitch-shift`, and `time-stretch` remain UI-visible but are rejected or filtered with warnings before rendering. Unknown Engine effect fallback changes from no-op gain to errors for transcode, and mix paths collect warnings while continuing to play/export when possible.

Rationale:

- Users must know when audio output excludes an effect.
- Agent prompts and schemas must not advertise unrenderable effects as available DSP.
- Mix playback should degrade with warnings rather than fail the whole project for one unsupported effect.

Alternative considered: silently skip unrenderable effects in `buildMixConfig`. Rejected because it recreates the current "looks successful, sounds unchanged" defect.

### Decision 6: Agent project edits execute in Extension, not Webview

`AudioToolBridge` resolves a project session through an Extension-only `AudioProjectSessionGateway`, applies operations to the Extension cache, marks the custom document dirty, and sends targeted `project:sync` notifications to Webview. `ProjectSyncMessage.operation` lets Webview record undo metadata without executing the operation again.

Rationale:

- The result is known synchronously in the same process as the tool call.
- Multi-document edits can target the correct document URI.
- This matches the proven `neko-cut` tool executor pattern.

Alternative considered: keep `agent:*` postMessage handlers and wait for Webview acknowledgement. Rejected because it still depends on Webview liveness and introduces timeout/race handling.

### Decision 7: `audio:*` messages are control plane only

Webview user actions use typed `audio:*` request messages, and Extension returns typed response messages. Binary audio data remains direct Engine-to-Webview WebSocket PCM frames using returned stream URLs.

Rationale:

- Control messages are semantic, mode-aware, and routed by Extension.
- Data-plane frames bypass Extension for latency.
- The protocol keeps single-file editing and project playback/export under one namespace.

Alternative considered: proxy WebSocket frames through Extension. Rejected because it increases latency and memory pressure without improving project ownership.

### Decision 8: `.nka` future-version saves are explicit destructive downgrades

`loadNka()` accepts the current version, opens unknown future versions read-only with warnings, and rejects non-current past versions because this foundation has not shipped. Saving a future-version file requires explicit user confirmation before writing the current schema. `saveNka()` writes only fields known to the current schema; unknown future fields are stripped rather than preserved in a file claiming the current version.

Rationale:

- Silent downgrade can destroy future data.
- Preserving unknown fields in a current-version file creates ambiguous parser behavior.
- Lossless future-version roundtrip can be added later with a raw extension sidecar if needed.

Alternative considered: always force Save As for future versions. Rejected because it is disruptive for users who knowingly choose to downgrade.

## Risks / Trade-offs

- [Risk] Track mix operation migration touches Webview stores, Extension provider cache, and save paths → Mitigation: add operation tests first, then migrate actions one at a time while preserving local view state.
- [Risk] Effect type normalization at both TS and Rust layers may appear redundant → Mitigation: document it as defense in depth; TS normalizes project/preset input, Rust catches CLI or malformed direct calls.
- [Risk] Mix warnings require changing `AudioMixdown::new()` / `initialize()` / `update_config()` lifecycle → Mitigation: centralize effect-chain rebuilding in one helper that records warnings and reuse it for initial and hot-update paths.
- [Risk] Undiscovered internal callers may still send old `audios:mixdown` input → Mitigation: fail with a clear `config required for audios:mixdown` error and keep tests requiring config-only input.
- [Risk] Webview optimistic edits and Extension cache edits can diverge → Mitigation: Extension receives every user `operationApplied` and Webview replaces state on `project:sync` for Agent/revert paths.
- [Risk] Rust CLI `.nka` loader and TS `buildMixConfig` can drift → Mitigation: use shared JSON fixture examples and parity tests for representative projects and path forms.

## Migration Plan

1. Add shared effect, message, operation, mix config, and `.nka` compatibility contracts in `packages/neko-types`.
2. Enable Rust transcode effects/trim and canonical effect error behavior.
3. Add `MixdownRequestOptions.config` and remove legacy `tracks` input fallback.
4. Extract `buildMixConfig(data, ctx)` and migrate Extension playback/export/Agent MixExport to call it.
5. Split Webview track mix state into persisted project data and local view state.
6. Add Extension-side `AudioProjectSessionGateway` and migrate Agent project-edit tools to `applyOperation`.
7. Add unified `audio:*` message handlers and migrate Webview user actions.
8. Implement `.nka` version/read-only/downgrade behavior.
9. Remove old audio runtime Webview controls in favor of `audio:*`, while preserving project state/edit messages outside the runtime namespace.

Rollback strategy: restore from git if a new path regresses during this unreleased foundation work. Do not reintroduce parallel runtime protocols unless a released compatibility requirement appears.

## Open Questions

- Should mix preview warnings be surfaced as a toast, a non-blocking status panel, or only logged until export?
- Should `AudioMixdown::update_config()` return `Result<Vec<String>>` or store warnings for a separate accessor?
- Which package should own CLI parity fixtures for `.nka → MixdownConfig`: `neko-types`, `neko-engine`, or a shared test fixture directory?
- Should future-version `.nka` downgrade expose "Save & Downgrade" only, or also a "Save Copy" action in the first implementation?
