## ADDED Requirements

### Requirement: Each project format owns structural quality validation
The owning package for `.nks`, `.nkv`, `.nkp`, `.nkm`, and `.nka` SHALL provide project validation through a shared facade shape while retaining format-specific parsing and rules. The central quality orchestrator MUST NOT parse or mutate every project format directly.

#### Scenario: Neko Cut project is validated
- **WHEN** a `.nkv` target enters project review or pre-export
- **THEN** Cut SHALL validate schema/version, media references, clip ranges, tracks, project revision, and export readiness
- **AND** the quality orchestrator SHALL consume the resulting evidence rather than reimplementing timeline rules.

#### Scenario: Validator is not implemented for a profile
- **WHEN** a project profile has no registered validator or runtime probe
- **THEN** the Gate SHALL return an explicit validator-unavailable diagnostic
- **AND** it SHALL not treat successful file parsing or preview rendering as a pass.

### Requirement: Project quality facade exposes stable validation operations
Project owners SHALL expose typed operations equivalent to validate-project, get-project-snapshot, render-preview, probe-runtime where applicable, and check-export-readiness. Results MUST identify the project target and revision and MUST reject unknown versions, missing dependencies, illegal durable runtime handles, and invalid resource references visibly.

#### Scenario: Preview is rendered
- **WHEN** a project preview is requested for perception review
- **THEN** the owning package SHALL return a derived ResourceRef associated with the source project revision
- **AND** the current-session render URI SHALL not become durable preview identity.

#### Scenario: Future project version is loaded
- **WHEN** a validator encounters an unsupported future `.nk*` schema version
- **THEN** it SHALL return a version diagnostic
- **AND** it SHALL not downgrade, ignore unknown fields, or report readiness by default.

### Requirement: Pre-export Gate validates the current project revision
Before export, the system SHALL run a policy-selected Gate over the current project revision, including project integrity, required assets, applicable timeline/final-cut checks, media and audio constraints, subtitles or output framing when required, and required approvals. Export MUST NOT use a pass bound to an older revision.

#### Scenario: Project changes after preflight
- **WHEN** a clip, audio mix, subtitle, transition, reference, or other Gate-relevant fact changes after a passing pre-export review
- **THEN** the previous Gate result SHALL become stale
- **AND** export SHALL require a new passing Gate unless policy explicitly records a manual override.

#### Scenario: Required asset is missing
- **WHEN** pre-export validation finds an unresolved stable resource reference
- **THEN** the Gate SHALL fail before invoking export
- **AND** it SHALL identify the owning project fact and missing reference.

### Requirement: Post-export verification validates the final deliverable
After export, the system SHALL verify the deliverable resource for existence, complete probe/decode, container/codec, duration, dimensions/fps where applicable, required tracks, truncation, black/frozen sections where configured, audio loudness/peak where configured, and lineage to the exported project revision. Perception review MAY be required by policy but MUST report its coverage.

#### Scenario: Exported file is truncated
- **WHEN** the deliverable cannot decode through its expected end or its duration differs outside policy tolerance
- **THEN** post-export verification SHALL fail
- **AND** the workflow SHALL return to the owning project for repair and re-export.

#### Scenario: Deliverable lineage mismatches
- **WHEN** an exported file or verification record claims a source revision different from the revision that passed preflight
- **THEN** the deliverable Gate SHALL fail with a lineage mismatch
- **AND** it SHALL not reuse the unrelated preflight evidence.

### Requirement: Gate failures drive an explicit repair loop
A blocking project or deliverable failure SHALL produce a repair plan targeting the owning package or source asset. Repair execution MUST create a new revision, invalidate affected evidence, rerun pre-export, re-export, and rerun post-export verification before the workflow is complete.

#### Scenario: Audio loudness fails after export
- **WHEN** post-export verification finds loudness outside policy
- **THEN** the repair plan SHALL target the Audio/Cut mix owner
- **AND** completion SHALL require a new project revision and newly verified deliverable.
