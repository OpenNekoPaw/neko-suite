# Neko Suite

> 全能内容创作 IDE - 深度集成于 VS Code 的视频编辑工作站

[English](./README_EN.md) | [猫娘版](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** 是一款深度集成于 VS Code 的「全能内容创作工作站」。它通过 **Rust Sidecar 独立进程架构** 突破了编辑器性能限制，实现了从剧本创作到 4K 视频合成的完整闭环。

📋 **[查看开发路线图 →](./ROADMAP.md)**

---

## 特性亮点

- **AI 驱动创作** - 通过 Agent Skills + MCP 协议将自然语言转化为剪辑操作，Pipeline 工作流支持分镜→批量视频→时间线
- **专业级时间线** - 多轨道、关键帧动画、色彩校正、特效蒙版、精确到帧的编辑、29 种 EditOperation
- **Rust GPU 渲染** - wgpu PBR + IBL + 后处理 + 粒子系统，25+ WGSL shader，4K 实时预览与导出
- **3D/2D 创作** - glTF/VRM 3D 编辑 + 压感手绘 7 笔刷 + 骨骼动画 + 滤镜/粒子/场景系统
- **音频工作站** - 波形编辑 + 12 种效果链 + 频谱分析 + AI 降噪 + 麦克风录音
- **资产市场** - Skills/着色器/模型/预设的搜索、安装、版本管理，支持本地模型部署
- **Git 原生支持** - .nkv 项目文件为文本格式，支持版本控制和协作
- **模块化架构** - 18 个包按需组合，独立升级

---

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建 + 打包

```bash
./build.sh            # 构建 neko-cut（默认）
./build.sh --all      # 构建全部扩展
```

### 安装到 VS Code

**不确定装哪个？** 根据你的创作方向选择：

| 你想做什么                       | 安装命令                    | 获得的能力                       |
| -------------------------------- | --------------------------- | -------------------------------- |
| **AIGC 视频制作** — 从剧本到成片 | `./install.sh --pack video` | 剧本编辑 + 分镜画布 + 时间线剪辑 |
| **2D 插画/动画** — 手绘 + 骨骼   | `./install.sh --pack 2d`    | 压感绘画 + Puppet 骨骼动画       |
| **音频编辑** — 录制 + 混音       | `./install.sh --pack audio` | 波形编辑 + 效果链 + 频谱分析     |
| **全部功能**                     | `./install.sh --all`        | 上述全部 release-ready 扩展      |

子包可叠加：`./install.sh --pack video --pack 2d`（场景子包零重复）。

> 所有子包自动包含 core（engine + tools + preview + assets + auth + **agent + market**）。AI 能力、资产管理、技能市场是所有场景的共享基础设施。不带参数运行 `./install.sh` 将显示交互式选择菜单。详见 [Extension Pack 分层策略](./docs/architecture/extension-pack-strategy.md)。

### 开发模式

```bash
pnpm run dev
```

---

## 模块架构

Neko Suite 采用 **Monorepo（pnpm workspace + turbo）** 模式，包含 18 个包：

### 核心三角（开发重心）

| 模块            | 职能                                                                                                                                            | 状态      | 规模                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- |
| **neko-engine** | Rust GPU 媒体引擎 - wgpu PBR 渲染 + 编解码 + 导出 + 粒子/后处理 + 3D 场景/2D 骨骼 ECS + ONNX ML 推理                                            | Alpha 90% | 76.6K Rust + TS, 236 files         |
| **neko-cut**    | 视频剪辑器 - 时间线 + 预览 + 色彩校正 + 特效 + 29 EditOperation                                                                                 | Alpha 82% | 63.4K TS/TSX (293 files), 21 tests |
| **neko-agent**  | AI Agent - 多 LLM + MCP + Skills + CLI + Pipeline 工作流 + AI 字幕 + 自动配乐 + 媒体质量评估 + Coordinator 多阶段编排 + Canvas/Story 跨扩展协同 | Alpha 99% | 99.6K TS/TSX (540 files), 79 tests |

### 基础设施

| 模块            | 职能                                                                           | 状态        | 规模                           |
| --------------- | ------------------------------------------------------------------------------ | ----------- | ------------------------------ |
| **neko-types**  | 共享类型 + 横切关注点（Logger/i18n/Theme/Errors）+ Operations 类型安全         | Alpha 92%   | 34.5K TS (187 files), 20 tests |
| **neko-client** | 流媒体客户端 - H264/fMP4/PCM + EngineClient HTTP dispatch                      | Alpha 80%   | 4.9K TS (17 files), 3 tests    |
| **neko-proto**  | 协议定义（timeline.proto + diff.proto 完整 IDL）                               | Stable 100% | 2 proto                        |
| **neko-auth**   | 统一认证 - OAuth 2.0 + PKCE SSO + token 刷新 + VSCode SecretStorage / 文件存储 | Alpha 80%   | 1.4K TS (14 files), 3 tests    |
| **neko-suite**  | Extension Pack 门户 + Release workflow                                         | Stable 90%  | 配置包                         |

### 功能模块

| 模块             | 职能                                                                                                                                                                                                                                                               | 状态      | 规模                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------- |
| **neko-preview** | 媒体预览 - Video/Audio Provider + WebCodecs 播放器 + Apple Music 风格波形；**文档预览 P0 ✅**（PDF/CBZ/EPUB/DOCX 自建预览器 + 选区→AI 桥接）                                                                                                                       | Alpha 92% | 7.2K TS/TSX (42 files), 5 tests  |
| **neko-story**   | 剧本编辑器 - Fountain LSP + 预览 + 时间线生成；**分镜系统 ✅**：ScriptTableView + CreativeGridView + ShotNode 数据类型 + 分镜→Cut 导出 + Agent 协同（[架构](./docs/architecture/2d-capability-analysis.md)）                                                       | Alpha 90% | 5.9K TS/TSX (41 files), 3 tests  |
| **neko-market**  | 资产市场 - Skills/着色器/模型/预设搜索 + 安装 + 版本管理 + 本地模型部署                                                                                                                                                                                            | Alpha 97% | 4.4K TS/TSX (47 files), 9 tests  |
| **neko-assets**  | 资产管理 - 注册表 + 缩略图 + 外部媒体库 + Document + PathVariable 全格式                                                                                                                                                                                           | Alpha 92% | 9.2K TS (47 files), 7 tests      |
| **neko-tools**   | 媒体工具 - Diff 比较 + 并行优化 + 协议增强                                                                                                                                                                                                                         | WIP 62%   | 14.9K TS (69 files), 6 tests     |
| **neko-canvas**  | 无限画布 - 9 种节点（ShotNode/SceneGroupNode/GalleryNode/ScriptNode/DocumentNode/ModelNode）+ 分组 + 画板导出 + GenerationPromptPanel + BatchGenerationScheduler + 7 MCP Tools；CanvasEmbedNode P3 规划中（[架构](./docs/architecture/2d-capability-analysis.md)） | Alpha 93% | 14.1K TS/TSX (79 files), 4 tests |

### 创作模块

| 模块            | 职能                                                                                                                                                                                      | 状态      | 规模                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------- |
| **neko-model**  | 3D 创作 - glTF/VRM 视口 + PBR/IBL + 粒子/后处理 + CSG/文字/几何体 + 骨骼表情 + 时间线集成（[架构](./docs/architecture/3d-capability-analysis.md)）                                        | Alpha 65% | 3.5K TS/TSX (39 files)            |
| **neko-sketch** | 2D 创作 - 压感手绘 7 笔刷 + 滤镜/粒子/场景/像素/矢量 + 逐帧/骨骼动画 + 精灵表 + AI 生图/Inpaint/风格迁移/自动分层 + 跨模块工作流（[架构](./docs/architecture/2d-capability-analysis.md)） | Alpha 95% | 13.9K TS/TSX (126 files), 7 tests |
| **neko-audio**  | 音频工作站 - 波形编辑 + 12 种效果链 + 频谱分析 + AI 降噪 + 麦克风录音 + 导出                                                                                                              | Alpha 95% | 9.2K TS/TSX (54 files), 3 tests   |

### 规划中

| 模块          | 职能                                                                | 状态       |
| ------------- | ------------------------------------------------------------------- | ---------- |
| **neko-live** | 虚拟制片 - MediaPipe/VMC 动捕 + VRM 虚拟形象 + RTMP 推流 + OBS 集成 | Planned 5% |

---

## 核心技术

### 1. Rust Sidecar 引擎

核心计算逻辑驻留在 **neko-engine** Rust 独立进程中（7 个 crate），通过统一 HTTP/WS + NAPI 与 VS Code 通讯，彻底解决编辑器卡顿问题。

```
VS Code Extension Host ←─ HTTP/WS/NAPI ─→ neko-engine (Rust Sidecar)
                                                │
                                                ├─ wgpu GPU 渲染（25+ WGSL shaders, PBR + IBL + 粒子 + 后处理）
                                                ├─ FFmpeg 编解码（硬件加速 VideoToolbox/NVENC/VAAPI）
                                                ├─ 关键帧缓存 + 预加载优化
                                                ├─ 导出管线（GPU export + audio mixer + 响度标准化）
                                                ├─ native-scene 3D 场景（bevy_ecs + glTF/VRM + PBR + 物理）
                                                ├─ native-puppet 2D 骨骼（bevy_ecs + inox2d + 60fps WS 流）
                                                └─ ONNX ML 推理（macOS CoreML 加速）
```

### 2. AI Agent Skills 驱动

用户通过 **neko-agent** 将自然语言转化为操作指令。支持 Claude/OpenAI/Google 多 Provider、MCP 协议、Pipeline 工作流、子 Agent、AOP 钩子，提供完整的 CLI 和 React UI。

```
用户意图 → neko-agent (LLM + Skills + MCP + Pipeline) → neko-cut/canvas 执行
```

### 3. WebGPU 渲染闭环

利用 wgpu compositor 将视频帧、特效、转场、色彩校正在 GPU 显存中直接合成。支持 blend modes、custom shaders、keyframe animation。

```
视频帧 + 特效 + 转场 → wgpu Compositor → 实时预览 / GPU 导出
```

---

## 工作流

```
┌─────────────────────────────────────────────────────────────────────┐
│  文 → 智 → 画 → 音 → 发                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 文：在 VS Code 中使用 neko-story 编写 Fountain 格式剧本          │
│         ↓                                                           │
│  2. 智：neko-agent 自动解析剧本，在时间线摆放素材并生成预览           │
│         ↓                                                           │
│  3. 画：在 neko-canvas 中组织素材，通过 neko-sketch 进行实时改图      │
│         ↓                                                           │
│  4. 音：在 neko-audio 中录制画外音，并由 AI 自动完成降噪对齐          │
│         ↓                                                           │
│  5. 发：通过 Git 提交即触发 neko-assets 的 CI/CD 自动渲染并发布       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
neko-suite/
├── packages/
│   ├── neko-suite/            # Extension Pack 门户
│   ├── neko-engine/           # Rust Sidecar 媒体引擎
│   │   └── packages/
│   │       ├── native-core/   # Rust 核心（wgpu/编解码/导出/ONNX ML）
│   │       ├── native-api/    # HTTP API 路由层
│   │       ├── native-http/   # Axum HTTP 服务
│   │       ├── native-napi/   # Node.js NAPI 绑定
│   │       ├── native-cli/    # CLI 入口
│   │       ├── native-scene/  # Rust 3D 场景 ECS（bevy_ecs + glTF）
│   │       ├── native-puppet/ # Rust 2D 骨骼 ECS（bevy_ecs + inox2d + bevy_animation）
│   │       ├── types/         # Rust 共享类型
│   │       └── extension/     # TS VSCode 扩展侧
│   ├── neko-cut/              # 视频剪辑器
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧
│   │       └── webview/       # React UI（13 store slices）
│   ├── neko-agent/            # AI Agent
│   │   └── packages/
│   │       ├── agent/         # 核心引擎（executor/session/skills/mcp）
│   │       ├── platform/      # LLM 平台层（Claude/OpenAI/Google adapter）
│   │       ├── webview/       # React UI
│   │       ├── extension/     # VSCode 扩展侧
│   │       └── cli-tui/       # 交互式 CLI
│   ├── neko-canvas/           # 无限画布
│   │   └── packages/
│   │       ├── canvas/        # 画布核心逻辑
│   │       ├── extension/     # VSCode 扩展侧
│   │       └── webview/       # React UI
│   ├── neko-story/            # 剧本编辑器（Fountain LSP）
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧
│   │       ├── parser/        # Fountain 解析器
│   │       ├── types/         # 类型定义
│   │       └── webview/       # React UI
│   ├── neko-preview/          # 媒体预览
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧
│   │       └── webview/       # React UI
│   ├── neko-tools/            # 媒体工具
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧
│   │       └── webview/       # React UI
│   ├── neko-assets/           # 资产管理
│   │   └── packages/
│   │       └── asset/         # 资产核心逻辑
│   ├── neko-market/           # 资产市场
│   │   └── packages/
│   │       ├── core/          # 市场客户端 + 安装管理（Layer 0）
│   │       ├── extension/     # VSCode 扩展侧
│   │       └── webview/       # React UI
│   ├── neko-auth/             # 统一认证（OAuth 2.0 + PKCE SSO）
│   │   └── packages/
│   │       ├── core/          # @neko/auth-core（Layer 0）
│   │       └── extension/     # neko.neko-auth VSCode 扩展
│   ├── neko-audio/            # 音频工作站
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧
│   │       └── webview/       # React UI
│   ├── neko-client/           # 流媒体客户端（H264/PCM/fMP4）+ EngineClient
│   ├── neko-model/            # 3D 创作（R3F + PBR/IBL + CSG + 骨骼表情）
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧（.gltf/.glb/.vrm/.nkm）
│   │       └── webview/       # React Three Fiber UI
│   ├── neko-sketch/           # 2D 绘画（手绘 + 滤镜/粒子/场景 + 逐帧动画）
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧（CustomEditorProvider .nks）
│   │       └── webview/       # React 18 + WebGL2 UI
│   ├── neko-puppet/           # 2D 骨骼动画（Inochi2D puppet 编辑器）
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧（CustomEditorProvider .nkp/.inp）
│   │       └── webview/       # React 18 + EngineClient UI
│   ├── neko-live/             # 虚拟直播（Planned）
│   ├── neko-types/            # 共享类型 + Logger + i18n + Theme
│   └── neko-proto/            # 协议定义（Protobuf IDL）
├── docs/                      # 架构文档
├── package.json               # 根 package.json (pnpm workspaces)
├── ROADMAP.md                 # 开发路线图
├── CLAUDE.md                  # 开发规范
└── turbo.json                 # Turbo 构建配置
```

---

## 技术栈

| 层级             | 技术                                                   |
| ---------------- | ------------------------------------------------------ |
| **Frontend**     | React 18 + Zustand + Tailwind CSS + Vite               |
| **Extension**    | VS Code Extension API + TypeScript + esbuild           |
| **Engine**       | Rust + wgpu + FFmpeg + axum + tokio + bevy_ecs         |
| **AI**           | Vercel AI SDK (Claude/OpenAI/Google) + MCP Protocol    |
| **ML**           | ONNX Runtime（macOS CoreML 加速）+ Whisper             |
| **Streaming**    | H.264 + PCM + fMP4 over WebSocket                      |
| **Testing**      | Vitest v4 + cargo test                                 |
| **Code Quality** | ESLint + TypeScript strict + Knip + dependency-cruiser |
| **Build**        | pnpm workspaces + Turbo (Monorepo)                     |

---

## 支持的媒体格式

| 类型        | 格式                                |
| ----------- | ----------------------------------- |
| **视频**    | MP4, MOV, AVI, MKV, WebM, M4V       |
| **音频**    | MP3, WAV, OGG, FLAC, AAC, M4A       |
| **图片**    | PNG, JPG, JPEG, GIF, WebP, BMP, SVG |
| **3D 模型** | glTF, GLB, VRM, .nkm                |
| **2D 动画** | INP (Inochi2D), .nks (Neko Sketch)  |
| **项目**    | .nkv (视频项目), .nkc (画布项目)    |

---

## 安装方式

### 方式一：完整安装（推荐）

安装 `Neko Suite` 即可获得所有功能：

```
ext install neko.neko-suite
```

### 方式二：按需安装

根据需求单独安装子插件：

- **仅剪辑**：`neko-cut` + `neko-engine`
- **仅 AI**：`neko-agent`
- **仅预览**：`neko-preview` + `neko-engine`
- **仅音频**：`neko-audio` + `neko-engine`

---

## 文档

- [ROADMAP.md](./ROADMAP.md) - 开发路线图和功能规划
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 系统架构总览
- [CLAUDE.md](./CLAUDE.md) - 开发规范和架构指南
- [docs/engine.md](./docs/engine.md) - 媒体引擎文档
- [docs/shaders.md](./docs/shaders.md) - GPU Shader 文档
- [docs/timeline-alignment.md](./docs/timeline-alignment.md) - 时间线对齐文档
- [docs/editoperation.md](./docs/editoperation.md) - 编辑操作设计
- [docs/architecture/](./docs/architecture/) - 架构设计文档
  - [3D 能力集成分析](./docs/architecture/3d-capability-analysis.md) - neko-model + native-scene 架构决策
  - [2D 能力集成分析](./docs/architecture/2d-capability-analysis.md) - neko-sketch + neko-puppet + native-puppet 架构决策
  - [面板放置策略](./docs/architecture/panel-placement.md) - 编辑器面板架构
  - [设备访问策略](./docs/architecture/device-access.md) - 硬件设备代理方案
  - [格式策略](./docs/architecture/format-strategy.md) - nk\* 文件格式设计
  - [市场平台](./docs/architecture/marketplace.md) - 资产市场架构
  - [本地模型部署](./docs/architecture/model-runtime.md) - ONNX/GGUF 运行时
  - [Registry Server](./docs/architecture/registry-server.md) - 注册中心设计

---

## 贡献

欢迎参与 Neko Suite 的开发！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

详细开发规范请参考 [CLAUDE.md](./CLAUDE.md)。

---

## License

Mixed License (MIT / Apache 2.0 / LGPL v3) — see [LICENSE](./LICENSE) for details.

- [Ethical Use Guidelines](./ETHICS.md) — community expectations for derivative works
- [Trademark Policy](./TRADEMARK.md) — brand usage guidelines

---

## 致谢

Neko Suite 站在众多优秀开源项目的肩膀上：

### 平台与运行时

- [VS Code](https://code.visualstudio.com/) - 强大的编辑器平台
- [Node.js](https://nodejs.org/) - JavaScript 运行时
- [Tokio](https://tokio.rs/) - Rust 异步运行时

### GPU 与渲染

- [wgpu](https://wgpu.rs/) - 跨平台 GPU 抽象层（Metal/Vulkan/DX12）
- [Three.js](https://threejs.org/) + [React Three Fiber](https://r3f.docs.pmnd.rs/) - 3D 渲染
- [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) - 浏览器原生编解码

### 媒体处理

- [FFmpeg](https://ffmpeg.org/) ([ffmpeg-next](https://github.com/zmwangx/rust-ffmpeg)) - 视频编解码基础设施
- [cpal](https://github.com/RustAudio/cpal) - 跨平台音频 I/O
- [sharp](https://sharp.pixelplumbing.com/) - 高性能图像处理

### AI 与 ML

- [Vercel AI SDK](https://sdk.vercel.ai/) - 多模型 AI 集成框架
- [ONNX Runtime](https://ort.pyke.io/) ([ort](https://github.com/pykeio/ort)) - ML 推理引擎

### 3D/2D 引擎

- [Bevy ECS](https://bevyengine.org/) - 实体-组件-系统框架
- [glTF-rs](https://github.com/gltf-rs/gltf) - glTF/GLB 模型解析
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) - VRM 角色模型支持
- [inox2d](https://github.com/Inochi2D/inox2d) - Inochi2D 2D 骨骼角色

### 前端

- [React](https://react.dev/) - UI 框架
- [Zustand](https://zustand-demo.pmnd.rs/) - 状态管理
- [Tailwind CSS](https://tailwindcss.com/) - 原子化样式

### 网络与通信

- [Axum](https://github.com/tokio-rs/axum) - HTTP/WebSocket 服务
- [napi-rs](https://napi.rs/) - Rust ↔ Node.js 绑定
- [Protocol Buffers](https://protobuf.dev/) - 类型契约协议

### 构建与质量

- [Turborepo](https://turbo.build/) - Monorepo 构建编排
- [Vite](https://vitejs.dev/) - 前端打包
- [Vitest](https://vitest.dev/) - 测试框架
- [ESLint](https://eslint.org/) + [Knip](https://knip.dev/) + [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) - 代码质量
