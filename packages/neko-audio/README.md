# Neko Audio

> 音频工站：独立波形编辑、频谱分析、麦克风录制与降噪

## Context Summary

- **项目**：Neko Creator Suite - VS Code 全能内容创作工作站
- **角色**：音频工作站，波形编辑与处理
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Audio** 是 Neko Creator Suite 的音频工作站，提供专业级的音频编辑能力。支持波形可视化、频谱分析、麦克风录制、AI 降噪等功能，让音频处理变得简单高效。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **波形编辑** | 可视化波形、精确剪辑 |
| **频谱分析** | 实时频谱显示 |
| **麦克风录制** | 直接录制画外音 |
| **AI 降噪** | 智能去除背景噪音 |
| **音量标准化** | 自动调整音量 |
| **淡入淡出** | 平滑的音频过渡 |
| **音频裁剪** | 精确裁剪音频片段 |

---

## 支持格式

| 格式 | 说明 |
|------|------|
| MP3 | MPEG Audio Layer 3 |
| WAV | Waveform Audio |
| OGG | Ogg Vorbis |
| FLAC | Free Lossless Audio |
| AAC | Advanced Audio Coding |
| M4A | MPEG-4 Audio |

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.audio.sampleRate` | `48000` | 录制采样率 |
| `neko.audio.inputDevice` | `""` | 首选输入设备 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Audio: Record Audio` | 录制音频 |
| `Neko Audio: Denoise Audio` | AI 降噪 |
| `Neko Audio: Normalize Audio` | 音量标准化 |
| `Neko Audio: Show Spectrum Analyzer` | 显示频谱分析器 |
| `Neko Audio: Trim Audio` | 裁剪音频 |
| `Neko Audio: Apply Fade In` | 应用淡入 |
| `Neko Audio: Apply Fade Out` | 应用淡出 |

---

## 工作流

```
音频文件 / 麦克风录制
    │
    ├─→ 波形可视化
    │
    ├─→ 频谱分析
    │
    ├─→ 编辑处理
    │   ├── 裁剪
    │   ├── 淡入淡出
    │   └── 音量调节
    │
    ├─→ AI 降噪
    │
    └─→ 导出 / 添加到时间线
```

---

## 依赖关系

```
neko-audio (独立)
    └── @uniedit/shared (类型)
```

---

## 技术栈

- **音频处理**：Web Audio API
- **可视化**：Canvas 2D
- **录制**：MediaRecorder API
- **类型**：@uniedit/shared

---

## License

MIT
