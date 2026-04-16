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

## RenderProfile (Dynamic Engine Behavior Per Scene)

```
One engine, not three. Same wgpu pipeline, different optimization profiles.

The key insight: rendering engine, game engine, and simulation engine differ
in optimization target, not in fundamental architecture.

  Rendering engine: optimize for QUALITY (offline, no frame budget)
  Game engine:      optimize for FRAME RATE (real-time, 16ms budget)
  Simulation engine: optimize for THROUGHPUT + ACCURACY (batched, deterministic)

neko does not build 3 engines. neko builds 1 engine + N profiles.
```

### Profile Definitions

```
  RenderProfile::Video (Stage 1, offline/streaming)
    Target:         Maximum visual quality
    Frame budget:   Unlimited (offline) or ~33ms (30fps streaming)
    Resolution:     Full output resolution (1080p/4K)
    Shadow:         Full shadow map (2048px) + PCF soft shadow
    Post-process:   All effects enabled (SSAO + Bloom + DOF + God Ray)
    Physics:        None
    Determinism:    Not required
    GPU strategy:   100% quality, single frame at a time
    Use case:       neko-cut export, preview streaming

  RenderProfile::Interactive (Stage 3, real-time playback)
    Target:         Stable 60fps with good quality
    Frame budget:   16ms strict
    Resolution:     Display resolution (may downscale under pressure)
    Shadow:         Shadow map (1024px) + basic PCF
    Post-process:   Essential only (color grade + vignette), skip expensive (SSAO)
    Physics:        None (Stage 3 is narrative, not physics)
    Determinism:    Not required
    GPU strategy:   Quality ↔ framerate adaptive (drop effects if behind)
    Use case:       runtime-stage interactive cinema, Electron preview

  RenderProfile::XR (Stage 2, stereoscopic real-time)
    Target:         Stable 90fps × 2 eyes
    Frame budget:   11ms strict (per eye, or 5.5ms with instanced stereo)
    Resolution:     HMD native (may use Fixed Foveated Rendering)
    Shadow:         Simplified (512px) or disabled
    Post-process:   Minimal (color grade only, no SSAO/Bloom/DOF)
    Physics:        Basic collision (Stage 2 spatial interaction)
    Determinism:    Not required
    GPU strategy:   Framerate first, quality second, FFR + reprojection
    Use case:       runtime-xr, WebXR via Three.js WebXRManager

  RenderProfile::Game (Stage 4, gameplay)
    Target:         Stable 60fps with physics
    Frame budget:   16ms (render + physics + gameplay logic)
    Resolution:     Display resolution
    Shadow:         Cascaded Shadow Maps (CSM, 3 levels)
    Post-process:   Full (SSAO + Bloom + Fog), LOD-based
    Physics:        Rapier (real-time, non-deterministic mode)
    Determinism:    Not required
    GPU strategy:   LOD + occlusion culling + draw call batching
    Use case:       runtime-game, 2D/3D lightweight games

  RenderProfile::Simulation (Stage 5, training data)
    Target:         Maximum throughput + physical accuracy
    Frame budget:   Variable (as fast as possible, or fixed timestep)
    Resolution:     Configurable (often 256×256 for speed)
    Shadow:         Disabled (unless depth pass needed)
    Post-process:   None (raw sensor data, not aesthetic output)
    Physics:        Rapier deterministic mode (fixed timestep + seeded RNG)
    Determinism:    Required (reproducible runs)
    GPU strategy:   Multi-instance batched rendering (N worlds per GPU)
    Render passes:  MRT: RGB + Depth + Semantic ID + Normal + Optical Flow
    Use case:       runtime-sim, Gym API, synthetic data generation

  RenderProfile::Web (exported Web app)
    Target:         60fps in browser sandbox
    Frame budget:   16ms (browser main thread contention)
    Resolution:     Canvas size (responsive)
    Shadow:         Three.js built-in (if WebGPU, or skip on WebGL)
    Post-process:   Three.js TSL effects (lighter than wgpu shaders)
    Physics:        Rapier WASM (if Stage 4 game export)
    Determinism:    Not required
    GPU strategy:   Browser-managed, WebGPU preferred, WebGL fallback
    Use case:       ExportRuntime Web app, marketplace preview
```

### Profile Selection

