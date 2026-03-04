# Neko Engine

> 动力引擎：GPU 加速媒体处理、硬件编解码、实时特效渲染

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Rust Sidecar 进程（native-core）+ N-API 桥接 + TypeScript Extension
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：GPU 渲染、硬件编解码、帧缓存、导出——所有重计算的权威来源
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`native-core`（Rust）、`native-napi`（N-API 绑定）、`native-http`（axum）、`extension`（VSCode）
- **依赖**：`@neko-engine/native-napi`、`@neko/shared`
- **被依赖**：几乎所有其他扩展（extensionDependency）

## Architecture

```
TypeScript Extension Host
  └── @neko-engine/extension
        ├── MediaEngineManager  → 生命周期管理（启动/停止 sidecar）
        ├── NativeMediaEngine   → N-API 调用封装
        └── ExportService       → 导出任务管理
              │ N-API
              ▼
@neko-engine/native-napi  (Node.js ↔ Rust 桥接)
              │
              ▼
native-core (Rust)
  ├── gpu/           → wgpu 上下文、纹理合成、NV12 渲染、自定义 Shader
  ├── shaders/       → WGSL 着色器（色彩校正、转场、特效、混合模式）
  ├── decoder/       → 硬件解码器、零拷贝管线
  ├── encoder/       → 硬件编码器、异步导出管线
  ├── animation/     → 关键帧、缓动、时间轴插值
  ├── audio/         → 音频编解码、混音、响度分析（ITU-R BS.1770-4）
  ├── frame_server/  → HTTP 帧服务、媒体探测
  ├── export/        → GPU 导出管线、音视频混流
  └── jvi/           → JVI 项目格式解析
```

### 包结构

```
packages/
├── native-napi/   # N-API 绑定（napi-rs 编译为 .node）
├── native-http/   # HTTP/WebSocket 服务（axum）
├── extension/     # VSCode 扩展集成
└── types/         # 共享 Rust 类型
```

## Deep Dive

### 硬件加速矩阵

| 平台 | 解码 | 编码 | GPU |
|------|------|------|-----|
| macOS | VideoToolbox | VideoToolbox | Metal |
| Linux | VAAPI | VAAPI | Vulkan |
| Windows | D3D11VA | NVENC / QSV | DX12 |

### 核心 Rust 依赖

| Crate | 用途 |
|-------|------|
| `wgpu` | 跨平台 GPU 计算 |
| `ffmpeg-next` | 编解码 |
| `tokio` | 异步运行时 |
| `axum` | HTTP/WebSocket |
| `napi-rs` | Node.js 绑定 |
| `ebur128` | ITU-R BS.1770-4 响度测量 |

### 构建

```bash
cargo build --release                    # 编译 Rust native-core
cd packages/native-napi && pnpm build    # 编译 N-API 绑定
pnpm build                               # 编译 TypeScript extension
```
