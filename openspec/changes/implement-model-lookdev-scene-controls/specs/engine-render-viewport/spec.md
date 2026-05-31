## ADDED Requirements

### Requirement: Viewport Render Modes Include Model LookDev Modes
The Engine viewport contract SHALL support model LookDev render modes including `pbr`, `clay`, `wireframe`, `unlit`, `normal`, `depth`, `lightComplexity`, and `shadowAtlas`. `clay` MUST be represented as a first-class render mode or equivalent LookDev material override rather than as a UI alias for `unlit`.

#### Scenario: Clay descriptor is accepted
- **WHEN** Webview requests `scenes:stream` with `renderMode='clay'`
- **THEN** Engine accepts the descriptor if Clay capability is available
- **THEN** the returned stream descriptor identifies the effective render mode as Clay or returns a structured unsupported-mode diagnostic

#### Scenario: Debug descriptor is reflected
- **WHEN** Webview requests `renderMode='normal'`, `renderMode='depth'`, or `renderMode='lightComplexity'`
- **THEN** Engine selects the corresponding debug render graph variant
- **THEN** the returned stream descriptor and frame metadata expose the effective mode for UI reconciliation

### Requirement: Clay Rendering Preserves Shape-reading Cues
Clay rendering SHALL use a neutral material override for inspection while preserving geometry, normals, lighting direction, tone mapping, and supported ambient occlusion or shadow cues. Clay rendering MUST NOT mutate authored material slots or exported material data.

#### Scenario: Clay does not update material slot
- **WHEN** a viewport enters Clay mode
- **THEN** Engine renders the scene with a neutral inspection material
- **THEN** scene material components and material slot authoring data remain unchanged

#### Scenario: Clay differs from unlit
- **WHEN** the same scene is rendered in `clay` and `unlit`
- **THEN** Clay preserves shape-reading cues such as light direction or normal response that are absent from a pure unlit debug view

### Requirement: Render Mode Switching Confirms Effective Mode
The render viewport pipeline SHALL confirm the effective render mode in the stream descriptor or compatible render frame metadata. Webview MUST treat a requested render mode as pending until Engine confirms the effective mode or reports rejection.

#### Scenario: Effective mode matches request
- **WHEN** Webview restarts the stream to switch from PBR to Wireframe
- **THEN** Engine returns a stream descriptor whose effective render mode is Wireframe
- **THEN** Webview marks Wireframe as applied only after descriptor or frame metadata confirmation

#### Scenario: Unsupported mode is rejected
- **WHEN** Webview requests a render mode unsupported by the current Engine
- **THEN** Engine returns a structured diagnostic
- **THEN** Webview keeps or restores the last confirmed render mode

### Requirement: Viewport Settings Updates Can Avoid Stream Restart
The system SHALL provide an additive path for live viewport LookDev settings updates that can change render mode, debug view, helper passes, grid, skeleton, or normal overlays without requiring a full stream restart when the Engine advertises support.

#### Scenario: Engine supports live settings update
- **WHEN** Webview sends a viewport settings update for an active viewport and the Engine advertises live settings support
- **THEN** Engine applies the settings to subsequent frames and emits acknowledgement or metadata with the applied sequence

#### Scenario: Engine lacks live settings update
- **WHEN** Webview attempts to change LookDev settings and the Engine does not advertise live settings support
- **THEN** Webview falls back to descriptor-based stream restart behavior with explicit pending state
