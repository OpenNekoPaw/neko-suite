# ADR: neko-engine Runtime 分层与宿主模型

> 状态：Active（R0-R3 + P1 + R4 已完成） | 日期：2026-04-08 | 更新：2026-04-08  
> 关联：[engine-plugin-rfc.md](./engine-plugin-rfc.md) · [model-runtime.md](./model-runtime.md) · [vscode-constraints.md](./vscode-constraints.md)

---

## 一、背景

未来的 `neko-engine` 需要同时覆盖：

- 视频处理与导出
- 2D 骨骼/绘画
- 3D 场景/角色
- 文档与文件兼容层
- 设备代理层
- 轻量本地 ML
- 游戏 / 仿真 / XR

当前架构已经有“按领域拆 crate”的雏形：

- `runtime-scene`：3D
- `runtime-puppet`：2D

但应用层仍是统一宿主：

- `host-api`
- `host-http`
- `host-napi`
- `host-cli`

而 `video / device / docs / ml` 等能力仍较多集中在 `engine-kernel`。

因此，runtime 分层的核心问题不是“要不要拆”，而是：

1. 每个 runtime 是否应该单独一个包？
2. 每个 runtime 是否应该单独一个应用？

---

## 二、核心结论

### 决策 1：每个 Runtime 应单独成包

**结论**：每个 runtime 都应有独立包边界。

原因：

- 职责更清晰
- 依赖更可控
- 测试与发布面更独立
- 有利于后续 capability/plugin 与 runtime 解耦

### 决策 2：不是每个 Runtime 都应单独成应用

**结论**：默认采用“一个 Host 应用 + 多个 Runtime 包”。

也就是说：

- Runtime 默认是包级拆分
- 只有少数强实时、强隔离 runtime 才升格成独立 sidecar/app

### 决策 3：Host 负责统一生命周期与传输协议

Host 保留：

- HTTP / WS / N-API / CLI 入口
- Task / Session / Stream / Resource Registry
- 权限与并发控制
- 错误模型与健康检查

Runtime 负责：

- 领域执行模型
- 领域状态与算法
- 领域资源装配

### 决策 4：游戏 / 仿真 / XR 默认不是第一批独立应用

这些 runtime 未来**可能**独立成应用，但不应在架构未稳定前就过早拆成多个 sidecar。

### 决策 5：2D / 3D 是通用能力层，puppet / scene / adapter 是领域实现层

`2D`、`3D` 不应直接成为新的顶层产品名或 crate 名。它们是能力维度：坐标、渲染、动画、输入、导出、资产语义可以按 2D/3D 划分；但运行时包应按领域模型命名。

| 层级 | 示例 | 说明 |
|---|---|---|
| 通用能力 | 2D / 3D / audio / media / device / ML | 横切能力维度，适合作为 trait、schema、tool domain、UI 分类 |
| 原生 Runtime | `runtime-puppet`、`runtime-scene` | Neko 拥有数据模型、编辑合同、测试和导出路径 |
| 可选 Adapter | `Live2dRuntimeAdapter`、`SpineRuntimeAdapter`、Blender/format adapter | 面向第三方格式或 SDK，按 feature/license 隔离 |
| 编排 Runtime | `runtime-stage` | 把 2D/3D/native/adapter actor 组织成可互动场景 |

因此，不建议把现有 `runtime-puppet` / `runtime-scene` 重命名为 `runtime-2d` / `runtime-3d`。对外可以暴露“2D 能力”“3D 能力”，内部仍保留更精确的领域边界。

---

## 三、目标分层模型

```text
                        neko-engine Host
┌─────────────────────────────────────────────────────────────┐
│ Transport Layer                                             │
│ HTTP / WS / N-API / CLI                                     │
├─────────────────────────────────────────────────────────────┤
│ Host Services                                               │
│ Dispatch / Task / Session / Stream / Resource / Telemetry   │
├─────────────────────────────────────────────────────────────┤
│ Shared Kernel                                               │
│ GPU / Codec / File Probe / Project Context / Device Base    │
├─────────────────────────────────────────────────────────────┤
│ Runtime Packages                                            │
│ runtime-media   runtime-puppet  runtime-scene               │
│ runtime-format  runtime-device  runtime-ml                  │
│ runtime-stage   runtime-live2d-adapter? runtime-spine-adapter?│
│ runtime-game    runtime-sim     runtime-xr    (future)      │
└─────────────────────────────────────────────────────────────┘
```

