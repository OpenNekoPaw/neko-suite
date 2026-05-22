# ADR: 3D Editor Rendering Architecture — WYSIWYG Consistency

## 状态

Proposed (2026-04-27, revised 2026-05-20 — 当前规范收敛为：VSCode Webview 实时视口播放链路仅支持 raw H.264 + WebCodecs + `H264StreamClient`（`container ∈ {h264-annexb, h264-avcc}`、`frameHeader='neko-h264-v1'`、`initData.format='avcc-record'`、`RenderFrameMeta.durationUs` 必填），音频仅支持独立 PCM f32le + `AudioStreamClient`（`/v1/audio/:stream_id`、`frameHeader='neko-pcm-v1'`，作为 A/V 同步 master clock）；不支持 fMP4 / MSE / `FMP4StreamClient` 作为 3D Webview 实时播放路径，也不支持在视频流中夹带音频。neko-engine 内部媒体处理、探测、转码和离线导出能力不受本 ADR 的 Webview 播放链路约束。)

### 2026-05-20 收敛说明：Engine-only Route A

本 ADR 早期章节保留了 2026-04-27 对 R3F/Three.js 过渡期的审计和迁移讨论；这些内容用于解释历史问题，不再代表当前实现允许的 fallback。当前 `neko-model` Webview 是 Engine-only Route A：可见 3D 内容只能来自 Engine H.264 视频流；Webview 不再打包 `R3FDevelopmentFallback`、`Viewport3D`、`ModelLoader`、R3F `TransformGizmo`，也不再依赖 `@react-three/*`、`three` 或 `@pixiv/three-vrm`。

WebCodecs 或 Engine stream 不可用时，UI 必须进入明确的 Route A unavailable 状态；`scenes:capture` 只允许作为非交互质量预览 overlay。短生命周期预测只能作为 2D overlay、projected bounds、gizmo anchor 或诊断信息出现，必须携带 viewportId、sceneRevision 和 seq，并在 ack / SceneDelta / RenderFrameMeta 对齐后清除。任何重新引入 Webview 侧 glTF 解析、材质渲染、动画 mixer 或可见 R3F 模型 fallback 的改动，都需要先更新本 ADR 并通过 Route A 边界测试。

### 阶段 1A 落地说明（2026-04-28）

- Route A 实时视口由 Webview 通过 `EngineClient.startSceneRenderStream(ViewportDescriptor)` 直连 Engine，`scenes:stream` 返回 `RenderStreamDescriptor`，视频 WebSocket 固定消费 raw H.264 access unit，客户端按 `codecString`、`container`、`frameHeader` 和可选 `initData` 初始化 WebCodecs。
- 音频不进入视频包；需要实时音频时使用 `/v1/audio/:stream_id` 与 `AudioStreamDescriptor(codec='pcm-f32le', frameHeader='neko-pcm-v1')`，由 `AudioStreamClient` 独立校验和播放。
- Webview 视觉真值 surface 为 `VideoViewport` 的 canvas / `VideoFrame`，选择框、gizmo、本地预测和诊断信息绘制在独立 `OverlayCanvas`，并用 `RenderFrameMeta.viewportId / frameId / sceneRevision / appliedSeq` 对齐。
- WebCodecs 不可用时不切换到 fMP4/MSE，也不切换到 R3F/Three.js 模型 fallback；UI 进入明确的 Route A unavailable 状态，`scenes:capture` 静态质量预览只作为非交互 overlay。
- Extension Host 只负责 VSCode 能力代理、资源 URI、Engine 端口和低频操作，不承载 60fps SceneDelta、视频包、PCM 包或高频 transform dispatch；边界可用 `node scripts/check-3d-route-a-boundaries.mjs` 校验。

### AI 角色预览场景（2026-05-22）

Neko Model 的 AI 捏脸/角色创作使用 Engine 权威的语义预览场景，而不是恢复已删除的通用顶部相机工具栏。Webview 只显示紧凑的 `Face / Body / Motion / Voice` selector，并通过 `/v1/scenes/control` 的 `viewportCommand` WebSocket 发送 `scene:model:characterPreview:*` 命令；Extension Host 不转发预览模式、播放时钟或高频状态。

Engine 侧 `ModelPreviewController` 负责校验 `characterId / viewportId / baseRevision / modeId`，应用 face、full-body、motion、voice-pack 的相机/渲染 preset，保存每个模式的手动相机 override，并在 reset 时回到对应 preset。motion/voice 预览只在 Engine state 报告兼容资源时暴露播放控制；缺少 demo clip、voice pack、viseme binding 或音频输出时必须作为结构化 diagnostics 返回，不能用 Webview 本地 R3F/HTML audio 假装为权威输出。

视频流仍由 Engine H.264 render stream 承载；`RenderFrameMeta.activePreviewMode / sceneRevision / appliedSeq / previewPlaybackClockMs` 用于让 selector、overlay 和播放状态与实际帧对齐。voice-pack 音频按既有独立 PCM audio stream 模型扩展，不允许把音频 payload 塞进 H.264 视频流。

### 阶段 1B 落地说明（2026-04-28）

- `.nkc` / `.nkcdata` 成为角色 authoring 真值：`LayeredCharacterDescription` 保存 descriptor、definition、behavior、geometry、override、material slot、morph、skin weight 和 blend shape 引用；Engine 将其投影到 ECS，ECS 不反向拥有 canonical morph library、override map 或 skin weight atlas。
- Webview 旧角色面板收敛为控制面：Face、Expression、Bone/IK、Shape/CSG/Text、Animation/Keyframe 和 Inspector 操作编译为 `SceneCommand`、`CharacterCommand` 或 `ModelingSession` 命令，经 `/v1/scenes/control` 直连 Engine；本地 Zustand 只保存带 revision/seq 的镜像和短生命周期 overlay 预测。
- 自由建模进入 `ModelingSession`：笔刷 patch 走 `VertexBrushPatch` 二进制副通道，语义状态走 `SceneDelta.modelingSessions`，拓扑变更走 `TopologyChangeEvent`；`topologyVersion` 同时约束命令、hit-test、projected bounds、本地预测和导出。
- `MeshTopologyMigrationService` 是拓扑提交闸门：仅顶点位置变化可保留 morph/skin/UV；Boolean、Decimate、Dynamic Topology 等会显式迁移或失效，并通过 Overlay/诊断面板提示，禁止静默导出损坏的角色数据。
- Route A Webview 现在是 Engine 渲染结果播放器和控制面：可见 3D 内容只来自 `VideoViewport` 的 Engine H.264 帧；`OverlayCanvas`、`InteractionLayer`、`LocalPredictionLayer` 只负责命令反馈、拾取查询、gizmo anchor、bounds、IK/brush/morph 预测和恢复路径。
- R3F/Three.js 不再作为 `neko-model` Webview 的可见模型 fallback 或预测渲染器；短生命周期预测必须以 Engine 视频之上的 overlay 形式表达，不参与 WYSIWYG 验收、导出、undo/redo 或 authoring commit。
- `CharacterBakingSystem` 是角色导出权威：GLB/VRM/FBX 路径读取 `.nkc`、`.nkcdata`、AssetDatabase、Engine 当前 pose 和 topology migration state；导出器不得读取 GPU cache、Render World 或 Webview prediction。

## 关联 ADR

- 上层依赖：[adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md)、[adr-four-layer-contract.md](./adr-four-layer-contract.md)
- 横向配合：[neko-engine-architecture.md](./neko-engine-architecture.md)、[adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md)、[adr-xr-authoring-runtime-split.md](./adr-xr-authoring-runtime-split.md)
- 参考：[adr-panoramic-image-preview.md](./adr-panoramic-image-preview.md)

---

## 一、背景

neko-model 当前采用 **双渲染器架构**：

```
编辑器预览  → React Three Fiber (Three.js WebGL，运行在 Webview)
Engine 渲染 → wgpu PBR（运行在 Rust sidecar）
导出输出    → wgpu PBR（同 Engine 渲染）
```

这与 UE5 / Unity / Godot 的设计原则背道而驰——三大引擎均采用**编辑器 Viewport 直接运行引擎渲染器**，不存在第二套渲染。

### 1.1 当前数据一致性漏洞全景

经代码审计（2026-04-27），R3F 与 Engine ECS 之间存在以下同步缺口：

| 数据类型 | UI 显示（R3F） | Engine 渲染（wgpu） | GLB 导出 | 结论 |
|---------|-------------|-----------------|---------|------|
| 位置/旋转/缩放 | ✅ | ✅ ECS 读取 | ✅ | 一致 |
| 基础色/金属度/粗糙度 | ✅ Three.js 解析 glTF | ✅ wgpu 读 glTF | ❌ 硬编码默认值 `(0.8,0.8,0.8 / 0.0 / 0.5)` | 材质全丢 |
| 法线贴图 | ✅ Three.js 应用 | ❌ fragment shader 未解包 | ✅ 纹理存在 | 导出有，Engine 不渲 |
| 自发光 | ✅ | ✅ | ❌ | 丢失 |
| AO 贴图 | ✅ | ✅ | ❌ | 丢失 |
| 灯光 | ✅ R3F scene lights | ✅ ECS 读取，GPU 渲染 | ❌ 完全不导出 | 灯光全丢 |
| 相机 | ✅ OrbitControls | ✅ ECS 有 Camera 组件 | ❌ 完全不导出 | 丢失 |
| 骨骼动画 | ✅ useAnimations | ✅ GPU 蒙皮 | ✅ clips + keyframes | 基本一致 |
| MorphWeights | ✅ 面部滑块 | ⚠️ 仅动画驱动 | ⚠️ 只有动画 clip | 静态姿态丢失 |
| IK 状态 | ❌ 无 UI | ✅ FABRIK/CCD 实现 | ❌ 不导出 | 不可用 |
| 可见性 | ✅ | ✅ ECS Visible | ❌ 不导出 | 丢失 |
| 粒子 | ❌ 无 UI | ✅ compute shader | ❌ 不导出 | 不可用 |
| 动画混合状态 | ✅ UI 有权重 | ✅ blend layers | ❌ 不导出 | 不可用 |

### 1.2 渲染视觉差异（编辑器 vs Engine 实际输出）

| 渲染要素 | R3F 编辑器 | neko-engine wgpu | 差异程度 |
|---------|---------|----------------|---------|
| 色调映射 | 无（线性 WebGL） | ACES Filmic 后处理 | **严重** — 颜色冷暖、高光截断完全不同 |
| IBL 环境光 | 无 | 有完整 IBL 管线（shader 未接入） | **严重** — 整体亮度/反射不同 |
| 法线贴图 | ✅ Three.js 应用 | ❌ fragment shader 未解包 | **严重** — 表面细节消失 |
| 阴影 | Three.js 有 | **完全未实现** | **严重** |
| 环境光 | 动态 scene lights | 硬编码 0.03 常量 | 中等 |
| 光源上限 | 无限制 | 最多 16 个 | 低（创意场景影响小） |

### 1.3 同步协议现状

```
数据流向（当前）：

R3F Webview State
  ├─ 变换拖拽  →→→ Engine ECS  ✅ fire-and-forget，无 ack
  ├─ 动画播放  →→→ 仅 Webview  ❌ Engine 完全不知道播放状态
  ├─ Tick delta  Engine → Webview  ❌ SceneDelta 类型存在但从未发送
  ├─ 关键帧 CRUD  双向  ✅ 有 id 确认
  └─ 场景快照  Engine → Webview  ✅ 初始化时一次性拉取

关键漏洞：
  1. 动画状态分裂：R3F 用 AnimationMixer 播放，Engine ECS tick 完全独立
     → export_gltf 导出的是 T-pose，不是当前播放帧
  2. 快照契约空洞：EngineClient.getSceneSnapshot() → Promise<Record<string, unknown>>
     → Webview 有局部 SceneNodeSnapshot，但不是共享契约，且只覆盖最小节点字段
  3. 变换 fire-and-forget：Engine 失败时 R3F 不回滚，两侧静默分叉
```

### 1.4 四层契约视角下的缺口定位

[adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md) 已将 `runtime-scene` 标注为**已四层化**，但本次审计发现四层实际上有两层断裂：

```
四层契约（理论）                    runtime-scene 实际状态
────────────────────────────────────────────────────────────────
L4 Intent       AI 意图映射到场景操作    ✅ 工具定义存在（neko-cut 示范）
                                         ❌ 3D 场景操作无 AgentCapabilityProvider

L3 Orchestration  ISceneService + Tools  ✅ 已实现（35 个 action）
                  WebSocket 有序队列     ❌ 所有操作走 HTTP，无序列化保证

L2 ECS Data     Engine OOP/ECS 是语义真值 ✅ Rust ECS 组件较完整
                TS 侧镜像有类型定义      ⚠️ Webview 有局部类型，EngineClient/共享契约仍是 Record<string, unknown>
                SceneDelta 推送          ❌ Delta 类型定义存在，但从未发送

L1 Feedback     render-error 信号        ❌ engine-feedback-bus 未建立
                animation-conflict 信号  ❌ 无反馈通道
                export-quality 信号      ❌ 无反馈通道
```

**结论**：`runtime-scene` 只完成了 L3 Orchestration；L2 的 TS 镜像类型和 Delta 推送断裂，L1 Feedback 完全缺失，L4 Intent 在 3D 域未注册。这与 [adr-engine-four-layer-audit.md §共享基础设施] 要求先建 `engine-feedback-bus` 的前置条件直接相关——在 `engine-feedback-bus` 就位之前，L1 无法接通。

---

## 二、三大引擎的解法参考

UE5 / Unity / Godot 均采用同一原则：**编辑器 Viewport 直接运行引擎渲染器，不存在第二套渲染。**

```
UE5:
  EditorEngine（继承自 UEngine）
    └─ FViewport → 直接调用 Lumen/Nanite 渲染管线
    数据：UProperty 系统直接写 Actor 属性 → 渲染线程读同一份

Unity（URP/HDRP）:
  SceneView → 调用 RenderPipeline.Render()（与 Build 完全共享代码）
  数据：SerializedProperty → 直接写 Component → 同帧渲染读取

Godot（最接近 neko-suite 的独立引擎）:
  SubViewport → 直接实例化 RenderingServer（Vulkan/OpenGL）
  数据：Object::set() → 直接通知 RenderingServer 同一 RID
  → 编辑器和运行时共享同一个 RenderingID，无"同步"问题
```

**核心模式：**

```
三大引擎共同模式:
  UI Controls
      │ direct property write
      ▼
  Scene Data (Single Source of Truth)
      │                    │
      ▼                    ▼
  Editor Viewport      Runtime/Export
  (same renderer)      (same data)
  → WYSIWYG guaranteed

neko-suite 当前:
  UI Controls
      │ postMessage → HTTP → ECS（异步，有丢失）
      ▼
  Engine ECS ──── 唯一正确数据源
      │                    │
      ▼                    ▼
  R3F Viewport        wgpu Renderer
  (Three.js 材质)      (wgpu PBR)
  → 两套渲染器，永远不一致
```

---

## 二之二、Blender 与捏脸软件对比（character authoring 视角）

UE5 / Unity / Godot 是"游戏引擎 + 编辑器"范式，但 neko-model 实际承担的是 **角色 / 模型 authoring** 工作。这一节对比 Blender、VRoid Studio、MakeHuman / MPFB2、Character Creator 4、Daz Studio、MetaHuman Creator、Ready Player Me 七款 authoring 工具，提取可复用的设计模式与必须避开的反模式。

### 1. 数据模型族谱

业界 character authoring 工具的 SSOT 模型分三族：

```
族 A：反射驱动属性系统（Blender）
  C struct hierarchy（"DNA blocks"）+ RNA reflection
  → RNA 自动生成 Python API、UI、动画通道、library override
  → 一份 schema 同时驱动序列化 / UI / 脚本 / undo

族 B：拓扑锁定 + morph 字典（VRoid / MakeHuman / CC4 / Daz / RPM）
  固定顶点序作为契约 → 所有 morph / 权重 / JCM 按顶点索引键控
  → 编辑参数永不烘焙 vertex,导出时再 bake

族 C：分层 rig 描述（MetaHuman DNA）
  Descriptor / Definition / Behavior / Geometry 四层独立
  → 同一份 DNA 可驱动不同 geometry / runtime
  → Rig Logic 在 CPU >30 FPS 解析 Behavior
```

`runtime-scene` 当前是 ECS 组件运行时，没有对应的 character authoring 描述层；导致面部参数、自定义 morph、JCM 没有稳定的"参数源"。本 ADR 应明确：**neko-model 的 character authoring 数据 SSOT 不是 ECS 组件本身，而是一份与 ECS 解耦的"分层角色描述"**（参见 §3.2 与 §3.9）。

### 2. 编辑器 Viewport 与最终渲染的关系

| 工具 | 编辑器 Viewport | 最终输出 | WYSIWYG |
|------|----------------|---------|---------|
| Blender | Eevee Next（实时光栅 + RT 反射）/ Cycles（路径追踪）— 共享同一份 depsgraph evaluated data | Cycles 或 Eevee | ✅ 内部一致；外部由 glTF 消费者决定 |
| VRoid Studio | 自研 toon shader 视口（模拟 MToon） | VRM + MToon 扩展 | ⚠️ 取决于消费方对 MToon 的实现 |
| MakeHuman / MPFB2 | Blender 视口（MPFB2 寄生于 Blender） | Blender 导出管线 | ✅ |
| CC4 | 自研 PBR + Digital Human Shader 视口 | iClone / Unreal / Unity / FBX | ❌ 皮肤 shader 跨引擎几乎无法保真 |
| Daz Studio | Iray（NVIDIA 路径追踪，视口即终图） | Iray 渲染或导出 | ✅ Daz 内部 |
| **MetaHuman Creator** | **云端 Unreal Engine 通过 Pixel Streaming 推到浏览器** | 经 Quixel Bridge 下载 UE assets | ✅ Viewport 就是 runtime |
| Ready Player Me | 网页 Three.js 预览 | GLB（任何 glTF runtime 消费） | ⚠️ 近似 |

**关键观察**：MetaHuman Creator 与本 ADR Route A 走同一条路——把"引擎本身"作为视口推流给前端，避免双渲染器漂移。Daz / Blender 走另一条路——视口渲染器即生产渲染器，但代价是放弃实时编辑体验。本 ADR 选择 MetaHuman 路径（推流）+ R3F 仅作为交互辅助，方向正确。

**Blender 的 Eevee vs Cycles 漂移警示**：geometry node 的 UV 属性不会传给 Eevee，只到 Cycles——同一份 depsgraph 数据，两个视口结果不同。这正是本 ADR §3.3 禁止"R3F 叠加 Engine 单帧"的反例放大版：即使在同一 SSOT 下、共享数据，两个渲染器仍能漂移。结论：**视频流必须只有一个权威渲染器，R3F 永远只承担非视觉职责**。

### 3. 参数 / Morph 系统

| 类型 | 出处 | 数据结构 | 求值时机 |
|------|------|---------|---------|
| Blendshapes / Morph Targets | RPM / VRoid / MakeHuman / CC4 / Daz / MetaHuman Geometry | `(name, [Δx,Δy,Δz] per vertex)` 或稀疏 | 每帧累加 |
| **JCM**（Joint Corrective Morphs） | Daz Genesis、MetaHuman 内部 | morph + ERC formula：`f(v) = v + c·m + a` | 关节旋转触发，按公式推送 |
| Animated maps + Rig Logic | MetaHuman Behavior | FACS action units → blendshape + 法线 / wrinkle texture blend | CPU 解析 >30 FPS |
| 程序化几何 | Blender Geometry Nodes / ZBrush DynaMesh | 节点图 / 操作图 | 每次 evaluation 重派生 |

**捏脸软件的共同 UI 模式**：每个 morph 是一个 slider，按区域分组（头 / 脸 / 身 / 四肢）；morphs 通过浏览器式 UI 发现。MetaHuman 增加了 blend region picker（拖拽脸部区域在 DNA 预设之间插值），但底层仍是 FACS 控件集。

**对 neko-model 的设计启示**：
- 当前 ECS 已有 `MorphWeights` 组件，但**没有 Morph Library / JCM Formula / FACS Region** 这一层 authoring 抽象
- 应在 AssetDatabase（§3.2）中加 `MorphDescriptor`（name + sparse delta + region tag + JCM formula）作为一等公民
- Inspector 自动从 `MorphDescriptor.regionTag` 生成分组 slider（参考 CC4 / Daz）

### 4. 角色描述层（最强烈的跨产品共识）

**所有成功的捏脸软件都把"可编辑的参数化描述"与"扁平化导出"严格分离**：

| 工具 | 参数源（authoring SSOT） | 烘焙输出 |
|------|-------------------------|---------|
| Daz | `.duf` 场景 + `.dsf` 数据块（gzip JSON）+ Genesis 拓扑 + ERC 公式 | FBX / glTF 烘焙 |
| MetaHuman | DNA 文件（4 层 binary/JSON） | UE Skeletal Mesh + DNA driver node |
| MakeHuman | `.mhm`（小型文本：morph values + proxy + 骨架） | OBJ / FBX |
| VRoid | `.vroid` 项目 | `.vrm`（glTF + MToon + humanoid bones + blendshapes） |
| CC4 | `.iAvatar` / `.ccAvatar` | FBX / glTF |
| Ready Player Me | 服务端参数描述 | 单个 GLB（URL 寻址） |

**共同性质**：
- 编辑参数永远不直接修改 vertex；reload 时由参数 + 公式重建
- 导出是单向 bake；导入烘焙 mesh 不能反向恢复参数
- 参数文件极小（KB 量级），bake 文件大（MB-GB）

neko-model 当前缺这一层。`.nkm` 项目格式已存在，但更接近"场景文件"（节点 + 变换 + 资产引用），不是"角色参数描述"。建议引入 `.nkc`（neko character）格式承载分层描述，详见 §3.9。

### 5. 资产系统对比

| 工具 | 资产抽象 | 引用机制 |
|------|---------|---------|
| Blender | Asset Browser + Linked Libraries + **Library Overrides** | Linked ID 只读；override 存为 `IDOverrideLibrary` 子结构，按 RNA path 记录属性覆盖 |
| Daz | Content Library（`Content/` + `Runtime/` 文件夹树）+ DIM 包管理 | 每个 DSF/DUF 通过 URI 引用其他 DSF；ERC 公式跨文件链接 |
| CC4 | Reallusion Content Store + 项目本地 | Slot 式挂接 |
| MetaHuman | Quixel Bridge / Fab 作为 broker | 下载到 UE 项目 |
| RPM | URL-addressable GLB | `models.readyplayer.me/<id>.glb?morphTargets=ARKit,Oculus` |
| VRoid / MakeHuman | 文件夹组织（preset / proxy / texture） | 顶点映射文件绑定 proxy 到基础拓扑 |

**两个值得借鉴的模式**：

1. **Blender Library Overrides**：作为"在共享基础之上做非破坏性自定义"的工业实现。如果 neko-market 提供模板角色，用户应该能"link 模板 + 仅 override 自己改的字段"，而不是 fork 整个文件。这与 §3.2 AssetDatabase 的 `AssetHandle` + `AssetDescriptor` 天然兼容——override 层就是 override descriptor 字典。

2. **RPM 的 URL-addressable assets**：`http://127.0.0.1:port/v1/assets/<characterId>.glb?morphs=ARKit` 这种 URL 寻址非常适合 VSCode CSP 已放行的本机 HTTP 通道。Webview 可以直接通过 URL 引用 Engine 烘焙的 GLB / 缩略图 / 预览，无需 base64 内嵌或 Extension 转发。

### 6. Undo / 事务模型对比

| 工具 | Undo 模型 | 已知缺陷 |
|------|----------|---------|
| Blender | 单一全局栈混合不同步骤类型；memfile undo 序列化整个 .blend；edit-mode/sculpt 有独立 typed undo step | 跨 mode 边界 bug 多（T82388 / T83806）；社区长期诟病 |
| Daz / CC4 / VRoid | Qt / 自研 command stack | 内部细节不公开 |
| MetaHuman Creator | UE Transactor（typed scoped）通过 Pixel Streaming | 无重大公开问题 |
| ZBrush | 按 level / 按工具独立 undo + 图层历史 | 设计上分隔得更清楚 |

**Blender 文档自己承认**：单一栈混合 differential 与 stateful 步骤是 hot spot；bug 集中在 mode 切换边界。本 ADR §3.2 已规划 SceneTransaction + SceneCommand 作为 undo 单位，等同于 UE Transactor 模型——这是正确方向，不要走 Blender 的单栈路线。

### 7. 扩展性 / 脚本接口

| 工具 | 扩展模型 | 边界 |
|------|---------|------|
| Blender | bpy（RNA reflection 自动暴露 C 端属性） | Add-on 在同进程 |
| Daz | DAZ Script（QtScript）+ C++ SDK；ERC 公式本身就是脚本层 | ERC 病态依赖链问题 |
| CC4 | CC4 起新增 Python API | 闭源 |
| VRoid | 无公开脚本 API | — |
| MetaHuman | UE Python；DNA Calibration 库（BSD-3 开源）支持离线 DNA 编辑 | Poly Hammer 的 Blender add-on 用它实现导入/导出 |
| RPM | REST API + iframe SDK | Web-native |

**对 neko-agent 的启示**：MetaHuman 把 DNA Calibration 作为开源 BSD-3 库分发——这意味着任何外部工具都能离线读写角色参数。如果 neko-engine 把 `.nkc` 解析器和 AssetDatabase 暴露为独立 crate（`neko-character-core`），neko-agent 可以直接读写角色参数，第三方工具也可以集成。这与 ADR §3.7 "引擎独立发布" 完全一致。

### 8. 反模式（业界已踩过的坑）

| 反模式 | 出处 | 教训 |
|--------|------|------|
| 单一 undo 栈混合不同 step 类型 | Blender | 用 typed scoped undo（UE Transactor / SceneTransaction） |
| 两个视口渲染器即使共享 SSOT 也会漂移 | Blender Eevee vs Cycles geometry node UV | 视频流必须只有一个权威渲染器 |
| 把导出格式当 authoring SSOT | 早期 VRoid / RPM 倾向 | 永远保留参数源与 bake 分离 |
| 内嵌脚本作为属性公式 DSL（无 typed schema） | Daz ERC 病态依赖链 | 公式语言要 typed + cycle lint + eager 验证 |
| 拓扑漂移导致 morph 失效 | MakeHuman / Daz / CC4 都强调拓扑契约 | 角色基础拓扑是版本化契约；改变拓扑要走显式迁移 |
| 云端独占（无离线） | MetaHuman 长期问题，DNA Calibration 部分缓解 | 即使主路径走 Engine 推流，参数化描述必须能离线编辑 |
| Blender library override 4 年仍 glitchy | Blender 社区 | override 系统设计要前置（field-level diff + RNA path），不要事后改造 |

