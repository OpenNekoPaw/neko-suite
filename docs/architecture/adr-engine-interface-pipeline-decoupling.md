# ADR: neko-engine Interface & Pipeline Decoupling

- **Status**: Proposed
- **Date**: 2026-05-12
- **Author**: Claude (Architect)
- **Scope**: neko-engine (engine-kernel / host-api / host-http / runtime-ml / host-napi)
- **Prerequisites**: [adr-four-layer-contract](./adr-four-layer-contract.md), [adr-engine-four-layer-audit](./adr-engine-four-layer-audit.md), [engine-plugin-rfc](./engine-plugin-rfc.md)

---

## Context

neko-engine is a Rust sidecar process providing GPU rendering, codec, audio DSP, and ML inference to all neko-suite extensions. After auditing 17+ controllers, 6 streaming channels, 3 GPU hot paths, 3 effect subsystems, the plugin infrastructure, and the ML runtime, the following systemic coupling issues were identified:

1. **PreviewPipeline welds encoding into the GPU composite path** — the only way to get frames out is pre-encoded H.264, preventing reuse of the GPU composite for snapshots, muxer export, or alternative codecs.
2. **EffectDispatcher uses hardcoded string match** — 30+ branches route to 3 processors; unknown effects fall back to a CPU round-trip path (`apply_custom_tex_fallback`); plugin-registered shaders cannot use the fast texture-to-texture path.
3. **ML inference is file-I/O-based** — `IMlService` takes file paths in, writes file paths out; cannot accept GPU textures or produce GPU textures; impossible to use AI upscale/denoise as a pipeline effect.
4. **Audio DSP factory is hardcoded** — `create_effect()` matches 13 types; unknown types silently produce a `Gain(0.0)` passthrough; no registration path for plugin audio effects.
5. **Plugin infrastructure is structurally complete but not wired** — `PluginManager`, manifests, governance gates, and audit all exist; `PluginActivationHandler` has no implementation; plugin capabilities don't flow to effect registries.
6. **GPU resource contention is unmanaged** — single `Arc<GpuContext>` shared across all concurrent pipelines; no priority, no budget, no degradation path when GPU is oversubscribed.

**Decision**: Decouple the engine into composable layers — **output adapters** (FrameSink), **effect registries** (unified capability model), **GPU budget control**, and **ML bridge** — while preserving zero-copy GPU hot paths.

---

## Part I: Interface Architecture Audit

### 1.1 IPC vs WebSocket Split

The engine enforces a clean split:

| Channel | Transport | Direction | Purpose |
|---------|-----------|-----------|---------|
| Control flow | N-API `dispatch()`/`dispatch_action()` or HTTP POST `/v1/dispatch` | TS → Engine → TS | Mutations, queries, one-shot commands |
| Data flow | WebSocket `/v1/streams/ws/{stream_id}` | Engine → TS | Continuous frames (H.264, PCM, fMP4, events) |

**ActionRouter** (`host-api/src/router.rs`) dispatches `ActionRequest { group, action, id, options, body }` to 17+ controllers:

```
videos(15) | audios(20) | timelines(14) | streams(14) | effects(5) | models(7)
images(6) | documents(4) | scenes(8) | puppets(8) | cameras(4) | midi(4)
gamepad(3) | canvas(3) | color-correction(3) | nodes(3) | tasks(2) | plugins(7)
```

**Stream infrastructure** (`services/impls/stream_loop.rs`):
- `ActiveStreams`: single global registry for ALL stream types (HashMap by StreamId)
- `PlaybackState`: watch channel with paused, speed, loop_region, seek_to, timeline_update, config_update
- `StreamPlaybackDelegate`: all services delegate playback control to this
- `WallClockPacer`: hybrid sleep/spin frame pacing (sub-ms accuracy)
- `create_stream_channels()`: factory producing broadcast(64) + CancellationToken + watch
- Binary framing: `pack_h264_frame()` = `[pts:i64][dts:i64][is_keyframe:u8][duration:i64][NAL]`; `pack_pcm_f32le_stream_frame()` = `[pts_us:i64][duration_us:i64][sample_rate:u32][channels:u16][PCM f32le]`

### 1.2 Project File Support

| Format | Loader | EditOperation | Stream |
|--------|--------|---------------|--------|
| `.nkv` (video) | `JviLoader::load()` → Timeline | Full (3-tier: P0/P1/P2, 15 ops) | timeline stream + export |
| `.nka` (audio) | `MixdownConfig` from TS | None (stateless — TS owns project state) | mix stream + mix export |
| `.nkm` (3D) | `NkmProject` in runtime-scene | None (ECS-based) | scene stream |
| `.nkp` (puppet) | runtime-puppet INP loader | None (ECS-based) | puppet stream |

**Key asymmetry**: `.nkv` has engine-side project state + EditOperation; all others are TS-side state with engine as stateless executor.

### 1.3 EditOperation System

Three-tier priority for `.nkv` incremental mutation:

| Priority | Ops | Latency | Examples |
|----------|-----|---------|---------|
| P0 (instant) | 3 | <1ms | element.update, track.toggle, element.toggle |
| P1 (fast) | 4 | <5ms | track.update, element.splitKeepLeft/Right, project.update |
| P2 (structural) | 8 | <50ms | element.add/remove/move/splitAt, track.add/remove/reorder, batch |

Applied via `stream:applyOperation` (StreamController line 402-436) → `timeline_service.apply_operation_to_stream()` → hot-update within running stream loop.

### 1.4 Audio Interface Conclusion

Audio creation does NOT need a new controller type. The `audios` controller (20 actions) covers single-file operations; project-level orchestration (`MixdownConfig`) is stateless. New capabilities (automation, bus routing, per-clip effects) extend `MixdownConfig` fields, not the controller surface. See [adr-audio-workstation-evolution.md](./adr-audio-workstation-evolution.md) for details.

---

## Part II: Pipeline Architecture Audit

### 2.1 Three GPU Hot Paths (Zero-Copy)

**Path A — Timeline Preview Stream** (hottest path, ~60fps):
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

**Path B — Single-File Video Stream** (~60fps):
```
HwAccelDecoder.decode_next_gpu()
  → Nv12GpuTexture
  → HwAccelEncoder.encode_frame_gpu(pixel_buffer)
  → VideoToolbox encode
  → broadcast → WebSocket
```

**Path C — Export** (offline, quality priority):
```
GpuExportPipeline.process_frame_to_iosurface_timed()
  → IOSurface handle (usize)
  → AsyncExportPipeline.submit_composited(CompositedFrame { gpu_handle })
  → Compose worker (Arc<GpuContext>)
  → Muxer output
```

**Constraint**: Any decoupling that inserts CPU readback into these paths causes **5-10x performance degradation** (GPU→CPU copy + pipeline stall).

### 2.2 GpuExportPipeline — Output-Agnostic Core

`GpuExportPipeline` (`export/gpu_export_pipeline.rs`) is the shared GPU compositor. Its public API is already output-agnostic:

| Method | Output | Zero-Copy |
|--------|--------|-----------|
| `process_frame()` | `TextureCompositeResult` (GPU texture) | Yes |
| `process_frame_to_cpu()` | `Vec<u8>` (RGBA bytes) | No (readback) |
| `process_frame_to_nv12()` | `Vec<u8>` (NV12 bytes) | No (readback) |
| `process_frame_to_iosurface()` | `usize` (IOSurface handle) | Yes (macOS) |

Internal chain: `HwAccelDecoder[N] → Nv12TextureImporter → TextureCompositor → RgbaToNv12Converter → EffectDispatcher`

### 2.3 PreviewPipeline — Encoding Welded Inside (Coupling Point)

`PreviewPipeline` (`preview/pipeline.rs`) wraps `GpuExportPipeline` + `HwAccelEncoder`:

