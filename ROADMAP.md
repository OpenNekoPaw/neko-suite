# Neko Suite Roadmap

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。
>
> 具体任务清单见 [TODO.md](./TODO.md)。

---

## 开发状态总览

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-types** | Alpha | 92% | 共享类型 + 横切关注点统一 + Operations 类型安全（audio/canvas/sketch 全覆盖）+ 文档完善 |
| **neko-engine** | Alpha | 88% | GPU PBR 渲染 + 编解码 + FIFO 导出 + 统一 HTTP/WS + 响度标准化 + 预加载优化 + 粒子/后处理/IBL + 设备代理（mic/midi/gamepad） |
| **neko-cut** | Alpha | 82% | 时间线 + 预览 + 导出预设 + EditOperation 29 操作 + 拖拽修复 |
| **neko-agent** | Alpha | 75% | Agent 引擎 + LLM 平台 + CLI + UI + Handler 拆分 + 流式化 + 剧本→时间线 |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-preview** | Alpha | 75% | Video/Audio Provider + WebCodecs 播放器 + 波形可视化 + 音频播放器现代化（Apple Music 风格三视图） + i18n + 流生命周期重构（tab 级 stream 复用） + UI 现代化规划（macOS 风格 + Tailwind 统一） |
| **neko-story** | WIP | 75% | Fountain 解析器 + LSP + 预览 + 错误诊断 + 时间线生成 + PDF 导出 |
| **neko-assets** | Alpha | 85% | Phase 1-3 ✅ + 外部媒体库 ✅ + AI 分类 + 缩略图 + 多云支持 + 跨扩展集成，Phase 4-5 待开发 |
| **neko-tools** | WIP | 62% | 媒体 Diff + 并行优化 + 协议增强 + 资产变体对比 |
| **neko-canvas** | Alpha | 87% | 无限画布 + 6 种节点 + 连接标签 + 图层面板 + 富文本 + 分组 + 画板导出 + 原地粘贴 + 旋转 + 框选 + Port UI 面板 + EditOperation 集成 + i18n |
| **neko-proto** | Stable | 100% | timeline.proto + diff.proto 完整 IDL，Rust/TS 双端类型源 |
| **neko-model** | Alpha | 65% | 3D 创作套件，Phase 3.1-3.3 ✅（PBR 渲染 + 粒子 + 后处理 + 时间线集成 + CSG/文字/几何体建模 + 骨骼表情） |
| **neko-sketch** | Alpha | 87% | S.1-S.3 ✅（绘画 + 骨骼动画 + 高级 2D）+ EditOperation 集成；S.4 规划中 |
| **neko-audio** | Alpha | 95% | 完整音频工作站：波形编辑 + 播放 + 频谱分析 + 12 种效果链 + Engine 麦克风录制 + AI 降噪/标准化 + 导出 + .nka 项目 + 右键新建 + l10n + EditOperation 集成 + 78 测试 |
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

### neko-agent — 待完成
- 分镜→批量视频生成 → 自动排列到时间线

### neko-agent — 延后到后续 Phase
- 批量时间线操作 Skill（→ Phase 6 资产管理与协作阶段，配合跨扩展集成）
- AI 字幕生成 / 自动配乐 / 画面描述（→ Phase 4 音频工作站阶段，依赖 neko-audio）
- MCP 桥接专业软件 Blender / ComfyUI / Photoshop（→ Phase 3.4 AI 辅助 3D + neko-model）

---

## Phase 3: 视觉增强 + 3D 能力

> 目标：专业视觉效果和 3D 场景编辑 — **进度 ~75%**

### neko-canvas — 待完成
- 节点 resize/rotate + 框选 ✅（rotate + 框选 + Port UI 面板已完成）
- 画板导出为图片 ✅（PNG/SVG，html-to-image 截图 + Extension 保存对话框）
- 大量节点性能优化（按需，当前 DOM/SVG 方案足够）

> **已移除**：WebGPU 渲染管线 / 特效系统 / 自定义转场。画布编辑器是节点图编排工具，不需要 GPU 合成；视频特效/转场属于 neko-cut 职责。

### neko-model (3D) — 待完成

> 架构设计见 [docs/architecture/3d-capability-analysis.md](./docs/architecture/3d-capability-analysis.md)

- Phase 3.1-3.3 ✅（基础 3D 视口 + AI 捏脸 + CSG/文字/几何体建模 + PBR 渲染 + 粒子 + 后处理 + 时间线集成）
- Phase 3.2 遗留：AI MCP Tools（face.generate_params / face.from_image / face.adjust）
- Phase 3.4：AI 辅助 3D + 3DGS + MCP 桥接（Text-to-3D + Image-to-3D + Blender MCP）

### neko-sketch (2D) — 待完成

