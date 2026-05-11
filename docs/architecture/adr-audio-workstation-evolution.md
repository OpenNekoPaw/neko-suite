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
├── AudioToolBridge        — Agent tool execution bridge (Extension-side apply for edits, HTTP for engine calls)
└── AgentCapabilityProvider — Tool/PromptFragment registration

Domain Layer (@neko/shared + neko-engine)
├── types/audioProject.ts  — AudioProjectData (.nka schema, SSOT for trackMix)
├── types/audioMix.ts      — MixStreamConfig, AudioEffectConfig
├── types/audioRouting.ts  — IAudioBus, IAudioSend (P1, unique routing model)
├── types/audioAutomation.ts — IAutomationLane, AutomationPoint (P1)
├── types/audioPlugin.ts   — IPluginDescriptor, IPluginState (P2)
├── operations/            — EditOperation types including track.mix.* (NEW)
├── nka/buildMixConfig.ts  — pure function: AudioProjectData → { config, warnings } (NEW)
└── neko-engine/           — Rust DSP, AudioMixdown, mix stream, NkaLoader (CLI)
```

---

### Data Ownership: Project Data vs Binary Data

```
┌─────────────────────────────────────────────────────────────────────┐
│ 工程数据 (JSON)                    │ 二进制数据 (音频文件)             │
│ Owner: Extension (TS)             │ Owner: Engine (Rust)             │
├───────────────────────────────────┼──────────────────────────────────┤
│ .nka 解析/验证/迁移/保存           │ 音频解码/编码/转码                │
│ EditOperation apply/invert/undo   │ DSP 效果器处理                   │
│ 构建 MixdownConfig                │ 多轨混音 (AudioMixdown)          │
│ Agent 工具编辑逻辑                 │ 波形生成/响度分析/静音检测         │
│ trackMix 状态管理                  │ 实时流推送 (WebSocket PCM)        │
│ .nka 版本策略                      │ 录音采集 (cpal)                  │
└───────────────────────────────────┴──────────────────────────────────┘
```

**原则**: Extension 处理"做什么"（工程语义），Engine 处理"怎么做"（音频计算）。Engine 接收 `MixdownConfig`（渲染指令），不关心它从哪来。

### Engine 双入口：在线编辑 vs CLI 离线渲染

```
入口 A — VSCode 在线编辑 (Extension 是 SSOT):
  Extension 解析 .nka → 编辑 → buildMixStreamConfig()
    → HTTP POST audios:mix_stream { config }
    → Engine 渲染 (无状态，不缓存 config)

入口 B — CLI 离线渲染 (Engine 独立运行):
  $ neko-engine export project.nka -o output.wav
    → host-cli: NkaLoader 读 .nka JSON → 构建 MixdownConfig
    → engine-kernel: AudioMixdown.export(config, output)
    → 输出文件 (不需要 VSCode/Extension)
```

**Engine .nka 支持的约束:**
- `NkaLoader` 放在 `host-cli`（不放 `engine-kernel`）— kernel 只认 MixdownConfig
- NkaLoader 是**只读**的：load → build config → render。不做编辑、不保存、不维护 undo
- NkaLoader 不做版本迁移 — CLI 只支持 `CURRENT_NKA_VERSION`，旧版本提示用户先在 VSCode 中打开升级
- 在线编辑时 Extension 仍是唯一 SSOT，Engine 不缓存工程状态

**neko-cut 同理** — Engine 的 `host-cli` 也应该能 `neko-engine export project.nkv -o output.mp4`，使用同样的 NkvLoader → RenderConfig 模式。这是跨项目的统一 CLI 渲染入口。

### Agent Edit Execution Model (Extension-Side, matching neko-cut)

```
Agent tool call (e.g. SetTrackVolume)
  │
  ▼
AudioToolBridge (Extension process)
  │ session = gateway.resolveProjectSession(documentUri)
  │ op = { type: 'track.mix.setVolume', payload: { trackId, volume }, before: { volume: old } }
  │ newData = applyOperation(session.data, op)   ← pure function (@neko/shared)
  │ gateway.updateProjectData(documentUri, newData, op)
  │ gateway.notifyWebview(documentUri, newData, op)
  │ return { success: true }
  │
  ▼
AudioProjectProvider
  │ _projectDataCache.set(docUri, newData)
  │ fire onDidChangeCustomDocument (dirty)
  │ postMessage({ type: 'project:sync', projectData, operation: op })
  │
  ▼
