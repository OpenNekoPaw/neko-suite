# engine-puppet-control-and-renderer Specification

## Purpose
TBD - created by archiving change implement-engine-puppet-control-and-renderer. Update Purpose after archive.
## Requirements
### Requirement: Puppet Command Envelope
The engine SHALL accept puppet editing commands through a sequence- and revision-aware command envelope.

#### Scenario: Ordered command is applied
- **WHEN** a puppet WebSocket command arrives with the expected sequence and revision
- **THEN** the service applies the command and returns an applied acknowledgement

#### Scenario: Out-of-order command is rejected
- **WHEN** a puppet command arrives with an unexpected sequence number
- **THEN** the service rejects it with an ordering error

#### Scenario: Revision conflict is rejected
- **WHEN** a puppet command references a stale base revision
- **THEN** the service rejects it with a revision conflict response

### Requirement: REST Compatibility Alias
The engine SHALL keep existing puppet REST commands available as compatibility aliases during migration.

#### Scenario: REST alias is used
- **WHEN** a client calls an existing puppet REST command
- **THEN** the route translates it into the same command handling path as the WebSocket protocol

### Requirement: Engine-Side Puppet Renderer
The engine SHALL provide a GPU puppet renderer that consumes deformed meshes and texture atlases and exposes output that can be submitted to sinks or adapted into GPU composition layers.

#### Scenario: Puppet frame rendered
- **WHEN** puppet deformation data and textures are available
- **THEN** `PuppetRenderer` produces a GPU frame output compatible with `VideoOutput::GpuFrame`

#### Scenario: Puppet output can become composition layer
- **WHEN** export needs to composite a visible Puppet timeline element with other visual layers
- **THEN** the puppet render output can be adapted to a `GpuLayer` without CPU readback when supported by the platform handle

#### Scenario: Canvas2D remains debug only
- **WHEN** engine GPU rendering is available
- **THEN** Canvas2D is not used as a production rendering fallback for export or composition

### Requirement: Puppet GPU Budget Integration
Puppet GPU rendering SHALL acquire GPU budget permits before render work.

#### Scenario: Puppet render under pressure
- **WHEN** PuppetRenderer runs while interactive GPU pressure is high
- **THEN** it follows the configured budget priority behavior instead of switching to CPU rendering

#### Scenario: Export render reports budget pressure
- **WHEN** Puppet rendering is requested by GPU export while the GPU budget is queued or paused
- **THEN** the export path receives an explicit retry/busy error rather than blocking indefinitely

### Requirement: Puppet Source Reference Loading
The engine SHALL support loading puppet sources from engine-resolved file references without requiring Extension or Webview code to forward `.moc3` bytes as base64.

#### Scenario: Load puppet from token source
- **WHEN** a client calls the puppet load-source action with a registered file token
- **THEN** the engine resolves the token and loads the `.moc3` data inside the engine process

#### Scenario: Legacy byte load remains compatible
- **WHEN** an existing client calls the legacy puppet byte-load action during migration
- **THEN** the engine continues to accept the request until the compatibility path is removed by a later change

#### Scenario: Webview does not receive puppet binary
- **WHEN** a puppet file is opened after source-reference loading is available
- **THEN** the Extension sends engine connection/source metadata rather than base64 puppet binary data to the Webview

### Requirement: Puppet Service Uses A Computation Boundary
PuppetService SHALL centralize Bevy world access through a computation boundary equivalent to the scene service `creative<R>()` / `data<R>()` closure pattern.

#### Scenario: Puppet data query locks centrally
- **WHEN** PuppetService reads snapshots, parameters, or deformed meshes
- **THEN** the read path uses the centralized world access helper
- **THEN** lock poisoning maps to the existing service error category consistently

#### Scenario: Puppet mutation locks centrally
- **WHEN** PuppetService applies commands, ticks animation, or updates parameters
- **THEN** the mutation path uses the centralized world access helper
- **THEN** command ordering and revision checks remain compatible

#### Scenario: Public puppet service behavior is preserved
- **WHEN** existing callers use `IPuppetService`
- **THEN** method names, return types, and compatibility command behavior remain stable unless a later spec explicitly changes them

