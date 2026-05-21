# ADR Analysis: 2D / 3D Unified Engine — 共壳分核架构现状审计

## 状态

Analysis (2026-05-20, revised 2026-05-21 after code review)

## 实施跟踪

- OpenSpec change: `implement-2d3d-unified-engine-foundation`
- 本次 review 后，提案范围应从“五项均待实现”收窄为“两项真实缺口 + 三项审计确认已完成”。
- 仍需实现：
  - 动画 DTO wrapper 去重：`engine-types/src/animation.rs` 已有共享基类与单位转换 API，但 runtime-scene / runtime-puppet 仍保留约 366 行 newtype wrapper 样板。
  - Engine tools domain 标注与 scene/puppet tools 注册：TS domain metadata、Tool 字段与 registry 投影已就绪，但 engine `AgentCapabilityProvider` 尚未标注 domain，也未注册 scene/puppet agent tools。
- 已审计确认完成：
  - Transform propagation 算法核已在 `engine-types/src/transform_propagation.rs` 实现，并由 scene / puppet runtime 调用。
  - PuppetService 已有 `PuppetComputation`，提供 `creative<R>()` / `data<R>()` / `lock_world()` 闭包边界。
  - `GpuExportPipeline` 已支持 Scene3D + Puppet 共渲染：collect → render → `GpuLayer` → composite 全链路已接通。
- 非目标：不合并 Skeleton / ParameterBinding / IK / mesh deformation 数据模型，不提前创建宽泛 `ArtifactSnapshot` / FeedbackBus / ControlDecision，不把 DomainRouter 绑定到 Bevy/ECS world 或 runtime-scene/runtime-puppet crate。

## 关联 ADR

- 审计对象: [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md)
- 上层依赖: [adr-four-layer-contract.md](./adr-four-layer-contract.md)

## 目的

对共壳分核架构 ADR 进行现状审计：验证 ADR 声称的镜像重复是否属实、量化重复规模、区分“已完成能力”和“仍需实施缺口”，并据此修订 OpenSpec 提案范围。

## 1. 镜像重复实证

### 1.1 BlendLayer / CrossfadeRequest

共享基类已存在于 `engine-types/src/animation.rs`：

```rust
pub struct AnimationBlendLayer {
    pub clip_index: usize,
    pub elapsed: AnimationDuration,
    pub weight: f32,
    pub looping: bool,
}

pub struct AnimationCrossfadeRequest {
    pub target_clip_index: usize,
    pub fade_duration: AnimationDuration,
    pub fade_elapsed: AnimationDuration,
    pub loop_anim: bool,
}
```

`AnimationDuration` 已提供 `from_unit()` / `as_unit()`，并有 `AnimationDurationUnit` 支持 seconds / milliseconds。runtime 侧仍有两份 newtype wrapper：

| 差异点 | runtime-puppet | runtime-scene |
|---|---|---|
| Layer wrapper | `BlendLayer(AnimationBlendLayer)` | `SceneBlendLayer(AnimationBlendLayer)` |
| Info wrapper | `BlendLayerInfo(AnimationBlendLayerInfo)` | `SceneBlendLayerInfo(AnimationBlendLayerInfo)` |
| Crossfade wrapper | `CrossfadeRequest(AnimationCrossfadeRequest)` | `SceneCrossfadeRequest(AnimationCrossfadeRequest)` |
| 时间 API | `_ms` / `Milliseconds` | `_seconds` / `Seconds` |
| serde elapsed 字段 | `elapsed_ms` | `elapsed` |
| 专属类型 | 无 | `SceneAnimationPlaybackState`，3D 专属，不应合并 |

**结论**：共享 DTO 与单位转换能力已经存在，但 runtime wrapper 仍重复，约 182 / 184 行，总计约 366 行纯样板。真正需要做的是把 wrapper 模式收敛到 `engine-types` 的宏或泛型适配器，保留各 runtime 的命名、时间单位语义和 serde 字段名。

### 1.2 Transform Propagation

共享算法核已经存在：

```rust
pub fn propagate_transform_hierarchy<Entity, Matrix, Children, Local, Write>(
    roots: impl IntoIterator<Item = Entity>,
    identity: Matrix,
    children: Children,
    local: Local,
    write: Write,
)
```

`runtime-scene/src/systems.rs` 和 `runtime-puppet/src/systems.rs` 都调用 `propagate_transform_hierarchy()`，各自只提供 root query、children/local lookup、matrix conversion 和 global write-back 闭包。

剩余重复约 70 行，主要是 Bevy ECS query、组件插入和 borrow 适配代码，属于 runtime-specific 壳。继续泛型化这部分收益有限，反而会把 system 签名复杂化。

**结论**：ADR analysis 中“抽 Transform propagation 算法核”已经完成。后续只需保留架构测试与黄金用例，不应继续作为 P1 实现项。

### 1.3 服务层 Computation 模式

PuppetService 已经有 `PuppetComputation`：