```
Profile is selected at scene load time, not hardcoded:

  Same SceneSpec → different RenderProfile → different visual output

  fn load_scene(spec: &SceneSpec, profile: RenderProfile) {
      match profile {
          Video       → enable all passes, max shadow res, full effects
          Interactive → enable essential passes, medium shadow, adaptive effects
          XR          → instanced stereo, minimal effects, FFR
          Game        → CSM shadows, LOD system, physics world
          Simulation  → headless MRT, deterministic physics, batched
          Web         → Three.js renderer config
      }
  }

  Adaptive quality within a profile:
    Interactive/Game/XR can dynamically adjust:
      if (frame_time > budget * 0.9) {
          drop_shadow_resolution();
          disable_ssao();
          reduce_particle_count();
      }
    Video/Simulation profiles don't adapt (quality/accuracy is fixed).

  Profile is part of the consumer, not the asset:
    Asset standards (SceneSpec, EffectSpec, LightSpec) are profile-agnostic.
    EffectSpec.scope[] hints which profiles an effect supports:
      scope: ["video", "interactive", "xr"] → skip in simulation
    LightSpec.postProcess effects auto-disabled by budget-constrained profiles.
```

### Why This Works

```
Traditional approach: build separate engines per use case
  → Rendering engine (offline, max quality)
  → Game engine (real-time, physics + LOD)
  → Simulation engine (headless, deterministic, batched)
  = 3× engineering cost, 3× maintenance, assets not portable

neko approach: one wgpu pipeline + runtime configuration
  → Same gpu_export_pipeline code path
  → Profile selects: which passes run, what resolution, what budget
  → Same SceneSpec/EffectSpec/LightSpec consumed by all profiles
  → Same FormatAdapter imports feed all profiles
  → Add new profile = add new config, not new engine

  This is possible because neko's rendering ceiling is "indie game" level,
  not "AAA" level. A single well-structured wgpu pipeline can span from
  offline video export to real-time XR to headless simulation.
```

### Cross-Scene Behavioral Differences

```
Beyond rendering (RenderProfile) and camera (Drive Modes), scenes differ
in many runtime behaviors. All handled by runtime-* crates, not by assets.

  Dimension        Video Scene           Interactive Scene     Simulation Scene
  ────────────────────────────────────────────────────────────────────────────

  Time model       Linear (0→end)        Non-linear (branch,   Fixed timestep
                   Seek to any time      loop, jump)           (deterministic,
                   Deterministic         User-driven pace      reproducible)

  Audio            Pre-mixed export      Real-time mix +       None (or sensor
                   (final stereo WAV)    spatial HRTF +        audio simulation)
                                         dynamic BGM select

  Input            None (playback only)  Click, dialogue,      API only
                                         gesture, QTE,         (step/reset/
                                         free exploration      observe/reward)

  State            None (stateless       PlayerSave +          Trajectory log
  persistence      playback)             MemoryAnchor +        (state, action,
                                         CharacterAgent memory reward per step)

  AI characters    Pre-rendered          Real-time dialogue    None (or RL
                   (TTS + expression     (CharacterAgent +     agent training
                   baked to timeline)    DynamicDialogue +     environment)
                                         memory + persona)

  Asset hot-load   Not needed            Required (scene       Not needed
                   (all pre-loaded)      transitions load      (all pre-loaded
                                         new SceneSpec/chars)  at env reset)

  Networking       None                  Optional (cloud       Optional
                                         save sync, co-op)    (distributed
                                                              parallel envs)

  Error recovery   Re-export             Save point rollback   Restart instance
                                         (PlayerSave)         (env.reset())

  Evaluation       Aesthetic score       Player engagement     Physics accuracy
  metrics          (VLM + CLIP)          (time spent, choices, (SSIM/PSNR/FID/
                                         completion rate)      FVD, reward curve)

  Camera           Keyframe-driven       Hybrid (cinematic     Fixed or scripted
                   (CameraKeyframeTrack) + gameplay switch)   (sensor viewpoint)

  Physics          None                  None (Stage 3) or     Rapier deterministic
                                         Rapier (Stage 4)     (reproducible)

  Determinism      Not required          Not required          Required
                   (visual quality       (player choices       (training data
                   is the goal)          make it unique)       must be reproducible)

  Render output    Final composited      Real-time display     Multi-pass MRT:
                   frame → encode        → H.264 stream       RGB + Depth +
                   → MP4/WebM            → browser/headset    Semantic + Normal
                                                              + Optical Flow

  Asset standard   ← Same SceneSpec / EffectSpec / LightSpec / CharacterBundle →
  layer            All scenes consume the same unified asset definitions.
                   Differences are ONLY in runtime behavior, not in asset format.
```

### How Runtimes Map to Scene Types

```
  Video scene behavior     → engine-kernel only (export pipeline + codec)
  Interactive scene        → + runtime-stage (ScriptEngine + interaction + save)
  Interactive + game       → + runtime-game (Rapier + NavMesh + input)
  XR scene                 → + runtime-xr (stereo + spatial + HRTF)
  Simulation scene         → + runtime-sim (deterministic + sensor + Gym)

  Each runtime is additive — it adds behaviors to the base engine.
  Removing a runtime removes that scene type's capability.
  Assets remain unchanged regardless of which runtimes are active.
```

---

## QualityProfile + WorkflowTemplate (Per-Scene QA)

