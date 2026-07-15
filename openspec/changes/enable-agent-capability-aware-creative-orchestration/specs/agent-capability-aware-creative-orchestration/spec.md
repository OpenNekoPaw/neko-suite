## ADDED Requirements

### Requirement: Agent core remains a minimal native intelligence loop
The canonical creative path SHALL use the existing Agent session/turn, model reasoning, Read/Write, Tool and Skill lifecycle, asynchronous Task continuation, generic ApprovalEngine, and owning capability results. Agent core SHALL decide the next action from current evidence but SHALL NOT own a media-production run, fixed stage sequence, project graph, plan authorization token, creative approval scope model, workflow recovery state, or target-completion state.

Existing fixed `MediaProductionWorkflowRunState`, stage orchestrators, Task-backed workflow stores, recovery coordinators, and their public exports MUST be removed rather than retained as dormant or test-whitelisted compatibility. Existing user documents, generated files, `.nk*` projects, settings, trust state, and ordinary Task data MUST remain untouched by that prelaunch runtime cleanup.

#### Scenario: Creative work proceeds without a media workflow runtime
- **WHEN** the Agent analyzes a source, invokes an owning capability, receives its result, and chooses the next action
- **THEN** each step SHALL occur through the ordinary session/turn and current Tool/Task lifecycle
- **AND** no fixed media workflow run, stage, state store, recovery coordinator, or project-authoring orchestrator SHALL participate

#### Scenario: Legacy fixed workflow is unavailable
- **WHEN** production code or a new test attempts to import or execute the retired fixed media workflow DTO or runtime
- **THEN** build or architecture validation SHALL fail visibly
- **AND** no compatibility export, whitelist, fallback, or dormant success path SHALL preserve it

### Requirement: Agent and Platform core remain domain-neutral extension hosts
The Agent and generic Platform core SHALL contain only reusable intelligence and execution mechanisms: session/conversation, memory/context, Prompt and Plan Mode, Approval/Policy, Task, MCP, subagent, Skill lifecycle, Tool lifecycle, Provider adaptation, model invocation, and ordinary result continuation. Creative media, animation, filmmaking, comic, character, Storyboard, shot, post-production, and delivery semantics SHALL be contributed through Skills, Tools/capabilities, subagents, or owning-domain services.

Agent/Platform core MUST NOT define or retain creation-profile or creation-guidance runtimes, creative-domain summarizers, hard-coded media Skill routing vocabularies, Storyboard-specific output validators, media-specific Task/result interpretation, CreativeAgent/MediaPlanner services, or equivalent domain branches. A generic matcher, summarizer, validator, or projector MAY remain only when its behavior is driven by registered metadata or injected adapters and does not enumerate a creative domain's concepts or formats.

#### Scenario: Creative method is supplied by extensions
- **WHEN** a user asks to turn a comic, screenplay, novel, or illustration into animation
- **THEN** the ordinary Agent MAY activate relevant Skills, delegate bounded work to ordinary subagents, and invoke currently registered owning Tools
- **AND** no creative profile, media planner, domain summarizer, hard-coded workflow vocabulary, or domain validator SHALL be required in Agent/Platform core

#### Scenario: Domain-specific core contribution fails architecture validation
- **WHEN** production code adds a character, Storyboard, shot, animation, media-production, or delivery-specific state/service/validator/router to Agent or generic Platform core
- **THEN** architecture validation SHALL fail visibly
- **AND** the implementation SHALL move to a Skill, Tool/capability contribution, subagent package, or owning-domain service instead of adding a core exception

#### Scenario: Generic extension mechanisms stay usable without creative packages
- **WHEN** no creative Skill or media owning capability is installed or active
- **THEN** conversation, memory/context, Plan Mode, Approval, Task, MCP, subagent, Skill, and Tool lifecycle SHALL remain functional
- **AND** the Agent SHALL report missing creative capability through ordinary discovery/diagnostics rather than a built-in creative fallback

