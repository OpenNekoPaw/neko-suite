# ADR: neko-audio Architecture Evolution — Audio Post-Production Workstation → DAW-Ready

- **Status**: Proposed (rev.8 — canonical-only audio effects and current-only `.nka` schema; no legacy compatibility paths before first release)
- **Date**: 2026-05-12
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

## Baseline Defects Addressed By This Change

### Defect 1: trackUIState is NOT the SSOT

`audioProjectStore.ts:49` explicitly marks `AudioTrackUIState` as _"Per-track UI state (local, not serialized to .nka)"_. `initProject()` reads from `AudioProjectData.trackMix` into local `trackUIState`, but changes via `setTrackVolume`/`setTrackPan`/`addTrackEffect` etc. only update local Zustand state — they are **never synced back** to `trackMix` or to the Extension cache via `operationApplied`.

**Impact**: Volume/pan/solo/effectChain changes made in the TrackHeader (or by Agent) are lost on save, revert, or tab switch.

### Defect 2: Effect Type Naming Drift

| Layer                                            | Naming Convention                      | Example                                       |
| ------------------------------------------------ | -------------------------------------- | --------------------------------------------- |
| Webview `audioEffects.ts`                        | hyphenated                             | `noise-reduction`, `high-pass`, `pitch-shift` |
| Agent tool schema (`agentCapabilityProvider.ts`) | previously underscored, now hyphenated | `parametric-eq`, `noise-gate`                 |
| Rust `effect_factory.rs`                         | hyphenated                             | `parametric-eq`, `noise-gate`                 |
| `AudioProjectProvider` denoise handler           | hyphenated                             | `noise-reduction`                             |

Agent and Engine now share the same canonical hyphenated enum; P0 removes pre-release aliases instead of carrying compatibility code.

### Defect 3: Engine Effects Pipeline is Broken for Single-File Operations

**Critical**: The TS layer already calls `audioService.transcode(filePath, outputPath, { effects: [...] })` for denoise, normalize, and fade operations (`AudioProjectProvider.ts:387-418`). **But Rust silently ignores the effects parameter.**

Verified cause chain:

1. `AudioService.transcode()` passes `effects` as opaque options via `EngineClient.dispatch()`
2. Rust `TranscodeRequestOptions` struct (`host-api/controllers/audio.rs:54-70`) has **no `effects` field** — only `source`, `output`, `codec`, `bitrate`, `sample_rate`, `channels`
3. `AudioTranscodeOptions` (`engine-kernel/domain/options.rs:203-216`) has **no `effects` field** — only `time_range`, `sample_rate`, `channels`, `format`, `bitrate`
4. Serde deserialization silently drops unknown fields → effects array is lost

**Impact**: Every single-file effect operation in the current UI (Apply Effects, Denoise, Normalize, Fade In/Out) appears to succeed but produces an unchanged copy of the audio.

### Defect 3a: noise-reduction Effect Does Not Exist in Engine

The Rust `effect_factory.rs` `create_effect()` function handles 16 canonical renderable effect types: `gain`, `high-pass`, `low-pass`, `band-pass`, `notch`, `peaking`, `low-shelf`, `high-shelf`, `parametric-eq`, `compressor`, `noise-gate`, `limiter`, `reverb`, `delay`, `chorus`, `distortion`. Unknown or non-canonical names now return an explicit unsupported-effect error instead of falling back to a silent no-op.

**Not in factory**: `noise-reduction`, `soft-limiter`, `pitch-shift`, `time-stretch`.

- `SoftLimiter` exists as internal struct used by `AudioMixdown` for clipping prevention, but is not exposed via the factory.
- `noise-gate` (threshold-based muting) ≠ noise-reduction (spectral subtraction / AI denoising).
- The TS webview defines 12 effect types including `noise-reduction`, `pitch-shift`, `time-stretch` — these exist only in the UI type system, not in the engine.

### Defect 3b: AudioService API Surface Mismatch

ADR v1 referenced `audioService.applyEffects()` which **does not exist**. The actual API is `AudioService.transcode()` which accepts an `effects` option that the engine ignores (see Defect 3).

### Defect 4: .nka Version Inconsistency

| Location                        | Version Claim                          |
| ------------------------------- | -------------------------------------- |
| `nka/codec.ts:12`               | `CURRENT_NKA_VERSION = '1.0'`          |
| `AudioProjectProvider` comments | "v2"                                   |
| `AudioTrackMixState` comments   | "v2.1"                                 |
| `AudioProjectData.version`      | String field, unchecked by `loadNka()` |

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
│       │  MixerPanel* (initial bottom)   │                   │
│       │  [Ch1][Ch2][Ch3]...             │                   │
│       │  Vol|Pan|FX count|S|M           │                   │
└───────┴─────────────────────────────────┴───────────────────┘
```

### Layer Diagram

```
UI Layer (webview/)
├── AudioEditor.tsx (layout orchestrator)
├── components/Timeline/   — multi-track timeline + automation overlays
├── components/MixerPanel.tsx — initial channel strip controls; bus/master strips are future work
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
├── audio/build-mix-config.ts — pure function: (AudioProjectData, MixConfigContext) → MixConfigBuildResult (NEW)
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
  Extension 解析 .nka → 编辑 → buildMixConfig(data, ctx)
    → HTTP POST audios:mix_stream { config }
    → Engine 渲染 (无状态，不缓存 config)

入口 B — CLI 离线渲染 (Engine 独立运行):
  $ neko-engine export project.nka -o output.wav
    → host-cli: NkaLoader 读 .nka JSON → resolve relative/${VAR} paths → 构建 MixdownConfig
    → engine-kernel: AudioMixdown.export(config, output)
    → 输出文件 (不需要 VSCode/Extension)
```

**Engine .nka 支持的约束:**

- `NkaLoader` 放在 `host-cli`（不放 `engine-kernel`）— kernel 只认 MixdownConfig
- NkaLoader 是**只读**的：load → build config → render。不做编辑、不保存、不维护 undo
- NkaLoader 不做版本迁移 — CLI 只支持 `CURRENT_NKA_VERSION`，旧版本提示用户先在 VSCode 中打开升级
- 在线编辑时 Extension 仍是唯一 SSOT，Engine 不缓存工程状态

**neko-cut 同理** — Engine 的 `host-cli` 也应该能 `neko-engine export project.nkv -o output.mp4`，使用同样的 NkvLoader → RenderConfig 模式。这是跨项目的统一 CLI 渲染入口。

### Interface Architecture: IPC Control vs WS Data

Engine 与 Extension 之间存在两条截然不同的通信通道，各自承载不同类型的数据：

```
┌─────────────────────────────────────────────────────────────────────┐
│ Webview (React + Zustand)                                           │
│  audioStore ─── 单文件播放/分析/UI 状态                                │
│  audioProjectStore ─── 工程结构 + undo/redo + EditOperation dispatch  │
├──────────── postMessage (typed, audio:* namespace) ─────────────────┤
│ Extension Host (Node.js)                                            │
│  AudioEditorProvider ─── 单文件编辑桥接                                │
│  AudioProjectProvider ─── 工程元数据管理 + _projectDataCache          │
│  AudioService ─── EngineClient facade (HTTP/WS)                     │
├──────────── IPC (N-API HTTP) ──────── WS (PCM stream) ─────────────┤
│ Rust Engine                                                         │
│  AudioController ─── 20 actions (audios:*)                          │
│  AudioMixdown ─── 多轨混音引擎 + DSP effect chains                    │
│  PlaybackState + ActiveStreams ─── 播放控制 / hot-update 状态            │
│  MicCapture ─── cpal 录音 + 原子监控数据                               │
└─────────────────────────────────────────────────────────────────────┘
```

#### Two Channels

| Dimension           | IPC (N-API / HTTP POST)                                 | WebSocket                           |
| ------------------- | ------------------------------------------------------- | ----------------------------------- |
| **Responsibility**  | Operation control + metadata query                      | Real-time binary stream             |
| **Direction**       | Request-response (TS → Rust → TS)                       | Push (Rust → TS)                    |
| **Data format**     | JSON (ActionRequest / ActionResponse)                   | Binary (PCM f32le frames)           |
| **Typical actions** | `audios:probe`, `audios:transcode`, `audios:mix_export` | `/v1/streams/{id}` PCM frame stream |
| **Latency**         | Millisecond-level response is sufficient                | Real-time (<10ms per frame)         |
| **State**           | Stateless (each request self-contained)                 | Stateful (streamId binds session)   |

Additionally, a lightweight HTTP polling endpoint: `GET /v1/monitor/{stream_id}` returns atomic RMS/Peak/Clipping data. Webview polls at 60fps via `requestAnimationFrame` for level meters. Zero-lock reads via `AtomicU32` in the Rust recording thread (~0.1ms latency).

#### Engine Action Surface (20 Actions)

**Query (stateless, IPC):**

| Action                      | Input                              | Output                                   | Purpose                  |
| --------------------------- | ---------------------------------- | ---------------------------------------- | ------------------------ |
| `audios:probe`              | filePath                           | MediaInfo (duration/codec/sr/ch/bitrate) | File metadata            |
| `audios:waveform`           | filePath, peaksPerSecond?          | WaveformData (peaks[][], duration)       | Waveform visualization   |
| `audios:diff`               | pathA, pathB                       | AudioContentDiff (SNR/regions/peaks)     | Audio comparison         |
| `audios:analyze_loudness`   | filePath, targetLufs?              | LoudnessAnalysis (LUFS/truePeak/LRA)     | ITU-R BS.1770-4 loudness |
| `audios:detect_silence`     | filePath, threshold?, minDuration? | SilenceAnalysis (regions[])              | Silence detection        |
| `audios:list_input_devices` | —                                  | InputDevice[] (id/name/sr/ch/isDefault)  | Device enumeration       |

**Transform (stateless, IPC):**

| Action              | Input                                                           | Output                          | Purpose                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audios:transcode`  | source, output, codec/sr/ch, effects?_, startTime?_, endTime?\* | outputPath                      | Format convert + trim + effects (\*P0-PR1a)                                                                                                                                |
| `audios:segment`    | source, start, duration, format?                                | base64 data                     | Extract segment (returns bytes, not file)                                                                                                                                  |
| `audios:mixdown`    | `config: MixdownConfig`                                         | base64 PCM buffer (f32le→s16le) | Single-buffer mix snapshot. Legacy `{ tracks, sampleRate, channels, time }` input has been removed; callers without `config` receive `config required for audios:mixdown`. |
| `audios:mix_export` | MixdownConfig + output, format?, bitrate?                       | outputPath                      | Full project export to file                                                                                                                                                |

