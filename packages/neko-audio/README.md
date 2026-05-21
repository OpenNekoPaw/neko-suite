# Neko Audio

> 多轨音频工作站：多轨时间线、Mixer、波形编辑、频谱分析、效果链、麦克风录制、混音播放/导出、.nka 项目文件

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：双包结构（Extension Host + Webview）
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：多轨音频编辑——多轨时间线、波形可视化、频谱分析、效果链、录制、AI 降噪、混音导出
- **入口**：`packages/extension/src/extension.ts`
- **依赖**：`@neko/shared`、`@neko/neko-client`
- **激活依赖**：neko-engine、neko-tools
- **状态**：Alpha
- **测试**：vitest v4

## Architecture

```
音频文件 (.mp3/.wav/...) ──→ AudioEditorProvider (只读预览器)
.nka 项目文件 (v2.2)    ──→ AudioProjectProvider (多轨编辑器, save/revert)
                              │
                              ├─ AudioService (singleton)
                              │    └─ EngineClient HTTP → neko-engine Frame Server
                              │         ├─ audios:probe      → AudioInfo
                              │         ├─ audios:waveform    → WaveformData
                              │         ├─ audios:stream      → PCM over WebSocket
                              │         ├─ audios:transcode   → trim/effects/export
                              │         ├─ audios:mixdown     → config-only 混音快照
                              │         ├─ audios:mix_stream  → 多轨实时流 + full config update
                              │         ├─ audios:mix_export  → 多轨导出 + warnings
                              │         ├─ audios:loudness    → EBU R128 metrics
                              │         └─ audios:silence     → regions[]
                              │
                              └─ Webview (React + Zustand + Vite)
                                   ├─ AudioTimeline     (多轨时间线容器)
                                   │   ├─ TimelineRuler (自适应时间标尺)
                                   │   ├─ TrackLane     (轨道头 + 元素区)
                                   │   ├─ AudioClip     (波形缩略图)
                                   │   └─ Playhead      (播放头)
                                   ├─ MixerPanel        (ChannelStrip: Vol/Pan/S/M/FX count)
                                   ├─ TransportBar      (播放控制 + 时间显示)
                                   ├─ Toolbar           (工具按钮)
                                   ├─ SpectrumAnalyzer  (AnalyserNode FFT)
                                   ├─ EffectsPanel      (12 种效果 + 参数编辑器)
                                   ├─ RecordingPanel    (录音到指定轨道)
                                   ├─ ExportPanel       (格式/采样率/码率/声道)
                                   ├─ LoudnessPanel     (EBU R128 响度指标)
                                   └─ Toast             (操作结果通知)
```

### .nka 项目文件 (v2.2)

```jsonc
{
  "version": "2.2",
  "name": "My Audio Project",
  "sampleRate": 48000,
  "channels": 2,
  "bpm": 120, // 兼容快捷字段；tempoMap 是 v2.2 的节拍源
  "tempoMap": {
    "ppq": 480,
    "tempoEvents": [{ "ticks": 0, "bpm": 120 }],
    "timeSignatureEvents": [{ "ticks": 0, "numerator": 4, "denominator": 4 }],
  },
  "tracks": [
    // TimelineTrack[] (复用 neko-types)
    {
      "id": "track-1",
      "type": "audio",
      "name": "Track 1",
      "muted": false,
      "locked": false,
      "hidden": false,
      "isMain": true,
      "elements": [
        // AudioElement[]
        {
          "id": "elem-1",
          "type": "audio",
          "name": "song.mp3",
          "src": "/path/to/song.mp3",
          "duration": 180.5,
          "startTime": 0,
          "trimStart": 0,
          "trimEnd": 0,
        },
      ],
    },
  ],
  "masterEffectsChain": [], // AudioEffectSnapshot[] (master bus)
  "markers": [], // AudioMarkerSnapshot[]
  "trackMix": {
    // 持久化轨道混音状态，TrackHeader/Mixer/Agent 共用
    "track-1": {
      "volume": 1,
      "pan": 0,
      "solo": false,
      "effectChain": [
        {
          "id": "fx-1",
          "effectType": "compressor",
          "enabled": true,
          "params": { "threshold": -18 },
        },
      ],
      "automation": [
        {
          "id": "lane-volume",
          "enabled": true,
          "target": { "kind": "track-volume" },
          "points": [
            { "ticks": 0, "value": 0.8, "curve": "linear" },
            { "ticks": 480, "value": 1.0, "curve": "hold" },
          ],
        },
        {
          "id": "lane-threshold",
          "enabled": true,
          "target": { "kind": "effect-param", "effectId": "fx-1", "param": "threshold" },
          "points": [{ "ticks": 0, "value": -24, "curve": "linear" }],
        },
      ],
    },
  },
  "masterVolume": 1,
}
```

`.nka` 版本策略：

