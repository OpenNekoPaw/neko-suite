# unified-viewport-protocol Specification

## Purpose
Define the shared viewport command/event protocol, scene controller interface, shell UI contract, overlays, and domain controller isolation.
## Requirements
### Requirement: Viewport Protocol Envelope
The system SHALL define shared `ViewportCommand`, `ViewportEvent`, and `ViewportFrameMeta` DTOs in L0 shared contracts without React, DOM, VSCode, or Node dependencies.

#### Scenario: Command envelope is serializable
- **WHEN** Webview sends an engine-mediated viewport or scene command
- **THEN** the command includes `protocolVersion`, `domain`, `action`, `sceneId`, `seq`, `correlationId`, `timestamp`, `source`, optional `baseRevision`, and serializable payload data

#### Scenario: Event envelope acknowledges command
- **WHEN** Engine completes or rejects a viewport command
- **THEN** it returns an event with `protocolVersion`, `ackSeq`, `revision`, `timestamp`, optional error data, and serializable payload data

#### Scenario: Protocol version is enforced
- **WHEN** a command or event uses an unsupported `protocolVersion`
- **THEN** the receiver rejects or ignores it with a compatibility diagnostic rather than applying it silently

### Requirement: Shell-Local And Engine-Mediated Commands
The system SHALL distinguish shell-local viewport interactions from engine-mediated viewport and scene commands.

#### Scenario: Pan and zoom stay local
- **WHEN** a user pans or zooms a viewport surface
- **THEN** ViewportShell can update local viewport state without sending a per-frame engine command

#### Scenario: Selection goes through engine
- **WHEN** a user performs selection, marquee, transform, or camera operations that require engine state
- **THEN** the controller sends a `ViewportCommand` through the engine-mediated route with current scene or viewport revision when required

#### Scenario: Scene write uses envelope
- **WHEN** a domain controller sends a `scene:*` write command
- **THEN** the command uses the ViewportProtocol envelope and includes a base revision unless the operation is explicitly revision-free

### Requirement: Scene Controller Interface
The system SHALL define an `ISceneController` interface that lets domain editors inject scene-specific input handling, overlays, toolbar extensions, context menus, and scene event handling into ViewportShell.

#### Scenario: ViewportShell delegates pointer input
- **WHEN** a pointer event occurs on ViewportShell
- **THEN** the shell converts it to a viewport input DTO and delegates to the active scene controller without branching on domain implementation details

#### Scenario: Controller supplies overlays
- **WHEN** OverlayRenderer renders a frame
- **THEN** it consumes overlay descriptors supplied by the scene controller and does not import puppet, model, or live implementation modules

#### Scenario: Controller handles scene event
- **WHEN** an engine scene event arrives for a domain scene
- **THEN** ViewportShell or the host routes it to the owning scene controller's event handler

### Requirement: ViewportShell UI Component
The system SHALL provide a L2 React/DOM ViewportShell component in `@neko/ui` for video display, input capture, overlay composition, toolbar extension points, and local viewport state.

#### Scenario: Shell renders engine stream
- **WHEN** a valid stream descriptor or stream URL is provided
- **THEN** ViewportShell renders decoded engine frames as the primary visual surface

#### Scenario: Toolbar has shared and domain controls
- **WHEN** ViewportToolbar renders
- **THEN** it includes shared viewport controls and appends domain-specific toolbar descriptors supplied by the scene controller

#### Scenario: UI package remains L2
- **WHEN** `@neko/ui` ViewportShell is imported
- **THEN** consumers receive React/DOM UI components and shared DTOs remain sourced from `@neko/shared` L0

### Requirement: Overlay Prediction Lifecycle
The system SHALL provide prediction overlay lifecycle behavior for command feedback that is reconciled with command acknowledgements and frame metadata.

#### Scenario: Prediction commits on ack
- **WHEN** a controller creates a prediction for command sequence `seq=42` and Engine acknowledges that sequence successfully
- **THEN** the prediction is marked committed or cleared according to the controller policy

#### Scenario: Prediction rolls back on error
- **WHEN** Engine rejects a predicted command with an error event
- **THEN** ViewportShell or the controller rolls back the prediction and restores the last confirmed overlay state

#### Scenario: Prediction times out
- **WHEN** a prediction receives no ack, matching frame metadata, resync, or invalidation within its timeout budget
- **THEN** the system rolls back the prediction and requests authoritative state refresh

### Requirement: Overlay Coordinate Alignment
The system SHALL align overlays with engine-rendered frames using frame metadata and view transform data.

#### Scenario: 2D overlay uses frame transform
- **WHEN** a 2D overlay descriptor is drawn over an engine frame
- **THEN** OverlayRenderer uses the frame's `viewTransform` or equivalent matrix to place overlay geometry within the configured pixel tolerance

#### Scenario: Stale overlay metadata is rejected
- **WHEN** overlay data references a different viewport id or incompatible revision from the displayed frame
- **THEN** the renderer marks it stale, requests fresh overlay data, or avoids drawing it as authoritative

### Requirement: Domain Controller Isolation
The system SHALL keep puppet, model, and live scene controllers in their owning packages and prohibit direct implementation imports between editor packages.

#### Scenario: Puppet does not import model controller
- **WHEN** neko-puppet implements `PuppetController`
- **THEN** it depends only on shared viewport contracts and shared UI components, not neko-model implementation files

#### Scenario: Shared shell has no domain branches
- **WHEN** ViewportShell is built
- **THEN** it does not contain puppet/model/live-specific command or overlay implementations
