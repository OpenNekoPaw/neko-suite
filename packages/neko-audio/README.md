# Neko Audio

> 多轨音频工作站：多轨时间线、波形编辑、频谱分析、12 种效果链、麦克风录制、AI 降噪/标准化、.nka 项目文件

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
.nka 项目文件 (v2)      ──→ AudioProjectProvider (多轨编辑器, save/revert)
                              │
                              ├─ AudioService (singleton)
                              │    └─ EngineClient HTTP → neko-engine Frame Server
                              │         ├─ audios:probe      → AudioInfo
                              │         ├─ audios:waveform    → WaveformData
                              │         ├─ audios:stream      → PCM over WebSocket
                              │         ├─ audios:transcode   → trim/effects/export
                              │         ├─ audios:mixdown     → 多轨混音
                              │         ├─ audios:loudness    → EBU R128 metrics
                              │         └─ audios:silence     → regions[]
                              │
                              └─ Webview (React + Zustand + Vite)
                                   ├─ AudioTimeline     (多轨时间线容器)
                                   │   ├─ TimelineRuler (自适应时间标尺)
                                   │   ├─ TrackLane     (轨道头 + 元素区)
                                   │   ├─ AudioClip     (波形缩略图)
                                   │   └─ Playhead      (播放头)
                                   ├─ TransportBar      (播放控制 + 时间显示)
                                   ├─ Toolbar           (工具按钮)
                                   ├─ SpectrumAnalyzer  (AnalyserNode FFT)
                                   ├─ EffectsPanel      (12 种效果 + 参数编辑器)
                                   ├─ RecordingPanel    (录音到指定轨道)
                                   ├─ ExportPanel       (格式/采样率/码率/声道)
                                   ├─ LoudnessPanel     (EBU R128 响度指标)
                                   └─ Toast             (操作结果通知)
```

### .nka 项目文件 (v2)

```jsonc
{
  "version": "2.0",
  "name": "My Audio Project",
  "sampleRate": 48000,
  "channels": 2,
  "tracks": [                    // TimelineTrack[] (复用 neko-types)
    {
      "id": "track-1",
      "type": "audio",
      "name": "Track 1",
      "muted": false,
      "locked": false,
      "hidden": false,
      "isMain": true,
      "elements": [              // AudioElement[]
        {
          "id": "elem-1",
          "type": "audio",
          "name": "song.mp3",
          "src": "/path/to/song.mp3",
          "duration": 180.5,
          "startTime": 0,
          "trimStart": 0,
          "trimEnd": 0
        }
      ]
    }
  ],
  "masterEffectsChain": [],      // AudioEffectSnapshot[] (master bus)
  "markers": []                  // AudioMarkerSnapshot[]
}
```

### 多轨操作类型

复用 neko-types 的 EditOperation 系统：

| 操作命名空间 | 操作 | 说明 |
|-------------|------|------|
| `track.*` | add/remove/update/reorder/toggle | 轨道 CRUD（复用 neko-cut） |
| `element.*` | add/remove/update/move/toggle | 音频片段 CRUD（复用 neko-cut） |
| `audio.effect.*` | add/remove/update/toggle/move | Master 效果链 |
| `audio.marker.*` | add/remove/update | 时间标记 |

### 支持格式

| 格式 | 打开 | 导出 |
|------|------|------|
| MP3  | ✅   | ✅   |
| WAV  | ✅   | ✅   |
| OGG  | ✅   | —    |
| FLAC | ✅   | ✅   |
| AAC  | ✅   | ✅   |
| M4A  | ✅   | —    |
| Opus | —    | ✅   |

### 效果链（12 种）

| 类别 | 效果 |
|------|------|
| 动态 | Compressor、Limiter |
| 滤波 | High-Pass、Low-Pass、Band-Pass |
| 空间 | Reverb、Delay |
| 调制 | Chorus、Distortion |
| 工具 | Noise Reduction、Pitch Shift、Time Stretch |

### 命令面板

| 命令 | 说明 |
|------|------|
| `neko.audio.new` | 新建 .nka 音频项目（v2 多轨格式） |
| `neko.audio.record` | 切换录音面板 |
| `neko.audio.denoise` | AI 降噪 |
| `neko.audio.normalize` | 响度标准化 |
| `neko.audio.showSpectrum` | 切换频谱面板 |
| `neko.audio.trim` | 裁剪选区 |
| `neko.audio.fadeIn` / `fadeOut` | 淡入/淡出 |
| `neko.audio.exportAs` | 切换导出面板 |

### Rust 引擎集成

| 模块 | 说明 |
|------|------|
| `audio/soft_limiter.rs` | 共享软限制器（AudioMixer + AudioMixdown） |
| `services/audio_mixdown.rs` | 多轨混音引擎（采样率驱动，独立于视频导出） |
| `controllers/audio.rs` | `audios:mixdown` 端点 |

### 技术栈

| 层级 | 技术 |
|------|------|
| Extension | VSCode Extension API + esbuild |
| Webview | React 18 + Zustand + Vite |
| 音频播放 | AudioStreamClient (PCM f32le WebSocket) |
| 频谱分析 | Web Audio API AnalyserNode |
| 录制 | MediaRecorder API + getUserMedia |
| 引擎通信 | EngineClient HTTP → neko-engine Rust |
| 混音引擎 | AudioMixdown (Rust, SoftLimiter) |
| 数据模型 | TimelineTrack + AudioElement（复用 neko-types） |
| 操作系统 | EditOperation + apply/invert（泛型化 HasTracks） |
| i18n | @neko/shared (en + zh-cn) |

### Store 架构

`audioProjectStore` 管理多轨编辑状态：

- **State**: `audioProjectData` (AudioProjectData) + `waveforms` + undo/redo 栈
- **Dispatch**: 支持 `audio.*` / `track.*` / `element.*` 操作
- **便捷方法**: addTrack/removeTrack/addElement/removeElement/addEffect/removeEffect 等
- **Extension 同步**: `operationApplied` 消息 → AudioProjectProvider cache-based save
