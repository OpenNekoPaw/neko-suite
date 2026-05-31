## ADDED Requirements

### Requirement: Scene Authoring Supports Authored Light Commands
Scene authoring contracts SHALL support reliable authored light commands for adding light nodes, updating light properties, transforming light nodes, toggling light visibility, and removing light nodes. Authored lights MUST be Engine-owned scene state and MUST participate in scene revisions, snapshots, deltas, capture, and render extraction.

#### Scenario: Add authored light node
- **WHEN** Webview sends `node-add` with `kind='light'`, a light patch, transform, and current base revision
- **THEN** Engine creates a scene node with a light component and transform
- **THEN** Engine returns an acknowledgement and a delta or snapshot containing the new node and light state

#### Scenario: Update authored light properties
- **WHEN** Webview sends `light-update` for an existing light node with color, intensity, range, cone, or shadow settings
- **THEN** Engine updates the light component at a new scene revision
- **THEN** subsequent RenderWorld extraction reflects the acknowledged light state

#### Scenario: Authored light visibility affects render
- **WHEN** Webview sends `visibility-set` for an authored light node
- **THEN** Engine updates scene visibility state
- **THEN** the renderer includes or excludes that light according to acknowledged visibility

### Requirement: Default Editor Light Rig Is Non-persistent
The Engine SHALL provide a default editor light rig only when a scene has no enabled authored lights. The default editor light rig MUST be treated as non-persistent LookDev helper state unless the user explicitly creates authored light nodes.

#### Scenario: Empty scene uses editor rig
- **WHEN** a scene has no enabled authored lights
- **THEN** Engine may render with the default editor light rig for viewport readability
- **THEN** the default rig is not serialized as authored scene lights

#### Scenario: Authored light disables default rig
- **WHEN** the user adds an enabled authored light
- **THEN** Engine renders using authored lighting and does not implicitly add the default editor rig to the scene

### Requirement: Node Removal Is Safe By Default
The `node-remove` scene command SHALL default to non-cascading removal. Engine MUST reject removal when the target has children, animation bindings, constraints, selection references, character dependencies, or other dependent authoring data unless the command explicitly requests cascade and the caller has confirmed destructive behavior.

#### Scenario: Remove leaf light succeeds
- **WHEN** Webview sends `node-remove` with `cascade=false` for a leaf light node with no dependent bindings
- **THEN** Engine removes the light node at a new revision and emits a delta with the removed node id

#### Scenario: Remove dependent node is rejected
- **WHEN** Webview sends `node-remove` with `cascade=false` for a node with children or animation bindings
- **THEN** Engine rejects the command with structured diagnostics
- **THEN** Webview keeps the node in its mirrored scene state

#### Scenario: Explicit cascade requires command intent
- **WHEN** Webview sends `node-remove` with `cascade=true`
- **THEN** Engine may remove dependent nodes only if the command payload is valid for destructive removal
- **THEN** the resulting delta identifies removed nodes sufficiently for Webview mirror reconciliation

### Requirement: Scene Authoring Supports Environment Commands
Scene authoring contracts SHALL support Engine-owned environment state through `environment-set`, `environment-update`, and `environment-clear` commands. Environment state MUST use Engine-readable asset handles or file tokens and MUST be reflected in stream, capture, snapshot, and delta behavior when applied.

#### Scenario: Set environment from token
- **WHEN** Webview or Extension sends `environment-set` with an Engine file token or asset handle, mode, rotation, intensity, exposure, and background visibility
- **THEN** Engine validates and records environment state at a new scene revision
- **THEN** stream and capture rendering use the acknowledged environment state

#### Scenario: Update environment exposure
- **WHEN** Webview sends `environment-update` changing exposure or intensity
- **THEN** Engine updates only environment settings and preserves the environment source unless explicitly replaced

#### Scenario: Clear environment
- **WHEN** Webview sends `environment-clear`
- **THEN** Engine removes authored environment state and returns to the default viewport background or scene fallback environment

### Requirement: Environment Resource Loading Is Bounded And Diagnostic
Environment resource loading SHALL be asynchronous, cancellable, and diagnostic. Engine MUST preserve the previous environment or default background while a new environment is loading and MUST report oversized, pending, timeout, unsupported-format, or cancelled states as structured diagnostics.

#### Scenario: Large environment is rejected or confirmed
- **WHEN** an environment source exceeds the configured soft size limit
- **THEN** Engine returns an `environment.resourceTooLarge` diagnostic unless policy or explicit user confirmation allows loading

#### Scenario: Environment load pending
- **WHEN** environment loading exceeds the pending budget but has not failed
- **THEN** Engine reports a pending diagnostic while keeping the previous environment active

#### Scenario: Environment load is cancelled
- **WHEN** the user clears or replaces an environment while a previous environment load is in flight
- **THEN** Engine cancels the obsolete task and does not apply its result to a later scene revision

### Requirement: Scene Picking Returns Typed Selection Targets
Scene hit-test and selection queries SHALL support typed selection candidates including `node`, `materialSlot`, `submesh`, `primitive`, `bone`, `morphControl`, and `characterRegion` where data is available. Results MUST include viewport id, revision, depth or ordering data, and enough target identity for Webview inspector routing.

#### Scenario: Mesh picking returns material slot
- **WHEN** Object selection mode requests materialSlot and submesh candidates over a mesh
- **THEN** Engine returns compatible typed candidates when the mesh data can identify them
- **THEN** Webview can open Material or Transform inspector based on the selected candidate

#### Scenario: Picking degrades for ordinary model
- **WHEN** a GLB or VRM lacks `.nkc` character region descriptors
- **THEN** Engine may return node, materialSlot, submesh, or primitive candidates
- **THEN** Engine does not fabricate MetaHuman-style characterRegion targets

#### Scenario: Selection candidates are revision-scoped
- **WHEN** Webview receives typed selection candidates for a viewport
- **THEN** the result includes the scene revision used for picking
- **THEN** Webview discards or resyncs the result if that revision is incompatible with the active scene mirror