| 差异 | PuppetService | SceneService | 影响 |
|---|---|---|---|
| World 访问 | `PuppetComputation::creative()` / `data()` / `lock_world()` | `SceneComputation::creative()` / `data()` | 主体模式已对齐 |
| 闭包返回类型 | closure 返回 `Result<R>` | closure 返回 `R`，外层包装 `Ok` | 风格差异 |
| 命令状态位置 | `PuppetCommandState` 单独持有 | `SceneCommandQueue` 在 computation 内 | 锁粒度差异 |
| Revision 跟踪 | service struct 字段 | ECS resource | 领域实现差异 |

**结论**：PuppetService computation boundary 的结构性工作已完成。残留差异是风格和锁粒度选择，不是本提案的核心缺口。

## 2. 四层映射评估

共壳分核架构建立在四层契约（adr-four-layer-contract.md）之上。以下编号遵循正式定义：Layer 1 = Intent，Layer 2 = Orchestration，Layer 3 = Data/Execution，Layer 4 = Control。

### Layer 1 Intent — 共享，但 domain 仍应只是数据

Intent 层可以携带 domain 数据字段，但不能直接知道 Tool / Service / ECS world。Rust `ActionRequest` 当前没有 domain hint 字段；这属于后续完整 DomainRouter / execution plan 设计，不应阻塞本轮 engine tool metadata 收敛。

### Layer 2 Orchestration — TS metadata 基础已就绪，注册缺口仍在

已有：

- `CreativeDomainMetadata` 和 `CreativeDomainId`
- `Tool.domain?: CreativeDomainMetadata`
- LLM-facing `ToolDefinition.domain`
- operation adapter domain 到 creative domain 的映射
- tool registry 投影测试

仍缺：

- engine `AgentCapabilityProvider` 中现有工具未标注 domain；
- scene / puppet 操作工具未注册为 agent tools；
- Agent 侧尚未用 domain 做路由决策。

本轮应先完成 metadata 标注和 scene/puppet tools 注册。真正的 DomainRouter、Rust request domain hint、Agent routing policy 进入后续 change。

### Layer 3 Data/Execution — trait 共享，数据分核

共享对象：Blend / Crossfade 纯 DTO、AnimationDuration、Transform propagation 算法核。
分核对象：Skeleton vs ParameterBinding、IK vs 参数语义、GPU skinning vs CPU 顶点位移。

**当前真实缺口**：动画 wrapper 样板仍在 runtime 中重复。Scene 专属的 `SceneAnimationPlaybackState` 不属于 wrapper，不应合并。

### Layer 4 Control — 延后

`ArtifactSnapshot`、FeedbackBus、ControlDecision 仍应延后到 Control 层消费者明确之后。当前基础 change 不定义宽泛 snapshot/diff trait。

## 3. Layer 3 不统一的根因

3D 和 2D 是两种本质不同的动画范式：

| 维度 | 3D (Skeleton) | 2D (Puppet) |
|------|---------------|-------------|
| 驱动量 | 关节变换矩阵 | 参数曲线 (X, Y) ∈ [-1,1]² |
| 形变方式 | Linear Blend Skinning (GPU) | 顶点位移插值 (CPU) |
| IK | FABRIK / CCD / TwoBone | 不存在（参数即语义） |
| 刚体单位 | Bone（父子层次树） | Mesh + Drawable |
| 资产格式 | .nkm (glTF-based) | .nkpup (MOC3-based) |
| GPU 管线 | Stereo + Skinning | MOC3 渲染 / SpriteBatch |

正确原则仍然是：抽象到 trait / adapter，不抽象到统一数据 type。算法形状同构的部分可共享；领域数据保持分核。

## 4. 2D + 3D 共渲染输出

最新代码审计显示：Scene3D + Puppet GPU export 共渲染已经实现。

| 维度 | 代码现状 | 结论 |
|------|------|------|
| 服务端口 | `RenderServicePorts` 持有 scene 和 puppet render port | 已完成 |
| Puppet 收集 | `collect_visible_puppet()` 已存在 | 已完成 |
| Puppet 渲染适配 | `render_puppet_to_gpu_layer()` 已存在 | 已完成 |
| 合成器 | 继续复用 `TextureCompositor`，输入为通用 `GpuLayer` | 已完成 |
| Facade 注入 | `facade.rs` 注入 scene / puppet services 到 export service | 已完成 |
| backend 注入 | `backend.rs` 已从 `None` 修复为 render services clone/into | 已完成 |
| 测试 | 混合 Scene3D + Puppet timeline 合成已有覆盖 | 已完成 |

**结论**：原文“导出管线单域、无 Puppet 分支”的描述已过时。该项应在 OpenSpec 中标记为“审计确认已完成”，不再作为待实现范围。

## 5. 五层分析

### 5.1 职责层

本轮职责应聚焦在两个边界：

- `engine-types`：沉淀动画 wrapper 的单位与 serde 适配模式，runtime 保留领域命名。
- Agent capability provider：把已有 engine 能力通过 domain metadata 暴露给 Agent，并注册 scene/puppet tools。

