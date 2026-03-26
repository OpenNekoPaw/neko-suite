# Neko Suite Roadmap

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。
> 具体任务清单见 [TODO.md](./TODO.md)。服务端任务在 [neko-hub](../neko-hub) 仓库。

---

## 开发状态总览

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-types** | Alpha | 92% | 共享类型 + 横切关注点统一 + Operations 类型安全 |
| **neko-engine** | Alpha | 90% | GPU 渲染 + 编解码 + 导出 + HTTP/WS + 设备代理 + ONNX ML 推理（macOS CoreML） |
| **neko-cut** | Alpha | 82% | 时间线 + 预览 + 导出预设 + EditOperation 29 操作 |
| **neko-agent** | Alpha | 95% | Agent 引擎 + LLM 平台 + CLI + 媒体工具 + Pipeline + AI 字幕 + 自动配乐；剩余：MCP 重连 |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-preview** | Alpha | 85% | Video/Audio Provider + WebCodecs + Apple Music 风格音频 + UI 现代化 |
| **neko-story** | WIP | 75% | Fountain 解析器 + LSP + 预览 + 时间线生成 + PDF 导出 |
| **neko-assets** | Alpha | 92% | 本地资产管理 + 外部媒体库 + Document + PathVariable 全格式 |
| **neko-market** | Alpha | 97% | **客户端完全完成** ✅（Phase 6.5.1-6.5.6）；Registry Server 在 neko-hub |
| **neko-auth** | Alpha | 80% | OAuth 2.0 + PKCE SSO（auth-core 43 tests + SecretStorage）；后端待接入 |
| **neko-tools** | WIP | 62% | 媒体 Diff + 并行优化 + 协议增强 |
| **neko-canvas** | Alpha | 87% | 无限画布 + 6 种节点 + 分组 + 画板导出 + Port UI + EditOperation |
| **neko-proto** | Stable | 100% | timeline.proto + diff.proto 完整 IDL |
| **neko-model** | Alpha | 65% | Phase 3.1-3.3 ✅（PBR + 粒子 + CSG + 骨骼表情） |
| **neko-sketch** | Alpha | 87% | S.1-S.3 ✅（绘画 + 骨骼动画 + 高级 2D）；S.4 规划中 |
| **neko-audio** | Alpha | 95% | 完整音频工作站 + 12 种效果链 + Engine 麦克风 + 78 测试 |
| **neko-live** | Planned | 5% | 仅扩展入口骨架 |
| **neko-suite** | Stable | 90% | Extension Pack + Release workflow |

---

## Phase 1: 核心剪辑能力 ✅

> 完成时间：2026-03-05

Engine GPU 渲染 + 编解码 + 导出。Cut 时间线 + 预览 + EditOperation。Client 流媒体。Types 50+ 共享类型。

---

## Phase 2: AI 驱动创作 ✅ (~95%)

> 剩余：MCP 客户端重连退避（低优先级）

<details>
<summary>已完成清单</summary>

- Phase 3 架构重构（AgentExecutor 统一循环 + SessionInitializer + IPermissionManager + SkillInjection rollback）
- 媒体工具贯通（GenerateImage/Video/Music/TTS 4 工具）
- AI SDK 迁移（@ai-sdk/openai,google,anthropic v3）
- Pipeline Hook Registry + 分镜→批量视频→时间线（6 种 Flow）
- 对话持久化 CLI `--resume` / `/resume`
- AI 字幕生成（Whisper 时间戳 + TranscribeAudio + NekoCutAPI subtitle）
- 自动配乐（sceneToMusicSkill）
- SSO 接入 + AccountBar + OnboardingFlow
</details>

### 延后项
- MCP 桥接专业软件（Blender / ComfyUI / Photoshop → Phase 3.4）
- SubAgent Skills（Seed_Manager / Audio_Mixer / 镜头语言）
- 智能素材推荐 + 场景描写辅助

---

## Phase 3: 视觉增强 + 3D 能力 (~75%)

### neko-canvas — 待完成
- 大量节点性能优化（按需，当前 DOM/SVG 方案足够）

### neko-model (3D) — 待完成
> [ADR](./docs/architecture/3d-capability-analysis.md)
- Phase 3.1-3.3 ✅（基础 3D + AI 捏脸 + CSG + PBR + 粒子 + 时间线集成）
- Phase 3.2 遗留：AI MCP Tools（face.generate_params / face.from_image / face.adjust）
- Phase 3.4：AI 辅助 3D + 3DGS + MCP 桥接

### neko-sketch (2D) — 待完成
> [ADR](./docs/architecture/2d-capability-analysis.md)
- Phase S.1-S.3 ✅（绘画 + 骨骼动画 + 高级 2D）
- Phase S.4：AI 辅助（sketch.generate + style_transfer + 跨模块集成）

---

## Phase 4: 音频工作站 ✅ (~95%)

