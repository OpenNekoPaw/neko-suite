# Neko Suite Roadmap

> **Lang:** English | [中文](./ROADMAP_CN.md)

This roadmap is directional, not a release promise. Active execution items live in [TODO.md](./TODO.md). Current architecture boundaries live in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Roadmap Principles

1. Finish shared product loops before adding more isolated prototypes.
2. Keep engine authority, shared contracts, and Webview sandbox boundaries intact.
3. Treat Agent capabilities as package-provided contracts, not hard-coded package knowledge.
4. Keep project assets, entity memory, search, and generated media grounded in one project graph.
5. Promote reusable creative assets across Story, Canvas, Cut, Model, Puppet, Sketch, Audio, and Live.

## Near-Term: Product Hardening

| Area | Direction |
|------|-----------|
| Story to video | Validate script scene planning, Canvas storyboard import, generation, Cut assembly, preview, and export as one smoke path |
| Agent grounding | Make generated outputs, file chips, assets, entity references, and task state durable and searchable |
| Engine-first preview | Keep preview, document reads, media probes, panoramic media, and export source access under engine/client authority |
| Shared UI | Continue moving generic Webview controls into `neko-ui` while feature packages own their domain logic |
| Quality gates | Expand deterministic checks, smoke tests, and architecture guards around high-risk cross-package flows |

## Mid-Term: Creative Tool Completion

| Area | Direction |
|------|-----------|
| Canvas | Better block/container layout, candidate review, asset/entity grounding, and large-canvas performance |
| Cut | Stronger import/edit/export round trips, AI storyboard landing, media QC, and engine-native compositing |
| Preview and Tools | Unified media/document preview, Media Diff, semantic review, and inspection workflows |
| Audio | Multi-track editing polish, recording closure, mixer automation, stem export, and Agent audio tools |
| Sketch and Puppet | Production authoring polish, reusable motion/expression assets, lighting/material paths, and export reliability |
| Model | Scene editing, LookDev, animation, IK, material handling, and Agent-facing model tools |

## Mid-Term: Project Intelligence

| Area | Direction |
|------|-----------|
| Entity identity | Character, scene, object, asset, script range, canvas node, timeline element, and media segment identity converge |
| Semantic search | OCR, ASR, embeddings, metadata extraction, and derived indexes feed one project search/cache service |
| Character memory | Long-form character facts and changes remain scoped by story, scene, shot, cut range, and provenance |
| Multimodal Git | Media-aware diff, semantic JSON review, entity impact analysis, and commit-level summaries |
| Dashboard | Project tasks, entities, assets, generated media, search, and Agent state become inspectable from one hub |

## Mid-Term: Agent Providers And Model Ecosystem

| Area | Direction |
|------|-----------|
| Official direct providers | After the NewAPI MVP stabilizes, verify Gemini, Grok, Claude, GPT, DeepSeek, GLM, and similar official APIs one by one for plan access, parameters, and error semantics |
| Proxy protocols | Add OneAPI, OpenRouter, SubAPI, and similar products as separate profiles or presets beyond the NewAPI MVP |
| Generation models | Expose Suno, Seedance, Kling, GPT image, and similar generation models through gateway capabilities first; mark direct adapters verified only after config, parameter mapping, and tests exist |
| Local generation models | Extend local image, video, audio, and music providers after local trust, install, resource, and hardware boundaries are clear |
| Capability layering | Model vision, tool calling, reasoning, image/video/audio/music generation, and similar features as capabilities instead of hard-coding them to vendor names |

## Engine And Runtime Evolution

| Area | Direction |
|------|-----------|
| Runtime layering | Keep scene, puppet, audio, media, device, ML, and future stage runtimes separated behind contracts |
| Device and Live | Engine-authoritative device input, tracking, calibration, recording, and live scene composition |
| Plugin and marketplace | Controlled extension points for formats, shaders, models, devices, exporters, connectors, and providers |
| Local model runtime | Local LLM, image, video, audio, and perception providers install through explicit trust and capability boundaries |
| Future runtimes | XR, game, simulation, and interactive stage work only graduate when contract and runtime boundaries are clear |

## Long-Term Product Directions

| Direction | Intent |
|-----------|--------|
| Interactive narrative | Branching Canvas graphs, standard scene text, separate preview/export runtime, and Agent-assisted iteration |
| Virtual production | Live avatars, device input, motion capture, scene composition, streaming, and recording |
| Reusable character bundles | Model, puppet, motion, expression, voice, material, memory, and Agent persona as portable creative assets |
| AI perceive-edit-verify loop | Agent observes project facts and media outputs, edits through contracts, and validates through deterministic and subjective feedback |
| Cross-host future | Keep engine and client host-agnostic so a future standalone creative host can reuse the same contracts |

## Documentation Policy

Roadmap entries should describe direction and priority only. Do not add code snippets, implementation logs, completed sprint notes, or stale status percentages here. Move active implementation work to [TODO.md](./TODO.md) or OpenSpec.
