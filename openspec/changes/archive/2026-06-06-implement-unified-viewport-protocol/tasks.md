## 1. Protocol Contracts

- [x] 1.1 Add L0 TypeScript `ViewportCommand`, `ViewportEvent`, `ViewportFrameMeta`, input DTO, overlay descriptor, toolbar descriptor, and `ISceneController` contracts in `@neko/shared`.
- [x] 1.2 Add runtime guards/schema fixtures for protocol envelopes, `protocolVersion: 1`, `baseRevision`, ack/error events, and serializable payloads.
- [x] 1.3 Add Rust `engine-types` DTO mirrors with serde coverage and fixture parity tests against TypeScript protocol fixtures.
- [x] 1.4 Define per-domain payload guard extension points without adding puppet/model/live implementation imports to L0.
- [x] 1.5 Add documentation for Shell-local vs Engine-mediated command boundaries.

## 2. ViewportShell UI Foundation

- [x] 2.1 Add or extend the L2 `@neko/ui` package boundary for ViewportShell dependencies while keeping DTO imports from `@neko/shared`.
- [x] 2.2 Implement `ViewportShell` with engine video surface mounting, input capture, scene controller delegation, and local viewport state.
- [x] 2.3 Implement `OverlayRenderer` with descriptor rendering, z-ordering, stale metadata handling, and frame transform application.
- [x] 2.4 Implement `ViewportToolbar` with shared controls and domain toolbar extension descriptors.
- [x] 2.5 Implement shell-local pan, zoom, resize, and quality controls without per-frame engine command traffic.
- [x] 2.6 Add component/unit tests for input delegation, toolbar extension rendering, overlay descriptor rendering, and shell-local command behavior.

## 3. Prediction And Frame Metadata

- [x] 3.1 Implement a shared prediction lifecycle for create, update, commit, rollback, timeout, and invalidation by revision/topology/frame metadata.
- [x] 3.2 Add prediction reconciliation for command ack, command error, matching applied sequence frame metadata, and resync events.
- [x] 3.3 Extend engine frame metadata emission or bridge existing `RenderFrameMeta` into `ViewportFrameMeta` with viewport id, scene revision, applied sequence, timestamp, and transform data.
- [x] 3.4 Add overlay alignment tests for 2D transform matrices and 3D projected screen-space overlay descriptors.
- [x] 3.5 Add diagnostics for stale overlay metadata and incompatible viewport/revision combinations.

## 4. Engine Viewport Routing

- [x] 4.1 Register `viewport_controller` in ActionRouter before editor migrations depend on engine-mediated viewport commands.
- [x] 4.2 Implement `viewport:select` routing with engine hit-test results tagged by scene id, viewport id, and revision.
- [x] 4.3 Implement `viewport:marquee` and selection set routing with revision checks.
- [x] 4.4 Implement `viewport:transform` routing with base revision validation and ack/error responses.
- [x] 4.5 Implement `viewport:camera` routing for 2D constrained cameras and 3D orbit cameras where supported.
- [x] 4.6 Add engine tests for protocol version rejection, stale base revision rejection, ordered ack sequencing, and multi-viewport isolation.

## 5. Model Editor Migration

- [x] 5.1 Implement `ModelController` as an `ISceneController` adapter over existing model scene/query/command paths.
- [x] 5.2 Migrate neko-model from direct VideoViewport usage to ViewportShell while preserving engine-stream visual truth.
- [x] 5.3 Route model selection, transform gizmo, camera, material preview, and context menu actions through controller methods and engine-mediated commands.
- [x] 5.4 Add model prediction overlays for transform/IK/camera feedback and reconcile them through ack/frame metadata.
- [x] 5.5 Add e2e or integration tests for model ViewportShell migration and fallback isolation.

## 6. Puppet Editor Integration

- [x] 6.1 Implement `PuppetController` adapter after native puppet editor commands and viewport protocol prerequisites are available.
- [x] 6.2 Route `scene:puppet:*` commands such as drag bone, set BlendShape, edit vertex, set driver weight, and toggle onion skin through ViewportProtocol.
- [x] 6.3 Add puppet overlay descriptors for skeleton handles, mesh vertices, onion skin, selection, and prediction wireframes.
- [x] 6.4 Verify puppet overlay alignment with engine frame metadata and <=16ms perceived drag feedback target.
- [x] 6.5 Keep local Canvas2D/fallback preview explicitly marked non-authoritative once engine-stream ViewportShell is enabled.

## 7. Live Compositor Integration

- [x] 7.1 Move `LiveController` for ViewportShell display of compositor stream, scene preset controls, layer routing, and output controls to follow-up change `implement-live-compositor-stream`.
- [x] 7.2 Move engine compositor stream descriptors for background, puppet, scene/model, and overlay layers to follow-up change `implement-live-compositor-stream`.
- [x] 7.3 Move live scene preset, compositor layer, tracking overlay, and output routing commands to follow-up change `implement-live-compositor-stream`.
- [x] 7.4 Keep persistent neko-live R3F rendering isolated as non-authoritative fallback until follow-up change `implement-live-compositor-stream` provides compositor stream parity.
- [x] 7.5 Add live fallback diagnostics that clearly mark local preview as non-authoritative when compositor is unavailable.

## 8. Cross-Package Cleanup

- [x] 8.1 Remove duplicated video stream mounting, input capture, overlay, and toolbar code from migrated model/puppet Webviews where parity exists; defer live compositor parity cleanup to `implement-live-compositor-stream`.
- [x] 8.2 Ensure puppet/model/live packages do not import each other's controller implementations or Webview internals.
- [x] 8.3 Update `@neko/ui` and `@neko/shared` package exports and dependency boundaries for L0/L2 separation.
- [x] 8.4 Add architecture boundary tests for no React/DOM in shared viewport contracts and no VSCode/Node imports in Webview code.

## 9. Validation And Documentation

- [x] 9.1 Run focused TypeScript tests for shared protocol contracts, ViewportShell components, prediction lifecycle, and controller adapters.
- [x] 9.2 Run focused Rust engine tests for viewport DTO serde, ActionRouter viewport commands, frame metadata, and multi-viewport routing.
- [x] 9.3 Run e2e smoke tests for model ViewportShell migration and at least one puppet controller fixture when native puppet work is available.
- [x] 9.4 Defer live compositor stream latency budget validation to follow-up change `implement-live-compositor-stream`; current change validates fallback diagnostics only.
- [x] 9.5 Update Chinese architecture/user documentation and affected English references after migrations land.
