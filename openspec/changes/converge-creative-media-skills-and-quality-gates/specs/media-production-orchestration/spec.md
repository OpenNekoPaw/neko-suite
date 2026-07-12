## ADDED Requirements

### Requirement: Media production follows a canonical staged workflow
The system SHALL provide a canonical media-production workflow from source normalization through Storyboard validation, shot generation, asset quality Gate, project authoring, pre-export Gate, export, and deliverable verification. Each stage MUST emit typed artifact references, status, diagnostics, and provenance.

#### Scenario: Comic is produced into a final video
- **WHEN** a user requests an end-to-end video from a comic source
- **THEN** the workflow SHALL normalize the comic into a canonical Storyboard, generate required media, validate accepted assets, author the target projects, run pre-export checks, export, and verify the deliverable
- **AND** the final result SHALL include stable references to the source, Storyboard revision, project revision, and deliverable.

#### Scenario: Stage fails
- **WHEN** a required stage returns a blocking diagnostic
- **THEN** the workflow SHALL stop before dependent mutations or export
- **AND** it SHALL preserve prior successful artifacts without reporting the overall workflow as complete.

### Requirement: Workflow mutations use canonical headless authoring APIs
Media-production orchestration SHALL mutate `.nks`, `.nkv`, `.nka`, `.nkp`, or `.nkm` only through the owning package's canonical authoring API with an explicit target. It MUST NOT depend on active Webview state, postMessage fallbacks, cache paths, or feature-package cross imports.

#### Scenario: No Cut Webview is open
- **WHEN** accepted generated clips are assembled into an explicit `.nkv` target while no Cut Webview is active
- **THEN** Cut headless authoring SHALL load, mutate, save, and return the resulting project revision
- **AND** the workflow SHALL not open a Webview as a hidden fallback.

#### Scenario: Authoring target is missing
- **WHEN** a stage requires a durable project target and neither an existing target nor create-new permission is present
- **THEN** the stage SHALL return a missing-target diagnostic
- **AND** it SHALL not mutate an arbitrary active editor.

### Requirement: Workflow runs are recoverable from stable stage artifacts
Long-running media-production work SHALL persist or project recoverable stage state using stable asset/project references and existing task/generated-asset lifecycle services. Runtime handles MAY be used during execution but MUST NOT be the only identity required to resume after restart.

#### Scenario: Provider task completes after the initiating turn
- **WHEN** a background generation task completes
- **THEN** the workflow stage SHALL receive a stable generated asset or runtime draft reference through canonical task backfill
- **AND** it SHALL not persist provider task handles or temporary cache URLs as accepted media identity.

#### Scenario: Workflow resumes after interruption
- **WHEN** a workflow resumes with completed Storyboard and generated asset stages
- **THEN** it SHALL validate the referenced revisions and continue from the next incomplete stage
- **AND** it SHALL not replay completed mutations blindly.

### Requirement: Repairs create new evidence-bearing revisions
Quality repair or regeneration in media production SHALL be an explicit approved stage. It MUST retain the original evidence and artifact, produce a new resource or project revision, invalidate affected downstream evidence, and respect a bounded retry policy.

#### Scenario: Failed shot is regenerated
- **WHEN** the user approves regeneration for a failed shot
- **THEN** the workflow SHALL record the repair attempt as a new generated asset with lineage to the failed asset and issue
- **AND** prior timeline or Gate evidence using the failed asset SHALL become stale until revalidated.

### Requirement: Canvas materializes canonical Storyboard hierarchy without semantic reconstruction

The Canvas authoring boundary SHALL accept a validated canonical Storyboard artifact as the preferred production input. It SHALL project each canonical scene to a `scene` container and each owned shot to a child `shot` node, preserving parent/child ordering, Storyboard revision, prompt intent, and stable media references. Markdown parsing MAY remain a source adapter for text-only inputs, but it MUST NOT be the fallback transport for an already-canonical Storyboard.

#### Scenario: Multiple scenes are authored and reopened

- **WHEN** Canvas authors a canonical Storyboard containing multiple scenes and shots
- **THEN** each scene SHALL be persisted as a distinct scene container
- **AND** each shot SHALL be persisted under its owning scene with matching parent and child identities
- **AND** reopening the `.nkc` document SHALL preserve the hierarchy and shot media references unchanged.

#### Scenario: Canonical payload projection fails validation

- **WHEN** the canonical Storyboard revision, scene/shot hierarchy, or durable media references are invalid
- **THEN** Canvas authoring SHALL return blocking diagnostics
- **AND** it SHALL NOT retry through Markdown parsing, asset-batch import, or another legacy path.
