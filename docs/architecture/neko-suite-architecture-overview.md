# Neko Suite — Architecture Overview

> Complete system architecture derived from the product evolution analysis.
> See [product-evolution-roadmap.md](./product-evolution-roadmap.md) for detailed stage plans and feasibility analysis.

---

## System Architecture (Full Stack)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              INPUT LAYER                                  │
│                                                                           │
│  Creator Intent          Asset Input               Realtime Input         │
│  ├ Script (.fountain)    ├ Images / Video           ├ Face tracking        │
│  ├ Voice command         ├ BVH / VMD / mocap        │  (ARKit/VMC)         │
│  ├ Sketch / reference    ├ VRM / MOC3 / glTF        ├ Microphone           │
│  └ Emotion keywords      ├ HDR / LUT / audio        ├ Gamepad / hand       │
│                          └ .cube / .hdr / .exr       └ Camera (MediaPipe)  │
└────────┬─────────────────────────┬─────────────────────────┬─────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          AI ORCHESTRATION LAYER                            │
│                                                                           │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────────────┐ │
│  │ neko-agent    │  │ Scene         │  │ EmotionArc Controller          │ │
│  │ (LLM Hub)    │  │ Assembler     │  │                                │ │
│  │              │  │               │  │ Single emotion curve drives:   │ │
│  │ 7 LLM       │  │ Script parse  │  │ → Expression (face/body)       │ │
│  │ 10 media     │  │ Asset generate│  │ → Camera (pacing/shake)        │ │
│  │ 44 MCP tools │  │ Timeline      │  │ → Lighting (temp/brightness)   │ │
│  │ Coordinator  │  │ assemble      │  │ → Color (saturation/vignette)  │ │
│  │ + SubAgents  │  │ → .nkv        │  │ → Music (intensity/selection)  │ │
│  └──────┬───────┘  └──────┬────────┘  │ → DOF / shake / fog           │ │
│         │                 │           └─────────────┬──────────────────┘ │
│  ┌──────┴───────┐  ┌──────┴────────┐  ┌────────────┴──────────────────┐ │
│  │ EmotionTo    │  │ Camera        │  │ CharacterAgent[]               │ │
│  │ Motion       │  │ Director      │  │ (per-character AI)             │ │
│  │              │  │               │  │                                │ │
│  │ emotion →    │  │ shot type →   │  │ persona + memory +             │ │
│  │ Semantic     │  │ Camera        │  │ perspectiveFilter +            │ │
│  │ Motion       │  │ Keyframes     │  │ structured LLM output          │ │
│  │ (predefined) │  │ (predefined)  │  │ (emotion/action/text/trust)    │ │
│  └──────────────┘  └───────────────┘  └────────────────────────────────┘ │
└────────┬─────────────────────────┬─────────────────────────┬─────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED ASSET LAYER                                │
│                                                                           │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ Character   │ │ Motion      │ │ Expression   │ │ Scene            │  │
│  │ (.nkchar)   │ │ (.nkmotion) │ │ (.nkexpr)    │ │ (.nkscene)       │  │
│  │             │ │             │ │              │ │                  │  │
│  │ model       │ │ Semantic    │ │ ~30 presets  │ │ environment      │  │
│  │ +motions{}  │ │ Motion      │ │ atomic chans │ │ +characters[]    │  │
│  │ +expressions│ │ channels    │ │ +blendMode   │ │ +props[]         │  │
│  │ +voice      │ │ (dimension  │ │ +micro noise │ │ +camera          │  │
│  │ +agent      │ │  agnostic)  │ │ +fadeIn/Out  │ │ +effects[]       │  │
│  └─────────────┘ └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ Effect      │ │ Lighting    │ │ Voice        │ │ StoryBinding     │  │
│  │ (.nkeffect) │ │ (in Scene)  │ │ (in Char)    │ │ (.nkbind)        │  │
│  │             │ │             │ │              │ │                  │  │
│  │ layers[]    │ │ ambient IBL │ │ ttsProvider  │ │ character →      │  │
│  │ +params     │ │ +lights[]   │ │ +voiceId     │ │   CharBundle     │  │
│  │ +scope      │ │ +shadow     │ │ +visemeMode  │ │ scene →          │  │
│  │ +emotion    │ │ +postProcess│ │              │ │   SceneSpec      │  │
│  │  Binding    │ │ +emotion    │ │              │ │ emotion/action → │  │
│  │             │ │  Binding    │ │              │ │   Expr/Motion    │  │
│  └─────────────┘ └─────────────┘ └──────────────┘ └──────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐                       │
│  │ SeriesSpec  │ │ PlayerSave  │ │ MemoryAnchor │                       │
│  │ (.nkseries) │ │ (per-player)│ │ (per-event)  │                       │
│  │             │ │             │ │              │                       │
│  │ episodes[]  │ │ progress    │ │ fact (truth) │                       │
│  │ +stateContr │ │ +state      │ │ +perspectives│                       │
│  │ +sharedAsset│ │ +memories   │ │ +anchor_rules│                       │
│  │ +DAG deps   │ │ +anchors    │ │ +discovery   │                       │
│  └─────────────┘ └─────────────┘ └──────────────┘                       │
│                                                                           │
│  All assets referenced by ID (loose coupling). Independently versionable, │
│  publishable, swappable. Bindings are separate from assets.               │
└────────┬─────────────────────────┬─────────────────────────┬─────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     FORMAT COMPATIBILITY LAYER                            │
│                                                                           │
│  Import Adapters              ←→              Export Adapters              │
│  ├ bvh_adapter   (.bvh ↔ SemanticMotion)      ├ → .glb (with animation) │
│  ├ cube_adapter  (.cube ↔ EffectSpec LUT)      ├ → .motion3.json         │
│  ├ hdr_adapter   (.hdr/.exr → LightSpec)       ├ → .exp3.json            │
│  ├ vmd_adapter   (.vmd ↔ Motion+Expr+Cam)      ├ → .bvh                  │
│  ├ exp3_adapter  (.exp3 ↔ ExpressionSpec)       ├ → .cube                 │
│  ├ motion3_adapt (.motion3 ↔ SemanticMotion)    ├ → .vmd                  │
│  ├ gltf_adapter  (glTF anim ↔ SemanticMotion)   └ → .usdz (future)       │
│  └ vrm_adapter   (VRM expr ↔ ExpressionSpec)                              │
│                                                                           │
│  trait FormatAdapter<T> { fn import() / fn export() }                     │
│  Feature-gated modules. Private formats via MCP bridge (Blender/PS).      │
└────────┬─────────────────────────┬─────────────────────────┬─────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   ASSET EXTRACTION LAYER (ML)                             │
│                                                                           │
│  Image →  Depth Anything (SceneSpec 2.5D)   Video → Pose (SemanticMotion)│
│           SAM (segmentation)                        Face (ExpressionSpec) │
│           FaceMesh (ExpressionSpec)                  DUSt3R (CameraKey)   │
│           Light estimation (LightSpec)               SceneDetect (shots)  │
│           Color analysis (EffectSpec LUT)            Demucs (audio stems) │
│           TripoSR (3D mesh)                          Whisper (subtitles)  │
│           Normal map estimation                      3DGS (SceneSpec)     │
│                                                                           │
│  Realtime: ARKit/VMC → SemanticMotion (neko-live, exists)                 │
│  Recording: frame buffer → smooth → .nkmotion (MocapMerger multi-source)  │
│  Runtime: ONNX models via runtime-ml. Small bundled, large on-demand.     │
└────────┬─────────────────────────┬─────────────────────────┬─────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      RENDER / OUTPUT LAYER                                │
│                                                                           │
│  ┌─────────────────────────┐  ┌────────────────┐  ┌───────────────────┐  │
│  │ gpu_export_pipeline      │  │ runtime-stage  │  │ Web Viewer        │  │
│  │ (offline/streaming)      │  │ (interactive)  │  │ (browser)         │  │
│  │                          │  │                │  │                   │  │
│  │ ① Video/Image → GpuLayer│  │ ScriptEngine   │  │ Three.js          │  │
│  │ ② Text → GpuLayer       │  │ Interaction    │  │  +@pixiv/three-vrm│  │
│  │ ③ Scene3D → PBR/NPR     │  │ DynamicDialog  │  │ PixiJS            │  │
│  │    → GpuLayer            │  │ ButterflySystem│  │  +pixi-live2d     │  │
│  │ ④ Puppet → GpuLayer     │  │ Discovery      │  │ WebXR             │  │
│  │ ⑤ Shape → GpuLayer      │  │ QTE / Hotspot  │  │  (Quest/Vision)   │  │
│  │ ⑥ Camera Keyframe       │  │ Save/Load      │  │                   │  │
│  │ ⑦ Light + Shadow        │  │                │  │                   │  │
│  │ ⑧ Z-sort + Composite    │  │                │  │                   │  │
│  │ ⑨ Effects chain         │  │                │  │                   │  │
│  │ ⑩ Encode → H.264        │  │                │  │                   │  │
│  └─────────┬───────────────┘  └───────┬────────┘  └────────┬──────────┘  │
│            │                          │                     │             │
│            ▼                          ▼                     ▼             │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐     │
│  │ MP4/WebM/ProRes │  │ Electron App     │  │ Web App (PWA)       │     │
│  │ (video file)    │  │ (desktop/XR)     │  │ (browser/mobile)    │     │
│  └─────────────────┘  └──────────────────┘  └──────────────────────┘     │
│            │                          │                     │             │
│            └──────────┬───────────────┘                     │             │
│                       ▼                                     │             │
│            ┌──────────────────┐                              │             │
│            │ Batch Render API │ ← headless CLI export        │             │
│            │ (template × N)  │                              │             │
│            └──────────────────┘                              │             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Engine Architecture (Rust)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        neko-engine (Rust Sidecar)                          │
│                                                                           │
│  Host Layer (communication frontends)                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ host-napi   │  │ host-http    │  │ host-cli    │  │ host-api      │  │
│  │ (N-API      │  │ (REST +      │  │ (CLI +      │  │ (ActionRouter │  │
│  │  cdylib)    │  │  WebSocket   │  │  headless   │  │  + controllers│  │
│  │             │  │  streaming)  │  │  export)    │  │  + plugins)   │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └──────┬────────┘  │
│         └────────────────┼─────────────────┼─────────────────┘           │
│                          ▼                 ▼                              │
│  Core Layer                                                               │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ engine-kernel                                                      │   │
│  │ ├── gpu/ (wgpu)                                                    │   │
│  │ │   ├── texture_compositor.rs    27 blend modes + masking          │   │
│  │ │   ├── scene_renderer/          PBR + IBL + particles             │   │
│  │ │   ├── shape_rasterizer.rs      tiny-skia vector → GPU texture   │   │
│  │ │   └── effect_dispatcher.rs     20+ GPU effects (texture→texture)│   │
│  │ ├── export/                                                        │   │
│  │ │   └── gpu_export_pipeline.rs   full-frame compositing + encode  │   │
│  │ ├── codec/                       FFmpeg HW encode/decode           │   │
│  │ └── stream/                      H.264 + PCM WebSocket streaming  │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  Runtime Layer (progressive expansion per Stage)                          │
│  ┌────────────┐ ┌──────────────┐ ┌─────────────┐ ┌───────────────────┐  │
│  │runtime-    │ │runtime-scene │ │runtime-     │ │runtime-ml         │  │
│  │puppet      │ │              │ │device       │ │                   │  │
│  │            │ │ bevy_ecs     │ │             │ │ ONNX Runtime      │  │
│  │ bevy_ecs   │ │ glTF/VRM    │ │ Camera      │ │ ├ Upscale/Denoise│  │
│  │ MOC3/INP   │ │ GPU Skinning│ │ (nokhwa)    │ │ ├ CLIP/Whisper   │  │
│  │ Deformers  │ │ IK (FABRIK) │ │ Microphone  │ │ ├ Depth/Normal   │  │
│  │ Expression │ │ Animation   │ │ (cpal)      │ │ ├ Pose/Face      │  │
│  │ Motion     │ │ Blend+Fade  │ │ MIDI(midir) │ │ └ TripoSR/3DGS  │  │
│  │ Physics    │ │ MorphWeights│ │ Gamepad     │ │                   │  │
│  └────────────┘ └──────────────┘ │ (gilrs)    │ └───────────────────┘  │
│                                  └─────────────┘                         │
│  Future Runtimes:                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐                      │
│  │runtime-stage│ │runtime-xr    │ │runtime-sim   │                      │
│  │ (Stage 3)   │ │ (Stage 2)    │ │ (Stage 5)    │                      │
│  │             │ │              │ │              │                      │
│  │ ScriptEngine│ │ OpenXR       │ │ Deterministic│                      │
│  │ StageDirector│ │ Stereo render│ │ Sensor MRT  │                      │
│  │ VideoSegment│ │ SpatialInput │ │ Gym API      │                      │
│  │ QTE/Hotspot │ │ AR Plane/    │ │ DomainRandom │                      │
│  │ ButterflySys│ │  Light       │ │ DataPipeline │                      │
│  │ Discovery   │ │ HRTF Audio   │ │ (PyO3)       │                      │
│  └─────────────┘ └──────────────┘ └──────────────┘                      │
│                                                                           │
│  Shared: engine-types (DTOs + EasingType + SemanticMotion + RetargetMap)  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## VSCode Extension Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       VSCode Extension Host (Node.js)                     │
│                                                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │neko-cut  │ │neko-story│ │neko-agent│ │neko-canvas│ │neko-model    │  │
│  │Video Edit│ │Screenplay│ │AI Agent  │ │Storyboard│ │3D Editor     │  │
│  │ Timeline │ │ Fountain │ │ 7 LLM    │ │ NodeGraph│ │ glTF/VRM     │  │
│  │ Preview  │ │ LSP (8)  │ │ 10 Media │ │ 13 Nodes │ │ Face/IK      │  │
│  │ Export   │ │ ScriptIdx│ │ 44 Tools │ │ Batch Gen│ │ Animation    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │neko-     │ │neko-     │ │neko-live │ │neko-audio│ │neko-preview  │  │
│  │puppet    │ │sketch    │ │VTuber    │ │Audio Edit│ │File Preview  │  │
│  │2D Skeletal│ │2D Paint │ │VMC/ARKit │ │Multi-trk │ │PDF/EPUB/     │  │
│  │MOC3/INP  │ │Brush/Lyr│ │Recording │ │Spectrum  │ │Video/Image   │  │
│  │Animation │ │Pressure │ │Tracking  │ │Effects   │ │Waterfall     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐   │
│  │neko-     │ │neko-     │ │neko-tools│ │neko-auth                 │   │
│  │assets    │ │market    │ │Utilities │ │OAuth + Token + Session   │   │
│  │TreeView  │ │Marketplace│ │QR/Color │ │                          │   │
│  │Thumbnail │ │Browse/   │ │Timer/   │ │                          │   │
│  │Search    │ │Install   │ │Counter  │ │                          │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────────────┘   │
│                                                                           │
│  Shared Packages:                                                         │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────────────┐  │
│  │ @neko/shared    │ │ @neko/client   │ │ @neko/proto                  │  │
│  │ (neko-types)    │ │ (neko-client)  │ │ (Protobuf IDL)              │  │
│  │                 │ │               │ │                              │  │
│  │ Logger/i18n/    │ │ EngineClient  │ │ Type contract source         │  │
│  │ Theme/Errors    │ │ H264Stream    │ │ of truth for engine          │  │
│  │ nkv/nkc/nka SDK │ │ AudioStream   │ │ communication                │  │
│  │ Asset types     │ │ WebSocket     │ │                              │  │
│  │ All Spec types  │ │               │ │                              │  │
│  └────────────────┘ └────────────────┘ └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## AI Orchestration Levels

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  Level 1 — Intent Understanding (LLM, NON-DETERMINISTIC)                  │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ Input: natural language / script / voice / sketch                  │   │
│  │ Output: SceneDirective { characters, emotions, actions, camera }   │   │
│  │ Role: understand WHAT. Does NOT decide HOW to render.              │   │
│  └────────────────────────────────────┬───────────────────────────────┘   │
│                                       │                                   │
│  Level 2 — Semantic Translation (mapping tables, DETERMINISTIC)           │
│  ┌────────────────────────────────────┴───────────────────────────────┐   │
│  │ EmotionToMotion:  "anxious" → SemanticMotion channels (table)      │   │
│  │ CameraDirector:   "close_up" → Camera Keyframes (presets)          │   │
│  │ ExpressionSpec:   "shy" → face channel values (presets)            │   │
│  │ EmotionArc:       tension 0.7 → light/color/music params (curves)  │   │
│  │ Role: translate semantics to parameters. No AI. Predictable.       │   │
│  └────────────────────────────────────┬───────────────────────────────┘   │
│                                       │                                   │
│  Level 3 — Resource Assembly (SceneAssembler, DETERMINISTIC)              │
│  ┌────────────────────────────────────┴───────────────────────────────┐   │
│  │ Read StoryBinding → locate assets → call media adapters            │   │
│  │ → assemble .nkv timeline → arrange all tracks                      │   │
│  │ Role: assemble assets into renderable project. No creative choice. │   │
│  └────────────────────────────────────┬───────────────────────────────┘   │
│                                       │                                   │
│  Level 4 — Render Execution (engine, DETERMINISTIC)                       │
│  ┌────────────────────────────────────┴───────────────────────────────┐   │
│  │ gpu_export_pipeline / runtime-stage / Three.js                     │   │
│  │ Read assets → render → encode → output                             │   │
│  │ Role: execute. No decisions.                                       │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  KEY DESIGN: AI non-determinism confined to Level 1 ONLY.                 │
│  Levels 2-4 are deterministic pipelines consuming structured data.        │
│  AI produces data, not pixels. Uncertainty does not leak into rendering.  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Five Core Data Flows