neko-audio Phase A-J 全部完成（波形 + 播放 + 频谱 + 效果链 + 麦克风 + AI 降噪 + 导出 + 78 测试）。

---

## Phase 4.5: UI 现代化 ✅ (~95%)

Phase 0-5.6 全部完成（Tailwind + macOS Token + 共享组件 + VSCode 主题 + File Icon Theme）。
> [ADR](./docs/architecture/ui-modernization-design.md)

### 设备代理 ✅
- 麦克风 ✅ | MIDI ✅ | Gamepad ✅ | 摄像头 ⚠️ 框架就绪（capture TODO，neko-live 前置）
> [ADR](./docs/architecture/device-access.md)

---

## Phase 5: 虚拟制片 (~5%)

> 前置：Phase 4 ✅

**可复用基础** (~80%)：VRM 17 表情 + 口型同步（neko-model）、2D 骨骼 ECS 60fps（neko-sketch）、H.264 硬件编码（neko-engine）

**需新建**：VMC 协议（~200 行 TS）+ MediaPipe（~300 行 TS）+ RTMP/SRT 推流（~500 行 Rust）

**里程碑**：
- 5.1：核心追踪（MediaPipe + VMC + VRM 预览）— 3-4 周
- 5.2：录制与输出（标定 + MP4 导出 → neko-cut）— 2-3 周
- 5.3：直播推流（RTMP/SRT → OBS + 2D puppet 联动）— 2-3 周

---

## Phase 6: 资产管理与协作 (客户端 ~90%)

> 服务端（Registry Server / Storage Service）在 [neko-hub](../neko-hub)

### Phase 6.1-6.5.6 ✅ 本地资产 + 市场客户端

<details>
<summary>已完成清单</summary>

- 6.1-6.3.5：本地资产管理核心 + AI 分类 + 跨扩展集成
- 6.4：Document + Ownership + 外部媒体库 + PathVariable 全格式
- 6.5.1：market-core Layer 0（MarketClient + InstallManager + 58 tests）
- 6.5.2：Skill 市场 MVP（安装/热加载/Webview）
- 6.5.3：独立 Marketplace 面板 + CLI TUI
- 6.5.4：多品类 InstallTarget（Shader/Model/Preset，9 种类型）
- 6.5.5：消费端集成（启停 toggle + 热加载 + 64 + 468 tests）
- 6.5.6：neko-agent 消费端打通 + 本地模型部署 Phase M1-M2 ✅
</details>

### Phase 6.6（待开发）：远程存储客户端集成
> 服务端在 [neko-hub](../neko-hub)。[ADR](./docs/architecture/remote-storage.md)
- 6.6.1：`neko://` 协议 + MediaResolver（代理/原始自动切换）+ `AssetFile.proxy` + `IFileTransport`
- 6.6.4：导出优化（预览用代理 720p + 最终导出增量拉取原始文件）

### Phase 6.7（待开发）：项目协作基础设施
- Git LFS 集成 — [ADR](./docs/architecture/project-data-management.md)
- Project Memory ✅ — [ADR](./docs/architecture/project-memory.md)

### 本地模型运行时
> [ADR](./docs/architecture/model-runtime.md)
- Phase M1-M2 ✅（neko-market ModelInstallTarget + neko-engine ONNX 推理 macOS）
- 待做：ONNX 跨平台打包（Win/Linux） · Phase M3 candle SD/SDXL（待评估）

---

## Phase 7: VR/AR 沉浸式创作（远期）

> 前置：Phase 3 + Phase 5

混合策略：VSCode 内编辑/导出 + Electron 外部 App 沉浸式预览 + MCP 桥接 Unity/Unreal。

- 7.1：立体渲染 + XR 端点 — 2-3 周
- 7.2：Electron WebXR App + 手部追踪 — 3-4 周
- 7.3：AR（平面检测 + 光照估计）— 4-6 周
- 7.4：AI 辅助 XR — 后续

---

## Phase 8: 交互视频创作（远期）

> 前置：Phase 1-3

B 站互动视频 / YouTube 交互内容。复用 neko-cut 时间线 + neko-canvas 节点图 + neko-story 剧本。

- 8.1：分支编辑（canvas ChoicePointNode + cut ChoiceMarker）— 2-3 周
- 8.2：交互预览器 — 2-3 周
- 8.3：分支验证 + AI 辅助 — 1-2 周
- 8.4：平台导出（B 站 IVG / YouTube / Web HTML5）— 2-3 周

---

## 贡献指南

- [CLAUDE.md](./CLAUDE.md) - 开发规范和架构指南
- [README.md](./README.md) - 项目概述和快速开始

**优先贡献领域**：neko-engine 渲染优化 · neko-agent Skills 开发 · neko-cut 交互优化 · 测试覆盖

---

*最后更新: 2026-03-26*
