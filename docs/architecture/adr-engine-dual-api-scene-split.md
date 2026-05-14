# ADR：Dual API（CreativeAccess + DataAccess）+ Scene 计算-渲染分离

- **状态**：提议中
- **日期**：2026-05-13
- **作者**：Claude（架构师）
- **范围**：runtime-scene、runtime-puppet、engine-kernel（services/impls/scene*.rs）
- **父文档**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)
- **前置条件**：[adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md)（SceneRenderer 产出 VideoGpuFrame → PipelineSink）

---

## 背景

本文档是 [adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md) 的子 ADR，从 umbrella 文档的第九部分（Dual API）和第八部分（Scene 计算-渲染分离相关）中提取。

全局上下文请参阅 umbrella 文档的第一部分（接口架构审计）和第二部分（管线架构审计）。核心问题总结：

1. **SceneService 混合了计算和渲染** —— `render_frame()` 依次锁住 `world` 和 `renderer`，计算和渲染不能独立推进。
2. **18 个 `ecs_world_mut()` 逃逸口** —— OOP trait shell 无法表达的合法操作绕过了抽象层。
3. **Scene 输入与 WebSocket handler 紧耦合** —— 传输关注点和领域关注点混合。
4. **约 600 行重复代码** —— runtime-scene 和 runtime-puppet 之间的结构性重复。

---

## 第一部分：Dual API —— 创意抽象（OOP）+ 数据抽象（ECS）

### 1.1 问题陈述

当前架构要求只有一条访问路径：上层 → OOP trait shell → ECS。但 SceneService 里有 **18 个 `ecs_world_mut()` 调用点**绕过了 trait shell——这不是 bug，而是 OOP 抽象无法表达的合法操作。

这 18 个点可以分成几类，说明缺少了一层抽象：

| 绕过类别     | 调用点 | 为什么 OOP trait 不够                                                                       |
| ------------ | ------ | ------------------------------------------------------------------------------------------- |
| GPU 渲染提取 | 2      | 每帧 4 次 bulk archetype 查询；如果用 OOP `get_snapshot()`，就会序列化+反序列化（性能灾难） |
| 序列化/导出  | 4      | 需要完整组件可见性，并处理可选组件组合（`MeshRef + MaterialRef + Light + Camera`）          |
| 命令批处理   | 2      | SceneCommandQueue 需要在原子批处理中校验 revision 并应用异构命令                            |
| 领域子系统   | 5      | ModelingSession 管理 vertex brush + topology 操作——跨实体的细粒度变更                       |
| 程序化生成   | 4      | `create_shape()`、`csg_boolean()` 需要以任意组件元组创建实体                                |
| 基础设施     | 1      | 读取 `SceneRevision` resource——没有对应 trait 方法                                          |

OOP trait shell（SceneWorld 28 个方法、PuppetWorld 25 个方法）非常适合**面向用户的创意命令**，但从根本上无法承载**面向数据的管线操作**。

### 1.2 两种抽象本质

**OOP = 面向用户的创意抽象**

| 属性       | 说明                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------- |
| 粒度       | 单实体、单意图                                                                                     |
| 语义       | 命令式："加载这个模型"、"设置这个参数"、"播放这个动画"                                             |
| 版本控制   | 有 revision tracking、undo 语义、command log                                                       |
| 调用者画像 | Editor UI、WebSocket command、Agent 工具（写）                                                     |
| 示例       | `update_transform(node_id, pos, rot, scale)`、`play_animation(name)`、`set_visible(node_id, true)` |

**ECS = 面向数据的创意抽象**

| 属性       | 说明                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| 粒度       | 多实体、批量查询/变更                                                                         |
| 语义       | 声明式："所有包含 Mesh+Transform 的实体"、"提取 render world"、"创建 entity bundle"           |
| 版本控制   | 没有 revision tracking——由调用方管理一致性                                                    |
| 调用者画像 | 渲染管线、导出、领域子系统、ML 预处理                                                         |
| 示例       | `extract_render_world()`、`query::<(&MeshRef, &GlobalTransform)>()`、`spawn((components...))` |

### 1.3 从 SceneWorld/PuppetWorld 方法中得到的证据

当前 trait 方法实际上分成三类，暴露出这种双重本质：

**真正的 OOP——意图与实现一致：**

单实体查找 → 单组件变更。例如 `set_visible(node_id, bool)`、`set_parameter(name, value)`、`set_node_opacity(node_id, f32)`、`set_texture(node_id, index)`。

**伪装成 OOP 的 ECS——OOP 命名掩盖了批量数据操作：**

- `load_model(path)` 听起来像 OOP，但实现是多阶段批量创建（parse glTF → spawn N entities → resolve skeleton → attach animations）
- `tick(clip_name, time)` 听起来像 OOP，但会触发多个 system dispatch + 多查询 delta 提取
- `restore_snapshot(snapshot)` 是批量实体重建（despawn all → bulk spawn → reconstruct hierarchy）

**别扭的 OOP——本应是 ECS 查询，却被迫塞进 trait：**

每次调用 = 完整实体遍历 + 堆分配。例如 `get_snapshot()`（query ALL entities → serialize）、`get_deformed_meshes()`（query ALL meshes → extract geometry）、`get_animation_clips()`、`get_blend_state()`。

