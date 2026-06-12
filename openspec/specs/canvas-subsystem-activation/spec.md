# canvas-subsystem-activation Specification

## Purpose
Defines how Canvas activates built-in storyboard, narrative, behavior, entity, and memory subsystems from actual node types while keeping shared manifests pure and Webview runtime registrations lazy-loaded.
## Requirements
### Requirement: Canvas subsystem manifests are pure shared contracts
The system SHALL define built-in Canvas subsystem manifests as serializable shared contracts that contain trigger node types, connection type descriptors, validation rule descriptors, auto-arrange strategy identifiers, Agent tool descriptors, and metadata defaults. Manifest contracts MUST NOT contain React components, VSCode API types, predicate functions, layout algorithms, or other runtime-only objects.

#### Scenario: Extension reads manifest without Webview imports
- **WHEN** the Canvas Extension Host registers Agent tools or validates node and connection types
- **THEN** it reads `CanvasSubsystemManifest` data without importing `webview/src/subsystems/*` or React code

#### Scenario: Manifest remains serializable
- **WHEN** a subsystem manifest declares connection rules or metadata defaults
- **THEN** those declarations are represented as JSON-serializable descriptors and values rather than functions

### Requirement: Webview subsystem registrations provide runtime UI
The Canvas Webview SHALL load subsystem runtime registrations separately from shared manifests. Runtime registrations MAY provide React node renderers, floating panel definitions, playback controllers, and runtime strategy implementations, and MUST reuse the corresponding manifest data rather than becoming the source of truth for Extension Host behavior.

#### Scenario: Webview activates renderer from registration
- **WHEN** a Canvas contains a node type whose subsystem is active
- **THEN** the Webview loads that subsystem registration and renders matching nodes through the registered renderer

#### Scenario: Extension Host does not depend on runtime registration
- **WHEN** a subsystem provides Webview-only panels or playback controls
- **THEN** Extension Host behavior remains driven by the manifest and does not import those runtime modules

### Requirement: Canvas activates subsystems by node type
The Canvas Webview SHALL activate built-in subsystems by scanning actual node types in the opened Canvas file and by checking newly added or removed nodes at runtime. A subsystem MUST become active when at least one trigger node type is present and MUST deactivate its UI/controller state when the last trigger node is removed. The narrative subsystem trigger set MUST include `narrative-start`, `choice`, `merge`, `narrative-scene`, `narrative-note`, and `narrative-ending`.

#### Scenario: Narrative subsystem activates from Choice node
- **WHEN** a Canvas contains a `narrative-start`, `choice`, `merge`, `narrative-scene`, `narrative-note`, or `narrative-ending` node
- **THEN** the narrative subsystem is active and its renderers, connection rules, metadata defaults, panels, and playback controls become available as applicable

#### Scenario: Subsystem UI deactivates after last trigger node is removed
- **WHEN** the user removes the last trigger node for a subsystem
- **THEN** Canvas hides that subsystem's active UI/controller state while preserving already-loaded chunks in module cache

### Requirement: Subsystem bundles load on demand
The Canvas Webview SHALL keep subsystem runtime code out of the initial bundle unless that subsystem is active or the user explicitly opens its node library group. Lazy loading MUST NOT block opening a Canvas that only contains basic or storyboard nodes.

#### Scenario: Basic Canvas avoids inactive bundles
- **WHEN** a Canvas contains only `text`, `media`, `annotation`, and `group` nodes
- **THEN** narrative, behavior, entity, and memory runtime registrations are not loaded into the initial render path

#### Scenario: Adding a State node loads behavior subsystem
- **WHEN** the user creates a `state` node in an open Canvas
- **THEN** Canvas loads the behavior subsystem registration and enables behavior-specific rendering and panels

### Requirement: Unknown complete nodes render as fallback
The Canvas Webview SHALL render structurally complete nodes with unregistered or unsupported types through a bounded fallback renderer. The fallback MUST preserve node identity, position, size, z-index, data, and selection/movement behavior, and MUST visibly indicate that the node type is unsupported.

#### Scenario: Unsupported future node opens without data loss
- **WHEN** a v2.1 Canvas contains a structurally complete node whose type is not registered in the current runtime
- **THEN** Canvas opens the file, displays a fallback card with the type name and warning, and preserves the node on save

#### Scenario: Invalid structure still fails validation
- **WHEN** an unknown node is missing required structural fields such as `id`, `position`, `size`, or `zIndex`
- **THEN** validation reports an error rather than rendering it as a valid fallback node

### Requirement: Canvas shell exposes subsystem-aware UI slots
The Canvas Webview SHALL provide UI slots for subsystem-provided node library groups, floating panels, playback controls, and auto-arrange choices without hard-coding each subsystem into the core shell.

#### Scenario: Multiple playable subsystems share toolbar slot
- **WHEN** both narrative and behavior subsystems are active
- **THEN** the toolbar exposes a playback mode selector and runs only one playback controller at a time

#### Scenario: Subsystem panel opens as floating panel
- **WHEN** an active subsystem declares a floating panel
- **THEN** the panel can be shown, hidden, and dragged without occupying a permanent right-side property panel

#### Scenario: Runtime descriptors own visual icons
- **WHEN** a subsystem contributes node-library descriptors with visual icons
- **THEN** those icons are Webview runtime values and are not serialized into the shared `CanvasSubsystemManifest`

#### Scenario: Floating panel host avoids unused subsystem state
- **WHEN** a floating panel component is rendered
- **THEN** the host passes only the declared floating-panel props and does not thread active subsystem state through frame internals unless a panel contract requires it

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

### Requirement: Narrative activation and traversal node sets are separate
The Canvas subsystem model SHALL expose separate constants or descriptors for narrative subsystem activation nodes and narrative runtime traversal nodes. Activation MUST include editor-only narrative nodes; traversal MUST include only playable runtime nodes.

#### Scenario: Narrative note activates but does not traverse
- **WHEN** a Canvas contains `narrative-note` and no playable narrative traversal nodes
- **THEN** the narrative subsystem can activate for node editing and note rendering
- **THEN** traversal APIs return no playable narrative path through the note

#### Scenario: Start and ending participate in traversal
- **WHEN** a Canvas contains `narrative-start`, `narrative-scene`, `choice`, `merge`, and `narrative-ending` nodes connected as a valid graph
- **THEN** traversal APIs include those node types in successors, default path resolution, cycle checks, and terminal analysis
- **THEN** they continue to exclude `narrative-note` from runtime traversal