补充原则：

- Host 是稳定入口
- Runtime 是领域模块
- Plugin 是 runtime 或 host 的能力扩展，不等于 runtime 本身

---

## 四、建议的包划分

### 4.1 目标形态

> **命名公式**：`neko-{layer}-{domain}`
> - `neko-engine-*`：内核与共享基础设施
> - `neko-host-*`：宿主入口（传输/API/CLI）
> - `neko-runtime-*`：领域运行时

```text
packages/neko-engine/packages/
├── engine-types/         # 共享 DTO 类型 (✅ Phase R0 已重命名)
├── engine-kernel/        # GPU / codec / stream / shared infra (✅ Phase R0 已重命名)
├── host-api/             # EngineApi / ActionRouter / controllers (✅ Phase R0 已重命名)
├── host-http/            # axum routes (✅ Phase R0 已重命名)
├── host-napi/            # napi bridge (✅ Phase R0 已重命名)
├── host-cli/             # CLI frontend (✅ Phase R0 已重命名)
├── runtime-scene/        # 3D scene / model / render (✅ Phase R0 已重命名)
├── runtime-puppet/       # 2D puppet / drawing (✅ Phase R0 已重命名)
├── runtime-media/        # 通用媒体域逻辑：probe/diff/subtitle/jpeg (✅ Phase R3 已拆出)
├── runtime-format/       # 文件格式探测/文档预览/转换 (待从 engine-kernel 拆出)
├── runtime-device/       # camera / audio input / midi / gamepad (✅ Phase R1 已拆出)
├── runtime-ml/           # onnx/candle lightweight inference (✅ Phase R2 已拆出)
├── runtime-game/         # future
├── runtime-sim/          # future
└── runtime-xr/           # future
```

### 4.2 Phase R0 命名决策说明

| 原 RFC 建议名 | 实际采用名 | 原因 |
|--------------|-----------|------|
| `runtime-2d` | `runtime-puppet` | Rust module 不宜数字开头；puppet 语义精确（2D 骨骼 ECS） |
| `runtime-3d` | `runtime-scene` | 同上；scene 语义精确（3D 场景图 ECS），避免与未来 voxel/terrain 冲突 |
| `runtime-docs` | `runtime-format` | 覆盖范围更广（格式探测 + 文档预览 + 格式转换），与 FormatRegistry 对齐 |
| `engine-host-api` | `host-api` | 三段 crate 名过长且 `engine-` 前缀冗余（已在 neko-engine workspace 内） |

补充命名原则：

- `runtime-puppet` 表示 Neko 原生 2D 角色 runtime，不等于所有 2D 能力。
- `runtime-scene` 表示 3D 场景/模型 runtime，不等于所有 3D 能力。
- `Live2dRuntimeAdapter` / `SpineRuntimeAdapter` 是第三方生态 adapter，不应并入 `runtime-puppet` core。
- `runtime-stage` 是互动舞台编排层，不能被 `scene` 或 `puppet` 替代。

### 4.3 engine-kernel 拆分分析

> **重要发现**：对 engine-kernel 的 service 实现进行深度依赖分析后，发现大部分 service（Video/Audio/Timeline/Export/Effects/Image）与 GPU/Decoder/Encoder 基础设施深度耦合。直接拆出 runtime-video 会导致循环依赖或需要引入复杂抽象层。因此采用**渐进策略**：先拆可独立的，再逐步解耦。

**Service 耦合度分析**：

| Service | GPU/Codec 依赖 | 可迁移性 |
|---------|---------------|---------|
| VideoService | Decoder/Encoder/GPU | ❌ 强耦合 |
| AudioService | FfmpegAudioDecoder/Encoder | ❌ 强耦合 |
| TimelineService | GpuCompositor/PreviewPipeline | ❌ 强耦合 |
| ExportService | GPU export pipeline (100%) | ❌ 强耦合 |
| EffectsService | CustomShaderProcessor (100%) | ❌ 强耦合 |
| ImageService | HwAccelDecoder + GPU texture | ❌ 强耦合 |
| CameraService | cpal mic capture | ✅ 可迁移 |
| MidiService | midir | ✅ 可迁移 |
| GamepadService | gilrs | ✅ 可迁移 |
| MlService | ort/ndarray (optional) | ✅ 可迁移 |
| TaskService | 无外部依赖 | ✅ 可迁移 |
| PuppetService | 无 GPU 依赖 | ✅ 可迁移 |

