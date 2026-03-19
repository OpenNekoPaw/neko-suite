# Neko Audio

> 专业音频工作站：波形编辑、频谱分析、12 种效果链、麦克风录制、AI 降噪/标准化、.nka 项目文件

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：双包结构（Extension Host + Webview）
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：专业音频编辑——波形可视化、频谱分析、效果链、录制、AI 降噪、导出
- **入口**：`packages/extension/src/extension.ts`
- **依赖**：`@neko/shared`、`@neko/neko-client`
- **激活依赖**：neko-engine、neko-tools
- **状态**：Alpha（93%）
- **测试**：3 文件 / 78 测试（vitest v4）

## Architecture

```
音频文件 (.mp3/.wav/...) ──→ AudioEditorProvider (CustomReadonlyEditorProvider)
.nka 项目文件          ──→ AudioProjectProvider (CustomEditorProvider, save/revert)
                              │
                              ├─ AudioService (singleton)
                              │    └─ EngineClient HTTP → neko-engine Frame Server
                              │         ├─ audios:probe     → AudioInfo
                              │         ├─ audios:waveform   → WaveformData
                              │         ├─ audios:stream     → PCM over WebSocket
                              │         ├─ audios:transcode  → trim/effects/export
                              │         ├─ audios:loudness   → EBU R128 metrics
                              │         └─ audios:silence    → regions[]
                              │
                              └─ Webview (React + Zustand + Vite)
                                   ├─ EditableWaveform  (波形渲染 + 选区)
                                   ├─ AudioControls     (播放/音量/速度/快捷键)
                                   ├─ TransportBar      (文件信息 + 工具按钮)
                                   ├─ SpectrumAnalyzer  (AnalyserNode FFT)
                                   ├─ EffectsPanel      (12 种效果 + 参数编辑器)
                                   ├─ RecordingPanel    (getUserMedia + 电平表)
                                   ├─ ExportPanel       (格式/采样率/码率/声道)
                                   ├─ LoudnessPanel     (EBU R128 响度指标)
                                   └─ Toast             (操作结果通知)
```

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
| `neko.audio.new` | 新建 .nka 音频项目（右键文件夹 / 命令面板，空模板 + 内联重命名） |
| `neko.audio.record` | 切换录音面板 |
| `neko.audio.denoise` | AI 降噪 |
| `neko.audio.normalize` | 响度标准化 |
| `neko.audio.showSpectrum` | 切换频谱面板 |
| `neko.audio.trim` | 裁剪选区 |
| `neko.audio.fadeIn` / `fadeOut` | 淡入/淡出 |
| `neko.audio.exportAs` | 切换导出面板 |

### .nka 项目文件

```jsonc
{
  "version": "1.0",
  "name": "My Audio",
  "audioSource": null,           // null = empty project, or:
  // "audioSource": {
  //   "filePath": "./source.wav",  // relative to .nka
  //   "duration": 120.5,
  //   "sampleRate": 44100,
  //   "channels": 2,
  //   "format": "wav"
  // },
  "effectsChain": [],  // AudioEffectInstance[]
  "markers": []        // { id, time, label, color? }[]
}
```

**创建流程**：右键文件夹 → "新建音频" → 创建空 .nka 文件 → 内联重命名（与画布/素描/剧本一致）

### 技术栈

| 层级 | 技术 |
|------|------|
| Extension | VSCode Extension API + esbuild |
| Webview | React 18 + Zustand + Vite |
| 音频播放 | AudioStreamClient (PCM f32le WebSocket) |
| 频谱分析 | Web Audio API AnalyserNode |
| 录制 | MediaRecorder API + getUserMedia |
| 引擎通信 | EngineClient HTTP → neko-engine Rust |
| i18n | @neko/shared (en + zh-cn, 95 keys) |
| 测试 | Vitest v4 (3 files / 78 tests) |

### EditOperation 集成

Webview 端通过 `audioProjectStore` 管理编辑操作，支持 dispatch + undo/redo + Extension 同步：

- **操作类型**：`audio.effect.*`（效果链 CRUD/排序/切换）、`audio.marker.*`（标记 CRUD）
- **Store**：`stores/audioProjectStore.ts` — dispatch → apply → history → postMessage
- **Extension 同步**：`operationApplied` 消息 → AudioProjectProvider 增量更新内存缓存 + dirty 事件
