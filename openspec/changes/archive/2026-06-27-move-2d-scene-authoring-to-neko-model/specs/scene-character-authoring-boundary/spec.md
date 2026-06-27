## ADDED Requirements

### Requirement: 2D Scene authoring is owned by Neko Model

The system SHALL route generic 2D Scene creation and editing to `neko-model` using `.nkm profile: 2d` as the durable project format.

#### Scenario: Create a 2D Scene project
- **WHEN** a user creates a generic 2D Scene with sprites, tilemaps, lights, parallax, particles, or camera settings
- **THEN** the created durable project MUST be an `.nkm` Scene project with `profile: 2d`
- **AND** the editor surface MUST be owned by `neko-model`

#### Scenario: Open a 2D Scene project
- **WHEN** a user opens an `.nkm` project with `profile: 2d`
- **THEN** the system SHALL open it through the `neko-model` Scene editor path
- **AND** the editor MUST treat scene graph, camera, light, and viewport settings as Scene domain truth

### Requirement: Puppet editor is limited to character authoring

The system SHALL keep `neko-puppet` focused on `.nkp` Live2D/Puppet character authoring and MUST NOT expose generic 2D Scene authoring as a first-class workflow.

#### Scenario: Open a Live2D Puppet project
- **WHEN** a user opens an `.nkp` Live2D project or imports a model3/MOC3 bundle
- **THEN** the system SHALL open it through `neko-puppet`
- **AND** the editor SHALL expose character parameters, expressions, motions, physics, tracking mappings, and puppet preview controls

#### Scenario: Generic scene tools are not shown in Puppet
- **WHEN** a user is editing an `.nkp` project in `neko-puppet`
- **THEN** the editor MUST NOT present tilemap, stage camera, scene light, parallax, particle, or generic scene graph creation as primary Puppet tools

### Requirement: Scene and Character project truths remain separate

The system SHALL keep `.nkm` Scene truth and `.nkp` Character truth separate, connected only through stable references where cross-domain composition is needed.

#### Scenario: Live Stage references a Puppet actor
- **WHEN** a `.nkm profile: live` stage uses a Live2D or Puppet character
- **THEN** the `.nkm` project SHALL reference the `.nkp` actor through a stable project or asset reference
- **AND** the `.nkm` project MUST NOT copy the `.nkp` character parameter definitions, motion libraries, expression libraries, or physics truth

#### Scenario: Puppet project does not own stage truth
- **WHEN** a user saves an `.nkp` project
- **THEN** the project MUST NOT persist generic stage camera, scene switching, light rig, tilemap, parallax, or scene graph truth
- **AND** those concerns MUST be saved in `.nkm` when they are part of a Scene or Live Stage

### Requirement: Viewport reuse does not imply domain ownership

The system MAY reuse shared viewport UI infrastructure across Model and Puppet editors, but shared viewport reuse MUST NOT require Puppet commands or project data to be modeled as generic Scene authoring truth.

#### Scenario: Puppet uses shared viewport shell
- **WHEN** `neko-puppet` uses a shared viewport shell, overlay renderer, pointer handling, or prediction layer
- **THEN** the user-visible and package-local behavior SHALL remain Puppet/Character scoped
- **AND** any shared protocol naming that still uses scene-oriented fields MUST be isolated behind package-local adapters or tracked for contract cleanup

#### Scenario: Puppet viewport commands are audited
- **WHEN** Puppet viewport actions are represented in shared command or event contracts
- **THEN** those actions SHALL use Puppet/Character domain naming when the shared protocol supports it
- **AND** any temporary `scene:puppet:*` compatibility path MUST have tests and a documented removal condition

### Requirement: Wrong-domain prelaunch drafts fail clearly

The system SHALL provide clear diagnostics for unreleased or experimental `.nkp` files that attempt to represent generic 2D Scene projects instead of silently treating them as Puppet character data.

#### Scenario: Open wrong-domain NKP scene draft
- **WHEN** a user opens an `.nkp` draft that contains generic 2D Scene fields such as tilemaps, scene lights, stage cameras, parallax layers, or scene switching
- **THEN** the system SHALL report that generic 2D Scene authoring belongs to `.nkm profile: 2d`
- **AND** the system MUST NOT silently discard those fields while saving the `.nkp` file
