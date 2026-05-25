## 1. Transport And Metadata Diagnostics

- [x] 1.1 Add shared viewport control-flow diagnostic types for control connection state, command lifecycle, metadata freshness, metadata delay, ack-before-frame, and degraded reason.
- [x] 1.2 Extend `H264StreamClient` or its frame metadata bridge to report metadata delay, stale revision, missing metadata, and ack-before-frame states without changing H.264 decode behavior.
- [x] 1.3 Extend `SceneControlSocket` diagnostics so callers can distinguish disconnected, reconnecting, command rejected, query failed, snapshot stale, and metadata-delayed states.
- [x] 1.4 Add test fixtures for delayed frame metadata, stale metadata revision, ack before compatible frame, and continued video playback while control commands fail.
- [x] 1.5 Document the P0/P1/P2 metadata migration policy in developer-facing viewport notes or ADR references used by implementation reviews.

## 2. Shared Viewport UI Control Gate

- [x] 2.1 Add reusable test helpers that assert semantic workflows by command, ack/error, delta/snapshot, store/controller update, overlay state, and prediction state.
- [x] 2.2 Harden `ViewportShell` event ownership tests so toolbar/context-menu chrome events do not leak into scene pointer handling and semantic pointer events are delegated exactly once.
- [x] 2.3 Add an explicit interaction-layer policy test or architecture check that prevents non-authoritative overlay layers from also owning semantic pointer/key events.
- [x] 2.4 Add shared degraded-control UI affordance or descriptor support so domain controllers can disable or label controls when scene-control is unavailable.
- [x] 2.5 Add prediction lifecycle coverage for ack-before-frame, metadata-delayed, timeout, rollback, and revision invalidation states.

## 3. Model Viewport Semantic Loop

- [x] 3.1 Store model selection, projected bounds, gizmo anchor, active drag state, prediction id, and compatible revision in the model controller/store.
- [x] 3.2 After selection, query `projectedBounds` and `gizmoAnchor` through scene-control and reject stale or wrong-viewport results.
- [x] 3.3 Render model selection/gizmo overlays from stored query results and frame metadata compatibility rather than discarded query responses.
- [x] 3.4 Implement model pointer move/up transform drag through `ViewportShell + ModelController`, including local prediction creation and command correlation.
- [x] 3.5 Reconcile model transform predictions on ack/error/delta/snapshot/frame metadata and surface degraded state when control flow fails while video continues.
- [x] 3.6 Add tests for model click selection, stale query rejection, gizmo overlay rendering, transform drag commit, transform rollback, and character preview mode ack-backed UI state.

## 4. Puppet Viewport Semantic Loop

- [x] 4.1 Align puppet bone hit testing with active frame metadata view transform or move selection to an engine-backed viewport query path.
- [x] 4.2 Add puppet viewport drag state for selected bone, pointer start, latest pointer, native base revision, sequence, and transaction id.
- [x] 4.3 Implement pointer move/up bone drag command dispatch through native puppet command envelopes instead of local-only overlay movement.
- [x] 4.4 Reconcile puppet bone drag predictions on native command ack/error, frame metadata, timeout, and snapshot refresh.
- [x] 4.5 Ensure BlendShape, ControlDriver, onion-skin, and vertex edit controls show pending/error/committed state from native command ack or authoritative snapshot.
- [x] 4.6 Add tests for puppet bone selection alignment, drag command dispatch, stale revision rejection, prediction rollback, preview-continues-control-fails diagnostic, and BlendShape ack-backed UI state.

## 5. Live Control Semantic Loop

- [x] 5.1 Track live scene-control connection state separately from compositor video stream state in the live Webview/controller.
- [x] 5.2 Gate live preset, tracking overlay, output route, and layer context-menu controls on scene-control availability and authoritative live scene revision.
- [x] 5.3 Ensure live toolbar/menu actions update UI only after ack/error or authoritative compositor scene update.
- [x] 5.4 Preserve explicit non-authoritative labels for local fallback preview and Webview canvas recording when compositor output route authority is unavailable.
- [x] 5.5 Add tests for compositor stream active while control disconnected, preset ack update, tracking overlay rejection, unsupported output route diagnostic, and fallback non-authoritative state.

## 6. Engine Control And Metadata Support

- [x] 6.1 Ensure engine scene-control responses include enough revision, viewport id, applied sequence, and error data for model, puppet, and live controller reconciliation.
- [x] 6.2 Add or expose scene-control metadata event DTOs behind a capability flag or no-op path so P1 migration has a defined contract.
- [x] 6.3 Add Rust tests for metadata event serialization, stale viewport/revision rejection, unsupported command diagnostics, and command ack shape compatibility.
- [x] 6.4 Ensure streaming routes expose metadata delay or dropped-meta diagnostics without coupling semantic command success to video frame delivery.

## 7. Verification And Review Gates

- [x] 7.1 Run targeted TypeScript tests for `packages/neko-client`, `packages/neko-ui`, `packages/neko-model`, `packages/neko-puppet`, and `packages/neko-live`.
- [x] 7.2 Run targeted Rust tests for engine route/DTO/control changes.
- [x] 7.3 Add or update architecture boundary tests so Webview code does not import VSCode/Node APIs and shared viewport contracts remain L0.
- [x] 7.4 Add review checklist entries requiring command/ack/store/overlay assertions for semantic viewport PRs.
- [x] 7.5 Update the accepted ADR or implementation notes with any resolved open questions, especially metadata budget threshold and scene-control metadata event cadence.
