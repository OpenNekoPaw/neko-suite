# Neko Suite Product Evolution Roadmap

## Overview

Neko Suite's evolution path from creative tool to world-scale AI operating system, organized in 7 progressive stages. Each stage builds on the previous, with clear boundaries on what to do and what not to do.

```
Stage 1: AI Story-Video IDE          ← Current + Near-term
Stage 2: AI XR IDE                   ← Medium-term
Stage 3: AI Interactive Cinema IDE   ← Medium-term
Stage 4: Game Engine + Game IDE      ← Long-term
Stage 5: Simulation Engine + World Model Training Platform  ← Vision
Stage 6: Creative AIOS              ← Endgame (Creative World)
Stage 7: Reality AIOS               ← Endgame (Physical World)
```

---

## Stage 1: AI Story-Video IDE

**Status**: Current core product

**Definition**: AI-powered professional video creation workspace — from script to final export.

### Capability Matrix

| Module | Role | Status |
|--------|------|--------|
| neko-story | Structured screenplay writing (scenes/shots/dialogue) | Implemented |
| neko-agent | AI generation (image/video/audio/music) + tool orchestration | Implemented |
| neko-cut | Multi-track timeline editing, transitions, effects | Implemented |
| neko-canvas | 2D compositing, layers, vector graphics | Implemented |
| neko-sketch | 2D painting, brushes, pressure-sensitive input | Implemented |
| neko-puppet | 2D skeletal animation (Live2D MOC3) | In Progress |
| neko-model | 3D model viewing + transform + animation (glTF/VRM) | Implemented |
| neko-preview | Media file preview | Implemented |
| neko-assets | Asset management | Implemented |
| neko-engine | Rust sidecar: GPU rendering, FFmpeg codec, ML inference | Implemented |

### Core Workflow

```
Script Writing → AI Asset Generation → Visual Editing → Timeline Assembly → Export
(neko-story)    (neko-agent)          (canvas/sketch   (neko-cut)         (engine)
                                       /puppet/model)
```

### AI Integration Points

- Script → structured SceneSpec → AI generates matching assets
- Agent orchestrates multi-modal generation (DALL-E/Sora/TTS/music)
- AI-assisted editing suggestions (cuts, transitions, color grading)

### Boundaries

```
Do:   Full linear video production pipeline
Do:   AI-assisted asset generation and editing
Do:   Professional-grade export (H.264/H.265, ProRes)
Don't: Real-time interactive content (→ Stage 3)
Don't: Spatial/volumetric content (→ Stage 2)
```

---

## Stage 2: AI XR IDE

**Status**: Future — requires Stage 1 maturity + Stage 3 for interactive XR

**Definition**: Extend the creative workspace to spatial content — AR, VR, and mixed reality experiences.

### XR Sub-Scenarios

```
              Input                 Output                Core Tech
VR Viewing    360° video / 3D scene  Stereoscopic display   Stereo render + head tracking
VR Interactive 3D scene + characters  Hand/gaze interaction  runtime-stage + spatial input
AR Overlay    Camera feed + virtual   Passthrough blend      Plane detection + light estimation
MR Mixed      Real environment + 3D   Spatial anchoring      Scene understanding + occlusion
```

### Delta from Stage 1

| New Capability | Technical Requirement | Build On |
|---------------|----------------------|----------|
| 3D scene composition | Multi-object scene graph + spatial editor | runtime-scene (bevy_ecs) |
| Spatial audio | HRTF + ambisonic rendering | runtime-device (cpal) + oddio/kira |
| VR preview | OpenXR integration + stereoscopic rendering | engine-kernel (wgpu) |
| AR overlay | Camera passthrough + plane detection | runtime-device (nokhwa) |
| 360° video | Equirectangular projection + stitching | engine-kernel (FFmpeg) |
| Hand/body tracking | MediaPipe / custom ONNX models | runtime-ml |
| Spatial UI | 3D panels + gaze/hand interaction | New: runtime-xr |

### Architecture Extension

```
Existing:
  neko-model (3D editor) + runtime-scene (ECS) + engine-kernel (wgpu)

New runtime:
  runtime-xr
    ├── XrSession              ← OpenXR session lifecycle
    │   ├── Enumerate devices (HMD, controllers, hand tracking)
    │   ├── Create swapchain (per-eye render targets)
    │   ├── Frame loop (wait → acquire → render → release)
    │   └── Reference space management (local / stage / unbounded)
    │
    ├── StereoRenderer         ← Dual-eye rendering
    │   ├── Method A: Dual pass (simple, ~50% perf of mono)
    │   ├── Method B: Instanced stereo (gl_ViewIndex, ~80% perf)
    │   └── Method C: wgpu multiview extension (best, Quest-optimized)
    │   Note: 2D puppet characters → billboard quad in 3D space
    │         → natural stereo parallax from dual-eye projection
    │
    ├── SpatialInput           ← XR input abstraction
    │   ├── ray_cast() → Option<(Entity, HitPoint)>
    │   ├── grab_state(hand) → GrabState { entity, transform }
    │   ├── pinch_value(hand) → f32 (0~1)
    │   ├── gaze_target() → Option<Entity>
    │   └── Maps to Stage 3 InteractionHandler:
    │       onClick → ray_hit, onDrag → grab, onAdvance → gaze_confirm
    │
    ├── ArPlaneDetection       ← AR environment understanding
    │   ├── OpenXR XR_PLANE_DETECTION → ground/table/wall planes
    │   ├── Place 2D/3D characters on detected surfaces
    │   └── Reuses Stage 1 billboard compositing for 2D characters
    │
    ├── ArLightEstimation      ← AR lighting match
    │   ├── OpenXR XR_LIGHTING_ESTIMATION → main light dir + SH
    │   └── Applies to virtual objects using same pipeline as
    │       2D+3D compositing Level 1 tone matching (Cross-Stage)
    │
    ├── DepthOcclusion         ← MR real-world occlusion
    │   ├── Depth sensor (LiDAR/ToF on Quest 3 / Vision Pro)
    │   ├── real_depth < virtual_depth → show real environment
    │   └── Same algorithm as 2.5D Depth-Aware Compositing (Cross-Stage)
    │
    └── SpatialAudio           ← 3D positional sound
        ├── HRTF processing (oddio or kira-spatial crate)
        ├── Sound source position bound to ECS Entity
        ├── Head tracking → real-time HRTF parameter update
        └── Reuses neko-audio mix infrastructure

New extension:
  neko-spatial (or extend neko-model)
    ├── 3D scene editor with spatial placement tools
    ├── VR preview button → launch external XR app
    ├── AR overlay editor (anchor virtual objects to planes)
    └── 360° video stitching UI
```

### Stereoscopic Rendering — Technical Detail

```
VR hard requirements:
  Frame rate: 72~120 FPS (Quest 90fps, Vision Pro 90fps)
  Motion-to-photon latency (MTP): < 20ms
  Below threshold → nausea

Current engine performance:
  Mono render: ~16ms/frame (60fps) → Dual pass: ~32ms → only 30fps ❌
  Needed: instanced stereo or multiview to stay under budget.

Optimization stack:
  1. Instanced stereo rendering (halve draw call overhead)
  2. Fixed Foveated Rendering (center=full res, periphery=quarter)
     → Quest/Vision Pro hardware support, wgpu via variable render target size
  3. Async Timewarp / Reprojection (HMD-side frame interpolation)
     → OpenXR runtime provides this, no engine work needed
  4. LOD / occlusion culling (shared need with Stage 4)

Puppet (2D character) performance in VR:
  runtime-puppet tick < 5ms → 90fps safe
  CPU deformation → zero GPU budget impact
  Billboard texture upload per frame → acceptable overhead
```

### XR Publishing Channels

```
VSCode webview sandbox cannot access OpenXR directly.

Creation phase (VSCode):
  Normal 2D+3D+video editing → timeline / script / scene
  "Preview in VR" button → launch external XR application

Preview/publishing phase:

  Path A — Electron + WebXR (recommended, primary path):
    Electron app → WebXR API → headset browser
    ├── Three.js WebXRManager (mature, widely supported)
    ├── @pixiv/three-vrm for VRM characters (already in codebase)
    ├── pixi-live2d-display for 2D characters
    └── Targets: Quest Browser, Vision Pro Safari, desktop VR

  Path B — Native OpenXR (high performance):
    Rust engine → openxr crate → direct HMD rendering
    ├── wgpu render → OpenXR swapchain
    ├── Best performance (no browser overhead)
    └── Platform-specific (Quest, SteamVR, WMR)

  Path C — Streaming (lightweight client):
    Engine server-side stereo render → H.264 dual-eye stream → headset decode
    ├── Reuses existing streaming architecture (host-http WebSocket)
    ├── No client-side GPU needed
    ├── Latency ~50-100ms → acceptable for passive viewing, not fast interaction
    └── Best for: remote preview, exhibition kiosks, lightweight devices

  Recommended rollout:
    Stage 2 initial: Path A (WebXR) → broadest compatibility
    Stage 2 mature:  Path B (Native) → performance-critical use cases
    Remote/demo:     Path C (Streaming) → zero-install preview
```

### Reuse from Stage 3 (Interactive Cinema)

```
If Stage 3 is completed first (confirmed in roadmap priority):

  Stage 3 component          → XR reuse
  ─────────────────────────────────────────────────
  runtime-stage StageDirector → XR scene orchestration (identical)
  ScriptEngine               → XR interactive narrative (identical)
  DynamicDialogue            → XR voice-driven AI conversation
  InteractionHandler         → Maps to SpatialInput (onClick→ray, onDrag→grab)
  ButterflySystem            → XR branching narrative (identical)
  SemanticMotion             → XR character animation (identical)
  VRM/Puppet retarget maps   → XR character driving (identical)
  NPR rendering              → XR stylized content (identical)
  Billboard compositing      → XR 2D character in 3D space (natural stereo)
  Level 1 light matching     → AR light estimation (superset)
  Depth-Aware compositing    → MR occlusion (same algorithm, real depth source)

  Stage 2 net-new after Stage 3:
    ├── Stereo rendering (instanced dual-eye)
    ├── OpenXR session management
    ├── Spatial input abstraction (ray/grab/gaze)
    ├── HRTF spatial audio
    ├── AR plane detection
    └── XR publish channel (WebXR/Electron)

  This confirms the roadmap decision: Stage 3 before Stage 2.
```

### AI Integration Points

- AI-generated 3D scenes from text/image prompts (reuses Stage 1 generation pipeline)
- Spatial layout suggestions (furniture placement, lighting — LLM + scene graph analysis)
- Auto-generate LOD variants for performance (TripoSR/Trellis mesh simplification)
- Voice-driven scene manipulation in VR (neko-agent + STT + DynamicDialogue)
- AI spatial audio generation (ambient sound from scene description)

### Boundaries

```
Do:   VR/AR content creation and preview
Do:   360° video production
Do:   Spatial audio authoring
Do:   2D+3D characters in XR (billboard + spatial placement)
Do:   Interactive XR narrative (reuse Stage 3 runtime-stage)
Don't: Real-time multiplayer VR (→ Stage 4)
Don't: Full physics simulation (→ Stage 5)
Don't: Build custom XR rendering engine (use Three.js WebXR + openxr crate)
```

---

## Stage 3: AI Interactive Cinema IDE

**Status**: Planned — natural extension of Stage 1

**Definition**: Create interactive narrative experiences — branching stories with player agency, from visual novels to interactive films.

### Delta from Stage 1

| New Capability | Technical Requirement | Build On |
|---------------|----------------------|----------|
| Scene playback engine | runtime-stage: orchestrate puppet + scene + video | runtime-puppet + runtime-scene |
| Declarative script engine | Parse .nkstory interactive directives | neko-story format |
| Branch/choice system | Variables + conditions + branching | ScriptEngine |
| Video segment switching | Preload + seamless switch (<100ms gap) | engine-kernel FFmpeg |
| QTE (Quick Time Events) | Timer + input detection + UI overlay | runtime-stage |
| Dynamic dialogue (LLM) | Claude API + character persona + context | neko-agent |
| Butterfly effect system | Causal graph: choices → weighted consequences | ButterflySystem |
| Save/load system | Snapshot state (variables + scene + progress) | SaveSystem |
| Clickable hotspots | Region definition + hover + click → events | HotspotManager |
| Export standalone runtime | Package assets + script + WASM runtime | ExportRuntime |

### Architecture

```
runtime-stage (New — Scene Stage Runtime)
    │
    ├── StageDirector           ← Scene orchestration
    │   ├── load(SceneSpec)
    │   ├── place(character, position)
    │   ├── animate(character, action)
    │   ├── moveCamera(CameraAngle)
    │   └── playDialogue(text, voiceAsset?)
    │
    ├── ScriptEngine            ← Declarative story script
    │   ├── Variable system (flags/counters/relationships)
    │   ├── Conditional branching (if/switch)
    │   ├── Command sequence (show/hide/move/say/choice)
    │   └── Label jumps (label/jump)
    │
    ├── InteractionHandler      ← Player interaction
    │   ├── onClick(entity) → event dispatch
    │   ├── onDrag(entity) → placement update
    │   └── onAdvance() → next dialogue/shot
    │
    ├── VideoSegmentPlayer      ← Pre-recorded video playback
    │   ├── Segment preloading (at 80% → preload next)
    │   ├── Branch point → preload all possible next segments
    │   └── Seamless switching (double-buffer decode)
    │
    ├── QTEHandler              ← Quick Time Events
    │   ├── Key prompt + countdown ring
    │   └── Success/fail → branch
    │
    ├── DynamicDialogue         ← LLM-driven free conversation
    │   ├── Character persona + context injection
    │   ├── Claude API → response generation
    │   ├── → puppet expression/action drive
    │   └── → TTS voice synthesis
    │
    ├── EmotionTracker          ← Relationship/emotion tracking
    │   └── Weighted influence model
    │
    ├── ButterflySystem         ← Causal consequence graph
    │   ├── Choice → weighted impact → delayed consequences
    │   └── Post-ending causality visualization
    │
    ├── SaveSystem              ← Save/load
    │   ├── State snapshot (variables + scene + progress)
    │   └── Multiple save slots
    │
    ├── HotspotManager          ← Clickable regions
    │   ├── Region definition (rect/polygon)
    │   ├── Hover highlight
    │   └── Click → trigger event chain
    │
    ├── AdaptiveMusic           ← Dynamic soundtrack
    │   └── Tension/emotion → BGM transition
    │
    ├── Uses runtime-puppet     ← 2D character rendering
    ├── Uses runtime-scene      ← 3D objects/backgrounds
    └── Uses engine-kernel      ← wgpu compositing + streaming
```

### Interaction Modes

```rust
pub enum InteractionMode {
    Director,   // Creator mode: drag, select, edit properties
    Playback,   // Auto playback, no interaction
    Novel,      // Visual novel: click to advance, branch choices
    Cinema,     // Interactive cinema: video + choices + QTE
}
```

### Interactive Script Format (.nkstory extension)

```yaml
scene: cafe_meeting
background: assets/bg/cafe.png
bgm: assets/music/afternoon.mp3

script:
  - show: { character: alice, position: right, expression: smile }
  - say: { character: alice, text: "You came." }
  - choice:
      prompt: "What do you say?"
      options:
        - text: "I almost didn't."
          then:
            - set: { trust: -1 }
            - say: { character: alice, expression: hurt, text: "..." }
        - text: "Wouldn't miss it."
          then:
            - set: { trust: +2 }
            - say: { character: alice, expression: happy, text: "I'm glad." }
  - qte: { key: "space", timeout: 3000, on_success: catch_cup, on_fail: spill }
  - dynamic_dialogue:
      character: alice
      persona: "Gentle cafe owner with a secret, fond of the player but guarded"
      context_vars: [trust, drink]
      max_turns: 5
      exit_condition: "trust >= 5 OR player ends conversation"
      on_exit: jump_to_next_scene

hotspots:
  - id: newspaper
    region: { x: 100, y: 200, w: 80, h: 60 }
    on_click:
      - say: { character: narrator, text: "Today's headline..." }
      - set: { read_newspaper: true }
```

### AI Differentiation

```
Traditional interactive cinema: All content pre-produced → limited branches → diminishing replay value
AI interactive cinema:          Skeleton pre-authored + AI fills → every playthrough unique

1. Dynamic dialogue    — Characters never repeat the same lines
2. Dynamic scene desc  — AI adjusts environment narration based on emotional state
3. Dynamic CG          — Key scenes generate different compositions based on choices
4. Adaptive music      — AI selects BGM based on tension/emotion curve
5. Adaptive QTE        — Difficulty adjusts based on player performance
6. Emotion-driven AV   — Single EmotionArc drives lighting/color/camera/music simultaneously
7. AI character perf.  — EmotionToMotion maps LLM emotion to precise facial/body animation
8. AI cinematography   — CameraDirector translates narrative beats to camera language
```

### Hybrid Strategy: AI Video Generation + Structured Pipeline

```
AI end-to-end video models (Sora/Seedance 2/Kling) generate background/atmosphere.
Structured 2D/3D pipeline handles character performance, interaction, and editing.

Why hybrid beats either alone:
  Pure AI video: no interaction, no precise control, no multi-shot coherence
  Pure structured: slow asset creation, no atmospheric video generation
  Hybrid: AI-generated environments + precise character control + full interactivity

In Stage 3 timeline:
  Background layers  → AI video generation (atmosphere, environments, transitions)
  Character layers   → 2D/3D structured (SemanticMotion + RetargetMap, frame-precise)
  Interaction        → runtime-stage (branching, dialogue, QTE — impossible with AI video)
  Camera/lighting    → CameraDirector + EmotionArc (driven by narrative, not random)

See Cross-Stage Architecture > AI Creative Pipeline for module details.
```

### Export Targets

```
Creation phase (VSCode):              Publishing phase (standalone):
  neko-suite editing                    Packaged runtime
  ├── Edit .nkstory                     ├── Parse .nkstory
  ├── Manage assets                     ├── Render engine (wgpu WASM)
  ├── Preview (runtime-stage)           ├── Audio playback
  └── Package export ──────────────>    ├── Interaction system
                                        └── Targets:
                                            ├── Web (WASM + Canvas)
                                            ├── Desktop (Tauri)
                                            ├── Mobile (WebView wrapper)
                                            └── Streaming (server-side render)
```

### Web Rendering Technology Selection

```
Decision: Do NOT build custom web rendering engine. Assemble from mature libraries.

3D characters (VRM):  Three.js WebGPURenderer + @pixiv/three-vrm
                      (already validated in neko-model and neko-live)
2D characters (MOC3): PixiJS + pixi-live2d-display
                      (or port existing PuppetCanvas Canvas2D renderer)
Scene compositing:    Three.js scene graph + AnimationMixer
Video segments:       HTML5 <video> + Media Source Extensions (MSE)
UI/interaction:       HTML + CSS (dialogue boxes, choices, QTE prompts)

Rationale:
  - Three.js WebGPU renderer is production-ready (r160+)
  - @pixiv/three-vrm already used in codebase, zero integration risk
  - neko WGSL shaders share same language as WebGPU (portability path)
  - Building custom web 3D engine would duplicate Three.js with worse quality
  - AI interactive cinema rendering ceiling ≈ visual novel, not AAA game
```

### Reference Products & Positioning

```
What we match:
  《Her Story》level      — Video search + branching narrative
  《Bandersnatch》level   — Video stream + real-time branching
  《Detroit: Become Human》level (2D) — Multi-ending + butterfly effect

What we exceed (via AI):
  — Dynamic LLM dialogue (no existing tool has this)
  — AI-generated assets (100x lower production cost)
  — Declarative scripting (no programmer required)

What we don't attempt:
  — 3A real-time 3D rendering quality
  — Open world exploration
  — Complex action/combat mechanics
```

### Boundaries

```
Do:   Visual novel + interactive film + branching narrative
Do:   AI dynamic dialogue + procedural content
Do:   Standalone export (Web/Desktop/Mobile)
Don't: Real-time 3D action gameplay (→ Stage 4)
Don't: Physics-based interaction (→ Stage 4)
Don't: Multiplayer (→ Stage 4)
```

---

## Stage 4: Game Engine + Game IDE

**Status**: Long-term vision — requires Stage 1-3 maturity

**Definition**: Evolve from interactive narrative tool into a general-purpose game creation platform, while maintaining the AI-native and low-code philosophy.

### Delta from Stage 3