**渐进拆分顺序**：

| 阶段 | 目标 runtime | 迁出内容 | 风险 |
|------|-------------|---------|------|
| R1 | `runtime-device` | Camera/Midi/Gamepad service + cpal/midir/gilrs 依赖 | 低 |
| R2 | `runtime-ml` | ml/ 模块 + MlService + ort/ndarray 依赖 | 低 |
| R3 | `runtime-media` | media_service/ 域逻辑（probe/diff/subtitle/jpeg_encoder）+ common.rs（waveform/loudness/silence）—— 不含 GPU pipeline | 中 |
| R4 | RuntimeDescriptor trait | 统一 runtime 发现机制（✅ 已实现 RuntimeRegistry） | 低 |

engine-kernel 长期保留：GPU/Codec/Decoder/Encoder/Domain 原语/JVI/Telemetry/Service Traits + 与 GPU 强耦合的 service impls

---

## 五、哪些 Runtime 只需要单独包

下列 runtime 建议长期保持“独立包，但共用 Host 进程”：

| Runtime | 单独包 | 单独应用（当前） | 原因 |
|--------|--------|----------------|------|
| Video | 是 | 否 | 与 GPU 合成、导出、时间线、预览链路强耦合 |
| 2D | 是 | 否 | 与资产、预览、导出共享宿主更高效 |
| 3D | 是 | 否 | 与视频/合成链路共享 GPU 与输出模型 |
| Stage | 是 | 否 | 互动语义、actor、trigger、session 需统一编排，但初期可共用 Host、GPU、设备与流式输出 |
| Live2D / Spine Adapter | 是（可选） | 否 | 许可证、格式和 SDK 隔离；通过 adapter 合同接入 stage/compositor，不成为 core runtime |
| Format | 是 | 否 | 更像兼容层与预览层，不需要独立主循环 |
| Device | 是 | 否 | 是共享横切层，应由 Host 统一管理 |
| ML | 是 | 否 | 与模型注册、资产处理、导出链路紧密集成 |

这些域拆成独立包即可显著降低耦合，但没有足够理由拆成独立 app。

---

## 六、哪些 Runtime 未来可能需要单独应用

| Runtime | 单独包 | 单独应用（当前） | 单独应用（未来） | 触发条件 |
|--------|--------|----------------|----------------|---------|
| Stage | 是 | 否 | 可能需要 | 互动场景出现独立帧循环、低延迟输入、多人同步或长时会话隔离 |
| Game | 是 | 否 | 可能需要 | 独立帧循环、物理时钟、网络同步、低延迟输入 |
| Simulation | 是 | 否 | 可能需要 | 长时间步进、可暂停/回放、批量仿真、服务端运行 |
| XR / VR | 是 | 否 | 可能需要 | OpenXR 设备栈、超低延迟、空间追踪、平台权限隔离 |

这三类域的共同特征是：

- 有自己的主循环，不从属于视频时间线
- 对输入延迟与时钟模型要求极高
- 更可能需要崩溃隔离
- 更可能需要服务端/远程/专机部署

因此它们更像“独立 runtime 进程”，而不是“普通 Engine 内建模块”。

---

## 七、判断标准

### 7.1 何时必须单独成包

满足以下任意两项，就应拆包：

- 有独立领域模型与 DTO
- 有独立依赖集合
- 有独立测试矩阵
- 可在不修改 Host 的前提下迭代
- 未来可能被其他 runtime 复用

### 7.2 何时应升格为独立应用

满足以下任意三项，就应评估独立 app/sidecar：

- 有独立主循环或物理时钟
- 需要独立崩溃域
- 需要独立部署或远程运行
- 与 Host 的资源模型差异很大
- 设备权限、许可证或安全边界明显不同
- 跨进程带来的复制成本低于耦合成本

