## ADDED Requirements

### Requirement: Canonical Skill packages use the portable Agent Skills shape
The system SHALL treat `SKILL.md` as the only required file in a canonical Skill package and SHALL support optional `scripts/`, `references/`, `assets/`, and `agents/` content without requiring a Neko-specific root manifest.

#### Scenario: Minimal standard Skill loads
- **WHEN** a canonical Skill directory contains a valid `SKILL.md` with only required portable frontmatter and a Markdown body
- **THEN** Neko SHALL discover and load the Skill without generating or requiring any other file
- **AND** the Skill SHALL be eligible for the same registry and explicit activation path as a Neko-authored Skill.

#### Scenario: Optional portable fields load
- **WHEN** `SKILL.md` contains supported portable fields such as license, compatibility, string metadata, or allowed tools
- **THEN** the parser SHALL preserve those author values in the loaded portable definition
- **AND** it SHALL NOT reinterpret them as Host trust, enablement, or activation authority.

#### Scenario: Optional resources remain relative
- **WHEN** a Skill includes files under `scripts/`, `references/`, or `assets/`
- **THEN** Neko SHALL expose or copy those files only through paths contained by the Skill directory
- **AND** an escaping or absolute resource path SHALL fail validation visibly.

### Requirement: Portable validation is deterministic and host-independent
The system SHALL validate portable Skill naming, required metadata, and path safety independently from Neko compatibility or first-party content quality.

#### Scenario: Valid portable identity
- **WHEN** a Skill name uses lowercase letters or digits separated by single hyphens, is at most 64 characters, and matches its directory basename
- **AND** its description is non-empty and at most 1024 characters
- **THEN** portable validation SHALL accept the identity.

#### Scenario: Invalid name fails visibly
- **WHEN** a name has uppercase characters, leading/trailing/consecutive hyphens, exceeds 64 characters, or differs from the directory basename
- **THEN** portable validation SHALL return an invalid portable diagnostic
- **AND** discovery or creation SHALL NOT silently normalize the package into success.

#### Scenario: Metadata values must be strings
- **WHEN** portable metadata contains a non-string value
- **THEN** portable validation SHALL reject the package with a field-specific diagnostic.

#### Scenario: Compatibility text is bounded
- **WHEN** portable compatibility text exceeds 500 characters
- **THEN** portable validation SHALL reject the package with a field-specific diagnostic.

### Requirement: Neko Host metadata uses an optional versioned overlay
The system SHALL read Neko-specific author metadata only from optional `agents/neko.yaml` and SHALL keep it separate from the portable `SKILL.md` contract.

#### Scenario: Skill has no Neko overlay
- **WHEN** a valid Skill package has no `agents/neko.yaml`
- **THEN** Neko SHALL load the portable Skill without an overlay error
- **AND** creation SHALL NOT generate an empty overlay or empty `agents/` directory.

#### Scenario: Supported Neko overlay loads
- **WHEN** `agents/neko.yaml` declares supported schema version 1 interface, dependency, or relationship metadata
- **THEN** Neko SHALL validate and project the known metadata
- **AND** Host runtime facts SHALL still be derived by the Registry.

#### Scenario: Unknown Neko overlay version fails visibly
- **WHEN** `agents/neko.yaml` declares an unknown schema version
- **THEN** Neko SHALL report an `invalid-overlay` diagnostic
- **AND** it SHALL NOT guess, downgrade, or activate a partially interpreted overlay.

#### Scenario: Other host overlays do not block Neko
- **WHEN** the package contains `agents/<other-host>.yaml`
- **THEN** Neko SHALL ignore that overlay for Neko runtime projection
- **AND** whole-directory copy or edit operations SHALL preserve the file.

### Requirement: Validation dimensions remain distinct
The system SHALL report portable validity, Neko overlay validity, current Host compatibility, and Neko first-party quality as separate conclusions.

