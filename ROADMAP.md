# Neko Suite Roadmap

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。

---

## 开发状态总览

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-types** | Alpha | 90% | 共享类型 + 横切关注点统一 + Operations 类型安全增强（WebviewElement）+ 文档完善 |
| **neko-engine** | Alpha | 80% | GPU 渲染 + 编解码 + FIFO 导出队列 + 统一 HTTP/WS 通信（EngineClient）+ 响度标准化 + 预加载优化（ProbeCache/DecoderPool/EncoderPool） |
| **neko-cut** | Alpha | 82% | 时间线 + 预览 + FIFO 导出队列 + 拖拽竞态修复 + EditOperation 29 操作 + 响度标准化 UI + 导出预设管理 |
| **neko-agent** | Alpha | 75% | Agent 引擎 + LLM 平台 + CLI + UI + Handler 拆分（Phase 1-2 ✅）+ AgentExecutor 流式化（Phase 3 ✅）+ 剧本→时间线 Skill |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-preview** | WIP | 60% | 视频/音频预览 Provider + 播放器 UI |
| **neko-story** | WIP | 75% | Fountain 解析器 + LSP（补全/定义/悬停/符号）+ 预览 + 错误诊断 + 时间线生成 + PDF 导出 |
| **neko-assets** | Alpha | 65% | Phase 1-3 ✅ + Phase 3.5 ✅（外部媒体库 P0/P1：健康检查 + 路径变量 + 媒体库 TreeView），Phase 4-5 待开发 |
| **neko-tools** | WIP | 62% | 媒体 Diff + EngineClient + 并行优化 + 协议增强 + 资产变体对比 + 视频早期预览 |
| **neko-canvas** | WIP | 40% | 节点系统 + 连线 + 视口裁剪 + 画布操作 |
| **neko-proto** | Early | 30% | timeline.proto 定义，生成类型在 neko-types |
| **neko-model** | Planned | 0% | 3D 创作套件（3D 人物/特效/场景/物品），架构设计已完成（见 docs/architecture/3d-capability-analysis.md） |
| **neko-sketch** | Planned | 5% | 2D 创作套件（绘画/2D 人物/特效/场景/物品），架构设计已完成（见 docs/architecture/2d-capability-analysis.md） |
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

## Phase 1: 核心剪辑能力 ✅ (已完成归档)

> 完成时间：2026-03-05 | 详细任务列表：[docs/archive/phase1-completed.md](./docs/archive/phase1-completed.md)

| 模块 | 关键交付 |
|------|----------|
| **neko-engine** | GPU 渲染管线 + 全格式编解码（ProRes/AVI/TS）+ FIFO 导出队列 + 统一 HTTP/WS + 预加载优化 + 音量标准化 |
| **neko-cut** | 时间线 + 多分辨率预览 + 导出预设 + EditOperation（29 op）+ 色彩/特效/字幕/形状 + 中英双语 |
| **neko-client** | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-types** | 50+ 共享类型 + 三层横切关注点（Logger/i18n/Theme/Error）+ Operations 类型安全 + 文档完善 |

---

## Phase 2: AI 驱动创作 (Current)

> 目标：实现 AI Agent 驱动的智能剪辑 — **进度 ~70%**

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
- [x] ChatViewProvider Handler 拆分（Phase 1-2）
  - [x] 10 个独立 Handler + 2 个 Message 处理器
  - [x] ChatViewProvider 1,885→734 行（-61%），MessageHandler 1,153→466 行（-60%）
- [x] AgentExecutor 流式化（Phase 3）
  - [x] `thinkStream()` + `content_delta`/`text_delta` 全链路逐 token 输出
- [ ] Handler 单元测试 + 可选优化（Phase 4-5）
  - [ ] 10 handler + 2 processor 单元测试
  - [ ] 可选：会话操作提取 + deps 类型安全
- [ ] 时间线操作 Skills
  - [x] 基础时间线查询
  - [ ] 批量操作支持
  - [ ] 智能素材推荐
- [ ] 创作辅助 Skills
  - [x] 剧本解析 → 时间线（Fountain → ProjectData JSON 语义 Skill）
  - [ ] 自动配乐
  - [ ] AI 字幕生成
  - [ ] 画面描述
