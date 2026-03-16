# Neko Suite Roadmap

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。
>
> 具体任务清单见 [TODO.md](./TODO.md)。

---

## 开发状态总览

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-types** | Alpha | 90% | 共享类型 + 横切关注点统一 + Operations 类型安全 + 文档完善 |
| **neko-engine** | Alpha | 85% | GPU PBR 渲染 + 编解码 + FIFO 导出 + 统一 HTTP/WS + 响度标准化 + 预加载优化 + 粒子/后处理/IBL |
| **neko-cut** | Alpha | 82% | 时间线 + 预览 + 导出预设 + EditOperation 29 操作 + 拖拽修复 |
| **neko-agent** | Alpha | 75% | Agent 引擎 + LLM 平台 + CLI + UI + Handler 拆分 + 流式化 + 剧本→时间线 |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-preview** | Alpha | 70% | Video/Audio Provider + WebCodecs 播放器 + 波形可视化 + i18n |
| **neko-story** | WIP | 75% | Fountain 解析器 + LSP + 预览 + 错误诊断 + 时间线生成 + PDF 导出 |
| **neko-assets** | Alpha | 85% | Phase 1-3 ✅ + 外部媒体库 ✅ + AI 分类 + 缩略图 + 多云支持 + 跨扩展集成，Phase 4-5 待开发 |
| **neko-tools** | WIP | 62% | 媒体 Diff + 并行优化 + 协议增强 + 资产变体对比 |
| **neko-canvas** | Alpha | 65% | 无限画布 + 5 种节点 + 多选 + 属性面板 + 上下文菜单 + 拖放 + 快捷键 + i18n |
| **neko-proto** | Stable | 100% | timeline.proto + diff.proto 完整 IDL，Rust/TS 双端类型源 |
| **neko-model** | Alpha | 65% | 3D 创作套件，Phase 3.1 ✅ + Phase 3.2 ✅ + Phase 3.3 ✅（PBR 渲染 + 粒子 + 后处理 + 时间线集成 + CSG/文字/几何体建模 + 骨骼表情） |
| **neko-sketch** | Alpha | 85% | S.1 ✅ 绘画基础；S.2 ✅ 骨骼动画；S.3 ✅ 高级 2D（滤镜/粒子/场景/绘制/资产）；S.4 规划中 |
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

> 目标：专业视觉效果和 3D 场景编辑 — **进度 ~75%**

### neko-canvas — 已完成
- 无限画布（5%-1600% 缩放 + 网格背景 + 视口裁剪）
- 5 种节点（Annotation/Storyboard/Media/Text/Artboard）+ 内联文本编辑
- 多选（Cmd+click）+ 属性面板 + 上下文菜单 + 拖放导入 + 10+ 快捷键 + i18n

### neko-canvas — 待完成
- 节点 resize/rotate + 框选 + 分组
- Port 系统 + 连线
- WebGPU 渲染 + 特效系统 + 自定义转场 + 导出

### neko-model (3D) — Alpha

> 架构设计见 [docs/architecture/3d-capability-analysis.md](./docs/architecture/3d-capability-analysis.md)

- Phase 3.1 ✅：基础 3D 视口 + 场景组装（native-scene bevy_ecs + glTF/VRM + R3F + 骨骼动画 + SceneTree + TransformGizmo + EngineClient 集成）
- Phase 3.2 ✅：AI 捏脸 + 基础建模
  - ✅ 参数化面部编辑器（22 个参数，5 个分类）
  - ✅ Morph Target 驱动捏脸（自动绑定 morphTargetInfluences）
  - ✅ VRM 表情预设（@pixiv/three-vrm，17 个标准表情）
  - ✅ 延迟测试工具（100 次测试 + 统计 + 建议）
  - ✅ CSG 布尔运算（BSP 树算法，Union/Difference/Intersection）
  - ✅ 3D 文字挤出（cosmic-text 字形轮廓 → ear-clipping 三角化 → Z 轴挤出）
  - ✅ 参数化几何体（6 种标准形状：Cube/Sphere/Cylinder/Cone/Torus/Plane）
  - ✅ 骨骼驱动表情 UI（口型同步 6 音素 + 眼球追踪 + 眉毛滑块）
  - ✅ ProceduralMesh 统一抽象 + AssetCache.register_procedural_mesh() GPU 管线
  - ✅ 前端 4 面板（骨骼表情 / CSG / 3D 文字 / 几何体创建）+ 通信层
  - ⬜ AI MCP Tools（face.generate_params / face.from_image / face.adjust）