| New Capability | Technical Requirement | Complexity |
|---------------|----------------------|------------|
| Physics engine | Rigid body, collision detection, raycasting | High |
| Real-time input | Keyboard/mouse/gamepad continuous input loop | Medium |
| Entity Component System (game) | Extend bevy_ecs for gameplay entities | Medium |
| Scripting system | Visual scripting or lightweight DSL | High |
| Particle system | GPU particle emitter + forces + collisions | Medium |
| Pathfinding / NavMesh | A* / navigation mesh generation | Medium |
| AI behavior trees | NPC decision making | Medium |
| Tilemap / level editor | 2D/3D level design tools | Medium |
| Multiplayer networking | Client-server / P2P state sync | Very High |
| Audio engine (full) | 3D spatial + mixer + effects chain | Medium |

### Architecture Extension

```
runtime-game (New)
    ├── PhysicsWorld          ← Rapier integration (Rust native)
    │   ├── Rigid body dynamics
    │   ├── Collision detection + response
    │   ├── Raycasting / shape casting
    │   └── Trigger volumes
    │
    ├── InputSystem           ← Continuous input (not event-only)
    │   ├── Input mapping (action → keys)
    │   ├── Axis smoothing
    │   └── Gamepad support (gilrs already in runtime-device)
    │
    ├── GameplayECS           ← Game logic components
    │   ├── Health, inventory, stats
    │   ├── AI components (behavior tree nodes)
    │   └── Custom component registration
    │
    ├── ScriptVM              ← Visual scripting or DSL
    │   ├── Node graph (event → logic → action)
    │   ├── Variable binding to ECS components
    │   └── Hot-reload
    │
    ├── ParticleSystem        ← GPU particles
    │   ├── Emitter shapes
    │   ├── Forces (gravity, wind, turbulence)
    │   └── Collision with physics world
    │
    ├── NavigationSystem      ← NPC movement
    │   ├── NavMesh generation
    │   ├── A* pathfinding
    │   └── Crowd simulation (basic)
    │
    └── NetworkSystem         ← Multiplayer
        ├── Client-server authority model
        ├── State replication
        ├── Input prediction + rollback
        └── Lobby / matchmaking

neko-game (New VSCode extension)
    ├── Level editor (tilemap / 3D placement)
    ├── Visual script editor
    ├── Physics debug visualization
    ├── Game preview (play-in-editor)
    └── Build pipeline (multi-platform)
```

### AI Integration Points

- AI level generation from text descriptions
- AI NPC dialogue (extending DynamicDialogue from Stage 3)
- AI behavior tuning (difficulty balancing, playtesting)
- Procedural content generation (terrain, dungeons, items)
- AI-assisted visual scripting ("make the enemy patrol between these points")

### Key Decisions

```
Build vs Integrate:
  Physics  → Integrate Rapier (Rust, proven, bevy-compatible)
  Scripting → Build lightweight DSL or visual scripting (not Lua/JS — keep declarative)
  Networking → Build minimal (client-server), not MMO-scale
  Rendering → Extend existing wgpu pipeline (not build from scratch)

What kind of games:
  ✅ 2D platformer / top-down / side-scroller
  ✅ Visual novel + gameplay hybrid
  ✅ Puzzle / adventure
  ✅ Simple 3D (third-person, fixed camera)
  ⚠️ FPS / open world (possible but not optimized for)
  ❌ MMO / large-scale multiplayer
  ❌ AAA graphics fidelity
```

### Boundaries

```
Do:   2D and simple 3D game creation
Do:   AI-assisted game design and testing
Do:   Visual/declarative scripting (low-code)
Do:   Multi-platform export (Web/Desktop/Mobile)
Don't: Compete with Unity/Unreal on rendering fidelity
Don't: MMO infrastructure
Don't: Console certification pipeline
```

---

## Stage 5: Simulation Engine + World Model Training Platform

**Status**: Vision — research-grade, requires Stage 4 maturity

**Definition**: Evolve from game engine into a simulation platform capable of generating training data for world models, and running AI agents in simulated environments.

### Delta from Stage 4

| New Capability | Technical Requirement | Complexity |
|---------------|----------------------|------------|
| Deterministic simulation | Fixed-step physics, reproducible runs | High |
| Headless rendering | Server-side GPU rendering (no display) | Medium |
| Sensor simulation | Camera/LiDAR/depth/IMU synthetic data | High |
| Domain randomization | Procedural variation of textures/lighting/layout | Medium |
| Reinforcement learning API | Gym-compatible step/reset/observe interface | Medium |
| Large-scale parallelism | Thousands of env instances on GPU cluster | Very High |
| Data pipeline | Structured output (images + labels + trajectories) | Medium |
| World model training loop | Env → data → train → deploy → env feedback | Very High |

### Architecture Extension

```
runtime-sim (New)
    ├── DeterministicWorld     ← Reproducible simulation
    │   ├── Fixed timestep (no frame-rate dependency)
    │   ├── Deterministic RNG seeding
    │   └── State serialization / deserialization
    │
    ├── SensorSuite            ← Synthetic sensor data
    │   ├── RGB camera (existing wgpu pipeline)
    │   ├── Depth camera (Z-buffer extraction)
    │   ├── Semantic segmentation (material ID render pass)
    │   ├── LiDAR point cloud (raycasting)
    │   ├── IMU (acceleration / angular velocity from physics)
    │   └── Custom sensor plugin API
    │
    ├── DomainRandomizer       ← Training data diversity
    │   ├── Texture randomization
    │   ├── Lighting variation
    │   ├── Object placement / scale / rotation
    │   ├── Weather / fog / noise
    │   └── Procedural scene generation
    │
    ├── AgentInterface         ← RL / AI agent API
    │   ├── Gym-compatible (step, reset, observe, reward)
    │   ├── Multi-agent support
    │   ├── Action space definition
    │   └── Reward shaping tools
    │
    ├── ParallelEnv            ← Scalable simulation
    │   ├── Multi-instance on single GPU (batched rendering)
    │   ├── Distributed across GPU cluster
    │   └── Async data collection
    │
    └── DataPipeline           ← Training data output
        ├── Image + annotation pairs
        ├── Trajectory recording (state, action, reward)
        ├── Video generation (for video world models)
        └── Export formats (COCO, KITTI, custom)

platform-train (New — could be separate product)
    ├── Experiment management (runs, configs, metrics)
    ├── Model zoo (pretrained world models)
    ├── Evaluation suite (FID, FVD, prediction accuracy)
    ├── Sim-to-real transfer tools
    └── Dashboard (training curves, video predictions)
```

### AI Integration (This IS the AI)

```
The simulation platform serves AI, not the other way around:

Loop 1: Synthetic Data Generation
  Simulation → Sensor data + labels → Train perception model → Deploy

Loop 2: Reinforcement Learning
  Agent → Action → Simulation step → Observation + Reward → Agent learns

Loop 3: World Model Training
  Simulation → Video sequences → Train world model (predict next frame)
  → World model generates synthetic training data → reduce sim dependency

Loop 4: Sim-to-Real Transfer
  Train in sim → Domain randomization bridges reality gap → Deploy to real world
```

### Application Domains

```
Autonomous driving:  Traffic simulation + sensor data + RL agents
Robotics:           Manipulation tasks + domain randomization
Embodied AI:        Navigation + interaction in 3D environments
Video prediction:   World model training from simulated video
Game AI:            NPC training via self-play in game environments (Stage 4 reuse)
Creative AI:        Train models that understand visual storytelling (Stage 1-3 reuse)
```

### Boundaries

```
Do:   Deterministic simulation for ML training
Do:   Synthetic data generation (images, video, trajectories)
Do:   RL environment API (Gym-compatible)
Do:   World model training data pipeline
Don't: Production self-driving stack
Don't: Real-time cloud gaming infrastructure
Don't: General-purpose scientific simulation (CFD, FEA)
```

---

## Stage 6: Creative AIOS

**Status**: Endgame vision — requires Stage 1-4 maturity

**Definition**: An AI Operating System for creative worlds — AI doesn't assist creation, AI IS the creation medium. The system understands narrative, aesthetics, emotion, and intent at a fundamental level, orchestrating all creative tools as a unified intelligence.

### The Paradigm Shift

```
Stage 1-5: Human creates, AI assists (tools)
Stage 6-7: Human intends, AI creates (operating system)

Traditional OS:  Kernel manages hardware → Apps run on top → User operates apps
Creative AIOS:   World Kernel manages creative state → AI agents run on top → User expresses intent
```

### What is a Creative AIOS?

```
NOT: A collection of AI-powered tools (that's Stage 1-3)
NOT: An AI assistant inside an IDE (that's neko-agent today)

IS:  A unified intelligence layer that:
  - Maintains a persistent world model of the creative project
  - Understands narrative structure, visual language, musical theory, dramatic tension
  - Coordinates multiple specialized AI agents as "processes"
  - Translates high-level intent into multi-modal creative output
  - Learns from the creator's aesthetic preferences and style
  - Ensures consistency across all outputs (character, tone, style, continuity)
```

### Architecture: Creative World Kernel

```
┌─────────────────────────────────────────────────────────────┐
│                    User Intent Layer                         │
│                                                              │
│  Natural language / sketch / reference / gesture / emotion   │
│  "Make this scene feel more melancholic"                     │
│  "This character would never say that"                       │
│  "Something like Blade Runner meets Studio Ghibli"           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               Creative World Kernel                          │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐      │
│  │ Intent      │ │ World State │ │ Aesthetic         │      │
│  │ Interpreter │ │ Manager     │ │ Memory            │      │
│  │             │ │             │ │                    │      │
│  │ NL/sketch → │ │ Characters  │ │ Style DNA         │      │
│  │ structured  │ │ Locations   │ │ Tone preferences  │      │
│  │ creative    │ │ Timeline    │ │ Color palettes    │      │
│  │ operations  │ │ Continuity  │ │ Musical taste     │      │
│  │             │ │ Canon       │ │ Pacing instinct   │      │
│  └──────┬──────┘ └──────┬──────┘ └────────┬─────────┘      │
│         │               │                  │                 │
│         ▼               ▼                  ▼                 │
│  ┌──────────────────────────────────────────────────┐       │
│  │            Creative Scheduler                     │       │
│  │                                                   │       │
│  │  Decomposes intent into tasks, assigns to agents, │       │
│  │  enforces consistency constraints, resolves        │       │
│  │  conflicts, maintains coherent creative vision     │       │
│  └──────────────────────┬───────────────────────────┘       │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Visual Agent │ │ Narrative    │ │ Audio Agent  │  ...N agents
│              │ │ Agent        │ │              │
│ Image/video  │ │ Script/      │ │ Music/SFX/  │
│ generation + │ │ dialogue/    │ │ voice/       │
│ composition  │ │ structure    │ │ spatial      │
│ + style      │ │ + pacing     │ │ audio        │
│ transfer     │ │ + continuity │ │ + emotion    │
└──────────────┘ └──────────────┘ └──────────────┘
        │               │               │
        ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│              Creative Runtime (Stage 1-4 engines)            │
│                                                              │
│  engine-kernel / runtime-puppet / runtime-scene /            │
│  runtime-stage / runtime-game                                │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### Intent Interpreter

```
Translates human creative intent into structured operations.
Not just NL→command, but understanding WHY the creator wants something.

Input modalities:
  - Natural language: "Make the villain more sympathetic in Act 2"
  - Visual reference: uploads a painting → extracts mood/palette/composition
  - Sketch: rough drawing → understands spatial intent + artistic direction
  - Gesture/demo: acts out a motion → captures timing and emotion
  - Feedback: "No, more like..." → iterative refinement

Output: CreativeOperation[]
  - Not low-level tool calls
  - High-level semantic operations:
    { op: "shift_character_arc", target: "villain", direction: "sympathetic",
      scope: "act_2", constraints: ["maintain_threat", "no_redemption_yet"] }
```

#### World State Manager

```
Persistent, queryable model of the entire creative project.
The single source of truth for all AI agents.

Domains:
  Characters:
    - Personality model (Big Five + custom traits)
    - Relationship graph (directed, weighted, evolving)
    - Visual appearance (canonical reference + style variants)
    - Voice profile (pitch, cadence, speech patterns)
    - Arc trajectory (where they are in their journey)

  Locations:
    - Spatial layout (2D/3D map)
    - Atmospheric properties (lighting, weather, mood)
    - Narrative function (safe haven, danger zone, transformation site)
    - Visual style (reference images, color palette)

  Timeline:
    - Scene sequence with causal links
    - Dramatic tension curve
    - Pacing metrics (beat frequency, scene duration)
    - Continuity tracking (what each character knows, where objects are)

  Canon:
    - Established facts (immutable unless explicitly retconned)
    - Rules of the world (magic systems, technology level, social norms)
    - Tone document (genre conventions, audience expectations)

Consistency Engine:
    - Every AI output is validated against World State
    - Contradiction detection: "Character A can't be in Location B, they left in Scene 5"
    - Style drift detection: "This shot's color grade deviates from established palette"
    - Temporal consistency: "This dialogue references an event that hasn't happened yet"
```

#### Aesthetic Memory

```
Learns and maintains the creator's artistic preferences.
Not just "settings" — a deep model of taste.

Components:
  Style DNA:
    - Visual: color temperature, contrast ratio, composition rules, reference artists
    - Narrative: pacing preference, dialogue density, show-vs-tell ratio
    - Audio: instrument preferences, tempo range, harmonic complexity
    - Emotional: preferred tension curve shape, catharsis patterns

  Accumulated from:
    - Explicit preferences ("I prefer warm color grading")
    - Implicit signals (which AI outputs the creator accepts vs rejects)
    - Reference materials (mood boards, inspiration folders)
    - Historical projects (style evolution over time)

  Applied as:
    - Soft constraints on all generation (not overrides, but defaults)
    - Style transfer vectors (new content matches established aesthetic)
    - Anomaly flagging ("this doesn't feel like your usual work — intentional?")
```

#### Creative Scheduler

```
The "process scheduler" of the Creative AIOS.
Coordinates multiple AI agents to produce coherent output.

Responsibilities:
  1. Task decomposition
     "Create Episode 3" →
       → Narrative Agent: outline scenes, write dialogue
       → Visual Agent: generate backgrounds, character poses
       → Audio Agent: compose scene music, generate voices
       → Stage Agent: choreograph interactive sequences

  2. Dependency resolution
     Background must exist before character compositing
     Dialogue must be written before voice synthesis
     Music must match scene's emotional arc

  3. Consistency enforcement
     Every agent output passes through World State validation
     Conflicts escalated to creator with suggested resolutions

  4. Resource management
     GPU allocation across rendering + generation + training
     API rate limiting for external model calls
     Caching of intermediate results

  5. Iterative refinement
     Creator feedback → identify affected outputs → re-generate only what changed
     Cascade analysis: "changing this line affects 3 downstream scenes"
```

### Multi-Agent Creative Ensemble

```
Visual Agent:
  ├── Scene composition (layout, depth, framing)
  ├── Character rendering (expression, pose, costume)
  ├── Style transfer (maintain visual consistency)
  ├── Continuity (lighting matches time-of-day, weather persists)
  └── VFX (particles, transitions, screen effects)

Narrative Agent:
  ├── Story structure (acts, beats, turning points)
  ├── Dialogue (character-voice consistency, subtext)
  ├── Pacing (scene length, beat frequency, tension)
  ├── Continuity (plot holes, character knowledge tracking)
  └── Branching (interactive narratives, consequence trees)

Audio Agent:
  ├── Music composition (theme, leitmotif, emotional arc)
  ├── Sound design (ambient, SFX, foley)
  ├── Voice direction (emotion, pacing, emphasis)
  ├── Spatial audio (source positioning, reverb environment)
  └── Adaptive soundtrack (responds to interaction/pacing)

Character Agent:
  ├── Personality simulation (consistent decision-making)
  ├── Relationship dynamics (trust, conflict, growth)
  ├── Dialogue generation (in-character, context-aware)
  ├── Behavioral animation (body language, micro-expressions)
  └── Arc management (character development over time)

Director Agent:
  ├── Camera language (shot selection, movement, transitions)
  ├── Dramatic timing (when to cut, hold, reveal)
  ├── Emotional orchestration (cross-domain mood alignment)
  ├── Audience modeling (pacing for engagement, surprise calibration)
  └── Quality gating (is this scene "good enough" or needs iteration?)
```

### Interaction Model

```
Creator workflow evolves across stages:

Stage 1: Creator manually operates each tool
  "Open neko-cut, add clip to track 2, trim to 3 seconds, add fade"

Stage 3: Creator uses declarative scripts
  "choice: { options: [A, B], on_a: jump_scene_5 }"

Stage 6: Creator expresses intent
  "I want the audience to feel uneasy here — like something is wrong
   but they can't quite tell what. The character should seem normal
   on the surface."

  → Creative AIOS response:
    - Narrative Agent: subtly contradictory dialogue, slight behavioral inconsistency
    - Visual Agent: slightly off color temperature, one shadow that doesn't match
    - Audio Agent: low-frequency drone barely below conscious threshold
    - Director Agent: camera lingers 0.5s too long on a background detail
    - Character Agent: micro-expression flicker (puppet/3D) — smile doesn't reach eyes
```

### What Makes This an "OS" Not Just "AI Tools"

```
1. Process isolation: Agents are independent processes with defined I/O contracts
2. Shared memory: World State is shared state — agents read/write through kernel
3. Scheduling: Creative Scheduler manages execution order and resource allocation
4. Permissions: Agents can only modify their domain; cross-domain requires kernel approval
5. Persistence: World State survives across sessions (not just conversation context)
6. Extensibility: New agents can be registered like drivers in a traditional OS
7. Multi-tenancy: Multiple projects run on the same kernel with isolated world states

Traditional OS                    Creative AIOS
─────────────                     ─────────────
Kernel                            Creative World Kernel
Processes                         AI Agents (Visual/Narrative/Audio/...)
Filesystem                        World State Manager
Memory management                 Context budget + aesthetic memory
Device drivers                    Tool adapters (engine/puppet/scene/...)
Shell                             Intent Interpreter
IPC                               Agent message protocol
Scheduler                         Creative Scheduler
User permissions                  Canon + style constraints
```

### Delta from Stage 5

| New Capability | What it does | Builds on |
|---------------|-------------|-----------|
| Creative World Kernel | Unified state + scheduling for all creative agents | neko-agent (single agent → multi-agent) |
| Intent Interpreter | Multi-modal intent → creative operations | neko-agent NL interface |
| World State Manager | Persistent, consistent project model | neko-story scene/character data |
| Aesthetic Memory | Learns creator's style and taste | neko-agent user preferences |
| Creative Scheduler | Multi-agent coordination + consistency | neko-agent tool orchestration |
| Consistency Engine | Cross-domain validation | New |
| Character Agent | Autonomous character simulation | DynamicDialogue (Stage 3) |
| Director Agent | Automated creative direction | Stage 3 camera/pacing |

### Boundaries

```
Do:   Multi-agent creative orchestration with unified world state
Do:   Intent-driven creation (NL/sketch/reference → output)
Do:   Persistent aesthetic memory and style consistency
Do:   Autonomous creative agents coordinated by kernel
Don't: General AGI — agents are creative-domain specialists
Don't: Replace the creator — system proposes, human disposes
Don't: Real-world perception or actuation (→ Stage 7)
```

---

## Stage 7: Reality AIOS

**Status**: Ultimate vision — requires Stage 5-6 maturity + hardware ecosystem

**Definition**: Extend the Creative AIOS to perceive, understand, and operate in the physical world. The same kernel that manages creative worlds now manages understanding of and interaction with reality.

### The Leap

```
Stage 6: AI understands and generates fictional worlds
Stage 7: AI understands and interacts with the real world

