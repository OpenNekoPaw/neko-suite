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
| **neko-agent** | Alpha | 82% | Agent 引擎 + LLM 平台 + CLI + UI + Phase 3 重构 ✅ + 媒体工具贯通 ✅ + AI SDK v3 ✅ + Pipeline Hook ✅ + 对话持久化（存储层 ✅） |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-preview** | Alpha | 85% | Video/Audio Provider + WebCodecs 播放器 + 波形可视化 + 音频播放器现代化（Apple Music 风格四视图） + i18n + 流生命周期重构 + UI 现代化 Phase 0-3 ✅ |
| **neko-story** | WIP | 75% | Fountain 解析器 + LSP + 预览 + 错误诊断 + 时间线生成 + PDF 导出 |
| **neko-assets** | Alpha | 85% | Phase 1-3.5 ✅ + 外部媒体库 ✅ + AI 分类 + 缩略图 + 跨扩展集成，Phase 4-5 待开发 |
| **neko-market** | Planned | 0% | 统一市场平台（Skills/模型/Shader/素材分发） |
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

> 目标：AI Agent 驱动的智能剪辑 — **进度 ~85%**

### neko-agent — 已完成
- Phase 3 架构重构 ✅：AgentExecutor 统一循环 + AgentSessionInitializer + IPermissionManager + SkillInjection rollback
- 媒体工具贯通 ✅：GenerateImage/Video/Music/TTS 4 个工具均有 execute 实现
- AI SDK 迁移 ✅：@ai-sdk/openai,google,anthropic v3 已集成
- 对话持久化（大部分 ✅）：ConversationRecord + FileConversationStorage 完成
- Pipeline Hook Registry ✅：hook-registry.ts + generate-pilot.ts

### neko-agent — 待完成
- 分镜→批量视频生成 → 自动排列到时间线
- 对话持久化遗留：CLI `--resume` / `/resume` 未实现
- MCP 客户端重连退避（当前连接失败即终止）
- ContextManager 异步竞态保护（无锁，并发写入有风险）

### neko-agent — 延后到后续 Phase
- 批量时间线操作 Skill（→ Phase 6 资产管理与协作阶段，配合跨扩展集成）
- AI 字幕生成 / 自动配乐 / 画面描述（→ Phase 4 音频工作站阶段，依赖 neko-audio）
- MCP 桥接专业软件 Blender / ComfyUI / Photoshop（→ Phase 3.4 AI 辅助 3D + neko-model）
- SubAgent Skills：Seed_Manager + Audio_Mixer + 镜头语言通用 Skill

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
- Phase S.4：AI 辅助 + 跨模块集成
  - `sketch.generate`（AI 绘画生成）
  - `style_transfer`（风格迁移）
  - 跨模块集成（→ neko-cut / canvas）

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

> 目标：统一 macOS 视觉风格 + VSCode 主题配色 + 图标系统 — **进度 ~95%** | **Phase 0-5.6 已完成**

**价值定位**：提升 neko-suite 整体视觉一致性和现代感，与 macOS 设计语言对齐，改善用户体验。

**架构设计**：详见 [docs/architecture/ui-modernization-design.md](./docs/architecture/ui-modernization-design.md)

**里程碑**：

### Phase 0: neko-preview Tailwind 基础设施接入 ✅
- tailwind.config.js + postcss.config.js + @tailwind 指令
- 渐进式迁移（新增组件用 Tailwind，现有 CSS 保留）

### Phase 1: macOS Design Token 体系 + CSS 变量统一 ✅
- 扩展 @neko/shared 全局 Token（neko-glass / neko-surface / borderRadius / boxShadow / backdropBlur）
- 统一 CSS 变量：`--neko-audio-*` → `--neko-preview-*`（~40 处替换）
- 添加深色/浅色/高对比度三层主题覆盖

### Phase 2: macOS 风格组件重构 + 共享控件提取 ✅
- 音频播放器 macOS 化（AudioPlayer/AudioControls/ProgressBar/CoverView/LyricsView 全部 Tailwind 化）
- 新建 4 个 macOS 风格共享组件（MacButton/MacIconButton/MacTabs/MacSlider）
- WaveformCanvas/SpectrumCanvas getCssVar 变量名更新

### Phase 3: 视频播放器 macOS 化 ✅
- VideoPlayer/VideoControls 全部 Tailwind 化
- 使用共享 MacIconButton/MacSlider 组件
- 删除全部 BEM CSS（player.css 1009行→183行，CSS 产物 33.5KB→21.6KB）
- 定义按钮体系（Primary / Secondary / Ghost / Icon）
- 输入控件规范（输入框 / 滑块）
- 动效规范（hover / active / transition）

### Phase 4: neko-audio Tailwind 接入 + macOS 化 ✅
- tailwind.config.js + nekoTailwindPreset 接入完成
- MacButton/MacSlider 等从 @neko/shared/components 导入使用

### Phase 5: neko-story VSCode 主题接入 ✅
- 硬编码颜色替换为 var(--vscode-*) 变量（仅 print.css 保留 #000/#fff）

### Phase 5.5: macOS VSCode 主题配色（Dark + Light）✅
- neko-tools contributes.themes 声明 Neko macOS Dark / Light

### Phase 5.6: SVG 图标统一 + File Icon Theme ✅
- @neko/shared/icons 30+ 图标组件
- File Icon Theme 支持自定义文件扩展名