### 9. neko-model 的直接借鉴

把上述模式映射到本 ADR：

| 借鉴对象 | 模式 | 落点 |
|---------|------|------|
| **MetaHuman DNA** | 分层角色描述（Descriptor / Definition / Behavior / Geometry） | **§3.9 新增 `.nkc` 格式 + LayeredCharacterDescription 抽象** |
| **Daz DUF + DSF** | 场景预设 + 数据块的双文件模型；URI 跨文件引用 | AssetDatabase 的 `AssetHandle(URI)` + override 层 |
| **Blender Library Overrides** | 共享模板 + 非破坏性覆盖 | neko-market 模板角色 + override descriptor 字典 |
| **Blender RNA reflection** | 一份 schema 驱动 UI / 序列化 / 脚本 / undo | ComponentSchemaRegistry + `.nkc` schema + Inspector 自动生成 |
| **MakeHuman 拓扑契约 + 顶点映射** | 基础 mesh 顶点序作为版本化契约；proxy 通过顶点映射绑定 | base mesh + MorphDescriptor 按顶点索引键控；`.nkc` 含 baseTopologyVersion |
| **CC4 / Daz Slider 分组** | 按 region tag 自动生成 slider 组 | `MorphDescriptor.regionTag` → Inspector 分组 |
| **MetaHuman Pixel Streaming** | 编辑器视口直接推流 | 已对齐：Route A scenes:stream |
| **MetaHuman DNA Calibration（BSD-3）** | authoring 库独立分发 | `neko-character-core` crate 独立可用，支持离线编辑与 Agent 集成 |
| **RPM URL-addressable assets** | 通过 URL + 查询参数引用资产 | `http://127.0.0.1:port/v1/assets/<id>.glb?morphs=ARKit` |
| **JCM ERC formulas（typed 版）** | 关节驱动 morph，但带 cycle lint | 后续 ADR；本 ADR 只在 §3.9 留接口 |

**有一个跨工具的明确反例需要本 ADR 显式拒绝**：单一 undo 栈混合 step 类型。本 ADR §3.2 的 SceneTransaction / SceneCommand 已经是 typed scoped undo 模型，方向正确，不要回退到 Blender 模式。

---

## 三、决策

### 3.1 目标架构：分层混合，渐进迁移至引擎主导

```
┌──────────────────────────────────────────────────────────────┐
│ 交互层（Webview 本地，零延迟）                                │
│  OrbitControls 相机控制、Gizmo 预测、2D overlay（辅助线/标注）│
├──────────────────────────────────────────────────────────────┤
│ 同步层（WebSocket 有序操作队列）                              │
│  变换、IK target、材质参数、光源、相机参数                    │
├──────────────────────────────────────────────────────────────┤
│ 渲染层（Engine 帧流）                                         │
│  高质量 PBR 结果、IBL、阴影、动画播放、粒子                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 OOP Authoring + ECS Runtime + GPU 常驻运行时分层

本 ADR 采用 **OOP 场景对象模型 + ECS 组件运行时 + GPU 常驻后端**，而不是纯 OOP 或纯 ECS。OOP 和 ECS 都是游戏引擎的核心设计范式，不是“接口层 / 实现层”的上下游关系；API / Contract 只负责把这两个核心模型以命令、查询、快照和 Delta 的形式暴露给编辑器、Agent、插件和外部进程。

#### 三大引擎的 OOP + ECS 混合范式

```
Unity DOTS              UE5                     Godot 4
──────────────────      ──────────────────────  ──────────────────────
MonoBehaviour (OOP)     AActor (OOP)            Node 树 (OOP)
      │ Baker                │ 并行运行                │ RID 映射
      ▼ 单向 Bake             │                        ▼
Entity/Component        Mass Entity (ECS)        RenderingServer
      │                 （用途分开，不互转）       PhysicsServer
      ▼                       ▼                  （内部 data-oriented）
ECS Systems             Mass Processor          [对外不可见]

共同规律：
  OOP 层  → 生命周期、资产引用、编辑时状态、Inspector 可见属性
  ECS 层  → 每帧仿真、批量计算、SoA 布局、System 流水线
  OOP→ECS → 单向流动（Unity：Bake；UE5：Actor 通知 Mass；Godot：Node 写 RID）
  ECS 不反向持有 OOP 引用
```

**对 neko-engine 的启示**：OOP Authoring Model 不是"对外 API"，也不是 ECS 的薄接口包装，而是引擎内部的**核心场景对象模型**——`Scene`、`SceneNode`、`Material`、`Light`、`Camera` 这些对象封装生命周期、层级、资产引用、编辑语义、事务、Undo/Redo 和 Inspector 可见属性。ECS 是并列的核心运行时模型，负责组件化状态、批量计算、动画、IK、Dirty 标记和渲染提取。当前 `BevySceneWorld` 直接暴露 ECS 操作（`update_transform(entity_id, ...)`），没有稳定的场景对象模型——这是 TS 侧只能拿到 `Record<string, unknown>` 的根因之一。

核心模型边界：

```
OOP 场景对象模型（当前缺失）      ECS 组件运行时（已有）
─────────────────────────        ──────────────────────────────────
SceneNode {                 →    Entity + Transform + MeshRef
  transform: Transform,         + MaterialRef + Visible + ...
  mesh: MeshHandle,
  material: MaterialHandle,
  children: Vec<NodeId>,
  fn set_transform(...)    →    SceneCommand → CommandApplySystem
  fn attach_child(...)
}

Material {                  →    Entity + MaterialDesc + TextureRef
  base_color, metallic,         + NormalMap + EmissiveFactor
  roughness, normal_map,
  fn update_param(...)     →    SceneCommand → ECS MaterialDesc
}
```

现有文档已经具备若干片段：

- [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md) 定义了 `ISceneService`、`SceneWorld`、`ArtifactSnapshot` 等 trait / service 外壳。
- `runtime-scene` 已以 `bevy_ecs` 表达 `Transform`、`MeshRef`、`MaterialRef`、`Light`、`Camera`、`Skeleton` 等组件。
- `engine-kernel` 的 `PbrRenderer` / `AssetCache` / `gpu_export_pipeline` 已承担 GPU 渲染和 zero-copy 导出路径。

缺失的是一段明确的组合说明：**引擎内部需要 OOP 场景对象模型表达 authoring 语义；ECS 组件运行时承载高频计算与状态提取；对编辑器、Agent 和插件暴露的是对象引用、命令和查询契约；渲染数据常驻 GPU；导出读取 OOP/ECS authoring 元数据而不是从 GPU cache 反向读回。**

```
Editor UI / Agent Tools / Plugin API
        │  OOP object model references: SceneDocument / SceneNodeHandle / MaterialHandle
        ▼
ISceneService / SceneCommandQueue
        │  command: transform / setMaterial / setLight / animate / export
        ▼
runtime-scene ECS（component/runtime SSOT）
        │  components: Transform / MaterialDesc / MeshRef / Light / Camera / Visible
        │  systems: transform propagation / animation tick / IK / dirty marking
        ▼
SceneGpuRuntime（derived GPU cache, zero-copy）
        │  GPU-resident mesh buffers / material buffers / textures / bind groups
        │  dirty generation: ECS metadata → GPU buffer/texture update
        ▼
PBR Renderer → GPU color convert → raw H.264 WebSocket / export encoder
```

职责边界：

| 层 | 职责 | 禁止事项 |
|----|------|----------|
| OOP 场景对象模型 | 生命周期、层级、资产引用、编辑语义、事务、Undo/Redo、Inspector 可见属性；给 UI、Agent、插件提供对象式引用和命令入口 | 不复制一份可分叉的 transform/material 事实；不绕过命令队列直接改 GPU |
| ECS 组件运行时 | 组件化 authoring/runtime 状态、批量计算、动画、IK、dirty、delta、render extraction、导出元数据 | 不把 `wgpu::Buffer` / `BindGroup` 作为普通 authoring 组件暴露给上层；不反向持有 OOP 对象引用 |
| GPU 后端 | Mesh/材质/纹理常驻 GPU；按 dirty generation 增量更新；渲染、编码、流式输出尽量 zero-copy | 不作为导出器的元数据事实来源；不要求 GPU→CPU 读回后再写 glTF |

这意味着 `runtime-scene` 作为 3D 场景域可以拥有 GPU 后端，但 OOP/ECS 核心模型必须通过清晰契约隔离后端对象。长期形态可以拆成：

```
runtime-scene-core      ECS components / systems / snapshot / exporter metadata
runtime-scene-gpu       SceneGpuRuntime / PBR backend / GPU resource residency
engine-kernel bridge    encoder / stream registry / hardware zero-copy integration
```

短期若继续保留在 `engine-kernel::SceneService` 内，也必须遵守同一规则：`AssetCache` 是从 ECS/资产描述派生出来的 GPU cache，不是 authoring 元数据真值。

#### Simulation World 与 Render World 隔离

Bevy / Unity Entities Graphics / UE5 都把 ECS 世界拆为 **Simulation World**（authoring + 仿真）和 **Render World**（渲染线程独占的 SoA 视图），通过单向 Extract 阶段从 Simulation World 拷贝到 Render World，避免渲染线程与 authoring 命令竞争。neko-engine 必须遵守同一隔离：

```
Simulation World（runtime-scene authoring/runtime ECS）
        │ extract phase（每帧 / 每次 dirty generation）
        ▼
Render World（render-only entities + GPU handles + draw lists）
        │
        ▼
RenderGraph / PBR passes / encoder
```

强约束：

- **Render World 不持有 Simulation World 组件引用**——只持有抽取出的 SoA 数据、GPU handle、material id、bone palette pointer。
- **Simulation World 的 authoring 组件不持有 `wgpu::Buffer` / `wgpu::Texture` / `wgpu::BindGroup`**。GPU 资源句柄属于 `SceneGpuRuntime` / Render World，authoring ECS 只能持有 `MaterialId` / `MeshId` / `TextureHandle` 等抽象 ID。
- **Extract phase 是单向的**：只能从 Simulation 写到 Render；Render 不能反向修改 Simulation。命令 ack、render frame meta 通过事件总线回到 Simulation，而不是通过共享内存。
- **导出器只读 Simulation World + AssetDatabase**，永不读 Render World 或 GPU cache。

短期实现里如果只有一个 ECS world，必须用 component query 边界 + system label 区分 simulation system 与 render extract system；长期在 `runtime-scene-core` / `runtime-scene-gpu` 拆包时自然落到双 world 模型。

#### AssetDatabase：authoring 资产真值

ECS 中的 `MeshRef` / `MaterialRef` / `TextureRef` 只是资产 ID 的指针，背后必须有一个独立的 **AssetDatabase**（对应 UE `UAsset` / Unity `AssetDatabase` / Godot `ResourceLoader`）：

```
AssetDatabase
  ├─ AssetHandle(GUID)
  ├─ AssetMetadata（type / source path / import settings / dependencies / version）
  ├─ AssetDescriptor（MaterialDesc / MeshDesc / TextureDesc / LightProbeDesc / ...）
  └─ AssetCache（GPU residency, derived buffers/textures, baked artifacts）
```

- AssetDescriptor 是 authoring 真值：导出器、Inspector、序列化、远程同步全部读这一份。
- AssetCache 是从 Descriptor 派生的 GPU 缓存，可被驱逐和重建。
- Simulation ECS 持有 `AssetHandle`，Render World 在 extract 时把 handle 解析成 GPU resource pointer。
- 烘焙产物（lightmap / probe / cooked texture）作为新的 AssetDescriptor 写回 AssetDatabase，不是塞进 GPU cache。

P0 导出器修复因此分两步：先建立最小 AssetDatabase（GUID + MaterialDescriptor + TextureRef），再让 exporter 读它而不是读 GPU `asset_cache` 或写硬编码默认值。这条依赖关系在 §五 P0 优先级中显式列出。

导出器修复因此不能走“从 GPU `asset_cache` 读回材质”的方向。正确路径是补齐 `MaterialDesc` / texture reference / light / camera 等 ECS 或资产元数据，再由：

- 渲染：ECS/资产元数据 → GPU cache
- 导出：ECS/资产元数据 → glTF JSON / BIN
- 预览/流：GPU cache → render target → GPU color convert / encoder

共享同一份语义数据，避免 CPU-GPU 往返和后端对象泄漏。

#### OOP Authoring Model 开发方案

OOP 层是 **面向场景 authoring 的核心对象模型**，不是单纯接口层，也不是 ECS 的实现细节。它表达 `Scene`、`SceneNode`、`Material`、`Light`、`Camera` 等对象的生命周期、层级、资产引用、编辑语义和事务边界。面向 Webview、Agent、插件和脚本暴露的 `SceneNodeHandle` / `MaterialHandle` 是该对象模型的引用层：可以持有句柄、缓存和 revision，但不能保存一份会与 ECS 分叉的可变场景事实。

| 对象 | 所在侧 | 职责 | 禁止事项 |
|------|--------|------|----------|
| `SceneDocument` | OOP Authoring Model / Webview handle | 管理 sceneId、revision、selection、事务、控制 WS 生命周期 | 不保存会与 ECS 分叉的节点组件副本 |
| `SceneNodeHandle` | Webview / Agent API | 提供 `setTransform()`、`setVisible()`、`delete()` 等对象式 API | 不直接写 Zustand 或 ECS；只产生 `SceneCommand` |
| `MaterialHandle` | Webview / Agent API | 暴露材质 slot、参数、纹理引用和编辑命令 | 不从 GPU `AssetCache` 读取 authoring 数据 |
| `CameraHandle` | Webview / Agent API | 管理 active camera、camera rig、viewport matrix、镜头切换 | 不把相机交互锁死到视频帧回环 |
| `AnimationController` | OOP Authoring Model / Webview handle | 播放、暂停、seek、blend、scrub；状态进入 Engine ECS | 不让 R3F `AnimationMixer` 成为播放事实来源 |
| `SceneTransaction` | OOP Authoring Model / Webview handle | 包装 begin/update/end/cancel，服务拖拽、Undo/Redo 和本地预测 | 不把连续 update 全量写入历史栈 |
| `ComponentSchemaRegistry` | 共享层 | 给 Inspector、Agent、蓝图提供字段、类型、范围、枚举、默认值 | 不用 ad hoc `Record<string, unknown>` 驱动属性面板 |

OOP 方法必须编译成命令：

```ts
class SceneNodeHandle {
  constructor(
    private readonly scene: SceneDocument,
    readonly nodeId: string,
  ) {}

  setTransform(transform: TransformPatch): Promise<SceneCommandAck> {
    return this.scene.command({
      type: 'transform',
      payload: { nodeId: this.nodeId, transform },
    });
  }
}
```

OOP 层开发顺序：

1. **共享 ID 与 revision**：所有 handle 只以 `sceneId + nodeId + revision` 定位对象；stale handle 必须能检测。
2. **命令化对象方法**：`SceneNodeHandle` / `MaterialHandle` / `CameraHandle` 的方法全部产出 `SceneCommandEnvelope`，经 `/v1/scenes/control` 发送。
3. **事务与 Undo/Redo**：连续交互使用 `SceneTransaction`，记录 before/after delta；Undo/Redo 也是命令，不直接修改 UI state。
4. **Schema 驱动 Inspector**：组件字段来自 `ComponentSchemaRegistry`，Inspector 自动生成控件，修改字段时产生 typed command。
5. **Agent / 插件复用同一对象模型**：Agent 不直接操作 ECS 查询，也不直接改 Webview store；它通过同一套 OOP object API 生成命令和查询，保证审计和回滚。

推荐的 OOP API 形态：

```ts
interface SceneDocument {
  readonly sceneId: string;
  readonly revision: number;
  node(id: string): SceneNodeHandle;
  material(id: string): MaterialHandle;
  camera(id: string): CameraHandle;
  beginTransaction(label: string): SceneTransaction;
  command(command: SceneCommand): Promise<SceneCommandAck>;
  query<T extends SceneQuery>(query: T): Promise<SceneQueryResult<T>>;
}
```

这层的核心价值是 **表达 authoring 语义、稳定对象身份、支持事务与审计**；它不是性能关键路径，也不能复制一份与 ECS 分叉的高频组件事实。

#### ECS 层开发方案

ECS 层是组件事实与运行时计算的 SSOT，负责保存组件、执行系统、生成 delta，并驱动 GPU 派生缓存。OOP 场景对象模型负责 authoring 语义和对象身份，ECS 负责组件化事实和高频系统执行，两者共同构成 Engine 侧场景语义真值。当前 `runtime-scene` 已有 `bevy_ecs`、`Transform`、`GlobalTransform`、`MeshRef`、`MaterialRef`、`Light`、`Camera`、`Visible`、`MorphWeights`、`Skeleton`、Animation、IK、CSG 等基础，下一步要补的是 revision、dirty、schema 和命令应用边界。

推荐 ECS 结构：

| 类型 | 示例 | 职责 |
|------|------|------|
| Authoring Components | `Transform`、`MaterialRef`、`Light`、`Camera`、`AnimationTarget`、`Visible` | 场景事实，参与序列化、导出、Inspector |
| Derived Components | `GlobalTransform`、`Bounds`、`RenderLayer`、`ProjectedBounds` | 可重算数据，可由系统生成 |
| Resources | `SceneRevision`、`NodeIndex`、`DirtyTracker`、`ActiveCamera`、`SelectionState`、`PlaybackState` | 全局状态、索引和增量跟踪 |
| Events | `SceneCommandEvent`、`TransformChanged`、`MaterialChanged`、`RenderInvalidated` | 系统之间解耦 |
| Systems | command apply、transform propagation、animation tick、IK、dirty marking、delta extraction、render extraction | 按阶段执行 |

ECS 执行阶段：

```text
Command Intake
  → ValidateCommandSystem
  → ApplyCommandSystem
  → SceneRevision += 1
  → TransformPropagation / Animation / IK / Physics
  → DirtyMarkingSystem
  → DeltaExtractionSystem
  → RenderExtractionSystem
  → SceneGpuRuntime update
```

命令进入 ECS 的 Rust 侧形态：

```rust
pub enum SceneCommand {
    SetTransform { node_id: String, transform: TransformPatch },
    SetMaterialParam { node_id: String, slot: String, value: MaterialValue },
    SetActiveCamera { camera_id: String },
    PlayAnimation { clip: String, time: f32, looped: bool },
    DeleteNode { node_id: String },
}

pub struct CommandApplyResult {
    pub applied_seq: u64,
    pub revision: u64,
    pub dirty: SceneDirtySet,
}
```

ECS 层开发顺序：

1. **NodeIndex**：建立 `SceneNodeId → Entity` 索引，禁止每次命令全量扫描 world。
2. **SceneRevision**：任何 authoring 变更递增 revision；snapshot、delta、hit-test、renderFrameMeta 都带 revision。
3. **DirtyTracker**：记录 transform/material/camera/animation/bounds/render dirty，不每帧全量导出。
4. **CommandApplySystem**：所有 OOP/API 命令统一进入 command apply，不允许 controller 直接改组件。
5. **DeltaExtractionSystem**：从 dirty set 生成 `SceneDelta`，字段与 TS 共享契约对齐。
6. **ComponentSchema**：为组件字段补 schema，服务 Inspector、Agent、蓝图和迁移。
7. **RenderExtractionSystem**：把 ECS authoring 数据转成 GPU 更新命令，输入 `SceneGpuRuntime`，不暴露 wgpu 对象给 ECS 上层。

开发边界：

| 问题 | 正确做法 |
|------|----------|
| UI 改 transform | `SceneNodeHandle.setTransform()` → `SceneCommand` → ECS `Transform` |
| Inspector 改材质 | schema field edit → `SetMaterialParam` → ECS `MaterialDesc` / asset metadata |
| 播放动画 | `AnimationController.play()` → ECS `PlaybackState` → animation system tick |
| Undo/Redo | 重放 inverse command 或 before/after delta，不直接改 Webview store |
| 导出 GLB | 读取 ECS / asset metadata，不读 GPU cache |
| 渲染视频 | ECS dirty → GPU cache update → render/encode，不让 Webview 重渲染 PBR |

OOP 场景对象模型与 ECS 组件运行时的写入关系应保持单向：

```text
OOP object model / Agent / Plugin / Inspector
        │ command/query
        ▼
SceneCommandQueue
        │ validate/apply
        ▼
ECS components/resources/systems（SSOT）
        │ delta/snapshot/render extraction
        ▼
OOP cache / Zustand / Overlay / GPU runtime
```

如果出现“Webview OOP 对象持有一份 transform，ECS 也持有一份 transform”，就会重新引入双写问题。正确策略是：OOP 层可以缓存最新 snapshot，但必须用 `revision` 标记，过期即丢弃或 resync。

### 3.3 三条演进路径

**Route B（当前）：Engine 输出场景数据，Three.js 渲染**

- 适用阶段：过渡期，快速迭代 UI 功能
- 缺陷：双渲染器永远存在画质差异，不可接受作为长期方案

**Route C（近期目标）：切换式质量预览，不做混合叠加**

```
日常编辑  → R3F 预览（零延迟，几何 + 交互）
质量预览  → 用户主动触发 Engine capture 单帧（PBR + IBL + 未来阴影），整屏切换显示
最终导出  → Engine 全量渲染
```

`render_frame` 路径已存在，但 `scenes:capture` 当前只返回渲染元数据，尚未返回可显示的 PNG/JPEG/视频帧。Route C 要落地仍需补齐输出载体，且不应默认走 RGBA CPU readback；优先复用 `gpu_export_pipeline` 的 GPU color convert / 编码路径生成可展示帧。

**禁止把 Engine 单帧叠加在 R3F 之上**：R3F 当前在线性 sRGB 空间无 tone mapping 输出，Engine 走 ACES Filmic + IBL，二者颜色空间和高光范围都不同，叠加会产生用户视觉错乱（高光双倍、颜色冷暖跳变、半透明伪影）。Route C 的正确形态是“按下按钮 → 整屏切换到 Engine 帧 → 松开返回 R3F”，类似 Marmoset Toolbag / Substance Painter 的 IBL 预览模式。

**Route A（长期目标）：纯流模式**

`scenes:stream` 当前未实现，是整个 WYSIWYG 承诺的基础条件。Route A 在 VSCode Webview 侧只有一条规范播放栈：**raw H.264 + WebCodecs + canvas / VideoFrame**。3D Webview 实时播放链路不支持 fMP4 / MSE / `FMP4StreamClient`，也不把 Engine 视口包装成 `<video>`。

```
Engine wgpu 渲染 → GPU color convert / zero-copy 编码 → WebSocket
  → raw H.264 access unit（Annex B / AVCC）
  → WebSocket binary frameHeader='neko-h264-v1'
  → H264StreamClient
  → WebCodecs VideoDecoder
  → canvas / VideoFrame presentation surface
  → OverlayCanvas 绘制辅助线 / Gizmo / selection