> 架构设计见 [docs/architecture/2d-capability-analysis.md](./docs/architecture/2d-capability-analysis.md)

- Phase S.1-S.3 ✅（绘画基础 + 2D 骨骼动画 + 逐帧动画 + 高级 2D 功能）
- Phase S.4：AI 辅助 + 跨模块集成（sketch.generate / style_transfer / → neko-cut/canvas）

---

## Phase 4: 音频工作站

> 目标：专业音频编辑 — **进度 ~90%**

### neko-audio — ✅ 已完成
- Phase A: 双包基础设施（extension + webview）✅
- Phase B: 核心播放（波形显示 + 播放/暂停/Seek/音量/速度）✅
- Phase C: 编辑功能（选区裁剪 + 音频属性面板）✅
- Phase D: 频谱分析（AnalyserNode FFT + Canvas 频率条形图）✅
- Phase E: 效果链（12 种效果 + 动态参数编辑器 + Apply transcode）✅
- Phase F: 麦克风录制（getUserMedia + MediaRecorder + 电平表 + 设备选择）✅
- Phase G: AI 降噪 + 标准化 + 导出（denoise/normalize/exportAs）✅
- Phase H: 命令集成 + .nka 项目 + ExportPanel + 速度同步 ✅
- Phase I: 响度面板 + Toast 通知 + AudioStreamClient public API + 78 测试 ✅
- Phase J: 右键新建音频项目（explorer/context 菜单 + 空模板 + 内联重命名）+ l10n + 空项目 null audioSource 支持 ✅

### neko-audio — 待完成
- ~~Engine 代理麦克风录制~~ ✅（`cpal` 采集 + WAV 写入 + `/v1/monitor` 电平端点 + 双模式 useRecording）
- neko-preview：高级预览待完成
- UI 现代化：Tailwind 接入 + macOS 风格（Phase 4）

---

## Phase 4.5: UI 现代化与主题统一

> 目标：统一 macOS 视觉风格 + VSCode 主题配色 + 图标系统 — **进度 ~0%** | **设计完成，待实施**

**价值定位**：提升 neko-suite 整体视觉一致性和现代感，与 macOS 设计语言对齐，改善用户体验。

**架构设计**：详见 [docs/architecture/ui-modernization-design.md](./docs/architecture/ui-modernization-design.md)

**里程碑**：

### Phase 0: neko-preview Tailwind 基础设施接入 [0.5d]
- 添加 tailwind.config.js + postcss.config.js
- 在 player.css 顶部添加 @tailwind 指令
- 渐进式迁移（新增组件用 Tailwind，现有 CSS 保留）

### Phase 1: macOS Design Token 体系 + CSS 变量统一 [1d]
- 扩展 @neko/shared 全局 Token（neko-glass / neko-surface / borderRadius / boxShadow / backdropBlur）
- 统一 CSS 变量：`--neko-audio-*` → `--neko-preview-*`
- 添加深色/浅色/高对比度三层主题覆盖

### Phase 2: macOS 风格组件重构 + 共享控件提取 [2d]
- 音频/视频播放器 macOS 化（毛玻璃、圆角、阴影、按压缩放）
- 提取共享控件（VolumeControl / SpeedButton / useMediaKeyboard）

### Phase 3: macOS 全局组件模式 [0.5d]
- 定义按钮体系（Primary / Secondary / Ghost / Icon）
- 输入控件规范（输入框 / 滑块）
- 动效规范（hover / active / transition）

### Phase 4: neko-audio Tailwind 接入 + macOS 化 [1d]
- 接入 Tailwind 基础设施
- 工具栏按钮、面板容器使用 macOS 组件模式

### Phase 5: neko-story VSCode 主题接入 [0.5d]
- 硬编码颜色替换为 var(--vscode-*) 变量

### Phase 5.5: macOS VSCode 主题配色（Dark + Light）[1d]
- 在 neko-tools 中声明 contributes.themes
- 提供 Neko macOS Dark / Light 两套完整配色（130+ token）
- 基于 Apple 系统色（#0A84FF / #FF453A / #30D158 等）

### Phase 5.6: SVG 图标统一 + File Icon Theme [2d]
- 在 @neko/shared/icons 建立统一图标模块（~25 个去重图标）
- 统一为 stroke 描边 + 24×24 viewBox + currentColor（macOS SF Symbols 风格）
- 提供 File Icon Theme 支持 13 个自定义文件扩展名（.jvi / .jvc / .nka / .nks 等）

### Phase 6: 跨包共享组件 [1.5d, 按需触发]
- ContextMenu / CollapsibleSection / Ruler 等高频组件提取到 @neko/shared

