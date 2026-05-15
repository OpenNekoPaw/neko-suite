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
The engine SHALL provide a GPU puppet renderer that consumes deformed meshes and texture atlases.

#### Scenario: Puppet frame rendered
- **WHEN** puppet deformation data and textures are available
- **THEN** `PuppetRenderer` produces a GPU frame output compatible with `VideoOutput::GpuFrame`

#### Scenario: Canvas2D remains debug only
- **WHEN** engine GPU rendering is available
- **THEN** Canvas2D is not used as a production rendering fallback for export or composition

### Requirement: Puppet GPU Budget Integration
Puppet GPU rendering SHALL acquire GPU budget permits before render work.

#### Scenario: Puppet render under pressure
- **WHEN** PuppetRenderer runs while interactive GPU pressure is high
- **THEN** it follows the configured budget priority behavior instead of switching to CPU rendering

