# ADR: neko-audio Architecture Evolution — Audio Post-Production Workstation → DAW-Ready

- **Status**: Proposed (rev.3 — engine capability gap analysis + honest degradation)
- **Date**: 2026-05-11
- **Author**: Claude (Architect)
- **Scope**: neko-audio (webview + extension + @neko/shared types + neko-engine audio DSP)

## Context

neko-audio is currently a basic multi-track audio editor with waveform display, 12 effect types, mix stream playback, export, and microphone recording. Critical gaps:

1. **UI too minimal** — no Mixer panel; effect chain editing hidden in side panel tab
2. **Agent integration incomplete** — 18 tool names in `TOOL_NAMES_AUDIO` but only 9 implemented in `AudioToolBridge`
3. **Track mix state not persisted** — `trackUIState` (volume/pan/solo/effectChain) is local Zustand state, not serialized to `.nka` or covered by Undo/Redo
4. **Contract misalignment** — effect type naming drift between TS and Rust; `AudioService` API surface doesn't match ADR assumptions; `.nka` version inconsistent across codebase
5. **No advanced routing** — flat track→master only; no sends, buses, automation, or per-clip effects

**Decision**: Build features for post-production (A direction); design architecture for future DAW extensibility (MIDI, instruments, plugin hosting). **But first, fix the contract and state model foundation.**

---

## Current State — Known Defects

### Defect 1: trackUIState is NOT the SSOT

`audioProjectStore.ts:49` explicitly marks `AudioTrackUIState` as _"Per-track UI state (local, not serialized to .nka)"_. `initProject()` reads from `AudioProjectData.trackMix` into local `trackUIState`, but changes via `setTrackVolume`/`setTrackPan`/`addTrackEffect` etc. only update local Zustand state — they are **never synced back** to `trackMix` or to the Extension cache via `operationApplied`.

**Impact**: Volume/pan/solo/effectChain changes made in the TrackHeader (or by Agent) are lost on save, revert, or tab switch.

### Defect 2: Effect Type Naming Drift

| Layer | Naming Convention | Example |
|-------|-------------------|---------|
| Webview `audioEffects.ts` | hyphenated | `noise-reduction`, `high-pass`, `pitch-shift` |
| Agent tool schema (`agentCapabilityProvider.ts`) | underscored | `parametric_eq`, `noise_gate` |
| Rust `effect_factory.rs` | hyphenated | `parametric-eq`, `noise-gate` |
| `AudioProjectProvider` denoise handler | hyphenated | `noise-reduction` |

Agent sends `noise_gate` → Engine expects `noise-gate` → silent failure.

### Defect 3: Engine Effects Pipeline is Broken for Single-File Operations

**Critical**: The TS layer already calls `audioService.transcode(filePath, outputPath, { effects: [...] })` for denoise, normalize, and fade operations (`AudioProjectProvider.ts:387-418`). **But Rust silently ignores the effects parameter.**

Verified cause chain:
1. `AudioService.transcode()` passes `effects` as opaque options via `EngineClient.dispatch()`
2. Rust `TranscodeRequestOptions` struct (`host-api/controllers/audio.rs:54-70`) has **no `effects` field** — only `source`, `output`, `codec`, `bitrate`, `sample_rate`, `channels`
3. `AudioTranscodeOptions` (`engine-kernel/domain/options.rs:203-216`) has **no `effects` field** — only `time_range`, `sample_rate`, `channels`, `format`, `bitrate`
4. Serde deserialization silently drops unknown fields → effects array is lost

**Impact**: Every single-file effect operation in the current UI (Apply Effects, Denoise, Normalize, Fade In/Out) appears to succeed but produces an unchanged copy of the audio.

### Defect 3a: noise-reduction Effect Does Not Exist in Engine

The Rust `effect_factory.rs` `create_effect()` function handles 13 effect types: `gain`, `high-pass`/`highpass`, `low-pass`/`lowpass`, `band-pass`/`bandpass`, `notch`, `parametric-eq`/`eq`, `compressor`, `noise-gate`/`gate`, `limiter`, `reverb`, `delay`, `chorus`, `distortion`. Unknown types fall back to `Gain::new(0.0)` with a warning log.

**Not in factory**: `noise-reduction`, `soft-limiter`, `pitch-shift`, `time-stretch`.

- `SoftLimiter` exists as internal struct used by `AudioMixdown` for clipping prevention, but is not exposed via the factory.
- `noise-gate` (threshold-based muting) ≠ noise-reduction (spectral subtraction / AI denoising).
- The TS webview defines 12 effect types including `noise-reduction`, `pitch-shift`, `time-stretch` — these exist only in the UI type system, not in the engine.

### Defect 3b: AudioService API Surface Mismatch

ADR v1 referenced `audioService.applyEffects()` which **does not exist**. The actual API is `AudioService.transcode()` which accepts an `effects` option that the engine ignores (see Defect 3).

### Defect 4: .nka Version Inconsistency

