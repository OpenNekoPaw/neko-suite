# ADR：PipelineSink —— 管线输出解耦与 GPU-only 规则

- **状态**：提议中
- **日期**：2026-05-13
- **作者**：Claude（架构师）
- **范围**：engine-kernel（preview/pipeline.rs、services/impls/）、engine-types
- **父文档**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)
- **前置条件**：无（基础子 ADR，其他子 ADR 依赖本文档）

---

## 背景

PreviewPipeline 把编码焊死在 GPU 合成路径里——`render_frame_timed()` 方法内部直接调用 `HwAccelEncoder.encode_frame_gpu()`，导致 GPU 合成结果无法被截图、替代编码器、外部 muxer 或质量分析工具复用。目前唯一的输出方式是预编码 H.264，任何新的消费场景都必须先编码再解码，造成不必要的性能损耗和架构限制。

本文档从 [umbrella ADR](./adr-engine-interface-pipeline-decoupling.md) 中提取 Part III（PipelineSink 管线输出解耦）和 §2.1（GPU 热路径与 zero-copy 规则）的完整设计，作为独立可实施的子 ADR。关于完整的引擎审计上下文（17+ controller、6 条流通道、3 个效果子系统等），请参阅 umbrella ADR §1/§2。

---

## GPU 热路径与 Zero-Copy 规则

### 三条 GPU 热路径（Zero-Copy）

**路径 A —— 时间线预览流**（最热路径，约 60fps）：

```
HwAccelDecoder.decode_next_gpu()
  → Nv12GpuTexture { handle: VideoToolbox { io_surface } }
  → Nv12TextureImporter (Metal → wgpu texture import)
  → TextureCompositor (multi-layer GPU composite + blend modes + transforms)
  → EffectDispatcher (per-element GPU effects, ping-pong)
  → RgbaToNv12Converter (GPU color space)
  → IOSurfaceBackingStore (GPU → IOSurface, zero-copy)
  → HwAccelEncoder.encode_frame_gpu(io_surface_handle)
  → CVPixelBuffer wrap (zero-copy, no memcpy)
  → VideoToolbox H.264 encode
  → broadcast → WebSocket
```

**路径 B —— 单文件视频流**（约 60fps）：

```
HwAccelDecoder.decode_next_gpu()
  → Nv12GpuTexture
  → HwAccelEncoder.encode_frame_gpu(pixel_buffer)
  → VideoToolbox encode
  → broadcast → WebSocket
```

**路径 C —— 导出**（离线，质量优先）：

```
GpuExportPipeline.process_frame_to_iosurface_timed()
  → IOSurface handle (usize)
  → AsyncExportPipeline.submit_composited(CompositedFrame { gpu_handle })
  → Compose worker (Arc<GpuContext>)
  → Muxer output
```

**约束**：任何把 CPU readback 插入这些路径的解耦方式，都会造成 **5-10 倍性能退化**（GPU→CPU 拷贝 + 管线停顿）。

### GPU 驻留规则（目标状态）

- 实时视频帧、3D 场景渲染和 puppet 渲染都是 GPU-only 目标路径。
- 热路径不得使用 `GPU → CPU → GPU`、GPU 渲染后 CPU 编码，或纯 CPU 渲染作为兼容性退路。
- 如果平台无法提供所需的原生 GPU handle 或编码器输入，引擎返回 `UnsupportedCapability` 并停止操作。
- CPU 路径仍适用于音频 DSP、图片/文档预览、解析、调度、元数据、序列化，以及显式的终点 readback。
- 终点 readback 只允许用于截图、缩略图、高质量预览帧、分析缓冲区等终点产物；它不是流式播放或导出的 fallback。
- 低端设备兼容不是这些 GPU 驻留路径的设计目标。

### 当前平台差距（必须在 P0 消除）

| 平台 | 当前状态 | 目标 |
|------|----------|------|
| macOS | IOSurface zero-copy（符合目标） | 保持 |
| macOS 导出 | IOSurface 失败时 fallback 到 `process_frame_to_nv12_timed()` + CPU readback（带 warn 日志） | 返回 `Err` + 向调用方报告 `UnsupportedCapability` |
| 非 macOS | `process_frame_to_nv12()` + CPU readback 作为主路径 | 实现平台原生 zero-copy（Vulkan external memory / DMA-BUF / D3D11 shared texture）或返回 `UnsupportedCapability` |

---

## PipelineSink 设计

### 3.1 问题

PreviewPipeline 把编码焊死在 render 方法里，导致 GPU 合成结果无法用于：