```

`packages/neko-client/src/H264StreamClient.ts` 已经实现这条 raw H.264 播放栈，但当前仍有硬编码 codec 默认值。Route A 必须显式声明 `scenes:stream` 只走 `H264StreamClient`，不能 fallback 到 fMP4 / MSE，也不能模糊地说"WebSocket → `<video>`"。

> `avc1.42001f` 是 `H264StreamClient` 在 `RenderStreamDescriptor` 落地之前的硬编码默认值，仅用于描述现状。迁移完成后 codec 由 descriptor 动态下发（详见 §10.1 `codecString` 字段、§10.2 B6 / §10.3 W2/F5 验收）。新代码禁止再硬编码任何 `avc1.*`。

#### 场景适配（所有场景共用 raw H.264 + WebCodecs）

| 场景 | 同一播放栈下的差异 | 备注 |
|------|------------------|------|
| 实时编辑 viewport（拖拽 / Gizmo / 笔刷预测） | 高 FPS（60fps）/ 低 GOP / Annex B 容器 | 单帧解码可控延迟,易与 OverlayCanvas 像素级对齐 |
| Lookdev / render-preview 视口 | 中 FPS（30fps）/ 较大 GOP / 高 profile | 仍复用同一 `VideoViewport` 组件,避免双渲染/双解码路径漂移 |
| 动画预览 + 配音 / 旁白 | 视频栈不变；并行启用独立 PCM 音频流 | `AudioStreamClient.getCurrentTime()` 是 master clock,视频按 `RenderFrameMeta.ptsUs` 对齐 |
| WebCodecs 不可用的运行环境 | Route A 不可用 | 降级到 `scenes:capture` 静态预览或提示环境不支持实时 Engine Viewport（不切换到其他播放栈） |

#### 长期方向

为了避免在 Engine 和客户端硬编码 codec / packetization，`RenderStreamDescriptor` 必须携带足够元数据让客户端动态初始化 WebCodecs（详见 §10.1）。多视口下不同视口可以选择不同分辨率、FPS、profile、bitrate 和 post-process quality，但都使用同一条 raw H.264 WebCodecs 播放栈。

#### 音视频输出栈约束（VSCode Webview 实时播放链路）

**约束作用域**：本节仅约束 **VSCode Webview 实时视口播放链路**，即 `H264StreamClient` / `AudioStreamClient` 通过 WebSocket 直连 neko-engine 消费的实时帧流。**neko-engine 自身的媒体处理 / 探测 / 离线导出能力（H.265 / VP9 / AV1 / AAC / Opus / fMP4 等）不受本 ADR 限制**，`runtime-media` / FFmpeg 管线、`scenes:export_gltf` 之外的视频导出、文件转码等保持现有能力。

| 通道（Webview 实时播放） | 编码 | 容器 | 客户端 | wire 协议 |
|------------|------|------|--------|-----------|
| 视频流 | H.264 | 无（raw access unit） | `H264StreamClient` + WebCodecs | `frameHeader='neko-h264-v1'`：25 字节固定头 + Annex B / AVCC NAL |
| 音频流 | **PCM f32le（不编码）** | 无 | `AudioStreamClient` + Web Audio API | `frameHeader='neko-pcm-v1'`：22 字节固定头 [pts_us i64][duration_us i64][sample_rate u32][channels u16] + interleaved f32le |

**约束清单（仅 Webview 实时播放链路）**：

1. **Webview 视频不引入 H.265 / AV1 / VP9**：H.264 baseline / main / high 配置已经覆盖编辑器 + 互动影游所有场景；新增编码会破坏 WebCodecs 兼容性矩阵和 Engine 端硬件编码器选型。**离线导出 / 转码不受此约束**——这些场景由 neko-engine 媒体管线按其自有能力决定。
2. **Webview 音频不引入 Opus / AAC 编码**：`AudioStreamClient` 直接消费 PCM f32le 写入 `AudioBuffer`，无解码步骤；Web Audio API 时钟即主时钟（A/V sync 的 reference clock），引入编码会重新引入解码缓冲与时钟偏差。**离线音频文件导出不受此约束**。
3. **Webview 实时链路不支持 fMP4 / MSE**：3D `scenes:stream` 不返回 fMP4 init segment / media segment，不创建 `FMP4StreamClient`，不接受 `frameHeader='neko-fmp4-v1'`，也不允许在 fMP4 容器内夹带任何视频或音频载荷。fMP4 如用于离线导出或其他媒体预览，属于本 ADR 范围外。
4. **A/V 同步主时钟**：`AudioStreamClient.getCurrentTime()` 是 master clock，视频栈按 `RenderFrameMeta.ptsUs` 对齐到这个时钟。视频流不依赖容器时序。
5. **新视口 / 新流不可绕过**：3D `scenes:stream` 创建的视频流必须使用 raw H.264 + WebCodecs，需要音频时另起 PCM 流（按 §3.5 通道分层），不允许引入 fMP4 / MSE 等其他播放路径。

#### 3D 域音频接入策略

阶段 1（建模 + 渲染）**不需要音频**——参数化编辑、自由建模、lookdev 都是纯视频流。阶段 2（互动影游）的动画预览 + 配音 / 旁白才会接入：

| 场景 | 音频接入方式 |
|------|-------------|
| 阶段 1 编辑 viewport / 雕刻 / lookdev | 不输出音频流 |
| 阶段 1 动画预览（仅口型 / 节拍指示音） | 可选接入 PCM 流；非主路径 |
| 阶段 2 互动作品播放预览 | 主路径接入 PCM 流；视频栈仍走 H.264 |
| 阶段 2 / 3 spatial audio（3D 听感） | `runtime-audio` 扩展，仍以 PCM f32le 输出到客户端，spatial 计算在 Engine 内完成 |

`RenderStreamDescriptor` 在视频流 descriptor 之外，可携带可选 `audioStream?: AudioStreamDescriptor` 引用一条独立 PCM 流（详见 §10.1）。视频流和音频流在 wire 上始终是两条 WebSocket，不复用同一条二进制通道。

#### 迁移债清单（Webview 实时播放链路）

下面是 Webview 实时播放链路当前**不符合**约束的实现，必须在阶段 1A 内完成迁移：

| 迁移项 | 当前状态 | 目标状态 | 工作包 |
|--------|---------|---------|--------|
| 音频流复用 `/v1/streams/:stream_id` | 路径与视频共用 | 新增 `/v1/audio/:stream_id`；客户端按 URL 选择 client；`/v1/streams` 短期接受音频以便兼容 | B6-A |
| `EngineClient` 把 `audioStreamId` 拼到 `/v1/streams/...` | 共用 helper | 新增 `getAudioWsUrl()` helper，与 `getStreamWsUrl()` 分离 | B6-A |
| `H264StreamClient` 硬编码 codec `avc1.42001f` | client 内常量 | 由 `RenderStreamDescriptor.codecString` 注入，client 不内嵌 codec 常量 | W2 |
| `FMP4StreamClient` 曾被纳入 3D 视口候选路径 | fMP4 / MSE 不满足本 ADR Webview 实时链路约束 | 从 3D `VideoViewport` / `scenes:stream` / `RenderStreamDescriptor` 规范路径移除 | W2 / B6 |
| `AudioStreamClient` 无 descriptor 校验 | 接受任意 PCM 头 | 接收 `AudioStreamDescriptor` 并校验 `codec='pcm-f32le'` / `frameHeader='neko-pcm-v1'`，非法值拒绝 | W2-A |

> 这些是 **Webview 实时播放链路** 的迁移债。neko-engine 内部的媒体处理 / 转码 / 离线导出能力**不在迁移范围**——例如 `runtime-media` 仍可处理 H.265 / AAC 文件，`scenes:capture` 单帧若按 PNG 输出也不受影响。

### 3.4 纯流模式的操作连贯性保证

纯流模式下操作连贯性依赖三个机制：

**机制 1：本地预测 + 服务端校正（Client-side Prediction）**

```
用户拖拽 Gizmo
  ├─ 本地立即在 VideoViewport 上方的 OverlayCanvas 绘制选中 mesh 的预测投影
  ├─ 同时通过 WebSocket 发送有序操作到 Engine
  ├─ Engine 帧到达后：清除预测 overlay,VideoViewport 切换显示真实 PBR 帧
  └─ 若 Engine 帧与预测偏差 > 阈值：平滑插值修正
```

> VideoViewport 是 presentation surface 抽象，在 Webview 实时链路中固定为 `<canvas>` + WebCodecs `VideoFrame` 写入（详见 §3.3）。预测 overlay 必须画在独立的 OverlayCanvas 上，**不能**对 canvas 本身做 CSS transform，因为 canvas 在每帧 redraw，CSS transform 会被新帧覆盖并与 frame meta 对齐关系漂移。

**机制 2：操作队列 + 序列号（防乱序）**

```
所有交互操作走 WebSocket（天然有序），替代 HTTP dispatch。
每个 dispatch 带 seq 号，Engine 丢弃 seq < lastApplied 的请求。
```

**机制 3：2D overlay 处理交互（OrbitControls 不走流）**

```
OrbitControls 相机旋转：本地驱动 CameraParams → Engine 接受
（Engine 不能主导相机，否则延迟不可接受）
Gizmo、选中框、辅助线：<canvas overlay> 本地绘制（零延迟）
```

不同操作类型的连贯性评估：

| 操作类型 | 纯流可行性 | 所需机制 |
|---------|-----------|---------|
| 点击选择 | ✅ | Hit-test 在 Engine 做，返回 nodeId |
| 属性面板数值输入 | ✅ | 单次 dispatch，无连续帧需求 |
| Gizmo 拖拽 | ⚠️ 需本地预测 | 2D overlay + 服务端校正 |
| 时间轴 seek | ✅ | seek 操作，非连续帧 |
| 相机旋转（Orbit） | ❌ 延迟不可接受 | **必须本地做**，Webview 驱动 CameraParams |
| 骨骼 IK 拖拽 | ⚠️ 需本地预测 | 同 Gizmo |
| 动画预览播放 | ✅ 最适合纯流 | Engine tick → 帧流，完美契合 |

### 3.5 VSCode Webview + Engine 数据通道分层

3D 编辑器不能把控制命令、场景状态和渲染像素压进同一条链路。三类数据的生命周期完全不同：

- **控制命令**：用户意图和 VSCode 集成事件，数据小，需要错误处理和 ack。
- **场景状态流**：ECS 语义 delta，数据中等，需要 revision / seq 保序，可以按 dirty state 合并。
- **视频帧流**：Engine PBR 渲染结果，数据大，必须走 GPU render target → color convert / encoder → browser decoder，避免 CPU RGBA 往返。

当前拓扑应按如下方式收敛：

```
VSCode Webview（VideoViewport / OverlayCanvas / R3F fallback）
  │
  ├─ VSCode postMessage JSON
  │     ▼
  │   Extension Host
  │     ├─ VSCode 文件、对话框、命令、webview.asWebviewUri()
  │     └─ EngineClient.dispatch() → HTTP POST /v1/dispatch（低频管理面）
  │
  └─ Direct Engine connection（CSP 已允许 127.0.0.1）
        ├─ /v1/scenes/control          JSON/MessagePack SceneCommand / Ack / Delta / Query / RenderFrameMeta（目标新增）
        ├─ /v1/streams/:stream_id      Binary 视频帧流（raw H.264，frameHeader='neko-h264-v1'）（已存在,继续承载视频）
        ├─ /v1/audio/:stream_id        Binary 音频帧流（PCM f32le，frameHeader='neko-pcm-v1'）（目标新增,详见 B6-A）
        ├─ /v1/puppets/stream          JSON PuppetDelta（已有状态流参照）
        └─ /v1/scenes/stream           创建或控制 Engine Viewport 渲染流（视频 + 可选音频）（目标新增）
```

> **现状**：当前 `host-http` 仅注册 `/v1/streams/:stream_id`（packages/neko-engine/packages/host-http/src/routes/mod.rs），音频流也复用同一路径；`EngineClient.createStream()` 把 `audioStreamId` 拼到 `/v1/streams/...`。`/v1/audio/:stream_id` 是**目标新增通道**，并不存在；迁移工作在 B6-A 工作包。短期可继续在 `/v1/streams/` 下区分 stream id 承载音视频，但长期必须分路径以便：(a) 路由层校验 frameHeader 与通道匹配；(b) 客户端按 URL 选择 `H264StreamClient` / `AudioStreamClient`；(c) 监控 / 日志按通道分类。

通道职责对比：

| 通道 | 当前实现 | 适合承载 | 不适合承载 | 架构结论 |
|------|----------|----------|------------|----------|
| Webview ↔ Extension `postMessage` | `ready`、`loadModel`、`sceneSnapshot`、`updateTransform`、VSCode 文件导入/保存 | VSCode API 代理、文件 URI、启动编排、低频 UI 事件、错误提示 | 60fps delta、H.264 packets、RGBA 帧、大型 mesh/texture 二进制 | 只做 VSCode 控制面和生命周期编排，不作为高频流中转 |
| Extension ↔ Engine HTTP dispatch | `EngineClient.dispatch()` → `/v1/dispatch`，`scenes:load/export_gltf/save_project` 等 | 导入导出、保存、一次性查询、兼容现有 action registry | Gizmo 拖拽、相机连续更新、动画播放 tick、需要严格保序的命令流 | 保留为低频管理面；交互控制不走 HTTP |
| Webview ↔ Engine scenes control WS | 目标新增 `/v1/scenes/control` | SceneCommand、SceneCommandAck、SceneDelta、hit-test、snap、projected overlay、render revision、错误反馈 | 渲染像素、每帧完整场景快照、每帧全量 mesh | 交互控制流直接走 WebSocket；JSON 起步，稳定后可换 MessagePack/Protobuf |
| Engine → Webview 视频帧流 | `/v1/streams/:stream_id` binary；`H264StreamClient` 已存在 | PBR viewport、动画预览、质量预览 | 节点语义、属性面板状态、可编辑 authoring 数据、音频、fMP4/MSE | `scenes:stream` 应复用现有 StreamRegistry + 二进制帧通道；编码固定 raw H.264（§3.3） |
| Engine → Webview 音频帧流 | `AudioStreamClient` 已存在；目标新增 `/v1/audio/:stream_id`（B6-A），现状仍复用 `/v1/streams/:stream_id` | 动画预览配音、互动作品旁白、A/V 同步主时钟 | 视频帧、节点语义 | 音频固定 PCM f32le（§3.3 输出栈约束）；与视频流独立的 WebSocket，不复用 |

场景流与视频流必须并存，不能互相替代：

| 维度 | 场景状态流 | 视频帧流 |
|------|------------|----------|
| 数据语义 | ECS delta：Transform、MorphWeights、Camera、Material 参数、ack、revision | 压缩后的渲染像素：H.264 access unit |
| 数据来源 | `runtime-scene` dirty generation / command result / hit-test result | `SceneGpuRuntime` render target / postprocess / encoder |
| 频率 | 事件驱动或 tick 驱动；可按最新状态合并 | 固定 FPS 或自适应 FPS；落后时优先丢弃过期帧 |
| 可靠性 | 命令 ack 和 revision 必须可靠；普通 transform delta 可合并 | 允许丢过期非关键帧；关键帧负责恢复解码状态 |
| 解码端 | Zustand / overlay / R3F 辅助层 / 属性面板 | WebCodecs `VideoFrame` |
| zero-copy 关系 | 不传 GPU buffer；只传语义和句柄，避免后端对象泄漏 | 走 GPU color convert / 编码；CPU 只转发压缩包，不搬运 RGBA |
| 主要用途 | 选择树、属性面板、Gizmo 校正、Agent 可观测状态 | WYSIWYG Viewport、动画播放、质量预览 |

因此，Route A 的最终形态不是“只有视频流”，而是：

```
Webview overlay / controls
  ├─ command(seq) ───────────────► Engine ECS
  ├─ scene state / ack(revision) ◄─ Engine ECS dirty stream
  └─ video packets ◄────────────── Engine GPU renderer / encoder
```

关键约束：

1. **不要通过 Extension Host 中转视频帧**：VSCode IPC 会增加进程 hop、序列化和内存压力，也破坏 WebCodecs 直接消费二进制流的路径。
2. **不要把视频流当作场景状态**：视频没有 nodeId、材质参数、选择状态和可审计 revision；属性面板和 Agent 仍需要 ECS 语义流。
3. **不要把场景流当作渲染输出**：SceneDelta 只能解释“发生了什么”，不能保证 Three.js 与 wgpu PBR 视觉一致；WYSIWYG 必须显示 Engine 帧。
4. **命令流要带 `seq`，状态流要带 `revision`**：Webview 的本地预测在收到 `transform-ack` 或 `render-frame-ready(seq)` 后才能解除乐观覆盖。

短期实现顺序：

```
1. 保留 postMessage + HTTP dispatch：只支撑 VSCode 能力代理、导入、保存、导出和一次性查询。
2. 新增 `/v1/scenes/control` 双向 WebSocket：直接承载 SceneCommand / Ack / Delta / Query。
3. 补齐 SceneDelta 共享类型：TS 侧包含 updatedTransforms + updatedMorphWeights，并增加 revision / appliedSeq。
4. 实现 scenes:stream：返回 streamId，复用 /v1/streams/:stream_id 二进制帧通道。
5. Webview 切为双订阅：scene state 更新 UI 语义，video stream 显示 Engine Viewport。
```

#### 多视口（Multi-Viewport）协议

专业 3D 编辑器从来不是单视口——透视 / 正交三视图 / UV 编辑 / 材质 lookdev / 子相机预览同时存在，每个视口拥有独立的 camera、render mode、debug view、resolution、post-process 设置。如果 `scenes:stream` 只能开一条流，事后再加多视口必然破坏 host-http 协议。本 ADR 把多视口协议作为 P0 决策项前置定义。

视口由 `ViewportDescriptor` 描述，每个视口对应一个独立的视频流和一组渲染参数：

```ts
interface ViewportDescriptor {
  viewportId: string;                  // 由 Webview 分配，stream 生命周期与之绑定
  sceneId: string;
  cameraRef: { kind: 'sceneCamera'; cameraId: string }
            | { kind: 'editorCamera'; rig: EditorCameraRig }; // OrbitControls / FlyCam / Locked
  renderMode: 'pbr' | 'wireframe' | 'unlit' | 'normal' | 'depth' | 'lightComplexity' | 'shadowAtlas';
  debugView?: 'albedo' | 'roughness' | 'metallic' | 'ao' | 'uv' | 'overdraw';
  resolution: { width: number; height: number; pixelRatio: number };
  fps: number;                         // 目标 FPS,可被 adaptive quality 下调
  colorSpace: 'srgb' | 'rec709';
  toneMapping: 'aces' | 'reinhard' | 'none';
  postProcess: { bloom?: boolean; ssao?: boolean; taa?: boolean };
  layerMask?: number;                  // 用于隐藏/显示特定层

  // workMode 决定 FrameScheduler 的 budget profile 和本地预测层启用模式（详见 §3.8 / §3.10）
  // edit-parametric: slider / morph / 材质 / 灯光 / 相机调整,拓扑稳定
  // edit-free:       雕刻 / 顶点编辑 / 拓扑变更,启用 BrushPreviewPredictor 与 mesh 预测副本
  // pose:            骨骼 IK 与姿态,锁住顶点和拓扑
  // render-preview:  锁定编辑命令,只接受 camera 控制,用于 quality 预览
  // lookdev:         材质 / IBL / 后处理调试,锁住几何编辑
  workMode: 'edit-parametric' | 'edit-free' | 'pose' | 'render-preview' | 'lookdev';
}

interface ViewportFrameMeta extends RenderFrameMeta {
  viewportId: string;
}
```

`scenes:stream` 改为接收 `ViewportDescriptor` 并返回 `RenderStreamDescriptor`，协议保持与单视口兼容（单视口即 N=1 的退化情况）。同一 `sceneId` 下允许 N 个 viewport 并发，共享同一份 ECS / Render World，但拥有独立 render target、独立 camera matrix、独立 post-process pass list。

约束：

- 每个 viewport 独立请求 keyframe；camera 切换或 render mode 切换强制下一帧 IDR。
- `RenderFrameMeta` 必须带 `viewportId`，Webview overlay 根据 viewport 分别对齐。
- Hit-test、projected overlay 查询都按 `viewportId` 路由，确保 picking 用对应视口的 camera / depth。
- Engine 侧根据 viewport 数量做 frame budget 划分，过载时优先降辅助视口的 FPS / 分辨率，主视口保稳。

### 3.6 交互控制流与视频输出流处理

交互控制流必须 **Webview 直连 Engine WebSocket**，不经过 Extension Host，也不走 HTTP dispatch。控制流和视频输出流仍然分开处理，再通过 `seq / revision / frameId` 做弱同步。控制流追求**可靠、有序、可回滚**；视频流追求**低延迟、可丢帧、可恢复**。如果把二者绑成同一条阻塞链路，拖拽、相机旋转和动画播放都会被编码/解码延迟拖慢。

#### 控制通道端点

```
GET ws://127.0.0.1:{port}/v1/scenes/control?sessionId=...&token=...

Client → Engine:
  hello / subscribe / command / query / resync / requestKeyframe / close

Engine → Client:
  ready / ack / delta / queryResult / snapshot / renderFrameMeta / error / heartbeat
```

同一个 WebSocket 内消息天然有序，适合 `seq`、事务、ack 和状态 delta 对齐。视频帧不进入这个 socket，避免二进制视频包阻塞控制消息。

控制通道消息信封：

```ts
type SceneControlClientMessage =
  | { kind: 'hello'; protocolVersion: 1; lastRevision?: number }
  | { kind: 'subscribe'; sceneId: string; wantsSnapshot?: boolean }
  | { kind: 'command'; envelope: SceneCommandEnvelope }
  | { kind: 'query'; requestId: string; revision: number; query: SceneQuery }
  | { kind: 'resync'; reason: 'missed-delta' | 'reconnect' | 'rejected-command'; lastRevision?: number }
  | { kind: 'requestKeyframe'; reason: 'camera-cut' | 'decoder-reset' | 'seek' };

type SceneControlServerMessage =
  | { kind: 'ready'; sceneId: string; revision: number; capabilities: SceneControlCapabilities }
  | { kind: 'ack'; ack: SceneCommandAck }
  | { kind: 'delta'; delta: SceneDelta }
  | { kind: 'queryResult'; requestId: string; revision: number; result: SceneQueryResult }
  | { kind: 'snapshot'; revision: number; snapshot: SceneSnapshot }
  | { kind: 'renderFrameMeta'; meta: RenderFrameMeta }
  | { kind: 'error'; code: string; message: string; seq?: number; requestId?: string };
```

#### 交互控制流

```
Pointer / Keyboard / Timeline / Inspector
  → Webview InteractionController
  → Local Prediction / Overlay Preview
  → SceneCommand(seq, baseRevision)
  → /v1/scenes/control WebSocket
  → Engine CommandQueue
  → validate / apply ECS
  → revision++
  → SceneCommandAck(seq, appliedSeq, revision)
  → SceneDelta(revision, appliedSeq, overlay hints)
  → Webview reconcile / commit / rollback
```

交互命令分三类处理：

| 类型 | 例子 | 发送策略 | Engine 策略 | Webview 策略 |
|------|------|----------|-------------|--------------|
| 离散可靠命令 | 加载模型、删除节点、切镜头、添加关键帧、导出 | 每次命令必须 ack | 严格按 `seq` 应用，失败返回原因 | 等 ack 后提交 UI 状态；失败回滚 |
| 连续可合并命令 | Gizmo 拖拽、滑块调材质、相机 orbit | `begin/update/end`，update 可 coalesce | 只保留同一事务最新 update，end 时固化 revision | 本地预测即时显示，收到 ack 后解除预测 |
| 查询命令 | hit-test、snap、project bounds、hover picking | request/response，可节流 | 基于指定 `revision` 查询 | 若返回 revision 过旧则丢弃 |

控制流的关键契约：

```ts
interface SceneCommandEnvelope {
  seq: number;
  transactionId?: string;
  phase?: 'begin' | 'update' | 'end' | 'cancel';
  baseRevision: number;
  coalesceKey?: string;
  command: SceneCommand;
}

interface SceneCommandAck {
  seq: number;
  appliedSeq: number;
  baseRevision: number;
  revision: number;
  status: 'applied' | 'rejected' | 'superseded';
  error?: string;
}
```

处理规则：

1. **单调 `seq`**：Webview 每个命令递增；Engine 丢弃 `seq < lastAppliedSeq` 的过期命令。
2. **事务化拖拽**：Gizmo drag start 记录 before state，drag update 可合并，drag end 写入 undo/redo command history。
3. **本地预测不改 SSOT**：前端 overlay 可以先动，但 ECS 才是权威；ack 后前端才提交状态。
4. **查询带 revision**：hit-test / snap 必须声明基于哪一帧或哪一个 scene revision；过旧结果不能更新当前 selection。
5. **失败可恢复**：命令失败返回 rejected ack，Webview 取消预测并请求 snapshot resync。
6. **背压不阻塞 UI**：当 WebSocket `bufferedAmount` 或 Engine pending command 超阈值时，Webview 合并同一 `coalesceKey` 的 update，只保留最新值。
7. **重连必须 resync**：控制 socket 断开后，Webview 重新 `hello(lastRevision)`；Engine 如果无法补 delta，返回 `snapshot` 全量校准。

#### 视频输出流

```
Engine ECS revision
  → DirtyTracker collects changed transforms/materials/camera
  → SceneGpuRuntime updates GPU-resident buffers/textures
  → PBR render pass
  → post-process / tone mapping
  → GPU color convert
  → hardware/software encoder
  → StreamRegistry frame broadcast
  → /v1/streams/:stream_id WebSocket binary packet
  → Webview WebCodecs decode
  → VideoViewport present
  → OverlayCanvas draws state for frame.revision
```

视频帧不应该走 VSCode `postMessage`，也不应该传实时 RGBA。当前 `/v1/streams/:stream_id` 已能发送二进制 `frame.data`，`H264StreamClient` 已支持 H.264 packet header：

```
[pts_us: i64] [dts_us: i64] [is_keyframe: u8] [duration_us: i64] [NAL data...]
```

3D Viewport 还需要补充渲染元数据。`RenderFrameMeta` 的**唯一规范定义在 §10.1**，本节不再重复——所有扩展帧头与旁路 state channel 的实现均以 §10.1 为准。

视频流处理规则：

| 问题 | 处理策略 |
|------|----------|
| Webview 解码慢 | 丢弃过期非关键帧，优先显示最新帧；`VideoDecoder.decodeQueueSize` 超阈值时降 FPS/分辨率 |
| WebSocket 客户端落后 | `StreamRegistry` broadcast lag 后跳过旧帧；状态流发送 `streamLagged` 诊断 |
| 相机切换 / seek / 大幅场景变化 | 请求 keyframe / IDR，刷新 decoder 状态，避免长时间拖影 |
| 场景 revision 与视频帧不一致 | overlay 按 `frame.sceneRevision` 绘制；若 overlay state 更新更快，保留最新但不覆盖旧帧语义 |
| 编码器重置 | Webview 进入 waitingForKeyframe，丢弃非关键帧直到 keyframe 到达 |
| 高负载 | 先降后处理/阴影，再降 FPS，最后降分辨率；不要阻塞交互控制流 |

#### 两条流的同步点

视频帧是视觉真值，但交互状态由 `SceneDelta` 解释。两条流只需要在这些点对齐：

| 同步字段 | 来源 | 用途 |
|----------|------|------|
| `seq` | Webview command | 标识一次用户操作 |
| `appliedSeq` | Engine ack / frame meta | 判断视频帧是否已经包含某次操作 |
| `revision` | Engine ECS | 绑定 SceneDelta、hit-test、overlay 和视频帧 |
| `frameId` | Renderer | 统计延迟、丢帧和 overlay 对齐 |
| `ptsUs` | Encoder | 视频播放时序和动画时间轴对齐 |

典型拖拽时序：

```
1. Webview: drag begin → seq=101, transaction=t1, overlay 立即显示
2. Webview: drag update → seq=102..130，同一 coalesceKey=move:nodeA
3. Engine: 合并 update，只应用最新 transform，revision=88
4. Engine: ack appliedSeq=130, revision=88
5. Engine: render frameId=440, sceneRevision=88, appliedSeq=130
6. Webview: 收到 frame meta 后移除预测 overlay，显示真实 Engine 帧
```

典型点击选择时序：

```
1. Webview: pointer down at screen(x,y), basedOnFrameId=440, revision=88
2. Engine: hit-test revision=88 → nodeId / depth / worldPosition
3. Webview: 如果当前 revision 仍兼容，更新 selection overlay
4. Engine: SceneDelta 推 selectedNodeIds / projectedBounds
```

#### 当前实现缺口

| 缺口 | 影响 | 修复 |
|------|------|------|
| `scenes:stream` 未实现 | 没有 Engine Viewport 视频真值 | 返回 `RenderStreamDescriptor`，复用 `/v1/streams/:stream_id` |
| H.264 packet 缺少 `sceneRevision/appliedSeq/frameId` | 前端无法知道某帧包含哪些操作 | 扩展帧头或通过 state channel 发送 `RenderFrameMeta` |
| HTTP transform fire-and-forget | 失败时前后端分叉 | `/v1/scenes/control` command queue + ack + revision |
| `SceneDelta` 未推送且 TS/Rust 字段不齐 | 属性面板、overlay、Agent 状态不可依赖 | 共享 SceneDelta 契约并接 `/v1/scenes/control` |
| 缺少 hit-test / projected overlay | 视频流不可编辑 | Engine 提供 picking、depth、bbox、gizmo anchor |
| 缺少 adaptive quality | 高负载时交互和视频互相拖慢 | frame budget + decoder/encoder backlog 反馈 |

### 3.7 引擎独立发布时的四层分级策略

neko-engine 三种独立部署模式（CLI 工具 / HTTP 服务 / Native 库）均已实现零 VSCode 耦合。独立发布时四层的必要性不同：

```
                    CLI 工具   HTTP 服务   AI Agent 集成   引擎内嵌 AI
                    发布       发布        (neko-suite)    (可选方案C)
