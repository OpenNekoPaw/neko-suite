# ADR：neko-engine 接口与管线解耦

- **状态**：提议中
- **日期**：2026-05-12
- **作者**：Claude（架构师）
- **范围**：neko-engine（engine-kernel / host-api / host-http / runtime-ml / host-napi）
- **前置条件**：[adr-four-layer-contract](./adr-four-layer-contract.md)、[adr-engine-four-layer-audit](./adr-engine-four-layer-audit.md)、[engine-plugin-rfc](./engine-plugin-rfc.md)

---

## 背景

neko-engine 是一个 Rust sidecar 进程，为整个 neko-suite 提供 GPU 渲染、编解码、音频 DSP 与 ML 推理能力。完成对 17+ 个 controller、6 条流通道、3 条 GPU 热路径、3 个效果子系统、插件基础设施和 ML 运行时的审计后，识别出以下系统性耦合问题：

1. **PreviewPipeline 把编码焊死在 GPU 合成路径里** —— 目前唯一的输出方式是预编码 H.264，导致无法复用 GPU 合成结果用于截图、muxer 导出或其他编码器。
2. **EffectDispatcher 采用硬编码字符串匹配** —— 12+ 个分支路由到 3 个 processor；未知效果会退回到 CPU 往返路径（`apply_custom_tex_fallback`）；插件注册的 shader 无法走快速的 texture-to-texture 路径。
3. **ML 推理依赖文件 I/O** —— `IMlService` 以文件路径作为输入和输出，既不能接收 GPU texture，也不能产出 GPU texture；无法把 AI 放大/降噪作为管线效果使用。
4. **音频 DSP 工厂是硬编码的** —— `create_effect()` 匹配 13 种类型；未知类型会静默返回 `Gain(0.0)` 直通；插件音频效果没有注册入口。
5. **插件基础设施结构完整但尚未接线** —— `PluginManager`、manifest、治理门禁和审计都已存在；`PluginActivationHandler` 还没有实现；插件能力没有流入效果注册表。
6. **GPU 资源争用未受控** —— 所有并发管线共享一个 `Arc<GpuContext>`；没有优先级、没有预算、GPU 过载时也没有暂停/限流路径。

**决策**：将引擎拆成可组合的层次 —— **输出适配器**（PipelineSink）、**效果注册表**（统一能力模型）、**GPU 预算控制** 和 **ML 桥接** —— 同时保留 zero-copy 的 GPU 热路径。视频帧、3D 场景渲染和 puppet 渲染都属于 GPU-only 目标路径：如果平台无法提供所需的 zero-copy 或原生句柄能力，就快速失败，而不是回退到 CPU 渲染或 CPU 编码。

---

## 第一部分：接口架构审计

### 1.1 IPC 与 WebSocket 的分工

引擎在这里强制保持清晰分工：

| 通道   | 传输方式                                                           | 方向             | 用途                             |
| ------ | ------------------------------------------------------------------ | ---------------- | -------------------------------- |
| 控制流 | N-API `dispatch()`/`dispatch_action()` 或 HTTP POST `/v1/dispatch` | TS → Engine → TS | 变更、查询、一次性命令           |
| 数据流 | WebSocket `/v1/streams/ws/{stream_id}`                             | Engine → TS      | 连续帧（H.264、PCM、fMP4、事件） |

**ActionRouter**（`host-api/src/router.rs`）会把 `ActionRequest { group, action, id, options, body }` 分发到 17+ 个 controller：

```
videos(15) | audios(20) | timelines(14) | streams(14) | effects(5) | models(7)
images(6) | documents(4) | scenes(8) | puppets(8) | cameras(4) | midi(4)
gamepad(3) | canvas(3) | color-correction(3) | nodes(3) | tasks(2) | plugins(7)
```

**流基础设施**（`services/impls/stream_loop.rs`）：

- `ActiveStreams`：所有流类型共用的全局注册表（按 `StreamId` 存放的 `HashMap`）
- `PlaybackState`：包含 paused、speed、loop_region、seek_to、timeline_update、config_update 的 watch channel
- `StreamPlaybackDelegate`：所有服务都把播放控制委托给它
- `WallClockPacer`：sleep/spin 混合的帧节奏控制（亚毫秒精度）
- `create_stream_channels()`：生成 broadcast(64) + CancellationToken + watch 的工厂
- 二进制帧格式：`pack_h264_frame()` = `[pts:i64][dts:i64][is_keyframe:u8][duration:i64][NAL]`；`pack_pcm_f32le_stream_frame()` = `[pts_us:i64][duration_us:i64][sample_rate:u32][channels:u16][PCM f32le]`

### 1.2 项目文件支持

| 格式             | 加载器                          | EditOperation                            | 流                 |
| ---------------- | ------------------------------- | ---------------------------------------- | ------------------ |
| `.nkv`（视频）   | `JviLoader::load()` → Timeline  | 完整支持（三级：P0/P1/P2，共 15 个操作） | timeline 流 + 导出 |
| `.nka`（音频）   | 来自 TS 的 `MixdownConfig`      | 无（无状态，项目状态由 TS 持有）         | mix 流 + mix 导出  |
| `.nkm`（3D）     | runtime-scene 中的 `NkmProject` | 无（基于 ECS）                           | scene 流           |
| `.nkp`（puppet） | runtime-puppet 的 INP 加载器    | 无（基于 ECS）                           | puppet 流          |

**关键不对称性**：`.nkv` 具备引擎侧项目状态和 EditOperation；其他格式的状态都在 TS 侧，由引擎作为无状态执行器。

### 1.3 EditOperation 系统

`.nkv` 的增量变更分为三层优先级：

| 优先级       | 操作数 | 延迟  | 示例                                                             |
| ------------ | ------ | ----- | ---------------------------------------------------------------- |
| P0（瞬时）   | 3      | <1ms  | element.update、track.toggle、element.toggle                     |
| P1（快速）   | 4      | <5ms  | track.update、element.splitKeepLeft/Right、project.update        |
| P2（结构性） | 8      | <50ms | element.add/remove/move/splitAt、track.add/remove/reorder、batch |

通过 `stream:applyOperation`（StreamController 402-436 行）→ `timeline_service.apply_operation_to_stream()` → 运行中的 stream loop 热更新来执行。

### 1.4 音频接口结论

音频创建**不需要**新的 controller 类型。`audios` controller（20 个 action）已经覆盖单文件操作；项目级编排（`MixdownConfig`）是无状态的。新的能力（automation、bus routing、按片段效果）只需要扩展 `MixdownConfig` 字段，不需要扩展 controller 面。细节见 [adr-audio-workstation-evolution.md](./adr-audio-workstation-evolution.md)。

---

## 第二部分：管线架构审计

### 2.1 三条 GPU 热路径（Zero-Copy）

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

**GPU 驻留规则**：

- 实时视频帧、3D 场景渲染和 puppet 渲染都是 GPU-only 目标路径。
- 热路径不得使用 `GPU → CPU → GPU`、GPU 渲染后 CPU 编码，或纯 CPU 渲染作为兼容性退路。
- 如果平台无法提供所需的原生 GPU handle 或编码器输入，引擎返回 `UnsupportedCapability` 并停止操作。
- CPU 路径仍适用于音频 DSP、图片/文档预览、解析、调度、元数据、序列化，以及显式的终点 readback。
- 终点 readback 只允许用于截图、缩略图、高质量预览帧、分析缓冲区等终点产物；它不是流式播放或导出的 fallback。
- 低端设备兼容不是这些 GPU 驻留路径的设计目标。

### 2.2 GpuExportPipeline —— 输出无关核心

`GpuExportPipeline`（`export/gpu_export_pipeline.rs`）是共享 GPU compositor。它的公开 API 已经与输出形式解耦：

| 方法                           | 输出                                    | Zero-Copy      |
| ------------------------------ | --------------------------------------- | -------------- |
| `process_frame()`              | `TextureCompositeResult`（GPU texture） | 是             |
| `process_frame_to_cpu()`       | `Vec<u8>`（RGBA bytes）                 | 否（readback） |
| `process_frame_to_nv12()`      | `Vec<u8>`（NV12 bytes）                 | 否（readback） |
| `process_frame_to_iosurface()` | `usize`（IOSurface handle）             | 是（macOS）    |

内部链路：`HwAccelDecoder[N] → Nv12TextureImporter → TextureCompositor → RgbaToNv12Converter → EffectDispatcher`

### 2.3 PreviewPipeline —— 编码内嵌导致的耦合点

`PreviewPipeline`（`preview/pipeline.rs`）封装了 `GpuExportPipeline` + `HwAccelEncoder`：

```rust
pub fn render_frame_timed(&mut self, time: f64, bg: [f32; 4])
    -> Result<(Vec<PreviewFrame>, GpuPipelineTiming, u64)> {
    result = self.gpu_pipeline.process_frame_to_iosurface_timed(time, bg)?;
    packets = self.encoder.encode_frame_gpu(result.gpu_handle, pts)?;  // 已焊死在这里
    Ok((packets.map(PreviewFrame::from), timing, encode_ns))
}
```

编码器被硬编码在管线内部，调用者无法在不先编码的情况下取得 GPU 合成结果。

### 2.4 音频管线 —— 已经解耦

`AudioMixdown`（`services/audio_mixdown.rs`）已经与输出形式无关：

```rust
pub fn mix_buffer(&mut self, time: f64) -> Result<MixdownBuffer>;
```

返回 `MixdownBuffer`（f32 PCM）。调用方决定后续动作：流式输出（pack + broadcast）、导出（mux）或分析。这里没有耦合点。

### 2.5 共享基础设施组件

预览、导出和流式播放共享 10 个组件，粒度过厚，不适合拆成独立进程：

| 组件                                            | 使用方                   |
| ----------------------------------------------- | ------------------------ |
| `GpuExportPipeline`                             | 时间线流、导出、截图     |
| `HwAccelDecoder`（池：最多 16 个，每文件 2 个） | 所有视频路径             |
| `HwAccelEncoder`（池：最多 4 个）               | 预览、导出、转码         |
| `AudioMixdown`                                  | mix 流、时间线音频、导出 |
| `StreamRegistry`（ActiveStreams）               | 所有流类型               |
| `WallClockPacer`                                | 所有实时流               |
| `PlaybackState`（watch channel）                | 所有流类型               |
| `GpuContext`（Arc，共享 wgpu device）           | 所有 GPU 路径            |
| `IOSurfaceBackingStore`                         | macOS zero-copy 路径     |
| `EffectDispatcher`                              | 时间线合成、导出         |

---

## 第三部分：PipelineSink —— 管线输出解耦

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

```rust
/// 顶层管线输出：分离视频和音频路径。
pub enum PipelineOutput {
    Video(VideoOutput),
    Audio(AudioOutput),
}

/// 视频输出形态：从最热的 GPU 路径到最冷的终点 CPU 产物。
pub enum VideoOutput {
    /// Zero-copy GPU handle：用于编码、导出或后续 GPU 处理。
    /// 这是 GpuExportPipeline 的主要热路径输出。
    GpuFrame(VideoGpuFrame),

    /// 高质量单帧：用于截图、缩略图、颜色采样和分析。
    /// 按需生成，不在流循环中逐帧生成。
    PreviewFrame(VideoPreviewFrame),

    /// 已编码包：用于 WebSocket 流和 mux。
    /// 由编码器生成（位于 StreamSink 或 MuxerSink 内部）。
    EncodedPacket(VideoEncodedPacket),

    /// CPU pixel buffer：仅用于截图、缩略图或分析的终点 readback。
    /// 不是 GPU 驻留的视频/scene/puppet 路径的实时 fallback。
    RawFrame(VideoRawFrame),
}

pub struct VideoGpuFrame {
    pub handle: GpuOutputHandle,
    pub pts: i64,
    pub duration: i64,
    pub frame_index: u64,
    pub width: u32,
    pub height: u32,
}

pub struct VideoPreviewFrame {
    pub data: Vec<u8>,          // RGBA 或 JPEG/PNG bytes
    pub format: PreviewFormat,  // Rgba8 | Jpeg | Png
    pub pts: i64,
    pub width: u32,
    pub height: u32,
}

pub struct VideoEncodedPacket {
    pub data: Vec<u8>,
    pub pts: i64,
    pub dts: i64,
    pub duration: i64,
    pub is_keyframe: bool,
    pub frame_index: u64,
}

pub struct VideoRawFrame {
    pub data: Vec<u8>,
    pub format: RawPixelFormat,  // Nv12 | Rgba8
    pub pts: i64,
    pub width: u32,
    pub height: u32,
}

/// 音频输出形态。
pub enum AudioOutput {
    /// 交错 f32 PCM：AudioMixdown 的主要输出。
    PcmF32(AudioBuffer),

    /// 已编码音频包：用于 mux（AAC/Opus）。
    EncodedPacket(EncodedAudioPacket),
}

pub struct AudioBuffer {
    pub data: Vec<f32>,
    pub pts_seconds: f64,
    pub duration_seconds: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// 平台感知的 GPU 输出 handle
pub enum GpuOutputHandle {
    #[cfg(target_os = "macos")]
    IOSurface(usize),        // IOSurfaceRef：zero-copy 到 VideoToolbox
    #[cfg(target_os = "linux")]
    VaSurface(usize),        // VA-API surface
    #[cfg(target_os = "windows")]
    D3D11Texture(usize),     // ID3D11Texture2D
}
```

