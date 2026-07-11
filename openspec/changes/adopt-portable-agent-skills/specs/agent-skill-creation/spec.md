## ADDED Requirements

### Requirement: Native CreateSkill accepts a complete typed package definition
The Agent runtime SHALL expose native Skill creation through a typed input containing a target, complete portable Skill definition, optional resources, and optional Neko overlay.

#### Scenario: Create a minimal project Skill
- **WHEN** the Agent invokes `CreateSkill` with a valid project target, name, description, and body
- **THEN** the runtime SHALL commit `<workspace>/.agents/skills/<name>/SKILL.md`
- **AND** the result SHALL identify the created project Skill
- **AND** no `manifest.json`, empty overlay, or placeholder resource directory SHALL be written.

#### Scenario: Create a complete personal Skill package
- **WHEN** the Agent invokes `CreateSkill` with a personal target, valid portable optional fields, resources, and a valid Neko overlay
- **THEN** the runtime SHALL commit the complete package under `${HOME}/.agents/skills/<name>`
- **AND** serialized files SHALL preserve the validated author definition.

#### Scenario: Creation does not require authoring workflow artifacts
- **WHEN** a complete valid `CreateSkill` request is submitted
- **THEN** the runtime SHALL NOT require a persisted draft, validation file, review artifact, apply command, or Skill-specific approval token
- **AND** existing general file, sandbox, workspace trust, and Host policy SHALL remain authoritative.

### Requirement: CreateSkill validates before making a package discoverable
The runtime SHALL validate the complete package and all resource paths before committing the final Skill directory.

#### Scenario: Invalid portable definition
- **WHEN** the input has an invalid name, description, metadata value, compatibility text, or reserved resource collision
- **THEN** creation SHALL fail with a typed diagnostic
- **AND** no final Skill directory SHALL exist.

#### Scenario: Resource path traversal
- **WHEN** a resource path is absolute, escapes with `..`, is empty, or targets outside the Skill directory
- **THEN** creation SHALL fail visibly
- **AND** it SHALL NOT write any file outside the temporary package directory.

#### Scenario: Invalid Neko overlay
- **WHEN** the input contains an invalid or unsupported Neko overlay
- **THEN** creation SHALL fail before final commit
- **AND** it SHALL NOT silently omit the overlay and create a degraded Skill.

### Requirement: CreateSkill commits atomically and conflicts fail closed
The runtime SHALL write a complete package to a sibling temporary directory and make it discoverable only through an atomic final-directory commit.

#### Scenario: Successful atomic commit
- **WHEN** all package files are written successfully and the target does not exist
- **THEN** the runtime SHALL rename the temporary directory to the final Skill directory
- **AND** watchers SHALL observe a complete package rather than partially written files.

#### Scenario: Write failure cleans temporary state
- **WHEN** writing any package file fails before final commit
- **THEN** creation SHALL remove the temporary directory
- **AND** no discoverable final Skill directory SHALL remain.

#### Scenario: Target already exists
- **WHEN** the final Skill directory already exists
- **THEN** creation SHALL return a conflict diagnostic
- **AND** it SHALL NOT return the existing path as successful creation or overwrite its contents.

#### Scenario: Concurrent final commit conflict
- **WHEN** another creator wins the final-directory race
- **THEN** the losing creation SHALL fail visibly and clean its temporary directory
- **AND** it SHALL NOT merge or partially overwrite the winner.

### Requirement: Creation is not activation or authorization
Creating a Skill SHALL only make a package available for registry discovery and SHALL NOT enable, activate, or authorize it implicitly.

#### Scenario: Created Skill remains inactive
- **WHEN** `CreateSkill` succeeds
- **THEN** the active Skill lifecycle state SHALL remain unchanged
- **AND** the Skill SHALL require the existing explicit user or Agent activation path before prompt injection.

#### Scenario: Author metadata cannot grant runtime authority
- **WHEN** creation input attempts to describe source, trust, editability, catalog actions, enablement, model authority, or activation lifetime as author metadata
- **THEN** the typed creation contract SHALL reject or exclude those fields
- **AND** Host/Registry policy SHALL derive the corresponding runtime facts.

### Requirement: All valid creation paths converge on the same registry behavior
Native `CreateSkill`, general file creation, and user manual creation SHALL produce equivalent canonical packages when their file contents are equivalent.

#### Scenario: Manual package is rescanned
- **WHEN** a user or general file capability writes a valid package directly to a canonical root
- **THEN** normal scan or watch processing SHALL register it without requiring a native creation receipt.

#### Scenario: Native package is rescanned
- **WHEN** native creation commits a valid package
- **THEN** subsequent scan or watch processing SHALL load it through the same loader used for manual packages
- **AND** creation-specific hidden metadata SHALL NOT be required.
