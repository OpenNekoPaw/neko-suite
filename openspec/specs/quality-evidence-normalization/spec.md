# quality-evidence-normalization Specification

## Purpose
Define how media QA tool results become Agent-first `PerceptionEvidence` and editing-oriented normalized evidence without granting QA tools authority to mutate project state.
## Requirements
### Requirement: QA results are evidence, not edit authority

The system SHALL treat `QualityCheck` and `QualityCheckConsistency` output as Agent-first evidence. QA scores, pass/fail values, and remediation hints MUST NOT directly mutate project state, trigger timeline edits, or replace `AgentObservation` / `DecisionRationale`.

#### Scenario: QualityCheck returns failing scenes

- **WHEN** `QualityCheck` returns one or more failed evaluations
- **THEN** the system SHALL expose the result as `PerceptionEvidence` or Agent-readable evidence data
- **THEN** the system SHALL require Agent rationale or user approval before any project mutation or regeneration is executed

#### Scenario: QualityCheckConsistency reports style drift

- **WHEN** `QualityCheckConsistency` returns style drift recommendations
- **THEN** the system SHALL preserve the recommendations as evidence
- **THEN** the system SHALL NOT apply color correction, regeneration, or timeline edits solely because the report includes recommendations

#### Scenario: QualityRepairCheck reports repair attempts

- **WHEN** `QualityRepairCheck` evaluates or regenerates failed media
- **THEN** the system SHALL expose the result as Agent-readable evidence with repair mode metadata
- **THEN** the evidence SHALL identify generated repair outputs as repair attempts rather than read-only analysis
- **THEN** the repair evidence SHALL be recorded through the same Agent-first evidence path used by quality analysis

### Requirement: QualityReview evidence preserves normalized issue data

The system SHALL enrich quality review evidence with normalized issue data when `QualityCheck` or `QualityCheckConsistency` output can be mapped to editing evidence. The evidence MUST preserve the original tool summary and source fields needed for audit.

#### Scenario: QualityCheck issue maps to editing issue

- **WHEN** `QualityCheck` returns a `tearing`, `stuttering`, `audio-clipping`, or `loudness-off` issue with a scene index and usable time range or fallback scene range
- **THEN** the system SHALL include a normalized issue record in `PerceptionEvidence.data`
- **THEN** the normalized issue SHALL include category, severity, source category, source tool name, evidence id reference, and time range

#### Scenario: Production tool call supplies fallback scene ranges

- **WHEN** a `QualityCheck` or `QualityRepairCheck` tool call includes scene arguments with `timeRange`, start/end times, or duration
- **THEN** the session feedback bridge SHALL pass those ranges into quality evidence normalization
- **THEN** mappable issues without issue-local time ranges SHALL use the scene range fallback instead of producing only `missing-time-range` diagnostics
- **THEN** duration-only scene arguments SHALL be interpreted as asset-local zero-based ranges rather than timeline-anchored ranges

#### Scenario: Video evaluation supplies clip range fallback

- **WHEN** video quality evaluation has video duration but an issue lacks a local time range
- **THEN** the evaluation result SHALL expose a clip-level time range fallback from zero to the video duration
- **THEN** normalized video issues MAY use that fallback while preserving source metadata for later refinement

#### Scenario: QualityCheck issue cannot be localized

- **WHEN** `QualityCheck` returns a semantic issue without a time range, frame range, segment id, or scene range
- **THEN** the system SHALL keep the issue in the evidence summary or source payload
- **THEN** the system SHALL NOT emit a `BasicQualityIssue` for that issue

### Requirement: QA categories map through an explicit normalization table

The system SHALL normalize QA categories through an explicit mapping table before they enter video editing evidence. The implementation MUST NOT copy arbitrary `QualityIssueCategory` values directly into editing evidence categories.

#### Scenario: Technical video categories are normalized

- **WHEN** a QA issue category is `tearing`
- **THEN** the normalized editing category SHALL be `tearing`
- **WHEN** a QA issue category is `stuttering`
- **THEN** the normalized editing category SHALL be `stutter`
- **WHEN** a QA issue category is `jitter` and the issue describes temporal luminance instability such as flicker, brightness pulses, flash, or strobe
- **THEN** the normalized editing category SHALL be `flicker`

#### Scenario: Ambiguous jitter requires temporal evidence

- **WHEN** a QA issue category is `jitter` but the issue only describes color drift, texture drift, or other non-luminance instability
- **THEN** the system SHALL leave the issue unmapped
- **THEN** the normalization diagnostics SHALL identify the reason as ambiguous jitter rather than an unsupported category

#### Scenario: Ambiguous artifact categories require evidence

- **WHEN** a QA issue category is `artifact`
- **THEN** the system SHALL map it to `blur` or `compression` only when metrics or source details disambiguate the issue
- **THEN** the system SHALL leave the issue unmapped when no disambiguating evidence exists

#### Scenario: Semantic categories are not L0 issues by default

- **WHEN** a QA issue category is `prompt-mismatch`, `script-mismatch`, `style-drift`, `character-inconsistency`, `composition-poor`, or `motion-unnatural`
- **THEN** the system SHALL NOT emit an L0 `BasicQualityIssue` by default
- **THEN** the issue MAY remain as evidence for Agent interpretation or later L1/L2 analysis

### Requirement: Normalized evidence ids are deterministic

The system SHALL generate deterministic ids for normalized quality issues and evidence records using stable source fields. Re-running normalization for the same source payload MUST produce the same ids.

#### Scenario: Same payload normalized twice

- **WHEN** the same tool name, tool call id, run id, scene index, source category, and time range are normalized twice
- **THEN** the normalized issue ids SHALL be identical

#### Scenario: Different time ranges are normalized

- **WHEN** two source issues have the same category and scene index but different time ranges
- **THEN** the normalized issue ids SHALL be different

### Requirement: QualityCheck read-only mode does not regenerate media

The system SHALL align `QualityCheck` read-only metadata with its execution behavior. In read-only mode, `QualityCheck` MUST NOT call media generation or write replacement media.

#### Scenario: QualityCheck is invoked without repair opt-in

- **WHEN** `QualityCheck` is invoked without explicit repair or retry opt-in
- **THEN** the tool SHALL evaluate the provided media only
- **THEN** the tool SHALL NOT call `mediaGenerator.generate()`

#### Scenario: Repair behavior is explicitly requested

- **WHEN** repair or retry behavior is explicitly requested
- **THEN** the system SHALL either use a non-read-only tool path or require approval before generation
- **THEN** generated media SHALL be reported as a repair attempt, not as read-only analysis

### Requirement: Consistency reports reach continuity evidence

The system SHALL adapt `QualityCheckConsistency` tool results into quality review evidence even though consistency reports do not have the same payload shape as scene quality evaluations.

#### Scenario: QualityCheckConsistency returns adjacent style drift

- **WHEN** `QualityCheckConsistency` returns a consistency report with adjacent style drift and scene ranges are available
- **THEN** the session feedback bridge SHALL create quality evidence with consistency mode metadata
- **THEN** the evidence SHALL include continuity edge candidates for adjacent scene drift

#### Scenario: QualityCheckConsistency has no usable scene relation

- **WHEN** a consistency report cannot be tied to adjacent scenes or ranges
- **THEN** the system SHALL preserve the report as evidence and diagnostics
- **THEN** the system SHALL NOT invent continuity edge candidates