```rust
pub fn render_frame_timed(&mut self, time: f64, bg: [f32; 4])
    -> Result<(Vec<PreviewFrame>, GpuPipelineTiming, u64)> {
    result = self.gpu_pipeline.process_frame_to_iosurface_timed(time, bg)?;
    packets = self.encoder.encode_frame_gpu(result.gpu_handle, pts)?;  // WELDED
    Ok((packets.map(PreviewFrame::from), timing, encode_ns))
}
```

The encoder is hardwired — you cannot get the GPU composite result without encoding it first.

### 2.4 Audio Pipeline — Already Decoupled

`AudioMixdown` (`services/audio_mixdown.rs`) is already output-agnostic:

```rust
pub fn mix_buffer(&mut self, time: f64) -> Result<MixdownBuffer>;
```

Returns `MixdownBuffer` (f32 PCM). Callers decide what to do: stream (pack + broadcast), export (mux), or analyze. No coupling point.

### 2.5 Shared Infrastructure Components

10 components shared across preview, export, and streaming — too thick to split into separate processes:

| Component | Used By |
|-----------|---------|
| `GpuExportPipeline` | Timeline stream, Export, Snapshot |
| `HwAccelDecoder` (pool: 16 max, 2/file) | All video paths |
| `HwAccelEncoder` (pool: 4 max) | Preview, Export, Transcode |
| `AudioMixdown` | Mix stream, Timeline audio, Export |
| `StreamRegistry` (ActiveStreams) | All stream types |
| `WallClockPacer` | All real-time streams |
| `PlaybackState` (watch channel) | All stream types |
| `GpuContext` (Arc, shared wgpu device) | All GPU paths |
| `IOSurfaceBackingStore` | macOS zero-copy paths |
| `EffectDispatcher` | Timeline composite, Export |

---

## Part III: FrameSink — Pipeline Output Decoupling

### 3.1 Problem

PreviewPipeline's encoding is welded into the render method. The GPU composite result cannot be used for:
- Snapshots (need RGBA, not H.264)
- Alternative codecs (need raw frames, not H.264)
- External muxers (need encoded packets routed elsewhere)
- Quality analysis (need per-frame metrics)

### 3.2 Design

#### ProducedFrame — Platform-Aware Output Enum

```rust
pub enum ProducedFrame {
    GpuHandle {
        handle: GpuOutputHandle,
        pts: i64,
        width: u32,
        height: u32,
    },
    EncodedVideo {
        data: Vec<u8>,
        pts: i64,
        dts: i64,
        is_keyframe: bool,
    },
    RawNv12 { data: Vec<u8>, pts: i64 },
    Audio(MixdownBuffer),
}

/// Platform-aware GPU output handle
pub enum GpuOutputHandle {
    #[cfg(target_os = "macos")]
    IOSurface(usize),        // IOSurfaceRef — zero-copy to VideoToolbox
    #[cfg(target_os = "linux")]
    VaSurface(usize),        // VA-API surface
    #[cfg(target_os = "windows")]
    D3D11Texture(usize),     // ID3D11Texture2D
    CpuFallback(Vec<u8>),    // no GPU encoder available
}
```

#### FrameSink Trait

```rust
pub trait FrameSink: Send + Sync {
    async fn submit(&self, frame: ProducedFrame) -> Result<()>;
    fn close(&self);
}
```

#### Three Adapters

**BroadcastSink** (preview streaming):
```rust
impl FrameSink for BroadcastSink {
    async fn submit(&self, frame: ProducedFrame) -> Result<()> {
        match frame {
            ProducedFrame::GpuHandle { handle, pts, .. } => {
                // Encoder ownership moved HERE (unwelded from pipeline)
                let packets = self.encoder.encode_frame_gpu(handle.as_raw(), pts)?;
                for p in packets {
                    self.tx.send(StreamFrame::new(pack_h264_frame(&p)))?;
                }
            }
            ProducedFrame::Audio(buf) => {
                self.audio_tx.send(StreamFrame::new(pack_pcm(&buf)))?;
            }
            _ => {}
        }
    }
}
```

**MuxerSink** (export):
```rust
impl FrameSink for MuxerSink {
    async fn submit(&self, frame: ProducedFrame) -> Result<()> {
        match frame {
            ProducedFrame::GpuHandle { handle, pts, .. } => {
                self.export_pipeline.submit_composited(CompositedFrame {
                    gpu_handle: handle.as_raw(), pts
                }).await?;
            }
            ProducedFrame::Audio(buf) => {
                self.muxer.write_audio(&buf)?;
            }
            _ => {}
        }
    }
}
```

**SnapshotSink** (single frame capture):
```rust
impl FrameSink for SnapshotSink {
    async fn submit(&self, frame: ProducedFrame) -> Result<()> {
        match frame {
            ProducedFrame::GpuHandle { handle, .. } => {
                let rgba = handle.readback_rgba()?;
                self.result_tx.send(rgba)?;
            }
            _ => {}
        }
    }
}
```

### 3.3 Zero-Copy Preservation

The key design: **encoding moves from pipeline to sink, not from GPU to CPU**.

```
Before:
  GpuExportPipeline.process_frame_to_iosurface() → IOSurface
  PreviewPipeline.render_frame_timed() {
      gpu_result = ...;
      packets = self.encoder.encode_frame_gpu(gpu_result.gpu_handle)?;  // welded
  }

After:
  GpuExportPipeline.process_frame_to_iosurface() → IOSurface
  StreamRunner {
      gpu_result = ...;
      self.sink.submit(ProducedFrame::GpuHandle { handle })?;  // decoupled
  }
  BroadcastSink::submit() {
      packets = self.encoder.encode_frame_gpu(handle)?;  // encoding in sink
  }
```

IOSurface flows from pipeline → sink → encoder without CPU readback. The zero-copy chain is preserved.

### 3.4 Platform Adaptation (Inside Sink)

BroadcastSink handles platform differences internally:

```rust
impl BroadcastSink {
    fn new(encoder: HwAccelEncoder, tx: broadcast::Sender<StreamFrame>) -> Self {
        let zero_copy = encoder.supports_gpu_input();
        Self { encoder, tx, zero_copy }
    }
}

impl FrameSink for BroadcastSink {
    async fn submit(&self, frame: ProducedFrame) -> Result<()> {
        match (&frame, self.zero_copy) {
            (ProducedFrame::GpuHandle { handle, pts, .. }, true) => {
                // macOS: IOSurface → VideoToolbox, zero-copy
                self.encoder.encode_frame_gpu(handle.as_raw(), *pts)?
            }
            (ProducedFrame::GpuHandle { handle, pts, .. }, false) => {
                // Linux/Windows: GPU readback → CPU encode (unavoidable)
                let nv12 = handle.readback_nv12()?;
                self.encoder.encode_frame(&nv12, *pts)?
            }
            _ => {}
        }
    }
}
```

Upper layers (pipeline, stream runner) are platform-agnostic.

---

## Part IV: GPU Resource Management

### 4.1 Current State — Unmanaged Sharing

Single `Arc<GpuContext>` wrapping one wgpu Device + Queue, shared across all pipelines:

```rust
pub struct GpuContext {
    adapter: wgpu::Adapter,
    device: Arc<wgpu::Device>,   // Thread-safe, internally serialized
    queue: Arc<wgpu::Queue>,     // Thread-safe, internally serialized
    info: GpuInfo,
    staging_buffer_pool: BufferPool,
}
```

No mutexes on GpuContext — wgpu Device/Queue handle synchronization internally via `Queue::submit()` serialization.

### 4.2 Resource Pools

| Pool | Max | Contention Model |
|------|-----|-------------------|
| Decoder | 16 total, 2/file | `Mutex<PoolState>`, create-on-demand up to limit |
| Encoder | 4 total | `Mutex<Vec<PooledEncoder>>`, create-on-demand up to limit |
| IOSurface | Unbounded (per backing store) | Apple system resource, degrades at ~4-6 concurrent VT sessions |

