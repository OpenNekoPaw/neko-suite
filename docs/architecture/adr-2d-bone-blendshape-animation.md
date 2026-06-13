# ADR: 2D Bone + BlendShape 统一动画架构

## 状态

Proposed (2026-05-20)

## 实现状态（2026-05-21）

OpenSpec change `implement-2d-bone-blendshape-animation` 已落地本 ADR 的大部分契约、运行时、自动创建、Agent、导出与边界验证工作。当前实现状态如下：

| 范围 | 状态 | 已落地内容 |
|------|------|------------|
| `.nkp` / `.nkentity` 契约 | 已实现 | `.nkp` v2 native fields、`.nkentity` v2、`puppet-bone` binding、v1 兼容迁移、native puppet metadata 与 contract tests |
| runtime-puppet native 运行时 | 已实现 | Bone2D/Skeleton2D/SkinWeights2D、BlendShape/Expression/ControlDriver、IK/SpringBone、`ControlDriver -> BlendShape -> Skinning` CPU 管线 |
| Live2D/MOC3 导入转换 | 已实现首版 | MOC3 parser/bundle front-end 已复用并可生成 native draft；RotationDeformer、Warp/KeyForm、Motion/Expression、Physics、DrawOrder/Mask/Clipping fallback diagnostic 已实现 |
| 自动创建流程 | 已实现首版 | PSD/PNG/Live2D 输入生成 native draft；模板骨骼、权重、BlendShape、ControlDriver、autoRig confidence 与 `userAdjusted` metadata 已覆盖 fixture |
| Agent/资产集成 | 已实现首版 | native puppet create/edit/play/auto-rig/generate tools、planning metadata、query-before-mutate、legacy-only diagnostic、AssetLibrary/Search 能力投影 |
| 导出与打包 | 已实现首版 | native `.nkp` v2 export、`.nkentity` v2 export、Spine JSON export、spritesheet bake plan、Lottie unsupported/compat plan、character-pack native + optional Live2D fallback |
| renderer GPU native deformation | 已实现首版 | `engine-puppet-renderer` 内可选 GPU BlendShape+Skinning compute path；CPU fallback 保留；synthetic mesh CPU/GPU tolerance test 已覆盖 |
| 编辑器 / ViewportShell 集成 | 已实现首版 | `PuppetSceneController` 已接入 `ISceneController`、ViewportProtocol 命令、overlay prediction、`ViewportFrameMeta.viewTransform` 对齐测试；右侧 UI 已覆盖骨骼树、BlendShape slider、ControlDriver 曲线查看和 keyframe timeline adapter |
| 架构边界 | 已验证 | `runtime-puppet` 无 `wgpu`/renderer 依赖；`neko-puppet` Webview 未 import VSCode/Node API |

仍需保留的边界：

- **legacy MOC3 playback 仍保留**：golden render harness 已使用 3 个 generated/CC0 synthetic fixtures 覆盖 MOC3 -> native conversion 与 native BlendShape playback，SSIM 阈值为 0.995，失败会输出 reference/native/diff artifact 与 summary。真实复杂公开 MOC3 模型覆盖仍是后续质量增强；在更大 fixture 集合稳定前，不移除 legacy read-only playback。
- **live/compositor 不属于本 ADR 完成条件**：puppet 编辑器已消费统一 Viewport 合同；neko-live 的 compositor stream parity、LiveController 和输出路由由后续 OpenSpec change `implement-live-compositor-stream` 承接。

## 关联 ADR

- 上层依赖 / **部分修订**: [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md) — 共壳分核架构，L2 ECS 分核设计。**本 ADR 修订其关于 2D 数据范式的判断**：原 ADR 认定 "Skeleton(3D) vs ParameterBinding(2D MOC3) — 两种动画范式，数据结构本质不同，不应强行统一"；本 ADR 将 2D 核心范式从 ParameterBinding 迁移到 Bone2D+BlendShape，使 2D/3D 在骨骼概念层对齐（L2 ECS 组件仍各自实现，但共享 Skeleton trait 接口）
- 上层依赖: [adr-asset-federation.md](./adr-asset-federation.md) — AssetHandler trait、子包自治、联邦注册
- 平行配合: [adr-puppet-model-format-integration.md](./adr-puppet-model-format-integration.md) — 格式集成（本 ADR 部分取代其 MOC3 专属路线）
- 平行配合: [adr-engine-puppet-renderer.md](./adr-engine-puppet-renderer.md) — PuppetRenderer wgpu SpriteBatch
- 平行配合: [format-strategy.md](./format-strategy.md) — nk\* 命名、JSON Schema SSOT
- 平行配合: [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) — 统一 ViewportShell + ViewportProtocol + 场景合成（puppet 为消费方）
- 平行配合: [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md) — @neko/ui 共享组件层
- 后续扩展: [adr-ai-face-sculpting.md](./adr-ai-face-sculpting.md) — AI 捏脸管线
- 后续扩展: [adr-device-management.md](./adr-device-management.md) — 追踪驱动 + neko-live 三层拆分

---

## 背景

### 三角困境

在视频、动画、IP/角色、游戏四大应用场景中，2D 动画技术面临不可能三角：

```
              易用（集成/跨端）
                   ▲
                  / \
       骨骼动画 ◉   \
                /     \
               /       \
  易创作 ◀────/─────────\────▶ AI 友好
 （美术效率）/           \  （自动化生成）
            ◉ Live2D      ◉ AI 直出视频
```

- **骨骼动画（Spine 式）**：肢体动作创作友好、游戏集成完美，但面部细节创作是"调点地狱"
- **Live2D（参数+变形器）**：面部微表情极致、创作直觉好，但游戏集成差、无骨骼概念、创作闭环断裂（依赖 Cubism Editor）
- **AI 直出视频**：全自动，但不可编辑、不可复用

任何单一技术路线都无法同时占据三个顶点。

### neko-suite 现状

| 组件 | 当前实现 | 问题 |
|------|---------|------|
| runtime-puppet | MOC3 参数驱动变形（~7,800 LOC Rust） | 无骨骼概念，无法导出到游戏引擎 |
| runtime-scene | 骨骼+MorphWeights+IK（3D） | 仅服务 3D，与 2D 完全隔离 |
| engine-puppet-renderer | wgpu SpriteBatch，接收 CPU 已变形顶点（`PuppetMeshInput.vertices`）| 顶点变换在 CPU 侧完成（MOC3 参数插值），renderer 仅做纹理/混合/Z-order 排序 |
| puppet webview | 正迁移到 VideoViewport（引擎流渲染）| 迁移期间部分路径仍走 Canvas2D fallback |
| MOC3 资产 | 只读播放 | 创作闭环断裂：无法在 neko-suite 内创建/编辑 MOC3 |
| 素材流通 | MOC3 格式无法导出到游戏引擎 | VTuber 角色不能复用到游戏场景 |

### 决策驱动因素

1. **AI 友好**：AI 需要语义明确的操作接口（骨骼有物理语义，参数有命名语义）
2. **创作精细**：面部表情需达到 Live2D 级别的有机形变感
3. **全场景流通**：一个角色资产无损流通于视频/动画/IP/游戏
4. **开发可维护**：调试链路短、因果关系直接、不引入编译型黑箱

---

## 决策

### 核心定位

> **Neko Suite 的 2D 角色标准运行时采用 Bone2D + BlendShape。Live2D/MOC3 不再作为内部创作模型，只作为只读导入转换源和迁移兼容入口。**

| 角色 | 说明 |
|------|------|
| **内部标准** | Bone2D + BlendShape（`.nkp` v2 / `.nkentity` v2） |
| **兼容输入** | Live2D/MOC3 import converter（`.model3.json` / `.moc3` / `.zip`） |
| **迁移策略** | MOC3 运行时冻结，只保留到转换质量达标（golden test 通过后评估移除） |
| **SSOT 不变量** | `.nkp` / `.nkentity` 是 Neko 原生角色的事实来源；Live2D 不是内部 SSOT |

Neko Native Puppet 是主格式，Live2D 是输入格式，不是长期运行时核心。

### Live2D SDK 与 Runtime Adapter 边界

> **结论：runtime-puppet 可以忽略 Live2D SDK/Core 的运行时支持，但不能忽略 Live2D 生态的导入、转换、预览与可选高保真播放需求。**

`runtime-puppet` 的职责保持为 Neko 原生 2D 角色运行时：Bone2D、BlendShape、ControlDriver、AnimationClip2D、ExpressionPreset、SpringBone2D、IK、导出与实时流。它不直接链接 Live2D Cubism Core，也不把 Cubism 参数/Deformer 作为内部 SSOT。

