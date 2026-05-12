## ADDED Requirements

### Requirement: Agent project edits execute in Extension
The system SHALL execute audio Agent project-edit tools in the VSCode Extension process against the Extension-owned project cache. Agent project-edit tools MUST NOT rely on Webview `agent:*` handlers to apply project mutations.

#### Scenario: Agent sets track volume
- **WHEN** Agent calls a tool to set track volume for an open audio project
- **THEN** `AudioToolBridge` resolves the target project session, applies a `track.mix.setVolume` operation to cached project data, marks the document dirty, and returns success only after the operation is applied

#### Scenario: Webview is not asked to execute Agent edit
- **WHEN** an Agent project-edit tool is invoked
- **THEN** Extension does not send an `agent:*` command that requires Webview to mutate project state

### Requirement: AudioProjectSessionGateway is Extension-only
The system SHALL define the audio project session gateway as an Extension-only dependency injection port. Shared packages MAY define serializable DTOs, but MUST NOT expose gateway interfaces that depend on VSCode document cache, dirty events, focused panels, or Webview panel targeting.

#### Scenario: Bridge receives gateway dependency
- **WHEN** `AudioToolBridge` is constructed
- **THEN** it receives an `AudioProjectSessionGateway` implementation and does not directly own Provider internals

#### Scenario: Shared package contains only serializable message DTOs
- **WHEN** Webview and Extension import audio message types from shared code
- **THEN** those types are serializable DTOs and do not expose VSCode-specific gateway APIs

### Requirement: Project sessions resolve atomically
The system SHALL resolve audio project sessions atomically by document URI or focused audio project panel. A resolved session MUST include both the document URI and project data from the same document.

#### Scenario: Agent uses explicit document URI
- **WHEN** an Agent tool call includes `documentUri`
- **THEN** the gateway resolves project data for that URI and does not apply the edit to another active audio project

#### Scenario: No project session exists
- **WHEN** Agent calls a project-edit tool and no matching audio project is open
- **THEN** the tool returns a failure result explaining that no audio project is open

### Requirement: Agent edit results are honest
The system SHALL return Agent tool success only when the requested edit has already been applied to Extension project data. Invalid operations, invalid track IDs, missing documents, and unsupported planned effects MUST return failure results.

#### Scenario: Invalid track ID fails
- **WHEN** Agent attempts to apply an effect to a track ID that does not exist
- **THEN** the operation fails and the tool returns `{ success: false, error }`

#### Scenario: Planned effect fails project edit
- **WHEN** Agent attempts to add a planned-only effect to a renderable track effect chain
- **THEN** the tool returns a failure result that explains the effect is not currently renderable

### Requirement: Webview receives project sync notifications after Agent edits
The system SHALL notify the targeted Webview after Extension applies an Agent edit. The notification MUST include the updated `AudioProjectData` and MAY include the applied operation so Webview can record undo metadata without executing the operation again.

#### Scenario: Agent edit syncs Webview state
- **WHEN** Extension applies an Agent edit to project data
- **THEN** Extension sends `{ type: 'project:sync', projectData, operation }` to the targeted audio project Webview

#### Scenario: Webview records undo metadata without reapplying
- **WHEN** Webview receives `project:sync` with an operation
- **THEN** it replaces its project state and records the operation for undo without applying the operation a second time

### Requirement: Agent read tools return target document context
The system SHALL include resolved document context in Agent read-tool responses so later mutating calls can target the same audio project.

#### Scenario: Get project info returns document URI
- **WHEN** Agent calls `GetAudioProjectInfo`
- **THEN** the result includes the resolved `documentUri` along with project metadata

#### Scenario: List tracks returns document URI
- **WHEN** Agent calls `ListAudioTracks`
- **THEN** the result includes the resolved `documentUri` and track summaries

### Requirement: Agent engine tools run through AudioService
The system SHALL execute Agent audio engine tools through Extension `AudioService` without requiring Webview mediation. Engine tools include loudness analysis, denoise fallback, mix export, and explicit unavailable-tool responses.

#### Scenario: Agent mix export builds config in Extension
- **WHEN** Agent calls `MixExport` for a project
- **THEN** Extension resolves the project session, builds `MixdownConfig` with path context, calls `audioService.mixExport`, and returns output and warnings

#### Scenario: Stem separation reports unavailable
- **WHEN** Agent calls stem separation before the Engine has a supported model path
- **THEN** the tool returns `{ success: false, error }` rather than pretending the operation succeeded

### Requirement: Agent audio tool coverage is complete
The system SHALL provide an execution path for every entry in `TOOL_NAMES_AUDIO`. Project editing, analysis, and Engine tools MUST be handled by `AudioToolBridge`; media generation tools MAY remain provider-direct when they do not mutate audio project state.

#### Scenario: Bridge tools have switch cases
- **WHEN** `AudioToolBridge.executeAgentTool()` receives any bridge-owned audio tool name
- **THEN** it dispatches to a concrete implementation rather than returning unknown tool

#### Scenario: Provider-direct tools are documented
- **WHEN** media generation tools are registered outside `AudioToolBridge`
- **THEN** the provider documents that they bypass project state because they do not edit `.nka`
