# ADR：PuppetRenderer + WebSocket 命令协议

- **状态**：提议中
- **日期**：2026-05-13
- **作者**：Claude（架构师）
- **范围**：engine-kernel（gpu/puppet_renderer/）、engine-types、host-http、runtime-puppet
- **父文档**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)
- **前置条件**：
  - P2-PR3（WS 命令协议）：无硬依赖——WS command envelope 是纯控制平面协议，不涉及 GPU 渲染或 PipelineSink。可在 P0 完成后任意时间落地。
  - P2-PR4（PuppetRenderer）：[adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md)（产出 `VideoOutput::GpuFrame` → PipelineSink 消费）+ [adr-engine-gpu-budget](./adr-engine-gpu-budget.md)（GPU 使用受 BudgetController 管理）
  - P3-PR1（H.264 + 导出）：P2-PR4 + StreamSink + MuxerSink

---

## 背景

本文档从 umbrella ADR [adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md) 第八部分提取，聚焦 Puppet 的计算-渲染-IO 分离、GPU 渲染路径建设和控制平面对齐。

### 当前架构对比

| 维度          | runtime-scene（3D）                                     | runtime-puppet（2D）                          |
| ------------- | ------------------------------------------------------- | --------------------------------------------- |
| **计算**      | bevy_ecs World（BevySceneWorld，约 1078 行）            | bevy_ecs World（BevyPuppetWorld，约 1083 行） |
| **渲染**      | PbrRenderer（wgpu，引擎侧 GPU）                         | Canvas2D（webview 侧 CPU）                    |
| **流式输出**  | 通过 StreamSink 输出 H.264（zero-copy GPU）             | 通过 WebSocket 输出 JSON delta（CPU 序列化）  |
| **控制平面**  | WebSocket + SceneCommandEnvelope（seq + revision 校验） | REST fire-and-forget（无 seq、无 ordering）   |
| **导出质量**  | Engine GPU render → GpuExportPipeline                   | 无引擎渲染路径（无法导出）                    |
| **Live 模式** | 引擎捕获 + 推流                                         | Webview 捕获（有损，无法合成）                |

---

## 耦合点

### CP-2：Puppet 没有引擎渲染路径

PuppetService 只包含计算（`world: Mutex<BevyPuppetWorld>`）。渲染完全委托给 webview：JSON vertex data → Canvas2D。这意味着：

- 没有 GPU 加速的 puppet 渲染
- puppet 输出不能通过 GpuExportPipeline 与 timeline 合成
- 无法产生高质量 puppet 导出
- neko-live 必须捕获 webview（有损），而不是捕获引擎输出

### CP-4：Puppet 输入缺少版本控制

Puppet command 通过 REST endpoint 到达，没有 sequence number，也没有 revision 校验。来自多个来源的并发编辑（editor UI + agent + live tracking）没有 ordering 保证，也没有冲突检测。

---

## 设计

### PuppetRenderer（wgpu SpriteBatch）

`PuppetRenderer` 使用 wgpu SpriteBatch 渲染，接收 deformed meshes + texture atlases，产出 `VideoGpuFrame`（与 SceneRenderer 相同类型）。

**收益**：Puppet 输出变成 `VideoGpuFrame`，可通过 GpuExportPipeline 与 timeline 合成。由此支持：

- 高质量 puppet 导出（H.264/ProRes）
- 通过 StreamSink 预览 puppet（与 scene 一致）
- neko-live 在引擎内合成 puppet + scene（无需 webview 捕获）

### Puppet WebSocket Command Protocol

将 puppet 输入从 REST fire-and-forget 升级为带 command envelope 的 WebSocket。`PuppetCommandEnvelope` 包含 `seq`（序列号）+ `revision`（版本校验）+ `PuppetCommand`（具体命令），复用 scene 已有的 `SceneCommandEnvelope` 模式。

**收益**：ordering 保证、冲突检测、undo 支持（command log）。

### 哪些需要分离，哪些保持耦合

#### 分离：新增 PuppetRenderer（wgpu SpriteBatch）

`PuppetRenderer` 使用 wgpu SpriteBatch 渲染，接收 deformed meshes + texture atlases，产出 `VideoGpuFrame`（与 SceneRenderer 相同类型）。

**收益**：Puppet 输出变成 `VideoGpuFrame`，可通过 GpuExportPipeline 与 timeline 合成。由此支持：