### Phase 6: 跨包共享组件 ✅
- macOS primitives（MacButton/MacIconButton/MacSlider/MacTabs/ProgressBar）已迁移到 @neko/shared/components ✅
- Toolbar / Panel / CollapsibleSection / ContextMenu / TimelineRuler 等已在 @neko/shared ✅

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

> 目标：统一资产管理 + 市场平台 + 远程存储 + 社区分发 — **进度 ~55%**

**架构文档**：
- [marketplace.md](./docs/architecture/marketplace.md) — 市场平台架构
- [remote-storage.md](./docs/architecture/remote-storage.md) — 远程存储与代理文件策略

### Phase 6.1-6.3.5 ✅ 本地资产管理
- 统一核心（Entity→Variant→File 三层层级 + AssetManifest + IAssetRegistry）
- 深度集成（neko-cut/story/canvas 跨扩展拖拽 + IPC 协议 20+ 请求类型）
- 注册表 + AI 分类 + 缩略图 + 外部媒体库

### Phase 6.4（待开发）：Handler 补全 + 文档素材
- ShaderAssetHandler（编译验证 + 预览 + 热重载）
- PresetAssetHandler（LUT / 转场预设 / 导出预设）
- ModelAssetHandler（AI 模型下载 + 校验 + 量化选择）
- IAIAnalysisService（接入 neko-agent AI 分类）
- AssetType `'document'` + DocumentMetadata（PDF/Word/PPT/Excel/EPUB/CBZ/FDX）
- AssetOwnership（scope: personal/project/team/purchased/public）

### Phase 6.5（待开发）：统一市场平台（neko-market）

> 架构设计见 [marketplace.md](./docs/architecture/marketplace.md)

**品类**：Skills / 本地模型 / Shader / 插件 / 创作素材 / 预设模板 LUT

**分发模式**：官方 / 私有 / 共享 / 售卖

**关键包**：

```
neko-market/packages/core/    @neko/market-core（零 vscode 依赖）
├── MarketClient              HTTP API 客户端（搜索/详情/下载 URL）
├── InstallManager            下载/校验/解压/版本管理
├── LicenseManager            授权验证 + 付费资产
├── CacheManager              .neko/market-cache/ 管理
└── VersionResolver           semver 解析 + 兼容性检查
```

**里程碑**：
- Phase 6.5.1：基础设施（@neko/market-core + IFileTransport + AssetDistribution 扩展）
- Phase 6.5.2：Skill 市场 MVP（neko-agent 侧边栏 + 官方/免费 + 安装/卸载）
- Phase 6.5.3：全品类市场（Shader/LUT/预设 + 本地模型 + 创作素材）
- Phase 6.5.4：商业化（付费资产 + 支付集成 + 发布者后台 + 评分评论）

### Phase 6.6（待开发）：远程存储与代理文件

> 架构设计见 [remote-storage.md](./docs/architecture/remote-storage.md)

**存储后端**：MinIO（S3 协议兼容），可切换 AWS S3 / Aliyun OSS / Cloudflare R2

**服务架构**：

```
Neko Storage Service（薄服务层）
├── Auth Service              Neko 账号 → JWT
├── Team/Project Isolation    Bucket 隔离（per team/project/user）
├── Presigned URL             给 Webview/Engine 使用
└── Transcode Worker          代理文件 + 缩略图生成
```

**Transcode Worker 全品类管线**：

| 管线 | 工具 | 输入 → 输出 |
|------|------|------------|
| 视频 | FFmpeg | → H.264 720p faststart proxy + poster + strip |
| 音频 | FFmpeg | → AAC 128k proxy + waveform |
| 图片 | libvips | → WebP 2K proxy + 256px thumbnail（> 5MB 或 PSD/TIFF/RAW/EXR） |
| 序列帧 | FFmpeg | → H.264 720p faststart proxy（合成为视频） |
| 3D 模型 | gltf-transform | → LOD Draco 压缩 + 512px 贴图 + 渲染预览图 |
| PDF | poppler/mupdf | → 逐页 WebP + 结构 JSON |
| PPT | LibreOffice + poppler | → 逐页 WebP + 备注 JSON |
| Word | pandoc | → HTML + 嵌入资源提取 |
| Excel | sheetjs | → JSON 数据 + Sheet 结构 |
| EPUB | 解压提取 | → 封面 + 目录 JSON + HTML 章节 |
| CBZ | unzip + libvips | → 缩小逐页 WebP |

**核心流程**：上传 → 服务端生成代理 → 客户端下载代理到本地 → Engine 读本地代理编辑 → 导出时增量拉取原始文件

**里程碑**：
- Phase 6.6.1：基础设施（IFileTransport + S3Transport + ICacheManager + ProxyService 扩展）
- Phase 6.6.2：上传 + 媒体代理生成（分片上传 + FFmpeg/libvips Worker）
- Phase 6.6.3：文档 + 3D 代理生成（poppler/LibreOffice/gltf-transform Worker）
- Phase 6.6.4：导出优化（预览导出用代理 + 最终导出增量拉取原始文件）

### Phase 6.7（待开发）：项目协作基础设施
- Git LFS 集成（.gitignore/.gitattributes 模板自动生成 + neko-diff CLI + pHash 相似度 + AssetManifest OID 自动填充）— [ADR](./docs/architecture/project-data-management.md)
- Project Memory 增强（全局 ~/.neko/memory.md + 自动压缩 + MemoryRead 工具 + 文件监听）— [ADR](./docs/architecture/project-memory.md)

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

*最后更新: 2026-03-24（代码验证：Phase 2 agent 架构 85% + Phase 4.5 UI 95% + Phase 6 市场/远程存储/协作基础设施）*
