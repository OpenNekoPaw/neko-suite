# Neko Suite Roadmap

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。

---

## 开发状态总览

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-types** | Alpha | 80% | 102 个 TS 文件，覆盖全域类型 + 操作系统 |
| **neko-engine** | Alpha | 70% | 164 个 Rust 文件，GPU 渲染 + 编解码 + 导出已可运行 |
| **neko-cut** | Alpha | 65% | 200 个 TS/TSX 文件，时间线 + 预览 + 导出 + 色彩校正 |
| **neko-agent** | Alpha | 70% | 418 个 TS/TSX 文件，Agent 引擎 + LLM 平台 + CLI + UI |
| **neko-client** | Alpha | 75% | H264/fMP4/PCM 流客户端，帧调度 + 性能监控 |
| **neko-preview** | WIP | 60% | 视频/音频预览 Provider + 播放器 UI |
| **neko-story** | WIP | 55% | Fountain 解析器 + LSP（补全/定义/悬停/符号）+ 预览 |
| **neko-assets** | WIP | 55% | AssetLibrary + 实体/文件/变体服务 + 规则分类器 |
| **neko-tools** | WIP | 50% | 媒体 Diff（视频/音频/图片）+ Git 媒体服务 |
| **neko-canvas** | WIP | 40% | 节点系统 + 连线 + 视口裁剪 + 画布操作，仍在规划 |
| **neko-proto** | Early | 30% | timeline.proto 定义，生成类型在 neko-types |
| **neko-model** | Planned | 0% | 3D 编辑器，架构设计已完成（见 docs/architecture/3d-capability-analysis.md） |
| **neko-sketch** | Planned | 5% | 仅扩展入口骨架 |
| **neko-audio** | Planned | 5% | 仅扩展入口骨架 |
| **neko-live** | Planned | 5% | 仅扩展入口骨架 |
| **neko-suite** | Stable | 90% | Extension Pack 门户，纯配置包 |

**状态说明**：
- `Stable` - 功能稳定，可用于生产
- `Alpha` - 核心功能可用，快速迭代中
- `WIP` - 开发进行中，部分功能可用
- `Early` - 早期阶段，基础框架
- `Planned` - 已规划，待开发

---

## Phase 1: 核心剪辑能力 (Current)

> 目标：实现基础视频剪辑闭环 — **进度 ~70%**

### neko-engine (媒体引擎 Sidecar)

架构：5 个 Rust crate（native-core / native-api / native-http / native-napi / native-cli）+ TS extension

- [x] GPU 渲染管线
  - [x] wgpu compositor + texture 管理
  - [x] blend modes（12 个 WGSL shader）
  - [x] color correction + transitions
  - [x] custom shader processor
  - [ ] WebGPU 实时预览优化
- [x] 编解码服务4
  - [x] 视频解码（含硬件加速、IDR scanner、decoder pool）
  - [x] 视频编码（含硬件加速、muxer、iframe）
  - [x] ffmpeg parser + media probe
  - [ ] 更多编码格式支持
- [x] 导出管线
  - [x] GPU 导出 pipeline
  - [x] audio mixer
  - [x] 导出服务（TS 侧 ExportService）
  - [ ] 后台导出队列
- [x] 关键帧缓存服务
- [x] 动画系统（keyframe / easing / interpolate）
- [x] 媒体服务（video/audio/image/subtitle diff）
- [x] HTTP API 路由层（video/audio/timeline/effects/stream/task controllers）
- [x] .jvi 项目格式 loader/converter
- [x] 遥测（metrics / spans）
- [ ] 预加载优化
- [ ] 音量标准化

### neko-cut (视频剪辑器)

架构：extension + webview（React + Zustand + Tailwind）

- [x] 时间线轨道系统
  - [x] 多轨道支持（视频/音频/文字）
  - [x] 元素拖拽、缩放、分割
  - [x] 轨道锁定/静音/隐藏
  - [x] 撤销/重做历史（13 个 store slices）
  - [x] Minimap 导航
  - [x] 键盘快捷键 + 右键菜单
- [x] 预览系统
  - [x] 实时预览播放
  - [x] 帧精确定位
  - [x] 缩放/平移控制
  - [x] PreviewModeController
  - [ ] 多分辨率预览切换
- [x] 媒体导入
  - [x] 视频/音频/图片导入
  - [x] 缩略图生成（ThumbnailService）
  - [x] 波形可视化
  - [x] MediaDiff 查看器
  - [ ] 拖拽导入优化
- [x] 色彩校正
  - [x] BasicAdjustments
  - [x] ColorWheels
  - [x] Curves
- [x] 特效与转场
  - [x] Effects 面板
  - [x] TransitionPicker
  - [x] Mask 蒙版
- [x] 字幕编辑（Subtitles 组件）
- [x] 速度控制（SpeedControl）
- [x] 形状渲染 + 钢笔工具（ShapeRenderer / PenToolEditor）
- [x] 导出功能
  - [x] MP4/WebM 导出
  - [x] 分辨率/码率设置
  - [ ] 导出预设管理