The insight: A system that can maintain consistent world state for fiction
can maintain consistent world state for reality — with grounding.
```

### What is a Reality AIOS?

```
Creative AIOS                         Reality AIOS
─────────────                         ────────────
World State (fictional)               World Model (physical)
Characters (simulated)                Entities (real objects/people/spaces)
Narrative structure                   Causal structure of reality
Aesthetic constraints                 Physical constraints (laws of physics)
Generate creative content             Perceive + plan + act in real world
Intent: "make this scene sad"         Intent: "organize this workspace"
```

### Architecture: Reality World Kernel

```
┌─────────────────────────────────────────────────────────────┐
│                    User Intent Layer                         │
│                                                              │
│  "Set up a meeting room for 6 people with presentation"     │
│  "Monitor the production line, alert on anomalies"          │
│  "Guide me through repairing this appliance"                │
│  "Create a digital twin of this building"                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Reality World Kernel                         │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐      │
│  │ Perception  │ │ World Model │ │ Knowledge         │      │
│  │ Engine      │ │ (Physical)  │ │ Graph             │      │
│  │             │ │             │ │                    │      │
│  │ Camera/     │ │ 3D scene    │ │ Object ontology   │      │
│  │ LiDAR/     │ │ graph +     │ │ Physics rules     │      │
│  │ audio/     │ │ physics +   │ │ Domain expertise   │      │
│  │ sensor →   │ │ semantics + │ │ Procedural memory │      │
│  │ structured │ │ temporal    │ │ (how to do things) │      │
│  │ scene      │ │ history     │ │                    │      │
│  └──────┬──────┘ └──────┬──────┘ └────────┬─────────┘      │
│         │               │                  │                 │
│         ▼               ▼                  ▼                 │
│  ┌──────────────────────────────────────────────────┐       │
│  │            Reality Scheduler                      │       │
│  │                                                   │       │
│  │  Plans actions, predicts consequences,            │       │
│  │  monitors execution, handles failures,            │       │
│  │  coordinates virtual + physical agents            │       │
│  └──────────────────────┬───────────────────────────┘       │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌───────────┐   ┌──────────────┐   ┌──────────────┐
│ Perception│   │ Planning     │   │ Actuation    │
│ Agents    │   │ Agents       │   │ Agents       │
│           │   │              │   │              │
│ Vision    │   │ Task decomp  │   │ Robot control│
│ Audio     │   │ Path planning│   │ IoT commands │
│ Spatial   │   │ Scheduling   │   │ AR overlay   │
│ Anomaly   │   │ Prediction   │   │ Voice output │
│ detection │   │ Optimization │   │ Display      │
└───────────┘   └──────────────┘   └──────────────┘
      │                 │                   │
      ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Physical Interface Layer                   │
│                                                              │
│  Cameras / LiDAR / Microphones / IMU / GPS / IoT sensors    │
│  Robot arms / Drones / Smart home / Displays / Speakers     │
│  AR glasses / Haptic devices / Industrial controllers       │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### Perception Engine

```
Transforms raw sensor data into structured world understanding.

Sensor fusion:
  ├── Multi-camera → 3D reconstruction (NeRF / Gaussian Splatting)
  ├── RGB + Depth → semantic scene graph
  ├── Audio → source localization + event detection
  ├── IMU + GPS → ego-motion estimation
  ├── LiDAR → point cloud → mesh
  └── Temporal: track objects across frames, detect state changes

Output: Structured scene representation
  - Object instances (class, pose, state, properties)
  - Spatial relationships ("cup is ON table, table is IN kitchen")
  - Activity recognition ("person is TYPING at DESK")
  - Anomaly detection ("machine vibration 2σ above normal")

Reuses Stage 5:
  - runtime-sim sensor models (now running in reverse: real→model instead of model→render)
  - runtime-ml ONNX inference (detection, segmentation, pose estimation)
```

#### World Model (Physical)

```
Persistent, causal model of physical reality.
Mirrors Creative AIOS World State, but grounded in physics.

Layers:
  Geometric: 3D mesh / point cloud / occupancy grid
  Semantic:  Object graph with properties and relationships
  Physical:  Material properties, mass, friction, constraints
  Temporal:  State history, change detection, trend prediction
  Causal:    "If I push this, that will fall" — physics-based reasoning

Digital Twin capability:
  - Real space → scan → persistent 3D model
  - Real-time updates from sensor feeds
  - Simulate "what if" scenarios before acting
  - Overlay AR information on physical objects

Reuses:
  - runtime-scene ECS (entities = real objects)
  - runtime-sim physics (predict consequences)
  - Stage 6 World State Manager (persistence, querying, consistency)
```

#### Knowledge Graph

```
What the system "knows" about the world beyond perception.

Object ontology:
  - "A chair is for sitting, has legs, can be moved by one person"
  - "A server rack contains compute nodes, needs cooling, caution: high voltage"

Domain expertise (pluggable):
  - Manufacturing: process flows, quality standards, maintenance procedures
  - Architecture: building codes, spatial design principles, material properties
  - Medicine: anatomy, procedures, safety protocols (advisory only, never autonomous)
  - Agriculture: crop cycles, soil conditions, weather patterns

Procedural memory:
  - "How to set up a video shoot": equipment list → placement → lighting → camera angles
  - "How to troubleshoot X": diagnostic tree → test sequence → resolution
  - Learned from demonstrations, manuals, and accumulated experience

Reuses:
  - Stage 6 Aesthetic Memory architecture (learning from user behavior)
  - neko-agent tool/skill system (procedural knowledge as skills)
```

### Application Domains

```
Creative Production (bridging Stage 6 → 7):
  ├── On-set assistance: camera placement, lighting suggestions based on scene mood
  ├── Real-time AR storyboarding: overlay virtual characters on physical locations
  ├── Automatic continuity: "The cup was in their left hand in the last take"
  ├── Live puppet tracking: real performer → drives virtual character
  └── Digital twin of studio: virtual production planning

Smart Spaces:
  ├── Meeting room: auto-configure AV, adjust lighting, take notes, follow-up actions
  ├── Workshop: tool tracking, safety monitoring, process guidance
  ├── Retail: customer flow analysis, display optimization, inventory awareness
  └── Home: context-aware automation ("dim lights" means different things by context)

Industrial:
  ├── Manufacturing: quality inspection, anomaly detection, predictive maintenance
  ├── Logistics: spatial optimization, package handling, fleet coordination
  ├── Construction: progress monitoring, safety compliance, digital twin as-built
  └── Agriculture: crop monitoring, resource optimization, harvest planning

Embodied AI:
  ├── Robot task planning: "organize this shelf" → perception → plan → execute
  ├── Drone operation: inspection, mapping, delivery with world understanding
  ├── AR guidance: step-by-step instructions overlaid on physical tasks
  └── Human-robot collaboration: shared world model, intent prediction
```

### Creative → Reality Bridge

```
The key insight: the same abstractions work in both domains.

Creative AIOS concept        Reality AIOS equivalent
───────────────────          ──────────────────────
Character personality        Object/entity properties
Character relationships      Spatial/causal relationships
Narrative continuity         Physical state continuity
Aesthetic constraints        Physical constraints (gravity, collision)
Scene composition            Spatial layout planning
Dramatic tension curve       Risk/urgency assessment
Audience engagement model    User attention/intent model
Multi-agent creative ensemble  Multi-agent perception/planning/actuation

Code-level reuse:
  World State Manager → World Model Manager (same persistence/query/consistency)
  Creative Scheduler → Reality Scheduler (same DAG execution, different constraints)
  Intent Interpreter → Intent Interpreter (same NL→operations, different domains)
  Agent protocol → Agent protocol (same IPC, different agent types)
  Aesthetic Memory → Procedural Memory (same learning mechanism, different domain)
```

### Hardware Interface Layer

```
Stage 7 requires interfacing with physical devices.
runtime-device (existing) already handles camera/mic/MIDI/gamepad.

Extension:
  runtime-device
    ├── Camera (nokhwa)         ← existing
    ├── Microphone (cpal)       ← existing
    ├── MIDI (midir)            ← existing
    ├── Gamepad (gilrs)         ← existing
    │
    │ New for Stage 7:
    ├── LiDAR / depth sensor    ← Intel RealSense / Apple LiDAR
    ├── IMU / motion sensor     ← Accelerometer, gyroscope
    ├── GPS / localization      ← For outdoor/mobile applications
    ├── IoT bridge              ← MQTT / Matter / Zigbee
    ├── Robot interface         ← ROS 2 bridge
    ├── AR display              ← OpenXR output (reuse Stage 2)
    └── Industrial I/O          ← OPC-UA / Modbus (pluggable)
```

### Delta from Stage 6

| New Capability | What it does | Builds on |
|---------------|-------------|-----------|
| Perception Engine | Sensor data → structured scene understanding | runtime-ml + runtime-sim |
| Physical World Model | Persistent 3D model of real environment | Stage 6 World State Manager |
| Knowledge Graph | Domain expertise + procedural memory | Stage 6 Aesthetic Memory |
| Reality Scheduler | Plan + predict + execute in physical world | Stage 6 Creative Scheduler |
| Actuation Interface | Control physical devices and robots | runtime-device |
| Digital Twin | Real↔virtual bidirectional sync | runtime-scene + runtime-sim |
| AR Overlay | Virtual information on physical world | Stage 2 runtime-xr |

### Safety and Ethics

```
CRITICAL: Reality AIOS operates in the physical world. Safety is non-negotiable.

Principles:
  1. Human-in-the-loop: No irreversible physical action without human confirmation
  2. Fail-safe: All actuation has hardware emergency stops independent of software
  3. Bounded autonomy: System proposes, human approves (same as Creative AIOS)
  4. Transparency: Every action has an explainable reason chain
  5. Privacy: Perception data processed locally by default, opt-in cloud

Boundaries:
  ❌ Autonomous weapons or surveillance
  ❌ Medical diagnosis/treatment without licensed human oversight
  ❌ Autonomous driving (safety-critical, requires dedicated stack)
  ❌ Any action that could harm humans without explicit safeguards

  ✅ Advisory/assistive roles (AR guidance, monitoring, suggestions)
  ✅ Controlled environments (studio, factory floor, smart home)
  ✅ Digital twin analysis and simulation
  ✅ Human-supervised robot operation
```

### Boundaries

```
Do:   Physical world perception and understanding
Do:   Digital twin creation and maintenance
Do:   AR-mediated human guidance and assistance
Do:   Supervised robot task planning
Do:   Domain-specific monitoring and anomaly detection
Don't: Safety-critical autonomous systems (autonomous driving, medical)
Don't: Surveillance or tracking of individuals
Don't: Unsupervised actuation in uncontrolled environments
Don't: Replace human judgment in high-stakes decisions
```

---

## Stage 6-7 Relationship: Two Sides of One Coin

```
            ┌──────────────────────────────────┐
            │         Shared AIOS Kernel        │
            │                                   │
            │  Intent Interpreter               │
            │  World State/Model Manager        │
            │  Multi-Agent Scheduler            │
            │  Memory System (Aesthetic/Proc.)  │
            │  Consistency Engine               │
            │  Agent Protocol                   │
            └────────────┬──────────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
   ┌─────────────────┐     ┌──────────────────┐
   │  Creative AIOS   │     │  Reality AIOS     │
   │  (Stage 6)       │     │  (Stage 7)        │
   │                  │     │                   │
   │  Fiction worlds  │◄───►│  Physical world   │
   │  Generate content│     │  Perceive reality │
   │  Narrative logic │     │  Causal logic     │
   │  Aesthetic rules │     │  Physical rules   │
   │  Creative agents │     │  Perception +     │
   │                  │     │  Actuation agents │
   └─────────────────┘     └──────────────────┘

The bridge: Virtual Production
  Creative AIOS designs a scene →
  Reality AIOS helps realize it physically (set, lighting, camera) →
  Creative AIOS processes captured footage →
  Reality AIOS monitors continuity on set →
  ...feedback loop between fictional and physical worlds
```

---

## Cross-Stage Architecture

### Shared Foundation (All Stages)

```
engine-kernel:   wgpu rendering + FFmpeg codec (Stage 1-7)
engine-types:    Shared Rust DTOs (Stage 1-7)
bevy_ecs:        Entity Component System (Stage 1-7, expanding scope)
neko-agent:      AI orchestration → Multi-agent ensemble (Stage 1-7)
neko-types:      Shared TS infrastructure (Stage 1-7)
neko-client:     Engine communication (Stage 1-7)
```

### Asset Portability Layer (Cross-Stage Foundation)

```
Problem: Creative increments (animations, expressions, parameter presets) are locked
in nk* project files. Standard format assets (glTF/VRM/MOC3) flow freely, but user
edits cannot leave the neko ecosystem without explicit export.

Solution: Standard format write-back + open manifest + reusable motion assets.

Components:
  1. Standard Format Write-Back (Stage 1, feeds all later stages)
     ├── .nkm customClips → glTF animation channels in .glb
     ├── .nkm faceParams → VRM VRMC_vrm extensions JSON
     ├── .nkp animations → .motion3.json (Live2D standard)
     └── .nkp expressions → .exp3.json (Live2D standard)

  2. Reusable Motion Assets (Stage 1-4)
     ├── 3D: Store VRM Humanoid bone names (not node IDs) → cross-model retargeting
     ├── 2D: Store Live2D standard parameter names → cross-MOC3 model reuse
     └── Publishable to neko-market as standalone assets

  3. Open Asset Manifest (Stage 1+, enables external consumption)
     ├── .neko-asset.json: base model + animations + expressions + metadata
     ├── All referenced files are standard formats (glTF/VRM/motion3/exp3)
     └── External engines read JSON manifest + standard files, zero nk* knowledge

  4. Web Viewer Layer (Stage 3+, browser-side rendering)
     ├── 3D: Three.js + @pixiv/three-vrm (already in neko-model/neko-live)
     ├── 2D: PixiJS + pixi-live2d-display (or ported PuppetCanvas)
     └── Unified API: loadAsset(manifest) / play(clip) / setExpression(name)

Impact: Every asset created in Stage 1 flows into Stage 3 (interactive cinema),
Stage 4 (games), Stage 5 (simulation), and third-party engines — without re-export.
```

### SceneSpec + EffectSpec Unified Standards (Cross-Stage)

#### Problem: Scene and Effect Fragmentation

```
Current state: 5 different "scene" representations, effects bound to neko-cut only.

  Scene representations (fragmented):
    .nkv Scene3DElement     → src + camera + animation (flat fields)
    .nkm NkmProject         → 3D editor state
    .nkp NkpProject         → 2D editor state
    .nkstory scene block    → text description (no structured spatial data)
    .nkc CanvasNode         → storyboard layout (2D, not spatial)

  Effect representations (fragmented):
    neko-cut EffectInstance  → timeline element effect params
    engine-kernel shaders    → WGSL compute/fragment implementations
    BUILT_IN_EFFECTS const   → frontend effect registry
    ShaderMetadata           → marketplace effect package description

  Each Stage would need its own scene/effect system without unification.
```

#### SceneSpec (Unified Scene Description)

```
One format, consumed by all Stages:

  SceneSpec (.nkscene JSON) {
    id: string,
    name: string,

    environment: {
      background: string,          // .png | .mp4 | .glb (polymorphic)
      lighting: {
        temperature: number,       // Kelvin (3000-7000)
        brightness: number,        // 0-1
        direction: [x, y, z]       // main light direction
      },
      ambientAudio: string?,       // ambient sound file
      mood: string?                // semantic mood tag for AI
    },

    characters: [{
      id: string,
      model: string,               // .moc3 | .vrm | .glb
      position: { x, y, depth },   // normalized (0-1)
      scale: number,
      initialExpression: string?,
      initialMotion: string?,       // SemanticMotion or clip name
      parallaxFactor: number        // 2.5D depth layer speed
    }],

    props: [{
      id: string,
      model: string,               // .glb
      position: { x, y, z },
      interactive: boolean          // clickable in Stage 3+
    }],

    camera: {
      position: [x, y, z],
      target: [x, y, z],
      fov: number
    },

    effects: string[]               // references to EffectSpec IDs
  }

  Consumed by:
    neko-cut     → TimelineSceneLoader → composite as GpuLayer(s)
    Stage 3      → StageSceneLoader → bevy_ecs World (interactive)
    Stage 2 XR   → XrSceneLoader → bevy_ecs World + XrSession
    Stage 4      → GameSceneLoader → + physics colliders + gameplay
    Web export   → WebSceneLoader → Three.js Scene + PixiJS characters
    Batch API    → headless SceneLoader → export pipeline
    AI           → SceneAssembler output IS a SceneSpec

  Relationship to existing formats:
    Scene3DElement fields     → migrates into SceneSpec references
    .nkm                      → wraps SceneSpec + editor UI state
    .nkstory scene directive  → references SceneSpec by ID
    SceneAssembler            → outputs SceneSpec directly
    neko-canvas ShotNode      → references SceneSpec + camera override
```

#### EffectSpec (Unified Effect Description)

```
Declarative effect description, multiple rendering backends.

  EffectSpec (.nkeffect JSON) {
    id: string,
    name: string,

    layers: [{                     // effect stack (applied in order)
      effect: string,              // "color_grade" | "vignette" | "dof" | ...
      params: {
        [key]: {
          value: number | number[],
          animated: boolean?,      // can be keyframed on timeline
          min: number?,
          max: number?
        }
      }
    }],

    scope: string[],               // where this effect can be applied
    // ["video", "scene3d", "puppet", "interactive", "xr", "web"]

    emotionBinding: {              // EmotionArc auto-drive (optional)
      parameter: string,           // emotion name (e.g., "anxiety")
      mapping: {
        [effectParam]: {
          from: number,            // value at emotion = 0
          to: number               // value at emotion = 1
        }
      }
    }?
  }

  Example — "cinematic_anxiety" EffectSpec:
    layers:
      color_grade  → temperature: 5500→3800, saturation: 1.0→0.5
      vignette     → intensity: 0.2→0.6
      camera_shake → amplitude: 0→5.0, frequency: 8.0
      dof          → aperture: 8.0→2.0 (shallow focus)
    emotionBinding: parameter "anxiety" drives all above via interpolation.

  Backend implementations (same EffectSpec, different renderers):
    engine-kernel  → WGSL compute shader (Rust wgpu)
                     Used by: neko-cut export/preview, Stage 3, XR
    Three.js TSL   → TypeScript Shader Language nodes
                     Used by: Web export, WebXR
    CSS/Canvas 2D  → Fallback for low-perf devices

  Key principle: EffectSpec describes WHAT effect, not HOW to render.
  Each backend reads the same spec and implements with its own tech.
```

#### Cross-Environment Effect Constraints

```
Same EffectSpec, different performance budgets per target:

  Target           Render method           Budget     Constraint
  neko-cut export  offline GPU texture     30fps      no realtime constraint
  neko-cut preview H.264 streaming         30-60fps   low latency
  Stage 3 interact realtime wgpu           60fps      < 16ms/frame
  Stage 2 XR      realtime stereo wgpu     90fps      < 11ms/frame (×2 eyes)
  Web export       Three.js WebGPU         60fps      browser sandbox

  Effect LOD (automatic quality scaling):
    XR (tightest budget)  → skip expensive effects (camera_shake via reprojection)
    Interactive (medium)  → full effect chain
    Export (no budget)    → maximum quality passes
```

#### Integration with Existing Systems

```
SceneSpec consolidates existing fragments:
  Scene3DElement.src              → environment.background
  Scene3DElement.cameraOverride   → camera
  Scene3DElement.animationClip    → characters[].initialMotion
  Scene3DElement.backgroundColor  → environment.lighting
  .nkstory scene block            → references SceneSpec ID
  SceneAssembler output           → directly outputs SceneSpec
  neko-canvas ShotNode            → references SceneSpec + camera override

EffectSpec consolidates existing fragments:
  EffectInstance (neko-cut)        → EffectSpec.layers[]
  BUILT_IN_EFFECTS constant table → EffectSpec registry
  ShaderMetadata (marketplace)    → EffectSpec + marketplace metadata
  gpu effect chain                → EffectSpec wgpu backend
  EmotionArc parameter mapping    → EffectSpec.emotionBinding
```

### ExpressionSpec (Unified Expression Standard)

```
Two layers: atomic channels (per-muscle) + compound presets (per-emotion).

  Atomic channels (= SemanticMotion face channels):
    eye_blink_left/right, eye_look_x/y, eye_squint_left/right,
    brow_up_left/right, brow_down_left/right,
    mouth_open, mouth_smile, mouth_pucker, cheek_puff, jaw_open, nose_wrinkle

  Compound preset structure (.nkexpr JSON):
    {
      id, name,
      channels: { [channel]: { value, variance? } },
      blendMode: "override" | "additive" | "multiply",
      fadeIn, fadeOut,
      micro: { [channel]: { noise: "perlin", frequency, amplitude } }
    }

  Preset library (~30):
    Emotions (7): neutral, happy, sad, angry, surprised, disgusted, fearful
    Social (5):   thinking, confused, flirty, smug, shy
    Viseme (6):   sil, aa, ih, ou, ee, oh
    Function (7): blink, wink_L/R, look_L/R/U/D

  Cross-dimension mapping:
    ExpressionSpec → VrmExpressionMap → MorphTarget weights
    ExpressionSpec → PuppetExpressionMap → Live2D parameters (inverts where needed)
    ExpressionSpec → .exp3.json export (bidirectional)
    ARKit 52 → ExpressionSpec (realtime input, emotion recognition)

  EmotionArc integration:
    Continuous blending: tension 0.6 = lerp("worried", "anxious", 0.5)
    Per-channel interpolation → smooth transitions, no discrete jumps.

  Viseme overlay: TTS-driven lip shapes applied additively on top of emotion expression.
  Micro-expression noise: perlin noise on channels for natural movement.
```

