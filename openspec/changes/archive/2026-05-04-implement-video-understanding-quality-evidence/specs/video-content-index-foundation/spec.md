## ADDED Requirements

### Requirement: VideoContentIndex stores time-coded evidence

The system SHALL define a P0 `VideoContentIndex` contract that stores source metadata, segments, quality issues, continuity edges, temporal profiles, and evidence references. The index MUST store time values in seconds.

#### Scenario: Index is built for an asset

- **WHEN** a video content index is built for an asset source
- **THEN** the index SHALL include id, source, source kind, duration, created timestamp, segments, quality issues, continuity edges, temporal profiles, and evidence ids
- **THEN** all segment and issue time fields SHALL be expressed in seconds

#### Scenario: Index has no available analyzer output

- **WHEN** deterministic analyzer output is not available
- **THEN** the index SHALL still be constructible from source metadata, caller-provided range, and existing evidence
- **THEN** the index SHALL mark missing optional analysis arrays as empty rather than inventing analysis

### Requirement: Basic quality issues require source and evidence references

The system SHALL require normalized `BasicQualityIssue` records to include source metadata and evidence references. A normalized issue MUST NOT be accepted into the index without at least one evidence id.

#### Scenario: Normalized issue includes evidence id

- **WHEN** a normalized quality issue includes start time, end time, category, severity, metrics, source, and at least one evidence id
- **THEN** the index builder SHALL accept the issue

#### Scenario: Normalized issue lacks evidence id

- **WHEN** a normalized quality issue lacks evidence ids
- **THEN** the index builder SHALL reject the issue or mark index validation as failed

### Requirement: VideoContentIndex validates time ranges

The system SHALL validate segment, quality issue, continuity edge, and temporal profile timing against the indexed source duration.

#### Scenario: Valid time range

- **WHEN** an issue has start time greater than or equal to 0 and end time less than or equal to source duration
- **THEN** the index validation SHALL accept the range

#### Scenario: Invalid time range

- **WHEN** an issue has negative start time, end time before start time, or end time beyond source duration
- **THEN** the index validation SHALL reject the range or return a validation error

### Requirement: Continuity edges model transitions between segments

The system SHALL represent continuity issues as edges between segments or cut points rather than as single-point quality issues.

#### Scenario: Adjacent scenes show style drift

- **WHEN** normalized consistency evidence identifies a drift between adjacent scene or segment references
- **THEN** the system SHALL represent the drift as a `ContinuityEdge`
- **THEN** the edge SHALL include source segment references or times, delta scores when available, interpretation, intentionality, and evidence ids

#### Scenario: Consistency evidence has no segment relation

- **WHEN** consistency evidence cannot be tied to adjacent scenes, segment ids, or cut point times
- **THEN** the system SHALL preserve it as evidence
- **THEN** the system SHALL NOT invent a continuity edge

### Requirement: Index builder is deterministic for identical inputs

The system SHALL build deterministic `VideoContentIndex` output for identical normalized inputs except for explicitly supplied timestamps. Deterministic fields MUST be stable across repeated builds.

#### Scenario: Same inputs build twice

- **WHEN** the same source metadata, range, segments, normalized issues, continuity edges, and evidence ids are passed to the index builder twice with the same created timestamp
- **THEN** the resulting index ids and child record ids SHALL be identical

#### Scenario: Input evidence changes

- **WHEN** evidence ids or normalized issue source fields change
- **THEN** the affected derived ids SHALL change

### Requirement: P0 index does not perform automatic editing

The system SHALL keep `VideoContentIndex` construction separate from edit plan generation. Building or validating an index MUST NOT apply `EditOperation`, mutate timeline state, or invoke media generation.

#### Scenario: Index contains critical issues

- **WHEN** a constructed index contains critical quality issues
- **THEN** the system SHALL return the index and validation status
- **THEN** the system SHALL NOT apply timeline edits or repairs as part of index construction

#### Scenario: Agent requests an edit plan

- **WHEN** an Agent later uses an index to propose edits
- **THEN** that behavior SHALL occur through a separate rationale and plan generation path, not through the P0 index builder
