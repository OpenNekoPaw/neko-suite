# ADR: 3D Editor Rendering Architecture — WYSIWYG Consistency

## 状态

Proposed (2026-04-27)

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
  2. 快照类型空洞：EngineClient.getSceneSnapshot() → Promise<Record<string, unknown>>
     → Rust 有 15+ 强类型组件，TypeScript 无任何接口定义
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

L2 ECS Data     Engine ECS 是 SSOT      ✅ Rust 侧完整
                TS 侧镜像有类型定义      ❌ TS 侧全部 Record<string, unknown>
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

### 3.2 三条演进路径

**Route B（当前）：Engine 输出场景数据，Three.js 渲染**

- 适用阶段：过渡期，快速迭代 UI 功能
- 缺陷：双渲染器永远存在画质差异，不可接受作为长期方案

**Route C（近期目标）：混合模式**

```
日常编辑  → R3F 预览（零延迟，几何 + 交互）
质量预览  → Engine capture 单帧（PBR + IBL + 未来阴影），叠在 R3F 上方
最终导出  → Engine 全量渲染
```

`capture` action 已实现（`scenes:capture`），近期可用，无需改动 Rust。

**Route A（长期目标）：纯流模式**

```
Engine wgpu 渲染 → H264 编码 → WebSocket → Webview <video>
```

`scenes:stream` 当前未实现，是整个 WYSIWYG 承诺的基础条件。

### 3.3 纯流模式的操作连贯性保证

纯流模式下操作连贯性依赖三个机制：

**机制 1：本地预测 + 服务端校正（Client-side Prediction）**

```
用户拖拽 Gizmo
  ├─ 本地立即在 <video> 上叠 CSS 变换（translateX/Y）做视觉预测
  ├─ 同时通过 WebSocket 发送有序操作到 Engine
  ├─ Engine 帧到达后：移除 CSS 覆盖，显示真实 PBR 帧
  └─ 若 Engine 帧与预测偏差 > 阈值：平滑插值修正
```

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

---

## 四、与四层审计的对齐：scenes:stream 是 L1 Feedback 的前置条件

[adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md) 列出了 7 个共享基础 crate，其中 `engine-feedback-bus` 是所有域 L1 Feedback 的信号总线。对于 3D 编辑器，这条总线要承载的信号包括：

```
render-frame-ready   → Webview 收到新帧，撤销 CSS 本地预测覆盖
transform-ack        → 变换写入 ECS 成功，Webview 可以释放乐观锁
animation-conflict   → Engine 动画 tick 与 Webview 播放状态冲突
export-quality       → capture 帧的 PBR 质量指标（供 AI 评估）
normal-map-missing   → 材质缺少法线贴图，降质提示
shadow-budget-exceed → 光源数量超过阴影预算，提示裁减
```

**这些信号在 `engine-feedback-bus` 建立前无法实现。** 因此：

```
优先级依赖链（与四层审计对齐）：

engine-feedback-bus (共享基础 crate, 四层审计 P0)
        │
        ├─► L1 Feedback 接通（render-frame-ready / transform-ack）
        │         │
        │         └─► 变换 fire-and-forget 升级为有 ack 的可靠写
        │
        ├─► scenes:stream 实现（P2，依赖帧推送信号）
        │         │
        │         └─► WYSIWYG Route A 解锁
        │
        └─► export-quality 信号（供 AI 评估导出结果，接入 perception-first roadmap）
```

**短路径**：在 `engine-feedback-bus` 就位前，P0/P1 的导出器修复和法线贴图 shader 修复**不依赖**反馈总线，可独立推进。

---

## 五、近期必须修复的一致性缺口（优先级排序）

### P0：修复导出器（当前导出素材在其他软件中表现不正确）

**问题**：GLB 导出器写入硬编码默认材质，忽略所有已加载的材质参数。

**修复**：`exporter.rs` 读取 `MaterialRef` → `asset_cache` 中的 GPU 材质数据 → 写入正确的 PBR JSON。

受影响字段：baseColorFactor、metallicFactor、roughnessFactor、emissiveFactor、所有纹理引用。

### P0：补充导出灯光和相机

**问题**：灯光和相机作为 ECS 组件存在，渲染时正确使用，但导出时完全丢弃。

**修复**：`exporter.rs` 增加 `KHR_lights_punctual` 扩展写入 + 相机节点写入。

### P1：修复法线贴图 shader

**问题**：`pbr_pipeline.rs` 绑定了 `normal_tex`，但 fragment shader 中未进行 TBN 矩阵变换和法线解包。

**修复**：在 `pbr_forward.wgsl` 中补充标准法线贴图计算（TBN + 从 RGB decode 到 [-1,1]）。

### P1：补充动画状态同步

**问题**：`playAnimation` / `pauseAnimation` / `stopAnimation` 仅在客户端处理，Engine ECS 不知道播放状态，导致 `export_gltf` 时导出 T-pose。

**修复**：`playAnimation` 同时调用 `scenes:tick` 推进 Engine 动画；导出前调用一次 `capture` 确认当前姿态。

### P1：定义 SceneNodeSnapshot TypeScript 接口