### LightSpec (Unified Lighting, embedded in SceneSpec)

```
  SceneSpec.lighting: {
    ambient: {
      type: "solid" | "gradient" | "ibl",
      color / skyColor+groundColor / iblTexture,
      intensity: 0-2
    },
    lights: [{
      type: "directional" | "point" | "spot",
      color, intensity, direction/position/range,
      innerAngle/outerAngle (spot),
      castShadow, shadowResolution, shadowBias
    }],
    postProcess: {
      ao: { enabled, radius, intensity },
      bloom: { enabled, threshold, intensity },
      godRay: { enabled, position, intensity },
      fog: { enabled, color, near, far }
    },
    emotionBinding: { ... }    // EmotionArc drives lighting parameters
  }

  Progressive implementation:
    P0: Contact shadow (alpha quad under character) + directional light shading
    P1: Shadow Map (depth pass + PCF) + point/spot attenuation + 2D shadow receive
    P2: SSAO + Bloom + Fog
    P3: CSM + God Ray + Light Probe / Lightmap baking + SSR
```

### Format Compatibility Layer (Cross-Stage)

```
Strategy: Core types (SemanticMotion/ExpressionSpec/SceneSpec/EffectSpec/LightSpec)
never bind to external formats. FormatAdapter modules provide bidirectional conversion.

Architecture:
  External formats (import)
    .bvh .vmd .fbx .cube .hdr .exp3 .motion3 .glb .vrm .moc3 .usdz .ies .exr
        ↓ FormatAdapter (per format, independent module)
  Neko unified asset layer
    SemanticMotion / ExpressionSpec / SceneSpec / EffectSpec / LightSpec / Character
        ↓ FormatExporter (per format)
  External formats (export)
    .glb (with animation) / .motion3.json / .exp3.json / .bvh / .cube / .vmd / .usdz

Priority adapters:

  P0 — Unlock major ecosystems (most already have parser foundations):
    bvh_adapter     .bvh ↔ SemanticMotion         motion capture ecosystem
    cube_adapter    .cube ↔ EffectSpec (LUT)       color grading ecosystem
    hdr_adapter     .hdr/.exr → LightSpec (IBL)    PBR lighting ecosystem
    exp3_adapter    .exp3.json ↔ ExpressionSpec     Live2D ecosystem (parser exists)
    motion3_adapter .motion3.json ↔ SemanticMotion  Live2D ecosystem (parser exists)
    gltf_adapter    glTF anim ↔ SemanticMotion      3D ecosystem (exists)
    vrm_adapter     VRM expressions ↔ ExpressionSpec VRM ecosystem (exists)

  P1 — Asian character community:
    vmd_adapter     .vmd ↔ SemanticMotion + ExpressionSpec + CameraKeyframe
                    Unlocks MMD community (tens of thousands of free animations)

  P2 — Professional pipelines:
    fbx_adapter     .fbx → glb via Blender MCP bridge (avoid Autodesk SDK licensing)
    usd_adapter     .usdz ↔ SceneSpec (Apple/Pixar pipeline, wait for Rust USD maturity)
    ies_adapter     .ies → LightSpec (photometric light profiles)

  Private formats (via MCP bridge, not direct integration):
    .blend → Blender MCP → .glb
    .psd   → Photoshop MCP → .png layers
    .ffx   → no path (Adobe proprietary, undocumented)

Adapter implementation pattern (Rust):
  trait FormatAdapter<T> {
      fn import(data: &[u8]) → Result<T, AdapterError>;
      fn export(asset: &T) → Result<Vec<u8>, AdapterError>;
  }
  Each adapter is a feature-gated module, compiled only when needed.
```

### Image/Video → Structured Asset Extraction (Cross-Stage)

```
Any image or video can be decomposed into neko unified assets via ML models.
This is the "import from reality" pipeline — complementary to "export to standard formats."

Extraction matrix:

  Input          Output Asset         Model/Tool              Deploy     Priority
  ─────────────────────────────────────────────────────────────────────────────────
  Image  →  ExpressionSpec            MediaPipe FaceMesh      ONNX local   P0
  Image  →  SceneSpec (2.5D layers)   Depth Anything + SAM    ONNX local   P0
  Image  →  LightSpec (estimation)    Light direction model   ONNX local   P1
  Image  →  EffectSpec (color LUT)    Color palette analysis  Algorithm    P1
  Image  →  Character (.glb mesh)     TripoSR / Trellis      ONNX/API     P2
  Image  →  Normal map (for Level 2)  Normal estimation       ONNX local   P2
  Video  →  SemanticMotion            MediaPipe/DWPose        ONNX local   P0
  Video  →  ExpressionSpec[]          MediaPipe FaceMesh      ONNX local   P0
  Video  →  Subtitle track            Whisper                 ONNX/API     P0
  Video  →  Audio stems               Demucs                  ONNX local   P1
  Video  →  CameraKeyframe            DUSt3R                  ONNX/API     P1
  Video  →  SceneSpec[] (shot split)  PySceneDetect           Algorithm    P1
  Video  →  SceneSpec (3DGS)          3DGS pipeline           GPU local    P2
  Camera →  SemanticMotion (realtime) ARKit/VMC/MediaPipe     Realtime     P0 ✅ exists

Key extraction pipelines:

  1. Video → Motion + Expression (highest value, P0)
     Video frames
       ↓ per-frame pose estimation (MediaPipe Pose 33 joints + FaceMesh 478 landmarks)
     body_joints + face_landmarks (per frame)
       ↓ joint rotations → SemanticMotion channels
       ↓ landmark distances → ExpressionSpec channels (eye_blink, mouth_open, etc.)
     SemanticMotion + ExpressionSpec[] (frame-by-frame)
       ↓ smoothing + keyframe compression
     .nkmotion file
       ↓ RetargetMap
     Drives any 2D (Live2D) or 3D (VRM) character
     Use case: "Film yourself acting → apply to any character"

  2. Image → 2.5D Parallax Scene (high value, P0)
     Single image
       ↓ Depth Anything v2 (monocular depth estimation)
     Depth map (per-pixel depth)
       ↓ depth threshold slicing + SAM semantic segmentation
     Foreground / midground / background layers (with alpha)
       ↓ auto-assign parallaxFactor from depth
     SceneSpec {
       environment: { background: "bg_layer.png" },
       characters: [{ position.depth: 0.5, parallaxFactor: 1.0 }],
       // additional layers with parallaxFactor 0.3-1.3
     }
     → Camera Keyframe movement → 2.5D parallax video from a single photo

  3. Video → Camera Track (P1)
     Video
       ↓ DUSt3R / MASt3R (no calibration needed)
     Per-frame camera { position, rotation, fov }
       ↓ smoothing + keyframe compression
     Camera Keyframe Track
       ↓ semantic classification
     Shot labels: "dolly_in T=0-3s" → "pan_right T=3-6s"
     Use case: "Replicate this film's camera work in my scene"

  4. Video → Full Scene Decomposition (ultimate pipeline)
     Video
       ├→ SceneDetect → shot boundaries → SceneSpec[]
       ├→ per-shot: Depth+SAM → 2.5D layers
       ├→ per-shot: Pose+Face → SemanticMotion + ExpressionSpec
       ├→ per-shot: DUSt3R → CameraKeyframe
       ├→ Demucs → vocal / BGM / SFX stems
       └→ Whisper → subtitle track
     Result: One video → fully decomposed structured project
       → Re-light, re-angle, swap characters, add interactivity

Runtime deployment:
  runtime-ml (ONNX Runtime) handles all local inference.
  Models ≤100MB: bundled with engine (MediaPipe, Depth Anything small).
  Models >100MB: downloaded on first use → ~/.neko/models/ (market InstallTarget).
  Cloud fallback: API call when local GPU insufficient (TripoSR, DUSt3R).

Relationship to existing infrastructure:
  neko-live already does realtime: ARKit/VMC → mapping → character drive.
  This pipeline extends the same concept to offline video files.
  Same SemanticMotion + ExpressionSpec + RetargetMap, different input source.
```

### VoiceSpec + CharacterAgent + StoryBinding (Cross-Stage)

#### VoiceSpec (Voice Identity, embedded in CharacterBundle)

```
  VoiceSpec {
    id: string,
    ttsProvider: "azure" | "openai" | "elevenlabs" | "local",
    voiceId: string,                  // provider-specific voice/clone ID
    pitch: number,                    // pitch adjustment
    speed: number,                    // speech rate
    language: string,                 // "zh-CN" | "en-US" | ...
    visemeMode: "tts_native" | "whisper_align" | "amplitude",
    // tts_native: Azure viseme events (best)
    // whisper_align: post-process word alignment → phoneme → viseme
    // amplitude: realtime volume → mouth_open (simplest, lowest latency)
  }

  Viseme output → ExpressionSpec viseme channels (additive blend on emotion):
    viseme_aa → mouth_open: 0.8
    viseme_ou → mouth_pucker: 0.6
    viseme_ee → mouth_smile: 0.4
    Layered: base emotion + viseme overlay + micro noise = final expression.
```

#### CharacterAgent (AI Persona bound to Character)

```
  CharacterAgent = neko-agent SubAgent + fixed persona + independent memory

  CharacterAgent {
    characterId: string,             // links to SceneSpec.characters[].id
    persona: {
      background, personality, speechStyle,
      knowledge: string[],           // what the character knows
      secrets: string[],             // won't say proactively
      relationships: Record<string, string>,
    },
    memory: {
      shortTerm: string[],           // recent conversation summary
      longTerm: string[],            // important events
      emotionState: string,          // current baseline emotion
      trustLevel: number,            // per-interactor trust
    },
    voice: VoiceSpec,
    expressionStyle: {
      defaultExpression, emotionIntensity, blinkRate, gestureFrequency
    },
    llmProvider, llmModel, temperature, maxContextTokens
  }

  LLM structured output per dialogue turn:
    {
      text: string,                  // spoken dialogue
      emotion: string,               // → ExpressionSpec lookup
      action: string?,               // → SemanticMotion lookup
      voiceStyle: string?,           // whisper/shout/laugh override
      innerThought: string?,         // drives micro-expression
      memoryUpdate: string?,         // persisted to memory
      trustDelta: number?            // relationship update
    }
    → text → TTS (VoiceSpec) → audio + viseme
    → emotion → ExpressionSpec → face/body
    → action → SemanticMotion → motion
    → all merge in gpu_export_pipeline
```

#### CharacterBundle (Complete Character Package)

```
  CharacterBundle (.nkchar or via .neko-asset.json) {
    model:        "alice.moc3" | "alice.vrm",
    motions:      { "idle": ".nkmotion", "wave": ".nkmotion", ... },
    expressions:  { "happy": ".nkexpr", "shy": ".nkexpr", ... },
    voice:        VoiceSpec { ... },
    agent:        CharacterAgent { ... }?,        // optional AI persona
    metadata:     { tags, license, preview }
  }

  A CharacterBundle = appearance + motion + expression + voice + AI personality.
  Publishable to neko-market. Drag into scene → immediately interactive.
```

#### StoryBinding (Script ↔ Asset Binding)

```
  Problem: Script says "ALICE nervously checks her watch."
  System doesn't know: which model is ALICE, what "nervously" means as
  ExpressionSpec, or what "checks watch" means as SemanticMotion.

  StoryBinding (.nkbind JSON) bridges script text → structured assets:

  {
    script: "screenplay.fountain",

    characters: {
      "ALICE": {
        bundle: "alice.nkchar",
        expressionMapping: {        // script emotion words → ExpressionSpec
          "焦虑/nervously": "anxious",
          "开心/happily": "happy",
          "default": "neutral"
        },
        actionMapping: {            // script action words → SemanticMotion
          "看表/checks watch": "look_watch",
          "站起来/stands up": "stand_up",
          "default": "idle"
        }
      }
    },

    scenes: {                       // scene headings → SceneSpec
      "INT. 咖啡厅 - 傍晚": "cafe_evening.nkscene"
    },

    defaultCamera: {                // scene type → camera preset
      dialogue: "over_the_shoulder",
      action: "tracking_shot",
      emotional: "close_up"
    },

    defaultMusic: {                 // mood → BGM style
      calm: "light_jazz",
      tense: "strings_tension"
    }
  }
```

#### Loose-Coupling Binding Architecture

```
Design principle: All bindings are REFERENCES, not containment.
Assets exist independently. Bindings can be swapped without touching assets.

  ┌─────────────────────────────────────────────────────────────┐
  │                   Asset Layer (independent)                  │
  │                                                              │
  │  CharacterBundle   SemanticMotion   ExpressionSpec           │
  │  "alice.nkchar"    "look_watch"     "anxious"                │
  │  "bob.nkchar"      "stand_up"       "happy"                  │
  │                                                              │
  │  SceneSpec         EffectSpec       VoiceSpec                │
  │  "cafe.nkscene"    "noir.nkeffect"  "alice_voice"            │
  │                                                              │
  │  Each asset has a stable ID. No asset knows about others.    │
  └──────────────────────────┬──────────────────────────────────┘
                             │
                             │ referenced by ID (never embedded)
                             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                   Binding Layer (swappable)                  │
  │                                                              │
  │  StoryBinding (.nkbind)                                      │
  │    "ALICE" → "alice.nkchar"     (swap to "carol.nkchar"     │
  │    "anxious" → "anxious.nkexpr"  without touching script)    │
  │    "INT. 咖啡厅" → "cafe.nkscene"                            │
  │                                                              │
  │  CharacterBundle (.nkchar)                                   │
  │    model → "alice.moc3"          (swap model, keep voice/AI) │
  │    voice → "alice_voice"         (swap voice, keep model)    │
  │    agent → "alice_agent"         (swap persona, keep rest)   │
  │    motions → { id → ".nkmotion" } (add/remove motions)      │
  │                                                              │
  │  SceneSpec (.nkscene)                                        │
  │    characters[] → CharacterBundle IDs                        │
  │    effects[] → EffectSpec IDs                                │
  │    lighting → LightSpec (embedded, scene-specific)           │
  └──────────────────────────┬──────────────────────────────────┘
                             │
                             │ consumed by
                             ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                   Consumer Layer (renderers)                 │
  │                                                              │
  │  TimelineSceneLoader / StageSceneLoader / XrSceneLoader     │
  │  → resolve all IDs → load concrete assets → render           │
  │                                                              │
  │  SceneAssembler                                              │
  │  → reads StoryBinding → resolves to assets → assembles .nkv │
  └─────────────────────────────────────────────────────────────┘

  Loose-coupling guarantees:
    1. Same script + different binding = different cast/scenes (recast)
    2. Same character + different scripts = reuse across projects
    3. Same motion + different characters = cross-model retarget
    4. Swap model (2D↔3D) without changing voice/AI/motions
    5. Swap voice without changing model/AI/motions
    6. Assets are independently versionable, publishable, deletable
    7. Bindings fail gracefully (missing asset → fallback to default)

  Resolution order (when consuming):
    StoryBinding → CharacterBundle → model file
                                  → VoiceSpec → TTS provider
                                  → CharacterAgent → LLM config
                                  → motions{} → .nkmotion files
                                  → expressions{} → .nkexpr files
                 → SceneSpec → .glb/.png background
                            → LightSpec
                            → EffectSpec IDs → .nkeffect files

  All references are by string ID (not file path embedding).
  AssetRegistry resolves ID → current file path at runtime.
  If an asset is moved/renamed, only the registry mapping updates.
```

#### Script → Production Automation Levels

```
  Level A — Manual (current, no binding):
    User manually configures each shot's character/expression/action/voice.

  Level B — Semi-auto (StoryBinding + AI parsing, Stage 3):
    User binds characters + scenes once in .nkbind.
    AI (LLM) parses each script element → infers emotion/action/camera.
    User reviews/adjusts.

  Level C — Full-auto (Creative AIOS, Stage 6):
    User writes script only.
    AI auto-casts (matches CharacterBundle from asset library).
    AI auto-binds scenes, emotions, actions, camera, music.
    User does final review only.

  Progression: A → B → C over Stages 1 → 3 → 6.
```

### Serialized Interactive Content (Episodic Publishing)

```
Core concept: Creators publish story episodes over time.
Each viewer has independent save state — choices in Episode 1 affect Episode 5.
This is "interactive TV series with persistent player agency."
No existing platform offers this.
```

#### SeriesSpec (Series Description)

```
SeriesSpec (.nkseries JSON) {
  id, title, author,

  sharedAssets: {                    // downloaded once, shared across episodes
    characters: { "ALICE": "alice.nkchar", "BOB": "bob.nkchar" },
    scenes: { "cafe": "cafe.nkscene" },
    effects: ["noir.nkeffect"]
  },

  stateContract: {                   // cross-episode state API (versioned, append-only)
    variables: {
      "alice_trust": { type: "number", default: 0, range: [-10, 10] },
      "read_diary": { type: "boolean", default: false },
      "relationship": { type: "enum", values: ["stranger","friend","close","lover"] }
    },
    characterMemory: {
      "ALICE": { persistent: true },  // Agent memory persists across episodes
      "BOB": { persistent: true }
    }
  },

  episodes: [
    { id: "ep01", title: "初遇", publishDate: "2026-05-01", status: "published",
      script: "ep01.fountain", binding: "ep01.nkbind",
      assets: ["ep01_rain.png"],      // episode-specific assets only
      requires: [],                    // no prerequisites
      stateExports: ["alice_trust", "read_diary"] },
    { id: "ep02", title: "再会", publishDate: "2026-05-02",
      requires: ["ep01"],
      stateImports: ["alice_trust", "read_diary"],
      stateExports: ["alice_trust", "bob_trust", "relationship"] },
    { id: "ep03", status: "draft", publishDate: null }
  ]
}

Episode dependency graph supports DAG (not just linear):
  ep01 → ep02a (Alice route, condition: alice_trust >= 3)
       → ep02b (Bob route, condition: bob_trust >= 3)
       → ep02c (Secret route, condition: read_diary == true)
  ep03 (convergence) requires: [ep02a | ep02b]  // any one suffices
```

#### PlayerSave (Per-Viewer State)

```
PlayerSave (per player, per series) {
  seriesId, playerId,

  progress: {
    "ep01": { completed: true, completedAt: "...",
              choicesMade: ["be_friendly", "read_diary"],
              stateSnapshot: { alice_trust: 3, read_diary: true } },
    "ep02": { completed: true,
              stateSnapshot: { alice_trust: 5, relationship: "friend" } }
  },

  currentState: {                  // latest accumulated state
    alice_trust: 5, bob_trust: 1, read_diary: true, relationship: "friend"
  },

  characterMemories: {             // CharacterAgent memories persist
    "ALICE": {
      shortTerm: ["ep02: player helped fix coffee machine"],
      longTerm: ["ep01: first meeting, player was friendly"],
      trustLevel: 5
    }
  }
}

Storage: local .neko/saves/{seriesId}/{playerId}.json
         cloud sync via neko-hub (optional, cross-device)
```

#### Incremental Publishing

```
Download efficiency:
  ep01: 60MB (first install, includes shared assets)
  ep02: 8MB  (episode-specific assets + script only)
  ep03: 5MB  (even smaller if reuses existing scenes)

Publish flow:
  Creator: neko publish ep02
    → Validate: ep02.stateImports ⊆ ep01.stateExports ✅
    → Package: ep02.fountain + ep02.nkbind + ep02-only assets
    → Upload: neko-hub / neko-market
    → Notify: subscribers receive update

Hot-update rules (backward-compatible):
  ✅ Allowed: change dialogue text, expressions, camera, BGM, backgrounds
  ❌ Forbidden: delete stateExport variables, change variable semantics
  → Published episodes are immutable in their state contract (like a public API)
  → Visual/narrative polish is always allowed

Version tracking:
  ep02 v1.0 (launch) → v1.1 (fix typo) → v1.2 (add dialogue branch)
  Save records version played. If v1.1 changes story paths → prompt replay option.
```