### 1.4 Dual API 设计

```
┌──────────────────────────────────────────────────────────────┐
│  SceneAccess / PuppetAccess  (unified entry point)            │
│                                                               │
│  ┌────────────────────────┐  ┌──────────────────────────────┐ │
│  │  CreativeAPI (OOP)      │  │  DataAPI (ECS)               │ │
│  │                        │  │                                │ │
│  │  load_model(path)      │  │  extract_render_world()        │ │
│  │  update_transform(id)  │  │  serialize_entities(filter)    │ │
│  │  play_animation(name)  │  │  extract_render_world()        │ │
│  │  set_visible(id, bool) │  │  spawn_procedural(components)  │ │
│  │  create_ik_chain(...)  │  │  apply_modeling_delta(delta)    │ │
│  │  crossfade(clip, dur)  │  │  read_revision()                │ │
│  │  ✓ Revision tracking   │  │  ✗ No revision tracking        │ │
│  │  ✓ Undo semantics      │  │  ✗ No undo (caller manages)    │ │
│  │  ✓ Command log          │  │  ✗ No command log              │ │
│  └────────────────────────┘  └──────────────────────────────┘ │
│                                                               │
│  Both backed by same bevy_ecs::World instance                 │
└──────────────────────────────────────────────────────────────┘
```

### 1.5 调用者权限矩阵

| 调用者                  | CreativeAPI（OOP） |   DataAPI（ECS）    | 理由                                                       |
| ----------------------- | :----------------: | :-----------------: | ---------------------------------------------------------- |
| Controller（host-api）  |         写         |         否          | 用户操作 → 单实体、带版本                                  |
| Scene Control WebSocket |         写         |         否          | 编辑器实时命令，需要 revision + ack                        |
| Render Pipeline         |         否         |   独占（extract）   | `extract_render_world()` 需要 `&mut World`；短暂加锁后释放 |
| Export / Serialize      |         否         |   独占（读意图）    | GLB/project file，需要遍历所有实体和组件                   |
| 领域子系统（Modeling）  | 写（begin/commit） | 独占（vertex 操作） | OOP 负责粗粒度生命周期，ECS 负责细粒度数据                 |
| ML 预处理               |         否         |   独占（读意图）    | 批量读取 scene 数据作为推理输入                            |
| Agent 工具              |         写         |   独占（读意图）    | AI 通过 OOP 命令编辑，AI 感知通过 ECS 查询                 |
| Stream Producer         |         否         |   独占（extract）   | 紧凑的渲染循环，`capture_h264_keyframe()`                  |

> **关于"独占"**：bevy_ecs 的 `World::query()` 为了 archetype tracking 需要 `&mut World`。
> "读意图"表示调用方在语义上只是读取实体状态，但仍然需要独占访问。
> 真正的并发读访问是 P3 优化（需要预构建 `QueryState` + `&World` 路径）。

**关键约束**：CreativeAPI 的写操作是**带 revision 追踪且可 undo 的**（面向用户）。DataAPI 的写操作**不做 revision 追踪**（由调用方自行管理一致性，例如 ModelingSession 原子提交）。

### 1.6 这如何解决那 18 个绕过点

| 当前绕过点                                                               | Dual API 解决方式                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `render_frame_internal()` → `ecs_world_mut()` → `extract_render_world()` | 调用 `DataAccess::extract_render_world()`                                                 |
| `export_glb()` → `ecs_world_mut()` → component 查询                      | 调用 `DataAccess::serialize_entities()` 或导出专用 typed reader                           |
| `save_project()` / `load_project()` → `ecs_world_mut()`                  | 保存调用 `serialize_entities()`；加载走受控 import/bulk replace 方法                      |
| `apply_scene_command_with_delta()` → `ecs_world_mut()`                   | CommandQueue 调用 typed batch mutation 方法                                               |
| `begin/commit/cancel_modeling_session()` → `ecs_world_mut()`             | ModelingSession 使用 CreativeAPI 管生命周期，使用 `apply_modeling_delta()` 管 vertex 操作 |
| `create_shape()` / `create_text()` / `csg_boolean()` → `ecs_world_mut()` | 程序化生成使用 DataAPI `spawn_procedural()`                                               |
| `current_revision()` → `ecs_world_mut()`                                 | revision 属于 CreativeAPI 范畴（通过 CreativeAPI 暴露）                                   |

引入 Dual API 后：**不再需要任何 `ecs_world_mut()` 逃逸口**。每一个原来的绕过点都有合法的类型化 API。

### 1.7 与计算-渲染拆分的关系

Dual API 模型解释了为什么第二部分的 SceneService 拆分是正确的：

- **之前**（单体 SceneService）：`world` 和 `renderer` 两把 Mutex，CreativeAPI 和 DataAPI 调用都经过同一个 `world` 锁 → 用户编辑与渲染提取争用
- **之后**（拆分 + Dual API）：`SceneComputation` 持有 live World（CreativeAccess + DataAccess），`SceneRenderer` 持有 RenderWorld 快照（不接触 World）。通过快照提取实现时间上的解耦（lock → extract → unlock → renderer 独立操作快照），不是对同一个 World 的真正并发访问

