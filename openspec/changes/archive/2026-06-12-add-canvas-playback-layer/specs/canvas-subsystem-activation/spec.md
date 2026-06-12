## ADDED Requirements

### Requirement: Subsystem playback controllers can delegate to shared playback plans
The Canvas Webview SHALL allow subsystem playback controllers to delegate route construction and execution state to the shared Canvas playback layer. Subsystem activation MUST still be driven by shared manifests and Webview runtime registrations, and Extension Host behavior MUST NOT depend on Webview playback controller components.

#### Scenario: Narrative controller uses narrative adapter
- **WHEN** the narrative subsystem is active and playback starts from narrative runtime nodes
- **THEN** the Webview can run playback through the narrative adapter while preserving the existing narrative subsystem activation rules

#### Scenario: Storyboard playback does not require narrative subsystem
- **WHEN** a Canvas contains `scene` and `shot` nodes but no narrative runtime nodes
- **THEN** storyboard playback can become available without activating narrative-specific renderers or panels

### Requirement: Canvas shell exposes one active playback surface
The Canvas shell SHALL arbitrate playback controls so that at most one playback controller is active at a time, even when multiple subsystems or adapters can interpret the current Canvas.

#### Scenario: Multiple adapters match selected graph
- **WHEN** both narrative and generic adapters can produce playback plans for the current selection
- **THEN** the shell selects one active playback mode by explicit user choice or adapter priority and keeps other controllers inactive

#### Scenario: Active controller changes safely
- **WHEN** the user switches from storyboard playback to narrative playback
- **THEN** the current playback session stops or pauses before the new controller becomes active
