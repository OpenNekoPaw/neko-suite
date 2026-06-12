# canvas-artifact-reference-resolution Specification

## Purpose
TBD - created by archiving change add-canvas-artifact-reference-resolution. Update Purpose after archive.
## Requirements
### Requirement: Stable Reference Descriptor Contract

The system SHALL define a shared `ReferenceDescriptor` contract for stable references used by Canvas nodes, Agent artifacts, entity memory, storyboards, generated assets, and provider preflight.

#### Scenario: Descriptor stores stable identity
- **WHEN** a Canvas node or Agent artifact references a media resource, entity representation, generated asset, source panel, mask, keyframe, or semantic range
- **THEN** the reference SHALL be representable as a `ReferenceDescriptor` with source kind, source id, reference kind, role, modality, stable payload, and optional confidence/lineage metadata

#### Scenario: Runtime handles are rejected
- **WHEN** a descriptor payload contains `blob:`, `data:`, `file:`, `vscode-resource:`, localhost URL, absolute path, Webview URI, or provider temporary handle
- **THEN** validation SHALL emit a blocking `reference-unsafe-runtime-handle` diagnostic and SHALL NOT treat the value as a stable reference

### Requirement: Reference Source Kind Alignment

The system SHALL define one `ReferenceSourceKind` union used by contributor manifests and collection inputs.

#### Scenario: Manifest and collection input share source kind type
- **WHEN** a `ReferenceContributorManifest.sourceKinds` value is compared with `ReferenceCollectionInput.sourceKind`
- **THEN** both SHALL use the same `ReferenceSourceKind` type alias rather than separate enums or unrelated string unions

### Requirement: Reference Contributor Registration

The system SHALL register reference collectors as capability registry typed facets through `ReferenceContributorManifest` and `ReferenceContributor`.

#### Scenario: Contributor manifest is discoverable
- **WHEN** a package contributes reference collection support for a node type, artifact block kind, table profile, or domain plan
- **THEN** it SHALL register a contributor manifest that declares source kinds, applicable node types or artifact profiles, produced roles, and supported modalities

#### Scenario: Contributor does pure projection
- **WHEN** a contributor collects references from a Webview-visible object
- **THEN** it SHALL only project existing structured data into descriptors and SHALL NOT read files, create Webview URIs, call providers, or perform host IO

#### Scenario: Missing contributor falls back safely
- **WHEN** an input source has no registered contributor
- **THEN** the system MAY display bounded raw/summary content but SHALL NOT expose provider execution actions based on unregistered reference semantics

### Requirement: Internal Field Normalization

The system SHALL normalize current internal reference fields into `ReferenceDescriptor` without creating a long-term legacy compatibility layer before public format stabilization.

#### Scenario: Existing Canvas reference fields are projected
- **WHEN** a Canvas node contains `referenceImageResourceRef`, `referenceResourceRef`, `referenceImagePath`, `runtimeReferenceImagePath`, or `referenceRefs`
- **THEN** adapter helpers SHALL project stable values into descriptors, mark transitional path usage with diagnostics when appropriate, and SHALL NOT persist `runtimeReferenceImagePath` as a stable reference

#### Scenario: Existing Agent plan fields are projected
- **WHEN** a `ShotImagePrepPlan` contains `sourceMediaRefs`, `maskRefs`, `referenceBundle`, `generatedMediaRefs`, or `outputMediaRefs`
- **THEN** adapter helpers SHALL project them into descriptors with roles such as `source`, `source-panel`, `mask`, `subject`, `layout`, `style`, `keyframe`, or `output`

#### Scenario: New writes converge on descriptor shape
- **WHEN** new reference-producing code is added after this capability lands
- **THEN** it SHALL prefer `ReferenceDescriptor` or contributor output over adding new scattered node-specific reference fields

### Requirement: Composite Artifact Reference Projection

The system SHALL treat `CompositeArtifact` and `GenericTable` as display payload contracts while using `ReferenceDescriptor` as the execution reference contract.

#### Scenario: Table cell can be projected
- **WHEN** a `GenericTable` `media-preview`, `resource`, or profile-constrained JSON cell is used for Canvas preview, Cut handoff, provider execution, or memory indexing
- **THEN** the cell payload SHALL be projectable into one or more `ReferenceDescriptor` values before execution actions are exposed

#### Scenario: Table cell cannot be projected
- **WHEN** a table cell can be rendered but cannot be projected into a valid descriptor
- **THEN** the renderer MAY display the cell but SHALL NOT expose provider execution or write-back actions for that cell reference

### Requirement: Severity-Aware Reference Diagnostics

The system SHALL create reference diagnostics with severity determined by diagnostic code, target capability, purpose, and phase.

#### Scenario: Same diagnostic has different severity by purpose
- **WHEN** `entity-representation-missing` is created for Canvas read-only display
- **THEN** the diagnostic SHALL be a non-blocking warning

#### Scenario: Missing representation blocks generation
- **WHEN** `entity-representation-missing` is created for `GenerateImage` or `TransformImage` provider-input preflight
- **THEN** the diagnostic SHALL be a blocking error for that reference