### neko-engine 设备代理 — ✅ P1-P3 框架完成
- P1 麦克风（`cpal`）：✅ 完整实现（3 个 action + monitor 端点 + TS 双模式录制）
- P2 摄像头（FFmpeg avdevice）：✅ 框架完成（trait + controller + TS 方法），capture 实现 TODO
- P3A MIDI（`midir`）：✅ 完整实现（端口枚举 + 连接 + 事件解析 + broadcast）
- P3B Gamepad（`gilrs`）：✅ 完整实现（枚举 + 120Hz 事件轮询 + broadcast）
- 详见 [ADR: 设备访问策略](./docs/architecture/device-access.md)

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

## Phase 6: 资产管理与协作

> 目标：统一资产管理 + AI 模型资产化 + 社区分发 — **进度 ~55%**

- Phase 1-3.5 ✅（统一核心 + 深度集成 + 注册表 + 缩略图 + 外部媒体库）
- Phase 4（待开发）：Handler 实现（Shader/Preset/Model）+ AI 模型资产化 + IAIAnalysisService
- Phase 5（待开发）：社区分发（`.neko` 包格式 + 远程注册表 + CLI）

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

## Phase 8: 交互视频创作

> 目标：在 neko-suite 内完成交互视频（分支叙事视频）的编辑、预览和导出 — **进度 ~0%** | **前置：Phase 1 + Phase 2 + Phase 3（canvas）**

**价值定位**：B 站互动视频 / YouTube 交互内容 / 品牌互动营销 / 教育培训分支课件。neko-suite 作为创作工具链天然适合交互视频——核心是视频编辑（而非游戏运行时），与现有 neko-cut / neko-story / neko-canvas 高度重合。

**现有可复用基础**（~70%）：
- neko-cut 时间线编辑器 + 29 种 EditOperation + 字幕/特效轨
- neko-engine GPU 渲染 + 18 种转场 + H.264 硬件加速 + Seek/Loop/变速
- neko-story Fountain 剧本 + LSP + TimelineConverter
- neko-canvas 节点系统（6 种节点 + 端口连接 + 类型校验 + 连接标签 + 分组管理）
- H264StreamClient + AudioStreamClient + FrameScheduler A/V 同步
- neko-agent AI 辅助（剧本分析 / 分支建议 / 自动字幕）

**需新建**：

| 模块 | 内容 | 估计工作量 |
|------|------|-----------|
| **分支节点** | neko-canvas 新增 `ChoicePointNode` + `BranchNode`，可视化编排分支流程图 | ~500 行 TS |
| **选择点标记** | neko-cut 时间线新增 `ChoiceMarker` 轨道类型（时间点 + 选项文本 + 跳转目标） | ~400 行 TS |
| **交互预览器** | Webview 播放器叠加选项 UI（播放到选择点暂停 → 显示按钮 → 用户选择 → Seek 跳转） | ~800 行 TS |
| **分支验证** | 可达性检查 + 死路检测 + 循环检测 + 分支覆盖率统计 | ~300 行 TS |
| **平台导出器** | 分段视频渲染 + 交互描述 JSON（适配 B 站 IVG / YouTube / Web 播放器） | ~600 行 TS + Rust |

**架构设计**：

```
创作流程：
neko-story (剧本 + 分支标记)
    ↓ 导出分支结构
neko-canvas (分支流程图可视化编排)
    ↓ 关联视频片段
neko-cut (各分支片段剪辑 + 选择点标记)
    ↓ GPU 渲染导出
neko-engine (分段渲染 + 转场 + 特效)
    ↓
分段视频 + 交互描述文件（JSON）

播放/预览流程：
交互描述 → 加载片段 A → 播放
    → 到达选择点 → 暂停 + 显示选项
    → 用户选择 → Seek/切换片段 B 或 C
    → 继续...
```

**里程碑**：
- Phase 8.1：分支编辑基础（canvas ChoicePointNode + cut ChoiceMarker + 分支数据模型）— 2-3 周
- Phase 8.2：交互预览器（Webview 播放器 + 选项叠加 UI + 分支跳转逻辑）— 2-3 周
- Phase 8.3：分支验证 + AI 辅助（可达性检查 + neko-agent 分支建议 / 剧本分析）— 1-2 周
- Phase 8.4：平台导出（B 站 IVG 格式 + Web HTML5 播放器 + 通用 JSON Schema）— 2-3 周

**导出目标平台**：

| 平台 | 格式 | 说明 |
|------|------|------|
| B 站互动视频 | IVG（JSON + 分段视频） | 国内最大互动视频平台 |
| YouTube | 卡片 / 结束画面标注 | 基于 YouTube API |
| Web 独立发布 | HTML5 播放器 + fMP4 分段 | 自托管，零依赖 |
| 通用交互视频 | JSON Schema + HLS/DASH | 可对接任意播放器 |

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

*最后更新: 2026-03-21（UI 现代化设计完成 + Phase 4.5 规划）*