| Location | Version Claim |
|----------|---------------|
| `nka/codec.ts:12` | `CURRENT_NKA_VERSION = '1.0'` |
| `AudioProjectProvider` comments | "v2" |
| `AudioTrackMixState` comments | "v2.1" |
| `AudioProjectData.version` | String field, unchecked by `loadNka()` |

### Defect 5: postMessage Fire-and-Forget

`AudioToolBridge` methods send postMessage and immediately return `{ success: true }` before the webview has processed the message. `AudioProjectProvider.postToActivePanels()` broadcasts to ALL active panels, not targeting a specific document. No requestId/ack protocol exists.

---

## Architecture Overview

### Target Layout

```
┌─────────────────────────────────────────────────────────────┐
│ TransportBar (BPM / Play / Time / Speed / Zoom)             │
├───────┬─────────────────────────────────┬───────────────────┤
│       │                                 │                   │
│  T    │  AudioTimeline                  │   SidePanel       │
│  o    │    TimelineRuler                │   Effects         │
│  o    │    TrackLane[] + AutomationLane*│   Recording       │
│  l    │      TrackHeader               │   Export          │
│  b    │      AudioClip[] (+ FX badge)  │   Presets         │
│  a    │                                 │   StepSequencer*  │
│  r    │                                 │                   │
│       ├─────────────────────────────────┤                   │
│       │  MixerPanel* (collapsible)      │                   │
│       │  [Ch1][Ch2][Ch3]...[Bus1][Mstr] │                   │
│       │  Vol|Pan|FX slots|S|M|Send      │                   │
└───────┴─────────────────────────────────┴───────────────────┘
```

### Layer Diagram

```
UI Layer (webview/)
├── AudioEditor.tsx (layout orchestrator)
├── components/Timeline/   — multi-track timeline + automation overlays
├── components/Mixer/      — channel strips + master strip + bus strips  (NEW)
├── components/Routing/    — routing matrix view  (P2)
├── stores/audioProjectStore.ts  — project data + trackMix + EditOperation + undo/redo
└── stores/audioStore.ts         — playback-only UI state (no persisted data)

Bridge Layer (extension/)
├── AudioProjectProvider   — .nka CustomEditor, postMessage routing (per-document)
├── AudioService           — EngineClient facade (HTTP/WS)
├── AudioToolBridge        — Agent tool execution bridge (with request/ack protocol)
└── AgentCapabilityProvider — Tool/PromptFragment registration

Domain Layer (@neko/shared + neko-engine)
├── types/audioProject.ts  — AudioProjectData (.nka schema, SSOT for trackMix)
├── types/audioMix.ts      — MixStreamConfig, AudioEffectConfig
├── types/audioRouting.ts  — IAudioBus, IAudioSend (P1, unique routing model)
├── types/audioAutomation.ts — IAutomationLane, AutomationPoint (P1)
├── types/audioPlugin.ts   — IPluginDescriptor, IPluginState (P2)
├── operations/            — EditOperation types including track.mix.* (NEW)
└── neko-engine/           — Rust DSP, AudioMixdown, mix stream
```

---

## Type Contracts

### Track Mix EditOperations (P0 — NEW)

```typescript
// @neko/shared/operations/types.ts — new operation types

/** Operations that modify per-track mix state (persisted in AudioProjectData.trackMix) */
export type TrackMixOperation =
  | { type: 'track.mix.setVolume';      meta: OperationMeta; payload: { trackId: string; volume: number };      before: { volume: number } }
  | { type: 'track.mix.setPan';         meta: OperationMeta; payload: { trackId: string; pan: number };         before: { pan: number } }
  | { type: 'track.mix.toggleSolo';     meta: OperationMeta; payload: { trackId: string };                      before: { solo: boolean } }
  | { type: 'track.mix.addEffect';      meta: OperationMeta; payload: { trackId: string; effect: AudioEffectConfig };      before?: undefined }
  | { type: 'track.mix.removeEffect';   meta: OperationMeta; payload: { trackId: string; effectId: string };    before: { effect: AudioEffectConfig; index: number } }
  | { type: 'track.mix.updateEffect';   meta: OperationMeta; payload: { trackId: string; effectId: string; updates: Partial<AudioEffectConfig> }; before: { updates: Partial<AudioEffectConfig> } }
  | { type: 'track.mix.moveEffect';     meta: OperationMeta; payload: { trackId: string; fromIndex: number; toIndex: number }; };
```

### Agent Request/Ack Protocol (P0 — NEW)

```typescript
// Extension → Webview message with request correlation
interface AgentRequestMessage {
  type: `agent:${string}`;
  requestId: string;        // UUID, for ack correlation
  documentUri: string;      // target .nka document URI
  [key: string]: unknown;
}

// Webview → Extension ack
interface AgentAckMessage {
  type: 'agent:ack';
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### Effect Type Canonical Naming (P0 — NEW)

Single source of truth: **hyphenated**, matching Rust `effect_factory.rs`. Split into engine-supported and UI-only.

```typescript
// @neko/shared/types/audioEffectTypes.ts

