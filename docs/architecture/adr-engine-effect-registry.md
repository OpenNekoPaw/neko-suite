# ADR：效果系统解耦 —— GpuEffect 注册表与 Audio Factory

- **状态**：提议中
- **日期**：2026-05-13
- **作者**：Claude（架构师）
- **范围**：engine-kernel（gpu/、audio/dsp/、export/）、engine-types、host-api（plugin/、controllers/effects.rs）
- **父文档**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)
- **前置条件**：无硬依赖。与 [adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md) 共享 GPU-only 原则（效果不得引入 CPU fallback），但 `GpuEffect::apply_tex()` 是 texture-to-texture 操作，不直接消费 `PipelineOutput` 类型。GpuEffect registry PR 可与 PipelineSink PR 并行推进。

---

## 背景

EffectDispatcher 采用硬编码字符串匹配（12+ 个分支）路由到 3 个 processor；未知效果会退回到 CPU 往返路径（`apply_custom_tex_fallback`）；插件注册的 shader 无法走快速的 texture-to-texture 路径。音频 DSP 工厂 `create_effect()` 硬编码匹配 16 种内建类型；未知类型已返回 `Err`（不是早期版本中的静默 `Gain(0.0)` 直通），但新增效果类型仍需修改 match 分支（OCP 违反），且插件音频效果没有注册入口。ML 推理依赖文件 I/O，无法接收或产出 GPU texture。插件基础设施结构完整但尚未接线——`PluginActivationHandler` 还没有实现；插件能力没有流入效果注册表。

本子 ADR 从 umbrella ADR（[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)）中提取效果系统解耦的完整设计，覆盖 GpuEffect trait、AudioEffectFactory 注册表、统一能力注册表、ML 集成阶段、Transition 组合以及相关实施计划。

---

## 效果子系统现状

### 三个彼此隔离的效果子系统

| 维度       | 视频 GPU 效果                                    | 音频 DSP                    | ML 推理                          |
| ---------- | ------------------------------------------------ | --------------------------- | -------------------------------- |
| 数据格式   | wgpu Texture（Rgba8Unorm）                       | `&mut [f32]` PCM            | 文件路径（String）               |
| GPU 上下文 | `Arc<GpuContext>`（wgpu）                        | 无（CPU-only）              | ONNX EP（CoreML/CUDA，独立设备） |
| 调度时机   | 逐帧 16ms（实时）                                | 每 buffer 约 5ms（实时）    | 秒级（离线 batch）               |
| 抽象       | 无统一 trait                                     | `AudioEffect` trait         | `IMlService` trait               |
| 组合方式   | Ping-pong 链                                     | `EffectChain` 顺序执行      | 无组合，单次调用                 |
| 插件扩展   | `CustomShaderProcessor.register_custom_shader()` | `build_effect_chain()` 工厂 | 无                               |

---

## 耦合点

### CP1：EffectDispatcher 硬编码路由

`gpu_export_pipeline.rs` 中的 `apply_single_tex()` 对 `effect_type` 字符串做 match（12+ 个分支）。后果：

- 新增 GPU 效果必须修改 match，违反 OCP
- 插件 shader 会落到 `apply_custom_tex_fallback()`，发生 CPU 往返（慢 10-50 倍）
- 运行时无法注册新的 GPU 快路径效果

### CP2：ML 与 GPU 管线隔离

ML 推理（`IMlService`）输入文件路径、输出文件路径。今天如果要把 AI 放大作为管线效果使用，需要：

```
GPU Texture → readback CPU → save file → ONNX load file → inference
  → save file → load file → upload GPU (4 file I/O + 2 GPU↔CPU copies)
```

### CP3：音频 DSP 工厂硬编码

`effect_factory.rs` 中的 `create_effect()` 硬编码匹配 16 种内建类型。未知类型已返回 `Err(Error::InvalidParameter(...))`。问题不在于行为（已正确），而在于架构：新增效果类型必须修改 match 分支（OCP 违反），且插件效果无法注册。

### CP4：插件激活未接线

`PluginActivationHandler` trait 已存在但没有实现。插件 manifest 中的 `capabilities` 没有流入任何效果注册表。

---

## GpuEffect Trait

用基于注册表的查找替代硬编码分发。定义 `GpuEffect` trait（`Send + Sync`），需包含以下方法：