### Requirement: Creative approval uses the generic Agent approval boundary
Creator review SHALL use the existing generic ApprovalEngine request and user-prompt path. Agent core MUST NOT define a creative-plan-specific approval binding, creative scope schema, material-replan taxonomy, PlanApprovalStore, or deterministic classifier for story, character, style, sound, technique, cost, mutation, or delivery changes. A Host MAY include the reviewed document identity or digest in generic request context for presentation and audit, but that review SHALL NOT authorize future Tool side effects.

Every actual operation whose current Tool or owning policy requires permission, cost, mutation, export, delivery, or external-provider approval SHALL pass that approval independently at execution time. The Agent MAY request another creator review when current content or intent materially changes, but the decision to ask remains part of current-turn reasoning rather than a persisted replan policy runtime.

#### Scenario: Creator reviews a current Markdown document
- **WHEN** the Agent asks the creator to review a current brief or plan
- **THEN** it SHALL submit a generic creator-review request through ApprovalEngine with the current document context needed by the Host
- **AND** ApprovalEngine SHALL NOT require creative scope, cost ceiling, mutation scope, delivery boundary, or a plan-specific binding schema

#### Scenario: Plan review cannot bypass operation approval
- **WHEN** the creator previously accepted a plan and the Agent later invokes a costly, external, mutating, export, or delivery Tool
- **THEN** the current Tool/owner policy SHALL independently validate and request its applicable approval
- **AND** the earlier creator review SHALL NOT act as an authorization token or suppress the current gate

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

### Requirement: Model-bound execution facts remain separate from creative intent and completion evidence
The system SHALL keep user-approved creative intent and acceptance semantics independent from a particular Provider/model parameter schema. Subject identity, character invariants, shot and layout requirements, reference roles, target content language, exact strings, prohibited elements, and acceptance criteria SHALL remain domain or Skill semantics. Input modality/count/format, supported reference controls, multi-view or embedded-text reliability, Prompt dialect, size/duration, cost, concurrency, safety, and current support/limits SHALL be resolved from the owning Provider/model/version/profile contribution and effective session configuration.

Task/result evidence SHALL identify the requested and effective Provider/model/version/profile when available and SHALL bind the actual request or digest, authorized reference inputs, terminal result, output ResourceRef/lineage, diagnostics, and applicable Quality evidence needed to review the invocation. Neither a model marketing claim, guessed model identity, community example, historical success, nor a completed task without valid output evidence SHALL promote a current operation to supported or prove the creative target complete. The system MUST NOT create a manually maintained global model capability matrix in Agent, Skill, or a shared planning layer.

#### Scenario: Multi-view intent survives a model change
- **WHEN** an approved character-reference intent requires front, side, and back views with stable costume and identity, but the active Provider/model/profile changes before execution
- **THEN** those creative requirements SHALL remain unchanged while the current turn re-resolves whether the new effective model can satisfy them in one call
- **AND** an old model-support snapshot or Prompt dialect SHALL NOT authorize dispatch through the new model

#### Scenario: Reference role is stable while adapter support is model-bound
- **WHEN** an input image is designated as an identity, costume, prop, style, composition, structure-only, first-frame, last-frame, or product-preservation reference
- **THEN** that semantic role SHALL remain part of the creative intent and lineage independent of the selected model
- **AND** the current adapter SHALL declare whether and how it can accept and honor the role before dispatch

#### Scenario: Marketing or gallery evidence cannot declare support
- **WHEN** a model description or Prompt gallery claims exact text, cross-image consistency, multi-view output, or commercial-ready quality without the current effective model identity and focused evidence
- **THEN** capability discovery SHALL keep the relevant support at its owning declared level
- **AND** the Agent SHALL require current adapter validation and actual output review rather than treating the claim or sample as capability truth

