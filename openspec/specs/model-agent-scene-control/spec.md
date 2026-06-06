# model-agent-scene-control Specification

## Purpose
Define Neko Model extension APIs and Agent capability provider contracts for querying and editing active model scenes.
## Requirements
### Requirement: Neko Model Extension API
The system SHALL expose a `NekoModelAPI` from `neko-model` for querying and editing the active model scene through Extension Host ownership.

#### Scenario: Query active scene graph
- **WHEN** an active model editor has a loaded scene
- **THEN** `NekoModelAPI` returns nodes, hierarchy, materials, cameras, lights, animations, active model path, and scene bounds when available

#### Scenario: Query scene bounds from engine snapshot
- **WHEN** engine `SceneSnapshot` nodes include `bounds` or `worldBounds`
- **THEN** `NekoModelAPI` preserves those values in compact scene query results without reading Webview-only store state

#### Scenario: No active editor
- **WHEN** no model editor is active
- **THEN** `NekoModelAPI` query methods return empty or undefined results and editing methods fail with a non-destructive diagnostic

#### Scenario: Viewport camera update uses engine channel
- **WHEN** a model API operation updates the editor viewport camera and the engine scene-control channel is available
- **THEN** it sends a viewport camera update through the scene-control channel and reports the acknowledgement or rejection result

### Requirement: Model Agent Capability Provider
The system SHALL register a `neko-model` AgentCapabilityProvider that exposes scene query, node manipulation, and animation control tools.

#### Scenario: Register model tools
- **WHEN** `neko-model` activates and `neko-agent` is available
- **THEN** it registers model scene tools through the Agent capability registration command

#### Scenario: Query tool is read-only
- **WHEN** Agent invokes the scene query tool
- **THEN** the tool reports `isReadOnly: true`, `isConcurrencySafe: true`, `safetyKind: 'read-only-query'`, and does not mutate scene state

#### Scenario: Editing tool uses model API
- **WHEN** Agent invokes node transform, visibility, material, or animation control
- **THEN** the tool calls `NekoModelAPI` rather than directly posting messages to the Webview

### Requirement: Model Tool Safety Metadata
The system SHALL mark model tools with the shared Agent planning metadata from `Tool.safetyKind`, `Tool.targetRequirements`, and `Tool.queryBeforeMutate`.

#### Scenario: Missing host requirement
- **WHEN** the host cannot provide VSCode extension APIs or an active model editor
- **THEN** model tools remain registered but report unavailable execution results instead of being injected as usable active-edit tools

#### Scenario: Node mutation declares target and preflight query
- **WHEN** a model tool mutates scene state
- **THEN** it declares `safetyKind` as a mutation class, requires stable target fields such as `nodeId` or `materialId`, and points `queryBeforeMutate.preferredQueryTools` to the model scene query tool

#### Scenario: Animation control separates query and mutation
- **WHEN** a model animation tool only lists available animations
- **THEN** it is marked as a read-only query
- **WHEN** a model animation tool changes playback state
- **THEN** it is marked as a non-destructive or confirmation-gated mutation according to the operation mode
