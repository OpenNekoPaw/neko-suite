# ADR：engine-kernel 解耦与 crate 边界重塑

- **状态**：已实施（P0 + P1）；P2/P3 待推进
- **日期**：2026-05-15
- **作者**：Codex（架构审查）
- **范围**：neko-engine（engine-kernel / engine-types / runtime-scene / runtime-puppet / host-api）
- **父文档**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)
- **相关 ADR**：
  - [adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md)
  - [adr-engine-effect-registry](./adr-engine-effect-registry.md)
  - [adr-engine-dual-api-scene-split](./adr-engine-dual-api-scene-split.md)
  - [adr-engine-gpu-budget](./adr-engine-gpu-budget.md)
  - [adr-engine-puppet-renderer](./adr-engine-puppet-renderer.md)
  - [adr-engine-preview-subsystem](./adr-engine-preview-subsystem.md)

---

## 背景

`engine-kernel` 原本承担媒体引擎的核心编排职责：连接领域模型、GPU、编解码、音频、导出、预览和 host API。随着 PipelineSink、GpuEffect Registry、Dual API、GPU Budget、PuppetRenderer 和 Preview Subsystem 等 ADR 实现落地，大量基础设施和运行时实现继续集中在 `engine-kernel` 内部。

因此，当前问题不是“engine-kernel 做了不该做的事”，而是“本该分层、分 crate 的事全部在同一个 crate 中完成”。这削弱了 ADR 追求的解耦效果，也让后续扩展、测试和编译边界变得模糊。

## 实施状态（2026-05-15）

P0 和 P1 已落地并归档到 OpenSpec：

- `PipelineOutput`、`VideoOutput`、`AudioOutput`、`GpuOutputHandle`、`GpuFrameLease` 等输出合同已迁入 `engine-types`。
- `engine-gpu` 已承接 GPU context/resource/HAL、platform interop、compositor/effect/budget 等基础设施；scene/puppet/panoramic renderer 仍作为 kernel-owned companion 留待 P2。
- `engine-codec` 已承接 FFmpeg video decoder/encoder/muxer、IDR scanner、codec pools。
- `engine-audio` 已承接 audio decoder/encoder、DSP effect factory、mic capture、soft limiter。
- `engine-kernel` 的 `audio`、`decoder`、`encoder`、`gpu` 模块保留兼容 re-export shim，host facade 收窄留待 P3。
- `export` / `preview` 已引入 backend adapter 与 sink factory，避免直接依赖 `services::impls::*` 具体实现。
- 架构测试已覆盖 `gpu -> services`、`domain -> gpu`、基础设施 crate forbidden dependency、export/preview backend adapter、BlendMode 单一合同等规则。

当前剩余结构任务：

- P2：提取 scene/puppet/panoramic renderer companion crate，并评估 `GpuExportPipeline` 是否需要进入 rendering/export companion crate。
- P3：引入 `ServiceFactory` / kernel facade，收窄 `engine-kernel` 顶层 `pub mod` 与 `neko_engine_kernel::gpu::*` glob re-export。

---

## 现状数据

基于 2026-05-15 对 `packages/neko-engine/packages/engine-kernel/src` 的只读复核：

| 指标 | 当前值 | 判断 |
|------|--------|------|
| Rust 文件数 | 177 | 单 crate 内部模块过多 |
| 代码量 | 约 68,043 行 | 体量已接近多个 runtime/infrastructure crate 的合体 |
| `pub` 暴露面 | 约 1,771 处 | 包含 re-export 与可见性声明，说明边界过宽 |
| 顶层模块 | 15 个 | 覆盖 GPU、codec、audio、export、preview、domain、services 等独立职责 |

### 模块体量

| 模块 | 行数 | 文件数 | 风险 |
|------|------|--------|------|
| `gpu` | 27,328 | 51 | 高：占 kernel 约 40%，包含多个独立职责域 |
| `services` | 13,436 | 40 | 高：接口、实现、编排、sink 合同混在一起 |
| `media_service` | 4,728 | 10 | 中：可作为独立 runtime-media 边界继续收敛 |
| `export` | 4,091 | 6 | 中：同时依赖 GPU、codec、domain、services |
| `encoder` | 3,684 | 8 | 中：应与 decoder/audio 边界重新梳理 |
| `domain` | 3,665 | 14 | 中：存在 GPU 类型泄漏 |
| `audio` | 3,618 | 21 | 中：DSP、codec、capture 可独立演进 |
| `decoder` | 2,255 | 6 | 低到中：与 GPU interop 存在共享类型 |

