# Neko Engine

> 动力引擎：GPU 加速的媒体处理核心，支持硬件编解码与实时特效渲染

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：Sidecar 进程，性能隔离的计算引擎
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Engine** 是 Neko Suite 的核心计算引擎，采用 Rust + TypeScript 混合架构。通过 wgpu 实现跨平台 GPU 加速，FFmpeg 提供硬件编解码支持。作为独立 Sidecar 进程运行，彻底解决大文件读写与重度计算导致的编辑器卡顿问题。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **GPU 加速渲染** | wgpu 跨平台 GPU 计算（Metal/Vulkan/DX12） |
| **硬件编解码** | VideoToolbox (macOS) / VAAPI (Linux) / NVENC (Windows) |
| **零拷贝管线** | GPU 纹理直通，避免 CPU-GPU 数据传输 |
| **实时特效** | 滤镜、转场、混合模式、色彩校正 |
| **帧缓存服务** | 关键帧扫描与智能缓存 |
| **视频导出** | 异步导出管线，支持音视频混流 |

---

## 包结构

```
packages/
├── native-core/        # Rust 核心库 - GPU 处理、编解码、导出
├── native-napi/        # N-API 绑定 - Node.js 调用 Rust
├── native-cli/         # CLI 工具 - 命令行媒体处理
├── effects-core/       # 特效核心 - 类型定义、算法、WGSL 着色器
└── extension/          # VS Code 扩展集成
```

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                    │
├─────────────────────────────────────────────────────────────┤
│  @neko-engine/extension                                      │
│  ├── MediaEngineManager (生命周期管理)                        │
│  ├── NativeMediaEngine (N-API 调用)                          │
│  └── ExportService (导出服务)                                │
└───────────────────────────┬─────────────────────────────────┘
                            │ N-API
┌───────────────────────────▼─────────────────────────────────┐
│                    @neko-engine/native-napi                  │
│                    (Node.js ↔ Rust 桥接)                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                      neko-native-core                        │
├─────────────────────────────────────────────────────────────┤
│  gpu/           │ wgpu 上下文、纹理合成、NV12 渲染            │
│  decoder/       │ 硬件解码器、零拷贝管线                      │
│  encoder/       │ 硬件编码器、异步导出管线                    │
│  animation/     │ 关键帧、缓动、时间轴                        │
│  audio/         │ 音频编解码、混音                           │
│  frame_server/  │ HTTP 帧服务、媒体探测                       │
│  keyframe_cache/│ 关键帧缓存、IDR 扫描                        │
│  export/        │ GPU 导出管线、音视频混流                    │
│  jvi/           │ JVI 项目格式加载                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Effects Layer                  │
├─────────────────────────────────────────────────────────────┤
│  @neko-engine/effects-core                                   │
│  ├── types/     (动画、转场、滤镜、遮罩、混合模式)             │
│  ├── algorithms/(缓动函数、颜色空间、混合算法)                 │
│  └── shaders/   (WGSL 着色器：色彩校正、转场、特效)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 技术栈

### Rust (native-core)

| 依赖 | 用途 |
|------|------|
| `wgpu` | 跨平台 GPU 计算 (Metal/Vulkan/DX12) |
| `ffmpeg-next` | 视频/音频编解码 |
| `tokio` | 异步运行时 |
| `axum` | HTTP/WebSocket 服务 |
| `metal` / `ash` / `windows` | 平台原生 GPU 互操作 |

### TypeScript (effects-*)

| 依赖 | 用途 |
|------|------|
| `@webgpu/types` | WebGPU 类型定义 |
| `@neko/shared` | 共享类型 |

---

## 硬件加速支持

| 平台 | 解码 | 编码 | GPU |
|------|------|------|-----|
| macOS | VideoToolbox | VideoToolbox | Metal |
| Linux | VAAPI | VAAPI | Vulkan |
| Windows | D3D11VA | NVENC / QSV | DX12 |

---

## 构建

```bash
# 构建 Rust 原生库
cargo build --release

# 构建 N-API 绑定
cd packages/native-napi && pnpm build

# 构建 TypeScript 包
pnpm build
```

---

## 导出的 API

### native-core (Rust)

```rust
// GPU 处理
pub use gpu::{GpuContext, GpuProcessor, TextureCompositor, Nv12Renderer};

// 编解码
pub use decoder::{ZeroCopyDecoder, HwAccelType};
pub use encoder::{AsyncExportPipeline, HwAccelEncoder};

// 动画
pub use animation::{AnimationTimeline, Keyframe, Easing};

// 服务
pub use frame_server::FrameServer;
pub use keyframe_cache::KeyframeCacheService;
```

---

## License

MIT