这个拆分在物理上隔离了两个 API 消费者：renderer 操作快照，计算层持有 live World。这样就消除了当前 render 期间阻塞 tick 的 Mutex 争用（renderer 在渲染时不再持有 World 锁）。

### 1.8 实施方式（约 450 行）

> **说明**：第一部分对应分阶段实施计划中的 P0-PR3/PR4a/PR4b/PR5。下面的步骤描述这些 PR 内部的逻辑顺序。

Dual API **不需要**新 crate，也不需要大规模重构。它只是把已有模式形式化：

**步骤 1：为两种访问模式定义 trait**

在 `runtime-scene/src/access.rs`（和对应的 `runtime-puppet` 中）定义两个 trait：

- `CreativeAccess`：面向用户意图的方法（`update_transform`、`set_visible`、`play_animation` 等——即现有 SceneWorld 中代表用户意图的方法）
- `DataAccess`：面向数据操作的方法（`extract_render_world`、`serialize_entities`、`spawn_procedural`、`apply_modeling_delta` 等——覆盖当前 18 个绕过点的类型化替代）
- `RawWorldAccess`（`pub(crate)` 仅迁移期内部使用，标记 `#[deprecated]`）：暴露 `ecs_world_mut_raw()`，迁移完成后删除

> **为什么 trait 不能放进 engine-types**：`CreativeAccess` 使用 `Vec3`/`Quat`（glam），`DataAccess` 使用 `World`（bevy_ecs）。加到 engine-types 会破坏零依赖保证。trait 放在已有这些依赖的 runtime crate 里；如果后续确实需要共享，再引入 `runtime-core`。

> **为什么没有 `ecs_world(&self) -> &World`？** bevy_ecs 的 `World::query()` 需要 `&mut self`。如果未来 bevy_ecs 提供 `&World` 查询支持，可作为非破坏性扩展加回。

**步骤 2：BevySceneWorld 同时实现两个 trait**

现有 SceneWorld 方法归入 `CreativeAccess`；新增的 typed data methods 归入 `DataAccess`。

**步骤 3：SceneService 暴露类型化访问**

SceneService 暴露具体类型（`MutexGuard<'_, BevySceneWorld>`），调用方通过 trait bound 使用。类型系统在这个层级不能阻止误用——约束通过模块可见性 + code review 执行。Controller 调用 CreativeAccess 方法；渲染提取调用 DataAccess 方法。计算-渲染拆分（P0-PR4b）后，SceneComputation 执行 lock → tick → extract → unlock，通过 channel 把快照发给 SceneRenderer。

**步骤 4：消除 `ecs_world_mut()` 逃逸口**

把所有 18 个绕过点替换成类型化 DataAPI 调用。BevySceneWorld 上公开的 `ecs_world_mut()` 将变得不再必要——DataAccess trait 以显式意图提供同样的能力。

### 1.9 Dual API 设计决策

| 决策                                                   | 理由                                                                                                                                                                          | 备选方案                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| trait 放在 runtime crate，而不是 engine-types          | trait 使用 Vec3/Quat（glam）+ World（bevy_ecs）；把它们加到 engine-types 会破坏零依赖保证。runtime crate 已经有这些依赖。engine-kernel 依赖 runtime，因此能直接使用这些 trait | 放在 engine-types（需要 glam+bevy_ecs）；放在 engine-kernel（runtime 无法实现，会形成循环依赖）；新建 runtime-core crate（P0 不需要） |
| 使用两个 trait，而不是一个                             | 强迫调用方声明意图（creative vs data）；便于做权限控制                                                                                                                        | 一个包含所有方法的 trait（当前做法——没有职责分离）                                                                                    |
| DataAccess 暴露 typed methods，而不是公开 `&mut World` | 公开 `&mut World` 只是重命名 `ecs_world_mut()`，不能真正消除逃逸口；typed methods 能把渲染提取、序列化、程序化生成和建模变更收敛到可审计入口                                  | 只暴露 `&mut World`（约束无效）；为每个具体调用点都发明细方法（方法爆炸，P0 只覆盖已知绕过类别）                                      |
| 通过快照并发，而不是 RwLock                            | `extract_render_world` 已经存在；快照能在不改 ECS 内部的情况下解耦 tick/render                                                                                                | 给 World 加 RwLock（bevy_ecs 不为此设计）；真正并发查询（需要改 bevy_ecs）                                                            |
| CreativeAccess 带 revision 语义                        | 面向用户的操作必须记录，以支持 undo/协作                                                                                                                                      | 所有操作都记录 revision（渲染提取不需要 undo）                                                                                        |
| DataAccess 的写操作不带 revision                       | 管线/子系统写入是由调用方管理的原子批次（例如 ModelingSession）                                                                                                               | 所有写入都加 revision（对渲染提取来说是多余开销）                                                                                     |
| 在 Service 层强制权限矩阵                              | controller 只拿到 `creative()` handle；renderer 只拿到 RenderWorld 快照（根本不接触 World）                                                                                   | 在 trait 层强制（对需要同时使用两者的领域子系统过于僵硬）                                                                             |

