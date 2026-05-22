# Neko Suite

> AIGC IDE + AIGC Agent — Agent 驱动的多模态创作工作站，深度集成于 VS Code

[English](./README.md) | [猫娘版](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** 是一款 AIGC 原生的创作 IDE，深度集成于 VS Code。它以 **AIGC Agent** 为核心驱动，通过自然语言打通剧本、视频、3D、2D、音频的全多模态创作闭环；**Skill** 负责编排可复用的工作流；**统一素材库** 为所有创作界面供料;**Rust Sidecar 引擎** 保证编辑器全程流畅。

📋 **[查看开发路线图 →](./ROADMAP.md)**

---

## 特性亮点

- **AIGC Agent 为核心** - 自然语言驱动跨视频/3D/2D/音频/剧本的多模态创作；多 LLM（Claude / OpenAI / Google）+ MCP 协议 + 多模态感知 + 富内容投递
- **Skill 编排工作流** - 可组合的 Skill 绑定提示词、工具集、权限与上下文预算;分级延迟加载将基线控制在 ~8K tokens,按需增长
- **多模态创作面板** - 剧本（Fountain LSP）→ 无限画布分镜 → 时间线剪辑 → 3D 建模 / 2D 手绘 / 2D 骨骼动画 → 音频工作站
- **统一素材库** - 跨模块的素材注册表，缩略图 + 持久化搜索索引 + 外部媒体库挂载 + 路径变量解析（`${VAR}/path`）
- **资产市场** - Skills/着色器/模型/预设的搜索、安装、版本管理;支持本地模型部署（ONNX / GGUF）+ 上游代理（HF / Civitai）
- **Rust GPU 引擎** - wgpu PBR + IBL + 后处理 + 粒子（20+ WGSL shader）+ 3D 场景 & 2D 骨骼 ECS + ONNX ML 推理,4K 实时预览
- **Git 原生支持** - `.nkv` / `.nkc` / `.nka` / `.nkm` / `.nks` 项目文件为文本格式，支持版本控制与协作
- **模块化架构** - 19 个包按需组合，独立升级

---

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建

```bash
./build.sh            # 构建 neko-cut（默认）
./build.sh --all      # 构建全部扩展
```

### 开发模式

```bash
pnpm run dev
```

---

## 模块架构

Neko Suite 采用 **Monorepo（pnpm workspace + turbo）** 模式，包含 19 个包：

### 核心三角（开发重心）

| 模块            | 职能                                                                                              | 状态      | 规模                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| **neko-engine** | Rust GPU 媒体引擎 - wgpu PBR 渲染 + 编解码 + DSP 效果 + 导出 + 3D 场景/2D 骨骼 ECS + ONNX ML 推理 | Alpha 99% | ~108K Rust (293 files, 980 tests) + 4.6K TS (22 files)         |
| **neko-cut**    | 视频剪辑器 - 时间线 + 预览 + 色彩校正 + 特效 + 56 EditOperation                                   | Alpha 95% | 63K TS/TSX (292 files, 658 tests), 52 命令                     |
| **neko-agent**  | AI Agent - 多 LLM + MCP + Skills + IDC 统一工作流 + 多模态感知 + 富内容投递 + 创意实体组合        | Alpha 99% | 228K TS (1166 files, 3463 tests)                               |

### 基础设施

| 模块            | 职能                                                                                | 状态        | 规模                              |
| --------------- | ----------------------------------------------------------------------------------- | ----------- | --------------------------------- |
| **neko-types**  | 共享类型 + 横切关注点（Logger/i18n/Theme/Errors）+ Operations 类型安全 + entity-uri | Alpha 94%   | 55.7K TS (296 files, 519 tests)   |
| **neko-client** | 流媒体客户端 - H264/fMP4/PCM + EngineClient HTTP dispatch + MediaPlaybackService    | Alpha 85%   | 10K TS (39 files, 95 tests)       |
| **neko-proto**  | 协议定义（timeline.proto + diff.proto 完整 IDL）                                    | Stable 100% | 2 proto                           |
| **neko-auth**   | 统一认证 - OAuth 2.0 + PKCE SSO + token 刷新 + VSCode SecretStorage / 文件存储      | Alpha 90%   | 1.7K TS (15 files, 54 tests)      |
| **neko-suite**  | Extension Pack 门户                                                                 | Stable 90%  | 配置包                            |

### 功能模块

| 模块             | 职能                                                                                | 状态      | 规模                                |
| ---------------- | ----------------------------------------------------------------------------------- | --------- | ----------------------------------- |
| **neko-preview** | 媒体预览 - Video/Audio/全景 Provider + WebCodecs 播放器 + 引擎优先 HDR 路由         | Alpha 91% | 15.4K TS/TSX (86 files, 152 tests)  |
| **neko-story**   | 剧本编辑器 - Fountain LSP + 5 列分镜表 + 视频就绪评估 + story→agent→canvas 语义管线 | Alpha 97% | 18.7K TS/TSX (75 files, 217 tests)  |
| **neko-market**  | 资产市场 - Skills/着色器/模型/预设搜索 + 安装 + 版本管理 + 本地模型部署             | Alpha 90% | 13.7K TS/TSX (64 files, 198 tests)  |
| **neko-assets**  | 资产管理 - 注册表 + 缩略图 + 持久化搜索索引 + 外部媒体库                            | Alpha 88% | 11.3K TS (56 files, 167 tests)      |
| **neko-tools**   | 媒体工具 - Diff 比较 + JVI LSP + 静音检测 + 元数据查看                              | Alpha 72% | 17.5K TS (120 files, 112 tests)     |
| **neko-canvas**  | 无限画布 - 15 种节点 + Block 容器 + 组合预设 + 批量生成 + MCP Tools                 | Alpha 95% | 30.8K TS/TSX (145 files, 204 tests) |

### 创作模块

| 模块            | 职能                                                                                                       | 状态      | 规模                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------- |
| **neko-model**  | 3D 创作 - glTF/VRM 引擎流视口 + PBR/IBL + CSG + AI 捏脸预览场景（Face/Body/Motion/Voice）+ 粒子 + 关键帧动画 + IK 求解器 | Alpha 87% | 9.7K TS (75 files, 45 tests) + 98 Rust tests      |
| **neko-sketch** | 2D 创作 - 压感手绘 8 笔刷 + 图层 + 选区 + AI 工具 + PSD 导入 + .nks 格式 + 2D 光照                         | Alpha 68% | 31.9K TS/TSX (178 files, 185 tests)               |
| **neko-audio**  | 音频工作站 - DAW UI（TrackHeader/TrackLane/AudioClip）+ 12 种效果 + 频谱 + AI 降噪 + Agent 工具            | Alpha 82% | 11.1K TS/TSX (60 files, 52 tests)                 |
| **neko-puppet** | 2D 骨骼动画 - `.nkp` v2 Native Puppet（Bone2D + BlendShape + ControlDriver）+ Live2D/MOC3 导入转换兼容 + Agent/导出首版 + 60fps 流 | Alpha 92% | 4.2K TS (38 files, 37 tests) + 116 Rust tests     |
| **neko-live**   | 虚拟制片 - 引擎 Live Compositor 合成流 + ViewportShell + 设备授权 source refs + 非权威本地 fallback 录制       | Alpha 58% | 4.4K TS (34 files, 37 tests)                      |

---

## 核心技术

### 1. Rust Sidecar 引擎

核心计算逻辑驻留在 **neko-engine** Rust 独立进程中（11 个 crate），通过统一 HTTP/WS + NAPI 与 VS Code 通讯，彻底解决编辑器卡顿问题。

```
VS Code Extension Host ←─ HTTP/WS/NAPI ─→ neko-engine (Rust Sidecar)
                                                │
                                                ├─ wgpu GPU 渲染（20+ WGSL shaders, PBR + IBL + 粒子 + 后处理）
                                                ├─ FFmpeg 编解码（硬件加速 VideoToolbox/NVENC/VAAPI）
                                                ├─ DSP 效果库（混音管线 solo/pan）
                                                ├─ 导出管线（GPU export + audio mixer + 响度标准化）
                                                ├─ runtime-scene 3D 场景（bevy_ecs + glTF/VRM + IK + 动画混合）
                                                ├─ runtime-puppet 2D Native Puppet（Bone2D + BlendShape + MOC3 导入兼容 + 60fps WS 流）
                                                ├─ runtime-device 设备 I/O（cpal + midir + gilrs）
                                                ├─ runtime-media 媒体逻辑（probe/diff/subtitle）
                                                └─ runtime-ml ONNX 推理（macOS CoreML 加速）
```

### 2. AIGC Agent 作为创作驱动

**neko-agent** 是整个 IDE 的中枢大脑。它通过多 LLM（Claude / OpenAI / Google）、MCP 工具协议、多模态感知与富内容投递，把自然语言转化为跨时间线、画布、3D 视口、2D 手绘、音频工作站的多模态创作动作。每个子包通过 `AgentCapabilityProvider` 声明自己的工具能力,Agent 动态发现而非硬编码。

```
用户意图
   │
   ▼
┌────────────────────────────────────────────────────────────────┐
│  neko-agent  (LLM + MCP + 多模态感知 + Skills + Capability     │
│               Discovery + Context/Memory)                      │
└────────────────────────────────────────────────────────────────┘
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
 story     canvas       cut       model     sketch      audio
(剧本)    (分镜)      (时间线)    (3D)     (2D 手绘)   (DAW)
```

### 3. Skill 编排工作流

**Skill** 是可组合、可复用的工作流单元 —— 每个 Skill 打包提示词片段、允许的工具集、权限规则与上下文预算。Agent 根据意图激活 Skill（通过 `ActivateSkill` / `DeactivateSkill` 元工具）,`SkillInjectionCoordinator` 原子化地注入或撤销四条 track：Prompt → Permission → Guard → ToolSet。分级延迟加载（`resident` / `eager` / `lazy`）将基线控制在 ~8K tokens,按需增长。

```
意图 → SkillRegistry → activate(skill)
                         ├─ 提示词片段（system prompt section）
                         ├─ ToolSet（always / dynamic 层）
                         ├─ 权限规则
                         └─ 上下文预算
                       执行 → deactivate → 原子回滚
```

### 4. 统一素材库

一个**统一的素材注册表**（neko-assets）为所有创作界面供料：视频片段、音频、图片、3D 模型、2D 木偶、Agent 生成的内容、项目文件。持久化搜索索引、缩略图、外部媒体库挂载、路径变量解析（`${VAR}/path`,通过 `@neko/shared` 的 `PathResolver`）让素材库可在多机器、多协作者间移植。Agent 生成的资产以 `GeneratedAsset` 形式落盘并通过 JSON 引用 —— 零 base64 膨胀,完整溯源。

```
本地文件 / 外部素材库 / Agent 生成
   │
   ▼
┌────────────────────────────────────────────────────────────────┐
│  neko-assets  (Registry + 缩略图 + 搜索索引 + PathResolver)    │
└────────────────────────────────────────────────────────────────┘
   │           │          │          │          │          │
   ▼           ▼          ▼          ▼          ▼          ▼
 canvas      cut       model     sketch     puppet      audio
```

### 5. WebGPU 渲染闭环

利用 wgpu compositor 将视频帧、特效、转场、色彩校正在 GPU 显存中直接合成。支持 blend modes、custom shaders、keyframe animation。

```
视频帧 + 特效 + 转场 → wgpu Compositor → 实时预览
```

---

## 工作流

不是线性流水线 —— 而是 **Agent 驱动的创作闭环**,每一轮都经过五个平面并反哺下一次迭代:

```
           ┌──────────────────────────────────────────────────┐
           │                                                  │
           ▼                                                  │
  ① 意图创作                  提示词 + 选中素材 + 引用约束     │
     (user / AGENTS.md /                                      │
      常驻 skill)                                             │
           │                                                  │
           ▼                                                  │
  ② 动态编排                  SkillRegistry 激活 Prompt /      │
     (neko-agent)             Tools / Permissions / Context; │
                              IDC 三阶段 Draft→Plan→Apply    │
           │                                                  │
           ▼                                                  │
  ③ 内容生成                  story / canvas / cut / model /  │
     (多模态创作面板)          sketch / puppet / audio 通过   │
                              MCP + AgentCapabilityProvider  │
                              执行                            │
           │                                                  │
           ▼                                                  │
  ④ 质量审查                  Pipeline QC: LUFS 响度、多帧视觉│
     (自动化评审)              对比、格式校验、schema lint、  │
                              置信度门控                      │
           │                                                  │
           ▼                                                  │
  ⑤ 感知反馈                  PerceptionCard (Structural /   │
     (重新接地)                Semantic / Perceptual) 反哺下  │
                              一次意图; Evaluator 写入 memory│
                              / project cards                 │
           │                                                  │
           └──────────────► 回到 ① (闭环)
```

- **意图创作** —— 用户提示词、对话上下文、常驻 Skill、AGENTS.md overlay、项目级 memory
- **动态编排** —— Skill 激活原子注入 Prompt / ToolSet / Permission / Guard; 非平凡任务走 IDC 三阶段 (Draft → Plan → Apply)
- **内容生成** —— 跨界面执行(时间线 / 画布 / 3D / 2D / 音频), 通过 MCP 与 `AgentCapabilityProvider`
- **质量审查** —— Pipeline 适配器验证音频响度、多帧视觉一致性、schema 合法性、置信度阈值; 失败触发重试或人工审核
- **感知反馈** —— `PerceptionCard` 用实际产物状态(而非假设状态)重新接地 Agent; 结果闭环到下一次意图

---

## 项目结构

```
neko-suite/
├── packages/
│   ├── neko-suite/            # Extension Pack 门户
│   ├── neko-engine/           # Rust Sidecar 媒体引擎
│   │   └── packages/
│   │       ├── engine-kernel/   # Rust 核心（wgpu/编解码/导出/ONNX ML）
│   │       ├── host-api/    # HTTP API 路由层
│   │       ├── host-http/   # Axum HTTP 服务
│   │       ├── host-napi/   # Node.js NAPI 绑定
│   │       ├── host-cli/    # CLI 入口
│   │       ├── runtime-scene/  # Rust 3D 场景 ECS（bevy_ecs + glTF）
│   │       ├── runtime-puppet/ # Rust 2D Native Puppet ECS（Bone2D + BlendShape + MOC3 导入兼容）
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
│   ├── neko-puppet/           # 2D 骨骼动画（.nkp v2 native 编辑器 + Live2D/MOC3 导入转换）
│   │   └── packages/
│   │       ├── extension/     # VSCode 扩展侧（CustomEditorProvider .nkp）
│   │       └── webview/       # React 18 + EngineClient UI
│   ├── neko-live/             # 虚拟直播（Live Compositor 合成流 + fallback 预览）
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
| **2D 动画** | .nkp v2 (Neko Native Puppet), MOC3/Live2D 导入兼容, .nks (Neko Sketch) |
| **项目**    | .nkv (视频项目), .nkc (画布项目)    |

---

## 文档

- [ROADMAP_CN.md](./ROADMAP_CN.md) - 开发路线图和功能规划
- [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md) - 系统架构总览
- [CLAUDE_CN.md](./CLAUDE_CN.md) - 开发规范和架构指南
- [docs/engine.md](./docs/engine.md) - 媒体引擎文档
- [docs/shaders.md](./docs/shaders.md) - GPU Shader 文档
- [docs/timeline-alignment.md](./docs/timeline-alignment.md) - 时间线对齐文档
- [docs/editoperation.md](./docs/editoperation.md) - 编辑操作设计
- [docs/architecture/](./docs/architecture/) - 架构设计文档
  - [面板放置策略](./docs/architecture/panel-placement.md) - 编辑器面板架构
  - [设备访问策略](./docs/architecture/device-access.md) - 硬件设备代理方案
  - [Engine 插件化 RFC](./docs/architecture/engine-plugin-rfc.md) - 能力插件化与市场/宿主分工
  - [Engine Runtime 分层](./docs/architecture/engine-runtime-layering.md) - runtime 按包拆分与单宿主策略
  - [Story-Agent-Canvas 职责 ADR](./docs/architecture/story-agent-canvas-boundary.md) - Agent-first 视频创作中 story / agent / canvas 的边界，以及轻量分镜表的定位
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

详细开发规范请参考 [CLAUDE_CN.md](./CLAUDE_CN.md)。

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