| 方法 | 职责 | 备注 |
|------|------|------|
| `id()` | 效果标识符 | |
| `apply_tex(ctx, input, output, params)` | Texture-to-texture 快路径 | 所有注册效果必须实现 |
| `param_defs()` | 参数定义（用于 UI 生成和校验） | |
| `estimated_cost(width, height, params)` | 预估 GPU 成本（ns） | P0 默认返回 0，P2 可由重型效果覆盖 |
| `supports_in_place()` | 是否支持原地修改同一张 texture | P0 默认 false（ping-pong），P2 可由安全效果覆盖 |

**EffectDispatcher 迁移方式**：

- **之前**：`apply_single_tex()` 对 `effect_type` 字符串硬编码 match（12+ 分支），未知效果落入 `apply_custom_tex_fallback()`（CPU 往返）
- **之后**：`EffectDispatcher` 内部持有 `HashMap<String, Box<dyn GpuEffect>>`，`apply_single_tex()` 改为注册表查找。未知效果返回 `Err(UnknownEffect)`
- 现有 processor（`GpuBlurProcessor`、`GpuStyleProcessor`、`CustomShaderProcessor` presets）在初始化时被包装为 `GpuEffect` 实现并注册

---

## AudioEffectFactory 注册表

`AudioEffectFactory` 提供 `register(type_name, creator_fn)` 和 `create(config) -> Result<Box<dyn AudioEffect>>` 两个方法，用注册表查找替换 `create_effect()` 的硬编码 match。

设计约束：

- 未知类型行为不变（仍返回 `Err`）。核心收益是新增效果只需 `register()`，不再修改 match 分支（OCP），且插件音频效果获得注册入口
- 可能被多个 mix stream 并发读取，因此 creator 必须是 `Send + Sync`。注册发生在启动或插件激活阶段；运行期创建 effect 只读 factory

---

## 统一能力注册表

`EffectRegistry` 是统一的能力查询入口，维护所有已注册效果的 `EffectCapability` 元数据。

**EffectCapability** 描述一个已注册效果的元信息：id（如 `"com.neko.blur.gaussian"`）、kind（`Shader` / `AudioDsp` / `MlModel` / `Transition`）、source（`BuiltIn` / `Plugin` / `Custom`）、参数定义、是否实时、是否需要 GPU。

**EffectRegistry** 内部持有 capabilities 映射 + 各子系统 dispatcher/factory 引用。

设计约束：

- `capabilities` 是读多写少的数据结构（`effects:list-capabilities` 频繁读取，插件激活/卸载偶尔写入），必须使用 `RwLock` 而不是 `Mutex`
- `EffectCapability` 和 `ParamDef` 放在 `engine-types` 中，必须保持零内部依赖——只使用 Rust 原始类型、`String`、`Vec`、数组和本 crate 内 enum；不得引用 `glam`、`bevy_ecs`、`wgpu` 或 `engine-kernel` 类型。向量/颜色用 `[f32; N]` 表示
- 如果后续某类参数确实需要 `glam`/`wgpu`/`bevy_ecs` 表达能力，则该参数定义必须留在 `engine-kernel` 或 runtime crate 中，通过可序列化的 primitive DTO 投影到 `engine-types`

**插件激活桥接**：

`EffectRegistryActivator` 实现 `PluginActivationHandler`，在 `on_activate` 时：

- 派生 capability ID（`"{plugin_id}.{capability_type}.{entry_stem}"`，直到 manifest 增加显式 `id` 字段）
- 按 `PluginKind` 分发注册：Shader → `register_plugin_effect()`、Model → `register_model()`、Lut → `register_lut()`
- 写入 `capabilities` 映射

`on_deactivate` 时按 `plugin_id` 过滤并删除该插件注册的全部能力和对应子系统注册。

> **manifest 字段说明**：当前 `PluginCapability` 没有 `id` 字段。需要在 `manifest.rs` 中增加 `id: String`。

---

## ML 集成阶段

### 阶段 A —— 离线预处理（当前架构）

不需要架构变更。ML 作为管线外的预处理步骤运行：

```
用户标记某个 clip 需要 AI 放大 →
  engine 离线执行：upscale(input_file, output_file) →
  TS 替换 timeline source → 普通 GPU 管线播放放大后的文件
```

当前的 `models:upscale` action 已经可以做到。这是对单个片段执行 AI 去噪、超分和风格迁移的务实路径。

### 阶段 B —— 面向导出的 GPU 桥接（中期）

ONNX Runtime 支持通过 IOBinding 处理 GPU tensor 输入/输出。需要一个 `MlGpuBridge` trait 提供 `texture_to_ort_value()` 和 `ort_value_to_texture()` 双向转换。

平台实现：