---

## 八、仓库策略

### 决策：当前继续保留在同一个 Monorepo

原因：

- `neko-engine`、`neko-client`、`neko-types`、各扩展之间的契约变更需要原子提交
- runtime 边界仍在快速演进
- 过早拆仓会把尚未稳定的 API 与包边界固化

### 后续允许独立仓的对象

下列对象在协议稳定后可以独立仓：

- 社区插件
- 实验性 runtime
- 企业私有 runtime
- 与主产品节奏不同的重依赖 sidecar

也就是说：

- **内核、Host、官方 runtime、SDK：主仓**
- **社区/实验/行业特化 runtime：可独立仓**

---

## 九、迁移阶段

### Phase R0：语义化重命名 ✅ 已完成

- 8 个 crate 从 `native-*` 重命名为 `engine-*/host-*/runtime-*`
- npm 包名 `@neko-engine/native-napi` → `@neko-engine/host-napi`; `@neko-engine/native-cli` → `@neko-engine/host-cli`
- 删除遗留空目录 `native-cli`、`native-core`、`native-napi`
- 全部 Rust/TS 源码路径、23 个文档同步更新
- 674 tests passed, 0 failed

### Phase R1：拆出 runtime-device ✅ 已完成

- 创建 `runtime-device/` crate（Camera/Midi/Gamepad/MicCapture service impls）
- 硬件依赖 cpal/midir/gilrs 已迁移到 runtime-device
- host-api controllers 已切换为从 runtime-device 导入
- engine-kernel 保留 service trait 定义

### Phase R2：拆出 runtime-ml ✅ 已完成

- 创建 `runtime-ml/` crate（ModelRegistry/Upscale/Denoise/CLIP/Whisper + MlService）
- ort/ndarray/rustfft/ffmpeg-next 依赖已迁移到 runtime-ml
- host-api 通过 optional `onnx` feature 依赖 runtime-ml
- engine-kernel 保留原 ml/ 模块（待后续清理）

### Phase R3：拆出 runtime-media ✅ 已完成

- 创建 `runtime-media/` crate（覆盖 audio/video/image 通用域逻辑，不含 timeline）
- 迁移 media_service/ 中与 GPU 无关的模块：probe, audio_diff, video_diff, image_diff, subtitle, jpeg_encoder, ffmpeg_parser
- 56 个测试覆盖 probe/diff/encoding 逻辑
- Timeline（diff + 数据模型 + 执行引擎）留在 engine-kernel（依赖 JVI 格式 + GPU Compositor）
- services/impls/common.rs 留在 engine-kernel（依赖 audio codec 层）

### Phase R2：引入 Runtime Registry

- Host 不再直接 hardcode 领域装配
- 运行时通过固定接口挂载到 Host
- Runtime 与 Capability Plugin 边界清晰化

### Phase R3：为 Game / Sim / XR 预留独立 Sidecar 协议

- 定义稳定 IPC/WS 契约
- 定义健康检查、状态同步与错误模型
- 允许这些 runtime 独立部署

### Phase R4：按需要拆分独立应用

只有在真实性能、稳定性或部署需求明确成立后，才把对应 runtime 升格为独立 app。

---

## 十、明确不建议的方案

当前阶段不建议：

- 每个 runtime 都单独一个 sidecar
- 每个 runtime 都单独一个仓库
- 把 `Puppet / Scene / Video / Device / Format / ML` 都拆成多个独立应用
- 把 `runtime-puppet` 重命名成泛化的 `runtime-2d`，或把 Live2D/Spine SDK 直接塞进 puppet core
- 让 `runtime-scene` 承担 runtime-stage 的剧情、actor、trigger、session 编排职责

这会带来：

- 统一调度和传输协议复杂化
- 跨 runtime 合成与预览的跨进程复制成本上升
- 多进程生命周期管理复杂度显著增加
- 版本兼容与调试成本陡增

---

## 十一、结论

`neko-engine` 的正确方向是：

- **每个 runtime 单独成包**
- **默认共用一个 Host 应用**
- **只有少数强实时 runtime 未来再独立成应用**

也就是说，应该先完成“包级分层”，再按真实需求决定“进程级分层”。
