## Context

`docs/architecture/adr-viewport-stream-control-boundary.md` is Accepted and clarifies a bug-prone boundary in the current engine-stream viewport architecture: H.264 video frames are the visual result, not the semantic control plane. Selection, transform, preview modes, live output routes, bone edits, BlendShape edits, and toolbar actions must complete through control commands, acknowledgements, deltas/snapshots, store updates, and prediction reconciliation.

The previous viewport and compositor changes already delivered the major foundations:

- `@neko/shared` has ViewportProtocol DTOs, `ISceneController`, overlays, toolbar descriptors, and frame metadata types.
- `@neko/ui` has `ViewportShell`, `OverlayRenderer`, `ViewportToolbar`, and a prediction lifecycle.
- `packages/neko-client` has H.264 stream and scene-control clients.
- `neko-model`, `neko-puppet`, and `neko-live` have first controller integrations, but their semantic loops have different gaps.
- Engine routes already emit video/frame metadata and accept scene-control commands, but metadata backpressure and control-flow QA gates are not yet first-class.

Five-layer analysis:

| Layer | Responsibility | Dependency Direction | Interface | Extension Point | Test Focus |
|-------|----------------|----------------------|-----------|-----------------|------------|
| Engine stream | Produce pixels and frame metadata | Engine -> client stream DTOs | `RenderStreamDescriptor`, `RenderFrameMeta` | metadata sideband / scene-control metadata event | frame meta latency, revision, applied seq |
| Engine control | Own semantic state and mutations | Webview -> scene-control -> ActionRouter | `ViewportCommand`, domain commands, ack/error/delta/snapshot | domain handlers | stale revision, rejection, snapshot refresh |
| Client transport | Decode video and carry control messages | Webview uses `H264StreamClient` and `SceneControlSocket` | stream callbacks, control callbacks | diagnostics hooks, wire guards | disconnect, degraded state, metadata staleness |
| Shared UI shell | Capture input and render overlays/toolbars | UI depends on L0 contracts only | `ViewportShell`, `ISceneController` | controller methods, overlay descriptors | event ownership, chrome filtering, prediction |
| Domain controllers | Convert user intent into domain commands | domain packages depend on shared contracts | model/puppet/live controllers | per-domain query/command/store adapters | selection, drag, toolbar, ack/store updates |

## Goals / Non-Goals

**Goals:**

- Enforce the accepted rule: video shows visual truth; scene-control owns semantic operations.
- Add measurable frame metadata latency/staleness diagnostics and a staged migration path for metadata backpressure.
- Make `ViewportShell + ISceneController` the default input ownership model and prevent duplicate event ownership between shell and `InteractionLayer`.
- Close semantic loops for model selection/transform/preview, puppet bone/BlendShape editing, and live preset/output/tracking controls.
- Add PR/QA gates that assert command, ack/error, delta/snapshot, store, overlay, and prediction behavior instead of only video changes.
- Keep L0/L2 package boundaries and VSCode Webview sandbox constraints intact.

**Non-Goals:**

- Do not replace H.264 streaming or introduce a new video codec/container.
- Do not immediately split frame metadata into a new WebSocket unless diagnostics prove sideband backpressure breaks overlay alignment.
- Do not reimplement ViewportShell or ViewportProtocol from scratch.
- Do not remove all local fallback preview paths; this change requires explicit degraded/non-authoritative labeling and control-flow isolation.
- Do not make live support object-level model/puppet gizmo editing; live only needs scene/control-button closure.

## Decisions

### Decision 1: Control-flow acceptance becomes a gate

Every selection, transform, preview-mode, preset, output route, tracking overlay, BlendShape, or bone edit workflow must prove the semantic chain:

`UI action -> command/query -> ack/error/delta/snapshot -> controller/store -> overlay/toolbar/inspector/timeline`.

Alternative considered: accept visual frame changes as proof. Rejected because video may continue to update while controls are disconnected, stale, or failing silently.

### Decision 2: Keep frame metadata sideband first, but make migration deterministic

`renderFrameMeta` remains on the video WebSocket for the first implementation batch. The implementation adds latency/stale diagnostics, prediction fallback behavior, and tests for ack-before-frame cases. If diagnostics show video backpressure delays metadata beyond the interaction budget, the first migration target is a scene-control metadata event. A separate metadata WebSocket is reserved for cases where scene-control metadata events are too frequent or need isolation from command ack traffic.

