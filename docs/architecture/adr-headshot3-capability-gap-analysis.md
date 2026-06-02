# ADR: Headshot 3 功能对标与 neko-model 管线差距分析

## 状态

Proposed (2026-05-30)

**日期**: 2026-05-30
**关联**: neko-model · neko-agent · neko-engine · neko-sketch · neko-preview

## 关联文档

| 关联文档 | 关系 |
|---|---|
| [adr-ai-face-sculpting.md](./adr-ai-face-sculpting.md) | Agent 捏脸三阶段 + API→VLM→API 闭环 — 本文差距分析的首要补齐方向 |
| [adr-neko-model-basic-editing-baseline.md](./adr-neko-model-basic-editing-baseline.md) | neko-model 基础可视化编辑闭环 — Headshot/AI 能力的 P0 前置条件 |
| [adr-model-lookdev-scene-editing.md](./adr-model-lookdev-scene-editing.md) | LookDev/灯光/环境/选择 — neko-model 独有的编辑端能力 |
| [adr-3d-editor-rendering-architecture.md](./adr-3d-editor-rendering-architecture.md) | Route A 边界 — Engine 权威渲染约束 |
| [agent-media-architecture.md](./agent-media-architecture.md) | MediaAdapter + GeneratedAsset — 外部 API 接入管线 |
| [adr-agent-multimodal-perception.md](./adr-agent-multimodal-perception.md) | PerceptionCard — 闭环验证依赖感知管线 |
| [adr-engine-preview-subsystem.md](./adr-engine-preview-subsystem.md) | PanoramicRenderer — 环境贴图管线复用 |

---

## 背景

### 对标目标：Reallusion Headshot 3

Headshot 3 是 Reallusion 于 2026-04-27 发布的 Character Creator 5 插件，定位为"业界最高效的专业级数字替身创建方案"。核心能力包括：自训练 AI 照片→3D 头部重建、样条曲线面部塑形、纹理去光照/法线生成、Text-to-Image 参考照生成、全身体型匹配等。

### 对标意义

Headshot 3 代表了当前照片→3D 角色生成管线的行业标杆。通过对标分析，可以明确 neko-model 在**创作素材转换**上的差距、在编辑端的优势，以及通过现有 API + 管线组合架构可以覆盖多少 HS3 功能。

本文不把隐私合规作为当前阶段的架构阻塞项；neko-model 当前定位是创作工具，更关注“输入素材如何稳定转换成可编辑角色资产”。AI 能力默认依赖先进模型或模型 API，系统目标不是自研所有生成模型，而是提供可插拔 provider、资产转换合同和可验证的创作闭环。

### neko-model 架构路线

neko-model 不采用 HS3 的单体原生内建路线，而是 **API 优先 + 多子包组合管线**：

- **MediaAdapter 框架**：10 个已实现的适配器类（OpenAI-compat/fal/Midjourney/Runway/DashScope/Luma/Vidu/MiniMax/Suno/LibLib），当前注册为 14 个内建 provider key
- **跨扩展工作流**：neko-sketch 提供 7 个 AI 工具（生成/修复/风格迁移/超分/自动图层/智能选择/线稿上色）
- **本地 ONNX 推理**：runtime-ml 提供 Real-ESRGAN 超分、CLIP 评分、Whisper 语音识别
- **ControlNet 协议级支持**：canny/depth/pose/normal/segment/lineart/softedge/scribble 均已在请求类型中定义
- **Agent 驱动编排**：AgentCapabilityProvider 暴露场景查询/节点操作/动画控制工具
- **模型/API 能力外置**：照片重建、纹理去光照、法线估计、全身体型估计等能力通过 provider 能力声明接入，不在 Webview 或 Engine 中硬编码某个模型品牌

---

## 前置条件：基础编辑闭环

Headshot/AI 能力不是 neko-model 当前 P0。当前 P0 是 [neko-model 基础可视化编辑能力基线](./adr-neko-model-basic-editing-baseline.md)：普通 GLB/VRM 必须先能显示、选择、变换、调光和切换基础 LookDev。

本文只讨论 Headshot 3 对标、素材转换和角色资产合同。若基础编辑闭环未完成，任何照片转 3D 或 AI provider 输出都只能成为导入文件，无法成为用户可操作的创作资产。