### 1.10 Dual API 验证

**行为验证**：

- SceneService 中所有 18 个 `ecs_world_mut()` 调用点都迁移到类型化 DataAPI 调用
- ModelingSession 正确使用两个 API（CreativeAccess 管生命周期，DataAccess 管 vertex 操作）
- `cargo test`（engine-kernel）通过；没有行为变化
- Puppet 对应实现也迁移到同样的 Dual API 模式

**强制力验证**（补偿 P0 阶段类型系统无法完全阻止误用的弱点）：

- controller（host-api）模块不导入 `DataAccess` trait——通过 `grep -r "use.*DataAccess" packages/neko-engine/packages/host-api/` 验证为零命中
- SceneRenderer 模块不导入 `World` 或 `DataAccess`——只操作 `RenderWorld` 快照。通过 `grep -r "use.*\(World\|DataAccess\)" engine-kernel/src/gpu/scene_renderer/` 验证
- `ecs_world_mut()` 方法签名降级为 `pub(crate)` 并标记 `#[deprecated(since = "P0", note = "Use DataAccess typed methods")]`——新调用方在编译时收到 warning
- CI 中添加 `grep` 门禁脚本：若 host-api 中出现 `DataAccess` 导入，或 renderer 中出现 `World` 导入，CI 失败。这是 P0 对编译器级强制的低成本替代
- 若 P1 期间出现新的绕过点（新 controller 直接导入 DataAccess），升级到 P2 方案（`runtime-core` crate 隔离）

---

## 第二部分：Scene 计算-渲染分离

### 2.1 Scene 耦合点

**CP-1：SceneService 混合了计算和渲染**

```
SceneService {
    world: Mutex<BevySceneWorld>,         // 计算
    renderer: Option<Mutex<PbrRenderer>>, // 渲染（紧耦合）
    asset_cache: Option<Mutex<AssetCache>>,
    gpu_ctx: Option<Arc<GpuContext>>,
}
```

`render_frame()` 会依次锁住 `world` 和 `renderer`，因此计算和渲染不能独立推进。`extract_render_world()` 函数已经存在，它提供了 ECS → RenderWorld 的单向快照，是拆分的基础；但 SceneService 尚未利用它解耦这两个职责。

**CP-3：Scene 输入与 WebSocket handler 紧耦合**

`scene_control.rs` 直接在 WebSocket handler 中校验 seq + revision，把传输关注点（WebSocket framing）和领域关注点（命令校验与分发）混在一起。command envelope 格式本身是合理的，但校验逻辑应该位于计算层。

**CP-5：约 600 行重复代码**

| 模块                     | runtime-scene                  | runtime-puppet              | 重复度      |
| ------------------------ | ------------------------------ | --------------------------- | ----------- |
| hierarchy.rs             | Parent/Children components     | Parent/Children components  | 约 90% 相同 |
| animation_blend.rs       | SceneBlendLayer/SceneBlendTree | BlendLayer/BlendTree        | 约 90% 相同 |
| transform_propagation.rs | propagate_scene_transforms     | propagate_puppet_transforms | 约 85% 相同 |

这些重复已在 `adr-2d3d-unified-engine.md` 中识别；shared-core 抽取属于那份 ADR 的范围，不属于本 ADR。这里仅为完整性列出。

### 2.2 SceneService 分离

#### 分离：SceneService → SceneComputation + SceneRenderer

- **之前**（耦合）：`SceneService` 的 `render_frame()` 依次锁住 `world` 和 `renderer`，计算和渲染不能独立推进
- **之后**（分离）：`SceneComputation`（持有 `world`，提供 `tick()` + `extract()`）和 `SceneRenderer`（持有 `PbrRenderer`，接收 `RenderWorld` 快照做渲染）。`SceneRenderer` 不锁 `world`；`extract_render_world()` 函数已经存在，它提供 ECS → RenderWorld 的单向快照

**收益**：计算和渲染可以按不同节奏运行。编辑器可以以 60fps tick，而导出以电影级质量渲染，不阻塞编辑器。

#### 保持耦合：ECS Core（runtime-scene、runtime-puppet）

ECS World 类型（BevySceneWorld、BevyPuppetWorld）应该保持为内聚单元。用 OOP trait shell（SceneWorld/PuppetWorld，约 25-30 个方法）包装 `bevy_ecs::World` 是正确模式：它提供稳定 API 面，同时允许 ECS 内部演进。进一步拆分 ECS World 会割裂 entity-component 模型。

#### 保持耦合：Controller → Service 委托

host-api controller（`SceneController`、`PuppetController`）应继续委托给 service。继续拆分 controller 只会割裂 action routing，没有收益；controller 已经是很薄的分发层。

#### 保持耦合：neko-live renderer（下游消费者）

neko-live 应该消费来自 SceneRenderer 和 PuppetRenderer 的 `VideoGpuFrame`，而不是拥有自己的 renderer。这与 `adr-device-management.md` 中的 neko-live 瘦身方向一致：neko-live 成为 scene compositor，而不是 renderer。

### 2.3 channel 语义