- 截图（需要 RGBA，而不是 H.264）
- 替代编码器（需要原始帧，而不是 H.264）
- 外部 muxer（需要把编码包路由到其他地方）
- 质量分析（需要逐帧指标）

### 3.2 设计

#### PipelineOutput —— 分层媒体输出模型

输出模型在两个层面拆分职责：

1. **媒体类型**（Video vs Audio）—— 不同数据路径、不同时间模型
2. **输出形态**（GPU handle、预览帧、编码包、原始数据）—— 面向不同消费者

**PipelineOutput** 顶层分为 `Video(VideoOutput)` 和 `Audio(AudioOutput)` 两条路径。

**VideoOutput** 形态（从最热到最冷）：

| Variant | 数据 | 用途 | GPU 驻留？ |
|---------|------|------|-----------|
| `GpuFrame(VideoGpuFrame)` | `GpuFrameLease` + pts/duration/frame_index/width/height | 编码、导出、后续 GPU 处理 | 是（热路径主输出） |
| `PreviewFrame(VideoPreviewFrame)` | RGBA 或 JPEG/PNG bytes + pts/width/height | 截图、缩略图、颜色采样、分析 | 否（按需终点产物） |
| `EncodedPacket(VideoEncodedPacket)` | H.264/ProRes bytes + pts/dts/duration/is_keyframe | WebSocket 流、mux | 否（由 sink 内编码器生成） |
| `RawFrame(VideoRawFrame)` | Nv12/Rgba8 pixel buffer + pts/width/height | 截图、缩略图、分析的终点 readback | 否（不是热路径 fallback） |

**AudioOutput** 形态：`PcmF32(AudioBuffer)`（交错 f32 PCM）和 `EncodedPacket`（AAC/Opus，用于 mux）。

**GpuOutputHandle** 是平台感知的 GPU 句柄枚举：macOS `IOSurface`、Linux `VaSurface`、Windows `D3D11Texture`。通过 `cfg(target_os)` 条件编译。

这里有意不提供 `CpuFallback` handle。GPU 驻留帧必须保持 GPU 驻留，直到某个终点 sink 明确请求 readback；否则操作应以 `UnsupportedCapability` 失败。

**GpuFrameLease 设计约束**：`VideoGpuFrame.handle` 不使用裸 `usize`，而是一个 RAII 包装类型 `GpuFrameLease`，通过 retain/release 语义保证底层 GPU 资源在 lease 存活期间不被回收。裸 `usize` 句柄无法表达生命周期和所有权——持有者（如 sink 的编码队列）可能在编码器实际使用期间释放底层资源。`GpuFrameLease` 在 `Drop` 时自动释放。具体实现方式由实现者决定（可以是 `Arc` 引用计数、回调释放、或 pool slot index）。

**GpuFrameLease 语义细节**：

| 属性 | 要求 | 理由 |
|------|------|------|
| `Clone` | 是（`Arc` 式廉价 clone） | StreamSink + SnapshotSink 可能同时持有同一帧的 lease（多 sink fan-out） |
| `Send + Sync` | 是 | lease 跨线程传递：管线线程 → sink 线程 → encoder worker |
| `close()`/`flush()` 后失效 | sink `close()` 后不得持有 lease；`flush()` 前必须等待所有 in-flight lease 归还（encoder 完成编码） | 防止 close 后 lease 引用已释放的 backing store |
| encoder 队列持有 lease | encoder `encode_frame_gpu()` 接收 `GpuFrameLease`（不是 `&GpuFrameLease`）——编码完成后 lease 自动 Drop 释放 | 明确所有权转移；避免管线帧步进后 backing store 被复用而 encoder 仍在读取 |
| 生命周期测试 | 单测：lease `Drop` 后 backing store slot 可被后续帧复用；集成测试：并发 StreamSink + SnapshotSink 持有同帧 lease，两者 Drop 后 slot 释放 | 验证 ABA 场景——lease 计数归零才释放，不是 first-drop 就释放 |

跨平台 handle 的实现状态必须显式标注：

- macOS：`IOSurface` 是 P0/P1 的主实现路径。
- Linux：`VaSurface` 需要验证 wgpu Vulkan 后端与 VA-API 的外部内存互操作（例如 `VK_EXT_external_memory_fd` + `vaExportSurfaceHandle`），在验证和实现前应标记为 `unimplemented!()`/feature-gated。
- Windows：`D3D11Texture` 需要验证 wgpu DX12 后端与 D3D11/D3D11on12 的互操作，在验证和实现前应标记为 `unimplemented!()`/feature-gated。

Linux/Windows 当前不是永久不支持，而是"尚未实现的 zero-copy 路径"。运行时如果用户请求这些路径，应返回能力未实现/未启用的错误；不得静默转 CPU。

