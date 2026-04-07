# Neko Engine

> 动力引擎：GPU 加速媒体处理、硬件编解码、实时特效渲染

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Rust 全局单例引擎 + N-API 控制命令 + WebSocket/HTTP 数据传输 + TypeScript Extension
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：GPU 渲染、硬件编解码、帧缓存、导出、3D/2D 场景 ECS——所有重计算的权威来源
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`native-core`（Rust）、`native-scene`（3D ECS）、`native-puppet`（2D 骨骼 ECS）、`native-napi`（N-API 绑定）、`native-http`（axum）、`extension`（VSCode）
- **依赖**：`@neko-engine/native-napi`、`@neko/shared`
- **被依赖**：几乎所有其他扩展（extensionDependency）

## Architecture

```
TypeScript Extension Host
  └── @neko-engine/extension
        ├── MediaEngineManager  → Extension 会话生命周期管理（连接/断开引擎包装层）
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
  ├── preview/       → 预览流生成管线（供 HTTP/WebSocket 数据面传输）
  ├── export/        → GPU 导出管线、音视频混流
  └── jvi/           → JVI 项目格式解析

native-puppet (Rust)  ← 2D 骨骼动画 ECS
  ├── loader.rs      → INP 解析 → ECS World + AnimationClip 注册
  ├── components.rs  → PuppetNode, Transform2D, ParameterBinding, AnimationTarget
  ├── systems.rs     → parameter_update, physics_tick, animation_tick
  ├── animation.rs   → bevy_animation AnimationClip → ParameterCurve → inox2d 参数值
  └── world.rs       → PuppetWorld trait + BevyPuppetWorld
```

### 包结构

```
packages/
├── native-core/    # Rust 核心（GPU/FFmpeg/服务层）
├── native-api/     # Controller + ActionRouter
├── native-scene/   # 3D 场景 ECS（bevy_ecs + glTF/VRM loader）
├── native-puppet/  # 2D 骨骼 ECS（bevy_ecs + inox2d + bevy_animation）
├── native-http/    # HTTP/WebSocket 服务（axum）
├── native-napi/    # N-API 绑定（napi-rs 编译为 .node）
├── native-cli/     # 独立 CLI 二进制
├── types/          # 共享 Rust 类型
└── extension/      # VSCode 扩展集成
```

### 当前生命周期语义

- `native-napi` 通过全局 `OnceCell<Arc<EngineApi>>` 持有 Rust 引擎单例。
- 控制面走 N-API：命令分发、状态查询、任务控制等控制命令由 Extension Host 直接调用 Rust 单例。
- 数据面走 HTTP/WebSocket：流媒体和 frame server 通过嵌入式 HTTP/WebSocket 服务向外提供数据传输能力。
- `neko.engine.start` / `neko.engine.stop` 当前语义应理解为“连接 / 断开 Extension 会话中的引擎包装层”。
- `stop` 会释放 TypeScript 包装层和嵌入式 frame server，不会真正销毁底层 Rust 单例。
- 若后续需要真实 `shutdown/reset`，应先在 Rust 侧补明确能力，再恢复“启动/停止引擎”的产品语义。

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
| `axum` | `native-http` 的 HTTP/WebSocket 服务 |
| `napi-rs` | Node.js 绑定 |
| `ebur128` | ITU-R BS.1770-4 响度测量 |
| `bevy_ecs` | 3D/2D 场景 Entity-Component-System |
| `bevy_animation` | 动画曲线系统（AnimationClip → ParameterCurve） |
| `inox2d` | Inochi2D 格式解析 + 2D 参数化变形计算 |
| `gltf` | glTF/GLB 3D 模型解析 |
| `glam` | 3D 数学库（Vec3/Quat/Mat4） |

### 构建

```bash
cargo build --release                    # 编译 Rust native-core
cd packages/native-napi && pnpm build    # 编译 N-API 绑定
pnpm build                               # 编译 TypeScript extension
```

### 平台打包

```bash
pnpm package:platform -- --target darwin-arm64
pnpm package:platform -- --target linux-x64 --skip-native-build
```

- `package:platform` 会统一执行目标平台 `.node` 校验、ORT 下载、FFmpeg 打包、平台裁剪、extension compile 与 VSIX 产物校验。
- 当前主机平台若缺少对应 `.node`，脚本会自动调用 `packages/native-napi` 的 `build:napi`。
- 非当前主机平台仍需要预先准备对应 `.node`，再配合 `--skip-native-build` 进入打包流水线。
