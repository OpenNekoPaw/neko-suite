# 系统架构总览

> 本文档是 Neko Suite 的架构入口。详细的架构决策（ADR）见 [docs/architecture/](./docs/architecture/) 和 [docs/](./docs/)。

---

## 系统定位

Neko Suite 是深度集成于 VS Code 的创意工作套件，核心挑战是在 VS Code 的安全沙箱约束下，提供媒体处理、GPU 渲染等重计算能力，同时维持编辑器的响应性。

**解决方案**：Rust Sidecar 进程 + 双进程通信模型。

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code 进程                              │
│                                                                 │
│  ┌──────────────────────────────────────────────┐              │
│  │              Extension Host (Node.js)         │              │
│  │                                              │              │
│  │  neko-engine ext  neko-cut ext  neko-agent ext  ...         │
│  │       │                │               │                    │
│  └───────┼────────────────┼───────────────┼────────────────────┘
│          │ N-API          │ postMessage   │ postMessage         │
│          │         ┌──────┼───────────────┼──────┐             │
│          │         │      Webview (Browser)       │             │
│          │         │  neko-cut UI  neko-agent UI  │             │
│          │         └──────────────────────────────┘             │
└──────────┼──────────────────────────────────────────────────────┘
           │ HTTP/WebSocket (axum)
┌──────────▼──────────────────────────────────────────────────────┐
│                   neko-engine (Rust Sidecar)                    │
│                                                                 │
│  native-core: wgpu GPU · FFmpeg 编解码 · 动画 · 导出 · 缓存      │
│  native-http: axum HTTP/WebSocket 服务                          │
│  native-napi: Node.js N-API 绑定                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 通信模式

### 1. Extension Host ↔ Webview：postMessage IPC

```
Webview (React)          Extension Host (Node.js)
     │                          │
     │─── postMessage ──────────▶│  处理请求（文件 IO、VSCode API）
     │◀── postMessage ───────────│  返回结果
```

Webview 运行在浏览器沙箱中，**无法直接访问文件系统或 VS Code API**，必须通过消息协议代理。消息类型定义在 `@neko/shared` 的 `types/message.ts`。

### 2. Extension Host ↔ Rust Engine：N-API + HTTP

```
Extension Host
     │
     ├─ N-API (同步/异步)  →  native-napi  →  native-core
     │  适用：低延迟单次调用（probe、extract frame）
     │
     └─ HTTP/WebSocket    →  native-http   →  native-core
        适用：长连接流式数据（H.264 推流、PCM 解码）
```

HTTP 客户端封装在 `@neko/neko-client` 的 `EngineClient`，Extension Host 和 Webview 两端均可使用。

### 3. Webview ↔ Rust Engine：WebSocket 直连（流媒体）

```
Webview (H264StreamClient / AudioStreamClient)
     │ WebSocket
     ▼
neko-engine axum WebSocket 端点
     │
     ▼
native-core decoder → GPU 解码帧 → H.264 NAL / PCM Float32
```

流媒体走 WebSocket 绕过 Extension Host，避免帧数据在 Node.js 层多次拷贝。

---

## 包依赖图

```
@neko/proto (IDL 唯一来源)
     ↓ 生成
@neko/shared (neko-types)    ←── 所有包依赖（零内部依赖）
@neko/neko-client            ←── 流媒体客户端（零内部依赖）
     ↑
neko-engine/native-napi      ←── N-API 绑定（独立编译）
     ↑
neko-engine/extension        ←── Sidecar 管理
     ↑
neko-preview  →  neko-engine
neko-cut      →  neko-engine + neko-tools + neko-preview
neko-agent    →  neko-engine + neko-tools + neko-preview
neko-canvas   →  neko-engine + neko-tools + neko-preview
neko-sketch   →  neko-canvas
neko-story    →  @neko-story/parser + @neko/shared
neko-assets   →  @neko/asset + @neko/shared
neko-tools    →  @neko/shared
```

---

## 核心数据流

### 视频播放流

```
用户点击播放
  │
  ▼
Extension Host
  └── PreviewService / NativeMediaEngine
        └── NAPI: timelines:stream → native-core
              └── 硬件解码 → H.264 NAL 流 (WebSocket)
                    │
                    ▼
              Webview H264StreamClient
                    └── WebCodecs VideoDecoder
                          └── Canvas 渲染帧
```

