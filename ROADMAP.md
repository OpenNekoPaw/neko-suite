# Neko Suite Roadmap

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。
>
> 具体任务清单见 [TODO.md](./TODO.md)。

---

## 开发状态总览

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-types** | Alpha | 90% | 共享类型 + 横切关注点统一 + Operations 类型安全 + 文档完善 |
| **neko-engine** | Alpha | 80% | GPU 渲染 + 编解码 + FIFO 导出 + 统一 HTTP/WS + 响度标准化 + 预加载优化 |
| **neko-cut** | Alpha | 82% | 时间线 + 预览 + 导出预设 + EditOperation 29 操作 + 拖拽修复 |
| **neko-agent** | Alpha | 75% | Agent 引擎 + LLM 平台 + CLI + UI + Handler 拆分 + 流式化 + 剧本→时间线 |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-preview** | WIP | 60% | 视频/音频预览 Provider + 播放器 UI |
| **neko-story** | WIP | 75% | Fountain 解析器 + LSP + 预览 + 错误诊断 + 时间线生成 + PDF 导出 |
| **neko-assets** | Alpha | 65% | Phase 1-3 ✅ + 外部媒体库 P0/P1 ✅，Phase 4-5 待开发 |
| **neko-tools** | WIP | 62% | 媒体 Diff + 并行优化 + 协议增强 + 资产变体对比 |
| **neko-canvas** | WIP | 40% | 节点系统 + 连线 + 视口裁剪 + Undo/Redo + Copy/Paste |
| **neko-proto** | Early | 30% | timeline.proto 定义，生成类型在 neko-types |
| **neko-model** | Early | 30% | 3D 创作套件，Phase 3.1 基础能力已实现（R3F 视口 + native-scene ECS + glTF loader） |
| **neko-sketch** | Planned | 5% | 2D 创作套件，架构设计已完成 |
| **neko-audio** | Planned | 5% | 仅扩展入口骨架 |
| **neko-live** | Planned | 5% | 仅扩展入口骨架 |
| **neko-suite** | Stable | 90% | Extension Pack 门户 |

**状态说明**：Stable（生产可用）| Alpha（核心可用，迭代中）| WIP（部分功能可用）| Early（基础框架）| Planned（待开发）

---

## Phase 1: 核心剪辑能力 ✅

> 完成时间：2026-03-05

neko-engine GPU 渲染管线 + 全格式编解码 + FIFO 导出 + 统一 HTTP/WS + 预加载优化 + 音量标准化。neko-cut 时间线 + 多分辨率预览 + 导出预设 + EditOperation 29 op + 特效/字幕/形状。neko-client H264/fMP4/PCM 流 + EngineClient。neko-types 50+ 共享类型 + 三层横切关注点。

---

## Phase 2: AI 驱动创作 (Current)

> 目标：AI Agent 驱动的智能剪辑 — **进度 ~70%**

### neko-agent — 已完成
- Agent 核心引擎（executor/session/context/memory/MCP/Skill/hooks/permission）
- LLM 平台层（Claude/OpenAI adapter + routing + workflow + 中英双语预设）
- Assistant UI（ChatView + AgentControlCenter + SettingsView + i18n）
- Agent CLI（交互式 + MCP + 文件引用）
- ChatViewProvider Handler 拆分（-61%）+ AgentExecutor 流式化
- AI 视频生成（MediaGenerationService + 8 MediaAdapter + 智能路由）

### neko-agent — 待完成
- 批量时间线操作 Skill
- AI 字幕生成 / 自动配乐 / 画面描述
- 分镜→批量视频生成 → 自动排列到时间线
- MCP 桥接专业软件（Blender / ComfyUI / Photoshop）

### neko-story ✅
- Fountain 解析器 + LSP（补全/定义/悬停/符号/诊断）+ Webview 渲染 + 时间线生成 + PDF 导出

---

## Phase 3: 视觉增强 + 3D 能力

> 目标：专业视觉效果和 3D 场景编辑 — **进度 ~35%**

### neko-canvas — 已完成
- 节点系统（6 种节点 + 连线）+ 画布交互（拖拽/缩放/吸附/MiniMap）+ 媒体内嵌 + Undo/Redo + Copy/Paste

### neko-canvas — 待完成
- WebGPU 渲染 + 特效系统 + 自定义转场 + 导出

### neko-model (3D) — Early

> 架构设计见 [docs/architecture/3d-capability-analysis.md](./docs/architecture/3d-capability-analysis.md)

- Phase 3.1 ✅：基础 3D 视口 + 场景组装（native-scene bevy_ecs + glTF/VRM + R3F + 骨骼动画 + SceneTree + TransformGizmo + EngineClient 集成）
- Phase 3.2：AI 捏脸 + 基础建模（Morph Target + VRM 表情 + CSG）
- Phase 3.3：轻量渲染 + 时间线集成（PBR + 粒子 + SceneRenderOutput → GpuLayer）
- Phase 3.4：AI 辅助 3D + 3DGS + MCP 桥接（Text-to-3D + Image-to-3D + Blender MCP）

### neko-sketch (2D) — Planned

> 架构设计见 [docs/architecture/2d-capability-analysis.md](./docs/architecture/2d-capability-analysis.md)

- Phase S.1：绘画基础（画笔/压感/图层/选区）
- Phase S.2：2D 人物 + 骨骼动画（Spine + Live2D + 逐帧动画）
- Phase S.3：2D 特效 + 场景 + 物品
- Phase S.4：AI 辅助 + 跨模块集成

---

## Phase 4: 音频工作站

> 目标：专业音频编辑 — **进度 ~15%**

- neko-preview：VideoPreviewProvider + AudioPreviewProvider ✅，多格式预览待完成
- neko-audio：波形编辑 + 音频效果（均衡器/压缩/降噪）+ 录音

---

## Phase 5: 虚拟制片

> 目标：虚拟直播和动捕 — **进度 ~0%**

- neko-live：动作捕捉 + 虚拟形象（VRM）+ 直播集成（OBS/虚拟摄像头）

---

## Phase 6: 资产管理与协作

> 目标：统一资产管理 + AI 模型资产化 + 社区分发 — **进度 ~55%**

- Phase 1-3 ✅：统一核心 + 深度集成 + 注册表 + 缩略图
- Phase 3.5 ✅：外部媒体库（健康检查 + 路径变量 + TreeView）
- Phase 4（待开发）：Handler 实现（Shader/Preset/Model）+ AI 模型资产化 + IAIAnalysisService
- Phase 5（待开发）：社区分发（`.neko` 包格式 + 远程注册表 + CLI）

---

## 贡献指南

欢迎参与 Neko Suite 的开发！请查看以下资源：

- [CLAUDE.md](./CLAUDE.md) - 开发规范和架构指南
- [README.md](./README.md) - 项目概述和快速开始

### 优先贡献领域

1. **neko-engine** - GPU 渲染优化、编解码性能
2. **neko-agent** - 时间线操作 Skills 开发
3. **neko-cut** - 时间线交互优化、导出增强
4. **测试** - 单元测试和集成测试覆盖

---

*最后更新: 2026-03-12*
