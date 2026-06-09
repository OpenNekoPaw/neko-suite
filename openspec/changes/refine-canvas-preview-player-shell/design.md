## Context

Canvas Preview now receives `CanvasPlaybackPlan` messages for storyboard, media-sequence, narrative, and generic graph playback. The current Preview bridge layout is still inspector-shaped: a top toolbar, separate stage progress and numeric timeline rows, a large unit card, and a permanent Info/Branches/Diagnostics column. That layout exposes useful state, but it does not match the mental model users already have from the video/audio Preview panels.

Existing constraints remain unchanged:

- Canvas playback projection stays contract-first: `CanvasData -> CanvasPlaybackPlan -> Preview runtime/UI`.
- The Preview Webview MUST communicate with the Extension Host through `postMessage`.
- The Preview Webview MUST NOT persist runtime URLs, playback timers, current time, Webview URIs, media element state, or object URLs into `.nkc`.
- Narrative Runtime boundaries remain intact; storyboard `scene` / `shot` nodes do not become narrative runtime nodes.
- Resource resolution and cache materialization remain host-owned and are not solved by this layout change.

Five-layer analysis:

- **Responsibilities:** the shell owns layout, controls own transport/time, stage renderers own unit content, inspector owns metadata/diagnostics, and the bridge owns host messages.
- **Dependencies:** Canvas Preview depends on `CanvasPlaybackPlan` and host-provided resource resolution messages, not on audio/video engine stream internals.
- **Interfaces:** UI components consume `CanvasPlaybackUnit`, route state, transitions, diagnostics, and resolved preview URLs through narrow inputs.
- **Extension:** new unit renderers can be registered by `unit.kind` or `unit.renderMode` without changing the shell.
- **Testing:** tests can assert layout landmarks, route behavior, branch display, timeline timing, and runtime-state non-persistence.

## Goals / Non-Goals

**Goals:**

- Make Canvas Preview stage-first: the main panel renders the active audio, video, image, text, Fountain/script excerpt, storyboard, narrative, or generic node content.
- Put transport controls, time display, and the route progress/timeline at the bottom.
- Replace duplicate progress/timeline rows with one segmented progress rail.
- Avoid a fixed top narrow bar in the default layout. Current unit title/status may appear as an overlay inside the stage.
- Move Info, Branches, Diagnostics, and technical metadata into secondary overlays, drawers, or popovers.
- Keep playback layout independent from resource-cache fixes and media engine streaming internals.

**Non-Goals:**

- Do not change `CanvasPlaybackPlan` shape unless a renderer gap proves unavoidable.
- Do not implement video editing, audio mixing, heavy decoding, timeline editing, or engine-rendered composition in Canvas Preview.
- Do not persist current playback position, route history, branch hover state, resolved URLs, or player instances.
- Do not add a new standalone Canvas story format such as `.story`, `.nks`, or `.nkstory`.
- Do not move Canvas Preview into the `neko-preview` package in this change.

## Decisions

### Decision 1: Use a Player Shell, Not an Inspector Shell

Canvas Preview will adopt the video/audio Preview information architecture:

```text
Canvas Preview
┌────────────────────────────────────────────┐
│ Stage overlay: unit title / status / tools │
│                                            │
│          Active playback unit stage        │
│     image / video / audio / text / node    │
│                                            │
├────────────────────────────────────────────┤
│ Segmented timeline / progress              │
│ Previous  Play/Pause  Next  time / total   │
└────────────────────────────────────────────┘
```

The default layout will not reserve a fixed top narrow bar. VSCode already provides editor tab context, and a persistent top bar makes the panel feel like a management surface instead of a player.

Alternatives considered:

- Keep a top toolbar with title and controls. Rejected because it repeats the current inspector feel and splits playback controls from the timeline.
- Use a fixed top narrow status strip and bottom controls. Rejected as default layout because technical metadata is not primary preview content.
- Put all metadata in the stage. Rejected because diagnostics and detailed refs can obscure visual content.

### Decision 2: Reference Audio/Video Preview at the Shell Level Only

Canvas Preview should borrow layout principles from audio/video Preview:

- content stage is primary;
- transport and time are bottom-aligned;
- progress is scrubbable or route-clickable;
- metadata is secondary.