────────────────────────────────────────────────────────────────────
L4 AI 语义层        ❌ 不需要  ❌ 不需要   ✅ 在外层        ⚠️ feature flag
L3 OOP 场景对象模型 ✅ 必须    ✅ 必须     ✅ 必须          ✅ 必须
L2 ECS 数据层       ✅ 必须    ✅ 必须     ✅ 必须          ✅ 必须
L1 Feedback（最小） ✅ 必须    ✅ 必须     ✅ 必须          ✅ 必须
L1 Feedback（完整） ❌ 不需要  ⚠️ 部分     ✅ 需要          ✅ 需要
```

**L3 OOP 场景对象模型在独立发布语境下的含义**：不是"对外 API"，也不是"接口层"，而是引擎内部的核心 authoring 模型——`Scene`、`SceneNode`、`Material`、`Light`、`Camera` 作为有生命周期、层级和编辑语义的对象，与 ECS 组件运行时并列构成引擎核心设计。`ActionRequest / ActionResponse`、HTTP、WebSocket 和 Native API 都只是这层的**传输形态**，不是 OOP 层本身。

**L4 不内嵌引擎核心的原则**：引擎负责"执行能力"，由消费者（neko-agent / 第三方 App / CLI 脚本）决定"执行什么"。如果未来需要引擎内嵌 AI 编排，应作为 `onnx` feature 同款的可选 feature flag，避免与外层 Agent 职责重叠和包体积膨胀。

### 3.8 渲染骨架：RenderGraph + FrameScheduler + AssetDatabase

§3.2 已经定义了 OOP / ECS / GPU 三层职责，§3.5 定义了通道分层，§3.5 多视口子节定义了 ViewportDescriptor。这一节补全 3D 引擎渲染层的三个**结构性骨架**——它们不是优化项，而是阴影、IBL、烘焙、多视口、降级策略落地之前必须存在的承重墙。所有现代 3D 引擎（UE5 RDG、Unity SRP RenderGraph、Frostbite FrameGraph、Godot RenderingDevice、Bevy `RenderApp`）都把这三件事作为渲染层的第一公民。

#### RenderGraph：pass 编排与资源生命周期

当前 ADR §3.2 的 GPU 数据流是 `SceneGpuRuntime → PBR Renderer → encoder` 一条直线，没有 pass 编排层。只要进入阴影 / IBL / 后处理 / SSAO / TAA / shadow atlas / post bloom，资源别名、barrier、async compute、temporal history buffer 就会迅速失控。`engine-kernel` 必须建立最小可用的 RenderGraph：

```
RenderGraph
  ├─ Pass 声明：input / output resources、reads / writes、queue 意图（graphics | compute | copy）
  ├─ Resource 描述：transient texture / persistent texture / buffer / sampler，附 lifetime 标记
  ├─ Compile 阶段：拓扑排序 + 资源别名（aliasing）+ dead pass 剪枝
  └─ Execute 阶段：按拓扑序提交 wgpu CommandEncoder；跨 queue 顺序与同步交由 wgpu 后端处理
```

> **wgpu 边界说明**：本 ADR 的 RenderGraph 是**上层声明式编排**，不直接管理 Vulkan / D3D12 级别的 barrier 与 timeline semaphore。wgpu 已经在内部处理了 resource state transition、queue submission 顺序与 cross-pass 同步——RenderGraph 的职责是**声明 pass 依赖、资源生命周期和队列意图**，由 wgpu 后端负责将其映射到具体 API 的 barrier / fence。如果未来需要更细粒度控制（例如显式 async compute / multi-queue），需要走 wgpu 的扩展或绕过 wgpu 直连后端，而那是单独 ADR 的话题。RenderGraph 实现不应假设 wgpu 暴露了不稳定 API。

Debug 工具：pass 时序、GPU 时间戳（通过 `wgpu::QuerySet`）、resource lifetime 可视化。

最小骨架只需先承载现有 PBR forward + post-process tone mapping + GPU color convert + encoder copy 这条主路径，给阴影 / IBL / SSAO 留好 pass 插槽。RenderGraph 与 ECS 的关系：

- ECS extract 阶段输出 `RenderInstance` / `RenderLight` / `RenderCamera` / `RenderMaterial` 列表 → 进入 Render World
- RenderGraph 在 Render World 上工作，不直接读 Simulation ECS 组件
- ViewportDescriptor 决定 render mode / debug view / post-process pass 启用与否，对应不同的 RenderGraph 变体或动态 pass 跳过

把 RenderGraph 当成"以后再做的优化"会让 §9.5 的"阴影 + 色彩管理 + IBL 接入"撞墙——在没有 pass 抽象的渲染器上加阴影意味着到处插 barrier、手工管理 atlas、手工同步 compute pass，长期不可维护。

#### FrameScheduler：帧 budget 与降级权威

§3.6 定义了"控制流不阻塞 UI、视频流可丢帧"的原则，但没有指定谁拥有 frame budget、谁在过载时决定降级。专业引擎通过 frame scheduler / job graph / task graph 显式地分配预算。FrameScheduler 按 `ViewportDescriptor.workMode` 切换 budget profile（§3.10）——不同工作模式下 sim / extract / render 的相对比重完全不同：

```
Engine FrameScheduler（每个 viewport / engine tick,按 workMode + fps 选择 profile）
  ├─ Sim tick budget         按 workMode 取值,详见 §10.6 表
  ├─ Extract budget          按 workMode 取值,详见 §10.6 表
  ├─ RenderGraph compile     缓存命中 0.5ms / 首次或 ViewportDescriptor 改变 5ms
  ├─ Render submit           按 workMode 取值；多视口下共享 GPU 总预算
  ├─ Encode budget           硬件编码器优先,软件编码器允许 2 帧落后
  └─ Frame total             60fps profile ≤ 16.7ms / 30fps profile ≤ 33.3ms
```

**单一数据源**：所有具体数值（sim / extract / render / encode）以 §10.6 per-workMode budget profile 表为准。本节只给原则与降级策略，不再独立列数。

降级策略由 FrameScheduler 拥有，按以下优先级执行：

```
1. 关闭非主视口的可视化辅助 pass（grid / outline / debug view）
2. 降辅助视口 FPS / 分辨率
3. 降主视口后处理质量（bloom / SSAO / shadow filter）
4. 降主视口 FPS（60 → 30）
5. 降主视口分辨率（pixelRatio 1.0 → 0.75 → 0.5）
6. 永远不阻塞控制 WS 与命令 ack 路径
```

特殊降级规则（per workMode）：

- `edit-free`（雕刻）：笔刷反馈优先于视频质量；降级先关后处理与辅助 pass，绝不降 sim budget（笔刷掉帧用户立刻感知）。
- `render-preview`：可以接受 30fps 起步；降级先降分辨率再降后处理，保留 IBL 和 tone mapping。
- `pose`：IK 迭代次数可降级（CCD 16 → 8 → 4），但骨骼姿态精度不能损失到肉眼可见。

FrameScheduler 同时是 §10.6 性能验收线（ack p95 / motion-to-photon / encode time）的指标产生者；没有它，延迟监控就没有归属。

#### AssetDatabase：authoring 资产真值（与 §3.2 衔接）

§3.2 已经引入 AssetDatabase 概念，这里补全它在渲染骨架中的位置：

```
AuthoringSide                              RuntimeSide
─────────────────                          ─────────────────────────
AssetDatabase（GUID/Descriptor/metadata）  →  AssetCache（GPU residency）
        │                                          │
        │ 序列化 / 导出 / Inspector / Agent         │ extract → RenderGraph 资源
        ▼                                          ▼
.nkm project file                          GPU buffers / textures / samplers
glTF / GLB export
```

- ECS 组件只持有 `AssetHandle`，不持有 `wgpu::Buffer` / `wgpu::Texture`
- 渲染时 Render World 通过 AssetCache 把 handle 解析为 GPU resource pointer，进入 RenderGraph
- 烘焙产物（lightmap / probe / cooked texture / LOD mesh）作为新的 AssetDescriptor 写回 AssetDatabase
- 导出器只读 AssetDatabase + ECS authoring 组件，永不读 AssetCache 或 GPU resource

**这三件事的优先级**：RenderGraph 与 AssetDatabase 是 P0/P1 级别的承重墙；FrameScheduler 在视频流接通后立刻进入 P1。详见 §五优先级和 §十一里程碑。

### 3.9 LayeredCharacterDescription：参数化角色 authoring 抽象

§二之二 的对比说明：所有成功的捏脸软件都把"可编辑的参数化描述"与"扁平化 mesh 导出"严格分离——MetaHuman DNA、Daz DUF+DSF、MakeHuman `.mhm`、VRoid `.vroid`、CC4 `.iAvatar`、RPM 服务端描述均是同一模式。neko-model 当前 `.nkm` 是场景文件而非角色参数描述，缺这一层。本 ADR 在 §3.2 OOP / §3.8 AssetDatabase 之上，补一层 **LayeredCharacterDescription**，作为 character authoring 的 SSOT。

#### 数据模型

参考 MetaHuman DNA 的四层结构：

```
LayeredCharacterDescription (.nkc)
  ├─ Descriptor 层
  │     metadata（id / name / version / authorRef）
  │     baseTopologyVersion（拓扑契约版本号,改变要走显式迁移）
  │     baseMeshHandle: AssetHandle<MeshDescriptor>
  │     baseSkeletonHandle: AssetHandle<SkeletonDescriptor>
  │
  ├─ Definition 层
  │     boneNames: string[]               // FK / IK 控制名
  │     controlNames: string[]            // FACS-like 控件名
  │     morphRegions: RegionTag[]         // head/face/body/limb,服务 Inspector 分组
  │     materialSlots: MaterialSlot[]
  │
  ├─ Behavior 层（驱动逻辑,可选）
  │     morphDrivers: MorphDriver[]       // JCM-style 关节→morph 公式
  │     blendShapeMaps: AnimatedMap[]     // wrinkle / normal blend
  │     constraints: Constraint[]
  │
  ├─ Geometry 层
  │     morphLibrary: MorphDescriptor[]   // 每个 morph: name + region + sparse delta + weight
  │     skinWeights: SkinWeightAtlas      // 顶点 ↔ 骨骼权重
  │     blendShapes: BlendShape[]         // 与 morph 区分:面部表情等高频驱动
  │
  └─ Override 层（非破坏性自定义,可选）
        baseDescriptionRef: AssetHandle<.nkc>  // 指向被 override 的模板
        propertyOverrides: Map<JsonPath, Value> // 仅记录用户改动的字段
```

#### 与 ECS 的关系

LayeredCharacterDescription 是 **authoring 真值**，不是运行时表示：

```
LayeredCharacterDescription（authoring SSOT,序列化 / Inspector / 导出 / Agent 编辑）
        │ instantiate
        ▼
ECS Components（运行时表示:Transform / MeshRef / MaterialRef / MorphWeights / Skeleton）
        │ extract
        ▼
Render World（GPU 资源 / draw list）
```

- 编辑参数（slider / morph 值 / 骨骼权重）**永远修改 .nkc**，再由 system 投影到 ECS
- ECS 不持有 `.nkc` 引用，只持有 `CharacterInstanceId` + 当前帧解出的组件值
- 导出器读 `.nkc` + 当前 morph weights → 烘焙顶点 → glTF / VRM；不读 ECS 当前 `Transform`

#### 文件双层模型（参考 Daz DUF + DSF）

```
.nkc 主文件（小型 JSON 或 binary,KB 级）
  ├─ Descriptor + Definition + Behavior 引用
  ├─ Override 层（如适用）
  └─ 引用其他 .nkc 模板的 URI

.nkcdata 数据块（gzip JSON 或 binary,MB 级）
  ├─ MorphLibrary 实际 sparse delta 数据
  ├─ SkinWeightAtlas
  └─ BlendShape 顶点偏移

→ 拆分理由：参数文件可被 git diff,数据块作为 LFS 或 AssetDatabase 单独管理
```

#### Library Override（参考 Blender + Daz）

neko-market 提供模板角色 `template-anime-girl-v3.nkc` 时，用户的工程文件采用 override 层：

```jsonc
// my-character.nkc
{
  "descriptor": { "id": "my-char-001", "version": "1.0.0" },
  "override": {
    "baseDescriptionRef": "neko-market://template-anime-girl-v3.nkc",
    "propertyOverrides": {
      "$.geometry.morphLibrary.eyeSize": 0.42,
      "$.geometry.morphLibrary.noseHeight": -0.18,
      "$.definition.materialSlots.skin.baseColor": "#f5d4c0"
    }
  }
}
```

加载时按 baseDescriptionRef 拉取模板，再叠加 propertyOverrides。这条路径同时支撑：
- **市场更新模板**：模板版本变更时，override 仍可 apply（除非冲突字段）
- **Agent 可审计编辑**：每条 override 都是 typed JsonPath，可被 SceneCommand history 还原
- **协作 / git friendly**：override 文件极小，diff 可读

#### 命令化编辑接口

参数化编辑通过 SceneCommand 注入：

```ts
type CharacterCommand =
  | { type: 'morph:set';     characterId: string; morphName: string; weight: number }
  | { type: 'material:set';  characterId: string; slot: string; param: string; value: unknown }
  | { type: 'skeleton:bind'; characterId: string; skeletonRef: AssetHandle }
  | { type: 'override:apply'; characterId: string; path: JsonPath; value: unknown }
  | { type: 'override:reset'; characterId: string; path: JsonPath };
```

SceneCommandQueue 应用命令时：

1. 写入 `.nkc` override 层（authoring SSOT）
2. 触发 ECS Character system 重新投影组件
3. DirtyTracker 标记 morph / material dirty
4. RenderExtraction 推 GPU update
5. SceneDelta 推 `updatedMorphWeights` / `updatedMaterials` patch 到 Webview

Inspector 不直接改 ECS，也不直接改 `.nkc`——所有写入都走 command。

#### 导出路径

```
.nkc + AssetDatabase + ECS 当前帧状态
  → CharacterBakingSystem
     ├─ 应用 override 到 base description
     ├─ 累加 morphLibrary weights → vertex deltas
     ├─ 应用 skin weights + 当前骨骼姿态
     ├─ 评估 Behavior 层 driver（可选,导出 T-pose 时跳过）
     └─ 输出烘焙 mesh
  → glTF / VRM / FBX writer 读 baked mesh + AssetDatabase 材质 metadata
```

导出器永远不读 GPU cache（与 §3.2 / §3.8 一致）；同时永远不修改 `.nkc`（导出是单向 bake）。

#### 与 §五 优先级的关系

LayeredCharacterDescription 不在本 ADR P0/P1 范围——P0/P1 只承诺把 3D Viewport WYSIWYG 与 Asset/Render 一致性做稳。但本 ADR 必须**为 LayeredCharacterDescription 留好接口插槽**：

- AssetDatabase 必须支持 `AssetHandle<MeshDescriptor>` / `MorphDescriptor` / `SkeletonDescriptor` 这类 character 资产类型
- SceneCommand 必须可扩展为 CharacterCommand（见上面 type 定义）
- ECS 必须保留 `CharacterInstanceId` 组件位
- Inspector schema 必须能从外部 schema（`.nkc`）注册控件

具体 `.nkc` schema、`CharacterBakingSystem`、Override 求值器留给 **后续 ADR：adr-3d-character-authoring.md**。本 ADR 只承诺骨架兼容。

### 3.10 自由建模扩展：拓扑可变会话与多模态本地预测

§3.9 LayeredCharacterDescription 处理的是 **参数化建模**（slider / morph / 材质，拓扑稳定）。3D 编辑器最终还需要承载 **自由建模**（雕刻、顶点编辑、Boolean、Subdivide、Decimate、Dynamic Topology）。这两类操作的频率特性、延迟容忍度、数据契约完全不同，必须分开建模。

#### 三件事并行的延迟分级

```
能力                 延迟容忍       数据频率           本 ADR 当前覆盖
─────────────────────────────────────────────────────────────
渲染（视频流）       50-150ms      固定 / 自适应 FPS  ✅ §3.2 / §3.8
交互（Gizmo / 相机） 16ms 内        每帧               ✅ §3.4 / §3.5
参数建模(Slider)    100ms 内       按事件             ✅ §3.9
自由建模(笔刷)      < 5ms 必须     每帧 + 顶点级      ❌ 本节新增
自由建模(拓扑变更)  100ms-1s       偶发,影响契约      ❌ 本节新增
```

笔刷反馈低于一帧，无法等视频流回环——这是 ZBrush / Mudbox / Blender Sculpt 都把笔刷反馈做在客户端进程的核心原因。本 ADR §3.4 已经识别相机旋转必须本地做，自由建模笔刷是同性质问题的极端情况。

#### 拓扑契约模式：ModelingSession

参数化建模与自由建模在事务层级用 `ModelingSession.topologyMutable` 标记区分：

```rust
pub struct ModelingSession {
    pub session_id: String,
    pub character_id: Option<String>,        // 关联 LayeredCharacterDescription
    pub topology_mutable: bool,              // false = 参数建模,true = 自由建模
    pub topology_version: u64,               // 每次拓扑提交递增
    pub affects_morph_library: bool,         // true 时退出会话需要 morph retarget
    pub affects_skin_weights: bool,          // true 时退出会话需要 skin retarget
    pub affects_uv: bool,                    // true 时材质需要 reproject
    pub before_hash: blake3::Hash,           // 进入会话时 mesh 状态摘要
    pub op_log: Vec<MeshOperation>,          // 顺序记录的拓扑/顶点操作
}

pub enum MeshOperation {
    BrushStroke { stroke_id: String, affected_range: VertexRange, position_deltas: Bytes },
    SubdivideRegion { region: FaceSet, levels: u32 },
    Decimate { target_ratio: f32 },
    Boolean { other_mesh: AssetHandle, op: BooleanOp },
    DynamicAdd { topology_patch: TopologyPatch },
    DynamicCollapse { region: FaceSet },
    UvUnwrap { method: UvMethod },
}
```

强约束：

- 参数化命令（`MorphSet` / `MaterialSet` / `BoneIK`）拒绝在 `topology_mutable: true` 会话中执行——避免基于失效顶点序的副作用。
- 自由建模会话提交时，由 `MeshTopologyMigrationService` 按 op_log 决定是否需要 retarget 受影响的 morph / skin / UV：
  - 仅顶点位置变化（笔刷）→ morph delta 可保留（顶点序不变）
  - 拓扑变更（subdivide / decimate / boolean）→ 必须迁移或失效相关 authoring 数据
- `topology_version` 进入 SceneRevision，所有 dirty / delta / hit-test 都要带 `topology_version` 防止跨拓扑求值。

业界对照：Blender 用 Edit Mode / Object Mode 切换；ZBrush 用 Sculpt / Pose；Maya 用工作集。本 ADR 的 ModelingSession 是同一思路的命令化版本。

#### 多模态 LocalPredictionLayer

§3.4 现有本地预测只覆盖 transform / camera / Gizmo，自由建模需要扩展为多模态预测层。**所有 predictor 输出仅为预测 overlay / displacement preview，不构成视觉真值**——视觉真值始终来自 Engine 视频流（§二之二第 2 节、§3.3）。R3F / Three.js 在阶段 1 / 1B 只承担"预测层与交互辅助"职责，**不**作为材质、光照、形变、PBR 的输出真值；视觉与 Engine 不一致是预期，由后续 Engine 帧覆盖修正。

```ts
LocalPredictionLayer（输出仅为预测 overlay,不是视觉真值）
  ├─ TransformPredictor       Gizmo 拖拽 → OverlayCanvas 投影 + Engine 真值帧覆盖
  ├─ CameraPredictor          相机旋转 → 本地 viewport matrix（相机本就在 Webview 侧驱动）
  ├─ MorphSliderPredictor     Slider 拖动 → R3F 预测层叠加 morph delta（粗略 Lambert / unlit,不追求 PBR 一致）
  ├─ BrushPreviewPredictor    雕刻笔刷 → 预测层 displacement texture / vertex offset（粗略法线,不替代 Engine PBR）
  ├─ SelectionPredictor       多选 / 套索 → 本地几何判定 + Engine hit-test 校正
  ├─ SnapPredictor            网格吸附 → 本地 spatial index + Engine 校正
  └─ TopologyOpPredictor      Boolean / Subdivide preview → 简化结果叠加（可选）
```

每个 predictor 都遵守同一规则：本地 overlay 即时显示 → SceneCommand / VertexBrushPatch 发到 Engine → ack / 帧到达后用 Engine 视频帧替换为视觉真值。**绝对禁止**让 R3F 预测层覆盖 Engine 视频流持续显示——Engine 帧到达后必须立即切回，避免用户长时间看到不一致的预测画面。

#### Webview 预测副本例外（仅限交互延迟敏感场景）

§3.2 现有约束是"Webview 不持有可分叉的可变事实"。自由建模笔刷与 morph slider 反馈做不到这一点——R3F 必须在本地维护一份 mesh 副本以即时绘制 displacement preview / morph preview。本 ADR 在此明确**例外条款**：

| 数据 | 是否允许 Webview 持有 | 约束 |
|------|---------------------|------|
| Authoring transform / morph weights / material params（**真值**） | ❌ 不允许（仅带 revision 镜像） | §3.2 原约束 |
| **Mesh 顶点位置预测副本（自由建模会话内,仅 preview）** | ✅ 允许，**但**带 `meshId + topologyVersion + sessionId` 标记 | 仅在会话期间存在；Engine 帧 / ack 到达后用真值替换；不参与序列化、Undo、导出；**不参与 PBR 真值渲染** |
| **Morph delta 预测叠加（slider 拖动期间,仅 preview）** | ✅ 允许 | 仅在 slider 持续操作期间叠加；Engine 帧到达即清除 |
| **Displacement texture 预测层** | ✅ 允许 | 同上 |
| Mesh 拓扑结构（authoring） | ❌ 不允许 | 拓扑变更必须由 Engine 完成并通过 TopologyChangeEvent 推回 |
| Skin weight / UV / Morph library（authoring） | ❌ 不允许 | authoring 真值始终在 AssetDatabase |

预测副本与本地预测 transform 等同：会话结束 → 整段丢弃 → 下一帧 Engine 真值进入。**预测副本永远不出现在导出结果、序列化、Undo 历史中**。

#### 渲染层增量

参数化建模 / 交互不需要 §3.8 RenderGraph 改造。**自由建模需要**：

| 增量 | 内容 | 优先级 |
|------|------|--------|
| Mesh dirty region 增量 GPU 上传 | 笔刷只更新受影响顶点 buffer 区段，不重传整 mesh | 必需 |
| Brush preview pass | 主 PBR pass 之后叠加笔刷影响区可视化（颜色 / 强度 / 边界） | 必需 |
| Multi-resolution / displacement pass | 高频细节用 displacement texture 而非顶点细分 | 可选（性能优化） |
| 拓扑变更后 RenderGraph 资源失效 | mesh GPU buffer 重建、bbox / spatial index 重算 | 必需 |

这些都是在 RenderGraph 内增加 pass 与 resource 失效策略，不破坏现有骨架。

#### 性能 budget per workMode

每种 workMode 拥有独立的 60fps / 30fps budget profile，FrameScheduler（§3.8）按 `ViewportDescriptor.workMode + fps` 切换。具体数值与 frame total 上限以 **§10.6 per-workMode budget profile 表** 为唯一数据源；本节只描述原则：

- `edit-parametric` / `pose`：默认尝试 60fps profile，过载降到 30fps profile。
- `edit-free`（笔刷）：固定 30fps profile，sim+extract 占大头（mesh dirty 计算与顶点 buffer 上传）。
- `edit-free`（拓扑变更）：偶发，提交时阻塞，< 1s 完成。
- `render-preview` / `lookdev`：固定 30fps profile，render+post-process 占大头，sim 几乎为 0。

#### 与本 ADR 范围的关系

§3.10 的具体实现（FreeModelingTransaction、VertexBrushPatch 协议、Mesh dirty region 增量上传、Brush preview pass、TopologyMigrationService）**不在本 ADR P0/P1 实施范围**。本 ADR 只承诺：

- ViewportDescriptor 字段（`workMode`）已落地
- SceneCommand 协议预留 ModelingSession 命令位
- SceneDelta 协议预留 VertexBrushPatch / TopologyChangeEvent 通道（详见 §10.1）
- §3.2 Webview 约束开例外条款给预测副本
- FrameScheduler 设计支持 per-workMode budget 切换

完整自由建模能力作为 **§十二 路线第二阶段** 推进，详见后续 ADR `adr-3d-free-modeling.md`。

---

## 四、与四层审计的对齐：控制 WS 是 L1 Feedback 的短路径

[adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md) 列出了 7 个共享基础 crate，其中 `engine-feedback-bus` 是所有域 L1 Feedback 的统一信号总线。对于 3D 编辑器，最终要纳入该总线的信号包括：

```
render-frame-ready   → Webview 收到新帧，撤销 CSS 本地预测覆盖
transform-ack        → 变换写入 ECS 成功，Webview 可以释放乐观锁
animation-conflict   → Engine 动画 tick 与 Webview 播放状态冲突
export-quality       → capture 帧的 PBR 质量指标（供 AI 评估）
normal-map-missing   → 材质缺少法线贴图，降质提示
shadow-budget-exceed → 光源数量超过阴影预算，提示裁减
```

`/v1/scenes/control` 是短路径：它可以先提供 3D 编辑器内部最小可用的 `ack`、`SceneDelta`、`renderFrameMeta` 和错误反馈；`engine-feedback-bus` 就位后，再把这些信号接入跨域统一反馈面。这样不会为了等待共享总线而继续保留 fire-and-forget。

```
优先级依赖链（与四层审计对齐）：

/v1/scenes/control（3D 域短路径）
        │
        ├─► transform-ack / SceneDelta / hit-test result
        │         │
        │         └─► 变换 fire-and-forget 升级为有 ack 的可靠写
        │
        └─► scenes:stream + renderFrameMeta
                  │
                  └─► WYSIWYG Route A 解锁

engine-feedback-bus（共享基础 crate, 四层审计 P0）
        │
        └─► 统一承载 render-frame-ready / export-quality / animation-conflict / quality warnings
