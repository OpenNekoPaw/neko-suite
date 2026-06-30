## ADDED Requirements

### Requirement: Creation identity anchors autonomous creative work
The system SHALL expose an Agent creation contract whose canonical identity is `creationId`, not `workflowRunId`, `IdcRun.id`, file path, or media `ResourceRef`.

#### Scenario: Creation contract has canonical identity
- **WHEN** the Agent creates or projects a creative work session
- **THEN** the creation payload MUST include a stable `creationId`
- **AND** any `workflowRunId` or `IdcRun.id` correlation MUST be represented only as optional trace metadata

#### Scenario: Workflow identity cannot replace creation identity
- **WHEN** a creation payload is built while no `AgentWorkflowRun` exists
- **THEN** the system MUST still produce a valid creation identity
- **AND** it MUST NOT synthesize `creationId` from `workflowRunId`

### Requirement: Iterations track creative activity without redefining IDC
The system SHALL expose a `CreationIteration` contract that references IDC's existing `draft`, `plan`, and `apply` stages without introducing additional IDC phases.

#### Scenario: Iteration references IDC stage
- **WHEN** an iteration is associated with IDC execution
- **THEN** its `idcStage` field MUST be absent or one of `draft`, `plan`, or `apply`
- **AND** the contract MUST reject `observe`, `evaluate`, `revise`, or other values as IDC stages

#### Scenario: Iteration activity describes work performed
- **WHEN** an iteration records analysis, generation, review, repair, handoff, or observation
- **THEN** the activity MUST be represented by a typed activity field
- **AND** the system MUST NOT encode the activity by expanding the IDC stage enum

### Requirement: Text and media attachments use separate identity rules
The system SHALL attach text artifacts and media resources to creations and iterations using identity rules appropriate to their content type.

#### Scenario: Text artifacts remain direct Agent context
- **WHEN** an iteration references `brief.md`, `plan.md`, `checklist.md`, scripts, prompts, or Markdown storyboard drafts
- **THEN** the attachment MAY use project-visible paths, artifact ids, or frontmatter-backed document ids
- **AND** it MUST NOT require `ResourceRef` solely because the file is an Agent text artifact

#### Scenario: Media attachments require stable media refs
- **WHEN** an iteration references an image, audio, video, model, generated media output, or document image
- **THEN** the attachment MUST use a stable media identity such as `assetRef`, `ResourceRef`, or `DocumentArchiveResourceRef`
- **AND** it MUST NOT use a Webview URI, cache path, temporary absolute path, or binary payload as durable identity

### Requirement: Prompt-chain execution is observed through events
The system SHALL record prompt-chain execution as typed observations rather than an executable workflow DSL.

#### Scenario: Prompt-chain checkpoint recorded
- **WHEN** the Agent reaches a meaningful prompt-chain checkpoint while using a Skill
- **THEN** the system MUST emit or record a checkpoint observation containing `creationId`, `iterationId`, `promptChainId`, timestamp, and checkpoint metadata

#### Scenario: Prompt-chain skip or reorder recorded
- **WHEN** the Agent skips or reorders prompt-chain guidance
- **THEN** the system MUST emit or record a skip or reorder observation containing `creationId`, `iterationId`, `promptChainId`, timestamp, and reason metadata
- **AND** the observation MUST NOT require the skipped or reordered step to become a workflow node

#### Scenario: Prompt-chain completion recorded
- **WHEN** the Agent completes the prompt-chain guidance it chose to follow
- **THEN** the system MUST emit or record a completion observation linked to the active creation and iteration

### Requirement: Creation events carry process provenance
The system SHALL provide creation event payloads that can link IDC stage, Skill lifecycle, prompt-chain observations, text artifacts, media refs, and quality diagnostics to a creation iteration.

#### Scenario: Skill lifecycle records attach to iteration
- **WHEN** a Skill lifecycle record contributes prompt sections, tool policy, or domain strategy to a creative action
- **THEN** the resulting iteration event MUST be able to reference the contributing Skill lifecycle record id or equivalent active Skill projection id

#### Scenario: Quality diagnostics attach to iteration
- **WHEN** Observe/Evaluate, quality review, or repair analysis produces diagnostics
- **THEN** the diagnostics MUST be attachable to the relevant creation iteration
- **AND** the system MUST NOT store those diagnostics inside `ResourceRef`

### Requirement: Legacy workflow runtime is not a canonical creation source
The system SHALL treat `agent-workflow-runtime.ts` and `AgentWorkflowRun` as legacy projection or trace surfaces for this feature.

#### Scenario: Creation tracking does not call workflow runtime
- **WHEN** creation or iteration tracking records a creative action
- **THEN** tests MUST prove the canonical path does not require `createAgentWorkflowRuntime` or `AgentWorkflowRuntime`
- **AND** optional workflow ids MAY appear only as trace metadata

#### Scenario: Workflow runtime remains bootstrap-compatible
- **WHEN** session bootstrap uses `runtime.workflowRuntime` for `stageTracking`, `idcTaskProjection`, or `controlPlane`
- **THEN** those bootstrap surfaces MUST continue to work
- **AND** the change MUST NOT remove `runtime.workflowRuntime` as a configuration plane

### Requirement: Generated media path is verified through stable refs
The system SHALL include path-level validation that generated media can flow through Storyboard, Canvas, Cut, and Preview using stable refs.

#### Scenario: Generated media enters Storyboard with stable ref
- **WHEN** generated media is attached to storyboard or storyboard-derived payloads
- **THEN** the payload MUST carry `assetRef`, `ResourceRef`, or another approved stable media ref
- **AND** the test MUST fail if a cache path, Webview URI, or temporary absolute path is used as durable identity

#### Scenario: Canvas and Cut handoff preserves stable media ref
- **WHEN** generated media is sent from Agent or Storyboard into Canvas and then projected toward Cut
- **THEN** Canvas/Cut handoff payloads MUST preserve stable media refs or validated project-relative/variable paths allowed by their existing contracts
- **AND** the test MUST prove cache-backed generated refs are promoted or diagnosed before durable handoff

#### Scenario: Preview consumes projection without becoming identity
- **WHEN** Preview or Webview rendering displays generated media from a creation iteration
- **THEN** render URIs MUST be treated as runtime-only projections
- **AND** the creation or iteration payload MUST keep the stable media ref as the durable identity
