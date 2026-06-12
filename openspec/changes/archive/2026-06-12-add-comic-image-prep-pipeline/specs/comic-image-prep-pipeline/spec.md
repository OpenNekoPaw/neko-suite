## ADDED Requirements

### Requirement: Shot image prep plans use shared stable contracts
The system SHALL define `ShotImagePrepPlan` and related operation, reference bundle, status, cost estimate, batch request, and diagnostic contracts in shared host-agnostic types. Prep plans MUST use stable media, entity, memory, semantic index, and perception-card references and MUST NOT persist Webview URI, blob URL, inline base64, localhost URL, private cache path, absolute local path, or provider-temporary file handles.

#### Scenario: Source-backed transform plan is valid
- **WHEN** a comic shot has `imageStrategy: "transform-original"`, valid source media refs, an operation plan, and optional mask refs
- **THEN** the system can represent the preparation as a `ShotImagePrepPlan` with status `planned` or `needs-approval`
- **THEN** the plan stores only stable refs and reviewable instructions

#### Scenario: Unsafe prep ref is rejected
- **WHEN** a prep plan source, mask, output, reference bundle, or perception-card reference contains an unsafe runtime handle
- **THEN** validation emits an error diagnostic
- **THEN** approval and execution actions for that plan are disabled

### Requirement: Shot reference bundles reuse unified entity and evidence refs
The system SHALL represent character and scene references for image prep through `CreativeEntityRef` wrappers and stable asset/evidence refs. Character references MUST use `entityKind: "character"` and scene references MUST use `entityKind: "scene"` or `entityKind: "location"` when an entity is known. Prep reference bundles MUST NOT create confirmed entities or overwrite character memory.

#### Scenario: Known character contributes image reference
- **WHEN** a shot references a confirmed character entity with a portrait or appearance asset
- **THEN** the prep plan can include that entity ref and asset ref in the shot reference bundle
- **THEN** execution can use it as generation context without copying the character profile into the prompt-only data

#### Scenario: New visual candidate remains reviewable
- **WHEN** comic analysis detects a character that cannot be safely matched to an existing entity
- **THEN** the prep plan may reference a candidate or diagnostic through existing entity/memory review paths
- **THEN** it MUST NOT create a confirmed character entity as a side effect of image prep

### Requirement: Perception output feeds prep plans by reference
The system SHALL allow shot image prep plans to cite `PerceptionCardRef` values or stable refs derived from PerceptionCards. Prep plans MUST NOT embed full PerceptionCard payloads, raw media bytes, or provider-specific perception cache data.

#### Scenario: Panel detection supports source panel selection
- **WHEN** the perception pipeline identifies comic panels, OCR text, masks, or visual evidence for a source image
- **THEN** the Agent can derive a prep plan that cites the relevant perception card references and stable source panel refs

#### Scenario: Missing perception is diagnosed
- **WHEN** no PerceptionCard is available for a source-backed comic shot
- **THEN** the system may still create a low-confidence prep plan from source media refs
- **THEN** the plan includes a diagnostic indicating that perception evidence is missing or incomplete

### Requirement: comic-shot-asset-prep table profile reviews prep plans
The system SHALL provide or register a `GenericTable` profile named `comic-shot-asset-prep` for reviewing shot image prep plans. The table profile MUST include required `shotId`, `imageStrategy`, `operationPlan`, and `status` columns and MUST project status from `ShotImagePrepPlan.status` rather than maintaining a separate approval status.

#### Scenario: Prep plan renders as review table row
- **WHEN** Agent produces a `ShotImagePrepPlan` for a storyboard shot
- **THEN** the system can render a `GenericTable(profile: "comic-shot-asset-prep")` row with source panel, operations, prompts, reference bundle, output, status, and diagnostics where available

#### Scenario: Table status does not fork plan state
- **WHEN** a user approves, skips, queues, runs, succeeds, or fails a prep plan
- **THEN** the table row status reflects the underlying `ShotImagePrepPlan.status`
- **THEN** the table does not store a separate `approvalStatus` value

### Requirement: TransformImage remains a source-bound facade capability
The system SHALL treat `TransformImage` as a distinct facade capability for source-bound image editing. Transform requests MUST include a source image ref and MAY include mask refs, edit instruction, reference bundle refs, target aspect ratio, style, or operation metadata. Provider adapters MAY map this facade to an existing image generation/edit backend, but runtime diagnostics and backfill MUST preserve transform lineage.