- 当前写入版本是 `2.2`，由 `@neko/shared` 的 `saveNka(data)` 负责校验、schema strip 与序列化。
- `tempoMap` 是 v2.2 的节拍源。`bpm` 仍会从首个 tempo event 回填，用于单速度兼容路径。
- `loadNka()` 可读取 `2.1` 项目，并以 `bpm ?? 120` 派生默认 `tempoMap`。未知未来版本会以只读兼容状态打开；保存前必须确认降级，确认后写回当前 `2.2` schema，未知未来字段不会被保留。
- Rust `host-cli` 的 `NkaLoader` 是 legacy 只读 CLI 导出入口，目前只接受 `.nka v2.1`；`.nka v2.2` 项目播放/导出由 Extension 通过 `buildMixConfig(data, ctx)` 发送给 Engine，不经由该 CLI loader。

### TempoMap 与自动化

`tempoMap` 包含 `ppq`、`tempoEvents[]` 和 `timeSignatureEvents[]`。Webview 时间线显示 bars/beats，拖拽吸附会先把秒转换为 tick，在 tick 空间吸附后再写回现有秒字段。`audio.setBpm` 在有 `tempoMap` 时只更新第一个 tempo event，保持现有 BPM UI 与 undo/redo 兼容。

自动化持久化在 `AudioProjectData.trackMix[trackId].automation`，点位只保存 `ticks`、`value`、`curve`，不保存派生 seconds。目标使用结构化身份：

| target.kind    | 字段                  | 范围/验证来源                         | 渲染状态                                     |
| -------------- | --------------------- | ------------------------------------- | -------------------------------------------- |
| `track-volume` | —                     | `[0, 2]`                              | Engine mix stream/export sample-time 求值    |
| `track-pan`    | —                     | `[-1, 1]`                             | Engine mix stream/export sample-time 求值    |
| `effect-param` | `effectId` + `param`  | `@neko/shared` 音频效果参数 metadata  | 目前 buildMixConfig/Engine 显式 warning 跳过 |

Webview 自动化编辑通过 `track.mix.setAutomation` 操作进入 undo/redo 与 Extension cache；Agent 使用 `SetTrackAutomation` 工具，输入必须是 tick-based points，seconds-only 请求会失败。AI 来源的 `project:sync` operation 只驱动短暂的 Track/Clip/FX 高亮，不重新执行项目 mutation。

### 多轨操作类型

复用 neko-types 的 EditOperation 系统：

| 操作命名空间     | 操作                                                   | 说明                           |
| ---------------- | ------------------------------------------------------ | ------------------------------ |
| `track.*`        | add/remove/update/reorder/toggle                       | 轨道 CRUD（复用 neko-cut）     |
| `element.*`      | add/remove/update/move/toggle                          | 音频片段 CRUD（复用 neko-cut） |
| `track.mix.*`    | setVolume/setPan/setSolo/effect add/remove/update/move/setAutomation | 持久化轨道混音与自动化状态 |
| `audio.effect.*` | add/remove/update/toggle/move                          | Master 效果链                  |
| `audio.marker.*` | add/remove/update                                      | 时间标记                       |

Webview 的 TrackHeader、MixerPanel 和 AutomationLane 都通过这些 operation 修改 `AudioProjectData.trackMix`，再通过 `operationApplied` 同步到 Extension cache。颜色、高度、缩放、选择、AI 操作高亮、面板状态等仍是 Webview-local UI state，不写入 `.nka`。

### Webview 控制协议

Webview 用户动作走统一 `audio:*` 控制平面，Extension 负责按当前文档模式路由到单文件或项目混音路径：

| 消息              | 用途                                         |
| ----------------- | -------------------------------------------- |
| `audio:playback`  | play/pause/resume/stop/seek/setSpeed/setLoop |
| `audio:trim`      | 单文件裁剪                                   |
| `audio:effects`   | 单文件效果转码                               |
| `audio:analyze`   | loudness/silence 分析                        |
| `audio:export`    | 单文件转码或项目 mix export                  |
| `audio:recording` | listDevices/start/stop                       |

Webview 不构建项目 `MixdownConfig`。项目播放、导出和 Agent MixExport 都由 Extension 使用 `_projectDataCache` + 路径解析上下文调用 `buildMixConfig(data, ctx)` 后再发送给 Rust Engine。PCM 帧仍由 Webview 直接连接 Engine WebSocket 接收，Extension 不代理二进制音频流。

当前 `setSpeed` 对项目 mix stream 是全局预览倍率：Engine 按倍率推进 mix cursor 并由 pacer 调整发送节奏，不做相位声码器或重采样级时间拉伸。`speed > 1` 适合快速预览/跳读，不承诺连续变速音质；连续 time-stretch 属于后续 planned DSP 能力。

`project:init`、`project:sync`、`operationApplied`、`project:importAudio` 和 `project:dropImportAudio` 属于项目状态/编辑平面，不属于旧音频运行时控制协议。导入音频由 Extension 作为项目编辑处理；Extension 可调用 Engine probe/waveform 获取元数据，但 Engine 不修改 `.nka` 项目数据，也不需要 `audio:import`。当 `project:sync.operation.meta.source === 'ai'` 时，Webview 只记录展示用的 affected track/clip/effect IDs，不把同一 operation 回发给 Extension。

