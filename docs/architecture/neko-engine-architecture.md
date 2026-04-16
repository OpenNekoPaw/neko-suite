# Neko Engine — Architecture

> Rust media engine sidecar: 11 crates, 758+ tests, wgpu GPU rendering + FFmpeg codec + bevy_ecs + ONNX ML inference.
> Communicates with TypeScript layer via N-API (in-process) and HTTP/WebSocket (sidecar).

---

## Crate Dependency Graph

```
                         ┌──────────────┐
                         │ engine-types │  Pure DTOs, zero behavior
                         │ (shared)     │  ActionRequest/Response, enums
                         └──────┬───────┘
                                │ depended by ALL crates
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐
│runtime-scene │  │runtime-puppet    │  │runtime-media                 │
│              │  │                  │  │                              │
│ bevy_ecs     │  │ bevy_ecs         │  │ ffmpeg-next                  │
│ glTF/VRM     │  │ MOC3/INP         │  │ probe / diff / subtitle     │
│ GPU Skinning │  │ Deformers        │  │ JPEG encode                  │
│ IK / CSG     │  │ Expression       │  │                              │
│ Animation    │  │ Motion / Physics │  │ (self-contained, no GPU)     │
│ Blend/Fade   │  │ Blend/Fade       │  │                              │
└──────┬───────┘  └──────┬───────────┘  └──────────────┬───────────────┘
       │                 │                              │
       └─────────────────┼──────────────────────────────┘
                         │ consumed by
                         ▼
              ┌────────────────────┐
              │ engine-kernel      │  Core media processing
              │                    │
              │ gpu/ (wgpu)        │  Compositor, Effects, Scene Renderer
              │ codec/ (FFmpeg)    │  HW encode/decode
              │ export/            │  gpu_export_pipeline
              │ services/          │  I*Service traits + impls
              │ domain/            │  Timeline, FrameData, Transform
              │ audio/ preview/    │
              └─────────┬──────────┘
                        │ consumed by
         ┌──────────────┼──────────────────┐
         ▼              ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│runtime-device│ │runtime-ml    │ │ host-api          │
│              │ │              │ │                    │
│ Camera (cpal)│ │ ONNX Runtime │ │ EngineApi facade  │
│ Mic (cpal)   │ │ Upscale      │ │ ActionRouter      │
│ MIDI (midir) │ │ Denoise      │ │ 17 Controllers    │
│ Gamepad      │ │ CLIP         │ │ ResourceRegistry  │
│ (gilrs)      │ │ Whisper      │ │ StreamRegistry    │
└──────┬───────┘ └──────┬───────┘ │ SessionManager    │
       │                │         │ PluginManager     │
       └────────────────┴─────────┤                    │
                  depended by     └─────────┬──────────┘
                                            │ consumed by
                         ┌──────────────────┼──────────────┐
                         ▼                  ▼              ▼
              ┌────────────────┐ ┌──────────────┐ ┌──────────────┐
              │ host-http      │ │ host-napi    │ │ host-cli     │
              │                │ │              │ │              │
              │ axum REST      │ │ N-API bridge │ │ CLI + server │
              │ WebSocket      │ │ NativeEngine │ │ clap args    │
              │ streaming      │ │ class        │ │ headless     │
              │ preview files  │ │              │ │ export       │
              └────────────────┘ └──────────────┘ └──────────────┘
```

---