/** Effects supported by Rust engine — can be rendered in mix stream/export and transcode (after P0-PR1a) */
export type EngineAudioEffectType =
  | 'gain'
  | 'high-pass' | 'low-pass' | 'band-pass' | 'notch'
  | 'parametric-eq'
  | 'compressor' | 'noise-gate' | 'limiter'
  | 'reverb' | 'delay' | 'chorus' | 'distortion';

/** UI-only effects — displayed in webview but NOT renderable by engine yet */
export type PlannedAudioEffectType =
  | 'noise-reduction'   // Requires spectral subtraction or ML model (P2+)
  | 'pitch-shift'       // Requires phase vocoder (P2+)
  | 'time-stretch';     // Requires phase vocoder (P2+)

/** Union type for all effect types across the system */
export type AudioEffectType = EngineAudioEffectType | PlannedAudioEffectType;

// Agent tool schema effectType enum MUST:
// 1. Use hyphenated names (not underscored)
// 2. Mark planned types in description: "pitch-shift (UI preview only, not rendered in export)"
// Migration: update agentCapabilityProvider.ts enum values from underscored to hyphenated
```

### IAudioNode — Routing (P1)

```typescript
// @neko/shared/types/audioRouting.ts
// buses + trackMix.sends + trackMix.outputId are the PRIMARY model
// IAudioNode is a DERIVED view for routing matrix UI, NOT persisted separately

export type AudioTrackCategory = 'audio' | 'bus' | 'instrument' | 'midi' | 'master';

export interface IAudioSend {
  targetId: string;
  level: number;            // 0.0–1.0
  position: 'pre' | 'post';
  enabled: boolean;
}

export interface IAudioBus {
  id: string;
  name: string;
  volume: number;           // 0.0–2.0
  pan: number;              // -1.0 to 1.0
  muted: boolean;
  solo: boolean;
  effectChain: AudioEffectConfig[];
  /** Output destination — another bus id or 'master' */
  outputId: string;
}
```

**Routing SSOT decision**: `AudioProjectData.buses` + `AudioTrackMixState.sends` + `AudioTrackMixState.outputId` are the primary persisted model. `routingNodes` is **removed** from the schema — the routing matrix UI derives its graph view from buses + trackMix at render time. This eliminates the dual-SSOT risk identified in the review.

### IAutomationLane (P1)

```typescript
// @neko/shared/types/audioAutomation.ts

export interface AutomationTarget {
  nodeId: string;
  /** 'volume' | 'pan' | `effect.${effectId}.${paramKey}` */
  paramPath: string;
}

export interface AutomationPoint {
  time: number;    // seconds
  value: number;   // normalized to param range
  curve: 'linear' | 'exponential' | 'hold';
}

export interface IAutomationLane {
  id: string;
  target: AutomationTarget;
  points: AutomationPoint[];  // sorted by time
  enabled: boolean;
  color?: string;
}
```

### IPluginDescriptor (P2)

```typescript
// @neko/shared/types/audioPlugin.ts

export type PluginFormat = 'builtin' | 'vst3' | 'au' | 'clap';

export interface IPluginDescriptor {
  id: string;
  name: string;
  vendor: string;
  version: string;
  format: PluginFormat;
  category: 'effect' | 'instrument' | 'analyzer';
  parameters: PluginParameterDescriptor[];
}

export interface PluginParameterDescriptor {
  id: string;
  name: string;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  step?: number;
  unit?: string;
}