```
Parallel to RenderProfile (how engine renders), each scene type has:
  QualityProfile:    what to check + how strict (creation-time QA)
  WorkflowTemplate:  what stages + what gates (creation-time workflow)

One framework, N configurations. Not N independent QA systems.
```

### QualityProfile (Scene-Specific Checks)

```
Each profile selects checkers, weights, thresholds, and auto-refine behavior.

  QualityProfile::Video {
    checks: [
      aesthetic (VLM, w=0.3, required),
      continuity (CLIP cross-shot, w=0.25, required),
      narrative (LLM script match, w=0.25, required),
      audio_sync (waveform×edit alignment, w=0.2, required)
    ],
    autoRefine: true, maxRounds: 3, passThreshold: 0.8
  }

  QualityProfile::Interactive {
    checks: [
      framerate (target=60fps, w=0.2, required),
      branch_coverage (min=0.9, w=0.2, required),
      state_consistency (idempotent, w=0.2, required),
      character_ai (persona fidelity, w=0.15),
      aesthetic (w=0.15), narrative (w=0.1)
    ],
    autoRefine: true, maxRounds: 2, passThreshold: 0.75
  }

  QualityProfile::Serialized {
    checks: [
      state_compat (new ep imports ⊆ old ep exports, w=0.3, required),
      save_compat (load old saves into new ep, w=0.3, required),
      branch_coverage (w=0.2, required),
      butterfly_cross (cross-ep causality, w=0.1),
      narrative (w=0.1)
    ],
    autoRefine: false,  // serialized episodes must be human-confirmed
    passThreshold: 0.9  // stricter (published content is immutable)
  }

  QualityProfile::XR {
    checks: [
      framerate (target=90fps, w=0.3, required),
      comfort (max camera accel=2.0, no flicker>3Hz, w=0.25, required),
      spatial_reachable (all hotspots in reach, w=0.2),
      stereo_correct (IPD range, no depth conflict, w=0.15),
      aesthetic (w=0.1)
    ],
    autoRefine: true, maxRounds: 2, passThreshold: 0.85
  }

  QualityProfile::Game {
    checks: [
      framerate (target=60fps, w=0.2, required),
      physics_valid (no clipping/floating, w=0.2),
      playable (no softlock, all paths completable, w=0.2),
      branch_coverage (w=0.15),
      balance (difficulty range 0.3-0.8, w=0.15),
      aesthetic (w=0.1)
    ],
    autoRefine: true, passThreshold: 0.8
  }

  QualityProfile::Simulation {
    checks: [
      determinism (run twice, diff=0, w=0.3, required),
      physics_accuracy (energy conservation 0.99, w=0.25),
      data_distribution (coverage 0.8, no mode collapse, w=0.25),
      sensor_valid (depth range, seg IDs covered, w=0.2)
    ],
    autoRefine: false,  // simulation tuning via external experiment framework
    passThreshold: 0.9
  }
```

### Checker Registry

```
Universal checkers (shared across all scenes):
  aesthetic         → VLM aesthetic scoring (reuses Quality Assessment)
  continuity        → CLIP cross-shot similarity (reuses ConsistencyEvaluator)
  narrative         → LLM script-vs-visual alignment
  framerate         → frame timing statistics (reuses PlaybackPerformanceMonitor)
  audio_sync        → waveform × edit point alignment

Scene-specific checkers (loaded on demand):
  Interactive:
    branch_coverage   → auto-traverse branch tree, report coverage %
    state_consistency → same choices → same state (idempotency)
    character_ai      → AI dialogue persona fidelity scoring

  Serialized:
    state_compat      → new ep stateImports ⊆ old ep stateExports
    save_compat       → load sample saves into new episode without crash
    butterfly_cross   → cross-episode causal chain integrity

  XR:
    comfort           → camera acceleration, flicker rate, FOV bounds
    spatial_reachable → all interaction hotspots within arm's reach
    stereo_correct    → dual-eye render depth consistency

  Game:
    physics_valid     → no clipping, floating, wall-stuck
    playable          → no deadlock, softlock, uncompletable paths
    balance           → difficulty curve within target range

  Simulation:
    determinism       → run with same seed twice, diff must be zero
    physics_accuracy  → energy conservation, collision precision
    data_distribution → generated data coverage, no mode collapse
    sensor_valid      → depth/semantic/normal output ranges correct

Checker trait:
  trait Checker {
      fn name(&self) → &str;
      fn check(&self, perception: &PerceptionContext, params: &Value)
        → CheckResult { pass, score, issues, suggestedFixes };
  }
  Checkers are registered in a CheckerRegistry. Profiles reference by name.
  New checker = implement trait + register. No framework changes needed.
```

### WorkflowTemplate (Scene-Specific Creation Pipeline)