- 实时预览使用 `tokio::sync::watch<RenderWorld>`：最新快照获胜，renderer 慢于 tick 时允许跳帧，保证编辑交互不被旧快照队列拖慢。
- 导出使用 `tokio::sync::mpsc` 或 `crossbeam_channel` 的 bounded(1) 队列：导出需要帧序列完整性和背压，producer 等待 consumer 消费。
- watch payload 使用 `{ generation: u64, render_world: RenderWorld }`。SceneComputation 只在快照语义变化时递增 generation；SceneRenderer 记录上次渲染 generation，避免 scene 暂停或未变化时重复渲染同一快照。

### 2.4 目标三层架构（Scene 侧）

```
┌─────────────────────────────────────────────────────┐
│                   输入层                              │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ SceneCommandRouter   │  │ PuppetCommandRouter   │  │
│  │ (WS + seq/revision)  │  │ (WS + seq/revision)   │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  │
│             │ CommandEnvelope          │               │
└─────────────┼──────────────────────────┼──────────────┘
              ▼                          ▼
┌─────────────────────────────────────────────────────┐
│                计算层                                │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ SceneComputation     │  │ PuppetComputation     │  │
│  │ (BevySceneWorld)     │  │ (BevyPuppetWorld)     │  │
│  │                      │  │                        │  │
│  │ tick() → extract()   │  │ tick() → extract()     │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  │
│             │ RenderWorld              │ DeformedMeshes│
└─────────────┼──────────────────────────┼──────────────┘
              ▼                          ▼
┌─────────────────────────────────────────────────────┐
│                  渲染层                              │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ SceneRenderer        │  │ PuppetRenderer        │  │
│  │ (PbrRenderer, wgpu)  │  │ (SpriteBatch, wgpu)   │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  │
│             │ VideoGpuFrame            │ VideoGpuFrame │
│             ▼                          ▼               │
│  ┌─────────────────────────────────────────────────┐  │
│  │              PipelineSink（前置 ADR）              │  │
│  │  StreamSink | MuxerSink | SnapshotSink        │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 2.5 Scene 设计决策

| 决策                                            | 理由                                                                                                     | 备选方案                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 提取 RenderWorld 快照，而不是共享 Mutex         | 解耦 tick rate 和 render rate；`extract_render_world()` 已经存在                                         | 保留共享 Mutex（当前做法——render 时阻塞 computation） |
| 将 puppet 升级为 WebSocket command              | 与 scene 在 ordering + revision validation 上对齐；支持 undo log                                         | 保留 REST（无 ordering、无冲突检测）                  |
| Puppet WebSocket 复用 SceneCommandEnvelope 模式 | 控制平面一致；共享校验逻辑                                                                               | 新协议（碎片化、重复实现）                            |
| Canvas2D 仅作为 legacy/debug                    | WebSocket 传递的 sprite data 仍可用于检查，但不是生产渲染 fallback                                       | 完全移除 Canvas2D                                     |
| neko-live 消费 VideoGpuFrame                    | 与 adr-device-management.md 的 neko-live 瘦身方向一致；live 成为 compositor，而不是 renderer             | neko-live 拥有自己的 renderer（重复）                 |

### 2.6 Scene 新增能力

| 能力                   | 之前                         | 之后                                                                        |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| 独立 tick/render rate  | Scene 被 renderer Mutex 阻塞 | 提取快照 → 独立渲染                                                         |
| 并发 scene 编辑 + 导出 | Mutex 争用                   | 基于快照分离                                                                |
| 跨领域渲染测试         | 不可测（耦合）               | SceneRenderer/PuppetRenderer 可用 synthetic RenderWorld/DeformedMeshes 测试 |
| neko-live GPU 合成     | Webview 捕获（有损）         | 引擎侧 VideoGpuFrame 合成                                                   |

---

## 第三部分：Dual API Trait 详细设计

### 3.1 crate 放置位置

trait 分别放在 `runtime-scene` 和 `runtime-puppet`（这两个 crate 已经依赖 `bevy_ecs` + `glam`）。不要放在 `engine-types`：因为 `CreativeAccess` 使用 `Vec3`/`Quat`（glam），`DataAccess` 使用 `World`（bevy_ecs），把这些依赖加到 `engine-types` 会破坏它的零依赖保证。`engine-kernel` 已经依赖两个 runtime crate，因此可以直接使用这些 trait。

### 3.2 访问器模式

SceneService 暴露 `MutexGuard<'_, BevySceneWorld>`（具体类型），而不是 `MutexGuard<dyn Trait>`（Rust 中不借助 `MutexGuard::map` 或装箱无法直接表达）。调用方通过 trait 方法语法使用这个 guard。约束通过架构方式执行（模块可见性 + code review），不是在 Service 边界由编译器强制。

### 3.3 DataAccess 设计 —— 处理 `extract_render_world` 的可变性

当前 `extract_render_world()` 接收 `&mut World`，因为 `bevy_ecs::World::query()` 需要 `&mut self`（用于 ECS archetype tracking）。这意味着"只读提取"在 ECS 层仍需要独占访问。Dual API 的目标不是把 `ecs_world_mut()` 改个名字，而是把常见数据访问收敛到 typed methods；原始 `&mut World` 只作为 `pub(crate)` 级别的受控 escape hatch：