这里有意不提供 `CpuFallback` handle。GPU 驻留帧必须保持 GPU 驻留，直到某个终点 sink 明确请求 readback；否则操作应以 `UnsupportedCapability` 失败。

跨平台 handle 的实现状态必须显式标注：

- macOS：`IOSurface` 是 P0/P1 的主实现路径。
- Linux：`VaSurface` 需要验证 wgpu Vulkan 后端与 VA-API 的外部内存互操作（例如 `VK_EXT_external_memory_fd` + `vaExportSurfaceHandle`），在验证和实现前应标记为 `unimplemented!()`/feature-gated。
- Windows：`D3D11Texture` 需要验证 wgpu DX12 后端与 D3D11/D3D11on12 的互操作，在验证和实现前应标记为 `unimplemented!()`/feature-gated。

Linux/Windows 当前不是永久不支持，而是“尚未实现的 zero-copy 路径”。运行时如果用户请求这些路径，应返回能力未实现/未启用的错误；不得静默转 CPU。

#### PipelineSink Trait

```rust
/// 管线产出媒体的输出适配器。
///
/// 设计约束：
/// - `submit` 接收 `&self`（不是 `&mut self`），因为管线持有 Arc<dyn PipelineSink>，
///   并且可能从多个线程调用（例如视频生产者 + 音频生产者）。
/// - 包装可变资源（encoder、muxer）的实现使用内部 Mutex。
/// - 同步接口：60fps 热路径不能承受 Future 分配开销。
///   需要异步 I/O 的 sink（MuxerSink）在内部入队到有界 channel。
///
/// 背压语义由具体 sink 决定：
/// - StreamSink：`broadcast::Sender::send()`，落后的 receiver 被丢弃（现有行为）
/// - MuxerSink：有界 channel，导出跟不上时阻塞 producer（离线场景正确）
/// - PreviewSink：oneshot 或 ring buffer，最新帧获胜
/// - SnapshotSink：oneshot，单帧，无背压问题
pub trait PipelineSink: Send + Sync {
    fn accepts(&self, output: &PipelineOutput) -> bool;

    fn submit(&self, output: PipelineOutput) -> Result<()>;

    /// flush 所有缓冲状态（encoder flush、muxer finalize）。
    /// 在流或导出结束时调用一次。
    fn flush(&self) -> Result<()>;

    fn close(&self) -> Result<()>;
}
```

`accepts()` 用于管线组装阶段校验输出契约，避免 `submit()` 对不匹配的 variant 静默忽略。生产实现中，不匹配的 `PipelineOutput` 应返回 `UnsupportedOutput`，而不是 `_ => {}`；下方代码示例中的 `_ => {}` 仅表示省略非目标分支。

`flush()` 是必实现方法，不提供默认 `{ Ok(()) }`。即使某个 sink 不需要 flush，也必须显式实现 `Ok(())`，避免需要 flush 的 sink 忘记覆盖时静默通过。

**Sink 分类** —— 每个 sink 消费特定的 `VideoOutput` / `AudioOutput` 变体：

| Sink           | 消费                                                    | 产出                                 | 使用场景               |
| -------------- | ------------------------------------------------------- | ------------------------------------ | ---------------------- |
| `StreamSink`   | `VideoOutput::GpuFrame` → encode → `VideoEncodedPacket` | `broadcast::Sender` 上的 `FrameData` | WebSocket H.264 流     |
| `MuxerSink`    | `VideoOutput::GpuFrame` → encode → mux                  | MP4/MOV 文件                         | 导出                   |
| `PreviewSink`  | `VideoOutput::GpuFrame` → 终点 readback → RGBA/JPEG     | `VideoPreviewFrame`                  | 缩略图、颜色采样、分析 |
| `SnapshotSink` | `VideoOutput::GpuFrame` → 终点 readback → RGBA          | 通过 oneshot 返回 `Vec<u8>`          | 单帧捕获               |
| `AudioSink`    | `AudioOutput::PcmF32` → pack                            | `broadcast::Sender` 上的 `FrameData` | WebSocket PCM 流       |

**编码器可变性**：`HwAccelEncoder::encode_frame_gpu` 需要 `&mut self`。StreamSink 使用 `Mutex<Option<HwAccelEncoder>>` 包装它，以便 `close()` 可以 `take()` 并显式释放回池。锁只在编码调用期间持有（60fps 下约 1-3ms），不会跨帧持有。编码器生命周期（池化 checkout、分辨率变更、配置更新时 flush、close 释放）由 sink 管理，而不是由管线管理。这会把复杂度从 `PreviewPipeline::update_config()` 移到 `StreamSink::reconfigure()`。

#### Sink 实现

**StreamSink**（H.264 WebSocket 流）：

```rust
pub struct StreamSink {
    encoder: Mutex<Option<HwAccelEncoder>>,
    encoder_config: Mutex<EncoderConfig>,
    video_tx: broadcast::Sender<FrameData>,   // 独立视频 channel
    audio_tx: broadcast::Sender<FrameData>,   // 独立音频 channel
    width: AtomicU32,
    height: AtomicU32,
    fps: AtomicU64,                           // 以 f64 bits 存储
    time_base: AtomicU64,                     // 以 f64 bits 存储
}

impl StreamSink {
    pub fn new(
        config: &EncoderConfig,
        video_tx: broadcast::Sender<FrameData>,
        audio_tx: broadcast::Sender<FrameData>,
    ) -> Result<Self> {
        let encoder = global_encoder_pool().acquire(config)?;
        Ok(Self {
            encoder: Mutex::new(Some(encoder)),
            encoder_config: Mutex::new(config.clone()),
            video_tx,
            audio_tx,
            width: AtomicU32::new(config.width),
            height: AtomicU32::new(config.height),
            fps: AtomicU64::new(config.fps.to_bits()),
            time_base: AtomicU64::new(config.time_base.to_bits()),
        })
    }

    /// 流配置变化（分辨率、fps）时调用。
    /// flush 旧 encoder，释放回池，再获取新 encoder。
    pub fn reconfigure(&self, new_config: &EncoderConfig) -> Result<Vec<FrameData>> {
        let mut enc = self.encoder.lock().unwrap();
        let mut cfg = self.encoder_config.lock().unwrap();
        let w = self.width.load(Ordering::Relaxed);
        let h = self.height.load(Ordering::Relaxed);
        let tb = f64::from_bits(self.time_base.load(Ordering::Relaxed));

        // flush 旧 encoder 的剩余帧
        let old = enc.as_mut().ok_or(Error::SinkClosed)?;
        let flushed = Encoder::flush(old)?;
        let flushed_frames: Vec<FrameData> = flushed.iter()
            .map(|p| pack_h264_frame(p, w, h, tb))
            .collect();

        // 先获取新 encoder，再替换旧 encoder，避免 acquire 失败后丢失当前状态。
        let new_encoder = global_encoder_pool().acquire(new_config)?;
        let old_encoder = enc.take().ok_or(Error::SinkClosed)?;
        global_encoder_pool().release(old_encoder, cfg.clone());
        *enc = Some(new_encoder);
        *cfg = new_config.clone();

        self.width.store(new_config.width, Ordering::Relaxed);
        self.height.store(new_config.height, Ordering::Relaxed);
        self.fps.store(new_config.fps.to_bits(), Ordering::Relaxed);
        self.time_base.store(new_config.time_base.to_bits(), Ordering::Relaxed);

        Ok(flushed_frames)
    }
}

impl PipelineSink for StreamSink {
    fn accepts(&self, output: &PipelineOutput) -> bool {
        matches!(
            output,
            PipelineOutput::Video(VideoOutput::GpuFrame(_))
                | PipelineOutput::Audio(AudioOutput::PcmF32(_))
        )
    }

    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(VideoOutput::GpuFrame(VideoGpuFrame { handle, pts, width, height, .. })) => {
                let mut enc = self.encoder.lock().unwrap();
                let enc = enc.as_mut().ok_or(Error::SinkClosed)?;
                let tb = f64::from_bits(self.time_base.load(Ordering::Relaxed));
                let packets = enc.encode_frame_gpu(handle.as_raw(), pts)?;
                for p in &packets {
                    let _ = self.video_tx.send(pack_h264_frame(p, width, height, tb));
                }
            }
            PipelineOutput::Audio(AudioOutput::PcmF32(buf)) => {
                let frame_data = pack_pcm_f32le_stream_frame(
                    buf.data(), buf.pts_seconds(), buf.duration_seconds(),
                    buf.sample_rate(), buf.channels(),
                );
                let _ = self.audio_tx.send(frame_data);
            }
            _ => return Err(Error::UnsupportedOutput),
        }
        Ok(())
    }

    fn flush(&self) -> Result<()> {
        let mut enc = self.encoder.lock().unwrap();
        let enc = enc.as_mut().ok_or(Error::SinkClosed)?;
        let w = self.width.load(Ordering::Relaxed);
        let h = self.height.load(Ordering::Relaxed);
        let tb = f64::from_bits(self.time_base.load(Ordering::Relaxed));
        let flushed = Encoder::flush(enc)?;
        for p in &flushed {
            let _ = self.video_tx.send(pack_h264_frame(p, w, h, tb));
        }
        Ok(())
    }

    fn close(&self) -> Result<()> {
        // 显式释放 encoder 回池；Drop 只作为兜底。
        let mut enc = self.encoder.lock().unwrap();
        let cfg = self.encoder_config.lock().unwrap();
        if let Some(encoder) = enc.take() {
            global_encoder_pool().release(encoder, cfg.clone());
        }
        Ok(())
    }
}

impl Drop for StreamSink {
    fn drop(&mut self) {
        let encoder = self.encoder.get_mut().unwrap();
        let config = self.encoder_config.get_mut().unwrap();
        if let Some(taken) = encoder.take() {
            global_encoder_pool().release(taken, config.clone());
        }
    }
}
```

`close()` 是显式关闭语义，必须实际释放池化资源并进入 `SinkClosed` 状态；`Drop` 只作为未调用 `close()` 时的兜底。这样可避免 close 后仍占用 encoder 池位，也避免 close + Drop 的 double-release。`close()` 返回 `Result<()>`，使 encoder/session 关闭失败（例如 VideoToolbox session 失效）能够向调用方传播。

**MuxerSink**（导出）：

```rust
/// MuxerSink 在同步接口背后封装 AsyncExportPipeline。
/// 迁移后，导出循环不再直接调用 AsyncExportPipeline 的 `submit_composited()`；
/// MuxerSink 成为唯一入口。
/// AsyncExportPipeline 保留为内部异步 worker（channel consumer）。
pub struct MuxerSink {
    export_tx: mpsc::SyncSender<ExportMessage>,
    audio_tx: mpsc::SyncSender<MixdownBuffer>,
    width: u32,
    height: u32,
}

pub enum ExportMessage {
    Video(CompositedFrame),
    Flush,
    Close,
}

impl PipelineSink for MuxerSink {
    fn accepts(&self, output: &PipelineOutput) -> bool {
        matches!(
            output,
            PipelineOutput::Video(VideoOutput::GpuFrame(_))
                | PipelineOutput::Audio(AudioOutput::PcmF32(_))
        )
    }

    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(VideoOutput::GpuFrame(VideoGpuFrame { handle, pts, frame_index, width, height, .. })) => {
                self.export_tx.send(ExportMessage::Video(CompositedFrame {
                    index: frame_index,
                    pts,
                    data: Vec::new(),  // gpu_handle 为 Some 时未使用
                    width,
                    height,
                    gpu_handle: Some(handle.as_raw()),
                }))?;
            }
            PipelineOutput::Audio(AudioOutput::PcmF32(buf)) => {
                self.audio_tx.send(buf)?;
            }
            _ => return Err(Error::UnsupportedOutput),
        }
        Ok(())
    }

    fn flush(&self) -> Result<()> {
        self.export_tx.send(ExportMessage::Flush)?;
        Ok(())
    }

    fn close(&self) -> Result<()> {
        self.export_tx.send(ExportMessage::Close)?;
        Ok(())
    }
}
```

`MuxerSink::flush()` 不允许为空。它必须发送 `Flush` sentinel 给内部 AsyncExportPipeline consumer，由 consumer 完成 encoder flush、写出尾帧并 finalize muxer container。`Close` sentinel 只表示不再提交新帧；不能替代 `flush()`。

**SnapshotSink**（单帧捕获）：

```rust
pub struct SnapshotSink {
    /// 终点 GPU readback 需要 GpuContext。
    /// 这个 sink 是终点，不是流/导出的 fallback。
    ctx: Arc<GpuContext>,
    result_tx: Mutex<Option<oneshot::Sender<Vec<u8>>>>,
    width: u32,
    height: u32,
}

impl PipelineSink for SnapshotSink {
    fn accepts(&self, output: &PipelineOutput) -> bool {
        matches!(output, PipelineOutput::Video(VideoOutput::GpuFrame(_)))
    }

    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(VideoOutput::GpuFrame(VideoGpuFrame { handle, width, height, .. })) => {
                // 终点 readback 内部使用 GpuExportPipeline::process_frame_to_cpu()：
                // GPU texture → staging buffer → CPU Vec<u8>。
                let rgba = self.ctx.readback_texture_rgba(handle.as_raw(), width, height)?;
                let tx = self.result_tx.lock().unwrap().take()
                    .ok_or(Error::AlreadyCompleted)?;
                let _ = tx.send(rgba);
            }
            _ => return Err(Error::UnsupportedOutput),
        }
        Ok(())
    }

    fn flush(&self) -> Result<()> { Ok(()) }

    fn close(&self) -> Result<()> { Ok(()) }
}
```