### Requirement: Creative prompt internationalization separates instruction and content languages
The system SHALL provide semantically equivalent supported-language variants of the core Agent execution guidance and builtin creative Skill guidance. The locale used for System Prompt, Skill content, and model-facing Tool descriptions MUST NOT implicitly determine the language of creator-review documents, story content, dialogue, subtitles, lyrics, on-screen text, or preserved proper nouns. For each generative invocation, the Agent SHALL use the current Provider/model capability and target content to choose an appropriate instruction language while preserving the target content language and exact protected strings.

The system MUST NOT require a global locale workflow, translation state machine, or persisted generation-language plan. Provider language preference, content-language reliability, and exact-string limitations SHALL be exposed by the owning capability when they affect dispatch. When the current Provider cannot honor required content language or embedded text semantics, the operation SHALL fail visibly, report degraded support, or use an explicitly approved downstream text/subtitle strategy rather than silently translating or dropping content.

#### Scenario: English execution instructions preserve Chinese content
- **WHEN** the selected Provider prefers English generation instructions but the approved work contains Chinese dialogue, subtitles, on-screen text, character names, or place names
- **THEN** the invocation SHALL distinguish the English instruction text from the Chinese content constraints and preserve the protected strings exactly
- **AND** the Agent SHALL NOT translate those strings merely because `promptLocale` or the Provider instruction language is English

#### Scenario: Prompt locale does not override the target market
- **WHEN** the Agent runs with a Chinese `promptLocale` while the approved creator documents and target deliverable are English
- **THEN** the System/Skill guidance MAY remain Chinese while the creator content and generated media constraints remain English
- **AND** completion and quality review SHALL evaluate the approved target language rather than the UI or Agent guidance language

#### Scenario: Unsupported embedded text fails visibly
- **WHEN** a requested image or video requires exact embedded text in a language the active Provider cannot reliably honor
- **THEN** capability validation SHALL expose degraded or unavailable support before the Agent claims success
- **AND** any alternative that moves the text to deterministic compositing, subtitles, or post-production SHALL remain explicit and inside the applicable approval scope

### Requirement: Agent replans from current creative evidence
Before choosing a consequential next action and after each capability or asynchronous task result, the Agent SHALL read the current files or ResourceRefs, generated files/digest/lineage, applicable owning project revisions, structured results and diagnostics, applicable current approval decisions, current QualityEvidence/Gate results, active Skill guidance, and the user's latest constraints when those inputs exist. Chat history, TODO, Markdown claims, or Skill checkpoint prose MUST NOT substitute for actual files or owning-service evidence.

The Agent SHALL obtain an applicable project revision only from the owning capability or read facade when the target is a mutable `.nk*` or equivalent domain project, and it SHALL only pass that opaque value back to the owner. The Agent MUST NOT generate, increment, merge, normalize, or persist revisions as an independent authority. A historical Tool result, Journal row, Markdown reference, active-editor projection, timestamp, or recursively discovered payload field MAY identify what to read, but MUST NOT be treated as current project state.

When a mutation is based on a prior read, asynchronous result, approval, resumed turn, or another potentially stale project premise, the owning runtime SHALL validate its applicable owner-specific base revision or digest immediately before writing and SHALL fail visibly on mismatch. A new-project creation has no base revision, and a synchronous atomic operation against the owner's current live document model MAY use that current model without an Agent-supplied revision. Ordinary source and Markdown files SHALL use document/file version, digest, exact patch context, or equivalent conflict detection; generated files SHALL use ResourceRef, content digest, and lineage/generated revision. These contracts SHALL NOT be replaced by a global `currentRevision`, Agent Revision Store, or uniform revision DTO for every project operation.

#### Scenario: Continuation reads current file or project state
- **WHEN** a creative session resumes after interruption or context compaction
- **THEN** the Agent SHALL re-read the relevant file/ResourceRef and, for project mutation, the current owning project revision
- **AND** it SHALL NOT infer completion solely from a prior assistant message, checklist text, or prompt-chain observation