- [x] 国际化（中英双语）

### neko-client (流媒体客户端)

- [x] H264StreamClient
- [x] FMP4StreamClient
- [x] AudioStreamClient
- [x] FrameScheduler
- [x] PlaybackPerformanceMonitor
- [x] 能力检测（detectCapabilities）

### neko-types (共享类型层)

- [x] 全域类型定义（timeline/track/element/keyframe/effects/animation/agent/skill/task/mcp/canvas）
- [x] 操作系统（apply/invert/helpers，支持撤销重做）
- [x] 配置读取/适配/规范化
- [x] VSCode API 代理类型
- [x] 并发池工具
- [x] Proto 生成类型（timeline.engine.ts）
- [ ] 类型文档完善

---

## Phase 2: AI 驱动创作 (Active)

> 目标：实现 AI Agent 驱动的智能剪辑 — **进度 ~65%**

### neko-agent (AI Agent)

架构：5 个子包（agent / platform / assistant / extension / agent-cli）

- [x] Agent 核心引擎
  - [x] Agent 执行器（executor）
  - [x] AgentSession（含 context compression）
  - [x] 上下文管理（context）
  - [x] 记忆系统（memory）
  - [x] MCP 协议集成
  - [x] Skill 系统 + builtins
  - [x] 子 Agent（subagent）
  - [x] 任务管理（task）
  - [x] AOP 钩子（hooks）
  - [x] 验证系统（checkers/extractors/validators）
  - [x] SystemPromptBuilder
  - [x] InputProcessor（文件引用解析）
  - [x] 工具确认权限（permission）
- [x] LLM 平台层
  - [x] Claude/OpenAI adapter + routing strategies
  - [x] 媒体处理 adapters + routing
  - [x] Provider 管理
  - [x] 工作流（workflow）
  - [x] 任务调度
  - [x] 中英双语预设
- [x] Assistant UI（React）
  - [x] ChatView（InputArea/MediaPreview/MessageContent）
  - [x] AgentControlCenter
  - [x] AgentsPanel + SettingsView
  - [x] 国际化（中英双语）
- [x] Agent CLI
  - [x] 交互式 CLI（/plan /auto /ask /clear /compact）
  - [x] MCP 集成 + 文件引用处理
- [ ] 时间线操作 Skills
  - [x] 基础时间线查询
  - [ ] 批量操作支持
  - [ ] 智能素材推荐
- [ ] 创作辅助 Skills
  - [ ] 剧本解析 → 时间线
  - [ ] 自动配乐
  - [ ] AI 字幕生成
  - [ ] 画面描述

### neko-story (剧本编辑器)

架构：4 个子包（types / parser / extension / webview）

- [x] Fountain 格式类型定义
- [x] Fountain 解析器（含测试）
- [x] LSP 服务
  - [x] 语法高亮 + 自动补全
  - [x] 定义跳转 + 悬停提示
  - [x] 文档符号 + 工作区符号
  - [x] 文档链接
  - [ ] 错误诊断
- [x] Webview 剧本渲染器
- [ ] 时间线生成
- [ ] 导出 PDF

---

## Phase 3: 视觉增强 + 3D 能力

> 目标：实现专业级视觉效果和 3D 场景编辑 — **进度 ~25%**

### neko-canvas (无限画布)

架构：extension + webview，有 PLAN.md 和 FEATURE_INVENTORY.md

- [x] 节点系统
  - [x] BaseNode / MediaNode / TextNode
  - [x] AnnotationNode / ArtboardNode / StoryboardNode
  - [x] 节点连线系统（connections）
- [x] 画布交互
  - [x] 节点拖拽 + 缩放
  - [x] 视口变换 + 视口裁剪
  - [x] 吸附引擎（snapEngine）
  - [x] LayerPanel / MiniMap / ZoomControls
- [x] 媒体内嵌
  - [x] ImageViewer + InlineMediaPlayer
- [x] 状态管理
  - [x] canvasStore / clipboardStore / historyStore
- [ ] WebGPU 渲染
- [ ] 特效系统
- [ ] 自定义转场

### neko-model (3D 编辑器) — Planned

> 架构设计已完成，详见 [docs/architecture/3d-capability-analysis.md](./docs/architecture/3d-capability-analysis.md)

架构决策：
- 集成到 neko-engine workspace，新建 `native-scene` Rust crate（共享 `Arc<GpuContext>` 零拷贝）
- 前端使用 React Three Fiber (R3F) 交互视口
- 轻量 ECS（hecs）+ rapier3d 物理 + 索引层级树
- 不使用 Bevy（wgpu 版本冲突 + 架构范式冲突）

渲染策略（三方案按需切换）：
- 方案 A：H.264 流预览（~10-18ms 延迟，已有 PreviewPipeline 基础）
- 方案 B：JPEG 单帧模式（~5-8ms，编辑中参数调整）
- 方案 C：R3F 本地双渲染（< 1ms，Gizmo 拖拽交互）