- Phase 3.3 ✅：PBR 渲染 + 时间线集成（12 步完成）
  - ✅ PBR 材质管线（Metallic-Roughness + Normal/AO/Emissive 贴图）
  - ✅ IBL 环境光照（HDRI → Cubemap → Irradiance + Prefiltered + BRDF LUT）
  - ✅ 粒子系统（GPU 实例化 + 6 种发射器 + 力场 + 碰撞）
  - ✅ 后处理管线（Bloom + Tone Mapping + FXAA + Vignette + Color Grading）
  - ✅ SceneRenderOutput → GpuLayer 时间线集成
  - ✅ 前端 scene3d 类型集成（neko-cut 时间线 + neko-canvas 节点）
- Phase 3.4：AI 辅助 3D + 3DGS + MCP 桥接（Text-to-3D + Image-to-3D + Blender MCP）

### neko-sketch (2D) — Alpha

> 架构设计见 [docs/architecture/2d-capability-analysis.md](./docs/architecture/2d-capability-analysis.md)

- Phase S.1 ✅：绘画基础（WebGL2 引擎 + 7 种笔刷 + 压感 + 12 混合模式 + 图层/选区/历史 + .nks I/O）
- Phase S.2 ✅：2D 骨骼动画 + 逐帧动画
  - ✅ native-puppet crate（bevy_ecs 0.15 + inox2d + bevy_animation）
  - ✅ INP 手动解析（绕过 inox2d 0.3.0 `pub(crate)` 限制）
  - ✅ bevy_animation ParameterCurve 桥接层（anim_play/stop/seek/anims 端点）
  - ✅ `GET /v1/puppets/stream`（60fps WebSocket PuppetDelta 推送，供 neko-live）
  - ✅ AnimationPanel UI（动画列表 + 播放控制 + IInochi2DController.connectStream）
  - ✅ 逐帧动画（洋葱皮渲染 + 帧管理 + 精灵表导出）
- Phase S.3 ✅：高级 2D 功能
  - ✅ 滤镜系统（FilterPipeline ping-pong FBO + FilterRegistry 6 内置 GLSL 滤镜 + FilterPanel UI）
  - ✅ 粒子系统（ParticleSimulation 对象池 + ParticleRenderer WebGL2 实例化 + ParticlePanel UI）
  - ✅ 精灵表导出（OffscreenCanvas 网格装箱 + Aseprite/TexturePacker 兼容 JSON）
  - ✅ 变形动画（MorphEngine 顶点变形 + 关键帧插值 + MorphEditor UI）
  - ✅ 场景系统（Scene/SceneLayer/CameraConfig + 视差渲染 + 4 个场景模板 + 氛围效果 5 预设）
  - ✅ 像素绘制（Bresenham 直线 + flood fill + 1x/2x/4x/8x 画笔 + 像素网格）
  - ✅ 矢量绘制（贝塞尔路径 + 矩形/椭圆/多边形/星形 + SVG 导出 + Canvas2D 渲染）
  - ✅ 资产集成（精灵表/场景 JSON 导出 + VSCode 命令注册）
  - ✅ 渲染管线集成（filterFn 回调 + SketchRenderer.renderWithEffects）
  - ✅ 单元测试（7 文件 42 测试：pixel-tool/vector-tool/morph-engine/parallax/particle/frame/atmosphere）
  - ✅ 画板响应修复（RAF 连续渲染 + ResizeObserver 自适应 + dirty flag 模式）
  - ✅ 国际化支持（I18nProvider + useTranslation hook + 130 翻译 key + 中英双语 13 组件全覆盖）
- Phase S.4：AI 辅助 + 跨模块集成（sketch.generate / style_transfer / → neko-cut/canvas）

---

## Phase 4: 音频工作站

> 目标：专业音频编辑 — **进度 ~15%**

- neko-preview：VideoPreviewProvider + AudioPreviewProvider ✅ + WebCodecs 播放器 + 波形可视化 + i18n，高级预览待完成
- neko-audio：波形编辑 + 音频效果（均衡器/压缩/降噪）+ 录音

---

## Phase 5: 虚拟制片

> 目标：虚拟直播和动捕 — **进度 ~0%** | **前置：Phase 4（neko-audio）**