实施状态（2026-06-02）：`implement-neko-model-basic-editing-baseline` 的首轮实现代码已回滚，因为运行测试发现新增控制流路径会让 camera/drag 可见反馈延迟数秒。该结论不改变本文优先级，反而强化前置条件：Headshot/AI、Character Asset Contract、Processing Adapter 和纹理投射不得绕过 B0-B2。下一轮基础编辑实现必须遵守本地即时反馈 + Engine latest-only hot update + 视频/frame metadata 最终一致的热路径约束，禁止 ACK gating、交互期 stream restart、WebCodecs decoder reset 或 suppress 已提交硬解帧。

---

## Headshot 3 功能清单

| # | 功能 | 说明 |
|---|------|------|
| H1 | AI 照片→3D 头部重建 | 自训练模型，支持多种族/年龄，本地运行免费 |
| H2 | AI Text-to-Image 生成 | 先进图像生成模型/API，文本→正面或多视角参考照，目标 4K |
| H3 | AI 图像增强 | 自动中性表情矫正、角度校正、去发丝、光照平衡、4K 超分 |
| H4 | 样条曲线面部塑形 | Bezier 曲线描画面部轮廓，前/侧独立调整互不干扰 |
| H5 | 3D 雕刻 Morph | 悬停区域+方向鼠标调整，1400+ morph pack |
| H6 | 透镜畸变校正 | Face Plane Perspective Slider 矫正手机广角畸变 |
| H7 | Blend Mask 编辑 | 遮罩笔刷+预设模板，去除投射阴影/睫毛/疤痕 |
| H8 | De-light 去光照 | 从照片移除烘焙光照，提取干净 albedo 纹理 |
| H9 | 肤色校正 | 修复颜色不平衡，恢复自然肤色 |
| H10 | 法线贴图生成 | Primary（肌肉/皱纹）+ Secondary（毛孔/细纹）双层法线 |
| H11 | 全身数字替身 | 全身参考照→自动匹配体型，全绑定可动画 |
| H12 | 58 预设面部 Morph | 强度滑块控制，增强深度和独特面部特征 |
| H13 | 扫描/雕刻网格导入 | Mesh Mode：任意 3D 扫描→标准 CC 拓扑角色 |

---

## 架构路线对比

| 维度 | Headshot 3 | neko-model |
|------|-----------|-----------|
| **模式** | 单体原生插件（CC5 内建 AI 模型） | API 优先 + 10 个适配器类 + 子包组合管线 |
| **推理** | 本地自训练模型（免费） | 先进模型/API（fal/Midjourney/DashScope/OpenAI-compatible 等）+ 本地 ONNX |
| **编排** | 线性向导式 UI | Agent 驱动编排 + 跨扩展 workflow |
| **宿主** | Character Creator 5 桌面应用 | VSCode 扩展（IDE 集成） |
| **渲染** | CC5 内建渲染器 | Engine H.264 stream（Route A） |
| **扩展性** | 封闭插件 | 开放管线（新 API 只需新 Adapter） |
| **离线能力** | 完整（本地模型） | 部分（ONNX 超分/CLIP/Whisper，生成依赖在线 API） |

---

## 逐项差距分析

### 管线已覆盖/部分覆盖（无需大量开发）

| HS3 功能 | neko-model 对应 | 实现包 |
|---------|----------------|-------|
| H2: Text-to-Image | fal/Midjourney/DashScope text-to-image + neko-sketch SketchGenerate | neko-agent MediaAdapter + neko-sketch |
| H3 部分: 4K 超分 | 本地 ONNX Real-ESRGAN 2x/4x | runtime-ml |
| H3 部分: 姿态矫正 | fal ControlNet pose 模式 | neko-agent fal adapter |
| H5 部分: 面部 Morph | 22 参数滑块 + SculptBrush 顶点笔刷 | neko-model FaceEditorPanel + SculptBrushWorkflow |
| H12 部分: 基础预设 Morph | 22 个 FACE_PARAMETERS（5 分类），只覆盖基础编辑参数，不等价于 HS3 的 58 preset morph | neko-model faceParameters.ts |

### 管线可达（需接入 1-2 个 API/Adapter）