Alternative considered: split metadata immediately. Rejected because the current bridge works for many paths and splitting now would add synchronization complexity before we have latency evidence.

### Decision 3: `ViewportShell + ISceneController` owns input by default

Pointer, key, wheel, toolbar, and context-menu semantics enter through ViewportShell and are delegated to one controller. `InteractionLayer` remains a rendering layer unless a domain explicitly promotes it to the only delegated interaction layer; in that case shell must not also route the same event to another controller path.

Alternative considered: let each editor's interaction layer own DOM events. Rejected because it recreates per-editor event systems and conflicts with unified-viewport-protocol.

### Decision 4: Domain controllers own semantic state, not shared UI

Model, puppet, and live controllers each own their selection, drag, pending command, degraded state, and domain store updates. `@neko/ui` only renders the descriptors and invokes callbacks. Domain controllers must not import each other.

Alternative considered: put selection/drag/gizmo logic in `@neko/ui`. Rejected because model, puppet, and live have different semantics and authority sources.

### Decision 5: Degraded states must be visible and testable

If scene-control disconnects, metadata becomes stale, frame metadata lags, or a command is rejected, the user must see a diagnostic state and predictions must roll back or remain clearly marked as pending. Silent local-only mutation is not acceptable.

Alternative considered: keep optimistic UI state until the next video frame. Rejected because it masks command failures and causes editor state drift.

## Risks / Trade-offs

- [Risk] Metadata diagnostics add noise without fixing alignment. -> Mitigation: use a small set of actionable states: fresh, stale, missing, delayed, superseded, degraded.
- [Risk] scene-control metadata events could overload the control channel. -> Mitigation: only migrate to P1 when sideband latency proves harmful; keep metadata low-frequency or ack-correlated first.
- [Risk] Input ownership refactor breaks existing editor gestures. -> Mitigation: migrate one domain path at a time, add event-ownership tests, and keep fallbacks non-authoritative.
- [Risk] Prediction becomes inconsistent across model and puppet. -> Mitigation: share lifecycle primitives while keeping domain payload guards local.
- [Risk] Live controls pass unit tests but fail against unsupported output routes. -> Mitigation: require explicit unsupported diagnostics and authoritative/fallback assertions.

## Migration Plan

1. Add shared diagnostics and test utilities for control-flow acceptance and frame metadata staleness.
2. Harden `H264StreamClient` / frame meta bridge to expose metadata delay, stale revision, and ack-before-frame conditions.
3. Harden `SceneControlSocket` and domain controllers to expose connected/degraded states and command ack/error lifecycle.
4. Migrate model interaction ownership to `ViewportShell + ModelController`, storing selected node, projected bounds, gizmo anchor, drag state, and prediction revision.
5. Migrate puppet viewport editing so pointer move/up produce native bone drag commands and prediction/ack/rollback state; align local hit testing with frame transform or engine query results.
6. Harden live controller toolbar/context-menu actions so preset, tracking overlay, output route, and layer visibility changes require ack/error and update authoritative compositor scene state.
7. Add PR/QA tests for semantic state changes and metadata staleness across all three domains.
8. Keep video-sideband metadata as P0. If diagnostics exceed budget, implement P1 scene-control metadata events in a follow-up PR under this change. Implement P2 independent metadata WebSocket only if P1 cannot satisfy frequency/isolation requirements.

Rollback strategy: each domain can keep previous visual fallback paths behind explicit non-authoritative diagnostics. Control-flow gates are additive; if a new domain path fails, disable that control or mark it degraded rather than reverting shared protocol contracts.

## Open Questions

- What exact local interaction budget should trigger P1 metadata migration: fixed milliseconds, frame-count threshold, or percentile over a sliding window?
- Should scene-control metadata events be emitted only after commands/queries, or also periodically while a viewport is active?
- Should puppet bone hit testing stay local after viewTransform alignment, or should it move to engine hit-test queries for parity with model selection?
- Which live output route should receive the first authoritative end-to-end control-flow test: monitor, recording, OBS virtual camera, or RTMP?