**Streaming (stateful, IPC create + WS push):**

| Action                | Input                                | Output                             | Purpose                  |
| --------------------- | ------------------------------------ | ---------------------------------- | ------------------------ |
| `audios:stream`       | filePath, sessionId                  | streamId + wsUrl                   | Single-file PCM playback |
| `audios:mix_stream`   | MixdownConfig, sessionId, startTime? | streamId + wsUrl                   | Multi-track mix playback |
| `audios:record_start` | outputPath?, deviceId?, sr?, ch?     | streamId + monitorUrl              | Start mic capture        |
| `audios:record_stop`  | streamId                             | path + duration + format + sr + ch | Stop recording           |

**Playback control (stateful, IPC targeting existing streamId):**

| Action                                           | Input                           | Purpose               |
| ------------------------------------------------ | ------------------------------- | --------------------- |
| `audios:stop` / `audios:pause` / `audios:resume` | streamId                        | Playback state toggle |
| `audios:seek`                                    | streamId, time                  | Jump to position      |
| `audios:speed`                                   | streamId, speed                 | Playback speed        |
| `audios:loop`                                    | streamId, enabled, start?, end? | Loop region           |

`audios:speed` on project mix streams is a preview cursor multiplier, not time-stretch DSP. The stream loop advances `current_time` by `buffer_duration * speed` and adjusts pacing; high speeds can skip source time rather than synthesize continuous phase-vocoder output. Continuous time-stretch remains planned-only with `time-stretch`.

#### EditOperation Sync

EditOperation is the most complex data flow — Webview initiates edits that must sync to the Extension cache. The Engine does **not** keep an editable `.nka` or `AudioProjectData` model. For playback, Extension derives a fresh `MixdownConfig` from project data and sends that render instruction to Engine.

```
 Webview                       Extension                         Engine
   │                               │                                │
   │ dispatch(op)                  │                                │
   ├──[1] local apply ────────────►│                                │
   │  (audioProjectStore           │                                │
   │   + undo/redo stack)          │                                │
   │                               │                                │
   ├──[2] postMessage ────────────►│                                │
   │  'operationApplied'           │                                │
   │                               ├──[3] apply to cache            │
   │                               │  _projectDataCache             │
   │                               │  markDirty()                   │
   │                               │                                │
   │                               │  (save writes .nka)            │
   │                               │                                │
   │                               ├──[4*] if active mix stream: ──►│
   │                               │  buildMixConfig(data, ctx)     │
   │                               │  audios:mix_stream update      │
   │                               │  (full config replacement)     │
```

**[4\*] Scope**: active project mix streams now use `audios:mix_stream { action: 'update' }` with full `MixdownConfig` replacement when the Provider has the active stream context. Unlike neko-cut video timeline preview, audio does **not** use Engine-side incremental `try_apply_operation_with_base_dir()` for `.nka` edits.

**Operation type routing:**

| Operation category                           | Persisted in .nka        | Affects render config           | Engine update behavior                                                             | Undo/Redo |
| -------------------------------------------- | ------------------------ | ------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| `track.mix.*` (volume/pan/solo/effect)       | Yes (trackMix)           | Yes                             | Full `MixdownConfig` replacement if project stream active; next playback otherwise | Yes       |
| `audio.effect.*` (master effects)            | Yes (masterEffectsChain) | Yes                             | Full `MixdownConfig` replacement if project stream active; next playback otherwise | Yes       |
| `audio.marker.*`                             | Yes (markers)            | No                              | None                                                                               | Yes       |
| `element.*` (add/remove/update/move/split)   | Yes (tracks[].elements)  | Yes                             | Full `MixdownConfig` replacement if project stream active; next playback otherwise | Yes       |
| `track.*` (add/remove/update/reorder/toggle) | Yes (tracks[])           | Yes for playback-visible fields | Full `MixdownConfig` replacement if project stream active; next playback otherwise | Yes       |

#### MixdownConfig: Metadata → Binary Bridge

`MixdownConfig` is the key contract that bridges Extension-side project metadata with Engine-side binary audio processing. Extension builds it from `AudioProjectData` plus path-resolution context:

```
AudioProjectData (.nka JSON)          MixdownConfig (Engine render instruction)
┌──────────────────────────┐          ┌──────────────────────────────────┐
│ tracks[].elements[] ─────┼────────► │ tracks[].elements[]              │
│   .src (file path)       │          │   Engine reads binary via path   │
│   .startTime / .duration │          │   Positions in timeline          │
│   .trimStart             │          │   Offset from source start       │
│                          │          │                                  │
│ trackMix[trackId]        │          │ tracks[]                         │
│   .volume / .pan / .solo │────────► │   .volume / .pan / .solo / .muted│
│   .effectChain[]         │          │   .effectChain[] → DSP pipeline  │
│                          │          │                                  │
│ masterEffectsChain[] ────┼────────► │ masterEffects[] → master DSP     │
│ masterVolume ────────────┼────────► │ masterVolume + SoftLimiter(0.95) │
│ sampleRate / channels ───┼────────► │ sampleRate / channels            │
└──────────────────────────┘          └──────────────────────────────────┘
                                        │
                                        ▼
                                      Engine AudioMixdown:
                                        FFmpeg decode → per-element gain/pan/fade
                                        → per-track effect chain → track mix
                                        → bus routing (P1) → master effects
                                        → soft limiter → PCM output
```

**Conversion point**: `buildMixConfig(data, ctx)` (pure function in `@neko/shared/audio/build-mix-config.ts`) performs this mapping. Returns `MixConfigBuildResult` (`{ config: MixStreamConfig, warnings: MixConfigWarning[] }`) — planned-only effects are filtered with warnings.