`oneshot::Sender::send(self, ...)` 会消费 sender，因此 `SnapshotSink` 不能直接在 `submit(&self)` 中持有裸 `oneshot::Sender`。`Mutex<Option<Sender>> + take()` 是该 trait 设计下的唯一正确 ownership 模式；第二次提交应返回 `AlreadyCompleted` 或被调用方视为逻辑错误。

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

StreamSink 通过 `HwAccelEncoder::supports_gpu_input()` 在内部处理平台差异；如果所需 zero-copy 路径不可用，就快速失败：

```rust
// submit 内的平台分发（简化版，完整实现见上文 §3.2）
impl PipelineSink for StreamSink {
    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(VideoOutput::GpuFrame(VideoGpuFrame { handle, pts, width, height, .. })) => {
                let mut enc = self.encoder.lock().unwrap();
                let tb = f64::from_bits(self.time_base.load(Ordering::Relaxed));
                if !enc.supports_gpu_input() {
                    return Err(UnsupportedCapability {
                        capability: "zero-copy GPU encoder input",
                        detail: "GPU-rendered stream/export requires IOSurface, VaSurface, or D3D11Texture input; CPU encode path is forbidden",
                    });
                }
                let packets = enc.encode_frame_gpu(handle.as_raw(), pts)?;
                for p in &packets {
                    let _ = self.video_tx.send(pack_h264_frame(p, width, height, tb));
                }
            }
            _ => { /* 音频单独处理 */ }
        }
        Ok(())
    }
}
```

上层（pipeline、stream runner）保持平台无关。macOS 通过 IOSurface → VideoToolbox 启用。Linux/Windows 上 GPU 渲染的实时流/导出必须在 VaSurface/D3D11Texture 的 zero-copy/native-handle interop 实现后才能启用；不得使用 GPU readback + CPU encode。

---

## 第四部分：GPU 资源管理

### 4.1 当前状态 —— 未受控共享

单个 `Arc<GpuContext>` 包装一个 wgpu Device + Queue，并被所有管线共享：

```rust
pub struct GpuContext {
    adapter: wgpu::Adapter,
    device: Arc<wgpu::Device>,   // 线程安全，内部串行化
    queue: Arc<wgpu::Queue>,     // 线程安全，内部串行化
    info: GpuInfo,
    staging_buffer_pool: BufferPool,
}
```

GpuContext 上没有 mutex。wgpu Device/Queue 通过 `Queue::submit()` 的内部串行化自行处理同步。

### 4.2 资源池

| 资源池    | 上限                           | 争用模型                                        |
| --------- | ------------------------------ | ----------------------------------------------- |
| Decoder   | 总计 16，每文件 2 个           | `Mutex<PoolState>`，按需创建直到上限            |
| Encoder   | 总计 4 个                      | `Mutex<Vec<PooledEncoder>>`，按需创建直到上限   |
| IOSurface | 无固定上限（每 backing store） | Apple 系统资源，约 4-6 个并发 VT session 后退化 |

### 4.3 并发管线场景

| 场景        | 管线                     | 风险                        |
| ----------- | ------------------------ | --------------------------- |
| 编辑 + 预览 | Timeline preview × 1     | 低                          |
| 编辑 + 导出 | Preview + ExportJob      | 中 —— GPU 时间片争用        |
| 多流        | Timeline + Video + Scene | **高** —— 3 条并发 GPU 管线 |
| 转码 + 预览 | 后台转码 + 任意预览      | 中 —— 编码器池压力          |

### 4.4 提议：GPU Budget Controller

```rust
pub struct GpuBudgetController {
    ctx: Arc<GpuContext>,
    active_pipelines: Mutex<Vec<PipelineEntry>>,
    max_concurrent_gpu_pipelines: usize,  // 默认：3
    max_concurrent_encoders: usize,       // 默认：4（与池大小一致）
    interactive_frame_time_ema: AtomicU64,// Interactive 帧时间指数移动平均（ns）
    total_frame_time_weighted_ema: AtomicU64, // 所有管线加权帧时间 EMA（ns）
    queue_done_delay_ema: AtomicU64,      // Queue::on_submitted_work_done 延迟 EMA（GPU 队列深度代理）
    degradation_threshold_ns: u64,        // 默认：18_000_000（18ms，超过 16.6ms 预算）
}

struct PipelineEntry {
    id: StreamId,
    priority: PipelinePriority,
    last_frame_time_ns: u64,
    weight: u8,  // Interactive > Export > Transcode
}

pub enum PipelinePriority {
    Interactive,  // 编辑预览：最高优先级，永不降级
    Export,       // 用户触发导出：可排队，但不降级
    Transcode,    // 后台代理/转码：可暂停/限流，永不迁移到 CPU
}
```

**压力触发条件**：wgpu 不暴露 GPU 利用率指标。因此 controller 使用 **多信号帧时间反馈**：

- 主信号：Interactive 管线的帧时间 EMA 超过 `degradation_threshold_ns`（18ms，表示交互预览受影响）
- 次级信号 A：所有活跃管线的加权帧时间 EMA 超过并发预算（避免后台 Transcode 消耗大量 GPU 但 Interactive 内容简单时漏判）
- 次级信号 B：`wgpu::Queue::on_submitted_work_done` 回调延迟持续升高（作为 GPU 队列深度代理）

这些指标可通过 `process_frame_to_iosurface_timed()` 已返回的 `GpuPipelineTiming` 和提交完成回调观测。预算控制必须同时记录 per-pipeline frame time 和全局 weighted EMA；只看 Interactive EMA 不足以判断系统总 GPU 压力。

**优先级规则**：

- `Interactive` > `Export` > `Transcode`
- GPU 过载时，`Transcode` 管线会被**暂停**
- `Export` 在 `Interactive` 后排队，但不会降级
- 建议把编码器池从 4 增加到 6，以支持导出 + 预览 + 转码并发

**预算响应的真实含义**（纠正一个设计缺陷）：

原设计曾建议把 Transcode 降级为 `process_frame_to_nv12()` + 软件编码。但 `process_frame_to_nv12()` 仍会运行完整 GPU 合成管线（`process_frame_timed()`），只是跳过 zero-copy IOSurface 路径并增加一次 CPU readback。这不会降低 GPU 负载，反而增加工作量（GPU 合成 + GPU RGBA→NV12 + CPU readback）。

真正降低 GPU 负载的选项：

1. **暂停** —— 完全暂停 Transcode 管线，直到 Interactive 帧时间恢复（最简单，P2 推荐）
2. **降低分辨率** —— 以半分辨率转码（GPU texture 操作减少约 4 倍）
3. **降低帧率** —— 每 N 帧转码一次（按比例减少 GPU 调用）

对视频帧、3D 渲染或 puppet 渲染来说，CPU 执行不是负载削减方案。它要么保留 GPU 工作并增加 readback stall，要么把高吞吐渲染转移到 CPU，带来 UI/系统卡顿风险。P2 实现选项 1（暂停）。选项 2-3 是 P3 增强项。

---

## 第五部分：效果系统解耦

### 5.1 三个彼此隔离的效果子系统

| 维度       | 视频 GPU 效果                                    | 音频 DSP                    | ML 推理                          |
| ---------- | ------------------------------------------------ | --------------------------- | -------------------------------- |
| 数据格式   | wgpu Texture（Rgba8Unorm）                       | `&mut [f32]` PCM            | 文件路径（String）               |
| GPU 上下文 | `Arc<GpuContext>`（wgpu）                        | 无（CPU-only）              | ONNX EP（CoreML/CUDA，独立设备） |
| 调度时机   | 逐帧 16ms（实时）                                | 每 buffer 约 5ms（实时）    | 秒级（离线 batch）               |
| 抽象       | 无统一 trait                                     | `AudioEffect` trait         | `IMlService` trait               |
| 组合方式   | Ping-pong 链                                     | `EffectChain` 顺序执行      | 无组合，单次调用                 |
| 插件扩展   | `CustomShaderProcessor.register_custom_shader()` | `build_effect_chain()` 工厂 | 无                               |

### 5.2 耦合点

#### CP1：EffectDispatcher 硬编码路由

`gpu_export_pipeline.rs` 中的 `apply_single_tex()` 对 `effect_type` 字符串做 match（12+ 个分支）。后果：

- 新增 GPU 效果必须修改 match，违反 OCP
- 插件 shader 会落到 `apply_custom_tex_fallback()`，发生 CPU 往返（慢 10-50 倍）
- 运行时无法注册新的 GPU 快路径效果

#### CP2：ML 与 GPU 管线隔离

ML 推理（`IMlService`）输入文件路径、输出文件路径。今天如果要把 AI 放大作为管线效果使用，需要：

```
GPU Texture → readback CPU → save file → ONNX load file → inference
  → save file → load file → upload GPU (4 file I/O + 2 GPU↔CPU copies)
```

#### CP3：音频 DSP 工厂硬编码

`effect_factory.rs` 中的 `create_effect()` 匹配 13 种类型。未知类型会静默生成 `Gain(0.0)`（直通），这应该是错误。

#### CP4：插件激活未接线

`PluginActivationHandler` trait 已存在但没有实现。插件 manifest 中的 `capabilities` 没有流入任何效果注册表。

### 5.3 提议：GpuEffect Trait

用基于注册表的查找替代硬编码分发：

```rust
pub trait GpuEffect: Send + Sync {
    fn id(&self) -> &str;

    /// Texture-to-texture 快路径（所有注册效果都必须实现）
    fn apply_tex(
        &self,
        ctx: &GpuContext,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &EffectParams,
    ) -> Result<()>;

    /// 参数定义（用于 UI 生成和校验）
    fn param_defs(&self) -> &[ParamDef];

    /// 预估 GPU 成本（ns）。默认返回 0，P2 可由重型效果覆盖。
    /// 该默认方法在 P0 预留接口，避免 P2 增加预算预测时产生 breaking change。
    fn estimated_cost(&self, width: u32, height: u32, params: &EffectParams) -> u64 {
        0
    }

    /// 是否支持原地修改同一张 texture。
    /// 默认 false，P0 仍按 ping-pong 双 buffer 执行；P2 可由 color correction
    /// 等安全的 in-place 效果覆盖为 true，让 EffectDispatcher 减少临时 texture 分配。
    fn supports_in_place(&self) -> bool {
        false
    }
}
```

**EffectDispatcher 迁移方式**：

```rust
// 之前：硬编码 match（违反 OCP）
fn apply_single_tex(&self, fx: &ElementEffect, ...) {
    match fx.effect_type.as_str() {
        "gaussian-blur" => self.blur_processor.apply_blur_tex(...),
        // 12+ 个分支...
        _ => self.apply_custom_tex_fallback(...),  // CPU 往返
    }
}

// 之后：注册表查找（符合 OCP）
pub struct EffectDispatcher {
    effects: HashMap<String, Box<dyn GpuEffect>>,
    ctx: Arc<GpuContext>,
}

fn apply_single_tex(&self, fx: &ElementEffect, ...) {
    match self.effects.get(&fx.effect_type) {
        Some(effect) => effect.apply_tex(&self.ctx, input, output, &params)?,
        None => return Err(UnknownEffect(fx.effect_type.clone())),
    }
}
```

现有 processor（`GpuBlurProcessor`、`GpuStyleProcessor`、`CustomShaderProcessor` presets）在初始化时被包装为 `GpuEffect` 实现。

### 5.4 提议：AudioEffectFactory 注册表

```rust
pub struct AudioEffectFactory {
    creators: HashMap<
        String,
        Arc<dyn Fn(&AudioEffectConfig) -> Result<Box<dyn AudioEffect>> + Send + Sync>,
    >,
}

impl AudioEffectFactory {
    pub fn register(
        &mut self,
        type_name: &str,
        creator: impl Fn(&AudioEffectConfig) -> Result<Box<dyn AudioEffect>> + Send + Sync + 'static,
    );

    pub fn create(&self, config: &AudioEffectConfig) -> Result<Box<dyn AudioEffect>> {
        let creator = self.creators.get(&config.effect_type)
            .ok_or_else(|| Error::UnknownEffect(config.effect_type.clone()))?;
        creator(config)
    }
}
```

用注册表查找替换 `create_effect()` 的硬编码 match。未知类型返回 `Err`，而不是静默直通。

`AudioEffectFactory` 可能被多个 mix stream 并发读取，因此 creator 必须是 `Send + Sync`，并用 `Arc<dyn Fn ...>` 存储。注册发生在启动或插件激活阶段；运行期创建 effect 只读 factory。

### 5.5 提议：统一能力注册表

```rust
pub struct EffectCapability {
    pub id: String,                    // "com.neko.blur.gaussian"
    pub kind: EffectKind,              // Shader | AudioDsp | MlModel | Transition
    pub source: EffectSource,          // BuiltIn | Plugin { plugin_id } | Custom
    pub params: Vec<ParamDef>,
    pub realtime: bool,                // 是否可逐帧运行
    pub gpu_required: bool,
}

pub enum EffectKind {
    Shader,      // wgpu texture-to-texture，实时
    AudioDsp,    // 原地 f32 PCM buffer，实时
    MlModel,     // ONNX 推理，离线或准实时
    Transition,  // 双帧混合，实时
}

pub struct EffectRegistry {
    capabilities: RwLock<HashMap<String, EffectCapability>>,
    shader_dispatcher: Arc<Mutex<EffectDispatcher>>,
    audio_factory: Arc<Mutex<AudioEffectFactory>>,
    ml_service: Option<Arc<dyn IMlService>>,
    transition_processor: Arc<TextureTransitionProcessor>,
}
```