### 4.3 Concurrent Pipeline Scenarios

| Scenario | Pipelines | Risk |
|----------|-----------|------|
| Edit + Preview | Timeline preview × 1 | Low |
| Edit + Export | Preview + ExportJob | Medium — GPU time-slice contention |
| Multi-stream | Timeline + Video + Scene | **High** — 3 concurrent GPU pipelines |
| Transcode + Preview | Background transcode + any preview | Medium — encoder pool pressure |

### 4.4 Proposed: GPU Budget Controller

```rust
pub struct GpuBudgetController {
    ctx: Arc<GpuContext>,
    active_pipelines: Mutex<Vec<PipelineEntry>>,
    max_concurrent_gpu_pipelines: usize,  // default: 3
    max_concurrent_encoders: usize,       // default: 4 (aligned with pool)
}

struct PipelineEntry {
    id: StreamId,
    priority: PipelinePriority,
    gpu_memory_estimate: u64,
}

pub enum PipelinePriority {
    Interactive,  // Editing preview — highest, never degraded
    Export,       // User-initiated export — queued but not degraded
    Transcode,    // Background proxy/transcode — can be degraded to CPU
}
```

**Priority rules**:
- `Interactive` > `Export` > `Transcode`
- When GPU is oversubscribed, `Transcode` pipelines auto-degrade to CPU path (`process_frame_to_nv12()` + software encode)
- `Export` queues behind `Interactive` but is not degraded
- Encoder pool increase from 4 to 6 recommended for concurrent export+preview+transcode

---

## Part V: Effect System Decoupling

### 5.1 Three Isolated Effect Subsystems

| Dimension | Video GPU Effects | Audio DSP | ML Inference |
|-----------|-------------------|-----------|-------------|
| Data format | wgpu Texture (Rgba8Unorm) | `&mut [f32]` PCM | File paths (String) |
| GPU context | `Arc<GpuContext>` (wgpu) | None (CPU-only) | ONNX EP (CoreML/CUDA, separate device) |
| Dispatch timing | Per-frame 16ms (real-time) | Per-buffer ~5ms (real-time) | Seconds (offline batch) |
| Abstraction | No unified trait | `AudioEffect` trait | `IMlService` trait |
| Composition | Ping-pong chain | `EffectChain` sequential | No composition, single-call |
| Plugin extension | `CustomShaderProcessor.register_custom_shader()` | `build_effect_chain()` factory | None |

### 5.2 Coupling Points

#### CP1: EffectDispatcher Hardcoded Routing

`apply_single_tex()` in `gpu_export_pipeline.rs` uses match on `effect_type` string (30+ branches). Consequences:
- New GPU effects require modifying the match — violates OCP
- Plugin shaders fall through to `apply_custom_tex_fallback()` — CPU round-trip (10-50x slower)
- No way to register a new fast-path GPU effect at runtime

#### CP2: ML ↔ GPU Pipeline Isolation

ML inference (`IMlService`) takes file paths in, writes file paths out. To use AI upscale as a pipeline effect today:
```
GPU Texture → readback CPU → save file → ONNX load file → inference
  → save file → load file → upload GPU (4 file I/O + 2 GPU↔CPU copies)
```

#### CP3: Audio DSP Factory Hardcoded

`create_effect()` in `effect_factory.rs` matches 13 types. Unknown types silently produce `Gain(0.0)` (passthrough) — should be an error.

#### CP4: Plugin Activation Not Wired

`PluginActivationHandler` trait exists but has no implementation. Plugin manifest `capabilities` don't flow to any effect registry.

### 5.3 Proposed: GpuEffect Trait

Replace hardcoded dispatch with registry-based lookup:

```rust
pub trait GpuEffect: Send + Sync {
    fn id(&self) -> &str;

    /// Texture-to-texture fast path (all registered effects must implement)
    fn apply_tex(
        &self,
        ctx: &GpuContext,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &EffectParams,
    ) -> Result<()>;

    /// Parameter definitions (for UI generation and validation)
    fn param_defs(&self) -> &[ParamDef];
}
```

**EffectDispatcher transformation**:

```rust
// Before: hardcoded match (violates OCP)
fn apply_single_tex(&self, fx: &ElementEffect, ...) {
    match fx.effect_type.as_str() {
        "gaussian-blur" => self.blur_processor.apply_blur_tex(...),
        // 30+ branches...
        _ => self.apply_custom_tex_fallback(...),  // CPU round-trip
    }
}

// After: registry lookup (OCP-compliant)
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

Existing processors (`GpuBlurProcessor`, `GpuStyleProcessor`, `CustomShaderProcessor` presets) are wrapped as `GpuEffect` implementations during initialization.

### 5.4 Proposed: AudioEffectFactory Registry

```rust
pub struct AudioEffectFactory {
    creators: HashMap<String, Box<dyn Fn(&AudioEffectConfig) -> Result<Box<dyn AudioEffect>>>>,
}