#### Scenario: Mutation result triggers observation and replan
- **WHEN** an authoring capability returns a new project revision and diagnostics
- **THEN** the next creative decision SHALL be grounded in that returned revision and diagnostics
- **AND** stale observations for the previous revision SHALL NOT authorize downstream mutation or delivery

#### Scenario: Asynchronous writeback rejects a stale project premise
- **WHEN** an asynchronous generation or approved action attempts to mutate a project after that owner has advanced beyond the observed base revision or digest
- **THEN** the owning runtime SHALL reject the mutation immediately before write with a stale-state diagnostic
- **AND** the Agent SHALL re-read current owner facts and replan rather than overwrite the newer state

#### Scenario: Synchronous live-document mutation uses owner state
- **WHEN** an owning capability performs an atomic synchronous operation against its current live document model
- **THEN** it MAY use that current owner state without requiring the Agent to supply a base revision
- **AND** it SHALL return the applicable resulting identity or revision and expose any owner-detected conflict visibly

#### Scenario: Ordinary file patch reports conflict without project revision
- **WHEN** the Agent patches a Markdown or source file whose expected context no longer matches the current file
- **THEN** the document/file owner SHALL reject or surface the conflict through document version, digest, exact patch context, or equivalent file semantics
- **AND** the system SHALL NOT require a project revision merely to protect that ordinary file edit

### Requirement: Document analysis uses current evidence without a mandatory analysis layer
When a creative request depends on a comic, novel, screenplay, PDF, illustration, image sequence, or existing project document, the Agent SHALL first use current Read, document-analysis, perception, or owning project capabilities already available for that source. It SHALL create or read structured page, panel, scene, character-candidate, source-trace, or project artifacts only when the selected target or downstream owning Tool actually requires them. The system MUST NOT require a universal structured-analysis projection, facade, or artifact set before the Agent can produce a useful plan.

#### Scenario: Comic analysis grounds the plan
- **WHEN** the Agent plans production from a comic document
- **THEN** the plan SHALL reference the available current source evidence and only those page/panel identities, reading order, OCR/dialogue facts, source trace, or diagnostics required by the selected target
- **AND** missing or ambiguous evidence SHALL appear as blocked, degraded, partial-deliverable, or user-resolution requirements rather than invented facts

#### Scenario: Source revision invalidates the plan premise
- **WHEN** a source document or structured analysis Artifact changes after a plan was approved
- **THEN** the system SHALL treat affected plan premises and derived capability intents as stale
- **AND** the Agent SHALL re-read the current source evidence and revise or reapprove the plan before dependent mutation

### Requirement: Plan Mode uses read-only capability-aware planning
Plan Mode SHALL consume current content/project evidence, existing Tool definitions and capability context, provider/model support, cost/risk, approval, quality, and known delivery requirements to generate or revise ordinary creator-reviewable Markdown when useful, while bounded TODO remains an optional native conversation/task projection. `brief.md` and `plan.md` SHALL remain optional naming conventions rather than registered document types, schemas, managers, parsers, or execution inputs. Plan Mode MUST NOT start IDC, create media-generation tasks, mutate projects or assets, export deliverables, or acquire implicit permissions by treating planning as execution.

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
Before acting on a previously reviewed plan, the Agent SHALL re-read the current plan content, critical input files/ResourceRefs and applicable owning project revisions, capability registration/support, provider/model constraints, permission, cost/risk, and delivery requirements. A prior creator review MUST NOT be reused as Tool authorization. Current execution SHALL occur in the ordinary Agent turn and Tool lifecycle, not in an Apply subsystem, plan executor, or creative replan policy runtime.

#### Scenario: Current capability is resolved in the executing turn
- **WHEN** a plan names a human-readable capability intent and the user approves execution
- **THEN** the Agent SHALL select the currently registered canonical Tool and use its current schema through the ordinary runtime
- **AND** it SHALL fail visibly or replan if the capability or Provider no longer honors the planned semantics