`capabilities` 是读多写少的数据结构：`effects:list-capabilities` 会频繁读取，插件 `on_activate` / `on_deactivate` 偶尔写入。因此必须使用 `RwLock<HashMap<...>>`，不能裸持有 `HashMap`。这样可以避免 list-capabilities action 与插件激活/卸载并发时的数据竞争。

`EffectCapability` 和 `ParamDef` 可以放在 `engine-types` 的前提是：它们必须保持零内部依赖。`ParamDef` 只能使用 Rust 原始类型、`String`、`Vec`、数组和本 crate 内 enum；不得引用 `glam::Vec2/Vec3`、`bevy_ecs::World`、wgpu 类型或 engine-kernel 类型。向量、颜色、范围等参数必须用 `[f32; 2]`、`[f32; 3]`、`[f32; 4]` 或 `Vec<f32>` 表示：

```rust
pub struct ParamDef {
    pub id: String,
    pub label: String,
    pub kind: ParamKind,
    pub default: ParamValue,
    pub range: Option<ParamRange>,
}

pub enum ParamKind {
    Bool,
    Int,
    Float,
    String,
    Vec2,
    Vec3,
    Vec4,
    ColorRgba,
    Enum { options: Vec<String> },
}

pub enum ParamValue {
    Bool(bool),
    Int(i32),
    Float(f32),
    String(String),
    Vec2([f32; 2]),
    Vec3([f32; 3]),
    Vec4([f32; 4]),
    ColorRgba([f32; 4]),
}

pub struct ParamRange {
    pub min: Option<f32>,
    pub max: Option<f32>,
    pub step: Option<f32>,
}
```

如果后续某类参数确实需要 glam/wgpu/bevy_ecs 表达能力，则该参数定义必须留在 `engine-kernel` 或 runtime crate 中，并通过可序列化的 primitive DTO 投影到 `engine-types`。

**插件激活桥接**：

> **manifest 字段说明**：当前 `PluginCapability` 有 `capability_type`、`entry`、`params`，但没有 `id` 字段。
> 这个设计要求在 `manifest.rs` 中为 `PluginCapability` 增加 `id: String` 字段。
> 在此之前，`id` 通过 `"{plugin_id}.{capability_type}.{entry_stem}"` 派生。

```rust
impl PluginActivationHandler for EffectRegistryActivator {
    fn on_activate(&self, plugin_id: &str, kind: PluginKind, caps: &[PluginCapability], path: &Path) -> Result<(), String> {
        for cap in caps {
            // 派生 capability ID（直到 manifest 拥有显式 `id` 字段）
            let cap_id = format!("{}.{}.{}", plugin_id, cap.capability_type,
                path.join(&cap.entry).file_stem().unwrap_or_default().to_string_lossy());

            match kind {
                PluginKind::Shader => {
                    let wgsl = fs::read_to_string(path.join(&cap.entry))
                        .map_err(|e| e.to_string())?;
                    let params = cap.params.iter().map(to_param_def).collect();
                    self.registry.shader_dispatcher.lock()
                        .register_plugin_effect(plugin_id, &cap_id, &wgsl, params)?;
                }
                PluginKind::Model => {
                    self.registry.ml_service.as_ref()
                        .ok_or("ML not available")?
                        .register_model(&cap_id, &path.join(&cap.entry).to_string_lossy(), "onnx", &cap.capability_type)?;
                }
                PluginKind::Lut => {
                    self.registry.shader_dispatcher.lock()
                        .register_lut(&cap_id, &path.join(&cap.entry))?;
                }
                _ => {}
            }
            self.registry.capabilities.write().unwrap().insert(cap_id.clone(), EffectCapability {
                id: cap_id,
                kind: plugin_kind_to_effect_kind(kind),
                source: EffectSource::Plugin { plugin_id: plugin_id.to_string() },
                params: cap.params.iter().map(to_param_def).collect(),
                realtime: kind == PluginKind::Shader,
                gpu_required: kind == PluginKind::Shader,
            });
        }
        Ok(())
    }

    fn on_deactivate(&self, plugin_id: &str, kind: PluginKind) -> Result<(), String> {
        // 删除该插件注册的全部能力
        let to_remove: Vec<String> = {
            let capabilities = self.registry.capabilities.read().unwrap();
            capabilities.iter()
                .filter(|(_, cap)| matches!(&cap.source, EffectSource::Plugin { plugin_id: pid } if pid == plugin_id))
                .map(|(id, _)| id.clone())
                .collect()
        };

        for id in &to_remove {
            self.registry.capabilities.write().unwrap().remove(id);
            match kind {
                PluginKind::Shader => {
                    self.registry.shader_dispatcher.lock().unregister_effect(id);
                }
                PluginKind::Model => {
                    if let Some(ml) = &self.registry.ml_service {
                        ml.unregister_model(id);
                    }
                }
                PluginKind::Lut => {
                    self.registry.shader_dispatcher.lock().unregister_lut(id);
                }
                _ => {}
            }
        }
        Ok(())
    }
}
```

### 5.6 ML 集成阶段

#### 阶段 A —— 离线预处理（当前架构）

不需要架构变更。ML 作为管线外的预处理步骤运行：

```
用户标记某个 clip 需要 AI 放大 →
  engine 离线执行：upscale(input_file, output_file) →
  TS 替换 timeline source → 普通 GPU 管线播放放大后的文件
```

当前的 `models:upscale` action 已经可以做到。这是对单个片段执行 AI 去噪、超分和风格迁移的务实路径。

#### 阶段 B —— 面向导出的 GPU 桥接（中期）

ONNX Runtime 支持通过 IOBinding 处理 GPU tensor 输入/输出：

```rust
pub trait MlGpuBridge: Send + Sync {
    fn texture_to_ort_value(&self, texture: &wgpu::Texture, w: u32, h: u32) -> Result<ort::Value>;
    fn ort_value_to_texture(&self, value: &ort::Value, ctx: &GpuContext) -> Result<wgpu::Texture>;
}
```

平台实现：

- macOS：wgpu（Metal）→ MTLSharedEvent → CoreML EP → Metal texture → wgpu import
- CUDA：wgpu（Vulkan）→ Vulkan external memory → CUDA → Vulkan external memory → wgpu
- 不允许 GPU 驻留 CPU 桥接：texture readback → ONNX CPU → texture upload 在视频/scene/puppet 热路径中被禁止。CPU ONNX 只保留为阶段 A 的离线预处理，用于产出新资产，而不是逐帧桥接。

**约束**：ML 模型推理每帧需要 50-500ms，无法在 60fps 下逐帧运行。适用于：

- 导出时效果（没有实时约束）
- 关键帧预计算（每 N 帧一次，中间插值）
- 低分辨率实时预览 + 全分辨率导出

#### 阶段 C —— 实时 ML 效果（长期）

需要轻量量化模型（TensorRT INT8、CoreML ANE 优化）+ 专门推理管线。本 ADR 不讨论。

### 5.7 Transition 组合

当前状态下，transition 和 effect 是彼此独立的 GPU pass，按顺序执行：先 transition，再逐元素 effect。它们不能直接组合（例如“过渡期间模糊”需要外部编排）。

把 transition 注册成支持双输入的 `GpuEffect` 变体，就可以实现组合：

```rust
pub trait GpuTransitionEffect: Send + Sync {
    fn apply_transition_tex(
        &self,
        ctx: &GpuContext,
        input_a: &wgpu::Texture,
        input_b: &wgpu::Texture,
        output: &wgpu::Texture,
        progress: f32,
        params: &EffectParams,
    ) -> Result<()>;
}
```

这是 P3 增强项；当前的顺序执行已经足够覆盖大多数工作流。

---

## 第六部分：解耦后的组合场景

| 场景                      | 之前                                 | 之后                                                |
| ------------------------- | ------------------------------------ | --------------------------------------------------- |
| 插件 shader + 内建效果    | Plugin → CPU fallback（慢 10-50 倍） | Plugin → 同一条 `GpuEffect` 快路径                  |
| AI 放大 + 色彩校正        | 在管线里做不到                       | 阶段 A：先预处理再渲染；阶段 B：导出时走 GPU bridge |
| 通过插件提供新的音频效果  | 做不到                               | 通过激活处理器调用 `AudioEffectFactory.register()`  |
| 从 GPU 合成结果生成截图   | 先编码 H.264 再解码                  | `SnapshotSink` 直接读取 GPU texture                 |
| 替代编码器（AV1/HEVC）    | PreviewPipeline 中硬编码 H.264       | `StreamSink` 使用不同编码器                         |
| GPU 合成 → 分析工具       | 做不到                               | 自定义 `PipelineSink` 接收 `VideoOutput::GpuFrame`  |
| transition 与 effect 交错 | 只能顺序 pass                        | 注册表中的 `GpuTransitionEffect`（P3）              |
| 插件提供的 ML 模型        | 做不到                               | `PluginKind::Model` → `ModelRegistry.register()`    |

---

## 第七部分：解耦后的架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                      控制层                                          │
│  host-api / host-http / host-napi                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      契约层（engine-types）                          │
│  PipelineOutput | VideoOutput | AudioOutput | PreviewArtifact        │
│  EffectCapability | GpuOutputHandle | FrameData                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      治理层                                          │
│  EffectRegistry (GpuEffect | AudioEffect | MlModel | Transition)     │
│  GpuBudgetController (frame-time EMA + priority)                     │
│  PluginManager + PluginActivationHandler                             │
│  PreviewProviderRegistry                                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      计算层                                          │
│  runtime-scene (BevySceneWorld)  │  runtime-puppet (BevyPuppetWorld)  │
│  AudioMixdown + DSP EffectChain  │  runtime-ml (ONNX inference)      │
│  HwAccelDecoder pool             │  Video timeline state             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      渲染与处理层                                    │
│  GpuExportPipeline (GPU composite + effects)                         │
│  SceneRenderer (PBR, from RenderWorld snapshot)                       │
│  PuppetRenderer (SpriteBatch, from DeformedMeshes)                   │
│  AudioMixdown.mix_buffer() → f32 PCM                                 │
│                                                                      │
│  输出: VideoOutput::GpuFrame | AudioOutput::PcmF32                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      输出层（PipelineSink）                          │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐  │
│  │StreamSink│ │MuxerSink │ │PreviewSink│ │SnapshotSk│ │AudioSink│  │
│  │H.264→WS  │ │MP4/MOV   │ │RGBA/JPEG  │ │oneshot   │ │PCM→WS   │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘ └─────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**视频热路径**（zero-copy，60fps）：

```
HwAccelDecoder → GPU texture → GpuExportPipeline → VideoOutput::GpuFrame
  → StreamSink: encode_frame_gpu(IOSurface) → pack_h264_frame → broadcast → WebSocket
```

**音频路径**（CPU，低延迟）：

```
AudioDecoder → AudioMixdown → DSP EffectChain → AudioOutput::PcmF32
  → AudioSink: pack_pcm_f32le_stream_frame → broadcast → WebSocket
```

**预览路径**（按需，独立于热路径）：

```
PreviewProviderRegistry.generate_preview(file)
  → ImagePreviewProvider: decode + resize → PreviewArtifact::StaticImage
  → ScenePreviewProvider: load + render one frame → PreviewArtifact::StaticImage
  → VideoPreviewProvider: seek + decode one frame → PreviewArtifact::StaticImage
```

---

## 分阶段实施计划

**优先级轴线**：IO（PipelineSink）→ Dual API（OOP+ECS）→ ECS 层（计算-渲染拆分）→ GPU（预算 + Renderer）

### P0：基础能力 —— IO + Dual API + ECS 拆分 + Effect Registry（约 1100 行）

#### P0-PR1：PipelineSink Trait + StreamSink（约 180 行）

**变更文件**：

- 新增：`engine-kernel/src/services/pipeline_sink.rs` —— `PipelineSink` trait + `PipelineOutput` + `VideoOutput` + `AudioOutput` + `GpuOutputHandle`
- 新增：`engine-kernel/src/services/impls/stream_sink.rs` —— `StreamSink`（encoder 移到这里）
- 修改：`engine-kernel/src/preview/pipeline.rs` —— 移除 encoder，返回 `VideoGpuFrame`
- 修改：`engine-kernel/src/services/impls/timeline.rs` —— 使用 `StreamSink`，替代内联编码

**行为不变量**：流输出保持一致。编码只是从 pipeline 移到 sink。

**回滚策略**：P0-PR1 保留临时 feature flag `use_pipeline_sink: bool`。默认走新 `PipelineSink + StreamSink` 路径；若出现性能回归，可临时切回旧的内联编码路径以保障预览可用。flag 定义必须标记为 `#[deprecated(since = "P1", note = "Remove after P1 validation")]`，并在 P1-PR1 删除，避免 P1 延期导致双路径长期存在。

#### P0-PR2：SnapshotSink（约 40 行）

**变更文件**：

- 新增：`engine-kernel/src/services/impls/snapshot_sink.rs` —— `SnapshotSink`
- 修改：`engine-kernel/src/services/impls/timeline.rs` —— snapshot 路径使用 `SnapshotSink`

