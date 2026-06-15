# TODO

> **Lang:** English | [中文](./TODO_CN.md)

This file tracks active client-side work for the current repository. It intentionally avoids completed sprint logs, stale implementation notes, and code-path task lists. Long-term direction lives in [ROADMAP.md](./ROADMAP.md).

## Active Themes

| Theme | Goal |
|-------|------|
| Project graph | Unify assets, entities, generated media, search, Dashboard, and Agent memory |
| Agent capability model | Let every creative package expose stable capability contracts |
| Engine-first media authority | Keep binary file access, preview, perception, and export under engine-owned paths |
| Shared Webview UI | Move repeated UI primitives into `neko-ui` without moving domain state out of feature packages |
| End-to-end smoke | Validate story intent to generated media, timeline assembly, preview, export, and review |

## Core Platform

- [ ] Keep `neko-proto`, `neko-types`, and `neko-client` aligned as the contract/client foundation.
- [ ] Continue Layer 0 utility cleanup without adding internal package dependencies.
- [ ] Protect Webview, Extension Host, shared contract, and Rust engine dependency boundaries.
- [ ] Expand focused architecture guards for cross-extension dependencies and Webview sandbox rules.

## Engine

- [ ] Finish interface and pipeline decoupling around media sinks, preview providers, GPU budget control, ML bridge, and plugin lifecycle parity.
- [ ] Complete device binding and runtime routing so realtime devices are engine-authoritative.
- [ ] Harden headless export and batch render paths for CI and automated Agent workflows.
- [ ] Keep runtime-scene, runtime-puppet, runtime-audio, runtime-media, runtime-device, and runtime-ml aligned behind host-agnostic contracts.
- [ ] Keep future XR/game/simulation runtimes behind explicit runtime-layering decisions.

## Agent

- [ ] Complete Draft / Plan / Apply workflow hardening around approval, evaluator feedback, memory projection, and session summaries.
- [ ] Replace hard-coded package assumptions with discovered capability providers and shared extension APIs.
- [ ] Unify generated media landing so chat, Canvas, Story, Cut, Assets, and Search see the same durable asset facts.
- [ ] Finish rich content delivery boundaries for storyboard, media card, comparison, gallery, report, model, audio, and puppet payloads.
- [ ] Continue Webview state consolidation into predictable stores and smaller context surfaces.

## Story, Canvas, And Cut

- [ ] Validate the main story-to-video path from screenplay scene to Canvas storyboard, generated assets, Cut timeline, preview, and export.
- [ ] Keep Canvas as the storyboard and visual orchestration surface, not a duplicate story or timeline authority.
- [ ] Refine Canvas block/container layout, candidate review, asset namespace boundaries, and large-canvas performance.
- [ ] Harden Cut import, edit, preview, export, and reimport smoke paths.
- [ ] Keep Story responsible for script facts, scene indexes, and text-first review.

## Preview, Tools, And Quality

- [ ] Complete engine-first preview coverage for documents, video, audio, panoramic media, and generated variants.
- [ ] Continue Media Diff and semantic review work through engine/client contracts.
- [ ] Keep quality checks separated from Agent subjective evaluation; deterministic checks should be reusable by tools and CI.
- [ ] Improve theme, focus, i18n, and shared UI consistency in inspection surfaces.

## Assets, Market, Entity, And Search

- [ ] Converge asset registry, generated asset provenance, entity identity, search indexing, and Dashboard projections.
- [ ] Finish project cache/search adapters for Story, Entity, Assets, media, documents, and Agent mentions.
- [ ] Keep marketplace client responsibilities separate from registry-server responsibilities.
- [ ] Expand local model/provider installation flows without putting server authority into the client.

## Interactive Creation

- [ ] Harden model, puppet, sketch, audio, and live surfaces around engine authority and shared UI contracts.
- [ ] Continue Live Mode boundaries so device input, tracking, scene composition, and recording are not duplicated across packages.
- [ ] Improve reusable motion, expression, material, lighting, and audio assets through shared contracts.
- [ ] Keep 2D/3D/video/audio composition paths aligned with engine runtime and export authority.

## Validation

Use the smallest validation command that covers the change:

- [ ] `pnpm check`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `cd packages/neko-engine && cargo test --workspace`
- [ ] Domain smoke checks for changed Story / Canvas / Cut / Agent / Engine flows

## Documentation Hygiene

- [ ] Keep architecture docs limited to decisions, boundaries, invariants, risks, and consequences.
- [ ] Move implementation tasks to OpenSpec or this TODO only when they are still active.
- [ ] Delete or rewrite stale examples instead of preserving them as historical contract.
- [ ] Keep README, Architecture, TODO, and Roadmap synchronized after architecture cleanup.
