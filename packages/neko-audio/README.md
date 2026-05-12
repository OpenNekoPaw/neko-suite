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
.nka 项目文件 (v2.1)    ──→ AudioProjectProvider (多轨编辑器, save/revert)
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

### .nka 项目文件 (v2.1)

```jsonc
{
  "version": "2.1",
  "name": "My Audio Project",
  "sampleRate": 48000,
  "channels": 2,
  "bpm": 120,
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
      "effectChain": [],
    },
  },
  "masterVolume": 1,
}
```

`.nka` 版本策略：

- 当前写入版本是 `2.1`，由 `@neko/shared` 的 `saveNka(data)` 负责校验、schema strip 与序列化。
- `loadNka()` 只接受当前 `2.1` 工程 schema；未上线阶段不保留旧 effect 命名或旧版本迁移路径。
- 未知未来版本会以只读兼容状态打开；保存前必须确认降级，确认后写回当前 `2.1` schema，未知未来字段不会被保留。
- Rust `host-cli` 的 `NkaLoader` 是只读导出入口，只支持当前 `2.1`，不迁移、不编辑、不保存 `.nka`。

### 多轨操作类型

复用 neko-types 的 EditOperation 系统：

| 操作命名空间     | 操作                                                   | 说明                           |
| ---------------- | ------------------------------------------------------ | ------------------------------ |
| `track.*`        | add/remove/update/reorder/toggle                       | 轨道 CRUD（复用 neko-cut）     |
| `element.*`      | add/remove/update/move/toggle                          | 音频片段 CRUD（复用 neko-cut） |
| `track.mix.*`    | setVolume/setPan/setSolo/effect add/remove/update/move | 持久化轨道混音状态             |
| `audio.effect.*` | add/remove/update/toggle/move                          | Master 效果链                  |
| `audio.marker.*` | add/remove/update                                      | 时间标记                       |

Webview 的 TrackHeader 和 MixerPanel 都通过这些 operation 修改 `AudioProjectData.trackMix`，再通过 `operationApplied` 同步到 Extension cache。颜色、高度、缩放、选择、面板状态等仍是 Webview-local UI state，不写入 `.nka`。

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

`project:init`、`project:sync`、`operationApplied`、`project:importAudio` 和 `project:dropImportAudio` 属于项目状态/编辑平面，不属于旧音频运行时控制协议。导入音频由 Extension 作为项目编辑处理；Extension 可调用 Engine probe/waveform 获取元数据，但 Engine 不修改 `.nka` 项目数据，也不需要 `audio:import`。

### Agent 执行边界

Agent 项目编辑工具不再通过 Webview `agent:*` postMessage 执行。`AudioToolBridge` 通过 Extension-only `AudioProjectSessionGateway`：

- 解析目标 `documentUri` 或当前焦点音频项目。
- 构造 `EditOperation` 并应用到 Extension-owned `_projectDataCache`。
- 触发 dirty 事件并向目标 Webview 发送 `project:sync`。
- 只有操作已经应用成功后才返回 `{ success: true }`。

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
| `neko.audio.new`                | 新建 .nka 音频项目（v2.1 多轨格式） |
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
| `services/audio_mixdown.rs`  | 多轨混音引擎（采样率驱动，独立于视频导出）          |
| `controllers/audio.rs`       | `audios:mixdown` / `mix_stream` / `mix_export` 端点 |
| `host-cli/src/nka_loader.rs` | 只读 `.nka` v2.1 → `MixdownConfig` CLI 导出映射     |

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
- **本地视图状态**: track color/height 等只保存在 `trackViewState`，不序列化到 `.nka`
