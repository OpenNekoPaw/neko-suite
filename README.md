# Neko Suite

> AIGC IDE + AIGC Agent — An Agent-Driven Multimodal Creation Workspace in VS Code

[中文](./README_CN.md) | [Nya~](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** is an AIGC-native IDE deeply integrated into VS Code. A first-class **AIGC Agent** sits at the core and drives the full multimodal creation loop — screenplay, video, 3D, 2D, audio — through natural language. **Skills** orchestrate reusable workflows, a **unified asset library** feeds every surface, and a **Rust Sidecar engine** keeps the editor responsive.

📋 **[View Roadmap →](./ROADMAP.md)**

---

## Highlights

- **AIGC Agent at the Core** - Natural-language driven creation across video / 3D / 2D / audio / screenplay; multi-LLM (Claude / OpenAI / Google) + MCP protocol + multimodal perception + rich content delivery
- **Skills Orchestrate Workflows** - Composable Skills bundle prompts, tools, permissions, and context-item budgets; tiered lazy loading keeps the baseline at ~8K tokens and grows on demand
- **Multimodal Creation Surfaces** - Screenplay (Fountain LSP) → infinite canvas storyboarding → timeline editing → 3D modeling / 2D painting / 2D skeletal animation → audio workstation
- **Unified Asset Library** - Cross-module registry with thumbnails, persistent search index, external media libraries, and path variable resolution (`${VAR}/path`)
- **Asset Marketplace** - Install and version Skills, shaders, models, and presets; local model deployment (ONNX / GGUF) with upstream proxy (HF / Civitai)
- **Rust GPU Engine** - wgpu PBR + IBL + post-processing + particles (20+ WGSL shaders), 3D scene & 2D skeletal ECS, ONNX ML inference, 4K real-time preview
- **Git-Native Projects** - `.nkv` / `.nkc` / `.nka` / `.nkm` / `.nks` files are text-based, versionable, and collaboration-friendly
- **Modular Architecture** - 19 packages, mix and match as needed, independently upgradable

---

## Quick Start

### Install Dependencies

```bash
pnpm install
```

### Build

```bash
./build.sh
```

### Development Mode

```bash
pnpm run dev
```

---

## Module Architecture

Neko Suite uses a **Monorepo (pnpm workspace + turbo)** structure with 19 packages:

### Core Triangle (Development Focus)

| Module          | Role                                                                                                                            | Status    | Scale                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------- |
| **neko-engine** | Rust GPU media engine - wgpu PBR rendering + codec + export + DSP effects + 3D scene/2D skeletal ECS + ONNX ML inference        | Alpha 99% | ~108K Rust (293 files, 980 tests) + 4.6K TS (22 files) |
| **neko-cut**    | Video editor - timeline + preview + color correction + effects + 56 EditOperations                                              | Alpha 95% | 63K TS/TSX (292 files, 658 tests), 52 commands        |
| **neko-agent**  | AI Agent - multi-LLM + MCP + Skills + IDC unified workflow + multimodal perception + rich content delivery                      | Alpha 99% | 228K TS (1166 files, 3463 tests)  |

### Infrastructure

| Module          | Role                                                                                      | Status      | Scale                            |
| --------------- | ----------------------------------------------------------------------------------------- | ----------- | -------------------------------- |
| **neko-types**  | Shared types + cross-cutting concerns (Logger/i18n/Theme/Errors) + Operations type safety | Alpha 94%   | 55.7K TS (296 files, 519 tests)  |
| **neko-client** | Streaming client - H264/fMP4/PCM + EngineClient HTTP dispatch + MediaPlaybackService      | Alpha 85%   | 10K TS (39 files, 95 tests)      |
| **neko-proto**  | Protocol definitions (timeline.proto + diff.proto full IDL)                               | Stable 100% | 2 proto                          |
| **neko-auth**   | Unified auth - OAuth 2.0 + PKCE SSO + token refresh + VSCode SecretStorage / file storage | Alpha 90%   | 1.7K TS (15 files, 54 tests)     |
| **neko-dashboard** | Creative workspace hub - runtime status + workflow launcher + skill browser + task monitor | Alpha 90%   | 3.5K TS/TSX (30 files, 29 tests) |
| **neko-suite**  | Extension Pack portal                                                                     | Stable 90%  | Config package                   |

### Feature Modules

| Module           | Role                                                                                                         | Status    | Scale                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------------- |
| **neko-preview** | Media preview - Video/Audio/Panoramic Provider + WebCodecs player + engine-first HDR routing                 | Alpha 91% | 15.4K TS/TSX (86 files, 152 tests) |
| **neko-story**   | Screenplay editor - Fountain LSP + 5-column storyboard table + video readiness + story→agent→canvas pipeline | Alpha 97% | 18.7K TS/TSX (75 files, 217 tests) |
| **neko-market**  | Asset marketplace - Skills/shaders/models/presets search + install + versioning + local model deployment     | Alpha 90% | 13.7K TS/TSX (64 files, 198 tests) |
| **neko-assets**  | Asset management - registry + thumbnails + persistent search index + external media libraries                | Alpha 88% | 11.3K TS (56 files, 167 tests)     |
| **neko-tools**   | Media tools - Diff comparison + JVI LSP + silence detection + metadata viewer                                | Alpha 72% | 17.5K TS (120 files, 112 tests)    |
| **neko-canvas**  | Infinite canvas - 15 node types + block containers + composable presets + batch generation + MCP Tools       | Alpha 95% | 30.8K TS/TSX (145 files, 204 tests)|

### Creative Modules

| Module          | Role                                                                                                                          | Status    | Scale                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------- |
| **neko-model**  | 3D creation - glTF/VRM Engine-streamed Route A viewport + LookDev Clay/Debug + authored lights + Engine-owned environment + typed picking + CSG + face sculpting + keyframe animation + IK solver | Alpha 87% | 9.7K TS (75 files, 45 tests) + 98 Rust tests  |
| **neko-sketch** | 2D creation - pressure-sensitive drawing (8 brushes) + layers + selection + AI tools + PSD import + .nks format + 2D lighting | Alpha 68% | 31.9K TS/TSX (178 files, 185 tests)           |
| **neko-audio**  | Audio workstation - DAW UI (TrackHeader/TrackLane/AudioClip) + 12 effect types + spectrum + AI denoising + Agent tools        | Alpha 82% | 11.1K TS/TSX (60 files, 52 tests)             |
| **neko-puppet** | 2D skeletal animation - `.nkp` v2 Native Puppet (Bone2D + BlendShape + ControlDriver) + Live2D/MOC3 import compatibility + first Agent/export paths + 60fps streaming | Alpha 92% | 4.2K TS (38 files, 37 tests) + 116 Rust tests |
| **neko-live**   | Virtual production - engine Live Compositor stream + ViewportShell + authorized device source refs + non-authoritative local fallback recording | Alpha 58% | 4.4K TS (34 files, 37 tests)                  |

---

## Core Technology

### 1. Rust Sidecar Engine

Core computation resides in the **neko-engine** Rust standalone process (11 crates), communicating with VS Code via unified HTTP/WS + NAPI, completely solving editor lag issues.

```
VS Code Extension Host ←─ HTTP/WS/NAPI ─→ neko-engine (Rust Sidecar)
                                                │
                                                ├─ wgpu GPU Rendering (20+ WGSL shaders, PBR + IBL + particles + post-processing)
                                                ├─ FFmpeg Codec (hardware-accelerated VideoToolbox/NVENC/VAAPI)
                                                ├─ DSP Effect Library (mix pipeline with solo/pan)
                                                ├─ Export Pipeline (GPU export + audio mixer + loudness normalization)
                                                ├─ runtime-scene 3D Scene (bevy_ecs + glTF/VRM + PBR + IK + animation blend)
                                                ├─ runtime-puppet 2D Native Puppet (Bone2D + BlendShape + MOC3 import compatibility + 60fps WS stream)
                                                ├─ runtime-device Device I/O (cpal + midir + gilrs)
                                                ├─ runtime-media Media Logic (probe + diff + subtitle)
                                                └─ runtime-ml ONNX Inference (macOS CoreML acceleration)
```

### 2. AIGC Agent as the Creation Driver

The **neko-agent** is the central nervous system of the IDE. It turns natural language into multimodal creation actions across every surface — timeline, canvas, 3D viewport, 2D sketch, audio workstation — through multi-LLM providers (Claude / OpenAI / Google), MCP tool protocol, multimodal perception, and rich content delivery. Every sub-package exposes its tools via `AgentCapabilityProvider`, so the Agent discovers capabilities dynamically instead of hard-coding them.

```
User Intent
   │
   ▼
┌────────────────────────────────────────────────────────────────┐
│  neko-agent  (LLM + MCP + Perception + Skills + Capability     │
│               Discovery + Context/Memory)                      │
└────────────────────────────────────────────────────────────────┘
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
 story     canvas       cut       model     sketch      audio
(script) (storyboard) (timeline)  (3D)     (2D paint) (DAW)
```

### 3. Skills Orchestrate Workflows

**Skills** are composable, reusable workflow units — each one bundles a prompt fragment, a set of allowed tools, permission rules, and context budgets. The Agent activates Skills based on intent (via `ActivateSkill` / `DeactivateSkill` meta-tools), and `SkillInjectionCoordinator` atomically injects or removes all four tracks: Prompt → Permission → Guard → ToolSet. Tiered lazy loading (`resident` / `eager` / `lazy`) keeps the baseline at ~8K tokens and grows on demand.

```
Intent → SkillRegistry → activate(skill)
                           ├─ Prompt fragment (system prompt section)
                           ├─ ToolSet (always / dynamic layer)
                           ├─ Permission rules
                           └─ Context budget
                         execute → deactivate → atomic rollback
```

### 4. NPC Character Test Bench

NPC testing and creative authoring are separate scenarios. The Dashboard character detail view is the primary NPC operation surface: `Test NPC` opens an isolated NPC test session in the Agent panel, assembling the NPC profile from current project character facts, asset bindings, visual drafts, relationships, and occurrences. The NPC session uses `toolPolicy: { kind: 'none' }`, so it receives no file, media-generation, timeline-editing, shell, or creative authoring tools.

Dashboard character detail actions:

```text
Test NPC
Perspective
Validate
Improve
```

- `Test NPC`: enter an isolated NPC roleplay test session for the character.
- `Perspective`: ask the ordinary Agent to analyze what the character knows, misunderstands, does not know, and should not know in the selected project scope.
- `Validate`: check character completeness, knowledge boundaries, voice, relationships, and interaction-flow risks.
- `Improve`: produce pending character-design suggestions without automatically writing project facts.
- `/exit-role`: exit NPC testing, generate an evaluation report, and choose whether to save evidence.

`/as @character` is no longer exposed as a visible Agent Webview slash command. If manual typed compatibility remains during migration, it is a hidden/debug entry that still delegates to the same `neko.agent.testNpc` isolated session path. Dashboard only sends creative entity action requests, while the Agent extension owns profile assembly, NPC session creation, Agent validation workflows, and evaluation.

NPC context follows the current project by default. Active dialogue stays in NPC session memory and is not written to main Agent history, `.neko/memory.md`, global memory, or standard conversation records. If the user chooses to save evidence, transcripts and evaluation are written under `.neko/npc-tests/{entityId}-{timestamp}.json` in the current project. Evaluation suggestions stay suggested until the user confirms applying them through entity metadata or relationship update commands.

### 5. Unified Asset Library

A single **asset registry** (neko-assets) feeds every surface: video clips, audio, images, 3D models, 2D puppets, generated AI outputs, and project files. Persistent search index, thumbnails, external media library mounting, and path variable resolution (`${VAR}/path` via `PathResolver` in `@neko/shared`) make the library portable across machines and collaborators. Generated assets from the Agent land on disk as `GeneratedAsset` with JSON references — no base64 bloat, no lost provenance.

```
Local files / External libraries / Agent-generated
   │
   ▼
┌────────────────────────────────────────────────────────────────┐
│  neko-assets  (Registry + Thumbnails + Search Index + PathResolver)│
└────────────────────────────────────────────────────────────────┘
   │           │          │          │          │          │
   ▼           ▼          ▼          ▼          ▼          ▼
 canvas      cut       model     sketch     puppet      audio
```

### 6. WebGPU Rendering Pipeline

Uses the wgpu compositor to directly composite video frames, effects, transitions, and color correction in GPU memory. Supports blend modes, custom shaders, and keyframe animation.

```
Video Frames + Effects + Transitions → wgpu Compositor → Real-time Preview
```

---

## Workflow

Not a linear pipeline — an **Agent-driven closed creation loop** where every turn flows through five planes and feeds the next iteration:

```
           ┌──────────────────────────────────────────────────┐
           │                                                  │
           ▼                                                  │
  ① Intent Authoring          Prompt + selected asset + ref  │
     (user / AGENTS.md /      constraints                    │
      resident skill)                                        │
           │                                                  │
           ▼                                                  │
  ② Dynamic Orchestration     SkillRegistry activates        │
     (neko-agent)             Prompt / Tools / Permissions / │
                              Context; IDC Draft→Plan→Apply  │
           │                                                  │
           ▼                                                  │
  ③ Content Generation        story / canvas / cut / model / │
     (multimodal surfaces)    sketch / puppet / audio execute│
                              via MCP + AgentCapabilityProvider
           │                                                  │
           ▼                                                  │
  ④ Quality Check             Pipeline QC: LUFS, multi-frame │
     (automated review)       visual eval, format validation,│
                              schema lint, confidence gate   │
           │                                                  │
           ▼                                                  │
  ⑤ Perception Feedback       PerceptionCard (structural /   │
     (re-grounding)           semantic / perceptual) feeds   │
                              next intent; evaluator writes  │
                              to memory / project cards      │
           │                                                  │
           └──────────────► back to ① (closed loop)
```

- **Intent Authoring** — user prompt, conversation context, resident skills, AGENTS.md overlay, project-level memory
- **Dynamic Orchestration** — Skill activation atomically injects Prompt / ToolSet / Permission / Guard; IDC 3-stage (Draft → Plan → Apply) for non-trivial work
- **Content Generation** — cross-surface execution (timeline / canvas / 3D / 2D / audio) via MCP and `AgentCapabilityProvider`
- **Quality Check** — Pipeline adapters verify audio loudness, visual consistency across frames, schema validity, and confidence thresholds; failures trigger retry or human review
- **Perception Feedback** — `PerceptionCard` re-grounds the Agent on actual artifact state (not assumed state); results close the loop into the next Intent

---

## Project Structure

```
neko-suite/
├── packages/
│   ├── neko-suite/            # Extension Pack portal
│   ├── neko-engine/           # Rust Sidecar media engine
│   │   └── packages/
│   │       ├── engine-kernel/   # Rust core (wgpu/codec/DSP/export)
│   │       ├── engine-types/    # Shared Rust DTO types
│   │       ├── host-api/        # HTTP API routing layer
│   │       ├── host-http/       # Axum HTTP service
│   │       ├── host-napi/       # Node.js NAPI bindings
│   │       ├── host-cli/        # CLI entry point
│   │       ├── runtime-scene/   # 3D scene ECS (bevy_ecs + glTF + IK)
│   │       ├── runtime-puppet/  # 2D Native Puppet ECS (Bone2D + BlendShape + MOC3 import compatibility)
│   │       ├── runtime-device/  # Device I/O (cpal/midir/gilrs)
│   │       ├── runtime-media/   # Media logic (probe/diff/subtitle)
│   │       ├── runtime-ml/      # ML inference (ONNX Runtime)
│   │       └── extension/       # TS VSCode extension side
│   ├── neko-cut/              # Video editor
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI (13 store slices)
│   ├── neko-agent/            # AI Agent
│   │   └── packages/
│   │       ├── agent/         # Core engine (executor/session/skills/mcp)
│   │       ├── platform/      # LLM platform layer (Claude/OpenAI/Google adapter)
│   │       ├── webview/       # React UI
│   │       ├── extension/     # VSCode extension side
│   │       └── cli-tui/       # Interactive CLI
│   ├── neko-canvas/           # Infinite canvas
│   │   └── packages/
│   │       ├── canvas/        # Canvas core logic
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI
│   ├── neko-story/            # Screenplay editor (Fountain LSP)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side
│   │       ├── parser/        # Fountain parser
│   │       ├── types/         # Type definitions
│   │       └── webview/       # React UI
│   ├── neko-preview/          # Media preview
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI
│   ├── neko-tools/            # Media tools
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI
│   ├── neko-assets/           # Asset management
│   │   └── packages/
│   │       └── asset/         # Asset core logic
│   ├── neko-market/           # Asset marketplace
│   │   └── packages/
│   │       ├── core/          # Market client + install manager (Layer 0)
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI
│   ├── neko-auth/             # Unified auth (OAuth 2.0 + PKCE SSO)
│   │   └── packages/
│   │       ├── core/          # @neko/auth-core (Layer 0)
│   │       └── extension/     # neko.neko-auth VSCode extension
│   ├── neko-dashboard/         # Creative workspace hub (dashboard)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI
│   ├── neko-audio/            # Audio workstation
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI
│   ├── neko-client/           # Streaming client (H264/PCM/fMP4) + EngineClient
│   ├── neko-model/            # 3D creation (Engine-streamed Route A + LookDev/lights/environment + CSG + skeletal expressions)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side (.gltf/.glb/.vrm/.nkm)
│   │       └── webview/       # React control surface + Engine H.264 viewport
│   ├── neko-sketch/           # 2D drawing (painting + filters/particles/scene + frame animation)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side (CustomEditorProvider .nks)
│   │       └── webview/       # React 18 + WebGL2 UI
│   ├── neko-puppet/           # 2D skeletal animation (.nkp v2 native editor + Live2D/MOC3 import conversion)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side (CustomEditorProvider .nkp/.moc3)
│   │       └── webview/       # React 18 + EngineClient UI
│   ├── neko-live/             # Virtual production (Live Compositor stream + fallback preview)
│   ├── neko-types/            # Shared types + Logger + i18n + Theme + entity-uri
│   └── neko-proto/            # Protocol definitions (Protobuf IDL)
├── docs/                      # Architecture documentation
├── package.json               # Root package.json (pnpm workspaces)
├── ROADMAP.md                 # Development roadmap
├── CLAUDE.md                  # Development guidelines
└── turbo.json                 # Turbo build configuration
```

---

## Tech Stack

| Layer            | Technology                                             |
| ---------------- | ------------------------------------------------------ |
| **Frontend**     | React 18 + Zustand + Tailwind CSS + Vite               |
| **Extension**    | VS Code Extension API + TypeScript + esbuild           |
| **Engine**       | Rust + wgpu + FFmpeg + axum + tokio + bevy_ecs         |
| **AI**           | Vercel AI SDK (Claude/OpenAI/Google) + MCP Protocol    |
| **ML**           | ONNX Runtime (macOS CoreML acceleration) + Whisper     |
| **Streaming**    | H.264 + PCM + fMP4 over WebSocket                      |
| **Testing**      | Vitest v4 + cargo test                                 |
| **Code Quality** | ESLint + TypeScript strict + Knip + dependency-cruiser |
| **Build**        | pnpm workspaces + Turbo (Monorepo)                     |

---

## Supported Media Formats

| Type             | Formats                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| **Video**        | MP4, MOV, AVI, MKV, WebM, M4V                                             |
| **Audio**        | MP3, WAV, OGG, FLAC, AAC, M4A                                             |
| **Image**        | PNG, JPG, JPEG, GIF, WebP, BMP, SVG                                       |
| **3D Model**     | glTF, GLB, VRM, .nkm                                                      |
| **2D Animation** | .nkp v2 (Neko Native Puppet), MOC3/Live2D import compatibility, .nks (Neko Sketch) |
| **Project**      | .nkv (Video), .nkc (Canvas), .nka (Audio), .nkm (3D Model), .nks (Sketch) |

---

## Documentation

- [ROADMAP.md](./ROADMAP.md) - Development roadmap and feature planning
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [CLAUDE.md](./CLAUDE.md) - Development guidelines and architecture guide
- [docs/engine.md](./docs/engine.md) - Media engine documentation
- [docs/shaders.md](./docs/shaders.md) - GPU Shader documentation
- [docs/timeline-alignment.md](./docs/timeline-alignment.md) - Timeline alignment documentation
- [docs/editoperation.md](./docs/editoperation.md) - Edit operation design
- [docs/architecture/](./docs/architecture/) - Architecture design documents
  - [Panel Placement Strategy](./docs/architecture/panel-placement.md) - Editor panel architecture
  - [Device Access Strategy](./docs/architecture/device-access.md) - Hardware device proxy solution
  - [Engine Pluginization RFC](./docs/architecture/engine-plugin-rfc.md) - Capability pluginization and marketplace/host responsibilities
  - [Engine Runtime Layering](./docs/architecture/engine-runtime-layering.md) - Package-level runtimes with a single-host default
  - [Format Strategy](./docs/architecture/format-strategy.md) - nk\* file format design
  - [Marketplace](./docs/architecture/marketplace.md) - Asset marketplace architecture
  - [Local Model Deployment](./docs/architecture/model-runtime.md) - ONNX/GGUF runtime
  - [Registry Server](./docs/architecture/registry-server.md) - Registry center design

---

## Contributing

We welcome contributions to Neko Suite!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

For detailed development guidelines, see [CLAUDE.md](./CLAUDE.md).

---

## License

MIT

---

## Acknowledgements

Neko Suite is built on the shoulders of many excellent open-source projects:

### Platform & Runtime

- [VS Code](https://code.visualstudio.com/) - Powerful editor platform
- [Node.js](https://nodejs.org/) - JavaScript runtime
- [Tokio](https://tokio.rs/) - Rust async runtime

### GPU & Rendering

- [wgpu](https://wgpu.rs/) - Cross-platform GPU abstraction (Metal/Vulkan/DX12)
- [Three.js](https://threejs.org/) + [React Three Fiber](https://r3f.docs.pmnd.rs/) - 3D rendering
- [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) - Browser-native codec API

### Media Processing

- [FFmpeg](https://ffmpeg.org/) ([ffmpeg-next](https://github.com/zmwangx/rust-ffmpeg)) - Video codec infrastructure
- [cpal](https://github.com/RustAudio/cpal) - Cross-platform audio I/O
- [sharp](https://sharp.pixelplumbing.com/) - High-performance image processing

### AI & ML

- [Vercel AI SDK](https://sdk.vercel.ai/) - Multi-model AI integration framework
- [ONNX Runtime](https://ort.pyke.io/) ([ort](https://github.com/pykeio/ort)) - ML inference engine

### 3D/2D Engine

- [Bevy ECS](https://bevyengine.org/) - Entity-Component-System framework
- [glTF-rs](https://github.com/gltf-rs/gltf) - glTF/GLB model parsing
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) - VRM character model support

### Frontend

- [React](https://react.dev/) - UI framework
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS

### Networking & Communication

- [Axum](https://github.com/tokio-rs/axum) - HTTP/WebSocket server
- [napi-rs](https://napi.rs/) - Rust ↔ Node.js bindings
- [Protocol Buffers](https://protobuf.dev/) - Type contract protocol

### Build & Quality

- [Turborepo](https://turbo.build/) - Monorepo build orchestration
- [Vite](https://vitejs.dev/) - Frontend bundler
- [Vitest](https://vitest.dev/) - Testing framework
- [ESLint](https://eslint.org/) + [Knip](https://knip.dev/) + [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) - Code quality
