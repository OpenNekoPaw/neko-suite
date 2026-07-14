## ADDED Requirements

### Requirement: Agent uses canonical Tool and capability context first
The system SHALL let the Agent select currently available creative capabilities from the existing Tool definitions, Tool/capability registration, Skill context, `GetContext`, and owning results. Registration SHALL remain the capability existence authority, and injection SHALL respect host, trust, permission, provider/model support, policy, and context-budget constraints. A compact derived view MAY be added only when focused evaluation proves the canonical context is insufficient; it MUST be derived from the same registration authority and MUST NOT become a prerequisite or second execution catalog.

#### Scenario: Agent selects from current Tool context
- **WHEN** the Agent needs to choose how to produce an animated shot
- **THEN** it SHALL inspect the currently injected Tool/capability semantics and current owning diagnostics needed for the decision
- **AND** the selected Tool SHALL execute through its current canonical schema and lifecycle

#### Scenario: Multiple production techniques remain selectable
- **WHEN** multiple distinctly owned capabilities satisfy the same creative purpose
- **THEN** discovery SHALL return the supported, degraded, and unavailable candidates needed for Agent strategy comparison
- **AND** it SHALL report a collision only when one canonical capability identity or selected executor cannot be resolved uniquely

#### Scenario: Optional compact view is evidence-gated
- **WHEN** token measurements and Agent ablation prove the canonical Tool context causes material omission, mis-selection, or context-budget failure
- **THEN** the system MAY expose a bounded read-only summary derived from the same registry
- **AND** disabling that summary SHALL leave the ordinary Tool execution path functional and shall not restore IDC, Workflow, or a parallel catalog

#### Scenario: Unavailable capability is not advertised as executable
- **WHEN** a capability is disabled, missing, untrusted, unsupported by the active provider, or incompatible with the current host
- **THEN** discovery SHALL omit it from executable candidates or expose an explicit unavailable diagnostic
- **AND** the Agent SHALL NOT receive a projection that implies the operation can succeed

### Requirement: Agent-readable creative semantics use owning capability truth
Creative purpose, accepted and produced inputs/outputs, mutation scope, current support and limits, approval requirements, applicable quality expectations, and recoverable failure kinds SHALL come from the owning Tool/capability contribution and current runtime when those semantics apply. The system MUST NOT maintain a manually duplicated executable catalog or place package-private authoring protocols in Skill content.

#### Scenario: Agent-readable semantics and operation contract remain aligned
- **WHEN** an owning provider changes an operation input requirement, support level, permission, or limit
- **THEN** the Agent-visible Tool/capability semantics SHALL reflect the same canonical contribution and current runtime
- **AND** validation SHALL fail visibly if any derived summary advertises behavior rejected by the operation contract

#### Scenario: Skill guidance remains capability neutral
- **WHEN** a creative Skill describes a production method
- **THEN** its natural-language content SHALL describe creative judgment, artifacts, quality expectations, and recovery semantics
- **AND** concrete tool names, parameter tables, polling protocols, Webview messages, and package-private schemas SHALL remain in machine-readable capability/runtime boundaries

### Requirement: Agent replans from current creative evidence
Before choosing a consequential next action and after each capability or asynchronous task result, the Agent SHALL read the current files or ResourceRefs, generated files/digest/lineage, applicable owning project revisions, structured results and diagnostics, approval state, current QualityEvidence/Gate state, active Skill guidance, and the user's latest constraints when those inputs exist. Chat history, TODO, Markdown claims, or prompt-chain checkpoint state MUST NOT substitute for actual files or owning-service evidence.

The Agent SHALL obtain a current project revision only from the owning capability or read facade when the target is a mutable `.nk*` or equivalent domain project. A historical Tool result, Journal row, Markdown reference, active-editor projection, timestamp, or recursively discovered payload field MAY identify what to read, but MUST NOT be treated as current project state. Before a consequential project mutation, the owning runtime SHALL reject a stale `baseRevision` or equivalent revision binding rather than relying on a refreshed prompt alone. Ordinary source and generated files SHALL use their file/ResourceRef and digest/lineage contracts and SHALL NOT be forced into a global revision model.