**新增能力**：GPU 合成 → RGBA，无需编码 + 解码往返。

#### P0-PR3：Dual API Trait 定义 —— CreativeAccess + DataAccess（约 120 行）

**crate 放置位置**：trait 分别放在 `runtime-scene` 和 `runtime-puppet`（这两个 crate 已经依赖 `bevy_ecs` + `glam`）。不要放在 `engine-types`：因为 `CreativeAccess` 使用 `Vec3`/`Quat`（glam），`DataAccess` 使用 `World`（bevy_ecs），把这些依赖加到 `engine-types` 会破坏它的零依赖保证。`engine-kernel` 已经依赖两个 runtime crate，因此可以直接使用这些 trait。

**变更文件**：

- 新增：`runtime-scene/src/access.rs` —— `CreativeAccess` + `DataAccess` trait 定义
- 修改：`runtime-scene/src/world.rs` —— `BevySceneWorld` 实现两个 trait
- 新增：`runtime-puppet/src/access.rs` —— puppet 领域的并行 trait 定义
- 修改：`runtime-puppet/src/world.rs` —— `BevyPuppetWorld` 实现两个 trait

`ExtractParams`、`EntityFilter`、`SerializedScene`、`ProceduralSpec`、`ModelingDelta` 等 DataAccess 关联 DTO 全部定义在对应 runtime crate 的 `access.rs` 中，与 trait 同文件。它们可以使用 runtime-scene/runtime-puppet 已有类型（如 `RenderWorld`、`EntityId`、内部 component DTO），不新增 `engine-types` 依赖；如果需要跨 IPC 暴露，再单独设计 primitive DTO 投影。

**访问器模式**：SceneService 暴露 `MutexGuard<'_, BevySceneWorld>`（具体类型），而不是 `MutexGuard<dyn Trait>`（Rust 中不借助 `MutexGuard::map` 或装箱无法直接表达）。调用方通过 trait 方法语法使用这个 guard。约束通过架构方式执行（模块可见性 + code review），不是在 Service 边界由编译器强制。

**DataAccess 设计 —— 处理 `extract_render_world` 的可变性**：

当前 `extract_render_world()` 接收 `&mut World`，因为 `bevy_ecs::World::query()` 需要 `&mut self`（用于 ECS archetype tracking）。这意味着“只读提取”在 ECS 层仍需要独占访问。Dual API 的目标不是把 `ecs_world_mut()` 改个名字，而是把常见数据访问收敛到 typed methods；原始 `&mut World` 只作为 `pub(crate)` 级别的受控 escape hatch：

```rust
pub trait DataAccess {
    /// 渲染提取：内部短暂使用 &mut World，但调用方拿不到 World。
    fn extract_render_world(&mut self, params: ExtractParams) -> Result<RenderWorld>;

    /// 序列化读取：按过滤条件导出 entity/component DTO。
    fn serialize_entities(&mut self, filter: EntityFilter) -> Result<SerializedScene>;

    /// 程序化生成：以受控 bundle 描述创建实体。
    fn spawn_procedural(&mut self, spec: ProceduralSpec) -> Result<EntityId>;

    /// 建模子系统的受控批量变更入口。
    fn apply_modeling_delta(&mut self, delta: ModelingDelta) -> Result<()>;
}

pub(crate) trait RawWorldAccess {
    /// 仅 runtime crate 内部和迁移期使用。
    /// 不对 host-api/controller/renderer 暴露。
    #[deprecated(note = "Use typed DataAccess methods instead")]
    fn ecs_world_mut_raw(&mut self) -> &mut World;
}
```

**并发模型**：CreativeAPI 和 DataAPI 不能在同一个 `Mutex<BevySceneWorld>` 上真正并发运行。这里的解耦收益是**时间上的**：计算-渲染拆分（PR4）在短暂加锁期间提取 `RenderWorld` 快照，然后释放 Mutex。renderer 独立处理快照。这是对现有 `extract_render_world()` 模式的正式化：

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

**行为不变量**：外部 API 不变。DataAccess 将现有绕过点提升为类型化方法；原始 World 访问只保留为 crate 内部迁移工具。

**依赖**：无。可与 PR1/PR2 并行推进。

#### P0-PR4a：SceneComputation 提取 + SceneService facade（约 220 行）

**变更文件**：

- 新增：`engine-kernel/src/services/impls/scene_computation.rs` —— `SceneComputation`（tick + extract；持有 `Mutex<BevySceneWorld>`，暴露 `creative()` + `data()`）
- 修改：`engine-kernel/src/services/impls/scene.rs` —— `SceneService` 变成轻量 facade；委托给 computation + renderer

**行为不变量**：scene controller 行为不变；只是把 live World 持有者迁移到 SceneComputation。

**范围边界**：SceneService facade 必须保留所有现有 public 方法签名，17+ 个 controller 委托方法在本 PR 中不改变调用方式，只把内部实现转发到 SceneComputation。这样 PR4a 主要是结构迁移和内部委托，约 220 行才可控；如果同时修改 controller 调用面，应拆出额外 PR，不能塞进 PR4a。

#### P0-PR4b：SceneRenderer 独立 + channel 接线（约 260 行）

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

#### P0-PR5：消除 `ecs_world_mut()` 逃逸口（约 80 行）

**变更文件**：

- 修改：`engine-kernel/src/services/impls/scene.rs` —— 18 个 `ecs_world_mut()` 调用点全部迁移到类型化 DataAccess 调用
- 修改：`runtime-scene/src/world.rs` —— 从公开 API 中移除 `ecs_world_mut()`；补齐 `extract_render_world()`、`serialize_entities()`、`spawn_procedural()`、`apply_modeling_delta()` 等 typed DataAccess 方法；原始 `ecs_world_mut_raw()` 仅保留为 `pub(crate)` + `#[deprecated]`

**验证**：controller 只在 CreativeAccess 可见的情况下通过编译；SceneRenderer 不导入 World/DataAccess（只操作 RenderWorld 快照）。

#### P0-PR6：GpuEffect Trait + EffectDispatcher 注册表（约 200 行）

**变更文件**：

- 新增：`engine-kernel/src/gpu/effect_trait.rs` —— `GpuEffect` trait + `EffectParams`
- 修改：`engine-kernel/src/export/gpu_export_pipeline.rs` —— EffectDispatcher 从 match 改为 HashMap
- 修改：`engine-kernel/src/gpu/blur_processor.rs` —— 每种 blur 类型包装为 `GpuEffect`
- 修改：`engine-kernel/src/gpu/style_processor.rs` —— 每种 style effect 包装为 `GpuEffect`
- 修改：`engine-kernel/src/gpu/custom_shader_processor.rs` —— presets 包装为 `GpuEffect`

**行为不变量**：现有效果分发产出一致。只改变内部路由。

**关键收益**：消除已知效果上的 `apply_custom_tex_fallback` CPU 往返。

### P1：插件接线 + 音频注册表 + ML 预处理（约 410 行）

#### P1-PR1：AudioEffectFactory 注册表（约 60 行）

**变更文件**：

- 修改：`engine-kernel/src/audio/dsp/effect_factory.rs` —— 带 register/create 的 `AudioEffectFactory` struct
- 修改：`engine-kernel/src/services/audio_mixdown.rs` —— 使用 factory 替代 `create_effect()`
- 修改：`engine-kernel/src/preview/pipeline.rs` / timeline 接线 —— 删除临时 `use_pipeline_sink` feature flag 和旧内联编码路径

**行为变化**：未知效果类型返回 `Err`，而不是静默 `Gain(0.0)` 直通。

#### P1-PR2：PluginActivationHandler 实现（约 150 行）

**变更文件**：

- 新增：`host-api/src/plugin/activation.rs` —— 实现 `PluginActivationHandler` 的 `EffectRegistryActivator`
- 修改：`host-api/src/engine.rs` —— 将 activator 接入 PluginManager

**能力**：插件 shader/audio/model 能力在激活时自动注册。

#### P1-PR3：EffectCapability + TS Discovery（约 100 行）

**变更文件**：

- 新增：`engine-types/src/effect_capability.rs` —— `EffectCapability`、`EffectKind`、`EffectSource`
- 修改：`host-api/src/controllers/effects.rs` —— 新增 `list-capabilities` action
- 修改：TS `effects.ts` —— 动态拉取能力，替代硬编码 `BUILT_IN_EFFECTS`

**能力**：前端自动发现可用效果，包括插件提供的效果。

#### P1-PR4：ML 离线预处理工作流（约 80 行）

**变更文件**：

- 修改：`host-api/src/controllers/models.rs` —— 新增 `preprocess` action（upscale/denoise，并带 source replacement metadata）
- 修改：TS timeline/audio 集成 —— 将预处理结果作为 source swap 应用

**能力**：AI upscale/denoise 作为片段预处理集成进项目工作流。

### P2：GPU Budget + MuxerSink + Puppet + Effect 优化（约 850 行）

#### P2-PR1：GpuBudgetController（约 120 行）

**变更文件**：

- 新增：`engine-kernel/src/gpu/budget.rs` —— `GpuBudgetController` + `PipelinePriority` + frame-time EMA
- 修改：`engine-kernel/src/services/impls/timeline.rs` —— 管线前获取 permit，并上报 frame time
- 修改：`engine-kernel/src/services/impls/video.rs` —— 获取 permit，接受降级/限流结果
- 修改：`engine-kernel/src/export/service.rs` —— 获取 permit

**能力**：基于帧时间优先级的并发管线管理。

#### P2-PR2：MuxerSink + 导出统一（约 80 行）

**变更文件**：

- 新增：`engine-kernel/src/services/impls/muxer_sink.rs` —— `MuxerSink`（在同步 PipelineSink 背后封装 AsyncExportPipeline；AsyncExportPipeline 变为内部 channel consumer，不再被导出循环直接调用）
- 修改：`engine-kernel/src/export/service.rs` —— 导出循环使用 `MuxerSink`

**能力**：导出路径与流式路径使用同一个 PipelineSink 抽象。`AsyncExportPipeline.submit_composited()` 不再是公开入口。

#### P2-PR3：Puppet WebSocket Command Protocol（约 120 行）

**变更文件**：

- 新增：`engine-types/src/puppet_command.rs` —— `PuppetCommandEnvelope`、`PuppetCommand` enum
- 新增：`host-http/src/routes/puppet_control.rs` —— 带 seq/revision 校验的 WebSocket handler
- 修改：`host-http/src/routes/puppet_stream.rs` —— 统一 WebSocket（commands + delta stream）
- 修改：`engine-kernel/src/services/impls/puppet.rs` —— 接收 `PuppetCommand`，替代原始参数集

**行为变化**：Puppet 输入从 REST 升级到 WebSocket。REST endpoint 仍保留为便捷别名（内部转换成 WebSocket command）。

#### P2-PR4：PuppetRenderer（wgpu SpriteBatch，约 400 行）

**变更文件**：

- 新增：`engine-kernel/src/gpu/puppet_renderer/mod.rs` —— `PuppetRenderer` struct
- 新增：`engine-kernel/src/gpu/puppet_renderer/sprite_batch.rs` —— `SpriteBatch`（instanced quad rendering）
- 新增：`engine-kernel/src/gpu/puppet_renderer/puppet_shaders.wgsl` —— 用于 textured deformed meshes 的 vertex/fragment shader
- 修改：`engine-kernel/src/services/impls/puppet.rs` —— 可选 `PuppetRenderer`（类似 SceneService 的可选 renderer）

**新增能力**：Puppet 产出 `VideoOutput::GpuFrame`，从而支持导出和合成。

#### P2-PR5：EffectDispatcher 成本估算 + in-place 优化（约 120 行）

**变更文件**：

- 修改：`engine-kernel/src/gpu/effect_trait.rs` —— 保留 P0 预留的 `estimated_cost()` 与 `supports_in_place()` 默认方法，并为内建效果补充覆盖实现
- 修改：`engine-kernel/src/export/gpu_export_pipeline.rs` —— EffectDispatcher 在链式应用前读取 `estimated_cost()`，将成本信号上报给 `GpuBudgetController`
- 修改：`engine-kernel/src/gpu/color_correction_processor.rs` —— 对安全的单输入/单输出颜色类效果声明 `supports_in_place() == true`
- 修改：`engine-kernel/src/gpu/effect_dispatcher.rs` —— 在连续 in-place 安全效果之间复用 texture，减少 ping-pong 临时 texture 分配

**安全边界**：`supports_in_place()` 只是分配优化信号，不改变效果语义。只有不依赖邻域采样、不需要历史帧、不读取同一 pass 中被写入像素的效果才能返回 `true`。blur、style transfer、ML bridge、transition、multi-input effect 默认保持 `false`，继续走 ping-pong 双 buffer。

**新增能力**：GPU 预算控制获得效果链的前置成本信号；简单颜色类效果链减少 texture 分配和 copy/transition 开销。

### P3：高级合成 + Puppet 集成（约 570 行，延期）

#### P3-PR1：Puppet H.264 流 + 导出集成（约 150 行）

**变更文件**：

- 修改：`host-http/src/routes/puppet_stream.rs` —— 可选择通过 StreamSink 输出 H.264（同时保留 JSON control stream）
- 修改：`engine-kernel/src/export/gpu_export_pipeline.rs` —— 接收 PuppetRenderer 输出作为可合成图层
- 修改：`neko-puppet/packages/webview/src/components/PuppetCanvas.tsx` —— 使用 H264StreamClient 作为主播放路径；Canvas2D 仅保留用于 legacy/debug 检查

