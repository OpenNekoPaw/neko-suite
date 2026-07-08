# Neko Suite

> AIGC Content Creation IDE + Creative Agent + Interactive Media Engine, integrated into VS Code.

[中文](./README_CN.md) | [Nya~](./README_NYA.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

Neko Suite is a monorepo for building an AI-native creative workspace. It combines screenplay planning, storyboard canvas, video timeline editing, media preview, 3D authoring, 2D drawing, 2D puppet animation, audio work, asset management, marketplace installation, project search, and live interaction under one VS Code extension suite.

The architecture is intentionally contract-first:

- Webviews own UI and interaction only.
- Extension Host owns VS Code APIs, workspace integration, activation, and cross-extension orchestration.
- Rust engine owns heavy compute, media authority, GPU rendering, binary file access, and realtime runtimes.
- Protobuf, `@neko/shared`, and `@neko/neko-client` keep cross-layer contracts explicit.
- ADRs record stable decisions and boundaries only; implementation notes and stale examples are not part of the architecture source of truth.

## Product Shape

Neko Suite has three connected product layers:

| Layer              | Responsibility                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Creative IDE       | Story, Canvas, Cut, Preview, Model, Sketch, Puppet, Audio, Assets, Market, Dashboard, Search                                    |
| Creative Agent     | Intent understanding, Skill activation, capability discovery, planning, tool execution, rich media delivery, perception, memory |
| Interactive Engine | Scene, puppet, media, audio, device, ML, preview, and future stage runtimes powered by the Rust sidecar                         |

## Client Targets

Neko Suite currently splits product goals across three client targets instead of making every client carry the same full experience:

| Client             | Primary Goal                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TUI client         | Agent feature validation, model quality validation, real API runs, ablation experiments, regression tests, and structured reports                          |
| VS Code extensions | Lightweight plugin-based creative client for fast authoring, editing, preview, orchestration, and future extension capabilities                            |
| Standalone editor  | Professional creative client with a friendlier UI, higher rendering ceiling, fewer VS Code Webview constraints, and a more controllable automation surface |

See [Client Targets And Responsibilities](./docs/architecture/client-targets.md) for the detailed boundary.

## Workspace Packages

| Group                   | Packages                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| Core contracts          | `neko-types`, `neko-proto`, `neko-client`, `neko-auth`, `neko-ui`     |
| Engine                  | `neko-engine`                                                         |
| Agent and grounding     | `neko-agent`, `neko-dashboard`, `neko-entity`, `neko-search`          |
| Creative surfaces       | `neko-story`, `neko-canvas`, `neko-cut`, `neko-preview`, `neko-tools` |
| Assets and distribution | `neko-assets`, `neko-market`, `neko-suite`                            |
| Interactive creation    | `neko-model`, `neko-sketch`, `neko-puppet`, `neko-audio`, `neko-live` |

## Current Focus

The active product focus is cross-package hardening rather than adding more isolated prototypes:

1. One project graph across assets, entities, generated media, search, Dashboard, and Agent memory.
2. One Agent capability model across all creative packages.
3. One engine-first media and preview authority path.
4. One shared Webview UI system that preserves package ownership of domain logic.
5. End-to-end smoke paths from story intent to generated assets, timeline assembly, preview, export, and review.

## Quick Start

Install dependencies:

`pnpm install`

Build everything:

`pnpm build`

Run tests:

`pnpm test`

Run repository checks:

`pnpm check`

For Rust engine work:

`cd packages/neko-engine && cargo test --workspace`

## Repository Layout

| Path                                     | Purpose                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `packages/`                              | Workspace packages and VS Code extensions                |
| `openspec/`                              | Active and archived OpenSpec changes                     |
| `docs/`                                  | Architecture, domain, research, and status documentation |
| `quality/`                               | Machine-readable quality gate inputs for scripts and CI  |
| `README.md` / `README_CN.md`             | Project entry points                                     |
| `ARCHITECTURE.md` / `ARCHITECTURE_CN.md` | Current architecture overview                            |
| `TODO.md` / `TODO_CN.md`                 | Active work queue                                        |
| `ROADMAP.md` / `ROADMAP_CN.md`           | Directional product roadmap                              |
| `AGENTS.md` / `CONTRIBUTING.md`          | Contributor and repository working rules                 |

## Documentation

| Need                                                    | Start Here                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Project positioning, product shape, and quick start     | [README.md](./README.md)                                       |
| Current system architecture overview                    | [ARCHITECTURE.md](./ARCHITECTURE.md)                           |
| Full documentation navigation and writing rules         | [docs/README.md](./docs/README.md)                             |
| System architecture, ADRs, and cross-domain constraints | [docs/architecture/README.md](./docs/architecture/README.md)   |
| Creative-goal domain documentation                      | [docs/domains/README.md](./docs/domains/README.md)             |
| Research, competitor analysis, and technical analysis   | [docs/research/README.md](./docs/research/README.md)           |
| Gap, migration, health, and audit snapshots             | [docs/status/README.md](./docs/status/README.md)               |
| Active work queue                                       | [TODO.md](./TODO.md)                                           |
| Active design and implementation changes                | [openspec/](./openspec/)                                       |
| Directional product roadmap                             | [ROADMAP.md](./ROADMAP.md)                                     |
| Machine-readable quality gate inputs                    | [quality/README.md](./quality/README.md)                       |
| Repository working rules and contribution guide         | [AGENTS.md](./AGENTS.md), [CONTRIBUTING.md](./CONTRIBUTING.md) |

Documentation follows single-responsibility ownership: stable system constraints live in `docs/architecture/`, creative domain capabilities live in `docs/domains/<domain>/`, research lives in `docs/research/`, dated status snapshots live in `docs/status/`, in-flight changes live in `openspec/changes/`, and queued work lives in `TODO.md`.

## Contributing

Before opening a change, keep the architecture boundaries clear:

1. Webview, Extension Host, Rust engine, and shared contracts stay separated.
2. Cross-package work starts from contracts and small interfaces.
3. New state machines, public contracts, and failure paths need focused validation.
4. Documentation should describe current decisions and invariants, not stale code samples or completed implementation logs.

## License

GNU Affero General Public License v3.0 or later. See [LICENSE](./LICENSE).

- [Trademark Policy](./TRADEMARK.md)
