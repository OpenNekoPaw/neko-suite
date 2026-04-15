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

**Status**: Future — requires Stage 1 maturity

**Definition**: Extend the creative workspace to spatial content — AR, VR, and mixed reality experiences.

### Delta from Stage 1

| New Capability | Technical Requirement | Build On |
|---------------|----------------------|----------|
| 3D scene composition | Multi-object scene graph + spatial editor | runtime-scene (bevy_ecs) |
| Spatial audio | HRTF + ambisonic rendering | runtime-device (cpal) |
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
    ├── OpenXR session management
    ├── Stereoscopic rendering pipeline
    ├── Spatial input (controllers/hands/gaze)
    ├── AR plane detection + anchoring
    └── Spatial audio integration

New extension:
  neko-spatial (or extend neko-model)
    ├── 3D scene editor with spatial tools
    ├── VR preview mode
    ├── AR overlay editor
    └── 360° video stitching UI
```

### AI Integration Points

- AI-generated 3D scenes from text/image prompts
- Spatial layout suggestions (furniture placement, lighting)
- Auto-generate LOD variants for performance
- Voice-driven scene manipulation in VR

### Boundaries

```
Do:   VR/AR content creation and preview
Do:   360° video production
Do:   Spatial audio authoring
Don't: Real-time multiplayer VR (→ Stage 4)
Don't: Full physics simulation (→ Stage 5)
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