**新增能力**：Puppet 通过 H.264 预览（与 scene 对齐）；puppet 通过 GpuExportPipeline 导出。

#### P3-PR2：ML GPU Bridge（阶段 B，约 300 行）

`MlGpuBridge` trait + 面向导出时 ML 效果的平台实现。

#### P3-PR3：Transition 作为 GpuEffect（约 120 行）

在 EffectRegistry 中注册双输入的 `GpuTransitionEffect` 变体。

---

## 关键设计决策

| 决策                                                         | 理由                                                                                                                    | 备选方案                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 编码放在 Sink，而不是 Pipeline                               | 保留 zero-copy GPU 路径；可在不做 CPU 往返的情况下支持截图和替代编码器                                                  | 编码放在 Pipeline 中（当前做法——耦合导致无法复用）                                    |
| PipelineSink 保持同步，而不是异步                            | 60fps 热路径承受不起 Future 分配；需要异步 I/O 的 sink 使用内部有界 channel                                             | 异步 trait（每帧会因 Future boxing + waker 产生约 200ns 开销）                        |
| GpuEffect 用 HashMap，而不是 match                           | 符合 OCP；插件效果走同一条快路径                                                                                        | 继续 match 并不断增长分支（违反 OCP）                                                 |
| 未知效果返回错误，而不是静默直通                             | 音频里静默 `Gain(0.0)` 会掩盖 bug；视频里的 CPU fallback 会掩盖性能问题                                                 | 保留静默 fallback（会掩盖问题）                                                       |
| 只保留一个 EffectRegistry，而不是按领域拆分                  | 统一插件激活路径；TS 一次就能发现全部能力                                                                               | 每个领域单独注册表（插件接线重复）                                                    |
| GPU 预算基于帧时间反馈，而不是 GPU 利用率                    | wgpu 不提供 GPU 利用率指标；帧时间可直接通过已有 `GpuPipelineTiming` 观测                                               | 查询 GPU 利用率（wgpu 不支持）                                                        |
| GPU 预算是软控制器，而不是硬锁                               | wgpu Device/Queue 是线程安全的；硬锁会把所有 GPU 工作串行化                                                             | 给 GpuContext 套 Mutex（会杀死并发）                                                  |
| Dual API（CreativeAccess + DataAccess）                      | 形式化两种合法访问模式；消除 18 个 `ecs_world_mut()` 逃逸口；可在 Service 层做权限控制                                  | 一个包含全部方法的 trait（没有职责分离）；按场景拆成大量 typed query 方法（方法爆炸） |
| trait 放在 runtime-scene/runtime-puppet，而不是 engine-types | trait 使用 Vec3/Quat（glam）+ World（bevy_ecs）；把它们加进 engine-types 会破坏零依赖保证。runtime crate 已经有这些依赖 | 放在 engine-types（需要 glam+bevy_ecs）；新建 runtime-core crate（P0 不需要）         |
| 先做 Dual API，再做计算-渲染拆分                             | 拆分会物理隔离两个 API 消费者；先定义 API 才能保证拆分边界正确                                                          | 先拆分再补 API（有接口边界错误风险）                                                  |
| 通过 RenderWorld 快照并发，而不是 RwLock                     | bevy_ecs 的 `World::query()` 需要 `&mut`；快照提取已存在；无需改 ECS 就能解耦 tick/render                               | RwLock（bevy_ecs 不为此设计）；真正并发查询（需要修改 bevy_ecs）                      |
| 先做 ML 阶段 A（离线），再做阶段 B（GPU bridge）             | 阶段 A 今天就能做，不改架构；阶段 B 需要平台特定 GPU 互操作                                                             | 直接跳到阶段 B（风险高，还会卡在 ONNX IOBinding）                                     |

---

## 风险与缓解

| 风险                             | 影响                                  | 缓解措施                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GpuEffect trait 开销相对直接调用 | vtable 分发每帧每个 effect 约增加 1ns | 相比 16ms 帧预算可以忽略；前后测量即可                                                                                                                            |
| 插件 shader 在注册时编译失败     | 阻塞插件激活                          | 注册时校验 WGSL；通过 PluginAuditor 报错                                                                                                                          |
| GPU 预算 controller 误判降级     | Transcode 被不必要地暂停或限流        | 使用带滞回的帧时间 EMA（持续高于 18ms 时暂停，低于 14ms 时恢复）；管线数量作为次级保护                                                                            |
| ML GPU bridge 平台碎片化         | macOS/Linux/Windows 需要不同互操作    | 阶段 A（离线）无需互操作即可覆盖 90% 场景                                                                                                                         |
| PipelineSink 同步 submit 阻塞    | 慢 sink 阻塞渲染循环                  | StreamSink 使用 `broadcast::Sender::send()`（落后 receiver 会被丢弃，不是 frame 被丢弃——符合现有模式）；MuxerSink 入队到有界 channel（通过 channel 容量施加背压） |

---

## 验证

**P0（PipelineSink + Dual API + ECS 拆分 + GpuEffect 注册表）**：

- timeline 预览流在重构前后输出相同的 H.264 结果（不要求 bit-exact，但要求视觉等价和时序一致）
- 通过 SnapshotSink 输出的 RGBA 合法，并与 `process_frame_to_cpu()` 输出一致
- 所有效果都通过 HashMap 查找命中（不再回退到 `apply_custom_tex_fallback`）
- SceneService 中 18 个 `ecs_world_mut()` 调用点全部迁移到类型化 DataAccess 调用
- controller（host-api）只在 CreativeAccess 可见时仍可编译通过（不导入 DataAccess）
- SceneRenderer 不导入 World/DataAccess（只操作 RenderWorld 快照）
- 并发 tick + render：tick 继续以目标速率运行，而 render 以独立节奏运行
- `cargo test`（engine-kernel）通过；`pnpm test`（neko-cut）通过
- 性能：帧渲染时间在基线 5% 以内

**P1（插件接线 + 音频注册表）**：

- 测试插件：`kind: Shader` + WGSL 文件 → 自动注册为 `GpuEffect` → 可在 timeline 中使用
- 测试插件：`kind: Model` + ONNX 文件 → 自动注册到 `ModelRegistry` → 可通过 `models:upscale` 使用
- `effects:list-capabilities` 同时返回内建和插件效果
- TS 的 `BUILT_IN_EFFECTS` 从引擎能力动态填充
- 未知音频效果类型返回 `Err`（不是静默直通）

**P2（GPU 预算 + Puppet）**：

- 并发 timeline 预览 + 导出：两者都成功完成，预览保持 >24fps
- 在 active preview 存在时，后台转码会被暂停或限流，但不影响预览（由帧时间 EMA > 18ms 触发）
- 正常并发负载下编码器池不会耗尽（预览 + 导出 + 转码）
- PuppetRenderer 输出在标准姿态下与 Canvas2D 参考图一致
- puppet 产出的 `VideoOutput::GpuFrame` 可与 GpuExportPipeline 中的 timeline 进行合成

**跨平台 GpuOutputHandle 测试策略**：

- macOS（主要开发环境）：使用 IOSurface zero-copy 路径做完整集成测试（CI：macOS runner）
- Linux/Windows：通过 fail-fast 能力测试验证在 zero-copy GPU input 不可用时返回 `UnsupportedCapability`；不走 CPU encode 路径
- 平台特定变体（`VaSurface`、`D3D11Texture`）只在对应 CI runner 可用时测试；通过 `#[cfg(test)]` + feature flags 门禁
- 所有 PipelineSink 实现都用终点 GPU handle 或 mock encoder 做平台无关单测；不再存在可注入的 `CpuFallback` 变体

---

## 第七部分-B：PreviewProviderRegistry —— 文件预览子系统

### 7B.1 问题

文件预览（缩略图、文档渲染、scene 快照）目前没有统一入口。每个扩展都实现自己的预览逻辑，而且如果不知道是哪一个扩展在处理某种文件类型，就无法预览。更关键的是，预览**不能**污染 GPU 热路径——PDF 渲染或 EPUB 页面绝不应该和 60fps 的 timeline composite 争抢资源。

### 7B.2 设计

```rust
/// 预览 provider 注册表：每个 provider 处理一组文件扩展名 / MIME 类型。
/// 运行在 GPU 热路径之外（单独的线程池或异步 runtime）。
pub struct PreviewProviderRegistry {
    providers: Vec<Box<dyn PreviewProvider>>,
}

pub trait PreviewProvider: Send + Sync {
    fn supported_extensions(&self) -> &[&str];
    fn supported_mime_types(&self) -> &[&str];
    fn generate_preview(&self, request: PreviewRequest) -> Result<PreviewArtifact>;
}

pub struct PreviewRequest {
    pub file_path: PathBuf,
    pub max_width: u32,
    pub max_height: u32,
    pub page: Option<u32>,       // for multi-page documents
    pub time: Option<f64>,       // for media files (seek position)
}

/// 预览输出，不属于 PipelineOutput。
/// 这是预览子系统独立的输出模型。
pub enum PreviewArtifact {
    /// 媒体预览：返回现有流基础设施使用的 stream ID。
    MediaStream {
        video_stream_id: Option<StreamId>,
        audio_stream_id: Option<StreamId>,
    },
    /// 静态图片（缩略图、渲染页面、快照）。
    StaticImage(FrameData),
    /// 文本文档内容。
    TextDocument(DocumentText),
    /// 受沙箱约束的 HTML（用于 webview 中的富文档预览）。
    HtmlDocument(SandboxedHtml),
    /// 3D scene handle（用于通过 SceneRenderer 做交互式预览）。
    ModelScene(SceneHandle),
}
```

### 7B.3 内建 Provider

| 提供者                    | 扩展名                | 输出                                                       | GPU？                                            |
| ------------------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `VideoPreviewProvider`    | .mp4/.mov/.mkv/.webm  | `MediaStream` 或 `StaticImage`（流式预览 vs poster frame） | 是（GPU 流路径；静态帧只允许终点 readback）      |
| `AudioPreviewProvider`    | .mp3/.wav/.flac/.ogg  | `MediaStream`（纯音频流）                                  | 否                                               |
| `ImagePreviewProvider`    | .png/.jpg/.webp/.tiff | `StaticImage`（解码 + resize）                             | 否（CPU 图片解码）                               |
| `DocumentPreviewProvider` | .pdf/.epub/.docx      | `StaticImage` 或 `HtmlDocument`                            | 否                                               |
| `ScenePreviewProvider`    | .gltf/.glb/.vrm/.nkm  | `ModelScene`（SceneRenderer 快照）                         | 是（必须 GPU 渲染；静态产物只允许终点 readback） |
| `PuppetPreviewProvider`   | .nkp/.inp             | `ModelScene` 或 `StaticImage`                              | 是（必须 GPU 渲染；静态产物只允许终点 readback） |

CPU 预览路径仍然适用于音频、图片和文档。视频、scene 和 puppet 预览必须在 GPU 上渲染；如果所需 GPU 路径不可用，provider 必须快速失败，而不是改用 CPU 渲染。

### 7B.4 与热路径隔离

```
Timeline Stream（60fps，GPU 热路径）：
  GpuExportPipeline → VideoOutput::GpuFrame → StreamSink → WebSocket
  ↑ 绝不被 preview 阻塞

Preview（按需，独立线程池）：
  PreviewProviderRegistry.generate_preview(request)
    → VideoPreviewProvider：提供用于播放的 MediaStream，或通过终点 readback 渲染一张 poster frame，返回 StaticImage
    → ScenePreviewProvider：加载 scene，通过 SceneRenderer 渲染一帧，返回 StaticImage
    → PuppetPreviewProvider：通过 PuppetRenderer 渲染一帧，返回 StaticImage
    → ImagePreviewProvider：在 CPU 上解码图片并 resize，返回 StaticImage
    → DocumentPreviewProvider：在 CPU 上解析/渲染页面，返回 StaticImage 或 HtmlDocument
```

需要 GPU 的 preview provider（VideoPreviewProvider 的流模式、ScenePreviewProvider、PuppetPreviewProvider）会在 `PipelinePriority::Transcode` 下获取 `GpuBudgetController` permit；如果交互式管线承压，它们会最先被暂停或限流。

### 7B.5 实施优先级

这是一个 **P2** 增量（在 GPU budget 就位之后）：

#### P2-PR6：PreviewProviderRegistry + Image/Document Providers（约 200 行）

**变更文件**：

- 新增：`engine-kernel/src/preview/provider.rs` —— `PreviewProvider` trait + `PreviewProviderRegistry` + `PreviewArtifact`
- 新增：`engine-kernel/src/preview/providers/image.rs` —— `ImagePreviewProvider`
- 新增：`engine-kernel/src/preview/providers/document.rs` —— `DocumentPreviewProvider`（委托给 runtime-media）
- 修改：`host-api/src/controllers/preview.rs` —— 新增 `preview:generate` action

**能力**：统一的文件预览入口。Video/Audio/Scene/Puppet provider 会在 P3 增加，其中 video 会拆成流式预览和 poster-frame 预览。

---

## 第八部分：Puppet/Scene 的计算-渲染-IO 分离

### 8.1 当前架构对比