**问题**：`EngineClient.getSceneSnapshot()` 返回 `Record<string, unknown>`，Rust 的 15+ 强类型组件在 TS 侧无任何对应类型。

**修复**：在 `@neko/shared/types` 中定义 `SceneNodeSnapshot`，字段与 `components.rs` 中的 Rust 结构对齐。

### P2：实现 `scenes:stream`

**问题**：`scenes:stream` action 返回 `"not yet implemented"`，是 WYSIWYG 架构的基础缺口。

**修复**：接入 `gpu_export_pipeline` 的连续帧输出 → H264 编码 → WebSocket 推送到 Webview。

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
| `host-api/src/controllers/scenes.rs` | `stream` action 返回 "not implemented" | P2 |
| `neko-client/src/EngineClient.ts` | `getSceneSnapshot()` 返回 `Record<string, unknown>` | P1 |
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

## 九、结论

**根本修复只有一个方向：编辑器 Viewport 必须直接显示 Engine 的渲染输出（Route A）。**

这不是优化项，而是 WYSIWYG 承诺的基础条件。UE5/Unity/Godot 的经验证明没有捷径。

### 与四层审计的对齐总结

| 四层 | 当前状态 | 本 ADR 的修复动作 | 前置依赖 |
|------|---------|-----------------|---------|
| L4 Intent | 3D 域无 AgentCapabilityProvider | 注册场景操作工具（参照 neko-cut 示范） | 无 |
| L3 Orchestration | HTTP 无序，35 个 action | 改用 WebSocket 操作队列 + seq 号 | 无 |
| L2 ECS Data | TS 侧全 `Record<unknown>`；SceneDelta 从未发送 | 定义 TS 类型镜像；接通 SceneDelta 推送 | 无 |
| L1 Feedback | 完全缺失 | 接入 `engine-feedback-bus`（transform-ack / render-frame-ready / export-quality） | `engine-feedback-bus` 共享 crate（四层审计 P0） |

### 实施顺序（与四层审计 P0 并行推进）

```
[并行，不依赖 feedback-bus]
  P0-A  修复 exporter.rs（材质/灯光/相机导出）
  P1-A  修复 pbr_forward.wgsl 法线贴图 shader
  P1-B  定义 SceneNodeSnapshot TS 类型（@neko/shared/types）
  P1-C  动画状态同步（playAnimation 调用 Engine tick）

[依赖 engine-feedback-bus 就位后]
  P1-D  transform-ack 替换 fire-and-forget
  P1-E  SceneDelta 推送接通（animation-conflict 检测）
  P2    scenes:stream 实现（Route A 解锁）
```

### Webview 自研量

- Route C（近期）：极低，仅需在 R3F canvas 上叠一层 `<img>` 显示 capture 帧
- Route A（长期）：Webview 自研量极低，只需 `<video>` + 2D overlay Gizmo + 本地预测层
- 无需重写 3D 渲染器，Three.js 退化为纯交互辅助层（相机控制 + Gizmo + 选中框）

### 参照标准：neko-puppet 是四层完整度最高的域

经 2D 域审计（2026-04-27），**neko-puppet 是当前四层完整度最高的参照域**，其架构是 neko-model 3D 域应当复制的模板：

```
neko-puppet（参照）                    neko-model（目标）
─────────────────────────────────      ──────────────────────────────────────
L4  AgentCapabilityProvider 已注册     → 注册 3D 场景操作工具（ScenePose / SceneAnimate）
    PuppetGenerateParams / FromImage       参照 neko-cut 示范迁移
    PuppetAdjust

L3  双向协议：HTTP + WebSocket          → 改用 WebSocket 操作队列 + seq 号
    discrete commands over HTTP            替代当前全 HTTP 无序 dispatch
    continuous delta over /v1/puppets/stream

L2  TS 类型完整                        → 定义 SceneNodeSnapshot TS 接口
    PuppetSnapshot / PuppetDelta           字段对齐 Rust components.rs 15+ 组件
    DeformedMesh — 与 Rust 结构对齐       接通 SceneDelta 推送（替代 Record<unknown>）

L1  60fps WebSocket delta 推送         → 待 engine-feedback-bus 就位后接通
    Engine ECS tick → deformed verts      transform-ack / render-frame-ready
    → Canvas 2D 光栅化                     / export-quality 信号
```

**关键对应关系**：

| neko-puppet（已有） | neko-model（目标） |
|--------------------|--------------------|
| `/v1/puppets/stream` WebSocket | `scenes:stream` WebSocket（P2） |
| `PuppetDelta`（变形网格流） | `SceneDelta`（渲染帧流 / 变换 delta） |
| Canvas 2D 光栅化变形顶点 | `<video>` 显示 H264 帧流 |
| `PuppetSnapshot` TS 类型 | `SceneNodeSnapshot` TS 类型（待定义） |
| AgentCapabilityProvider 已注册 | AgentCapabilityProvider 待注册 |

neko-sketch 无 WYSIWYG 问题（100% 自研 WebGL2 单渲染器，无 neko-engine 依赖），不需要此类修复。详见 [adr-engine-four-layer-audit.md §2](./adr-engine-four-layer-audit.md)。
