## Context

The ADR `docs/architecture/adr-unified-viewport-protocol.md` defines a shared viewport architecture for engine-stream editors. neko-model already uses engine H.264 streams; neko-puppet is migrating toward engine-rendered previews; neko-live still carries duplicated local R3F/Three.js rendering that should become compositor control. Each surface currently owns parts of video display, input capture, overlay drawing, toolbar behavior, and command routing independently.

This change introduces a shared contract and UI shell while preserving domain ownership:

- L0 `@neko/shared` owns DTOs and interfaces only.
- L2 `@neko/ui` owns React/DOM components such as ViewportShell, OverlayRenderer, and ViewportToolbar.
- Each editor implements its own `ISceneController`.
- Engine remains the authority for scene state, hit tests, transforms, render frames, and compositor output.
- Extension Host remains a low-frequency VSCode boundary and must not relay high-frequency frame/input traffic.

## Goals / Non-Goals

**Goals:**

- Define a shared ViewportProtocol envelope for engine-mediated viewport and scene commands.
- Define frame metadata that aligns video frames, scene revision, applied command sequence, and overlay coordinate transforms.
- Provide a reusable ViewportShell for video display, input capture, shell-local pan/zoom state, overlay rendering, and toolbar extension points.
- Keep shell-local interactions local while routing engine-mediated operations through ActionRouter.
- Migrate model, puppet, and live editors through domain-specific controllers without cross-extension implementation imports.
- Reposition neko-live as compositor scene/output orchestration rather than persistent local 2D/3D rendering.

**Non-Goals:**

- Do not define puppet-specific native runtime behavior; that belongs to the native puppet change.
- Do not move React/DOM components into L0.
- Do not force all pan/zoom/wheel operations through engine commands.
- Do not remove every legacy VideoViewport or R3F fallback in one PR; isolate fallbacks and migrate by phase.
- Do not make ViewportShell import domain packages or editor implementations.

## Decisions

### Decision 1: Split L0 protocol from L2 UI shell

`ViewportCommand`, `ViewportEvent`, `ViewportFrameMeta`, `ISceneController`, input DTOs, overlay descriptors, and toolbar descriptors live in `@neko/shared`. `ViewportShell`, `OverlayRenderer`, and `ViewportToolbar` live in `@neko/ui` because they depend on React/DOM.

Alternative considered: place ViewportShell and interfaces in one package for convenience. Rejected because it would blur L0 boundaries and make non-React consumers pull UI dependencies.

### Decision 2: Use protocol envelopes only for engine-mediated operations

Shell-local interactions such as pan, zoom, resize, and quality controls can be stored in local ViewportShell state or logged as local commands. Engine-mediated viewport actions such as select, marquee, transform, camera, and all `scene:*` writes use the `ViewportCommand` envelope with `protocolVersion`, `seq`, `correlationId`, `baseRevision`, `timestamp`, and `source`.

Alternative considered: send every viewport interaction through the engine. Rejected because local visual navigation would pay unnecessary latency and overload the command channel.

### Decision 3: Register engine viewport routing before editor migrations

ActionRouter must have a shared `viewport_controller` before model or puppet migrations rely on engine-mediated selection, transform, camera, or hit-test behavior. Editor migrations depend on that route, not the other way around.

Alternative considered: migrate editors first with temporary per-editor command routes. Rejected because it would duplicate protocol mapping and make later convergence harder.

### Decision 4: Prediction overlays reconcile through ack and frame metadata

ViewportShell and controllers may render local overlays for immediate feedback. Predictions must be tagged by command sequence, correlation id, viewport id, and base revision, and cleared or rolled back on ack, error, resync, timeout, topology change, or matching frame metadata.

Alternative considered: rely only on the video frame stream for feedback. Rejected because 2D bone/vertex editing and 3D gizmo manipulation need sub-frame interaction feedback.