```
Each scene type defines an ordered pipeline of stages with quality gates:

  WorkflowTemplate::Video {
    stages: [
      { name: "script",    tools: [neko-story],     gate: null },
      { name: "asset_gen",  tools: [neko-agent],    gate: null },
      { name: "edit",       tools: [neko-cut],      gate: null },
      { name: "color",      tools: [neko-cut],      gate: "aesthetic >= 0.7" },
      { name: "audio",      tools: [neko-audio],    gate: "audio_sync >= 0.8" },
      { name: "review",     tools: [quality_check], gate: "all >= 0.8" },
      { name: "export",     tools: [engine],         gate: "review.pass" }
    ]
  }

  WorkflowTemplate::Interactive {
    stages: [
      { name: "script",      tools: [neko-story] },
      { name: "binding",     tools: [story-binding] },
      { name: "branch_edit", tools: [neko-canvas, neko-story] },
      { name: "ai_config",   tools: [neko-agent] },
      { name: "test_paths",  tools: [auto_tester],   gate: "branch_cover >= 0.9" },
      { name: "ai_test",     tools: [dialogue_test],  gate: "persona >= 0.8" },
      { name: "review",      tools: [quality_check],  gate: "all >= 0.75" },
      { name: "publish",     tools: [export],          gate: "review.pass" }
    ]
  }

  WorkflowTemplate::Serialized {
    stages: [
      { name: "write_ep",     tools: [neko-story] },
      { name: "compat_check", tools: [state_checker],  gate: "state_compat.pass" },
      { name: "save_test",    tools: [save_tester],    gate: "save_compat.pass" },
      { name: "content",      extends: "Interactive.stages[2..6]" },
      { name: "butterfly",    tools: [butterfly_test],  gate: "butterfly.pass" },
      { name: "publish",      tools: [incr_publish],    gate: "all.pass" }
    ]
  }

  User selects scene type → framework guides through stages.
  Each stage has a quality gate → cannot proceed until gate passes.
  AI assists at every stage (SceneAssembler / AutoRefine / etc.).
```

### Three Profiles Aligned

```
Each scene type has three aligned profiles:

  Scene Type     RenderProfile      QualityProfile      WorkflowTemplate
  ─────────────────────────────────────────────────────────────────────────
  Video          Video              Video               Video
  Interactive    Interactive        Interactive         Interactive
  Serialized     Interactive        Serialized          Serialized
  XR             XR                 XR                  (Interactive+XR)
  Game           Game               Game                Game
  Simulation     Simulation         Simulation          Simulation
  Web            Web                (matches source)    (matches source)

  RenderProfile   → how engine renders at runtime
  QualityProfile  → what to verify at creation time
  WorkflowTemplate → how to organize the creation process

  Adding a new scene type = 3 new configs (JSON), optionally new checkers (code).
  Core framework (engine + checker registry + workflow runner) unchanged.
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
  Organized in 4 layers: Identity / Performance / World / Narrative.
  See neko-suite-architecture-overview.md > "Unified Asset Standard" for full standard system.
```

---

## Asset Registry ↔ Engine Integration

```
Gap: Asset detection (neko-assets) and engine processing (neko-engine) are currently
disconnected. The asset library knows file type/size but not capabilities inside.

Target: AssetRegistry becomes "format knowledge hub" with engine-extracted metadata.

  File scan (neko-assets)
      ↓
  AssetType detection (extension → type mapping)
      ↓
  Capability extraction (two paths):
      ├── Simple formats (.cube/.bvh/.exp3) → TS-side parser (fast, no engine)
      └── Complex formats (.glb/.vrm/.moc3) → Engine probe query (accurate)
      ↓
  TypeMetadata stored in AssetManifest
      ↓
  Creation tools query metadata → intelligent behavior

  Missing extension-to-type mappings (to add):
    .glb/.gltf/.vrm → '3d-model'      .hdr/.exr → 'environment'
    .moc3/.inp → 'puppet'              .bvh → 'motion'
    .cube/.3dl → 'lut'                 .vmd → 'motion'
    .exp3.json → 'expression'          .motion3.json → 'motion'
    .nkmotion → 'motion'               .nkexpr → 'expression'
    .nkscene → 'scene'                 .nkeffect → 'effect-preset'
    .nkchar → 'character'              .nkbind → 'story-binding'

  New IAssetHandler implementations needed:
    Model3DHandler    → inspects .glb/.vrm (via engine scenes:probe)
    PuppetHandler     → inspects .moc3 (via engine puppets:probe)
    MotionHandler     → parses .bvh header (TS-side)
    LUTHandler        → parses .cube header (TS-side)
    EnvironmentHandler → reads .hdr header (TS-side)
    ExpressionHandler  → parses .exp3.json (TS-side)

  All defined as serde-serializable Rust structs + TypeScript mirror types in @neko/shared.
```