- [ ] AI 视频一体化工作流
  - [x] MediaGenerationService（Text-to-Video / Image-to-Video / Video-to-Video）
  - [x] 8 个 MediaAdapter（Runway/Luma/Vidu/MiniMax/OpenAI/Midjourney/Liblib/Suno）
  - [x] 智能路由（成本/速度/质量偏好）+ 任务管理 + 进度跟踪
  - [ ] 分镜 → 批量视频生成（剧本解析 → 逐段调用 GenerateVideo → 自动排列到时间线）
  - [ ] 关键帧驱动生成（neko-sketch/neko-model 导出帧 → Image-to-Video）
  - [ ] AI 视频结果自动入时间线（GenerateVideo → AddTimelineElement）
- [ ] MCP 桥接专业软件
  - [ ] Blender MCP Server 集成（复杂 3D 建模/动画 → glTF 导入）
  - [ ] ComfyUI MCP Server 集成（ControlNet + 高级 AI 图像 pipeline）
  - [ ] Photoshop MCP 集成（专业图像处理）
  - [ ] 统一 MCP Tool 注册（MCPManager 管理外部软件 Server）

### neko-story (剧本编辑器)

架构：4 个子包（types / parser / extension / webview）

- [x] Fountain 格式类型定义
- [x] Fountain 解析器（含测试）
- [x] LSP 服务
  - [x] 语法高亮 + 自动补全
  - [x] 定义跳转 + 悬停提示
  - [x] 文档符号 + 工作区符号
  - [x] 文档链接
  - [x] 错误诊断
- [x] Webview 剧本渲染器
- [x] 时间线生成
- [x] 导出 PDF

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
  - [ ] native-scene crate 骨架 + glTF/VRM 加载器
  - [ ] @neko/scene-view 共享 R3F 视口组件
  - [ ] neko-model 扩展骨架 + Gizmo 交互
  - [ ] ActionRouter 新增 scenes/meshes/materials 路由
  - [ ] 骨骼动画基础（glTF Skeleton + AnimationMixer 播放）
  - [ ] Morph Target 系统（glTF morph targets 加载 + GPU 顶点变形）
- [ ] Phase 3.2：AI 捏脸 + 基础建模
  - [ ] 参数化面部编辑器（R3F 视口 + 分类滑块面板 UI）
  - [ ] Morph Target 驱动捏脸（50+ Blend Shapes：脸型/眼睛/鼻子/嘴巴/下巴）
  - [ ] 骨骼驱动表情（表情骨骼控制口型/眼球/眉毛）
  - [ ] VRM 表情预设支持（@pixiv/three-vrm，52 个标准表情）
  - [ ] AI 捏脸 MCP Tools（face.generate_params / face.from_image / face.adjust）
  - [ ] CSG 布尔运算 + 3D 文字挤出（cosmic-text）
  - [ ] 参数化几何体 + 延迟实测
- [ ] Phase 3.3：轻量渲染 + 场景组装 + 时间线集成
  - [ ] 轻量 PBR 渲染器（metallic-roughness + IBL）
  - [ ] native-scene 骨骼蒙皮渲染（wgpu compute shader + 动画插值）
  - [ ] 场景组装（glTF/VRM 导入 + 摆放 + 环境 HDR + 天空盒 + 场景模板）
  - [ ] 特效系统（GPU 粒子 + 后处理链 + 自定义 WGSL shader 特效）
  - [ ] SceneRenderOutput → GpuLayer 集成
  - [ ] neko-cut 时间线嵌入 3D 元素（Scene3D ElementType + 角色动画序列）
  - [ ] neko-canvas 画布嵌入 3D 预览
- [ ] Phase 3.4：AI 辅助 3D + 3DGS + MCP 桥接
  - [ ] MCP Tools（scene.suggest_layout / material.suggest / mesh.generate）
  - [ ] AI 动画生成（文本描述 → 关键帧序列）
  - [ ] Text-to-3D 集成（外部 API → glTF 导入：角色/道具/场景元素生成）
  - [ ] Image-to-3D（单图/多图 → 3D 重建 → glTF 导入）
  - [ ] 3D Gaussian Splatting（.ply/.splat 加载 + wgpu 渲染 + 场景捕捉重建）
  - [ ] Blender MCP Server 集成（复杂建模/修改器/UV/高级动画）
  - [ ] ComfyUI MCP Server 集成（ControlNet + 高级 AI 图像 pipeline）
  - [ ] 面部直接拖拽编辑（Raycasting → Blend Shape 映射）
  - [ ] neko-live 联动准备（面部追踪 → 骨骼映射接口）

2D↔3D 联动接口（已设计）：
- 3D→2D：SceneRenderOutput（color/depth/mask/normal texture）→ GpuLayer
- 2D→3D：SceneExternalTextures（video/image texture）→ 3D material

