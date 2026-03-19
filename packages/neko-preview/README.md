# Neko Preview

> 轻量媒体预览器，替代 VSCode 内置音视频播放器

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host (PreviewService → NativeEngine NAPI) + Webview (React)
- 依赖：neko-engine 提供硬件加速解码
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：视频/音频文件的轻量预览播放（替代 VSCode 内置播放器）
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/shared`、`@neko/neko-client`
- **激活依赖**：neko-engine（extensionDependency）

## Architecture

```
用户双击 .mp4 / .mp3 文件
  │
  ▼
CustomReadonlyEditorProvider
  ├── VideoPreviewProvider  (*.mp4, mov, mkv, webm, avi...)
  └── AudioPreviewProvider  (*.mp3, wav, flac, aac, ogg...)
        │
        ▼
PreviewService (封装 NativeEngine NAPI)
  ├── probeMedia()          → videos:probe
  ├── startVideoPlayback()  → timelines:stream (H.264 推流)
  ├── seekTo/pause/resume   → timelines:seek/pause/resume
  ├── decodeAudioSegment()  → audios:extract (PCM)
  └── getWaveform()         → audios:waveform
        │
        ▼
Webview (React + Vite)
  ├── VideoPlayer
  │   ├── H264StreamClient (WebSocket → WebCodecs → Canvas)
  │   └── VideoControls (播放/暂停/进度/速度/音量)
  └── AudioPlayer
      ├── Web Audio API (AudioContext → AudioBufferSourceNode)
      ├── WaveformCanvas (Canvas 波形可视化，CSS 变量主题适配)
      ├── CoverView (封面艺术 / 占位首字母 + 渐变)
      ├── LyricsView (歌词视图，Phase 3 接入滚动歌词)
      └── AudioControls (播放/暂停/跳转/进度/速度/音量/视图切换)
```

### 数据流

**视频预览**：`NativeEngine → H.264 NAL (WebSocket) → WebCodecs VideoDecoder → Canvas`

**音频预览**：`NativeEngine → PCM Float32 (postMessage) → Web Audio API → 扬声器`

### 横切关注点

- **i18n**：Webview 使用 `@neko/shared` 的 `I18nService` + `I18nProvider`。翻译文件位于 `webview/src/i18n/locales/`（en + zh-cn），命名空间 `preview`（含 video/audio 前缀）。
- **错误边界**：Webview 入口已包裹 `ErrorBoundary`。

### 音频播放器现代化（Phase 1 ✅）

Apple Music 风格的现代化 UI，三视图可切换（封面 / 歌词 / 波形），`--neko-audio-*` CSS 变量从 VSCode 主题派生但做媒体化调整，自动适配 Light/Dark/HC 主题。

- Phase 2（待做）：Engine 元数据扩展 → 真实封面 + ID3/Vorbis 标签
- Phase 3（待做）：.lrc 歌词解析 → 滚动歌词

## 构建

```bash
pnpm build:neko-preview               # Turborepo 过滤构建

# 手动构建
npm run compile:webview               # Vite 构建 webview
npm run compile:extension             # esbuild 构建 extension
npm run copy:webview                  # 复制产物到 dist/
```