#### Scenario: Continuation reads current file or project state
- **WHEN** a creative session resumes after interruption or context compaction
- **THEN** the Agent SHALL re-read the relevant file/ResourceRef and, for project mutation, the current owning project revision
- **AND** it SHALL NOT infer completion solely from a prior assistant message, checklist text, or prompt-chain observation

#### Scenario: Mutation result triggers observation and replan
- **WHEN** an authoring capability returns a new project revision and diagnostics
- **THEN** the next creative decision SHALL be grounded in that returned revision and diagnostics
- **AND** stale observations for the previous revision SHALL NOT authorize downstream mutation or delivery

### Requirement: Document analysis produces plan-grounding artifacts
When a creative request depends on a comic, novel, screenplay, PDF, illustration, image sequence, or existing project document, the Agent SHALL use owning Content, Story, Perception, or project capabilities to produce or read the structured source artifacts and evidence required by the target before treating the analysis as executable-plan input. Natural-language summaries MUST NOT substitute for required page, panel, scene, character-candidate, source-trace, or project-revision evidence.

#### Scenario: Comic analysis grounds the plan
- **WHEN** the Agent plans production from a comic document
- **THEN** the plan SHALL reference the available document revision, page/panel identities, reading order, OCR/dialogue evidence, source trace, and unresolved diagnostics required by the selected target
- **AND** missing or ambiguous evidence SHALL appear as blocked, degraded, partial-deliverable, or user-resolution requirements rather than invented facts

#### Scenario: Source revision invalidates the plan premise
- **WHEN** a source document or structured analysis Artifact changes after a plan was approved
- **THEN** the system SHALL treat affected plan premises and derived capability intents as stale
- **AND** the Agent SHALL re-read the current source evidence and revise or reapprove the plan before dependent mutation

### Requirement: Plan Mode uses read-only capability-aware planning
Plan Mode SHALL consume current content/project evidence, existing Tool definitions and capability context, provider/model support, cost/risk, approval, quality, and known delivery requirements to generate or revise creator-reviewable content such as `brief.md`, owning-domain documents, and `plan.md`, while bounded TODO remains an optional conversation/task projection. Plan Mode MUST NOT start IDC, create media-generation tasks, mutate projects or assets, export deliverables, or acquire implicit permissions by treating planning as execution.

#### Scenario: Plan exposes executable feasibility without side effects
- **WHEN** the user requests a multi-step animation plan in Plan Mode
- **THEN** the Agent SHALL describe current supported, degraded, unavailable, and partial-deliverable paths as actionable work units with concrete inputs, capability intent, outputs, acceptance, recovery, approvals, and risks
- **AND** no media task, project mutation, asset-library import, or export SHALL be created by producing the plan

#### Scenario: Read-only analysis still obeys policy
- **WHEN** Plan Mode needs an external model, managed processor, protected resource, or cost-bearing operation to obtain analysis evidence
- **THEN** the operation SHALL pass its declared trust, permission, cost, and approval policy
- **AND** Plan Mode SHALL NOT treat read-only intent as automatic authorization

### Requirement: Markdown plans and TODO are not executable workflow state
Markdown `brief.md`, `plan.md`, creator-review documents, and bounded TODO SHALL remain user-editable content or progress projections. They MAY contain stable file/ResourceRef/project references and human-readable capability intents, but MUST NOT persist resolved executors, Provider task handles, temporary/cache/Webview identities, full operation schemas, workflow nodes, transitions, or hidden retry state. Execution SHALL use an ordinary typed Tool call formed for the current Agent turn rather than parsing Markdown/TODO as a command or workflow DSL.

#### Scenario: Approved Markdown leads to a current Tool call
- **WHEN** the user approves a Markdown plan and requests execution
- **THEN** the Agent SHALL re-read the current plan and owning files, form the next ordinary typed Tool call, and send it through current resolve, validation, policy, approval, and lifecycle boundaries
- **AND** the system SHALL NOT compile the Markdown into a persistent DAG or directly replay an executor/schema captured during planning

