# System Architecture Overview

> **Lang:** English | [中文](./ARCHITECTURE_CN.md)

This document is the current architecture entry point for Neko Suite. It describes stable boundaries and invariants only. For detailed architecture records, ADRs, and domain documentation navigation, see [docs/README.md](./docs/README.md) and [docs/architecture/README.md](./docs/architecture/README.md).

## Positioning

Neko Suite is a VS Code integrated creative suite with three cooperating planes:

| Plane | Responsibility |
|-------|----------------|
| Authoring plane | React Webviews for story, canvas, timeline, preview, model, sketch, puppet, audio, assets, market, dashboard, and search |
| Orchestration plane | VS Code Extension Host packages for workspace access, activation, cross-extension coordination, Agent sessions, and command routing |
| Engine plane | Rust sidecar for media authority, GPU rendering, codecs, audio, device I/O, ML inference, runtime scene and puppet state |

The product challenge is to expose professional creative and AI workflows inside VS Code without violating Webview sandbox constraints or duplicating engine-owned computation in TypeScript.

## Layering

| Layer | Owner | Rules |
|-------|-------|-------|
| L0 shared contracts | `neko-types`, `neko-proto`, selected schema and utility modules | Zero internal package dependency; reusable by Extension and Webview |
| L1 host services | Extension Host packages and `neko-client` adapters | May use VS Code APIs; must not import React |
| L2 Webview UI | React packages and `neko-ui` | Browser sandbox only; must not import `vscode` or Node APIs |
| Engine | `neko-engine` Rust crates | Authoritative compute and runtime state; host agnostic |

Dependency direction flows toward contracts and engine/client boundaries. Feature extensions should not depend directly on each other when a shared contract, command bus, or exported API can express the relationship.

## Communication

| Boundary | Mechanism | Invariant |
|----------|-----------|-----------|
| Webview to Extension Host | `postMessage` through a typed bridge | Webview never calls VS Code or Node APIs directly |
| Extension Host to Engine | `EngineClient` over HTTP/WebSocket, plus controlled N-API surfaces | Extension Host does not duplicate engine compute |
| Webview streaming to Engine | Authorized WebSocket stream descriptors | Extension Host brokers authority; media frames avoid Node relay where possible |
| Extension to Extension | Shared exported APIs or VS Code command bus | No hidden package-level dependency between feature extensions |

## Core Contracts

| Contract | Source of truth |
|----------|-----------------|
| Cross-layer IDL | `packages/neko-proto` |
| Shared TypeScript contracts and infrastructure | `packages/neko-types` |
| Cross-domain content semantics | `packages/neko-content` |
| Engine client and stream clients | `packages/neko-client` |
| Media and runtime authority | `packages/neko-engine` |
| Architecture decisions | This document and `docs/architecture/` |
| Quality gates | `AGENTS.md`, `CONTRIBUTING.md`, and package-level checks |

## Engine Authority

The Rust engine is the authority for:

- media probing, decoding, encoding, export, and binary file access;
- GPU rendering and stream production;
- scene, puppet, audio, device, media, and ML runtime state;
- compute-heavy perception and transformation pipelines;
- runtime capabilities that must survive future host changes.

TypeScript may orchestrate, display, request, and validate, but it should not reimplement engine-owned media or runtime computation.

## Webview Constraints

Every Webview must obey these constraints:

1. No direct Node.js API access.
2. No direct VS Code API access outside the host bridge.
3. Workspace and extension resources are exposed through host-approved URIs.
4. Durable project data never stores Webview URIs, blob URLs, stream IDs, preview tokens, or engine tokens as source facts.
5. UI components consume abstract host bridges and shared contracts, not concrete Extension Host services.

## Agent Workflow

The Agent follows a stable Draft / Plan / Apply workflow.

Key invariants:

- Skills describe behavior and domain strategy; they are not workflow engines.
- Approval, policy, memory, runtime, schema, evaluator, and prompt concerns are separate control planes.
- High-cost or irreversible actions require an approval path.
- Agent tools operate through package capabilities and shared contracts, not direct Webview coupling.
- Generated media and project facts must be grounded back into project assets, entity memory, or search indexes before they become durable context.

## Creative Data Flow

Neko Suite converges on a shared creative loop:

1. User intent enters through Agent, Story, Canvas, or another creative surface.
2. Intent is grounded against project files, assets, entities, memory, and current UI selection.
3. Agent and package capabilities create or modify structured project artifacts.
4. Engine-owned preview, render, perception, or export paths produce observable results.
5. Results are indexed back into assets, search, entity memory, and review surfaces.

Story, Canvas, Cut, Preview, Assets, Entity, Search, Agent, and Engine each keep their own responsibilities; shared contracts connect them.

## File And Path Policy

Persistent project records store portable references:

- workspace-relative paths;
- `${VAR}/path` style paths resolved by the path system;
- stable resource references;
- document source references with locators;
- asset/entity IDs and provenance records.

Persistent records must not store absolute machine paths unless explicitly scoped as local settings, nor transient runtime handles such as Webview URIs, blob URLs, stream IDs, or preview tokens.

## Documentation Policy

Architecture documentation should describe current decisions, boundaries, invariants, risks, and consequences. Do not add code snippets, command transcripts, implementation status, path indexes, or completed development logs to architecture entry documents.

Documentation follows these categories:

- System-level architecture and ADRs live in `docs/architecture/`.
- Domain capabilities and domain-internal architecture live in `docs/domains/<domain>/`.
- Research, competitor analysis, and technical spikes live in `docs/research/`.
- Gap, migration, and health snapshots live in `docs/status/`.
- Active design changes live in `openspec/changes/`.

## Design Principles

1. Contract first, implementation second.
2. Keep interfaces small and stable.
3. Prefer dependency injection, registries, strategies, and event boundaries over direct package coupling.
4. Keep engine computation authoritative and host agnostic.
5. Keep Webview UX rich but sandbox-correct.
6. Treat architecture documents as current contracts or explicit historical snapshots, not implementation ledgers.