`DataAccess` trait 提供以下 typed methods（调用方拿不到裸 `&mut World`）：

| 方法 | 用途 | 对应的原逃逸点 |
|------|------|---------------|
| `extract_render_world(params)` | 渲染提取 | `render_frame_internal()` 中的 `ecs_world_mut()` |
| `serialize_entities(filter)` | 按过滤条件导出 entity/component DTO | `export_glb()` / `save_project()` |
| `spawn_procedural(spec)` | 以受控 bundle 描述创建实体 | `create_shape()` / `csg_boolean()` |
| `apply_modeling_delta(delta)` | 建模子系统的受控批量变更入口 | `begin/commit_modeling_session()` |

`RawWorldAccess`（`pub(crate)`，标记 `#[deprecated]`）仅迁移期内部使用，不对 host-api / controller / renderer 暴露。

### 3.4 并发模型

CreativeAPI 和 DataAPI 不能在同一个 `Mutex<BevySceneWorld>` 上真正并发运行。这里的解耦收益是**时间上的**：计算-渲染拆分（PR4）在短暂加锁期间提取 `RenderWorld` 快照，然后释放 Mutex。renderer 独立处理快照。这是对现有 `extract_render_world()` 模式的正式化：

```
tick() {
    let mut world = self.world.lock();  // 短暂独占访问
    world.tick_systems();
    let snapshot = world.extract_render_world(params)?;
    drop(world);  // Mutex 已释放，计算可继续
    self.render_world_tx.send(snapshot);  // renderer 异步消费
}
```

真正的并发读访问需要迁移到 `RwLock`，并把 `bevy_ecs` 查询重构为使用 `&World`（可通过 `QueryState::get()` 实现，但需要预构建 query state）。这是 P3 优化，不是 P0 要求。

### 3.5 关联 DTO 放置

`ExtractParams`、`EntityFilter`、`SerializedScene`、`ProceduralSpec`、`ModelingDelta` 等 DataAccess 关联 DTO 全部定义在对应 runtime crate 的 `access.rs` 中，与 trait 同文件。它们可以使用 runtime-scene/runtime-puppet 已有类型（如 `RenderWorld`、`EntityId`、内部 component DTO），不新增 `engine-types` 依赖；如果需要跨 IPC 暴露，再单独设计 primitive DTO 投影。

---

## 分阶段实施计划

**优先级轴线**：Dual API Trait → SceneComputation 提取 → SceneRenderer 独立 → 消除 ecs_world_mut

### P0-PR3：Dual API Trait 定义 —— CreativeAccess + DataAccess（约 120 行）

**变更文件**：

- 新增：`runtime-scene/src/access.rs` —— `CreativeAccess` + `DataAccess` trait 定义
- 修改：`runtime-scene/src/world.rs` —— `BevySceneWorld` 实现两个 trait
- 新增：`runtime-puppet/src/access.rs` —— puppet 领域的并行 trait 定义
- 修改：`runtime-puppet/src/world.rs` —— `BevyPuppetWorld` 实现两个 trait

**行为不变量**：外部 API 不变。DataAccess 将现有绕过点提升为类型化方法；原始 World 访问只保留为 crate 内部迁移工具。

**依赖**：无。PR3 和 PR4a 可与 PipelineSink PR 并行推进——trait 定义和 SceneComputation 提取不涉及 `PipelineOutput` 类型。PR4b（SceneRenderer）依赖 P0a 的 `PipelineOutput`/`VideoOutput::GpuFrame` 类型定义（SceneRenderer 产出 `VideoGpuFrame` 并由 PipelineSink 消费）。

### P0-PR4a：SceneComputation 提取 + SceneService facade（约 220 行）

**变更文件**：

- 新增：`engine-kernel/src/services/impls/scene_computation.rs` —— `SceneComputation`（tick + extract；持有 `Mutex<BevySceneWorld>`，暴露 `creative()` + `data()`）
- 修改：`engine-kernel/src/services/impls/scene.rs` —— `SceneService` 变成轻量 facade；委托给 computation + renderer

**行为不变量**：scene controller 行为不变；只是把 live World 持有者迁移到 SceneComputation。

**范围边界**：SceneService facade 必须保留所有现有 public 方法签名，17+ 个 controller 委托方法在本 PR 中不改变调用方式，只把内部实现转发到 SceneComputation。这样 PR4a 主要是结构迁移和内部委托，约 220 行才可控；如果同时修改 controller 调用面，应拆出额外 PR，不能塞进 PR4a。

### P0-PR4b：SceneRenderer 独立 + channel 接线（约 260 行）

**变更文件**：

- 新增：`engine-kernel/src/services/impls/scene_renderer.rs` —— `SceneRenderer`（从 `RenderWorld` 快照渲染；不持有 World 引用或 DataAccess handle）
- 修改：`host-http/src/routes/scene_stream.rs` —— extract → render → PipelineSink 流程

**channel 语义**：