```
Flow 1: Script → Final Output (main creation pipeline)
  .fountain → Parser → StoryBinding → AI analysis → asset resolve
  → TTS + viseme → SceneAssembler → .nkv → render → MP4/interactive/Web

Flow 2: Realtime Interactive (AI dialogue-driven)
  Player input → CharacterAgent (persona + memory + anchors)
  → LLM → {text,emotion,action} → parallel: TTS + expression + motion
  → streaming composite → H.264 → browser/headset

Flow 3: EmotionArc Cascade (single value drives everything)
  tension 0-1 → expression + camera + lighting + color + music + DOF + shake
  Creator sets emotion keyframes only — all AV parameters derived.

Flow 4: Asset Extraction (image/video → structured assets)
  Image → Depth/SAM/Face/Light/Color/3D → unified asset formats
  Video → Pose/Face/Camera/Shots/Audio/Subtitles/3DGS → unified assets

Flow 5: Serialized + Memory (cross-episode state)
  SeriesSpec → episode load → PlayerSave restore → runtime execute
  → MemoryAnchor create → CharacterAgent perspective inject
  → DiscoverySystem → fragment release → save → next episode
```

---

## Stage Progression

```
Stage   Name                     Runtime          Net-New               Reuses
─────────────────────────────────────────────────────────────────────────────
  1     AI Story-Video IDE       (current)        —                     —
  3*    AI Interactive Cinema    runtime-stage     ScriptEngine          puppet+scene
                                                  Interaction           +agent+engine
                                                  DynamicDialogue
                                                  ButterflySystem
                                                  ExportRuntime
  2     AI XR IDE                runtime-xr       OpenXR session        Stage 3 runtime
                                                  Stereo render         -stage entirely
                                                  SpatialInput
                                                  HRTF audio
  4     Interactive Story Engine runtime-game      Rapier physics        Stage 3 + XR
                                                  NavMesh
                                                  ScriptVM
  5     Simulation Platform      runtime-sim      Deterministic world   Stage 4 physics
                                                  Sensor MRT            +engine headless
                                                  Gym API (PyO3)
  6     Creative AIOS            creative-kernel  World State Manager   All prior stages
                                                  Multi-Agent Scheduler
                                                  Aesthetic Memory
                                                  Consistency Engine
  7     Reality AIOS             reality-kernel   Perception Engine     Stage 6 kernel
                                                  Physical World Model  +Stage 5 sim
                                                  Actuation Interface

  * Stage 3 before Stage 2 (confirmed): lower risk, higher ROI, AI differentiation.
```