```

**短路径**：在 `engine-feedback-bus` 就位前，P0/P1 的导出器修复、法线贴图 shader 修复和 `/v1/scenes/control` 最小 ack/delta 都可独立推进。反馈总线负责跨域统一，不阻塞 3D Viewport 的控制闭环。

#### 短路径的兼容边界（防止重复造轮子）

[adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md) 要求 7 个共享基础 crate 先于任何域 P0 抽出。`/v1/scenes/control` 作为 3D 域的短路径，必须遵守以下兼容边界，否则会与未来的 `engine-feedback-bus` / 共享 budget tracker 形成重复实现，迁移时被迫推倒重来：

| 短路径承载 | 是否允许 | 迁移策略 |
|-----------|---------|---------|
| `SceneCommandAck`（3D 域控制确认） | ✅ 允许长期保留 | 命令 ack 是控制语义，不属于跨域反馈；`engine-feedback-bus` 就位后仍由 `/v1/scenes/control` 推送 |
| `SceneDelta`（ECS dirty patch） | ✅ 允许长期保留 | 同上，是域内状态流，不进 feedback bus |
| `RenderFrameMeta`（视频帧元数据） | ✅ 允许长期保留 | 必须随视频帧低延迟到达，走 feedback bus 会增加 hop |
| 单域 `error`（命令失败原因 / 协议违例） | ✅ 允许 | 域内即时反馈 |
| **`transform-ack` 等通用 L1 信号** | ⚠️ **临时承载** | feedback bus 就位后必须迁出。短路径只在 `engine-feedback-bus` 缺位时充当回填；不允许新增长期跨域 L1 信号到 `/v1/scenes/control` |
| **`render-error` / `export-quality` / `animation-conflict` / `shadow-budget-exceed`** | ❌ **不允许长期承载** | 这些是跨域信号，必须等 `engine-feedback-bus` 就位后接入。如必须临时输出，必须在 schema 上标记 `_transitional: true`，迁移时整段移除 |
| **frame budget / encode latency 等性能指标** | ⚠️ **临时承载** | 短路径上以 `RenderFrameMeta` 字段形式输出最小集；但跨域聚合（puppet / model / sketch 统一性能面板）必须由共享 budget tracker 完成，3D 域不自建 |

**实施约束**：

1. `/v1/scenes/control` 的消息 schema 中，**只有 `ack` / `delta` / `renderFrameMeta` / 域内 `error` 是稳定字段**。其他临时承载的跨域信号必须独立编组（例如 `transitional: { transformAck?: ..., renderError?: ... }`），并标注预期迁移时间窗。
2. 迁移完成后，3D 域**只保留**控制语义短路径；性能聚合、跨域质量指标、Agent 可观测信号统一走 `engine-feedback-bus`。
3. 短路径不构建自己的 budget tracker / 信号订阅 fan-out / 优先级队列等基础设施——这些都是共享 crate 的职责。3D 域只产生信号、不聚合信号。

---

## 五、近期必须修复的一致性缺口（优先级排序）

> **优先级调整说明（2026-04-27 修订，与 §十二 战略路线对齐）**：本节按"**建模优先 → 渲染次之 → 交互第三**"重排（详见 §十二）：
> - **建模骨架优先**：AssetDatabase / 导出器 / SceneDelta patch / ViewportDescriptor / 渲染一致性都是"作为模型 authoring 工具"的硬条件——P0 / P1 必做。
> - **渲染一致性优先**：法线 shader / RenderGraph 骨架 / 动画状态同步 直接决定 WYSIWYG——P1 必做。
> - **交互分两类**：参数化交互（slider / 数值 / Gizmo 校正）走 P1；高频本地预测（笔刷反馈、复杂拖拽预测）后置到阶段 2 后续 ADR。
> - **`/v1/scenes/control` 控制 WebSocket** 是阶段 1 的最低交互需求（命令 ack + delta + hit-test），不再追求"覆盖所有交互场景"——P1 先做最小可用形态。
> - **`scenes:stream` 是阶段 1 必交付**——没有它 WYSIWYG 承诺无法兑现。
> - 渐进式：本节列出的所有 P0/P1 都属于阶段 1，阶段 2 / 3 的能力（Timeline / 蓝图 / 物理 / Gameplay）不进入本 ADR 优先级。

### P0：建立最小 AssetDatabase（导出器修复的前置）

**问题**：当前 ECS 的 `MaterialRef` / `MeshRef` / `TextureRef` 没有对应的 authoring 资产真值层；`AssetCache` 是 GPU 派生缓存，被误用作元数据真值会导致 GPU→CPU 读回和后端对象泄漏。

**修复**：建立最小 `AssetDatabase`，**单一 owner**：归属 `runtime-scene-core`（`runtime-scene` 在长期拆分计划中的 authoring 子 crate；短期若仍合并在 `runtime-scene` 内，必须以独立 module 隔离，不依赖 `engine-kernel`）。

**职责切分（不可混合）**：

| Crate / Module | 职责 | 不可做 |
|----------------|------|--------|
| `runtime-scene-core`（authoring,拥有 AssetDatabase） | `AssetHandle(GUID)` + `AssetMetadata`（type / source path / import settings / version）；`AssetDescriptor`（`MaterialDescriptor` / `MeshDescriptor` / `TextureDescriptor`）作为 authoring 真值；序列化、Inspector、Agent、导出器读这一份 | 不持有 `wgpu::Buffer` / `wgpu::Texture`；不依赖 `engine-kernel` |
| `engine-kernel`（GPU,消费 AssetDatabase） | 从 `AssetDescriptor` 派生 `AssetCache`（GPU 资源常驻 / 驱逐 / 重建）；RenderGraph 通过 handle → cache 解析获取 GPU 资源 | 不作为 authoring 真值；不被导出器读取；不反向写回 Database |

**强制约束**：

- 导出器（`runtime-scene/src/exporter.rs`）依赖 `runtime-scene-core::AssetDatabase`，**不**依赖 `engine-kernel::AssetCache`
- `engine-kernel` 单向依赖 `runtime-scene-core`（消费 Descriptor 生成 Cache），不反向
- AssetDatabase 的写入只通过 SceneCommand `asset:bind` / `asset:update` 等命令，不允许 `engine-kernel` 直接写
- 长期拆分目标见 §3.2：`runtime-scene-core` / `runtime-scene-gpu` / `engine-kernel` 三层独立 crate

### P0：修复导出器（当前导出素材在其他软件中表现不正确）

**问题**：GLB 导出器写入硬编码默认材质，忽略所有已加载的材质参数。

**修复**：依赖 P0 AssetDatabase 已就位。`exporter.rs` 通过 `MaterialRef` → `AssetHandle` → `MaterialDescriptor` 路径读取 authoring 元数据写入 PBR JSON。永不读 `asset_cache` 或写硬编码默认值。

受影响字段：baseColorFactor、metallicFactor、roughnessFactor、emissiveFactor、所有纹理引用。

### P0：补充导出灯光和相机

**问题**：灯光和相机作为 ECS 组件存在，渲染时正确使用，但导出时完全丢弃。

**修复**：`exporter.rs` 增加 `KHR_lights_punctual` 扩展写入 + 相机节点写入。

### P0：可见性导出策略

**问题**：ECS `Visible` 组件渲染时生效，但 glTF 导出无对应字段；§一表格列为"丢失"，验收要求"导出与编辑器一致"，但 §五此前没有对应修复条目。

**修复**：exporter 增加 `ExportOptions { visibility: 'prune' | 'extras-flag' | 'preserve-all' }`，默认 `'prune'`。三档**互斥**，对节点的处理规则严格分离：

| 模式 | glTF 节点写入 | `extras.visible` 字段 | 用途 |
|------|--------------|----------------------|------|
| `'prune'`（**默认外部交付**） | 不可见节点**物理移除**（含子树）；可见节点正常写入 | **不写**（节点已不存在） | 第三方 glTF 查看器看到的就是编辑器视频流看到的 |
| `'extras-flag'`（neko 往返） | 所有节点正常写入 | 不可见节点写 `node.extras.visible = false`；可见节点不写或写 `true` | 第三方查看器仍按可见处理；neko 重新加载时识别 extras 还原 `Visible` 组件 |
| `'preserve-all'`（调试 / 完整快照） | 所有节点正常写入 | **不写** extras | 完全忽略可见性,所有节点照原样导出 |

**项目文件**（`.nkm` / `.nkc`）走 neko 自有序列化，永远完整保留 `Visible` 组件值（含 `layerMask`），不受 `ExportOptions` 影响。

**默认 `'prune'` 的理由**：第三方 glTF 查看器普遍不识别自定义 extras 字段，"导出后看到的就是渲染时看到的"是更可预期的行为。`'extras-flag'` 仅在 neko 内部往返、需要保留隐藏节点重新启用的场景使用。

**验收口径修订**：§12.2 阶段 1A 验收"导出结果与编辑器视频流视觉一致"指 `'prune'` 默认下的视觉一致；隐藏节点不在编辑器视频流也不在导出结果中。`'extras-flag'` 与 `'preserve-all'` 是用户显式选择的扩展模式，不在默认验收路径。

### P0：定义 ViewportDescriptor 多视口协议

**问题**：当前 `scenes:stream` 假设单视口，事后再加多视图 / lookdev / UV 视口必须破坏 host-http 协议。

**修复**：在 `@neko/shared/types` 或 `packages/neko-proto` 定义 `ViewportDescriptor`（§3.5 子节）。`scenes:stream` 接收 `ViewportDescriptor` 返回 `RenderStreamDescriptor`，单视口=N=1 退化情况。`RenderFrameMeta` 携带 `viewportId` 路由。

### P0：定义共享 SceneSnapshot / SceneDelta patch 契约

**问题**：`EngineClient.getSceneSnapshot()` 返回 `Record<string, unknown>`；Webview 侧虽有局部 `SceneNodeSnapshot`，但只覆盖位置、层级和若干 `has*` 标记，缺少 hierarchy / material / visibility / asset / 增删节点字段，无法支撑 Inspector / Agent / Undo。

**修复**：在 `@neko/shared/types` 或 `packages/neko-proto` 定义完整 `SceneSnapshot` / `SceneDelta`（patch 语义，详见 §10.1）：
- 包含 `addedNodes` / `removedNodes` / `updatedHierarchy` / `updatedVisibility` / `updatedMaterials` / `updatedAssetReferences` / `updatedLights` / `updatedCameras`
- 字段与 Rust `components.rs` / `world.rs` 对齐
- patch 语义：缺失字段 = 未变更，不用空数组表示 reset

### P1：建立 RenderGraph 骨架

**问题**：当前渲染是 `SceneGpuRuntime → PBR Renderer → encoder` 一条直线，无 pass 编排。一旦进入阴影 / IBL / SSAO / TAA 就要到处插 barrier、手工管理 atlas、手工同步 compute。

**修复**：在 `engine-kernel` 建立最小 RenderGraph（详见 §3.8）：
- Pass 声明 + resource lifetime + barrier 自动化 + dead pass 剪枝
- 先承载现有 PBR forward + post-process tone mapping + GPU color convert + encoder copy
- 给阴影 / IBL / SSAO 留 pass 插槽
- 与 ViewportDescriptor 联动：render mode / debug view 对应不同 RenderGraph 变体

### P1：修复法线贴图 shader

**问题**：`pbr_pipeline.rs` 绑定了 `normal_tex`，但 fragment shader 中未进行 TBN 矩阵变换和法线解包。

**修复**：在 `pbr_forward.wgsl` 中补充标准法线贴图计算（TBN + 从 RGB decode 到 [-1,1]）。

### P1：补充动画状态同步

**问题**：`playAnimation` / `pauseAnimation` / `stopAnimation` 仅在客户端处理，Engine ECS 不知道播放状态，导致 `export_gltf` 时导出 T-pose。

**修复**：将播放状态、clip、时间游标写入 Engine ECS；Webview 播放时通过 `scenes:tick` 或后续 `SceneDelta` 推进同一份状态。导出前按 ECS 中的当前时间求值姿态；质量帧输出路径完成后，再用 capture/stream 帧做可视校验。

### P1：实现 `/v1/scenes/control` 直接控制 WebSocket

**问题**：当前 Webview 交互通过 `postMessage` 到 Extension，再由 Extension 用 HTTP dispatch 调 Engine。该链路不适合 Gizmo 拖拽、相机连续更新、动画 scrub、hit-test 和本地预测校正。

**修复**：新增 Webview 直连 Engine 的 `/v1/scenes/control` WebSocket。Client 发送 `SceneCommandEnvelope` / `SceneQuery` / `resync` / `requestKeyframe`；Engine 返回 `SceneCommandAck` / `SceneDelta` / `SceneQueryResult` / `RenderFrameMeta` / error。Extension 只下发端口、session/token 和 VSCode 资源能力，不参与高频交互控制。

### P1：实现 `scenes:stream`（接受 ViewportDescriptor）

**问题**：`scenes:stream` action 返回 `"not yet implemented"`，是 WYSIWYG 架构的基础缺口。

**修复**：接入 `gpu_export_pipeline` 的连续帧输出 → GPU color convert / zero-copy H.264 编码 → WebSocket 推送到 Webview。接受 `ViewportDescriptor` 作为输入，返回 `RenderStreamDescriptor`。CPU 只负责命令、调度和编码包转发，不搬运原始 RGBA 帧。

### P1：建立 FrameScheduler 与降级策略

**问题**：当前没有显式 frame budget owner；过载时谁降 FPS / 谁降分辨率 / 谁降后处理质量没有规则。性能验收线（§10.6）也没有指标产生者。

**修复**：在 `engine-kernel` 建立 `FrameScheduler`（详见 §3.8）：
- 划分 sim tick / extract / render / encode / present 各阶段 budget
- 5 级降级策略（辅助视口辅助 pass → 辅助视口 FPS/分辨率 → 主视口后处理 → 主视口 FPS → 主视口分辨率），永不阻塞控制 WS
- 产出 §10.6 验收指标：ack p95、motion-to-photon、GPU frame time、encode time

---

## 六、功能可用性现状矩阵

| 功能 | UI | Engine | 端到端 | 可用性 |
|------|----|--------|--------|--------|
| 加载模型 | ✅ | ✅ | ✅ | ✅ 可用 |
| 变换编辑（Gizmo） | ✅ | ✅ | ⚠️ fire-and-forget | 部分 |
| 变换编辑（面板） | ❌ 只读 | ✅ | ❌ | 不可用 |
| 动画播放 | ✅ UI | ✅ | ❌ 各自独立 | 假可用 |
| 关键帧编辑 | ✅ | ✅ | ✅ | ✅ 可用 |
| IK | ❌ 无 UI | ✅ FABRIK/CCD/TwoBone | ❌ | 不可用 |
| 形状创建/CSG | ✅ UI | ✅ | ✅ | ✅ 可用 |
| 材质编辑 | ❌ 无 UI | ✅ `update_material` | ❌ | 不可用 |
| 光源编辑 | ❌ 无 UI | ✅ Light 组件 | ❌ | 不可用 |
| 粒子系统 | ❌ 无 UI | ✅ compute shader | ❌ | 不可用 |
| 导出 GLB（材质正确） | — | ⚠️ 硬编码默认值 | ❌ | 有缺陷 |
| 导出 GLB（灯光/相机） | — | ✅ ECS 有 | ❌ 不导出 | 有缺陷 |
| 全景 / 环境贴图 | ❌ | ⚠️ IBL 管线存在但 shader 未接入 | ❌ | 不可用 |
| 阴影 | ❌ | ❌ 完全未实现 | ❌ | 缺失 |
| 相机路径动画 | ❌ | ❌ | ❌ | 缺失 |

---

## 七、关键文件索引

| 文件 | 问题 | 优先级 |
|------|------|--------|
| `runtime-scene/src/exporter.rs` | 导出硬编码默认材质；不导出灯光/相机/可见性 | P0 |
| `engine-kernel/src/gpu/scene_renderer/pbr_pipeline.rs` | 法线贴图绑定但 shader 未使用；IBL bind group 存在但 fragment 未采样 | P1 |
| `host-http/src/routes/scene_control.rs`（新增） | 缺少 `/v1/scenes/control` 直接控制 WebSocket | P1 |
| `host-api/src/controllers/scenes.rs` | `stream` action 返回 "not implemented" | P1 |
| `neko-client/src/EngineClient.ts` | `getSceneSnapshot()` 返回 `Record<string, unknown>`；缺少共享 SceneSnapshot / SceneDelta 类型 | P1 |
| `neko-model/packages/extension/src/editor/ModelEditorProvider.ts` | `playAnimation` 不调用 Engine tick；`sceneDelta` 消息类型从未发送 | P1 |
| `neko-model/packages/webview/src/components/ModelLoader.tsx` | R3F 独立管理动画，不与 Engine 状态同步 | P1 |

---

## 八、后果与风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| Route C 中 capture 单帧延迟影响体验 | 中 | capture 用于"质量预览"按钮，非实时；日常编辑仍用 R3F | 
| scenes:stream 实现复杂度高 | 高 | 复用 `gpu_export_pipeline` 连续帧路径 + 已有 H264 WebSocket 流基础设施 |
| 修复导出器可能破坏现有资产 | 低 | 按版本号做格式迁移（`.nkm` v2 → v3） |
| 双渲染器过渡期画质不一致 | 中 | 文档明确标注"编辑器预览为 R3F 近似值，导出以 Engine 为准" |
| OrbitControls 在纯流下延迟 | 高 | 相机控制永远本地做，不走流；仅 Gizmo 变换结果走流 |

---

## 九、专业级差距分析

当前差距不是“能不能把模型显示出来”，而是距离专业 3D 编辑器的 **一致性、低延迟、可编辑性、可观测性和可降级能力** 仍有系统性缺口。专业级方案必须把画面真值、场景语义和交互反馈闭环，而不是只补一个渲染接口。

### 9.0 本 ADR 的范围声明

本 ADR 只承诺到 **Editor Viewport WYSIWYG + Asset/Render 一致性 + Authoring 闭环**——即把"3D 资产编辑器"从双渲染器升级为"编辑器 Viewport 直接显示 Engine 渲染、场景语义可审计、命令可回滚"的工业级状态。下面列出的 P0/P1 项均在本 ADR 的实施范围内。

**§9.5 中标注为 P2/P3 的子系统**（烘焙系统、蓝图 / 可视脚本、游戏机制 / Gameplay Framework、3D 空间音频、行为树）**不在本 ADR 的实施范围**。它们以"未来 ADR ToC"形式列在此处，是为了：

1. 给读者提供专业引擎完整图景，避免把"3D 资产编辑器"和"游戏引擎"混为一谈。
2. 保留架构插槽：本 ADR 的 OOP / ECS / RenderGraph / AssetDatabase / FrameScheduler 必须为这些后续能力预留扩展点，不能锁死。
3. 提示读者后续如果走向 Gameplay Framework，需要单独立 ADR 评审，不要在本 ADR 的里程碑里偷加范围。

里程碑（§十、§十一）只覆盖 §9.5 中标注为 P0/P1 的项，外加本 ADR 自身定义的渲染骨架（§3.8）和契约（§10.1）。

### 9.1 总体差距

| 维度 | 当前状态 | 专业级要求 | 差距等级 |
|------|----------|------------|----------|
| 视觉真值 | Webview R3F 与 Engine wgpu 双渲染器并存 | 编辑器 Viewport 直接显示 Engine 渲染结果 | P0 |
| 数据真值 | Engine 侧 OOP/ECS 是场景语义真值，但 TS 侧契约不完整 | OOP/ECS / Snapshot / Delta / Export 使用同一语义契约 | P0 |
| 操作可靠性 | transform fire-and-forget，HTTP 无序 | 命令队列带 `seq/ack/revision`，可回滚、可重放 | P0 |
| GPU 路径 | `capture` 尚未输出可显示帧，`scenes:stream` 未实现 | GPU render target → color convert → encoder → Webview decoder | P0 |
| 交互能力 | 视频流尚未接入，hit-test / overlay 数据不足 | 视频负责显示，语义流负责选择、Gizmo、bbox、IK 控制点 | P1 |
| 渲染质量 | 法线贴图、IBL shader、阴影、导出材质存在缺口 | 编辑器、导出、最终渲染共享同一 PBR 语义和质量策略 | P1 |
| 性能治理 | 缺少实时帧预算、编码延迟、丢帧和降级策略 | 分辨率/FPS/阴影/后处理可自适应，指标可观测 | P1 |
| 工程化验证 | 缺少端到端一致性测试 | 帧 revision、命令 ack、导出结果、渲染差异可测试 | P1 |
| 远程化 | 本机 WebSocket 合理，但未抽象 transport | 本机默认 WebSocket，远程可插 WebRTC | P2 |

### 9.2 与专业编辑器的核心差距

UE / Unity / Godot 的专业性不只来自渲染器，而来自四个闭环：

| 闭环 | 专业引擎做法 | neko-model 当前缺口 | 补齐方向 |
|------|--------------|---------------------|----------|
| Viewport 闭环 | 编辑器 Viewport 调同一运行时渲染器 | R3F 预览与 wgpu 输出不一致 | Route A：Engine 视频流作为视觉真值 |
| Authoring 闭环 | 属性系统、场景树、导出读取同一对象模型 | Webview 局部类型与 EngineClient `Record<unknown>` 并存 | 共享 `SceneSnapshot` / `SceneDelta` / Protobuf 契约 |
| Interaction 闭环 | picking、selection、Gizmo、overlay 与渲染相机一致 | 视频流没有 nodeId / depth / bbox / anchor | hit-test + projected overlay state + camera matrix |
| Feedback 闭环 | 命令执行、渲染错误、性能预算都有反馈 | 缺少 `transform-ack`、`render-frame-ready`、质量信号 | `engine-feedback-bus` + `/v1/scenes/control` |

因此，专业化不能只实现 `scenes:stream`。如果没有 SceneDelta、ack、hit-test 和 overlay 数据，视频流只能“看”，不能稳定编辑。

### 9.3 低延迟体验差距

专业编辑器的交互体验不是等待服务端每帧返回，而是把延迟拆开处理：

```
即时反馈：Webview overlay / Gizmo / 本地预测
真实结果：Engine encoded video frame
一致性校正：SceneDelta + command ack + render revision
```

当前主要缺口：

- 没有命令 `seq`，无法知道某一帧是否包含某次用户操作。
- 没有 `appliedSeq` / `sceneRevision`，前端无法安全解除本地预测。
- 没有 frame latency、GPU frame time、encode time、decode time 指标，无法判断瓶颈在渲染、编码还是 Webview 合成。
- 相机切换、动画 seek、场景大幅变化时缺少 keyframe 策略，视频恢复可能有感知延迟。

专业级目标不是“零延迟”，而是：

| 操作 | 专业级体验目标 | 技术条件 |
|------|----------------|----------|
| 点击选择 | 单击后立即高亮，后端确认后修正 | 前端 optimistic highlight + Engine hit-test |
| Gizmo 拖拽 | 拖拽无卡顿，最终位置以后端为准 | overlay 预测 + transform ack + render revision |
| 相机旋转 | 交互跟手，不等待视频回环 | Webview 本地相机控制 + Engine 接收 camera command |
| 动画播放 | 画面以后端为准，时间轴状态同步 | Engine animation state + video frame pts |
| 镜头切换 | 快速切换且无长时间拖影 | camera command + keyframe / decoder refresh |

### 9.4 渲染质量差距

当前差距集中在“材质、灯光、后处理、导出”没有完全共享一套 PBR 事实：

| 能力 | 当前缺口 | 专业级要求 |
|------|----------|------------|
| 材质 | 导出硬编码默认 PBR 参数 | ECS / asset metadata 是材质事实来源，导出与渲染一致 |
| 法线贴图 | shader 绑定存在但未完整解包应用 | TBN + normal decode + 与导出纹理一致 |
| IBL | 管线存在但 shader 未完整接入 | 编辑器、capture、stream、export 使用一致环境光策略 |
| 阴影 | 未实现 | 至少方向光/点光基础阴影，支持质量档位 |
| 色彩管理 | R3F 与 wgpu tone mapping 不一致 | 明确 color space、tone mapping、HDR/LDR 输出策略 |
| 动画姿态 | Webview 播放状态与 Engine tick 分裂 | Engine 持有播放状态，导出当前姿态可复现 |

专业化重点是“同一场景语义产生同一结果”，不是在前端把 Three.js 调到近似。

### 9.5 专业引擎子系统差距

如果目标从“3D 资产编辑器”进一步扩展到“专业 3D 引擎 / 游戏编辑器”，还必须拆出光影、烘焙、蓝图、游戏机制和 Viewport 五类子系统。它们不能混在 `scenes:stream` 中实现，否则会把渲染流、编辑语义和运行时逻辑耦合在一起。

> **范围提示（与 §9.0 对齐）**：下表中标注为 **P2 / P3** 的子系统（烘焙、蓝图、游戏机制及部分 9.5 子节）属于 **未来 ADR ToC**，不在本 ADR 实施范围内。本 ADR 的里程碑（§十、§十一）只覆盖 **P0 / P1** 项以及自身的渲染骨架（§3.8）和契约（§10.1）。

| 子系统 | 当前基础 | 专业级能力 | 建议优先级 | 在本 ADR 范围 |
|--------|----------|------------|------------|----------------|
| Viewport 编辑器 | R3F 交互和 Engine 渲染分裂 | 多视图、camera rig、grid、gizmo、snap、picking、overlay、selection outline、性能模式、调试视图 | P0/P1 | ✅ |
| 光影系统 | 有 Light 组件，PBR 管线部分存在；阴影缺失 | 方向光/点光/聚光、shadow map、级联阴影、IBL、反射探针、色彩管理、曝光、后处理 | P1 | ✅（基础阴影 + IBL + 色彩管理） |
| 烘焙系统 | 暂无明确 lightmap / probe bake 管线 | lightmap UV、光照贴图、AO、irradiance probe、reflection probe、材质/纹理 bake、后台任务与缓存 | P2 | ❌（未来 ADR） |
| 蓝图 / 可视脚本 | 目前主要是 action registry / Agent tool | 类型化节点图、事件系统、变量、函数、调试、热重载、沙箱执行、与 ECS command 绑定 | P2 | ❌（未来 ADR） |
| 游戏机制 | runtime-scene 偏 authoring；缺少 Gameplay Framework | 输入、物理、碰撞、脚本生命周期、prefab、state machine、trigger、timeline、运行/暂停/单步模拟 | P2/P3 | ❌（未来 ADR） |

#### 光影

光影是专业感最明显的差距，但它必须分为实时编辑路径和离线质量路径：

| 能力 | 编辑实时路径 | 质量 / 导出路径 |
|------|--------------|-----------------|
| 直接光 | 基础 shadow map，支持质量档位 | 更高分辨率阴影、软阴影、更多灯光 |
| 环境光 | IBL 采样、曝光和 tone mapping 一致 | HDRI、反射、irradiance 更高质量 |
| 后处理 | ACES / bloom / SSAO 可开关 | 固定质量参数，可复现 |
| 调试视图 | albedo、normal、roughness、depth、shadow atlas | 用于 golden frame 和材质诊断 |

短期目标不是完整全局光照，而是让 **灯光、材质、tone mapping、导出** 不再分裂。阴影需要先有基础 shadow map，再扩展级联阴影和软阴影。

#### 烘焙

烘焙不应阻塞 Route A，但它是专业资产和场景生产的关键能力。建议作为异步任务系统接入，而不是放进实时渲染帧循环：

```
Bake Request
  → validate UV / scene revision
  → background bake job
  → bake artifact cache
  → ECS metadata references baked assets
  → GPU cache loads baked textures / probes
