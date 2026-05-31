## ADDED Requirements

### Requirement: Model LookDev UI Compiles To Engine Viewport Or Scene Commands
The Neko Model Webview SHALL implement LookDev, light, environment, and typed selection controls as Engine viewport settings, scene commands, or scene-control queries. Webview MUST NOT store these Engine-owned facts only in Zustand or local component state.

#### Scenario: LookDev mode dispatches engine request
- **WHEN** the user changes LookDev mode in the Model Webview
- **THEN** Webview dispatches an Engine viewport descriptor restart or viewport settings update
- **THEN** local UI state remains pending until Engine confirmation

#### Scenario: Light inspector dispatches scene command
- **WHEN** the user edits a light property in the Model Webview
- **THEN** Webview emits a reliable scene command rather than mutating a local-only light object

#### Scenario: Environment panel dispatches engine command
- **WHEN** the user updates environment rotation, intensity, exposure, or visibility
- **THEN** Webview sends an environment scene command and waits for Engine acknowledgement or diagnostic state

### Requirement: Route A Boundaries Cover LookDev And Scene Editing Controls
Route A Webview boundary checks SHALL cover LookDev, light, environment, and selection controls. These controls MUST NOT introduce `three`, `@react-three/*`, Webview glTF/VRM parsing, Webview PBR material evaluation, or a visible local mesh renderer.

#### Scenario: LookDev implementation avoids local renderer
- **WHEN** architecture checks inspect the Neko Model Webview implementation
- **THEN** LookDev mode switching does not depend on Webview-side Three.js or R3F rendering packages

#### Scenario: Selection implementation avoids local glTF parsing
- **WHEN** typed selection support is implemented
- **THEN** Webview requests selection candidates from Engine instead of parsing the source model file for mesh/material authority

### Requirement: Model Environment Placement Crosses Engine Boundary
The Webview and Extension Host SHALL migrate Model environment placement to Engine-backed environment commands. Extension Host may use VSCode APIs and Engine file access registration, but it MUST NOT treat a posted `EnvironmentPlacement` message as the authoritative render state.

#### Scenario: Use environment command is engine backed
- **WHEN** `neko.model.useEnvironment` is invoked with a valid placement
- **THEN** Extension Host or Webview routes the placement through an Engine environment command path
- **THEN** the Webview does not mark the environment as applied until Engine confirms or reports diagnostics

#### Scenario: Environment state recovers after reload
- **WHEN** a model editor reloads a scene with an authored environment
- **THEN** the Webview mirror receives environment state from Engine snapshot or delta rather than only from prior Webview state restoration

### Requirement: Control Surface Distinguishes Pending, Applied, And Rejected Scene Edits
The Model Webview SHALL track pending, applied, rejected, timeout, and resync states for LookDev, light, environment, and selection operations. It MUST commit authoritative UI state only after Engine acknowledgement, compatible SceneDelta, snapshot, query result, or render frame metadata.

#### Scenario: Rejected light update rolls back inspector
- **WHEN** Engine rejects a `light-update` command
- **THEN** Webview clears the pending edit, shows the diagnostic, and restores the last acknowledged light property values

#### Scenario: Environment timeout remains recoverable
- **WHEN** environment loading times out in UI
- **THEN** Webview allows clear or retry actions without claiming the failed environment is applied

#### Scenario: Selection query mismatch is discarded
- **WHEN** Webview receives a typed selection query result for an older incompatible scene revision
- **THEN** it discards the result and requests resync or repeats the query rather than selecting stale data

### Requirement: Extension Host Remains Low-frequency For LookDev Workflows
Extension Host SHALL remain limited to VSCode APIs, file picker, file token registration, Engine discovery, command entry points, and lifecycle cleanup for LookDev workflows. It MUST NOT relay high-frequency viewport settings, SceneDelta, render frames, selection hover queries, or light transform drags.

#### Scenario: Light transform bypasses Extension Host
- **WHEN** the user drags a light transform gizmo
- **THEN** Webview sends transform commands directly through scene-control
- **THEN** Extension Host is not on the high-frequency path

#### Scenario: File picker is low-frequency
- **WHEN** the user chooses an environment file
- **THEN** Extension Host may open a VSCode file picker and register the file with Engine
- **THEN** subsequent environment loading and rendering state are owned by Engine