#### Scenario: Changed intent returns to native creator review when needed
- **WHEN** current evidence causes the Agent to propose a materially different creative target or direction
- **THEN** the Agent MAY revise the ordinary Markdown and request creator review again through the generic ApprovalEngine
- **AND** any subsequent Tool call SHALL still pass its own current policy and approval independently

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

### Requirement: Reference-guided image methods remain capability-aware and result-grounded
The Agent SHALL be able to create new image content inspired by authorized reference evidence by identifying the observable composition/form, style/color/texture, and mood/lighting/narrative properties that the user wants to preserve while separately defining the content to replace. A guessed source model, visual fingerprint, or Prompt dialect MUST NOT select the Provider or executor. The selected operation SHALL come from current registered capability support, inputs, quality expectations, cost, policy, and diagnostics.

Creative Skill content for reference-guided generation MUST NOT prescribe Provider-specific tool names, fixed phases, private session/output directories, default multi-model batches, or universal fallback generators. After generation, the Agent SHALL observe the actual returned image and applicable Quality evidence before accepting, repairing, or delivering the result.

#### Scenario: Reference remix selects from current capability truth
- **WHEN** a user supplies a reference image and requests different content with selected composition, aesthetic, or mood properties preserved
- **THEN** the Agent SHALL ground the retained properties in the actual reference, select a currently supported image capability, and generate an actual output file
- **AND** it SHALL NOT route execution solely from a guessed origin model or silently fall back to a generic Provider that cannot honor the approved semantics

#### Scenario: Generated remix is reviewed before completion
- **WHEN** the reference-guided generation task returns an image
- **THEN** the Agent SHALL observe the actual result and compare the retained properties, replacement content, prohibited elements, and technical requirements that matter to the request
- **AND** it SHALL report accepted, repair-needed, degraded, or blocked state from that evidence rather than from the Prompt or submitted task alone

### Requirement: Multi-view character reference production uses declared model support
When character visual reference preparation is required, the Agent SHALL use current Image capability support to determine whether one invocation can produce the requested multi-view sheet, turnaround, portrait, costume, expression, prop, or action views. A Provider that declares suitable multi-view support MAY produce a single composite reference sheet. Splitting views or assembling separate generations MUST remain a result-driven repair or alternative strategy rather than a mandatory pipeline.

The Agent SHALL inspect the actual output for required view coverage, full-body crop, cross-view identity, proportions, costume/color/prop consistency, prohibited text or watermarks, and downstream reference suitability. Generated files SHALL remain directly usable generated outputs; formal Entity/Asset/Character binding SHALL occur only through the owning domain when requested or required for downstream revision tracking.

#### Scenario: Supported multi-view sheet uses one generation
- **WHEN** the current image Provider declares support for the requested multi-view character sheet and the approved scope permits the call
- **THEN** the Agent MAY generate the complete sheet in one image invocation
- **AND** it SHALL inspect the returned file before accepting it as a usable character reference

#### Scenario: Incomplete multi-view output triggers bounded repair
- **WHEN** the returned sheet omits a required view, crops the feet, changes character identity or costume across views, mutates an approved prop, or introduces prohibited text
- **THEN** the Agent SHALL choose a bounded repair, regeneration, split-view alternative, or creator decision based on the observed defect
- **AND** it SHALL NOT mark the reference complete merely because the Provider declared multi-view support or the task completed

#### Scenario: Focused character reference Skill is evaluation-gated
- **WHEN** an implementation proposes a separate builtin `character-visual-reference` Skill instead of keeping the method in `image` and `media-production`
- **THEN** focused real Agent evaluation SHALL prove improved trigger precision, identity-constraint extraction, result review, or downstream binding without unacceptable Skill conflict or context cost
- **AND** absence of that evidence SHALL keep the method in the existing canonical creative Skills