- macOS：wgpu（Metal）→ MTLSharedEvent → CoreML EP → Metal texture → wgpu import
- CUDA：wgpu（Vulkan）→ Vulkan external memory → CUDA → Vulkan external memory → wgpu
- 不允许 GPU 驻留 CPU 桥接：texture readback → ONNX CPU → texture upload 在视频/scene/puppet 热路径中被禁止。CPU ONNX 只保留为阶段 A 的离线预处理，用于产出新资产，而不是逐帧桥接。

**约束**：ML 模型推理每帧需要 50-500ms，无法在 60fps 下逐帧运行。适用于：

- 导出时效果（没有实时约束）
- 关键帧预计算（每 N 帧一次，中间插值）
- 低分辨率实时预览 + 全分辨率导出

### 阶段 C —— 实时 ML 效果（长期）

需要轻量量化模型（TensorRT INT8、CoreML ANE 优化）+ 专门推理管线。本 ADR 不讨论。

---

## Transition 组合

当前状态下，transition 和 effect 是彼此独立的 GPU pass，按顺序执行：先 transition，再逐元素 effect。它们不能直接组合（例如"过渡期间模糊"需要外部编排）。

把 transition 注册成支持双输入的 `GpuEffect` 变体（`GpuTransitionEffect` trait，接收 `input_a` + `input_b` + `progress`），就可以实现组合。这是 P3 增强项；当前的顺序执行已经足够覆盖大多数工作流。

---

## 实施计划

### P0-PR6：GpuEffect Trait + EffectDispatcher 注册表（约 200 行）

**变更文件**：

- 新增：`engine-kernel/src/gpu/effect_trait.rs` —— `GpuEffect` trait + `EffectParams`
- 修改：`engine-kernel/src/export/gpu_export_pipeline.rs` —— EffectDispatcher 从 match 改为 HashMap
- 修改：`engine-kernel/src/gpu/blur_processor.rs` —— 每种 blur 类型包装为 `GpuEffect`
- 修改：`engine-kernel/src/gpu/style_processor.rs` —— 每种 style effect 包装为 `GpuEffect`
- 修改：`engine-kernel/src/gpu/custom_shader_processor.rs` —— presets 包装为 `GpuEffect`

**行为不变量**：现有效果分发产出一致。只改变内部路由。

**关键收益**：消除已知效果上的 `apply_custom_tex_fallback` CPU 往返。

### P1-PR1：AudioEffectFactory 注册表（约 60 行）

**变更文件**：

- 修改：`engine-kernel/src/audio/dsp/effect_factory.rs` —— 带 register/create 的 `AudioEffectFactory` struct
- 修改：`engine-kernel/src/services/audio_mixdown.rs` —— 使用 factory 替代 `create_effect()`
- 修改：`engine-kernel/src/preview/pipeline.rs` / timeline 接线 —— 删除临时 `use_pipeline_sink` feature flag 和旧内联编码路径

**行为变化**：未知效果类型行为不变（已返回 `Err`）。核心收益是消除 OCP 违反 —— 新增效果类型只需 `factory.register()` 而不修改 match；插件音频效果获得注册路径。

### P1-PR2：PluginActivationHandler 实现（约 150 行）

**变更文件**：

- 新增：`host-api/src/plugin/activation.rs` —— 实现 `PluginActivationHandler` 的 `EffectRegistryActivator`
- 修改：`host-api/src/engine.rs` —— 将 activator 接入 PluginManager

**能力**：插件 shader/audio/model 能力在激活时自动注册。

### P1-PR3：EffectCapability + TS Discovery（约 100 行）

**变更文件**：

- 新增：`engine-types/src/effect_capability.rs` —— `EffectCapability`、`EffectKind`、`EffectSource`
- 修改：`host-api/src/controllers/effects.rs` —— 新增 `list-capabilities` action
- 修改：TS `effects.ts` —— 动态拉取能力，替代硬编码 `BUILT_IN_EFFECTS`

**能力**：前端自动发现可用效果，包括插件提供的效果。

### P1-PR4：ML 离线预处理工作流（约 80 行）

**变更文件**：

- 修改：`host-api/src/controllers/models.rs` —— 新增 `preprocess` action（upscale/denoise，并带 source replacement metadata）
- 修改：TS timeline/audio 集成 —— 将预处理结果作为 source swap 应用

**能力**：AI upscale/denoise 作为片段预处理集成进项目工作流。

### P2-PR5：EffectDispatcher 成本估算 + in-place 优化（约 120 行）

**变更文件**：