### neko-sketch (2D 创作套件)

> 架构设计见 [docs/architecture/2d-capability-analysis.md](./docs/architecture/2d-capability-analysis.md)

定位：neko-sketch（2D 创作）↔ neko-model（3D 创作）对称

- [ ] Phase S.1：绘画基础
  - [ ] 画笔/橡皮 + 形状工具（Canvas 2D / WebGL 2D）
  - [ ] 压感支持（Pointer Events API）
  - [ ] 图层系统 + 混合模式（25+ Photoshop 兼容）
  - [ ] 选区 + 变换（平移/旋转/缩放/翻转）
- [ ] Phase S.2：2D 人物 + 骨骼动画
  - [ ] Spine 骨骼动画集成（spine-ts 运行时 + 编辑器 UI）
  - [ ] Live2D 集成（Cubism SDK Web + 模型加载/参数控制）
  - [ ] 逐帧动画编辑器（洋葱皮 + 帧管理）
  - [ ] 2D 角色 AI 生成（Text-to-Image → 自动分层 → 骨骼绑定辅助）
- [ ] Phase S.3：2D 特效 + 场景 + 物品
  - [ ] 2D 粒子特效（平面粒子：火花/雨雪/飘落/魔法）
  - [ ] 2D 滤镜/后处理（模糊/发光/色彩/扭曲，复用 WGSL shader）
  - [ ] 序列帧特效编辑（sprite sheet 编辑 + 导出）
  - [ ] 2D 场景编辑（多图层叠加 + 视差滚动 + 场景模板）
  - [ ] 2D 物品/资产绘制（矢量 + 像素 → 导出 PNG/SVG/PSD）
- [ ] Phase S.4：AI 辅助 + 跨模块集成
  - [ ] AI MCP Tools（sketch.generate / sketch.style_transfer / sketch.auto_layer）
  - [ ] 导出到 neko-cut 时间线（2D 动画序列 → 时间线元素）
  - [ ] 导出到 neko-canvas 画布（2D 资产 → 画布节点）
  - [ ] 2D → 3D 联动（2D 纹理 → neko-model 材质贴图）

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

## Phase 6: 资产管理与协作

> 目标：实现统一资产管理、AI 模型资产化、社区分发 — **进度 ~55%**
>
> 详见 [资产管理统一架构设计](./docs/architecture/asset-management-design.md)

### neko-assets (资产管理)

#### Phase 1-3 ✅ 已完成（2026-02-26）

- [x] 统一核心 + 消除重复（Phase 1）
  - [x] 统一媒体类型检测（5 处重复 → `@neko/shared` `media.ts` 唯一实现）
  - [x] 统一 MIME 映射（3 处重复 → `getMimeType()` 唯一实现）
  - [x] EngineMetadataExtractor 接入 `neko.engine.probeInternal`
  - [x] AssetLibrary 完整初始化（JsonFileStorage + RuleClassifier + MetadataExtractor）
  - [x] AssetFileDecorationProvider（Explorer badge + tooltip）
  - [x] 统一右键菜单（添加到时间线/画布/导入/预览）
- [x] 深度集成 + 拖拽协议（Phase 2）
  - [x] VscodeGitService 接入 VS Code Git Extension API
  - [x] AssetDiffService 完善（statFile 注入 + 变更分析）
  - [x] neko-cut AssetService 瘦身（660 → 445 行，diff/metadata 委托）
  - [x] neko-canvas 重写为委托 neko-assets（统一 AssetEntity 模型）
  - [x] AssetDragData 统一拖拽协议（`@neko/shared` `drag.ts`）
  - [x] Activity Bar Views（AssetManagerTreeProvider + AssetHistoryTreeProvider）
- [x] 统一注册表 + 缩略图 + Diff 接入（Phase 3）
  - [x] AssetManifest 类型定义（14 种资产类型 + 4 种来源 + 特化 Metadata）
  - [x] ThumbnailService + thumbnailPath 关联 variant + importFile 自动生成
  - [x] neko-tools 集成（initializeMediaDiff + initializeAssetDiff）
  - [x] EngineMediaService 委托 neko-engine（probeMedia/extractFrame/decodeAudio）
  - [x] AssetRegistry Facade（IAssetRegistry + IAssetHandler + entityToManifest 桥接）

#### Phase 4：AI 模型资产化 + Handler 实现（待开发）

> 前置条件：Phase 3 ✅ + neko-agent AI 分类能力成熟