**Path resolution context**: `.nka` files store element `src` paths as relative paths or `${VAR}/path` variables (per the project's path system — see ADR: Path System). Engine reads `MixdownConfig.tracks[].elements[].src` as absolute file paths for FFmpeg decoding. Therefore `buildMixConfig()` requires a resolution context:

```typescript
// @neko/shared/audio/build-mix-config.ts

export interface MixConfigContext {
  projectDir: string;
  resolveSourcePath: (src: string, projectDir: string) => string;
}

export function buildMixConfig(data: AudioProjectData, ctx: MixConfigContext): MixConfigBuildResult;
```

- `resolveSourcePath(src, projectDir)` expands `${VAR}/path` and resolves relative paths against `projectDir` → absolute paths
- Extension provides `ctx` from `PathResolver` (which reads `neko/settings.json` + `.neko/settings.local.json`)
- CLI does **not** call the TS `buildMixConfig()` function. Rust `host-cli` implements an equivalent `NkaLoader` mapping from `.nka` JSON to `MixdownConfig`, using `ProjectContext` for relative/${VAR} path resolution. Parity is enforced by shared schema examples/tests, not by sharing TS code across the Rust boundary.
- Webview does **NOT** call `buildMixConfig` directly — it sends `audio:playback` intent to Extension, which builds the config from its own cache + PathResolver context

**MixConfig ownership rule**: Extension is the sole builder of `MixStreamConfig` for both playback and export. Webview sends intents (`audio:playback`, `audio:export`), never configs.

**Design principle**: Extension decides "what to render" (builds MixdownConfig from project metadata + path context); Engine decides "how to render" (FFmpeg decode, DSP, mixing). Engine receives MixdownConfig as a stateless render instruction — it does not cache or modify it.

#### Known Interface Contract Gaps

Three gaps exist between the current TS and Rust interfaces (partially overlapping with Defects 1–5 above):

**Gap 1: Semantic Overload on `audios:transcode`**

Trim, effects, denoise, normalize, and export all route through `audios:transcode` using option fields to differentiate semantics. The action was originally designed for format conversion only. This creates confusion in:

- Agent tool routing (is "apply effects" a transcode?)
- Error reporting (transcode failure could mean codec error or effect processing error)
- The `audio:*` message protocol addresses this by providing semantic message types (`audio:trim`, `audio:effects`, `audio:export`) that all route to the appropriate Engine action with clear intent at the Extension level.

**Gap 2: `mix_stream` Hot-Update Exposure**

Engine `AudioMixdown::update_config()` is wired to `audios:mix_stream { action: 'update' }`. Active project playback updates replace the full `MixdownConfig`; the Engine still never receives `.nka` edit operations.

**Gap 3: `trackMix` Persistence Boundary**

`trackMix` (volume/pan/solo/effectChain) in .nka v2.1 is an optional field, but `trackViewState` (height/color) is never persisted. The sync timing between `trackUIState` (old local Zustand) and `trackMix` (persisted) was inconsistent — P0-PR2 resolves this by promoting mix state to `AudioProjectData.trackMix` driven by `TrackMixOperation` EditOperations, and renaming the remainder to `trackViewState`.

### Agent Edit Execution Model (Extension-Side, matching neko-cut)

```
Agent tool call (e.g. SetTrackVolume)
  │
  ▼
AudioToolBridge (Extension process)
  │ session = gateway.resolveSession(documentUri)
  │ op = { type: 'track.mix.setVolume', payload: { trackId, volume }, before: { volume: old } }
  │ newData = applyOperation(session.projectData, op)   ← pure function (@neko/shared)
  │ gateway.applyOperation(session, op, { syncReason: 'agent-edit' })
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

### Mix Stream Hot-Update: Real-Time Preview

```
Implemented path:
  edit → buildMixConfig(data, ctx) → HTTP POST mix_stream { action: 'update', streamId, config }
  → Engine replaces in-memory config → next audio buffer uses new params
  → User hears change instantly (no gap)
```

#### Audio Mix Stream vs Video Timeline Stream — Comparison

Both systems share the same infrastructure (`PlaybackState` watch channel, `ActiveStreams`, `WallClockPacer`, `spawn_blocking` loop), but differ in data model and update semantics:

| Dimension                  | Video Timeline Stream                                                                                                       | Audio Mix Stream                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Data model**             | `Timeline` (editable document, elements + tracks + effects)                                                                 | `MixdownConfig` (render instruction, derived from `AudioProjectData`)                                                            |
| **Loop file**              | `timeline.rs` `start_stream()`                                                                                              | `audio_mix_stream.rs` `start_mix_stream()`                                                                                       |
| **Renderer**               | `PreviewPipeline` (GPU + FFmpeg video + audio)                                                                              | `AudioMixdown` (FFmpeg audio decode + DSP)                                                                                       |
| **Hot-update field**       | `PlaybackState.timeline_update: Option<Arc<Timeline>>` + `timeline_seq`                                                     | `mixdown_update: Option<Arc<MixdownConfig>>` + `mixdown_seq`                                                                     |
| **Update method**          | `StreamPlaybackDelegate::update_timeline()`                                                                                 | `update_mixdown()`                                                                                                               |
| **Loop detection**         | `if state.timeline_seq != last_timeline_seq` → `pipeline.update_timeline()`                                                 | loop detects `mixdown_seq` changes and calls `AudioMixdown::update_config()`                                                     |
| **Incremental apply**      | `streams:applyOperation` → `timeline.try_apply_operation_with_base_dir()` → incremental Timeline edit → `update_timeline()` | **Not applicable** — `MixdownConfig` is a derived render instruction, not an editable model. Full config replacement only.       |
| **Controller action**      | `streams:update` → `TimelineService::update_stream()`                                                                       | `audios:mix_stream { action: 'update' }` → full config replacement                                                               |
| **Renderer update method** | `PreviewPipeline::update_timeline(timeline)`                                                                                | `AudioMixdown::update_config(config)` — **Already implemented** (replaces tracks/effects/volume, opens decoders for new sources) |

**Key architectural difference**: Video timeline uses two update paths (incremental `applyOperation` for small edits + full `streams:update` for bulk changes). Audio mix stream only needs one path — full `MixdownConfig` replacement — because:

1. `MixdownConfig` is a stateless render instruction derived from `AudioProjectData` by `buildMixConfig()`
2. Edits happen on `AudioProjectData` in TS Extension (EditOperations + undo/redo)
3. After each edit, Extension rebuilds `MixdownConfig` and pushes it to Engine
4. Engine has no independent edit state to maintain

```
Video edit path (two routes):
  Fast: applyOperation → incremental Timeline mutation → update_timeline (Arc<Timeline>)
  Full: streams:update → full Timeline replacement

Audio edit path (one route):
  TS edit AudioProjectData → buildMixConfig(data, ctx) → mix_stream update → full MixdownConfig replacement
```

#### Engine-Side Readiness Analysis

| Layer           | Component                             | Status                        | Notes                                                                                  |
| --------------- | ------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `engine-kernel` | `AudioMixdown::update_config(config)` | **Done**                      | Replaces tracks/effects/volume, opens decoders for new sources, closes removed sources |
| `engine-kernel` | `PlaybackState` (watch channel)       | Done                          | Uses `mixdown_update` + `mixdown_seq`                                                  |
| `engine-kernel` | `audio_mix_stream.rs` loop            | Done                          | Reads update field and replaces config                                                 |
| `host-api`      | `mix_stream update` action            | Done                          | Requires `streamId` and `config`, returns update status + warnings                     |
| `host-api`      | `ActiveStreams::update_timeline()`    | **Done** (neko-cut reference) | Same `update_state` closure pattern reusable for mixdown                               |

#### Implementation Pattern

```rust
// 1. PlaybackState — add fields (engine-kernel/src/services/impls/stream_loop.rs)
pub struct PlaybackState {
    // ... existing fields (paused, speed, loop_region, seek_to/seq, timeline_update/seq, config_update/seq) ...
    pub mixdown_update: Option<Arc<MixdownConfig>>,
    pub mixdown_seq: u64,
}

// 2. audio_mix_stream.rs — read update in loop (after seek/pause/speed handling)
let mut last_mixdown_seq: u64 = 0;
// ... inside loop:
if state.mixdown_seq != last_mixdown_seq {
    last_mixdown_seq = state.mixdown_seq;
    if let Some(ref new_config) = state.mixdown_update {
        tracing::info!("Audio mix loop: hot-updating config (seq={})", state.mixdown_seq);
        mixdown.update_config((*new_config).clone());
        total_duration = mixdown.total_duration();
    }
}

// 3. StreamPlaybackDelegate — add method (reuse update_state closure)
pub async fn update_mixdown(
    &self,
    stream_id: &StreamId,
    config: Arc<MixdownConfig>,
) -> Result<()> {
    self.active_streams
        .update_state(stream_id, |s| {
            s.mixdown_update = Some(config);
            s.mixdown_seq += 1;
        })
        .await
}

// 4. host-api mix_stream update action — full config replacement
"update" => {
    let stream_id = parse_stream_id(opts.stream_id)?;
    let config: MixdownConfig = serde_json::from_value(opts.config?)?;
    active_streams.update_mixdown(&stream_id, Arc::new(config)).await?;
    Ok(ActionResponse::ok("", json!({ "streamId": stream_id, "status": "updated" })))
}
```

#### update_config() Behavior (already implemented in AudioMixdown)

`AudioMixdown::update_config()` performs a diff between old and new config:

- **New sources**: opens `FfmpegAudioDecoder` for files not in the current source map
- **Removed sources**: closes decoders for files no longer referenced
- **Retained sources**: keeps existing decoders (preserving decode position and residual buffer)
- **Track/master config**: replaces volume/pan/solo/mute/effectChain, rebuilds effect chains
- **Master effects**: rebuilds master effect chain from new config
- **Cost**: proportional to number of source changes, not total config size. If only volume/pan changes, no decoders are touched.

This is heavier than video's `pipeline.update_timeline()` (which only swaps an Arc reference), but still sub-millisecond for typical edits (volume/pan/effect parameter changes without new source files).

---

## Type Contracts

### Track Mix EditOperations (P0 — NEW)

```typescript
// @neko/shared/operations/types.ts — new operation types

/** Operations that modify per-track mix state (persisted in AudioProjectData.trackMix) */
export type TrackMixOperation =
  | {
      type: 'track.mix.setVolume';
      meta: OperationMeta;
      payload: { trackId: string; volume: number };
      before: { volume: number };
    }
  | {
      type: 'track.mix.setPan';
      meta: OperationMeta;
      payload: { trackId: string; pan: number };
      before: { pan: number };
    }
  | {
      type: 'track.mix.setSolo';
      meta: OperationMeta;
      payload: { trackId: string; solo: boolean };
      before: { solo: boolean };
    }
  | {
      type: 'track.mix.effect.add';
      meta: OperationMeta;
      payload: { trackId: string; effect: AudioEffectConfig; index?: number };
    }
  | {
      type: 'track.mix.effect.remove';
      meta: OperationMeta;
      payload: { trackId: string; effectId: string };
      before: { effect: AudioEffectConfig; index: number };
    }
  | {
      type: 'track.mix.effect.update';
      meta: OperationMeta;
      payload: {
        trackId: string;
        effectId: string;
        updates: Partial<Omit<AudioEffectConfig, 'id'>>;
      };
      before: { updates: Partial<Omit<AudioEffectConfig, 'id'>> };
    }
  | {
      type: 'track.mix.effect.move';
      meta: OperationMeta;
      payload: { trackId: string; effectId: string; fromIndex: number; toIndex: number };
    };
```

### Agent → Webview Sync Protocol (P0 — notification only)

```typescript
// Extension → Webview: state sync after agent edit (notification, not request)
// Webview replaces its local audioProjectData with the provided data.
interface ProjectSyncMessage {
  type: 'project:sync';
  projectData: AudioProjectData;
  /** Present for Agent/tool edits so Webview can record undo metadata without executing the op. */
  operation?: EditOperation;
}

// Webview → Extension: user UI edits (unchanged)
// { type: 'operationApplied', operation: EditOperation }
// Agent edits do NOT go through this path — they are applied in Extension directly.
```

### Effect Type Canonical Naming (P0 — NEW)

Single source of truth: **hyphenated**, matching Rust `effect_factory.rs`. Split into engine-supported and UI-only.

```typescript
// @neko/shared/types/audioMix.ts

/** Effects supported by Rust engine — can be rendered in mix stream/export and transcode (after P0-PR1a) */
export type EngineAudioEffectType =
  | 'gain'
  | 'high-pass'
  | 'low-pass'
  | 'band-pass'
  | 'notch'
  | 'peaking'
  | 'low-shelf'
  | 'high-shelf'
  | 'parametric-eq'
  | 'compressor'
  | 'noise-gate'
  | 'limiter'
  | 'reverb'
  | 'delay'
  | 'chorus'
  | 'distortion';

/** UI-only effects — displayed in webview but NOT renderable by engine yet */
export type PlannedAudioEffectType =
  | 'noise-reduction' // Requires spectral subtraction or ML model (P2+)
  | 'pitch-shift' // Requires phase vocoder (P2+)
  | 'time-stretch'; // Requires phase vocoder (P2+)

/** Union type for all effect types across the system */
export type AudioEffectType = EngineAudioEffectType | PlannedAudioEffectType;

/** Set of planned-only types for runtime rejection */
export const PLANNED_EFFECT_TYPES: Set<string> = new Set([
  'noise-reduction',
  'pitch-shift',
  'time-stretch',
]);

// Runtime rejection points (ALL must reject planned types before they reach the engine):
// 1. AudioToolBridge.applyTrackEffect() — check effectType against PLANNED_EFFECT_TYPES → return error with message
// 2. buildMixConfig(data, ctx) — returns MixConfigBuildResult ({ config, warnings: MixConfigWarning[] }).
//    Extension caller (playback/export/MixExport tool) decides how to surface warnings.
//    buildMixConfig itself is a PURE builder — no side effects, no toast.
// 3. AudioProjectProvider 'audio:effects' handler — reject planned types with user-facing toast
// 4. Toolbar/command denoise sends renderable 'noise-gate'; spectral denoise remains planned-only
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
//   - buildMixConfig(data, ctx): maps masterEffectsChain snapshot.type → config.effectType for master bus
//   - TrackMixOperation payloads use AudioEffectConfig directly (track effects are engine-facing)
//   - loadNka() validates canonical names; no pre-release effect-name migration is kept
//
// Both use hyphenated values ('parametric-eq', 'noise-gate', etc.)
// Future P1+: consider unifying to a single shape (likely AudioEffectConfig + optional `name`)

// Agent tool schema effectType enum MUST:
// 1. Use hyphenated names (not underscored)
// 2. Mark planned types in description: "pitch-shift (UI preview only, not rendered in export)"
// No pre-release aliases are kept; callers must send canonical hyphenated values.
```

### IAudioNode — Routing (P1)

```typescript
// @neko/shared/types/audioRouting.ts
// buses + trackMix.sends + trackMix.outputId are the PRIMARY model
// IAudioNode is a DERIVED view for routing matrix UI, NOT persisted separately

export type AudioTrackCategory = 'audio' | 'bus' | 'instrument' | 'midi' | 'master';

export interface IAudioSend {
  targetId: string;
  level: number; // 0.0–1.0
  position: 'pre' | 'post';
  enabled: boolean;
}

export interface IAudioBus {
  id: string;
  name: string;
  volume: number; // 0.0–2.0
  pan: number; // -1.0 to 1.0
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
  time: number; // seconds
  value: number; // normalized to param range
  curve: 'linear' | 'exponential' | 'hold';
}

export interface IAutomationLane {
  id: string;
  target: AutomationTarget;
  points: AutomationPoint[]; // sorted by time
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

**TS → Rust mapping**: The TS `AudioEffectConfig` type (`@neko/shared/types/audioMix.ts`) has shape `{ id, effectType, enabled, params }`. The wire JSON matches this shape. At the HTTP boundary, `host-api` validates canonical JSON and converts it into the domain DTO `AudioRenderEffectConfig`. The Rust domain layer (`AudioTranscodeOptions`) carries `Vec<AudioRenderEffectConfig>` so it stays independent of DSP factory types. The kernel transcode impl maps `AudioRenderEffectConfig` → DSP `AudioEffectConfig` at the point of use and builds the chain once. So: **wire format matches AudioEffectConfig shape; domain carries typed render instructions; kernel maps into DSP types.**

The single-file UI sends full canonical `AudioEffectConfig` entries. Because this foundation has not shipped, legacy `{ type, params }` effect entries and missing `id`/`enabled` defaults are rejected rather than normalized.

##### Parameter Units (IMPORTANT — must match Rust)

| Effect     | Param        | Unit         | Example |
| ---------- | ------------ | ------------ | ------- |
| noise-gate | `threshold`  | dB           | -40.0   |
| noise-gate | `attack`     | **ms**       | 1.0     |
| noise-gate | `hold`       | **ms**       | 50.0    |
| noise-gate | `release`    | **ms**       | 100.0   |
| compressor | `threshold`  | dB           | -24.0   |
| compressor | `attack`     | **ms**       | 10.0    |
| compressor | `release`    | **ms**       | 100.0   |
| compressor | `ratio`      | ratio        | 4.0     |
| compressor | `knee`       | dB           | 6.0     |
| compressor | `makeupGain` | dB           | 0.0     |
| limiter    | `threshold`  | linear (0-1) | 0.95    |
| limiter    | `ceiling`    | linear (0-1) | 1.0     |
| limiter    | `release`    | **ms**       | 50.0    |
| gain       | `gainDb`     | dB           | -6.0    |
| reverb     | `roomSize`   | 0-1          | 0.5     |
| delay      | `delayMs`    | **ms**       | 250.0   |

Agent prompt fragments MUST document these units. TS webview effect parameter definitions must match.

##### EffectChain Lifecycle (CRITICAL for stateful effects)

Reverb, delay, chorus, compressor, and noise-gate all maintain internal state (feedback buffers, envelope followers, allpass filters). The `EffectChain` MUST be:

1. **Built once** before the decode/encode loop begins
2. **Reused across all buffer frames** — `process()` called per-frame, state accumulates
3. **Never rebuilt per-frame** — that would reset tails, feedback, and envelopes

**Tail drain limitation (P0 scope)**: The `AudioEffect` trait has no `flush()`/`tail_length()` method. After input EOF, reverb/delay tails are truncated. P0 does NOT extend output duration for tails — this is acceptable for post-production (user can add silence at end if needed). A future PR can add `fn tail_samples(&self) -> usize` to the trait and feed zero-buffers after EOF.

**Sample format and resampling boundary**: The current `FfmpegAudioDecoder` is initialized with `SampleFormat::F32` output (`audio.rs:126`), so decoded frames are `Vec<u8>` containing interleaved f32le bytes. The `bytemuck::cast_slice::<u8, f32>()` conversion is zero-copy (reinterpretation, not conversion). Decoder also accepts target `sample_rate` and `channels` — FFmpeg performs resampling internally via `swr_context`. Therefore:

- Effects always process at the decoder's output sample rate and channel count
- If `opts.sample_rate` or `opts.channels` differ from source, decoder resamples **before** effects
- Encoder receives already-resampled f32 buffers — no further conversion needed (except f32→target codec sample format, handled by FFmpeg encoder)

```rust
// CORRECT: map Vec<AudioRenderEffectConfig> → Vec<AudioEffectConfig>,
// build chain once, process per-frame
let mut chain = if !opts.effects.is_empty() {
    let configs: Vec<AudioEffectConfig> = opts.effects
        .iter()
        .cloned()
        .map(to_dsp_effect_config)
        .collect();
    Some(build_effect_chain(&configs)?)
} else {
    None
};

// In decode loop:
loop {
    let frame = decoder.next_frame()?;             // frame.data: Vec<u8> (f32le bytes)
    let buffer: &mut [f32] = bytemuck::cast_slice_mut(&mut frame.data);  // zero-copy reinterpret
    // ... time_range slice if needed ...
    if let Some(chain) = &mut chain {
        chain.process(buffer, channels, sample_rate);  // in-place DSP at decoder output rate
    }
    encoder.write_frame(buffer)?;
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
HTTP request JSON → host-api controller (validate canonical format) → domain options (Vec<AudioRenderEffectConfig>) → kernel transcode impl (map → AudioEffectConfig → build_effect_chain)
```

- `host-api` controller: validates canonical `{ id, effectType, enabled, params }` and returns `Vec<AudioRenderEffectConfig>`. It imports the domain DTO, not the DSP `AudioEffectConfig`.
- `engine-kernel` transcode impl: receives `Vec<AudioRenderEffectConfig>`, maps each item into DSP `AudioEffectConfig`, calls `build_effect_chain()`. This is the single point where DSP types are introduced.

**Files:**

- `engine-kernel/src/domain/options.rs` — add `effects: Vec<AudioRenderEffectConfig>` to `AudioTranscodeOptions`. Domain stays free of DSP dependency by using a serializable render DTO instead of DSP factory types.
- `host-api/src/controllers/audio.rs`:
  - `TranscodeRequestOptions` accepts raw JSON `effects` plus `start_time: Option<f64>`, `end_time: Option<f64>`
  - Controller: require canonical effect format; validate effect type; map `start_time`/`end_time` → `time_range`; pass `Vec<AudioRenderEffectConfig>` into `AudioTranscodeOptions.effects`
  - `MixdownRequestOptions` requires `config: serde_json::Value` for `audios:mixdown`. Missing `config` returns a clear invalid-request error (`config required for audios:mixdown`); legacy `{ tracks, sampleRate, channels, time }` fallback is not retained because this foundation has not shipped.
- `engine-kernel/src/services/impls/audio.rs` (transcode impl):
  - Before decode loop: if `effects` is non-empty, map `AudioRenderEffectConfig` → DSP `AudioEffectConfig`, then call `build_effect_chain()`
  - In decode loop: call `chain.process(&mut buffer, channels, sample_rate)` per frame
  - Chain lives for the entire transcode operation (stateful effects work correctly)
  - No tail drain after EOF (P0 limitation — documented above)
- `engine-kernel/src/audio/dsp/effect_factory.rs` — **change unknown effect fallback from passthrough Gain(0) to `Err()`**. Current behavior (line ~146) silently creates a no-op gain for unknown types. P0 changes this to return an error so callers (transcode, mix_export) can surface "unsupported effect type: X" rather than succeeding with no audible change. `build_effect_chain()` propagates the error. No pre-release aliases are kept.
- `host-api/src/controllers/audio.rs` — also add `format: Option<String>` as alias for `codec` in `TranscodeRequestOptions`. TS sends `format` (via `AudioService.transcode()`), Rust currently only has `codec`. Accept both: `let codec = opts.codec.or(opts.format);`. This fixes the format/codec field drift between TS and Rust without breaking existing callers.
- `engine-kernel/src/services/audio_mixdown.rs` — **change `build_effect_chain` error handling from silent skip to explicit warning collection**. Current implementation builds master/track effect chains through the shared `rebuild_effect_chains()` helper and records warnings instead of dropping errors.
  - `AudioMixdown::new(config)` calls `rebuild_effect_chains(&config)`, stores the initial master/track chains, and stores warning messages for unsupported effects.
  - `AudioMixdown::initialize()` opens decoders for all unique audio sources. Source-open failures during initial load are errors; effect-chain warnings have already been collected by `new()`.
  - `AudioMixdown::update_config(config)` rebuilds chains through the same helper, replaces the warning lifecycle, opens newly referenced sources, records hot-update source-open failures as warnings, and returns `Vec<String>`.
  - `warnings()` / `take_warnings()` expose the warning lifecycle to callers that need to report non-fatal mix issues.
  - `MixdownBuffer`/`mix_export` response surfaces warnings in JSON. Mix preview may log or forward warnings through the existing control response, but export must return them to Extension.
    This ensures the "never silently drop" principle applies to mix paths, not just transcode.

**Verification:**

- `cargo test` — unit test: transcode with `[{ "id": "g1", "effectType": "gain", "enabled": true, "params": { "gainDb": -6.0 } }]` → output is 6dB quieter
- `cargo test` — unit test: transcode with `start_time: 1.0, end_time: 3.0` → output is approximately 2s (P0 uses frame-level trim, not sample-accurate; output duration may vary by ±1 frame depending on codec frame size. Output timestamps are rebased to 0.)
- `cargo test` — unit test: transcode with reverb effect on input that has trailing silence (impulse at t=0, 3s of silence after) → reverb tail audible in the silence region (proves chain state persists across frames without relying on tail drain)
- TS integration: `audioService.transcode(file, out, { effects: [{ id: 'g1', effectType: 'gain', enabled: true, params: { gainDb: -6 } }], startTime: 0, endTime: 5 })` → engine applies both trim and gain
- `cargo test` — unit test: `AudioMixdown::initialize()` with track containing `noise-reduction` effect → mix still plays (effect skipped) + warnings include `"Unsupported effect type: noise-reduction"`; also verify `update_config()` returns/stores warnings for the same unsupported effect
- `cargo test` — unit test: `mix_export` with unsupported effect → export succeeds + response includes `warnings` array

#### P0-PR1b: TS Contract Alignment + Unified Message Protocol

**Goal**: Unify effect type naming, fix .nka version, split effect types, fix param name bugs, clarify fade handling, **unify webview↔extension message protocol under `audio:*` namespace**.

##### Unified `audio:*` Message Protocol

Current state before this change: webview sent 15+ audio runtime control messages with inconsistent prefixes (`editor:*`, `project:mix*`). Because the code has not shipped, the migration removes those old runtime control handlers instead of keeping a compatibility layer. User audio actions now share the `audio:*` namespace, and the Extension routes them to the appropriate engine call based on current mode.

`project:init`, `project:sync`, `operationApplied`, `project:importAudio`, and `project:dropImportAudio` are not audio runtime controls. They remain in the project state/edit plane:

- `project:init` initializes Webview project state from the Extension-owned `.nka` cache.
- `project:sync` replaces Webview project state after Agent edits, reload, revert, or save-related refresh.
- `operationApplied` carries user `EditOperation` updates back to the Extension cache.
- `project:importAudio` / `project:dropImportAudio` request project edits; Extension may call Engine probe/waveform services for metadata, but Engine does not mutate the project.

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

| Current (remove)                         | Unified (new)                                                             | Extension routing                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor:play` / `project:mixStreamStart` | `audio:playback { action: 'play', startTime? }`                           | single-file → `audioService.startStream(filePath)`; project → Extension calls `buildMixConfig(projectData, ctx)` internally then `audioService.startMixStream(config)`. Webview does NOT send config — Extension owns the project data via cache and builds config on demand. |
| `editor:pause`                           | `audio:playback { action: 'pause' }`                                      | `audioService.pauseStream()`                                                                                                                                                                                                                                                  |
| `editor:resume`                          | `audio:playback { action: 'resume' }`                                     | `audioService.resumeStream()`                                                                                                                                                                                                                                                 |
| `editor:stop` / `project:mixStreamStop`  | `audio:playback { action: 'stop' }`                                       | `audioService.stopStream()`                                                                                                                                                                                                                                                   |
| `editor:seek`                            | `audio:playback { action: 'seek', time }`                                 | `audioService.seekStream()`                                                                                                                                                                                                                                                   |
| `editor:speed`                           | `audio:playback { action: 'speed', speed }`                               | `audioService.setStreamSpeed()`                                                                                                                                                                                                                                               |
| `editor:trim`                            | `audio:trim { startTime, endTime }`                                       | `audioService.transcode(... { startTime, endTime })`                                                                                                                                                                                                                          |
| `editor:denoise`                         | `audio:effects { effects: [{ effectType: 'noise-gate', ... }] }`          | `audioService.transcode(... { effects })`                                                                                                                                                                                                                                     |
| `editor:normalize`                       | `audio:effects { effects: [{ effectType: 'gain', params: { gainDb } }] }` | analyze loudness → compute gain → transcode                                                                                                                                                                                                                                   |
| `editor:applyEffects`                    | `audio:effects { effects: [...] }`                                        | `audioService.transcode(... { effects })`                                                                                                                                                                                                                                     |
| `editor:analyzeLoudness`                 | `audio:analyze { kind: 'loudness' }`                                      | `audioService.analyzeLoudness()`                                                                                                                                                                                                                                              |
| `editor:detectSilence`                   | `audio:analyze { kind: 'silence', threshold?, minDuration? }`             | `audioService.detectSilence()`                                                                                                                                                                                                                                                |
| `editor:exportAs` / `project:mixExport`  | `audio:export { format, bitrate?, sampleRate?, channels?, outputPath? }`  | single-file → transcode; project → buildMixConfig(data, ctx) → mixExport                                                                                                                                                                                                      |
| `editor:listInputDevices`                | `audio:recording { action: 'listDevices' }`                               | `audioService.listInputDevices()`                                                                                                                                                                                                                                             |
| `editor:recordStart`                     | `audio:recording { action: 'start', deviceId?, sampleRate?, channels? }`  | `audioService.recordStart()`                                                                                                                                                                                                                                                  |
| `editor:recordStop`                      | `audio:recording { action: 'stop', streamId }`                            | `audioService.recordStop()`                                                                                                                                                                                                                                                   |

**Response messages** follow the same pattern: `audio:playbackReady`, `audio:playbackResult`, `audio:trimResult`, `audio:effectsResult`, `audio:analysisResult`, `audio:exportResult`, `audio:recordingResult`, and `audio:error`.

**Benefits:**

- Webview user actions use one semantic namespace
- Extension is the single routing decision point (mode-aware)
- New operations (e.g. `audio:stemSeparate`) naturally fit the namespace
- Agent project-edit tools (`ApplyTrackEffect`, `SetTrackVolume`, etc.) do NOT go through `audio:*` or `agent:*` postMessage. They execute in Extension against `_projectDataCache`, then notify the targeted Webview with `project:sync`. Agent engine tools (`AudioDenoise`, `MixExport`, `AnalyzeAudioLoudness`) call `audioService` directly in Extension. Only Webview user actions send `audio:*` messages.

**Migration strategy**: Because the new workstation foundation has not shipped, P0-PR1b replaces old audio runtime controls with `audio:*` directly. No compatibility handlers are kept for `editor:play`, `editor:trim`, `project:mixStream*`, or `project:mixExport`. Project state/edit messages listed above remain intentionally separate.

##### Modified files:

- `@neko/shared/types/audioMix.ts` — define `EngineAudioEffectType` (16 types), `PlannedAudioEffectType` (3 types), `AudioEffectType` union (see contract above)
- `@neko/shared/types/audioMix.ts` — update `AudioEffectType` to use hyphenated names matching Rust factory; remove underscored aliases entirely
- `@neko/shared/types/audioProtocol.ts` (new) — define `AudioRequestMessage`, `AudioResponseMessage`, and `ProjectSyncMessage` serializable DTOs. Shared between webview and extension (both import from `@neko/shared`) to ensure type-safe message contracts on both sides of the postMessage boundary.
- `webview/src/types/audioEffects.ts` — change `AudioEffectType` to hyphenated names; import from shared types; mark `noise-reduction`/`pitch-shift`/`time-stretch` as `planned: true` in `AUDIO_EFFECT_DEFINITIONS`; **remove `fade-in`/`fade-out` from effect types** (fades are not DSP effects — they are envelope params on `MixElementConfig.fadeIn/fadeOut`)
- `extension/src/agentCapabilityProvider.ts` — fix effectType enum from underscored to hyphenated; add description note for planned-only types
- `extension/src/providers/AudioProjectProvider.ts`:
  - **Add `audio:*` message handlers** (new unified protocol)
  - **Fix normalize**: `{ id, effectType: 'gain', enabled: true, params: { gainDb } }` (Rust factory reads `gainDb`, not `gain`)
  - **Fix denoise**: `{ id, effectType: 'noise-gate', enabled: true, params: { threshold: -40, attack: 1, hold: 50, release: 100 } }`. Show toast: "Applied noise-gate (spectral noise reduction not available)"
  - **Fade**: disabled in single-file mode (toast: "Fade requires project mode"); project mode sets per-element `fadeIn`/`fadeOut`
  - **Save path**: `saveCustomDocument()` must call `saveNka(data)` instead of raw `JSON.stringify()`
  - Remove old audio runtime control handlers (`editor:*`, `project:mix*`) and keep project state/edit messages (`project:init`, `project:sync`, `project:importAudio`, `project:dropImportAudio`)
- `webview/src/editor/AudioEditor.tsx` — migrate command handlers to send `audio:*` messages; remove fake fade effect types
- `webview/src/hooks/useAudioPlayback.ts` — send `audio:playback` instead of `editor:play`/`editor:pause`/etc.
- `nka/codec.ts` — set `CURRENT_NKA_VERSION = '2.1'`; `loadNka()` accepts only current `2.1`, marks future versions read-only, and marks older/non-current versions invalid. No effect-name migration is kept before first release.
- `presets/*.json` — update all preset files to use canonical hyphenated effect type names and canonical parametric-eq band sub-types.
- `nka/validator.ts` — validate `version` field; compatibility metadata warns on `> 2.1`
- `types/audioProject.ts` — document track mix, bpm, and master volume as `.nka` 2.1 fields

**Verification:**

- `pnpm build` passes
- `.nka` with `version: '1.0'` opens without error; `version: '99.0'` opens read-only with warning
- Effect type names consistent across TS types, agent schema, and preset JSON
- `EngineAudioEffectType` union matches exactly the 16 renderable types in Rust `effect_factory.rs`
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
    - `toggleSolo(trackId)` → dispatches `{ type: 'track.mix.setSolo', ... }`
    - `addTrackEffect/removeTrackEffect/updateTrackEffect` → dispatch `track.mix.*`
    - `setTrackColor/setTrackHeight` → update local `trackViewState` (no dispatch)
  - Derived getter: `getTrackUIState(trackId)` merges persisted `audioProjectData.trackMix[trackId]` with local `trackViewState`
- **Extract `buildMixConfig(data, ctx)` as pure function to `@neko/shared/audio/build-mix-config.ts`** — takes `AudioProjectData` + `MixConfigContext` (path resolver), returns `MixConfigBuildResult` (`{ config: MixStreamConfig, warnings: MixConfigWarning[] }`). No Zustand dependency. No Webview dependency. Planned effects filtered out with typed warning messages.
- **Webview does NOT call `buildMixConfig`** — it sends intent messages only:
  - `hooks/useAudioPlayback.ts` — sends `audio:playback { action: 'play', startTime? }`. Extension builds config from its own `_projectDataCache` + `PathResolver`. Playback hook only tracks `streamId`/`state` from the `audio:playbackReady` response.
  - `ExportPanel.tsx` — sends `audio:export { format, ... }`. Extension builds config internally and routes to `audioService.mixExport()`.
- **Extension callers of `buildMixConfig()`:**
  - `AudioProjectProvider` `audio:playback` handler — `buildMixConfig(cache, { projectDir, resolveSourcePath })` → `audioService.startMixStream(config)`
  - `AudioProjectProvider` `audio:export` handler — `buildMixConfig(cache, ctx)` → `audioService.mixExport(config, output, format)`
  - `AudioToolBridge.mixExport()` — `gateway.buildMixConfig(session)` in Extension (see P0-PR3)
- `audioProjectStore.ts` may keep a Webview-local test/helper `buildMixStreamConfig()` with identity path resolution for store assertions, but normal playback/export flows do not call it. Extension remains the production owner of Engine-readable render configs.
- Tests — verify `buildMixConfig()` path resolution (relative → absolute, `${VAR}` expansion)
- `extension/src/providers/AudioProjectProvider.ts` — `operationApplied` handler: add `track.mix.*` to the operation router; `audio:export` handler routes per mode (see P0-PR1b protocol table)
- `components/Timeline/TrackHeader.tsx` — update volume/pan/solo handlers to use new dispatch-based actions
- `stores/audioStore.ts` — keep only genuinely non-persisted UI state such as spectrum/sidebar visibility, zoom, selection, and playback state

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
- `buildMixConfig(data, ctx)` returns correct volume/pan/effectChain from project model

#### P0-PR3: Agent Tool Bridge Completion + Extension-Side Execution

**Goal**: Ensure all 18 TOOL_NAMES_AUDIO entries have an execution path; target specific documents; project-edit tools return honest success/failure.

**Key insight from neko-cut**: neko-cut's `TimelineToolExecutor` applies tool operations as **pure functions on project data in Extension**, then writes back to the model. It never sends postMessage to webview and waits for confirmation. The webview is notified to refresh, but the operation result is determined synchronously in Extension.

**neko-audio should adopt the same pattern:**

```
Agent → AudioToolBridge.applyTrackEffect(args)
  → session = gateway.resolveSession(args.documentUri)
  → gateway.applyOperation(session, operation, { syncReason: 'agent-edit' })
       // apply pure operation, update Extension cache, fire dirty, post project:sync
  → return { success: true }                                   // real result — operation already applied
```

**Why no correlationId / ack needed:**

- Operation is applied in Extension (same process as bridge) — result is deterministic
- `applyOperation()` is the pure operation router that either returns updated project data or throws
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

| Channel                                                          | Needs requestId? | Reason                                                                 |
| ---------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| postMessage (Webview→Extension): `audio:*` user actions          | No               | Extension is sole consumer; responses use distinct message types       |
| postMessage (Extension→Webview): `project:sync` after agent edit | No               | Notification only — webview replaces its state, no confirmation needed |
| HTTP (Extension→Engine)                                          | No               | HTTP is inherently request/response                                    |
| WebSocket (Engine→Webview)                                       | No               | Pure data stream                                                       |

**New types:**

```typescript
// @neko/shared/types/audioProtocol.ts (shared between webview + extension)
// Contains ONLY serializable DTOs that cross the postMessage boundary.

/** All audio:* request message types (Webview → Extension) */
export type AudioRequestMessage =
  | {
      type: 'audio:playback';
      action: 'play' | 'pause' | 'resume' | 'stop' | 'seek' | 'setSpeed' | 'setLoop';
      time?: number;
      speed?: number;
      startTime?: number;
      streamId?: string;
    }
  | { type: 'audio:trim'; startTime: number; endTime: number; outputPath?: string }
  | { type: 'audio:effects'; effects: AudioEffectConfig[]; outputPath?: string }
  | { type: 'audio:analyze'; kind: 'loudness' | 'silence' }
  | {
      type: 'audio:export';
      format?: string;
      codec?: string;
      bitrate?: number;
      sampleRate?: number;
      channels?: number;
      outputPath?: string;
    }
  | {
      type: 'audio:recording';
      action: 'listDevices' | 'start' | 'stop';
      deviceId?: string;
      streamId?: string;
      outputPath?: string;
      format?: string;
    };

/** All audio:* response message types (Extension → Webview) */
export type AudioResponseMessage =
  | { type: 'audio:playbackReady'; streamId: string; wsUrl: string }
  | { type: 'audio:playbackResult'; success: boolean; streamId?: string }
  | { type: 'audio:trimResult'; success: boolean; outputPath?: string; error?: string }
  | { type: 'audio:effectsResult'; success: boolean; outputPath?: string; error?: string }
  | { type: 'audio:analysisResult'; kind: 'loudness' | 'silence'; result: Record<string, unknown> }
  | {
      type: 'audio:exportResult';
      success: boolean;
      outputPath?: string;
      error?: string;
      warnings?: string[];
    }
  | {
      type: 'audio:recordingResult';
      success: boolean;
      action: string;
      devices?: unknown[];
      streamId?: string;
      monitorUrl?: string;
      outputPath?: string;
      error?: string;
    }
  | { type: 'audio:error'; success: false; error: string };

/** Project sync notification (Extension → Webview, after Agent edit or revert) */
export interface ProjectSyncMessage {
  type: 'project:sync';
  documentUri?: string;
  projectData: AudioProjectData;
  /** Present when sync is caused by an Agent/tool edit; lets Webview add an undo entry without executing the op. */
  operation?: EditOperation;
  reason?: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change';
  warnings?: string[];
}
```

```typescript
// extension/src/services/audioProjectSessionGateway.ts (Extension-only, NOT in @neko/shared)
// Gateway interface involves Extension-specific concerns (document cache, dirty events, focused panel).

/** Atomic project session snapshot */
export interface ProjectSession {
  documentUri: string;
  projectData: AudioProjectData;
}

/** Gateway interface for AudioToolBridge — Extension-side dependency injection port */
export interface AudioProjectSessionGateway {
  resolveSession(documentUri?: string): Promise<ProjectSession | null>;
  applyOperation(
    session: ProjectSession,
    operation: AudioProjectEditOperation,
    options?: { syncReason?: ProjectSyncMessage['reason'] },
  ): Promise<ProjectSession>;
  buildMixConfig(session: ProjectSession): Promise<ProjectMixConfigResult>;
}
```

**Responsibility split:**

- `AudioProjectProvider` **implements** `AudioProjectSessionGateway`:
  - `resolveSession(uri?)` — if uri provided, looks up `_projectDataCache.get(uri)` and returns `{ documentUri, projectData }`; if omitted, uses the focused/active audio project panel. Atomic: data and URI always come from the same document.
  - `applyOperation(session, operation, options?)` — applies the operation to `_projectDataCache`, fires `onDidChangeCustomDocument`, and sends a targeted `{ type: 'project:sync', documentUri, projectData, operation, reason }` message.
  - `buildMixConfig(session)` — builds the Extension-owned render config using project path context and returns warnings for planned/unsupported effects.
- `AudioToolBridge` constructor takes `gateway: AudioProjectSessionGateway` + `audioService: AudioService` — clean dependency injection, no direct Provider access

**Modified files:**

- `@neko/shared/types/audioProtocol.ts` — define `AudioRequestMessage`, `AudioResponseMessage`, and `ProjectSyncMessage` serializable message types. Both webview and extension import from here for type-safe postMessage contracts.
- `extension/src/services/audioProjectSessionGateway.ts` — define `ProjectSession`, `AudioProjectSessionGateway`, and `AudioProjectEditOperation` as an Extension-only port, not shared
- `extension/src/services/audioToolBridge.ts`:
  - Constructor: `constructor(private gateway: AudioProjectSessionGateway, private audioService: AudioService)`
  - Read tools (`GetAudioProjectInfo`, `ListAudioTracks`) → `gateway.resolveSession(args.documentUri?)`. Returns `{ documentUri, projectData }` atomically — response includes both project info AND the resolved `documentUri` for subsequent calls.
  - Project-edit tools: `const session = await gateway.resolveSession(args.documentUri)` → if `!session` return `{ success: false, error: 'No audio project open' }` → build a typed operation with `before` metadata → `await gateway.applyOperation(session, operation, { syncReason: 'agent-edit' })` → return `{ success: true }`
  - `MixExport` tool: resolves project session → calls `gateway.buildMixConfig(session)` **in Extension** with path resolution context → gets `{ config, warnings }` → calls `audioService.mixExport(config, outputPath, format)` → returns `{ output, warnings }` to Agent.
  - Engine tools → call `audioService` directly
  - `AudioDenoise` → `audioService.transcode(input, output, { effects: [{ id, effectType: 'noise-gate', enabled: true, params: { threshold: -40, attack: 1, hold: 50, release: 100 } }] })`. Returns `{ success: true, data: { output, note: 'Applied noise-gate (threshold-based). Spectral noise reduction not available.' } }`
  - `StemSeparation` → `{ success: false, error: 'Stem separation requires ML model not yet available in engine' }` (honest failure)
- `extension/src/agentCapabilityProvider.ts`:
  - All UI-mutating tool schemas AND `MixExport` add optional `documentUri` parameter: `{ type: 'string', description: 'Target document URI (from GetAudioProjectInfo/ListAudioTracks). If omitted, uses focused document.' }` — MixExport needs it to resolve the project session for config building.
  - `GetAudioProjectInfo` and `ListAudioTracks` schemas add optional `documentUri` input param; responses include `documentUri` field
  - Agent prompt fragment documents the pattern: "Call GetAudioProjectInfo first to obtain documentUri, then pass it to subsequent tools"
- `extension/src/providers/AudioProjectProvider.ts`:
  - Implement `AudioProjectSessionGateway` interface
  - Add `audio:*` message handlers (new unified protocol)
  - Implement `postToDocument()` for targeted sync notifications
  - Keep `postToActivePanels()` for broadcast events (project:init, etc.) — NOT for agent operations
- `webview/src/editor/AudioEditor.tsx`:
  - Handle `project:sync` message → replace `audioProjectData` in store + push op to undo stack (notification only, no execution)
  - **No `agent:*` handler** — Agent edits are executed in Extension, not Webview. Webview only receives the sync notification.
- `extension/src/agentCapabilityProvider.ts`:
  - Expand `getPromptFragments()`:
    - Effect types are **hyphenated** and canonical (for example `parametric-eq`)
    - `noise-reduction`, `pitch-shift`, `time-stretch` are **UI-only** — not rendered by engine
    - Engine-renderable effects: gain, high-pass, low-pass, band-pass, notch, parametric-eq, compressor, noise-gate, limiter, reverb, delay, chorus, distortion
    - Common workflows (podcast chain, scoring mix, TTS dialog)
    - Unit conventions (volume 0.0-2.0, pan -1.0-1.0)

**Complete bridge tool checklist (15 tools via AudioToolBridge):**

| #   | Tool                   | Category            | Implementation                                                                                                                                                         | Return                                                                             |
| --- | ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `GetAudioProjectInfo`  | read                | `gateway.resolveSession(args.documentUri)` → extract metadata                                                                                                          | `{ documentUri, name, bpm, sampleRate, channels, trackCount, masterVolume, ... }`  |
| 2   | `ListAudioTracks`      | read                | `gateway.resolveSession(args.documentUri)` → map tracks                                                                                                                | `{ documentUri, tracks: [{ id, name, type, muted, locked, elementCount }] }`       |
| 3   | `AddAudioTrack`        | project-edit        | Extension applies `track.add` to cache → notify webview                                                                                                                | `{ success }` or `{ success: false, error }`                                       |
| 4   | `RemoveAudioTrack`     | project-edit        | Extension applies `track.remove` to cache → notify webview                                                                                                             | `{ success }` or `{ success: false, error }`                                       |
| 5   | `ImportAudio`          | engine+project-edit | **Extension-orchestrated**: `audioService.probeAudio(filePath)` → create track + element → update project cache → notify webview via `project:sync`.                   | `{ success: true, trackId }` or `{ success: false, error }`                        |
| 6   | `SetTrackVolume`       | project-edit        | Extension applies `track.mix.setVolume` to cache → notify webview                                                                                                      | `{ success }` or `{ success: false, error }`                                       |
| 7   | `SetTrackPan`          | project-edit        | Extension applies `track.mix.setPan` to cache → notify webview                                                                                                         | `{ success }` or `{ success: false, error }`                                       |
| 8   | `SetTrackProperties`   | project-edit        | Extension applies `track.update` to cache → notify webview                                                                                                             | `{ success }` or `{ success: false, error }`                                       |
| 9   | `ApplyTrackEffect`     | project-edit        | Extension applies `track.mix.effect.add` to cache → notify webview                                                                                                     | `{ success }` or `{ success: false, error }`                                       |
| 10  | `RemoveTrackEffect`    | project-edit        | Extension applies `track.mix.effect.remove` to cache → notify webview                                                                                                  | `{ success }` or `{ success: false, error }`                                       |
| 11  | `ApplyMasterEffect`    | project-edit        | Extension applies `audio.effect.add` to cache → notify webview                                                                                                         | `{ success }` or `{ success: false, error }`                                       |
| 12  | `MixExport`            | engine              | `resolveSession` → `gateway.buildMixConfig(session)` → `audioService.mixExport(config, outputPath, format)`                                                            | `{ output, warnings }`                                                             |
| 13  | `AnalyzeAudioLoudness` | engine              | `audioService.analyzeLoudness(filePath)`                                                                                                                               | `{ integratedLoudness, truePeak, loudnessRange }`                                  |
| 14  | `AudioDenoise`         | engine              | `audioService.transcode(input, output, { effects: [{ id, effectType: 'noise-gate', enabled: true, params: { threshold: -40, attack: 1, hold: 50, release: 100 } }] })` | `{ output, note: 'Applied noise-gate. Spectral noise reduction not available.' }`  |
| 15  | `StemSeparation`       | engine              | Not available in P0                                                                                                                                                    | `{ success: false, error: 'Stem separation requires ML model not yet available' }` |

**3 tools via AgentCapabilityProvider (provider-direct, conditional on mediaService):**

| #   | Tool            | Implementation                                            |
| --- | --------------- | --------------------------------------------------------- |
| 16  | `GenerateMusic` | `mediaService.generateMusic({ prompt, duration, style })` |
| 17  | `GenerateSFX`   | `mediaService.generateSFX({ prompt, duration })`          |
| 18  | `GenerateVoice` | `mediaService.generateVoice({ text, voiceId })`           |

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

- `webview/src/components/MixerPanel.tsx` — initial bottom panel with per-track `ChannelStrip` controls and horizontal scroll

**Modified files:**

- `editor/AudioEditor.tsx` — insert `<MixerPanel />` below timeline for `.nka` project mode
- `styles/editor.css` — add full-width bottom mixer band and stable channel strip dimensions
- `stores/__tests__/audioProjectStore.test.ts` — prove Mixer and TrackHeader actions reflect the same persisted mix state and undo stack

**Design:**

- Mixer reads from `audioProjectData.trackMix` (true SSOT, persisted + undoable)
- Mixer writes via `dispatch(track.mix.*)` — same path as TrackHeader
- Initial scope is always visible in project mode, track strips only, with FX count display. Collapsible state, master strip, bus strips, send controls, and track-specific EffectsPanel focus are future P1/P2 refinements.

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
- `buildMixConfig(data, ctx)` — pass clip effects into MixElementConfig
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

#### Mixdown Input Cleanup

Completed in this change after Webview playback/export and Agent MixExport migrated to Extension-built `MixdownConfig`:

- Deleted `tracks`, `sampleRate`, and `channels` fallback parsing from `MixdownRequestOptions`
- Require `{ config: MixdownConfig, time? }`
- Removed deprecation warning coverage for the removed `audios:mixdown` fallback
- Kept a regression test proving missing `config` returns `config required for audios:mixdown`

---

### P2: DAW-Ready Architecture + Plugin Interface (~2 PR)

#### P2-PR1: Abstract Track Types + Routing Matrix

- Finalize `AudioTrackCategory` enum usage across track creation UI
- New component `Routing/RoutingMatrix.tsx` — grid view **derived from** buses + trackMix (no separate routingNodes)
- Track creation dialog supports `audio` | `bus` types (P2); `instrument` | `midi` reserved for future

#### P2-PR2: Plugin Interface

- `@neko/shared/types/audioPlugin.ts` — IPluginDescriptor, IPluginState (see contracts above)
- 16 engine DSP effects registered as `format: 'builtin'` plugins (matching `EngineAudioEffectType`)
- New component `PluginBrowser.tsx` — browsable plugin list
- Future VST3/AU: engine-side only, webview uses same IPluginDescriptor interface

### P3: Step Sequencer (deferred)

Step sequencer is more relevant to music creation than audio post-production. Deferred to P3, scoped to SFX/rhythm asset generation only:

- `StepSequencer/StepSequencer.tsx` + `StepGrid.tsx`
- `audioPattern.ts` (StepPattern, StepRow)
- Pattern → trigger sample bank WAV → render as audio clip

---

## .nka Version Strategy

**Adopt a current-only schema before first release:**

| Version | Content                                                                                   | Migration                                                                        |
| ------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `2.1`   | Current working format (tracks, masterEffectsChain, markers, trackMix, bpm, masterVolume) | `CURRENT_NKA_VERSION` is `'2.1'`; Rust CLI `NkaLoader` only exports this version |

**Rules:**

- `loadNka()` accepts only `'2.1'`; unknown future versions (e.g. `'99.0'`) open **read-only** with warning; older/non-current versions are invalid because the foundation has not shipped
- `saveNka()` writes `CURRENT_NKA_VERSION` for new/migrated files. Pure function, no UI concerns.
- Current `2.1` fields are optional where practical with `undefined` defaults.
- No separate `routingNodes` field — routing derived from `buses` + `trackMix.sends`

**Implementation of read-only state:**

- `NkaLoadResult` includes `compatibility: { loadedVersion: string; currentVersion: string; mode: 'current' | 'future' | 'invalid'; readOnly: boolean; warnings: string[] }` (returned by `loadNka()`)
- `AudioProjectProvider` maintains per-document read-only compatibility state from `NkaLoadResult.compatibility.readOnly`
- `saveCustomDocument()` checks compatibility read-only state — if read-only, shows destructive downgrade confirmation for the current `.nka` version (`2.1`). On confirm, clears read-only state and saves. On cancel, returns without saving.
- `saveCustomDocument()` calls `saveNka(data)` (not raw `JSON.stringify`) — ensures version stamp and validation
- This is a **Save with destructive confirm**, not forced Save As. Rationale: forcing Save As for every future-version file is too disruptive for the common case where the user just wants to edit and save back.

**Schema-strip behavior on downgrade save**: `saveNka()` performs **schema-strip** — it serializes only the fields defined in `CURRENT_NKA_VERSION`'s schema. Unknown fields from future versions (loaded via `JSON.parse` but not mapped to typed `AudioProjectData` properties) are **not preserved**. This is by design:

- TypeScript's typed deserialization (`loadNka` → `AudioProjectData`) already drops unknown fields at load time — they never enter the in-memory model
- Writing back "version 2.1" with stray future fields would produce a file that claims v2.1 but contains unrecognized content, confusing both the current and future parsers
- The destructive confirm dialog explicitly warns "may lose unsupported features" — the user opts in knowing fields will be stripped
- If lossless round-tripping of future files is needed later, `loadNka` must preserve a `_rawExtensions: Record<string, unknown>` sidecar and `saveNka` must merge it back. This is deferred — P0 prioritizes correctness over losslessness.

---

## Key Design Decisions

| #   | Decision                                                                                                         | Rationale                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Track mix state (volume/pan/solo/effectChain) persisted in `AudioProjectData.trackMix`, driven by EditOperations | Enables Undo/Redo, save/revert, Extension cache sync. Eliminates the local-only `trackUIState` SSOT gap.                                                                                                                                                                              |
| D2  | Effect types use hyphenated names as canonical form                                                              | Matches Rust `effect_factory.rs`; agent tool schema, webview types, and engine all use the same names.                                                                                                                                                                                |
| D3  | Agent project-edit tools execute in Extension (not webview), matching neko-cut pattern                           | Pure function `applyOperation()` on Extension cache → deterministic result → notify webview to sync. No postMessage round-trip, no timeout, no correlationId needed.                                                                                                                  |
| D4  | `postMessage` targets specific document panel, not broadcast                                                     | Prevents multi-document race conditions.                                                                                                                                                                                                                                              |
| D5  | Routing model: `buses` + `trackMix.sends/outputId` (no separate `routingNodes`)                                  | Single SSOT for routing. RoutingMatrix derives its view at render time.                                                                                                                                                                                                               |
| D6  | Automation is data, not real-time DSP                                                                            | Post-production = offline render; engine interpolates at mix time.                                                                                                                                                                                                                    |
| D7  | Plugin interface wraps builtin effects first                                                                     | 16 engine effects → `format: 'builtin'`; VST3/AU is engine-side addition only.                                                                                                                                                                                                        |
| D8  | Step sequencer deferred to P3                                                                                    | Low relevance to post-production; scoped to SFX/rhythm asset generation.                                                                                                                                                                                                              |
| D9  | `.nka` version `2.1` as explicit baseline, additive extensions only                                              | Unifies the three inconsistent version claims; loadNka tolerates old versions and CLI export has a single supported current format.                                                                                                                                                   |
| D10 | P0-PR1a: Engine `audios:transcode` must support effects                                                          | Current TS→Engine effects pipeline is completely broken (silently ignored). Minimal Rust change: add optional `effects` field + process loop. Without this, all single-file effect operations are fake.                                                                               |
| D11 | Effect types split: `EngineAudioEffectType` (16 renderable) vs `PlannedAudioEffectType` (3 UI-only)              | Prevents Agent from assuming noise-reduction/pitch-shift/time-stretch can be rendered. Agent prompt fragments document which effects are engine-supported.                                                                                                                            |
| D12 | AudioDenoise applies noise-gate (honest), not spectral denoising                                                 | Engine has no spectral noise reduction. Noise-gate is the closest available primitive. Tool response clearly states what was applied. True denoising deferred to P2+ (ONNX ML model).                                                                                                 |
| D13 | `buildMixConfig(data, ctx)` requires `MixConfigContext` with path resolver                                       | `.nka` stores relative/variable paths; Engine needs absolute paths. Pure data-only builder cannot reliably produce Engine-readable paths. Extension provides `PathResolver` context. Rust CLI uses an equivalent `NkaLoader` + `ProjectContext` mapper rather than importing TS code. |
| D14 | Agent edits execute in Extension only — no `agent:*` Webview handler                                             | Eliminates fire-and-forget gap. Webview receives `project:sync` notification, never executes agent operations. Matches neko-cut `TimelineToolExecutor` pattern.                                                                                                                       |
| D15 | `AudioProjectSessionGateway` lives in Extension, not `@neko/shared`                                              | Gateway involves Extension-specific concerns (document cache, dirty events, focused panel). Shared layer only contains serializable DTOs (`AudioRequestMessage`, `AudioResponseMessage`).                                                                                             |
| D16 | Unsupported effects in mix paths produce warnings, not hard failures                                             | Mix must still play even if one effect is unsupported. `AudioMixdown` collects warnings during initial chain build and hot-update chain rebuild; `mix_export` surfaces them in response. Differs from transcode (which can hard-fail because it's a one-shot operation).              |
| D17 | `.nka` downgrade save performs schema-strip (drops unknown future fields)                                        | Typed deserialization already drops unknowns at load time. Writing v2.1 with stray future fields would produce inconsistent files. Explicit user opt-in via destructive confirm dialog.                                                                                               |
| D18 | Mix stream hot-update uses full `MixdownConfig` replacement (no incremental apply)                               | `MixdownConfig` is a derived render instruction, not an editable model. Edits happen on `AudioProjectData` in TS, then full config is rebuilt and pushed. Unlike video's `applyOperation` which incrementally mutates `Timeline`.                                                     |

---

## Risks & Mitigations

| Risk                                            | Mitigation                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-PR2 is a large refactor (trackUIState split) | Incremental: first add `TrackMixOperation` types + apply functions, then migrate callers one action at a time; rename remainder to `trackViewState` last                                          |
| P0-PR1a Rust change has blast radius            | Minimal: only adds typed `AudioTranscodeOptions.effects: Vec<AudioRenderEffectConfig>` and a non-empty effects branch in the transcode impl. Existing behavior unchanged when `effects` is empty. |
| Engine lacks per-element effects (P1-PR1)       | Ship clip effect UI with "render on export" semantics; real-time preview degrades to track-level                                                                                                  |
| Engine lacks automation interpolation (P1-PR2)  | Ship automation editing UI; export-only rendering initially                                                                                                                                       |
| Engine lacks stem separation (P0-PR3)           | Tool returns honest `{ success: false, error: 'Not available' }`                                                                                                                                  |
| Mixer panel height competes with timeline       | Collapsible with user-resizable divider; default collapsed; `M` toggle                                                                                                                            |

---

## Verification

**P0-PR1a (Engine):**

- `cargo test` — transcode with gain effect produces audibly different output
- TS integration test: `audioService.transcode(file, out, { effects: [{ id: 'g1', effectType: 'gain', enabled: true, params: { gainDb: -6 } }] })` → output is 6dB quieter

**P0-PR1b (Contract):**

- `pnpm build` passes
- `.nka` with `version: '1.0'` opens without error; `version: '99.0'` opens read-only with warning
- Effect type names consistent across TS types, agent schema, and preset JSON
- `EngineAudioEffectType` union matches exactly the 16 renderable types in Rust `effect_factory.rs`

**P0-PR2 (State Model):**

- Open .nka → change volume → Save → Reopen → volume preserved
- Undo after volume change → reverts
- `buildMixConfig(data, ctx)` reads from `trackMix` correctly

**P0-PR3 (Agent Tools):**

- Agent calls ApplyTrackEffect → Extension applies to cache → notifies webview via `project:sync` → tool returns `{ success: true }`
- Agent calls ApplyTrackEffect with invalid trackId → `applyOperation` throws → tool returns `{ success: false, error }`
- Agent calls AudioDenoise → engine transcodes → output path returned
- All 18 TOOL_NAMES_AUDIO entries have an execution path (15 via bridge, 3 via provider-direct media generation)

**P0-PR4 (Mixer):**

- Mixer panel opens/closes, channel strips reflect project model
- Volume fader change in Mixer → TrackHeader reflects same value
- Undo works across both Mixer and TrackHeader

**P1/P2:** (see individual PR descriptions above)
