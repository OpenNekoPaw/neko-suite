## Why

`neko-audio` already has multi-track playback, export, waveform rendering, effects UI, and Agent tool names, but the current foundation lets key edits live only in Webview state, sends Agent edits through fire-and-forget postMessage, and allows TS/Rust audio contracts to drift. Before adding DAW-like features such as mixer routing, automation, and plugins, the project needs a contract-first foundation where `.nka` project data, Engine render instructions, and Agent edits have clear ownership and testable boundaries.

## What Changes

- Promote per-track mix state to persisted `.nka` project data driven by `EditOperation`, including undo/redo and Extension cache synchronization.
- Introduce canonical audio effect contracts with hyphenated engine-supported effect names, planned-only effect handling, and explicit warnings for unsupported mix effects.
- Move mix config construction out of Webview state into a pure `buildMixConfig(data, ctx)` contract used by Extension playback/export paths, with path resolution supplied by Extension-side context.
- Align Engine audio endpoints for transcode, mixdown, mix stream, and mix export around explicit wire contracts, including effects/trim support in transcode and `MixdownConfig` as the render instruction.
- Replace Agent project-edit postMessage execution with Extension-side `AudioProjectSessionGateway` execution against `_projectDataCache`, followed by targeted `project:sync` notifications.
- Add a unified `audio:*` Webview-to-Extension control protocol for user actions while keeping WebSocket audio frames as the data plane.
- Define `.nka` version handling, read-only future-version behavior, and downgrade schema-strip behavior.
- Add implementation-ready task boundaries for the foundation work, including completed cleanup for legacy `audios:mixdown` request input.

## Capabilities

### New Capabilities

- `audio-project-state-contract`: Defines `.nka` project ownership, track mix persistence, edit operations, version compatibility, and downgrade behavior.
- `audio-mix-render-contract`: Defines `MixdownConfig`/`MixStreamConfig` construction, path resolution, effect canonicalization, transcode effects, mixdown/export warnings, and Engine render boundaries.
- `audio-agent-edit-execution`: Defines Extension-side Agent tool execution for audio project edits, targeted project session resolution, and Webview sync notification behavior.
- `audio-webview-control-protocol`: Defines the unified `audio:*` control-plane messages, playback/export routing, response DTOs, and separation from WebSocket audio data.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-types` shared audio project, mix, effect, message, operation, and `.nka` codec contracts.
- Affects `packages/neko-audio/packages/webview` stores, playback hooks, timeline controls, future MixerPanel components, and Webview message handling.
- Affects `packages/neko-audio/packages/extension` `AudioProjectProvider`, `AudioService`, `AudioToolBridge`, `AgentCapabilityProvider`, and Extension-only service interfaces.
- Affects `packages/neko-engine/packages/host-api` audio controller request options for `audios:transcode`, `audios:mixdown`, `audios:mix_stream`, and `audios:mix_export`.
- Affects `packages/neko-engine/packages/engine-kernel` transcode processing, audio DSP effect factory, `AudioMixdown`, mix stream hot-update plumbing, and warning propagation.
- Affects future Rust `host-cli` `.nka` export support through a read-only `NkaLoader` that maps `.nka` metadata to `MixdownConfig` without becoming a project editor.
- Requires targeted TypeScript, Rust, and contract tests for state persistence, path resolution, endpoint compatibility, unsupported effect warnings, and Agent edit execution.
