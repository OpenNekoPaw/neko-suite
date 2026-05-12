## 1. Shared Audio Contracts

- [x] 1.1 Add canonical audio effect type contracts in `packages/neko-types`, splitting engine-supported effects from planned-only effects.
- [x] 1.2 Update shared `AudioEffectConfig`, `MixStreamConfig`, and related audio mix exports to use canonical hyphenated renderable effect names.
- [x] 1.3 Add typed `AudioRequestMessage`, `AudioResponseMessage`, and `ProjectSyncMessage` DTOs for the `audio:*` protocol and `project:sync` notifications.
- [x] 1.4 Add `TrackMixOperation` types to the shared `EditOperation` union.
- [x] 1.5 Implement `applyTrackMixOperation()` and `invertTrackMixOperation()` and route them through shared operation apply/invert entry points.
- [x] 1.6 Add shared operation tests for track mix apply/invert roundtrips, invalid track IDs, effect add/remove/update/move, and undo behavior.

## 2. `.nka` Codec And Project State

- [x] 2.1 Update `.nka` codec current version to the new audio project baseline.
- [x] 2.2 Add `loadNka()` compatibility metadata for loaded version, read-only future-version state, and warnings.
- [x] 2.3 Reject non-current `.nka` versions and require canonical effect names in `masterEffectsChain[].type` and `trackMix[].effectChain[].effectType`.
- [x] 2.4 Update `saveNka()` to validate and serialize only current schema fields during downgrade saves.
- [x] 2.5 Update `AudioProjectProvider` save paths to call `saveNka(data)` rather than raw JSON serialization.
- [x] 2.6 Add read-only future-version save confirmation flow with cancel and save-and-downgrade outcomes.
- [x] 2.7 Add codec tests for non-current version handling, future-version read-only load, destructive downgrade schema strip, validation failure, and roundtrip persistence.

## 3. Webview Project State Migration

- [x] 3.1 Split `audioProjectStore` track state into persisted mix state in `AudioProjectData.trackMix` and local-only `trackViewState`.
- [x] 3.2 Rewrite TrackHeader volume, pan, solo, and effect actions to dispatch `track.mix.*` operations.
- [x] 3.3 Keep track color, height, selection, zoom, panel visibility, and playback UI state outside `.nka` project data.
- [x] 3.4 Update Webview undo/redo handling to use the shared operation inverse for track mix edits.
- [x] 3.5 Add Webview/store tests proving track mix edits persist, undo correctly, and local view state remains non-persisted.

## 4. Mix Config Builder And Path Resolution

- [x] 4.1 Extract `buildMixConfig(data, ctx)` into shared code with `MixConfigContext`.
- [x] 4.2 Map `AudioProjectData.tracks[].elements[]`, `trackMix`, `masterEffectsChain`, sample rate, channels, and master volume into `MixStreamConfig`.
- [x] 4.3 Resolve relative and `${VAR}` source paths through the provided context before producing Engine-facing element paths.
- [x] 4.4 Filter planned-only effects from mix configs with warnings and do not silently drop renderable unknowns.
- [x] 4.5 Remove Webview project config construction from playback/export paths and keep Webview messages intent-only.
- [x] 4.6 Add path-resolution and warning tests for `buildMixConfig(data, ctx)`.

## 5. Rust Engine Transcode And Mix Contracts

- [x] 5.1 Add `effects`, `startTime`, `endTime`, and `format`/`codec` compatibility handling to `audios:transcode` request options.
- [x] 5.2 Require canonical `{ id, effectType, enabled, params }` effect entries at the host-api boundary.
- [x] 5.3 Add `effects` carrying to audio domain transcode options without importing DSP types into the domain layer.
- [x] 5.4 Build transcode effect chains once before the decode loop and process decoded f32 buffers in place for every frame.
- [x] 5.5 Add trim support mapping `startTime`/`endTime` into the Engine transcode time range.
- [x] 5.6 Change unknown DSP effect fallback from passthrough gain to explicit error.
- [x] 5.7 Add `MixdownRequestOptions.config` for `audios:mixdown` and require config-only input.
- [x] 5.8 Refactor `AudioMixdown` effect-chain rebuild lifecycle so initial build and `update_config()` collect warnings instead of silently dropping unsupported effects.
- [x] 5.9 Surface mix export warnings in response JSON and define mix preview warning logging or forwarding behavior.
- [x] 5.10 Add Rust tests for transcode gain, trim, stateful effect processing, mixdown config input, missing-config rejection, unsupported mix effect warnings, and mix export warning response.

