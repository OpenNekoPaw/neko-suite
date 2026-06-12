## ADDED Requirements

### Requirement: Storyboard image strategy can derive shot image prep plans
The system SHALL allow validated storyboard shots to derive `ShotImagePrepPlan` records when a workflow requests comic-to-animation image preparation. Derivation MUST preserve `StoryboardTable` as the semantic shot plan and MUST NOT mutate storyboard rows into workflow-specific image-prep state.

#### Scenario: Source-backed storyboard derives transform plan
- **WHEN** a valid storyboard shot uses `imageStrategy: "transform-original"` with source media refs
- **THEN** runtime can derive a `ShotImagePrepPlan` with the same scene/shot identity, source refs, transform operation intent, prompt/edit instruction, and diagnostics
- **THEN** the storyboard table remains valid even if the prep plan is not executed

#### Scenario: Generate-new storyboard derives keyframe generation plan
- **WHEN** a valid storyboard shot uses `imageStrategy: "generate-new"` with a generation prompt
- **THEN** runtime can derive a `ShotImagePrepPlan` for keyframe generation without requiring source panel refs
- **THEN** execution remains subject to approval, cost, and provider capability gates

### Requirement: Storyboard strategy execution preserves prep lineage
The system SHALL preserve lineage between storyboard shots, prep plans, provider actions, and generated media refs when a prep plan is executed. Generated or transformed outputs MUST be backfilled as stable refs after provider completion and MUST remain distinguishable from source refs.

#### Scenario: Transform output backfills generated refs
- **WHEN** a `TransformImage` execution succeeds for a prep plan derived from a storyboard shot
- **THEN** runtime records the output as a stable generated or derived media ref linked to the source scene/shot/prep plan
- **THEN** source media refs remain intact for before/after review

#### Scenario: Failed prep execution keeps storyboard visible
- **WHEN** a generation or transform action fails for a prep plan derived from a storyboard shot
- **THEN** runtime keeps the storyboard and prep plan visible
- **THEN** runtime records failure diagnostics without adding fake generated media refs