- 实时预览使用 `tokio::sync::watch<RenderWorld>`：最新快照获胜，renderer 慢于 tick 时允许跳帧，保证编辑交互不被旧快照队列拖慢。
- 导出使用 `tokio::sync::mpsc` 或 `crossbeam_channel` 的 bounded(1) 队列：导出需要帧序列完整性和背压，producer 等待 consumer 消费。
- watch payload 使用 `{ generation: u64, render_world: RenderWorld }`。SceneComputation 只在快照语义变化时递增 generation；SceneRenderer 记录上次渲染 generation，避免 scene 暂停或未变化时重复渲染同一快照。

**关键约束**：P0-PR3（Dual API traits）必须先落地。SceneRenderer 通过 channel 接收 `RenderWorld` 快照，永不接触 live World。SceneComputation 持有 Mutex，并执行短暂 lock → tick → extract → unlock。

**行为不变量**：scene 流输出视觉一致。只改变内部路由。

**scenes:stream 对接点**：此 PR 打通 `scenes:stream` 的目标实现路径：`SceneComputation.extract_render_world()` → `SceneRenderer.render()` → `VideoOutput::GpuFrame` → `StreamSink`。为降低 P0 风险，具体 action 接线和 WYSIWYG 长期目标对齐可放到 P1/P2；本 PR 只保证独立 SceneRenderer 与 PipelineSink 之间的架构路径成立。

### P0-PR5：消除 `ecs_world_mut()` 逃逸口（约 80 行）

**变更文件**：

- 修改：`engine-kernel/src/services/impls/scene.rs` —— 18 个 `ecs_world_mut()` 调用点全部迁移到类型化 DataAccess 调用
- 修改：`runtime-scene/src/world.rs` —— 从公开 API 中移除 `ecs_world_mut()`；补齐 `extract_render_world()`、`serialize_entities()`、`spawn_procedural()`、`apply_modeling_delta()` 等 typed DataAccess 方法；原始 `ecs_world_mut_raw()` 仅保留为 `pub(crate)` + `#[deprecated]`

**验证**：controller 只在 CreativeAccess 可见的情况下通过编译；SceneRenderer 不导入 World/DataAccess（只操作 RenderWorld 快照）。

### PR 交叉引用（来自 umbrella 文档第八部分）

| 本文档范围                            | umbrella 主计划位置               | 理由                                                                                          |
| ------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| SceneService Dual API + 计算-渲染拆分 | P0-PR3、P0-PR4a、P0-PR4b、P0-PR5 | Dual API trait 必须先于拆分落地；拆分分成 computation/facade 与 renderer/channel 两步降低风险 |

---

## 关键设计决策

| 决策                                                         | 理由                                                                                                                    | 备选方案                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Dual API（CreativeAccess + DataAccess）                      | 形式化两种合法访问模式；消除 18 个 `ecs_world_mut()` 逃逸口；可在 Service 层做权限控制                                  | 一个包含全部方法的 trait（没有职责分离）；按场景拆成大量 typed query 方法（方法爆炸） |
| trait 放在 runtime-scene/runtime-puppet，而不是 engine-types | trait 使用 Vec3/Quat（glam）+ World（bevy_ecs）；把它们加进 engine-types 会破坏零依赖保证。runtime crate 已经有这些依赖 | 放在 engine-types（需要 glam+bevy_ecs）；新建 runtime-core crate（P0 不需要）         |
| 先做 Dual API，再做计算-渲染拆分                             | 拆分会物理隔离两个 API 消费者；先定义 API 才能保证拆分边界正确                                                          | 先拆分再补 API（有接口边界错误风险）                                                  |
| 通过 RenderWorld 快照并发，而不是 RwLock                     | bevy_ecs 的 `World::query()` 需要 `&mut`；快照提取已存在；无需改 ECS 就能解耦 tick/render                               | RwLock（bevy_ecs 不为此设计）；真正并发查询（需要修改 bevy_ecs）                      |
| 使用两个 trait，而不是一个                                   | 强迫调用方声明意图（creative vs data）；便于做权限控制                                                                   | 一个包含所有方法的 trait（当前做法——没有职责分离）                                    |
| DataAccess 暴露 typed methods，而不是公开 `&mut World`       | 公开 `&mut World` 只是重命名 `ecs_world_mut()`，不能真正消除逃逸口；typed methods 能收敛到可审计入口                    | 只暴露 `&mut World`（约束无效）；为每个具体调用点都发明细方法（方法爆炸）             |
| CreativeAccess 带 revision 语义                              | 面向用户的操作必须记录，以支持 undo/协作                                                                                | 所有操作都记录 revision（渲染提取不需要 undo）                                        |
| DataAccess 的写操作不带 revision                             | 管线/子系统写入是由调用方管理的原子批次（例如 ModelingSession）                                                          | 所有写入都加 revision（对渲染提取来说是多余开销）                                     |
| 在 Service 层强制权限矩阵                                    | controller 只拿到 `creative()` handle；renderer 只拿到 RenderWorld 快照（根本不接触 World）                              | 在 trait 层强制（对需要同时使用两者的领域子系统过于僵硬）                              |
| 提取 RenderWorld 快照，而不是共享 Mutex                      | 解耦 tick rate 和 render rate；`extract_render_world()` 已经存在                                                         | 保留共享 Mutex（当前做法——render 时阻塞 computation）                                 |
| 将 puppet 升级为 WebSocket command                           | 与 scene 在 ordering + revision validation 上对齐；支持 undo log                                                         | 保留 REST（无 ordering、无冲突检测）                                                  |
| Puppet WebSocket 复用 SceneCommandEnvelope 模式              | 控制平面一致；共享校验逻辑                                                                                               | 新协议（碎片化、重复实现）                                                            |
| neko-live 消费 VideoGpuFrame                                 | 与 adr-device-management.md 的 neko-live 瘦身方向一致；live 成为 compositor，而不是 renderer                             | neko-live 拥有自己的 renderer（重复）                                                 |