#### PipelineSink Trait

`PipelineSink`（`Send + Sync`）是管线产出媒体的输出适配器，包含 4 个方法：

| 方法 | 职责 |
|------|------|
| `accepts(&self, output: &PipelineOutput) -> bool` | 管线组装阶段校验输出契约 |
| `submit(&self, output: PipelineOutput) -> Result<()>` | 接收一帧输出 |
| `flush(&self) -> Result<()>` | flush 所有缓冲状态（encoder flush、muxer finalize） |
| `close(&self) -> Result<()>` | 关闭 sink，释放资源 |

**设计约束**：

- `submit` 接收 `&self`（不是 `&mut self`），因为管线持有 `Arc<dyn PipelineSink>`，可能从多个线程调用。包装可变资源（encoder、muxer）的实现使用内部 Mutex
- **同步接口**：60fps 热路径不能承受 Future 分配开销。需要异步 I/O 的 sink（MuxerSink）在内部入队到有界 channel
- 不匹配的 `PipelineOutput` 应返回 `UnsupportedOutput`，不得静默忽略
- `flush()` 是必实现方法，不提供默认 `{ Ok(()) }`——避免需要 flush 的 sink 忘记覆盖时静默通过

**背压语义由具体 sink 决定**：StreamSink 用 broadcast（落后 receiver 被丢弃）；MuxerSink 用有界 channel（阻塞 producer）；PreviewSink 用 ring buffer（最新帧获胜）；SnapshotSink 用 oneshot（无背压问题）。

**Sink 分类** —— 每个 sink 消费特定的 `VideoOutput` / `AudioOutput` 变体：

| Sink           | 消费                                                    | 产出                                 | 使用场景               |
| -------------- | ------------------------------------------------------- | ------------------------------------ | ---------------------- |
| `StreamSink`   | `VideoOutput::GpuFrame` → encode → `VideoEncodedPacket` | `broadcast::Sender` 上的 `FrameData` | WebSocket H.264 流     |
| `MuxerSink`    | `VideoOutput::GpuFrame` → encode → mux                  | MP4/MOV 文件                         | 导出                   |
| `PreviewSink`  | `VideoOutput::GpuFrame` → 终点 readback → RGBA/JPEG     | `VideoPreviewFrame`                  | 缩略图、颜色采样、分析 |
| `SnapshotSink` | `VideoOutput::GpuFrame` → 终点 readback → RGBA          | 通过 oneshot 返回 `Vec<u8>`          | 单帧捕获               |
| `AudioSink`    | `AudioOutput::PcmF32` → pack                            | `broadcast::Sender` 上的 `FrameData` | WebSocket PCM 流       |

**编码器可变性**：`HwAccelEncoder::encode_frame_gpu` 需要 `&mut self`。StreamSink 使用 `Mutex<Option<HwAccelEncoder>>` 包装它，以便 `close()` 可以 `take()` 并显式释放回池。锁只在编码调用期间持有（60fps 下约 1-3ms），不会跨帧持有。编码器生命周期（池化 checkout、分辨率变更、配置更新时 flush、close 释放）由 sink 管理，而不是由管线管理。这会把复杂度从 `PreviewPipeline::update_config()` 移到 `StreamSink::reconfigure()`。

#### Sink 设计约束

以下是各 sink 实现必须遵循的设计约束。具体实现细节由实现者决定。

**StreamSink**（H.264 WebSocket 流）：

- 接受 `VideoOutput::GpuFrame` + `AudioOutput::PcmF32`
- 内部状态（encoder + config + 维度参数）必须合并到**单一 Mutex** 中，不得拆分为多个 Mutex + Atomic。拆分会导致：(1) `submit()` 读到新维度但 encoder 仍是旧配置（状态撕裂）；(2) 多把锁的获取顺序不一致时死锁
- 提供 `reconfigure()` 方法用于分辨率/fps 变更：先 flush 旧 encoder 剩余帧，再从池获取新 encoder。获取新 encoder 必须在替换旧 encoder **之前**，避免 acquire 失败后丢失当前状态
- 编码器从全局 `EncoderPool` 获取和释放。生命周期由 sink 管理（不是管线管理）
- `close()` 是显式关闭语义，必须释放池化资源并进入 `SinkClosed` 状态；`Drop` 只作为兜底。避免 close 后仍占用 encoder 池位和 close + Drop 的 double-release
- `close()` 返回 `Result<()>`，使 encoder/session 关闭失败能向调用方传播

**MuxerSink**（导出）：

