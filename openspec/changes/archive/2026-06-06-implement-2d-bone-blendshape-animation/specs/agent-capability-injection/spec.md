## ADDED Requirements

### Requirement: Native Puppet Agent Tools
The Agent capability system SHALL expose native puppet tools for creation, expression control, direct component edits, driver edits, and animation generation.

#### Scenario: Register native puppet tools
- **WHEN** neko-puppet activates in a host where Agent is available
- **THEN** it registers native puppet tools for create, set expression, set BlendShape, set bone, set ControlDriver, play animation, auto-rig, and generate animation operations

#### Scenario: Preset tool uses native capabilities
- **WHEN** Agent invokes `puppet:set_expression`
- **THEN** the tool resolves the expression against native puppet presets and implemented BlendShapes before sending commands

#### Scenario: Creation tool produces draft artifact
- **WHEN** Agent invokes native puppet creation for PSD, PNG, or Live2D input
- **THEN** the tool returns a draft `.nkp` or `.nkentity` reference plus diagnostics and confidence metadata rather than directly hiding generation quality concerns

### Requirement: Native Puppet Tool Safety Metadata
Native puppet Agent tools SHALL declare target requirements, safety kind, and query-before-mutate guidance.

#### Scenario: Bone mutation declares target
- **WHEN** a bone editing tool is registered
- **THEN** it declares required target fields such as puppet id and bone id/name and points query-before-mutate guidance to a puppet capability query tool

#### Scenario: Generation is marked non-trivial
- **WHEN** an auto-rig or animation generation tool is registered
- **THEN** it declares generation safety metadata and reports diagnostics or preview requirements before committing generated authoring state

#### Scenario: Missing native capability fails safely
- **WHEN** Agent requests a native puppet operation for a legacy-only MOC3 puppet
- **THEN** the tool reports that native conversion or migration is required instead of mutating legacy parameter state as if it were native data
