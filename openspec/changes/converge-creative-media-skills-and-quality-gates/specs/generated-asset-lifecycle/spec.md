## ADDED Requirements

### Requirement: Generated asset quality evidence binds to stable asset identity
Quality evidence and repair attempts for generated media SHALL bind to the stable generated asset ResourceRef or promoted asset reference plus revision/content digest and generation lineage. Evidence MUST NOT use generated cache paths, render URIs, provider task URLs, or scratch files as durable target identity.

#### Scenario: Draft asset receives quality evidence
- **WHEN** a generated draft is evaluated before promotion
- **THEN** the evidence SHALL reference the stable generated draft record and its current content revision
- **AND** the materialized cache file SHALL remain replaceable execution state.

#### Scenario: Asset is promoted after evaluation
- **WHEN** a generated draft with evidence is promoted to a durable project asset
- **THEN** the lifecycle SHALL preserve traceable lineage between draft, evidence, and promoted asset
- **AND** it SHALL not rewrite evidence to a cache path or assume the promoted content is unchanged without a matching digest.

### Requirement: Generated asset mutation invalidates stale evidence
When regeneration, transformation, manual replacement, or repair changes generated asset content, prior evidence for the old revision SHALL be marked stale and MUST NOT satisfy a current quality Gate.

#### Scenario: Repair replaces a failed video
- **WHEN** an approved repair creates a new video revision from a failed generated clip
- **THEN** the lifecycle SHALL retain the old clip and evidence as repair history
- **AND** downstream Gates SHALL require evidence for the new revision.

### Requirement: Background completion preserves quality and workflow lineage
Generated media task completion backfill SHALL include stable artifact identity and sufficient generation/workflow lineage for later quality review. It MUST NOT expose only a temporary path that prevents the quality system from identifying the generated revision.

#### Scenario: Background shot generation completes
- **WHEN** a shot-generation task finishes after the initiating Agent turn
- **THEN** Agent backfill SHALL contain the stable generated asset reference, generation request lineage, and owning workflow stage identity
- **AND** subsequent quality review SHALL be able to target that asset without recovering a raw cache path from conversation text.