- 接受 `VideoOutput::GpuFrame` + `AudioOutput::PcmF32`
- 在同步 `PipelineSink` 接口背后封装 `AsyncExportPipeline`。迁移后导出循环不再直接调用 `AsyncExportPipeline::submit_composited()`；MuxerSink 成为唯一入口
- `flush()` **必须同步等待** encoder flush + mux finalize 完成后才返回。只发送 sentinel 而不等待 ack 的实现是错误的——调用方（ExportService）需要确认文件已写完才能安全读取。推荐使用 oneshot channel 做完成确认
- `close()` 同样需要 ack 确认。`Close` 只表示不再提交新帧；不能替代 `flush()`
- 使用有界 channel 连接同步前端与异步 worker；导出跟不上时阻塞 producer（离线场景正确）

**SnapshotSink**（单帧捕获）：

- 只接受 `VideoOutput::GpuFrame`
- 需要 `GpuContext` 进行终点 readback（GPU texture → staging buffer → CPU `Vec<u8>`）。这是终点产物，不是流/导出的 fallback
- 使用 oneshot channel 返回结果。由于 `submit(&self)` 接收共享引用而 `oneshot::Sender::send()` 消费 self，需要 `Mutex<Option<Sender>>` + `take()` 模式
- 第二次提交应返回 `AlreadyCompleted` 错误
- `flush()` 和 `close()` 可以是空操作（单帧场景无缓冲状态）

### 3.3 Zero-Copy 保持

关键设计：**编码从 pipeline 移到 sink，而不是从 GPU 移到 CPU**。

```
之前：
  GpuExportPipeline.process_frame_to_iosurface() → IOSurface
  PreviewPipeline.render_frame_timed() {
      gpu_result = ...;
      packets = self.encoder.encode_frame_gpu(gpu_result.gpu_handle)?;  // 焊死在 pipeline 中
  }

之后：
  GpuExportPipeline.process_frame_to_iosurface() → IOSurface
  StreamRunner {
      gpu_result = ...;
      self.sink.submit(PipelineOutput::Video(VideoOutput::GpuFrame(frame)))?;  // 已解耦
  }
  StreamSink::submit() {
      packets = self.encoder.encode_frame_gpu(handle)?;  // 编码在 sink 中
  }
```

IOSurface 从 pipeline → sink → encoder 流动，全程没有 CPU readback。zero-copy 链路得到保留。

### 3.4 平台适配（Sink 内部）

平台差异由 sink 内部处理，上层（pipeline、stream runner）保持平台无关。设计约束：

- StreamSink/MuxerSink 在 `submit()` 中检查 encoder 是否支持 GPU handle 输入（如 `HwAccelEncoder::supports_gpu_input()`）
- 如果所需 zero-copy 路径不可用，返回 `UnsupportedCapability` 错误，**不**回退到 CPU 编码
- macOS 通过 IOSurface → VideoToolbox 启用
- Linux/Windows 上 GPU 渲染的实时流/导出必须在 VaSurface/D3D11Texture 的 zero-copy/native-handle interop 实现后才能启用；不得使用 GPU readback + CPU encode

---

## 实施计划

### P0-PR1：PipelineSink Trait + StreamSink（约 180 行）

**变更文件**：

- 新增：`engine-kernel/src/services/pipeline_sink.rs` —— `PipelineSink` trait + `PipelineOutput` + `VideoOutput` + `AudioOutput` + `GpuOutputHandle`
- 新增：`engine-kernel/src/services/impls/stream_sink.rs` —— `StreamSink`（encoder 移到这里）
- 修改：`engine-kernel/src/preview/pipeline.rs` —— 移除 encoder，返回 `VideoGpuFrame`
- 修改：`engine-kernel/src/services/impls/timeline.rs` —— 使用 `StreamSink`，替代内联编码

**行为不变量**：流输出保持一致。编码只是从 pipeline 移到 sink。

**回滚策略**：P0-PR1 保留临时 feature flag `use_pipeline_sink: bool`。默认走新 `PipelineSink + StreamSink` 路径；若出现性能回归，可临时切回旧的内联编码路径以保障预览可用。flag 定义必须标记为 `#[deprecated(since = "P1", note = "Remove after P1 validation")]`，并在 P1-PR1 删除，避免 P1 延期导致双路径长期存在。

### P0-PR2：SnapshotSink（约 40 行）

**变更文件**：

- 新增：`engine-kernel/src/services/impls/snapshot_sink.rs` —— `SnapshotSink`
- 修改：`engine-kernel/src/services/impls/timeline.rs` —— snapshot 路径使用 `SnapshotSink`

**新增能力**：GPU 合成 → RGBA，无需编码 + 解码往返。