| 维度          | runtime-scene（3D）                                     | runtime-puppet（2D）                          |
| ------------- | ------------------------------------------------------- | --------------------------------------------- |
| **计算**      | bevy_ecs World（BevySceneWorld，约 1078 行）            | bevy_ecs World（BevyPuppetWorld，约 1003 行） |
| **渲染**      | PbrRenderer（wgpu，引擎侧 GPU）                         | Canvas2D（webview 侧 CPU）                    |
| **流式输出**  | 通过 StreamSink 输出 H.264（zero-copy GPU）             | 通过 WebSocket 输出 JSON delta（CPU 序列化）  |
| **控制平面**  | WebSocket + SceneCommandEnvelope（seq + revision 校验） | REST fire-and-forget（无 seq、无 ordering）   |
| **导出质量**  | Engine GPU render → GpuExportPipeline                   | 无引擎渲染路径（无法导出）                    |
| **Live 模式** | 引擎捕获 + 推流                                         | Webview 捕获（有损，无法合成）                |

### 8.2 耦合点

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

**CP-2：Puppet 没有引擎渲染路径**

PuppetService 只包含计算（`world: Mutex<BevyPuppetWorld>`）。渲染完全委托给 webview：JSON vertex data → Canvas2D。这意味着：

- 没有 GPU 加速的 puppet 渲染
- puppet 输出不能通过 GpuExportPipeline 与 timeline 合成
- 无法产生高质量 puppet 导出
- neko-live 必须捕获 webview（有损），而不是捕获引擎输出

**CP-3：Scene 输入与 WebSocket handler 紧耦合**

`scene_control.rs` 直接在 WebSocket handler 中校验 seq + revision，把传输关注点（WebSocket framing）和领域关注点（命令校验与分发）混在一起。command envelope 格式本身是合理的，但校验逻辑应该位于计算层。

**CP-4：Puppet 输入缺少版本控制**

Puppet command 通过 REST endpoint 到达，没有 sequence number，也没有 revision 校验。来自多个来源的并发编辑（editor UI + agent + live tracking）没有 ordering 保证，也没有冲突检测。

**CP-5：约 600 行重复代码**

| 模块                     | runtime-scene                  | runtime-puppet              | 重复度      |
| ------------------------ | ------------------------------ | --------------------------- | ----------- |
| hierarchy.rs             | Parent/Children components     | Parent/Children components  | 约 90% 相同 |
| animation_blend.rs       | SceneBlendLayer/SceneBlendTree | BlendLayer/BlendTree        | 约 90% 相同 |
| transform_propagation.rs | propagate_scene_transforms     | propagate_puppet_transforms | 约 85% 相同 |

这些重复已在 `adr-2d3d-unified-engine.md` 中识别；shared-core 抽取属于那份 ADR 的范围，不属于本 ADR。这里仅为完整性列出。

### 8.3 哪些需要分离，哪些保持耦合

#### 分离：SceneService → SceneComputation + SceneRenderer

```rust
// 之前（耦合）
impl SceneService {
    fn tick(&self) { /* locks world */ }
    fn render_frame(&self) { /* locks world THEN renderer */ }
}

// 之后（分离）
struct SceneComputation {
    world: Mutex<BevySceneWorld>,
}

struct SceneRenderer {
    renderer: PbrRenderer,
    gpu_ctx: Arc<GpuContext>,
    render_world: RenderWorld,  // 快照，不是共享 Mutex
}

impl SceneComputation {
    fn tick(&self) -> SceneTickResult { /* 只锁 world */ }
    fn extract(&self) -> RenderWorld { /* 单向快照 */ }
}

impl SceneRenderer {
    fn render(&mut self, world: &RenderWorld) -> VideoGpuFrame { /* 不锁 world */ }
}
```

**收益**：计算和渲染可以按不同节奏运行。编辑器可以以 60fps tick，而导出以电影级质量渲染，不阻塞编辑器。

#### 分离：新增 PuppetRenderer（wgpu SpriteBatch）

```rust
struct PuppetRenderer {
    sprite_batch: SpriteBatch,
    gpu_ctx: Arc<GpuContext>,
}

impl PuppetRenderer {
    fn render(&mut self, meshes: &[DeformedMesh], textures: &[TextureAtlas]) -> VideoGpuFrame {
        // GPU sprite batch 渲染：与 SceneRenderer 产出相同的 VideoGpuFrame
    }
}
```

**收益**：Puppet 输出变成 `VideoGpuFrame`，可通过 GpuExportPipeline 与 timeline 合成。由此支持：

- 高质量 puppet 导出（H.264/ProRes）
- 通过 StreamSink 预览 puppet（与 scene 一致）
- neko-live 在引擎内合成 puppet + scene（无需 webview 捕获）

#### 分离：Puppet WebSocket Command Protocol

将 puppet 输入从 REST fire-and-forget 升级为带 command envelope 的 WebSocket：

```rust
struct PuppetCommandEnvelope {
    seq: u64,
    revision: u64,
    command: PuppetCommand,
}

enum PuppetCommand {
    SetParameter { name: String, value: f32 },
    SetPose { parameters: Vec<(String, f32)> },
    PlayAnimation { name: String, blend: BlendConfig },
    // ...
}
```

**收益**：ordering 保证、冲突检测、undo 支持（command log）。

#### 保持耦合：ECS Core（runtime-scene、runtime-puppet）

ECS World 类型（BevySceneWorld、BevyPuppetWorld）应该保持为内聚单元。用 OOP trait shell（SceneWorld/PuppetWorld，约 25-30 个方法）包装 `bevy_ecs::World` 是正确模式：它提供稳定 API 面，同时允许 ECS 内部演进。进一步拆分 ECS World 会割裂 entity-component 模型。

#### 保持耦合：Controller → Service 委托

host-api controller（`SceneController`、`PuppetController`）应继续委托给 service。继续拆分 controller 只会割裂 action routing，没有收益；controller 已经是很薄的分发层。

#### 保持耦合：neko-live renderer（下游消费者）

neko-live 应该消费来自 SceneRenderer 和 PuppetRenderer 的 `VideoGpuFrame`，而不是拥有自己的 renderer。这与 `adr-device-management.md` 中的 neko-live 瘦身方向一致：neko-live 成为 scene compositor，而不是 renderer。

### 8.4 目标三层架构

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

### 8.5 设计决策

| 决策                                            | 理由                                                                                                     | 备选方案                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 提取 RenderWorld 快照，而不是共享 Mutex         | 解耦 tick rate 和 render rate；`extract_render_world()` 已经存在                                         | 保留共享 Mutex（当前做法——render 时阻塞 computation） |
| PuppetRenderer 使用 wgpu SpriteBatch            | puppet 是 textured 2D mesh，SpriteBatch 是自然的 GPU primitive；产出可与 timeline 合成的 `VideoGpuFrame` | 保留 Canvas2D（无导出、无合成、无 GPU 加速）          |
| 将 puppet 升级为 WebSocket command              | 与 scene 在 ordering + revision validation 上对齐；支持 undo log                                         | 保留 REST（无 ordering、无冲突检测）                  |
| Puppet WebSocket 复用 SceneCommandEnvelope 模式 | 控制平面一致；共享校验逻辑                                                                               | 新协议（碎片化、重复实现）                            |
| Canvas2D 仅作为 legacy/debug                    | WebSocket 传递的 sprite data 仍可用于检查，但不是生产渲染 fallback                                       | 完全移除 Canvas2D                                     |
| neko-live 消费 VideoGpuFrame                    | 与 adr-device-management.md 的 neko-live 瘦身方向一致；live 成为 compositor，而不是 renderer             | neko-live 拥有自己的 renderer（重复）                 |

### 8.6 新增能力

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

### 8.7 实施优先级

> **说明**：第八部分的 PR 已整合到上方主分阶段实施计划中。交叉引用如下：

| 第八部分范围                          | 主计划位置                       | 理由                                                                                          |
| ------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| SceneService Dual API + 计算-渲染拆分 | P0-PR3、P0-PR4a、P0-PR4b、P0-PR5 | Dual API trait 必须先于拆分落地；拆分分成 computation/facade 与 renderer/channel 两步降低风险 |
| Puppet WebSocket Command Protocol     | P2-PR3                           | 输出路径依赖 PipelineSink（P0）                                                               |
| PuppetRenderer（wgpu SpriteBatch）    | P2-PR4                           | 资源管理依赖 GpuBudgetController（P2-PR1）                                                    |
| Puppet H.264 流 + 导出                | P3-PR1                           | 依赖 PuppetRenderer + StreamSink                                                              |

### 8.8 与其他 ADR 的关系

| ADR                          | 关系                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `adr-2d3d-unified-engine.md` | shared-core 抽取（hierarchy/animation_blend/transform）属于该 ADR 范围。第八部分处理与 shared-core 正交的计算-渲染分离 |
| `adr-device-management.md`   | neko-live 瘦身（compositor 而非 renderer）依赖 PuppetRenderer 产出 VideoGpuFrame                                       |
| 第三部分（PipelineSink）     | PuppetRenderer 和 SceneRenderer 都产出 VideoGpuFrame，由 PipelineSink adapter 消费                                     |
| 第四部分（GPU Budget）       | PuppetRenderer 的 GPU 使用由 GpuBudgetController 管理                                                                  |
| 第五部分（Effect Registry）  | Puppet effect（deformer、blend mode）如果 GPU 加速，可注册为 GpuEffect                                                 |

### 8.9 验证

> 第八部分 PR 的验证标准已合并到上方主“验证”章节。这里保留摘要交叉引用：

**P0-PR3/PR4a/PR4b/PR5（Dual API + SceneService 拆分）**：

- scene 流输出在重构前后视觉一致
- `extract_render_world()` 产出的 RenderWorld 合法，并与 simulation state 匹配
- 并发 tick + render：tick 继续按目标速率运行，render 按独立节奏运行
- 18 个 `ecs_world_mut()` 点全部消除；typed DataAccess methods 通过模块可见性与编译约束限制调用面
- `cargo test`（engine-kernel）通过

**P2-PR3（Puppet WebSocket）**：

- 通过 WebSocket 下发 puppet command 与 REST endpoint 产生相同结果
- out-of-order seq 被拒绝，并返回正确错误
- revision 冲突可被检测并报告
- REST 便捷 endpoint 仍可用

**P2-PR4（PuppetRenderer）**：

- PuppetRenderer 输出在标准姿态下与 Canvas2D 参考图视觉一致
- puppet 产出的 `VideoOutput::GpuFrame` 可在 GpuExportPipeline 中与 timeline 合成
- 性能：典型 puppet（< 500 vertices，< 10 textures）达到 60fps

**P3-PR1（Puppet H.264 + 导出）**：

- Puppet H.264 流可在 neko-puppet webview 中查看（H264StreamClient）
- 通过 GpuExportPipeline 导出 puppet 可产出合法视频文件
- 未请求 H.264 时，JSON control stream 仍然可用

---

## 第九部分：Dual API —— 创意抽象（OOP）+ 数据抽象（ECS）

### 9.1 问题陈述

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

### 9.2 两种抽象本质

**OOP = 面向用户的创意抽象**

| 属性       | 说明                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------- |
| 粒度       | 单实体、单意图                                                                                     |
| 语义       | 命令式：“加载这个模型”、“设置这个参数”、“播放这个动画”                                             |
| 版本控制   | 有 revision tracking、undo 语义、command log                                                       |
| 调用者画像 | Editor UI、WebSocket command、Agent 工具（写）                                                     |
| 示例       | `update_transform(node_id, pos, rot, scale)`、`play_animation(name)`、`set_visible(node_id, true)` |

**ECS = 面向数据的创意抽象**

| 属性       | 说明                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| 粒度       | 多实体、批量查询/变更                                                                         |
| 语义       | 声明式：“所有包含 Mesh+Transform 的实体”、“提取 render world”、“创建 entity bundle”           |
| 版本控制   | 没有 revision tracking——由调用方管理一致性                                                    |
| 调用者画像 | 渲染管线、导出、领域子系统、ML 预处理                                                         |
| 示例       | `extract_render_world()`、`query::<(&MeshRef, &GlobalTransform)>()`、`spawn((components...))` |

### 9.3 从 SceneWorld/PuppetWorld 方法中得到的证据

当前 trait 方法实际上分成三类，暴露出这种双重本质：

**真正的 OOP——意图与实现一致：**

```rust
// 单实体查找 → 单组件变更
fn set_visible(&mut self, node_id: &str, visible: bool)      // find 1 entity, set 1 component
fn set_parameter(&mut self, name: &str, value: f32)           // find 1 parameter, update value
fn set_node_opacity(&mut self, node_id: &str, opacity: f32)   // find 1 entity, set 1 component
fn set_texture(&mut self, node_id: &str, index: usize)        // find 1 entity, set 1 component
```

**伪装成 OOP 的 ECS——OOP 命名掩盖了批量数据操作：**

```rust
// “load_model” 听起来像 OOP，但实现是多阶段批量创建
fn load_model(&mut self, path: &Path) -> Result<LoadResult>
// Internally: parse glTF → spawn N entities with component bundles → resolve skeleton references → attach animations

// “tick” 听起来像 OOP，但会触发多个 system dispatch + 多查询 delta 提取
fn tick(&mut self, clip_name: &str, time: f32) -> SceneDelta
// Internally: advance blend tree → propagate transforms → IK solve → diff changed entities → serialize delta

// “restore_snapshot” 是批量实体重建
fn restore_snapshot(&mut self, snapshot: &SceneSnapshot)
// Internally: despawn all → bulk spawn from snapshot nodes → reconstruct hierarchy
```