---

## Extensible Application Scenarios

```
All scenarios reuse the same core engine layer with thin adaptation:

  ┌─────────────────────────────────────────────────────────────────┐
  │                    CORE ENGINE (built once)                      │
  │                                                                  │
  │  Rendering │ AI Orchestration │ Interactive Runtime │ Assets     │
  │  Standards │ Format Adapters  │ Mocap Pipeline      │ Publishing │
  └──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
         │          │          │          │          │
         ▼          ▼          ▼          ▼          ▼
  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
  │Film/Video│ │Interact.│ │Vertical│ │ 2D Game│ │Batch Content │
  │          │ │Narrative│ │Markets │ │Galgame │ │Factory       │
  │Short film│ │AI cinema│ │Educate │ │VN+RPG  │ │Brand video   │
  │MV/music │ │Serialized│ │Digital │ │ puzzle │ │Personalized  │
  │Audiobook│ │Galgame  │ │human   │ │        │ │marketing     │
  │Manga    │ │VR/XR    │ │VTuber  │ │        │ │template×N    │
  └──────────┘ └─────────┘ └────────┘ └────────┘ └──────────────┘

  Each new scenario: core engine reuse = 0 cost, adaptation = weeks.
```

---

## IDE Host Strategy

```
  2026 (Stage 1):  Pure VSCode extensions (14 extensions, validated)
                   Webview preview sufficient for video editing.

  2027 (Stage 3):  + Electron external preview window
                   "Preview" button → fullscreen interactive playback.
                   Same Electron code = ExportRuntime = zero extra dev.

  2028+ (optional): Code OSS / Theia customization
                   Custom layout + branding.
                   Extension-compatible (14 extensions work unchanged).

  Principle: VSCode = creation. Electron = consumption. Not a replacement.
```

---

## Market Entry

```
  Phase 1 (2026 H1): AI short drama creation → 1K-10K users (open source)
  Phase 2 (2026 H2): + VTuber + audiobook → 10K-50K users (marketplace)
  Phase 3 (2027):    Interactive narrative platform → 200K+ creators (platform)
  Phase 4 (2028+):   Creator economy → 1M+ creators (ecosystem)

  TAM: ~$25B+ (2030) across video/interactive/digital-human/education markets
  Positioning: only tool covering all 4 levels of interactive video + AI-native + zero-code
```