```

需要区分：

- lightmap bake：依赖 UV2、灯光、静态几何标记。
- AO / curvature bake：可服务材质预览和导出。
- reflection / irradiance probe bake：服务 IBL 与室内场景。
- texture bake：服务材质合并、LOD、导出优化。

烘焙结果是资产元数据和纹理文件，不是临时 GPU cache；导出器也应从资产元数据引用烘焙结果。

#### 蓝图 / 可视脚本

蓝图不是 UI 画节点那么简单，核心是类型系统和执行模型。建议把它定位为 `SceneCommand` / ECS System / Agent Tool 之上的编排层：

```
Blueprint Graph
  → typed node schema
  → compile / validate
  → runtime graph VM or generated command plan
  → SceneCommandQueue / ECS systems
```

专业级蓝图至少需要：

- 节点 schema：输入、输出、类型、默认值、版本迁移。
- 事件模型：OnStart、OnTick、OnCollision、OnTrigger、OnAnimationEvent。
- 调试能力：断点、单步、变量观察、执行路径高亮。
- 安全边界：不能让 Webview 任意执行宿主代码；运行时必须沙箱化。
- 与 Agent 的关系：Agent 生成/修改蓝图，蓝图作为可审计的可视化逻辑资产。

短期不建议先做完整蓝图。更稳妥的路径是先做 typed action graph，用于材质、动画、相机和简单交互编排。

#### 游戏机制

游戏机制代表从“编辑器”进入“运行时模拟”。它需要独立的 runtime layer，不能只挂在 Webview UI 状态上：

| 能力 | 所需架构 |
|------|----------|
| 输入系统 | InputAction / InputMapping，与 Webview 事件和运行时事件解耦 |
| 物理碰撞 | PhysicsWorld、collider、rigid body、query API |
| 脚本生命周期 | start/update/fixedUpdate/event，不与渲染 tick 混用 |
| Prefab / Variant | 可复用对象模板、覆盖项、实例化和版本迁移 |
| Trigger / State Machine | ECS event bus + 状态机组件 |
| Play Mode | 编辑态和运行态隔离，支持进入/退出/暂停/单步 |

专业差距在于当前 `runtime-scene` 更像 authoring ECS，而不是完整 game runtime。建议先完成 Editor Viewport 和资产一致性，再讨论 Gameplay Framework；否则范围会快速膨胀。

#### Viewport

Viewport 是最高优先级，因为它是所有专业能力的入口。专业 Viewport 不是一个 `<video>`，而是一个复合编辑器：

```
Engine Video Layer
  + Overlay Canvas
  + Gizmo / Selection / Grid / Bounds
  + Debug Views
  + Timeline / Camera / Play Controls
  + Latency and Frame Diagnostics
```

必须补齐：

- 多相机和镜头切换：activeCamera、camera rig、keyframe refresh。
- picking：object id、depth、world position、normal。
- overlay：bbox、outline、gizmo anchor、bone control、IK target。
- snap：grid、vertex、surface、axis constraint。
- 调试视图：wireframe、depth、normal、light complexity、GPU timing。
- 性能模式：编辑低延迟模式、质量预览模式、最终导出模式。

结论：**Viewport 是 P0/P1，光影是 P1，烘焙/蓝图/游戏机制是 P2+。** 当前阶段先把 Engine Viewport 作为视觉真值和交互闭环做稳，再把专业引擎子系统逐步挂到同一套 ECS/command/revision 架构上。

#### 按专业工具组件对比

| 专业组件 | neko-suite 当前基础 | 专业级差距 | 建议动作 |
|----------|---------------------|------------|----------|
| 内存管理器 | Rust 所有权、`Arc` / `Vec`、`bytemuck`、GPU `buffer_pool`、encoder/decoder pool | 没有统一 frame arena、资源生命周期图、场景加载临时分配池和 GPU resource residency 预算 | P1：先做 `SceneGpuRuntime` 资源生命周期和预算；P2 再评估自定义 allocator / arena |
| 数学库 | `glam` 作为 3D 向量、矩阵、四元数基础 | 未形成项目级几何内核规范；缺少 bbox、ray、plane、frustum、projection、snap 等统一 math primitive | P0/P1：补 `scene-math` 或共享 math module，服务 picking、culling、overlay、snap |
| 任务调度器 | `tokio` 多线程、`crossbeam-channel`、service task、异步 HTTP/WS | 没有专业引擎 job graph；渲染、物理、动画、烘焙、编码之间缺少依赖调度和 frame budget | P1：先做 Engine frame scheduler；P2：烘焙/导出进入后台 job system |
| ECS / 场景图 | `runtime-scene` 使用 `bevy_ecs`，已有 Transform、Hierarchy、Light、Camera、Skeleton、Animation、IK、CSG | 缺少 authoritative dirty tracker、revision、prefab/variant、scene transaction、undo command log | P0：共享 Snapshot/Delta + command ack；P1：dirty tracker 和 transaction |
| 物理引擎 | 3D runtime 未集成 Rapier/PhysX；`runtime-puppet` 有 2D puppet physics 片段 | 缺少 3D collider、rigid body、ray cast、sweep、trigger、physics step | P2：引入 Rapier 作为可选 `runtime-physics`，先服务 picking/snap，再进入 game runtime |
| AI 行为树 / 状态机 | Agent tool / action registry 是创作编排，不是运行时 AI | 缺少 runtime behavior tree、state machine、blackboard、event-driven AI | P3：等 Gameplay Framework 明确后再做；短期只做 editor action graph |
| RHI | `wgpu` 抹平 Metal/Vulkan/DX/WebGPU；已有平台 import/export 互操作代码 | 没有自定义 RHI 抽象层、render graph、resource barrier/aliasing 策略 | P1：先基于 wgpu 建 `RenderGraph`/pass graph；不急着自研 RHI |
| 可见性裁剪 | 有 `Visible` 组件、后向面剔除、基础相机 | 缺少 frustum culling、LOD、occlusion culling、light culling、render list cache | P1：frustum + render list；P2：occlusion / cluster / light culling |
| Shader 系统 | WGSL shader 文件、PBR/skinned/particle/postprocess/effects 管线 | 缺少 shader variant、material feature flags、热重载、编译缓存、错误回传 | P1：建立 `ShaderRegistry` + variants + diagnostics；P2：热重载 |
| 光照与后处理 | PBR forward、Light uniform、IBL 环境模块、post-process/tone mapping/bloom 基础 | 阴影、GI、TAA/FXAA、SSAO、反射探针、统一色彩管理未闭环 | P1：阴影 + 色彩管理 + IBL 接入；P2：probe / SSAO / TAA |
| 虚拟文件系统 VFS | VSCode workspace、PathResolver、asset registry、glTF 文件加载 | 没有引擎私有包、挂载点、资源权限、远程/缓存统一抽象 | P2：`AssetResolver` / VFS；优先支持 `${PROJECT}`、cache、baked artifacts |
| 序列化系统 | `serde` / JSON、`.nkm` project、glTF loader/exporter | 缺少版本化 binary scene、schema migration、partial load、streaming scene | P1：版本化 scene schema；P2：binary/cooked scene stream |
| 资源烘焙 | AssetCache 能从 glTF 派生 GPU buffer/texture；无 bake pipeline | 缺少 FBX/glTF → engine asset、lightmap、probe、LOD、texture bake、cook cache | P2：异步 bake job + artifact manifest |
| 音频引擎 | `runtime-media` / FFmpeg / cpal / audio mixdown 面向媒体处理 | 缺少 3D spatial audio、listener、occlusion、reverb zone、runtime mixer | P3：游戏 runtime 阶段再做；编辑器阶段只保留媒体音频 |
| 粒子 / VFX | GPU compute particle system 和 particle shader 已存在 | 缺少 ECS authoring、emitter UI、timeline、碰撞、VFX graph、LOD | P1/P2：先把 ParticleEmitter 进入 ECS 和 Inspector；后续 VFX graph |
| Viewport | R3F Viewport、OrbitControls、Grid、TransformControls；Engine stream 未接 | 视觉真值和交互分裂；缺少 video layer、overlay、picking、debug views | P0：Engine video viewport + overlay + hit-test |
| Inspector | 有 TransformPanel，但偏只读和局部字段 | 缺少反射驱动的组件面板、材质/灯光/相机/粒子/动画编辑 | P1：基于共享 schema 自动生成 Inspector |
| Undo/Redo | 命令注册存在，3D 操作未形成可靠 command history | 缺少场景 transaction、逆操作、跨 Engine/Webview 的 revision 对齐 | P1：以 `SceneCommand` 为 undo 单元，记录 before/after delta |
| 脚本与反射 | TypeScript 类型、action registry、Agent operation adapter；Rust 侧无统一 reflection | 缺少 runtime reflection、component metadata、脚本绑定、沙箱执行、热重载 | P1：先做 component schema/reflection metadata；P2：typed action graph；P3：脚本 VM |

这个对比说明：当前项目已有 **wgpu / ECS / glTF / GPU 粒子 / 音频媒体 / Webview 编辑器** 的基础，但专业工具缺的是统一的 **资源生命周期、调度、反射、命令历史、渲染图、烘焙与运行时逻辑框架**。因此近期不要先追完整游戏引擎，而要先把 Viewport、SceneCommand、SceneDelta、RenderGraph、Inspector schema 做成稳定骨架。

### 9.6 交互可编辑性差距

视频流天然不可编辑。专业级 Webview 需要额外接收可编辑投影数据：

```ts
interface ViewportOverlayState {
  revision: number;
  camera: CameraState;
  selectedNodeIds: string[];
  projectedBounds: ProjectedBounds[];
  gizmoAnchors: GizmoAnchor[];
  hoveredNodeId?: string;
}
```

缺口清单：

- picking：需要 Engine 提供 hit-test，不靠前端猜。
- depth：拖拽、吸附、地面放置需要 depth / world position。
- bbox：选框和层级对象高亮需要 projected bounds。
- bone / IK handle：人物动作编辑需要控制点投影，而不是传完整骨骼网格。
- material slot：材质编辑需要 slot id、material id、texture reference，而不是只看画面。

### 9.7 工程化差距

专业级系统必须可测试、可诊断、可降级：

| 方向 | 当前缺口 | 建议门禁 |
|------|----------|----------|
| 契约测试 | TS/Rust 场景类型未统一 | Snapshot / Delta roundtrip 测试 |
| 时序测试 | HTTP 无序，缺少 ack | command seq 单调性、乱序丢弃测试 |
| 渲染测试 | 缺少 viewport 与导出一致性验证 | golden frame / perceptual diff |
| 性能测试 | 缺少 GPU/encode/decode 指标 | 1080p30 基线、1080p60 目标、过载降级测试 |
| 故障恢复 | WebSocket 断线、decoder reset 策略不明确 | reconnect、keyframe request、snapshot resync 测试 |
| 安全边界 | Webview 直连本机服务需能力约束 | token / session id / origin 校验 |

### 9.8 优先级结论

专业化优先级应按闭环推进（2026-04-27 修订，与 §五、§十.5、§十一同步）：

```
P0  一致性闭环：完整 SceneSnapshot/SceneDelta(patch) + command ack + revision + ViewportDescriptor
P0  资产真值闭环：AssetDatabase（GUID + Descriptor）+ 导出器读 Database 不读 Cache
P0  Render World 隔离：Simulation/Render system label + ECS 不持 wgpu 对象
P1  渲染骨架闭环：RenderGraph（pass + lifetime + barrier）+ Render Extract Phase
P1  视觉真值闭环：capture 可显示帧（整屏切换） + scenes:stream + 多视口
P1  Viewport 闭环：video layer + overlay + picking + gizmo + 按 viewportId 路由
P1  交互闭环：hit-test + overlay projection + 本地预测校正 + 命令 seq/ack
P1  质量闭环：材质/灯光/法线/阴影/动画导出一致 + 色彩管理统一
P1  性能闭环：FrameScheduler frame budget + latency 分位数指标 + 5 级降级

[本 ADR 范围之外，未来 ADR ToC]
P2  远程闭环：RenderTransport 抽象 + WebRTC 可选
P2  烘焙闭环：lightmap / probe / texture bake artifact pipeline
P2  蓝图闭环：typed action graph + event model + debug
P2/P3 游戏机制闭环：physics / input / prefab / play mode
```

换句话说，专业差距的本质是：当前已有不少局部能力，但缺少把 **ECS 真值、AssetDatabase、Render World 隔离、RenderGraph、视频输出、语义流、FrameScheduler** 串成一个可验证闭环的架构。本 ADR 只承诺到 P0/P1 闭环；P2 闭环留给后续 ADR。

---

## 十、开发方案：3D Engine + Webview

本方案按“Engine 负责真值和渲染，Webview 负责交互和展示，Extension 负责 VSCode 能力代理”拆分。开发时不要把视频、场景语义和 VSCode IPC 合并成一个通道。

### 10.1 数据契约先行

先在 `@neko/shared/types` 或 `packages/neko-proto` 固化以下契约，再分别接 Engine 和 Webview：

**SceneCommand / SceneCommandAck 的规范定义在 §3.6**（`SceneCommandEnvelope` + `SceneCommandAck` with `status: 'applied' | 'rejected' | 'superseded'`）。本节不再重复定义信封字段，只在原有 type 枚举基础上**扩展 SceneCommand.type 与 envelope 字段**：

```ts
// 复用 §3.6 SceneCommandEnvelope:seq / transactionId / phase / baseRevision / coalesceKey / command
// 复用 §3.6 SceneCommandAck:seq / appliedSeq / baseRevision / revision / status / error
// 本节仅扩展 command.type 枚举与新增 modeling 相关字段:

interface SceneCommand {
  type:
    | 'transform' | 'camera:set' | 'camera:switch'
    | 'animation:play' | 'animation:seek'
    | 'material:update' | 'visibility:set'
    | 'hierarchy:reparent' | 'hierarchy:reorder'
    | 'asset:bind' | 'node:add' | 'node:remove'
    // 自由建模会话（§3.10）— 协议位预留,具体实现在后续 ADR
    | 'modeling:beginSession' | 'modeling:endSession' | 'modeling:cancelSession'
    | 'modeling:brushStroke' | 'modeling:topologyOp' | 'modeling:uvUnwrap';
  payload: unknown;

  // 自由建模专用字段:命令进入 envelope 后,这些字段与 envelope.baseRevision 协同验证
  topologyVersion?: number;        // 自由建模命令必须声明拓扑版本
  modelingSessionId?: string;      // 自由建模命令必须声明会话
}

// 注:envelope.baseRevision 已经覆盖 sceneRevision 校验,SceneCommand 不再单独冗余 sceneRevision。

// SceneDelta 是 patch 语义:每个字段只携带本帧 dirty 的子集,空字段表示"没有变更"
// 不携带 baseline 全量;Webview 用 revision 对齐,丢失中间 delta 时触发 snapshot resync
interface SceneDelta {
  revision: number;
  appliedSeq?: number;

  // 变换 / 蒙皮 / 动画
  updatedTransforms?: TransformPatch[];        // patch:仅变化的 (nodeId, fields)
  updatedMorphWeights?: MorphWeightsPatch[];
  animationState?: AnimationStatePatch;

  // 层级 / 生命周期
  addedNodes?: SceneNodePatch[];               // 新建节点的最小 authoring 字段
  removedNodes?: string[];
  updatedHierarchy?: HierarchyPatch[];         // reparent / reorder
  updatedVisibility?: VisibilityPatch[];       // visible / layerMask
  updatedLayers?: LayerPatch[];

  // 材质 / 资产引用
  updatedMaterials?: MaterialPatch[];          // slot 级别参数变更
  updatedAssetReferences?: AssetReferencePatch[]; // mesh / texture / material handle 重新绑定

  // 灯光 / 相机
  updatedLights?: LightPatch[];
  activeCamera?: CameraState;
  updatedCameras?: CameraPatch[];

  // 自由建模事件（§3.10）— 协议位预留,实现在后续 ADR
  topologyChanges?: TopologyChangeEvent[];     // 拓扑变更:粗粒度,作废 morph/skin/uv 时携带 invalidates 标志
  modelingSessions?: ModelingSessionState[];   // 会话生命周期:begin/active/committed/cancelled

  // 视口辅助 / overlay
  overlay?: ViewportOverlayPatch;
}

// 自由建模高频顶点 patch — 不进 SceneDelta 主通道,走二进制副通道避免 JSON 编码开销
// 通过 /v1/scenes/control 同一 WebSocket 的二进制消息或独立 /v1/scenes/mesh-stream 推送
interface VertexBrushPatch {
  meshId: string;
  topologyVersion: number;
  modelingSessionId: string;
  affectedRange: { startVertex: number; count: number };
  // SoA / Δ-encoded:positionDeltas[i*3..i*3+3] 对应 affectedRange 内第 i 个顶点的 (Δx,Δy,Δz)
  positionDeltas: ArrayBuffer;
  // 可选:法线 / UV 同步更新
  normalDeltas?: ArrayBuffer;
}

// 拓扑变更事件 — 进 SceneDelta.topologyChanges
interface TopologyChangeEvent {
  meshId: string;
  fromVersion: number;
  toVersion: number;
  operation:
    | 'subdivide' | 'decimate' | 'boolean'
    | 'remesh' | 'dynamic-add' | 'dynamic-collapse'
    | 'uv-unwrap';
  invalidatesMorphLibrary: boolean;            // 顶点序变化作废 morph delta
  invalidatesSkinWeights: boolean;             // 顶点序变化作废 skin 权重
  invalidatesUv: boolean;                      // UV 重绘
  vertexCountBefore: number;
  vertexCountAfter: number;
}

// 自由建模会话状态 — 进 SceneDelta.modelingSessions
interface ModelingSessionState {
  sessionId: string;
  characterId?: string;                        // 关联 LayeredCharacterDescription
  topologyMutable: boolean;
  topologyVersion: number;
  state: 'begin' | 'active' | 'committed' | 'cancelled';
  pendingMigrations?: ('morph-retarget' | 'skin-retarget' | 'uv-reproject')[];
}

interface RenderStreamDescriptor {
  streamId: string;
  viewportId: string;                          // 与 ViewportDescriptor 对齐,允许多视口

  // VSCode Webview 实时链路只支持 H264StreamClient（WebCodecs）
  // - 'h264-annexb':H.264 NAL 以 Annex B 字节流（含 start code 0x00000001）格式承载,WebCodecs 直接消费
  // - 'h264-avcc':H.264 NAL 以 length-prefixed（每个 NAL 前置 4 字节大端长度）格式承载,常见于 mp4 box
  container: 'h264-annexb' | 'h264-avcc';
  // RFC 6381 H.264 codec string,Webview 用它检查 VideoDecoder.isConfigSupported
  // 例:'avc1.42001f'（baseline 3.1） / 'avc1.640028'（high 4.0）
  codecString: string;
  profile?: 'baseline' | 'main' | 'high';
  level?: string;                              // 如 '3.1' / '4.0' / '4.1'
  // frameHeader 控制 WebSocket 二进制消息的应用层帧头格式（独立于 codec container）
  // - 'neko-h264-v1':25 字节固定头 [pts_us i64 LE (8B)][dts_us i64 LE (8B)][is_keyframe u8 (1B)][duration_us i64 LE (8B)] + payload
  //                 与 packages/neko-client/src/H264StreamClient.ts 当前实现匹配
  //                 payload 是单个 access unit（含一个或多个 NAL,按 container 字段决定 Annex B / AVCC 格式）
  frameHeader: 'neko-h264-v1';
  // SPS/PPS 初始化数据
  // - h264-annexb / h264-avcc:可选,WebCodecs 也能从首个 IDR 自动配置;有则用于 VideoDecoder.configure({ description }) 加速首帧
  initData?: { format: 'avcc-record'; data: string }; // base64

  width: number;
  height: number;
  fps: number;
  colorSpace: 'srgb' | 'rec709' | 'p3';
  bitDepth: 8 | 10;
  toneMapping: 'aces' | 'reinhard' | 'none';
  // GOP 配置:Webview 据此推断丢帧后多久能恢复;keyframe interval 影响 seek 与 camera 切换时的回环延迟
  gopSize?: number;                            // 单位:frame,默认 fps × 2
  initialRevision: number;

  // 可选音频流引用（详见 §3.3 音视频输出栈约束）
  // 视频与音频始终是两条独立 WebSocket,不复用同一二进制通道
  audioStream?: AudioStreamDescriptor;
}

// VSCode Webview 实时链路的音频输出固定为 PCM f32le,不引入 Opus / AAC 等编码
// 与 packages/neko-client/src/AudioStreamClient.ts 当前实现匹配
interface AudioStreamDescriptor {
  streamId: string;                            // 独立的 audio stream id
  // 仅 PCM f32le;不允许 'opus' / 'aac' 等编码值
  codec: 'pcm-f32le';
  // 22 字节固定头 [pts_us i64 LE (8B)][duration_us i64 LE (8B)][sample_rate u32 LE (4B)][channels u16 LE (2B)] + interleaved f32le
  frameHeader: 'neko-pcm-v1';
  sampleRate: number;                          // 例:48000 / 44100
  channels: 1 | 2;                             // mono / stereo;3D spatial audio 仍输出 stereo,空间计算在 Engine 完成
  // 是否作为 A/V 同步主时钟（AudioStreamClient.getCurrentTime() 默认为 master clock）
  isMasterClock?: boolean;                     // 默认 true
}
```

实时视频帧沿用 `/v1/streams/:stream_id` 二进制通道，但需要在帧头或旁路 metadata 中补齐：

```ts
// RenderFrameMeta 是渲染帧的旁路元数据,所有 §3.6 / §3.8 / 工作包提到的"renderFrameMeta"均以本定义为准
// 通过 /v1/scenes/control state channel 推送,frameId 与视频帧一一对应供 overlay 对齐
interface RenderFrameMeta {
  // 路由
  streamId: string;                            // 与 RenderStreamDescriptor.streamId 对齐
  viewportId: string;                          // 与 ViewportDescriptor.viewportId 对齐,多视口路由

  // 帧时序
  frameId: number;                             // 单调递增,供 overlay 对齐
  ptsUs: number;                               // presentation time,microseconds
  // duration:overlay 对齐 / 丢帧统计 / 动画时间轴对齐依赖；raw H.264 没有容器时序信息,必须由 neko-h264-v1 25 字节固定头逐帧携带
  durationUs: number;
  isKeyframe: boolean;

  // 与控制流对齐
  sceneRevision: number;                       // 该帧渲染时的 ECS revision
  appliedSeq: number;                          // 该帧已包含的最大已应用 command seq

  // 诊断（FrameScheduler 产出,可选）
  diagnostics?: {
    gpuFrameTimeMs?: number;
    encodeTimeMs?: number;
    qualityTier?: 'high' | 'medium' | 'low';   // 当前降级档位
    droppedFramesSinceLast?: number;
  };
}
```

**SceneDelta patch 语义约束**：

- 字段缺失 = 未变更，**不要**用空数组表示 reset；reset 必须通过显式 command 或 snapshot resync。
- 列表项以 `nodeId` / `materialId` 等稳定 ID 为主键，Webview 在本地镜像上做 upsert。
- `addedNodes` 携带新节点的最小 authoring 字段（transform / parentId / assetRefs）；详细组件由后续 patch 补齐。
- `removedNodes` 在 Webview 镜像中级联删除子树。
- `updatedAssetReferences` 触发 Webview 失效相关材质/网格缓存，但不传二进制资源。

**自由建模协议约束（§3.10）**：

- 笔刷顶点 patch（`VertexBrushPatch`）走二进制副通道，不进 JSON SceneDelta；保证高频小 patch 不被 JSON 编码拖慢。
- 拓扑变更（`TopologyChangeEvent`）进 SceneDelta 主通道，必须带 `fromVersion / toVersion` 和 `invalidatesXxx` 标志；Webview 收到后失效相关本地预测副本和缓存。
- 任何带 `topologyVersion` 的 patch / event / command 在 Engine 端必须用 `topologyVersion` 路由——跨拓扑版本的 patch 直接拒绝。
- `ModelingSessionState` 用于 Webview 同步会话生命周期；`begin` 时分配预测副本，`committed/cancelled` 时丢弃。

禁止把 `wgpu::Buffer`、`wgpu::Texture`、完整 mesh、完整 texture 或每帧 RGBA 作为实时契约暴露给 Webview。**例外**：自由建模会话期间允许 Webview 持有 mesh 顶点位置预测副本（§3.10），但必须带 `topologyVersion + sessionId`，会话结束即丢弃。

### 10.2 Engine 工作包

| 工作包 | 内容 | 产物 | 优先级 |
|--------|------|------|--------|
| E0 OOP/ECS 骨架 | 建立 `SceneDocument` / object handles、`SceneRevision`、`NodeIndex`、`DirtyTracker`、`ComponentSchemaRegistry`；标记 Simulation/Render system label | OOP authoring 模型、命令入口和 ECS 状态边界固定 | P0 |
| E1 AssetDatabase 最小骨架 | `AssetHandle(GUID)` + `AssetMetadata` + `AssetDescriptor`（Material/Mesh/Texture）；`AssetCache` 改为派生缓存 | 导出器读 Database 不读 Cache；GPU 资源句柄不进入 authoring ECS | P0 |
| E2 共享契约 | 定义完整 `SceneSnapshot`、`SceneDelta`（patch 语义）、`SceneCommand`、`SceneCommandAck`、`ViewportDescriptor`、`RenderStreamDescriptor`、`AudioStreamDescriptor`、`RenderFrameMeta` | TS/Rust 对齐类型，替换 `Record<string, unknown>` | P0 |
| E3 直接控制通道 | 新增 `/v1/scenes/control` WebSocket，Webview 直连 Engine，承载 command/query/resync/requestKeyframe | 交互控制不经过 Extension，不走 HTTP | P1 |
| E4 命令队列与状态流 | `scenes` 域有序 command queue，支持 `seq` / `appliedSeq` / 失败原因 / revision；推送完整 `SceneDelta` patch（含 hierarchy / material / visibility / asset / lights / cameras） | `transform-ack` 不再 fire-and-forget | P1 |
| E5 RenderGraph 骨架 | 最小 RenderGraph：pass 声明 + resource lifetime + barrier 自动 + dead pass 剪枝；承载 PBR forward + post-process + color convert | 后续阴影 / IBL / SSAO 有 pass 插槽 | P1 |
| E6 Render World 隔离 | Simulation ECS → extract phase → Render World（SoA + GPU handle）；render-only resources / barrier 由 RenderGraph 管 | ECS 不持 wgpu 对象；渲染线程不竞争 authoring 组件 | P1 |
| E7 GPU 常驻运行时 | `SceneGpuRuntime` 从 Render World 增量更新 GPU transform/material/instance buffer | 减少 CPU-GPU 往返，避免每帧重建资源 | P1 |
| E8 单帧质量输出 | 补齐 `scenes:capture` 的可显示输出，优先 encoded image 或单帧 encoded packet | Route C 可用（整屏切换，不叠加） | P1 |
| E9 视频流 + 多视口 | 实现 `scenes:stream`，接受 `ViewportDescriptor` 返回 streamId；同 sceneId 下并发 N 视口 | Route A 可显示 Engine Viewport | P1 |
| E10 交互查询 | 按 `viewportId` 路由 hit-test / picking / projected bounds / gizmo anchor 查询 | 点击选择、hover、高亮、Gizmo 对齐 | P1 |
| E11 FrameScheduler | 帧 budget 划分 + 5 级降级策略 + 指标产出（ack p95 / motion-to-photon / GPU frame time / encode time） | 高负载时按规则降级，永不阻塞控制 WS | P1 |
| E12 质量反馈 | 输出 render error、dropped frames、encoder latency；接入 `engine-feedback-bus` | L1 Feedback 和跨域性能诊断 | P1（依赖外部 crate） |

Engine 内部依赖方向：

```
SceneCommandQueue
  → Simulation ECS（authoring 真值）+ AssetDatabase（asset 真值）
  → SceneDirtyTracker
  → Render Extract Phase
  → Render World（SoA + GPU handle）
  → RenderGraph（pass + lifetime + barrier）
  → SceneGpuRuntime / AssetCache（GPU 派生）
  → PBR / Post-process passes
  → GPU color convert / encoder
  → StreamRegistry → /v1/streams/:stream_id
  ↑
  └── FrameScheduler 监督全链路 budget 与降级