| HS3 功能 | 接入路径 | 依赖 |
|---------|---------|------|
| H1: 照片→3D 重建 | 接入 DECA/FLAME/PanoHead/商业 3D 生成模型等 processing capability | ADR adr-ai-face-sculpting 已规划 |
| H3 部分: 中性表情矫正 | fal/Replicate 表情编辑 API 或 inpainting | MediaAdapter 框架已就绪 |
| H3 部分: 去发丝 | neko-sketch SketchInpaint 遮罩修复 | 已实现 |
| H6: 透镜畸变校正 | OpenCV perspective correction 或 engine shader | engine 侧轻量开发 |
| H8: De-light 去光照 | intrinsic decomposition / relighting / material estimation 模型 API | Processing capability adapter |
| H9: 肤色校正 | Color grading shader 或 image-to-image API | MediaAdapter / engine shader |
| H10: 法线贴图生成 | normal/depth/material estimation API；ControlNet normal 模式已在协议层支持 | Processing capability adapter |
| H11: 全身体型匹配 | 接入 PIXIE/SMPL-X/body estimation API 或商业 avatar reconstruction API + morph 管线 | Processing capability adapter + morph 扩展 |

### 真正的架构差距（非单纯 API 可补）

| HS3 功能 | 差距性质 | 说明 |
|---------|---------|------|
| H1/H11: 照片/全身素材→可编辑角色资产 | **角色资产合同** | 仅接入 API 只能得到 mesh/texture/landmark 等中间产物，仍需标准拓扑、UV、morph、rig、region descriptor 和材质槽约定，才能进入 neko-model 编辑、LookDev、动画与 Agent 闭环 |
| H4: 样条曲线前/侧独立塑形 | **UI 交互模式** | neko-model 有滑块+笔刷，但无 Bezier 曲线前/侧独立约束。这是编辑器 UI 层的设计差异，需要 engine 侧的平面约束投影 + Webview 侧的曲线编辑器 |
| H7: 3D 纹理投射 + Blend Mask | **Engine 渲染管线 + 纹理创作管线** | 照片纹理投射到 3D mesh + 遮罩笔刷是 engine render 能力，非 API 可替代。需要 engine 的纹理投射 shader、UV 空间 blend mask、材质贴图写回，以及 Webview 的遮罩绘制 UI |
| H5: Morph 资产规模 | **数据量** | 22 → 1400+ 是 morph target 资产制作工作，不涉及代码架构变更。可通过 Market 分发 morph pack |
| H13: 扫描→标准拓扑 | **计算密集** | Retopology 需 Instant Meshes 类工具或专用 API。当前无此管线 |

---

## 决策

### D1: 以创作资产转换为核心目标

Headshot 3 对标不应被理解为“复制单一插件的全部模型能力”，而应拆解为从输入素材到 neko-model 可编辑资产的转换链路：

1. 参考图/照片/扫描 mesh 输入
2. AI provider 生成或估计中间结果
3. 标准角色资产合同归一化
4. Engine 权威渲染与编辑
5. Agent/VLM 观察结果并迭代

因此，关键交付物不是某个 provider 的 API 调用，而是可导入、可编辑、可渲染、可动画、可验证的角色资产包。

### D2: AI 能力依赖先进模型/API，但通过能力声明解耦

照片重建、体型估计、de-light、normal estimation、texture synthesis、reference image generation 等能力默认依赖先进模型或模型 API。neko-agent 负责 provider 选择、任务生命周期、结果资产登记；neko-model 和 neko-engine 只消费稳定合同，不依赖 provider 私有字段。

Provider 需要声明：

- 输入类型：single image、multi-view image、text prompt、scan mesh、mask、landmark、control map
- 输出类型：mesh、texture set、normal map、blend mask、landmark、morph deltas、rig weights、confidence report
- 质量指标：分辨率、拓扑兼容性、UV 兼容性、法线空间、是否可编辑
- 运行特性：同步/异步、最大输入大小、典型耗时、失败可重试性

### D3: 引入 Canonical Character Topology & Retarget Contract

H1/H11 不能只按“接 API”处理。生成结果必须归一化到 neko-model 可编辑角色合同，至少包含：