#### Scenario: Portable but locally incompatible Skill
- **WHEN** a portable-valid Skill declares a Neko dependency unavailable in the current Host
- **THEN** portable validity SHALL remain valid
- **AND** compatibility SHALL report an incompatible diagnostic
- **AND** activation SHALL fail closed if the missing dependency is required.

#### Scenario: User Skill is not subject to first-party publication policy
- **WHEN** a user-authored Skill is portable-valid but does not follow Neko builtin prompt-writing conventions
- **THEN** it SHALL remain a valid user Skill
- **AND** first-party quality diagnostics SHALL NOT be represented as portable format failures.

### Requirement: Canonical writable roots are application-independent Agent Skill roots
The system SHALL use `<workspace>/.agents/skills` for project Skills and `${HOME}/.agents/skills` for personal Skills in normal creation, discovery, watch, and catalog flows.

#### Scenario: Project Skill is discovered from canonical root
- **WHEN** a valid package is manually created under `<workspace>/.agents/skills/<name>`
- **THEN** the next scan or watcher refresh SHALL discover it as a project Skill.

#### Scenario: Personal Skill is discovered from canonical root
- **WHEN** a valid package is manually created under `${HOME}/.agents/skills/<name>`
- **THEN** the next scan or watcher refresh SHALL discover it as a personal Skill.

#### Scenario: Legacy root is not a fallback
- **WHEN** a Skill exists only under `<workspace>/.neko/skills` or `${HOME}/.neko/skills`
- **THEN** normal discovery SHALL NOT load it
- **AND** a missing or invalid canonical package SHALL NOT be masked by the legacy package.

### Requirement: Portable Skill roots do not replace Neko configuration roots
The system SHALL continue to resolve Neko user configuration from `${HOME}/.neko` and workspace configuration from `<workspace>/.neko`, independently of portable Skill root resolution.

#### Scenario: User configuration remains in the Neko namespace
- **WHEN** the Host resolves the canonical user configuration
- **THEN** its configuration root SHALL be `${HOME}/.neko`
- **AND** its canonical configuration file SHALL be `${HOME}/.neko/config.toml`
- **AND** `${HOME}/.agents` SHALL NOT be treated as a Neko configuration root.

#### Scenario: Workspace configuration remains in the Neko namespace
- **WHEN** the Host resolves configuration for a workspace
- **THEN** its configuration root SHALL be `<workspace>/.neko`
- **AND** its canonical configuration file SHALL be `<workspace>/.neko/config.toml`
- **AND** `<workspace>/.agents` SHALL NOT be treated as a Neko configuration root.

#### Scenario: Neko configuration root does not imply Skill discovery
- **WHEN** the Host scans normal Skill sources
- **THEN** the existence of `${HOME}/.neko` or `<workspace>/.neko` SHALL NOT add `.neko/skills` to the normal Skill scan plan
- **AND** only the explicit migration boundary MAY read that legacy Skill subdirectory.

### Requirement: Legacy Neko Skill data is available only to explicit migration
The system SHALL isolate `.neko/skills` and root `manifest.json` handling behind an explicitly invoked migration boundary.

#### Scenario: Explicit migration reads legacy input
- **WHEN** a user explicitly requests migration of a legacy Skill
- **THEN** the migration operation MAY read its legacy `SKILL.md`, `manifest.json`, and resource files
- **AND** it SHALL create a portable package only after validation succeeds.

#### Scenario: Migration target conflicts
- **WHEN** the canonical target directory already exists
- **THEN** migration SHALL stop with a conflict diagnostic
- **AND** it SHALL NOT overwrite, merge, or delete either package.

#### Scenario: Legacy fields cannot be represented safely
- **WHEN** legacy metadata cannot be mapped to portable fields, the Neko overlay, or Host facts without semantic loss
- **THEN** migration SHALL return an unmappable-data diagnostic
- **AND** it SHALL leave the source and target unchanged.

#### Scenario: Root manifest is ignored by normal loading
- **WHEN** a canonical Skill directory contains a root `manifest.json`
- **THEN** normal loading SHALL NOT use it to supply metadata, compatibility, catalog actions, trust, or activation behavior.
