# 渐进式媒体处理架构

> 统一的媒体引擎接口，支持基础模式（Webview）和兼容模式（Extension Host）的渐进式切换。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        上层应用代码                                  │
│              (Timeline, Export, Preview 等)                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    IMediaEngine (统一接口)                           │
│  - createVideoDecoder() / createAudioDecoder()                      │
│  - createEncoder()                                                  │
│  - getEffectProcessor()                                             │
│  - canDecode() / canEncode()                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   WebMediaEngine        │     │   NativeMediaEngine     │
│   (基础模式)             │     │   (兼容模式)             │
│                         │     │                         │
│ • WebCodecs 视频解码     │     │ • FFmpeg 全格式解码      │
│ • FFmpeg.wasm 音频解码   │     │ • 硬件加速支持           │
│ • WebGPU 特效处理        │     │ • wgpu GPU 特效          │
│ • WebCodecs 视频编码     │     │ • FFmpeg 专业编码        │
│                         │     │                         │
│ 运行环境: Webview        │     │ 运行环境: Extension Host │
│ 格式: H.264/VP8/VP9      │     │ 格式: 全格式支持         │
│ 包大小: ~10MB            │     │ 包大小: ~20MB (按需下载) │
└─────────────────────────┘     └─────────────────────────┘
```

## 模块结构

```
packages/
├── shared/src/types/mediaEngine/     # 统一类型定义
│   ├── index.ts                      # 导出
│   ├── engine.ts                     # IMediaEngine 接口
│   ├── decoder.ts                    # IDecoder 接口
│   ├── encoder.ts                    # IEncoder 接口
│   ├── effects.ts                    # IEffectProcessor 接口
│   ├── capabilities.ts               # 能力检测类型
│   └── mode.ts                       # 运行模式类型
│
├── webview/src/mediaEngine/          # 基础模式实现
│   ├── index.ts                      # 导出
│   ├── WebMediaEngine.ts             # 基础模式引擎
│   ├── decoders/
│   │   ├── WebCodecsVideoDecoder.ts  # WebCodecs 视频解码
│   │   └── FFmpegWasmAudioDecoder.ts # FFmpeg.wasm 音频解码
│   ├── encoders/
│   │   └── WebCodecsEncoder.ts       # WebCodecs 编码
│   └── effects/
│       └── WebGPUEffectProcessor.ts  # WebGPU 特效
│
└── extension/src/mediaEngine/        # 兼容模式 + 模式管理
    ├── index.ts                      # 导出
    ├── NativeMediaEngine.ts          # 兼容模式引擎
    ├── MediaEngineManager.ts         # 模式管理器 (核心)
    ├── DownloadManager.ts            # 按需下载管理
    └── serviceIds.ts                 # 服务标识符
```

## 核心接口

### IMediaEngine

```typescript
interface IMediaEngine {
  readonly name: string;
  readonly mode: MediaEngineMode;
  readonly state: MediaEngineState;
  readonly capabilities: MediaEngineCapabilities;

  // 生命周期
  initialize(options?: MediaEngineInitOptions): Promise<void>;
  dispose(): Promise<void>;

  // 解码器工厂
  createVideoDecoder(config: VideoDecoderConfig): Promise<IDecoder>;
  createAudioDecoder(config: AudioDecoderConfig): Promise<IDecoder>;
  canDecode(codec: string, container?: string): boolean;

  // 编码器工厂
  createEncoder(config: EncoderConfig): Promise<IEncoder>;
  canEncode(codec: string, container?: string): boolean;

  // 特效处理
  getEffectProcessor(): Promise<IEffectProcessor>;

  // 事件
  onStateChange: Event<MediaEngineState>;
  onError: Event<MediaEngineError>;
}
```

### IDecoder

```typescript
interface IDecoder {
  readonly type: 'video' | 'audio';
  readonly mediaInfo: MediaInfo | null;
  readonly isOpen: boolean;
  readonly position: number;

  open(): Promise<MediaInfo>;
  seek(time: number): Promise<void>;
  decodeNext(): Promise<DecodedFrame | null>;
  decodeAt(time: number): Promise<DecodedFrame | null>;
  decodeRange(startTime: number, duration: number, fps?: number): AsyncGenerator<DecodedFrame>;
  close(): Promise<void>;
}
```

## 模式选择流程

```
用户打开视频文件
        │
        ▼
┌───────────────────┐
│ 探测媒体信息       │
│ (probeMediaInfo)  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌─────────────────────┐
│ 是否为基础格式？   │─NO─→│ 兼容模式已安装？     │
│ H.264/VP8/VP9     │     └──────────┬──────────┘
│ AAC/MP3/Opus      │                │
└─────────┬─────────┘          YES   │   NO
          │                    │     │
         YES                   │     ▼
          │                    │  ┌─────────────────┐
          ▼                    │  │ 提示下载增强包   │