```

`runtime-scene` Simulation 部分承载 Engine 侧场景语义真值；`AssetDatabase` 承载资产真值；`SceneGpuRuntime` / `AssetCache` 只是派生缓存。导出器只读 Simulation ECS + AssetDatabase，不从 Render World / GPU cache 反向读回材质。

### 10.3 Webview 工作包

| 工作包 | 内容 | 产物 |
|--------|------|------|
| W1 直接控制客户端 | 定义 `SceneControlSocket`，连接 `/v1/scenes/control`，处理 hello/subscribe/command/query/resync/ack/delta | 交互控制流绕过 Extension 和 HTTP |
| W2 视频视口 | `VideoViewport` 支持 WebCodecs H.264 单一路径；**`H264StreamClient` 必须从 `RenderStreamDescriptor` 动态读取 `codecString` / `container` / `frameHeader` / `initData` 初始化 `VideoDecoder.configure({ codec, description })`**，禁止硬编码 `avc1.*`；客户端配置接口新增 `streamDescriptor: RenderStreamDescriptor` 字段；3D Webview 实时链路不创建 `FMP4StreamClient`、不走 MSE、不接受 `frameHeader='neko-fmp4-v1'` | `VideoViewport` presentation surface（canvas/`VideoFrame`）显示 Engine 帧；切换 H.264 profile / packetization 不需要改客户端代码 |
| **W2-A 音频客户端** | `AudioStreamClient` 接收 `AudioStreamDescriptor`：(1) 必须校验 `codec === 'pcm-f32le'` 与 `frameHeader === 'neko-pcm-v1'`，遇到 `'opus'` / `'aac'` 等其他值直接拒绝并报错；(2) 校验 `sampleRate` / `channels` 与 wire 帧头一致，不一致则丢弃首批帧并 resync；(3) 客户端配置接口新增 `streamDescriptor: AudioStreamDescriptor` 字段；(4) `EngineClient` 拼 `/v1/audio/:stream_id`（B6-A 上线后），短期 fallback 到 `/v1/streams/...`；(5) `getCurrentTime()` 仍作为 master clock 暴露给视频栈对齐 | Webview 实时播放链路音频固定 PCM f32le；非法编码不静默 fallback；音视频时钟可对齐 |
| W3 场景状态 Store | Zustand 接收 `SceneDelta`，维护 revision、selection、camera、animation 状态 | 属性面板和树视图使用同一份语义状态 |
| W4 命令控制器 | 所有编辑操作带 `seq` 发送，等待 ack；失败时回滚或重放 | 消除 fire-and-forget 分叉 |
| W5 本地预测层 | Gizmo、IK handle、拖拽时先画 overlay，Engine 帧回来后校正 | 降低感知延迟 |
| W6 Overlay Canvas | 绘制选框、bbox、gizmo anchor、辅助线、hit-test hover | 视频流可编辑化 |
| W7 相机控制 | OrbitControls 本地计算 camera command，Engine 返回 camera matrix / revision | 保持相机交互顺滑 |
| W8 诊断面板 | 显示 FPS、frame latency、appliedSeq、sceneRevision、droppedFrames | 性能和一致性可观测 |

Webview 运行时结构：

```
SceneControlSocket (/v1/scenes/control)
  ├─ Client → Engine: SceneCommand(seq) / Query / Resync / RequestKeyframe
  └─ Engine → Client: Ack / SceneDelta / QueryResult / RenderFrameMeta / Error

RenderVideoSocket (/v1/streams/:stream_id)
  └─ Engine → Client: raw H.264 packets

VideoViewport
  └─ OverlayCanvas
        ├─ GizmoController
        ├─ SelectionController
        └─ HitTestController
```

Three.js / R3F 在 Route A 后只保留为交互辅助或开发 fallback，不再作为视觉真值。

### 10.4 Extension Host 工作包

Extension Host 保持轻量：

- 启动/发现 Engine，向 Webview 下发端口和能力信息。
- 管理 `webview.asWebviewUri()`、导入导出、保存对话框、工作区路径。
- 设置 CSP，允许 Webview 直连 `127.0.0.1` 的 HTTP/WebSocket。
- 不中转视频帧，不承载 60fps `SceneDelta`。
- 只在需要 VSCode API 的命令上做代理，例如文件选择、保存、工作区资源访问。

### 10.5 里程碑

| 阶段 | 目标 | 验收条件 |
|------|------|----------|
| M0 骨架与契约对齐（P0） | 补齐 `SceneDocument` object model、`SceneRevision`、`NodeIndex`、`DirtyTracker`；最小 `AssetDatabase`（GUID + Descriptor）；共享 `SceneSnapshot` / `SceneDelta` (patch 语义) / `SceneCommandAck` / `ViewportDescriptor`；Simulation/Render World 边界标记 | EngineClient 不再以 `Record<string, unknown>` 暴露 3D 快照；导出器读 AssetDatabase；WS handler 不直接改组件；多视口协议落地（即使先发单视口）；ECS 不持 wgpu 对象 |
| M1 控制/状态 WS（P1） | Webview 直连 `/v1/scenes/control` | transform 有 ack，`SceneDelta` 带 revision / appliedSeq / hierarchy / material patch，hit-test/query 可用 |
| M2 RenderGraph 骨架（P1） | 最小 RenderGraph（pass 声明 + lifetime + barrier 自动）承载现有 PBR forward + post-process + color convert | 接入阴影 / IBL / SSAO 时不再到处插 barrier；ViewportDescriptor 不变时跳过 compile |
| M3 Route C（P1） | `scenes:capture` 返回可显示质量帧 | Webview 整屏切换显示 Engine 单帧质量预览（不叠加） |
| M4 视频流 + 多视口（P1） | `scenes:stream` 接受 `ViewportDescriptor` 返回 streamId，Webview 播放 Engine 帧 | 不经过 Extension Host，不传实时 RGBA；同 sceneId 下可并发 N 个 viewport |
| M5 可编辑视频视口（P1） | Overlay + hit-test + Gizmo 本地预测 | 点击选择、拖拽、相机切换、IK handle 可用；overlay 按 `viewportId` + `sceneRevision` 对齐 |
| M6 FrameScheduler 与降级（P1） | 帧 budget + 5 级降级策略 + §10.6 指标产出 | 高负载时按规则降级，不阻塞控制 WS；ack p95 / motion-to-photon / GPU frame time / encode time 可观测 |
| M7 远程预留（P2） | 抽象 `RenderTransport`，加入 WebRTC 可选实现 | 本机仍默认 WebSocket，远程场景可扩展 |

### 10.6 性能与延迟验收线

仅看 FPS 会掩盖控制路径延迟问题。专业 3D 引擎用分位数硬指标守门，FrameScheduler（§3.8）负责产出指标。

#### 通用指标（与 workMode 无关）

| 类别 | 指标 | 目标（本机 1080p） |
|------|------|---------------------|
| 控制延迟 | 命令 ack p50 | < 8ms |
| 控制延迟 | 命令 ack p95 | < 16ms |
| 控制延迟 | 命令 ack p99 | < 33ms |
| 端到端 | hit-test 往返 | p95 < 30ms |
| GPU | RenderGraph compile 重复利用 | ViewportDescriptor 不变时跳过 compile |
| 编码 | encode time p95 | < 4ms（硬件）/ < 8ms（软件） |
| 数据流 | 状态流大小 | 只推 dirty patch，不推完整 snapshot |
| 数据流 | Extension 负载 | 不处理高频二进制帧和 60fps delta |
| 路径 | 实时路径 | 禁止 CPU RGBA readback 作为常规帧路径 |
| 恢复 | 相机切换 / seek / render mode 切换 | 强制 keyframe 或刷新解码状态 |
| 拖拽 | overlay 即时反馈延迟 | < 1 帧（合成线程） |
| 降级 | 过载策略 | 按 §3.8 FrameScheduler 5 级降级，永不阻塞控制 WS |

#### Per-workMode budget profile（FrameScheduler 切换依据）

每个工作模式按目标 FPS 拆分两套 profile（30fps / 60fps），FrameScheduler 按 `ViewportDescriptor.workMode + ViewportDescriptor.fps` 选择。`-` 表示该模式下不适用或非关键。

**预算口径（必须明确）**：

- 表中 `sim` / `extract` / `render` / `encode` 是 **Engine 单视口、单帧** 的硬上限；多视口下 GPU 总占用为各视口 render+encode 之和，由 §10.6 多视口段约束。
- `frame total` 是 sim+extract+render+encode 之和，**必须严格小于 1000/fps ms**。30fps 留 33.3ms / 60fps 留 16.7ms。
- Webview 解码 / 合成不计入此表，由客户端独立验收（< 1 frame 合成延迟、解码延迟见 §10.6 通用指标）。

##### 60fps profile（frame total ≤ 16.7ms）

| 工作模式 | sim | extract | render | encode | frame total | motion-to-photon p95 | 备注 |
|---------|----|---------|--------|--------|-------------|----------------------|------|
| edit-parametric (60) | 3ms | 1.5ms | 8ms | 3ms | 15.5ms | < 100ms | 默认编辑路径，硬件编码器 |
| pose (60) | 4ms | 1.5ms | 8ms | 3ms | 16.5ms | < 100ms | IK 占 sim 大头 |
| edit-free 笔刷 (60) | — | — | — | — | — | — | 60fps 下笔刷不可达，降为 30fps profile |

##### 30fps profile（frame total ≤ 33.3ms）

| 工作模式 | sim | extract | render | encode | frame total | motion-to-photon p95 | 备注 |
|---------|----|---------|--------|--------|-------------|----------------------|------|
| edit-parametric (30) | 4ms | 2ms | 18ms | 6ms | 30ms | < 130ms | 高分辨率 / 高质量后处理时降级到此 |
| edit-free 笔刷 (30) | 8ms | 4ms（顶点 buffer 上传） | 12ms | 6ms | 30ms | < 80ms（笔刷反馈优先） | 笔刷优先；可降后处理 |
| pose (30) | 6ms | 2ms | 18ms | 6ms | 32ms | < 130ms | — |
| render-preview (30) | 1ms | 0.5ms | 22ms | 6ms | 29.5ms | - | 锁定编辑；全力渲染 |
| lookdev (30) | 2ms | 1ms | 18ms | 6ms | 27ms | - | 材质 / 后处理重 |

##### 偶发操作（非每帧）

| 操作 | 上限 | 备注 |
|------|------|------|
| edit-free 拓扑变更（subdivide / decimate / boolean） | < 1s 完成 | 提交时阻塞编辑命令但不阻塞控制 WS 心跳 |
| RenderGraph compile | 0.5ms（缓存命中）/ 5ms（首次或 ViewportDescriptor 改变） | ViewportDescriptor 不变时复用 compile 结果 |
| Asset 加载（mesh / texture / morph） | < 100ms（小资产）/ 异步（大资产，进度回报） | 不阻塞当前帧 |

#### 自由建模专项指标

| 指标 | 目标 |
|------|------|
| 笔刷顶点 patch 端到端 | p95 < 50ms（笔触落点 → Engine apply → 视频帧反映） |
| Webview 预测副本 displacement 反馈 | < 1 帧（本地合成） |
| VertexBrushPatch 二进制副通道带宽 | 高频笔刷 < 5MB/s（约 100k 顶点/秒） |
| TopologyChangeEvent 处理 | < 1s 完成（subdivide / decimate / boolean） |
| 拓扑提交后 morph/skin/uv 失效检测 | 必须 100% 准确（不允许静默作废） |

#### 辅助视口与多视口预算

| 指标 | 目标 |
|------|------|
| 辅助视口 FPS | 不低于 15fps，过载时优先降级到 10fps |
| 辅助视口分辨率 | 主视口的 50%-75% |
| **多视口 GPU 总预算（含主视口 render+encode）** | 主视口 60fps 时 ≤ 16ms；主视口 30fps 时 ≤ 33ms |
| 多视口下辅助视口 render+encode 之和 | ≤ 主视口剩余 budget；超出时按 §3.8 五级降级触发 |
| 跨视口 RenderGraph 资源共享 | 同 sceneRevision 下的 ECS extract 复用，不重复抽取 |

**口径说明**：60fps profile 表里给出的 sim+extract+render+encode 是**主视口单帧**的上限。当辅助视口接入时，render+encode 部分共享同一 GPU；若主视口已经接近 16ms 的 60fps 预算，辅助视口必须以更低 FPS / 更低分辨率运行，否则触发降级（关辅助 pass → 降辅助 FPS → 降辅助分辨率）。Sim 与 extract 在多视口下不重复执行（共享同一 ECS tick），因此不进入累加。

### 10.7 前后端重构方案

重构目标不是把现有代码一次性推倒重写，而是把 **契约、控制通道、状态权威、视频输出和 VSCode 能力代理** 拆清楚。前端和后端都围绕同一条规则收敛：`SceneCommand` 是唯一写入口，`SceneDelta/Snapshot` 是唯一语义读出口，`RenderStream` 是唯一视觉真值出口。

#### 当前耦合点

| 耦合点 | 现状 | 风险 |
|--------|------|------|
| Webview → Extension → Engine | `updateTransform` 通过 `postMessage` 进入 Extension，再走 HTTP dispatch | 高频交互多一次进程 hop，缺 ack，失败后 Webview 与 ECS 静默分叉 |
| 3D 类型契约 | Webview 有局部 `SceneSnapshot` / `SceneDelta`，`EngineClient` 仍返回 `Record<string, unknown>` | TS/Rust 字段不齐，Inspector、Agent、Undo 无法依赖 |
| Engine controller | `scenes:capture` 只返回元数据，`scenes:stream` 未实现 | 前端无法显示 Engine 视觉真值 |
| Webview Viewport | R3F 既做交互又做视觉预览 | Three.js 材质/动画与 wgpu PBR 不一致 |
| Extension Host | 同时承担 VSCode API 代理和部分 Engine 操作编排 | 容易被高频流量拖慢，也扩大 Webview 沙箱边界 |

#### 目标模块边界

```
packages/neko-proto 或 @neko/shared/types
  └─ SceneCommand / SceneCommandAck / SceneSnapshot / SceneDelta / RenderFrameMeta

packages/neko-engine/runtime-scene
  └─ OOP authoring model + ECS components/resources/events/systems，场景语义真值

packages/neko-engine/engine-kernel
  ├─ SceneService / SceneCommandQueue
  ├─ SceneGpuRuntime
  └─ RenderStreamProducer

packages/neko-engine/host-api
  └─ 低频 action controller：load/save/export/capture/stream descriptor

packages/neko-engine/host-http
  ├─ /v1/scenes/control     控制与状态 WebSocket
  └─ /v1/streams/:stream_id 视频二进制 WebSocket

packages/neko-client
  ├─ EngineClient           低频 HTTP 管理面
  ├─ SceneControlSocket     高频控制/状态面
  └─ H264StreamClient / AudioStreamClient

packages/neko-model/webview
  ├─ SceneDocument object model
  ├─ sceneStore             revision 标记的语义镜像
  ├─ VideoViewport
  └─ Overlay/Gizmo/Inspector controllers

packages/neko-model/extension
  └─ VSCodeBridge：启动 Engine、传 port/session/token、文件/命令/URI 代理
```

后端不暴露 Webview 专用结构；前端不复刻 Engine 计算逻辑；Extension 不成为高频数据总线。

#### 后端重构

| 步骤 | 模块 | 改动 | 验收 |
|------|------|------|------|
| B0 契约落地 | `neko-proto` / shared types | 定义 `SceneCommandEnvelope`、`SceneCommandAck`、`SceneSnapshot`、`SceneDelta`、`RenderStreamDescriptor`、`AudioStreamDescriptor`、`RenderFrameMeta` | Rust/TS roundtrip 测试通过，`EngineClient.getSceneSnapshot()` 不再返回裸 `Record` |
| B1 ECS 写边界 | `runtime-scene` | 新增 `SceneRevision`、`NodeIndex`、`DirtyTracker`、`SceneCommandEvent`、`CommandApplySystem` | `update_transform` 不全量扫描；每次 authoring 变更产生 revision |
| B2 Delta 提取 | `runtime-scene` | `DeltaExtractionSystem` 从 dirty set 生成 transform/material/camera/animation delta | TS/Rust `SceneDelta` 字段一致，包含 `updatedMorphWeights` |
| B3 控制 WS | `host-http` | 新增 `scene_control.rs`，实现 hello/subscribe/command/query/resync/requestKeyframe | Webview 直连 `/v1/scenes/control` 可收到 ack/delta/error |
| B4 Kernel 编排 | `engine-kernel` | `SceneCommandQueue` 串行化命令，`SceneService` 只暴露命令/查询/渲染入口 | command `seq` 单调，失败有原因，乱序命令可拒绝或重放 |
| B5 GPU 常驻 | `engine-kernel` | `SceneGpuRuntime` 只消费 render extraction，增量更新 transform/material/instance buffer | 常规帧路径无 CPU RGBA readback，无 GPU→CPU 材质反读 |
| B6 视频输出 | `host-api` / `host-http` | `scenes:stream` 创建 `RenderStreamDescriptor`，复用 `StreamRegistry` 和 `/v1/streams/:stream_id`；**descriptor 必须包含 `codecString` / `container` / `frameHeader='neko-h264-v1'` / `initData`（可选 avcc record），与 §10.1 规范一致；wire 格式固定为 `neko-h264-v1` 25 字节固定头；不返回 fMP4 init/media segment** | Webview 可按 descriptor 初始化 WebCodecs decoder，无需硬编码；切换 H.264 profile / packetization 不影响协议；3D Webview 实时链路不支持 fMP4 / MSE |
| **B6-A 音频通道与 channel split** | `host-http` / `neko-client` / `runtime-media` | (1) `host-http` 新增路由 `/v1/audio/:stream_id`（参考 `/v1/streams/:stream_id` 拓扑，按 `frameHeader='neko-pcm-v1'` 校验）；(2) `EngineClient` 新增 `getAudioWsUrl(streamId)` helper，与 `getStreamWsUrl()` 分离；(3) `scenes:stream` 返回的 `audioStreamId` 客户端默认拼到 `/v1/audio/...`；(4) 短期保留 `/v1/streams/:stream_id` 兼容（路径双向接受），长期下线 | 音视频通道在 URL、路由、client helper、监控四层分离；3D 域不存在 fMP4 内嵌音轨 |
| B7 查询能力 | `runtime-scene` / `engine-kernel` | hit-test、projected bounds、gizmo anchor、active camera query | Overlay 能以 revision 对齐视频帧 |

后端内部依赖只能向下：

```text
host-http route
  → host-api/session validation
  → engine-kernel SceneCommandQueue
  → runtime-scene ECS
  → SceneGpuRuntime / RenderStreamProducer
  → StreamRegistry
```

禁止路径：

- `host-http` route 直接修改 ECS component。
- `runtime-scene` authoring component 持有 `wgpu::Buffer` / `BindGroup`。
- 导出器从 `AssetCache` 反读材质、灯光或相机元数据。
- `scenes:stream` 通过 HTTP 返回每帧 RGBA 或完整 mesh。

#### 前端重构

| 步骤 | 模块 | 改动 | 验收 |
|------|------|------|------|
| F0 类型收敛 | `packages/neko-model/webview/src/types` | 删除局部 3D 契约，改用共享 `SceneSnapshot` / `SceneDelta` / `SceneCommandAck` | Webview 与 `EngineClient` 使用同一类型来源 |
| F1 VSCodeBridge | `extension` + `webview` | `postMessage` 只保留 ready、enginePort、session/token、文件导入、保存、VSCode 命令 | `updateTransform` 不再经过 Extension |
| F2 SceneControlSocket | `neko-client` | 新增直接控制客户端，处理连接、seq、ack pending map、重连 resync、heartbeat | transform 命令有 ack，断线后能 resync snapshot |
| F3 SceneDocument object model | `webview/services/scene` | `SceneDocument`、`SceneNodeHandle`、`MaterialHandle`、`CameraHandle` 全部编译为命令 | UI/Agent/插件不直接写 store |
| F4 SceneStore | `webview/stores` | Zustand 只保存 revision 标记的 snapshot/delta 镜像、selection、pending commands | 收到旧 revision delta 时丢弃或触发 resync |
| F5 Viewport 分层 | `webview/components/viewport` | 拆成 `VideoViewport`、`OverlayCanvas`、`InteractionLayer`、R3F fallback；**`VideoViewport` 创建 `H264StreamClient` 时把 `RenderStreamDescriptor` 整体透传**，由客户端按 descriptor 初始化 WebCodecs decoder | Route A 下视觉真值来自 Engine 视频；多视口下不同视口可走不同 H.264 profile / resolution / FPS |
| F6 Inspector schema | `webview/components/panels` | Inspector 从 `ComponentSchemaRegistry` 生成控件，字段编辑发 typed command | 材质、灯光、相机、动画字段不再 ad hoc |
| F7 本地预测 | `webview/controllers` | Gizmo/相机/IK 拖拽只更新 overlay/pending state，ack 后提交或回滚 | 拖拽不卡顿，失败可回滚 |

前端运行时目标：

```text
VSCodeBridge
  └─ enginePort/session/token

SceneControlSocket
  ├─ send SceneCommand(seq)
  ├─ receive Ack / SceneDelta / QueryResult / RenderFrameMeta
  └─ update SceneStore(revision)

SceneDocument object model
  └─ UI/Agent/Plugin object API

VideoViewport
  ├─ RenderStreamClient(raw H.264 / WebCodecs)
  └─ OverlayCanvas(selection/gizmo/projected bounds)