- [ ] Handler 实现
  - [ ] ShaderAssetHandler（编译验证 + 预览 + 热重载）
  - [ ] PresetAssetHandler（LUT / 转场预设 / 导出预设）
  - [ ] ModelAssetHandler（下载 + 校验 + 量化选择）
- [ ] AI 模型存储策略（懒加载 + 缓存 + 磁盘空间管理）
- [ ] AI 生成结果自动入库（Agent 生成 → AssetRegistry.register → 分类 + 元数据 + 缩略图）
- [ ] IAIAnalysisService 实现（接入 neko-agent AI 分类能力）
- [ ] FFmpegService 完整实现（bundled FFmpeg 或 neko-engine native module）
- [ ] extension.ts 升级为 AssetRegistry 作为顶层 Facade

#### Phase 5：社区分发（待开发）

> 前置条件：Phase 4 完成 + 多种资产类型 Handler 已验证

- [ ] `.neko` 包格式定义（manifest + content）
- [ ] 远程注册表（类似 npm registry）
- [ ] push / pull / search / install CLI
- [ ] 私有化部署支持
- [ ] 依赖解析（Shader 依赖 common.wgsl 等）
- [ ] 声明与实体分离落地（project.json / lock.json / .installed/）
- [ ] Cloud Sync View（`neko.cloudSync`）实现
- [ ] CI/CD 自动渲染集成

### neko-tools (媒体工具)

- [x] 媒体 Diff
  - [x] 图片 Diff
  - [x] 视频 Diff
  - [x] 音频 Diff
  - [x] GitMediaService
- [x] Diff 并行优化（SSIM‖PSNR 并行 + 早期波形 + 前端去阻塞）
- [x] Diff 协议增强（fetchState 协议 + Git fetch 阻塞播放修复 + MessageHandler 重构）
- [x] 资产变体对比（asset-diff，委托 neko-assets）
- [x] EngineClient 迁移（统一 HTTP 通信）
- [x] Diff 前端可视化增强（Phase 2B）+ 视频早期预览
- [ ] 批量处理

---

## 里程碑计划

### M1: 基础剪辑闭环 ✅
- neko-engine GPU 渲染 + 编解码稳定 + 统一 HTTP/WS 通信 + FIFO 导出队列 + 预加载优化 ✅
- neko-cut 时间线 + 预览 + 多分辨率切换 + 导出队列 + 导出预设 + 拖拽竞态修复 + EditOperation + Proto 对齐 ✅
- neko-client 流媒体播放 + EngineClient ✅
- neko-types 全域类型 + 横切关注点统一 + Operations 类型安全 ✅

### M2: AI 集成
- neko-agent 时间线操作 Skills 完成
- 剧本 → 时间线自动生成
- AI 字幕 + 配乐辅助

### M3: 视觉增强 + 2D/3D 创作 + AI 视频工作流
- neko-model 轻量 3D（场景组装 + AI 捏脸 + 骨骼动画 + 特效 + Text-to-3D/3DGS）
- neko-sketch 轻量 2D（绘画 + Spine/Live2D + 2D 特效/场景 + AI 辅助）
- MCP 桥接专业软件（Blender MCP + ComfyUI MCP）
- AI 视频一体化工作流（剧本 → 关键帧 → AI 生成 → 时间线编辑 → 导出）
- neko-canvas WebGPU 渲染 + 特效/转场系统

### M4: 音频完善
- neko-audio 波形编辑 + 音频效果
- 录音功能

### M5: 虚拟制片
- neko-live 动捕 + 虚拟形象 + 直播

### M6: 资产管理与协作
- neko-assets Phase 4：AI 模型资产化（Handler 实现 + 自动入库 + IAIAnalysisService）
- neko-assets Phase 5：社区分发（.neko 包格式 + 远程注册表 + CLI + Cloud Sync）
- CI/CD 自动渲染流水线

---

## 技术债务

### 高优先级
- [x] 统一错误处理机制 ✅ 框架已建立（BaseError + PlatformError + 各包 Error 体系）
- [ ] 性能监控和优化（neko-engine telemetry 已有基础）
- [ ] 单元测试覆盖率提升（neko-agent 47 个测试最好，其他包偏少）

### 中优先级
- [x] 规范化 git commit message ✅ Husky + commitlint 已配置
- [ ] 类型定义文档（JSDoc 覆盖率低）
- [ ] neko-types 83 个 `as any` 需替换为判别联合

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

*最后更新: 2026-03-09*