#### Cross-Episode Butterfly Effect

```
ButterflySystem extends across episodes:

  ep01: player reads Alice's diary → read_diary = true
    ↓ (delayed consequence, explodes in ep03)
  ep03: if (read_diary) {
    Alice discovers → trust -= 5 → crisis arc
  } else {
    normal progression
  }

  stateContract enforces:
    ep01 declares stateExports: ["read_diary"]
    ep03 declares stateImports: ["read_diary"]
    → IDE auto-completes available variables when writing ep03
    → Type checker: ep03 reads undefined variable → error
    → Backward compat: cannot remove published stateExport
```

#### Real-Time Story Updates

```
The loose-coupling architecture naturally supports live updates:

  During interactive playback (runtime-stage):
    Player makes choice → ButterflySystem updates variables
    → ScriptEngine jumps to new scene → SceneSpec hot-loaded
    → CharacterAgent.memory updated → subsequent dialogue adapts
    → All via ID-based references, no recompilation

  During creation (neko-story):
    Creator edits .fountain → FileWatcher detects change
    → Re-parse ScriptIndex → update StoryBinding mappings
    → runtime-stage hot-reloads affected scenes
    → Instant preview without restart

  Principle: Script is data (JSON/Fountain), not compiled artifact.
  Runtime reads → parses → renders. Data changes → rendering follows.
```

#### Monetization Patterns

```
Serialized format naturally enables:
  Free + paid episodes:      ep01-03 free → ep04+ paid (market pricing field)
  Subscription:              monthly unlock all new episodes (neko-auth)
  Time-gate:                 free users: 1 episode/day; paid: all immediately
  Premium choices:           free options 2 + paid option 1 (better outcome)
  Character DLC:             new CharacterBundle → joins existing series
  All implementable with existing neko-market + neko-auth infrastructure.
```

### MemoryAnchor System (Irreversible Experience + NPC-Mediated Discovery)

```
Core concept: Past events are "sealed" — players CANNOT replay/reload to change outcomes.
They can only rediscover the past through NPC conversations, each NPC offering a
subjective, partial, possibly inaccurate perspective. Truth must be pieced together
from fragments across multiple characters and episodes.

This replaces the traditional save/load "time travel" with a narrative-native
memory system where the player, like the characters, can only look back from the present.
```

#### MemoryAnchor Structure

```
MemoryAnchor {
  id: string,                          // "diary_incident"
  episode: string,                     // "ep01"
  timestamp: ISO string,

  fact: {                              // Ground Truth (system-only, never shown to player)
    event: string,                     // "player_read_diary"
    participants: string[],            // ["player", "ALICE"]
    location: string,
    details: Record<string, unknown>,  // full objective details
    witnessed: boolean                 // was anyone else present?
  },

  perspectives: {                      // each character's subjective memory
    [characterId]: {
      memory: string | null,           // what they remember (null = unaware)
      emotion: string?,                // how they feel about it
      detail_level: "full" | "clear" | "partial" | "vague" | "lost",
      discoverable: boolean,           // can the player learn this via dialogue?
      discoverable_if: string?,        // condition expression
      reveal_condition: string?,       // when this NPC will volunteer the info
      discovery_dialogue: {            // scripted or AI-generated discovery scene
        trigger: string,
        reaction: string
      }?
    }
  },

  anchor_rules: {
    replayable: false,                 // CANNOT replay this scene
    retractable: false,                // CANNOT undo this choice
    forgettable: false,                // CANNOT pretend it didn't happen
    reinterpretable: true              // CAN gain new understanding via new info
  }
}
```

#### Three-Layer Memory Architecture

```
Layer 1 — Ground Truth (God's-eye view, system-only):
  Objective facts. Never directly accessible to player or characters.
  Used by system for consistency validation only.
  "Player read Alice's diary at ep01 T=15:30. Content was about Alice's first love."

Layer 2 — Character Perspectives (subjective, filtered):
  Each character has their own version of events.
  Filtered by: what they saw, what they felt, memory decay, reconstruction.
  Player perspective: "I read the diary. It said..."  (full detail, guilt)
  Alice perspective:  null  (doesn't know it happened)
  Bob perspective:    "I vaguely saw someone near Alice's things"  (vague)

Layer 3 — Discovered Fragments (what the player has learned from NPCs):
  Accumulated through dialogue over episodes.
  May be contradictory (Bob says X, Alice says Y).
  Player must judge which fragments to trust.
  Full truth may never be fully assembled — and that's the point.

CharacterAgent context injection:
  System Prompt includes ONLY that character's perspective (Layer 2).
  Agent cannot access Ground Truth or other characters' perspectives.
  → NPC naturally "doesn't know what they don't know."
  → If player hints at something the NPC doesn't know → NPC reacts with
    confusion, suspicion, or curiosity (not omniscient exposition).
```

#### NPC-Mediated Discovery Mechanics

```
Players cannot "look up" past events. They rediscover through dialogue:

  Method 1 — Ask directly (requires high trust):
    Player: "Alice, what was in your diary?"
    Alice (anchor.perspectives.ALICE.memory == null):
      → "How do you know I have a diary...?" (suspicion, trust -= 2)
    → Player exposed themselves by asking about something they shouldn't know.

  Method 2 — Ask a third party (lower trust threshold):
    Player: "Bob, did you see anything strange that night?"
    Bob (anchor.perspectives.BOB.memory == vague):
      → "Hmm... I thought I saw someone near Alice's things, but not sure."
    → Player gets a fragment. Not the full picture.

  Method 3 — NPC volunteers info (trust threshold + time):
    ep05, alice_trust >= 10:
      Alice: "I've been wanting to tell you... what the diary says is..."
    → Alice shares her own perspective (which may differ from the diary's content)
    → Player now has Alice's version AND their own memory — they may not match.

  Method 4 — Cross-reference contradictions:
    Bob says: "Someone was near Alice's things"
    Alice says: "Nobody touched my things that night"
    Player knows: "I touched them" (their own anchor)
    → Three conflicting accounts → player must judge truth
```

#### Information Discovery Layers

```
Layer 0 — Public (everyone knows):
  "Alice runs a cafe"  → shown in scene, no discovery needed

Layer 1 — Surface (casual conversation):
  "Alice moved here three years ago"
  → unlock: any_conversation_with_alice

Layer 2 — Personal (requires trust):
  "Alice used to work in the city"
  → unlock: alice_trust >= 3

Layer 3 — Secret (high trust + specific topic trigger):
  "Alice came here to escape something"
  → unlock: alice_trust >= 7 AND topic == "past"

Layer 4 — Core secret (requires multiple fragment assembly):
  "Alice's first love was involved in that accident..."
  → unlock: bob_fragment AND diary_clue AND alice_hint_count >= 3
  → no single NPC reveals this — player pieces it together

Layer 5 — Hidden truth (may never be discovered):
  "What Alice herself doesn't know"
  → unlock: no explicit condition — depends on player's deductive ability
  → only Ground Truth knows — reward for attentive players
```

#### Memory Decay and Reconstruction

```
Memories are not recordings — they fade and reshape over time.

  MemoryDecay:
    detail_level progression: full → clear → partial → vague → lost
    Decay rate depends on:
      Emotional intensity (high-emotion events decay slower)
      Repeated mention (discussed events don't decay)
      Character personality (meticulous characters decay slower)

  MemoryReconstruction:
    Characters unconsciously alter memories when recalling.
    Bob ep01: saw "someone near things" (vague)
    Bob ep03: told "Alice was upset that day"
    Bob ep03 recall: "I saw someone near ALICE's things" (reconstructed — added "Alice's")
    → detail_level: "vague" → "partial" (but now contains fabricated detail)

  Implementation:
    CharacterAgent dialogue tagged with memory_reconstruction flag.
    Ground Truth validates: reconstructed memory divergence from fact.
    → creates unreliable narration organically (no scripting needed).
```

#### Integration with Existing Architecture

```
MemoryAnchor slots into existing systems:

  SeriesSpec.stateContract:
    + anchorSchemas: AnchorSchema[]   // define anchor templates per series

  Episode .nkbind:
    + anchorTriggers: [{              // which script events create anchors
        scriptElement: "action:read_diary",
        anchorTemplate: "diary_incident",
        perspectives: { ... }
    }]

  PlayerSave:
    + anchors: MemoryAnchor[]         // instantiated anchors
    + discoveredFragments: Fragment[]  // accumulated knowledge
    + reconstructionLog: []           // track memory drift

  CharacterAgent:
    + accessibleAnchors(playerId) → MemoryAnchor[]
    + perspectiveFilter(anchor) → FilteredMemory  // only own perspective
    + decayMemory(anchor, episodesElapsed) → DecayedMemory
    → injected into LLM system prompt as character's subjective memory

  runtime-stage:
    + event fires → create MemoryAnchor → write to PlayerSave
    + dialogue → query anchors → check unlock_condition → release fragments
    + DiscoverySystem: tracks which Layer 0-5 info player has assembled

  Loose coupling maintained:
    MemoryAnchor is pure data — no embedded logic.
    CharacterAgent only sees its own perspective — no omniscience.
    DiscoverySystem only manages conditions — doesn't know dialogue content.
    Ground Truth is independent of all characters — used only for validation.
```

### Motion Capture Integration (Cross-Stage)

```
Strategy: neko does NOT build device drivers. neko receives standard protocols
and converts to SemanticMotion — making mocap data editable, reusable, cross-character.

Capture sources (external, not neko's responsibility):
  iPhone TrueDepth → iFacialMocap/VTube Studio → VMC protocol (UDP)
  Webcam → MediaPipe FaceMesh/Pose (ONNX, built into neko)
  Pro optical → Vicon/OptiTrack → BVH files
  Pro inertial → Rokoko/Xsens → BVH/VMC
  Hand tracking → Leap Motion → OSC/VMC
  AI generation → MDM/MotionGPT → BVH
  Video files → offline MediaPipe/DWPose extraction
```

#### Mocap → SemanticMotion Pipeline

```
  External device/software
      │
      ├─ VMC protocol (UDP)      ← exists in neko-live
      ├─ BVH file import         ← planned (bvh_adapter)
      ├─ VMD file import         ← planned (vmd_adapter)
      ├─ MediaPipe (built-in)    ← planned (Phase 5.1.3)
      ├─ OSC generic protocol    ← needs new receiver
      └─ Video offline extract   ← planned (video→motion extraction)
      │
      ▼
  SemanticMotion (unified)
      │
      ├─→ Realtime: RetargetMap → drive 2D/3D character (preview)
      ├─→ Record: frame-by-frame → buffer → smooth/denoise → .nkmotion
      ├─→ Edit: timeline curve editing (per-channel adjust/smooth/trim/loop)
      ├─→ Timeline: drag .nkmotion onto puppet/scene3d track
      ├─→ Layer: + ExpressionSpec (emotion override) + viseme (TTS lip sync)
      └─→ Export: BVH / glTF animation / motion3 / marketplace publish
```

#### Critical Missing Piece: SemanticMotion Recording

```
Current state:
  neko-live can DRIVE characters in realtime from VMC/ARKit ✅
  neko-live can RECORD to WebM video ✅
  neko-live CANNOT record to editable .nkmotion ❌

  → Performance is visible but not preserved as structured data.
  → The video recording is pixels — cannot be edited, retargeted, or reused.

Solution: Record SemanticMotion alongside video:
  VMC data → SemanticMotion channels (per frame)
  → push to ring buffer during recording
  → on stop: smooth + denoise → save as .nkmotion
  → simultaneously: save audio (WAV) synced to same timeline

  Implementation: minimal — neko-live already receives and maps VMC data.
  Add: buffer accumulation + post-process + serialization to .nkmotion.
```

#### Multi-Source Fusion (MocapMerger)

```
Combine multiple capture sources into one SemanticMotion stream:

  Config:
    face:  { source: "vmc", address: "127.0.0.1:39539" }   // iPhone (best face)
    body:  { source: "mediapipe", camera: 0 }               // Webcam (free body)
    hands: { source: "leapmotion" }                          // Dedicated (fingers)

  Each source owns a subset of SemanticMotion channels:
    face source → eye_*, brow_*, mouth_*, head_rotation, cheek_*
    body source → body_rotation (+ future: arm/leg channels)
    hands source → (future: finger channels)

  Conflict resolution (same channel from multiple sources):
    Priority: face source head_rotation > body source head_rotation
    Or: weighted blend (face 0.7 + body 0.3)

  Output: single merged SemanticMotion stream.
```

#### Mocap Workflow (End-to-End)

```
  ① Prepare: Select CharacterBundle + capture source(s) + optional multi-source config
  ② Preview + Record: realtime drive character + record SemanticMotion buffer + audio
  ③ Save: buffer → smooth/denoise → .nkmotion + .wav (time-synced)
  ④ Edit (optional): timeline curve editor (per-channel adjust/smooth/trim/loop/blend)
  ⑤ Apply: drag .nkmotion onto puppet/scene3d track in neko-cut timeline
     → layer with ExpressionSpec (emotion) + viseme (TTS) + effects (EmotionArc)
  ⑥ Reuse: apply to other characters (RetargetMap adapts automatically)
     → publish to marketplace → export as BVH/glTF/motion3
```

### 2D+3D+Video Unified Compositing (Stage 1 → Stage 3 Foundation)

#### Compositing Pipeline

```
Current: gpu_export_pipeline supports Video + Text + Scene3D + Shape layers.
Missing: Puppet (Live2D/MOC3) layer in compositing pipeline.

Rendering stack (per frame, after completion):
  ① Camera Keyframe sample → unified_camera_state
  ② Video/Image → HW decode → GpuLayer
  ③ Text → render → GpuLayer
  ④ Scene3D → PBR or NPR → GpuLayer + depth_texture + light_info
  ⑤ Puppet → runtime-puppet → GpuLayer + alpha                ← NEW
  ⑥ Lighting match → apply light_info to puppet color          ← NEW
  ⑦ Shape → rasterize → GpuLayer
  ⑧ Spatial compositing (Z-index / anchor / depth-aware)
  ⑨ Parallax offset (per-layer parallax_factor × camera delta)
  ⑩ Effects chain → Encode

Supported combinations:
  ├── 2D character + 3D scene (AVG / VTuber interaction)
  ├── 3D character (NPR) + 2D scene (stylized animation)
  ├── 2D + 3D + video mixed compositing (full creative freedom)
  ├── 2D + 3D characters co-stage (same SemanticMotion drives both)
  └── 3D scene with camera keyframes → direct video export
```

#### Coordinate Systems

```
Three coordinate spaces must be reconciled:

  3D World (runtime-scene):     Right-handed, Y-up, unit=meters, origin=scene center
  2D Canvas (runtime-puppet):   Screen coords, Y-down, unit=pixels, origin=top-left
  Video Frame:                  Screen coords, Y-down, unit=pixels, no depth

Resolution: All layers render to RGBA textures (screen space) before compositing.
For spatial integration, 3D projection bridges world→screen coordinates.

  project(world_pos, view_proj) → screen_pos
    Used for: anchoring 2D characters to 3D scene locations
    Used for: parallax factor calculation from Z-depth
```

#### Unified Camera System

```
Single camera drives all layer types simultaneously:

  UnifiedCamera {
    position: [x, y, z],    // 3D world position
    target:   [x, y, z],    // look-at point
    fov:      f32,           // field of view (degrees)
    mode:     Perspective | Orthographic,
  }

  Drives 3D layers:
    → View × Projection matrix → PbrRenderer / NprRenderer

  Drives 2D layers (projection):
    → position.xz delta → 2D offset (scaled by parallax_factor per layer)
    → position.y delta  → 2D zoom (closer = larger)
    → fov change        → parallax strength adjustment

  Drives video layers:
    → pan (position.x → video offset)
    → zoom (fov → video scale)

  Camera presets (parameterized motion templates):
    Dolly (push/pull), Truck (lateral), Pan, Tilt, Orbit, Crane, Zoom
    → All affect 2D+3D+video simultaneously via unified camera
```

#### Camera Drive Modes (Video vs Game vs Interactive)

```
Three fundamentally different camera behaviors, sharing one UnifiedCamera struct:

  ┌─────────────────────────────────────────────────────────────────────┐
  │ Mode             Driver              Deterministic  Use Case        │
  │─────────────────────────────────────────────────────────────────────│
  │ Cinematic        Keyframe curves     Yes (same     Video export,   │
  │ (Video)          (time → position)   every play)   neko-cut preview│
  │                                                                     │
  │ Gameplay         Player input        No (depends   Stage 4 game,   │
  │ (Game)           + spring-damper     on player)    free exploration │
  │                  + collision avoidance                              │
  │                                                                     │
  │ Hybrid           Auto-switch by      Mixed         Stage 3 interact│
  │ (Interactive)    InteractionMode                   cinema           │
  └─────────────────────────────────────────────────────────────────────┘

  Cinematic camera (keyframe-driven):
    CameraKeyframeTrack: [{time, position, target, fov, easing}]
    Interpolation: cubic bezier between keyframes
    AI: CameraDirector translates shot semantics → keyframes
    Use: scripted scenes, dialogue, cutscenes, video export
    Language: push/pull/pan/tilt/orbit/crane/zoom (film grammar)

  Gameplay camera (input-driven):
    CameraController {
      mode: ThirdPerson | FirstPerson | FreeLook | OrbitalLocked,
      followTarget: Entity,
      distance: f32,              // spring target distance
      springStiffness: f32,       // how quickly camera catches up
      dampingFactor: f32,         // smoothing (reduce jitter)
      collisionLayers: u32,       // raycast to avoid walls
      inputSensitivity: f32,      // mouse/stick sensitivity
    }
    Each frame: read input → update desired position → spring solve → collision check
    Use: exploration, gameplay, player-controlled sections

  Hybrid camera (Stage 3 interactive cinema):
    Switches mode based on InteractionMode:
      Director mode   → cinematic (editing in VSCode)
      Novel mode      → cinematic (auto shot/reverse-shot during dialogue)
      Cinema mode     → cinematic (scripted camera + video segments)
      Explore mode    → gameplay (player walks around, looks around)

    Transition between modes:
      cinematic → gameplay: smooth blend (1s lerp from keyframe end to follow position)
      gameplay → cinematic: smooth blend (1s lerp from current to keyframe start)

    AI involvement:
      During dialogue: CameraDirector auto-selects shot type
        say(alice) → over_the_shoulder(from_player)
        say(bob) → over_the_shoulder(from_alice)
        emotional moment → close_up(speaker_face)
        group scene → establishing_shot → medium_shot
      During exploration: gameplay camera, no AI
      Transition: AI detects dialogue start/end → triggers mode switch

  All three modes output the same UnifiedCamera { position, target, fov }
    → drives 3D render, 2D parallax, video layer offset identically
    → RenderProfile doesn't care which mode produced the camera state
```

#### 2.5D Parallax

```
Depth illusion via differential layer movement speeds.

  Method A — Pure 2D parallax (Stage 1):
    Each layer has parallax_factor (0.0=static .. 1.0=full speed .. 1.5=foreground):
      Background:  parallax_factor = 0.3  (moves slow)
      Mid-ground:  parallax_factor = 0.6
      Character:   parallax_factor = 1.0  (reference speed)
      Foreground:  parallax_factor = 1.3  (moves fast)
    Layer offset = camera_delta × parallax_factor
    Works with Camera Keyframe Track or interactive input (mouse/gyroscope).

  Method B — 3D-projected parallax (Stage 3):
    Place 2D layers on 3D planes at different Z depths:
      Background plane at Z = -10
      Character plane at Z = 0  (billboard, always facing camera)
      Foreground plane at Z = +5
    3D perspective projection naturally produces parallax + size scaling.
    Character billboards rotate to face camera (standard technique).
```

#### Lighting Consistency