export interface IPluginState {
  pluginId: string;
  format: PluginFormat;
  state: string;
  parameterValues: Record<string, number>;
  enabled: boolean;
}
```

---

## Phased Implementation Plan

### P0: Contract & State Model Foundation (~4 PR)

> **Principle**: Fix the foundation before building features. Without P0, Mixer and Agent tools would produce a "fake closed loop" — UI can click, Agent returns success, but state is not reliably persisted, undoable, or communicated to the engine.

#### P0-PR1a: Engine — Enable Effects in Transcode Pipeline (Rust)

**Goal**: Fix the broken single-file effects pipeline. Without this, denoise/normalize/apply-effects in the UI all silently produce unmodified output.

**Scope boundary**: This PR fixes **effects** and **trim** in the transcode path. **Fade-in/fade-out are NOT fixed here** — fades are handled natively by the mix path (`MixElementConfig.fadeIn/fadeOut`) and should not be routed through transcode. The webview `fadeIn`/`fadeOut` commands will be migrated to use a temporary single-track mix export in a later PR (or removed from single-file mode).

##### Transcode Effect Wire Format

The Rust `effect_factory::create_effect()` reads a flat JSON object with `type` + params at top level:
```json
{ "type": "gain", "gainDb": -6.0 }
{ "type": "compressor", "threshold": -24.0, "ratio": 4.0, "attack": 0.01, "release": 0.1 }
{ "type": "noise-gate", "threshold": -40.0, "attack": 0.001, "hold": 0.05, "release": 0.1 }
```

The TS layer currently sends `{ type, params: { ... } }` (nested). The Rust factory reads params from the **same level** as `type` (flat). Normalization options:

**Option A (chosen)**: Rust `TranscodeRequestOptions` accepts `effects: Vec<Value>`. Before passing to factory, the controller **flattens** each entry: if `params` key exists, merge its contents to top level. This way both `{ type, gainDb }` and `{ type, params: { gainDb } }` work.

**Option B (rejected)**: Change TS to send flat format. Rejected because `AudioEffectConfig` (engine-facing mix type) uses `{ effectType, params }` and we don't want two serialization formats.

##### Parameter Name Alignment

| TS sends | Rust factory reads | Fix needed |
|----------|-------------------|------------|
| `{ type: 'gain', params: { gain: X } }` | `gainDb` | TS must send `gainDb` not `gain`. Fix in `AudioProjectProvider.ts:409` normalize handler |
| `{ type: 'noise-reduction', params: {...} }` | Not in factory | TS must send `noise-gate` instead (see AudioDenoise decision) |

##### Trim: Migrate to `audios:segment` or Add time_range to transcode

Current state: `AudioService.transcode()` passes `startTime`/`endTime` as opaque options → Rust `TranscodeRequestOptions` has no such fields → silently ignored.

Engine already has `audios:segment` action (`SegmentRequestOptions`: `source`, `start`, `duration`, `format`, `sample_rate`, `channels`) that correctly extracts a time range.

**Decision**: Add `start_time: Option<f64>` and `end_time: Option<f64>` to `TranscodeRequestOptions` and map to `AudioTranscodeOptions.time_range` in the controller. This keeps trim + effects in a single call (trim first, then apply effects to the trimmed segment). The existing `audios:segment` remains for base64-returning use cases.

##### Modified files (Rust):
- `engine-kernel/src/domain/options.rs` — add `effects: Option<Vec<serde_json::Value>>` to `AudioTranscodeOptions`
- `host-api/src/controllers/audio.rs`:
  - `TranscodeRequestOptions` add: `effects: Option<Vec<serde_json::Value>>`, `start_time: Option<f64>`, `end_time: Option<f64>`
  - Controller: map `start_time`/`end_time` → `time_range`; pass `effects` to `AudioTranscodeOptions`
  - Before calling `effect_factory::create_effect()`, flatten each effect JSON: if `params` key exists, merge into top level
- `engine-kernel/src/services/impls/audio.rs` (transcode impl) — after decode + time_range slice, before encode: if `effects.is_some()`, build `EffectChain` and process each buffer through it

**New Rust code sketch:**
```rust
// In transcode implementation, after decoding samples:
if let Some(effect_configs) = &opts.effects {
    let mut chain = EffectChain::new();
    for config in effect_configs {
        // Flatten: merge "params" sub-object to top level
        let mut flat = config.clone();
        if let Some(params) = flat.as_object_mut().and_then(|o| o.remove("params")) {
            if let Some(params_obj) = params.as_object() {
                for (k, v) in params_obj {
                    flat.as_object_mut().unwrap().insert(k.clone(), v.clone());
                }
            }
        }
        chain.add(create_effect(&flat));
    }
    chain.process(&mut buffer, channels, sample_rate);
}
```

**Verification:**
- `cargo test` — unit test: transcode with `[{ "type": "gain", "params": { "gainDb": -6.0 } }]` → output is 6dB quieter
- `cargo test` — unit test: transcode with `start_time: 1.0, end_time: 3.0` → output is 2s long
- TS integration: `audioService.transcode(file, out, { effects: [{ type: 'gain', params: { gainDb: -6 } }], startTime: 0, endTime: 5 })` → engine applies both trim and gain

#### P0-PR1b: TS Contract Alignment

**Goal**: Unify effect type naming, fix .nka version, split effect types, fix param name bugs, clarify fade handling.

**Modified files:**
- `@neko/shared/types/audioEffectTypes.ts` (new) — define `EngineAudioEffectType` (13 types), `PlannedAudioEffectType` (3 types), `AudioEffectType` union (see contract above)
- `@neko/shared/types/audioMix.ts` — update `AudioEffectType` to use hyphenated names matching Rust factory; remove underscored aliases (`parametric_eq` → `parametric-eq`, `noise_gate` → `noise-gate`, etc.)
- `webview/src/types/audioEffects.ts` — change `AudioEffectType` to hyphenated names; import from shared types; mark `noise-reduction`/`pitch-shift`/`time-stretch` as `planned: true` in `AUDIO_EFFECT_DEFINITIONS`; **remove `fade-in`/`fade-out` from effect types** (fades are not DSP effects — they are envelope params on `MixElementConfig.fadeIn/fadeOut`)
- `extension/src/agentCapabilityProvider.ts` — fix effectType enum from underscored to hyphenated; add description note for planned-only types
- `extension/src/providers/AudioProjectProvider.ts`:
  - **Fix normalize handler** (~line 409): change `{ type: 'gain', params: { gain: gainDb } }` → `{ type: 'gain', params: { gainDb: gainDb } }` (Rust factory reads `gainDb`, not `gain`)
  - **Remove fade-in/fade-out command handlers** from single-file mode — fades only work in mix path (`MixElementConfig.fadeIn/fadeOut`). In project mode, fade is set per-element via `updateElement({ fadeIn, fadeOut })`. In single-file mode, fade commands are disabled (show toast: "Fade requires project mode")
  - Update comments to say "v2" consistently
- `webview/src/editor/AudioEditor.tsx` — remove `case 'fadeIn'` / `case 'fadeOut'` that send `editor:applyEffects` with fake effect types; replace with element-level fade update in project mode or disabled toast in single-file mode
- `nka/codec.ts` — set `CURRENT_NKA_VERSION = '2.0'`; `loadNka()` add version detection (accept `'1.0'` | `'2.0'`; unknown versions produce warning, not error; preserve unknown fields on round-trip)
- `nka/validator.ts` — validate `version` field; warn on `> 2.0`
- `types/audioProject.ts` — update `AudioTrackMixState` comment to remove misleading "v2.1"

**Verification:**
- `pnpm build` passes
- `.nka` with `version: '1.0'` opens without error; `version: '99.0'` opens with warning but preserves unknown fields
- Effect type names consistent across TS types, agent schema, and preset JSON
- `EngineAudioEffectType` union matches exactly the 13 types in Rust `effect_factory.rs`
- Normalize command sends `gainDb` param (not `gain`)
- Fade commands no longer send fake effect types to engine

#### P0-PR2: Promote Track Mix State to Project Model

**Goal**: Make volume/pan/solo/effectChain changes persist to `.nka`, support Undo/Redo, and sync to Extension cache.

**New types in `@neko/shared/operations/types.ts`:**
- `TrackMixOperation` type union (see contract above)

**New file:**
- `@neko/shared/operations/trackMixOperations.ts` — `applyTrackMixOperation()` + `invertTrackMixOperation()` pure functions

**Modified files:**
- `audioProjectStore.ts` — **Split `trackUIState` into two concerns**:
  - **Mix state** (volume/pan/solo/effectChain) → migrated to `AudioProjectData.trackMix`, driven by `TrackMixOperation` dispatches → `applyOperation` → `syncOperationToExtension` → Extension cache → Undo/Redo
  - **View state** (color/height) → renamed to `trackViewState: Record<string, AudioTrackViewState>`, remains local, no undo
  - Actions rewritten:
    - `setTrackVolume(trackId, volume)` → dispatches `{ type: 'track.mix.setVolume', ... }`
    - `setTrackPan(trackId, pan)` → dispatches `{ type: 'track.mix.setPan', ... }`
    - `toggleSolo(trackId)` → dispatches `{ type: 'track.mix.toggleSolo', ... }`
    - `addTrackEffect/removeTrackEffect/updateTrackEffect` → dispatch `track.mix.*`
    - `setTrackColor/setTrackHeight` → update local `trackViewState` (no dispatch)
  - Derived getter: `getTrackMix(trackId)` reads from `audioProjectData.trackMix[trackId]`
- `audioProjectStore.ts` :: `buildMixStreamConfig()` — read from `audioProjectData.trackMix` instead of `trackUIState`
- `extension/src/providers/AudioProjectProvider.ts` — `operationApplied` handler: add `track.mix.*` to the operation router
- `components/Timeline/TrackHeader.tsx` — update volume/pan/solo handlers to use new dispatch-based actions
- `stores/audioStore.ts` — keep only genuinely non-persisted UI state: `showMixer`, `showSpectrum`, `activeSidePanel`, `zoom`, selection, playback state

```typescript
/** Local-only view state per track (NOT persisted to .nka, no undo) */
export interface AudioTrackViewState {
  color: string;
  height: number;
}
```

**Verification:**
- Open .nka → change volume in TrackHeader → Save → Reopen → volume preserved
- Undo after volume change → reverts correctly
- `buildMixStreamConfig()` returns correct volume/pan/effectChain from project model

#### P0-PR3: Agent Tool Bridge Completion + Request/Ack Protocol

**Goal**: Implement all 18 tools; add requestId/ack for UI-mutating tools; target specific documents.

**New types:**

```typescript
// extension/src/types/api.ts