impl AudioEffectFactory {
    pub fn register(&mut self, type_name: &str, creator: impl Fn(&AudioEffectConfig) -> Result<Box<dyn AudioEffect>> + 'static);

    pub fn create(&self, config: &AudioEffectConfig) -> Result<Box<dyn AudioEffect>> {
        let creator = self.creators.get(&config.effect_type)
            .ok_or_else(|| Error::UnknownEffect(config.effect_type.clone()))?;
        creator(config)
    }
}
```

Replace `create_effect()` hardcoded match with registry lookup. Unknown types return `Err`, not silent passthrough.

### 5.5 Proposed: Unified Capability Registry

```rust
pub struct EffectCapability {
    pub id: String,                    // "com.neko.blur.gaussian"
    pub kind: EffectKind,              // Shader | AudioDsp | MlModel | Transition
    pub source: EffectSource,          // BuiltIn | Plugin { plugin_id } | Custom
    pub params: Vec<ParamDef>,
    pub realtime: bool,                // can run per-frame
    pub gpu_required: bool,
}

pub enum EffectKind {
    Shader,      // wgpu texture-to-texture, real-time
    AudioDsp,    // f32 PCM buffer in-place, real-time
    MlModel,     // ONNX inference, offline or quasi-real-time
    Transition,  // Two-frame blend, real-time
}

pub struct EffectRegistry {
    capabilities: HashMap<String, EffectCapability>,
    shader_dispatcher: Arc<Mutex<EffectDispatcher>>,
    audio_factory: Arc<Mutex<AudioEffectFactory>>,
    ml_service: Option<Arc<dyn IMlService>>,
    transition_processor: Arc<TextureTransitionProcessor>,
}
```

**Plugin activation bridge**:
```rust
impl PluginActivationHandler for EffectRegistryActivator {
    fn on_activate(&self, plugin_id: &str, kind: PluginKind, caps: &[PluginCapability], path: &Path) -> Result<(), String> {
        for cap in caps {
            match kind {
                PluginKind::Shader => {
                    let wgsl = fs::read_to_string(path.join(&cap.entry))?;
                    let params = cap.params.iter().map(to_param_def).collect();
                    self.registry.shader_dispatcher.lock()
                        .register_plugin_effect(plugin_id, &cap.id, &wgsl, params)?;
                }
                PluginKind::Model => {
                    self.registry.ml_service.as_ref()
                        .ok_or("ML not available")?
                        .register_model(&cap.id, &path.join(&cap.entry).to_string_lossy(), "onnx", &cap.capability_type)?;
                }
                PluginKind::Lut => {
                    self.registry.shader_dispatcher.lock()
                        .register_lut(&cap.id, &path.join(&cap.entry))?;
                }
                _ => {}
            }
            self.registry.capabilities.insert(cap.id.clone(), EffectCapability {
                id: cap.id.clone(),
                kind: plugin_kind_to_effect_kind(kind),
                source: EffectSource::Plugin { plugin_id: plugin_id.to_string() },
                params: cap.params.iter().map(to_param_def).collect(),
                realtime: kind == PluginKind::Shader,
                gpu_required: kind == PluginKind::Shader,
            });
        }
        Ok(())
    }
}
```

### 5.6 ML Integration Phases

#### Phase A — Offline Preprocessing (Current Architecture)

No architecture change. ML runs as a preprocessing step outside the pipeline:

```
User marks clip for AI upscale →
  engine offline: upscale(input_file, output_file) →
  TS replaces timeline source → normal GPU pipeline plays upscaled file
```

Already possible with current `models:upscale` action. This is the pragmatic path for AI denoise, super-resolution, and style transfer on individual clips.

#### Phase B — GPU Bridge for Export (Mid-term)

ONNX Runtime supports IOBinding for GPU tensor input/output:

```rust
pub trait MlGpuBridge: Send + Sync {
    fn texture_to_ort_value(&self, texture: &wgpu::Texture, w: u32, h: u32) -> Result<ort::Value>;
    fn ort_value_to_texture(&self, value: &ort::Value, ctx: &GpuContext) -> Result<wgpu::Texture>;
}
```

Platform implementations:
- macOS: wgpu (Metal) → MTLSharedEvent → CoreML EP → Metal texture → wgpu import
- CUDA: wgpu (Vulkan) → Vulkan external memory → CUDA → Vulkan external memory → wgpu
- CPU fallback: texture readback → ONNX CPU → texture upload

**Constraint**: ML model inference = 50-500ms per frame. Cannot run per-frame at 60fps. Suitable for:
- Export-time effect (no real-time constraint)
- Keyframe pre-computation (every N frames, interpolate between)
- Low-resolution real-time preview + full-resolution export

#### Phase C — Real-Time ML Effects (Long-term)

Requires lightweight quantized models (TensorRT INT8, CoreML ANE-optimized) + dedicated inference pipeline. Out of scope for this ADR.

### 5.7 Transition Composition

Current state: transitions and effects are independent GPU passes applied sequentially — transition first, then per-element effects. They cannot be composed (e.g., "blur during transition" requires external orchestration).

Registering transitions as a `GpuEffect` variant with dual-input support would enable composition:

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

This is a P3 enhancement — current sequential application is sufficient for most workflows.

---

## Part VI: Composition Scenarios (Post-Decoupling)

| Scenario | Before | After |
|----------|--------|-------|
| Plugin shader + built-in effects | Plugin → CPU fallback (10-50x slower) | Plugin → same `GpuEffect` fast path |
| AI upscale + color correction | Not possible in pipeline | Phase A: preprocess then render; Phase B: GPU bridge in export |
| New audio effect via plugin | Not possible | `AudioEffectFactory.register()` via activation handler |
| Snapshot from GPU composite | Encode to H.264 then decode | `SnapshotSink` reads GPU texture directly |
| Alternative codec (AV1/HEVC) | Hardcoded H.264 in PreviewPipeline | `BroadcastSink` with different encoder |
| GPU composite → analysis tool | Not possible | Custom `FrameSink` receives `ProducedFrame::GpuHandle` |
| Transition + effect interleave | Sequential passes only | `GpuTransitionEffect` in registry (P3) |
| Plugin-provided ML model | Not possible | `PluginKind::Model` → `ModelRegistry.register()` |

---

## Part VII: Architecture Diagram (Post-Decoupling)

```
┌─────────────────────────────────────────────────────────────────┐
│                    EffectRegistry (unified)                       │
│  ┌────────────┬────────────┬─────────────┬───────────────────┐  │
│  │ GpuEffect  │AudioEffect │ MlModel     │ TransitionEffect  │  │
│  │ (shader)   │(dsp)       │ (inference)  │ (blend)           │  │
│  └─────┬──────┴─────┬──────┴──────┬──────┴───────┬───────────┘  │
│        │            │             │              │               │
│  Sources: BuiltIn | Plugin(manifest) | Custom(runtime API)      │
└────────┼────────────┼─────────────┼──────────────┼──────────────┘
         │            │             │              │
    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐   ┌────▼─────────┐
    │ Effect  │  │ Effect  │  │ Model   │   │ Transition   │
    │Dispatch │  │ Chain   │  │Registry │   │ Processor    │
    │(GPU)    │  │(CPU)    │  │(ONNX)   │   │(GPU)         │
    │HashMap  │  │Vec<Box> │  │LRU cache│   │render pass   │
    └────┬────┘  └────┬────┘  └────┬────┘   └────┬─────────┘
         │            │            │              │
    ┌────▼────────────▼────────────▼──────────────▼──────────┐
    │              Pipeline Layer (scheduling)                 │
    │  GpuExportPipeline | AudioMixdown | StreamRunner         │
    │                                                          │
    │  GpuBudgetController (priority + degradation)            │
    └────┬─────────────────────────────────────────────────────┘
         │
    ┌────▼────────────────────────────────────────────────────┐
    │              FrameSink (output adapters)                  │
    │  BroadcastSink | MuxerSink | SnapshotSink | Custom       │
    └──────────────────────────────────────────────────────────┘
```

---

## Phased Implementation Plan

### P0: Foundation — FrameSink + GpuEffect Registry (~460 lines)

#### P0-PR1: GpuEffect Trait + EffectDispatcher Registry (~200 lines)

**Files changed**:
- New: `engine-kernel/src/gpu/effect_trait.rs` — `GpuEffect` trait + `EffectParams`
- Modified: `engine-kernel/src/export/gpu_export_pipeline.rs` — EffectDispatcher from match to HashMap
- Modified: `engine-kernel/src/gpu/blur_processor.rs` — wrap each blur type as `GpuEffect`
- Modified: `engine-kernel/src/gpu/style_processor.rs` — wrap each style effect as `GpuEffect`
- Modified: `engine-kernel/src/gpu/custom_shader_processor.rs` — wrap presets as `GpuEffect`

**Behavioral invariant**: Existing effect dispatch produces identical results. Only internal routing changes.

**Key benefit**: Eliminates `apply_custom_tex_fallback` CPU round-trip for known effects.

#### P0-PR2: AudioEffectFactory Registry (~60 lines)

**Files changed**:
- Modified: `engine-kernel/src/audio/dsp/effect_factory.rs` — `AudioEffectFactory` struct with register/create
- Modified: `engine-kernel/src/services/audio_mixdown.rs` — use factory instead of `create_effect()`

**Behavioral change**: Unknown effect types return `Err` instead of silent `Gain(0.0)` passthrough.

#### P0-PR3: FrameSink Trait + BroadcastSink (~180 lines)

**Files changed**:
- New: `engine-kernel/src/services/frame_sink.rs` — `FrameSink` trait + `ProducedFrame` + `GpuOutputHandle`
- New: `engine-kernel/src/services/impls/broadcast_sink.rs` — `BroadcastSink` (encoder moved here)
- Modified: `engine-kernel/src/preview/pipeline.rs` — remove encoder, return `GpuOutputHandle`
- Modified: `engine-kernel/src/services/impls/timeline.rs` — use `BroadcastSink` instead of inline encoding

**Behavioral invariant**: Stream output identical. Encoding moved from pipeline to sink.

#### P0-PR4: SnapshotSink (~40 lines)

**Files changed**:
- New: `engine-kernel/src/services/impls/snapshot_sink.rs` — `SnapshotSink`
- Modified: `engine-kernel/src/services/impls/timeline.rs` — snapshot path uses `SnapshotSink`

**New capability**: GPU composite → RGBA without encoding + decoding round-trip.

### P1: Plugin Wiring + ML Preprocessing (~350 lines)

#### P1-PR1: PluginActivationHandler Implementation (~150 lines)

**Files changed**:
- New: `host-api/src/plugin/activation.rs` — `EffectRegistryActivator` implementing `PluginActivationHandler`
- Modified: `host-api/src/engine.rs` — wire activator into PluginManager

**Capability**: Plugin shader/audio/model capabilities auto-register on activation.

#### P1-PR2: EffectCapability + TS Discovery (~100 lines)

**Files changed**:
- New: `engine-types/src/effect_capability.rs` — `EffectCapability`, `EffectKind`, `EffectSource`
- Modified: `host-api/src/controllers/effects.rs` — new `list-capabilities` action
- Modified: TS `effects.ts` — dynamic capability fetch instead of hardcoded `BUILT_IN_EFFECTS`

**Capability**: Frontend auto-discovers available effects including plugin-provided ones.

#### P1-PR3: ML Offline Preprocessing Workflow (~80 lines)

**Files changed**:
- Modified: `host-api/src/controllers/models.rs` — new `preprocess` action (upscale/denoise with source replacement metadata)
- Modified: TS timeline/audio integration — apply preprocessing result as source swap

**Capability**: AI upscale/denoise as clip preprocessing, integrated into project workflow.

### P2: GPU Budget + MuxerSink (~250 lines)

#### P2-PR1: GpuBudgetController (~120 lines)

**Files changed**:
- New: `engine-kernel/src/gpu/budget.rs` — `GpuBudgetController` + `PipelinePriority`
- Modified: `engine-kernel/src/services/impls/timeline.rs` — acquire permit before pipeline
- Modified: `engine-kernel/src/services/impls/video.rs` — acquire permit, accept degradation
- Modified: `engine-kernel/src/export/service.rs` — acquire permit

**Capability**: Concurrent pipeline management with priority-based degradation.

#### P2-PR2: MuxerSink + Export Unification (~80 lines)

**Files changed**:
- New: `engine-kernel/src/services/impls/muxer_sink.rs` — `MuxerSink`
- Modified: `engine-kernel/src/export/service.rs` — export loop uses `MuxerSink`

**Capability**: Export path uses same FrameSink abstraction as streaming.

### P3: Advanced Composition (~420 lines, deferred)

#### P3-PR1: ML GPU Bridge (Phase B) (~300 lines)

`MlGpuBridge` trait + platform implementations for export-time ML effects.

#### P3-PR2: Transition as GpuEffect (~120 lines)

`GpuTransitionEffect` dual-input variant registration in EffectRegistry.

---

## Key Design Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Encoding in Sink, not Pipeline | Preserves zero-copy GPU path; enables snapshot/alt-codec without CPU round-trip | Encoding in Pipeline (current — coupling prevents reuse) |
| GpuEffect HashMap, not match | OCP-compliant; plugin effects use same fast path | Keeping match + growing branches (violates OCP) |
| Err on unknown effect, not silent passthrough | Silent `Gain(0.0)` masks bugs (audio); CPU fallback masks perf issues (video) | Keep silent fallback (hides problems) |
| Single EffectRegistry, not per-domain | Unified plugin activation path; TS discovers all capabilities in one call | Separate registries per domain (duplicated plugin wiring) |
| GPU budget as soft controller, not hard lock | wgpu Device/Queue are thread-safe; hard locks would serialize all GPU work | Mutex around GpuContext (kills concurrency) |
| ML Phase A (offline) before Phase B (GPU bridge) | Phase A works today with zero architecture change; Phase B needs platform-specific GPU interop | Jump to Phase B (high risk, blocks on ONNX IOBinding) |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GpuEffect trait overhead vs direct call | Vtable dispatch adds ~1ns per effect per frame | Negligible vs 16ms frame budget; measure before/after |
| Plugin shader compile failure at registration | Blocks plugin activation | Validate WGSL at register time; report error via PluginAuditor |
| GPU budget controller false degradation | Transcode unnecessarily falls to CPU | Conservative thresholds; monitor actual GPU utilization before degrading |
| ML GPU bridge platform fragmentation | macOS/Linux/Windows need different interop | Phase A (offline) covers 90% of use cases without interop |
| FrameSink async overhead | Async submit vs sync in hot loop | `BroadcastSink` can use `try_send` (non-blocking) for broadcast channel |

---

## Verification

**P0 (FrameSink + GpuEffect registry)**:
- Timeline preview stream produces identical H.264 output before/after refactor (bit-exact not required, visual equivalence + timing)
- Snapshot via SnapshotSink produces valid RGBA matching `process_frame_to_cpu()` output
- All existing effects resolve via HashMap lookup (no fallback to `apply_custom_tex_fallback`)
- `cargo test` on engine-kernel passes; `pnpm test` on neko-cut passes
- Performance: frame render time within 5% of baseline

**P1 (Plugin wiring)**:
- Test plugin with `kind: Shader` + WGSL file → auto-registered as `GpuEffect` → usable in timeline
- Test plugin with `kind: Model` + ONNX file → auto-registered in `ModelRegistry` → usable via `models:upscale`
- `effects:list-capabilities` returns both built-in and plugin effects
- TS `BUILT_IN_EFFECTS` dynamically populated from engine capabilities

**P2 (GPU budget)**:
- Concurrent timeline preview + export: both complete successfully, preview maintains >24fps
- Background transcode with active preview: transcode degrades to CPU without affecting preview
- Encoder pool not exhausted under normal concurrent load (preview + export + transcode)

---

## Part VIII: Puppet/Scene Computation-Rendering-IO Separation

### 8.1 Current Architecture Comparison

| Dimension | runtime-scene (3D) | runtime-puppet (2D) |
|-----------|-------------------|---------------------|
| **Computation** | bevy_ecs World (BevySceneWorld, ~1078 lines) | bevy_ecs World (BevyPuppetWorld, ~1003 lines) |
| **Rendering** | PbrRenderer (wgpu, engine-side GPU) | Canvas2D (webview-side CPU) |
| **Streaming** | H.264 via BroadcastSink (zero-copy GPU) | JSON delta via WebSocket (CPU serialization) |
| **Control Plane** | WebSocket + SceneCommandEnvelope (seq + revision validation) | REST fire-and-forget (no seq, no ordering) |
| **Export Quality** | Engine GPU render → GpuExportPipeline | No engine render path (cannot export) |
| **Live Mode** | Engine captures + streams | Webview captures (lossy, no composition) |

### 8.2 Coupling Points

**CP-1: SceneService mixes computation and rendering**

```
SceneService {
    world: Mutex<BevySceneWorld>,         // computation
    renderer: Option<Mutex<PbrRenderer>>, // rendering (tightly coupled)
    asset_cache: Option<Mutex<AssetCache>>,
    gpu_ctx: Option<Arc<GpuContext>>,
}
```

`render_frame()` locks both `world` and `renderer` sequentially — computation and rendering cannot proceed independently. The `extract_render_world()` function already exists as a one-way ECS → RenderWorld snapshot, providing the foundation for separation, but SceneService does not use it to decouple the two concerns.

**CP-2: Puppet has no engine render path**

PuppetService contains only computation (`world: Mutex<BevyPuppetWorld>`). Rendering is entirely delegated to the webview via JSON vertex data → Canvas2D. This means:
- No GPU-accelerated puppet rendering
- Cannot compose puppet output with timeline via GpuExportPipeline
- Cannot produce high-quality puppet exports
- neko-live must capture the webview (lossy) instead of the engine

**CP-3: Scene input tightly coupled to WebSocket handler**

`scene_control.rs` validates seq + revision directly in the WebSocket handler, mixing transport concerns (WebSocket framing) with domain concerns (command validation and dispatch). The command envelope format is sound, but the validation logic should live in the computation layer.

**CP-4: Puppet input lacks versioning**

Puppet commands arrive via REST endpoints with no sequence numbers or revision validation. Concurrent editing from multiple sources (editor UI + agent + live tracking) has no ordering guarantee and no conflict detection.

**CP-5: ~600 lines of duplicated code**

| Module | runtime-scene | runtime-puppet | Duplication |
|--------|--------------|----------------|-------------|
| hierarchy.rs | Parent/Children components | Parent/Children components | ~90% identical |
| animation_blend.rs | SceneBlendLayer/SceneBlendTree | BlendLayer/BlendTree | ~90% identical |
| transform_propagation.rs | propagate_scene_transforms | propagate_puppet_transforms | ~85% identical |

This duplication is already identified in `adr-2d3d-unified-engine.md` — the shared-core extraction belongs there, not in this ADR. Listed here for completeness.

### 8.3 What to Separate vs. What to Keep

#### Separate: SceneService → SceneComputation + SceneRenderer

```rust
// Before (coupled)
impl SceneService {
    fn tick(&self) { /* locks world */ }
    fn render_frame(&self) { /* locks world THEN renderer */ }
}

// After (separated)
struct SceneComputation {
    world: Mutex<BevySceneWorld>,
}

struct SceneRenderer {
    renderer: PbrRenderer,
    gpu_ctx: Arc<GpuContext>,
    render_world: RenderWorld,  // snapshot, not shared Mutex
}

impl SceneComputation {
    fn tick(&self) -> SceneTickResult { /* locks world only */ }
    fn extract(&self) -> RenderWorld { /* one-way snapshot */ }
}

impl SceneRenderer {
    fn render(&mut self, world: &RenderWorld) -> ProducedFrame { /* no world lock */ }
}
```

**Benefit**: Computation and rendering can run on different cadences. Editor can tick at 60fps while export renders at film quality without blocking the editor.

#### Separate: New PuppetRenderer (wgpu SpriteBatch)

```rust
struct PuppetRenderer {
    sprite_batch: SpriteBatch,
    gpu_ctx: Arc<GpuContext>,
}

impl PuppetRenderer {
    fn render(&mut self, meshes: &[DeformedMesh], textures: &[TextureAtlas]) -> ProducedFrame {
        // GPU sprite batch rendering — same ProducedFrame as SceneRenderer
    }
}
```

**Benefit**: Puppet output becomes a `ProducedFrame::GpuHandle`, composable with timeline via GpuExportPipeline. Enables:
- High-quality puppet export (H.264/ProRes)
- Puppet preview via BroadcastSink (same as scene)
- neko-live composition of puppet + scene in engine (no webview capture)

#### Separate: Puppet WebSocket Command Protocol

Upgrade puppet input from REST fire-and-forget to WebSocket with command envelope:

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

**Benefit**: Ordering guarantee, conflict detection, undo support (command log).

#### Keep Coupled: ECS Cores (runtime-scene, runtime-puppet)

The ECS World types (BevySceneWorld, BevyPuppetWorld) should remain as cohesive units. The OOP trait shell (SceneWorld/PuppetWorld ~25-30 methods) wrapping `bevy_ecs::World` is the correct pattern — it provides a stable API surface while allowing ECS internals to evolve. Splitting the ECS World further would fragment the entity-component model.

#### Keep Coupled: Controllers → Service delegation

The host-api controllers (`SceneController`, `PuppetController`) should continue delegating to services. Splitting controllers further would fragment the action routing without benefit — controllers are already thin dispatch layers.

#### Keep Coupled: neko-live renderer (downstream consumer)

neko-live should consume `ProducedFrame` from both SceneRenderer and PuppetRenderer, not own its own renderer. This aligns with the neko-live slimdown in `adr-device-management.md` (neko-live becomes a scene compositor, not a renderer).

### 8.4 Target Three-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Input Layer                        │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ SceneCommandRouter   │  │ PuppetCommandRouter   │  │
│  │ (WS + seq/revision)  │  │ (WS + seq/revision)   │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  │
│             │ CommandEnvelope          │               │
└─────────────┼──────────────────────────┼──────────────┘
              ▼                          ▼
┌─────────────────────────────────────────────────────┐
│                Computation Layer                     │
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
│                  Render Layer                        │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ SceneRenderer        │  │ PuppetRenderer        │  │
│  │ (PbrRenderer, wgpu)  │  │ (SpriteBatch, wgpu)   │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  │
│             │ ProducedFrame            │ ProducedFrame │
│             ▼                          ▼               │
│  ┌─────────────────────────────────────────────────┐  │
│  │              FrameSink (Part III)                 │  │
│  │  BroadcastSink | MuxerSink | SnapshotSink        │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 8.5 Design Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Extract RenderWorld snapshot instead of shared Mutex | Decouples tick rate from render rate; `extract_render_world()` already exists | Keep shared Mutex (current — blocks computation during render) |
| PuppetRenderer as wgpu SpriteBatch | Puppets are textured 2D meshes — SpriteBatch is the natural GPU primitive; produces `ProducedFrame` composable with timeline | Keep Canvas2D (no export, no composition, no GPU acceleration) |
| Upgrade puppet to WebSocket commands | Ordering + revision validation parity with scene; enables undo log | Keep REST (no ordering, no conflict detection) |
| Puppet WebSocket reuses SceneCommandEnvelope pattern | Consistent control plane; shared validation logic | New protocol (fragmentation, double implementation) |
| Canvas2D remains as fallback | WebSocket-delivered sprite data for lightweight preview when no GPU context available | Remove Canvas2D entirely (breaks low-end devices) |
| neko-live consumes ProducedFrame | Aligns with adr-device-management.md neko-live slimdown; live becomes compositor not renderer | neko-live owns its own renderer (duplication) |

### 8.6 New Capabilities Enabled

| Capability | Before | After |
|------------|--------|-------|
| Puppet high-quality export | Not possible (Canvas2D only) | PuppetRenderer → GpuExportPipeline → MuxerSink |
| Puppet + Timeline composition | Not possible | Both produce ProducedFrame::GpuHandle, composable in GPU |
| Puppet H.264 preview stream | Not possible (JSON only) | PuppetRenderer → BroadcastSink |
| Independent tick/render rates | Scene blocked by renderer Mutex | Extract snapshot → render independently |
| Puppet undo/redo | No command log | WebSocket command envelope → revision log |
| neko-live GPU composition | Webview capture (lossy) | Engine-side ProducedFrame composition |
| Concurrent scene edit + export | Mutex contention | Snapshot-based separation |
| Cross-domain render testing | Untestable (coupled) | SceneRenderer/PuppetRenderer testable with synthetic RenderWorld/DeformedMeshes |

### 8.7 Implementation Priorities

#### P0-PR5: SceneService Computation-Rendering Split (~200 lines)

**Files changed**:
- New: `engine-kernel/src/services/impls/scene_computation.rs` — `SceneComputation` (tick + extract)
- New: `engine-kernel/src/services/impls/scene_renderer.rs` — `SceneRenderer` (render from RenderWorld)
- Modified: `engine-kernel/src/services/impls/scene.rs` — `SceneService` becomes thin facade delegating to computation + renderer
- Modified: `host-http/src/routes/scene_stream.rs` — extract → render → FrameSink flow

**Behavioral invariant**: Scene stream output visually identical. Internal routing changes only.

#### P1-PR4: Puppet WebSocket Command Protocol (~120 lines)

**Files changed**:
- New: `engine-types/src/puppet_command.rs` — `PuppetCommandEnvelope`, `PuppetCommand` enum
- New: `host-http/src/routes/puppet_control.rs` — WebSocket handler with seq/revision validation
- Modified: `host-http/src/routes/puppet_stream.rs` — unified WebSocket (commands + delta stream)
- Modified: `engine-kernel/src/services/impls/puppet.rs` — accept `PuppetCommand` instead of raw parameter sets

**Behavioral change**: Puppet input upgrades from REST to WebSocket. REST endpoints remain as convenience aliases (translate to WebSocket commands internally).

#### P1-PR5: PuppetRenderer (wgpu SpriteBatch) (~400 lines)

**Files changed**:
- New: `engine-kernel/src/gpu/puppet_renderer/mod.rs` — `PuppetRenderer` struct
- New: `engine-kernel/src/gpu/puppet_renderer/sprite_batch.rs` — `SpriteBatch` (instanced quad rendering)
- New: `engine-kernel/src/gpu/puppet_renderer/puppet_shaders.wgsl` — vertex/fragment shaders for textured deformed meshes
- Modified: `engine-kernel/src/services/impls/puppet.rs` — optional `PuppetRenderer` (like SceneService's optional renderer)

**New capability**: Puppet produces `ProducedFrame::GpuHandle`, enabling export and composition.

#### P2-PR3: Puppet H.264 Stream + Export Integration (~150 lines)

**Files changed**:
- Modified: `host-http/src/routes/puppet_stream.rs` — option to stream H.264 via BroadcastSink (alongside JSON fallback)
- Modified: `engine-kernel/src/export/gpu_export_pipeline.rs` — accept PuppetRenderer output as composable layer
- Modified: `neko-puppet/packages/webview/src/components/PuppetCanvas.tsx` — support H264StreamClient as alternative to Canvas2D

**New capability**: Puppet preview in H.264 (parity with scene); puppet export via GpuExportPipeline.

### 8.8 Relationship to Other ADRs

| ADR | Relationship |
|-----|-------------|
| `adr-2d3d-unified-engine.md` | Shared-core extraction (hierarchy/animation_blend/transform) is that ADR's scope. This Part VIII addresses computation-rendering separation orthogonal to shared-core |
| `adr-device-management.md` | neko-live slimdown (compositor not renderer) depends on PuppetRenderer producing ProducedFrame |
| Part III (FrameSink) | PuppetRenderer and SceneRenderer both produce ProducedFrame, consumed by FrameSink adapters |
| Part IV (GPU Budget) | PuppetRenderer's GPU usage managed by GpuBudgetController |
| Part V (Effect Registry) | Puppet effects (deformers, blend modes) registerable as GpuEffect if GPU-accelerated |

### 8.8 Verification

**P0-PR5 (SceneService split)**:
- Scene stream output visually identical before/after refactor
- `extract_render_world()` produces valid RenderWorld matching simulation state
- Concurrent tick + render: tick continues at target rate while render runs at independent cadence
- `cargo test` on engine-kernel passes

**P1-PR4 (Puppet WebSocket)**:
- Puppet commands via WebSocket produce same results as REST endpoints
- Out-of-order seq rejected with appropriate error
- Revision conflict detected and reported
- REST convenience endpoints still functional

**P1-PR5 (PuppetRenderer)**:
- PuppetRenderer output visually matches Canvas2D reference for standard poses
- `ProducedFrame::GpuHandle` from puppet composable with timeline in GpuExportPipeline
- Performance: 60fps for typical puppet (< 500 vertices, < 10 textures)

**P2-PR3 (Puppet H.264 + Export)**:
- Puppet H.264 stream viewable in neko-puppet webview (H264StreamClient)
- Puppet export via GpuExportPipeline produces valid video file
- JSON fallback still available when H.264 not requested

---

## Part IX: Dual API — Creative Abstraction (OOP) + Data Abstraction (ECS)

### 9.1 Problem Statement

The current architecture mandates a single access path: upper layers → OOP trait shell → ECS. But SceneService has **18 `ecs_world_mut()` call sites** that bypass the trait shell — not as bugs, but as legitimate operations that the OOP abstraction cannot express.

These 18 sites fall into categories that reveal a missing abstraction layer:

| Bypass Category | Call Sites | Why OOP Trait Insufficient |
|-----------------|-----------|---------------------------|
| GPU render extraction | 2 | 4 bulk archetype queries per frame; OOP `get_snapshot()` would serialize+deserialize (perf disaster) |
| Serialization/export | 4 | Need full component visibility with optional component combinatorics (`MeshRef + MaterialRef + Light + Camera`) |
| Command batch processing | 2 | SceneCommandQueue validates revision + applies heterogeneous commands in atomic batch |
| Domain subsystems | 5 | ModelingSession manages vertex brushes + topology ops — cross-entity fine-grained mutations |
| Procedural generation | 4 | `create_shape()`, `csg_boolean()` need to spawn entities with arbitrary component tuples |
| Infrastructure | 1 | `SceneRevision` resource read — no trait method exists |

The OOP trait shell (SceneWorld 28 methods, PuppetWorld 25 methods) is well-designed for **user-facing creative commands** but fundamentally cannot serve **data-oriented pipeline operations**.

### 9.2 Two Abstraction Natures

**OOP = User-Facing Creative Abstraction**

| Property | Description |
|----------|-------------|
| Granularity | Single entity, single intent |
| Semantics | Imperative: "load this model", "set this parameter", "play this animation" |
| Versioning | Has revision tracking, undo semantics, command log |
| Caller profile | Editor UI, WebSocket commands, Agent tools (write) |
| Examples | `update_transform(node_id, pos, rot, scale)`, `play_animation(name)`, `set_visible(node_id, true)` |

**ECS = Data-Oriented Creative Abstraction**

| Property | Description |
|----------|-------------|
| Granularity | Multi-entity, bulk query/mutation |
| Semantics | Declarative: "all entities with Mesh+Transform", "extract render world", "spawn entity bundle" |
| Versioning | No revision tracking — caller manages consistency |
| Caller profile | Render pipeline, export, domain subsystems, ML preprocessing |
| Examples | `extract_render_world()`, `query::<(&MeshRef, &GlobalTransform)>()`, `spawn((components...))` |

### 9.3 Evidence from SceneWorld/PuppetWorld Methods

Current trait methods actually fall into three categories, revealing the dual nature:

**Genuinely OOP — intent matches implementation:**

```rust
// Single entity lookup → single component mutation
fn set_visible(&mut self, node_id: &str, visible: bool)      // find 1 entity, set 1 component
fn set_parameter(&mut self, name: &str, value: f32)           // find 1 parameter, update value
fn set_node_opacity(&mut self, node_id: &str, opacity: f32)   // find 1 entity, set 1 component
fn set_texture(&mut self, node_id: &str, index: usize)        // find 1 entity, set 1 component
```

**Disguised ECS — OOP name hiding bulk data operation:**

```rust
// "load_model" sounds OOP, but implementation is multi-pass bulk spawn
fn load_model(&mut self, path: &Path) -> Result<LoadResult>
// Internally: parse glTF → spawn N entities with component bundles → resolve skeleton references → attach animations

// "tick" sounds OOP, but triggers multiple system dispatches + multi-query delta extraction
fn tick(&mut self, clip_name: &str, time: f32) -> SceneDelta
// Internally: advance blend tree → propagate transforms → IK solve → diff changed entities → serialize delta

// "restore_snapshot" is batch entity reconstruction
fn restore_snapshot(&mut self, snapshot: &SceneSnapshot)
// Internally: despawn all → bulk spawn from snapshot nodes → reconstruct hierarchy
```

**Awkward OOP — should be ECS query but forced through trait:**

```rust
// Every call = full entity traversal + heap allocation
fn get_snapshot(&mut self) -> SceneSnapshot           // query ALL entities, serialize to Vec
fn get_deformed_meshes(&mut self) -> Vec<DeformedMesh> // query ALL meshes, extract geometry
fn get_animation_clips(&mut self) -> Vec<AnimationClipInfo> // query ALL animations, convert
fn get_blend_state(&mut self) -> Vec<BlendLayerInfo>  // query blend resource, flatten to vec
```

### 9.4 Dual API Design

```
┌──────────────────────────────────────────────────────────────┐
│  SceneAccess / PuppetAccess  (unified entry point)            │
│                                                               │
│  ┌────────────────────────┐  ┌──────────────────────────────┐ │
│  │  CreativeAPI (OOP)      │  │  DataAPI (ECS)               │ │
│  │                        │  │                                │ │
│  │  load_model(path)      │  │  query_renderables()           │ │
│  │  update_transform(id)  │  │  query_skeletons()             │ │
│  │  play_animation(name)  │  │  extract_render_world()        │ │
│  │  set_visible(id, bool) │  │  spawn_procedural(components)  │ │
│  │  create_ik_chain(...)  │  │  query_by::<(A, B, C)>()      │ │
│  │  crossfade(clip, dur)  │  │  serialize_entities(filter)    │ │
│  │                        │  │  bulk_spawn(entity_bundles)     │ │
│  │  ✓ Revision tracking   │  │  ✗ No revision tracking        │ │
│  │  ✓ Undo semantics      │  │  ✗ No undo (caller manages)    │ │
│  │  ✓ Command log          │  │  ✗ No command log              │ │
│  └────────────────────────┘  └──────────────────────────────┘ │
│                                                               │
│  Both backed by same bevy_ecs::World instance                 │
└──────────────────────────────────────────────────────────────┘
```

### 9.5 Caller Permission Matrix

| Caller | CreativeAPI (OOP) | DataAPI (ECS) | Rationale |
|--------|:-:|:-:|-----------|
| Controller (host-api) | Write | No | User operations → single entity, versioned |
| Scene Control WebSocket | Write | No | Editor real-time commands, need revision+ack |
| Render Pipeline | No | Read | `extract_render_world()` every frame, bulk query |
| Export / Serialize | No | Read | GLB/project file, traverse all entities+components |
| Domain Subsystem (Modeling) | Write (begin/commit) | Read+Write (vertex ops) | Coarse lifecycle via OOP, fine-grained data via ECS |
| ML Preprocessing | No | Read | Batch read scene data for inference input |
| Agent Tools | Write | Read-only | AI edits via OOP commands, AI perception via ECS queries |
| Stream Producer | No | Read | Tight render loop, `capture_h264_keyframe()` |

**Key constraint**: CreativeAPI write operations are **revision-tracked + undoable** (face user). DataAPI write operations have **no revision tracking** (caller manages consistency, e.g., ModelingSession commits atomically).

### 9.6 How This Resolves the 18 Bypass Sites

| Current Bypass | Dual API Resolution |
|----------------|-------------------|
| `render_frame_internal()` → `ecs_world_mut()` → `extract_render_world()` | SceneRenderer holds DataAPI read handle |
| `export_glb()` → `ecs_world_mut()` → component queries | Export module holds DataAPI read handle |
| `save_project()` / `load_project()` → `ecs_world_mut()` | Serialization module holds DataAPI read+write handle |
| `apply_scene_command_with_delta()` → `ecs_world_mut()` | CommandQueue holds DataAPI write handle (batch mutation) |
| `begin/commit/cancel_modeling_session()` → `ecs_world_mut()` | ModelingSession holds both: CreativeAPI for lifecycle, DataAPI for vertex ops |
| `create_shape()` / `create_text()` / `csg_boolean()` → `ecs_world_mut()` | Procedural generation uses DataAPI `spawn_procedural()` |
| `current_revision()` → `ecs_world_mut()` | Revision is a CreativeAPI concern (expose via CreativeAPI) |

After dual API: **zero `ecs_world_mut()` escape hatches needed**. Every former bypass has a legitimate typed API.

### 9.7 Relationship to Part VIII (Computation-Rendering Split)

The dual API model explains WHY Part VIII's SceneService split is correct:

```
Before (monolithic SceneService):
  SceneService {
      world: Mutex<BevySceneWorld>    // single lock for everything
      renderer: Mutex<PbrRenderer>    // coupled
  }
  // CreativeAPI calls and DataAPI calls all go through same Mutex
  // → contention between user edits and render extraction

After (split + dual API):
  SceneComputation {
      creative: CreativeAPI           // user intent operations
      data: DataAPI (read+write)      // domain subsystem operations
  }
  