#### Scenario: TODO cannot execute or prove completion
- **WHEN** a TODO item is completed or plan prose says an operation or deliverable is complete
- **THEN** no side effect SHALL occur solely from that Markdown change
- **AND** completion SHALL still require actual files or owning project results and the required Quality/delivery evidence

### Requirement: Approved execution re-resolves current facts
Before executing an approved plan action, the Agent SHALL re-read the current plan content/digest, critical input files/ResourceRefs and applicable owning project revisions, capability registration/support, provider/model constraints, permission, cost/risk, approval scope, and delivery requirements. A changed plan, changed input, unavailable capability, or materially changed execution path MUST NOT reuse the prior approval as if the original premises still held. This SHALL occur in the ordinary Agent turn and Tool lifecycle, not in an Apply subsystem or plan executor.

#### Scenario: Current capability is resolved in the executing turn
- **WHEN** a plan names a human-readable capability intent and the user approves execution
- **THEN** the Agent SHALL select the currently registered canonical Tool and use its current schema through the ordinary runtime
- **AND** it SHALL fail visibly or replan if the capability or Provider no longer honors the planned semantics

#### Scenario: Material replan requires renewed approval
- **WHEN** recovery changes the creative target, core production technique, cost/risk level, mutation scope, approval scope, or delivery conditions
- **THEN** the Agent SHALL revise the plan and request the applicable approval again before executing that path
- **AND** the previous approval SHALL remain auditable but SHALL NOT authorize the materially changed action

#### Scenario: Bounded replan stays within approval scope
- **WHEN** a diagnostic permits a replacement capability that preserves the approved target, inputs, cost/risk ceiling, mutation scope, and delivery conditions
- **THEN** the Agent MAY select that compatible capability after current validation
- **AND** it SHALL record the replan reason and selected canonical capability without creating a new workflow state owner

### Requirement: Image operations expose their real execution semantics
Each Agent-visible Image Tool/capability SHALL declare whether its current adapter is deterministic, perception-based, generative, or hybrid when that distinction affects selection. It SHALL also expose applicable model/network requirements, source/mask/reference requirements, preservation semantics, support level, and quality expectations. An editor tool, Webview action, or writeback path MUST NOT be reported as provider-independent production support unless a registered executable adapter can honor the canonical operation contract.

#### Scenario: Deterministic panel crop avoids generation
- **WHEN** a comic panel only requires crop, resize, rotation, mask, layer, or pixel-composite operations supported by a deterministic adapter
- **THEN** the Agent SHALL select that adapter without dispatching an image generation model
- **AND** the result SHALL preserve source trace, transformation metadata, output identity, and required revision or lineage

#### Scenario: Generative completion preserves edit boundaries
- **WHEN** a panel requires missing-pixel creation such as inpaint, outpaint, occlusion completion, redraw, or generative colorization
- **THEN** the selected adapter SHALL declare generative support for the requested operation and controls
- **AND** the request/result SHALL preserve source, mask or target region, references, intended unmodified regions, output ResourceRef, lineage, and required QualityEvidence

#### Scenario: Existing UI tool is not enough to claim support
- **WHEN** an audited image operation has an editor command or result-application path but no headless executor or compatible provider adapter
- **THEN** capability discovery SHALL report degraded or unavailable support with a diagnostic
- **AND** the Agent SHALL NOT claim the operation completed or silently reroute it to generic image generation

### Requirement: Prompt-chain remains dynamic guidance rather than execution state
The system SHALL allow the Agent to adopt, skip, reorder, repeat, or complete prompt-chain checkpoints and SHALL record the applicable observation and reason. Prompt-chain observations MUST NOT define executable nodes, transitions, retry policies, hidden plans, or proof that a production artifact is complete.