---

## 五层分析

### 1. 职责

`engine-kernel` 同时承担了以下职责：

- 业务服务接口与实现：`services/*` 与 `services/impls/*`
- GPU 基础设施：`GpuContext`、纹理池、平台 interop、compositor、effect dispatcher
- 渲染器：scene renderer、puppet renderer、panoramic renderer
- 编解码：FFmpeg decoder、hardware encoder、muxer、encoder pool
- 音频：DSP、audio decoder/encoder、mic capture、mixdown
- 导出：export service、GPU export pipeline、audio mixer
- 领域模型：timeline、resource、stream、task、transform
- 预览路由：PreviewPipeline、PreviewProviderRegistry

这些职责在运行时确实需要协作，但不需要位于同一个 crate。当前同 crate 放置掩盖了层级边界，导致 Rust 编译器无法帮助检查依赖方向。

### 2. 依赖

当前最重的依赖方向是 `services -> gpu`，这本身符合编排层依赖基础设施层的方向。但同时存在反向依赖：

```text
services ──uses──▶ gpu
   ▲               │
   │               │
   └── pipeline_sink ◀── gpu renderer output
```

`gpu/panoramic_renderer.rs` 和 `gpu/puppet_renderer/mod.rs` 只需要产出 `VideoOutput`、`GpuFrameLease` 和 `GpuReadbackTarget`，却必须从 `crate::services::pipeline_sink` 导入这些类型。这使 `gpu` 反向依赖 `services`，形成架构层面的循环。

其他值得收敛的依赖包括：

- `domain -> gpu`：领域模型引用 GPU `BlendMode` / `Transform2D`，说明领域类型依赖渲染实现类型。
- `export -> services`：导出管线依赖 service 层类型，说明输出合同位置偏高；其中 `export/service.rs` 还直接依赖 `services::impls::MuxerSink` 具体实现，绕过了接口边界。
- `audio <-> encoder`：音频 codec 扩展与 encoder 类型互相引用，适合抽出 codec 合同层。
- `preview -> services/export/gpu/encoder`：preview 仍是多基础设施的聚合点，需要更清晰的 provider/sink 边界。
- `host-api/host-napi -> kernel internals`：host 层直接引用 `gpu`、`encoder`、`domain`、`export`、`jvi`、`media_service`、`preview`、`services`、`audio` 等模块，并在部分 controller 中直接实例化具体服务类。这说明收窄公开面前需要先建立 service factory 或 DI 容器。

### 3. 接口

`engine-kernel` 顶层通过 `pub mod` 暴露几乎所有内部模块，多个子模块又在 `mod.rs` 中做宽泛 re-export。这使外部 crate 可以绕过预期服务接口直接依赖实现细节。

这类暴露面过宽带来三个后果：

- host 层容易直接绑定 kernel 内部类型，之后拆 crate 会产生级联改动。
- 测试可以绕过公开 contract 调内部实现，降低接口约束强度。
- 新功能倾向于“从 kernel 里找一个现成类型复用”，而不是先定义小而稳定的合同。

### 4. 扩展

近期 6 个子 ADR 的方向是正确的：

| ADR | 已解决的问题 | 剩余结构问题 |
|-----|--------------|--------------|
| PipelineSink | 输出适配器模型建立 | 合同仍位于 `services`，GPU 层反向依赖 service 层 |
| GpuEffect Registry | effect dispatcher 从 match 走向注册表 | registry 与 GPU 实现仍在 kernel 内 |
| Dual API + Scene Split | creative/data access 边界建立 | scene renderer 仍嵌在 `gpu` 模块 |
| GPU Budget | 预算控制模型建立 | budget 与 `GpuContext` 仍强绑定在 kernel |
| PuppetRenderer | puppet GPU 渲染能力建立 | puppet renderer 仍嵌在 `gpu` 模块 |
| Preview Subsystem | provider/routing 模型建立 | preview 仍聚合 encoder/export/gpu/service |

