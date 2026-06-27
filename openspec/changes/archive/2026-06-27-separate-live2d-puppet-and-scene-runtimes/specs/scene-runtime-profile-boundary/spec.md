## ADDED Requirements

### Requirement: Scene runtime owns NKM profile execution

The system SHALL execute `.nkm profile: 2d`, `.nkm profile: 3d`, and `.nkm profile: live` documents through the Scene runtime boundary, not through the Puppet runtime boundary.

#### Scenario: Open a 2D Scene document
- **WHEN** a user opens an `.nkm` document with `profile: 2d`
- **THEN** the system MUST route runtime execution to the Scene service
- **AND** the editor surface MUST be owned by `neko-model`
- **AND** sprite, tilemap, 2D camera, 2D light, parallax, particle, scene graph, viewport, and scene preview behavior MUST remain Scene domain behavior

#### Scenario: Open a 3D Scene document
- **WHEN** a user opens an `.nkm` document with `profile: 3d`
- **THEN** the system MUST route runtime execution to the Scene service
- **AND** mesh, material, camera, light, skeleton, morph, transform, and scene graph behavior MUST remain Scene domain behavior

#### Scenario: Open a Live Stage document
- **WHEN** a user opens an `.nkm` document with `profile: live`
- **THEN** the system MUST route durable stage, actor, camera, routing, compositor, and scene switching truth through the Scene service or a documented Scene-owned stage profile
- **AND** the document MUST NOT become a Puppet project format

### Requirement: Neko Model owns 2D and 3D Scene editor routing

The system SHALL route generic 2D+3D Scene creation and editing to `neko-model` using `.nkm` as the durable project format.

#### Scenario: Create a 2D Scene
- **WHEN** a user creates a generic 2D Scene with sprites, tilemaps, lights, parallax, particles, cameras, or scene graph nodes
- **THEN** the created durable project MUST be an `.nkm` document with `profile: 2d`
- **AND** the editor route MUST be owned by `neko-model`
- **AND** the flow MUST NOT create an `.nkp` Puppet document

#### Scenario: Create or edit a 3D Scene
- **WHEN** a user creates or edits a 3D Scene with meshes, materials, cameras, lights, transforms, skeletons, or morph targets
- **THEN** the durable project MUST be an `.nkm` document with `profile: 3d`
- **AND** the editor route MUST be owned by `neko-model`

### Requirement: Scene actors reference Puppet truth by stable refs

The system SHALL allow Scene documents to reference Puppet actors through stable refs while keeping Puppet parameters, motions, expressions, physics, and tracking mappings owned by `.nkp`.

#### Scenario: Place a Puppet actor in a Scene
- **WHEN** a `.nkm` Scene or Live Stage places a Live2D or Neko Puppet character actor
- **THEN** the `.nkm` document MUST store a stable project, asset, or resource reference to the `.nkp` character
- **AND** the `.nkm` document MAY store Scene-owned placement, routing, timeline, or stage control data
- **AND** it MUST NOT copy the `.nkp` character parameter definitions, motion libraries, expression libraries, physics configuration, or tracking mapping truth

#### Scenario: Drive a Puppet actor from a Scene
- **WHEN** a Scene or Live Stage drives a referenced Puppet actor during preview or live operation
- **THEN** the drive path MUST use runtime commands, routing, or session state derived from the stable `.nkp` reference
- **AND** those runtime handles MUST NOT be persisted as durable Scene or Puppet identity

### Requirement: Scene profiles expose profile-specific diagnostics

The system SHALL report stable diagnostics when an `.nkm` profile cannot be loaded or edited by the Scene runtime/profile route.

#### Scenario: 2D Scene profile is not fully implemented
- **WHEN** a user opens an `.nkm profile: 2d` document and some editor panels or runtime capabilities are unavailable
- **THEN** `neko-model` MUST show an explicit unavailable or degraded-state diagnostic
- **AND** the system MUST NOT route generic 2D Scene editing to `neko-puppet` as a fallback

#### Scenario: Unknown Scene profile is encountered
- **WHEN** the system loads an `.nkm` document with an unsupported or unknown `profile`
- **THEN** the system MUST fail closed with a machine-readable diagnostic
- **AND** the diagnostic MUST preserve the source document without silently rewriting it as an `.nkp` document or another profile

### Requirement: Shared runtime shell does not merge Scene and Puppet truth

The system MAY reuse shared command envelopes, session registries, stream descriptors, diagnostics, GPU budget management, and renderer infrastructure across Scene and Puppet runtimes, but shared infrastructure MUST NOT merge `.nkm` Scene truth with `.nkp` Puppet truth.

#### Scenario: Scene and Puppet share stream infrastructure
- **WHEN** Scene and Puppet viewports use common stream descriptors, session registries, GPU queues, or diagnostic envelopes
- **THEN** each descriptor MUST still identify the owning runtime domain or capability
- **AND** Scene commands MUST remain Scene commands while Puppet commands MUST remain Puppet commands

#### Scenario: Renderer extracts data from separate runtimes
- **WHEN** renderer infrastructure consumes Scene or Puppet runtime state
- **THEN** it MUST consume snapshots, deltas, render worlds, or deformed mesh inputs appropriate to the owning runtime
- **AND** it MUST NOT require Scene runtime to understand Puppet SDK objects or Puppet runtime to understand Scene graph internals