- canonical mesh family：head-only、bust、full-body、scan-source
- topology compatibility：standard、retargeted、nonstandard
- UV layout version：face/body/eyes/hair/material slot 对应关系
- morph compatibility：支持哪些 FACE_PARAMETERS、表情 preset、ARKit/VRM blend shape 映射
- rig compatibility：骨骼命名、绑定权重、IK target、VRM/MetaHuman-like region 映射
- region descriptor：face region、body region、material slot、bone、node 的选择候选

该合同应优先进入 `.nkc` / scene metadata，而不是散落在 provider-specific JSON 中。

### D4: 引入 Texture Authoring Pipeline

纹理能力不只是“调用去光照 API”。创作工具需要可编辑贴图链路：

- source photo alignment：照片/多视角素材对齐到 mesh
- projective texturing：Engine 侧投射预览
- UV-space bake：把投射结果烘焙回 UV 贴图
- blend mask：遮罩决定照片纹理、生成纹理、手绘修复、原始材质之间的混合
- de-light/normal generation：provider 生成或本地模型生成贴图
- material slot writeback：albedo/normal/roughness/AO/emissive 等贴图写回材质合同

Webview 只提供控制 UI 和遮罩编辑交互，不能绕过 Route A 成为 3D 渲染权威。

---

## neko-model 独有能力（Headshot 3 不具备）

| 能力 | 说明 |
|------|------|
| **LookDev 调试** | 8 种渲染模式（PBR/Clay/Wireframe/Normal/Depth/LightComplexity/Unlit/ShadowAtlas） |
| **灯光 CRUD + 环境 IBL** | 点/方向/聚光灯创建编辑 + HDR 环境映射 |
| **骨骼/IK 编辑** | 29 骨骼 + FABRIK/CCD/TwoBone IK |
| **VRM 表情预设** | 17 预设（情绪/视素/眼动）+ phoneme |
| **动画播放/关键帧编辑** | Blend/crossfade + 30+ easing 类型 |
| **实时动捕映射** | VMC tracking → VRM 表情实时驱动 |
| **Agent AI 编辑** | 场景查询/节点操作/动画控制 3 工具 |
| **材质编辑** | 7 属性 per material slot（baseColor/metallic/roughness/normal/AO/emissive/texture） |
| **VSCode IDE 集成** | 代码/创作同环境，跨扩展工作流 |

---

## 优先级建议

### P0：完成 Basic Editing Baseline 前置 ADR

按 [adr-neko-model-basic-editing-baseline.md](./adr-neko-model-basic-editing-baseline.md) 与 OpenSpec change `implement-neko-model-basic-editing-baseline` 完成 B0-B2。没有这一步，Headshot/AI 生成出的资产也无法被用户可视化编辑。验收不仅要证明合同存在，还要证明普通 GLB/VRM 在 VSCode Webview 中具备即时 camera/drag 反馈、可解释灰态、对象/检查 fallback、Transform、LookDev、灯光和背景可见闭环。

### P1：定义 Character Asset Contract（创作转换合同）

先定义照片/扫描/API 输出如何进入 neko-model：mesh family、topology compatibility、UV layout、morph compatibility、rig compatibility、material slots、region descriptor、quality report。没有这层合同，先进模型/API 的输出只能作为文件导入，无法稳定进入 LookDev、编辑、动画和 Agent 闭环。

### P2：补齐 Processing Adapter（管线可达类功能的统一入口）

接入 Replicate/fal/OpenAI-compatible processing provider 后，可覆盖或部分覆盖：照片→3D 重建、De-light、法线生成、全身体型估计。已在 [adr-ai-face-sculpting.md](./adr-ai-face-sculpting.md) 规划，但应从“单一 Replicate 接入”抽象为 processing capability，避免把创作链路绑定到一个 provider。

### P3：API→VLM→API 闭环（adr-ai-face-sculpting P0）

实现 Agent 驱动的照片→参数→Engine 截图→VLM 验证→迭代循环。是从"工具暴露"到"生成闭环"的关键跃迁。

### P4：3D 纹理投射管线（Engine 侧）

照片纹理投射到 mesh + blend mask 是 HS3 核心的纹理编辑能力，也是 neko-model 在 Engine 渲染管线层面的真正缺口。需要：
- Engine 纹理投射 shader（projective texturing）
- UV 空间 blend mask 生成与编辑
- Webview 遮罩绘制 UI（可复用 neko-sketch 笔刷基础）
- 材质贴图写回与版本化 GeneratedAsset 登记

