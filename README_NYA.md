# ✨ Neko Suite ✨

### ～ AIGC 内容创作 IDE + AIGC 内容创作 Agent + AIGC 互动引擎，喵！ ～

```text
    /\_____/\
   /  o   o  \      "你好呀主人～
  ( ==  ^  == )      我是住在 VS Code 里的 Neko，
   )         (       会写剧本、排分镜、剪视频、做角色，
  (           )      也会把作品变成可互动的实时引擎状态喵！"
 ( (  )   (  ) )
(__(__)___(__)__)
```

[正经版](./README.md) | [中文](./README_CN.md)

[![状态](https://img.shields.io/badge/状态-Alpha-ff69b4)]()
[![协议](https://img.shields.io/badge/协议-AGPL--3.0--or--later-c792ea)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-7dc4e4)]()

---

## 喵？这是什么？

**Neko Suite** 现在的目标有三条主线：

- **AIGC 内容创作 IDE**：主人说出意图，Neko 把剧本、分镜、素材、角色、模型、声音和时间线串成一轮轮创作闭环。
- **AIGC 内容创作 Agent**：Neko 理解意图、制定计划、激活 Skill、调用工具、生成资产、检查结果，再把下一轮创作推进下去。
- **AIGC 互动引擎**：Rust 引擎把项目资产变成可预览、可流式传输、可实时互动、可被 Agent 观察和控制的运行时状态。

当前仓库是 Alpha 阶段，一共有 **23 个顶层 workspace 包**。强项在内容创作 Agent、Rust 引擎、视频剪辑、Story/Canvas 工作流、预览流媒体和共享契约；还在修炼的是统一项目图谱、统一 Agent 能力注册、统一互动 runtime 和完整端到端 smoke。

> 📋 **[查看路线图 →](./ROADMAP_CN.md)**

---

## 创作魔法闭环，喵！

```text
主人意图
  -> 剧本/场景规划
  -> Canvas 分镜与参考图
  -> 角色/实体/素材接地
  -> 图像/视频/音频/模型生成
  -> 时间线/音频/3D/2D 编辑
  -> 预览/导出/质量检查
  -> Neko 看结果，再进入下一轮
```

Agent 自己的工作循环是这样：

```text
主人意图
  -> 上下文、记忆、选中素材
  -> Skill 激活与权限守卫
  -> capability discovery 与工具规划
  -> Draft / Plan / Apply
  -> 富内容投递、任务追踪、感知反馈
```

互动引擎这边是这样：

```text
项目资产
  -> Rust scene / puppet / audio / media runtimes
  -> H.264 + PCM + fMP4/WebSocket
  -> model / puppet / live / preview 界面
  -> Agent 反馈与实时控制
```

---

## 当前修炼重点，喵！

| 方向       | 猫娘判断                                                                            |
| ---------- | ----------------------------------------------------------------------------------- |
| IDE 基础   | 已经有模样了：Story -> Agent -> Canvas -> Cut 有真实界面和契约，还需要完整 smoke。  |
| 创作 Agent | 很能干：多 LLM、MCP、Skills、权限、上下文、富内容和角色工作流都已落地。             |
| 互动引擎   | Rust 底座很扎实：scene、puppet、audio、codec、GPU、media、ML、device runtime 都在。 |
| 项目图谱   | 正在长骨架：entity、search、assets、dashboard 正在把角色/资产/任务统一起来。        |
| 产品成熟度 | Alpha：能建、能测、能跑很多局部路径；统一发布和端到端体验还要继续磨。               |

---

## 猫娘家族 23 包

### 地基猫娘

| 包              | 负责什么              | 当前能力                                                             | 关注点                          |
| --------------- | --------------------- | -------------------------------------------------------------------- | ------------------------------- |
| **neko-engine** | Rust 媒体与互动引擎   | GPU/编解码/音频/scene/puppet/device/media/ML runtimes，HTTP/NAPI/CLI | 性能基线、Live/设备、发布 smoke |
| **neko-types**  | 共享契约              | Logger/i18n/Theme/Errors、EditOperation、跨包类型、Proto 生成类型    | 继续守住 L0/L1/L2 边界          |
| **neko-client** | EngineClient 和流媒体 | HTTP dispatch、H.264/PCM/fMP4、播放服务                              | 取消/重试/错误传播 smoke        |
| **neko-proto**  | Protobuf IDL          | timeline/diff 契约                                                   | 互动 session 和实体图谱契约     |
| **neko-auth**   | 认证                  | OAuth 2.0、PKCE、token 存储                                          | Provider onboarding 和市场信任  |
| **neko-suite**  | Extension Pack        | 主创作扩展打包入口                                                   | 支撑包打包策略更新              |

### 大脑和项目管家

| 包                 | 负责什么         | 当前能力                                                                      | 关注点                         |
| ------------------ | ---------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| **neko-agent**     | 内容创作 Agent   | 多 LLM、MCP、Skills、context/memory、权限、CLI、Webview、富媒体卡片、角色工作流 | 全创作包 capability 端到端验证 |
| **neko-dashboard** | 项目控制台       | 任务聚合、创意实体 source 聚合、工作区入口                                      | 工作流 launcher 和实时状态     |
| **neko-entity**    | 创意实体 runtime | 角色/实体 store、候选、asset ref、Dashboard source                              | 被所有创作界面采用             |
| **neko-search**    | 项目搜索         | 项目索引、provider registry、VS Code adapters                                   | UI 和更多 provider             |
| **neko-ui**        | 共享 Webview UI  | primitives、viewport shell、creative controls、keyboard/focus                   | 逐步替换各包本地控件           |

### 内容创作工坊

| 包               | 负责什么         | 当前能力                                                                 | 关注点                       |
| ---------------- | ---------------- | ------------------------------------------------------------------------ | ---------------------------- |
| **neko-story**   | 剧本与文驱动制片 | Fountain、SceneIndex、准备度表、story -> agent -> canvas                 | flow-F 完整 smoke            |
| **neko-canvas**  | 无限画布和分镜   | 13+ 节点、storyboard import、GenerationPromptPanel、批量生成、inline media | 大画布性能和实体接地         |
| **neko-cut**     | 视频时间线       | 时间线、EditOperation、预览/导出服务、命令                               | AI 分镜导入到导出的 smoke    |
| **neko-preview** | 媒体/文档预览    | 视频、音频、全景、文档预览，WebCodecs 播放                               | file-access 和跨界面 handoff |
| **neko-assets**  | 素材库           | registry、实体/变体/文件服务、导入、媒体库搜索、角色资产导出             | 统一项目图谱和生成资产溯源   |
| **neko-market**  | 市场             | Skills/模型/Provider/预设安装目标                                        | 签名、信任、依赖解析         |
| **neko-tools**   | 媒体工具         | Diff、媒体信息、设备视图、JVI/检查工具                                   | Agent QC 工作流联动          |

### 互动引擎创作间

| 包              | 负责什么           | 当前能力                                                            | 关注点                              |
| --------------- | ------------------ | ------------------------------------------------------------------- | ----------------------------------- |
| **neko-model**  | 3D 创作            | Engine-streamed viewport、glTF/GLB/VRM/.nkm、LookDev、灯光、Inspector | 建模/动画流程和 Agent 工具          |
| **neko-sketch** | 2D 绘画            | WebGL2 绘画、笔刷、图层、选区、滤镜、粒子、逐帧时间线               | 共享 UI、资产接地、导出             |
| **neko-puppet** | 2D 骨骼角色        | `.nkp`、MOC3、EngineClient UI、Live2D 兼容                          | 表情/动作市场和 Live 控制           |
| **neko-audio**  | 音频工作站         | `.nka`、DAW UI、波形、Mixer、效果、录音、导出面板                   | mix/export smoke 和 Agent 音频工具  |
| **neko-live**   | 虚拟制片和实时互动 | Live session、device/tracking、fallback preview/recording           | compositor、设备授权 UX、实时可靠性 |

---

## 接下来最重要的五件事，喵！

1. **统一 Agent 能力注册**：每个创作包都用稳定 `AgentCapabilityProvider` 暴露工具。
2. **统一项目图谱**：entity、assets、search、generated assets、Dashboard 收敛到同一份项目语义。
3. **统一互动 runtime**：engine、client、model、puppet、audio、live、preview 共享 session/stream/file-access 契约。
4. **端到端 smoke**：剧本到分镜、生成、剪辑、预览、导出要一口气跑通。
5. **共享 UI 迁移**：`@neko/ui` 接管重复控件，但领域逻辑仍归各包自己。

---

## 快速开始，喵！

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

## 魔法原理

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

关键规矩：

- Webview 不直接碰 Node.js 或 VS Code API。
- Extension Host 负责 VS Code API、文件选择、workspace state、资源 URI。
- Rust 负责重计算、媒体编解码、GPU 渲染和互动 runtime。
- `@neko/shared`、`@neko/proto`、`@neko/neko-client` 负责把跨层契约说清楚。

---

## 支持格式

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

```bash
pnpm build
pnpm test
pnpm check
```

Rust 引擎：

```bash
cd packages/neko-engine
cargo test --workspace
```

本地 CI：

```bash
pnpm ci:local
pnpm ci:local:rust
pnpm ci:local:proto
```

---

## 猫娘的家

```text
neko-suite/
├── packages/
│   ├── neko-engine/       # Rust 引擎工坊
│   ├── neko-agent/        # AI 大脑
│   ├── neko-cut/          # 剪辑室
│   ├── neko-canvas/       # 无限画室
│   ├── neko-story/        # 剧本房
│   ├── neko-preview/      # 小影院
│   ├── neko-assets/       # 素材仓库
│   ├── neko-market/       # 商店街
│   ├── neko-tools/        # 工具箱
│   ├── neko-model/        # 3D 工作台
│   ├── neko-sketch/       # 2D 画板
│   ├── neko-puppet/       # 骨骼角色间
│   ├── neko-audio/        # 录音棚
│   ├── neko-live/         # 虚拟制片棚
│   ├── neko-dashboard/    # 项目大厅
│   ├── neko-entity/       # 角色与实体档案
│   ├── neko-search/       # 搜索索引
│   ├── neko-ui/           # UI 小组件
│   ├── neko-types/        # 共享类型
│   ├── neko-client/       # 引擎通信
│   ├── neko-proto/        # Protobuf 契约
│   ├── neko-auth/         # 认证门禁
│   └── neko-suite/        # Extension Pack
├── docs/
├── ROADMAP.md
├── ARCHITECTURE_CN.md
└── turbo.json
```

---

## 协议

GNU Affero General Public License v3.0 or later — 详情见 [LICENSE](./LICENSE)。

- [Trademark Policy](./TRADEMARK.md)

---

```text
    /\_____/\
   /  ♡   ♡  \
  (  =  ◡  =  )     "感谢主人看到这里～
   )  Neko   (       Neko 还在 Alpha 修炼中，
  (  Suite   )       但已经能陪主人做很多创作了喵！"
 ( (  nya   ) )
(__(__)___(__)__)
```

_认真版请看 [README_CN.md](./README_CN.md)，英文版请看 [README.md](./README.md)。_