It should not depend on `neko-preview` media providers, streaming clients, or engine-specific playback messages. Media units may eventually delegate to existing media preview services, but the Canvas player shell must remain a `CanvasPlaybackPlan` consumer.

Alternatives considered:

- Directly reuse `VideoControls` / `AudioControls`. Deferred because those components are packaged in the preview Webview and assume media duration, volume, speed, and streaming behavior that do not map cleanly to storyboard/generic/narrative units.
- Fork the audio/video UI wholesale into the inline HTML bridge. Rejected because it couples Canvas Preview to media-specific assumptions and makes later React migration harder.

### Decision 3: Treat Stage Rendering as a Strategy

The shell will dispatch active unit content through a renderer boundary:

- `media-playback`: video/audio/image poster or playable media surface, using host-resolved preview variants.
- `story-preview`: storyboard shot/scene visual, selected generated image, shot text, dialogue, and timing.
- `narrative-preview`: narrative runtime summary or delegated narrative renderer boundary.
- `inline-preview`: generic image/text/media summary when a node exposes preview descriptors.
- `select-node`: fallback node summary and Canvas highlight.

This keeps renderer-specific logic out of transport controls and route construction.

Alternatives considered:

- Switch on node type inside one large DOM render function. Rejected because the existing preview surface already handles multiple adapters and will grow with Live2D/Spine and richer media.
- Create separate panels for storyboard, media sequence, and generic playback. Rejected because the point of `CanvasPlaybackPlan` is one common playback surface.

### Decision 4: Use One Segmented Timeline for Route and Time

Canvas Preview will merge the current stage progress row and numeric timeline into one segmented progress rail. Each segment maps to a route unit, with fill representing elapsed time for completed/current units. Clicking a segment seeks or jumps to that unit, depending on advance policy.

The segmented rail should support:

- timer-based units through `durationMs` or adapter fallback duration;
- media-ended units through resolved duration when available;
- interactive/manual units through route position and branch pause state;
- tooltips or labels for unit title, kind, duration, and warnings.

Alternatives considered:

- Keep a progress rail plus numeric timeline. Rejected because it duplicates the same route and consumes vertical space.
- Use only a continuous media-style slider. Rejected because storyboard and graph playback needs visible unit boundaries.

### Decision 5: Make Inspector Surfaces Secondary

Info, Branches, Diagnostics, adapter/mode/policy, resource refs, and debug data will be exposed through stage overlay buttons and drawer/popover surfaces. Branch choices are playback decisions, so they may appear as prominent choice chips above the bottom controls when the runtime pauses.

Alternatives considered:

- Keep the permanent right details panel. Rejected because it narrows the stage and makes preview feel like a property inspector.
- Hide diagnostics entirely. Rejected because playback/resource diagnostics are important for authoring and debugging.

## Risks / Trade-offs

- **Inline HTML grows larger** -> Keep functions grouped by shell, stage, controls, timeline, inspector, and route state; consider a future React Webview entry when the bridge becomes too large.
- **Media controls differ from graph controls** -> Use common transport primitives but conditionally expose volume/speed/media-ended controls only when the active unit supports them.
- **Stage overlays may obscure content** -> Keep overlays compact, hideable, and theme-aware; avoid long technical labels in the stage.
- **Interactive branches complicate timeline totals** -> Treat unchosen branches as unavailable future route units until selected; show route total for the current route, not the whole graph.
- **Resource resolution failures look like layout failures** -> Stage renderers must show explicit unavailable states while keeping playback navigation usable.

## Migration Plan

No Canvas file migration is required. The change is a Preview presentation/refactor over existing `CanvasPlaybackPlan` messages.

Rollout can happen in batches:

1. Introduce player-shell landmarks and bottom control layout while preserving current playback behavior.
2. Replace duplicate progress/timeline rows with the segmented timeline.
3. Move Info/Branches/Diagnostics into secondary surfaces.
4. Add unit-kind stage renderers and explicit unavailable states.

Rollback can restore the previous inline Preview layout without changing saved `.nkc` data or playback plan projection.

## Open Questions

- Should branch choices appear above the bottom controls for all interactive adapters, or only when there are multiple enabled transitions?
- Should the first implementation expose a speed control for non-media timer playback, or keep speed out until route timing is better defined?
- Should Canvas Preview eventually move from inline bridge HTML into a dedicated React Webview entry for maintainability?