Webview (receives project:sync)
  │ set({ audioProjectData: projectData })
  │ push op to opUndoStack (user can Ctrl+Z to undo Agent's edit)
```

**Why Extension-side execution (not Webview postMessage round-trip):**
- Deterministic result — `applyOperation()` is a pure function that succeeds or throws
- No timeout/correlation needed — same process, synchronous
- Matches neko-cut's `TimelineToolExecutor` pattern (proven, working)
- Webview is notified to sync, not asked to execute

### P1 Evolution: Hot-Update for Real-Time Preview

```
P0 (current): stop + restart stream on every edit
  edit → buildMixStreamConfig(newData) → stop stream → start new stream with new config

P1 (hot-update): edit reflects immediately in playing stream
  edit → buildMixStreamConfig(newData) → HTTP POST mix_stream { action: 'update', streamId, config }
  → Engine replaces in-memory config → next audio buffer uses new params
  → User hears change instantly (no gap)
```

#### Engine-Side Readiness Analysis

| Layer | Component | Status | Notes |
|-------|-----------|--------|-------|
| `engine-kernel` | `AudioMixdown::update_config(config)` | **Done** | Replaces tracks/effects/volume, opens decoders for new sources |
| `engine-kernel` | `PlaybackState` (watch channel) | **Missing `mixdown_update` field** | Has `timeline_update` (neko-cut) and `config_update` (preview) as reference |
| `engine-kernel` | `audio_mix_stream.rs` loop | **Does not read update field** | Only reads seek/pause/speed/loop_region |
| `host-api` | `mix_stream update` action | **Stub** — parses config but returns `update_not_yet_supported` | TODO(P1) comment in code |
| `host-api` | `ActiveStreams::update_timeline()` | **Done** (neko-cut reference) | Same pattern needed for mixdown |

#### Implementation (small delta — follow neko-cut `timeline_update` pattern)

```rust
// 1. PlaybackState — add fields (engine-kernel/src/services/impls/stream_loop.rs)
pub struct PlaybackState {
    // ... existing fields ...
    pub mixdown_update: Option<Arc<MixdownConfig>>,
    pub mixdown_seq: u64,
}

// 2. audio_mix_stream.rs — read update in loop
let mut last_mixdown_seq: u64 = 0;
// ... inside loop, after seek/pause/speed handling:
if state.mixdown_seq != last_mixdown_seq {
    last_mixdown_seq = state.mixdown_seq;
    if let Some(ref new_config) = state.mixdown_update {
        mixdown.update_config((*new_config).clone());
        // Recalculate total_duration for EOF check
        total_duration = mixdown.total_duration();
    }
}

// 3. ActiveStreams — add method (or reuse update_state)
pub async fn update_mixdown(
    &self,
    stream_id: &StreamId,
    config: Arc<MixdownConfig>,
) -> Result<()> {
    self.update_state(stream_id, |s| {
        s.mixdown_update = Some(config);
        s.mixdown_seq += 1;
    }).await
}

// 4. host-api mix_stream update action — replace TODO stub
"update" => {
    let stream_id = parse_stream_id(opts.stream_id)?;
    let config: MixdownConfig = serde_json::from_value(opts.config?)?;
    active_streams.update_mixdown(&stream_id, Arc::new(config)).await?;
    Ok(ActionResponse::ok("", json!({ "streamId": stream_id, "status": "updated" })))
}
```

#### neko-cut Reference (already working)

neko-cut's video preview stream uses the identical pattern:
- `PlaybackState.timeline_update: Option<Arc<Timeline>>` + `timeline_seq`
- `ActiveStreams::update_timeline(stream_id, timeline)` sets the field
- Video stream loop detects `timeline_seq` change → calls `pipeline.update_timeline()`
- `host-api` `videos:preview update` action triggers it

The audio mix stream implementation is a direct copy of this pattern with `MixdownConfig` replacing `Timeline`.

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

### Agent → Webview Sync Protocol (P0 — notification only)

```typescript
// Extension → Webview: state sync after agent edit (notification, not request)
// Webview replaces its local audioProjectData with the provided data.
interface ProjectSyncMessage {
  type: 'project:sync';
  projectData: AudioProjectData;
}

// Webview → Extension: user UI edits (unchanged)
// { type: 'operationApplied', operation: EditOperation }
// Agent edits do NOT go through this path — they are applied in Extension directly.
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

/** Set of planned-only types for runtime rejection */
export const PLANNED_EFFECT_TYPES: Set<string> = new Set(['noise-reduction', 'pitch-shift', 'time-stretch']);

// Runtime rejection points (ALL must reject planned types before they reach the engine):
// 1. AudioToolBridge.applyTrackEffect() — check effectType against PLANNED_EFFECT_TYPES → return error with message
// 2. audioProjectStore.buildMixStreamConfig() — returns { config, warnings } tuple.
//    Caller (playback/export) decides how to surface warnings (toast on export, ignore on playback).
//    buildMixStreamConfig itself is a PURE builder — no side effects, no toast.
// 3. AudioProjectProvider 'editor:applyEffects' handler — reject planned types with user-facing toast
// 4. AudioProjectProvider 'editor:denoise' handler — see P0-PR1b (changed to noise-gate or disabled)
// 5. Rust factory fallback changed from passthrough Gain(0) to Err() in P0-PR1a — hard rejection
// Key: NEVER silently drop — always inform the user that planned effects were excluded from render

// === Type/effectType field naming boundary ===
// Two effect shapes coexist in the codebase:
//   AudioEffectSnapshot { id, type, name, enabled, params }  — UI-facing, used in .nka masterEffectsChain + audio.effect.* operations
//   AudioEffectConfig   { id, effectType, enabled, params }  — Engine-facing, used in MixStreamConfig + .nka trackMix[].effectChain
//
// .nka persistence boundary:
//   masterEffectsChain: AudioEffectSnapshot[] (has `type` + `name`)
//   trackMix[trackId].effectChain: AudioEffectConfig[] (has `effectType`, no `name`)
//
// This split already exists in the codebase and P0 does NOT unify them (too large a migration).
// Conversion points:
//   - buildMixStreamConfig(): maps masterEffectsChain snapshot.type → config.effectType for master bus
//   - TrackMixOperation payloads use AudioEffectConfig directly (track effects are engine-facing)
//   - loadNka() normalizes BOTH: masterEffectsChain[].type AND trackMix[].effectChain[].effectType
//
// Both use hyphenated values ('parametric-eq', 'noise-gate', etc.)
// Future P1+: consider unifying to a single shape (likely AudioEffectConfig + optional `name`)

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

The Rust `create_effect()` accepts `&AudioEffectConfig`:
```rust
pub struct AudioEffectConfig {
    pub id: String,
    pub effect_type: String,   // "gain", "compressor", "noise-gate", etc.
    pub enabled: bool,         // default true
    pub params: serde_json::Value,  // effect-specific params
}
```

And `build_effect_chain(&[AudioEffectConfig]) -> Result<EffectChain>` already exists — it iterates configs, calls `create_effect()` for each, and pushes into `EffectChain` with `push(id, enabled, effect)`.

**TS → Rust mapping**: The TS `AudioEffectConfig` type (`@neko/shared/types/audioMix.ts`) has shape `{ id, effectType, enabled, params }`. The wire JSON matches this shape. However, the Rust domain layer (`AudioTranscodeOptions`) carries `Vec<serde_json::Value>` to avoid DSP dependency. The kernel transcode impl deserializes `Value` → `AudioEffectConfig` at the point of use. So: **wire format matches AudioEffectConfig shape; domain carries normalized JSON; kernel deserializes.**

The single-file UI currently sends `{ type, params }` (without `id`/`enabled`). The host-api controller normalizes this at the HTTP boundary: if `id` is missing, generate one; if `enabled` is missing, default to `true`; map `type` → `effectType`. The result is canonical JSON that the kernel can later deserialize into `AudioEffectConfig`.

##### Parameter Units (IMPORTANT — must match Rust)

| Effect | Param | Unit | Example |
|--------|-------|------|---------|
| noise-gate | `threshold` | dB | -40.0 |
| noise-gate | `attack` | **ms** | 1.0 |
| noise-gate | `hold` | **ms** | 50.0 |
| noise-gate | `release` | **ms** | 100.0 |
| compressor | `threshold` | dB | -24.0 |
| compressor | `attack` | **ms** | 10.0 |
| compressor | `release` | **ms** | 100.0 |
| compressor | `ratio` | ratio | 4.0 |
| compressor | `knee` | dB | 6.0 |
| compressor | `makeupGain` | dB | 0.0 |
| limiter | `threshold` | linear (0-1) | 0.95 |
| limiter | `ceiling` | linear (0-1) | 1.0 |
| limiter | `release` | **ms** | 50.0 |
| gain | `gainDb` | dB | -6.0 |
| reverb | `roomSize` | 0-1 | 0.5 |
| delay | `delayMs` | **ms** | 250.0 |

Agent prompt fragments MUST document these units. TS webview effect parameter definitions must match.

##### EffectChain Lifecycle (CRITICAL for stateful effects)

Reverb, delay, chorus, compressor, and noise-gate all maintain internal state (feedback buffers, envelope followers, allpass filters). The `EffectChain` MUST be:
1. **Built once** before the decode/encode loop begins
2. **Reused across all buffer frames** — `process()` called per-frame, state accumulates
3. **Never rebuilt per-frame** — that would reset tails, feedback, and envelopes

**Tail drain limitation (P0 scope)**: The `AudioEffect` trait has no `flush()`/`tail_length()` method. After input EOF, reverb/delay tails are truncated. P0 does NOT extend output duration for tails — this is acceptable for post-production (user can add silence at end if needed). A future PR can add `fn tail_samples(&self) -> usize` to the trait and feed zero-buffers after EOF.

```rust
// CORRECT: deserialize Vec<Value> → Vec<AudioEffectConfig>, build chain once, process per-frame
let mut chain = if let Some(effect_values) = &opts.effects {
    let configs: Vec<AudioEffectConfig> = effect_values
        .iter()
        .map(|v| serde_json::from_value(v.clone()))
        .collect::<Result<_, _>>()?;
    Some(build_effect_chain(&configs)?)
} else {
    None
};

// In decode loop:
loop {
    let samples = decoder.next_frame()?;
    // ... time_range slice if needed ...
    if let Some(chain) = &mut chain {
        chain.process(&mut buffer, channels, sample_rate);
    }
    encoder.write_frame(&buffer)?;
}
// NOTE: reverb/delay tails are truncated at EOF (no tail drain in P0)
```

##### Trim: Add `start_time`/`end_time` to TranscodeRequestOptions

Current state: `TranscodeRequestOptions` has no time fields. `AudioTranscodeOptions` has `time_range: Option<(f64, f64)>`. The TS `AudioService.transcode()` passes `startTime`/`endTime` as opaque options — Rust ignores them.

Engine already has `audios:segment` action but it returns base64 (not file output). For file-to-file trim + effects in one call, add time fields to transcode.

**Decision**: Add `start_time: Option<f64>` and `end_time: Option<f64>` to `TranscodeRequestOptions` and map to `AudioTranscodeOptions.time_range` in the controller.

**Wire field naming (important)**:
- Rust struct field: `start_time: Option<f64>` (snake_case)
- HTTP JSON wire: `startTime` / `endTime` (camelCase) — because `TranscodeRequestOptions` uses `#[serde(rename_all = "camelCase")]`
- TS sends: `startTime` / `endTime` — matches wire format, no conversion needed
- P0 trim is **frame-level** (not sample-accurate): decoder skips frames before `start_time`, stops after `end_time`. Output timestamps rebased to 0.

##### Modified files (Rust):

**Layer boundary for effects deserialization:**
```
HTTP request JSON → host-api controller (normalize legacy format) → domain options (Vec<Value>) → kernel transcode impl (deserialize → AudioEffectConfig → build_effect_chain)
```
- `host-api` controller: only normalizes legacy `{ type, params }` → canonical `{ id, effectType, enabled, params }` JSON shape. Does NOT import `AudioEffectConfig` type.
- `engine-kernel` transcode impl: receives `Vec<serde_json::Value>`, deserializes each into `AudioEffectConfig`, calls `build_effect_chain()`. This is the single point where DSP types are introduced.

**Files:**
- `engine-kernel/src/domain/options.rs` — add `effects: Option<Vec<serde_json::Value>>` to `AudioTranscodeOptions`. Domain stays free of DSP dependency.
- `host-api/src/controllers/audio.rs`:
  - `TranscodeRequestOptions` add: `effects: Option<Vec<serde_json::Value>>`, `start_time: Option<f64>`, `end_time: Option<f64>`
  - Controller: normalize legacy format (if entry has `type` but no `effectType`, rename; add default `id`/`enabled`); map `start_time`/`end_time` → `time_range`; pass normalized `Vec<Value>` into `AudioTranscodeOptions.effects`
- `engine-kernel/src/services/impls/audio.rs` (transcode impl):
  - Before decode loop: if `effects.is_some()`, `serde_json::from_value::<Vec<AudioEffectConfig>>()` then `build_effect_chain()`
  - In decode loop: call `chain.process(&mut buffer, channels, sample_rate)` per frame
  - Chain lives for the entire transcode operation (stateful effects work correctly)
  - No tail drain after EOF (P0 limitation — documented above)
- `engine-kernel/src/audio/dsp/effect_factory.rs` — **change unknown effect fallback from passthrough Gain(0) to `Err()`**. Current behavior (line ~146) silently creates a no-op gain for unknown types. P0 changes this to return an error so callers (transcode, mix_export) can surface "unsupported effect type: X" rather than succeeding with no audible change. `build_effect_chain()` propagates the error. **Also add underscored aliases** as a migration safety net: `"noise_gate"` → same as `"noise-gate"`, `"parametric_eq"` → same as `"parametric-eq"`, etc. This ensures old presets/projects that slip past TS normalization don't hard-fail at the engine level. The aliases are deprecated (TS layer should always send hyphenated) but prevent data loss.
- `host-api/src/controllers/audio.rs` — also add `format: Option<String>` as alias for `codec` in `TranscodeRequestOptions`. TS sends `format` (via `AudioService.transcode()`), Rust currently only has `codec`. Accept both: `let codec = opts.codec.or(opts.format);`. This fixes the format/codec field drift between TS and Rust without breaking existing callers.

**Verification:**
- `cargo test` — unit test: transcode with `[{ "id": "g1", "effectType": "gain", "enabled": true, "params": { "gainDb": -6.0 } }]` → output is 6dB quieter
- `cargo test` — unit test: transcode with `start_time: 1.0, end_time: 3.0` → output is approximately 2s (P0 uses frame-level trim, not sample-accurate; output duration may vary by ±1 frame depending on codec frame size. Output timestamps are rebased to 0.)
- `cargo test` — unit test: transcode with reverb effect on input that has trailing silence (impulse at t=0, 3s of silence after) → reverb tail audible in the silence region (proves chain state persists across frames without relying on tail drain)
- TS integration: `audioService.transcode(file, out, { effects: [{ type: 'gain', params: { gainDb: -6 } }], startTime: 0, endTime: 5 })` → engine applies both trim and gain

#### P0-PR1b: TS Contract Alignment + Unified Message Protocol

**Goal**: Unify effect type naming, fix .nka version, split effect types, fix param name bugs, clarify fade handling, **unify webview↔extension message protocol under `audio:*` namespace**.

##### Unified `audio:*` Message Protocol

Current state: webview sends 15+ message types with inconsistent prefixes (`editor:*`, `project:*`). These are all audio domain operations that should share a single namespace. The Extension routes them to the appropriate engine call based on current mode.

##### Control Plane vs Data Plane (already separated — preserve this)

```
Control Plane (IPC + HTTP):
  Webview ─ postMessage ─▶ Extension ─ HTTP POST ─▶ Engine
  (audio:playback, audio:export, audio:trim, audio:analyze, etc.)

Data Plane (WebSocket, direct Webview↔Engine):
  Engine ═══ WebSocket (PCM binary frames) ═══▶ Webview AudioStreamClient
  (ws://127.0.0.1:{port}/v1/streams/{streamId})
```

Key design: audio data bypasses Extension entirely. Extension only handles control commands (create/pause/seek/stop stream) via HTTP. Webview connects directly to Engine's WebSocket for low-latency PCM playback. This separation is correct and must be preserved in the `audio:*` migration.

Flow for `audio:playback { action: 'play' }`:
1. Webview → postMessage `audio:playback` → Extension (control)
2. Extension → HTTP `audios:stream` or `audios:mix_stream` → Engine creates stream, returns `streamId`
3. Extension → postMessage `audio:playbackReady { streamId, wsUrl }` → Webview
4. Webview → `new AudioStreamClient({ websocketUrl: wsUrl })` → direct WS to Engine (data)
5. Subsequent pause/seek/stop: Webview → postMessage → Extension → HTTP `controlStream()` → Engine

**Migration:**

| Current (remove) | Unified (new) | Extension routing |
|-----------------|---------------|-------------------|
| `editor:play` / `project:mixStreamStart` | `audio:playback { action: 'play', startTime? }` | single-file → `audioService.startStream(filePath)`; project → Extension calls `buildMixStreamConfig(projectData)` internally then `audioService.startMixStream(config)`. Webview does NOT send config — Extension owns the project data via cache and builds config on demand. |
| `editor:pause` | `audio:playback { action: 'pause' }` | `audioService.pauseStream()` |
| `editor:resume` | `audio:playback { action: 'resume' }` | `audioService.resumeStream()` |
| `editor:stop` / `project:mixStreamStop` | `audio:playback { action: 'stop' }` | `audioService.stopStream()` |
| `editor:seek` | `audio:playback { action: 'seek', time }` | `audioService.seekStream()` |
| `editor:speed` | `audio:playback { action: 'speed', speed }` | `audioService.setStreamSpeed()` |
| `editor:trim` | `audio:trim { startTime, endTime }` | `audioService.transcode(... { startTime, endTime })` |
| `editor:denoise` | `audio:applyEffect { effects: [{ type: 'noise-gate', ... }] }` | `audioService.transcode(... { effects })` |
| `editor:normalize` | `audio:applyEffect { effects: [{ type: 'gain', params: { gainDb } }] }` | analyze loudness → compute gain → transcode |
| `editor:applyEffects` | `audio:applyEffect { effects: [...] }` | `audioService.transcode(... { effects })` |
| `editor:analyzeLoudness` | `audio:analyze { type: 'loudness' }` | `audioService.analyzeLoudness()` |
| `editor:detectSilence` | `audio:analyze { type: 'silence', threshold?, minDuration? }` | `audioService.detectSilence()` |
| `editor:exportAs` / `project:mixExport` | `audio:export { format, bitrate?, sampleRate?, channels?, outputPath? }` | single-file → transcode; project → buildMixStreamConfig → mixExport |
| `editor:listInputDevices` | `audio:recording { action: 'listDevices' }` | `audioService.listInputDevices()` |
| `editor:recordStart` | `audio:recording { action: 'start', deviceId?, sampleRate?, channels? }` | `audioService.recordStart()` |
| `editor:recordStop` | `audio:recording { action: 'stop', streamId }` | `audioService.recordStop()` |

**Response messages** follow the same pattern: `audio:playbackReady`, `audio:trimResult`, `audio:effectResult`, `audio:analyzeResult`, `audio:exportResult`, `audio:recordingResult`.

**Benefits:**
- Agent and webview use the same semantic namespace
- Extension is the single routing decision point (mode-aware)
- New operations (e.g. `audio:stemSeparate`) naturally fit the namespace
- Agent project-edit tools (`ApplyTrackEffect`, `SetTrackVolume`, etc.) do NOT go through `audio:*` messages — they use `agent:*` typed messages and the Extension dispatches EditOperations to webview via `postToDocument()` (fire-and-forget, confirmed via `operationApplied` back-channel). Agent engine tools (`AudioDenoise`, `MixExport`, `AnalyzeAudioLoudness`) call `audioService` directly in Extension. Only webview user actions send `audio:*` messages.

**Migration strategy**: P0-PR1b introduces the new `audio:*` handlers in Provider alongside existing `editor:*`/`project:*` handlers (both work). P0-PR4 (Mixer) uses only `audio:*`. Existing `editor:*`/`project:*` handlers are deprecated and removed in P1.

##### Modified files:

- `@neko/shared/types/audioEffectTypes.ts` (new) — define `EngineAudioEffectType` (13 types), `PlannedAudioEffectType` (3 types), `AudioEffectType` union (see contract above)
- `@neko/shared/types/audioMix.ts` — update `AudioEffectType` to use hyphenated names matching Rust factory; remove underscored aliases (`parametric_eq` → `parametric-eq`, `noise_gate` → `noise-gate`, etc.)
- `@neko/shared/types/audioMessages.ts` (new) — define `AudioMessage` union type for all `audio:*` request/response messages. Shared between webview and extension (both import from `@neko/shared`) to ensure type-safe message contracts on both sides of the postMessage boundary.
- `webview/src/types/audioEffects.ts` — change `AudioEffectType` to hyphenated names; import from shared types; mark `noise-reduction`/`pitch-shift`/`time-stretch` as `planned: true` in `AUDIO_EFFECT_DEFINITIONS`; **remove `fade-in`/`fade-out` from effect types** (fades are not DSP effects — they are envelope params on `MixElementConfig.fadeIn/fadeOut`)
- `extension/src/agentCapabilityProvider.ts` — fix effectType enum from underscored to hyphenated; add description note for planned-only types
- `extension/src/providers/AudioProjectProvider.ts`:
  - **Add `audio:*` message handlers** (new unified protocol)
  - **Fix normalize**: `{ type: 'gain', params: { gainDb: gainDb } }` (Rust factory reads `gainDb`, not `gain`)
  - **Fix denoise**: `{ type: 'noise-gate', params: { threshold: -40, attack: 1, hold: 50, release: 100 } }`. Show toast: "Applied noise-gate (spectral noise reduction not available)"
  - **Fade**: disabled in single-file mode (toast: "Fade requires project mode"); project mode sets per-element `fadeIn`/`fadeOut`
  - **Save path**: `saveCustomDocument()` must call `saveNka(data)` instead of raw `JSON.stringify()`
  - **Deprecate** `editor:*` / `project:*` handlers (keep working, log deprecation warning)
- `webview/src/editor/AudioEditor.tsx` — migrate command handlers to send `audio:*` messages; remove fake fade effect types
- `webview/src/hooks/useAudioPlayback.ts` — send `audio:playback` instead of `editor:play`/`editor:pause`/etc.
- `nka/codec.ts` — set `CURRENT_NKA_VERSION = '2.0'`; `loadNka()` add version detection (accept `'1.0'` | `'2.0'`; unknown future versions open read-only with warning); **add legacy effect type normalization on load**: `parametric_eq` → `parametric-eq`, `noise_gate` → `noise-gate` (applied to `masterEffectsChain[].type` and `trackMix[].effectChain[].effectType`). Only normalize types that have a known engine-supported hyphenated equivalent. Do NOT normalize `high_shelf`/`low_shelf` to top-level effects — these only appear as parametric-eq band sub-types (`params.bands[].type`) and are handled by the EQ implementation internally, not by the effect factory.
- `presets/*.json` — update all preset files to use hyphenated effect type names (one-time migration: `noise_gate` → `noise-gate`, `parametric_eq` → `parametric-eq`). EQ band sub-types (`highshelf`, `lowshelf`, `peaking`, `highpass`) remain unchanged — they are internal to parametric-eq params, not top-level effect types. Also fix time params from seconds to ms where applicable (e.g. `attack: 0.001` → `attack: 1`).
- `nka/validator.ts` — validate `version` field; warn on `> 2.0`
- `types/audioProject.ts` — update `AudioTrackMixState` comment to remove misleading "v2.1"

**Verification:**
- `pnpm build` passes
- `.nka` with `version: '1.0'` opens without error; `version: '99.0'` opens read-only with warning
- Effect type names consistent across TS types, agent schema, and preset JSON
- `EngineAudioEffectType` union matches exactly the 13 types in Rust `effect_factory.rs`
- Normalize command sends `gainDb` param (not `gain`)
- Fade commands no longer send fake effect types to engine

#### P0-PR2: Promote Track Mix State to Project Model

**Goal**: Make volume/pan/solo/effectChain changes persist to `.nka`, support Undo/Redo, and sync to Extension cache.

**New types in `@neko/shared/operations/types.ts`:**
- `TrackMixOperation` type union (see contract above)
- Add `TrackMixOperation` to the `EditOperation` union type

**New file:**
- `@neko/shared/operations/trackMixOperations.ts` — `applyTrackMixOperation()` + `invertTrackMixOperation()` pure functions

**Modified central entry points** (required for operations to actually route):
- `@neko/shared/operations/types.ts` — add `TrackMixOperation` to `EditOperation` union
- `@neko/shared/operations/apply.ts` — add `track.mix.*` cases to the operation router (calls `applyTrackMixOperation`)
- `@neko/shared/operations/invert.ts` — add `track.mix.*` cases to the invert router (calls `invertTrackMixOperation`)
- `@neko/shared/operations/index.ts` — export new functions
- `@neko/shared/operations/__tests__/trackMixOperations.test.ts` — unit tests for apply + invert roundtrip

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
- `audioProjectStore.ts` :: `buildMixStreamConfig()` — read from `audioProjectData.trackMix` instead of `trackUIState`; **return type changes to `{ config: MixStreamConfig; warnings: string[] }`** (pure builder, no side effects). Planned effects filtered out with warning messages.
- **Extract `buildMixStreamConfig()` as pure function to `@neko/shared/nka/buildMixConfig.ts`** — takes `AudioProjectData` as input, returns `{ config, warnings }`. No Zustand dependency. Both webview store and Extension bridge import the same function. Store action wraps it; Extension calls it directly for Agent MixExport.
- **Callers of `buildMixStreamConfig()` must migrate:**
  - `hooks/useAudioPlayback.ts` (~line 163) — destructure `{ config }`, ignore `warnings` (playback is preview, no need to warn)
  - `ExportPanel.tsx` — sends `audio:export { format, ... }`. Extension handles mode routing internally.
  - `hooks/useAudioPlayback.ts` — sends `audio:playback { action: 'play', startTime? }`. Extension builds mix config from its own project cache (webview no longer sends config). Playback hook only needs to track streamId/state from the `audio:playbackReady` response.
  - `AudioToolBridge.mixExport()` — calls `buildMixStreamConfig(session.data)` directly in Extension (see P0-PR3)
  - Tests — verify tuple return shape
- `extension/src/providers/AudioProjectProvider.ts` — `operationApplied` handler: add `track.mix.*` to the operation router; `audio:export` handler routes per mode (see P0-PR1b protocol table)
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

#### P0-PR3: Agent Tool Bridge Completion + Extension-Side Execution

**Goal**: Ensure all 18 TOOL_NAMES_AUDIO entries have an execution path; target specific documents; project-edit tools return honest success/failure.

**Key insight from neko-cut**: neko-cut's `TimelineToolExecutor` applies tool operations as **pure functions on project data in Extension**, then writes back to the model. It never sends postMessage to webview and waits for confirmation. The webview is notified to refresh, but the operation result is determined synchronously in Extension.

**neko-audio should adopt the same pattern:**

```
Agent → AudioToolBridge.applyTrackEffect(args)
  → session = gateway.resolveProjectSession(args.documentUri)
  → newData = applyTrackMixOperation(session.data, operation)  // pure function, @neko/shared
  → gateway.updateProjectData(session.documentUri, newData)    // update Extension cache + fire dirty
  → gateway.notifyWebview(session.documentUri, newData)        // postMessage project:sync to refresh UI
  → return { success: true }                                   // real result — operation already applied
```

**Why no correlationId / ack needed:**
- Operation is applied in Extension (same process as bridge) — result is deterministic
- `applyTrackMixOperation()` is a pure function that either succeeds or throws
- Webview is notified to sync its state, but the source of truth is Extension cache
- This matches neko-cut's proven pattern (`TimelineToolExecutor`)
- No postMessage round-trip, no timeout, no race condition

**Data flow after this change:**

```
Source of truth: Extension _projectDataCache (same as current)

Agent edit:
  Bridge → applyOperation(cache) → update cache → notify webview → return result

User UI edit:
  Webview dispatch → syncOperationToExtension (operationApplied) → Extension applies to cache

Both paths converge on the same cache. Webview and Extension stay in sync.
```

**Communication channel analysis:**

| Channel | Needs requestId? | Reason |
|---------|-----------------|--------|
| postMessage (Webview→Extension): `audio:*` user actions | No | Extension is sole consumer; responses use distinct message types |
| postMessage (Extension→Webview): `project:sync` after agent edit | No | Notification only — webview replaces its state, no confirmation needed |
| HTTP (Extension→Engine) | No | HTTP is inherently request/response |
| WebSocket (Engine→Webview) | No | Pure data stream |

**New types:**

```typescript
// @neko/shared/types/audioMessages.ts (shared between webview + extension)

/** Atomic project session snapshot — guarantees data and URI are from the same document */
export interface ProjectSession {
  documentUri: string;
  data: AudioProjectData;
}

/** Gateway interface for AudioToolBridge — single dependency for all project access */
export interface AudioProjectSessionGateway {
  /**
   * Atomically resolve a project session.
   * If documentUri is provided, returns that document's data.
   * If omitted, returns the focused document's data.
   * Returns null if no matching document is open.
   */
  resolveProjectSession(documentUri?: string): ProjectSession | null;
  /**
   * Apply an operation to the project data cache and fire dirty event.
   * Returns the updated data, or throws if operation fails.
   */
  updateProjectData(documentUri: string, newData: AudioProjectData): void;
  /**
   * Notify webview to sync its state from the updated project data.
   * Fire-and-forget — webview replaces its local state.
   */
  notifyWebview(documentUri: string, data: AudioProjectData): void;
}
```

**Responsibility split:**
- `AudioProjectProvider` **implements** `AudioProjectSessionGateway`:
  - `resolveProjectSession(uri?)` — if uri provided, looks up `_projectDataCache.get(uri)` and returns `{ documentUri: uri, data }`; if omitted, uses focused panel URI (tracked via `onDidChangeViewState`). Atomic: data and URI always from same document.
  - `updateProjectData(docUri, newData)` — sets `_projectDataCache.set(docUri, newData)` + fires `onDidChangeCustomDocument` (dirty event)
  - `notifyWebview(docUri, data)` — sends `{ type: 'project:sync', projectData: data }` to the target panel. Webview replaces its store state.
- `AudioToolBridge` constructor takes `gateway: AudioProjectSessionGateway` + `audioService: AudioService` — clean dependency injection, no direct Provider access

**Modified files:**
- `@neko/shared/types/audioMessages.ts` — define `AudioMessage` union (for `audio:*`), `AgentEditMessage` type (for agent→webview project edits), `ProjectSession`, `AudioProjectSessionGateway` interface. Both webview and extension import from here.
- `extension/src/types/api.ts` — re-export gateway interface from `@neko/shared`
- `extension/src/services/audioToolBridge.ts`:
  - Constructor: `constructor(private gateway: AudioProjectSessionGateway, private audioService: AudioService)`
  - Read tools (`GetAudioProjectInfo`, `ListAudioTracks`) → `gateway.resolveProjectSession(args.documentUri?)`. Returns `{ documentUri, data }` atomically — response includes both project info AND the resolved `documentUri` for subsequent calls.
  - Project-edit tools: `const session = gateway.resolveProjectSession(args.documentUri)` → if `!session` return `{ success: false, error: 'No audio project open' }` → `const newData = applyTrackMixOperation(session.data, operation)` (pure function, may throw) → `gateway.updateProjectData(session.documentUri, newData)` → `gateway.notifyWebview(session.documentUri, newData)` → return `{ success: true }`
  - `MixExport` tool: resolves project session → calls `buildMixStreamConfig(session.data)` **in Extension** (pure function, moved to shared layer or duplicated as Extension-side helper) → gets `{ config, warnings }` → calls `audioService.mixExport(config, outputPath, format)` → returns `{ output, warnings }` to Agent. This avoids the round-trip to webview for export — Extension has the project data via gateway and can build the config directly.
    - **Note**: `buildMixStreamConfig()` must be extractable as a pure function that takes `AudioProjectData` as input (no Zustand dependency). P0-PR2 refactors it accordingly: the store action calls the pure function, and the Extension can import the same function from `@neko/shared`.
  - Engine tools → call `audioService` directly
  - `AudioDenoise` → `audioService.transcode(input, output, { effects: [{ type: 'noise-gate', params: { threshold: -40, attack: 1, hold: 50, release: 100 } }] })`. Returns `{ success: true, data: { output, note: 'Applied noise-gate (threshold-based). Spectral noise reduction not available.' } }`
  - `StemSeparation` → `{ success: false, error: 'Stem separation requires ML model not yet available in engine' }` (honest failure)
- `extension/src/agentCapabilityProvider.ts`:
  - All UI-mutating tool schemas AND `MixExport` add optional `documentUri` parameter: `{ type: 'string', description: 'Target document URI (from GetAudioProjectInfo/ListAudioTracks). If omitted, uses focused document.' }` — MixExport needs it to resolve the project session for config building.
  - `GetAudioProjectInfo` and `ListAudioTracks` schemas add optional `documentUri` input param; responses include `documentUri` field
  - Agent prompt fragment documents the pattern: "Call GetAudioProjectInfo first to obtain documentUri, then pass it to subsequent tools"
- `extension/src/providers/AudioProjectProvider.ts`:
  - Implement `AudioProjectSessionGateway` interface
  - Add `audio:*` message handlers (new unified protocol)
  - Implement `postToDocument()` for targeted agent messages
  - Keep `postToActivePanels()` for broadcast events (project:init, etc.) — NOT for agent operations
- `webview/src/editor/AudioEditor.tsx`:
  - Handle `agent:*` messages → execute store dispatch (EditOperation)
- `extension/src/agentCapabilityProvider.ts`:
  - Expand `getPromptFragments()`:
    - Effect types are **hyphenated** (parametric-eq, not parametric_eq)
    - `noise-reduction`, `pitch-shift`, `time-stretch` are **UI-only** — not rendered by engine
    - Engine-renderable effects: gain, high-pass, low-pass, band-pass, notch, parametric-eq, compressor, noise-gate, limiter, reverb, delay, chorus, distortion
    - Common workflows (podcast chain, scoring mix, TTS dialog)
    - Unit conventions (volume 0.0-2.0, pan -1.0-1.0)

**Complete bridge tool checklist (15 tools via AudioToolBridge):**

| # | Tool | Category | Implementation | Return |
|---|------|----------|---------------|--------|
| 1 | `GetAudioProjectInfo` | read | `gateway.resolveProjectSession(args.documentUri)` → extract metadata | `{ documentUri, name, bpm, sampleRate, channels, trackCount, masterVolume, ... }` |
| 2 | `ListAudioTracks` | read | `gateway.resolveProjectSession(args.documentUri)` → map tracks | `{ documentUri, tracks: [{ id, name, type, muted, locked, elementCount }] }` |
| 3 | `AddAudioTrack` | project-edit | Extension applies `track.add` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 4 | `RemoveAudioTrack` | project-edit | Extension applies `track.remove` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 5 | `ImportAudio` | engine+project-edit | **Extension-orchestrated**: `audioService.probeAudio(filePath)` → create track + element → update project cache → notify webview via `project:sync`. | `{ success: true, trackId }` or `{ success: false, error }` |
| 6 | `SetTrackVolume` | project-edit | Extension applies `track.mix.setVolume` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 7 | `SetTrackPan` | project-edit | Extension applies `track.mix.setPan` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 8 | `SetTrackProperties` | project-edit | Extension applies `track.update` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 9 | `ApplyTrackEffect` | project-edit | Extension applies `track.mix.addEffect` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 10 | `RemoveTrackEffect` | project-edit | Extension applies `track.mix.removeEffect` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 11 | `ApplyMasterEffect` | project-edit | Extension applies `audio.effect.add` to cache → notify webview | `{ success }` or `{ success: false, error }` |
| 12 | `MixExport` | engine | `resolveProjectSession` → `buildMixStreamConfig(data)` → `audioService.mixExport(config, outputPath, format)` | `{ output, warnings }` |
| 13 | `AnalyzeAudioLoudness` | engine | `audioService.analyzeLoudness(filePath)` | `{ integratedLoudness, truePeak, loudnessRange }` |
| 14 | `AudioDenoise` | engine | `audioService.transcode(input, output, { effects: [{ type: 'noise-gate', params: { threshold: -40, attack: 1, hold: 50, release: 100 } }] })` | `{ output, note: 'Applied noise-gate. Spectral noise reduction not available.' }` |
| 15 | `StemSeparation` | engine | Not available in P0 | `{ success: false, error: 'Stem separation requires ML model not yet available' }` |

**3 tools via AgentCapabilityProvider (provider-direct, conditional on mediaService):**

| # | Tool | Implementation |
|---|------|---------------|
| 16 | `GenerateMusic` | `mediaService.generateMusic({ prompt, duration, style })` |
| 17 | `GenerateSFX` | `mediaService.generateSFX({ prompt, duration })` |
| 18 | `GenerateVoice` | `mediaService.generateVoice({ text, voiceId })` |

**Tool execution boundary clarification:**
- **15 tools** go through `AudioToolBridge.executeAgentTool()` (all editing, analysis, and engine tools)
- **3 media generation tools** (`GenerateMusic`, `GenerateSFX`, `GenerateVoice`) are handled directly by `AgentCapabilityProvider.getTools()` via `mediaService` — they bypass the bridge because they don't interact with the audio project state
- Verification: all `TOOL_NAMES_AUDIO` entries have an execution path (either bridge or provider-direct)

**Verification:**
- Agent calls ApplyTrackEffect → Extension applies to cache → notifies webview → tool returns `{ success: true }`
- Agent calls ApplyTrackEffect with invalid trackId → applyOperation throws → tool returns `{ success: false, error }`
- Agent calls with wrong documentUri → error "No panel for document"
- Agent calls AudioDenoise → engine transcodes file with noise-gate → returns output path + note
- All 15 bridge tools have switch cases; 3 media tools have provider-direct handlers
- `pnpm test` — unit tests for all bridge tool cases

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
- 13 engine DSP effects registered as `format: 'builtin'` plugins (matching `EngineAudioEffectType`)
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
| `1.0` | Existing legacy files | `loadNka()` accepts; no schema migration but applies compatibility normalization (legacy effect type names `parametric_eq` → `parametric-eq`, etc.) |
| `2.0` | Current working format (tracks, masterEffectsChain, markers, trackMix, bpm, masterVolume) | `CURRENT_NKA_VERSION` set to `'2.0'` in P0-PR1 |
| `2.1` | + buses, trackAutomation, masterAutomation (P1) | Additive optional fields |

**Rules:**
- `loadNka()` accepts `'1.0'` and `'2.0'` without error; unknown future versions (e.g. `'99.0'`) open **read-only** with warning — user must explicitly confirm downgrade before saving
- `saveNka()` writes `CURRENT_NKA_VERSION` for new/migrated files. Pure function, no UI concerns.
- All new fields are optional with `undefined` defaults — zero migration needed for `1.0` → `2.0`
- No separate `routingNodes` field — routing derived from `buses` + `trackMix.sends`

**Implementation of read-only state:**
- `NkaLoadResult` gains `compatibility: { loadedVersion: string; isReadOnly: boolean; warnings: string[] }` field (returned by `loadNka()`)
- `AudioProjectProvider` maintains per-document `readOnlyState: Map<string, boolean>` from `NkaLoadResult.compatibility.isReadOnly`
- `saveCustomDocument()` checks `readOnlyState` — if read-only, shows destructive downgrade confirmation: `vscode.window.showWarningMessage("This file was created with a newer version (X.X). Saving will downgrade to v2.0 and may lose unsupported features. Continue?", "Save & Downgrade", "Cancel")`. On confirm, clears read-only flag and saves. On cancel, returns without saving.
- `saveCustomDocument()` calls `saveNka(data)` (not raw `JSON.stringify`) — ensures version stamp and validation
- This is a **Save with destructive confirm**, not forced Save As. Rationale: forcing Save As for every future-version file is too disruptive for the common case where the user just wants to edit and save back.

---

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Track mix state (volume/pan/solo/effectChain) persisted in `AudioProjectData.trackMix`, driven by EditOperations | Enables Undo/Redo, save/revert, Extension cache sync. Eliminates the local-only `trackUIState` SSOT gap. |
| D2 | Effect types use hyphenated names as canonical form | Matches Rust `effect_factory.rs`; agent tool schema, webview types, and engine all use the same names. |
| D3 | Agent project-edit tools execute in Extension (not webview), matching neko-cut pattern | Pure function `applyOperation()` on Extension cache → deterministic result → notify webview to sync. No postMessage round-trip, no timeout, no correlationId needed. |
| D4 | `postMessage` targets specific document panel, not broadcast | Prevents multi-document race conditions. |
| D5 | Routing model: `buses` + `trackMix.sends/outputId` (no separate `routingNodes`) | Single SSOT for routing. RoutingMatrix derives its view at render time. |
| D6 | Automation is data, not real-time DSP | Post-production = offline render; engine interpolates at mix time. |
| D7 | Plugin interface wraps builtin effects first | 13 engine effects → `format: 'builtin'`; VST3/AU is engine-side addition only. |
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
- `.nka` with `version: '1.0'` opens without error; `version: '99.0'` opens read-only with warning
- Effect type names consistent across TS types, agent schema, and preset JSON
- `EngineAudioEffectType` union matches exactly the 13 types in Rust `effect_factory.rs`

**P0-PR2 (State Model):**
- Open .nka → change volume → Save → Reopen → volume preserved
- Undo after volume change → reverts
- `buildMixStreamConfig()` reads from `trackMix` correctly

**P0-PR3 (Agent Tools):**
- Agent calls ApplyTrackEffect → webview ack → tool returns real result
- Agent calls AudioDenoise → engine transcodes → output path returned
- All 18 TOOL_NAMES_AUDIO entries have an execution path (15 via bridge, 3 via provider-direct media generation)

**P0-PR4 (Mixer):**
- Mixer panel opens/closes, channel strips reflect project model
- Volume fader change in Mixer → TrackHeader reflects same value
- Undo works across both Mixer and TrackHeader

**P1/P2:** (see individual PR descriptions above)