Transform、PuppetService boundary、GPU export 共渲染只保留 guardrail 和审计记录。

### 5.2 依赖层

| crate / package | 职责 | 依赖约束 |
|---|---|---|
| `engine-types` | 纯类型契约、duration、动画 wrapper 适配器、transform propagation 纯算法 | 零 Bevy 依赖 |
| runtime-scene / runtime-puppet | Bevy system 壳、领域组件、领域命名兼容层 | 可依赖 `engine-types` |
| `neko-types` | Tool/domain metadata 类型 | 不依赖 runtime crates |
| `neko-engine` extension | AgentCapabilityProvider 工具注册与 command bridge | 不依赖 React / Webview |

`engine-ecs-core` 不应为纯 DTO 创建；只有未来确实需要 Bevy/ECS trait 或 world handle 时再建。

### 5.3 接口层

- 动画 wrapper：收敛到共享宏或泛型适配器，保留 `elapsed_ms()` / `elapsed_seconds()`、`elapsed_ms` / `elapsed` serde 字段差异。
- Transform propagation：已完成；runtime 壳继续负责 ECS query 和写回。
- Agent tools：现有 engine tools 应声明 normalized domain；新增 scene / puppet tools 应通过 provider 注册，且 domain 投影进入 LLM-facing tool definition。

### 5.4 扩展层

共渲染已接通，后续新域接入重点从 export pipeline 转向 tool/capability 编排：scene、puppet、sketch 等能力应通过统一 metadata 被 Agent 发现，再由后续 DomainRouter 做执行计划选择。

### 5.5 测试层

| 测试类型 | 覆盖目标 |
|---|---|
| 动画 wrapper 兼容 | ms / seconds 双 API、serde 字段、runtime 公共类型名、Scene 专属 playback state 不被合并 |
| Transform propagation 回归 | 保留已完成的 2D/3D 黄金用例与 architecture guard |
| Export co-rendering 回归 | 保留 Scene3D + Puppet mixed timeline coverage |
| Tool domain 投影 | engine provider tools 带 domain，scene / puppet tools 注册后能通过 registry 投影 |

## 6. 修订后的实施范围

| 分类 | 内容 | 建议状态 |
|---|---|---|
| 动画 DTO wrapper 去重 | 消除 runtime-scene / runtime-puppet 约 366 行 wrapper 样板，保留单位 API 与 serde 兼容 | 仍需做 |
| Transform propagation 算法核 | `propagate_transform_hierarchy` 已存在且两 runtime 已调用 | 审计确认已完成 |
| PuppetService computation boundary | `PuppetComputation` + `creative` / `data` 已存在 | 审计确认已完成 |
| Scene3D + Puppet 共渲染 | collect → render → composite 全链路已实现 | 审计确认已完成 |
| 最小 domain routing metadata | TS 类型、Tool 字段、registry 投影已就绪；engine tools 标注与 scene/puppet tools 注册仍缺 | 仍需做 |

### 与原 ADR S1-S4 的对照

| 原 ADR | 修订后 | 变化原因 |
|---|---|---|
| S1: 新建 engine-ecs-core，提取 BlendLayer + Affine + ArtifactSnapshot | 先在 `engine-types` 收敛 wrapper；`engine-ecs-core` 延后 | 纯 DTO 与纯算法不需要 ECS crate |
| S2: runtime 改 impl 删镜像 | 只保留动画 wrapper 去重；transform 算法核已完成 | 避免重复实现已落地功能 |
| S3: DomainRouter | 本轮只做 engine tool domain 标注和 scene/puppet tools 注册 | Router policy 仍需独立设计 |
| S4: IntentDescriptor.domain 推断 | 后续与 DomainRouter / ActionRequest hint 一起做 | 不阻塞 Tool metadata 基础 |
| 未覆盖: Puppet + Scene3D 共渲染 | 标记为已完成并保留回归测试 | 代码已接通 |

## 7. 反模式清单（补充审计）

| ID | 反模式 | 现象 | 当前代码是否存在 |
|---|---|---|---|
| AP-1 | 数据型共享 | 合并 Skeleton + ParameterBinding → 上帝组件 | 否 |
| AP-2 | Domain 在 Intent / Tool 体系中断裂 | metadata 已有但 engine tools 未标注、scene/puppet tools 未注册 | 部分存在 |
| AP-3 | 服务跨域调用 | `ISceneService.adaptFromPuppet(...)` | 否 |
| AP-4 | 导出管线单域 | `GpuExportPipeline` 只处理 Scene3D，忽略 Puppet | 否，已修复 |
| AP-5 | 服务封装不对称 | Scene 有 computation，Puppet 直接操作 Mutex | 结构性问题已修复，仅余风格差异 |
| AP-6 | 共享层拆裂 | engine-types 和 engine-ecs-core 同时承载共享核心类型 | 潜在风险，需继续 guard |