### Decision 5: Frame metadata carries overlay coordinate alignment

Engine frame metadata must include viewport identity, revision, applied sequence information, and a view transform matrix suitable for overlay alignment. 2D overlay tests require pixel-level tolerance, while 3D overlays can use projected screen-space data.

Alternative considered: let each Webview compute overlay transforms independently. Rejected because it recreates dual-renderer drift and makes WYSIWYG validation unreliable.

### Decision 6: SceneController isolates domain behavior

ViewportShell delegates input, overlay descriptions, toolbar extensions, context menus, and scene events to `ISceneController`. Puppet, model, and live controllers remain in their owning extensions and do not import each other.

Alternative considered: make ViewportShell understand `sceneType` branches. Rejected because every new scene type would grow shared UI code and violate extension autonomy.

### Decision 7: neko-live becomes compositor control

Once engine compositor output exists, neko-live consumes one composited stream and controls layer presets, output routing, OBS/RTMP/recording, and tracking overlay configuration. Persistent local R3F/Three.js rendering becomes fallback or deleted code, not visual truth.

Alternative considered: keep live as a separate local renderer and only share toolbar pieces. Rejected because it preserves preview/export divergence and duplicates renderer logic already owned by engine.

## Risks / Trade-offs

- [Risk] Shared shell becomes too generic and hard to use. -> Mitigation: keep `ISceneController` small, push domain widgets into toolbar/context-menu extension points, and add controller fixtures.
- [Risk] Prediction overlays can drift from engine output. -> Mitigation: tie lifecycle to ack, revision, applied seq, topology events, and frame metadata; add rollback tests.
- [Risk] `payload: Record<string, unknown>` weakens type safety. -> Mitigation: keep envelope generic but require per-domain payload schemas/guards in controllers and engine handlers.
- [Risk] Editor migrations block on missing engine routes. -> Mitigation: implement `viewport_controller` before model/puppet/live migrations and provide shell-local fallback only for non-authoritative operations.
- [Risk] Video pipeline failure disables editing surfaces. -> Mitigation: keep explicit static snapshot/degraded preview modes and make non-authoritative fallbacks visibly marked.
- [Risk] Live compositor work expands scope. -> Mitigation: separate ViewportShell migration from compositor implementation and gate live output routing behind V2 tasks.

## Migration Plan

1. Add L0 TypeScript ViewportProtocol and Rust `engine-types` DTOs with contract tests.
2. Add `@neko/ui` ViewportShell, OverlayRenderer, and ViewportToolbar using existing video stream clients where possible.
3. Register engine `viewport_controller` and map engine-mediated viewport commands into ActionRouter.
4. Migrate neko-model to ViewportShell through `ModelController` and verify selection/transform/camera paths.
5. Migrate neko-puppet through `PuppetController` adapter after native puppet editor work and viewport prerequisites are available.
6. Migrate neko-live to ViewportShell for composited stream display and then add engine compositor layers/output routing. The implementation and parity gates are owned by follow-up change `implement-live-compositor-stream`; see `openspec/changes/implement-live-compositor-stream/notes/parity-cleanup.md` for the current cleanup boundary.
7. Remove or isolate duplicated local video/input/overlay/R3F code after each surface has parity tests.

Rollback strategy: each editor migration can keep its previous viewport component behind a capability flag until ViewportShell parity is verified. Protocol DTOs are additive and versioned with `protocolVersion: 1`.

## Open Questions

- Should `ViewportLocalCommand` be a formal shared type or an internal ViewportShell implementation detail?
- Should frame metadata reuse existing `RenderFrameMeta` with added fields or introduce a separate `ViewportFrameMeta` bridged from render metadata?
- Which package owns reusable WebCodecs stream hooks after ViewportShell moves into `@neko/ui`: `@neko/ui`, `@neko/client`, or a thin adapter layer?
- How much of neko-live R3F should remain as a development fallback after compositor parity is available?