```
Core problem: 3D scenes have dynamic lighting; 2D art has baked lighting.
3D light from left → objects lit on left, shadowed on right.
2D character has fixed painted lighting → always looks "pasted on."

Progressive solution levels:

  Level 0 — No processing (current):
    Direct layer compositing. Acceptable for stylized/cartoon content.

  Level 1 — Global tone matching (low cost, high impact):
    Extract from 3D render: dominant_light_color + average_brightness
    Apply to 2D layer: color_temperature_shift + brightness_offset
    Implementation: 2 compute shaders (extract + apply), ~person-day.
    Reuses existing color correction shader infrastructure.

  Level 2 — Normal map lighting (medium cost):
    Provide normal map for 2D character (AI-generated or hand-painted).
    Apply 3D light direction via per-pixel dot(normal, light_dir) shading.
    Puppet outputs: color_texture + normal_texture (2 render targets).
    Compose shader: lit_color = color × (ambient + diffuse × dot(N, L)).
    Implementation: ~person-month (normal gen + lighting shader + UI).

  Level 3 — Shadow projection (high cost):
    3D objects cast shadows onto 2D characters (sample shadow map).
    2D characters cast shadows onto 3D ground (extract alpha → project).
    Requires approximate 2D character depth. ~person-month.
```

#### 2.5D Depth Sorting

```
Problem: Pure Z-index gives "in front" or "behind" per-layer.
         Cannot handle partial occlusion (2D character behind 3D table).

  Method A — Depth-Aware Compositing:
    3D renders depth_texture alongside color.
    2D character has artist-assigned virtual_depth value.
    Per-pixel: if (scene_depth < puppet_virtual_depth) show scene, else show puppet.
    Result: Pixel-perfect occlusion at assigned depth plane.

  Method B — Depth Slicing:
    Split 3D scene into depth layers (foreground/midground/background).
    Insert 2D character between depth slices as separate GpuLayer.
    Simpler but coarser than per-pixel depth testing.

  Method C — Billboard in 3D (best for Stage 3+):
    Create camera-facing quad mesh in 3D scene at character's world position.
    Texture it with puppet render output (updated per frame).
    Participates in Z-buffer naturally → automatic occlusion.
    Supports camera movement without manual depth adjustment.
    Performance: acceptable (puppet re-render + texture upload per frame).
```

#### NPR Rendering (3-Renders-as-2D)

```
Required for: 3D character + 2D scene style unification.

  Post-process NPR (quick, Phase P1):
    Applied after PBR render, before compositing.
    ├── Cel Shading: quantize lighting into N discrete bands
    ├── Outline: Sobel edge detection on depth + normal buffers
    └── Implemented as compute shaders in existing effect chain.

  Dedicated NPR Pipeline (full, Phase P2+):
    Separate render pipeline parallel to PBR.
    ├── Custom NPR material: color ramp texture, outline width, shadow color
    ├── Model-space outline: inverted-hull back-face extrusion
    ├── Stylized shadow: custom shadow ramp (warm→cool gradient)
    └── Hatching / ink / watercolor passes (optional per-material)
```

#### Semantic Motion Asset (Cross-Dimensional Animation Reuse)

```
Problem: 3D animates transforms (Vec3/Quat); 2D animates parameters (f32).
         Cannot directly share animation clips between dimensions.

Solution: Dimension-agnostic semantic motion format.

  SemanticMotion (.nkmotion) {
    channels: [
      { semantic: "head_rotation",   keyframes: [{t, value: [yaw,pitch,roll]}] },
      { semantic: "eye_blink_left",  keyframes: [{t, value: 0~1}] },
      { semantic: "mouth_open",      keyframes: [{t, value: 0~1}] },
      { semantic: "body_rotation",   keyframes: [{t, value: [yaw,pitch,roll]}] },
      ...
    ]
  }

  Semantic channels (human-body universal, ~20 channels):
    Face:  head_rotation, eye_blink_L/R, eye_look_xy, eye_squint_L/R,
           brow_up_L/R, brow_down_L/R, mouth_open, mouth_smile, jaw_open,
           cheek_puff, mouth_pucker
    Body:  body_rotation, breath
    Emotion: expression_happy/sad/angry/surprised (compound → multi-param)

  Coverage: ARKit 52 blendshapes ⊇ Live2D Params ⊇ VRM 17 presets

  Retarget maps (trait RetargetMap { fn apply(semantic, value, world) }):

    VrmRetargetMap:
      head_rotation    → Head bone Quat (euler→quat)
      eye_blink_left   → MorphTarget "eye_blink_l" (0→1)
      mouth_open       → MorphTarget "mouth_open" or Jaw bone

    PuppetRetargetMap:
      head_rotation    → ParamAngleX/Y/Z (decompose, clamp ±30°)
      eye_blink_left   → ParamEyeLOpen (invert: 1−v)
      mouth_open       → ParamMouthOpenY (0→1)

  Data flow:
    Input sources → SemanticMotion → RetargetMap → 2D and/or 3D simultaneously
    Export: SemanticMotion + VrmRetargetMap → .glb animation
            SemanticMotion + PuppetRetargetMap → .motion3.json

  Existing code reuse:
    neko-live vmcMapping.ts   → 3D retarget reference (ARKit→VRM, already working)
    neko-live puppetMapping.ts → 2D retarget reference (ARKit→Puppet, already working)
    engine-types EasingType    → shared easing functions (30+ types)
```

#### Implementation Phases

```
P0 — Functional (can composite 2D+3D):
  PuppetElement + puppet track type + runtime-puppet → GpuLayer bridge.
  Result: Flat layer compositing with Z-index ordering.

P1 — Usable (camera + parallax + style):
  Unified Camera + Camera Keyframe Track + 2.5D parallax.
  Level 1 lighting (global tone match). NPR post-process (cel + outline).
  SemanticMotion format + VRM/Puppet retarget maps.
  Result: Camera movement affects all layers. Style-consistent mixing.

P2 — Professional (spatial integration):
  3D anchor points for 2D characters. Billboard-in-3D compositing.
  Depth-aware partial occlusion.
  Result: 2D characters spatially integrated into 3D scenes.

P3 — Cinematic (full lighting):
  Normal-map lighting (Level 2). Shadow projection (Level 3).
  Dedicated NPR material pipeline.
  Result: 2D and 3D lighting fully consistent.
```

### AI Creative Pipeline (Cross-Stage)

#### End-to-End AI Video Generation vs Structured Pipeline

```
Strategy: AI video generation (Sora/Seedance/Kling) and 2D/3D structured pipeline
are complementary, not competing. Use each where it's strongest.

AI end-to-end generates:                 Structured pipeline handles:
  Single-shot atmosphere videos            Multi-shot narrative coherence
  Background/environment footage           Precise character performance control
  Transition/VFX sequences                 Interactive branching
  Dance/motion reference clips             Real-time content (VTuber/XR)
  Stylized visual effects                  Frame-accurate editing
                                           Layered compositing (change one thing)

Hybrid timeline (best of both):
  Track 1 [video]   │ AI-generated background video │ AI transition │ AI bg │
  Track 2 [puppet]  │ Alice.moc3 precise performance (SemanticMotion)       │
  Track 3 [scene3d] │ 3D props (interactive objects when needed)            │
  Track 4 [audio]   │ TTS voice + AI-generated BGM                         │
  Track 5 [camera]  │ AI-directed camera (CameraDirector semantic presets)  │
  Track 6 [effect]  │ EmotionArc-driven color/mood (auto from emotion)     │

What AI video generation CANNOT replace (fundamental limits):
  ├── Interactive content (pixels cannot branch or respond to input)
  ├── Real-time content (generation latency = seconds, not frames)
  ├── Precise control (text prompt << keyframe animation granularity)
  ├── Partial editing ("change only the cup" requires regenerating everything)
  ├── XR content (2D video cannot become 3D immersive)
  └── Long-form coherence (character/scene drift across generated clips)

Evolution forecast:
  2024-2025: AI video = single shots ≤20s, weak consistency → use as texture layers
  2026-2027: AI video = better consistency, controllable camera → richer bg layers
  2028+:     AI video → AI world generation (output = scene graph, not pixels)
             → neko structured pipeline becomes the consumer of structured AI output
```

#### AI-Driven Performance Pipeline

```
Four new modules bridge AI intent to structured creative parameters:

1. EmotionToMotion (emotion string → SemanticMotion)
   ├── Predefined mapping table (not AI inference per-frame):
   │   "anxious" → eye blink rate ↑, gaze sweep, brow furrow,
   │               mouth tight, micro head shake, breath rate ↑
   │   "happy"   → eye squint (smile), mouth smile, brow lift,
   │               head tilt, relaxed breath
   ├── Random micro-variation per instance (avoids robotic repetition)
   ├── Blendable: anxious(0.7) + sad(0.3) → weighted parameter mix
   └── Output: SemanticMotion → RetargetMap → 2D or 3D character

2. CameraDirector (shot semantic → Camera Keyframes)
   ├── Predefined cinematic vocabulary:
   │   establishing_shot  → wide FOV, slow pan, reveal environment
   │   close_up           → narrow FOV, shallow DOF, focus on face
   │   over_the_shoulder  → offset framing, dialogue scene
   │   tracking_shot      → follow character movement
   │   dutch_angle        → tilted frame, unease/tension
   │   crane_up           → rise, reveal/ending
   │   whip_pan           → fast pan, transition/surprise
   │   dolly_zoom         → push-pull, vertigo/epiphany
   ├── Each preset → parameterized Camera Keyframes
   └── AI selects preset + target + duration, Director translates to keyframes

3. SceneAssembler (LLM SceneDirective → complete .nkv timeline)
   ├── Input: structured JSON from LLM describing scene
   │   { background, characters, shots[], bgm, dialogue[] }
   ├── Orchestrates:
   │   → Call media adapters to generate background/BGM
   │   → Load characters to puppet/scene tracks
   │   → Generate Camera Keyframe Track from shot semantics
   │   → Generate SemanticMotion from emotion timeline
   │   → Call TTS for dialogue → add to audio track
   │   → Generate lighting keyframes from light parameters
   ├── Output: complete .nkv project file, ready for preview/export
   └── Human reviews/adjusts → re-export

4. EmotionArc Controller (single emotion curve drives everything)
   ├── One emotion timeline drives all audio-visual elements simultaneously:
   │   emotion value → character expression (EmotionToMotion)
   │                → camera pacing (CameraDirector: calm=slow, tense=fast)
   │                → lighting temperature (calm=warm 5500K, tense=cool 4000K)
   │                → lighting brightness (calm=bright, tense=dim)
   │                → color saturation (calm=saturated, tense=desaturated)
   │                → BGM intensity (calm=soft, tense=dense strings)
   │                → camera shake (calm=0, tense=subtle noise offset)
   │                → depth of field (calm=deep, tense=shallow focus on face)
   ├── User only defines emotion keyframes; all parameters derived automatically
   └── Override any individual parameter when artistic control needed

Data flow:
  User: "Alice waits anxiously, growing more panicked, then relieved"
    → LLM: SceneDirective { shots with emotion arcs }
    → SceneAssembler: generate assets + assemble timeline
    → EmotionArc: drive character + camera + light + music
    → gpu_export_pipeline: composite all layers → MP4 or interactive
```

#### Motion Sequence Sources → Video Application

```
Three sources of character motion, all unified through SemanticMotion:

  Source A — AI Generated:
    LLM emotion description → EmotionToMotion → SemanticMotion
    "Alice anxiously checks her watch" → auto-generated motion sequence

  Source B — Motion Capture:
    Real face tracking (ARKit/VMC) → SemanticMotion → save as .nkmotion
    Actor performs once → reuse on any 2D or 3D character

  Source C — Manual Keyframing:
    Timeline keyframe editor → SemanticMotion
    Precise per-frame control of every parameter

  All three → same SemanticMotion format → apply to any output:
    → 2D video: PuppetRetargetMap → runtime-puppet → GpuLayer
    → 3D video: VrmRetargetMap → runtime-scene → GpuLayer
    → Mixed: same SemanticMotion drives 2D + 3D simultaneously
    → XR: same motion in stereoscopic rendering
    → Interactive: runtime-stage selects motion based on dialogue
    → Export: .glb animation or .motion3.json for external engines

Stage progression:
  Stage 1: EmotionToMotion + CameraDirector (AI generates performance + camera)
  Stage 3: + SceneAssembler + EmotionArc (AI assembles complete scenes)
  Stage 6: Multi-agent ensemble (Narrative/Visual/Audio/Character/Director agents
           coordinated through EmotionArc and World State)
```

### Data Flow and AI Orchestration (Cross-Stage)

#### Five Core Data Flows

```
Flow 1 — Script → Final Output (main creation pipeline):
  .fountain → Parser → ScriptIndex
  → StoryBinding lookup (characters → bundles, scenes → specs)
  → AI semantic analysis (LLM: emotion/action/camera per element)
  → Asset resolution (ExpressionSpec, SemanticMotion, CameraKeyframes, EmotionArc)
  → Voice generation (TTS + viseme timestamps)
  → SceneAssembler → .nkv timeline
  → gpu_export_pipeline → MP4 | runtime-stage → interactive | Three.js → Web

Flow 2 — Realtime Interactive (AI dialogue-driven):
  Player input → CharacterAgent (persona + perspectiveFilter(anchors))
  → LLM structured output: { text, emotion, action, innerThought, memoryUpdate, trustDelta }
  → Parallel: text→TTS→audio+viseme | emotion→ExpressionSpec | action→SemanticMotion
  → Streaming composite: puppet + audio → gpu_export_pipeline → H.264 stream
  → State update: PlayerSave + MemoryAnchor check + ButterflySystem check
  Latency budget: LLM first token ~500ms + TTS first chunk ~200ms = ~700ms to "start speaking"

Flow 3 — EmotionArc Cascade (single value drives everything):
  EmotionArc tension value (0-1)
  → Expression: lerp between presets (smooth, no discrete jumps)
  → Camera: pacing speed + shake amplitude + shot type preference
  → Lighting: temperature (warm→cool) + brightness + shadow hardness
  → Color: saturation + vignette + contrast (via EffectSpec.emotionBinding)
  → Music: intensity + instrument selection + tempo
  → DOF: aperture (deep→shallow focus)
  → Shake: camera noise amplitude
  Creator only sets emotion keyframes — all AV parameters derived automatically.

Flow 4 — Asset Extraction (image/video → structured assets):
  Image → Depth Anything (SceneSpec 2.5D) + SAM (segmentation) + FaceMesh (ExpressionSpec)
         + Light estimation (LightSpec) + Color analysis (EffectSpec LUT) + TripoSR (3D mesh)
  Video → Pose estimation (SemanticMotion) + FaceMesh (ExpressionSpec[]) + DUSt3R (CameraKeyframe)
         + SceneDetect (shot splits) + Demucs (audio stems) + Whisper (subtitles) + 3DGS (SceneSpec)
  All outputs → unified asset formats → editable, reusable, cross-Stage.

Flow 5 — Serialized + Memory Anchors (cross-episode state):
  Load: SeriesSpec → episode N + PlayerSave (state + memories + anchors)
  Run: ScriptEngine executes → events create MemoryAnchors → CharacterAgent injects perspectives
       → DiscoverySystem checks unlock conditions → releases fragments through NPC dialogue
  Save: PlayerSave updated (progress + state + memories + anchors + fragments)
  Next: Episode N+1 incremental download → import accumulated state → continue
```

#### AI Orchestration Levels

```
Level 1 — Intent Understanding (LLM, non-deterministic):
  Input:  Natural language / script text / voice command
  Output: Structured directives (SceneDirective / emotion / action / shot_type)
  Role:   Understand WHAT is wanted. Does NOT decide HOW to render.

Level 2 — Semantic Translation (mapping tables, deterministic):
  EmotionToMotion:  emotion string → SemanticMotion channels (predefined table)
  CameraDirector:   shot_type string → Camera Keyframes (predefined presets)
  ExpressionSpec:   emotion → face channel values (predefined presets)
  EmotionArc:       tension float → lighting/color/music/DOF params (curves)
  Role:   Translate semantics to parameters. No AI inference. Predictable.

Level 3 — Resource Assembly (SceneAssembler, deterministic):
  Reads StoryBinding → locates asset files
  Calls media adapters → generates missing assets (AI generation is Level 1)
  Assembles .nkv timeline → arranges all tracks
  Role:   Assemble assets into renderable project. No creative decisions.

Level 4 — Render Execution (engine, deterministic):
  gpu_export_pipeline / runtime-stage / Three.js
  Reads assets → renders → encodes → outputs
  Role:   Execute. No decisions.

Key design: AI non-determinism is confined to Level 1 only.
  Levels 2-4 are deterministic pipelines consuming structured data.
  AI produces structured data, not pixels.
  Structured data flows through deterministic pipeline to become output.
  → AI uncertainty does not leak into rendering layer.
```

#### Message Protocol Between Levels

```
Level 1 → Level 2 (AI → Mappers):
  SceneDirective {
    background: string,
    characters: [{ id, emotion, action, dialogue }],
    camera: string,          // shot semantic name
    mood: string,            // → EmotionArc
    music: string            // → BGM selection
  }

Level 2 → Level 3 (Mappers → Assembler):
  ResolvedScene {
    layers: [
      { type: "video", src, transform, zIndex },
      { type: "puppet", bundle, motion: SemanticMotion,
        expression: ExpressionSpec, voice: { audio, visemes } },
      { type: "camera", keyframes: CameraKeyframe[] },
      { type: "effect", spec: EffectSpec, emotionValue: f32 },
      { type: "light", spec: LightSpec }
    ]
  }

Level 3 → Level 4 (Assembler → Renderer):
  .nkv ProjectData (existing format, extended with new track types)
  or runtime-stage SceneState (realtime mode)

Level 4 → Output:
  H.264 stream / MP4 / WebXR frame / interactive scene
```

#### State Lifecycle Management

```
Four state categories, different lifetimes:

  Ephemeral (per-frame, not persisted):
    GPU textures, current render output, animation interpolation mid-values,
    TTS playback position. Recomputed every frame.

  Session (per-scene, in-memory):
    runtime-stage ScriptEngine variables, current ECS World,
    CharacterAgent short-term memory, EmotionArc current value.
    May reset on scene transition.

  Save (per-episode, PlayerSave on disk):
    stateContract variables (trust/flags/enums), CharacterAgent long-term memory,
    MemoryAnchor list, discoveredFragments, episode progress.
    Written to disk on episode completion.

  Series (cross-episode, SeriesSpec immutable after publish):
    stateContract definitions, sharedAssets list, episode dependency graph.
    Append-only after publication (backward compatibility guarantee).
```

#### Complete Asset + Data Flow Summary

```
Asset Standards (8 + 3):
  Character (.nkchar)     Model + motions + expressions + voice + AI persona
  Motion (.nkmotion)      Dimension-agnostic semantic motion
  Expression (.nkexpr)    Compound face presets (~30)
  Scene (.nkscene)        Environment + characters + props + camera + effects
  Effect (.nkeffect)      Declarative effect stack + emotionBinding
  Lighting (in Scene)     Ambient IBL + dynamic lights + shadow + post-process
  Voice (in Character)    TTS config + viseme mode
  StoryBinding (.nkbind)  Script ↔ asset ID references (loose coupling)
  + SeriesSpec (.nkseries) Episodic series + state contract + episode DAG
  + PlayerSave             Per-player state + memories + anchors
  + MemoryAnchor           Irreversible experience nodes + perspectives

AI Orchestration (4 modules):
  EmotionToMotion          Emotion → motion mapping (deterministic)
  CameraDirector           Shot semantics → camera keyframes (deterministic)
  SceneAssembler           Script → complete timeline (orchestrator)
  EmotionArc Controller    Single emotion curve → all AV parameters

Format Compatibility (7 adapters):
  BVH / LUT / HDR / VMD / glTF / VRM / Live2D

Render Pipelines (3 paths):
  gpu_export_pipeline      Offline/streaming video
  runtime-stage            Realtime interactive
  Three.js / WebXR         Web / XR

Data Flows (5 paths):
  Script→output / Realtime dialogue / EmotionArc cascade /
  Asset extraction / Serialized memory
```

### AI Edit Protocol (Cross-Stage)

#### Current EditOperation System

```
56 operation types across 6 domains (timeline/canvas/sketch/audio/batch/project).
Each operation carries OperationMeta { id, timestamp, source: 'user'|'ai'|'system', description }.
Each operation includes `before` field for pure-function inversion (undo).

Current AI editing flow:
  AI tool → raw result → hand-coded operation construction → applyOperation()
  Problem: each AI tool manually constructs operations. Not scalable.
```

#### AIEditResult (Standardized AI Output)