- 高质量 puppet 导出（H.264/ProRes）
- 通过 StreamSink 预览 puppet（与 scene 一致）
- neko-live 在引擎内合成 puppet + scene（无需 webview 捕获）

#### 分离：Puppet WebSocket Command Protocol

将 puppet 输入从 REST fire-and-forget 升级为带 command envelope 的 WebSocket。`PuppetCommandEnvelope` 包含 `seq`（序列号）+ `revision`（版本校验）+ `PuppetCommand`（具体命令），复用 scene 已有的 `SceneCommandEnvelope` 模式。

**收益**：ordering 保证、冲突检测、undo 支持（command log）。

#### 保持耦合：ECS Core（runtime-puppet）

ECS World 类型（BevyPuppetWorld）应该保持为内聚单元。用 OOP trait shell（PuppetWorld，约 25 个方法）包装 `bevy_ecs::World` 是正确模式：它提供稳定 API 面，同时允许 ECS 内部演进。进一步拆分 ECS World 会割裂 entity-component 模型。

#### 保持耦合：neko-live renderer（下游消费者）

neko-live 应该消费来自 SceneRenderer 和 PuppetRenderer 的 `VideoGpuFrame`，而不是拥有自己的 renderer。这与 `adr-device-management.md` 中的 neko-live 瘦身方向一致：neko-live 成为 scene compositor，而不是 renderer。

---

## 目标三层架构

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
│  │              PipelineSink（第三部分）              │  │
│  │  StreamSink | MuxerSink | SnapshotSink        │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 新增能力

| 能力                   | 之前                         | 之后                                                                        |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| Puppet 高质量导出      | 做不到（只有 Canvas2D）      | PuppetRenderer → GpuExportPipeline → MuxerSink                              |
| Puppet + Timeline 合成 | 做不到                       | 两者都产出 VideoGpuFrame::GpuHandle，可在 GPU 中合成                        |
| Puppet H.264 预览流    | 做不到（只有 JSON）          | PuppetRenderer → StreamSink                                                 |
| 独立 tick/render rate  | Scene 被 renderer Mutex 阻塞 | 提取快照 → 独立渲染                                                         |
| Puppet undo/redo       | 没有 command log             | WebSocket command envelope → revision log                                   |
| neko-live GPU 合成     | Webview 捕获（有损）         | 引擎侧 VideoGpuFrame 合成                                                   |
| 并发 scene 编辑 + 导出 | Mutex 争用                   | 基于快照分离                                                                |
| 跨领域渲染测试         | 不可测（耦合）               | SceneRenderer/PuppetRenderer 可用 synthetic RenderWorld/DeformedMeshes 测试 |

---

## 设计决策

| 决策                                            | 理由                                                                                                     | 备选方案                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| PuppetRenderer 使用 wgpu SpriteBatch            | puppet 是 textured 2D mesh，SpriteBatch 是自然的 GPU primitive；产出可与 timeline 合成的 `VideoGpuFrame` | 保留 Canvas2D（无导出、无合成、无 GPU 加速）          |
| 将 puppet 升级为 WebSocket command              | 与 scene 在 ordering + revision validation 上对齐；支持 undo log                                         | 保留 REST（无 ordering、无冲突检测）                  |
| Puppet WebSocket 复用 SceneCommandEnvelope 模式 | 控制平面一致；共享校验逻辑                                                                               | 新协议（碎片化、重复实现）                            |
| Canvas2D 仅作为 legacy/debug                    | WebSocket 传递的 sprite data 仍可用于检查，但不是生产渲染 fallback                                       | 完全移除 Canvas2D                                     |
| neko-live 消费 VideoGpuFrame                    | 与 adr-device-management.md 的 neko-live 瘦身方向一致；live 成为 compositor，而不是 renderer             | neko-live 拥有自己的 renderer（重复）                 |

---

## 与其他 ADR 的关系

| ADR                          | 关系                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `adr-2d3d-unified-engine.md` | shared-core 抽取（hierarchy/animation_blend/transform）属于该 ADR 范围。第八部分处理与 shared-core 正交的计算-渲染分离 |
| `adr-device-management.md`   | neko-live 瘦身（compositor 而非 renderer）依赖 PuppetRenderer 产出 VideoGpuFrame                                       |
| [adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md)（PipelineSink）     | PuppetRenderer 和 SceneRenderer 都产出 VideoGpuFrame，由 PipelineSink adapter 消费                                     |
| [adr-engine-gpu-budget](./adr-engine-gpu-budget.md)（GPU Budget）       | PuppetRenderer 的 GPU 使用由 GpuBudgetController 管理                                                                  |
| 第五部分（Effect Registry）  | Puppet effect（deformer、blend mode）如果 GPU 加速，可注册为 GpuEffect                                                 |