#### Scenario: Transform routes to edit backend
- **WHEN** an approved prep plan has `imageStrategy: "transform-original"` and a provider supports source-bound edits
- **THEN** runtime routes the plan through `TransformImage` or an equivalent registered provider mapping
- **THEN** generated outputs are backfilled as derived/generated refs linked to the source plan

#### Scenario: Transform provider unavailable
- **WHEN** a prep plan requires `TransformImage` but no provider advertises compatible support
- **THEN** the plan remains visible with an unavailable capability diagnostic
- **THEN** runtime does not fabricate output refs or downgrade to prompt-only generation without explicit user approval

### Requirement: Image prep execution requires approval and cost estimation
The system SHALL require approval before executing source-backed generation or transform prep plans. Batch execution MUST require a cost estimate action before `run-approved-shot-prep-batch` and MUST display unknown cost when a provider cannot estimate cost.

#### Scenario: Batch run blocked before estimate
- **WHEN** a user attempts to run approved shot prep plans in batch without a current cost estimate
- **THEN** the system blocks batch execution and exposes an `estimate-batch-cost` action or diagnostic

#### Scenario: Blocking diagnostic prevents queueing
- **WHEN** an approved prep plan has missing source refs, unsafe refs, missing masks required by the selected operation, unresolved provider capability, or conflicting entity references
- **THEN** the system prevents the plan from entering `queued`
- **THEN** the plan remains reviewable with diagnostics

### Requirement: Batch image prep execution is bounded and recoverable
The system SHALL execute approved shot image prep plans with bounded concurrency, retry policy, budget limits, cancellation handling, per-shot result isolation, and execution summaries. A failure in one shot MUST NOT discard successful outputs from other shots.

#### Scenario: Batch respects concurrency and budget
- **WHEN** the user starts a batch prep request with `maxConcurrency` and budget limits
- **THEN** runtime executes no more than the declared concurrency
- **THEN** runtime blocks or pauses execution when the cost estimate or observed outputs would exceed the declared budget

#### Scenario: Single shot failure preserves other outputs
- **WHEN** one plan in a batch fails because of provider timeout, rate limit, or invalid input
- **THEN** other successful plans keep their generated output refs
- **THEN** the batch execution summary records succeeded, failed, skipped, cancelled, and unavailable counts

### Requirement: Canvas reviews image prep details before Cut consumes outputs
Canvas SHALL render shot image prep details in a structured shot review surface, including source panel, generated output, operation plan, masks, reference bundle, prompts, diagnostics, status, cost estimate, and before/after comparison where refs are available. Cut SHALL consume approved generated keyframes and video prompts rather than re-parsing source comic pages for image prep.

#### Scenario: Canvas shot panel shows prep sections
- **WHEN** a Canvas node or imported storyboard shot has associated prep plan data
- **THEN** Canvas displays visual source/output refs, operation plan, masks, reference bundle, image/video prompts, and diagnostics in distinct review sections

#### Scenario: Cut receives approved prepared keyframes
- **WHEN** a comic-to-animation workflow sends prepared storyboard shots to Cut
- **THEN** Cut receives approved generated keyframe refs and video prompt metadata
- **THEN** Cut does not need to infer panel cleanup, text removal, or image strategy from raw comic pages

### Requirement: Skills guide prep output but do not grant runtime support
Skills SHALL be allowed to guide Agent output tendencies, prompt templates, and field-filling heuristics for comic image prep. Skills MUST NOT register provider capability support, bypass validators, bypass approval gates, create persistent entity facts, or make Canvas/Cut execute unsupported protocols.

#### Scenario: Skill requests prep profile
- **WHEN** a comic-to-animation Skill asks Agent to output `comic-shot-asset-prep`
- **THEN** Agent may produce that profile when registered and supported
- **THEN** runtime validation and capability availability still determine which actions are executable

#### Scenario: Skill cannot bypass approval
- **WHEN** Skill text asks for automatic generation or transformation of many shots
- **THEN** runtime still applies approval, cost-estimation, budget, and provider capability gates before executing side-effecting actions