```
Every AI tool should return AIEditResult, not raw data:

  AIEditResult {
    source: string,             // which AI tool produced this
    intent: string,             // user intent description

    generatedAssets: [{         // assets to persist
      type: 'image'|'audio'|'video'|'motion'|'expression'|'scene',
      data: Buffer | string,
      suggestedPath: string,
      assetId?: string          // register in AssetRegistry
    }],

    operations: EditOperation[], // operations to apply (in order)

    rollback: {                 // if any operation fails
      operations: EditOperation[],
      assetsToDelete: string[]
    },

    preconditions: [{           // pre-checks before applying
      type: 'asset_exists'|'element_exists'|'track_exists',
      id: string,
      failAction: 'abort'|'create'|'skip'
    }]
  }

  Framework auto-handles: precondition check → apply operations → register assets.
  No per-tool custom logic needed.
```

#### Extended EditOperation Types (Unified Asset Editing)

```
New operation domains for unified asset standards:

  expression.set     → set character expression (ExpressionSpec)
  expression.blend   → blend multiple expressions

  motion.apply       → apply motion to character (SemanticMotion)
  motion.record      → start/stop mocap recording

  scene.configure    → modify scene parameters (Partial<SceneSpec>)
  scene.addCharacter → place character in scene
  scene.addProp      → place prop in scene

  light.adjust       → modify lighting (Partial<LightSpec>)
  light.setIBL       → set environment map

  effect.bind        → bind effect to EmotionArc (EmotionBinding)
  effect.configure   → modify effect parameters

  voice.generate     → TTS generation (text + VoiceSpec → audio + visemes)

  camera.preset      → apply camera preset (shot type → keyframes)
  camera.keyframe    → add camera keyframe at time

  emotion.set        → set EmotionArc value at time
  emotion.curve      → set EmotionArc curve segment

  memory.anchor      → create MemoryAnchor
  memory.discover    → unlock discovery fragment

  binding.character  → bind script character → CharacterBundle
  binding.scene      → bind script scene heading → SceneSpec

  Each operation: domain + type + payload + before (for undo).
  All domains share one OperationHistory → unified cross-domain undo/redo.
```

#### AIWorkflow (Multi-Step AI Orchestration)

```
AI intent → multiple operations that must succeed atomically:

  AIWorkflow {
    steps: AIWorkflowStep[],
    atomic: boolean,            // all-or-nothing
    rollbackOnFailure: boolean
  }

  AIWorkflowStep {
    id: string,
    operation: EditOperation,
    dependsOn: string[],        // DAG dependencies
    condition?: string,         // conditional execution
    retryCount?: number
  }

  Example: "Alice anxiously says a line"
    step 1: expression.set('anxious')      dependsOn: []     ← parallel
    step 2: voice.generate(text, voice)    dependsOn: []     ← parallel
    step 3: motion.apply('fidget')         dependsOn: []     ← parallel
    step 4: camera.preset('close_up')      dependsOn: [1]    ← after expression
    step 5: light.adjust(temperature: -500) dependsOn: [4]   ← after camera

  Workflow Executor:
    1. Topological sort steps (DAG)
    2. Execute independent steps in parallel
    3. Execute dependent steps sequentially
    4. Any failure + atomic=true → rollback all
    5. All success → merge into single batch EditOperation → commit
    6. Undo reverses entire batch

  MCP tool integration:
    Tools declare resultType: 'AIEditResult' + operationDomains[].
    Agent calls tool → AIEditResult → Workflow Executor auto-applies.
    Zero per-tool custom application logic.
```

#### AI Edit Architecture

```
  User intent
      ↓ LLM (Level 1)
  SceneDirective { character, emotion, dialogue, camera, mood }
      ↓ AI Workflow Generator (Level 2, deterministic)
  AIWorkflow { steps: [expression, voice, motion, camera, light] }
      ↓ Workflow Executor
  Topological sort → parallel execute → validate → commit
      ↓ Operation Apply Layer (Level 4)
  EditOperation → route by domain:
    timeline  → applyOperation(projectData, op)
    canvas    → canvasOperationStore.apply(op)
    expression → puppetService.setExpression(op)
    scene     → sceneService.configure(op)
    light     → sceneService.setLight(op)
    camera    → timelineService.setCameraKeyframe(op)
    voice     → audioService.addTTSResult(op)
    emotion   → emotionArcController.setValue(op)
    memory    → playerSave.createAnchor(op)
    binding   → storyBinding.setCharacter(op)
      ↓
  Unified OperationHistory (all domains, cross-domain undo/redo)
```

### AI Perceive-Edit-Verify Loop (Cross-Stage)

```
Problem: AI currently "edits blind" — doesn't see the current state, doesn't
verify the result. User must manually iterate ("too dark" → "still too dark" → ...).

Solution: Closed-loop with perception, planning, execution, and verification.
```

#### Perception System

```
Two perception paths, used together:

  Path A — Structured Perception (milliseconds, no ML):
    Read data directly:
      timeline → ProjectData → tracks, elements, keyframe values
      character → PuppetParameters → current parameter values
      scene → SceneSpec → light/camera/effect parameters
      audio → FFmpeg → waveform, spectrum, loudness
      EmotionArc → current value and trend

  Path B — Visual Perception (seconds, requires VLM):
    Render current frame → screenshot → send to VLM:
      gpu_export_pipeline.render_frame(time) → JPEG
      → Claude/GPT-4V: "Describe mood, composition, lighting, issues"

  Output: PerceptionContext {
    structured: { timeline stats, character params, scene params, audio stats },
    visual: { description, mood, composition, colorPalette, issues, aestheticScore },
    temporal: { previousShot comparison, continuity issues },
    narrative: { script requirements, expected emotion, story beat }
  }

  Strategy: structured first (fast values) → visual when deeper understanding needed.
```

#### Five-Level Validation Pipeline

```
After each edit, results pass through progressive validation:

  Level 1 — Technical (ms, no ML):
    Parameter range checks, format completeness, reference integrity, render feasibility.
    → Pass/Fail + error details.

  Level 2 — Numerical (ms, no ML):
    Before/after value comparison, target achievement check, extreme value detection.
    → Modification summary + anomaly warnings.

  Level 3 — Visual (seconds, render + VLM):
    Render modified frame → VLM analysis: "Does it match 'melancholic' description?"
    Before/after screenshot comparison. Aesthetic score delta.
    Issue detection: "Character face too dark to see expression."
    → Visual assessment report + suggested fixes.

  Level 4 — Consistency (seconds, context-aware):
    Compare with previous/next shots (color temperature diff < 500K?).
    Character appearance consistency (CLIP embedding similarity > 0.8).
    Style consistency with project Aesthetic Memory.
    → Consistency score + deviation items.

  Level 5 — Narrative (seconds, LLM):
    Visual mood vs script requirement ("script says anxious, does frame convey it?").
    Character performance vs persona ("Alice wouldn't smile here").
    Pacing vs narrative beat (climax shouldn't feel slow).
    → Narrative match score + mismatches.

  Scoring and auto-refinement:
    score >= 0.8: auto-pass (result satisfactory)
    score 0.5-0.8: auto-refine (apply suggestedFix, re-verify, max 3 iterations)
    score < 0.5: report to user (AI uncertain, request human confirmation)
```

#### Complete Perceive-Edit-Verify Flow

```
  User: "Make this shot more melancholic, Alice should be more anxious"
      ↓
  Step 1 PERCEIVE:
    Structured: temperature 5500K, brightness 0.8, expression neutral, emotion 0.2
    Visual (VLM): "Bright café, character looks calm, warm tones"
    Narrative: Script requires "anxious" → current "calm" = mismatch
      ↓
  Step 2 PLAN:
    Gap: warm+bright+neutral → need cold+dim+anxious
    → AIWorkflow: expression.set + emotion.set + light.adjust + effect + camera (5 steps)
      ↓
  Step 3 EDIT:
    Execute AIWorkflow → all 5 operations succeed → batch commit
      ↓
  Step 4 VERIFY:
    L1 technical: ✅ all params in range
    L2 numerical: ✅ temperature -1300K, brightness -0.3
    L3 visual: VLM → "Dark café, character frowning, cold tones, vignette focus"
               ⚠️ "Character face too dark, expression details unclear"
               score = 0.75 → needs refinement
    L4 consistency: ✅ color diff with previous shot acceptable
    L5 narrative: ✅ "Frame conveys anxiety, matches script"
      ↓
  Step 5 REFINE:
    Apply suggestedFix: brightness +0.1 (face slightly brighter)
    Re-verify: score = 0.88 → ✅ pass
      ↓
  Step 6 REPORT:
    "Adjusted to melancholic atmosphere:
     - Temperature 5500K → 4200K (cooler)
     - Brightness reduced 30%, vignette added
     - Alice expression → anxious, camera → close-up
     [Before] [After] comparison screenshots
     Aesthetic score: 7.2 → 8.4"

  Reuses existing infrastructure:
    Quality Assessment (neko-agent) → upgrade to Level 3-4 validators
    CLIP scoring (runtime-ml) → style consistency detection
    gpu_export_pipeline.render_frame() → screenshot for visual perception
    engine probe API → structured metadata perception
```

### Progressive ECS Expansion

```
Stage 1: runtime-puppet (2D animation) + runtime-scene (3D viewing)
Stage 2: + runtime-xr (spatial tracking, stereoscopic)
Stage 3: + runtime-stage (scene orchestration, interaction state machine)
Stage 4: + runtime-game (physics, gameplay, networking)
Stage 5: + runtime-sim (deterministic physics, sensors, parallel env)
Stage 6: + creative-kernel (world state, multi-agent scheduling, consistency)
Stage 7: + reality-kernel (perception, physical world model, actuation)
```

### Progressive Rendering Pipeline

```
Stage 1: 2D compositing + 3D model preview + video encode
Stage 2: + stereoscopic rendering + 360° projection
Stage 3: + real-time scene compositing + video segment switching
Stage 4: + particle system + shadow maps + post-processing
Stage 5: + headless batch rendering + multi-pass sensor output
Stage 6: + multi-agent coordinated rendering + style-consistent generation
Stage 7: + real-time perception overlay + digital twin sync + AR compositing
```

### Data Flow Evolution

```
Stage 1: Script → Assets → Timeline → Video (linear)
Stage 2: Script → Assets → Spatial Scene → XR Experience (spatial)
Stage 3: Script → Assets → Interactive Scene → Branching Narrative (interactive)
Stage 4: Script → Assets → Game World → Playable Game (real-time)
Stage 5: Config → Procedural World → Simulation → Training Data (generative)
Stage 6: Intent → World Kernel → Agent Ensemble → Coherent Creative Output (autonomous)
Stage 7: Sensors → World Model → Plan → Act → Perceive → Update (closed-loop)
```

### Progressive Intelligence

```
Stage 1: AI as tool (generate image, transcribe audio)
Stage 2: AI as assistant (suggest layout, auto-LOD)
Stage 3: AI as collaborator (dynamic dialogue, adaptive narrative)
Stage 4: AI as designer (level generation, behavior tuning)
Stage 5: AI as learner (world model training, sim-to-real)
Stage 6: AI as creative partner (multi-agent ensemble, aesthetic memory, world state)
Stage 7: AI as world agent (perceive, understand, plan, act in physical reality)
```

---

## Implementation Priority

```
Now:        Stage 1 completion (puppet, story-agent pipeline)
2026 H2:    Stage 3 foundation (runtime-stage, ScriptEngine, basic interactivity)
2027 H1:    Stage 3 full (DynamicDialogue, export runtime, butterfly system)
2027 H2:    Stage 2 exploration (XR preview, spatial audio)
2028+:      Stage 4 selective (physics, visual scripting — based on demand)
2029+:      Stage 5 prototype (deterministic sim, sensor rendering)
2030+:      Stage 6 foundation (creative world kernel, multi-agent ensemble)
Research:   Stage 7 exploration (perception engine, digital twin, reality bridge)
```

### Why This Order (3 before 2, 6 before 7)

```
Stage 3 (Interactive Cinema) before Stage 2 (XR):
  - Builds directly on Stage 1 assets and workflow
  - Lower technical risk (2D/video vs spatial computing)
  - Larger addressable market (interactive content vs XR devices)
  - AI differentiation is strongest here (dynamic dialogue, procedural narrative)
  - XR hardware ecosystem still maturing

Stage 6 (Creative AIOS) before Stage 7 (Reality AIOS):
  - Creative worlds are fully controlled (no sensor noise, no safety risk)
  - World State Manager battle-tested in fiction before applied to reality
  - Multi-agent coordination proven in low-stakes domain first
  - Creative domain is the product's core identity
  - Reality AIOS requires hardware ecosystem maturity (sensors, robots, AR glasses)
```

---

## Feasibility Analysis

### Summary Matrix

```
Stage  │ Tech Feasibility │ Team Delta │ Market      │ Ext. Dependency │ Verdict
───────┼─────────────────┼───────────┼────────────┼────────────────┼──────────────
1 Video IDE     │ ★★★★★  │ Current    │ Validated  │ Low            │ ✅ Go
2 XR IDE        │ ★★★★   │ +2-3      │ Maturing   │ Med (hardware) │ ⚠️ Wait
3 Interactive   │ ★★★★   │ +1-2      │ Validated  │ Low            │ ✅ Go next
4 Game Engine   │ ★★★    │ +5-8      │ Red ocean  │ Medium         │ ⚠️ Narrow scope
5 Simulation    │ ★★★    │ +5-10     │ Growing    │ High (compute) │ ⚠️ Partner
6 Creative AIOS │ ★★     │ +10-15    │ Unproven   │ High (models)  │ ❓ Research
7 Reality AIOS  │ ★      │ +20-30    │ Unproven   │ Very high      │ ❓ Vision
```

### Stage 1: AI Story-Video IDE — ✅ Confirmed Feasible

```
Tech assessment:
  ✅ engine-kernel (wgpu + FFmpeg) — implemented
  ✅ runtime-puppet (MOC3 skeletal animation) — in progress
  ✅ neko-agent (AI generation pipeline) — implemented
  ✅ neko-story / neko-cut / neko-canvas — implemented

Risk points:
  ⚠️ Puppet MOC3 compatibility — Live2D format reverse-engineering completeness
  ⚠️ AI generation quality bounded by upstream models (Sora/DALL-E not self-owned)
  ⚠️ Real-time rendering + encoding performance bottleneck

Mitigation:
  - Puppet: inox2d community has mature implementation, reusable
  - AI models: Provider abstraction layer exists, can switch providers
  - Performance: Rust + GPU compute ceiling is high enough

Verdict: Core product, no blocking risks
```

### Stage 2: AI XR IDE — ⚠️ Feasible, Timing-Dependent

```
Tech assessment:

  Existing foundation:
    ✅ runtime-scene (bevy_ecs + glTF) — 3D scene basics
    ✅ engine-kernel (wgpu) — rendering pipeline
    ✅ runtime-device — device abstraction

  New requirements:
    🔨 OpenXR integration — wgpu + OpenXR bindings exist but immature
    🔨 Stereoscopic rendering — dual-eye + parallax, wgpu can do it but significant work
    🔨 Spatial audio — open-source HRTF libs exist (oddio/kira)
    🔨 Hand tracking — depends on hardware SDK (Meta/Apple)

  Real risks:
    ❌ XR hardware fragmentation — Meta Quest / Apple Vision Pro / others, APIs not unified
    ❌ XR preview in VSCode — Webview sandbox cannot directly access OpenXR
       Solution: engine sidecar renders, streams to webview (existing pattern)
    ❌ Market timing — Vision Pro low penetration, Quest skews gaming not creation

  Mitigation:
    - Start with 360° video editing (no XR hardware needed, existing market)
    - XR preview as optional feature, not critical path
    - Wait for OpenXR ecosystem maturity before deep investment

  Verdict: Technically feasible but market not ready, Stage 3 takes priority
```

### Stage 3: AI Interactive Cinema IDE — ✅ Feasible, Controlled Increment

```
Tech assessment (runtime-stage components):

  StageDirector (scene orchestration):
    ✅ Fully feasible — combines runtime-puppet + runtime-scene, command-driven
    Complexity: Medium | Estimate: 2-3 months

  ScriptEngine (script engine):
    ✅ Fully feasible — YAML parsing + state machine, not Turing-complete, bounded complexity
    Complexity: Medium | Estimate: 1-2 months

  VideoSegmentPlayer (video segment switching):
    ✅ Fully feasible — FFmpeg seek + double-buffer decode, engine-kernel has foundation
    Risk: Seamless switching < 100ms requires careful preloading strategy
    Complexity: Medium | Estimate: 1-2 months

  DynamicDialogue (LLM dynamic dialogue):
    ✅ Fully feasible — neko-agent already has LLM calling, add character persona constraints
    Risk: Latency (LLM inference 1-3s), needs streaming + placeholder animation
    Complexity: Low-Medium | Estimate: 1 month

  ButterflySystem (butterfly effect):
    ✅ Fully feasible — directed weighted graph + delayed triggers, data structure problem
    Complexity: Low | Estimate: 2-3 weeks

  QTEHandler:
    ✅ Fully feasible — timer + input events + UI overlay
    Complexity: Low | Estimate: 1-2 weeks

  ExportRuntime (standalone export):
    ⚠️ Challenging — runtime-stage compiled to WASM
    Risk: wgpu WASM support exists but performance/compatibility imperfect
    Mitigation: Web version degrades to Canvas2D + video tag; Desktop uses Tauri
    Complexity: High | Estimate: 2-3 months

  Total increment: ~10-12 months (1-2 people)
  Biggest risk: WASM export performance and compatibility
  Mitigation: Phased — VSCode preview first (zero risk), export later

  Verdict: Clear increment, controlled risk, highest ROI next step
```

### Stage 4: Game Engine + Game IDE — ⚠️ Conditionally Feasible

```
Tech assessment:

  Reusable:
    ✅ bevy_ecs — already ECS architecture, natural extension
    ✅ wgpu — rendering pipeline exists
    ✅ runtime-stage — interaction foundation

  Build from scratch:
    🔨 Physics integration — Rapier (Rust) is mature and usable
       Complexity: Medium | bevy_rapier community reference exists
    🔨 Collision detection — included in Rapier
    🔨 Particle system — GPU compute shader, wgpu can implement
       Complexity: Medium-High
    🔨 Visual scripting — node editor + interpreter
       Complexity: High | this is the largest engineering effort
    🔨 Pathfinding/NavMesh — Rust open-source exists (recast-rs)
       Complexity: Medium
    🔨 Network sync — client prediction + rollback
       Complexity: Very High

  Real risks:
    ❌ Competitive landscape — Godot (open-source free) / Unity / Unreal are mature
    ❌ Ecosystem moat — game engine value is 70% ecosystem (plugins/tutorials/community)
    ❌ Engineering volume — a usable game engine = dozens of person-years
    ❌ Rendering quality — wgpu reaches indie game level, but can't chase UE5

  Differentiation:
    ✅ AI-native — AI generates levels/NPCs/dialogue, other engines bolt this on
    ✅ Declarative — targets non-programmers, low-code
    ✅ Narrative-driven — from script to game, Stage 1-3 extension

  Recommended strategy:
    Don't build general game engine — build "interactive narrative game engine" (narrow but deep)
    Integrate Rapier physics + simple visual scripting
    Don't build multiplayer networking (cut the most complex 30% of requirements)
    Position: AI-native Ren'Py + RPG Maker replacement

  Verdict: Narrow version feasible, general version not feasible
```

### Stage 5: Simulation Engine + World Model Training — ⚠️ Needs Partnership

```
Tech assessment:

  Reusable:
    ✅ bevy_ecs + Rapier — deterministic physics simulation
    ✅ wgpu — sensor rendering (RGB/depth/segmentation)
    ✅ runtime-ml (ONNX) — inference side

  Build from scratch:
    🔨 Deterministic simulation — fixed timestep + deterministic RNG + state serialization
       Complexity: Medium | bevy_ecs supports fixed-step scheduling
    🔨 Sensor simulation — multi-pass rendering (RGB + depth + semantic)
       Complexity: Medium | wgpu multi render target achievable
    🔨 Gym API — step/reset/observe interface
       Complexity: Low
    🔨 Massive parallelism — thousands of env instances on GPU cluster
       Complexity: Very High

  Real risks:
    ❌ Compute requirements — training world models needs massive GPU (A100/H100 clusters)
       This is a resource problem, not a product problem
    ❌ Competitor strength — NVIDIA Isaac Sim / DeepMind MuJoCo / Meta Habitat
       All have hundreds of engineers + own hardware
    ❌ Rendering fidelity — sim-to-real transfer demands photorealism
       wgpu indie-game-grade ≠ photorealistic
    ❌ Domain knowledge — robotics/AV/embodied AI each have independent domain expertise

  Differentiation:
    ✅ Creative toolchain → simulation data (Stage 1-4 assets directly into simulation)
    ✅ AI-generated scenes → domain randomization (neko-agent generates training scene variants)
    ✅ Interactive cinema scenes → embodied AI environments (Stage 3-4 scene reuse)

  Recommended strategy:
    - Don't self-build training infrastructure (use cloud GPU / partners)
    - Focus on "creative assets → simulation data" pipeline (unique value)
    - Provide Gym-compatible API, let researchers use their own training frameworks
    - Partner with robotics/AV teams, don't self-build application layer

  Verdict: Pipeline portion feasible, platform portion needs external partnership/funding
```