  SceneRenderer {
      data: DataAPI (read-only)       // render extraction only
  }
  // CreativeAPI and DataAPI.read can proceed concurrently
  // (RenderWorld snapshot is extracted then released)
```

The split physically separates the two API consumers — renderer only needs DataAPI read, computation needs both. This eliminates the Mutex contention that currently blocks tick during render.

### 9.8 Implementation Approach

The dual API does NOT require a new crate or major refactoring. It formalizes what already exists:

**Step 1: Type the two access patterns (trait definitions)**

```rust
// In runtime-scene (or a shared runtime-core)
pub trait CreativeAccess {
    fn update_transform(&mut self, node_id: &str, pos: Vec3, rot: Quat, scale: Vec3) -> Result<()>;
    fn set_visible(&mut self, node_id: &str, visible: bool) -> Result<()>;
    fn play_animation(&mut self, name: &str, loop_anim: bool) -> Result<()>;
    // ... existing SceneWorld methods that represent user intent
}

pub trait DataAccess {
    fn ecs_world(&self) -> &World;         // read-only
    fn ecs_world_mut(&mut self) -> &mut World;  // write (for domain subsystems)
}
```

**Step 2: BevySceneWorld implements both**

```rust
impl CreativeAccess for BevySceneWorld { /* existing implementations */ }
impl DataAccess for BevySceneWorld { /* expose inner World */ }
```

**Step 3: SceneService hands out typed references**

```rust
impl SceneService {
    // For controllers (user operations)
    fn creative(&self) -> MutexGuard<dyn CreativeAccess> { ... }
    
