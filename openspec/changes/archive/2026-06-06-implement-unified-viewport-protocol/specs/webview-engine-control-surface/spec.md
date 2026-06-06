## ADDED Requirements

### Requirement: Shared ViewportShell Is The Engine Visual Surface
Engine-stream Webviews SHALL use ViewportShell as the shared visual truth surface for model, puppet, and live scenes once the relevant domain controller is available.

#### Scenario: Model uses ViewportShell
- **WHEN** neko-model has a valid engine stream and ModelController
- **THEN** it renders through ViewportShell rather than mounting an independent visual truth surface for the same scene

#### Scenario: Puppet uses ViewportShell
- **WHEN** neko-puppet reaches the engine-stream integration phase
- **THEN** it renders through ViewportShell and keeps any Canvas2D preview path explicitly marked as fallback or local prototype

### Requirement: InteractionLayer Uses ViewportProtocol
Webview interaction layers SHALL route engine-mediated viewport operations through ViewportProtocol instead of ad-hoc per-editor command formats.

#### Scenario: Gizmo drag sends viewport command
- **WHEN** a user drags a transform gizmo in a migrated editor
- **THEN** the interaction layer sends a `ViewportCommand` with sequence, correlation id, source, and base revision where required

#### Scenario: Local wheel zoom bypasses engine
- **WHEN** a user performs shell-local wheel zoom
- **THEN** the Webview updates local shell state without involving Extension Host or Engine per wheel event

### Requirement: Prediction Layer Is Centralized
Webview prediction behavior for transform, camera, selection, morph, IK, and overlay feedback SHALL use a central lifecycle tied to viewport command acknowledgements and frame metadata.

#### Scenario: Rejected command clears prediction
- **WHEN** a predicted viewport or scene command is rejected
- **THEN** the prediction layer removes or rolls back the predicted overlay and triggers resync if necessary

#### Scenario: Topology change invalidates prediction
- **WHEN** a topology or scene reset event invalidates predicted overlay geometry
- **THEN** the prediction layer discards predictions that reference the old topology or revision

### Requirement: Extension Host Remains Low-Frequency
Extension Host SHALL broker setup, resource URLs, editor lifecycle, and VSCode operations but MUST NOT relay high-frequency viewport frames, pointer move streams, or per-frame shell-local navigation.

#### Scenario: Pointer move bypasses Extension Host
- **WHEN** a user drags within ViewportShell
- **THEN** high-frequency local prediction and engine command traffic do not pass through VSCode `postMessage` unless a domain explicitly requires a low-frequency host operation