也就是说，ADR 已经把“接口形状”设计出来了，但 crate 边界还没有跟着接口形状移动。

### 5. 测试

当前功能测试覆盖较好，但缺少架构测试。建议新增只读依赖规则测试或 CI 脚本，至少检查：

- `gpu/` 不得引用 `crate::services::*`
- `domain/` 不得引用 `crate::gpu::*`
- `engine-types` 不得依赖 `wgpu`、FFmpeg、tokio runtime、host API
- `host-api` 不得依赖 kernel 内部实现模块，只依赖 service contract 或 facade
- 新增 renderer/effect/provider 不得扩大 `engine-kernel` 顶层 `pub mod` 面

---

## 决策

将 `engine-kernel` 从“所有核心能力的容器”重塑为“业务编排与 facade 层”。基础能力按合同优先方式逐步迁出到更小的 crate：

```text
engine-types
  ↑
engine-gpu        engine-codec       engine-audio
  ↑                    ↑                  ↑
engine-scene-renderer  │                  │
engine-puppet-renderer │                  │
  └──────────────┬─────┴──────────┬───────┘
                 ↓                ↓
            engine-kernel ───▶ host-api / host-http / host-napi
```

其中 `engine-types` 只保存纯合同和 DTO，不引入 `wgpu`、`GpuContext`、FFmpeg 或运行时副作用。任何需要 GPU readback、encoder pool、platform interop 的实现都留在 infrastructure crate 或 kernel adapter 中。

---

## 拆分路线

### P0：最小可行解耦，先切断 `gpu -> services`

目标：让 GPU 层不再依赖 service 层。

1. 将纯输出合同迁入 `engine-types`，并复用已存在的 `FrameFormat`：
   - `PipelineOutput`
   - `VideoOutput`
   - `AudioOutput`
   - `GpuOutputHandle`
   - `VideoGpuFrame`
   - `VideoPreviewFrame`
   - `VideoEncodedPacket`
   - `VideoRawFrame`
   - `AudioBuffer`
   - `AudioEncodedPacket`
   - `PreviewUnavailable`
   - `PreviewUnavailableReason`

   `FrameFormat` 已位于 `engine-types`，`VideoRawFrame` 和 `VideoPreviewFrame` 应直接引用这一份定义，不再新增重复枚举。

2. 不把以下实现搬入 `engine-types`：
   - `GpuReadbackTarget`
   - `wgpu::Texture`
   - `GpuContext`
   - `rgba16float_to_rgba8`
   - kernel `Error` / `Result`

3. `GpuFrameLease` 采用分层策略：
   - `engine-types` 可保存纯 handle/token 形态，表达跨层输出合同。
   - kernel/GPU 层提供 readback adapter 或 extension，实现 `read_rgba8()` 等带副作用能力。
   - 如果保留 `GpuFrameLease` 名称，必须避免让它携带 `wgpu` 或 `GpuContext`。

   `GpuOutputHandle` 迁入 `engine-types` 后必须明确跨平台语义：它是平台资源的标识符，不等于安全的资源所有权。持有者必须保证底层 IOSurface、VA surface、D3D texture 等平台资源在 handle 使用期间存活。kernel 侧应提供 RAII wrapper（例如 `GpuFrameLease`）作为唯一安全的持有方式；跨线程传递裸 handle 的路径应被视为临时兼容层，并在 P1 中修复为传递 lease/token 或标记为需要 unsafe 审计的边界。

4. `PipelineSink` trait 的迁移分两步：
   - P0a：先让 GPU 层只依赖 `engine-types` 输出 DTO，`PipelineSink` 可以暂留 kernel，作为兼容层。
   - P0b：若要把 `PipelineSink` trait 移入 `engine-types`，需要新增纯错误合同，例如 `PipelineSinkError`，或使用关联错误类型，避免依赖 kernel `Error`。

完成标准：

- `packages/neko-engine/packages/engine-kernel/src/gpu` 中不再出现 `crate::services::pipeline_sink`。
- `engine-types` 不新增 `wgpu`、FFmpeg、tokio runtime 等实现依赖。
- `PipelineSink` 兼容 re-export 保持 host 层短期不破坏。

### P1：拆基础设施 crate

