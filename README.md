# Neko Suite

> 全能内容创作 IDE - 深度集成于 VS Code 的视频编辑工作站

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** 是一款深度集成于 VS Code 的「全能内容创作工作站」。它通过 **Rust Sidecar 独立进程架构** 突破了编辑器性能限制，实现了从剧本创作到 4K 视频合成的完整闭环。

📋 **[查看开发路线图 →](./ROADMAP.md)**

---

## 特性亮点

- **AI 驱动创作** - 通过 Agent Skills + MCP 协议将自然语言转化为剪辑操作
- **专业级时间线** - 多轨道、关键帧动画、色彩校正、特效蒙版、精确到帧的编辑
- **Rust GPU 渲染** - wgpu PBR + IBL + 后处理 + 粒子系统，25+ WGSL shader，4K 实时预览与导出
- **3D/2D 创作** - glTF/VRM 3D 编辑 + 压感手绘 + 骨骼动画 + 滤镜/粒子/场景系统
- **Git 原生支持** - .jvi 项目文件为文本格式，支持版本控制和协作
- **模块化架构** - 16 个包按需组合，独立升级

---

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建 + 打包

```bash
./build.sh
```

### 安装到 VS Code

```bash
./install.sh
```

### 开发模式

```bash
pnpm run dev
```

---

## 模块架构

Neko Suite 采用 **Monorepo（pnpm workspace + turbo）** 模式，包含 16 个包：

### 核心三角（开发重心）

| 模块 | 职能 | 状态 | 规模 |
|------|------|------|------|
| **neko-engine** | Rust GPU 媒体引擎 - wgpu PBR 渲染 + 编解码 + 导出 + 粒子/后处理 + 3D 场景/2D 骨骼 ECS | Alpha 85% | 170+ Rust + 12 TS |
| **neko-cut** | 视频剪辑器 - 时间线 + 预览 + 色彩校正 + 特效 + 29 EditOperation | Alpha 82% | 200 TS/TSX |
| **neko-agent** | AI Agent - 多 LLM + MCP + Skills + CLI + 视频生成 | Alpha 75% | 418 TS/TSX, 47 tests |

### 基础设施

| 模块 | 职能 | 状态 | 规模 |
|------|------|------|------|
| **neko-types** | 共享类型 + 横切关注点（Logger/i18n/Theme/Errors） | Alpha 90% | 102 TS, 10 tests |
| **neko-client** | 流媒体客户端 - H264/fMP4/PCM + EngineClient HTTP dispatch | Alpha 80% | 8 TS |
| **neko-proto** | 协议定义（timeline.proto + diff.proto 完整 IDL） | Stable 100% | 2 proto |
| **neko-suite** | Extension Pack 门户 | Stable 90% | 配置包 |

### 功能模块

| 模块 | 职能 | 状态 | 规模 |
|------|------|------|------|
| **neko-preview** | 媒体预览 - Video/Audio Provider + WebCodecs 播放器 + 波形 | Alpha 70% | 19 TS/TSX |
| **neko-story** | 剧本编辑器 - Fountain LSP + 预览 + 时间线生成 + PDF 导出 | WIP 75% | 32 TS/TSX, 3 tests |
| **neko-assets** | 资产管理 - 注册表 + 缩略图 + 外部媒体库 + 多云支持 | Alpha 85% | 22 TS, 5 tests |
| **neko-tools** | 媒体工具 - Diff 比较 + 并行优化 + 协议增强 | WIP 62% | 17 TS, 3 tests |
| **neko-canvas** | 无限画布 - 5 种节点 + 多选 + 属性面板 + 拖放 + 快捷键 | Alpha 65% | 58 TS/TSX |

### 新兴模块

| 模块 | 职能 | 状态 | 规模 |
|------|------|------|------|
| **neko-model** | 3D 创作 - glTF/VRM 视口 + PBR/IBL + 粒子/后处理 + CSG/文字/几何体 + 骨骼表情 + 时间线集成（[架构](./docs/architecture/3d-capability-analysis.md)） | Alpha 65% | 25+ TS/TSX + 12 Rust |
| **neko-sketch** | 2D 创作 - 压感手绘 7 笔刷 + 滤镜/粒子/场景/像素/矢量 + 逐帧/骨骼动画 + 精灵表 + i18n（[架构](./docs/architecture/2d-capability-analysis.md)） | Alpha 85% | 90+ TS/TSX + Rust, 42 tests |

