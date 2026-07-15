## ADDED Requirements

### Requirement: Storyboard source normalization defaults to Board Markdown

The system SHALL accept prompt, text, script, document, comic, image sequence, and existing storyboard sources through one canonical Storyboard Skill. Without explicit structured authoring intent, it SHALL produce Markdown in the resolved Board Canvas; structured Storyboard creation or revision occurs only through an explicit professional action or target.

#### Scenario: User requests an exploratory storyboard

- **WHEN** the user asks for storyboard ideas, analysis, planning, alternatives, or a first draft without explicit professional creation intent
- **THEN** the Skill produces reviewable Markdown with source trace, uncertainties, references, and useful creative fields and runtime automatically authors it into the resolved Board Canvas

#### Scenario: User requests structured Storyboard creation

- **WHEN** the user explicitly chooses to create or update structured Storyboard content through a professional action or target
- **THEN** the owning normalizer validates and materializes the canonical structured Storyboard contract before mutation

### Requirement: Board Markdown preserves creative meaning without fixed production schema

Storyboard Markdown in a Board SHALL preserve the available narrative intent, scene/shot suggestions, visual/action/camera direction, dialogue/sound, duration, references, and unresolved choices, but MUST NOT require stable scene/shot identity or every structured production field before it can be retained.

#### Scenario: Source lacks production details

- **WHEN** a source supports a useful creative plan but lacks exact duration, voice prompt, or stable shot IDs
- **THEN** the Markdown records the uncertainty and remains reviewable instead of inventing authoritative values or failing solely for missing production structure

#### Scenario: Skill-specific columns are useful

- **WHEN** a comic, advertisement, animation, or other source profile needs additional Markdown columns
- **THEN** the Markdown may preserve those columns as normal document content without requiring a specialized Basic node

### Requirement: Structured Storyboard remains canonical after explicit authoring

Structured Storyboard creation SHALL produce the canonical contract with stable scene/shot identity, order, source trace, revision, validation state, references, and semantic prompt intent required by owning domains. Source Markdown MUST NOT silently create or rewrite structured nodes.

#### Scenario: Markdown is applied explicitly

- **WHEN** a creator confirms structured Storyboard creation from Board Markdown through a professional action
- **THEN** normalization validates bindings and creates structured Storyboard content while retaining the Markdown as source provenance or explicit reapply input

#### Scenario: Source Markdown is edited later

- **WHEN** the creator edits the source Markdown after professional creation
- **THEN** no structured Storyboard mutation occurs until an explicit validated diff/reapply action is confirmed

### Requirement: Storyboard Skill content remains method-focused

Storyboard Skill content SHALL describe source interpretation, creative methodology, Markdown-versus-structured authoring judgment, output quality, uncertainty, continuity, and review behavior. It MUST NOT contain Board/tool names, command tutorials, message schemas, task polling, target identity, cache/path protocol, or package authoring internals.

#### Scenario: Skill package is validated

- **WHEN** builtin or custom Storyboard Skill content is loaded or tested
- **THEN** anti-backflow validation rejects runtime protocol while runtime capability prompts provide current routing and schema information separately
