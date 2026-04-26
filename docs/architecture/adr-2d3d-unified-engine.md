# ADR: 2D / 3D Unified Engine — 共壳分核架构

## 状态

Proposed (2026-04-25)

## 关联 ADR

- 上层依赖:[adr-four-layer-contract.md](./adr-four-layer-contract.md)
- 横向配合:[adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md), [adr-engine-ai-native-foundation.md](./adr-engine-ai-native-foundation.md)
- 后续扩展:[adr-xr-authoring-runtime-split.md](./adr-xr-authoring-runtime-split.md)

## 背景

neko-engine 当前有两个独立的 ECS crate:

- `runtime-scene`:3D 场景 ECS(bevy_ecs + glTF + IK + Animation Blend)
- `runtime-puppet`:2D 骨骼 ECS(bevy_ecs + inox2d + Animation Blend)

它们在多处呈现**镜像重复**:

| 重复点 | runtime-scene | runtime-puppet |
|--------|---------------|----------------|
| Animation Blend 状态 | `SceneBlendLayer` + `SceneCrossfadeRequest` | `BlendLayer` + `CrossfadeRequest` |
| Transform Propagation | `transform_propagation`(mat4) | `transform_propagation_2d`(mat3) |
| Service 模式 | `Mutex<World>` 包 + `ISceneService` | `Mutex<World>` 包 + `IPuppetService` |
| ActionRequest 路由 | `ScenesController` | `PuppetsController` |

同时,2D 还有第三类资产 — neko-sketch(栅格 / 图层树),目前完全在 TS 端,无 ECS 化。

**核心问题**:

1. 当前的镜像重复违反 DRY,任何修改要同步两份
2. 跨模态复用不存在(3D 微笑 ≠ 2D 微笑,即使都是"微笑"语义)
3. AI 意图层不应感知 2D / 3D 边界,但当前域路由不存在,LLM 需自己分辨

## 决策

采用**共壳分核(Shared Shell, Separate Cores)**架构:

> **L4 Intent + L3 Orchestration + L1 Control 三层完全共享;L2 ECS Data 层保留两套独立 World,但通过共享 trait 对齐结构。**

### 共享什么(必须收口)

| 收口对象 | 目标位置 | 收益 |
|---------|---------|------|
| `BlendLayer` / `CrossfadeRequest` | `engine-ecs-core::AnimationBlendState<L>` | 80 行重复代码归一 |
| Transform 传播算法(DFS) | `engine-ecs-core::trait Affine` 泛型 system | 矩阵类型多态化 |
| Mutex<World> 服务壳 | `engine-ecs-core::EcsWorldHandle<W>` | 服务层模板复用 |
| 域路由 | `engine-orchestration::DomainRouter` | LLM 不感知 2D/3D 边界 |
| Snapshot/Delta 协议 | `engine-ecs-core::trait ArtifactSnapshot` | sketch 可对齐 |

### 不共享什么(强行统一是反模式)

| 不共享对象 | 原因 |
|-----------|------|
| Skeleton(3D) vs ParameterBinding(2D inox2d) | 两种动画范式,数据结构本质不同 |
| IK 求解器(FABRIK/CCD/TwoBone) | 3D 专属,2D 用参数语义直接表达 |
| Mesh 形变(2D inox2d 顶点位移) | 2D 专属,3D 用骨骼蒙皮 |
| GPU 管线(stereo / skinning / inox2d 渲染) | 渲染路径根本不同 |
| 资产格式(.nkm vs .nkpup vs .nks) | 序列化二进制布局必然不同 |
| Loader(glTF vs INP vs PSD) | 解析逻辑无可复用部分 |

## 设计要点

### 1. 共享层划分