### Requirement: Prompt examples remain optional non-executable references
External or community Prompt examples MAY be used as authorized, provenance-preserving creative references or Evaluation fixtures. They MUST NOT become executable capabilities, Provider support authority, workflow state, completion evidence, or an implicit executor-selection catalog. The system SHALL NOT bulk inject a large Prompt corpus into the core Prompt or builtin Skill, and retrieval MUST remain optional so ordinary Agent planning and execution work without it.

An example proposed for runtime retrieval or committed Evaluation use SHALL retain the applicable author/source/license, original language, display translation, content digest, reference-input roles, and known model/version/profile/result evidence. Missing evidence SHALL be represented as unknown rather than inferred. Third-party template syntax MAY be interpreted as user-editable semantics, but MUST NOT become a Neko execution protocol or bypass current Tool validation.

#### Scenario: Prompt example informs intent but cannot execute
- **WHEN** the Agent retrieves an authorized example for a multi-panel layout or character reference task
- **THEN** it MAY use the example to help formulate current capability-neutral intent and constraints
- **AND** the example SHALL NOT select a Provider, start a task, satisfy approval, or prove the generated result complete

#### Scenario: Unversioned success image remains weak evidence
- **WHEN** a Prompt example includes a successful output image but lacks exact model/version/profile, input references, request digest, failure samples, or validation evidence
- **THEN** the system SHALL treat it only as inspiration or a research sample
- **AND** it SHALL NOT register reliable multi-view, exact-text, consistency, or quality support from that image alone

#### Scenario: Example retrieval is evaluation-gated
- **WHEN** an implementation proposes a product runtime for Prompt-example retrieval
- **THEN** a focused ablation SHALL prove material holdout quality improvement without unacceptable context cost, Tool mis-selection, license/provenance loss, or fallback behavior
- **AND** absence of that evidence SHALL keep the corpus outside the product runtime as research or Evaluation data

### Requirement: Skill methods guide dynamic reasoning without checkpoint state
Creative Skill content SHALL allow the Agent to adopt, skip, reorder, or repeat method guidance according to current evidence. The system SHALL NOT require prompt-chain checkpoint observations, started/skipped/reordered/completed state, executable nodes, transitions, retry policies, hidden plans, or checkpoint persistence for creative orchestration. Existing optional Skill telemetry, if retained by another owner, MUST NOT participate in execution, recovery, approval, completion, or this capability's acceptance.

#### Scenario: Existing artifact causes a method step to be skipped
- **WHEN** the current project already contains a valid approved Storyboard revision and source coverage appropriate to the goal
- **THEN** the Agent MAY skip redundant Storyboard creation guidance
- **AND** it MAY explain the skip in the conversation while continuing from the current Storyboard file or owning project revision

#### Scenario: Skill prose cannot bypass artifact validation
- **WHEN** conversation or Skill-derived prose says a method step is complete but the required owning artifact is missing, invalid, stale, or bound to another revision
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
Focused Evaluation SHALL use existing Agent turn events, Tool call/results, Task terminal results, diagnostics, Approval decisions, files/ResourceRefs, and owning validation evidence to verify the creative goal, selected canonical capability, relevant rejection or unavailability reason, outputs, and recovery. Production runtime MUST NOT add a creative selection/replan trace contract solely for this change. A minimal neutral runtime fact MAY be added only when the same fact is generally required outside Evaluation and the owning contract otherwise cannot expose it.

#### Scenario: Real Agent changes strategy after a diagnostic
- **WHEN** a focused provider-backed evaluation returns a declared unavailable or quality diagnostic for the initial production technique
- **THEN** the Agent SHALL choose a compatible recovery action and invoke its canonical capability
- **AND** the report SHALL prove the unsupported request was not silently dispatched and no legacy workflow runtime decided the next action

#### Scenario: Legacy workflow path is poisoned
- **WHEN** legacy workflow run, node, transition, or fixed-stage execution paths are configured to throw in a test scenario
- **THEN** the Agent SHALL still discover, invoke, observe, and replan through the Agent-native session/turn and capability lifecycle path
- **AND** the evaluation SHALL fail if a poisoned legacy path participates