**价值定位**：VTuber / 独立创作者 / 直播场景，录制内容可直接进入 neko-cut 时间线，形成闭环创作流。

**现有可复用基础**（~80%）：
- VRM 加载 + 17 个表情预设 + 口型同步 6 音素 + 眼球追踪（neko-model）
- native-puppet 2D 骨骼 ECS + 60fps WebSocket PuppetDelta 流（neko-sketch S.2）
- H.264 硬件编码 8-11ms + ExportService 录制管线（neko-engine）
- EngineClient puppet* 方法（neko-client）

**需新建**：
- VMC 协议接收（Extension Host dgram UDP 中转，~200 行 TS）
- MediaPipe Face/Pose 集成（Webview 内推理，~300 行 TS）
- RTMP/SRT 推流（native-core FFmpeg 输出，~500 行 Rust）

**里程碑**：
- Phase 5.1：核心追踪（MediaPipe + VMC + Three.js VRM 预览 + 骨骼驱动）— 3-4 周
- Phase 5.2：录制与输出（标定 + 音视频同步 + MP4 导出 → neko-cut）— 2-3 周
- Phase 5.3：直播推流（RTMP/SRT → OBS + neko-sketch 2D puppet 联动）— 2-3 周

**架构决策**：
- 渲染：混合策略（Three.js 实时预览 <1ms + wgpu 录制输出 8-11ms）
- 延迟：追踪→渲染 20-40ms（满足直播体感）
- 虚拟摄像头：**不做原生驱动**（非跨平台），改用 RTMP 推流到 OBS 生成

---

## Phase 7: VR/AR 沉浸式创作（远期规划）

> 目标：VR/AR 场景编辑 + 沉浸式预览 — **进度 ~0%** | **前置：Phase 3 + Phase 5**

**架构决策**：VSCode Webview 沙箱无 WebXR API，采用混合策略：

```
Layer 1: VSCode 内（编辑/导出）
├─ neko-model 3D 场景编辑 + XR 元数据标注（交互区域/锚点/空间音频）
├─ VR/AR 预览参数配置（IPD/FOV/控制器映射）
└─ 场景导出（glTF + XR 扩展）

Layer 2: 外部 App（沉浸式预览，Electron/Tauri）
├─ WebXR Device API（immersive-vr / immersive-ar）
├─ neko-engine WebSocket 实时同步（双眼立体渲染）
├─ 手柄/手部追踪 → 骨骼映射（复用 native-scene Skeleton）
└─ 触觉反馈路由

Layer 3: MCP 桥接（专业导出）
├─ Unity MCP → VR 应用打包
├─ Unreal MCP → 高保真 VR 体验
└─ ComfyUI MCP → AI 生成 VR 环境
```

**现有可复用基础**：
- wgpu PBR 渲染管线 → 扩展双 Pass 立体渲染（~300 行 Rust）
- bevy_ecs Skeleton + VRM → 手部/面部追踪映射
- WebSocket 60fps 流 → 已验证 <20ms 延迟
- EngineClient 零 VSCode 依赖 → 外部 App 直接复用

**需新建**：
- `native-core/src/vr/stereo_renderer.rs` — 双眼渲染 + 镜头畸变校正
- `neko-vr/` 扩展 — VSCode XR 元数据编辑 + Electron 沉浸式预览
- AR 平面检测需原生平台集成（ARKit/ARCore），属 Phase 7.3+

**里程碑**：
- Phase 7.1：立体渲染 + EngineClient XR 端点（2-3 周）
- Phase 7.2：Electron WebXR 外部 App + 手部追踪（3-4 周）
- Phase 7.3：AR 能力（平面检测 + 光照估计 + 图像追踪）（4-6 周）
- Phase 7.4：AI 辅助 XR（neko-agent VR 场景生成 + 手势识别 + 语音指令）

---

## Phase 6: 资产管理与协作

> 目标：统一资产管理 + AI 模型资产化 + 社区分发 — **进度 ~55%**

- Phase 1-3 ✅：统一核心 + 深度集成 + 注册表 + 缩略图
- Phase 3.5 ✅：外部媒体库（健康检查 + 路径变量 + TreeView + 多云支持）
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

*最后更新: 2026-03-16（Phase 5 虚拟制片详细规划；Phase 7 VR/AR 远期规划；neko-sketch S.3 P2 完成；neko-agent 任务持久化；neko-engine glTF 导出器）*