- 修改：`engine-kernel/src/gpu/effect_trait.rs` —— 保留 P0 预留的 `estimated_cost()` 与 `supports_in_place()` 默认方法，并为内建效果补充覆盖实现
- 修改：`engine-kernel/src/export/gpu_export_pipeline.rs` —— EffectDispatcher 在链式应用前读取 `estimated_cost()`，将成本信号上报给 `GpuBudgetController`
- 修改：`engine-kernel/src/gpu/color_correction_processor.rs` —— 对安全的单输入/单输出颜色类效果声明 `supports_in_place() == true`
- 修改：`engine-kernel/src/gpu/effect_dispatcher.rs` —— 在连续 in-place 安全效果之间复用 texture，减少 ping-pong 临时 texture 分配

**安全边界**：`supports_in_place()` 只是分配优化信号，不改变效果语义。只有不依赖邻域采样、不需要历史帧、不读取同一 pass 中被写入像素的效果才能返回 `true`。blur、style transfer、ML bridge、transition、multi-input effect 默认保持 `false`，继续走 ping-pong 双 buffer。

**新增能力**：GPU 预算控制获得效果链的前置成本信号；简单颜色类效果链减少 texture 分配和 copy/transition 开销。

---

## 设计决策

| 决策                                                         | 理由                                                                                                                    | 备选方案                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GpuEffect 用 HashMap，而不是 match                           | 符合 OCP；插件效果走同一条快路径                                                                                        | 继续 match 并不断增长分支（违反 OCP）                                                 |
| 未知效果返回错误，而不是静默直通                             | 音频里静默 `Gain(0.0)` 会掩盖 bug；视频里的 CPU fallback 会掩盖性能问题                                                 | 保留静默 fallback（会掩盖问题）                                                       |
| 只保留一个 EffectRegistry，而不是按领域拆分                  | 统一插件激活路径；TS 一次就能发现全部能力                                                                               | 每个领域单独注册表（插件接线重复）                                                    |
| 先做 ML 阶段 A（离线），再做阶段 B（GPU bridge）             | 阶段 A 今天就能做，不改架构；阶段 B 需要平台特定 GPU 互操作                                                             | 直接跳到阶段 B（风险高，还会卡在 ONNX IOBinding）                                     |

---

## 风险与缓解

| 风险                             | 影响                                  | 缓解措施                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GpuEffect trait 开销相对直接调用 | vtable 分发每帧每个 effect 约增加 1ns | 相比 16ms 帧预算可以忽略；前后测量即可                                                                                                                            |
| 插件 shader 在注册时编译失败     | 阻塞插件激活                          | 注册时校验 WGSL；通过 PluginAuditor 报错                                                                                                                          |

---

## 验证

**P0（GpuEffect 注册表）**：

- 所有效果都通过 HashMap 查找命中（不再回退到 `apply_custom_tex_fallback`）
- `cargo test`（engine-kernel）通过；`pnpm test`（neko-cut）通过
- 性能：帧渲染时间在基线 5% 以内

**P1（插件接线 + 音频注册表）**：

- 测试插件：`kind: Shader` + WGSL 文件 → 自动注册为 `GpuEffect` → 可在 timeline 中使用
- 测试插件：`kind: Model` + ONNX 文件 → 自动注册到 `ModelRegistry` → 可通过 `models:upscale` 使用
- `effects:list-capabilities` 同时返回内建和插件效果
- TS 的 `BUILT_IN_EFFECTS` 从引擎能力动态填充
- 未知音频效果类型返回 `Err`（不是静默直通）

---

## 开放问题

| #   | 问题                                                                                                                                                                          | 选项                                                                                                                                                                             | 推荐                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | **PluginCapability ID**：在 manifest 中增加显式 `id` 字段，还是从 `"{plugin_id}.{capability_type}.{entry_stem}"` 派生？                                                       | A）在 manifest schema 中增加 `id: String`（对现有插件是破坏性变更） B）确定性派生（如果不同类型里 entry 同名，会有冲突风险）                                                     | A —— 显式 `id` 更清晰；现有插件没有 `id` 字段，所以迁移是增量式的（可选字段，并保留派生兜底）    |
| 6   | **GpuEffect 优化信号如何落地**：P0 已在 trait 中预留 `estimated_cost(...) -> u64 { 0 }` 和 `supports_in_place() -> bool { false }` 默认实现，P2 是否要求重型/可原地效果覆盖？ | A）保持默认值，只依赖观测帧时间和 ping-pong buffer B）P2 要求 blur、style、ML bridge 等重型效果覆盖成本估算，并让 color correction 等安全效果声明 in-place 支持                  | B —— P0 预留默认方法避免 breaking change；P2 再逐步补精确估算和 texture 分配优化                 |