### P5：Morph 资产扩充

22→100+ 面部参数。这是数据工作而非架构工作，可通过以下途径：
- 内建标准模板扩展（参考 CC5 的分类体系）
- Market 分发 morph pack（MarketInstallTarget 已支持）
- 社区贡献（.nkc region descriptor 框架已设计）

---

## 验收标准

### A0: 基础编辑前置完成

本 ADR 进入 Headshot/AI 实施前，[adr-neko-model-basic-editing-baseline.md](./adr-neko-model-basic-editing-baseline.md) 的 A0-A5 必须通过，且 `implement-neko-model-basic-editing-baseline` 任务中 B0-B2 smoke、Route A 边界、性能/热路径回归检查必须完成。若基础编辑仍处于降级或回滚状态，Headshot/AI 只能继续做 provider 调研与合同设计，不能进入会让生成资产依赖不可用编辑面的产品实现。

### A1: 参考图到可编辑角色

给定一张正面参考图或一组多视角参考图，系统应通过 provider 生成中间结果，并产出可被 neko-model 打开的角色资产包。资产包必须包含 mesh、material slots、至少一组 albedo 贴图、quality report，以及明确的 topology/UV/morph/rig compatibility 标记。

### A2: 生成结果可进入 Route A 编辑

生成资产导入后，Webview 不解析 mesh 或 glTF；所有预览由 Engine 输出 H.264 stream。LookDev 模式、灯光、环境、选择、材质槽查询必须仍走 ViewportCommand/SceneCommand 或查询合同。

### A3: 纹理转换可追踪

De-light、normal generation、blend mask、UV bake 等结果必须登记为 GeneratedAsset，并能追溯 source asset、provider、参数、输出贴图类型和材质槽绑定。

### A4: Provider 可替换

同一创作任务至少能表达为 capability request，而不是某个 provider 的私有调用。切换 provider 后，输出仍归一化为相同 Character Asset Contract；质量差异通过 quality report 暴露给 UI 和 Agent。

### A5: 部分能力明确降级

当 provider 只输出普通 GLB/OBJ、没有 region descriptor、没有 standard topology 或没有 morph compatibility 时，系统应标记为 nonstandard/imported mesh，可进入 LookDev 和材质查看，但不得伪装成完整可编辑角色。

---

## 结论

Headshot 3 与 neko-model 的定位互补而非竞争：

- **Headshot 3** = 照片→角色生成（输入端），单体原生，线性向导
- **neko-model** = 角色编辑/调试/动画（创作端），API 优先，Agent 编排

neko-model 的 API + 管线组合架构使得 HS3 的**大部分生成能力在架构上可组合达成**。但当前必须先补齐基础可视化编辑闭环，否则模型/API 输出即使可生成，也无法成为用户能操作的创作资产。后续关键瓶颈不是"能不能调用模型"，而是"模型/API 输出如何归一化为可编辑角色资产"：

1. **Basic Editing Baseline** 是当前 P0：普通 GLB/VRM 必须先能显示、选择、变换、调光和切换基础 LookDev
2. **Character Asset Contract** 是 H1/H11 的前置条件，决定素材转换结果能否进入角色编辑、动画和 Agent 闭环
3. **Processing capability adapter** 接入后可覆盖或部分覆盖 HS3 的 H1/H8/H10/H11，但输出必须归一化
4. **API→VLM→API 闭环** 实现后可覆盖 HS3 的 H3 增强管线，并为创作结果提供可观察验收
5. **3D 纹理投射 + Texture Authoring Pipeline** 是需要 Engine 渲染管线层面新增能力的真正差距
6. **Morph 资产规模** 是数据量问题，架构可通过 Market/morph pack 扩展

真正不可替代的架构差距是四项：基础可视化编辑闭环、标准角色资产合同、样条曲线前/侧独立塑形（UI 交互模式）、3D 纹理投射 + Blend Mask（Engine + 纹理创作管线）。其中基础可视化编辑闭环是当前 P0，因为它决定 neko-model 是否先成为可用的模型创作工具。