### Agent 执行边界

Agent 项目编辑工具不再通过 Webview `agent:*` postMessage 执行。`AudioToolBridge` 通过 Extension-only `AudioProjectSessionGateway`：

- 解析目标 `documentUri` 或当前焦点音频项目。
- 构造 `EditOperation` 并应用到 Extension-owned `_projectDataCache`。
- 触发 dirty 事件并向目标 Webview 发送 `project:sync`。
- 只有操作已经应用成功后才返回 `{ success: true }`。
- `SetTrackAutomation` 使用结构化 target 与 tick-based points；Extension 校验 track/effect/param、点位排序和数值范围后才应用 `track.mix.setAutomation`。

读工具返回 `documentUri`，后续写工具应传回同一个 URI 以避免多项目误写。媒体生成类工具不编辑 `.nka`，仍可由 provider 直接处理。

### 支持格式

| 格式 | 打开 | 导出 |
| ---- | ---- | ---- |
| MP3  | ✅   | ✅   |
| WAV  | ✅   | ✅   |
| OGG  | ✅   | —    |
| FLAC | ✅   | ✅   |
| AAC  | ✅   | ✅   |
| M4A  | ✅   | —    |
| Opus | —    | ✅   |

### 效果链

Engine-renderable 效果使用 hyphenated canonical 名称：

| 类别         | 效果                                                 |
| ------------ | ---------------------------------------------------- |
| 增益/动态    | Gain、Compressor、Noise Gate、Limiter                |
| 滤波/EQ      | High-Pass、Low-Pass、Band-Pass、Notch、Parametric EQ |
| 空间         | Reverb、Delay                                        |
| 调制         | Chorus、Distortion                                   |
| Planned-only | Noise Reduction、Pitch Shift、Time Stretch           |

Planned-only 效果可在 UI 中表示，但不会静默进入渲染路径：项目 mix 会过滤并返回 warning；Agent 项目编辑会返回不可渲染错误；transcode 对未知/不支持效果显式失败。

### 命令面板

| 命令                            | 说明                                |
| ------------------------------- | ----------------------------------- |
| `neko.audio.new`                | 新建 .nka 音频项目（v2.2 多轨格式） |
| `neko.audio.record`             | 切换录音面板                        |
| `neko.audio.denoise`            | AI 降噪                             |
| `neko.audio.normalize`          | 响度标准化                          |
| `neko.audio.showSpectrum`       | 切换频谱面板                        |
| `neko.audio.trim`               | 裁剪选区                            |
| `neko.audio.fadeIn` / `fadeOut` | 淡入/淡出                           |
| `neko.audio.exportAs`           | 切换导出面板                        |

### Rust 引擎集成

| 模块                         | 说明                                                |
| ---------------------------- | --------------------------------------------------- |
| `audio/soft_limiter.rs`      | 共享软限制器（AudioMixer + AudioMixdown）           |
| `services/audio_mixdown.rs`  | 多轨混音引擎（采样率驱动，track volume/pan 自动化） |
| `controllers/audio.rs`       | `audios:mixdown` / `mix_stream` / `mix_export` 端点 |
| `host-cli/src/nka_loader.rs` | Legacy 只读 `.nka` v2.1 → `MixdownConfig` CLI 导出映射；v2.2 项目走 Extension buildMixConfig 路径 |

### 技术栈

| 层级      | 技术                                             |
| --------- | ------------------------------------------------ |
| Extension | VSCode Extension API + esbuild                   |
| Webview   | React 18 + Zustand + Vite                        |
| 音频播放  | AudioStreamClient (PCM f32le WebSocket)          |
| 频谱分析  | Web Audio API AnalyserNode                       |
| 录制      | MediaRecorder API + getUserMedia                 |
| 引擎通信  | EngineClient HTTP → neko-engine Rust             |
| 混音引擎  | AudioMixdown (Rust, SoftLimiter)                 |
| 数据模型  | TimelineTrack + AudioElement（复用 neko-types）  |
| 操作系统  | EditOperation + apply/invert（泛型化 HasTracks） |
| i18n      | @neko/shared (en + zh-cn)                        |

### Store 架构

`audioProjectStore` 管理多轨编辑状态：

- **State**: `audioProjectData` (AudioProjectData) + `waveforms` + undo/redo 栈
- **Dispatch**: 支持 `audio.*` / `track.*` / `track.mix.*` / `element.*` 操作
- **便捷方法**: addTrack/removeTrack/addElement/removeElement/addEffect/removeEffect 等
- **Extension 同步**: `operationApplied` 消息 → AudioProjectProvider cache-based save
- **本地视图状态**: track color/height、AI operation highlights 等只保存在 Webview state，不序列化到 `.nka`
