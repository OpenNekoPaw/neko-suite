# Neko Audio

> 音频工站：波形编辑、频谱分析、麦克风录制与 AI 降噪（规划中）

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview（规划中，尚未实现）
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：专业音频编辑——波形可视化、频谱分析、录制、AI 降噪
- **入口**：`src/extension.ts`（单包结构）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-engine、neko-tools
- **状态**：🚧 规划中

## Architecture

```
音频文件 / 麦克风录制
  │
  ▼
Extension Host
  └── neko-engine NAPI → 音频解码/编码（FFmpeg）
        │
        ▼
Webview (规划中)
  ├── 波形可视化（Canvas 2D）
  ├── 频谱分析（Web Audio API AnalyserNode）
  ├── 编辑操作（裁剪、淡入淡出、音量）
  └── AI 降噪（调用降噪模型）
```

### 支持格式

MP3、WAV、OGG、FLAC、AAC、M4A

### 技术栈

- 音频处理：Web Audio API + neko-engine（FFmpeg）
- 可视化：Canvas 2D
- 录制：MediaRecorder API