目标：把 kernel 变回编排层。

| 新 crate | 来源 | 初始职责 |
|----------|------|----------|
| `engine-gpu` | `gpu/context`、texture、HAL、compositor、effect、budget | GPU 上下文、资源、平台 interop、效果/合成；不包含 scene/puppet/panoramic renderer |
| `engine-codec` | `encoder` + `decoder` | FFmpeg、hardware encoder/decoder、muxer、codec pool |
| `engine-audio` | `audio` + audio mixdown/DSP | DSP、音频编解码、mic capture、mixdown |

P1 前置清理：

- 把 `domain -> gpu` 的共享类型移动到 `engine-types` 或定义领域侧镜像类型。优先统一 `BlendMode`：`engine-types` 已有一份 `BlendMode`，`gpu/compositor.rs` 中的重复定义应收敛到同一合同。
- 把 `audio <-> encoder` 的 codec 扩展合同下沉到 `engine-types` 或 `engine-codec`。具体策略：`AudioEncoderConfig` 作为纯配置 DTO 下沉到 `engine-types`，`codec_ext` 这类 FFmpeg/encoder 工具函数跟随 `engine-codec`。
- 把 `export -> services` 的 sink 合同依赖改为依赖 `engine-types` 或 kernel facade。
- `export` 模块改为通过 `PipelineSink` trait 消费 sink 实现，消除对 `services::impls::*` 的直接依赖。如果导出路径需要 `MuxerSink` 特有能力（例如 finalize、写 trailer、查询 muxer 状态），应将能力提升到 `PipelineSink` 合同，或引入更小的 `ExportSink` 子 trait，而不是让 `export` 直接引用具体实现。

### P2：渲染器归位

目标：把特定领域 renderer 从通用 GPU 模块中拆出。

| 移动项 | 来源 | 目标 |
|--------|------|------|
| scene renderer | `gpu/scene_renderer` | `engine-scene-renderer` 或 runtime-scene 的 renderer companion crate |
| puppet renderer | `gpu/puppet_renderer` | `engine-puppet-renderer` 或 runtime-puppet 的 renderer companion crate |
| panoramic renderer | `gpu/panoramic_renderer` | preview/rendering companion crate |

不建议把 renderer 直接塞回纯 `runtime-scene` / `runtime-puppet` world crate。runtime crate 应保持领域状态与计算模型清晰，renderer 作为带 `wgpu` 依赖的 companion crate 更合适。

### P3：收窄 kernel 公开面

目标：让 host 层依赖稳定 facade，而不是 kernel 内部实现。

- 在收窄 `pub mod` 前，先引入 `ServiceFactory` 或 DI 容器，让 host-api 不再直接 `TaskService::new()`、`TimelineService::new()` 或实例化具体 service。
- `engine-kernel` 顶层只暴露 facade、service contract 和必要 DTO re-export。
- 将内部模块改为 `pub(crate)` 或私有模块，通过 feature/facade 精确导出。
- host-api、host-http、host-napi 只依赖 contract/facade，不直接依赖 GPU/codec/audio 实现类型。
- 新增架构检查，防止重新引入 `gpu -> services`、`domain -> gpu`。

---

## 风险与约束

### 不得污染 `engine-types`

`engine-types` 的职责是共享 DTO 和纯合同。它不能为了快速打破循环而引入 `wgpu`、FFmpeg 或 kernel `Error`。否则只是把耦合从 kernel 搬到更底层，后续所有 crate 都会被迫继承实现依赖。

### 不宜一次性搬整个 `gpu`

`gpu` 内部仍包含 scene renderer、puppet renderer、platform interop、compositor、effect、texture pool 等多个职责。直接整体搬成 `engine-gpu` 会把“一个大 module”变成“一个大 crate”，收益有限。应先按合同和依赖方向拆边界，再迁移实现。

### 保持 zero-copy 热路径

拆分不得引入 CPU readback fallback。实时预览、导出、scene stream、puppet stream 的 GPU 驻留规则继续沿用 PipelineSink ADR：

- 支持 zero-copy 时走 GPU handle。
- 不支持时返回 `UnsupportedCapability`。
- readback 只允许作为终点产物，不得作为流式热路径 fallback。

### PipelineSink trait 的错误类型