    // For render pipeline (read-only extraction)
    fn data_read(&self) -> MutexGuard<dyn DataAccess> { ... }
    
    // For domain subsystems (modeling, export)
    fn data_write(&self) -> MutexGuard<dyn DataAccess> { ... }
}
```

**Step 4: Eliminate `ecs_world_mut()` escape hatch**

Replace all 18 bypass sites with typed DataAPI calls. The `ecs_world_mut()` public method on BevySceneWorld becomes unnecessary — DataAccess trait provides the same capability with explicit intent.

### 9.9 Design Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Two traits, not one | Forces callers to declare intent (creative vs data); enables permission enforcement | Single trait with all methods (current — no separation of concerns) |
| DataAccess exposes `&World` / `&mut World` | ECS queries are inherently open-ended; wrapping each query pattern would defeat the purpose | Typed query methods per use case (explosion of methods, always incomplete) |
| CreativeAccess has revision semantics | User-facing operations must be tracked for undo/collaboration | All operations tracked (render extraction doesn't need undo) |
| DataAccess write has no revision | Pipeline/subsystem writes are atomic batches managed by the caller (e.g., ModelingSession) | Add revision to all writes (unnecessary overhead for render extraction) |
| Permission matrix enforced at Service level | Controllers only receive `creative()` handle; renderers only receive `data_read()` | Enforce at trait level (too rigid for domain subsystems that need both) |

### 9.10 Verification

**Dual API formalization**:
- All 18 `ecs_world_mut()` call sites in SceneService migrated to typed DataAPI calls
- Controllers (host-api) compile with only CreativeAccess visible (no DataAccess import)
- SceneRenderer compiles with only DataAccess read visible (no CreativeAccess import)
- ModelingSession correctly uses both APIs (CreativeAccess for lifecycle, DataAccess for vertex ops)
- `cargo test` on engine-kernel passes; no behavioral changes
- Puppet equivalent: PuppetService migrated to same dual API pattern