已有 GPU shader 资产可复用：
- 12 个 WGSL shader（blend_modes / color_correction / effects / transitions / easing / 6 preset 特效）
- 26 个 GPU 模块 .rs 文件（compositor / texture / blur / style / text_renderer / custom_shader 等）

实施路线：
- [ ] Phase 3.1：基础 3D 视口 + 场景组装
  - [ ] native-scene crate 骨架 + glTF 加载器
  - [ ] @neko/scene-view 共享 R3F 视口组件
  - [ ] neko-model 扩展骨架 + Gizmo 交互
  - [ ] ActionRouter 新增 scenes/meshes/materials 路由
- [ ] Phase 3.2：基础建模 + 延迟验证
  - [ ] CSG 布尔运算 + 3D 文字挤出（cosmic-text）
  - [ ] 参数化几何体 + 延迟实测
- [ ] Phase 3.3：PBR 渲染 + 时间线集成
  - [ ] PBR 渲染器（metallic-roughness + IBL + Shadow Map）
  - [ ] SceneRenderOutput → GpuLayer 集成
  - [ ] neko-cut 时间线嵌入 3D 元素（Scene3D ElementType）
  - [ ] neko-canvas 画布嵌入 3D 预览
- [ ] Phase 3.4：AI 辅助 3D
  - [ ] MCP Tools（scene.suggest_layout / material.suggest / mesh.generate）
  - [ ] 修改器系统 + GPU 粒子系统

2D↔3D 联动接口（已设计）：
- 3D→2D：SceneRenderOutput（color/depth/mask/normal texture）→ GpuLayer
- 2D→3D：SceneExternalTextures（video/image texture）→ 3D material

### neko-sketch (绘图工具)

- [ ] 画笔/橡皮 + 形状工具
- [ ] 压感支持
- [ ] 图层系统 + 混合模式

---

## Phase 4: 音频工作站

> 目标：实现专业音频编辑能力 — **进度 ~15%**

### neko-preview (媒体预览)

- [x] VideoPreviewProvider + AudioPreviewProvider
- [x] PreviewService + StatusBarManager
- [x] VideoPlayer + VideoControls
- [x] AudioPlayer + AudioControls + WaveformCanvas
- [ ] 多格式预览支持

### neko-audio (音频工作站)

- [ ] 波形编辑（多轨/精确剪辑/淡入淡出）
- [ ] 音频效果（均衡器/压缩器/降噪）
- [ ] 录音功能（麦克风/实时监听/多轨录音）

---

## Phase 5: 虚拟制片

> 目标：实现虚拟直播和动捕能力 — **进度 ~0%**

### neko-live (虚拟直播)

- [ ] 动作捕捉（面部追踪/手势识别/全身动捕）
- [ ] 虚拟形象（VRM 模型/表情映射/实时渲染）
- [ ] 直播集成（OBS/虚拟摄像头/场景切换）

---

## Phase 6: 资产与协作

> 目标：实现团队协作和资产管理 — **进度 ~40%**

### neko-assets (资产管理)

- [x] AssetLibrary 核心
  - [x] EntityService / FileService / VariantService
  - [x] AssetDiffService
  - [x] RuleClassifier
  - [x] InMemoryStorage / JsonFileStorage
- [ ] Git 集成 + LFS 支持
- [ ] 云端同步
- [ ] CI/CD 自动渲染

### neko-tools (媒体工具)

- [x] 媒体 Diff
  - [x] 图片 Diff
  - [x] 视频 Diff
  - [x] 音频 Diff
  - [x] GitMediaService
- [x] 资产变体对比（asset-diff）
- [ ] 批量处理

---

## 里程碑计划

### M1: 基础剪辑闭环 (Current)
- neko-engine GPU 渲染 + 编解码稳定
- neko-cut 时间线 + 预览 + 导出完整
- neko-client 流媒体播放稳定
- neko-types 全域类型覆盖

### M2: AI 集成
- neko-agent 时间线操作 Skills 完成
- 剧本 → 时间线自动生成
- AI 字幕 + 配乐辅助

### M3: 视觉增强
- neko-canvas WebGPU 渲染
- 特效/转场系统完成
- neko-sketch 基础绘图

### M4: 音频完善
- neko-audio 波形编辑 + 音频效果
- 录音功能

### M5: 虚拟制片
- neko-live 动捕 + 虚拟形象 + 直播

### M6: 协作发布
- neko-assets Git/LFS + 云端同步
- CI/CD 流水线

---

## 技术债务

### 高优先级
- [ ] 统一错误处理机制
- [ ] 性能监控和优化（neko-engine telemetry 已有基础）
- [ ] 单元测试覆盖率提升（neko-agent 47 个测试最好，其他包偏少）

### 中优先级
- [ ] 文档完善（docs/ 已有 engine/shaders/timeline-alignment/editoperation/architecture）
- [ ] 规范化 git commit message
- [ ] 类型定义文档

### 低优先级
- [ ] 国际化扩展（neko-cut/neko-agent 已有中英双语）
- [ ] 主题定制
- [ ] 插件系统

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

*最后更新: 2026-02-25*
