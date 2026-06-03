# Neko Suite

> AIGC 内容创作 IDE + AIGC 内容创作 Agent + AIGC 互动引擎，深度集成于 VS Code

[English](./README.md) | [猫娘版](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-Mixed-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** 的目标不是把聊天机器人塞进编辑器，而是做一个 AIGC 原生的内容创作 IDE、内容创作 Agent 和互动引擎：IDE 提供剧本、画布、时间线、3D、2D、音频和素材等专业创作面板；Agent 理解意图、规划任务、激活 Skill、调用工具、生成资产、检查结果并推动下一轮迭代；Rust 引擎负责实时预览、媒体处理、3D/2D 运行时、流媒体与互动控制。

当前仓库是 Alpha 阶段 monorepo，实际包含 **23 个顶层 workspace 包**。最成熟的方向是内容创作 Agent 运行时、Rust 媒体引擎、视频剪辑、Story/Canvas 语义工作流、预览/流媒体客户端和共享契约层。主要待推进的是跨包产品化：统一项目图谱、统一 Agent 能力注册、统一互动运行时，以及端到端 smoke 验证。

📋 **[查看开发路线图 →](./ROADMAP_CN.md)**

---

## 目标定位

### 1. AIGC 内容创作 IDE

创作路径不是线性流水线，而是 Agent 驱动的闭环：

```text
用户意图
  -> 剧本/场景规划
  -> Canvas 分镜与引用整理
  -> 素材/角色/实体接地
  -> 图像/视频/音频/模型生成
  -> 时间线/音频/3D/2D 编辑
  -> 预览/导出
  -> 感知反馈与质量审查
  -> 下一轮意图
```

### 2. AIGC 内容创作 Agent

Agent 是创作执行者。它把用户意图转成计划，激活 Skill，发现各包能力，通过 MCP/native bridge 调用工具，投递富媒体结果，并用真实项目状态重新接地。

```text
用户意图
  -> 上下文、记忆、选中素材、AGENTS.md overlay
  -> Skill 激活与权限守卫
  -> capability discovery 与工具规划
  -> Draft / Plan / Apply 执行
  -> 富内容投递与任务跟踪
  -> 感知反馈、评估器和下一轮对话
```

### 3. AIGC 互动引擎

互动引擎把创作资产变成可预览、可流式传输、可被 Agent 观察和控制的运行时状态：

```text
项目资产
  -> engine scene / puppet / audio / media runtimes
  -> H.264 + PCM + fMP4/WebSocket 流
  -> model / puppet / live / preview 互动界面
  -> Agent 反馈与实时控制
```

---

## 当前总体进度

更新时间：**2026-06-03**。下方百分比是“距离目标定位的定性进度估计”，不是发布承诺；依据包括包规模、测试、README/ARCHITECTURE、VS Code 入口、Webview 面板、Rust runtime 和跨包集成成熟度。

| 维度       | 当前判断                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| IDE 基础   | 较强。Story -> Agent -> Canvas -> Cut 已有真实契约和界面，但完整主路径还需要 smoke 验证。                      |
| 创作 Agent | 先进。多 LLM、MCP、Skills、权限、上下文、富内容、角色工作流、capability bootstrap 已实现。                     |
| 互动引擎   | Rust 基础较强。Scene、Puppet、Audio、Codec、GPU、Media、ML、Device runtime 已存在；Live/互动编排仍偏早期。     |
| 项目图谱   | 正在形成。`neko-entity`、`neko-search`、`neko-assets`、Dashboard 正在把角色/资产/任务/搜索收敛到共享项目语义。 |
| 产品成熟度 | Alpha。许多包可以构建和单测，但统一发行、端到端 smoke、性能基线、UX 打磨仍是最大缺口。                         |

---

## 子包进度分析

### 基础平台与契约层

| 包                                    | 目标职责                      | 进度 | 已具备                                                                                                                                 | 下一步                                              |
| ------------------------------------- | ----------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **neko-engine**                       | Rust 媒体与互动运行时权威来源 | 88%  | 357 个 Rust 文件；engine GPU/codec/audio/kernel/types；host HTTP/NAPI/CLI；scene/puppet/device/media/ML runtimes；VS Code sidecar 管理 | 运行时编排、性能基线、Live/设备稳定性、发布级 smoke |
| **neko-types** (`@neko/shared`)       | L0 共享契约与横切基础设施     | 84%  | 374 个 TS/TSX 文件；Logger/i18n/Theme/Errors；timeline/canvas/audio/sketch/agent 类型；EditOperation；Proto 生成类型                   | 继续收敛 legacy surface，守住 L0/L1/L2 边界         |
| **neko-client** (`@neko/neko-client`) | EngineClient 与流媒体客户端   | 76%  | HTTP dispatch、H.264/PCM/fMP4 streaming client、MediaPlaybackService、单测                                                             | 补齐跨 runtime 的取消、重试、错误传播与 smoke       |
| **neko-proto** (`@neko/proto`)        | Protobuf IDL 单一事实来源     | 78%  | timeline/diff IDL 与生成链路                                                                                                           | 扩展互动引擎、实体图谱、实时 session 的契约         |
| **neko-auth**                         | Provider/扩展统一认证         | 60%  | core + extension；OAuth 2.0、PKCE、SecretStorage/文件存储                                                                              | Provider onboarding、市场信任边界和账号 UX          |
| **neko-suite**                        | Extension Pack 门户           | 55%  | 主创作扩展包的 extensionPack 声明                                                                                                      | 更新 dashboard/entity/search/ui 等支撑包的打包策略  |

### 内容创作 Agent、IDE 编排与项目接地

| 包                               | 目标职责                    | 进度 | 已具备                                                                                                                                   | 下一步                                              |
| -------------------------------- | --------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **neko-agent**                   | AIGC 内容创作 Agent runtime | 87%  | 1,265 个 TS/TSX 文件；392 个测试；多 LLM platform；MCP；Skills；context/memory；permission；CLI；VS Code Webview；富媒体卡片；角色工作流 | 所有创作包的 capability contract 与端到端验证       |
| **neko-dashboard**               | 项目控制台、任务/实体总览   | 66%  | Extension + Webview；启动/显示命令；任务聚合；创意实体 source 聚合；测试                                                                 | 工作流 launcher、跨包实时状态、Live/Agent 任务接入  |
| **neko-entity** (`@neko/entity`) | 创意实体运行时与投影        | 58%  | entity/candidate/fact store；asset ref；Dashboard source；NPC profile assembler；边界测试                                                | 被各创作界面采用，并迁移到统一项目图谱              |
| **neko-search** (`@neko/search`) | 项目搜索与索引编排          | 56%  | ProjectIndexCoordinator、provider registry、VS Code adapters、global search、测试                                                        | 首屏 UI、更多 package provider、缓存/增量策略产品化 |
| **neko-ui** (`@neko/ui`)         | 共享 Webview UI 与创作控件  | 55%  | primitives、viewport shell、creative controls、keyboard/focus、workbench shell、36 个测试                                                | 逐步替换各包本地重复 UI，同时保持领域逻辑归属       |

### AIGC 内容创作 IDE 面板

| 包               | 目标职责                             | 进度 | 已具备                                                                                                            | 下一步                                                                  |
| ---------------- | ------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **neko-story**   | 文本驱动制片入口                     | 78%  | Fountain parser/types/webview/extension；SceneIndex；准备度表；story -> agent -> canvas 命令                      | flow-F 从剧本到生成时间线的完整 smoke                                   |
| **neko-canvas**  | 无限画布、分镜和视觉编排             | 80%  | 197 个 TS/TSX 文件；45 个测试；13+ 节点；storyboard import；GenerationPromptPanel；batch generation；inline media | 大画布性能、entity/search 接地、候选审阅到时间线闭环                    |
| **neko-cut**     | 视频时间线与最终装配                 | 82%  | 309 个 TS/TSX 文件；时间线、EditOperation、预览/导出服务、命令、测试                                              | AI 分镜导入、QC、导出的一体化 smoke                                     |
| **neko-preview** | 引擎优先的媒体/文档预览              | 76%  | Video/Audio/Panoramic/Document provider；WebCodecs 播放；波形和 stream clients                                    | 统一 file-access、跨 surface handoff、预览状态共享                      |
| **neko-assets**  | 统一素材注册表与媒体库               | 72%  | asset core；registry/entity/variant/file service；ImportDispatcher；媒体库搜索；角色资产导出                      | 与 `neko-entity`、generated asset provenance、market install state 收敛 |
| **neko-market**  | Skill/模型/着色器/预设/Provider 市场 | 70%  | core + extension + webview；install target contributions；安装校验路径                                            | 签名/信任、依赖解析、Provider/模型 onboarding                           |
| **neko-tools**   | 跨媒体检查、Diff 与 QC 工具          | 68%  | Diff UI、媒体信息、设备视图、JVI/媒体工具、测试                                                                   | Engine-first 二进制访问、与 Agent QC 工作流联动                         |

### AIGC 互动引擎与实时创作模块

| 包              | 目标职责             | 进度 | 已具备                                                                                              | 下一步                                                      |
| --------------- | -------------------- | ---- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **neko-model**  | 3D 创作与场景编辑    | 66%  | Engine-streamed viewport；glTF/GLB/VRM/.nkm editor；LookDev；灯光/环境；Inspector；typed scene docs | 更完整的建模/动画工作流、Agent 工具、互动 runtime 控制      |
| **neko-sketch** | 2D 绘画与逐帧动画    | 62%  | 190 个 TS/TSX 文件；WebGL2 绘画引擎；笔刷/图层/选区/滤镜/粒子/逐帧时间线/i18n                       | 共享 UI 迁移、资产/实体接地、生产级导出                     |
| **neko-puppet** | 2D 骨骼角色动画      | 74%  | `.nkp`/MOC3 custom editor；EngineClient UI；Live2D 兼容；Native Puppet 路径；测试                   | 表情/动作市场、创作 UX、Live runtime 控制                   |
| **neko-audio**  | 音频工作站与声音创作 | 64%  | `.nka` editor；DAW UI；波形、Mixer、效果、录音、导出面板；EngineClient service                      | engine mix/export smoke、Agent audio tools、Live monitoring |
| **neko-live**   | 虚拟制片与实时互动   | 45%  | Extension + Webview；LiveSession/Device/Tracking service；fallback preview/recording；测试          | 最早期主界面：需要 compositor、设备授权 UX、实时可靠性      |

---

## 集成优先级

1. **统一能力注册**
   每个创作包通过稳定 `AgentCapabilityProvider` 声明工具能力，让 Agent 动态发现，而不是硬编码包行为。

2. **统一项目图谱**
   `neko-entity`、`neko-assets`、`neko-search`、generated assets、角色事实和 Dashboard 需要收敛成一个可移植的项目语义图。

3. **统一互动运行时**
   `neko-engine`、`neko-client`、`neko-model`、`neko-puppet`、`neko-audio`、`neko-live`、`neko-preview` 需要共享 session、stream、file-access 和 authority 契约。

4. **端到端 smoke**
   发布门禁应覆盖 Story -> Agent -> Canvas -> 生成 -> Cut -> Preview/Export，以及 Character/Entity -> Model/Puppet -> Live/Agent feedback。

5. **共享 UI 迁移**
   `@neko/ui` 逐步替换重复控件，但领域状态、媒体 authority 和业务逻辑仍留在各功能包。

---

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建

```bash
pnpm build
```

常用定向构建：

```bash
pnpm build:neko-engine
pnpm build:neko-agent
pnpm build:neko-cut
pnpm build:pack-video
pnpm build:pack-2d
pnpm build:pack-audio
```

### 开发模式

```bash
pnpm run dev
```

---

## 核心架构

```text
VS Code Extension Host
  | postMessage
  v
Webview Surfaces (React + Zustand + Vite)
  | 必要时直连 WebSocket streams
  v
neko-engine Rust Sidecar
  | HTTP / WebSocket / N-API
  v
GPU、编解码、音频、场景、木偶、媒体、设备、ML runtimes
```

关键边界：

- Webview 不直接调用 Node.js 或 VS Code API。
- Extension Host 负责 VS Code API、文件选择、workspace state、Webview resource URI。
- Rust 负责重计算、媒体编解码、GPU 渲染、scene/puppet/audio/device runtime 和二进制文件访问。
- Protobuf 与 `@neko/shared` 保持跨层契约显式。
- `@neko/neko-client` 是零 VSCode 依赖的 HTTP/WS dispatch 与 streaming client 层。

---

## 项目结构

```text
neko-suite/
├── packages/
│   ├── neko-engine/       # Rust sidecar 引擎与 VS Code engine 扩展
│   ├── neko-agent/        # Agent runtime、AI platform、Webview、Extension、CLI
│   ├── neko-cut/          # 视频编辑器
│   ├── neko-canvas/       # 无限画布与分镜编排
│   ├── neko-story/        # 剧本编辑与 story planning
│   ├── neko-preview/      # 媒体/文档预览
│   ├── neko-assets/       # 素材注册表与媒体库
│   ├── neko-market/       # 市场与安装目标
│   ├── neko-tools/        # Diff、检查与媒体工具
│   ├── neko-model/        # 3D 创作
│   ├── neko-sketch/       # 2D 绘画
│   ├── neko-puppet/       # 2D 骨骼动画
│   ├── neko-audio/        # 音频工作站
│   ├── neko-live/         # 虚拟制片与实时互动
│   ├── neko-dashboard/    # 工作区 Dashboard
│   ├── neko-entity/       # 创意实体 runtime
│   ├── neko-search/       # 项目搜索 runtime
│   ├── neko-ui/           # 共享 Webview UI
│   ├── neko-types/        # @neko/shared
│   ├── neko-client/       # EngineClient 与 stream clients
│   ├── neko-proto/        # Protobuf IDL
│   ├── neko-auth/         # 认证 core 与 extension
│   └── neko-suite/        # Extension Pack
├── docs/
├── README.md
├── README_CN.md
├── README_NYA.md
├── ROADMAP.md
├── ARCHITECTURE.md
├── ARCHITECTURE_CN.md
└── turbo.json
```

---

## 技术栈

| 层级    | 技术                                                             |
| ------- | ---------------------------------------------------------------- |
| 前端    | React 18、Zustand、Tailwind CSS、Vite                            |
| VS Code | VS Code Extension API、TypeScript、esbuild                       |
| 引擎    | Rust、wgpu、FFmpeg、axum、tokio、bevy_ecs、napi-rs               |
| 流媒体  | H.264、PCM、fMP4、WebSocket、WebCodecs                           |
| AI      | Vercel AI SDK、Claude/OpenAI/Google/Ollama/Generic adapters、MCP |
| ML      | ONNX Runtime，可用时使用 CoreML 加速                             |
| 契约    | Protobuf、`@neko/shared`、JSON nk\* 项目格式                     |
| 构建    | pnpm 10、Turborepo 2                                             |
| 测试    | Vitest v4、cargo test、dependency-cruiser、Knip                  |

---

## 支持的媒体与项目格式

| 类型      | 格式                                                 |
| --------- | ---------------------------------------------------- |
| 视频      | MP4, MOV, AVI, MKV, WebM, M4V                        |
| 音频      | MP3, WAV, OGG, FLAC, AAC, M4A                        |
| 图片      | PNG, JPG, JPEG, GIF, WebP, BMP, SVG                  |
| 3D        | glTF, GLB, VRM, `.nkm`                               |
| 2D / 角色 | `.nks`, `.nkp` v2, MOC3/Live2D 导入兼容, `.nkentity` |
| 项目      | `.nkv`, `.nkc`, `.nka`, `.nkm`, `.nks`, `.nkp`       |

---

## 验证命令

按影响范围执行最小必要验证，再逐步扩大：

```bash
pnpm build
pnpm test
pnpm check
```

Rust 引擎相关改动：

```bash
cd packages/neko-engine
cargo test --workspace
```

本地 CI 等价入口：

```bash
pnpm ci:local
pnpm ci:local:rust
pnpm ci:local:proto
```

---

## 文档

- [ROADMAP_CN.md](./ROADMAP_CN.md) - 开发路线图和功能规划
- [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md) - 系统架构总览
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 英文系统架构总览
- [CLAUDE_CN.md](./CLAUDE_CN.md) - 开发规范和架构指南
- [docs/architecture/](./docs/architecture/) - ADR 与子系统架构文档
- [docs/architecture/adr-code-review-quality-gates.md](./docs/architecture/adr-code-review-quality-gates.md) - 代码审查与质量门禁

---

## 贡献

欢迎参与 Neko Suite 的开发。提交前请先守住架构边界：

1. Webview、Extension Host、Rust engine、共享契约分层清晰。
2. 跨包改动优先契约先行。
3. 新接口、状态机、失败路径补充聚焦测试。
4. 运行相关验证命令，并说明剩余风险。

详细开发规范请参考 [CLAUDE_CN.md](./CLAUDE_CN.md)。

---

## License

Mixed License (MIT / Apache 2.0 / LGPL v3) — see [LICENSE](./LICENSE) for details.

- [Ethical Use Guidelines](./ETHICS.md)
- [Trademark Policy](./TRADEMARK.md)

---

## 致谢

Neko Suite 基于许多优秀开源项目构建，包括 VS Code、Rust、Tokio、Axum、wgpu、FFmpeg、Bevy ECS、WebCodecs、React、Zustand、Tailwind CSS、Vite、Vitest、Turborepo、napi-rs、Protocol Buffers、ONNX Runtime 与 Vercel AI SDK。
