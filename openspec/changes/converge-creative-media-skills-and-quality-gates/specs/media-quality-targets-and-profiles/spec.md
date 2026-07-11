## ADDED Requirements

### Requirement: Quality evaluation targets stable resources and revisions
The quality system SHALL accept a typed `QualityTarget` containing a stable ResourceRef or project reference, target kind, applicable revision or content digest, optional media range, expected creative intent, and lineage context. A bare local path MUST NOT be the canonical durable quality target.

#### Scenario: Generated image is evaluated
- **WHEN** a generated image is submitted for quality review
- **THEN** the evaluator SHALL bind evidence to the image ResourceRef and generation revision or digest
- **AND** any current-session materialized path SHALL remain an execution detail.

#### Scenario: Legacy mediaPath input reaches the canonical runtime
- **WHEN** a request supplies only the legacy `mediaPath` shape outside an explicit migration path
- **THEN** the runtime SHALL reject it with a migration diagnostic
- **AND** it SHALL not silently construct a durable identity from the path.

### Requirement: Quality evidence is structured and auditable
Each `QualityEvidence` record SHALL identify the evaluator and version, target and revision, evaluated range or coverage, metrics, issues, severity, locations, confidence when applicable, creation time, and source evidence references. A `QualityGateResult` SHALL identify the policy, required profiles, evidence used, stale state, verdict, and repair plan.

#### Scenario: Perception evaluator reports a visual issue
- **WHEN** a perception evaluator detects character inconsistency in a video range
- **THEN** evidence SHALL include the target revision, affected time range, issue category, severity, evaluator identity, and confidence or uncertainty
- **AND** the repair plan SHALL remain separate from mutation execution.

#### Scenario: Evidence coverage is partial
- **WHEN** a video is evaluated by sampled frames rather than every frame
- **THEN** evidence SHALL report the sampling or coverage used
- **AND** the Gate policy SHALL decide whether that coverage is sufficient.

### Requirement: Quality profiles cover creative assets, projects, and deliverables
The system SHALL provide quality profiles for image, video clip, audio, Storyboard, cross-shot consistency, timeline/final cut, project artifact, and exported deliverable targets. `media-quality-review` SHALL select and aggregate profiles, while operation Skills SHALL perform only their local contract validation unless a policy explicitly requests broader review.

#### Scenario: Image generation completes
- **WHEN** an image generation operation returns a resource
- **THEN** the image operation SHALL validate resource existence, readability, media type, and requested basic dimensions
- **AND** it SHALL not claim that the image passed aesthetic or character-consistency review without corresponding quality evidence.

#### Scenario: Final cut is reviewed
- **WHEN** the user requests final-cut quality review
- **THEN** `media-quality-review` SHALL combine applicable timeline, audio, visual consistency, subtitle, and project evidence
- **AND** it SHALL return one verdict with per-profile findings.

### Requirement: Quality evaluation separates structural, technical, perception, and policy concerns
The quality system SHALL compose structural validators, deterministic technical analyzers, perception evaluators, and policy evaluators through typed ports. Failure or absence of one evaluator class MUST NOT be hidden by a successful result from another class.

#### Scenario: External perception provider is unavailable
- **WHEN** a Gate requires perception evidence and the configured external or local perception evaluator is unavailable
- **THEN** the Gate SHALL return fail or manual-review according to policy
- **AND** successful codec or loudness checks SHALL not be presented as a complete pass.

#### Scenario: Codec verification fails despite a high visual score
- **WHEN** a deliverable receives a high perception score but cannot be fully decoded
- **THEN** the technical failure SHALL remain blocking
- **AND** the aggregate verdict SHALL not pass.

### Requirement: External perception adapters respect local trust boundaries
External perception models SHALL implement the same evaluator port as local models. They SHALL receive only explicitly authorized, minimally materialized content and MUST NOT receive arbitrary local paths, project archives, cache roots, or unrelated assets.

#### Scenario: Local resource is sent to an external evaluator
- **WHEN** policy and user/provider trust permit external perception evaluation
- **THEN** the host SHALL materialize or upload only the target media and required references
- **AND** evidence SHALL record the provider/model identity without persisting temporary upload URLs as resource identity.