## 6. Mix Stream Hot Update

- [x] 6.1 Add `mixdown_update` and `mixdown_seq` fields to `PlaybackState`.
- [x] 6.2 Update the audio mix stream loop to detect mixdown sequence changes and call `AudioMixdown::update_config()`.
- [x] 6.3 Add an `update_mixdown()` stream state helper using the existing active stream update pattern.
- [x] 6.4 Replace the `audios:mix_stream update` stub with full config replacement behavior.
- [x] 6.5 Add tests or targeted integration coverage for active mix stream config updates and unsupported effect warnings during update.

## 7. Extension Playback, Export, And Message Protocol

- [x] 7.1 Add `audio:*` message handlers in `AudioProjectProvider` for playback, trim, apply effect, analyze, export, and recording commands.
- [x] 7.2 Route single-file playback/export to existing stream/transcode paths and project playback/export to Extension-built `MixdownConfig`.
- [x] 7.3 Return typed audio response DTOs including playback stream details, export results, errors, and warnings.
- [x] 7.4 Remove old audio runtime controls (`editor:*`, `project:mix*`) while preserving project state/edit messages.
- [x] 7.5 Migrate Webview playback hooks and export UI to send `audio:*` intent messages.
- [x] 7.6 Verify binary audio frames still travel directly from Engine WebSocket to Webview.
- [x] 7.7 Add Extension/Webview protocol tests for playback, export, error, and warning responses.

## 8. Agent Tool Execution

- [x] 8.1 Add Extension-only `ProjectSession` and `AudioProjectSessionGateway` interfaces.
- [x] 8.2 Implement gateway methods in `AudioProjectProvider` for session resolution, cache update, dirty event firing, and targeted Webview sync.
- [x] 8.3 Refactor `AudioToolBridge` to take the gateway and `AudioService` through dependency injection.
- [x] 8.4 Implement Agent project-edit tools by creating operations, applying them to Extension cache, and sending `project:sync`.
- [x] 8.5 Add optional `documentUri` parameters to Agent audio tool schemas and include resolved `documentUri` in read-tool responses.
- [x] 8.6 Implement or verify all bridge-owned `TOOL_NAMES_AUDIO` switch cases and provider-direct media generation tool handling.
- [x] 8.7 Add tests for successful Agent edits, invalid track IDs, wrong document URI, unsupported planned effects, MixExport warnings, and no-open-project failures.

## 9. Rust CLI `.nka` Export Parity

- [x] 9.1 Add a read-only `NkaLoader` in Rust `host-cli` for supported current `.nka` project files.
- [x] 9.2 Map `.nka` tracks, elements, track mix state, master effects, sample rate, channels, and master volume into Rust `MixdownConfig`.
- [x] 9.3 Resolve relative and `${VAR}` paths with Rust `ProjectContext`.
- [x] 9.4 Reject unsupported `.nka` versions with an instruction to upgrade in VSCode.
- [x] 9.5 Add parity fixtures comparing representative TS `buildMixConfig` output and Rust `NkaLoader` output.

## 10. P1 Cleanup And UI Foundation

- [x] 10.1 Remove legacy `audios:mixdown` `tracks`/`sampleRate`/`channels` fallback after migrated TS callers use `config`.
- [x] 10.2 Add a regression test proving missing `config` returns a clear invalid-request error after cleanup.
- [x] 10.3 Add initial MixerPanel and ChannelStrip controls that read/write persisted track mix state through the same operation path.
- [x] 10.4 Add MixerPanel UI tests proving Mixer and TrackHeader reflect the same persisted values and undo across both surfaces.

## 11. Documentation And Verification

- [x] 11.1 Update `docs/architecture/adr-audio-workstation-evolution.md` if implementation decisions differ from the proposal.
- [x] 11.2 Update package README or architecture notes for the `audio:*` protocol, Agent execution boundary, and `.nka` version behavior.
- [x] 11.3 Run targeted TypeScript tests for shared contracts, Webview stores, Extension provider, and Agent bridge.
- [x] 11.4 Run targeted Rust tests for transcode, mixdown, mix export, mix stream update, and CLI loader.
- [x] 11.5 Run `pnpm check` or the narrow affected package check commands.
- [x] 11.6 Run `openspec status --change evolve-neko-audio-workstation-foundation` and confirm the change is apply-ready before implementation.
