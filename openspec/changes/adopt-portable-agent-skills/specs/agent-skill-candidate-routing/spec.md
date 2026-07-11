## MODIFIED Requirements

### Requirement: GetContext exposes Skill catalog metadata
The system SHALL expose registered Skill catalog metadata to the Agent without producing code-side candidate hints. Portable Skill content and optional Host overlay metadata MAY contribute author-facing catalog text, while source, path, provenance, trust, enablement, editability, catalog actions, fingerprint, and compatibility SHALL be derived from Host/Registry state.

#### Scenario: Registered Skill includes metadata
- **WHEN** the Agent calls `GetContext`
- **THEN** the result SHALL include registered Skills with name, description, related Skills, domain, and media workflow metadata when available from portable content or a validated Host overlay
- **AND** the result SHALL include Host-derived runtime facts only from Registry projection
- **AND** the result SHALL NOT include `skillCandidateHints`.

#### Scenario: User-added Skill participates through catalog metadata
- **WHEN** a user, project, market, or plugin Skill supplies a valid portable package and any supported Host overlay metadata
- **THEN** the metadata SHALL be available through Skill registry/catalog projection for Agent reasoning
- **AND** production code SHALL NOT require a Skill-specific name branch for the Agent to see the Skill
- **AND** the package SHALL NOT self-assert source, trust, enablement, editability, catalog actions, or compatibility status.

#### Scenario: Author-controlled legacy manifest cannot supply runtime facts
- **WHEN** a canonical Skill package contains a legacy root `manifest.json`
- **THEN** GetContext and catalog projection SHALL ignore it
- **AND** Host/Registry state SHALL remain the only source for runtime facts.