┌───────────────────┐          │  │ (~20MB)         │
│ 使用基础模式       │          │  └────────┬────────┘
│ WebMediaEngine    │          │           │
└───────────────────┘          │      用户同意
                               │           │
                               ▼           ▼
                        ┌───────────────────┐
                        │ 使用兼容模式       │
                        │ NativeMediaEngine │
                        └───────────────────┘
```

## 格式支持

### 基础模式 (WebMediaEngine)

| 类型 | 支持格式 |
|------|----------|
| 视频解码 | H.264, VP8, VP9 |
| 视频编码 | H.264, VP8 |
| 音频解码 | AAC, MP3, Opus, Vorbis, FLAC, PCM |
| 音频编码 | AAC, Opus, PCM |
| 容器格式 | MP4, WebM, OGG, MOV |
| GPU 特效 | WebGPU (色彩校正、模糊等) |

### 兼容模式 (NativeMediaEngine)

| 类型 | 支持格式 |
|------|----------|
| 视频解码 | H.264, H.265/HEVC, VP8, VP9, AV1, ProRes, DNxHD |
| 视频编码 | H.264, H.265, VP8, VP9, ProRes, DNxHD |
| 音频解码 | AAC, MP3, Opus, Vorbis, FLAC, PCM, AC3, DTS |
| 音频编码 | AAC, MP3, Opus, FLAC, PCM, AC3 |
| 容器格式 | MP4, WebM, OGG, MOV, MKV, AVI, MXF |
| 硬件加速 | VideoToolbox (macOS), NVENC (NVIDIA), VAAPI (Linux), QSV (Intel) |
| GPU 特效 | wgpu (Metal/Vulkan/DX12) |

## 使用示例

### Webview 端 (基础模式)

```typescript
import { createWebMediaEngine, isBasicModeAvailable } from './mediaEngine';

if (isBasicModeAvailable()) {
  const engine = await createWebMediaEngine();

  // 创建解码器
  const decoder = await engine.createVideoDecoder({ source: 'video.mp4' });
  await decoder.open();
  const frame = await decoder.decodeAt(1.0);

  // 应用特效
  const effectProcessor = await engine.getEffectProcessor();
  const processed = await effectProcessor.processFrame(
    frame.data,
    frame.width,
    frame.height,
    [{ type: 'colorCorrection', brightness: 0.1 }]
  );

  // 清理
  await decoder.close();
  await engine.dispose();
}
```

### Extension 端 (模式管理)

```typescript
import { createMediaEngineManager } from './mediaEngine';

// 创建管理器
const manager = createMediaEngineManager(context.globalStorageUri);

// 分析媒体
const { mediaInfo, recommendation } = await manager.probeMediaWithRecommendation(filePath);

if (recommendation.recommendedMode === 'basic') {
  // 通知 Webview 使用基础模式
  webview.postMessage({ type: 'useBasicMode', mediaInfo });
} else {
  // 使用兼容模式
  const engine = await manager.getCompatibleEngine();
  const decoder = await engine.createVideoDecoder({ source: filePath });
  // ...
}
```

## IPC 协议

### 请求类型

| 类型 | 描述 |
|------|------|
| `mediaEngine:getMode` | 获取当前模式 |
| `mediaEngine:setMode` | 设置模式 |
| `mediaEngine:getDownloadStatus` | 获取下载状态 |
| `mediaEngine:startDownload` | 开始下载兼容模式 |
| `mediaEngine:analyzeMedia` | 分析媒体并推荐模式 |

### 通知类型

| 类型 | 描述 |
|------|------|
| `mediaEngine:downloadProgress` | 下载进度更新 |
| `mediaEngine:downloadComplete` | 下载完成通知 |

## 服务注册

```typescript
// packages/extension/src/bootstrap/serviceBootstrap.ts

import {
  createMediaEngineManager,
  IMediaEngineManager,
  IDownloadManager,
} from '../mediaEngine';

export async function bootstrapMediaEngine(
  services: ServiceCollection,
  context: vscode.ExtensionContext
): Promise<void> {
  const manager = createMediaEngineManager(context.globalStorageUri);
  services.set(IMediaEngineManager, manager);
  services.set(IDownloadManager, manager.downloadManager);
}
```

## 设计原则

1. **统一接口**: 上层代码通过 `IMediaEngine` 接口操作，无需关心具体实现
2. **渐进式加载**: 基础模式随插件安装，兼容模式按需下载
3. **自动选择**: 根据媒体格式自动选择最佳模式
4. **优雅降级**: 兼容模式不可用时降级到基础模式
5. **SOLID 原则**: 单一职责、依赖倒置、接口隔离