```
╔══════════════════════════════════════════════════════════════════════╗
║  L4 Intent Layer  ─  完全共享                                         ║
║  IntentDescriptor.domain ∈ {3d-scene, 2d-puppet, 2d-sketch, mixed}   ║
║  LLM 不应区分 2D/3D,只描述"创作意图"                                ║
╚══════════════════════════════════════════════════════════════════════╝
                                  ↓
╔══════════════════════════════════════════════════════════════════════╗
║  L3 Orchestration Layer  ─  完全共享                                  ║
║  CapabilityRegistry: Tool 加 domain 标签                              ║
║  DomainRouter: IntentDescriptor.domain → Service                      ║
║    ├─ '3d-scene'  → ISceneService  → runtime-scene                   ║
║    ├─ '2d-puppet' → IPuppetService → runtime-puppet                  ║
║    └─ '2d-sketch' → ISketchService → TS-side layer tree              ║
╚══════════════════════════════════════════════════════════════════════╝
                                  ↓
╔══════════════════════════════════════════════════════════════════════╗
║  L2 ECS Data Layer  ─  trait 共享,数据分核                          ║
║                                                                       ║
║   ┌─ engine-ecs-core (新 crate) ────────────────────┐                ║
║   │  trait Affine                                    │                ║
║   │  trait AnimationBlend<L: BlendLayer>            │                ║
║   │  trait ArtifactSnapshot { fn diff(...) }        │                ║
║   └──────────────────────────────────────────────────┘                ║
║                ▲              ▲              ▲                        ║
║      impl for  │     impl for │     impl for │                        ║
║   ┌─────────────────┐  ┌────────────────┐  ┌───────────────┐         ║
║   │ runtime-scene   │  │ runtime-puppet │  │ runtime-sketch│         ║
║   │ Transform/mat4  │  │ Transform2D   │  │ Layer tree    │         ║
║   │ Skeleton + IBM  │  │ ParameterBind  │  │ (TS-side)     │         ║
║   │ IkChain         │  │ MultiKeyDeform │  │ NksDocument   │         ║
║   └─────────────────┘  └────────────────┘  └───────────────┘         ║
╚══════════════════════════════════════════════════════════════════════╝
                                  ↑ snapshot/delta stream
╔══════════════════════════════════════════════════════════════════════╗
║  L1 Control Layer  ─  共享 FeedbackBus                               ║
║  Signal 来源:三个 Core 都通过 ArtifactSnapshot::diff 发同质事件      ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 2. ECS 数据层不强行统一的根因

`Skeleton`(3D 关节驱动)与 `ParameterBinding`(2D inox2d 参数驱动)是**两种本质不同的动画范式**:

| | 3D (Skeleton) | 2D (Puppet) |
|---|---|---|
| 驱动量 | 关节变换矩阵 | 参数曲线 (X, Y) ∈ [-1,1]² |
| 形变方式 | Linear Blend Skinning (GPU) | 顶点位移插值 (CPU) |
| IK | FABRIK / CCD / TwoBone | 不存在(参数即语义) |
| 刚体单位 | Bone(有父子) | Mesh + Drawable |

强行统一只会得到一个 100 字段的"上帝组件"。但**算法形状**是同构的(blend, crossfade, transform propagation)→ **抽象到 trait,不抽象到 type**。

### 3. Intent 层 100% 共享的原因

```
User NL → IntentExtractor → IntentDescriptor.domain(自动路由)
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  ▼                      ▼                      ▼
          3d-scene domain         2d-puppet domain        2d-sketch domain
          tools: ScenePose        tools: SetFaceParams    tools: SketchInpaint
                 SceneAnimate            PlayPuppetAnim          SketchStyle
```

域路由发生在 **Tool 选择时**,而不是 Intent 表达时。这等价于 [adr-capability-protocol.md](./adr-capability-protocol.md) 的 ToolDef 投影模型,新增一个 `domain` 标签维度。

### 4. 立即可做的去重

| 重复点 | 现状 | 抽象目标 | 改造成本 |
|--------|------|----------|---------|
| `SceneBlendLayer` ⇆ `BlendLayer` | 两份相同 struct | `engine-ecs-core::AnimationBlendState<L>` | 1 PR |
| `SceneCrossfadeRequest` ⇆ `CrossfadeRequest` | 两份相同 struct | `engine-ecs-core::CrossfadeRequest` | 含上 |
| `transform_propagation` (3D DFS) ⇆ `transform_propagation_2d` | 算法同构,只差矩阵类型 | `trait Affine` + 泛型 system | 1 PR |
| 服务层 `Mutex<World>` 模式 | scene/puppet 各一份 | `EcsWorldHandle<W>` 共享外壳 | 1 PR |

## 后果

### 正面

- **代码去重**:Animation Blend 80 行重复消除
- **AI 友好**:LLM 不需理解 2D/3D 边界,Intent 表达更自然
- **跨模态扩展**:未来"3D 微笑同步到 2D 模型"等能力有架构基础
- **新域接入快**:`runtime-xr` 等只需 impl 三个 trait

### 负面 / 权衡

- **新建 crate**:`engine-ecs-core` 增加构建依赖
- **泛型增加**:Affine trait 让 system 签名更长
- **概念学习曲线**:贡献者需理解"共壳分核"原则
- **ADR 制约**:跨模态共享必须经 SemanticSlot(见 ai-native-foundation),不能直接拷贝数据

## 实施路径

```
S1  engine-ecs-core 新 crate
    ── 抽出 BlendLayer / CrossfadeRequest / AnimationBlendState
    ── 定义 trait Affine + 泛型 transform_propagation
    ── 定义 trait ArtifactSnapshot
    工作量: 2 PR

S2  runtime-scene / runtime-puppet 改 impl
    ── 删除两份镜像 struct,改用 engine-ecs-core
    ── 改完两份测试同时跑通
    工作量: 2 PR

S3  L3 编排层 DomainRouter 落地
    ── Tool 加 domain 标签
    ── DomainRouter 路由到 ISceneService / IPuppetService / ISketchService
    工作量: 2 PR

S4  L4 Intent 层 IntentDescriptor.domain 自动推断
    ── 暂用规则(关键词 + 上下文资产类型)
    ── 后续接入 ai-native-foundation 的 SemanticSlot 后升级
    工作量: 1 PR
```

## 反模式清单

```
AP-1  "数据型共享"
      现象:把 Skeleton 和 ParameterBinding 合并为 UniBone
      代价:得到 100 字段的上帝组件
      修法:trait 共享算法,数据各自分核

AP-2  "Domain 在 Intent 里硬编"
      现象:LLM Prompt 里直接写"如果是 3D 模型则..."
      代价:意图层污染了实现知识
      修法:LLM 输出 IntentDescriptor 时不指 domain,DomainRouter 决定

AP-3  "服务跨域调用"
      现象:ISceneService.adaptFromPuppet(...)
      代价:scene 与 puppet 服务相互依赖
      修法:跨域适配走 engine-adapter,服务自身不互调
```
