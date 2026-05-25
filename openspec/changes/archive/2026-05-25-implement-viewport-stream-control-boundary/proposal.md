## Why

Engine-rendered viewports now display H.264 pixels reliably, but model, puppet, and live editing can still appear broken when semantic control flow is incomplete. `adr-viewport-stream-control-boundary.md` was accepted to make the boundary explicit: video shows what the engine rendered, while selection, transform, preview modes, output routing, and editing state must be proven through scene-control commands, ack/delta/snapshot updates, and local prediction reconciliation.

## What Changes

- Add a dedicated viewport stream/control boundary capability that defines the accepted three-channel contract: H.264 video, `renderFrameMeta` sideband, and `/v1/scenes/control`.
- Add PR/QA gates that reject "video changed" as sufficient proof for selection, transform, preview mode, live output, BlendShape, or bone editing workflows.
- Add metadata backpressure diagnostics and a staged migration policy: keep video sideband by default, move frame metadata to scene-control metadata events when backpressure affects overlay alignment, and reserve an independent metadata WebSocket for cases where scene-control metadata cannot satisfy frequency or isolation needs.
- Make `ViewportShell + ISceneController` the default and preferred input path; keep `InteractionLayer` non-interactive unless a domain explicitly promotes it as the sole delegated interaction layer.
- Close the model viewport editing loop around selection, projected bounds, gizmo anchors, drag state, transform prediction, command ack/error, and store/overlay updates.
- Close the puppet viewport editing loop around bone selection alignment, pointer move/up drag commands, native command prediction, ack/rollback, and BlendShape/bone UI state.
- Close the live control loop around preset, tracking overlay, output route, and layer context-menu commands, including ack/error diagnostics and authoritative compositor scene updates.
- Add tests and diagnostics for frame metadata staleness, prediction lifecycle behavior when video frames lag behind command acks, and degraded control-channel states.

## Capabilities

### New Capabilities

- `viewport-stream-control-boundary`: Defines the accepted video/metadata/control-flow boundary, metadata backpressure policy, interaction entrypoint policy, and cross-editor semantic-control acceptance gates.

### Modified Capabilities

- `engine-render-viewport`: Add frame metadata latency/staleness diagnostics, applied sequence/revision alignment requirements, and future migration support for scene-control metadata events.
- `webview-engine-control-surface`: Require ViewportShell/controller ownership of semantic input, control-flow acceptance gates, degraded control-channel UI states, and tests that assert semantic state rather than video changes only.
- `character-authoring-workflows`: Require model selection/query/gizmo/transform/preview-mode workflows to close through scene-control ack/delta/snapshot and store/overlay updates.
- `engine-puppet-control-and-renderer`: Require puppet viewport bone drag and BlendShape/native command editing to close through prediction, command ack/error, revision reconciliation, and authoritative snapshot/overlay updates.
- `device-management`: Require live preset, tracking overlay, output route, and compositor scene controls to prove command ack/error handling and authoritative compositor state updates while keeping local fallback non-authoritative.

## Impact

- Shared contracts and client code: `packages/neko-types/src/types`, `packages/neko-client/src/H264StreamClient.ts`, `packages/neko-client/src/SceneControlSocket.ts`, `packages/neko-client/src/EngineClient.ts`.
- Shared UI: `packages/neko-ui/src/viewport` for ViewportShell, OverlayRenderer, ViewportToolbar, prediction lifecycle, stale metadata diagnostics, and interaction ownership.
- Model Webview: `packages/neko-model/packages/webview/src` controller/store/overlay paths for select, bounds/anchor query, gizmo drag, transform command, and character preview mode controls.
- Puppet Webview and control plane: `packages/neko-puppet/packages/webview/src` plus engine puppet command routes for bone drag, BlendShape, native revision, prediction rollback, and snapshot refresh.
- Live Webview and compositor control: `packages/neko-live/packages/webview/src` plus live compositor scene command routing, output diagnostics, and authoritative/fallback split.
- Engine routes: `packages/neko-engine/packages/host-http/src/routes/streaming.rs`, `scene_control.rs`, puppet control/stream routes, live compositor routes, and engine-types DTOs for metadata/revision/applied-sequence diagnostics.
- Tests: TypeScript unit tests, Rust route/DTO tests, contract fixtures, and targeted Webview controller tests that verify command, ack/error, delta/snapshot, store, overlay, and metadata-staleness behavior.
