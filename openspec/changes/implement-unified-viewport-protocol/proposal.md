## Why

Neko Suite has multiple engine-stream editing surfaces that independently handle video display, input capture, overlays, and command routing. A unified `ViewportShell + ViewportProtocol + ISceneController` contract reduces duplicated Webview infrastructure, keeps high-frequency interaction off Extension Host, and gives puppet/model/live scenes a consistent path to engine-owned visual truth.

## What Changes

- Add a shared L0 ViewportProtocol for command/event/frame metadata envelopes with `protocolVersion`, `seq`, `correlationId`, `baseRevision`, `revision`, `source`, and typed payload boundaries.
- Add L0 `ISceneController`, viewport input DTOs, overlay descriptors, toolbar extension descriptors, and scene event handling contracts.
- Add L2 `@neko/ui` ViewportShell, OverlayRenderer, ViewportToolbar, shell-local viewport state, and prediction overlay support.
- Split viewport interactions into Shell-local commands and Engine-mediated commands so pan/zoom/resize can stay local while select/transform/camera/scene writes go through engine envelopes.
- Register engine `viewport_controller` in ActionRouter before editor migrations depend on engine-mediated viewport commands.
- Migrate model, puppet, and live editors to use ViewportShell through per-domain controllers rather than directly depending on each other.
- Reposition neko-live as a compositor/control surface that receives an engine-composited stream instead of rendering persistent 2D/3D scenes locally.
- Add overlay/frame metadata alignment tests, command envelope contract tests, prediction rollback tests, and migration e2e coverage.

## Capabilities

### New Capabilities

- `unified-viewport-protocol`: Defines shared ViewportProtocol, ViewportShell, SceneController, overlay, toolbar, and local-vs-engine command contracts for engine-stream editors.

### Modified Capabilities

- `engine-render-viewport`: Add protocol-aligned frame metadata, viewport id/revision/transform semantics, and ActionRouter viewport command routing.
- `webview-engine-control-surface`: Add ViewportShell as the shared visual truth surface for puppet/model/live Webviews and centralize local prediction/interaction lifecycle.
- `engine-puppet-control-and-renderer`: Align puppet scene commands and render frame metadata with ViewportProtocol for native puppet editing.
- `character-authoring-workflows`: Align model/character viewport interactions with `ISceneController`, prediction overlays, and engine-mediated viewport commands.
- `device-management`: Align live scene display and output routing with engine compositor ownership and ViewportShell consumption.

## Impact

- Affected shared contracts include new `@neko/shared` viewport protocol, controller, input, overlay, toolbar, event, and frame metadata DTOs.
- Affected UI code includes a new or extended `@neko/ui` L2 package with ViewportShell, OverlayRenderer, ViewportToolbar, and supporting hooks/components.
- Affected engine code includes `engine-types` protocol DTOs, ActionRouter `viewport_controller`, hit-test/selection/transform/camera routing, frame metadata emission, and compositor APIs.
- Affected Webviews include neko-model, neko-puppet, and neko-live controller adapters plus removal or isolation of duplicated video/input/overlay code.
- This change is a prerequisite for the final 2D native puppet engine-stream editor integration, but it can be implemented independently through model and shell fixtures first.
