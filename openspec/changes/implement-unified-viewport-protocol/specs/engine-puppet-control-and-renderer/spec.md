## ADDED Requirements

### Requirement: Puppet Commands Align With ViewportProtocol
Puppet editing commands that originate from ViewportShell SHALL use ViewportProtocol scene command envelopes.

#### Scenario: Drag bone uses scene command
- **WHEN** a puppet controller sends a bone drag command
- **THEN** the command uses `domain: "scene"`, a `scene:puppet:*` action, sequence, correlation id, source, and base revision

#### Scenario: Puppet command ack updates prediction
- **WHEN** engine applies or rejects a puppet scene command
- **THEN** it returns a protocol event that allows the puppet controller to commit or roll back overlay prediction

### Requirement: Puppet Frames Provide Overlay Metadata
Puppet render frames SHALL provide metadata sufficient to align skeleton, mesh, and vertex overlays with the displayed video frame.

#### Scenario: Bone overlay aligns
- **WHEN** a puppet frame is displayed with bone overlay enabled
- **THEN** the overlay uses frame metadata transform data to draw bone handles within the configured pixel tolerance