### 视频导出流

```
用户触发导出
  │
  ▼
Extension Host
  └── ExportService
        └── NAPI: export:start → native-core
              ├── GPU 渲染管线 (wgpu compositor)
              ├── 硬件编码 (VideoToolbox/NVENC/VAAPI)
              └── 音视频混流 → .mp4 文件
```

### AI Agent 工作流

```
用户自然语言输入
  │
  ▼
Webview 对话 UI
  │ postMessage
  ▼
Extension Host (@neko/platform LLM 路由)
  └── Claude / OpenAI API (流式)
        └── 工具调用 → Neko-Script 指令
              └── TimelineToolExecutor → neko-cut 时间线变更
```

---

## 关键架构决策（ADR）

| 领域 | 文档 | 核心决策 |
|------|------|---------|
| 媒体流传输 | [adr-video-diff-streaming.md](./docs/adr-video-diff-streaming.md) | H.264 + PCM 流式传输，非逐帧提取 |
| 引擎通信统一 | [adr-unified-engine.md](./docs/adr-unified-engine.md) | EngineClient HTTP dispatch 统一所有 Engine 调用 |
| Diff 并行化 | [adr-media-diff-parallelism.md](./docs/adr-media-diff-parallelism.md) | SSIM‖PSNR 并行 + 早期波形 + 消息队列去阻塞 |
| 横切关注点 | [architecture/adr-cross-cutting-concerns.md](./docs/architecture/adr-cross-cutting-concerns.md) | Logger/i18n/Theme/Error 统一在 @neko/shared，三层隔离 |
| 跨语言架构 | [architecture/cross-language-architecture.md](./docs/architecture/cross-language-architecture.md) | Rust 引擎为数据模型权威，TS 仅负责 UI |
| 共享包设计 | [architecture/shared-packages-design.md](./docs/architecture/shared-packages-design.md) | @neko/shared 通过子路径分层导出 |
| 资产管理 | [architecture/asset-management-design.md](./docs/architecture/asset-management-design.md) | 统一 AssetManifest + Handler 注册表模式 |
| 3D 能力 | [architecture/3d-capability-analysis.md](./docs/architecture/3d-capability-analysis.md) | hecs ECS + native-scene，不用 Bevy |

---

## 设计原则

**SOLID 驱动**：每个模块单一职责，面向接口编程，通过依赖注入解耦。

**权威来源单一**：
- 类型契约：`@neko/proto`（.proto IDL）
- 共享基础设施：`@neko/shared`（Logger/i18n/Theme/Errors）
- 计算逻辑：`neko-engine`（Rust，TS 层不重复计算逻辑）

**双进程隔离**：每个扩展分 `extension/`（Node.js Host）和 `webview/`（Browser）两层，通过 postMessage 通信。

**渐进式架构**：Extension Pack 模式，各扩展可独立安装，按需激活。

---

## 技术栈一览

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| Frontend | React 18 + Zustand + Tailwind + Vite | 生态成熟，Slice 模式便于测试 |
| Extension | VS Code Extension API + TypeScript + esbuild | 平台要求 |
| Media Engine | Rust + wgpu + FFmpeg + axum + tokio | 零 GC、跨平台 GPU、成熟编解码 |
| AI | Vercel AI SDK + Claude/OpenAI + MCP | 多模型抽象，流式响应 |
| Protocol | Protobuf IDL（手动维护） | 跨语言类型契约 |
| Streaming | H.264 + PCM over WebSocket | 低延迟，浏览器原生支持（WebCodecs） |
| Build | pnpm 10 + Turborepo 2 | Monorepo 并行构建 |
| Testing | Vitest + cargo test | 覆盖 TS 和 Rust 两端 |

---

## 扩展激活依赖链

```
neko-engine ◀── neko-preview ◀── neko-cut
                              ◀── neko-agent
                              ◀── neko-canvas ◀── neko-sketch
neko-tools  ◀── neko-cut
            ◀── neko-agent
```

`neko-engine` 是所有媒体处理扩展的基础，必须最先激活。
