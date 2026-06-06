## ADDED Requirements

### Requirement: Preview Mode Commands Use Direct Scene-control WebSocket
The system SHALL route AI character preview mode requests, camera override resets, playback controls, and preview state subscriptions through the direct Webview-to-engine scene-control WebSocket path. Extension Host MUST NOT relay high-frequency preview state, playback timing, render frame metadata, or preview mode command traffic.

#### Scenario: Mode request bypasses Extension Host
- **WHEN** the user selects an AI character preview mode in the Neko Model Webview
- **THEN** Webview sends the preview mode command to Engine through `SceneControlSocket` or the active scene-control transport without posting the command through Extension Host

#### Scenario: Playback timing bypasses Extension Host
- **WHEN** motion or voice-pack preview emits playback timing, viseme timing, or preview state updates
- **THEN** those updates flow through engine WebSocket events and render/audio metadata rather than Extension Host `postMessage`

### Requirement: Preview Mode UI Is Controller-mediated
The system SHALL expose preview mode UI through Neko Model controller methods and shared serializable contracts. `ViewportShell` MUST remain domain-agnostic and MUST NOT import Neko Model preview mode implementation details.

#### Scenario: Selector delegates to ModelController
- **WHEN** the AI preview selector changes mode
- **THEN** it calls a `ModelController` preview mode operation that serializes and dispatches the engine command

#### Scenario: ViewportShell remains generic
- **WHEN** preview mode support is added to Neko Model
- **THEN** shared `ViewportShell` code does not branch on AI preview mode ids or import Neko Model Webview modules

### Requirement: Preview Mode Fallbacks Are Explicit
The system SHALL mark preview mode degraded states explicitly when scene-control, engine streaming, audio streaming, demo playback, or required character bindings are unavailable. Webview MUST NOT silently replace engine preview with a local-only R3F/HTML audio state as authoritative output.

#### Scenario: Engine preview unavailable
- **WHEN** the engine stream or scene-control channel is unavailable
- **THEN** the preview selector is disabled or marked unavailable and does not claim that an authoritative preview mode has been applied

#### Scenario: Local fallback is non-authoritative
- **WHEN** a development fallback preview is shown while AI preview modes are unavailable
- **THEN** the UI marks the fallback as non-authoritative and excludes it from export, WYSIWYG validation, and applied preview state semantics

### Requirement: Preview Mode Pending State Reconciles With Engine Events
The system SHALL distinguish requested, pending, applied, rejected, and resynced preview mode states. Webview MUST reconcile pending preview UI through scene-control acknowledgements, preview mode state events, and render frame metadata.

#### Scenario: Pending mode becomes applied
- **WHEN** Webview sends a preview mode request and Engine acknowledges it with an applied revision
- **THEN** Webview marks the mode as applied only after the acknowledgement, matching preview state event, or compatible render frame metadata confirms it

#### Scenario: Rejected mode rolls back UI
- **WHEN** Engine rejects a preview mode request
- **THEN** Webview clears the pending state, displays the diagnostic, and restores the last applied mode from engine state
