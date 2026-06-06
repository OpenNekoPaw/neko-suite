## ADDED Requirements

### Requirement: Skill catalog projection
The system SHALL expose a compact skill catalog projection for UI consumers without requiring those consumers to parse SKILL.md content, skill prompt text, or manifest files directly.

#### Scenario: Built-in skill projected
- **WHEN** Dashboard requests the Agent skill catalog
- **THEN** each visible built-in skill is returned with id, display name, description, icon, tags, source, role, visibility, editability, and available actions

#### Scenario: Markdown body is not parsed by Dashboard
- **WHEN** a skill contains Markdown headings, tables, or numbered workflow text
- **THEN** Dashboard SHALL render catalog metadata from the projection and SHALL NOT infer grouping, role, or actions by parsing the Markdown body

### Requirement: Catalog roles distinguish skill kinds
The system SHALL classify catalog entries into deterministic roles for UI grouping and management.

#### Scenario: Media orchestrator grouped with focused sub-skills
- **WHEN** `media-to-video` and its focused skills are available
- **THEN** the catalog SHALL identify `media-to-video` as an orchestrator and identify `comic-to-storyboard`, `image-to-shot`, `storyboard-to-animation-plan`, `animation-plan-to-cut`, `generated-shot-assembly`, and `export-video-package` as focused sub-skills associated with that orchestrator

#### Scenario: Personas are hidden from primary catalog
- **WHEN** internal persona skills are registered
- **THEN** the catalog SHALL mark them hidden or omit them from the primary Dashboard skill catalog

### Requirement: File skills are first-class catalog entries
The system SHALL include project and personal `.neko/skills` entries in the skill catalog using the same projection shape as built-in skills.

#### Scenario: Workspace skill appears after scan
- **WHEN** `.neko/skills/review/SKILL.md` exists with valid frontmatter
- **THEN** the catalog SHALL include a project-sourced editable skill entry for `review`

#### Scenario: Personal skill appears after scan
- **WHEN** `~/.neko/skills/reference-check/SKILL.md` exists with valid frontmatter
- **THEN** the catalog SHALL include a personal-sourced editable skill entry for `reference-check`

#### Scenario: File skill changes refresh catalog
- **WHEN** a watched project or personal skill file is created, changed, or deleted
- **THEN** the Agent SHALL rescan skills and make the updated catalog available to Dashboard without requiring VSCode restart

### Requirement: Source precedence is deterministic
The system SHALL resolve duplicate skill ids from multiple sources using deterministic precedence.

#### Scenario: Project skill overrides builtin
- **WHEN** a project skill and a built-in skill share the same id
- **THEN** the primary catalog entry SHALL represent the project skill and the lower-priority built-in entry SHALL be hidden or moved to an advanced duplicate view

#### Scenario: Personal skill overrides builtin but not project
- **WHEN** project, personal, and built-in skills share the same id
- **THEN** the primary catalog entry SHALL represent the project skill, with personal and built-in entries available only through advanced duplicate inspection if exposed

### Requirement: Safe skill management actions
The system SHALL expose skill management actions as typed, host-resolved operations rather than arbitrary file paths or arbitrary Webview-originating commands.

#### Scenario: Editable file skill opens in VSCode
- **WHEN** Dashboard requests the `edit` action for a project or personal skill catalog entry
- **THEN** the Extension Host SHALL resolve the known skill directory and open its `SKILL.md` in VSCode

#### Scenario: Built-in skill can be forked
- **WHEN** Dashboard requests the `fork` action for a non-editable built-in skill
- **THEN** the Agent SHALL create a project or personal `.neko/skills/<name>/SKILL.md` copy and open it for editing

#### Scenario: Unsafe action request is rejected
- **WHEN** Dashboard sends a skill action with an unknown source, unknown skill id, unsupported action, or path-like payload
- **THEN** the Extension Host SHALL reject the request and SHALL NOT open, reveal, create, duplicate, or delete files

### Requirement: Catalog metadata is non-orchestrating
The system SHALL keep catalog metadata limited to display, grouping, source, editability, and safe action projection.

#### Scenario: Catalog metadata does not define workflow order
- **WHEN** a skill declares catalog metadata
- **THEN** that metadata SHALL NOT contain ordered steps, branch conditions, route priorities, executable stages, or a workflow DAG

#### Scenario: Prompt-chain guidance remains in skill content
- **WHEN** a skill needs to describe collaboration with related skills or tool order
- **THEN** that guidance SHALL remain in SKILL.md body text or built-in skill prompt content, not in catalog metadata