/** Gateway interface for AudioToolBridge — single dependency for all project access */
export interface AudioProjectSessionGateway {
  /** Get project data for the active (or specified) document */
  getProjectData(documentUri?: string): AudioProjectData | null;
  /** Get the URI of the currently active audio project document */
  getActiveDocumentUri(): string | null;
  /** Send a request to the webview and await ack (3s timeout) */
  sendAgentRequest(documentUri: string, message: AgentRequestMessage): Promise<AgentAckMessage>;
}

/** Extension → Webview message with request correlation */
interface AgentRequestMessage {
  type: `agent:${string}`;
  requestId: string;        // UUID, for ack correlation
  documentUri: string;      // target .nka document URI
  [key: string]: unknown;
}

/** Webview → Extension ack */
interface AgentAckMessage {
  type: 'agent:ack';
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
```

**Responsibility split:**
- `AudioProjectProvider` **implements** `AudioProjectSessionGateway`:
  - `getProjectData(uri?)` — reads from `_projectDataCache` (existing logic, now behind interface)
  - `getActiveDocumentUri()` — returns first active panel's document URI
  - `sendAgentRequest(docUri, msg)` — finds target panel by docUri, sends message with requestId, waits for ack (3s timeout via AbortController + `onDidReceiveMessage` listener), returns result
- `AudioToolBridge` constructor takes `gateway: AudioProjectSessionGateway` + `audioService: AudioService` — clean dependency injection, no direct Provider access

**Modified files:**
- `extension/src/types/api.ts` — add `AudioProjectSessionGateway` interface + message types
- `extension/src/services/audioToolBridge.ts`:
  - Constructor: `constructor(private gateway: AudioProjectSessionGateway, private audioService: AudioService)`
  - Read tools (`GetAudioProjectInfo`, `ListAudioTracks`) → `gateway.getProjectData()`
  - UI-mutating tools → `gateway.sendAgentRequest(gateway.getActiveDocumentUri()!, msg)` → return ack result
  - Engine tools → call `audioService` directly
  - `AudioDenoise` → `audioService.transcode(input, output, { effects: [{ type: 'noise-gate', params: { threshold, ... } }] })`. Returns `{ success: true, data: { output, note: 'Applied noise-gate (threshold-based). Spectral noise reduction not available.' } }`
  - `StemSeparation` → `{ success: false, error: 'Stem separation requires ML model not yet available in engine' }` (honest failure)
- `extension/src/providers/AudioProjectProvider.ts`:
  - Implement `AudioProjectSessionGateway` interface
  - Add `sendAgentRequest()` method with per-panel message listener + timeout
  - Keep `postToActivePanels()` for broadcast events (project:init, etc.) — NOT for agent operations
- `webview/src/editor/AudioEditor.tsx`:
  - Handle `agent:*` messages → execute store action → send `agent:ack` back with requestId + success/error
- `extension/src/agentCapabilityProvider.ts`:
  - Expand `getPromptFragments()`:
    - Effect types are **hyphenated** (parametric-eq, not parametric_eq)
    - `noise-reduction`, `pitch-shift`, `time-stretch` are **UI-only** — not rendered by engine
    - Engine-renderable effects: gain, high-pass, low-pass, band-pass, notch, parametric-eq, compressor, noise-gate, limiter, reverb, delay, chorus, distortion
    - Common workflows (podcast chain, scoring mix, TTS dialog)
    - Unit conventions (volume 0.0-2.0, pan -1.0-1.0)

**Tool implementation mapping:**

| Tool | Implementation | Return |
|------|---------------|--------|
| `ApplyTrackEffect` | `sendAgentRequest` → webview dispatches `track.mix.addEffect` → ack | ack result |
| `RemoveTrackEffect` | `sendAgentRequest` → webview dispatches `track.mix.removeEffect` → ack | ack result |
| `ApplyMasterEffect` | `sendAgentRequest` → webview dispatches `audio.effect.add` → ack | ack result |
| `SetTrackProperties` | `sendAgentRequest` → webview dispatches `track.update` → ack | ack result |
| `AudioDenoise` | `audioService.transcode(input, output, { effects: [{ type: 'noise-gate', params }] })` — applies noise-gate (not spectral denoise). Returns honest description of what was done. | `{ output, note: 'Applied noise-gate, not spectral noise reduction' }` |
| `StemSeparation` | `{ success: false, error: 'Stem separation requires ML model not yet available in engine' }` | error |

**Verification:**
- Agent calls ApplyTrackEffect → webview applies + ack → tool returns ack data
- Agent calls with wrong documentUri → error "No panel for document"
- Agent calls AudioDenoise → engine transcodes file → returns output path
- `pnpm test` — unit tests for all 18 tool switch cases

#### P0-PR4: MixerPanel Bottom Panel

**Now safe to build** — project model is the SSOT, Undo/Redo works, Agent tools are closed-loop.

**New files:**
- `webview/src/components/Mixer/MixerPanel.tsx` — collapsible container, horizontal scroll
- `webview/src/components/Mixer/ChannelStrip.tsx` — per-track strip (reads from `audioProjectData.trackMix`, dispatches `track.mix.*` operations)
- `webview/src/components/Mixer/MasterStrip.tsx` — master bus strip
- `webview/src/components/Mixer/index.ts`

**Modified files:**
- `editor/AudioEditor.tsx` — insert `<MixerPanel />` below timeline with resize handle
- `stores/audioStore.ts` — add `showMixer: boolean` + `mixerHeight: number` + `toggleMixer()`
- `components/Toolbar.tsx` — add mixer toggle icon
- `i18n/locales/en.ts` + `zh-cn.ts` — mixer i18n keys

**Design:**
- Mixer reads from `audioProjectData.trackMix` (true SSOT, persisted + undoable)
- Mixer writes via `dispatch(track.mix.*)` — same path as TrackHeader
- Clicking FX slots → right SidePanel opens that track's EffectsPanel
- Default collapsed; `M` keyboard shortcut to toggle

```
Mixer Layout:
┌────────────────────────────────────────────────────────────┐
│ [^] Mixer                                        [X close] │
├────────┬────────┬────────┬─────┬──────────┬────────────────┤
│ Track1 │ Track2 │ Track3 │ ... │  Master  │  Output Meter  │
│ [FX 3] │ [FX 1] │ [FX 0] │     │ [FX 4]  │  L ████░░░░░   │
│ [S][M] │ [S][M] │ [S][M] │     │         │  R ██████░░░░   │
│  ◀●▶   │  ◀●▶   │  ◀●▶   │     │  ◀●▶    │                │
│  ████   │  ████   │  ████   │     │  ████   │                │
│  0.85   │  1.00   │  0.72   │     │  1.00   │                │
└────────┴────────┴────────┴─────┴──────────┴────────────────┘
```

---

### P1: Enhanced Effects + Automation + AI Audio Workflows (~4 PR)

#### P1-PR1: Per-Clip Effect Chain

- `@neko/shared/types/audioMix.ts` — add `effectChain?: AudioEffectConfig[]` to `MixElementConfig`
- `audioProjectStore.ts` — add `addClipEffect` / `removeClipEffect` / `updateClipEffect` as `element.effect.*` operations
- `AudioClip.tsx` — add FX badge, click opens effect editor
- `buildMixStreamConfig()` — pass clip effects into MixElementConfig
- **Engine**: `AudioMixdown` add per-element effect chain (apply after decode, before track mix)

#### P1-PR2: Automation Lanes

**New files:**
- `@neko/shared/types/audioAutomation.ts` — types (see contracts above)
- `@neko/shared/operations/automationOperations.ts` — EditOperation types
- `webview/src/components/Timeline/AutomationLaneView.tsx` — SVG breakpoint editor overlay
- `webview/src/hooks/useAutomationEditing.ts` — mouse interaction

**Modified files:**
- `AudioProjectData` — add `trackAutomation?: Record<string, IAutomationLane[]>`
- `TrackHeader.tsx` — add automation toggle button
- `MixStreamConfig` — add automation data
- **Engine**: interpolate automation values at sample block boundaries during mix

#### P1-PR3: Send/Return Bus

**Routing SSOT**: `AudioProjectData.buses` (IAudioBus[]) + `AudioTrackMixState.sends` (IAudioSend[]) + `AudioTrackMixState.outputId` (string) are the **only** persisted routing model. No separate `routingNodes` array — the Mixer and RoutingMatrix UI derive their views from these fields.

**New files:**
- `@neko/shared/types/audioRouting.ts` — IAudioBus, IAudioSend (see contracts above)
- `Mixer/SendSlot.tsx` — send level knob in channel strip
- `Mixer/BusStrip.tsx` — bus channel strip

**Modified files:**
- `AudioProjectData` — add `buses?: IAudioBus[]`
- `AudioTrackMixState` — add `sends?: IAudioSend[]`, `outputId?: string`
- `MixStreamConfig` — add `sends` + `buses`
- `MixerPanel.tsx` — render bus strips after track strips
- **Engine**: `AudioMixdown` change from linear track→master to graph (track→bus→master)

#### P1-PR4: Agent Tool Expansion

New `TOOL_NAMES_AUDIO` entries:
- `SetAutomation` — write automation breakpoints
- `GetTrackEffects` — read track effect chain
- `SetClipEffect` — apply effect to specific clip
- `CreateBus` — create send/return bus
- `SetSendLevel` — configure send routing

---

### P2: DAW-Ready Architecture + Plugin Interface (~2 PR)

#### P2-PR1: Abstract Track Types + Routing Matrix

- Finalize `AudioTrackCategory` enum usage across track creation UI
- New component `Routing/RoutingMatrix.tsx` — grid view **derived from** buses + trackMix (no separate routingNodes)
- Track creation dialog supports `audio` | `bus` types (P2); `instrument` | `midi` reserved for future

#### P2-PR2: Plugin Interface

- `@neko/shared/types/audioPlugin.ts` — IPluginDescriptor, IPluginState (see contracts above)
- 14 engine DSP effects registered as `format: 'builtin'` plugins
- New component `PluginBrowser.tsx` — browsable plugin list
- Future VST3/AU: engine-side only, webview uses same IPluginDescriptor interface

### P3: Step Sequencer (deferred)

Step sequencer is more relevant to music creation than audio post-production. Deferred to P3, scoped to SFX/rhythm asset generation only:
- `StepSequencer/StepSequencer.tsx` + `StepGrid.tsx`
- `audioPattern.ts` (StepPattern, StepRow)
- Pattern → trigger sample bank WAV → render as audio clip

---

## .nka Version Strategy

**Adopt additive extension with explicit version bumps:**

| Version | Content | Migration |
|---------|---------|-----------|
| `1.0` | Existing legacy files | `loadNka()` accepts, no transform needed |
| `2.0` | Current working format (tracks, masterEffectsChain, markers, trackMix, bpm, masterVolume) | `CURRENT_NKA_VERSION` set to `'2.0'` in P0-PR1 |
| `2.1` | + buses, trackAutomation, masterAutomation (P1) | Additive optional fields |

**Rules:**
- `loadNka()` accepts `'1.0'` and `'2.0'` without error; unknown future versions (e.g. `'99.0'`) open with warning and **preserve unknown fields on round-trip** (parse as `Record<string, unknown>`, overlay typed fields)
- `saveNka()` always writes `CURRENT_NKA_VERSION`
- All new fields are optional with `undefined` defaults — zero migration needed
- No separate `routingNodes` field — routing derived from `buses` + `trackMix.sends`

---

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Track mix state (volume/pan/solo/effectChain) persisted in `AudioProjectData.trackMix`, driven by EditOperations | Enables Undo/Redo, save/revert, Extension cache sync. Eliminates the local-only `trackUIState` SSOT gap. |
| D2 | Effect types use hyphenated names as canonical form | Matches Rust `effect_factory.rs`; agent tool schema, webview types, and engine all use the same names. |
| D3 | Agent tools use requestId/ack protocol for UI-mutating operations | Eliminates fire-and-forget; bridge can return actual success/failure from webview. |
| D4 | `postMessage` targets specific document panel, not broadcast | Prevents multi-document race conditions. |
| D5 | Routing model: `buses` + `trackMix.sends/outputId` (no separate `routingNodes`) | Single SSOT for routing. RoutingMatrix derives its view at render time. |
| D6 | Automation is data, not real-time DSP | Post-production = offline render; engine interpolates at mix time. |
| D7 | Plugin interface wraps builtin effects first | 14 engine effects → `format: 'builtin'`; VST3/AU is engine-side addition only. |
| D8 | Step sequencer deferred to P3 | Low relevance to post-production; scoped to SFX/rhythm asset generation. |
| D9 | `.nka` version `2.0` as explicit baseline, additive extensions only | Unifies the three inconsistent version claims; loadNka tolerates old versions. |
| D10 | P0-PR1a: Engine `audios:transcode` must support effects | Current TS→Engine effects pipeline is completely broken (silently ignored). Minimal Rust change: add optional `effects` field + process loop. Without this, all single-file effect operations are fake. |
| D11 | Effect types split: `EngineAudioEffectType` (13 renderable) vs `PlannedAudioEffectType` (3 UI-only) | Prevents Agent from assuming noise-reduction/pitch-shift/time-stretch can be rendered. Agent prompt fragments document which effects are engine-supported. |
| D12 | AudioDenoise applies noise-gate (honest), not spectral denoising | Engine has no spectral noise reduction. Noise-gate is the closest available primitive. Tool response clearly states what was applied. True denoising deferred to P2+ (ONNX ML model). |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| P0-PR2 is a large refactor (trackUIState split) | Incremental: first add `TrackMixOperation` types + apply functions, then migrate callers one action at a time; rename remainder to `trackViewState` last |
| P0-PR1a Rust change has blast radius | Minimal: only adds an optional field to `AudioTranscodeOptions` and an `if let Some(effects)` branch in the transcode impl. Existing behavior unchanged when `effects` is None. |
| Engine lacks per-element effects (P1-PR1) | Ship clip effect UI with "render on export" semantics; real-time preview degrades to track-level |
| Engine lacks automation interpolation (P1-PR2) | Ship automation editing UI; export-only rendering initially |
| Engine lacks stem separation (P0-PR3) | Tool returns honest `{ success: false, error: 'Not available' }` |
| Mixer panel height competes with timeline | Collapsible with user-resizable divider; default collapsed; `M` toggle |

---

## Verification

**P0-PR1a (Engine):**
- `cargo test` — transcode with gain effect produces audibly different output
- TS integration test: `audioService.transcode(file, out, { effects: [{ type: 'gain', params: { gainDb: -6 } }] })` → output is 6dB quieter

**P0-PR1b (Contract):**
- `pnpm build` passes
- `.nka` with `version: '1.0'` opens without error; `version: '99.0'` opens with warning but preserves unknown fields
- Effect type names consistent across TS types, agent schema, and preset JSON
- `EngineAudioEffectType` union matches exactly the 13 types in Rust `effect_factory.rs`

**P0-PR2 (State Model):**
- Open .nka → change volume → Save → Reopen → volume preserved
- Undo after volume change → reverts
- `buildMixStreamConfig()` reads from `trackMix` correctly

**P0-PR3 (Agent Tools):**
- Agent calls ApplyTrackEffect → webview ack → tool returns real result
- Agent calls AudioDenoise → engine transcodes → output path returned
- All 18 tools in switch: no `default` fallthrough for known tool names

**P0-PR4 (Mixer):**
- Mixer panel opens/closes, channel strips reflect project model
- Volume fader change in Mixer → TrackHeader reflects same value
- Undo works across both Mixer and TrackHeader

**P1/P2:** (see individual PR descriptions above)
