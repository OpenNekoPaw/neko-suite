# tracking-service Specification

## Purpose
TBD - created by archiving change add-device-management. Update Purpose after archive.
## Requirements
### Requirement: Shared Tracking Contract
The system SHALL define shared tracking contracts in `@neko/shared` for tracking source, tracking data, tracking status, tracking service API, and disposable listener handles. The contracts MUST support VMC, camera-face, XR, and manual sources without binding to a specific renderer package.

#### Scenario: Tracking data is source-neutral
- **WHEN** a consumer receives `TrackingData`
- **THEN** the data identifies its source and exposes blend shapes, optional head transform, and optional bone transforms without referencing `neko-live`, `neko-puppet`, or `neko-model` internals

#### Scenario: Shared tracking contract has no VSCode dependency
- **WHEN** `@neko/shared` exports `TrackingServiceApi`
- **THEN** the exported type uses shared disposable-like contracts and does not import `vscode`

### Requirement: Tracking Service API Ownership
The system SHALL expose tracking through an Extension Host service API. Consumers MUST obtain the service through a stable command or extension API and MUST NOT import another extension package's private `VmcReceiver`, OSC parser, or event emitter.

#### Scenario: Consumer obtains service API
- **WHEN** `neko-puppet`, `neko-model`, or `neko-live` requests tracking access
- **THEN** it obtains a `TrackingServiceApi` through the registered service entry point rather than constructing `VmcReceiver`

#### Scenario: Private import is not required
- **WHEN** tracking service implementation moves from `neko-live` to `neko-suite` or a platform extension
- **THEN** consumers continue using the same API contract without importing implementation files

### Requirement: VMC Receiver Lifecycle
The system SHALL adapt the existing VMC UDP receiver behind `TrackingServiceApi`. Starting and stopping VMC tracking MUST be idempotent, MUST publish status changes, and MUST release the UDP socket on stop or service disposal.

#### Scenario: Start VMC tracking
- **WHEN** a caller invokes `TrackingServiceApi.start({ source: 'vmc', port })`
- **THEN** the service starts listening on the requested or configured UDP port and publishes an active tracking status

#### Scenario: Start is idempotent
- **WHEN** VMC tracking is already active and a caller invokes start with the same source and port
- **THEN** the service returns the current active status without creating a second UDP socket

#### Scenario: Stop releases resources
- **WHEN** a caller invokes `TrackingServiceApi.stop('vmc')`
- **THEN** the service stops the receiver, releases the UDP socket, and publishes an inactive tracking status

### Requirement: Tracking Event Subscription
The system SHALL allow multiple consumers to subscribe to tracking data and status changes. Each subscription MUST return a disposable handle, and disposing one listener MUST NOT affect other listeners.

#### Scenario: Multiple consumers receive tracking
- **WHEN** `neko-live`, `neko-puppet`, and `neko-model` register tracking data listeners
- **THEN** each active listener receives the same tracking frames from the service

#### Scenario: Disposed tracking listener stops receiving frames
- **WHEN** a consumer disposes its tracking data listener
- **THEN** the service stops sending tracking frames to that listener while other listeners continue receiving frames

### Requirement: Tracking Error Reporting
The system SHALL report tracking errors through status changes or typed errors rather than unhandled async failures. Port conflicts, malformed packets, and receiver failures MUST be visible to consumers and logs.

#### Scenario: Port conflict is reported
- **WHEN** VMC tracking cannot start because the UDP port is already in use
- **THEN** the service returns or publishes an error status with a recoverable message

#### Scenario: Malformed packet does not stop service
- **WHEN** the VMC receiver encounters a malformed OSC packet
- **THEN** the service logs the parse failure and continues processing subsequent valid packets
