## ADDED Requirements

### Requirement: Native Puppet Entity Binding
The creative entity system SHALL support native 2D puppet bindings through a `puppet-bone` representation role or equivalent native puppet role metadata.

#### Scenario: Character binds native puppet
- **WHEN** a character entity is associated with a native `.nkp` puppet
- **THEN** `.nkentity` v2 stores a binding that identifies the puppet as the native bone/BlendShape representation rather than a legacy Live2D representation

#### Scenario: Legacy Live2D binding can coexist
- **WHEN** a converted character keeps its original Live2D asset as fallback
- **THEN** `.nkentity` can contain both the native puppet binding and an optional legacy `live2d` binding without ambiguity over the default representation

### Requirement: Native Puppet Entity Metadata
The creative entity contract SHALL expose native puppet capability metadata such as rig template, BlendShape standard, implemented BlendShapes, and source generation status.

#### Scenario: Entity metadata advertises rig capability
- **WHEN** a native puppet entity is exported or indexed
- **THEN** metadata includes enough rig and BlendShape capability data for Agent, Live, and editor consumers to discover supported operations

#### Scenario: Missing capability is explicit
- **WHEN** a native puppet lacks a standard BlendShape or a full-body rig
- **THEN** metadata or capability query results indicate the missing capability rather than requiring consumers to assume a full ARKit or humanoid set

### Requirement: Native Puppet Representation Resolution
Representation resolution SHALL prefer native puppet bindings for puppet/game/video/native animation targets when present.

#### Scenario: Native puppet preferred for animation
- **WHEN** a consumer requests a character representation for native puppet animation and the entity has a `puppet-bone` binding
- **THEN** the resolver returns the native puppet binding before falling back to legacy Live2D or portrait representations

#### Scenario: Live target can choose fallback
- **WHEN** a Live workflow requires a legacy Live2D representation and no native tracking bridge is available
- **THEN** resolution can return an optional legacy Live2D binding according to target fallback policy