#### Scenario: Batch summary preserves per-reference severity
- **WHEN** dry-run batch resolution aggregates diagnostics
- **THEN** the summary MAY show warning-level aggregate status, but each reference SHALL retain whether it is blocked for execution

### Requirement: Host-Side Reference Resolver

The system SHALL provide host-side resolver contracts that materialize stable descriptors into runtime preview projections or provider input bundles.

#### Scenario: Preview projection returns runtime-only value
- **WHEN** a Webview requests preview materialization for a descriptor
- **THEN** the host resolver SHALL return a runtime-only projection such as a Webview-safe URI and SHALL NOT write that projection into persisted Canvas or artifact data

#### Scenario: Provider input materialization returns provider-ready bundle
- **WHEN** provider execution is approved and requests materialization for descriptors
- **THEN** the host resolver SHALL return provider input values such as image URI/base64, mask URI, IP-Adapter refs, or keyframe inputs according to target capability and provider constraints

#### Scenario: Preview and provider purposes are isolated
- **WHEN** the same stable descriptor is resolved for preview and provider input
- **THEN** the resolver SHALL use separate purpose-specific materialization paths and SHALL NOT reuse Webview preview URIs as provider inputs

### Requirement: Batch Reference Resolution

The system SHALL support batch reference resolution with deduplication, cache keys, cancellation, partial results, and dry-run/estimate mode.

#### Scenario: Duplicate references resolve once
- **WHEN** multiple nodes or artifact rows reference the same stable descriptor in one batch
- **THEN** the resolver SHALL deduplicate by stable reference key and fan out the single resolution result to every dependent source

#### Scenario: Dry-run avoids expensive IO
- **WHEN** a caller requests dry-run or estimate mode for a large batch
- **THEN** the resolver SHALL report availability, missing inputs, estimated cost metadata where available, and diagnostics without reading or encoding every large resource

#### Scenario: Partial batch failure preserves successes
- **WHEN** some references fail during batch resolution
- **THEN** successful results SHALL remain available, failed references SHALL include per-reference diagnostics, and the batch SHALL return a partial result instead of discarding all resolved inputs

### Requirement: Provider Input Injection

The system SHALL build provider input bundles from resolved references before invoking media generation, image transformation, video generation, TTS, OCR, ASR, or perception providers.

#### Scenario: TransformImage receives source and mask
- **WHEN** a `transform-original` shot image prep plan is executed
- **THEN** source descriptors SHALL materialize into source image input, mask descriptors SHALL materialize into mask input when present, and character/scene/style descriptors SHALL materialize into reference image or adapter inputs before `TransformImage` is called

#### Scenario: GenerateImage receives references without runtime persistence
- **WHEN** a `GenerateImage` request uses character, scene, style, previous-shot, or source-panel references
- **THEN** those references SHALL be resolved into provider input bundle fields at execution time and SHALL NOT be persisted as URL/base64/runtime handles

#### Scenario: GenerateVideo uses prepared keyframes
- **WHEN** a video generation request references prepared keyframes or shot output refs
- **THEN** those refs SHALL be resolved into image-to-video keyframe inputs before `GenerateVideo` is invoked

### Requirement: Entity Representation Resolution

The system SHALL resolve entity references through entity memory or representation bindings before using them as provider visual or voice inputs.

#### Scenario: Entity reference resolves to visual assets
- **WHEN** a character `entityRef` is used as an image generation subject reference
- **THEN** the resolver SHALL use accepted representation assets, gallery refs, visual occurrence crops, or memory-backed asset refs to build visual provider inputs

#### Scenario: Entity without representation is not silently prompted
- **WHEN** a character `entityRef` has no usable visual representation for image generation
- **THEN** the system SHALL emit `entity-representation-missing` and SHALL NOT silently degrade to only inserting the character name into the prompt as if a visual reference existed

### Requirement: Canvas Reference Summary Display

The system SHALL expose lightweight reference summaries and diagnostics for Canvas nodes that contribute or consume references.

#### Scenario: Shot node shows grouped references
- **WHEN** a Shot node has source, mask, character, scene, previous-shot, generated output, or keyframe descriptors
- **THEN** Canvas SHALL be able to display grouped reference summary information without expanding full raw descriptor JSON

#### Scenario: Gallery and generated asset nodes expose references
- **WHEN** Gallery or generated asset nodes provide subject/style/output references
- **THEN** Canvas SHALL expose those references through contributor output and display enough summary information for review and selection

### Requirement: Persistence Safety

The system SHALL persist only stable references, review state, diagnostics, and output lineage.

#### Scenario: Runtime projection is not persisted
- **WHEN** a Webview session materializes a preview URI or provider input bundle
- **THEN** persisted Canvas nodes, artifacts, memory ledgers, and sidecars SHALL NOT store the runtime URI, base64 payload, blob URL, or provider temporary URL

#### Scenario: Output lineage is stable
- **WHEN** provider execution produces an image, video, audio, or generated asset
- **THEN** the backfilled output SHALL use stable output refs and SHALL record source refs, prompt metadata, provider/model metadata, cost/diagnostic metadata where available, and execution summary lineage

