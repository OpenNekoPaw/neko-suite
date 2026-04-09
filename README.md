# Neko Suite

> All-in-One Creative IDE - A Video Editing Workstation Deeply Integrated into VS Code

[中文](./README_CN.md) | [Nya~](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** is an all-in-one creative workstation deeply integrated into VS Code. It breaks through editor performance limitations via a **Rust Sidecar architecture**, enabling a complete workflow from screenplay writing to 4K video compositing.

📋 **[View Roadmap →](./ROADMAP.md)**

---

## Highlights

- **AI-Driven Creation** - Transform natural language into editing operations via Agent Skills + MCP protocol, with Pipeline workflows for storyboard → batch video → timeline
- **Professional Timeline** - Multi-track, keyframe animation, color correction, effect masks, frame-precise editing, 29 EditOperations
- **Rust GPU Rendering** - wgpu PBR + IBL + post-processing + particle system, 25+ WGSL shaders, 4K real-time preview and export
- **3D/2D Creation** - glTF/VRM 3D editing + pressure-sensitive drawing (7 brushes) + skeletal animation + filters/particles/scene system
- **Audio Workstation** - Waveform editing + 12 effect chains + spectrum analysis + AI denoising + microphone recording
- **Asset Marketplace** - Search, install, and manage Skills/shaders/models/presets with local model deployment support
- **Git-Native** - .nkv project files are text-based, supporting version control and collaboration
- **Modular Architecture** - 18 packages, mix and match as needed, independently upgradable

---

## Quick Start

### Install Dependencies

```bash
pnpm install
```

### Build & Package

```bash
./build.sh
```

### Install to VS Code

```bash
./install.sh
```

### Development Mode

```bash
pnpm run dev
```

---

## Module Architecture

Neko Suite uses a **Monorepo (pnpm workspace + turbo)** structure with 18 packages:

### Core Triangle (Development Focus)

| Module          | Role                                                                                                                                   | Status    | Scale                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- |
| **neko-engine** | Rust GPU media engine - wgpu PBR rendering + codec + export + particles/post-processing + 3D scene/2D skeletal ECS + ONNX ML inference | Alpha 90% | 76.6K Rust + TS, 236 files         |
| **neko-cut**    | Video editor - timeline + preview + color correction + effects + 29 EditOperations                                                     | Alpha 82% | 63.4K TS/TSX (293 files), 21 tests |
| **neko-agent**  | AI Agent - multi-LLM + MCP + Skills + CLI + Pipeline workflows + AI subtitles + auto-scoring                                           | Alpha 95% | 99.6K TS/TSX (540 files), 79 tests |

### Infrastructure

| Module          | Role                                                                                      | Status      | Scale                          |
| --------------- | ----------------------------------------------------------------------------------------- | ----------- | ------------------------------ |
| **neko-types**  | Shared types + cross-cutting concerns (Logger/i18n/Theme/Errors) + Operations type safety | Alpha 92%   | 34.5K TS (187 files), 20 tests |
| **neko-client** | Streaming client - H264/fMP4/PCM + EngineClient HTTP dispatch                             | Alpha 80%   | 4.9K TS (17 files), 3 tests    |
| **neko-proto**  | Protocol definitions (timeline.proto + diff.proto full IDL)                               | Stable 100% | 2 proto                        |
| **neko-auth**   | Unified auth - OAuth 2.0 + PKCE SSO + token refresh + VSCode SecretStorage / file storage | Alpha 80%   | 1.4K TS (14 files), 3 tests    |
| **neko-suite**  | Extension Pack portal + Release workflow                                                  | Stable 90%  | Config package                 |

### Feature Modules

| Module           | Role                                                                                                      | Status    | Scale                            |
| ---------------- | --------------------------------------------------------------------------------------------------------- | --------- | -------------------------------- |
| **neko-preview** | Media preview - Video/Audio Provider + WebCodecs player + Apple Music-style waveform                      | Alpha 85% | 7.2K TS/TSX (42 files), 5 tests  |
| **neko-story**   | Screenplay editor - Fountain LSP + preview + timeline generation + ScenePlan/ShotPlan + story→agent→canvas pipeline | Alpha 88% | 8.0K TS/TSX (50 files), 10 tests |
| **neko-market**  | Asset marketplace - Skills/shaders/models/presets search + install + versioning + local model deployment  | Alpha 97% | 4.4K TS/TSX (47 files), 9 tests  |
| **neko-assets**  | Asset management - registry + thumbnails + external media libraries + Document + PathVariable full format | Alpha 92% | 9.2K TS (47 files), 7 tests      |
| **neko-tools**   | Media tools - Diff comparison + parallel optimization + protocol enhancement                              | WIP 62%   | 14.9K TS (69 files), 6 tests     |
| **neko-canvas**  | Infinite canvas - 6 node types + grouping + artboard export + Port UI + EditOperation                     | Alpha 87% | 14.1K TS/TSX (79 files), 4 tests |

### Creative Modules

| Module          | Role                                                                                                                                                                                                           | Status    | Scale                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------- |
| **neko-model**  | 3D creation - glTF/VRM viewport + PBR/IBL + particles/post-processing + CSG/text/geometry + skeletal expressions + timeline integration                | Alpha 65% | 3.5K TS/TSX (39 files)            |
| **neko-sketch** | 2D creation - pressure-sensitive drawing (7 brushes) + filters/particles/scene/pixel/vector + frame-by-frame/skeletal animation + sprite sheets + i18n | Alpha 87% | 13.9K TS/TSX (126 files), 7 tests |
| **neko-audio**  | Audio workstation - waveform editing + 12 effect chains + spectrum analysis + AI denoising + microphone recording + export                                                                                     | Alpha 95% | 9.2K TS/TSX (54 files), 3 tests   |

### Planned

| Module        | Role                                                                                              | Status     |
| ------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| **neko-live** | Virtual production - MediaPipe/VMC motion capture + VRM avatar + RTMP streaming + OBS integration | Planned 5% |

---

## Core Technology

### 1. Rust Sidecar Engine

Core computation resides in the **neko-engine** Rust standalone process (7 crates), communicating with VS Code via unified HTTP/WS + NAPI, completely solving editor lag issues.

```
VS Code Extension Host ←─ HTTP/WS/NAPI ─→ neko-engine (Rust Sidecar)
                                                │
                                                ├─ wgpu GPU Rendering (25+ WGSL shaders, PBR + IBL + particles + post-processing)
                                                ├─ FFmpeg Codec (hardware-accelerated VideoToolbox/NVENC/VAAPI)
                                                ├─ Keyframe Cache + Preloading Optimization
                                                ├─ Export Pipeline (GPU export + audio mixer + loudness normalization)
                                                ├─ runtime-scene 3D Scene (bevy_ecs + glTF/VRM + PBR + physics)
                                                ├─ runtime-puppet 2D Skeletal (bevy_ecs + inox2d + 60fps WS stream)
                                                └─ ONNX ML Inference (macOS CoreML acceleration)
```

### 2. AI Agent Skills

Users transform natural language into operational commands via **neko-agent**. Supports Claude/OpenAI/Google multi-provider, MCP protocol, Pipeline workflows, sub-agents, AOP hooks, with complete CLI and React UI.

```
User Intent → neko-agent (LLM + Skills + MCP + Pipeline) → neko-cut/canvas Execution
```

### 3. WebGPU Rendering Pipeline

Uses wgpu compositor to directly composite video frames, effects, transitions, and color correction in GPU memory. Supports blend modes, custom shaders, and keyframe animation.

```
Video Frames + Effects + Transitions → wgpu Compositor → Real-time Preview / GPU Export
```

---

## Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Write → Think → Draw → Sound → Publish                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Write: Draft screenplays in Fountain format with neko-story     │
│            ↓                                                        │
│  2. Think: neko-agent parses scripts via ScenePlan/ShotPlan,        │
│            orchestrates storyboard → canvas → timeline pipeline     │
│            ↓                                                        │
│  3. Draw:  Semantic storyboard import into neko-canvas, edit        │
│            visuals in neko-sketch in real-time                       │
│            ↓                                                        │
│  4. Sound: Record voiceovers in neko-audio, AI auto-denoise         │
│            and align                                                │
│            ↓                                                        │
│  5. Publish: Git commit triggers CI/CD auto-render and publish      │
│              via neko-assets                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
neko-suite/
├── packages/
│   ├── neko-suite/            # Extension Pack portal
│   ├── neko-engine/           # Rust Sidecar media engine
│   │   └── packages/
│   │       ├── engine-kernel/   # Rust core (wgpu/codec/export/ONNX ML)
│   │       ├── host-api/    # HTTP API routing layer
│   │       ├── host-http/   # Axum HTTP service
│   │       ├── host-napi/   # Node.js NAPI bindings
│   │       ├── host-cli/    # CLI entry point
│   │       ├── runtime-scene/  # Rust 3D scene ECS (bevy_ecs + glTF)
│   │       ├── runtime-puppet/ # Rust 2D skeletal ECS (bevy_ecs + inox2d + bevy_animation)
│   │       ├── types/         # Rust shared types
│   │       └── extension/     # TS VSCode extension side
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
│   ├── neko-audio/            # Audio workstation
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side
│   │       └── webview/       # React UI
│   ├── neko-client/           # Streaming client (H264/PCM/fMP4) + EngineClient
│   ├── neko-model/            # 3D creation (R3F + PBR/IBL + CSG + skeletal expressions)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side (.gltf/.glb/.vrm/.nkm)
│   │       └── webview/       # React Three Fiber UI
│   ├── neko-sketch/           # 2D drawing (painting + filters/particles/scene + frame animation)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side (CustomEditorProvider .nks)
│   │       └── webview/       # React 18 + WebGL2 UI
│   ├── neko-puppet/           # 2D skeletal animation (Inochi2D puppet editor)
│   │   └── packages/
│   │       ├── extension/     # VSCode extension side (CustomEditorProvider .nkp/.inp)
│   │       └── webview/       # React 18 + EngineClient UI
│   ├── neko-live/             # Virtual production (Planned)
│   ├── neko-types/            # Shared types + Logger + i18n + Theme
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

| Type             | Formats                                     |
| ---------------- | ------------------------------------------- |
| **Video**        | MP4, MOV, AVI, MKV, WebM, M4V               |
| **Audio**        | MP3, WAV, OGG, FLAC, AAC, M4A               |
| **Image**        | PNG, JPG, JPEG, GIF, WebP, BMP, SVG         |
| **3D Model**     | glTF, GLB, VRM, .nkm                        |
| **2D Animation** | INP (Inochi2D), .nks (Neko Sketch)          |
| **Project**      | .nkv (Video project), .nkc (Canvas project) |

---

## Installation

### Option 1: Full Installation (Recommended)

Install `Neko Suite` to get all features:

```
ext install neko.neko-suite
```

### Option 2: Install Individually

Install sub-extensions based on your needs:

- **Editing only**: `neko-cut` + `neko-engine`
- **AI only**: `neko-agent`
- **Preview only**: `neko-preview` + `neko-engine`
- **Audio only**: `neko-audio` + `neko-engine`

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
- [inox2d](https://github.com/Inochi2D/inox2d) - Inochi2D 2D skeletal characters

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
