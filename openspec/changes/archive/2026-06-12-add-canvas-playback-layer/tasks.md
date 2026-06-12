## 1. Shared Contracts

- [x] 1.1 Add shared Canvas playback contract types for metadata, node overrides, edge overrides, plans, units, transitions, behavior modes, advancement policies, adapter IDs, and diagnostics.
- [x] 1.2 Add normalization helpers that read playback metadata from canvas-level metadata plus node and connection extension metadata without requiring existing files to migrate.
- [x] 1.3 Add deterministic ordering helpers for container child order and outgoing playable transition order.
- [x] 1.4 Add shared tests for metadata normalization, entry resolution, terminal resolution, ordering fallbacks, and runtime-resource exclusion.

## 2. Playback Adapter Registry

- [x] 2.1 Implement a shared Playback Adapter Registry with `auto`, `storyboard`, `narrative`, `media-sequence`, and `generic` adapter IDs.
- [x] 2.2 Implement adapter auto-detection based on selected node, active graph shape, and explicit playback metadata.
- [x] 2.3 Implement diagnostics for missing playable units, missing entries, unsupported graph shapes, dangling source nodes, and dangling playable connection endpoints.
- [x] 2.4 Add adapter registry tests covering mixed Canvas graphs and explicit adapter overrides.

## 3. Storyboard and Generic Projection

- [x] 3.1 Implement storyboard projection for selected Scene containers, ordered Shot child units, selected Shot entry, and remaining-shot continuation.
- [x] 3.2 Implement storyboard Scene-to-Scene sequence continuation through playable `sequence` connections.
- [x] 3.3 Implement generic container playback with `self`, `children`, and `recursive` expansion strategies.
- [x] 3.4 Implement node-to-node playback through `sequence`, `default`, and `choice` connections while excluding `reference` by default.
- [x] 3.5 Add tests proving projection is side-effect free and does not mutate nodes, parent IDs, child IDs, or top-level connections.

## 4. Narrative and Media Boundaries

- [x] 4.1 Implement narrative adapter integration that reuses existing narrative graph extraction and runtime node boundaries.
- [x] 4.2 Add regression tests proving `scene`, `shot`, and `script` are not included in narrative runtime snapshots.
- [x] 4.3 Implement media-sequence projection for media nodes using durable asset/resource references and media-ended advancement defaults.
- [x] 4.4 Add tests for media units that require runtime preview resolution without persisting Webview or blob URLs.

## 5. Canvas Webview Playback UI

- [x] 5.1 Replace the single-controller assumption in the Canvas playback host with an adapter-aware active playback controller selection model.
- [x] 5.2 Extend playback controls with play/pause, previous/next, current route state, active adapter/mode display, and safe controller switching.
- [x] 5.3 Add branch choice UI for interactive mode using playback labels, `choiceText`, connection labels, and default continue labels.
- [x] 5.4 Add current unit highlighting and route/path feedback in Canvas without changing underlying selection semantics unexpectedly.
- [x] 5.5 Add Webview tests for storyboard playback controls, branch choice rendering, controller switching, and subsystem activation independence.

## 6. Preview and Bridge Integration

- [x] 6.1 Add Canvas-to-Preview messages for loading and refreshing `CanvasPlaybackPlan` while preserving existing narrative preview messages.
- [x] 6.2 Extend the Canvas Extension preview bridge to request generic playback plans and to surface typed diagnostics for unsupported preview surfaces.
- [x] 6.3 Extend Preview rendering to consume playback units by kind: storyboard summaries, media preview handoff, narrative handoff, and generic node highlight/summary.
- [x] 6.4 Add bridge and Preview tests for storyboard plan loading, narrative compatibility, media resource resolution, and unsupported graph diagnostics.

## 7. Documentation and Quality

- [x] 7.1 Update Canvas playback architecture documentation with adapter/profile versus behavior mode, ordering rules, branch rules, and non-goals.
- [x] 7.2 Update user-facing diagnostics text for `0 runtime nodes` cases to explain narrative versus storyboard/generic playback.
- [x] 7.3 Run focused TypeScript tests for `@neko-types`, `@neko-canvas/webview`, `@neko-canvas/extension`, and affected Preview/Story packages.
- [x] 7.4 Run the Neko quality review checklist for the non-trivial multi-module change and document residual risks.