需要高保真 Cubism 播放时，采用独立 `Live2dRuntimeAdapter`（或后续 `runtime-live2d-adapter`）：

| 层 | 是否依赖 Live2D SDK/Core | 职责 |
|---|---:|---|
| `runtime-puppet` | 否 | Neko 原生 `.nkp` v2 / `.nkentity` v2 执行、编辑、导出、流式渲染 |
| MOC3 import converter | 否（clean-room parser） | `.model3.json` / `.moc3` / `.zip` 读取，转换为 Bone2D + BlendShape + metadata |
| `Live2dRuntimeAdapter` | 可选 | 使用 Cubism SDK/Core 做原生 Cubism 高保真播放、校验对比或兼容预览 |
| `runtime-stage` | 否（只依赖 adapter 合同） | 把 Live2D actor 作为一种 StageActor 调度，统一输入、事件、对话、session |
| Export / Compositor | 否（只消费帧/层） | 消费 adapter 或 puppet 产出的 GpuLayer / frame stream |

边界规则：

1. 开源核心不内置 Cubism Core；Live2D 官方说明 SDK 下载需同意 Proprietary / Open Software License，Cubism Core 不发布在 GitHub、随官方 SDK 包分发（见 [Cubism SDK license terms](https://www.live2d.com/en/sdk/about/) 与 [Cubism Core manual](https://docs.live2d.com/en/cubism-sdk-manual/cubism-core/)），因此必须作为可选 adapter、feature gate 或用户自带依赖处理。
2. `runtime-puppet` 不新增 Cubism 专属组件。Cubism 参数进入 Neko 后应映射为标准 face controls、BlendShape weight、ControlDriver 或 source metadata。
3. `Live2dRuntimeAdapter` 不拥有 Neko 角色事实来源；它只执行外部 Live2D bundle 或提供转换质量基准。
4. Stage 同场景可以混用 2D Native Puppet、3D Scene Actor、Live2D Adapter Actor、Spine Adapter Actor，但它们通过 `StageActor` / `StageBinding` / `StageEvent` 对齐，而不是互相调用内部服务。
5. 若用户要编辑并长期维护角色，应导入/转换为 `.nkp` v2；若用户要保持 Cubism 原貌表演，可选择 adapter 路径，但编辑能力受 SDK 与格式限制。

这与 Unity 的常见处理方式一致：Unity 项目通常通过 Cubism SDK for Unity 作为组件/插件运行 Live2D，而不是把 Live2D 数据模型改造成 Unity 自身 Animator 的内部格式。Neko 的差异是需要创作闭环和开源核心可维护性，因此默认将 Live2D 降为导入转换源，可选 adapter 只服务兼容和高保真播放。

### 核心方案：骨骼（身体）+ BlendShape（面部）+ Control Driver（三层模型）

> **骨骼处理结构化运动（肢体、姿态），BlendShape 处理有机形变（表情、口型），Control Driver 处理上层语义参数到骨骼/BlendShape 的显式映射。默认管线先 BlendShape 后 Skinning，表情跟随骨骼运动。**

这是 3D 行业二十年的标准答案（Unity/Unreal/VRM/glTF 均采用），本 ADR 将其引入 2D 动画领域。

**素材复用的底座是骨骼**：只要角色有稳定骨骼层，就能流通到游戏、视频、动画、VTuber、Agent 操作。BlendShape 解决面部细节，但不承担角色结构语义。

**Live2D 导入必须单向**：支持 `.model3.json` / `.moc3` / `.zip` 导入后转换为 `.nkp` v2 / `.nkentity`。保留原始 Live2D source metadata 方便重新导入，但不承诺回写 MOC3。

**自动创建是主入口**：用户最少只需要导入 PSD / PNG / Live2D 素材并预览微调。系统自动完成语义识别、图层/网格切割、骨骼生成、蒙皮权重、IK/SpringBone、BlendShape 生成与 `.nkentity` 打包。

**BlendShape 参数可驱动骨骼调整**：例如 `jawOpen` 同时驱动嘴部 BlendShape 与 jaw bone 旋转，`eyeLookLeft` 同时驱动眼部形变与眼球/瞳孔骨骼偏移。该能力通过显式 `ControlDriver` 存储，不是不可见的参数→骨骼编译层。

### 为什么不做"编译型参数架构"

前期讨论中曾考虑"参数→骨骼编译层"方案（用户操作参数，自动编译为骨骼变换）。否决原因：

| 问题 | 说明 |
|------|------|
| 调试黑箱 | 参数→编译→骨骼→渲染，中间多一层不可见转换 |
| 参数冲突 | 多参数驱动同一骨骼时，叠加/覆盖语义不确定 |
| 烘焙偏差 | 实时编译结果与导出烘焙结果可能有精度差 |
| 过度设计 | BlendShape 加权求和已是行业验证方案，无需重新发明 |

本 ADR 仍允许 **显式 Control Driver**：

- Driver 是持久化、可视化、可调试的约束，不是运行时黑箱编译
- Driver source 是命名控制量（BlendShape weight / Expression preset / Tracking param）
- Driver target 是明确的 BoneTransform 或 BlendShapeWeight
- 多 Driver 写同一目标时必须声明 blend mode（add / override / max）和优先级

### 为什么不保留纯 Live2D 参数路线

| 问题 | 说明 |
|------|------|
| 创作闭环断裂 | 无法在 neko-suite 内创建 MOC3，依赖外部 Cubism Editor（¥3万/年 Pro） |
| 游戏集成差 | MOC3 无骨骼概念，无法导出 Spine JSON / Unity AnimationClip |
| 素材碎片化 | 同一角色需要 MOC3 版（VTuber）+ 骨骼版（游戏），Market 分裂 |
| 局部换装困难 | Live2D 只能整套皮肤替换，无法动态换武器/换衣服 |

---

## 设计要点

### 1. 数据模型

```
.nkentity 内部模型：

┌────────────────────────────────────────────────────────┐
│  Layers（图层）                                         │
│  有序图层列表，每层拥有独立纹理+网格+混合模式            │
│  ├─ Layer { mesh, uvs, texture_ref, blend_mode, opacity }│
│  └─ 来源：PSD 切层 / PNG 导入 / AI 生成                 │
├────────────────────────────────────────────────────────┤
│  Skeleton（骨骼层 — 身体结构化运动）                     │
│  ├─ Bone hierarchy（父子关系 + Transform2D）             │
│  ├─ Skin weights（每顶点绑定 ≤4 骨骼 + 权重）           │
│  ├─ IK constraints（TwoBone / CCD）                     │
│  ├─ Path constraints（沿贝塞尔曲线运动）                 │
│  └─ Spring bones（头发/裙摆/饰品弹簧物理）               │
├────────────────────────────────────────────────────────┤
│  BlendShapes（形变层 — 面部有机形变）                     │
│  ├─ BlendShape { name, vertex_deltas: Vec<[f32;2]> }    │
│  ├─ 每个 BlendShape 是一组预烘焙的顶点偏移               │
│  ├─ 运行时：final_pos += Σ(weight_i × delta_i)          │
│  └─ 标准集：对齐 ARKit 52 BlendShape 命名（可扩展）      │
├────────────────────────────────────────────────────────┤
│  Animations（动画集）                                    │
│  ├─ Clip { bone_tracks, blendshape_tracks, duration }   │
│  ├─ bone_track: 骨骼关键帧（position/rotation/scale 曲线）│
│  ├─ blendshape_track: 权重关键帧（weight 曲线）          │
│  └─ 一个 Clip 可同时驱动骨骼和 BlendShape                │
├────────────────────────────────────────────────────────┤
│  Expressions（表情预设集）                                │
│  ├─ Preset { name, weights: Record<string, f32> }       │
│  ├─ "happy" = { smile: 0.8, eye_happy: 0.6 }           │
│  └─ 标准预设对齐 VRM Expression 命名                     │
├────────────────────────────────────────────────────────┤
│  Control Drivers（上层语义控制）                           │
│  ├─ Driver { source, target, curve, blend_mode }         │
│  ├─ source: BlendShape / Expression / TrackingParam      │
│  ├─ target: BoneTransform / BlendShapeWeight             │
│  └─ 示例：jawOpen → jaw bone rotation + mouth delta      │
├────────────────────────────────────────────────────────┤
│  Semantic Tags（AI 语义标注）                             │
│  ├─ character_type: "humanoid" | "quadruped" | ...      │
│  ├─ style: "anime" | "realistic" | "chibi" | ...        │
│  ├─ rig_template: "humanoid_upper" | "humanoid_full"    │
│  └─ AI 自动标注 + 用户确认                               │
└────────────────────────────────────────────────────────┘
```

### 2. 顶点计算管线

```
每帧顶点最终位置计算（GPU 或 CPU）：

Step 0: Control Driver 求值（语义控制层）
  controls = expression_weights + tracking_params + user_inputs
  bone_pose_delta, blendshape_weight_delta = eval_drivers(controls)
  // 处理上层参数对骨骼和 BlendShape 的显式影响：
  // jawOpen → jaw bone rotation + mouthOpen BlendShape
  // eyeLookLeft → pupil bone offset + eyelid corrective BlendShape

默认管线：先 BlendShape、后 Skinning（Pre-skin BlendShape）

Step 1: BlendShape 形变（Morph Target Additive，在 bind pose 空间）
  v_morphed = v_base + Σ(blendshape_delta[j] × resolved_blendshape_weight[j])
  // 在骨骼变换之前叠加面部形变
  // 表情跟随头部/身体骨骼运动（微笑+转头 = 微笑随头转）

Step 2: 骨骼蒙皮（Skeletal Skinning）
  v_final = Σ(resolved_bone_matrix[i] × bind_inverse[i] × v_morphed × weight[i])
  // 处理肢体运动：手臂摆动、身体转向、头部旋转
  // 形变后的顶点随骨骼变换一起运动

为什么先 BlendShape 后 Skinning：
  - 表情形变发生在 bind pose 空间，数据编辑直觉
  - 形变后的面部会跟随骨骼运动（转头时表情不会脱离）
  - 与 glTF/VRM/Unity 标准管线一致

可选扩展（Post-skin Corrective BlendShape）：
  某些 BlendShape 可标记为 post_skin = true，在 skinning 之后叠加：
  v_corrected = v_final + Σ(corrective_delta[k] × corrective_weight[k])
  用途：修正极端姿态下的蒙皮穿模（如手臂弯曲 90° 时的肌肉膨胀）
  这是可选增强，不影响默认管线。

调试时：表情异常 → 查 Step 1（bind pose 下观察）；位置异常 → 查 Step 2。
```

### 3. ECS 组件设计（Rust runtime-puppet 扩展）

```rust
// === 新增组件（骨骼层） ===

/// 2D 骨骼定义（挂载到骨骼 Entity 上）
#[derive(Component)]
pub struct Bone2D {
    pub name: String,
    pub rest_transform: Transform2D,   // 绑定姿态
    pub length: f32,                   // 骨骼可视长度
}

/// 骨骼层级（挂载到 puppet root 上）
#[derive(Component)]
pub struct Skeleton2D {
    pub bone_entities: Vec<Entity>,
    pub inverse_bind_transforms: Vec<Mat3>,
}

/// 蒙皮权重（挂载到每个 mesh entity 上）
#[derive(Component)]
pub struct SkinWeights2D {
    pub joint_indices: Vec<[u16; 4]>,  // 每顶点最多 4 骨骼
    pub joint_weights: Vec<[f32; 4]>,
}

/// IK 约束（挂载到约束 entity 上）
#[derive(Component)]
pub struct IkConstraint2D {
    pub target_entity: Entity,
    pub chain_length: u8,
    pub solver: IkSolver2D,   // TwoBone | CCD { max_iterations }
}

/// 弹簧骨物理（替代现有 SimplePhysics 的参数驱动模式）
#[derive(Component)]
pub struct SpringBone2D {
    pub stiffness: f32,
    pub damping: f32,
    pub gravity_scale: f32,
    pub wind_influence: f32,
}

// === 新增组件（BlendShape 层） ===

/// BlendShape 定义集（挂载到 mesh entity 上）
#[derive(Component)]
pub struct BlendShapeSet {
    pub shapes: Vec<BlendShapeDef>,
}

pub struct BlendShapeDef {
    pub name: String,
    pub vertex_deltas: Vec<[f32; 2]>,  // 与 MeshData.vertices 等长
}

/// BlendShape 当前权重（挂载到 mesh entity 上，每帧更新）
#[derive(Component)]
pub struct BlendShapeWeights {
    pub weights: Vec<f32>,  // 与 BlendShapeSet.shapes 等长
}

/// 表情预设集（挂载到 puppet root 上）
#[derive(Component)]
pub struct ExpressionPresets {
    pub presets: Vec<ExpressionPreset>,
}

pub struct ExpressionPreset {
    pub name: String,
    pub weights: Vec<(String, f32)>,  // BlendShape name → weight
}

// === 新增组件（控制驱动层） ===

/// 上层语义控制到骨骼 / BlendShape 的显式映射（挂载到 puppet root 上）
#[derive(Component)]
pub struct ControlDriverSet {
    pub drivers: Vec<ControlDriver>,
}

pub struct ControlDriver {
    pub source: ControlSource,
    pub target: ControlTarget,
    pub curve: DriverCurve,
    pub blend_mode: DriverBlendMode,  // Add | Override | Max
    pub priority: i16,
}

pub enum ControlSource {
    BlendShapeWeight { name: String },
    ExpressionWeight { preset: String },
    TrackingParam { name: String },
}

pub enum ControlTarget {
    BoneRotation { bone: String, axis: Axis2D },
    BonePosition { bone: String },
    BoneScale { bone: String },
    BlendShapeWeight { name: String },
}
```

### 4. 与现有组件的关系

| 现有组件 | 新架构中的角色 | 迁移方式 |
|---------|--------------|---------|
| `Transform2D` | **保留** — 骨骼和图层共用 | 无改动 |
| `GlobalTransform2D` | **保留** — 骨骼层级传播 | 无改动 |
| `MeshData` | **保留** — 基础网格数据 | 无改动 |
| `DeformedVertices` | **保留** — 每帧计算结果 | 计算逻辑从参数插值改为 skinning+BlendShape |
| `TextureRef` | **保留** — 纹理引用 | 无改动 |
| `ZOrder` / `BlendMode` / `Opacity` | **保留** — 渲染属性 | 无改动 |
| `ParameterBinding` | **废弃** — 被 BlendShape 替代 | MOC3 导入时转换 |
| `MultiKeyDeformation` | **废弃** — 被 BlendShape 替代 | MOC3 导入时 KeyForm 采样为 BlendShape |
| `WarpDeformer` | **废弃** — 被 BlendShape 替代 | MOC3 导入时 Warp 网格采样为顶点偏移 |
| `RotationDeformer` | **废弃** — 被 Bone2D 替代 | MOC3 导入时转换为 Bone2D |
| `SimplePhysics` | **废弃** — 被 SpringBone2D 替代 | 参数映射改为骨骼物理 |
| `PuppetParameters` | **保留为兼容层** — MOC3 导入时映射到 BlendShape 权重 | 成为 BlendShape 的高层别名 |
| `ExpressionLibrary` | **重构** — 改为 ExpressionPresets | MOC3 exp3 → 预设权重组合 |

### 5. 动画系统

```
动画 Clip 数据结构：

AnimationClip2D {
    name: String,
    duration_ms: u32,
    bone_tracks: Vec<BoneTrack>,
    blendshape_tracks: Vec<BlendShapeTrack>,
}

BoneTrack {
    bone_name: String,
    position_keys: Vec<Keyframe<Vec2>>,
    rotation_keys: Vec<Keyframe<f32>>,
    scale_keys: Vec<Keyframe<Vec2>>,
}

BlendShapeTrack {
    blendshape_name: String,
    weight_keys: Vec<Keyframe<f32>>,
}

Keyframe<T> {
    time_ms: u32,
    value: T,
    easing: EasingType,  // Linear | Bezier(c1,c2) | Step
}
```

动画混合复用共壳分核的 `AnimationBlendState<L>` 泛型框架（见 adr-2d3d-unified-engine.md），新增 `Bone2DBlendLayer` 实现。

`AnimationClip2D` 是**采样叶节点合同**，不是状态机本身。后续 `AnimationGraph`（见 [adr-engine-bevy-gap-analysis.md](./adr-engine-bevy-gap-analysis.md) Phase 1C / Phase 2）可以把 `AnimationClip2D` 作为 leaf sampler，并在图层处理 state、transition、blend tree、additive blend 和 animation event。`AnimationClip2D` 不保存图状态，避免 2D clip 与 3D clip 在 Phase 2 对接时返工。

### 6. MOC3 导入转换管线

```
MOC3 导入（只读转换，保留现有 parser）：

moc3/parser.rs（零改动，复用）
       │
       ▼
MOC3 中间表示
       │
       ├─ RotationDeformer ──→ Bone2D
       │    pivot → bone position
       │    angle range → bone rotation range
       │    parent deformer → parent bone
       │
       ├─ WarpDeformer ──→ BlendShape
       │    采样 KeyForm 在 [0, 0.5, 1.0]
       │    计算顶点偏移 → BlendShapeDef.vertex_deltas
       │
       ├─ Parameter + KeyForms ──→ BlendShape
       │    每个参数的首尾 KeyForm → 一个 BlendShape
       │    二维参数空间 → 2D BlendSpace（4-9 个 BlendShape）
       │
       ├─ Physics ──→ SpringBone2D
       │    pendulum/spring → stiffness/damping/gravity
       │    output param → attached bone
       │
       ├─ Motion (.motion3.json) ──→ AnimationClip2D
       │    参数关键帧 → BlendShape 权重关键帧
       │    骨骼化参数（AngleX/Y/Z） → BoneTrack
       │
       ├─ Expression (.exp3.json) ──→ ExpressionPreset
       │    参数组合 → BlendShape 权重组合
       │
       └─ Mesh + UV + Texture ──→ 直接复制

精度目标指标（非设计承诺——须通过 golden render 对比测试验证）：

  转换类型         目标    已知风险
  ──────────────  ──────  ──────────────────────────────────────
  旋转变形        100%    Bone2D 直接等价，预期无损
  线性参数        100%    BlendShape 线性混合等价
  单参数贝塞尔    95%+    3-5 采样点；曲线极端区间可能有可见差异
  二维参数空间    90%+    2D BlendSpace 3×3 采样；组合爆炸区间精度下降
  物理模拟        90%+    参数映射不等价——MOC3 physics 输出的是参数值，
                          SpringBone 输出的是骨骼变换；阻尼/重力响应曲线不同
  Draw order      未知    MOC3 draw order 可随参数动态变化，需逐 case 处理
  Mask/Clipping   未知    MOC3 clipping mask 基于参数树嵌套，不直接映射到骨骼系统

  验证要求（Phase 1 必须）：
  - golden render 测试：原始 MOC3/keyform 播放 vs 转换后 native 播放，逐帧 SSIM ≥ 0.995
  - 已提交测试用例覆盖：至少 3 个 generated/CC0 synthetic public fixtures；真实复杂公开 MOC3 模型作为后续增强集
  - 差异超阈值时输出 reference/native/diff artifact 与 summary，供手动精调参考
  - 每个转换类型单独断言，可独立 pass/fail
```

### 7. 自动创建管线（PSD / PNG / Live2D → Neko Native Puppet）

自动创建是 Neko Native Puppet 的默认入口。用户最少只需要导入素材并预览微调，系统负责生成骨骼、网格、BlendShape、Control Driver 和 `.nkentity`。

```
用户操作                         系统自动化
──────────                      ──────────

1. 导入素材
   PSD / PNG / Live2D ZIP
   "这是我画的角色"

                                2. 素材解析与语义分析
                                  PSD → 图层树 / 命名 / 透明区域 / 部件边界
                                  PNG → 分割 mask / 姿态估计 / 部件检测
                                  Live2D → MOC3 drawable / deformer / param / motion
                                  → 识别：人形 / 半身 / Q版 / 非人形
                                  → 分割：头 / 身 / 四肢 / 头发 / 饰品
                                  → 检测：关节位置 / 面部 landmarks

                                3. 自动生成骨骼
                                  → 模板匹配 + AI 微调
                                  → 生成 Bone2D hierarchy
                                  → 计算 SkinWeights2D
                                  → 添加 IK / SpringBone / Path constraints

                                4. 自动生成 BlendShape
                                  → AI 生成表情变体并对齐
                                  → 或应用模板表情库
                                  → 或从 Live2D KeyForm / WarpDeformer 采样
                                  → 计算每 mesh 的顶点偏移

                                5. 自动生成 Control Driver
                                  → ARKit / VRM Expression / Live2D Param 归一化
                                  → jawOpen 同时驱动 jaw bone + mouth BlendShape
                                  → eyeLook 同时驱动 pupil bone + eyelid corrective
                                  → breathing / hair / cloth 映射到 SpringBone

6. 预览 & 微调
   "左手臂骨骼位置偏了"
   → 拖动调整骨骼 / 权重
   "笑容不够大"
   → 调整 BlendShape / Driver curve

                                7. 打包 .nkentity
                                  骨骼 + BlendShape + Control Driver
                                  + 纹理 + 动画 + 元数据

8. 开始做动画
```

#### 输入路径

| 输入 | 自动化重点 | 输出 |
|------|-----------|------|
| PSD | 图层名语义、图层边界、透明区域、组层级 | layer mesh + skeleton + skin weights |
| PNG | SAM/pose/landmark 分割，模板匹配 | generated layer mesh + skeleton + skin weights |
| Live2D ZIP / MOC3 | Drawable/Deformer/Param/Motion/Physics 转换 | `.nkp` v2 + source metadata + optional legacy fallback |

#### 自动骨骼生成策略

| 策略 | 适用场景 | 说明 |
|------|---------|------|
| PSD 图层感知绑定 | 分层清晰的角色立绘 | 图层名和边界优先，AI 只做补全 |
| AI 姿态估计 | 单张合成图 / PNG | 图片 → mask / landmark / joints → 骨骼层级 |
| 模板匹配 | Q版 / 半身 / 特殊体型 | 用户可选模板，系统按锚点适配 |
| Live2D 结构迁移 | 已有 MOC3 资产 | RotationDeformer/参数语义辅助生成骨骼与 drivers |

#### 自动 BlendShape 生成策略

| 策略 | 适用场景 | 说明 |
|------|---------|------|
| AI 表情变体 | 无现成表情素材 | 单图生成 happy/sad/angry 等变体，对齐后算顶点 delta |
| 模板表情库 | 标准人形 / Q版 | 按面部比例适配 ARKit/VRM 子集 |
| 美术关键姿态 | 精修角色 | 用户绘制或导入关键姿态，系统算 delta |
| Live2D KeyForm 采样 | MOC3 导入 | 从 WarpDeformer / KeyForm 采样生成 BlendShape |

#### Control Driver 生成策略

| Source | Target | 示例 |
|--------|--------|------|
| BlendShapeWeight | BoneTransform | `jawOpen` → `jaw.rotation += 18°` |
| ExpressionWeight | BlendShapeWeight + BoneTransform | `happy` → smile weights + cheek bone lift |
| TrackingParam | BoneTransform | `headYaw` → head/spine rotation 分摊 |
| Live2D Param | BlendShapeWeight + BoneTransform | `ParamAngleX` → head bone + face corrective |

### 8. 全场景流通

```
              .nkentity
                  │
   ┌──────┬───────┼────────┬──────────┐
   ▼      ▼       ▼        ▼          ▼
 视频    动画    VTuber    游戏       AI
 ─────  ─────  ──────    ─────      ─────
 neko-  neko-  neko-     导出        neko-
 cut    puppet live      格式        agent

视频：
  时间轴放置 → 骨骼+BlendShape 关键帧 → 引擎渲染 → MP4

动画：
  骨骼编辑器 → IK + 关键帧 → 导出 GIF/APNG/Lottie/Spritesheet

VTuber：
  摄像头 → MediaPipe/ARKit → BlendShape 权重（面部）+ Bone 变换（身体）
  直接映射，无编译层

游戏：
  导出 Spine JSON（骨骼+网格变形 = Spine 原生支持）
  导出 Spritesheet（逐帧渲染，最大兼容）
  导出 glTF 2D（骨骼+MorphTargets，Unity/Unreal 原生）

AI：
  粗粒度：set_expression("happy", 0.8)
  中粒度：set_blendshape("smile", 0.7) / set_bone("arm_L", rotation: 45°)
  生成级：text → motion model → BoneTrack + BlendShapeTrack
```

### 9. 渲染器影响

**当前状态**：engine-puppet-renderer 已存在（lib.rs），通过 wgpu SpriteBatch 渲染。当前输入是 `PuppetMeshInput` 的 CPU 已变形顶点（`vertices: Vec<[f32; 2]>`）——runtime-puppet 在 CPU 侧完成 MOC3 参数插值后传入。

2026-06-13 落地状态：`runtime-puppet` 已明确为 Neko 原生 2D Bone2D + BlendShape runtime，不承载 Live2D Cubism SDK 高保真播放生命周期。Live2D/MOC3 在本 ADR 中只作为导入转换源、legacy 兼容路径或未来 `Live2dRuntimeAdapter` / custom SDK 的输入；高保真 SDK 播放由独立 adapter 隔离许可、平台和渲染差异。

**迁移路径**（非从零建设）：

```
Phase A: CPU 管线保留（Phase 0-1 期间）
  runtime-puppet 新增 skinning+blendshape 系统，在 CPU 侧计算 v_final
  输出仍然是 deformed vertices → PuppetMeshInput → SpriteBatch
  renderer 零改动，验证 ECS 逻辑正确性
  典型模型顶点数增长后，通过 bevy_tasks ParallelIterator 并行 mesh/vertex 批处理

Phase B: 可选 GPU 管线（Phase 2）
  renderer 新增 GPU skinning+blendshape 路径
  Morph/BlendShape 加权求和复用 engine-gpu 共享 compute primitive
  输入改为 bind-pose vertices + bone matrices + blendshape deltas + weights
  CPU 管线作为 fallback 保留（低端设备 / 调试模式）

关键约束：runtime-puppet 保持零 GPU 依赖
  GPU skinning 数据通过 render-extract 模式进入 renderer
  ECS 组件不反向依赖 wgpu
```

GPU 管线 Vertex Shader（WGSL，Phase B 目标）：

```wgsl
  // Step 1: BlendShape additive (in bind pose space)
  var v_morphed = v_base;
  for (var j = 0u; j < blend_shape_count; j++) {
      v_morphed += blend_deltas[vertex_id * blend_shape_count + j] * blend_weights[j];
  }

  // Step 2: Skeletal skinning (transforms morphed vertices)
  var v_final = vec2(0.0);
  for (var i = 0u; i < 4u; i++) {
      let bone_idx = joint_indices[i];
      let weight = joint_weights[i];
      v_final += (bone_matrices[bone_idx] * vec3(v_morphed, 1.0)).xy * weight;
  }
```

SpriteBatch 的纹理/混合/Z-order 管线保持不变，仅顶点变换阶段替换。

### 10. 统一 Viewport 与 2D 场景适配

> 完整的统一 Viewport 设计见独立 ADR：[adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md)。
> 本节仅记录 2D puppet 作为消费方的适配要点和分阶段策略。

#### 10.1 架构关系

puppet 编辑器消费统一 Viewport 的方式：

```
@neko/shared (L0)     ViewportProtocol DTO + ISceneController 接口
@neko/ui (L2)         ViewportShell + OverlayRenderer + ViewportToolbar
neko-puppet (扩展)     PuppetController implements ISceneController
```

PuppetController 负责 2D 专属交互：骨骼拖拽、BlendShape 滑块、网格顶点编辑、洋葱皮叠加。通过 `scene:puppet:*` 命令与引擎 runtime-puppet 通信。

#### 10.2 2D 专属的 scene 命令

```
scene:puppet:dragBone        { boneId, delta }
scene:puppet:setBlendShape   { name, weight }
scene:puppet:setDriverWeight { driverId, weight }
scene:puppet:toggleOnionSkin { enabled, frameOffset }
scene:puppet:editVertex      { meshId, vertexIndex, delta }
```

#### 10.3 2D 场景的特殊风险

统一 Viewport 对 2D 有两个比 3D 更敏感的风险：

**交互延迟**：骨骼拖拽需即时反馈。视频流路径增加 ~5-10ms 往返（本地渲染 < 1ms）。缓解：overlay 预测性渲染——拖拽时前端 overlay 立即移动骨骼线框（纯 2D 线条），引擎流在下一帧跟上。用户感知为即时响应线框 + 稍延迟纹理。

**叠加层像素对齐**：2D 场景像素级精确，亚像素偏差可见（3D 有透视变形可掩盖）。缓解：引擎每帧元数据附带 `ViewportFrameMeta.viewTransform` 矩阵（2D 仿射变换），前端 overlay 用同一矩阵变换坐标。

#### 10.4 分阶段切入

不在 Phase -1/P0 就要求引擎流。先用本地渲染快速验证交互设计：

```
本 ADR Phase -1/P0: 本地 Canvas2D 渲染，快速迭代交互原型
本 ADR Phase P1:    引擎 runtime-puppet 稳定，golden test 通过
Viewport ADR V1-PR3: 切换到 ViewportShell + 引擎流，加 overlay 预测性渲染
本 ADR Phase P3+:   效果/合成/2D-in-3D 全部在引擎侧
```

**P2 硬性验收指标**：引擎流路径下骨骼拖拽交互延迟 ≤ 16ms（一帧）。不达标则必须在 overlay 层实现预测性骨骼线框渲染。

### 11. Agent 工具设计

```typescript
// 三级粒度 AI 操作接口

// Level 1: 预设级（最高层，推荐 AI 默认使用）
interface PuppetExpressionTool {
  name: 'puppet:set_expression';
  params: { preset: string; weight: number };
  // "happy" → 系统查预设 → 设置多个 BlendShape 权重
}

interface PuppetPlayAnimationTool {
  name: 'puppet:play_animation';
  params: { clip: string; speed?: number; crossfade_ms?: number };
}

interface PuppetCreateNativeTool {
  name: 'puppet:create_native';
  params: {
    source_path: string;
    source_kind?: 'psd' | 'png' | 'live2d-bundle' | 'moc3';
    template?: string;
    auto_generate?: {
      skeleton?: boolean;
      blendshapes?: boolean;
      drivers?: boolean;
    };
  };
  // PSD/PNG/Live2D → .nkp v2 + .nkentity
}

// Level 2: 组件级（中间层，精确控制）
interface PuppetSetBlendShapeTool {
  name: 'puppet:set_blendshape';
  params: { name: string; weight: number };
}

interface PuppetSetBoneTransformTool {
  name: 'puppet:set_bone';
  params: { bone: string; rotation?: number; position?: [number, number] };
}

interface PuppetSetControlDriverTool {
  name: 'puppet:set_control_driver';
  params: { driver: string; weight?: number; curve?: string };
}

// Level 3: 生成级（全自动）
interface PuppetGenerateRigTool {
  name: 'puppet:auto_rig';
  params: { source_path: string; template?: string; include_blendshapes?: boolean; include_drivers?: boolean };
  // AI 触发自动创建管线，可从 PSD/PNG/Live2D 生成骨骼 + BlendShape + Control Driver
}

interface PuppetGenerateAnimationTool {
  name: 'puppet:generate_animation';
  params: { description: string; duration_ms?: number };
  // Text → Motion 模型 → AnimationClip2D
}
```

### 12. .nkentity 格式扩展

现有 `.nkentity` 是轻量引用包（见 creative-entity-asset-composition.ts）。

**当前契约状态**（必须先完成契约迁移再实现）：
- `NkEntityArtifact.version` 当前为 `1`（asset-export.ts）
- `EntityAssetBindingRole` 枚举：`'portrait' | 'reference' | 'live2d' | 'live3d' | 'voice' | 'motion' | 'style'`
- 无 `'puppet'` role——2D 骨骼角色需要新增 role 或复用 `'live2d'`

**契约迁移设计**（前置 PR，在 Phase 0 之前）：

| 变更 | 方案 | 理由 |
|------|------|------|
| version 升级 | `version: 1` → `version: 2`，保留 v1→v2 迁移函数 | 新增字段不向后兼容 |
| 新增 binding role | 新增 `'puppet-bone'` role（不复用 `'live2d'`） | 语义清晰区分 MOC3 参数驱动 vs Bone+BlendShape |
| entity.metadata 扩展 | 新增可选 `rig_template` / `blendshape_standard` 字段 | AI/编辑器需要发现能力 |
| 契约测试 | `asset-export.ts` 的 `isNkEntityArtifact` 更新 + contract test | 防止 runtime 反序列化失败 |

```jsonc
// sakura.nkentity — 统一角色实体（version 2 目标格式）
{
  "format": "nkentity",
  "version": 2,
  "entity": {
    "kind": "character",
    "name": "Sakura",
    "metadata": {
      "rig_template": "humanoid_upper",
      "style": "anime",
      "blendshape_standard": "arkit_52"
    }
  },
  "bindings": [
    {
      "role": "puppet-bone",
      "ref": "project://puppets/sakura.nkp",
      "mediaKind": "puppet-model",
      "dimension": "model"
    },
    {
      "role": "live2d",
      "ref": "project://puppets/sakura-legacy.nkp",
      "mediaKind": "puppet-model",
      "dimension": "model",
      "optional": true,
      "metadata": { "note": "MOC3 legacy fallback" }
    },
    {
      "role": "live3d",
      "ref": "project://models/sakura.vrm",
      "mediaKind": "model-3d",
      "dimension": "model"
    },
    {
      "role": "motion",
      "ref": "project://animations/sakura-idle.nkanim",
      "mediaKind": "puppet-motion",
      "dimension": "motion"
    }
  ]
}
```

**`.nkp` 项目文件扩展**：

当前 `NkpProjectData` 接口（puppet.ts）仅有 `version/name/puppet/bundleIndex/parameters/faceParameters/viewport`。新增字段必须先落到 `packages/neko-types/src/types/puppet.ts`，配 JSON Schema + contract test。

| 新增字段 | 类型 | 说明 |
|---------|------|------|
| `puppet.format` | `'native' \| 'moc3' \| 'inp'` | v2 新建/转换产物使用 `'native'`；`'moc3'` / `'inp'` 仅兼容旧项目 |
| `puppet.animationModel` | `'parameter' \| 'bone-blendshape'` | 运行时选择动画管线 |
| `puppet.importSource` | `NkpImportSource` | 原始 PSD / PNG / Live2D 来源 metadata（只读追溯，不是运行时 SSOT） |
| `skeleton` | `NkpSkeleton` | 骨骼层级 + IK + SpringBone 定义 |
| `blendShapes` | `NkpBlendShapeConfig` | 标准集引用 + 自定义列表 |
| `controlDrivers` | `NkpControlDriver[]` | 表情/追踪/Live2D 参数到骨骼和 BlendShape 的显式映射 |
| `autoRig` | `NkpAutoRigMetadata` | 自动创建过程的模板、模型版本、置信度、用户修正记录 |
| `expressions` | `Record<string, Record<string, number>>` | 替代 `faceParameters`，语义化预设 |
| `animations` | `NkpAnimationRef[]` | 内嵌动画引用列表 |

```jsonc
// sakura.nkp — puppet 项目（扩展，version 保持 string 类型）
{
  "version": "2.0",
  "name": "Sakura",
  "puppet": {
    "src": null,
    "format": "native",
    "animationModel": "bone-blendshape",
    "importSource": {
      "kind": "live2d-bundle",
      "path": "sakura-live2d.zip",
      "contentHash": "sha256:..."
    }
  },
  "autoRig": {
    "template": "humanoid_upper",
    "generatedBy": "neko-auto-rig/1.0",
    "confidence": 0.87,
    "userAdjusted": ["bone:left_arm", "blendshape:mouthSmileLeft"]
  },
  "skeleton": {
    "bones": [
      { "name": "root", "parent": null, "position": [0, 0], "rotation": 0 },
      { "name": "spine", "parent": "root", "position": [0, -50], "rotation": 0 },
      { "name": "head", "parent": "spine", "position": [0, -80], "rotation": 0 }
    ],
    "ikConstraints": [],
    "springBones": []
  },
  "blendShapes": {
    "standard": "arkit_52",
    "implemented": ["jawOpen", "mouthSmileLeft", "mouthSmileRight"],
    "custom": []
  },
  "controlDrivers": [
    {
      "id": "driver.jawOpen.jaw",
      "source": { "type": "blendshape", "name": "jawOpen" },
      "target": { "type": "boneRotation", "bone": "jaw", "axis": "z" },
      "curve": { "type": "linear", "scale": 18 },
      "blendMode": "add",
      "priority": 0
    }
  ],
  "expressions": {
    "happy": { "mouthSmileLeft": 0.8, "mouthSmileRight": 0.8, "cheekSquintLeft": 0.6 },
    "sad": { "mouthFrownLeft": 0.7, "mouthFrownRight": 0.7, "browDownLeft": 0.5 }
  },
  "parameters": {},
  "faceParameters": {},
  "animations": [],
  "viewport": { "zoom": 1.0 }
}
```

---

## 不变量

1. **Neko 原生格式是 SSOT**：`.nkp` / `.nkentity` 是 Neko 原生角色的事实来源；Live2D/MOC3 不是内部 SSOT，仅作为只读导入转换源
2. **默认管线先 BlendShape 后 Skinning**：`v_final = skinning(v_base + Σ(weight × delta))`，表情跟随骨骼运动；post-skin corrective 为可选标记
3. **骨骼是流通底线**：任何 `puppet-bone` 角色表示必须有骨骼层，BlendShape 是可选增强
4. **MOC3 导入单向**：MOC3 → `.nkp` v2 / `.nkentity` v2 是单向转换，不支持回写 MOC3；保留原始 source metadata 方便重新导入
5. **格式 JSON 文本**：`.nkp` / `.nkentity` 保持 JSON 文本格式（Git 友好、LLM 可读）
6. **runtime-puppet 零 GPU 依赖**：ECS 组件和顶点计算不依赖 wgpu；GPU skinning 通过 render-extract 模式进入 renderer
7. **渲染器无关**：数据模型不绑定具体渲染后端，renderer 可独立演进（CPU fallback 或 GPU 管线）
8. **契约先行**：`.nkentity` v2 / `.nkp` v2 的类型定义必须先落到 `packages/neko-types`，配 JSON Schema + contract test，再实现 loader/renderer
9. **统一 Viewport 协议**（详见 [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md)）：puppet 通过 PuppetController 实现 ISceneController 接口消费 ViewportShell；P2 切换到引擎流前先用本地渲染迭代
10. **AnimationClip2D 是动画图叶节点**：clip 只描述骨骼/BlendShape 轨道采样，不保存 transition / state / blend tree；跨 2D/3D 动画图由后续 AnimationGraph 合同拥有
11. **Morph/BlendShape GPU 共享 primitive**：2D BlendShape 与 3D MorphTarget 的 `v += Σ(delta × weight)` 计算不得各自复制 shader；Phase 2 通过 engine-gpu 共享 compute primitive 复用

---

## 迁移计划

### Phase -1: 契约迁移（前置，~1.5 周，3 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| P-1-PR1 | `packages/neko-types`: `NkEntityArtifact` v1→v2 迁移（新增 `'puppet-bone'` role + `rig_template`/`blendshape_standard` metadata）+ v1→v2 迁移函数 + contract test | — |
| P-1-PR2 | `packages/neko-types`: `NkpProjectData` 扩展（`format: native` / `animationModel` / `importSource` / `autoRig` / `skeleton` / `blendShapes` / `controlDrivers` / `expressions` / `animations` 字段）+ JSON Schema + contract test | — |
| P-1-PR3 | `packages/neko-types`: `AnimationClip2D` / `BoneTrack` / `BlendShapeTrack` / `Keyframe<T>` TS 类型定义 + Rust `engine-types` 对应 DTO | P-1-PR2 |

### Phase 0: 基础组件（~4.5 周，7 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| P0-PR1 | runtime-puppet 新增 `Bone2D`, `Skeleton2D`, `SkinWeights2D` 组件 | P-1 |
| P0-PR2 | runtime-puppet 新增 `BlendShapeSet`, `BlendShapeWeights`, `ExpressionPresets`, `ControlDriverSet` 组件 | P-1 |
| P0-PR3 | 新增 `blendshape_apply` system（BlendShape 叠加，bind pose 空间） | PR2 |
| P0-PR4 | 新增 `skinning_2d` system（骨骼蒙皮计算，输入已含 BlendShape 偏移） | PR1 |
| P0-PR5 | 修改 `DeformedVertices` 计算：**control driver → blendshape → skinning** → output | PR3, PR4 |
| P0-PR6 | 新增 `IkConstraint2D`, `SpringBone2D` 组件 + system | PR4 |
| P0-PR7 | 引入 bevy_tasks 并行化 CPU `blendshape_apply` / `skinning_2d` mesh 批处理；保留单线程 deterministic fallback 和 benchmark | P0-PR3, P0-PR4 |

### Phase 1: MOC3 导入转换（~3 周，4 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| P1-PR1 | MOC3 RotationDeformer → Bone2D 转换器 | P0 |
| P1-PR2 | MOC3 WarpDeformer/KeyForm → BlendShape 采样转换器 | P0 |
| P1-PR3 | MOC3 Motion/Expression → AnimationClip2D/ExpressionPreset 转换器 | P0 |
| P1-PR4 | MOC3 Physics / Param → SpringBone2D + ControlDriver 转换器 | P1-PR1~3 |
| P1-PR5 | DrawOrder / Mask / Clipping 转换策略或 partial-conversion fallback + **golden render 对比测试**（SSIM ≥ 0.995，至少 3 个 generated/CC0 synthetic public fixtures；真实复杂公开 MOC3 模型后续扩充） | P1-PR1~4 |

### Phase 2: 编辑器 + 渲染器（~6 周，8 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| P2-PR1 | engine-puppet-renderer 新增 GPU BlendShape+Skinning 管线（CPU 管线保留为 fallback）；Morph/BlendShape 加权求和复用 engine-gpu 共享 compute primitive | P0 + Bevy Gap ADR Phase 1C |
| P2-PR2 | PuppetController 实现 ISceneController + puppet webview 从 Canvas2D/VideoViewport 切换到 ViewportShell（含 overlay 预测性渲染）；**验收指标：骨骼拖拽延迟 ≤ 16ms** | P2-PR1 + **Viewport ADR V-1 + V0 完成**（本 ADR 不重复实现 ViewportProtocol DTO 和 ViewportShell 组件） |
| P2-PR3 | 骨骼编辑工具（创建/移动/旋转/IK 交互） | P2-PR2 |
| P2-PR4 | BlendShape 编辑工具（关键姿态绘制→顶点偏移计算） | P2-PR2 |
| P2-PR5 | 关键帧动画编辑器（复用 KeyframeTimeline 适配器） | P2-PR2 |
| P2-PR6 | PSD/PNG/Live2D 自动创建管线入口（解析素材 → autoRig draft → 用户预览） | P2-PR3 |

### Phase 3: AI + 导出 + 集成（~4 周，5 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| P3-PR1 | Agent 工具：create_native / set_expression / set_blendshape / set_bone / set_control_driver / play_animation | P2 |
| P3-PR2 | 自动骨骼生成管线（模板匹配 + PSD 图层感知 + AI 姿态估计） | P2-PR6 |
| P3-PR3 | 自动 BlendShape + ControlDriver 生成（模板表情库 + AI 表情变体 + Live2D 参数映射） | P2-PR4 |
| P3-PR4 | 导出管线：Spine JSON / Spritesheet / Lottie | P2 |
| P3-PR5 | neko-cut 时间轴集成 + neko-live 追踪驱动适配 | P3-PR1 |

### Phase 4: 高级 AI（~3 周，3 PR）

| PR | 内容 | 依赖 |
|----|------|------|
| P4-PR1 | 高级 AI 自动绑骨（多视角/遮挡修复/复杂服装权重优化） | P3-PR2 |
| P4-PR2 | Text-to-Motion 集成（外部模型 API → AnimationClip2D） | P3-PR1 |
| P4-PR3 | AI 单图生成完整角色增强（从零生成素材→切层→绑骨→表情→动画一站式） | P4-PR1, P4-PR2 |

**合计：~20 周，29 PR**（含 Phase -1 契约迁移 3 PR；Phase 0 增加 bevy_tasks CPU 并行化 PR；Phase 2 ViewportShell 前置由统一 Viewport ADR V-1/V0 拥有，不计入本 ADR）

---

## MOC3 处置策略

| 阶段 | MOC3 代码状态 | 说明 |
|------|-------------|------|
| Phase -1 ~ 1 | **冻结** | 不再投入新功能，标记 `@deprecated` |
| Phase 1 golden test 通过后 | **降级为导入器** | MOC3 parser 仅用于导入转换，不再作为运行时格式 |
| Phase 3 完成后 | **评估移除** | 若导入管线稳定且 golden test 全量通过（SSIM ≥ 0.995，并覆盖足够复杂的真实公开模型），可选择移除 MOC3 实时播放路径 |

现有 MOC3 parser（~4,300 LOC）在 Phase 1 中直接复用为导入转换器的前端，零浪费。
导入后保留原始 Live2D source metadata（`puppet.importSource`），方便后续重新导入；`puppet.src` / `puppet.format: moc3` 仅用于旧项目兼容路径。

Live2D 高保真播放不进入 `runtime-puppet` core；若产品需要 Cubism 级 fidelity，应通过独立 `Live2dRuntimeAdapter` / custom SDK 接入 StageActor、GpuLayer 和 command bridge。`runtime-puppet/moc3` 保留为过渡期导入/兼容例外，待 native `.nkp` v2 与导入 golden tests 稳定后再评估拆出 parser/import crate。

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| MOC3 二维参数空间转 BlendShape 精度损失 | 转头等复杂形变可能有差异 | 2D BlendSpace 采样 9 点（3×3），精度 90%+；可手动精调 |
| 自动骨骼生成质量不稳定 | 非标准体型检测差 | 模板匹配兜底；手动微调永远可用 |
| GPU Skinning 2D 性能 | 低端设备帧率 | 4 骨骼/顶点已是行业标准；BlendShape 可做 LOD 裁剪 |
| 编辑器复杂度增加 | puppet webview 从 2.5K→8K+ LOC | 提取共享组件到 @neko/ui（与 model 共享 ViewportShell / KeyframeTimeline） |
| 现有 VTuber 用户 MOC3 资产 | 导入转换有精度损失 | 保留只读播放路径直到 Phase 3 评估 |
| 2D 视频流交互延迟 | 骨骼拖拽/顶点编辑增加 ~5-10ms 往返（本地渲染 < 1ms） | overlay 预测性骨骼线框渲染；P2 验收指标：拖拽延迟 ≤ 16ms |
| 2D 叠加层像素对齐 | 骨骼/顶点 overlay 与视频流需像素级对齐（3D 可掩盖亚像素偏差） | 引擎每帧元数据附带 viewport transform 矩阵 |

---

## 与其他 ADR 的交互

| ADR | 交互方式 |
|-----|---------|
| 共壳分核 (adr-2d3d-unified-engine) | **本 ADR 修订其 2D 数据范式判断**：2D 核心范式从 ParameterBinding 迁移到 Bone2D+BlendShape；Skeleton2D 对齐 runtime-scene 的 Skeleton trait；AnimationBlendState 泛型复用 |
| 资产联邦 (adr-asset-federation) | .nkentity v2 binding 新增 `puppet-bone` role；AssetHandler 注册 `bone-blendshape` 能力 |
| Engine Puppet Renderer | SpriteBatch 纹理/混合管线保留；Phase A CPU 已变形顶点不变；Phase B 新增 GPU BlendShape+Skinning 管线 |
| Agent Capability Protocol | puppet AgentCapabilityProvider 工具集从参数操作扩展为三级粒度（预设/组件/生成） |
| AI Face Sculpting | 面部编辑直接操作 BlendShape 权重，无需参数中间层 |
| Device Management | VTuber 追踪：ARKit → BlendShape 权重（面部）+ Bone 变换（身体），mappingTable 简化 |
| 统一 Viewport (adr-unified-viewport-protocol) | puppet 通过 PuppetController 消费 ViewportShell；`scene:puppet:*` 命令走统一信封；overlay 预测性渲染解决 2D 延迟 |
| Webview UI Design System | @neko/ui 提供 ViewportShell 等 L2 组件；协议 DTO 在 @neko/shared L0 |

---

## 五层分析

### 1. 职责分析

新架构把运行时职责拆清楚了：
- **runtime-puppet**：权威数据模型 + 顶点计算（BlendShape → Skinning → DeformedVertices）
- **engine-puppet-renderer**：GPU 渲染（接收已变形顶点或 GPU skinning 输入）
- **puppet webview**：编辑交互 UI（骨骼/BlendShape/动画编辑器）
- **Agent 工具层**：三级语义操作（预设/组件/生成）

每层可独立测试、独立替换。

### 2. 依赖分析

**关键约束**：runtime-puppet 保持零 GPU 依赖。

```
runtime-puppet (ECS 组件 + systems)
       │
       │ render-extract 模式（导出 bone matrices + blendshape deltas + weights）
       ▼
engine-puppet-renderer (wgpu SpriteBatch / GPU skinning)
       │
       │ 不反向依赖
       ✗ runtime-puppet 不 import wgpu
```

依赖方向（全为 Rust crate 依赖）：`engine-types` → `runtime-puppet` → `engine-puppet-renderer`。renderer 通过 trait / 数据 DTO 读取 ECS 状态，不直接操作 ECS。

TS 侧（`@neko/shared`）与 Rust 侧（`engine-types`）通过 **双投影契约** 对齐：共享 JSON Schema / Protobuf / golden fixture 作为 SSOT，两侧各自实现对应类型，互不 import。`@neko/shared` 不是 Rust crate 的上游依赖。

### 3. 接口设计

ADR 的 ECS 组件接口草图（§3）方向正确，但需补充以下设计约束：

| 约束 | 说明 | 实现要求 |
|------|------|---------|
| **ID 稳定性** | 骨骼/BlendShape 通过 name（String）引用，不依赖 Entity index | name 在 Skeleton2D / BlendShapeSet 内唯一；导入时保留原始 MOC3 名称 |
| **名称冲突** | 同一 mesh 上 BlendShape 名称不可重复 | loader 和编辑器在写入时校验，运行时断言 |
| **索引校验** | `SkinWeights2D.joint_indices` 不能越界 `Skeleton2D.bone_entities` | 加载时断言 + 运行时 debug_assert |
| **版本迁移** | `.nkp` v1（parameter 模型）→ v2（bone-blendshape）需迁移函数 | `puppet.animationModel` 字段区分；v1 文件走 MOC3 兼容路径 |

### 4. 扩展分析

ARKit 52 + VRM Expression 是好的标准锚点。但 2D 角色经常不是完整人脸（半身像、Q版、非人形），应支持：

| 扩展场景 | 方案 |
|---------|------|
| **实现子集** | `.nkp` 声明 `blendShapes.implemented: string[]`，未实现的自动忽略（权重归零） |
| **别名映射** | `blendShapes.aliases: Record<string, string>`，允许 `"smile" → "mouthSmileLeft+mouthSmileRight"` 组合映射 |
| **能力发现** | Agent 工具调用前查询 `puppet:list_blendshapes` 获取可用列表，不假设 52 个全有 |
| **自定义扩展** | `blendShapes.custom: BlendShapeDef[]` 支持非 ARKit 标准的角色特有形变（如兽耳/触角） |

### 5. 测试验证

| 测试类型 | 内容 | 何时引入 |
|---------|------|---------|
| **数学单测** | skinning_2d / blendshape_apply 系统的顶点计算正确性 | Phase 0 每个 PR |
| **ControlDriver 求值** | 多 Driver 写同一目标时 blend_mode（add/override/max）和 priority 排序正确；环路检测（Driver A→B→A）不死循环 | Phase 0 P0-PR5 |
| **golden render 对比** | MOC3/keyform 原始播放 vs 转换后 native 播放，逐帧 SSIM ≥ 0.995；失败输出 reference/native/diff artifact 与 summary | Phase 1 P1-PR5（首版 harness 已落地，后续继续扩真实模型集） |
| **契约测试** | `.nkp` v2 / `.nkentity` v2 序列化/反序列化 round-trip | Phase -1 每个 PR |
| **renderer synthetic mesh** | 用合成网格验证 GPU skinning + BlendShape 管线正确性（不依赖真实模型） | Phase 2 P2-PR1 |
| **CPU 并行一致性** | bevy_tasks 并行 `blendshape_apply` / `skinning_2d` 与单线程 fallback 在 synthetic mesh 上逐顶点误差 ≤ 1e-5；benchmark 覆盖 1k/10k/50k vertices，并包含 many-shapes × large-delta 极端 fixture（>20 BlendShapes、极端 weight 分布）；若超阈值，评估 Kahan 或 f64 accumulator | Phase 0 P0-PR7 |
| **AnimationGraph leaf 合同** | `AnimationClip2D` 采样输出可作为 AnimationGraph leaf，不包含 state/transition；fixture 覆盖 clip → pose sample → graph leaf wrapper round-trip | Phase 1C / Phase 2 前 |
| **共享 morph primitive** | 2D BlendShape 与 3D MorphTarget 使用同一 engine-gpu compute primitive 的 synthetic parity fixture，验证 `v += Σ(delta × weight)` 输出一致 | Phase 2 P2-PR1 |
| **ID 稳定性测试** | 骨骼/BlendShape 通过 name 引用，Entity 重建后引用不断 | Phase 0 P0-PR1, P0-PR2 |
| **子集兼容测试** | 缺失 BlendShape 时权重归零、不 panic | Phase 0 P0-PR3 |
| **autoRig fixture** | 预设 PSD/PNG fixture（至少 3 种体型：全身人形/半身/Q版），验证自动骨骼+BlendShape+Driver 生成的结构正确性和 round-trip（生成→序列化→反序列化→渲染不报错） | Phase 2 P2-PR6 |
| **自动创建 round-trip** | 完整管线测试：导入 PSD → autoRig → .nkentity 打包 → 加载 → 播放默认表情/动画 → 无 panic 无精度退化 | Phase 3 P3-PR2 |
| **overlay 坐标矩阵** | ViewportFrameMeta.viewTransform 矩阵与引擎实际渲染坐标的一致性（合成测试：在已知位置放置骨骼，验证 overlay 绘制坐标偏差 ≤ 0.5px） | Phase 2 P2-PR4 |

---

## 附录 A: 与竞品对比

| 能力 | Spine Pro | Live2D Cubism | 本方案 |
|------|-----------|---------------|--------|
| 骨骼动画 | ✓ | ✗ | ✓ |
| 网格变形 (FFD) | ✓ | ✓ (Warp Deformer) | ✓ (BlendShape) |
| IK 约束 | ✓ | ✗ | ✓ |
| 弹簧物理 | ✓ (Spine 4.2+) | ✓ | ✓ |
| 面部精细度 | 中（需手动调点） | 高（参数+滑块） | 高（BlendShape 预设+滑块） |
| 游戏导出 | 原生 | 需 SDK | Spine JSON / glTF |
| AI 创作管线 | 无 | 有（自动绑定工具） | 全链路 AI |
| 视频合成 | 需外部工具 | 需外部工具 | neko-cut 原生 |
| VTuber 驱动 | 需外部 | 需外部 | neko-live 原生 |
| 2D+3D 混合 | 无 | 无 | 共壳分核 |
| 价格 | $379 一次性 | ¥3万/年 Pro | VSCode 扩展 |

## 附录 B: BlendShape 标准命名（对齐 ARKit 52）

面部 BlendShape 对齐 Apple ARKit 52 BlendShape 命名标准，确保追踪驱动零转换：

```
Eyes:       eyeBlinkLeft, eyeBlinkRight, eyeLookUpLeft, eyeLookDownLeft,
            eyeLookInLeft, eyeLookOutLeft, eyeSquintLeft, eyeSquintRight,
            eyeWideLeft, eyeWideRight

Mouth:      jawOpen, jawForward, jawLeft, jawRight,
            mouthClose, mouthFunnel, mouthPucker, mouthLeft, mouthRight,
            mouthSmileLeft, mouthSmileRight, mouthFrownLeft, mouthFrownRight,
            mouthDimpleLeft, mouthDimpleRight, mouthStretchLeft, mouthStretchRight,
            mouthRollLower, mouthRollUpper, mouthShrugLower, mouthShrugUpper,
            mouthPressLeft, mouthPressRight, mouthLowerDownLeft, mouthLowerDownRight,
            mouthUpperUpLeft, mouthUpperUpRight

Brow:       browDownLeft, browDownRight, browInnerUp, browOuterUpLeft, browOuterUpRight

Cheek/Nose: cheekPuff, cheekSquintLeft, cheekSquintRight,
            noseSneerLeft, noseSneerRight

Tongue:     tongueOut
```

每个 2D 角色不必实现全部 52 个，按需子集即可。VTuber 追踪时，缺失的 BlendShape 自动忽略（权重归零）。

## 附录 C: 现有代码复用清单

| 现有代码 | LOC | 复用方式 | 改动量 |
|---------|-----|---------|--------|
| moc3/parser.rs | 842 | 导入转换前端 | 零改动 |
| moc3/motion.rs | 515 | 动画格式转换 | 小改动（输出目标变） |
| moc3/expression.rs | 330 | 表情预设转换 | 小改动 |
| moc3/physics.rs | 349 | SpringBone 转换 | 小改动 |
| moc3/interpolation.rs | 191 | BlendShape 插值 | 可复用 |
| moc3/warp_deformer.rs | 210 | 采样为 BlendShape | 小改动 |
| moc3/rotation_deformer.rs | 103 | 转换为 Bone2D | 小改动 |
| Live2dBundleLoader.ts | 161 | ZIP 包解析 | 零改动 |
| model3Manifest.ts | 475 | manifest 解析 | 零改动 |
| puppetMapping.ts | ~200 | 追踪驱动映射 | 改为 BlendShape 名 |
| AnimationBlendState (共壳) | ~80 | 动画混合框架 | 新增 Bone2DBlendLayer |
| KeyframeTimeline (共享组件) | ~300 | 时间轴 UI | 新增 adapter |
| **合计** | **~3,756** | **60% 零改动，40% 适配** | |