### P2-PR2：MuxerSink（约 120 行）

**变更文件**：

- 新增：`engine-kernel/src/services/impls/muxer_sink.rs` —— `MuxerSink`（同步 `PipelineSink` 前端 + 内部 `AsyncExportPipeline` worker）
- 修改：`engine-kernel/src/export/service.rs` —— `ExportService` 使用 `MuxerSink` 替代直接调用 `AsyncExportPipeline::submit_composited()`
- 修改：`engine-kernel/src/export/gpu_export_pipeline.rs` —— 移除导出循环中的内联编码；由 MuxerSink 统一管理

**行为不变量**：导出输出保持一致。编码和 mux 逻辑从导出循环移到 MuxerSink 内部 worker。

**设计约束**（详见 Sink 设计约束章节）：
- `flush()` 必须 oneshot ack——ExportService 需确认文件写完
- `close()` 同样需要 ack 确认
- 有界 channel 连接同步前端与 async worker；离线场景下阻塞 producer 是正确行为

**为什么在 P2 而非 P0**：P0 聚焦流式预览（StreamSink）和截图（SnapshotSink）——这两者直接验证 PipelineSink trait 设计。MuxerSink 依赖导出管线的 async worker 重构，复杂度更高。P2 时 PipelineSink trait 已经过 P0/P1 验证，MuxerSink 实现风险更低。PuppetRenderer（P2-PR4）和全景视频导出（P3-PR1）都需要 MuxerSink 作为导出入口。

### P0-PR7：CPU fallback 路径消除（约 60 行）

**变更文件**：

- 修改：`engine-kernel/src/export/service.rs` —— macOS 导出 IOSurface 失败时返回 `Err` 而不是 fallback 到 `process_frame_to_nv12_timed()`
- 修改：`engine-kernel/src/preview/pipeline.rs` —— 非 macOS 的 `process_frame_to_nv12()` CPU 路径改为返回 `UnsupportedCapability`（或 feature-gate 保留但不作为默认路径）

**目标**：与 GPU 驻留规则中的"当前平台差距"表对齐。macOS 导出不再有 CPU fallback；非 macOS 在 zero-copy 路径实现前显式报错。

---

## 设计决策

| 决策                                                         | 理由                                                                                                                    | 备选方案                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 编码放在 Sink，而不是 Pipeline                               | 保留 zero-copy GPU 路径；可在不做 CPU 往返的情况下支持截图和替代编码器                                                  | 编码放在 Pipeline 中（当前做法——耦合导致无法复用）                                    |
| PipelineSink 保持同步，而不是异步                            | 60fps 热路径承受不起 Future 分配；需要异步 I/O 的 sink 使用内部有界 channel                                             | 异步 trait（每帧会因 Future boxing + waker 产生约 200ns 开销）                        |

---

## 风险与缓解

| 风险                             | 影响                                  | 缓解措施                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PipelineSink 同步 submit 阻塞    | 慢 sink 阻塞渲染循环                  | StreamSink 使用 `broadcast::Sender::send()`（落后 receiver 会被丢弃，不是 frame 被丢弃——符合现有模式）；MuxerSink 入队到有界 channel（通过 channel 容量施加背压） |

---

## 验证

### PipelineSink + StreamSink（P0-PR1）

- timeline 预览流在重构前后输出相同的 H.264 结果（不要求 bit-exact，但要求视觉等价和时序一致）
- `cargo test`（engine-kernel）通过；`pnpm test`（neko-cut）通过
- 性能：帧渲染时间在基线 5% 以内

### SnapshotSink（P0-PR2）

- 通过 SnapshotSink 输出的 RGBA 合法，并与 `process_frame_to_cpu()` 输出一致

### CPU fallback 消除（P0-PR7）

- macOS 导出 IOSurface 失败时返回 `Err`（不再 fallback 到 CPU readback）
- 非 macOS 平台在 zero-copy 路径不可用时返回 `UnsupportedCapability`（不再静默走 CPU 路径）

### 跨平台 GpuOutputHandle 测试策略

- macOS（主要开发环境）：使用 IOSurface zero-copy 路径做完整集成测试（CI：macOS runner）
- Linux/Windows：通过 fail-fast 能力测试验证在 zero-copy GPU input 不可用时返回 `UnsupportedCapability`；不走 CPU encode 路径
- 平台特定变体（`VaSurface`、`D3D11Texture`）只在对应 CI runner 可用时测试；通过 `#[cfg(test)]` + feature flags 门禁
- 所有 PipelineSink 实现都用终点 GPU handle 或 mock encoder 做平台无关单测；不再存在可注入的 `CpuFallback` 变体