## Layer Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          HOST LAYER                                       │
│              (Communication frontends — one engine, multiple hosts)        │
│                                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐                     │
│  │ host-napi   │  │ host-http    │  │ host-cli    │                     │
│  │             │  │              │  │             │                     │
│  │ cdylib      │  │ axum         │  │ binary      │                     │
│  │ in-process  │  │ sidecar      │  │ standalone  │                     │
│  │ sync bridge │  │ REST + WS    │  │ CLI args    │                     │
│  │ + async     │  │ streaming    │  │ headless    │                     │
│  │   engine    │  │ preview      │  │ export      │                     │
│  │             │  │              │  │             │                     │
│  │ Consumer:   │  │ Consumer:    │  │ Consumer:   │                     │
│  │ VSCode ext  │  │ any HTTP     │  │ CI/CD       │                     │
│  │ (N-API)     │  │ client       │  │ terminal    │                     │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘                     │
│         └────────────────┼─────────────────┘                             │
│                          ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                       host-api                                     │   │
│  │                                                                    │   │
│  │  EngineApi ──→ ActionRouter ──→ Controller ──→ Service ──→ Result  │   │
│  │                                                                    │   │
│  │  ActionRouter dispatches by group:action to 17 controllers.        │   │
│  │  Each controller calls service traits. Services are Arc-wrapped.   │   │
│  │  SessionManager provides multi-window state isolation.             │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                          CORE LAYER                                       │
│                     (Media processing engine)                             │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                       engine-kernel                                │   │
│  │                                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ services/ (trait + impl)                                    │   │   │
│  │  │                                                             │   │   │
│  │  │  IVideoService    probe, capture, stream, transcode, diff   │   │   │
│  │  │  IAudioService    probe, stream, waveform, record, mixdown  │   │   │
│  │  │  IImageService    probe, capture, encode, diff              │   │   │
│  │  │  ITimelineService composite, stream, export                 │   │   │
│  │  │  IExportService   export pipeline orchestration             │   │   │
│  │  │  ITaskService     long-running task management              │   │   │
│  │  │  INodeService     GPU info, health, metrics                 │   │   │
│  │  │  IPuppetService   2D puppet operations                      │   │   │
│  │  │  ISceneService    3D scene operations                       │   │   │
│  │  │  IEffectsService  custom shader effects                     │   │   │
│  │  │  IStreamPlayback  common playback control                   │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐   │   │
│  │  │ gpu/ (wgpu)  │ │ codec/       │ │ export/                  │   │   │
│  │  │              │ │ (FFmpeg)     │ │                          │   │   │
│  │  │ Texture      │ │              │ │ gpu_export_pipeline      │   │   │
│  │  │  Compositor  │ │ HW decode    │ │                          │   │   │
│  │  │ (27 blend)   │ │ HW encode    │ │ Per-frame compositing:   │   │   │
│  │  │              │ │              │ │ ① Video/Image decode     │   │   │
│  │  │ Effect       │ │ H.264/H.265 │ │ ② Text render            │   │   │
│  │  │  Dispatcher  │ │ VP9/AV1     │ │ ③ Scene3D PBR/NPR       │   │   │
│  │  │ (20+ effects)│ │ AAC/Opus    │ │ ④ Puppet deform          │   │   │
│  │  │              │ │ ProRes      │ │ ⑤ Shape rasterize        │   │   │
│  │  │ Scene        │ │              │ │ ⑥ Camera keyframe        │   │   │
│  │  │  Renderer    │ │              │ │ ⑦ Light + shadow         │   │   │
│  │  │ (PBR+IBL)    │ │              │ │ ⑧ Z-sort + composite    │   │   │
│  │  │              │ │              │ │ ⑨ Effects chain          │   │   │
│  │  │ Shape        │ │              │ │ ⑩ Encode output          │   │   │
│  │  │  Rasterizer  │ │              │ │                          │   │   │
│  │  │ (tiny-skia)  │ │              │ │                          │   │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘   │   │
│  │                                                                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐   │   │
│  │  │ domain/      │ │ audio/       │ │ stream/                  │   │   │
│  │  │ Timeline     │ │ decode/mix   │ │ H.264 + PCM over WS     │   │   │
│  │  │ FrameData    │ │ loudness     │ │ fMP4 streaming           │   │   │
│  │  │ Transform    │ │ silence det  │ │                          │   │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘   │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         RUNTIME LAYER                                     │
│              (Domain-specific processing, progressive per Stage)           │
│                                                                           │
│  Existing (Stage 1):                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │runtime-scene │ │runtime-puppet│ │runtime-device│ │runtime-ml      │  │
│  │              │ │              │ │              │ │                │  │
│  │ BevyScene    │ │ BevyPuppet   │ │ Camera       │ │ ONNX Runtime   │  │
│  │ World        │ │ World        │ │ Microphone   │ │                │  │
│  │              │ │              │ │ MIDI         │ │ Upscale        │  │
│  │ glTF loader  │ │ MOC3 parser  │ │ Gamepad      │ │ Denoise        │  │
│  │ GPU Skinning │ │ INP loader   │ │              │ │ CLIP           │  │
│  │ Animation    │ │ WarpDeformer │ │ cpal/midir/  │ │ Whisper        │  │
│  │ Blend/Fade   │ │ RotDeformer  │ │ gilrs        │ │                │  │
│  │ IK (FABRIK/  │ │ Expression   │ │              │ │ ort + ndarray  │  │
│  │  CCD/TwoBone)│ │ Motion       │ └──────────────┘ └────────────────┘  │
│  │ Morph Targets│ │ Physics      │                                       │
│  │ CSG Boolean  │ │ Blend/Fade   │  ┌──────────────┐                    │
│  │ Exporter     │ │ Interpolation│  │runtime-media │                    │
│  │ Project      │ │              │  │              │                    │
│  │              │ │ Snapshot/    │  │ Probe/Cache  │                    │
│  │ Snapshot/    │ │ Delta API    │  │ Subtitle     │                    │
│  │ Delta API    │ │              │  │ Audio diff   │                    │
│  └──────────────┘ └──────────────┘  │ Video diff   │                    │
│                                      │ Image diff   │                    │
│                                      │ JPEG encode  │                    │
│                                      │              │                    │
│                                      │ (no GPU,     │                    │
│                                      │  standalone) │                    │
│                                      └──────────────┘                    │
│  Future (Stage 2-5):                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                     │
│  │runtime-stage │ │runtime-xr    │ │runtime-sim   │                     │
│  │ (Stage 3)    │ │ (Stage 2)    │ │ (Stage 5)    │                     │
│  │              │ │              │ │              │                     │
│  │ ScriptEngine │ │ OpenXR       │ │ Deterministic│                     │
│  │ StageDirector│ │ Stereo       │ │ Sensor MRT   │                     │
│  │ VideoSegment │ │ SpatialInput │ │ Gym API      │                     │
│  │ QTE/Hotspot  │ │ AR Plane     │ │ DomainRandom │                     │
│  │ Butterfly    │ │ HRTF Audio   │ │ DataPipeline │                     │
│  │ Discovery    │ │ Depth Occl   │ │ (PyO3)       │                     │
│  └──────────────┘ └──────────────┘ └──────────────┘                     │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         TYPES LAYER                                       │
│                     (Zero-dependency shared DTOs)                          │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ engine-types                                                       │   │
│  │                                                                    │   │
│  │ ActionRequest / ActionResponse    (unified protocol)               │   │
│  │ ResourceId / StreamId             (typed IDs)                      │   │
│  │ MediaInfo / Codec                 (media metadata)                 │   │
│  │ EasingType                        (30+ easing functions)           │   │
│  │ ExportPreset / VideoCodec         (export configuration)          │   │
│  │ TaskStatus / TaskProgress         (async task tracking)            │   │
│  │ StreamConfig                      (streaming parameters)           │   │
│  │ WaveformData                      (audio visualization)            │   │
│  │ ApiError / ErrorCode              (error protocol)                 │   │
│  │ registry.rs                       (18 action group constants)      │   │
│  │                                                                    │   │
│  │ Future additions (from today's discussion):                        │   │
│  │ + SemanticMotion / RetargetMap    (cross-dimensional motion)       │   │
│  │ + ExpressionSpec / ExpressionPreset                                │   │
│  │ + SceneSpec / LightSpec           (unified scene description)      │   │
│  │ + EffectSpec                      (unified effect description)     │   │
│  │ + VoiceSpec                       (voice identity)                 │   │
│  │ + MemoryAnchor / PlayerSave       (interactive state)             │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Action Protocol

```
All communication between TypeScript and Rust uses a unified ActionRequest/ActionResponse protocol.

  TypeScript (Extension Host)
      │
      ├─ N-API (host-napi): bridge_probe_media(path) → JSON ActionResponse
      │  Sync functions for simple queries. NativeEngine class for async.
      │
      └─ HTTP (host-http):  POST /v1/dispatch { group, action, ... } → JSON
         WebSocket: GET /v1/streams/:id → binary H.264 frames
         WebSocket: GET /v1/puppets/stream → JSON PuppetDelta (60fps)

  Request flow:
    host-napi/http → ActionRequest → host-api ActionRouter
    → match group → Controller.handle(action, id, options, body)
    → Service method (Arc<dyn IService>)
    → engine-kernel / runtime-* execution
    → ActionResponse { status, data, error }

  18 Controller Groups:
    nodes / tasks / videos / audios / images / timelines / streams /
    effects / models / canvas / scenes / puppets / cameras / midi /
    gamepad / color-correction / documents / plugins
```

---

## GPU Pipeline Detail

```
engine-kernel gpu/ module:

  ┌──────────────────────────────────────────────────────────────┐
  │                    wgpu GPU Pipeline                          │
  │                                                               │
  │  Input Sources → GpuLayer:                                    │
  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
  │  │ HW Decoder │ │ PBR/NPR   │ │ Puppet     │ │ tiny-skia │ │
  │  │ (NV12→RGBA)│ │ Renderer   │ │ Deformer   │ │ Rasterizer│ │
  │  │            │ │ (3D scene) │ │ (2D mesh)  │ │ (shapes)  │ │
  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬─────┘ │
  │        │ GPU tex       │ GPU tex      │ GPU tex      │ GPU tex│
  │        ▼               ▼              ▼              ▼       │
  │  ┌───────────────────────────────────────────────────────┐   │
  │  │ TextureCompositor                                     │   │
  │  │                                                       │   │
  │  │ Z-index sort → per-layer:                             │   │
  │  │   Transform2D (position, scale, rotation, anchor)     │   │
  │  │   Opacity (0-1)                                       │   │
  │  │   BlendMode (27 Photoshop modes)                      │   │
  │  │   Mask (optional, with inversion)                     │   │
  │  │                                                       │   │
  │  │ Alpha compositing (Porter-Duff)                       │   │
  │  │ Max 32 layers per pass                                │   │
  │  └──────────────────────┬────────────────────────────────┘   │
  │                         │ composited texture                  │
  │                         ▼                                     │
  │  ┌───────────────────────────────────────────────────────┐   │
  │  │ EffectDispatcher (texture → texture ping-pong)        │   │
  │  │                                                       │   │
  │  │ Blur:    Gaussian, Motion, Radial, Sharpen            │   │
  │  │ Style:   Vignette, Glow, Chromatic Ab., Film Grain    │   │
  │  │ Color:   Brightness, Contrast, Saturation, Hue,       │   │
  │  │          Curves, LUT3D, Color Wheels, HSL, Exposure,  │   │
  │  │          Temperature, Chroma Key, Luma Key            │   │
  │  │ Custom:  User WGSL/GLSL shaders                       │   │
  │  └──────────────────────┬────────────────────────────────┘   │
  │                         │ final RGBA texture                  │
  │                         ▼                                     │
  │  ┌───────────────────────────────────────────────────────┐   │
  │  │ Output                                                │   │
  │  │ ├ RGBA → NV12 (GPU compute) → HW Encoder → H.264     │   │
  │  │ ├ RGBA → JPEG (GPU readback) → preview frame          │   │
  │  │ └ RGBA → WebSocket stream → browser decode → display  │   │
  │  └───────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────────┘

  Performance:
    Mono render: ~16ms (60fps)
    Compositor: 32 layers, all GPU — zero CPU round-trip
    Effect chain: texture-to-texture, no readback between effects
    Encode: HW accelerated (VideoToolbox macOS / VAAPI Linux / NVENC Windows)
```

---

## ECS Architecture (bevy_ecs)

```
Both runtime-scene and runtime-puppet use bevy_ecs standalone (no full Bevy).
Request-driven (manual Schedule::run()), not game-loop-driven.

  runtime-scene (3D):                     runtime-puppet (2D):
  ┌─────────────────────────────┐         ┌────────────────────────────────┐
  │ World                       │         │ World                          │
  │ ├ Entity: SceneRoot         │         │ ├ Entity: PuppetRoot           │
  │ │ └ AnimationTarget         │         │ │ ├ PuppetParameters           │
  │ │   (clips[])               │         │ │ ├ ExpressionLibrary          │
  │ ├ Entity: Node              │         │ │ └ AnimationLibrary           │
  │ │ ├ Transform               │         │ ├ Entity: Part                 │
  │ │ ├ GlobalTransform         │         │ │ └ PartVisibility             │
  │ │ ├ Mesh + Material         │         │ ├ Entity: Deformer             │
  │ │ ├ Skeleton                │         │ │ ├ WarpDeformer               │
  │ │ │ (joints + inv_bind)     │         │ │ └ RotationDeformer           │
  │ │ ├ MorphWeights            │         │ ├ Entity: ArtMesh             │
  │ │ ├ Light / Camera          │         │ │ ├ MeshData + DeformedVerts  │
  │ │ └ Children[]              │         │ │ ├ MultiKeyDeformation        │
  │ └ Entity: AnimState         │         │ │ ├ ParameterBinding           │
  │   └ BlendState              │         │ │ └ TextureRef + Opacity       │
  │                             │         │ └ Entity: AnimState            │
  │ Systems (per tick):         │         │   └ BlendState                 │
  │  animation_tick             │         │                                │
  │  animation_blend_tick       │         │ Systems (per tick):            │
  │  ik_solve                   │         │  1. parameter_reset            │
  │  transform_propagation      │         │  2. animation_tick/blend       │
  │                             │         │  3. expression_update          │
  │ Output:                     │         │  4. physics_chain_tick         │
  │  SceneDelta {               │         │  5. rotation_deformer_update   │
  │    updated_transforms,      │         │  6. warp_deformer_update       │
  │    updated_morph_weights    │         │  7. multi_key_deformation      │
  │  }                          │         │  8. parameter_update           │
  └─────────────────────────────┘         │  9. transform_propagation_2d   │
                                          │                                │
                                          │ Output:                        │
                                          │  PuppetDelta {                 │
                                          │    deformed_meshes[]           │
                                          │    (vertices, opacity, blend)  │
                                          │  }                             │
                                          └────────────────────────────────┘

  Common pattern:
    load_model/load_puppet → spawn entities → World ready
    tick(clip, time) → run systems → output Delta
    Delta sent to gpu_export_pipeline or WebSocket stream

  Shared: engine-types EasingType (30+ variants), keyframe interpolation logic
  Future shared: SemanticMotion channels, RetargetMap trait
```

---

## Communication Patterns

```
Pattern 1: N-API (in-process, lowest latency)
  VSCode Extension → napi::call → Rust fn → return JSON
  Used for: probe, GPU info, single-frame operations
  Latency: <1ms

Pattern 2: HTTP REST (sidecar, request-response)
  Extension → POST /v1/dispatch → axum → ActionRouter → Controller → Response
  Used for: load model, set parameter, export, etc.
  Latency: 1-5ms

Pattern 3: WebSocket streaming (sidecar, continuous)
  Extension → WS /v1/streams/:id → binary H.264 frames (30-60fps)
  Extension → WS /v1/puppets/stream → JSON PuppetDelta (60fps)
  Extension → WS /v1/midi/:id → JSON MIDI events
  Extension → WS /v1/gamepad/:id → JSON gamepad events
  Used for: real-time preview, live puppet drive, device input
  Latency: 16-33ms (frame interval)

Pattern 4: WebSocket + audio monitoring
  Extension → WS /v1/monitor/:id → JSON RMS/Peak levels
  Used for: audio level meters

Pattern 5: Document preview (HTTP file serving)
  Extension → POST /v1/preview/register → token
  Webview → GET /v1/preview/file/:token → Range-capable static file (PDF/CBZ)
  Webview → GET /v1/preview/epub/:token/*path → on-demand EPUB entries
  Used for: PDF/EPUB/CBZ preview in webview (CSP-compliant)
```

---

## Concurrency Model

```
  ┌─────────────────────────────────────────────────────┐
  │ Admission Control (Global)                           │
  │                                                      │
  │ HTTP requests → Semaphore(8)     (max 8 concurrent)  │
  │ Codec ops     → Semaphore(4)     (max 4 encode/decode│
  │ GPU ops       → Semaphore(2)     (max 2 GPU tasks)   │
  │ Overloaded    → 503 ServiceOverloaded                │
  └─────────────────────────────────────────────────────┘

  Thread model:
    tokio multi-thread runtime (host-http/host-api)
    wgpu Device.poll() on dedicated thread
    FFmpeg decode/encode on tokio blocking threads
    ECS World access: &mut self (single-threaded per world)

  Arc-wrapped services:
    All I*Service implementations wrapped in Arc for thread-safe sharing.
    Controllers hold Arc<dyn IService>.
    No Mutex on hot path — services are stateless or use interior mutability.

  Resource lifecycle:
    ResourceRegistry tracks resources with self-healing (expired resource cleanup).
    StreamRegistry manages broadcast channels (one producer, N consumers).
    SessionManager isolates state per VSCode window.
```

---

## Progressive Runtime Expansion

```
Each Stage adds a new runtime crate. Previous runtimes unchanged.

  Stage 1 (current):
    runtime-puppet  2D animation ECS
    runtime-scene   3D scene ECS
    runtime-device  Device I/O (cam/mic/MIDI/gamepad)
    runtime-ml      ONNX inference (upscale/denoise/CLIP/Whisper)
    runtime-media   Media processing (probe/diff/subtitle/JPEG)

  Stage 3 (+interactive cinema):
    runtime-stage   Scene orchestration + ScriptEngine + interaction

  Stage 2 (+XR):
    runtime-xr      OpenXR session + stereo render + spatial input + HRTF

  Stage 4 (+game):
    runtime-game    Rapier physics + NavMesh + visual scripting VM

  Stage 5 (+simulation):
    runtime-sim     Deterministic world + sensor MRT + Gym API (PyO3)

  Each runtime:
    - Independent Cargo crate with own Cargo.toml
    - Depends on engine-types (shared DTOs)
    - May depend on engine-kernel (GPU/codec access)
    - Consumed by host-api (new controller registered)
    - Feature-gated: unused runtimes not compiled
```

---

## Future engine-types Additions

```
From today's cross-stage analysis, engine-types will grow to include:

  Motion:
    SemanticMotion { channels: Vec<SemanticChannel> }
    SemanticChannel { semantic: String, keyframes: Vec<SemanticKeyframe> }
    RetargetMap trait { fn apply(semantic, value, world) }
    VrmRetargetMap / PuppetRetargetMap implementations

  Expression:
    ExpressionSpec { channels, blendMode, fadeIn/Out, micro }
    ExpressionPreset library (~30 presets)

  Scene:
    SceneSpec { environment, characters, props, camera, effects }
    LightSpec { ambient, lights[], postProcess, emotionBinding }

  Effect:
    EffectSpec { layers[], params, scope, emotionBinding }

  Voice:
    VoiceSpec { ttsProvider, voiceId, visemeMode }

  Interactive:
    MemoryAnchor { fact, perspectives, anchor_rules }
    PlayerSave { progress, state, memories, anchors }
    SeriesSpec { episodes, stateContract, sharedAssets }

  All defined as serde-serializable Rust structs + TypeScript mirror types in @neko/shared.
```
