## ADDED Requirements

### Requirement: PSD To Puppet Bridge Roadmap
The system SHALL define a design-only bridge contract for converting PSD layer trees into puppet rig definitions.

#### Scenario: Convert PSD layer tree
- **WHEN** a PSD layer tree is provided by the sketch PSD parser
- **THEN** the bridge contract describes how groups, layers, visibility, and ordering can map into a puppet rig definition

### Requirement: PSD Bridge Is Deferred
The system SHALL keep PSD-to-puppet auto-rigging implementation out of the main puppet/model format integration implementation.

#### Scenario: Main integration completes without PSD bridge
- **WHEN** Live2D import and puppet/model asset integration are implemented
- **THEN** the change can complete without automatic PSD rig generation
