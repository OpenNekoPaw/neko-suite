## ADDED Requirements

### Requirement: Canonical creative media Skills represent user intents
The system SHALL expose `storyboard`, `image`, `video`, `media-production`, `video-editing`, and `media-quality-review` as the canonical builtin Skills for creative media work. Source-specific methods and internal artifact conversion stages MUST NOT be exposed as equivalent top-level canonical Skills.

#### Scenario: User asks to animate a comic
- **WHEN** the user asks to turn a comic into an animation without naming internal stages
- **THEN** the Agent SHALL activate or reason through the canonical `media-production` workflow
- **AND** comic interpretation SHALL be selected as a source profile rather than requiring a chain of stage Skill invocations.

#### Scenario: User asks to edit one image
- **WHEN** the user requests generation, expansion, inpainting, coloring, compositing, or splitting of an image
- **THEN** the Agent SHALL use the canonical `image` Skill semantics
- **AND** it SHALL NOT require the user to select a provider or owning package before capability discovery.

### Requirement: Profiles and stages remain machine-discoverable but not user-level duplicates
The Skill catalog SHALL distinguish canonical Skills from source profiles, operation profiles, workflow stages, and artifact builders. Internal profiles and stages MUST remain available to the runtime through typed metadata or registries without appearing as duplicate ordinary Skill entries.

#### Scenario: Catalog projects creative Skills
- **WHEN** GetContext or the explicit Skill catalog projects builtin creative Skills
- **THEN** it SHALL list the canonical Skill identities once
- **AND** source profiles such as `from-comic` and stages such as Cut payload assembly SHALL be represented under their owning Skill metadata or runtime catalog rather than as peer Skills.

#### Scenario: New source profile is registered
- **WHEN** a new Storyboard source adapter is added
- **THEN** it SHALL register against the canonical `storyboard` Skill contract
- **AND** callers SHALL NOT require a new hard-coded Skill-name branch.

#### Scenario: Agent selects a Skill after source analysis
- **WHEN** the Agent finishes reading comic, document, or image evidence and decides a production Skill is required
- **THEN** the live AgentSession prompt SHALL expose the current registered Skill catalog
- **AND** the Agent SHALL select an exact registered identity rather than constructing a source-specific Skill name
- **AND** a removed identity SHALL NOT be attempted before or instead of the canonical Skill.

#### Scenario: Dashboard projects installed Skills
- **WHEN** the Dashboard reads catalog entries from Agent and feature-package providers
- **THEN** the installed-Skill list and count SHALL include only non-hidden Skill artifacts
- **AND** command wrappers classified as quick actions SHALL NOT be projected or counted as Skills
- **AND** orchestrator metadata SHALL NOT create a separate user-facing Skill category
- **AND** filtering the Dashboard SHALL NOT unregister or disable the owning package command, tool, or runtime capability.

### Requirement: Skill content does not own runtime tool protocols
Canonical creative Skill content SHALL contain creative methods, task judgment, profile selection guidance, and output semantics. Tool names, parameter schemas, polling/task protocols, path protocols, Webview messages, and owning package authoring details MUST remain in machine-readable metadata, capability prompts, tool schemas, or runtime catalogs.

#### Scenario: Runtime tool schema changes
- **WHEN** a provider or owning package changes an operation parameter schema
- **THEN** the runtime capability schema SHALL remain the authoritative executable contract
- **AND** no copied natural-language parameter table in Skill content SHALL require synchronized modification.

#### Scenario: Skill protocol regression test runs
- **WHEN** builtin and custom Skill content is validated
- **THEN** tests SHALL fail if prohibited runtime tool protocol or child-package authoring instructions flow back into Skill prompt content.

### Requirement: Ordinary Skills use the Skill invocation namespace
Canonical creative Skills SHALL be invoked explicitly through the existing `$skill` namespace or activated by the Agent through the canonical Skill runtime. They SHALL NOT become Slash commands solely because they are builtin Skills.

#### Scenario: Explicit creative Skill invocation
- **WHEN** the user enters `$storyboard` with source arguments
- **THEN** the runtime SHALL activate the canonical `storyboard` Skill through existing Skill injection
- **AND** it SHALL preserve the command/Skill namespace boundary.

#### Scenario: Legacy stage Skill is invoked
- **WHEN** a removed stage Skill name is invoked after its migration window
- **THEN** the runtime SHALL return a visible diagnostic naming the canonical replacement
- **AND** it SHALL NOT silently execute the legacy path or report success.
