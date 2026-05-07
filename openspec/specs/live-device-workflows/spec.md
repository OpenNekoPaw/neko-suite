# live-device-workflows Specification

## Purpose
TBD - created by archiving change add-device-management. Update Purpose after archive.
## Requirements
### Requirement: Live Session Service Boundary
The system SHALL extract live session state from `LivePanelProvider` into a `LiveSessionService` that owns `neko-live` scene composition, recording, streaming, and live device role binding. `LiveSessionService` MUST NOT own device discovery, device permission policy, tracking protocol parsing, or renderer-specific avatar mapping.

#### Scenario: Live session updates are service-backed
- **WHEN** a `neko-live` Webview changes scene composition, recording state, or device role binding
- **THEN** the provider routes the request through `LiveSessionService` rather than storing all session state only in `LivePanelProvider`

#### Scenario: Live session does not enumerate devices directly
- **WHEN** `neko-live` needs available cameras, audio inputs, MIDI ports, or gamepads
- **THEN** it requests normalized devices through `DeviceManager` rather than duplicating engine device discovery

### Requirement: Tracking Service Consumption In Live Workflows
The system SHALL make `neko-live`, `neko-puppet`, and `neko-model` consume tracking data through `TrackingServiceApi`. No package MUST instantiate `VmcReceiver` directly after the shared tracking service is available.

#### Scenario: Neko live subscribes through service
- **WHEN** `neko-live` starts tracking for a live session
- **THEN** it calls `TrackingServiceApi.start()` and subscribes to tracking/status events through the shared API

#### Scenario: Consumer package does not import VMC receiver internals
- **WHEN** `neko-puppet` or `neko-model` implements Live Mode
- **THEN** it imports shared tracking contracts and obtains the service API without importing `neko-live` extension source files

### Requirement: Puppet Live Mode
The system SHALL add a Live Mode workflow to `neko-puppet` that subscribes to shared tracking data, maps ARKit/VMC blend shapes to puppet parameters inside the puppet domain, and drives the package-owned puppet renderer or engine-backed puppet state.

#### Scenario: Puppet Live Mode drives existing renderer
- **WHEN** a puppet project is open and Live Mode is enabled
- **THEN** `neko-puppet` subscribes to tracking data, applies puppet-domain mapping, and updates the existing puppet preview without opening `neko-live`

#### Scenario: Puppet mapping filters unavailable parameters
- **WHEN** tracking data contains blend shapes for parameters not present in the loaded puppet
- **THEN** the mapping ignores unavailable parameters and only applies supported puppet parameters

### Requirement: Model Live Mode
The system SHALL add a Live Mode workflow to `neko-model` that subscribes to shared tracking data, maps ARKit/VMC blend shapes to VRM or model-domain expressions inside the model domain, and drives the package-owned model renderer or engine-backed model state.

#### Scenario: Model Live Mode drives existing model view
- **WHEN** a VRM or supported 3D model project is open and Live Mode is enabled
- **THEN** `neko-model` subscribes to tracking data, applies model-domain mapping, and updates the existing model preview without opening `neko-live`

#### Scenario: Model mapping clamps expression values
- **WHEN** tracking data maps to VRM expression values
- **THEN** `neko-model` clamps output values to the supported expression range before applying them

### Requirement: Neko Live Renderer De-duplication
The system SHALL remove `neko-live` duplicated single-avatar VRM/Puppet renderers only after `neko-puppet` and `neko-model` Live Mode workflows are available. After removal, `neko-live` MUST focus on scene composition, multi-source orchestration, recording, streaming, and control panels.

#### Scenario: Renderer removal is gated
- **WHEN** `neko-puppet` and `neko-model` Live Mode workflows are not yet available
- **THEN** `neko-live` duplicated renderers remain available or a compatible fallback remains enabled

#### Scenario: Neko live composes sources after migration
- **WHEN** duplicated single-avatar renderers are removed from `neko-live`
- **THEN** `neko-live` still supports scene composition, recording, streaming, and device role control through `LiveSessionService`

### Requirement: Native Device Management And Workflow Selectors Remain Separate
The system SHALL keep the global device management surface separate from `neko-live` workflow controls. Global device management MUST use native VSCode surfaces, while workflow panels MAY embed device selectors for task-specific choices.

#### Scenario: Global device list uses native surface
- **WHEN** a user opens the Neko device management view
- **THEN** the device list, status, permission, and revoke actions are presented through native VSCode UI

#### Scenario: Neko live embeds workflow-specific selector
- **WHEN** a user chooses which camera or audio input to use for a live scene
- **THEN** `neko-live` may show a workflow-specific selector backed by `DeviceManager` without merging the global device management view into the live panel