### 规划中

| 模块 | 职能 | 状态 |
|------|------|------|
| **neko-audio** | 音频工作站 - 波形编辑 + 均衡器/压缩/降噪 + 录音 | Planned |
| **neko-live** | 虚拟制片 - MediaPipe/VMC 动捕 + VRM 虚拟形象 + RTMP 推流 + OBS 集成 | Planned |

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
                                                └─ native-puppet 2D 骨骼（bevy_ecs + inox2d + 60fps WS 流）
```

### 2. AI Agent Skills 驱动

用户通过 **neko-agent** 将自然语言转化为操作指令。支持 Claude/OpenAI 多 Provider、MCP 协议、子 Agent、AOP 钩子，提供完整的 CLI 和 React UI。

```
用户意图 → neko-agent (LLM + Skills + MCP) → neko-cut/canvas 执行
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
│   │       ├── native-core/   # Rust 核心（wgpu/编解码/导出）
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
│   │       ├── platform/      # LLM 平台层（Claude/OpenAI adapter）
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
│   ├── neko-client/           # 流媒体客户端（H264/PCM/fMP4）+ EngineClient
│   ├── neko-model/            # 3D 创作（R3F + PBR/IBL + CSG + 骨骼表情）
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧（.gltf/.glb/.vrm/.nkm）
│   │       └── webview/       # React Three Fiber UI
│   ├── neko-sketch/           # 2D 创作（手绘 + 滤镜/粒子/场景 + 骨骼/逐帧动画）
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧（CustomEditorProvider .nks）
│   │       └── webview/       # React 18 + WebGL2 UI
│   ├── neko-audio/            # 音频工作站（Planned）
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

| 层级 | 技术 |
|------|------|
| **Frontend** | React 18 + Zustand + Tailwind CSS + Vite |
| **Extension** | VS Code Extension API + TypeScript + esbuild |
| **Engine** | Rust + wgpu + FFmpeg + axum + tokio + bevy_ecs |
| **AI** | Vercel AI SDK (Claude/OpenAI/Google) + MCP Protocol |
| **Streaming** | H.264 + PCM + fMP4 over WebSocket |
| **Testing** | Vitest v4 + cargo test |
| **Code Quality** | ESLint + TypeScript strict + Knip + dependency-cruiser |
| **Build** | pnpm workspaces + Turbo (Monorepo) |

---

## 支持的媒体格式

| 类型 | 格式 |
|------|------|
| **视频** | MP4, MOV, AVI, MKV, WebM, M4V |
| **音频** | MP3, WAV, OGG, FLAC, AAC, M4A |
| **图片** | PNG, JPG, JPEG, GIF, WebP, BMP, SVG |
| **3D 模型** | glTF, GLB, VRM, .nkm |
| **2D 动画** | INP (Inochi2D), .nks (Neko Sketch) |
| **项目** | .jvi (视频项目), .jvc (画布项目) |

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

---

## 文档

- [ROADMAP.md](./ROADMAP.md) - 开发路线图和功能规划
- [CLAUDE.md](./CLAUDE.md) - 开发规范和架构指南
- [docs/engine.md](./docs/engine.md) - 媒体引擎文档
- [docs/shaders.md](./docs/shaders.md) - GPU Shader 文档
- [docs/timeline-alignment.md](./docs/timeline-alignment.md) - 时间线对齐文档
- [docs/editoperation.md](./docs/editoperation.md) - 编辑操作设计
- [docs/architecture/](./docs/architecture/) - 架构设计文档
  - [3D 能力集成分析](./docs/architecture/3d-capability-analysis.md) - neko-model + native-scene 架构决策
  - [2D 能力集成分析](./docs/architecture/2d-capability-analysis.md) - neko-sketch + native-puppet 架构决策
  - [跨语言架构](./docs/architecture/cross-language-architecture.md) - Rust/TS 跨语言设计
  - [共享包设计](./docs/architecture/shared-packages-design.md) - 包间共享策略
  - [跨仓共享设计](./docs/architecture/cross-repo-sharing-design.md) - 跨仓库共享方案

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

MIT

---

## 致谢

- [VS Code](https://code.visualstudio.com/) - 强大的编辑器平台
- [wgpu](https://wgpu.rs/) - 跨平台 GPU 抽象层
- [FFmpeg](https://ffmpeg.org/) - 媒体处理基础设施
- [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) - 浏览器原生编解码