---

## 风险与缓解

| 风险                             | 影响                                  | 缓解措施                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GpuEffect trait 开销相对直接调用 | vtable 分发每帧每个 effect 约增加 1ns | 相比 16ms 帧预算可以忽略；前后测量即可                                                                                                                            |
| PipelineSink 同步 submit 阻塞    | 慢 sink 阻塞渲染循环                  | StreamSink 使用 `broadcast::Sender::send()`（落后 receiver 会被丢弃，不是 frame 被丢弃——符合现有模式）；MuxerSink 入队到有界 channel（通过 channel 容量施加背压） |

---

## 验证

**P0 Dual API + Scene 拆分（PR3/PR4a/PR4b/PR5）**：

- scene 流输出在重构前后视觉一致
- SceneService 中 18 个 `ecs_world_mut()` 调用点全部迁移到类型化 DataAccess 调用
- controller（host-api）只在 CreativeAccess 可见时仍可编译通过（不导入 DataAccess）
- SceneRenderer 不导入 World/DataAccess（只操作 RenderWorld 快照）
- `extract_render_world()` 产出的 RenderWorld 合法，并与 simulation state 匹配
- 并发 tick + render：tick 继续以目标速率运行，而 render 以独立节奏运行
- 18 个 `ecs_world_mut()` 点全部消除；typed DataAccess methods 通过模块可见性与编译约束限制调用面
- ModelingSession 正确使用两个 API（CreativeAccess 管生命周期，DataAccess 管 vertex 操作）
- Puppet 对应实现也迁移到同样的 Dual API 模式
- `cargo test`（engine-kernel）通过；`pnpm test`（neko-cut）通过
- 性能：帧渲染时间在基线 5% 以内

---

## 开放问题（在实施前需要解决）

| #   | 问题                                                                                                                                                                          | 选项                                                                                                                                                                             | 推荐                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 2   | **Dual API 的强制级别**：编译期（分离 crate 边界）还是架构约定（code review + 模块可见性）？                                                                                  | A）trait 放在独立 crate，调用方只导入需要的 trait B）trait 放在 runtime crate，通过 typed DataAccess methods + `ecs_world_mut_raw()` 的 `pub(crate)` 可见性 + code review 来约束 | P0 选 B —— 编译器强制需要一个尚不存在的 `runtime-core` crate。若后续绕过点再次出现，可在 P2 回看 |
| 3   | **共享 trait crate（runtime-core）**：现在引入还是延后？                                                                                                                      | A）现在引入——可在 scene/puppet 间实现编译器级别的分离 B）延后——P0 作用域已经很大；每个 runtime crate 内放 trait 已足够                                                           | B —— 延后到 P2。若 puppet 和 scene 的 trait 分化明显，共享 crate 只会增加耦合，没有收益          |
| 5   | **DataAccess 是否需要更强编译期隔离**：仅靠 typed methods + `pub(crate)` 是否足够？                                                                                           | A）保持 P0 方案：typed methods + RawWorldAccess deprecated/pub(crate) B）P2 引入 runtime-core 和分离 guard 类型，让 controller 根本无法命名 DataAccess                           | A 用于 P0；若逃逸口重新出现，P2 升级到 B                                                         |

---

## 与其他 ADR 的关系

| ADR                                              | 关系                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `adr-engine-interface-pipeline-decoupling.md`    | 父文档（umbrella ADR），本文档从其 Part IX + Part VIII Scene 部分提取                                                  |
| `adr-engine-pipeline-sink.md`                    | 前置条件。SceneRenderer 产出 VideoGpuFrame → PipelineSink                                                             |
| `adr-2d3d-unified-engine.md`                     | shared-core 抽取（hierarchy/animation_blend/transform）属于该 ADR 范围。本文档处理与 shared-core 正交的计算-渲染分离 |
| `adr-device-management.md`                       | neko-live 瘦身（compositor 而非 renderer）依赖本文档中 SceneRenderer/PuppetRenderer 产出 VideoGpuFrame                |
| `adr-four-layer-contract.md`                     | 四层契约模型；Dual API 对应意图层（CreativeAccess）与数据层（DataAccess）的分离                                        |
| 第三部分（PipelineSink）                         | PuppetRenderer 和 SceneRenderer 都产出 VideoGpuFrame，由 PipelineSink adapter 消费                                     |
| 第四部分（GPU Budget）                           | SceneRenderer/PuppetRenderer 的 GPU 使用由 GpuBudgetController 管理                                                    |
| 第五部分（Effect Registry）                      | Scene/Puppet effect 如果 GPU 加速，可注册为 GpuEffect                                                                  |