---

## 分阶段实施计划

> **说明**：以下 PR 编号沿用 umbrella ADR 的全局编号。

### P2-PR3：Puppet WebSocket Command Protocol（约 120 行）

**变更文件**：

- 新增：`engine-types/src/puppet_command.rs` —— `PuppetCommandEnvelope`、`PuppetCommand` enum
- 新增：`host-http/src/routes/puppet_control.rs` —— 带 seq/revision 校验的 WebSocket handler
- 修改：`host-http/src/routes/puppet_stream.rs` —— 统一 WebSocket（commands + delta stream）
- 修改：`engine-kernel/src/services/impls/puppet.rs` —— 接收 `PuppetCommand`，替代原始参数集

**行为变化**：Puppet 输入从 REST 升级到 WebSocket。REST endpoint 仍保留为便捷别名（内部转换成 WebSocket command）。

### P2-PR4：PuppetRenderer（wgpu SpriteBatch，约 400 行）

**变更文件**：

- 新增：`engine-kernel/src/gpu/puppet_renderer/mod.rs` —— `PuppetRenderer` struct
- 新增：`engine-kernel/src/gpu/puppet_renderer/sprite_batch.rs` —— `SpriteBatch`（instanced quad rendering）
- 新增：`engine-kernel/src/gpu/puppet_renderer/puppet_shaders.wgsl` —— 用于 textured deformed meshes 的 vertex/fragment shader
- 修改：`engine-kernel/src/services/impls/puppet.rs` —— 可选 `PuppetRenderer`（类似 SceneService 的可选 renderer）

**新增能力**：Puppet 产出 `VideoOutput::GpuFrame`，从而支持导出和合成。

### P3-PR1：Puppet H.264 流 + 导出集成（约 150 行）

**变更文件**：

- 修改：`host-http/src/routes/puppet_stream.rs` —— 可选择通过 StreamSink 输出 H.264（同时保留 JSON control stream）
- 修改：`engine-kernel/src/export/gpu_export_pipeline.rs` —— 接收 PuppetRenderer 输出作为可合成图层
- 修改：`neko-puppet/packages/webview/src/components/PuppetCanvas.tsx` —— 使用 H264StreamClient 作为主播放路径；Canvas2D 仅保留用于 legacy/debug 检查

**新增能力**：Puppet 通过 H.264 预览（与 scene 对齐）；puppet 通过 GpuExportPipeline 导出。

### 实施优先级交叉引用

> 以下表格说明本 ADR 中的 PR 在 umbrella ADR 全局计划中的位置和依赖关系。

| 本 ADR 范围                          | 主计划位置 | 前置依赖 | 理由                                                                |
| ------------------------------------- | ---------- | -------- | ------------------------------------------------------------------- |
| Puppet WebSocket Command Protocol     | P2-PR3     | 无       | 纯控制平面协议，不涉及 GPU 渲染——可在 P0 后任意时间落地             |
| PuppetRenderer（wgpu SpriteBatch）    | P2-PR4     | PipelineSink + GpuBudget | 产出 VideoGpuFrame → Sink 消费；GPU 使用受 BudgetController 管理    |
| Puppet H.264 流 + 导出                | P3-PR1     | PR4 + StreamSink + MuxerSink | 依赖 PuppetRenderer + 编码 Sink                                     |

---

## 验证

### P2-PR3（Puppet WebSocket）

- 通过 WebSocket 下发 puppet command 与 REST endpoint 产生相同结果
- out-of-order seq 被拒绝，并返回正确错误
- revision 冲突可被检测并报告
- REST 便捷 endpoint 仍可用

### P2-PR4（PuppetRenderer）

- PuppetRenderer 输出在标准姿态下与 Canvas2D 参考图视觉一致
- puppet 产出的 `VideoOutput::GpuFrame` 可在 GpuExportPipeline 中与 timeline 合成
- 性能：典型 puppet（< 500 vertices，< 10 textures）达到 60fps

### P3-PR1（Puppet H.264 + 导出）

- Puppet H.264 流可在 neko-puppet webview 中查看（H264StreamClient）
- 通过 GpuExportPipeline 导出 puppet 可产出合法视频文件
- 未请求 H.264 时，JSON control stream 仍然可用