### Stage 6: Creative AIOS — ❓ Research-Grade

```
Tech assessment:

  Feasible parts (engineering problems):
    ✅ World State Manager — database + query engine, engineering-solvable
    ✅ Multi-Agent Scheduling — DAG scheduling + message passing, mature pattern
    ✅ Agent Protocol — interface definitions + IPC, standard software engineering
    ✅ Aesthetic Memory storage layer — vector DB + preference model

  Uncertain parts (AI capability boundaries):
    ❓ Intent Interpreter depth
       "Make this scene more melancholic" → needs to understand "melancholy"
       across visual/audio/narrative dimensions
       Current LLMs achieve ~70% — simple intents yes, subtle emotions difficult
       Risk: may need domain-fine-tuned models

    ❓ Cross-domain Consistency Engine
       Validating "character's outfit matches previous scene" requires
       visual understanding + narrative tracking simultaneously
       Current multimodal models can do basic version, precise version needs breakthroughs
       Risk: depends on vision-language model advancement

    ❓ Director Agent aesthetic judgment
       "Is this shot good enough?" — requires aesthetic judgment capability
       Current AI scoring aligns with average human preference, but gaps vs professional aesthetics
       Risk: may need RLHF + domain expert feedback loops

    ❓ Character Agent personality consistency
       Maintaining character personality without drift across long conversations
       Current LLM context window limits → needs external personality anchoring mechanism
       Feasible but requires careful engineering (persona embedding + guardrails)

  Critical external dependencies:
    ❌ Foundation model capability — Stage 6 ceiling = underlying LLM/multimodal model ceiling
       If GPT-6 / Claude 5 tier models emerge → feasibility dramatically increases
       If model development stagnates → Stage 6 limited to engineering-level scheduling
    ❌ Inference cost — multi-agent parallel = massive API calls
       Current: ~$0.01/request → one scene could cost $1-10
       Trend: inference cost dropping fast (10x per 18 months)
       2030: possibly ~$0.001/request → economically viable
    ❌ Latency — user says one thing → 5 agents process in parallel → how long to wait?
       Current: serial 5-15s, parallel 3-5s
       Needed: < 2s interactive response
       Trend: inference acceleration (speculative decoding, smaller specialized models)

  Recommended strategy:
    - 2026-2028: Gradually introduce multi-agent collaboration in neko-agent (2-3 agents)
    - 2028-2029: World State Manager + Consistency Engine prototype
    - 2030+: Evaluate whether model capabilities support full Creative AIOS
    - Incremental: don't wait for "OS completion" to ship — each component has standalone value

  Verdict: Engineering framework feasible, AI capability is the real bottleneck,
           strongly coupled with foundation model development
```

### Stage 7: Reality AIOS — ❓ Vision-Grade

```
Tech assessment:

  Serious feasibility obstacles:

    1. Perception robustness
       Indoor controlled environment → feasible (structured scenes, limited objects)
       Outdoor uncontrolled environment → current tech insufficient (occlusion/lighting/dynamics)
       Industrial environment → feasible but needs domain specialization (vertical solutions exist)

    2. World model precision
       "What happens if I push this cup?" — requires physical intuition
       Current: VLMs have basic physical understanding, but unreliable
       Needed: sim-to-real + real data training (Stage 5 output)

    3. Real-time requirements
       Perception + understanding + planning + execution < 100ms (robot control)
       Current LLM: 1-5s latency → only non-real-time decisions
       Real-time path: small models (edge inference) + large models (planning) — layered

    4. Safety
       Physical world errors are irreversible (unlike creative worlds with Ctrl+Z)
       Needs: formal verification / safety envelopes / hardware emergency stops
       Not a software problem — a systems engineering problem

    5. Hardware ecosystem
       AR glasses: still early in 2026 (resolution/FOV/battery/price)
       Robots: expensive, general manipulation unsolved
       Sensors: LiDAR prices dropping but not yet consumer-grade

    6. Data and privacy
       Continuous physical environment perception = continuous privacy data collection
       GDPR / local regulations → strict limitations
       Needs: all edge processing, no cloud upload

  Relationship to Stage 6:
    Stage 7 engineering framework is highly isomorphic with Stage 6:
      World State Manager → World Model Manager (same codebase)
      Creative Scheduler → Reality Scheduler (same scheduling)
      Agent Protocol → Agent Protocol (identical)
    Differences are all in "interface layer" (perception/actuation)
    and "constraint layer" (physical laws/safety)

  True blockers:
    ❌ Hardware ecosystem — outside our control
    ❌ Safety certification — entering physical world requires compliance
    ❌ Foundation AI capability — general embodied intelligence is open research

  Most likely realization path:
    Don't build general Reality AIOS → Build "Virtual Production Reality Bridge"
    - Bridge virtual and physical in film/creative scenarios (controlled environments)
    - On-set tracking + digital twin + AR assistance → already market-validated (Unreal virtual production)
    - This is a natural extension of Stage 6 Creative AIOS
    - Does not require solving general embodied intelligence

  Verdict: General version is 10+ year vision, vertical version (virtual production) possibly 5 years
```

### Overall Assessment

```
Definite Go:
  Stage 1 ████████████████████  Core product, must complete
  Stage 3 ██████████████████    Highest ROI next step, controlled increment

Timing-Dependent:
  Stage 2 ██████████████        Wait for XR hardware maturity
  Stage 4 ████████████          Narrow version (interactive narrative games) only

Exploratory:
  Stage 5 ████████              Pipeline self-built, platform via partnership
  Stage 6 ██████                Incremental introduction, sync with foundation model capability
  Stage 7 ████                  Vertical scenario (virtual production) first

The biggest variable: foundation AI model development pace
  - If GPT-6 / Claude 5 level breakthrough by 2027 → Stage 6 advances to 2028
  - If model development plateaus → Stage 6/7 deferred, focus on 1-4
  - Recommendation: build engineering framework now (World State / Agent Protocol),
                    fill in AI capabilities when models are ready
```

### Risk Mitigation Strategy

```
For each stage, a "minimum viable version" that delivers value independently:

Stage 1: Already the product — ship and iterate
Stage 2: 360° video editing (no XR hardware needed)
Stage 3: Visual novel mode only (no video segments, no QTE)
Stage 4: Rapier physics + .nkstory scripting (no visual scripting, no networking)
Stage 5: Gym API + basic sensor rendering (no massive parallelism)
Stage 6: 2-3 agent collaboration + World State (not full OS)
Stage 7: On-set AR continuity assistant (one vertical use case)

Each minimum version:
  - Delivers standalone user value
  - Validates the technical approach
  - Generates revenue or user feedback
  - Naturally extends toward the full vision
```

---

## VSCode as Host IDE — Capabilities and Limits

### Per-Stage VSCode Assessment

```
Stage 1 (Video IDE):        ✅ Fully supported (validated, 14 extensions running)
Stage 2 (XR IDE):           ⚠️ Creation ✅, XR preview ❌ (needs external window)
Stage 3 (Interactive):      ⚠️ Creation ✅, playback experience ❌ (needs external window)
Stage 4 (Game):             ⚠️ Editing ✅, play-in-editor ❌ (needs external window)
Stage 5 (Simulation):       ✅ Fully supported (headless, no GUI needed)
Stage 6-7 (AIOS):           ✅ Fully supported (agent layer, not GUI-intensive)
```

### VSCode Hard Limits

```
1. Webview Sandbox:
   No Node.js, no VSCode API, no hardware direct access, no cross-webview comms.
   Solved: All proxied through Extension Host (postMessage / commands).

2. Single-Window Layout:
   Editor area (splittable) + sidebar (fixed) + panel (bottom) + activity bar.
   Cannot: pop-out windows, multi-monitor extend, floating panels.
   Impact: Timeline + preview + properties compete for space. No dual-screen.

3. No Native GPU Access:
   Webview has WebGL/WebGPU but sandboxed. Cannot create wgpu Surface directly.
   Cannot interface with OpenXR from within VSCode.
   Solved: Engine sidecar renders → H.264 stream → webview decode (30-100ms latency).

4. Performance Ceiling:
   Extension Host: single-thread Node.js.
   Webview: Chromium process (independent but VSCode-scheduled).
   60fps achievable. 90fps (VR requirement) not achievable in webview.

5. Cannot Publish as Standalone App:
   Extensions only run inside VSCode. Cannot package as branded desktop app.
   Consumers won't install VSCode to watch interactive content.
   → This is why ExportRuntime exists as a separate deliverable.
```

### Solution: VSCode Creation + External Preview

```
Architecture (already partially in place):

  ┌─────────────────────────────────┐
  │  VSCode (Creation Environment)   │
  │                                  │
  │  Edit: script/timeline/scene/    │
  │        character/AI              │
  │  Light preview: webview 30fps    │
  │  Export: package to standalone   │
  └──────────────┬──────────────────┘
                 │ "Preview" / "Play" button
                 ▼
  ┌─────────────────────────────────┐
  │  External Preview (separate)     │
  │                                  │
  │  Path A: Electron window         │
  │    Independent window / fullscreen / multi-monitor │
  │    WebGPU direct render / 60-120fps               │
  │    No keyboard conflict with VSCode               │
  │    Same code as ExportRuntime                      │
  │                                                    │
  │  Path B: System browser          │
  │    localhost:port → browser tab   │
  │    WebGPU rendering              │
  │    Simplest implementation       │
  │                                  │
  │  Path C: Native wgpu window      │
  │    Engine sidecar opens window   │
  │    Best performance              │
  │    Required for OpenXR           │
  └─────────────────────────────────┘

  Communication: VSCode Extension ↔ External Preview via WebSocket (host-http exists).
  Hot-reload: creation-side edits → preview auto-updates.

  Key insight: ExportRuntime Electron code = Preview window code = zero extra development.
```

### IDE Evolution Roadmap

```
2026 (Stage 1):
  Pure VSCode extensions. Webview preview sufficient for video editing.
  No additional investment in IDE infrastructure.

2027 (Stage 3):
  + Electron external preview window for interactive cinema playback.
  "Preview" button launches standalone window.
  Same Electron app = ExportRuntime = preview tool.

2028+ (if branded app needed):
  Option: Code OSS / Theia customization.
  Custom layout (timeline pinned bottom, preview pinned right).
  Custom branding (splash screen, icons, name).
  Extension-compatible → existing 14 extensions work without modification.
  Decision based on user feedback, not preemptive.

Principle: VSCode is an excellent creation environment but not a consumption environment.
The fix is not replacing VSCode but adding an Electron preview window alongside it.
```

---

## AI Evolution Impact and Extensible Scenarios

### Why Stronger AI Makes neko MORE Valuable (Not Less)

```
Counter-intuitive: AI capability growth does not obsolete neko — it amplifies it.

Reason 1 — AI output is evolving from pixels to structured data:
  2024: Sora outputs MP4 (flat pixels, uneditable)
  2028: AI will output SceneSpec + CharacterBundle + MotionData (structured)
  → Who consumes structured AI output? → neko (editor + runtime)
  → Analogy: Copilot generates code → VSCode didn't die, it became more essential
             AI generates content → Creative IDE becomes more essential

Reason 2 — "Last mile" always needs human judgment:
  AI generates 90%: backgrounds, rough motion, music, voice
  Human refines 10%: "0.3 seconds slower here", "more subtle expression",
                     "wrong transition", "character should stand left"
  10% refinement = 90% of quality difference
  → neko evolves from "creation tool" to "AI output refinement tool"

Reason 3 — Interactive content CANNOT be end-to-end generated:
  Linear video: AI might generate end-to-end (future)
  Interactive narrative: AI NEVER end-to-end, because:
    Interaction = runtime response to user input (not pre-rendered)
    CharacterAgent = realtime dialogue (different every time)
    MemoryAnchor = persistent state (needs save system)
    ButterflySystem = causal graph (needs runtime engine)
  These are RUNTIME problems, not GENERATION problems.
  → AI generates content, neko RUNS it.
```

### Value Transformation Over Time

```
                        AI Weak (2024)   AI Medium (2027)   AI Strong (2030)
Asset Generation         Human+AI assist  AI+human review    AI fully auto
  (images/video/audio)   ← value decreasing — AI replaces manual generation

Asset Standards          Human defines    Human defines      AI+human defines
  (SceneSpec/EffectSpec) ← value constant — whoever generates needs standard formats

AI Orchestration         Simple calls     Multi-agent        Autonomous
  (SceneAssembler)       ← value increasing — stronger AI needs more complex orchestration

Refinement/Editing       Heavy manual     Light refinement   Minimal refinement
  (timeline/curves)      ← value transforms — from "create" to "quality control"

Interactive Runtime      None             Basic interactive  Deep interactive
  (runtime-stage)        ← value increasing — AI-generated content needs runtime

Character AI             Simple dialogue  Personalized       Autonomous behavior
  (CharacterAgent)       ← value increasing — smarter characters need richer framework

Memory/State             None             Basic saves        Deep memory
  (MemoryAnchor)         ← value increasing — more personalization needs more state

Render Engine            Required         Required           Required
  (gpu_export_pipeline)  ← value constant — AI does not render pixels

Publishing               Manual export    One-click          AI auto-publish
  (ExportRuntime)        ← value constant — products need packaging and distribution

Trajectory: neko evolves from "creation tool" → "creation platform" → "creative OS"
  2024: Users operate tools manually
  2027: AI does most generation, users review + refine + orchestrate
  2030: AI agents run ON neko, users express intent only
```

### Extensible Application Scenarios

```
The core engine layer (built today) enables far more than video editing.
Each new scenario reuses the same infrastructure with a thin adaptation layer.

Core Engine (built once, reused everywhere):
  Rendering: gpu_export_pipeline + Three.js Web Viewer
  AI: CharacterAgent + SceneAssembler + EmotionArc
  Interactive: runtime-stage + ScriptEngine + MemoryAnchor
  Assets: 8+3 standards + 7 format adapters
  Mocap: SemanticMotion + RetargetMap
  Publishing: ExportRuntime + Batch API + headless CLI
```

#### Scenario: Education / Training

```
AI teacher + interactive courseware + virtual experiments.
  CharacterAgent → AI teacher (teaching persona + remembers student progress)
  DynamicDialogue → student asks → AI explains (personalized)
  ScriptEngine → courseware branching (correct→next, wrong→explanation)
  MemoryAnchor → learning records (which concepts mastered)
  ExpressionSpec → teacher expressions (encouragement/hint/thinking)
  SceneSpec → virtual classroom / laboratory scenes
  New: Knowledge graph binding + assessment system (data layer, not engine)
  Creation: VSCode ✅ | Consumption: Web export (ExportRuntime) ✅
```

#### Scenario: Virtual Streamer / AI VTuber

```
AI virtual host with 24/7 autonomous streaming.
  CharacterAgent → streamer persona + realtime chat response
  VoiceSpec + TTS → realtime voice
  ExpressionSpec → expression sync
  neko-live → VRM/Live2D drive + recording
  New: Chat platform API (Bilibili/Twitch) + RTMP push (Phase 5.3) + auto topic gen
  Creation: VSCode ✅ | Streaming: engine sidecar ✅
```

#### Scenario: Digital Human Customer Service

```
Enterprise website embedded AI avatar concierge.
  CharacterBundle → corporate image character
  CharacterAgent → customer service persona + FAQ knowledge base
  VoiceSpec → multilingual TTS
  Web Viewer (Three.js/PixiJS) → embedded in webpage
  DynamicDialogue → realtime conversation
  New: RAG knowledge base integration + human handoff
  Creation: VSCode ✅ | Consumption: <neko-avatar> Web Component ✅
```

#### Scenario: Audio Drama / Audiobook

```
Novel → AI multi-character audio drama with character performance.
  StoryBinding → novel characters → CharacterBundle
  VoiceSpec → unique voice per character
  EmotionArc → ambient music sync
  SceneAssembler → chapter auto-assembly
  neko-audio → audio post-production
  New: Novel format import (TXT/EPUB → Fountain-like) + auto dialogue extraction
  Creation: VSCode ✅ | Output: audio files ✅
```

#### Scenario: Manga / Webtoon Generation

```
Script → AI generates panels → auto layout → manga.
  neko-story → script
  neko-canvas → panel layout / storyboard
  neko-agent → AI image generation (per-panel)
  StoryBinding → character visual consistency (IP-Adapter)
  CameraDirector → cinematic language → manga panel angles
  New: Manga layout engine (panels/bubbles/speed lines) + PDF/WebToon export
  Creation: VSCode ✅ | Output: PDF/image sequence ✅
```

#### Scenario: Music Video / Visualization

```
Music → AI generates matching visuals → character dance → MV.
  neko-audio → beat detection / spectrum analysis
  neko-cut → timeline sync
  SemanticMotion → dance motion (BVH import from Mixamo)
  EmotionArc → music energy → visual sync
  EffectSpec → beat-synced effects (flash/shake/color pulse)
  New: Audio analysis → auto EmotionArc + beat-synced motion
  Creation: VSCode ✅ | Output: MP4 ✅
```

#### Scenario: Brand Content Factory

```
Brand template + AI batch generates personalized videos.
  .nkv template variables ({{product}}, {{spokesperson}})
  Batch Render API (1 template × N data rows)
  CharacterBundle → brand spokesperson character
  headless CLI export → CI/CD integration
  New: Template marketplace + data source connectors (CSV/API)
  Creation: VSCode ✅ | Batch: headless CLI ✅
```

#### Scenario: Social Avatar

```
User creates AI virtual self for social platforms.
  CharacterBundle → user appearance
  CharacterAgent → AI personality (mimics user)
  VoiceSpec → voice cloning
  Web Viewer → embed in social platform
  New: Self-service character creation UI (Web, not VSCode) + social platform SDKs
  Creation: VSCode (or Web) | Consumption: social platform embed ✅
```

### Extensibility Boundary

```
CAN extend (no architectural bottleneck):
  ✅ Any "AI + character + narrative + interaction" scenario
  ✅ Any "template + data → batch content" scenario
  ✅ Any "mocap → character performance → video/interactive" scenario
  ✅ Any deliverable that runs on Web

CANNOT extend (architectural limits):
  ❌ AAA game development (rendering ceiling + physics complexity)
  ❌ Professional film post-production (color science depth + EDL/ACES)
  ❌ CAD / engineering design (completely different domain)
  ❌ Pure social / communication platform (not a tool problem)

Boundary line:
  "AI + character + narrative" → neko's territory, infinitely extensible
  "Non-narrative professional depth tools" → not neko's territory

Each new scenario's incremental cost:
  Core engine: 0 (reuse)
  Scenario adaptation: person-weeks to person-months (thin layer)
```

---

## Competitive Positioning

```
Stage 1: vs Premiere/DaVinci        → AI-native, integrated screenplay-to-export
Stage 2: vs Unity XR/Meta SDK       → Creator-friendly, AI-assisted spatial authoring
Stage 3: vs Ren'Py/Twine            → AI dynamic content, professional-grade visuals
Stage 4: vs Godot/RPG Maker         → AI-native, declarative, low-code game creation
Stage 5: vs NVIDIA Isaac/Habitat    → Integrated creation-to-simulation pipeline
Stage 6: vs No direct competitor    → AI operating system for creative worlds
Stage 7: vs Embodied AI platforms   → Unified creative+reality intelligence

Core thesis across all stages:
  AI-native + declarative/low-code + integrated pipeline > specialized point tools

Endgame thesis (Stage 6-7):
  The system that best understands fictional worlds (narrative, aesthetics, emotion)
  is uniquely positioned to understand and augment the real world —
  because both require maintaining coherent world state under uncertainty.
```