**别扭的 OOP——本应是 ECS 查询，却被迫塞进 trait：**

```rust
// 每次调用 = 完整实体遍历 + 堆分配
fn get_snapshot(&mut self) -> SceneSnapshot           // query ALL entities, serialize to Vec
fn get_deformed_meshes(&mut self) -> Vec<DeformedMesh> // query ALL meshes, extract geometry
fn get_animation_clips(&mut self) -> Vec<AnimationClipInfo> // query ALL animations, convert
fn get_blend_state(&mut self) -> Vec<BlendLayerInfo>  // query blend resource, flatten to vec
```

### 9.4 Dual API 设计

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

### 9.5 调用者权限矩阵

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

> **关于“独占”**：bevy_ecs 的 `World::query()` 为了 archetype tracking 需要 `&mut World`。
> “读意图”表示调用方在语义上只是读取实体状态，但仍然需要独占访问。
> 真正的并发读访问是 P3 优化（需要预构建 `QueryState` + `&World` 路径）。

**关键约束**：CreativeAPI 的写操作是**带 revision 追踪且可 undo 的**（面向用户）。DataAPI 的写操作**不做 revision 追踪**（由调用方自行管理一致性，例如 ModelingSession 原子提交）。

### 9.6 这如何解决那 18 个绕过点

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

### 9.7 与第八部分（计算-渲染拆分）的关系

Dual API 模型解释了为什么第八部分的 SceneService 拆分是正确的：

```
之前（单体 SceneService）：
  SceneService {
      world: Mutex<BevySceneWorld>    // single lock for everything
      renderer: Mutex<PbrRenderer>    // coupled
  }
  // CreativeAPI 调用和 DataAPI 调用都经过同一个 Mutex
  // → 用户编辑与渲染提取之间会争用

之后（拆分 + Dual API）：
  SceneComputation {
      creative: CreativeAPI           // 用户意图操作
      data: DataAPI (exclusive)       // 领域子系统操作
  }

  SceneRenderer {
      render_world: RenderWorld       // 快照，不是 live World 引用
  }
  // 通过快照提取实现并发：
  // 1. 计算层短暂锁定 World → extract_render_world() → 释放锁
  // 2. renderer 独立操作 RenderWorld 快照（不持有锁）
  // 这属于时间上的解耦，不是对同一个 World 的真正并发访问。
```

这个拆分在物理上隔离了两个 API 消费者：renderer 操作快照，计算层持有 live World。这样就消除了当前 render 期间阻塞 tick 的 Mutex 争用（renderer 在渲染时不再持有 World 锁）。

### 9.8 实施方式（约 450 行）

> **说明**：第九部分对应主分阶段实施计划中的 P0-PR3/PR4a/PR4b/PR5。下面的步骤描述这些 PR 内部的逻辑顺序。

Dual API **不需要**新 crate，也不需要大规模重构。它只是把已有模式形式化：

**步骤 1：为两种访问模式定类型（trait 定义）**

```rust
// 放在 engine-types —— 但这里只放 marker trait 和关联类型。
// engine-types 不能依赖 bevy_ecs 或 glam（会破坏零依赖保证）。
//
// 解决方案：trait 分别放在 runtime-scene / runtime-puppet 自己内部（每个 crate
// 本来就依赖 bevy_ecs + glam）。engine-kernel 依赖 runtime-scene，
// 因此可以直接使用这些 trait。这里的“共享契约”是模式，而不是共享 crate。
//
// 如果后续确实需要共享 trait crate，再引入带 bevy_ecs + glam 依赖的 `runtime-core`。
// 对 P0 而言，保持简单：trait 先做 crate-local。
// ExtractParams / EntityFilter / SerializedScene / ProceduralSpec / ModelingDelta
// 与 trait 同文件定义，使用 runtime-scene 已有类型，不新增 engine-types 依赖。

// 位于 runtime-scene/src/access.rs：
pub trait CreativeAccess {
    fn update_transform(&mut self, node_id: &str, pos: Vec3, rot: Quat, scale: Vec3) -> Result<()>;
    fn set_visible(&mut self, node_id: &str, visible: bool) -> Result<()>;
    fn play_animation(&mut self, name: &str, loop_anim: bool) -> Result<()>;
    // ... 现有的、代表用户意图的 SceneWorld 方法
}

pub trait DataAccess {
    fn extract_render_world(&mut self, params: ExtractParams) -> Result<RenderWorld>;
    fn serialize_entities(&mut self, filter: EntityFilter) -> Result<SerializedScene>;
    fn spawn_procedural(&mut self, spec: ProceduralSpec) -> Result<EntityId>;
    fn apply_modeling_delta(&mut self, delta: ModelingDelta) -> Result<()>;
}

pub(crate) trait RawWorldAccess {
    /// 迁移期内部逃逸口；不得跨 crate 暴露。
    #[deprecated(note = "Use typed DataAccess methods instead")]
    fn ecs_world_mut_raw(&mut self) -> &mut World;
}
```

> **为什么 trait 不能放进 engine-types**：`CreativeAccess` 使用 `Vec3`/`Quat`（glam），
> `DataAccess` 使用 `World`（bevy_ecs）。把这些依赖加到 engine-types 会破坏它的
> 零依赖保证，并把重型 crate 带进每个消费者。trait 继续放在已经拥有这些依赖的 runtime crate 里。

> **为什么没有 `ecs_world(&self) -> &World`？** bevy_ecs 0.15 的 `World::query()` 需要 `&mut self`。
> 对主要消费者（渲染提取、序列化）来说，`&World` 方法没有用。
> 如果未来 bevy_ecs 提供 `&World` 查询支持，我们可以把它作为非破坏性扩展加回来。

**步骤 2：BevySceneWorld 同时实现两个 trait**

```rust
impl CreativeAccess for BevySceneWorld { /* existing implementations */ }
impl DataAccess for BevySceneWorld { /* expose inner World */ }
```

**步骤 3：SceneService 暴露类型化访问（具体 guard，而不是 trait object）**

```rust
// MutexGuard<dyn Trait> is not directly expressible in Rust without MutexGuard::map
// or boxing. Instead, SceneService exposes the concrete type and callers use it
// through the trait bound:

impl SceneService {
    /// 锁定 world。调用方通过 CreativeAccess 或 DataAccess trait 使用它。
    /// 在这个层级，类型系统并不能阻止误用——约束通过架构方式执行
    /// （code review + 模块可见性），而不是编译器强制。
    fn world(&self) -> MutexGuard<'_, BevySceneWorld> {
        self.world.lock().unwrap()
    }
}

// Controller 用法（创意意图）：
fn handle_update_transform(scene: &SceneService, ...) {
    let mut world = scene.world();
    world.update_transform(node_id, pos, rot, scale)?;  // CreativeAccess 方法
}

// 渲染提取用法（数据意图）：
fn extract_for_render(scene: &SceneService, ...) -> RenderWorld {
    let mut world = scene.world();
    world.extract_render_world(params)  // DataAccess 方法
}

// 计算-渲染拆分（P0-PR4b）会改变并发模型：
// SceneComputation 持有 Mutex<BevySceneWorld> 并执行：
//   1. lock → tick → extract_render_world → unlock
//   2. 通过 channel 把 RenderWorld 快照发送给 SceneRenderer
// SceneRenderer 不直接接触 World，而是操作快照。
```

**步骤 4：消除 `ecs_world_mut()` 逃逸口**

把所有 18 个绕过点替换成类型化 DataAPI 调用。BevySceneWorld 上公开的 `ecs_world_mut()` 将变得不再必要——DataAccess trait 以显式意图提供同样的能力。

### 9.9 设计决策

| 决策                                                   | 理由                                                                                                                                                                          | 备选方案                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| trait 放在 runtime crate，而不是 engine-types          | trait 使用 Vec3/Quat（glam）+ World（bevy_ecs）；把它们加到 engine-types 会破坏零依赖保证。runtime crate 已经有这些依赖。engine-kernel 依赖 runtime，因此能直接使用这些 trait | 放在 engine-types（需要 glam+bevy_ecs）；放在 engine-kernel（runtime 无法实现，会形成循环依赖）；新建 runtime-core crate（P0 不需要） |
| 使用两个 trait，而不是一个                             | 强迫调用方声明意图（creative vs data）；便于做权限控制                                                                                                                        | 一个包含所有方法的 trait（当前做法——没有职责分离）                                                                                    |
| DataAccess 暴露 typed methods，而不是公开 `&mut World` | 公开 `&mut World` 只是重命名 `ecs_world_mut()`，不能真正消除逃逸口；typed methods 能把渲染提取、序列化、程序化生成和建模变更收敛到可审计入口                                  | 只暴露 `&mut World`（约束无效）；为每个具体调用点都发明细方法（方法爆炸，P0 只覆盖已知绕过类别）                                      |
| 通过快照并发，而不是 RwLock                            | `extract_render_world` 已经存在；快照能在不改 ECS 内部的情况下解耦 tick/render                                                                                                | 给 World 加 RwLock（bevy_ecs 不为此设计）；真正并发查询（需要改 bevy_ecs）                                                            |
| CreativeAccess 带 revision 语义                        | 面向用户的操作必须记录，以支持 undo/协作                                                                                                                                      | 所有操作都记录 revision（渲染提取不需要 undo）                                                                                        |
| DataAccess 的写操作不带 revision                       | 管线/子系统写入是由调用方管理的原子批次（例如 ModelingSession）                                                                                                               | 所有写入都加 revision（对渲染提取来说是多余开销）                                                                                     |
| 在 Service 层强制权限矩阵                              | controller 只拿到 `creative()` handle；renderer 只拿到 RenderWorld 快照（根本不接触 World）                                                                                   | 在 trait 层强制（对需要同时使用两者的领域子系统过于僵硬）                                                                             |

### 9.10 验证

**Dual API 形式化**：

- SceneService 中所有 18 个 `ecs_world_mut()` 调用点都迁移到类型化 DataAPI 调用
- controller（host-api）在只暴露 CreativeAccess 的情况下仍能编译通过（不导入 DataAccess）
- SceneRenderer 不导入 World/DataAccess（只操作 RenderWorld 快照）
- ModelingSession 正确使用两个 API（CreativeAccess 管生命周期，DataAccess 管 vertex 操作）
- `cargo test`（engine-kernel）通过；没有行为变化
- Puppet 对应实现也迁移到同样的 Dual API 模式

---

## 开放问题（在实施前需要解决）

| #   | 问题                                                                                                                                                                          | 选项                                                                                                                                                                             | 推荐                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | **PluginCapability ID**：在 manifest 中增加显式 `id` 字段，还是从 `"{plugin_id}.{capability_type}.{entry_stem}"` 派生？                                                       | A）在 manifest schema 中增加 `id: String`（对现有插件是破坏性变更） B）确定性派生（如果不同类型里 entry 同名，会有冲突风险）                                                     | A —— 显式 `id` 更清晰；现有插件没有 `id` 字段，所以迁移是增量式的（可选字段，并保留派生兜底）    |
| 2   | **Dual API 的强制级别**：编译期（分离 crate 边界）还是架构约定（code review + 模块可见性）？                                                                                  | A）trait 放在独立 crate，调用方只导入需要的 trait B）trait 放在 runtime crate，通过 typed DataAccess methods + `ecs_world_mut_raw()` 的 `pub(crate)` 可见性 + code review 来约束 | P0 选 B —— 编译器强制需要一个尚不存在的 `runtime-core` crate。若后续绕过点再次出现，可在 P2 回看 |
| 3   | **共享 trait crate（runtime-core）**：现在引入还是延后？                                                                                                                      | A）现在引入——可在 scene/puppet 间实现编译器级别的分离 B）延后——P0 作用域已经很大；每个 runtime crate 内放 trait 已足够                                                           | B —— 延后到 P2。若 puppet 和 scene 的 trait 分化明显，共享 crate 只会增加耦合，没有收益          |
| 4   | **Linux/Windows zero-copy 路径可行性**：`VaSurface` / `D3D11Texture` 是否能与当前 wgpu 后端稳定互操作？                                                                       | A）P2 前完成 spike：Linux 验证 Vulkan external memory fd + VA-API；Windows 验证 DX12/D3D11on12 interop B）直接保留 enum 占位并运行时失败                                         | A —— enum 可以先保留，但平台实现必须 feature-gated + `unimplemented!()`，P2 前完成技术验证       |
| 5   | **DataAccess 是否需要更强编译期隔离**：仅靠 typed methods + `pub(crate)` 是否足够？                                                                                           | A）保持 P0 方案：typed methods + RawWorldAccess deprecated/pub(crate) B）P2 引入 runtime-core 和分离 guard 类型，让 controller 根本无法命名 DataAccess                           | A 用于 P0；若逃逸口重新出现，P2 升级到 B                                                         |
| 6   | **GpuEffect 优化信号如何落地**：P0 已在 trait 中预留 `estimated_cost(...) -> u64 { 0 }` 和 `supports_in_place() -> bool { false }` 默认实现，P2 是否要求重型/可原地效果覆盖？ | A）保持默认值，只依赖观测帧时间和 ping-pong buffer B）P2 要求 blur、style、ML bridge 等重型效果覆盖成本估算，并让 color correction 等安全效果声明 in-place 支持                  | B —— P0 预留默认方法避免 breaking change；P2 再逐步补精确估算和 texture 分配优化                 |
