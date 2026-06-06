## Context

The unified viewport work has already delivered shared `ViewportProtocol` contracts, `@neko/ui` `ViewportShell`, model and puppet controller migrations, prediction lifecycle, and live fallback diagnostics. The unfinished live work is different in kind: neko-live needs an engine-owned compositor that can combine multiple visual sources into one authoritative stream, then expose scene/output controls through `LiveController`.

Existing useful foundations:

- `RenderStreamDescriptor`, `RenderFrameMeta`, `H264StreamClient`, and `/v1/streams/:stream_id` already support engine-owned visual streams.
- `ViewportShell` can host a custom canvas/video surface and delegate input, overlays, toolbar extensions, and scene events to an `ISceneController`.
- Engine GPU code already has `GpuLayer`, `GpuCompositor` / `TextureCompositor`, and export paths that adapt scene/puppet output into generic layers.
- neko-live already has device/session/recording services, local VRM/Puppet fallback renderers, and explicit fallback diagnostics.

The missing pieces are the live compositor scene contract, layer/source routing, stream producer, `scene:live:*` commands, and parity gates that allow the local R3F renderer to be removed or isolated.

## Goals / Non-Goals

**Goals:**

- Define a contract-first live compositor scene model with stable layer ids, source refs, transforms, blend/opacity, tracking overlay settings, output routes, diagnostics, and revisions.
- Produce an engine-owned H.264 compositor stream described by `RenderStreamDescriptor` and aligned with `RenderFrameMeta`.
- Route live scene preset, layer update, tracking overlay, and output route commands through `ViewportProtocol`/ActionRouter envelopes.
- Implement a neko-live `LiveController` that consumes the compositor stream through `ViewportShell`.
- Keep local R3F/Puppet preview as explicit non-authoritative fallback until compositor parity and latency gates pass.
- Add focused contract, routing, fallback, and latency tests before deleting or isolating local renderer code.

**Non-Goals:**

- Do not redefine generic ViewportProtocol DTOs or move React/DOM code into L0.
- Do not make `@neko/ui` know about live-specific layers, devices, OBS, RTMP, or tracking.
- Do not route high-frequency device/tracking frames through Extension Host.
- Do not remove neko-live local renderer before a compositor stream can display equivalent avatar/preset output.
- Do not implement every output backend in the first pass; unsupported output routes may return explicit diagnostics.

## Decisions

### Decision 1: Live compositor scene is explicit contract data

Shared contracts will represent `LiveCompositorScene`, `LiveCompositorLayer`, source references, presets, tracking overlay options, output routes, and diagnostics as JSON-serializable DTOs. Layer refs use stable ids and source descriptors rather than direct Webview objects or renderer handles.

Alternative considered: send ad-hoc `scene:live:*` payloads from neko-live. Rejected because layer routing, output parity, and Agent/device integrations need a stable contract and TS/Rust parity tests.

### Decision 2: Engine stream descriptor stays compatible with existing realtime video

The compositor stream returns the existing `RenderStreamDescriptor` shape, with `viewportId`, codec/container/frame header, dimensions, fps, and optional quality/diagnostic metadata. Live-specific details live in scene state and diagnostics, not in a parallel video descriptor.

Alternative considered: create a separate `LiveCompositorStreamDescriptor`. Rejected for the first pass because `H264StreamClient` and `ViewportShell` already understand engine render streams; duplicating the descriptor would split the Webview video path again.

### Decision 3: Compositor owns visual truth; LiveController owns UI orchestration

Engine owns final visual composition, frame metadata, layer application, and output parity. `LiveController` supplies toolbar/context menu descriptors, sends scene commands, receives scene events, and marks fallbacks. It does not render persistent puppet/model/VRM scene layers locally when compositor stream parity is available.

Alternative considered: keep live as a local renderer and only use ViewportShell around it. Rejected because it preserves preview/export drift and makes compositor/output testing impossible.

### Decision 4: Sources adapt into generic layers through service boundaries

Scene/model, puppet, camera/background, and overlay sources should produce or reference generic `GpuLayer`/texture inputs through engine service boundaries. The compositor must remain domain-agnostic after extraction; domain-specific conversion happens before layer composition.

Alternative considered: add puppet/model/live branches inside the compositor. Rejected because it violates the existing `engine-2d3d-co-rendering` direction that compositor receives generic layer refs.

### Decision 5: Output routing is commandized but capability-gated

Recording, OBS virtual camera, RTMP, and local monitor outputs are represented as output routes with capability diagnostics. Routes that are not implemented in the first pass must fail with explicit unsupported diagnostics instead of silently falling back to Webview canvas recording.

Alternative considered: leave output routing outside the compositor change. Rejected because live visual truth is inseparable from what gets recorded or broadcast.

## Risks / Trade-offs

- [Risk] Live compositor scope expands into a full broadcast studio. -> Mitigation: first pass defines contracts, one monitor stream, basic layer presets, and explicit unsupported diagnostics for advanced outputs.
- [Risk] GPU layer interop differs across scene, puppet, and camera sources. -> Mitigation: adapt each source behind service boundaries and test compositor with synthetic layers before integrating complex runtimes.
- [Risk] Latency regresses compared with local R3F preview. -> Mitigation: keep prediction/fallback diagnostics, measure command-to-frame and tracking-to-frame budgets, and only remove local renderer after parity gates pass.
- [Risk] Webview and Extension Host regain high-frequency responsibilities. -> Mitigation: device/tracking streams and compositor commands bypass Extension Host except for setup, permissions, resource URI conversion, and lifecycle.
- [Risk] Existing recording workflow depends on Webview canvas capture. -> Mitigation: retain current canvas recording as fallback until engine output routes are implemented, and label it non-authoritative for parity claims.

## Migration Plan

1. Add shared TS and Rust live compositor contracts with fixture parity.
2. Add engine ActionRouter routes and in-memory compositor scene state with revision-aware `scene:live:*` commands.
3. Implement a synthetic-layer compositor stream producer using existing `RenderStreamDescriptor` and `StreamRegistry`.
4. Add source adapters for background/camera, puppet, and model/scene layers in priority order, with fallback diagnostics for unsupported sources.
5. Implement `LiveController` and migrate neko-live display to `ViewportShell` when a compositor descriptor is available.
6. Add latency and fallback tests, then isolate or remove persistent local R3F/Puppet renderer once parity is proven.

Rollback strategy: keep `NEKO_LIVE_RENDERER_FALLBACK_ENABLED` and the local renderer diagnostics while the compositor stream is behind a capability flag. If compositor start fails, neko-live remains usable as a clearly non-authoritative preview without claiming output/export parity.

## Open Questions

- Which output route should be implemented first after monitor preview: file recording, OBS virtual camera, or RTMP?
- Should live compositor state persist as a `.nklive` document, attach to `.nkentity`, or remain session-only for the first pass?
- Should camera/background input enter the compositor as engine device stream textures, media elements, or pre-rendered image/video layers?
- What is the target first-pass latency budget for tracking-to-frame and command-to-frame on typical developer hardware?