`PipelineSink::submit()`、`flush()`、`close()` 当前返回 kernel 的 `crate::error::Result<()>`。如果 P0b 将 trait 移入 `engine-types`，不得把 kernel `Error` 一并下沉；应引入纯 `PipelineSinkError`，或为 trait 设计关联错误类型，再由 kernel adapter 映射到 kernel `Error`。

### 增量编译收益需要通过边界落地兑现

仅新增 crate 名称不会自动降低编译成本。如果大部分改动仍集中在 `engine-kernel`，Rust 增量编译收益有限。P1 必须让 GPU、codec、audio 的日常实现改动落在独立 crate 内，才能减少 kernel 和 host 层重编译。

### 接受 runtime-media 与生产 codec/audio 的少量重复

`runtime-media` 与 `engine-codec` / `engine-audio` 保持兄弟 crate 关系，不互相依赖。少量 FFmpeg 打开文件、选择 stream、建立 decoder/resampler 的样板重复是有意接受的边界成本：

- `runtime-media` 是 CPU-only 媒体分析工具集，负责 probe、diff、subtitle、JPEG、image analysis 和 preview variant 等离线分析能力。
- `engine-codec` 是生产视频 codec 基础设施，负责硬件 decode/encode、mux、pool 和 zero-copy 句柄。
- `engine-audio` 是生产音频基础设施，负责流式 audio decode/encode、DSP、capture 和 mixdown。

短期不提取共享抽象，也不让 `runtime-media` 依赖 `engine-codec` 或 `engine-audio`。只有当重复扩大到多个分析工具且仍能保持 CPU-only 约束时，才考虑单独的轻量 `engine-media-io` 或 audio decode helper。

---

## 架构检查建议

P0 可先使用轻量 CI 脚本作为门禁：

```bash
! rg -n "crate::services" packages/neko-engine/packages/engine-kernel/src/gpu -g '*.rs'
! rg -n "crate::gpu" packages/neko-engine/packages/engine-kernel/src/domain -g '*.rs'
```

P1/P2 可进一步引入依赖图检查，例如 `cargo-depgraph` 或自定义 `cargo metadata` 脚本，按 crate 和 module 层面检查禁止依赖。早期先用 grep 门禁更实用，因为当前主要问题是明确的反向引用。

---

## 验收标准

P0 完成后，应满足：

- `gpu/` 不依赖 `services/`。
- `PipelineOutput` 等输出 DTO 位于 `engine-types` 或由 `engine-types` re-export。
- `GpuReadbackTarget` 不在 `engine-types` 中。
- `host-api` 现有导出兼容。
- 最小验证通过：
  - `cargo check -p neko-engine-kernel --lib --no-default-features`
  - 与 PipelineSink、snapshot、stream、muxer 相关的 targeted tests
- 合入前验证：
  - `cargo test -p neko-engine-kernel`
  - 零拷贝热路径 smoke/perf 测试，确认帧时间没有因为合同迁移发生退化
  - MuxerSink flush/close 行为有回归保护：`flush()` 不应被 DTO 迁移意外改变为未定义行为；若当前实现仍保持 flush 等同终结操作，必须有测试或文档明确语义，或在同一 PR 中修复为 flush 后 worker 继续可用。
  - StreamSink close 行为有回归保护：`close()` 应先 flush 编码器再释放回池，或至少通过测试证明迁移前后不会丢失 encoder buffered frames。

P1/P2 完成后，应满足：

- `engine-kernel` 行数显著下降，目标约 20K 到 30K 行。
- GPU、codec、audio 可独立编译和测试。
- scene/puppet renderer 的依赖方向清晰，不污染纯 runtime crate。
- CI 中有架构依赖规则，防止循环回归。

---

## 结论

`engine-kernel` 的主要问题不是功能错误，而是 crate 边界没有跟随 ADR 的接口边界演进。当前最优先的切入点是 PipelineSink 合同层：先把纯输出合同下沉到 `engine-types`，把 GPU readback 适配留在实现层，从而切断 `gpu -> services` 的反向依赖。

完成 P0 后，后续再拆 `engine-gpu`、`engine-codec`、`engine-audio` 和领域 renderer，会变成一组可验证的小迁移，而不是一次高风险的大搬家。
