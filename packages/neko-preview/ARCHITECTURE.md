# neko-preview 架构

> 轻量媒体预览器，提供视频/音频的硬件加速播放、波形可视化和 A/V 同步。

---

## 系统定位

neko-preview 是 Neko Suite 的媒体预览扩展。以 CustomReadonlyEditorProvider 方式接管视频/音频文件的打开，提供硬件加速的 H.264 + PCM 流式播放。设计为轻量级——不做编辑，只做预览。

---

## 子包结构

```
packages/neko-preview/
├── packages/
│   ├── extension/    # Extension Host（Node.js）— 流编排 + 引擎通信
│   └── webview/      # Webview（React 18）— 播放器 UI
├── l10n/             # 国际化翻译
└── package.json      # VSCode 扩展清单
```

---

## 整体架构

```
┌────────────────────────────────────────────────────────┐
│                 VSCode Extension Host                   │
│                                                        │
│  extension.ts                                          │
│    ├─ PreviewService (单例)                             │
│    │    └─ EngineClient (HTTP dispatch)                │
│    │         ├─ probe()      — 媒体探测               │
│    │         ├─ startStream() — 启动 H.264/PCM 流      │
│    │         ├─ seekTo()     — 跳转                   │
│    │         └─ stopStream() — 停止流                  │
│    │                                                  │
│    ├─ VideoPreviewProvider (CustomReadonlyEditorProvider)│
│    │    └─ 处理 .mp4/.mov/.avi/.mkv/.webm 等          │
│    │                                                  │
│    ├─ AudioPreviewProvider (CustomReadonlyEditorProvider)│
│    │    └─ 处理 .mp3/.wav/.ogg/.flac/.aac 等          │
│    │                                                  │
│    └─ StatusBarManager                                │
│         └─ 文件信息 / 编码格式 / 播放状态 / 当前时间    │
│                                                        │
│         │ postMessage                                  │
│         ▼                                              │
│  ┌──────────────────────────────────────────────┐      │
│  │            Webview (React 18 + Vite)          │      │
│  │                                              │      │
│  │  Video Player                                │      │
│  │    ├─ VideoPlayer.tsx                        │      │
│  │    │    ├─ H264StreamClient → WebCodecs      │      │
│  │    │    ├─ AudioStreamClient → Web Audio API  │      │
│  │    │    └─ FrameScheduler (A/V 同步)         │      │
│  │    └─ VideoControls.tsx                      │      │
│  │         └─ 播放/暂停/跳转/变速/音量/PiP       │      │
│  │                                              │      │
│  │  Audio Player                                │      │
│  │    ├─ AudioPlayer.tsx                        │      │
│  │    │    └─ AudioStreamClient → Web Audio API  │      │
│  │    ├─ AudioControls.tsx                      │      │
│  │    └─ WaveformCanvas.tsx                     │      │
│  │         └─ Canvas 波形可视化 + 点击跳转       │      │
│  │                                              │      │
│  │  Shared                                      │      │
│  │    ├─ useVscodeMessage.ts (postMessage hook)  │      │
│  │    ├─ ProgressBar.tsx                        │      │
│  │    └─ ErrorBoundary.tsx                      │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────┘
          │ WebSocket 直连
          ▼
    neko-engine (Rust Sidecar)
      └─ H.264 NAL + PCM Float32 流
```

---

## 核心数据流

### 视频播放

```
用户双击 .mp4
  → VideoPreviewProvider.resolveCustomEditor()
    → PreviewService.probe(path) → EngineClient HTTP → ProbeResult
      → postMessage('mediaInfo', {resolution, fps, codec, duration})
        → Webview 渲染 VideoPlayer

用户点击播放
  → postMessage('play') → PreviewService.startVideoStream() + startAudioStream()
    → EngineClient HTTP dispatch → 返回 streamUrl
      → postMessage('streamUrl', url) → Webview
        → H264StreamClient(WebSocket) → WebCodecs VideoDecoder → Canvas
        → AudioStreamClient(WebSocket) → Web Audio API
        → FrameScheduler 以音频时钟为主，视频跟随同步
```

### 音频播放

```
用户双击 .mp3
  → AudioPreviewProvider.resolveCustomEditor()
    → PreviewService.probe(path) + generateWaveform()
      → postMessage('mediaInfo' + 'waveformData')
        → WaveformCanvas 渲染交互式波形

用户点击播放
  → postMessage('play') → PreviewService.startAudioStream()
    → AudioStreamClient(WebSocket) → Web Audio API
    → 波形进度指示器实时更新
```

---

## 通信协议

### Webview → Extension

```
play, pause, resume, stop    — 播放控制
seek(time)                   — 跳转到指定时间
setSpeed(rate)               — 变速
setVolume(level)             — 音量
requestMediaInfo             — 请求媒体信息
```

### Extension → Webview

```
mediaInfo(probe result)      — 媒体元信息
streamUrl(url)               — WebSocket 流地址
audioStreamUrl(url)          — 音频流地址
waveformData(peaks)          — 波形数据
error(message)               — 错误通知
```

---

## 关键设计决策

| 决策 | 理由 |
|------|------|
| **共享 PreviewService 单例** | 多个预览面板共享一个引擎连接，避免重复创建 |
| **流媒体绕过 Extension Host** | WebSocket 从 Webview 直连 neko-engine，避免帧数据在 Node.js 层拷贝 |
| **音频时钟为主** | FrameScheduler 以音频 PTS 为基准同步视频帧，人耳对音频延迟更敏感 |
| **CustomReadonlyEditor** | 预览器不修改文件，使用 Readonly 变体更安全 |
| **Dev/Prod 双模式 HTML** | 开发模式 Vite HMR，生产模式直接加载 dist |

---

## 关键设计模式

| 模式 | 应用 |
|------|------|
| **Singleton** | PreviewService — 共享引擎连接 |
| **Adapter** | PreviewService 包装 EngineClient，适配预览专用接口 |
| **CustomReadonlyEditorProvider** | 视频/音频文件的 VSCode 编辑器集成 |
| **Disposable** | 所有资源（流/面板/状态栏）严格 dispose 清理 |
| **Message-Driven** | postMessage 驱动所有跨进程通信 |

---

## 支持格式

| 类型 | 格式 |
|------|------|
| 视频 | mp4, mov, avi, mkv, webm, m4v, ts, flv, wmv |
| 音频 | mp3, wav, ogg, flac, aac, m4a, wma, opus |

---

## 公开 API

neko-preview 通过 `NekoPreviewAPI` 接口向其他扩展暴露能力：

```typescript
interface NekoPreviewAPI {
  probeMedia(path: string): Promise<ProbeResult>
  startPlayback(path: string, options?: PlaybackOptions): Promise<StreamHandle>
  // ...
}
```

其他扩展（如 neko-canvas）通过 `vscode.extensions.getExtension('neko.neko-preview')` 延迟获取此 API。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| Extension Host | VSCode Extension API + TypeScript + esbuild |
| Webview | React 18 + Vite |
| 视频解码 | WebCodecs API（浏览器内置） |
| 音频播放 | Web Audio API（AudioContext） |
| 流传输 | WebSocket（H.264 NAL + PCM Float32） |
| A/V 同步 | 自研 FrameScheduler（自适应同步阈值） |
| 波形渲染 | Canvas 2D + DPR 缩放 |
| 测试 | Vitest |