#### Scenario: Existing artifact causes a method step to be skipped
- **WHEN** the current project already contains a valid approved Storyboard revision and source coverage appropriate to the goal
- **THEN** the Agent MAY skip redundant Storyboard creation guidance
- **AND** it MAY record the skip reason for explanation or evaluation while continuing from the current Storyboard file or owning project revision

#### Scenario: Checkpoint cannot bypass artifact validation
- **WHEN** a prompt-chain checkpoint is marked completed but the required owning artifact is missing, invalid, stale, or bound to another revision
- **THEN** the system SHALL treat the production milestone as incomplete
- **AND** downstream approval, mutation, export, or delivery gates SHALL remain blocked as required by policy

### Requirement: Agent selects among real production techniques
For a shot, scene, or project goal that admits multiple production techniques, the Agent SHALL compare currently registered owning capabilities using required artifacts, motion/camera intent, duration, continuity, support limits, cost, risk, quality expectations, and project target. The Agent MUST NOT default all animation requests to generative video or silently degrade unsupported creative semantics into a free-form prompt.

#### Scenario: Illustration animation considers non-video techniques
- **WHEN** the user requests animation from an illustration and layered 2D, Puppet, frame-animation, scene, or generative-video capabilities are available
- **THEN** the Agent SHALL select from the capabilities whose declared requirements fit the source and target
- **AND** its execution trace SHALL identify the selected canonical capability and rejected or unavailable alternatives relevant to the decision

#### Scenario: Unsupported end-frame conditioning causes recovery
- **WHEN** the intended shot requires an end-frame constraint and the selected video provider declares that control unavailable
- **THEN** the request SHALL fail before dispatch or return an explicit unavailable diagnostic
- **AND** the Agent SHALL replan through a compatible provider, keyframe preparation, another production technique, or user-visible scope change instead of dropping the constraint

### Requirement: Comic preparation and character dependencies participate in orchestration
The Agent SHALL be able to compose registered comic and illustration preparation capabilities for logical panel interpretation, physical crop, semantic segmentation, text/OCR handling, completion, colorization, layer composition, and reference preparation according to the target technique. Character identity, approved reference, appearance, costume, expression, and color revisions SHALL remain owned by Entity/Asset/Character domains and SHALL be consumed through stable references and dependency projections rather than duplicated in Agent state.

#### Scenario: Comic preparation is conditional
- **WHEN** a source panel is already suitable for the selected shot technique
- **THEN** the Agent MAY skip crop, completion, colorization, or layering operations that are not required
- **AND** it SHALL record the reason and continue from the validated source Artifact instead of running a fixed preparation pipeline

#### Scenario: Character revision invalidates dependent evidence
- **WHEN** an approved character appearance, costume, expression, color, or formal reference revision changes
- **THEN** owning dependency projection SHALL identify affected shots or evidence as stale where applicable
- **AND** the Agent SHALL re-observe those dependencies and choose repair, regeneration, explicit retention review, or another owning capability before final acceptance

#### Scenario: Ambiguous character identity fails visibly
- **WHEN** comic or illustration evidence cannot uniquely bind a detected character to an existing Entity or approved reference revision
- **THEN** the system SHALL return a binding diagnostic or request user resolution
- **AND** the Agent SHALL NOT invent, merge, or silently select a canonical character identity

### Requirement: Creative side effects use canonical owning capabilities
The Agent SHALL express creative intents through registered capabilities, while project and asset mutation SHALL remain owned by the responsible Story, Canvas, Sketch, Puppet, Model/Scene, Cut, Audio, Asset, Quality, Export, Engine, or managed External Processor boundary. A multi-step mutation that must be atomic SHALL be exposed by the owning package as a transactional authoring operation returning an exact revision rather than being simulated through an unverified sequence of low-level Agent calls.

#### Scenario: Animatic authoring returns an owning revision
- **WHEN** the Agent creates an Animatic from an accepted Storyboard and available temporary audio
- **THEN** the mutation SHALL execute through a Cut-owned authoring capability
- **AND** the result SHALL include the exact Cut project revision and structured diagnostics used by subsequent observation

