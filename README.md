# Neko Suite

> AIGC Content Creation IDE + AIGC Content Creation Agent + AIGC Interactive Engine, deeply integrated into VS Code

[中文](./README_CN.md) | [Nya~](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-Mixed-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** is an AIGC-native creative IDE, content creation Agent, and interactive media engine. The product goal is not only "AI chat inside an editor"; it is a closed creative workspace where an Agent can understand intent, plan work, call tools, generate assets, inspect results, edit, preview, and iterate across screenplay, storyboard canvas, video timeline, 3D, 2D drawing, 2D puppet animation, audio, assets, and live interaction.

The repo is currently an Alpha-stage monorepo with **23 top-level workspace packages**. The strongest areas are the content creation Agent runtime, Rust media engine, video timeline, story/canvas workflow, preview/streaming stack, and shared contract layers. Canvas interactive narrative is converging on one path: `.nkc` branching graphs, standard `.fountain` scene content, and separate Narrative Preview/HTML5 export. The main remaining work is cross-package product hardening: one project graph, one Agent capability registry, one interactive runtime surface, and end-to-end smoke coverage for full AIGC creation loops.

📋 **[View Roadmap →](./ROADMAP.md)**

---

## Target Architecture

Neko Suite is built around three connected product layers.

### 1. AIGC Content Creation IDE

Natural language and project context drive a multi-surface authoring flow:

```text
Intent
  -> story/script planning
  -> canvas storyboard and references
  -> asset/entity grounding
  -> media generation
  -> timeline/audio/3D/2D editing
  -> preview/export
  -> perception and quality feedback
  -> next intent
```

### 2. AIGC Content Creation Agent

The Agent is the creative operator. It turns intent into plans, activates Skills, discovers package capabilities, calls tools through MCP/native bridges, delivers rich media results, and re-grounds itself from actual project state.

```text
User intent
  -> context, memory, selected assets, AGENTS.md overlays
  -> Skill activation and permission guard
  -> capability discovery and tool planning
  -> Draft / Plan / Apply execution
  -> rich content delivery and task tracking
  -> perception, evaluator feedback, and next turn
```

### 3. AIGC Interactive Engine

The Rust sidecar and realtime clients turn authored assets into inspectable, streamable, interactive runtime states:

```text
Project assets
  -> engine scene / puppet / audio / media runtimes
  -> H.264 + PCM + fMP4/WebSocket streams
  -> model / puppet / live / preview surfaces
  -> Agent feedback and interactive control
```

---

## Current Progress Snapshot

Updated on **2026-06-03**. Percentages below are qualitative target-fit estimates, not release promises. They combine package footprint, tests, package README/architecture docs, VS Code extension entry points, webview surfaces, Rust runtime coverage, and integration maturity.

| Area               | Current read                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDE foundation     | Strong. Story -> Agent -> Canvas -> Cut has concrete contracts and UI surfaces, but needs full-path smoke validation.                              |
| Creation Agent     | Advanced. Multi-LLM, MCP, Skills, permission/context systems, rich content, role workflows, and capability bootstrap are implemented.              |
| Interactive engine | Strong Rust foundation. Scene, puppet, audio, codec, GPU, media, ML, and device runtimes exist; live/interactive orchestration is still early.     |
| Project graph      | Emerging. `neko-entity`, `neko-search`, `neko-assets`, and Dashboard are moving the repo toward shared entity/search/task grounding.               |
| Product readiness  | Alpha. Many packages compile and test locally, but unified release packs, e2e smoke, performance baselines, and UX polish remain the largest gaps. |

---

## Package Progress

### Core Platform And Contracts

| Package                               | Target role                                          | Progress | What is in place                                                                                                                              | Main gap                                                                          |
| ------------------------------------- | ---------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **neko-engine**                       | Authoritative Rust media and interactive runtime     | 88%      | 357 Rust files; engine GPU/codec/audio/kernel/types; host HTTP/NAPI/CLI; scene, puppet, device, media, ML runtimes; extension sidecar manager | Release-grade runtime orchestration, performance baselines, live/device hardening |
| **neko-types** (`@neko/shared`)       | L0 shared contracts and cross-cutting infrastructure | 84%      | 374 TS/TSX files; Logger/i18n/Theme/Errors; timeline/canvas/audio/sketch/agent types; EditOperation system; generated Proto types             | Continue trimming legacy surface and protecting layer boundaries                  |
| **neko-client** (`@neko/neko-client`) | EngineClient and streaming clients                   | 76%      | HTTP dispatch, H.264/PCM/fMP4 clients, playback service, tests                                                                                | More cross-runtime cancellation/retry/error smoke coverage                        |
| **neko-proto** (`@neko/proto`)        | Protobuf IDL source of truth                         | 78%      | Timeline and diff IDL are present and generated into shared types                                                                             | More contracts for interactive engine, entity graph, and realtime session state   |
| **neko-auth**                         | Shared auth for providers and extensions             | 60%      | OAuth 2.0 / PKCE / token storage split into core + extension                                                                                  | Provider onboarding UX and marketplace/provider trust integration                 |
| **neko-suite**                        | Extension Pack portal                                | 55%      | Extension pack metadata for the main creative extensions                                                                                      | Needs updated pack strategy for dashboard/entity/search/ui support packages       |

### Content Creation Agent, IDE Orchestration, And Project Grounding

| Package                          | Target role                               | Progress | What is in place                                                                                                                                    | Main gap                                                                               |
| -------------------------------- | ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **neko-agent**                   | AIGC content creation Agent runtime       | 87%      | 1,265 TS/TSX files; 392 tests; multi-LLM platform; MCP; Skills; context/memory; permissions; CLI; VS Code webview; rich media cards; role workflows | Cross-surface capability contracts need full e2e validation with all creative packages |
| **neko-dashboard**               | Project control panel and task/entity hub | 66%      | Extension + webview; startup/show commands; task aggregation; creative entity source aggregation; tests                                             | Needs deeper workflow launch and live status integration across all packages           |
| **neko-entity** (`@neko/entity`) | Creative entity runtime and projections   | 58%      | Entity stores, candidates, asset refs, dashboard source, NPC profile assembler, architecture-boundary tests                                         | Needs adoption by all authoring surfaces and canonical project graph migrations        |
| **neko-search** (`@neko/search`) | Project search and index orchestration    | 56%      | Project index coordinator, provider registry, VS Code adapters, global search, tests                                                                | Needs first-class UI integration and more package providers                            |
| **neko-ui** (`@neko/ui`)         | Shared webview UI system                  | 55%      | Primitives, viewport shell, creative controls, keyboard/focus helpers, workbench shell, 36 tests                                                    | Migration is in progress; feature packages still carry local UI patterns               |

### Content Creation IDE Surfaces

| Package          | Target role                                                 | Progress | What is in place                                                                                                            | Main gap                                                                                    |
| ---------------- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **neko-story**   | Script-first planning and story-to-video entry              | 78%      | Fountain parser/types/webview/extension; scene index; readiness table; story -> agent -> canvas commands                    | Full flow-F smoke from script to generated timeline                                         |
| **neko-canvas**  | Infinite canvas, storyboard, and visual orchestration       | 80%      | 197 TS/TSX files; 45 tests; 13+ node types; storyboard import; generation prompt panel; batch generation; inline media; `narrative-start` / `narrative-ending` branching narrative nodes | Stronger entity/search integration and large-canvas performance baselines                   |
| **neko-cut**     | Video timeline editor and final assembly surface            | 82%      | 309 TS/TSX files; timeline editor, edit operations, preview/export services, commands, tests                                | End-to-end AI-generated storyboard import, QC, export smoke                                 |
| **neko-preview** | Engine-first media preview                                  | 76%      | Video/audio/panoramic/document preview routes; WebCodecs playback; waveform and stream clients                              | Unified document/media file-access hardening and multi-surface preview handoff              |
| **neko-assets**  | Unified asset registry and media library                    | 72%      | Asset core package, registry, entity/variant/file services, import dispatcher, media library search, character asset export | One project graph with `neko-entity`, generated asset provenance, marketplace install state |
| **neko-market**  | Marketplace for Skills, models, shaders, presets, providers | 70%      | Core + extension + webview; install target contributions; package verification paths                                        | Trust, signatures, dependency resolution, and provider/model onboarding polish              |
| **neko-tools**   | Cross-media inspection and diff tools                       | 68%      | Diff UI, media info, device views, JVI/media utilities, tests                                                               | More engine-first binary access and tighter integration with QC workflows                   |

### Interactive Engine And Realtime Creative Modules

| Package         | Target role                                            | Progress | What is in place                                                                                                      | Main gap                                                                                |
| --------------- | ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **neko-model**  | 3D creation and scene authoring                        | 66%      | Engine-streamed viewport, glTF/GLB/VRM/.nkm editor, LookDev controls, lights/environment, inspector, typed scene docs | More complete authoring workflow, runtime interaction, and Agent tool coverage          |
| **neko-sketch** | 2D drawing and frame animation                         | 62%      | 190 TS/TSX files; WebGL2 drawing engine; brushes, layers, selection, filters, particles, frame timeline, i18n         | Better shared UI migration, asset/entity grounding, and production export path          |
| **neko-puppet** | 2D skeletal character animation                        | 74%      | `.nkp`/MOC3 custom editor, EngineClient UI, Live2D compatibility, native puppet paths, tests                          | Production authoring polish, expression/motion marketplace, live runtime control        |
| **neko-audio**  | Audio workstation and sound generation/editing surface | 64%      | `.nka` editor, DAW UI, waveform, mixer/effects, recording/export panels, EngineClient service                         | More engine mix/export smoke, Agent audio tools, live monitoring                        |
| **neko-live**   | Virtual production and realtime interaction            | 45%      | Extension + webview, live session/device/tracking services, fallback preview/recording, tests                         | Earliest major surface: needs compositor, device authorization UX, realtime reliability |

---

## Integration Priorities

1. **One capability registry**
   Every creative package should expose stable `AgentCapabilityProvider` contracts so `neko-agent` discovers tools dynamically instead of hard-coding package behavior.

2. **One project graph**
   `neko-entity`, `neko-assets`, `neko-search`, generated assets, character facts, and Dashboard views should converge on one portable project graph.

3. **One interactive runtime**
   `neko-engine`, `neko-client`, `neko-model`, `neko-puppet`, `neko-audio`, `neko-live`, and `neko-preview` should share session, stream, file-access, and authority contracts.
   Canvas interactive narrative uses a separate Narrative Preview: `.nkc` stores the branching graph, `narrative-scene.sceneRef` points only to standard `.fountain` files, and Preview/HTML5 export share the `@neko/shared` NarrativeRuntime with injected asset resolvers. `.nks`, `.story`, and standalone `.nkstory` are not graph or scene formats for this workflow.

4. **End-to-end smoke paths**
   The release gate should include Story -> Agent -> Canvas -> generation -> Cut -> Preview/Export and Character/Entity -> Model/Puppet -> Live/Agent feedback.

5. **Shared UI migration**
   `@neko/ui` should gradually replace local duplicated controls while preserving package ownership of domain logic.

---

## Quick Start

### Install Dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build
```

Focused package builds:

```bash
pnpm build:neko-engine
pnpm build:neko-agent
pnpm build:neko-cut
pnpm build:pack-video
pnpm build:pack-2d
pnpm build:pack-audio
```

### Development Mode

```bash
pnpm run dev
```

---

## Core Architecture

```text
VS Code Extension Host
  | postMessage
  v
Webview Surfaces (React + Zustand + Vite)
  | direct WebSocket streams where needed
  v
neko-engine Rust Sidecar
  | HTTP / WebSocket / N-API
  v
GPU, codec, audio, scene, puppet, media, device, ML runtimes
```

Key boundaries:

- Webviews never call Node.js or VS Code APIs directly.
- Extension Host owns VS Code APIs, file dialogs, workspace state, and webview resource URIs.
- Rust owns heavy compute, media decoding/encoding, GPU rendering, runtime scene/puppet/audio/device logic, and binary file access.
- Protobuf and `@neko/shared` keep cross-layer contracts explicit.
- `@neko/neko-client` is the zero-VSCode client layer for HTTP/WS dispatch and streaming.

---

## Project Structure

```text
neko-suite/
├── packages/
│   ├── neko-engine/       # Rust sidecar engine and VS Code engine extension
│   ├── neko-agent/        # Agent runtime, AI platform, webview, extension, CLI
│   ├── neko-cut/          # Video editor
│   ├── neko-canvas/       # Infinite canvas and storyboard orchestration
│   ├── neko-story/        # Script editor and story planning
│   ├── neko-preview/      # Media/document preview
│   ├── neko-assets/       # Asset registry and media libraries
│   ├── neko-market/       # Marketplace and install targets
│   ├── neko-tools/        # Diff, inspection, and media utilities
│   ├── neko-model/        # 3D authoring
│   ├── neko-sketch/       # 2D drawing
│   ├── neko-puppet/       # 2D skeletal animation
│   ├── neko-audio/        # Audio workstation
│   ├── neko-live/         # Virtual production and realtime interaction
│   ├── neko-dashboard/    # Workspace dashboard
│   ├── neko-entity/       # Creative entity runtime
│   ├── neko-search/       # Project search runtime
│   ├── neko-ui/           # Shared webview UI
│   ├── neko-types/        # @neko/shared
│   ├── neko-client/       # EngineClient and stream clients
│   ├── neko-proto/        # Protobuf IDL
│   ├── neko-auth/         # Auth core and extension
│   └── neko-suite/        # Extension Pack
├── docs/
├── README.md
├── README_CN.md
├── README_NYA.md
├── ROADMAP.md
├── ARCHITECTURE.md
├── ARCHITECTURE_CN.md
└── turbo.json
```

---

## Tech Stack

| Layer     | Technology                                                       |
| --------- | ---------------------------------------------------------------- |
| Frontend  | React 18, Zustand, Tailwind CSS, Vite                            |
| VS Code   | VS Code Extension API, TypeScript, esbuild                       |
| Engine    | Rust, wgpu, FFmpeg, axum, tokio, bevy_ecs, napi-rs               |
| Streaming | H.264, PCM, fMP4, WebSocket, WebCodecs                           |
| AI        | Vercel AI SDK, Claude/OpenAI/Google/Ollama/Generic adapters, MCP |
| ML        | ONNX Runtime, CoreML acceleration where available                |
| Contracts | Protobuf, `@neko/shared`, JSON nk\* project formats              |
| Build     | pnpm 10, Turborepo 2                                             |
| Testing   | Vitest v4, cargo test, dependency-cruiser, Knip                  |

---

## Supported Media And Project Formats

| Type           | Formats                                                          |
| -------------- | ---------------------------------------------------------------- |
| Video          | MP4, MOV, AVI, MKV, WebM, M4V                                    |
| Audio          | MP3, WAV, OGG, FLAC, AAC, M4A                                    |
| Image          | PNG, JPG, JPEG, GIF, WebP, BMP, SVG                              |
| 3D             | glTF, GLB, VRM, `.nkm`                                           |
| 2D / Character | `.nks`, `.nkp` v2, MOC3/Live2D import compatibility, `.nkentity` |
| Script/Narrative | `.fountain`; interactive narrative uses `.nkc` branching graphs that reference `.fountain` scenes |
| Project        | `.nkv`, `.nkc`, `.nka`, `.nkm`, `.nks`, `.nkp`                   |

---

## Validation Commands

Use the smallest command that covers the changed area, then expand as risk increases:

```bash
pnpm build
pnpm test
pnpm check
```

Rust engine changes:

```bash
cd packages/neko-engine
cargo test --workspace
```

Local CI equivalents:

```bash
pnpm ci:local
pnpm ci:local:rust
pnpm ci:local:proto
```

---

## Documentation

- [ROADMAP.md](./ROADMAP.md) - Roadmap and feature planning
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md) - Chinese architecture overview
- [CLAUDE.md](./CLAUDE.md) - Development guidelines
- [docs/architecture/](./docs/architecture/) - ADRs and subsystem architecture notes
- [docs/architecture/adr-code-review-quality-gates.md](./docs/architecture/adr-code-review-quality-gates.md) - Review and quality gates

---

## Contributing

We welcome contributions to Neko Suite. Please follow the architecture boundaries before opening a pull request:

1. Keep Webview, Extension Host, Rust engine, and shared contracts separate.
2. Prefer contract-first changes for cross-package work.
3. Add focused tests for new interfaces, state machines, and failure paths.
4. Run the relevant validation commands and include the residual risk.

For detailed development guidelines, see [CLAUDE.md](./CLAUDE.md).

---

## License

Mixed License (MIT / Apache 2.0 / LGPL v3). See [LICENSE](./LICENSE) for details.

- [Ethical Use Guidelines](./ETHICS.md)
- [Trademark Policy](./TRADEMARK.md)

---

## Acknowledgements

Neko Suite is built on excellent open-source projects including VS Code, Rust, Tokio, Axum, wgpu, FFmpeg, Bevy ECS, WebCodecs, React, Zustand, Tailwind CSS, Vite, Vitest, Turborepo, napi-rs, Protocol Buffers, ONNX Runtime, and the Vercel AI SDK.