```

前端必须避免两类双写：

- 不让 `TransformGizmo` 同时写 R3F object 和 Webview store，再异步通知 Engine；它只能写 pending overlay，并发 `SceneCommand`。
- 不让 `AnimationPlayer` 使用 R3F `AnimationMixer` 作为事实来源；播放、seek、blend 状态必须进入 Engine ECS。

#### 迁移顺序

推荐按可回滚的垂直切片推进：

1. **契约切片**：共享 `SceneSnapshot/SceneDelta/SceneCommandAck`，替换 `Record<string, unknown>` 和 Webview 局部类型。
2. **命令切片**：实现最小 `/v1/scenes/control`，只支持 `transform`、`query snapshot`、`resync`、`ack`、`delta`。
3. **前端接线切片**：新增 `SceneControlSocket` 和 `SceneDocument`，把 `updateTransform` 从 Extension HTTP 路径迁出。
4. **状态一致性切片**：加入 `SceneRevision`、`DirtyTracker`、pending command 回滚、旧 revision 丢弃。
5. **视频切片**：实现 `scenes:stream` + `VideoViewport`，R3F 降级为 fallback 和交互辅助。
6. **专业编辑切片**：补 hit-test、projected bounds、schema Inspector、Undo/Redo transaction。

每个切片都必须保留旧路径作为短期 fallback，但 fallback 只能用于开发或兼容，不允许继续承载高频编辑主路径。

#### 测试与门禁

| 层 | 必测项 |
|----|--------|
| Rust ECS | `NodeIndex` 查询、命令应用、revision 递增、dirty delta 提取、snapshot/delta 序列化 |
| Rust HTTP/WS | `/v1/scenes/control` hello/command/ack/resync、断连清理、session/token 校验 |
| TS Client | `SceneControlSocket` seq、pending ack、乱序 ack、reconnect、requestKeyframe |
| Webview Store | 旧 revision 丢弃、pending overlay 回滚、snapshot resync、selection 与 delta 合并 |
| Viewport | 视频帧显示、overlay 对齐、相机切换 keyframe、拖拽 30/60fps 感知延迟 |
| 集成 | Webview 发 transform → Engine ack → SceneDelta → RenderFrameMeta → 视频帧 revision 对齐 |

最低性能门禁：

- 本机编辑路径禁止常规 CPU RGBA readback。
- Extension Host 不承载 60fps delta 或视频包。
- transform command 有 `seq/ack/revision`，失败不会静默分叉。
- `SceneDelta` 只推 dirty 字段，不推完整 scene。
- 视频过载时允许降 FPS/分辨率/质量，但不阻塞控制 WS。

#### 重构反模式

| 反模式 | 后果 | 替代方案 |
|--------|------|----------|
| 继续让 Extension 转发 transform | 延迟与丢包不可控，Extension 变成高频总线 | Webview 直连 `/v1/scenes/control` |
| Webview 保存权威 transform | 与 ECS 双写，Undo/Export/Render 分叉 | Webview 只保存带 revision 的镜像和 pending overlay |
| 用视频流替代场景流 | 属性面板、Agent、Undo 无语义数据 | 视频流 + SceneDelta 双流并行 |
| 用 SceneDelta 替代视频流 | Three.js 与 wgpu PBR 继续不一致 | Engine RenderStream 作为视觉真值 |
| 一开始引入 WebRTC | 增加 SDP/ICE/NAT/安全复杂度 | 本机先用 WS，远程再抽象 `RenderTransport` |
| 为 OOP 对象模型复制第二份可变事实树 | 重新制造同步问题 | OOP object handles 只生成 command/query，组件事实以 ECS revision 校准 |
| Render world 持有 authoring ECS 组件引用 | 渲染线程与命令队列竞争同一份组件，barrier 不可控；典型 Bevy 用户陷阱 | Extract phase 单向拷贝到 Render World；Render 只持有 SoA 数据 + GPU handle，绝不持 Simulation 组件指针 |
| Authoring ECS 组件持有 `wgpu::Buffer` / `wgpu::Texture` | 后端对象泄漏到 authoring 层，导出器、序列化、Undo 全部被 GPU 资源生命周期绑架 | ECS 只持 `AssetHandle` / `MaterialId`；GPU 资源属于 AssetCache / Render World |
| 把 Engine 单帧叠在 R3F canvas 上做"质量预览叠加" | 颜色空间 + tone mapping 不同 → 高光双倍 / 颜色错乱 / 半透明伪影 | Route C 用整屏切换，按下按钮切到 Engine 帧 |
| 单视口 RenderStreamDescriptor 锁死协议 | 事后加多视图 / lookdev / UV 视口必须破坏 host-http 协议 | 一开始就以 `ViewportDescriptor` 为单位，单视口=N=1 退化情况 |
| 把 RenderGraph 当成"以后再做的优化" | 阴影 / IBL / SSAO / TAA 一旦进入就要到处插 barrier 手工管理 atlas | RenderGraph 与 ECS 同期建立最小骨架（pass 声明 + lifetime + barrier） |
| 导出器读 GPU AssetCache 反推材质 | GPU→CPU 读回 + 后端对象泄漏 + 派生缓存被当真值 | 导出器只读 AssetDatabase + ECS authoring 组件 |

---

## 十一、结论

**根本修复只有一个方向：编辑器 Viewport 必须直接显示 Engine 的渲染输出（Route A）。**

这不是优化项，而是 WYSIWYG 承诺的基础条件。UE5/Unity/Godot 的经验证明没有捷径。

### 与四层审计的对齐总结

| 四层 | 当前状态 | 本 ADR 的修复动作 | 前置依赖 |
|------|---------|-----------------|---------|
| L4 Intent | 3D 域无 AgentCapabilityProvider | 注册场景操作工具（参照 neko-cut 示范） | 无 |
| L3 Orchestration | HTTP 无序，35 个 action | 改用 WebSocket 操作队列 + seq 号 | 无 |
| L2 ECS Data | EngineClient/共享契约仍是 `Record<unknown>`；SceneDelta 从未发送 | 定义共享 TS 类型镜像；接通 SceneDelta 推送 | 无 |
| L1 Feedback | 完全缺失 | 接入 `engine-feedback-bus`（transform-ack / render-frame-ready / export-quality） | `engine-feedback-bus` 共享 crate（四层审计 P0） |

### 实施顺序（建模 + 渲染优先，与 §十二 战略路线对齐，2026-04-27 修订）

阶段 1（本 ADR P0/P1 范围）按"**建模 → 渲染 → 最小交互**"分三个 wave 推进。下方编号 `Wave1-N` 是 §十一 的实施编号，与 §10.2 / §10.3 的工作包编号（E*、W*、F*、B*）独立，不互相引用；Webview 工作包 W2-A（音频客户端）与本节 Wave2-1（法线 shader）只是字面相似，分别属于不同表。

```
Wave 1:建模骨架（P0,所有后续工作的前置）
  Wave1-1  最小 AssetDatabase（GUID + AssetDescriptor）
  Wave1-2  修复 exporter.rs（材质 / 灯光 / 相机 / 可见性 prune 导出）依赖 Wave1-1
  Wave1-3  完整共享 SceneSnapshot / SceneDelta（patch 语义 + 自由建模协议位预留）
  Wave1-4  ViewportDescriptor + workMode（多视口协议 + 性能 budget profile）
  Wave1-5  Simulation / Render system label 边界（ECS 不持 wgpu 对象）

Wave 2:渲染一致性（P1,与 Wave 1 后期并行）
  Wave2-1  修复 pbr_forward.wgsl 法线贴图 shader
  Wave2-2  RenderGraph 骨架（pass + lifetime + barrier 自动）
  Wave2-3  Render World 隔离（extract phase + render-only resources）
  Wave2-4  scenes:capture 输出可显示质量帧（Route C 解锁）
  Wave2-5  scenes:stream 接受 ViewportDescriptor（Route A 解锁）
  Wave2-6  动画状态同步（播放状态进入 Engine ECS）
  Wave2-7  音视频通道分离（B6-A）+ AudioStreamClient descriptor-driven init（W2-A）+ 从 3D Webview 实时链路移除 fMP4/MSE

Wave 3:最小交互（P1,Wave 2 视频流就绪后）
  Wave3-1  /v1/scenes/control WebSocket（command/ack/delta/query/resync/requestKeyframe）
  Wave3-2  hit-test / projected bounds / gizmo anchor（按 viewportId 路由）
  Wave3-3  FrameScheduler + per-workMode budget profile + §10.6 指标产出
  Wave3-4  Webview 直连（控制流绕过 Extension）
  Wave3-5  本地预测层 v1（仅 transform / camera / Gizmo）

[依赖 engine-feedback-bus 就位后,Wave 3 之上]
  Wave4-1  render-frame-ready / export-quality / animation-conflict 接入统一反馈总线

[阶段 1 收尾,P1 接口预留 / 实施在后续 ADR]
  Wave5-1  LayeredCharacterDescription 接口插槽（CharacterCommand 协议位）
  Wave5-2  自由建模协议位（ModelingSession + VertexBrushPatch + TopologyChangeEvent）
  Wave5-3  Inspector schema 自动生成（ComponentSchemaRegistry）

[阶段 2 起,本 ADR 范围之外]
  Stage2-1  Timeline / EventGraph（adr-3d-interactive-narrative.md）
  Stage2-2  自由建模实现（adr-3d-free-modeling.md）
  Stage2-3  LayeredCharacterDescription 实现（adr-3d-character-authoring.md）
  Stage2-4  高级渲染 + 烘焙（adr-3d-advanced-rendering.md）
  Stage2-5  RenderTransport 抽象 + WebRTC 可选

[阶段 3 起,长期]
  Stage3-1  Gameplay Framework / 物理 / 蓝图 / Play Mode（独立立项）
```

**关键纪律**：阶段 1 永远不混入阶段 2 / 3 才需要的能力。如果某个需求看起来在阶段 1 解决更优雅，先问"它是否破坏 §3.x 的既有契约"——如果答案是"否"，可以做；如果是"是"，必须延后。

### Webview 自研量

- **阶段 1（建模 + 渲染 + 最小交互）**：Webview 自研量极低，只需 VideoViewport（`<canvas>` + WebCodecs `VideoFrame`）+ 独立 OverlayCanvas（Gizmo / 选中框 / 辅助线）+ transform 本地预测 + 多视口路由
- **阶段 2（互动影游）**：增加 Timeline UI / EventGraph 编辑器 / 对话编辑器，但仍不重写渲染
- **阶段 3（游戏 / 仿真）**：增加 Play Mode UI / Blueprint 编辑器
- 无需重写 3D 渲染器；Three.js / R3F 退化为纯交互辅助层（相机控制 + Gizmo + 选中框 + 可选预测副本）

### 参照标准：neko-puppet 是四层完整度最高的域

经 2D 域审计（2026-04-27），**neko-puppet 是当前四层完整度最高的参照域**，其架构是 neko-model 3D 域应当复制的模板：

```
neko-puppet（参照）                    neko-model（目标）
─────────────────────────────────      ──────────────────────────────────────
L4  AgentCapabilityProvider 已注册     → 注册 3D 场景操作工具（ScenePose / SceneAnimate）
    PuppetGenerateParams / FromImage       参照 neko-cut 示范迁移
    PuppetAdjust

L3  双向协议：HTTP + WebSocket          → Webview 直连 /v1/scenes/control
    discrete commands over HTTP            用 seq / ack / revision 替代当前全 HTTP 无序 dispatch
    continuous delta over /v1/puppets/stream

L2  TS 类型完整                        → 定义共享 SceneNodeSnapshot / SceneDelta TS 契约
    PuppetSnapshot / PuppetDelta           字段对齐 Rust components.rs 15+ 组件
    DeformedMesh — 与 Rust 结构对齐       接通 SceneDelta 推送（替代 Record<unknown>）

L1  60fps WebSocket delta 推送         → 待 engine-feedback-bus 就位后接通
    Engine ECS tick → deformed verts      transform-ack / render-frame-ready
    → Canvas 2D 光栅化                     / export-quality 信号
```

**关键对应关系**：

| neko-puppet（已有） | neko-model（目标） |
|--------------------|--------------------|
| `/v1/puppets/stream` WebSocket（兼做语义流 + 渲染帧流） | 拆分为 `/v1/scenes/control`（语义流，P1）+ `/v1/streams/:stream_id`（视频帧流，P1，由 `scenes:stream` 创建） |
| `PuppetDelta`（变形网格语义流） | `SceneDelta`（语义状态流，§10.1 patch 协议）；**渲染帧不走 SceneDelta**，由 raw H.264 `RenderStream`（WebCodecs，§3.3）独立承载视觉真值 |
| Canvas 2D 光栅化变形顶点 | `VideoViewport` presentation surface：`<canvas>` + WebCodecs `VideoFrame`（详见 §3.3 选型规则） |
| `PuppetSnapshot` TS 类型 | 共享 `SceneNodeSnapshot` / `SceneDelta` TS 契约（待完善） |
| AgentCapabilityProvider 已注册 | AgentCapabilityProvider 待注册 |

neko-sketch 无 WYSIWYG 问题（100% 自研 WebGL2 单渲染器，无 neko-engine 依赖），不需要此类修复。详见 [adr-engine-four-layer-audit.md §2](./adr-engine-four-layer-audit.md)。

---

## 十二、战略路线：建模 → 互动影游 → 游戏/仿真

本 ADR 的最终承诺不是"做一个 3D 编辑器"，而是 **建立一个能从 3D 建模工具演化为互动影游创作平台、再扩展为游戏/仿真引擎的渐进式架构**。三阶段共享同一套 OOP+ECS+RenderGraph+AssetDatabase+SceneCommand 骨架，每阶段在前一阶段基础上扩展能力，**不重写核心**。

### 12.1 战略原则

```
1. 建模优先,渲染次之,交互第三
   → 先把"作为模型 / 角色 authoring 工具"做完整
   → 渲染只需 WYSIWYG 一致,不追求实时游戏特效
   → 高频交互（拖拽预测）后置到第二阶段

2. 每阶段都能独立交付价值
   → 阶段 1 结束:可作为独立的 3D 模型/角色编辑器使用
   → 阶段 2 结束:可作为互动影游创作平台
   → 阶段 3 结束:可作为完整 3D 引擎

3. 架构插槽前置,功能后置
   → 本 ADR 的 P0/P1 只承诺骨架就位
   → 具体功能（自由建模、蓝图、物理、Gameplay）在各自后续 ADR 落地

4. 不在阶段 1 引入阶段 3 才需要的复杂度
   → 物理 / 行为树 / 输入系统 / 网络同步等
   → 但骨架必须为它们留好接口
```

### 12.2 阶段 1：建模 + 渲染（本 ADR P0/P1 范围）

**目标**：把 neko-model 升级为业界一流的 3D 模型 / 角色 authoring 工具，渲染达到 WYSIWYG 一致性。阶段 1 分两个子阶段：

- **阶段 1A（本 ADR P0/P1 主线）**：渲染骨架 + 基础参数化编辑 + 准确导出
- **阶段 1B（阶段 1 收尾，配套后续 ADR）**：完整角色 authoring + 自由建模

#### 阶段 1A 核心能力（本 ADR P0/P1 直接交付）

| 能力 | 实施载体 | 状态 |
|------|---------|------|
| WYSIWYG 编辑器 Viewport（Engine 视频流） | §3.5 / §3.6 / §3.8 + scenes:stream | P1 |
| 多视口（透视 / 正交 / lookdev） | §3.5 ViewportDescriptor + workMode | P0 |
| 完整 PBR 渲染（材质 / IBL / 法线 / 基础阴影） | §3.8 RenderGraph + §五 P1 法线 shader | P1 |
| 完整资产系统（mesh / texture / material） | §3.2 / §3.8 AssetDatabase | P0 |
| 准确导出（GLB / VRM 主路径） | §五 P0 exporter 修复 + AssetDatabase | P0 |
| 命令化编辑 + Undo / Redo（变换 / 材质 / 灯光 / 相机 / 可见性） | §3.2 SceneTransaction + SceneCommand | P0/P1 |
| 动画播放状态同步与导出 | §五 P1 动画状态同步 | P1 |
| **通用 ComponentSchemaRegistry 数值控件**（transform / material params / light intensity / camera fov 等已注册组件字段） | Inspector schema + ComponentSchemaRegistry | P1 |
| 协议位预留：CharacterCommand / ModelingSession / VertexBrushPatch / TopologyChangeEvent（**仅信封字段与 type 枚举**，不含可执行实现） | §3.9 / §3.10 / §10.1 | P1 |

**阶段 1A 范围限定（明确不承诺）**：

- ❌ **不承诺**可执行的 morph slider / FACS region / Library Override 编辑能力
- ❌ **不承诺**可加载 `.nkc` / `.nkcdata` 文件
- ❌ **不承诺**自由建模笔刷 / 拓扑操作的实际功能
- ✅ **只承诺**通用 ECS 组件的数值面板（transform、light、material params、camera 等已注册字段）
- ✅ **只承诺**协议位、信封字段、type 枚举在 §10.1 落地，使后续 ADR 不需要 break wire

阶段 1A 完工时，用户能用 neko-model 加载 GLB / VRM、调整组件数值、导出一致的 GLB / VRM，但**不能**做角色 morph 调整、不能加载 `.nkc`、不能雕刻——这些是阶段 1B 和后续 ADR 的范围。

#### 阶段 1B 完整能力（后续 ADR 配套实施）

| 能力 | 后续 ADR | 备注 |
|------|---------|------|
| 参数化角色建模（slider / morph / 材质 layer / Library Override） | adr-3d-character-authoring.md | 基于 §3.9 LayeredCharacterDescription |
| 自由建模（雕刻 / 顶点编辑 / 拓扑变更 / morph 迁移） | adr-3d-free-modeling.md | 基于 §3.10 ModelingSession 协议 |
| Inspector schema 自动生成完整覆盖 | adr-3d-inspector-schema.md | 基于 ComponentSchemaRegistry |
| 文件级一致性（.nkm / .nkc / .nkcdata 三件套） | adr-3d-project-format.md | 基于 §3.9 双文件模型 |
| 完整 FBX 导出（含动画 / 蒙皮 / 多材质） | 与 character-authoring 同期 | 主路径 GLB / VRM 已在 1A |

#### 交互层只做必需的（阶段 1A）

- Gizmo 拖拽（变换）—— 含 transform 本地预测
- Slider / 数值输入（参数）—— 不做本地预测，命令直接走
- 点击选择 / 多选 —— hit-test 走 Engine
- 相机轨道 / 飞行 —— 本地驱动
- **不做（推迟到阶段 1B）**：笔刷压感本地预测 / morph slider 本地即时反馈 / IK handle 拖拽预测
- **不做（推迟到阶段 2）**：实时事件响应 / 游戏输入 / 运行/暂停模拟

#### 渲染层只做必需的（阶段 1A）

- PBR forward + IBL + tone mapping + 基础方向光阴影（shadow map）
- 调试视图（wireframe / normal / UV / depth / overdraw）
- **不做（推迟到阶段 2）**：SSR / 全局光照 / TAA / Bloom 后处理栈 / 体积光
- **不做（推迟到阶段 2）**：烘焙系统（lightmap / probe / cooked AO）

#### 阶段 1A 验收

- 任意 GLB / VRM 模型加载后，在编辑器 Viewport 看到的渲染与 Blender / glTF Viewer 一致（材质 / 灯光 / 法线 / 动画姿态）
- 用户调整 transform / 材质 / 灯光 / 相机 / 可见性 / 动画播放状态后，导出结果与编辑器视频流视觉一致
- 命令 ack p95 < 16ms；motion-to-photon p95 < 100ms（参数化编辑场景）
- 多视口（≥2）并发可用，每视口独立 workMode 和性能 budget profile
- 不出现 fire-and-forget 命令；任何编辑失败均有 ack 反馈

#### 阶段 1B 验收（后续 ADR 验收时回填）

- 用户可基于 neko-market 模板创建自定义角色，调整 morph slider 实时反馈
- 自由建模可雕刻 + 提交拓扑变更；提交时 morph / skin / UV 显式迁移或失效告警
- `.nkc` + `.nkcdata` 双文件可被 git diff，模板更新可触发 override 重应用

**对应里程碑**：阶段 1A → M0-M6（§10.5）；阶段 1B → 后续 ADR 自带里程碑

### 12.3 阶段 2：互动影游（在阶段 1 之上扩展）

**目标**：把 neko-model 扩展为互动影游创作平台——支持事件驱动的角色行为、镜头编排、对话分支、状态机，输出可在 Web / 移动 / 桌面播放的互动作品。

**新增核心能力**（不重写阶段 1）：

| 能力 | 实施载体 | 优先级 |
|------|---------|--------|
| Timeline 编辑（角色动画 / 镜头 / 事件） | 复用 SceneCommand 历史 + 关键帧扩展 | P0 |
| 状态机 + 事件触发 | typed event graph（参考 Daz ERC 但带 cycle lint） | P0 |
| 对话 / 分支系统 | LayeredCharacterDescription Behavior 层扩展 | P1 |
| 镜头切换 + 叙事剪辑 | 多 ViewportDescriptor + Camera Track | P1 |
| 高级渲染（屏幕空间反射 / SSAO / TAA / Bloom） | RenderGraph 加 pass | P1 |
| 烘焙系统（lightmap / probe / AO） | AssetDatabase + 异步 bake job | P1 |
| 简单物理（碰撞检测 / 触发器） | runtime-physics 可选 crate | P2 |
| 输出格式（互动 GLB+JSON / 自定义播放器） | 导出器扩展 | P1 |

**与阶段 1 的关系**：

- 阶段 1 的 SceneCommand / SceneDelta / RenderGraph / AssetDatabase 不动
- 新增 `EventGraph` / `Timeline` / `StateMachine` 作为新组件类型，进 ECS 与 Inspector schema
- 视频流仍是真值，互动逻辑只产生 SceneCommand 序列驱动现有渲染

**架构反例（必须避免）**：

- ❌ 把互动逻辑塞进阶段 1 的 SceneCommand type 枚举（会让阶段 1 协议肿胀）
- ❌ 在阶段 1 提前预留事件 / 状态机字段（YAGNI）
- ✅ 用扩展点：`SceneCommand.type = 'extension:eventgraph'` + payload 自描述

**对应后续 ADR**：

- `adr-3d-interactive-narrative.md` — Timeline / 事件 / 对话
- `adr-3d-advanced-rendering.md` — 高级渲染 + 烘焙
- `adr-3d-light-physics.md` — 轻量物理（仅碰撞检测）

### 12.4 阶段 3：游戏 / 仿真（在阶段 2 之上扩展）

**目标**：完整 3D 引擎能力——游戏机制、运行时模拟、prefab 系统、网络同步、play mode 与 edit mode 分离。

**新增核心能力**：

| 能力 | 实施载体 | 优先级 |
|------|---------|--------|
| Gameplay Framework（lifecycle / input / prefab / variant） | runtime-gameplay 新 crate | P0 |
| 完整物理（rigid body / soft body / cloth / fluid） | Rapier 集成 | P0 |
| 行为树 / blackboard / utility AI | runtime-ai 新 crate | P1 |
| 蓝图 / 可视脚本（typed action graph） | 阶段 2 EventGraph 扩展 | P1 |
| Play Mode / Edit Mode 分离 | ECS 多 World 扩展 | P0 |
| 网络同步（authoritative server / lockstep） | runtime-net 新 crate | P2 |
| 3D 空间音频 | runtime-audio 扩展 | P1 |
| 全局光照 / 体积光 / Lumen-style | RenderGraph 重大扩展 | P2 |

**架构演化的关键决策**：

| 决策点 | 阶段 1 / 2 模式 | 阶段 3 调整 |
|--------|----------------|-------------|
| ECS World | 单一 Simulation World + Render World | + Gameplay Simulation World（Play mode 独占） |
| 时间循环 | Engine tick 驱动 | + fixed update（物理）+ variable update（渲染）+ network tick |
| SceneCommand | authoring 命令（同步应用） | + game command（可能延迟、可能回滚、可能网络分布） |
| AssetDatabase | authoring 真值 | + cooked asset（运行时优化） |
| 输入系统 | 编辑器手势 | + InputAction / InputMapping 通用层 |

**与阶段 1 / 2 的关系**：

- 阶段 1 的渲染骨架完全保留
- 阶段 2 的 Timeline / 事件 / 状态机演化为游戏运行时的子系统
- Play Mode 是 Edit Mode 的"派生 World"，可以暂停 / 单步 / 回退到 Edit

**对应后续 ADR**：

- `adr-3d-gameplay-framework.md` — lifecycle / input / prefab
- `adr-3d-physics.md` — Rapier 集成
- `adr-3d-blueprint.md` — typed action graph
- `adr-3d-network-sync.md` — 网络同步（远期）

### 12.5 三阶段映射到现有架构骨架

阶段 1 列表示 §3.2-§3.10 已建立的骨架（含 1A 实现 + 1B 接口插槽）；阶段 2 / 3 列用 `+ 新增项` 表达**扩展**而非重写。

```
阶段 1（建模 + 渲染,1A 实现 / 1B 接口）   阶段 2（互动影游,扩展）        阶段 3（游戏 / 仿真,扩展）
─────────────────────────────────────  ─────────────────────────  ─────────────────────────
OOP Authoring Model                    + Timeline / EventGraph     + Prefab / GameObject
ECS Components                         + EventComponent            + GameplayComponent / PhysicsComponent
SceneCommand                           + EventCommand              + GameCommand（可回滚 / 可网络）
SceneDelta                             + TimelineDelta             + GameStateDelta
AssetDatabase                          + BakedAsset                + CookedAsset / LOD
RenderGraph                            + advanced passes           + GI / volumetric passes
FrameScheduler                         + timeline scheduling       + fixed update / network tick
ViewportDescriptor + workMode          + 镜头编排                   + Play Mode camera
LocalPredictionLayer                   + event 触发预测             + 客户端预测 + 服务端校正
LayeredCharacterDescription            + 对话 / 表演驱动             + 游戏角色 + AI
ModelingSession（拓扑契约）             + 程序化建模 op              + 运行时 Mesh 生成
```

**核心保证**：阶段 1 设计的所有契约（SceneCommand / SceneDelta / AssetHandle / ViewportDescriptor / ModelingSession）在阶段 2 / 3 都是**扩展**而不是**重写**。这是本 ADR §3.2 / §3.8 / §3.10 反复强调"留接口插槽"的根本理由。

### 12.6 时间线参考

非承诺，仅作规划参考：

```
2026 Q2-Q3   阶段 1A:本 ADR P0/P1 落地（建模骨架 + 渲染一致性 + 最小交互）
              ├─ Wave 1 建模骨架:AssetDatabase + 共享契约 + ViewportDescriptor + SceneDelta patch
              ├─ Wave 2 渲染一致性:RenderGraph + Render World 隔离 + scenes:capture/stream + 法线 shader + 动画同步
              ├─ Wave 3 最小交互:/v1/scenes/control + hit-test + FrameScheduler + transform 本地预测
              ├─ 协议位预留:CharacterCommand / ModelingSession / VertexBrushPatch / TopologyChangeEvent
              └─ 验收:WYSIWYG 一致 + 命令 ack p95 < 16ms + 多视口可用 + 准确导出 GLB/VRM

2026 Q4      阶段 1B:完整角色 authoring + 自由建模（后续 ADR）
              ├─ LayeredCharacterDescription 实现（adr-3d-character-authoring.md）
              ├─ 自由建模实现（adr-3d-free-modeling.md）
              ├─ Inspector schema 自动生成完整覆盖（adr-3d-inspector-schema.md）
              ├─ .nkc/.nkcdata 项目格式（adr-3d-project-format.md）
              └─ 验收:可作为独立的角色 / 模型编辑器使用

2027 Q1-Q2   阶段 2 启动:互动影游
              ├─ Timeline + EventGraph（adr-3d-interactive-narrative.md）
              ├─ 高级渲染 + 烘焙（adr-3d-advanced-rendering.md）
              ├─ 轻量物理（adr-3d-light-physics.md）
              ├─ 互动作品输出格式
              └─ 验收:可作为互动影游创作平台

2027 Q3+     阶段 3 评估与启动:游戏 / 仿真
              ├─ Gameplay Framework（adr-3d-gameplay-framework.md）
              ├─ 完整物理（adr-3d-physics.md）
              ├─ 蓝图（adr-3d-blueprint.md）
              ├─ Play Mode / Edit Mode 分离
              └─ 是否进入完全取决于产品方向
```

### 12.7 与 neko-suite 整体战略的对齐

本路线与 neko-suite 现有战略路线图衔接：

- **阶段 1** 服务 [Perception-First 路线图](./perception-first-roadmap.md) Q3-Q4：把 3D 域从"假可用"升级到"可被 Agent 操作"——LayeredCharacterDescription 是 Agent 可读写的 SSOT
- **阶段 2** 服务 Manga / 3D 动画输出方向：Timeline + EventGraph 是 Agent 生成互动叙事的载体
- **阶段 3** 远期目标：把 neko-engine 升级为完整 3D 引擎，可独立分发，不再仅服务 VSCode 工作流

阶段 1 永远不进入阶段 3 才需要的范围——这是范围控制最重要的纪律。

---