#### Scenario: Missing transactional authoring fails visibly
- **WHEN** a requested project mutation cannot be performed atomically through any registered owning capability
- **THEN** the Agent SHALL report the missing capability or propose a non-mutating plan
- **AND** it SHALL NOT directly assemble package-private project data or claim success from partial low-level mutations

### Requirement: Deterministic policy gates constrain autonomous orchestration
Agent autonomy SHALL NOT bypass capability validation, permission and approval policy, cost controls, task lifecycle, ResourceRef/path policy, project validators, or Quality Gates. Each high-cost, high-risk, external, mutating, or delivery action SHALL pass its declared deterministic checks before execution.

#### Scenario: Expensive batch waits for approval
- **WHEN** the Agent plans a batch of media generations whose declared policy requires cost approval
- **THEN** provider tasks SHALL NOT be created until the canonical approval boundary grants the request
- **AND** denial SHALL return a structured result that the Agent can use to replan a smaller batch or another technique

#### Scenario: Stale quality evidence blocks delivery
- **WHEN** a project or accepted shot changes after its QualityEvidence was created
- **THEN** that evidence SHALL be marked stale for the new revision
- **AND** the Agent SHALL rerun the applicable review before any policy-controlled export or delivery proceeds

### Requirement: Creative target completion is proven by direct deliverables
The Agent SHALL evaluate the user-approved target against actual files, applicable owning project revisions, existing domain validators, approvals, and required Quality/Export evidence. The system SHALL NOT introduce a central target-completion profile/evaluator in Agent runtime. The Agent MUST NOT declare a Storyboard, Animatic, pilot, final animation, TV episode, film deliverable, or other target complete unless the direct deliverables and their owning validation/delivery evidence satisfy that target.

#### Scenario: Animatic target stops before final media production
- **WHEN** the user's approved target is an Animatic and the current Cut-owned Animatic revision, timing evidence, required temporary audio, validation, and approval satisfy the target profile
- **THEN** the Agent MAY complete the request without generating final accepted shots
- **AND** it SHALL describe the delivered target as an Animatic rather than an animation final

#### Scenario: Animation final requires current delivery evidence
- **WHEN** the user requests an animation final
- **THEN** completion SHALL require the target's required accepted shot revisions, current final timeline and audio/subtitle revisions, non-stale preflight, export lineage, and required deliverable verification
- **AND** a prompt-chain completion, chat summary, checklist, generated clip subset, stale evidence, or prior project revision SHALL NOT satisfy completion

#### Scenario: Missing domain artifact capability blocks completion
- **WHEN** a target requires an adaptation, character/style artifact, Animatic, shot dependency, post-production, or delivery artifact that no owning capability can currently create or validate
- **THEN** the Agent SHALL expose the missing capability and the smallest valid partial deliverable or follow-up change
- **AND** it SHALL NOT implement a substitute project model inside Agent runtime or claim the final target succeeded

### Requirement: Capability-aware orchestration is observable and evaluable
The system SHALL produce trace evidence sufficient to verify the creative goal, candidate and selected canonical capability identities, relevant rejection or unavailability reasons, input and output artifact references/revisions, diagnostics, approval decisions, and replan reason without making that trace a second execution state authority. Changes to this behavior MUST include focused real Agent evaluations in addition to key-free harness tests.

#### Scenario: Real Agent changes strategy after a diagnostic
- **WHEN** a focused provider-backed evaluation returns a declared unavailable or quality diagnostic for the initial production technique
- **THEN** the Agent SHALL choose a compatible recovery action and invoke its canonical capability
- **AND** the report SHALL prove the unsupported request was not silently dispatched and no legacy workflow runtime decided the next action

#### Scenario: Legacy workflow path is poisoned
- **WHEN** legacy workflow run, node, transition, or fixed-stage execution paths are configured to throw in a test scenario
- **THEN** the Agent SHALL still discover, invoke, observe, and replan through the Agent-native session/turn and capability lifecycle path
- **AND** the evaluation SHALL fail if a poisoned legacy path participates
