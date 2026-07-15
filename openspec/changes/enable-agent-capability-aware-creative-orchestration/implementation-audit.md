# Agent Capability-Aware Creative Orchestration Implementation Audit

Date: 2026-07-14
Scope: implementation baseline for `enable-agent-capability-aware-creative-orchestration`.

> **Decision update (2026-07-14):** [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) and the accepted ADR make ordinary Agent ReAct plus current Tool context the canonical path. References below to planning projection, `CapabilityIntent`, checklist/Apply, generalized current revision, or target-completion projection describe the audited scaffold or historical gap, not an implementation requirement. Remove or leave that scaffold unconnected unless focused evaluation proves a minimal derived read-only summary is necessary.

This document records implementation facts discovered while executing section 1 of
the change. It is a dated status artifact, not a second architecture source or an
executable workflow definition. Stable constraints remain in the accepted ADR,
change design, and delta specification.

## 1. Agent Capability Registration and Injection

### Registration owners

| Boundary                        | Current owner                                                                              | Registered facts                                                                                                                                          | Baseline conclusion                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| VS Code discovery and lifecycle | `packages/neko-agent/packages/extension/src/services/capabilityDiscoveryService.ts`        | Extension manifests, registration command, provider lifecycle events                                                                                      | Retain as Host discovery owner; planning must not scan extension manifests independently.                         |
| Host-neutral runtime registry   | `packages/neko-agent/packages/agent/src/runtime/capability/capability-registry-runtime.ts` | Provider Tools, Skills, ToolGroups, ProviderCards, ArtifactProfiles, CreationProfiles, ProviderExpressionProfiles, prompt fragments, protocol/trust facts | Retain as registration and existence authority; collisions and unsupported protocols already produce diagnostics. |
| Extension composition           | `packages/neko-agent/packages/extension/src/bootstrap/capabilityBootstrap.ts`              | Registry construction and runtime wiring                                                                                                                  | Retain; do not introduce a creative-only bootstrap or registry.                                                   |
| Shared runtime bindings         | `packages/neko-agent/packages/agent/src/runtime/capability/capability-runtime-bindings.ts` | Skill, ToolGroup, ArtifactProfile, CreationProfile, ProviderExpressionProfile, operation adapter, external processor, and content access bindings         | Reuse these bindings when planning facts need their registered state; do not capture executor instances in plans. |

`CapabilityRegistryRuntime` detects provider, Tool, short Tool name, Skill, ToolGroup,
ProviderCard, and profile collisions and tracks manifest protocol compatibility. It
does not currently project a compact creative domain index or purpose-oriented
operation candidates. The audit no longer treats that as a required missing
runtime: current Tool definitions, injection, Skill context, `GetContext`, and
owning diagnostics must be evaluated and improved first. Any derived read model
requires focused evidence and cannot become a registration or execution authority.

### Contribution contract and injected set

The shared contribution contract is
`packages/neko-agent/packages/agent-types/src/capability.ts`.

| Existing field family                         | Available facts                                                                                                                                 | Planning reuse                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `identity`                                    | canonical contribution id, source/source id, version, trust                                                                                     | Capability identity, provenance, compatibility, and collision diagnostics.                                      |
| `hostRequirements`                            | supported Host constraints                                                                                                                      | Filter candidates before projection.                                                                            |
| `permissionRequirements`                      | scope, read/write/execute/irreversible mode, approval requirement                                                                               | Project mutation and approval semantics without duplicating permission policy.                                  |
| `creationStageRequirements`                   | profile and stage filters                                                                                                                       | Preserve only as compatibility/context filters; it must not become a fixed creative stage executor.             |
| `promptFragments`                             | localized Agent guidance fragments                                                                                                              | Continue normal prompt composition; do not copy executable schemas into planning text.                          |
| `allowedTools`, `toolNames`, `toolGroupNames` | registered executable exposure                                                                                                                  | Resolve selected operations through the existing Tool authority.                                                |
| `slashCommands`                               | explicit command projections                                                                                                                    | UI/entry discovery only, not creative plan steps.                                                               |
| `promptChainFragments`                        | fragment id, title, chain/checkpoint references                                                                                                 | Method/checkpoint observations only; these fields do not prove Artifact completion.                             |
| `artifactFacets`                              | protocols, profiles, renderers, projectors, execution/lifecycle capabilities, entity, perception, semantic index, review, representation facets | Primary source for accepted/produced Artifacts, actions, risk, approval, and domain semantic availability.      |
| `metadata`                                    | owner-defined extension metadata                                                                                                                | Use only through validated, narrowly owned projections; it is not permission to create an untyped planning bag. |

`agent-capability-injection-runtime.ts` normalizes Skill-scan and manifest
contributions, validates them, and filters injection by disabled id, trust, Host,
Creation profile/stage, permission policy, active Skill, and Tool budget. The
current `AgentInjectedCapabilitySet` contains contributions, prompt fragments,
allowed Tools, slash commands, prompt-chain fragments, and diagnostics.

The same runtime already aggregates all Artifact facet families and exposes:

- `getArtifactFacets()` for the registered facet projection;
- `findArtifactCapabilities()` for accepted/produced Artifact lookup;
- `getSemanticFacetActionAvailability()` for semantic action availability;
- `projectSlashCommandCatalog()` for command display projection.

The missing creative-planning facts are a token-bounded domain index,
purpose-oriented candidate projection, explicit operation execution kind,
support/limit projection, target completion requirements, and on-demand selected
schema materialization. These must be derived inside this existing injection
boundary.

## 2. Skill `mediaWorkflow` Metadata

`SkillMediaWorkflowHint` in `packages/neko-types/src/types/skill.ts` already
provides Agent-readable discovery semantics:

- use cases and non-goals;
- accepted modalities, input Artifacts, produced Artifacts, and Artifact profiles;
- referenced capabilities and suggested projectors;
- tags and free-form operation verbs;
- relative cost and risk;
- validation requirements and optional Tools.

The validator explicitly rejects workflow-DSL field names and describes
`mediaWorkflow` as discovery/catalog metadata rather than an executable workflow.
The implementation must therefore reuse this metadata for Skill fit and method
guidance, while deriving executable availability from registered capabilities and
current Provider/runtime facts. It must not add stage order, branches, transitions,
resolved executors, or persisted run state to `mediaWorkflow`.

## 3. Provider Operation Support

Canonical media operation negotiation currently lives in
`packages/neko-agent/packages/platform/src/media/media-operation-capabilities.ts`.
It already:

- resolves canonical Image and Video operation ids from requests;
- declares Provider-specific Video support levels and accepted/degraded controls;
- records network, authorization, Provider, and required-input roles;
- rejects unsupported end-frame, reference-video, motion/camera, extend, enhance,
  trim, retime, and other controls before dispatch when not declared;
- distinguishes audited Image capability owners and unsupported/degraded paths.

This runtime matrix is the Provider support authority. Creative planning must
derive a bounded support projection from it (or the owning adapter contribution)
and revalidate the concrete request before dispatch. A hand-maintained planning
matrix would drift and is prohibited.

The current Image path only treats `generate`, `edit`, `inpaint`, and
`style-transfer` as generic Provider-generation operations. Deterministic crop,
resize, rotate, mask/layer/composite; perception OCR/segmentation/depth/pose; and
other generative or hybrid operations require the owning executor audit in task
1.6 before their planning status can be corrected.

## 4. Catalog and Query Paths

| Query path                                                                                                           | Current behavior                                                                                                                                      | Disposition                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetContext` in `packages/neko-agent/packages/agent/src/tools/core/meta-tools.ts`                                    | Lists registered Skills, active Skill lifecycle, Tool categories, and optionally categorized callable Tools; Skill summaries include `mediaWorkflow`. | Retain for generic context. It is too broad and does not negotiate operation support.                                                       |
| `ActivateSkill` in the same module                                                                                   | Activates an exact registered Skill with a stated reason.                                                                                             | Retain as method-guidance activation; activation is not capability execution or completion.                                                 |
| `canvas_describe_authoring_capabilities` in `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts` | Returns a read-only, section-filtered Canvas authoring catalog owned by Canvas.                                                                       | Reuse as the owning-package pattern for bounded on-demand discovery; do not copy the catalog into Agent.                                    |
| `/capability list                                                                                                    | show                                                                                                                                                  | tools`                                                                                                                                      | Exposes developer/TUI diagnostics. | Keep as diagnostics; it is not the general planning contract. |
| `agent-capability-lifecycle-runtime.ts`                                                                              | Resolves lifecycle descriptors/handlers, phases and targets, approval, execution, and structured failure.                                             | Retain as deterministic execution owner after Agent selection.                                                                              |
| `agent-prompt-schema-generator.ts`                                                                                   | Composes capability prompt fragments and Provider-compatible Tool schemas.                                                                            | Retain for executable schema injection; add selected-operation projection rather than injecting every private schema into planning context. |

There is no current single query that takes a creative purpose plus current
Artifact context and returns canonical supported/degraded/unavailable candidates.
That is the minimal discovery gap for section 3.

## 5. Diagnostics and Recovery Ownership

- Registration and injection diagnostics use typed capability diagnostics and
  retain contribution/source context.
- Capability lifecycle resolution fails visibly for unknown capabilities,
  unsupported phases, missing handlers, approval denial/waiting, and handler
  failure.
- Provider media validation returns structured unsupported/degraded operation
  diagnostics before dispatch.
- `media-task-executor.ts` owns only task submission, polling, restart recovery,
  cancellation, and terminal cleanup. Its recovery records are not creative plan
  or project state.
- `AgentSession` consumes Skill validation requirements, capability/task results,
  and recovery guidance for later turns. Assistant prose and prompt-chain
  observations are not durable recovery authority.
- `capability-runtime-refresh.ts` contains broad refresh error handling that must
  be reviewed when the implementation touches refresh semantics; it is not a
  reason to add a parallel availability cache.

The orchestration implementation must return current structured diagnostics to
the next Agent observation and recompute candidates. It must not infer recovery
from chat text or persist Workflow nodes/transitions.

## 6. Evaluation Authoring Disposition for This Change

Real Agent Evaluation is required because the change affects capability/Tool
routing, prompt composition, Skill guidance, AgentSession continuation, Provider
selection, approvals, task recovery, and TUI evidence projection.

| User-visible behavior                                        | Disposition and owner                                                                                                                                                           | Coverage delta                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Layered capability injection and selected operation routing  | Update `agent-runtime.prompt-composition` and `agent-runtime.skill-runtime`; add target-scoped cases only if the coverage index cannot express candidate/selection facts.       | Prove compact index, exact selected schema, disabled/untrusted omission, and no full-catalog fallback.                               |
| Provider/model capability negotiation                        | Update `agent-runtime.model-binding` and `agent-runtime.perception-routing` where applicable.                                                                                   | Prove effective Provider/model identity and pre-dispatch rejection of unsupported controls.                                          |
| Artifact-grounded creative replanning and async continuation | Update `agent-runtime.creative-media-workflow`; retain `agent-runtime.workflow-controller` only for existing session/task controller ownership, not as a creative Workflow DAG. | Prove current revisions, terminal task state, structured replan reason, and poisoned fixed-stage/legacy workflow paths.              |
| Creative method guidance                                     | Update `skill.storyboard`, `skill.image`, `skill.video`, `skill.media-production`, and `skill.media-quality-review`.                                                            | Prove Skill activation/method guidance without treating prompt-chain checkpoints as completion evidence.                             |
| Plan Mode Markdown and Apply re-resolution                   | Create a target-scoped suite if no indexed Plan Mode owner exists after task 1.8.                                                                                               | Prove read-only planning, zero side effects, digest/revision-bound approval, current-schema re-resolution, and stale-plan rejection. |

Required evidence is defined before case prompts:

1. user behavior and target deliverable;
2. canonical session/turn, injection, selection, lifecycle/task, Artifact, approval,
   quality, and export path as applicable;
3. candidate and selected capability ids, effective Provider/model, exact input and
   output Artifact revisions, diagnostics, approvals, and terminal task state;
4. poisoned or explicitly absent fixed creative stage, Workflow run/node/transition,
   stale schema/executor, active-Webview, and assistant-text fallback paths;
5. expected result and owning Artifact/Quality validator evidence;
6. expected fail-visible behavior for unavailable, denied, unsupported, stale, or
   ambiguous requests.

`pnpm test:agent:eval` will be used only as key-free harness validation. Release
evidence requires focused cases through the real TUI and Provider-backed paths;
missing credentials or infrastructure must be recorded as a blocker and residual
risk rather than replaced with mock success or final-answer text matching.

## 7. Task 1.1 Gap Conclusions

1. Registration, lifecycle, Artifact facets, Skill discovery hints, permission
   filters, Provider operation validation, and diagnostics already have owners.
2. The missing component is a derived, read-only, token-bounded capability
   planning projection plus on-demand selected schema injection.
3. `mediaWorkflow` and prompt-chain fragments remain creative method guidance;
   neither may become executable plan state or Artifact completion evidence.
4. The Agent chooses a transient next `CapabilityIntent`; deterministic registries,
   validators, permissions, approval, Provider adapters, tasks, and owning packages
   execute and record truth.
5. No parallel creative Tool catalog, persistent Plan Manager, broad Creation DTO,
   or Workflow DAG/runtime is justified by this audit.

## 8. Owning Domain Capability Inventory

### Project authoring contract baseline

`packages/neko-types/src/project-authoring/index.ts` already defines the shared
durable authoring envelope. Successful `NekoProjectAuthoringResult` values carry a
durable `documentUri`, resolved target, diagnostics, and optionally an exact
`QualityProjectRef { domain, documentUri, projectRevision, contentDigest }`.
Runtime handles, cache paths, Webview routes, and legacy UI-bound commands are
rejected by the shared validators.

This is the preferred revision result for project mutations. A Tool result that
only contains an element/node id, task id, active-editor revision counter, path, or
success message is not equivalent to a revision-bound authoring result.

### Domain matrix

| Domain owner                      | Accepted facts / current inputs                                                                                                          | Produced facts / current outputs                                                                                                                                    | Mutation and revision owner                                                                                                                                            | Current support and limits                                                                                                                                                                   | Transactional or projection gap                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story                             | Indexed `.fountain` path/URI, stable scene ids, query text, scene selection                                                              | `NekoStoryScriptIndex`, `StoryScenePlan`, `StoryShotPlan`, Story reference candidates                                                                               | Story index/API owns parsing and deterministic plan projection; VS Code inline suggestion owns an interactive text edit                                                | Headless query/planning works in TUI/CLI/VS Code. Inline suggestion requires active VS Code editor and confirmation.                                                                         | No Artifact facets, canonical `StoryboardTable`, source revision/digest, or `QualityProjectRef` is returned. Interactive edit only reports that a suggestion was presented.                                                                                                                                                                     |
| Canvas                            | `CanvasAuthoringIntent`, Markdown/GFM tables, canonical Storyboard payloads, `ResourceRef`, prompts, playback plans/routes               | Canvas nodes/connections/blocks, `CanvasAuthoringResultEnvelope`, playback plan, Cut draft, Markdown diagnostics                                                    | `CanvasProjectAuthoringService` owns explicit-target `.nkc` writes and returns `QualityProjectRef` with `nkc:<digest>`                                                 | Headless service plans a complete in-memory mutation, validates runtime identities, saves once, then projects to an open editor. Markdown Storyboard lifecycle can use it without a Webview. | Many general Agent node Tools still call active `api.nodes` methods and expose node refs without `projectRef`; active-context fallback and revision loss must be classified degraded until routed through explicit authoring. Canvas has no `ProjectQualityFacade`.                                                                             |
| Image/Video Media                 | Prompt, operation id, stable source/start/end/reference `ResourceRef`s after Host materialization, provider/model controls               | Async media Task, generated Image/Video/Audio assets with `GeneratedAssetRevisionRef`, content digest, stable resource ref, Provider/model/operation/source lineage | Media task executor owns dispatch/poll/recovery; generated-asset lifecycle/index owns draft identity; no project mutation occurs                                       | Provider negotiation rejects unsupported canonical operations and controls before dispatch. Generated results have exact revision identity and can feed later authoring.                     | Media completion is a generated draft, not Canvas/Sketch/Cut completion. Provider support projection is not yet exposed through the Agent capability index. Generic Image support is narrower than editor/tool names imply.                                                                                                                     |
| Sketch / Image authoring          | Active Sketch canvas/layer/selection snapshots, prompt, masks, generated image outputs; separately, explicit `.nks` authoring targets    | Generated layer previews, selection masks, task ids; headless authoring service can create/update/import layers or PSD and return `.nks` `QualityProjectRef`        | `SketchProjectAuthoringService` owns durable `.nks` writes; current AI Tool provider writes previews through `NekoSketchAPI.applyAIImageResult` into the active editor | Generate, smart selection, inpaint, style transfer, upscale, line-art colorize, and auto-layer are exposed when media service/config are enabled.                                            | Current Agent AI Tools require an active editor, return no exact `.nks` revision, and auto-layer can partially apply successful layers while swallowing individual failures. The existing headless authoring service is not the canonical writeback for these Tools. No deterministic crop/resize/rotate/layer operation projection exists yet. |
| Puppet / 2D character             | Text/image prompts and active face parameters in the Puppet provider; native Engine commands use stable ids plus `baseRevision`/sequence | Face parameter maps or active-editor application; native command acknowledgement and revision                                                                       | Puppet Extension owns active editor parameter writes; Engine runtime-puppet owns revision-aware native commands; `.nkp` file truth remains Puppet-owned                | Face inference/adjustment works only with an active editor for apply. Native query/expression/BlendShape/bone/control-driver/play commands are revision-aware.                               | No Artifact facets or headless `.nkp` authoring result is exposed. Native create, auto-rig, and generated-animation Tools currently return preview-required diagnostics/stubs and cannot persist `.nkp`/`.nkentity`; they must be unavailable, not planned as supported.                                                                        |
| Model / Scene                     | Active `.nkm` scene graph, node/material/animation ids, transform/material patches                                                       | Scene/node/animation query data and mutation result containing an Engine scene revision number                                                                      | `NekoModelAPI`/Model Editor owns live Scene mutation; `ModelProjectAuthoringService` separately owns asset import; `ModelProjectQualityFacade` derives file revision   | Query, transform, visibility, material update, and playback controls are implemented against the active Model editor.                                                                        | Agent mutation results lack document URI, durable `QualityProjectRef`, and explicit-target headless scope. Engine scene revision is not enough to prove saved `.nkm` content. General scene construction/camera/shot animation authoring is not registered.                                                                                     |
| Cut / Animatic                    | `StoryboardTable` projection, `CutStoryboardImportPayload`, `CanvasCutDraftPayload`, generated/media sources, timeline element ids       | Timeline refs/elements, imported Storyboard sync payload, `.nkv` `QualityProjectRef` from `CutProjectAuthoringService`                                              | `CutProjectAuthoringService` and `ProjectSessionService` own explicit `.nkv` writes; Cut owns timeline state                                                           | Headless create/load/update, media import, Storyboard import, and Canvas draft import exist. Timeline editing/effects/transitions are exposed through the active Engine-backed bridge.       | Public Canvas-draft import result strips the authoring `projectRef`; generic timeline Tools use current timeline state and do not return exact revisions. Multi-call edits are not atomic. No Cut-owned atomic Animatic operation yet combines accepted timing, shots, and temporary audio.                                                     |
| Audio                             | `.nka` document URI, tracks/elements, imported media, mix/effect/automation parameters                                                   | Saved project operation ids/refs and document URI, generated music/SFX/voice drafts, mix export path, loudness result                                               | `AudioProjectProvider` cache/store owns `.nka` mutation and saves each Agent edit; `AudioProjectQualityFacade` derives `nka:<digest>`                                  | Headless document-URI editing is available for tracks, media, automation, renderable effects, and mix export. Planned effects fail visibly; stem separation is unavailable.                  | Agent Tool mutation results omit exact `QualityProjectRef`; provider-direct generation does not edit `.nka`; mix export returns a path without revision-bound deliverable lineage or verifier evidence.                                                                                                                                         |
| Quality                           | `QualityTarget` with exactly one stable `ResourceRef` or `QualityProjectRef` plus revision/digest and optional lineage                   | `QualityEvidence`, `QualityGateResult`, stale evidence ids, repair plan, Project snapshots/previews/probes/readiness diagnostics                                    | Quality runtime owns evidence/gate evaluation; each domain facade owns project validation against current file bytes                                                   | Shared target/evidence/gate contracts are revision-aware and reject legacy path-only identity. Sketch, Cut, Audio, Model, and Puppet have ProjectQuality facades.                            | Most domain facades can validate/snapshot, but preview, runtime probe, or export readiness returns explicit unavailable until an owning adapter is registered. Canvas and Story lack ProjectQuality facades. Evidence storage/lookup for cross-turn target completion still needs integration.                                                  |
| Export / deliverable              | Engine `ExportConfig`, Cut timeline layers/audio sources, output path; character export accepts entity/source/output paths               | Engine `ExportResult` with output path and render metrics; character exports return file lists/manifests or explicit export plans                                   | Rust/Engine export owns render/encode; owning domain/Assets owns package export                                                                                        | Timeline video export and several asset/package exporters exist. Native Puppet alternate formats report unsupported features through diagnostics.                                            | Export results lack a stable deliverable `ResourceRef`, source project revision/digest, export lineage, preflight Gate binding, and post-export verifier. A path/`success: true` cannot satisfy final delivery.                                                                                                                                 |
| Asset / generated-asset promotion | Asset id/query or local import path; generated drafts use `GeneratedAssetRevisionRef`; recording promotion has its own request           | `AssetEntity`, reference candidates, generated revision/promotion records, character packages                                                                       | Assets library owns imported/promoted entities; generated-asset lifecycle owns draft revisions and evidence transfer rules                                             | Headless list/get/import is available. Generated lifecycle correctly marks evidence stale when promotion changes content.                                                                    | Asset Agent provider has no Artifact facets and no canonical generated-draft promotion Tool returning promotion id plus durable asset revision. Generic import returns an entity but no explicit library revision/lineage envelope. Recording promotion is a separate narrow path.                                                              |
| Engine media/perception/runtime   | Source media paths, effect ids/WGSL, audio/video sources, native scene/puppet command envelopes                                          | Effect metadata, transcription/loudness analysis, frame base64, scene/puppet snapshots, native Puppet ack revision                                                  | Rust Engine and Extension command bridge own compute/runtime mutation                                                                                                  | Local analysis, frame capture, effect registration, scene inspection, and revision-aware native Puppet operations are available according to runtime support.                                | Most Engine outputs are values or base64, not stable Artifacts. Tool registration has no Artifact facets/support projection. Custom shader registration is a runtime mutation without project lineage. Native Puppet creation/auto-rig/animation generation are non-executable preview stubs.                                                   |
| External Processor                | Registered manifest, declared Artifact kinds, `ResourceRef`/authorized root inputs, params, output slots, policy/trust context           | Output `ResourceRef`s, registration revision, run/stage/attempt identity, retention status, structured diagnostics                                                  | External Processor registry/runtime owns validation and ephemeral chain coordination; processor resource port owns retention/promotion state                           | Manifest validation, trust/enabled filtering, path/network/env policy, approval, timeout, missing-output checks, and result/invocation parity already exist.                                 | Processor runs do not mutate owning project truth automatically. Multi-output process execution is not a project transaction; outputs require owning validation/promotion. In-memory chain records are recovery/coordination facts, not creative Workflow state or durable completion.                                                          |

### Current Artifact facet coverage

Only Canvas and Cut currently contribute the relevant creative execution Artifact
facets among the primary editor packages audited above. Story, Sketch, Puppet,
Model, Audio, Assets, and Engine mainly register Tools/ToolGroups and therefore
cannot yet be discovered reliably through `findArtifactCapabilities()` even when
an owning service exists.

The implementation should add or adapt small planning projections from each
owning contribution. It must not infer support from a Tool name, package presence,
or UI control. Until an owner supplies accepted/produced kinds, execution kind,
support, limits, approval, and exact result semantics, the candidate is degraded
or unavailable.

### Reusable exact-revision paths

- Canvas headless authoring: `.nkc` `QualityProjectRef` with content digest.
- Cut headless authoring: `.nkv` `QualityProjectRef` with content digest.
- Sketch headless authoring: `.nks` `QualityProjectRef` with content digest.
- Audio, Model, Puppet ProjectQuality facades: current file revision/digest after
  the caller supplies the exact target.
- Generated media: stable generated asset resource ref, revision, digest, and
  Provider/model/operation lineage.
- External Processor: stable output `ResourceRef`s plus registration/run revision
  evidence, followed by owning-domain validation or promotion.

### Confirmed owning-domain gaps for later tasks

1. Story planning outputs need canonical structured source/Storyboard Artifact and
   revision projection; the Agent must not manufacture Story truth.
2. Active-editor Canvas, Sketch, Cut, Puppet, and Model Tool paths cannot advertise
   transactional project authoring until they return exact owning revisions.
3. Animatic creation, generated-asset promotion, current-revision export/preflight,
   and final deliverable verification require owning-domain operations or explicit
   follow-up changes.
4. Missing Puppet/Character/Style/Color Bible, multi-shot dependency, and animation
   production contracts belong in the follow-up animation-production OpenSpec, not
   in Agent runtime DTOs.
5. Quality contracts exist, but unavailable owning evaluators and readiness
   adapters must remain explicit diagnostics; Agent planning cannot simulate them.

## 9. Current `media-production` Runtime Trace

### Online Agent path

| Step                             | Current implementation                                                                                                                                                                                                                                                                                                                           | Runtime fact and gap                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill registration               | `packages/neko-skills/src/builtins/creative-media.ts` registers `media-production` with a linear stage narrative, a fixed allowed-Tool list, `mediaWorkflow.operations`, risk/cost, Artifact hints, and validation requirements.                                                                                                                 | The Skill correctly avoids implementing package mutations, but its content and metadata still present one mandatory stage order. Its allowed list contains read, media generation, Canvas active-context, Cut timeline-info, and Quality check Tools, but not the revision-returning Canvas/Cut/Audio authoring operations required to complete the declared workflow. |
| Explicit or Agent activation     | `ConversationSkillRuntime._applySkill()` loads the Skill through `SkillService`, creates a lifecycle record, projects prompt/tool policy, and records a `started` prompt-chain observation when creation metadata is supplied. Agent-driven activation uses the same lifecycle through `ActivateSkill`.                                          | Prompt-chain observation is correctly an observation port, not an executor. Activation only proves guidance was injected; it does not choose or execute an owning capability.                                                                                                                                                                                          |
| Creation/IDC turn classification | `createSkillExecutionCreationMetadata()` marks explicit Skill execution as `prompt-chain-skill`/`multi-step`; `creation-turn-planning.ts` otherwise infers task shape and entry signal from the current user text.                                                                                                                               | IDC/persona routing constrains the Agent turn but does not generate an executable creative plan. Regex classification and current input remain routing hints, not Artifact-grounded production facts.                                                                                                                                                                  |
| AgentSession assembly            | `AgentSession.applySkillLifecycleProjection()` installs Skill prompt sections, Tool guard rules, and ToolSets. `skillRequiresDurableRun()` starts a general durable creation run because `media-production` declares produced Artifacts/profiles. During execute, the active Skill name and `validationRequirements` are passed to the executor. | A durable Agent run exists, but no creative observation snapshot or capability candidate index is composed. The model receives Skill text, message history, generic Tool exposure, and validation guidance rather than current domain revisions plus supported operation projections.                                                                                  |
| Capability/tool selection        | The model selects among currently injected/allowed Tools. Generic capability injection can filter registered contributions, but `media-production` has no purpose-oriented operation discovery and no on-demand selected-schema resolution.                                                                                                      | Selection is largely prompt- and Tool-name-driven. Disabled/uninstalled/unsupported creative techniques are not compared as structured candidates, and the fixed Skill allowed list can hide valid owning capabilities.                                                                                                                                                |
| Async media submission           | `GenerateImage`, `TransformImage`, `GenerateVideo`, TTS, and music Tools submit through the media platform; Provider validation occurs before dispatch and the Tool returns a media task id while work is pending.                                                                                                                               | The asynchronous boundary is real and should be retained. Task id is not an Artifact or completion proof.                                                                                                                                                                                                                                                              |
| Task completion                  | `MediaTaskExecutor` polls/recovers the Provider task. `buildGeneratedMediaAssets()` creates stable generated-asset revision/digest/resource lineage. `MediaTurnBridge` projects terminal media state into an Agent Task result observation.                                                                                                      | This is the strongest current cross-turn evidence path and should feed the next transient observation. It proves generated-draft completion only, not project authoring or final delivery.                                                                                                                                                                             |
| Continuation                     | `AgentTaskResultObservationRuntime` records an observation/evidence row and either queues a pending Agent message or dispatches a new turn. The follow-up prompt contains a textual summary and bounded stable result refs.                                                                                                                      | Running sessions can queue without UI, but idle continuation is routed through `ChatProvider`, requires an assistant Webview, switches the active conversation, and sends `request.prompt` back as a new message. Current owning revisions/capabilities are not re-read automatically before the next consequential action.                                            |
| Project authoring                | `MediaProductionProjectAuthoringOrchestrator` and `mediaProductionProjectAuthoringResolver.ts` can call Canvas, Cut, and Audio authoring APIs with approved stable assets and require revision-returning `NekoProjectAuthoringResult`.                                                                                                           | These types are exported and tested but have no production composition or call site from AgentSession/task continuation. The online `media-production` turn therefore has no automatic revision-bound writeback. Active-editor Canvas/Sketch/Cut/Puppet/Model Tools can still be chosen independently and may return no durable revision.                              |
| Quality review                   | `QualityCapabilityProvider` builds `QualityGateRuntime`, resolves owning ProjectQuality facades for project targets, materializes resource targets through content access, and returns `QualityGateResult`. `AgentSession` observes Tool review/failure signals through the validation coordinator.                                              | Quality is callable and revision-aware when the Agent supplies a valid current target. It is not automatically bound to the newest authoring result, and no target-completion evaluator forces stale evidence to be rerun before export/delivery.                                                                                                                      |
| Export and final completion      | Engine/Cut export services exist outside this Skill path. The fixed workflow implementation only reaches a pre-export orchestrator; no production Agent call chain owns export lineage and post-export verification.                                                                                                                             | `media-production` currently cannot prove the declared `exported-deliverable`. Skill prose or a completed prompt chain must not be reported as end-to-end completion.                                                                                                                                                                                                  |

### Dormant fixed Workflow path

`packages/neko-types/src/types/media-production-workflow.ts` defines a persistent
`MediaProductionWorkflowRunState` with exactly nine ordered stages:

1. `source-normalization`;
2. `storyboard-validation`;
3. `shot-generation-planning`;
4. `media-generation`;
5. `asset-quality-gate`;
6. `project-authoring`;
7. `pre-export-gate`;
8. `export`;
9. `deliverable-verification`.

`startMediaProductionStage()` rejects a stage until every earlier array entry is
completed. `MediaProductionEarlyStageOrchestrator` loops the first five stage ids;
`MediaProductionProjectAuthoringOrchestrator` requires the asset-quality stage;
`MediaProductionPreExportGateOrchestrator` requires project authoring and a
persisted pre-export plan. `MediaProductionWorkflowRecoveryCoordinator` restores
or retries an interrupted stage from the persisted run snapshot.

`media-production-workflow-state.ts` stores this complete workflow state inside a
background Task input/output under `mediaProductionWorkflowState`. Search of all
production TypeScript call sites shows the constructors and state functions are
only exported; orchestration use is confined to their own tests. No AgentSession,
Extension bootstrap, or TUI path creates and drives this fixed workflow.

This path conflicts with the accepted target architecture in two ways:

- it makes stage array position and prior stage completion the decision authority;
- it persists duplicated project/resource/Gate facts as Agent-owned recovery state.

It must be removed or poisoned as a creative execution path. The reusable pieces
are the stable Artifact/revision validation ideas and owning authoring ports, which
will be called after a transient Agent-selected `CapabilityIntent`, not by a
replacement fixed DAG.

### Prompt-chain and stage metadata

The current prompt-chain contract already limits observations to `started`,
`checkpoint`, `skipped`, `reordered`, and `completed`. Automatic Skill activation
records only `started`; there is no evidence that checkpoints execute Tools or
satisfy validators. This observation contract is compatible with the target design
once tests explicitly prevent prompt-chain completion from satisfying Artifact,
Quality, preflight, or export requirements.

By contrast, `CREATIVE_MEDIA_WORKFLOW_STAGES` and
`mediaProductionSkill.mediaWorkflow.operations` currently repeat fixed production
milestones, and the Skill body states them as a single arrow sequence. Task 5.1
must convert these to optional/repeatable method checkpoints selected from current
Artifacts and diagnostics.

### Locations relying on weak or stale authority

| Reliance                      | Current locations                                                                                                                                            | Required disposition                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed stage order/state       | `media-production-workflow.ts`, `media-production/*-orchestrator.ts`, `media-production-workflow-state.ts`, `CREATIVE_MEDIA_WORKFLOW_STAGES`, Skill body     | Poison/remove executable fixed workflow; retain only method milestones and owning Artifact validation.                                                |
| Chat text/history             | Skill stage prose, `creation-turn-planning.ts` text heuristics, AgentSession message history/project-memory extraction, default task-result follow-up prompt | Recompute a typed observation from owning facts; text remains user intent and explanation, not recovery or completion truth.                          |
| Active Webview/editor         | Idle task continuation in `chatProvider.ts`; general Canvas node Tools; Sketch/Puppet/Model mutations; generic Cut timeline bridge                           | Move business continuation and consequential selection to Host/session services; explicit-target authoring is canonical and Webview only projects UI. |
| Stale executor/schema capture | Persistent workflow plans and stage state can retain handoffs/policies independently of current capability/provider support                                  | Apply must re-read current plan/revisions and resolve current registered schema immediately before each action.                                       |
| Legacy workflow runtime       | Exported `MediaProductionWorkflowRunState`, Task-backed state store, early/project/pre-export/recovery orchestrators                                         | Remove from the new canonical path and add architecture/evaluation poison assertions before layered orchestration is accepted.                        |

### Task 1.3 conclusion

The current online Agent path is already Agent-driven at the model/Tool loop level,
but it is not capability-aware or Artifact-grounded enough to deliver a complete
animation/film workflow. The separate fixed Workflow implementation is not online
and must not be promoted into production. The target implementation should connect
the online Agent turn to layered capability discovery, exact owning authoring
results, structured task/quality diagnostics, and per-action re-resolution.

## 10. Planning Field Source and Reuse Map

The planning projection is a derived view over registered capability truth. The
table distinguishes fields that can be projected directly, fields that require a
small normalized cross-package vocabulary, and facts that must remain in the
owning runtime rather than being copied into Agent state.

| Planning semantic               | Existing canonical source                                                                                                                                                                                                       | Reuse decision                                                                                                                             | Genuine shared gap                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract version                | Existing capability, lifecycle, media-operation, Artifact, Quality, and authoring contracts are individually versioned                                                                                                          | Add a version only to the new projection envelope so unknown projections fail visibly. Do not version or wrap every owning contract again. | A planning projection version constant/validator.                                                                                                                                        |
| Canonical identity and owner    | `AgentCapabilityContribution.identity`; Artifact execution `capabilityId`/`packageId`; lifecycle `capabilityId`/`providerId`; Tool registry ownership                                                                           | Reuse these ids and registration provenance. Registration remains the existence authority.                                                 | No new owner registry. The derived item needs a normalized `capabilityId` and owner projection when the source shape differs.                                                            |
| Domain                          | `Skill.domain`, Tool `CreativeDomainMetadata`, owning package id, semantic facet package id                                                                                                                                     | Use explicit owning-domain data where registered; never guess domain solely from a Tool name.                                              | `AgentCapabilityContribution`/Artifact execution capabilities lack one normalized planning-domain field for non-Skill operations.                                                        |
| Creative purposes               | Skill `mediaWorkflow.useCases`, `nonGoals`, `operations`; Artifact/lifecycle `actions`; Canvas catalog operation ids                                                                                                            | Reuse method fit and action ids, but do not treat raw action names as adequate model-facing purpose semantics.                             | A bounded `purposes` vocabulary/list on an owning planning contribution is needed for operation comparison.                                                                              |
| Accepted Artifact kinds         | Artifact execution/lifecycle `accepts`; Skill `inputArtifacts`/modalities; External Processor input declarations; Tool schema input roles                                                                                       | Prefer Artifact/lifecycle declarations; Skill values are discovery hints only.                                                             | No parallel Artifact schema. Some owners need to contribute missing `accepts` facts.                                                                                                     |
| Produced Artifact kinds         | Artifact execution/lifecycle `produces`; Skill `producedArtifacts`; External Processor outputs; `NekoProjectAuthoringResult.projectRef`; generated-asset lifecycle                                                              | Prefer executable contribution/result contract; Skill values cannot upgrade support.                                                       | No broad Creation DTO. Owners without facets need to expose produced kinds and exact-revision result semantics.                                                                          |
| Required input roles            | Provider media support `requiredInputRoles`; Tool required schema fields; Artifact profile/source contracts                                                                                                                     | Derive safe role summaries without copying package-private schema or Provider payloads.                                                    | A compact, typed/allowlisted input-requirement projection is needed for roles such as source, mask, start frame, end frame, and reference.                                               |
| Mutation scope                  | Contribution `permissionRequirements` modes/scopes; Tool `safetyKind`, `isReadOnly`, `isDestructive`, traits; lifecycle risk/approval; authoring target kind                                                                    | Derive read/write/execute/irreversible policy from existing contracts.                                                                     | Existing fields do not consistently distinguish `asset`, `project`, `export`, and managed `external` mutation. Add one normalized `mutationScope`.                                       |
| Execution kind                  | Perception facets identify perception execution; media requests/provider adapters identify generation; External Processor and Engine contracts identify their runtime; deterministic editor/engine adapters are known by owners | Do not infer from UI presence or from a verb such as “edit”.                                                                               | Add optional normalized `deterministic                                                                                                                                                   | perception | generative                                                                                                      | hybrid` for operations where technique affects planning, especially Image. |
| Current support                 | Semantic facet `availability`; Provider media `CreativeMediaOperationSupport.level`; registry trust/host/enabled/protocol filters; Tool/runtime availability diagnostics                                                        | Compute support after all current filters and Provider/model checks.                                                                       | Add normalized projection output `supported                                                                                                                                              | degraded   | unavailable`; owners need an adapter-level declaration when existing registration only proves a UI Tool exists. |
| Limits and controls             | Provider `acceptedControls`, `degradedControls`, operation-specific request validators, Tool schema enums/ranges, External Processor manifest params/policy, authoring catalog descriptors                                      | Project only allowlisted planning-relevant constraints and always revalidate the selected schema at execution.                             | Add a token-bounded sanitized limits/constraint summary contract; do not expose arbitrary Provider payloads or use an unbounded metadata bag.                                            |
| Model/network requirements      | Provider operation `requirements`, Provider/model cards, Tool runtime requirements, External Processor network policy                                                                                                           | Derive from current selected Provider/model/adapter and policy.                                                                            | Normalize `requiresModel`/`requiresNetwork` (and authorization when relevant) in planning output; no new Provider registry.                                                              |
| Preservation semantics          | Generated-asset source lineage, ResourceRefs, mask/reference request fields, operation-specific behavior                                                                                                                        | Preserve exact source/mask/reference lineage in execution results.                                                                         | Existing capability metadata does not declare whether unmodified regions/source structure must be preserved. Add a compact preservation semantic for applicable Image/hybrid operations. |
| Cost                            | Skill `mediaWorkflow.costLevel`; Tool traits cost; Provider/model pricing/availability where present; External Processor locality/policy                                                                                        | Normalize the strongest current operation-specific fact and treat Skill cost as a fallback hint only.                                      | One shared output vocabulary is needed because current cost vocabularies differ and many operation-level contributions have no cost projection.                                          |
| Risk                            | Artifact/lifecycle risk, Tool safety/destructive flags and traits, Skill risk hint                                                                                                                                              | Derive the effective risk; Skill metadata cannot lower runtime risk.                                                                       | Normalize existing vocabularies; no separate risk authority.                                                                                                                             |
| Permission and approval         | `permissionRequirements`, lifecycle `requiresApproval`, Tool confirmation/safety, ApprovalEngine/policy                                                                                                                         | Reuse deterministic permission and Approval owners and recheck at Apply.                                                                   | Projection needs normalized approval-required and permission summary; no Plan-owned approval store.                                                                                      |
| Quality expectations            | Skill `validationRequirements`; Quality profiles/policies; ProjectQuality operation availability; owning Artifact validators                                                                                                    | Resolve to registered validator/profile ids and current evaluator availability.                                                            | Add operation-level `qualityProfiles`/expectations where owners currently provide only broad Skill guidance.                                                                             |
| Recoverable failures            | Registration/injection/lifecycle diagnostics; Provider operation diagnostics; authoring, Quality, task, and External Processor diagnostic codes                                                                                 | Reuse actual failure codes/results for runtime recovery.                                                                                   | Add a bounded advertised `recoveryKinds`/alternative-direction projection so the Agent can compare strategies before failure; never encode retry transitions.                            |
| Exact result/revision authority | Generated asset revision, `NekoProjectAuthoringResult.projectRef`, `QualityEvidence`/Gate target, External Processor output refs, export lineage when implemented                                                               | Completion always re-reads owning result/evidence.                                                                                         | Owners that return only ids/paths/runtime counters must add or adapt exact revision results; Agent must not create a substitute state field.                                             |
| Target completion               | Artifact requirements/profiles, current revisions, Quality policy/evidence, preflight/readiness, export lineage/verifier                                                                                                        | Build a separate read-only target-completion projection from these owners.                                                                 | Minimal requirement/result vocabulary is needed for required evidence and allowed skips; it must not contain stage order or Workflow transitions.                                        |
| Selected executable schema      | Tool registry/schema generator, lifecycle descriptor input/result schema, operation adapter registry                                                                                                                            | Resolve and inject only after the Agent selects the canonical capability id.                                                               | No schema copy belongs in the planning item. A resolver association to the registered capability id is sufficient.                                                                       |

### Minimal shared additions after reuse

The audit supports a small versioned planning projection rather than the broad
interface sketched before implementation. Its genuinely new normalized semantics
are:

- planning domain and creative purpose;
- mutation scope;
- optional execution kind;
- current support plus bounded public diagnostics;
- sanitized planning limits and required input roles;
- normalized model/network, cost, risk, permission, and approval summaries derived
  from existing owners;
- preservation semantics where applicable;
- operation-level quality profiles and recoverable failure kinds;
- a separate target-completion requirement/result projection.

Identity, accepted/produced Artifact kinds, schema, Provider support details,
ResourceRefs, project revisions, Quality evidence, task state, and execution remain
owned by their existing contracts. The new type must reference or derive those
facts rather than copy their full payloads.

### Why no parallel catalog or broad Creation/Workflow DTO is needed

1. The capability registry already owns installation, enablement, trust, Host,
   protocol, collision, Tool/schema, and Provider facts. A `CreativeToolCatalog`
   would immediately create a second existence and support authority.
2. Artifact facets, authoring results, generated-asset lifecycle, Quality, Assets,
   and External Processor outputs already define durable identities. A broad
   Creation DTO would duplicate domain truth and become stale after any mutation.
3. Skill `mediaWorkflow` already owns discovery/method hints and explicitly rejects
   Workflow DSL fields. Expanding it into executable stages would violate the
   Skill/capability boundary and make author metadata override runtime support.
4. Current-turn `CapabilityIntent` only needs selected capability identity,
   current Artifact/revision inputs, target, requested purpose, and approval/policy
   context. The selected schema is resolved at execution; it is not a persistent
   graph node.
5. Recovery is a new Agent decision over current diagnostics and owning facts. A
   DTO containing transitions/retries would recreate the fixed Workflow runtime
   that this change is removing.

## 11. Canonical Image Operation Execution Audit

### Authority and classification rules

The canonical Image operation ids are defined by
`creative-media-operations.ts`. `ImageOperationCapabilityRegistry` supplies the
negotiation and dispatch contract, but no production composition root currently
instantiates it or registers an Image adapter. Consequently,
`AUDITED_IMAGE_CAPABILITY_MATRIX` is descriptive test data, not executable
support, and an editor feature with similar semantics is not sufficient evidence
for `supported` planning status.

This audit uses these execution classes:

- **deterministic**: repeatable pixel/project mutation such as crop, resize,
  rotate, mask, layer, or alpha composite;
- **perception**: model analysis returning structured masks, regions, OCR,
  segmentation, depth, or pose evidence;
- **generative**: an image Provider synthesizes or redraws pixels;
- **hybrid**: explicit composition of more than one of the above with each
  executor and intermediate Artifact represented.

`supported` below means that a callable canonical adapter reaches its real
executor, validates required inputs and Provider support, returns stable output
refs, and—when it claims project authoring—returns the exact written revision.
Editor-only or semantically lossy paths are `degraded`; declarations with no
canonical adapter are `unavailable` even if reusable implementation fragments
exist.

### End-to-end operation matrix

| Canonical operation               | Current entry and final executor                                                                                                                                                                                      | Writeback / revision                                                                                                                                   | Execution kind and Provider validation                                                                                                                 | Current declaration                         | Correct planning status and audit finding                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate`                        | `GenerateImage` -> `ICapabilityMediaService.generateImage` -> `MediaGenerationService` -> selected media Provider adapter                                                                                             | Stable generated output is available; no project writeback is implied by the operation                                                                 | Generative. Generic validation accepts the operation before Provider dispatch                                                                          | `media/supported`                           | **supported**, subject to the selected model/provider capability and authorization resolved at execution time                                                                                              |
| `edit`                            | `TransformImage` -> the same media generation path; source URI/base64 must already be materialized and `operationPlan` is metadata, not a deterministic edit executor                                                 | Stable generated output and lineage can be returned; no exact project revision                                                                         | Generative. Generic validation accepts every Provider type without an operation-specific preservation profile                                          | `media/supported`                           | **degraded** until the selected Provider declares source/reference support and preservation semantics; it must not be planned as deterministic editing                                                     |
| `inpaint`                         | Sketch tool obtains active selection/source -> generic media generation -> Provider -> `applyAIImageResult` preview/layer writeback. Direct media requests infer `inpaint` from a mask                                | Requires an active Sketch editor; returns task/preview data, not an exact `.nks` project revision                                                      | Generative. Generic validation accepts it, but the shared required-input validator does not require source plus mask                                   | `sketch/supported`                          | **degraded**: interactive Sketch writeback exists, but no headless exact-revision canonical adapter and incomplete required-input validation                                                               |
| `outpaint`                        | No Tool/capability entry or final executor                                                                                                                                                                            | None                                                                                                                                                   | Generative; generic Provider validation rejects it. Shared validation correctly requires source plus expansion                                         | `media/unsupported`                         | **unavailable**; declaration is accurate                                                                                                                                                                   |
| `upscale`                         | Sketch tool submits explicit `upscale` to generic media generation; Cut separately reaches Engine ONNX `upscale`; Engine also has deterministic preview resize variants                                               | Sketch is active-editor preview/layer only; Cut returns an output path only; neither returns an owning project revision through the canonical contract | Current Sketch route is generative and is rejected by generic Provider validation. Engine/Cut executors are not registered as canonical Image adapters | `sketch/supported`                          | **unavailable canonically** (with reusable deterministic/ML executor fragments). The supported declaration is a false positive                                                                             |
| `colorize`                        | Sketch line-art colorize submits non-canonical `lineart-colorize` to generic media generation, then attempts active-editor layer preview                                                                              | No exact `.nks` revision                                                                                                                               | Generative. Generic Provider validation rejects the runtime operation id; canonical `colorize` is also not accepted                                    | `sketch/supported`                          | **unavailable canonically**. The supported declaration is a false positive; the eventual adapter may expose generative colorization with palette/preservation constraints                                  |
| `style-transfer`                  | Sketch tool captures an active image and calls generic media generation without setting the canonical id; request inference classifies the reference request as `edit`                                                | Active-editor layer preview only; no exact `.nks` revision                                                                                             | Generative. Generic validation nominally accepts explicit `style-transfer`, but the actual Sketch route executes as inferred `edit`                    | `sketch/supported`                          | **degraded** as an editor workflow, **unavailable as an identity-preserving canonical adapter**; current declaration overstates operation identity and writeback                                           |
| `composite`                       | Canvas `createComposite` atomically creates project nodes/connections; Sketch/Webview can merge/alpha-compose layers. Neither is a registered pixel Image operation executor                                          | Canvas headless authoring returns exact `nkc:<digest>`, but for a Canvas graph mutation, not an Image output; Sketch path is UI-bound                  | Deterministic implementation fragments exist. Generic Provider validation rejects `composite`                                                          | `sketch/supported`, `canvas/supported`      | **unavailable canonically**. Both supported rows are false positives caused by conflating project/node or UI layer composition with canonical pixel composition                                            |
| `split` / `grid-crop`             | Engine preview variant code can resize and render FOV crops, but no split Tool/adapter maps a source image to ordered panel refs                                                                                      | None through the canonical contract                                                                                                                    | Deterministic; generic Provider validation rejects it                                                                                                  | `engine/unsupported`, no supported profiles | **unavailable**, with reusable crop/resize fragments; current declaration is accurate                                                                                                                      |
| `split` / `comic-panel`           | No panel-detection/reading-order entry or executor is registered                                                                                                                                                      | None                                                                                                                                                   | Perception plus deterministic crop; generic Provider validation rejects it                                                                             | `engine/unsupported`, no supported profiles | **unavailable**; current declaration is accurate                                                                                                                                                           |
| `split` / `semantic-segmentation` | Sketch smart selection asks a generative image Provider for a black/white image and writes an active selection preview; no structured segmentation adapter exists                                                     | Active-editor selection preview only; no exact revision or structured region refs                                                                      | The current path is generative approximation, not an audited perception executor; generic Provider validation would reject `split`                     | `engine/unsupported`, no supported profiles | **unavailable canonically**. Smart selection may be advertised separately as degraded editor assistance, not semantic split support                                                                        |
| `background-remove`               | Cut Webview action -> Extension command -> `neko.agent.generateForNode` with a prompt; the returned data URL is posted back to Webview, and `sendResult` discards the payload                                         | No stable output ref or Cut project revision                                                                                                           | Generative prompt approximation, not deterministic/perception matting; it does not pass canonical Provider validation                                  | `cut/degraded`                              | **degraded editor action**, **unavailable for production planning** until a canonical matting adapter returns alpha output and stable refs; current degraded diagnostic is directionally accurate          |
| `background-replace`              | No Tool/capability entry or final executor                                                                                                                                                                            | None                                                                                                                                                   | No deterministic or hybrid composition; generic Provider validation rejects it                                                                         | `media/unsupported`                         | **unavailable**; declaration is accurate                                                                                                                                                                   |
| `prepare-shot-reference`          | Canvas has exact-revision node/composite authoring and a revision-bound generated-image candidate/apply adapter, but no Tool registers this canonical Image operation or a composed crop/normalize/reference executor | Canvas authoring can return exact `.nkc` revision for its own mutations; no operation result revision exists                                           | Intended hybrid operation; generic Provider validation rejects it                                                                                      | `canvas/supported`                          | **unavailable canonically**. The supported row is a false positive; later registration should compose declared deterministic/generative steps and bind the resulting stable reference to the shot revision |

### Cross-cutting false-positive and contract gaps

1. No production `ImageOperationCapabilityRegistry` exists, so none of the
   matrix rows currently prove dispatchable support.
2. Generic Provider validation is operation allowlisting, not Provider-specific
   capability validation. It accepts `edit`, `inpaint`, and `style-transfer` for
   every Provider type without proving reference, mask, preservation, or model
   support.
3. `validateOperationRequiredInputs` only enforces Image inputs for `outpaint`
   and the `split` profile. It does not require source/mask/reference inputs for
   `edit`, `inpaint`, `upscale`, `colorize`, `style-transfer`, `composite`,
   background operations, or shot-reference preparation.
4. Sketch generation tools are active-editor workflows and often return only a
   task id/preview message. They cannot be projected as headless project support
   until they accept an explicit project target and return its exact written
   revision.
5. Engine resize/FOV crop, ONNX upscale, Sketch layer/mask operations, and Canvas
   transactional authoring are reusable executors or writeback ports. Task 6.7
   should register thin canonical adapters over those owners rather than copying
   their logic into Agent or treating the static audit matrix as runtime truth.
6. OCR, panel detection/reading order, semantic segmentation, depth, and pose do
   not currently have canonical Image operation adapters. Their mere presence as
   model/preprocess terminology or scene render modes is not perception support.

Task 6.7 must therefore correct support at the real registration source and add
parity tests that prove Tool/capability entry -> canonical negotiation -> final
executor -> stable result/writeback revision. Unsupported routes must remain
fail-visible instead of falling back to generic generation.

## 12. Character Dependency and Target Completion Contract Audit

### Reusable owning facts

| Concern                             | Current owning contract/path                                                                                                   | What the Agent can safely observe                                                                                                     | Gap / disposition                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity identity and bindings        | `CreativeEntity`, `CreativeEntityRef`, `EntityAssetBinding`, facade readers/writers, and change events                         | Canonical entity id/kind, binding role/status/availability, representation resolution, aggregate store `generation` and freshness     | Entity, binding, visual draft, and requirement records have no content digest or exact per-record revision. Aggregate generation detects “something changed” but cannot bind a shot to an approved appearance/costume/color revision. This is an owning Entity/Character schema gap, not Agent state |
| Character visual production         | `VisualIdentityDraft`, generated asset ids, `EntityAssetRequirement`, and generated-media character lineage                    | Candidate/generated resources and missing representation requirements                                                                 | No approved Character/Style/Color Bible artifact, approval revision, or dependency impact projection identifies affected shots/evidence. Task 6.10 must adapt an owning projection if one appears; otherwise task 7.8 must create the follow-up animation-production OpenSpec                        |
| Asset identity                      | Versioned market refs, optional dependency `contentHash`, `ResourceRef` fingerprint, and `GeneratedAssetRevisionRef`           | Stable asset/resource identity, generated asset revision/digest, Provider/model/task/source lineage                                   | General `assetRef` strings and resolved bindings do not consistently carry content revision. Prefer `ResourceRef`/content hash/generated lifecycle; unresolved or unversioned bindings cannot authorize continuity-sensitive production                                                              |
| Generated asset promotion           | `GeneratedAssetRevisionRef`, `GeneratedAssetPromotionRecord`, and evidence-transfer helper                                     | Exact content revision/digest, source refs, generation operation/provider/model, and whether evidence remains current after promotion | Sufficient for generated output lineage. It is not a character approval model and must not be promoted into one by Agent                                                                                                                                                                             |
| Storyboard artifact                 | Canonical `StoryboardRevisionIdentity`, source trace, revision-bound Canvas/Cut projection handoff                             | Exact storyboard revision, digest, parent/source revision, scenes/shots, and handoff target                                           | Strong artifact-level revision exists. There is no independent accepted-shot revision/status set, so final target completion cannot yet prove an exact accepted revision for every required shot                                                                                                     |
| Shot character and media references | `StoryboardShotCharacter`, `StoryboardMediaRef`, `ShotReferenceBundle`, `CharacterReferenceRef`, and Canvas generation lineage | Entity ids, stable media refs when present, character/reference roles, source/previous-shot/style refs, and generation lineage        | Character refs do not include owning appearance/costume/color revision. `StoryboardMediaRef` may still be a tool result, path, or unversioned asset locator. Validation/classification must reject runtime-only/unresolved refs for durable completion                                               |
| Storyboard-to-Cut handoff           | Storyboard revision projection, Canvas draft source revision validation, and imported media lineage                            | The source revision used for the handoff and stale-source diagnostics                                                                 | Useful for rejecting stale drafts, but it does not by itself prove accepted-shot completeness or downstream Cut/audio/subtitle currency                                                                                                                                                              |
| Project authoring revision          | Shared `QualityProjectRef`; Canvas and Cut authoring return content-digest revisions (`nkc:<digest>`, `nkv:<digest>`)          | Exact document URI, domain, project revision, and content digest after mutation                                                       | Reusable canonical source for subsequent observation. Other owning authoring domains must reach parity before their revisions can satisfy target requirements                                                                                                                                        |
| Project asset dependencies          | `ProjectAssetDependencyManifest` and Assets manifest service                                                                   | Imported/market/workspace dependency identity, optional version/hash, storage mode, files/bundle entries                              | Manifest has `generatedAt` but no manifest digest/revision and no reverse dependency from a character/reference revision to affected shots/projects. It is useful input evidence, not a complete staleness graph                                                                                     |
| Quality staleness and gates         | `QualityTarget`, `QualityEvidence`, `qualityTargetsMatch`, `QualityGateResult`, and generated-asset evidence transfer          | Current/stale evidence bound to resource or project revision/digest; missing evaluator classes; gate verdict and repair plan          | Sufficient generic stale-state machinery. Staleness only works when owning targets/dependencies supply exact revisions; a gate cannot infer missing character or shot dependency edges                                                                                                               |
| Project validation and preflight    | `ProjectQualityFacade`, `collectProjectQualityEvidence`, and Cut `checkExportReadiness`                                        | Revision-bound structural/runtime/policy evidence and readiness diagnostics                                                           | Current Cut readiness is partial: container/codec/bitrate/output remain adapter settings, and absence of a target-bound export adapter yields `ready: false`. There is no durable preflight id/digest binding all export settings and evidence to the current project revision                       |
| Export lineage                      | Cut `ExportService` and Engine export job                                                                                      | Job id, terminal state, output path, frame count, and elapsed time                                                                    | Export request/result does not carry `QualityProjectRef`, preflight identity, input ResourceRefs, output content digest/ResourceRef, or `exported-from` lineage. A path-only success cannot prove a deliverable                                                                                      |
| Deliverable verification            | `QualityTarget.kind = exported-deliverable` and generic Quality evidence/gate contracts                                        | A deliverable can be modeled and evaluated once it has a stable ResourceRef/revision and registered evaluator                         | No canonical export-promotion result creates that target, no target profile declares required technical/perception/policy evaluators, and no verifier binds the exported bytes to project/preflight lineage. Final animation/TV/film completion is therefore currently partial/blocked               |

### Target completion can be projected, but not invented

The Agent does not need a durable cross-domain workflow or project model. A
transient completion projection can reference current owning facts:

1. target profile requirement ids and allowed skip conditions;
2. current Artifact/ResourceRef/`QualityProjectRef` identities and exact
   revisions;
3. character/reference dependency projections supplied by their owner;
4. current approvals, QualityEvidence/Gates, preflight and export/deliverable
   evidence;
5. structured missing-capability, stale, invalid, or partial-deliverable
   diagnostics.

The projection must be recomputed from those sources each turn. It must not copy
character records, timeline state, accepted shots, checklist completion, export
jobs, or quality verdicts into Agent-owned durable state.

### Confirmed blockers by target

- **Canonical Storyboard:** can be revision-proven today when the canonical
  validator succeeds; character-production completeness remains separately
  diagnosable.
- **Animatic/pilot:** can only be partial until the target profile defines its
  accepted-shot, timeline/audio/subtitle, and quality requirements and every
  owning domain returns current revisions.
- **Final animation/TV/film deliverable:** blocked from a truthful `complete`
  result by the missing approved character/style/color revision dependency,
  accepted-shot revision set, durable target-bound preflight, export lineage,
  and post-export verification profile.

These are animation-production domain gaps. Tasks 2.6 and 7.7 may define the
small Agent-readable requirement/result projection, while tasks 6.10, 7.6, and
7.8 must depend on or propose owning contracts. They must not simulate the
missing facts in Agent runtime.

## 13. Plan Mode, Markdown Approval, Apply, and Replan Audit

### Current online path

1. Webview/Host sends `setPromptMode` or toggles the conversation mode.
   `ConversationPromptModeRuntime` stores `default|plan` in an in-memory map
   keyed by conversation id and projects the state back to the UI.
2. Turn assembly maps Plan Mode to permission `executionMode: plan`; the
   permission matcher allows declared read-only tools plus `Write`/`Edit` only
   when the path ends in `.neko/plan.md`.
3. Document and visual analysis are possible through `ReadDocument` followed by
   stable-ref `ReadImage`, along with the other read-only context/search tools.
   There is no separate document-analysis workflow runtime.
4. `ExitPlanMode` result data is parsed into a UI `Plan`: Markdown `##`/`###`
   headings become review steps and the source file path is copied to the
   content block.
5. Approve/reject/modify messages update the Plan block stored in conversation
   messages. Approval optionally reads the supplied file path and starts a new
   normal Agent turn with `executionMode: auto` and the text “execute the
   following plan”.
6. The new Agent turn still emits ordinary Tool calls through the existing
   permission/capability path. No production code was found that iterates parsed
   UI `Plan.steps` and dispatches them directly.

### Visible artifact paths and competing plan shapes

| Surface         | Durable shape                                                         | Current role                                                   | Audit finding                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan Mode file  | `.neko/plan.md`                                                       | Special write exception and source for `ExitPlanMode` approval | Hidden/internal path and only one file; it is not the accepted creator-visible `neko/creations/<creation-id>/plan.md` layout                                                |
| `brief.md`      | serialized `Draft` under `neko/creations/<creation-id>/`              | Human-readable source interpretation/creative draft            | ArtifactService supports round-trip persistence and restore, but Plan Mode itself has no allowed write path or approval binding for it                                      |
| `plan.md`       | serialized `ExecutionPlan` under the same creation directory          | IDC Plan artifact                                              | Captures ordered canonical Tool names and free-form argument blobs. This is planning-time executor/parameter capture and conflicts with the new Markdown-as-intent boundary |
| `checklist.md`  | serialized `Task` snapshot                                            | User-visible progress projection                               | Round-trips status checkboxes, but nothing proves a checked item from Markdown corresponds to a current owning artifact/revision                                            |
| UI `Plan` block | parsed headings, review/execution status, optional absolute file path | Inline user review                                             | Separate from `ExecutionPlan`; step modifications update only conversation data and are not written back to the source file                                                 |

The workspace ArtifactService is a valid persistence owner for visible Markdown,
but the payloads need convergence. `plan.md` must remain user-reviewable intent,
Artifact requirements, capability intents, risk/approval/completion conditions,
and constraints. It must not persist Tool schema, executor identity, executable
arguments, task handles, stage transitions, or recovery state. `checklist.md`
remains a projection and never becomes completion authority.

### Approval and Apply correctness gaps

1. **No approved content identity.** `Plan` has `id`, title, steps, status, and
   optional path, but no digest/revision. Approval is stored as a status on the
   conversation block without the reviewed bytes, critical Artifact revisions,
   or capability catalog revision.
2. **TOCTOU file approval.** Approval status is persisted before the optional
   plan file is read. The runtime then reads whatever bytes currently occupy the
   supplied path, so an edited/stale/different file can run under the earlier UI
   approval. The file path is accepted from the Webview message and is not bound
   to the projected Plan content.
3. **Generic approval fallback.** When no file path is present, approval starts
   an auto-mode turn with only “proceed with the implementation”; chat history
   becomes the implicit plan source.
4. **No Apply preflight contract.** The dispatch carries only conversation id,
   message text, `executionMode: auto`, and `{planReview: approved}`. It does not
   require current plan digest, input Artifact revisions, selected capability
   identity, current Tool schema, Provider/model support, permission/approval
   scope, cost/risk, or target requirements to be re-resolved before a Tool call.
5. **Step-review divergence.** Approving, rejecting, or modifying an individual
   UI step updates the conversation block only. Whole-plan approval can still
   read the unchanged file and does not verify rejected/modified step state.
6. **Approval is broader than the reviewed change.** Switching the follow-up
   turn to `auto` is not a bounded `CapabilityIntent`; a material technique,
   Provider, cost, or deliverable-path change has no mandatory renewed approval.

This is not literal Markdown-to-Tool direct dispatch today, but it is still an
unsafe textual authorization bridge: the approved Markdown is injected as an
execution instruction without an Apply-time identity and premise check.

### Hidden state and replan gaps

- Conversation prompt mode is in-memory and not a durable approved-plan fact;
  process/session recreation can lose it.
- Plan review decisions live in conversation messages, while visible creation
  documents and ArtifactService's runtime maps/index are separate projections.
  There is no canonical binding among them.
- Artifact frontmatter timestamps and status are not content digests and cannot
  reject stale approvals.
- Plan rejection only posts status/feedback text. Step rejection/modification
  only changes the UI projection. Neither creates a revision-bound replan
  request, invalidates a previous approval, nor guarantees the Agent re-reads
  current documents/capabilities.
- `ExecutionPlan` comments describe its Tool/args list as something a runner can
  read to execute, although no current production dispatcher was found. This is
  a dormant executable-plan contract that must be replaced/poisoned before it is
  connected to Apply.

### Required canonical correction

Plan Mode should keep its current read-only Tool gate and document-analysis
path, but converge persistence and approval as follows:

1. persist creator-visible `brief.md`, `plan.md`, and `checklist.md` through the
   existing ArtifactService, with a digest/revision for each reviewed snapshot;
2. keep `plan.md` declarative and derive only transient `CapabilityIntent`
   selections from it;
3. bind approval to plan digest, critical input revisions, target and bounded
   risk/cost/technique scope;
4. at Apply, re-read the current Markdown and owning artifacts, then re-resolve
   current capability registration, Tool schema, Provider/model support,
   permission and target requirements;
5. reject stale/materially changed premises, or request renewed approval;
6. on recovery, replan from current structured diagnostics and revisions rather
   than mutating hidden transitions or treating checklist text as runtime state.

Tasks 3.5, 4.2-4.6, 5.4-5.6, and 8.12 must prove this path. The current
`ExecutionPlan` Tool/args schema and `.neko/plan.md` compatibility path require
explicit migration/poison handling; they must not remain a second successful
execution authority.

## 14. Superseded Budget and Observation Scaffolds

The first implementation pass added a separate planning prompt renderer with its
own character-based token estimate and fixed capability/domain caps. It also
added a broad creative observation DTO and a session assembler that recursively
scanned historical Tool payloads, copied Quality/Task/Approval projections, and
threaded the snapshot through Extension turn context back into the same
`AgentSession`.

The architecture review rejected those scaffolds before continuing task 4.4:

- the existing PromptComposer must remain the only prompt-budget owner;
- multiple distinctly owned capabilities for one purpose are legitimate Agent
  strategy candidates, not an ambiguity that makes every candidate unavailable;
- history, Journal, Markdown, timestamps, and old Tool results may provide stable
  identities for a new query, but cannot prove the current owning revision;
- `beforeAct` prompt recomputation does not form a revision Gate after the model
  has already emitted a Tool call;
- unscoped Approval history cannot authorize a current plan/revision/intent; and
- target completion remains an owning profile/validator/Quality/Export concern,
  not a central Agent evaluator.

The unused prompt renderer, target-completion evaluator, broad observation
contract/assembler/guidance, cross-layer snapshot plumbing, and Approval decision
history projection were removed. Tasks 2.1, 2.3, 2.5, 2.6, 3.1-3.3, 3.5-3.6,
and 4.1-4.3 were reopened. The retained planning discovery scaffold now preserves
multiple valid candidates and fails only duplicate canonical identity ownership.

The owner-authored planning metadata was also narrowed to stable semantics:
domain, purpose, mutation scope, execution kind, preservation, quality profile
ids, and recoverable failure kinds. Static model/network requirements, Provider
support, limits, cost, free-form diagnostics, Provider-purpose allowlists, fixed
domain/capability caps, and the second prompt-budget estimator were removed.
Current support and constraints must later be joined from the real operation
resolver at query time. With the narrowed contract and collision path tests,
tasks 2.1 and 3.5 are complete again; the real resolver and Agent-callable path
remain pending.

The replacement must be proven by a real vertical path: the Agent invokes a
read-only discovery/query entry, stable identities are re-read through owning
facades, a selected normal Tool call carries the applicable current/base
revision, and the owning runtime rejects stale execution before mutation. No
generic history fact harvester, revision observation store, or second context
budget may be reintroduced.

## 15. Model-Bound Support, Request Evidence, and Quality Ownership Audit

### Intent, support, and completion are only partially separated today

| Concern                             | Current canonical source/path                                                                                                                                                                                           | Current usable evidence                                                                                                                                                                                             | Confirmed gap and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model-independent generation intent | `GenerationIntent` in `provider-card.ts`; `ShotImagePrepPlan`; `ReferenceDescriptor`; Tool arguments and current user/Markdown content                                                                                  | Subject, composition, style family/details, mood, quality, required/avoided content, output dimensions, source identity, and several generic reference roles can survive Provider selection                         | `GenerationIntent` is not a complete creative-intent contract: exact protected strings, target content/instruction language, character invariants, acceptance checks, and fine-grained identity/costume/prop/composition/structure/first-frame/last-frame roles are not represented consistently. Keep these semantics in current user/domain documents and owning reference contracts; do not add an Agent-owned Prompt or intent store                                                                                                                             |
| Reference roles                     | `reference-resolution.ts` owns validated descriptors, lineage, provider-input materialization, and roles such as `source`, `subject`, `character-reference`, `style`, `mask`, `layout`, `previous-shot`, and `keyframe` | Stable reference identity, modality, source, confidence, provider/model/task lineage, and provider-input materialization can be observed before dispatch                                                            | The capability-neutral vocabulary does not distinguish all required production roles (`identity`, `appearance`, `costume`, `prop`, `composition`, `structure-only`, `first-frame`, `last-frame`, `product-preservation`), and `ReferenceProviderInput` drops the semantic role. Media Tool requests use URL/base64/IP-adapter fields without binding authorized role descriptors to the request/result. Task 6.13 must extend the owning reference/adapter mapping minimally and reject unmapped roles before dispatch                                               |
| Effective chat configuration        | `resolveEffectiveAgentWorkspaceConfigSnapshot()` plus `selectAgentTurnProvider()` and Agent-turn debug facts                                                                                                            | Requested/effective chat provider/model, configured model capabilities, scalar settings, and selection sources are fail-visible for a turn                                                                          | The snapshot has no stable configuration digest or explicit model version. This is sufficient for current chat execution but not for proving a previously approved media-support premise remains current                                                                                                                                                                                                                                                                                                                                                             |
| Effective media configuration       | `AgentMediaModelSelections`, TUI `media-model-metadata.ts`, Tool execution metadata, and `resolveToolMediaTarget()`                                                                                                     | Each media category can carry explicit provider/model and optional Provider expression profile; Tool request assembly rejects a partially specified or missing target                                               | Default media config is initially stored as a string and projected to provider/model at turn assembly. No model version, operation-support profile revision, or effective-config digest reaches the media request. `providerExpressionProfileId` affects expression context but is not a support profile and is not retained in generated lineage                                                                                                                                                                                                                    |
| Current operation support           | `ModelConfig.capabilities`, owning Tool schema/validators, `CreativeMediaOperationCapabilityRegistry`, and `media-operation-capabilities.ts`                                                                            | Canonical operation/control validation can reject several unsupported Video controls before dispatch, and the registry requires a real executor for non-unsupported adapters                                        | Current production media validation is not model/version/profile bound. `providerVideoProfile()` is a hand-written ProviderType table, including broad `openai/generic/newapi/xai/kling` support for every non-post Video operation/control. `validateProviderImageRequest()` accepts `generate/edit/inpaint/style-transfer` for every ProviderType without proving the selected model accepts references, masks, preservation, multi-view, language, or exact text. Support must move to current owning adapter/model contribution; Agent must not copy this matrix |
| Actual request evidence             | `MediaTask.request`; `providerAdaptation` metadata; Tool request assembly                                                                                                                                               | The task retains the provider Prompt, negative Prompt, operation inputs, requested provider/model, actual task provider/model, source Markdown hash when used, and selected understanding models                    | There is no canonical request digest, instruction language, target content language, protected-string set, authorized reference-role binding, model version, or support-profile identity. The provider-adaptation metadata is an untyped nested record and must not become a Prompt Manager. Task 6.12/6.15 should add only the minimum typed evidence to the owning invocation/result contract                                                                                                                                                                      |
| Terminal result and durable lineage | `MediaTask`, `finalizeCompletedMediaTaskOutputs()`, `GeneratedAssetRevisionRef`, and generated-asset index                                                                                                              | After successful local materialization, outputs receive a content digest, stable `ResourceRef`, exact generated revision, task/operation/provider/model lineage, and can be bound to revision-aware Quality targets | `buildGeneratedMediaAssets()` does not currently populate generation `sourceRefs`; it also omits request digest, reference roles, model version/profile, and effective support identity. `BaseGeneratedAsset.model` is only one ambiguous string. A completed Provider task or output URL is therefore weaker than a locally materialized generated revision                                                                                                                                                                                                         |
| Output finalization failure         | `finalizeCompletedMediaTaskOutputs()`                                                                                                                                                                                   | Remote output URLs remain displayable when no local output directory is configured                                                                                                                                  | Save, digest, or asset-index failures are caught and silently returned as a remote-only completed result with no generated asset. This is a historical-result-style fallback at the completion boundary: downstream code can observe terminal success without durable evidence. Canonical creative completion must be partial/degraded or failed until a stable generated result exists; preservation of a remote URL may remain recovery evidence but not completion proof                                                                                          |
| Quality ownership                   | `media-quality.ts`, `QualityGateRuntime`, and Extension `QualityCapabilityProvider`                                                                                                                                     | `QualityTarget`, evaluator identity/version/provider/model, evidence, stale detection, Gate policy/result, and repair plan are revision/digest aware. Generated revisions can produce exact Quality targets         | Quality remains correctly owned outside Agent, but generated media completion does not automatically collect or bind the required QualityEvidence. Evaluator identity also lacks model version/profile. Agent must call current owning review and must not infer quality from the Prompt, Provider task status, gallery examples, or historical success                                                                                                                                                                                                              |

### Static, marketing-derived, and historical routing findings

1. `AUDITED_IMAGE_CAPABILITY_MATRIX` is a static descriptive matrix and contains
   the false-positive rows recorded in section 11. It is not registered executor
   truth and must not be reused as an Agent support catalog.
2. `providerVideoProfile()` is a static ProviderType support table rather than a
   current Provider/model/version/profile contribution. In particular, gateway
   types such as `generic` and `newapi` cannot safely imply one model capability.
3. Generic, OpenAI, Anthropic, and Google model-list adapters infer vision,
   function calling, image generation, audio/video understanding, or even default
   chat support from model-id substrings. These values are useful discovery hints
   only; they are model-name/marketing-derived and cannot authorize a creative
   operation without current declared support and dispatch validation.
4. `ProviderRouter` ranks ProviderCards by static `trainingProfile.styleAffinities`
   and can further adjust selection using project `providerSuccessRate` or
   `targetSuccessRate`. It also returns an automatic fallback chain unless
   disabled. Those hints may inform Agent comparison, but historical success and
   expression affinity cannot upgrade current support or skip current
   operation/reference validation.
5. `MediaRoutingManager.selectFallback()` can choose another configured target
   when `allowFallback` is true. Fallback is legitimate only after the alternate
   effective provider/model is re-resolved and the unchanged creative intent,
   operation controls, reference roles, policy, and approval scope all validate;
   otherwise it is a material replan rather than transparent recovery.
6. No production path was found that promotes gallery samples or community Prompt
   examples directly to support. The real risks are instead static tables,
   model-name inference, ProviderCard affinity, historical success scoring, and
   remote-only terminal results being treated as stronger evidence than they are.

### Task 1.9 conclusion

The repository already has the correct owners for user/domain intent, effective
session selection, media tasks, generated revisions, references, and Quality, so
it does not need a global model capability matrix, Prompt Manager, or Agent-owned
result store. The missing canonical joins are bounded but material:

- current support must resolve against the effective
  Provider/model/version/profile at dispatch time rather than ProviderType or
  model-name heuristics;
- reference roles and protected language/text constraints must survive adapter
  mapping and result lineage;
- actual request evidence needs a digest or equivalent typed binding to the
  executed target and references;
- terminal completion must require a stable generated output revision plus the
  applicable current Quality evidence, not merely a completed task, URL, Prompt,
  ProviderCard score, or historical success.

These gaps belong to tasks 6.11-6.15 and 7.9 in the owning media/reference/Quality
contracts. Capability-selection Evaluation must poison static/historical support,
model/profile reuse, transparent fallback, and remote-only completion while
proving the ordinary Tool/task/generated-asset path remains sufficient.

## 16. Planning Projection Removal Decision and Focused Agent Evidence

### Evaluation authoring decision

- **Behavior:** capability-aware selection of one low-risk production action from
  an actual screenplay, followed by real result observation.
- **Disposition:** `update` the owning `skill.media-production` suite with
  `capability-context-character-reference`.
- **Canonical path:** builtin `media-production` Skill -> current `GetContext` ->
  optional supplemental Skill activation -> ordinary `GenerateImage` Tool ->
  `image_generation` Task -> task-result observation -> durable generated
  artifact -> image observation and acceptance/repair judgment.
- **Forbidden fallback:** planning-projection handshake, parallel creative
  catalog, text-only completion, generic Video substitution, mock task, IDC, or
  legacy Workflow runtime.
- **Why real Evaluation is required:** the decision removes Agent-visible
  capability-routing types and can only be accepted if the real TUI Agent still
  selects and completes the canonical Tool/task/artifact path.

### Runs and interpretation

| Run                                                      | Implementation state                                        | Result                                          | Evidence                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability-context-before-scaffold-removal-20260715`    | Scaffold present but unconnected                            | Evaluation-input failure before Agent execution | `@screenplay.fountain。先检查...` was parsed as one invalid file reference; zero Tool calls. This is retained as Evaluation infrastructure/input failure, not target behavior evidence                                                                                                                   |
| `capability-context-before-scaffold-removal-r2-20260715` | Scaffold present but unconnected                            | **pass**                                        | `GetContext` -> `GenerateImage` -> completed `image_generation` -> valid generated artifact; no Video, planning projection, IDC, or legacy Workflow participation                                                                                                                                        |
| `capability-context-after-scaffold-removal-20260715`     | Scaffold types, runtime methods, exports, and tests removed | **pass**                                        | Same hard Gates passed with effective chat model `nekoapi-chat/gpt-5.6-luna`, effective image model `nekoapi-media/gpt-image-2`, configuration digest `sha256:6aac69e46af98988734484e219796be193414cbec15eb12baddfe42a6aec7a23`, one completed/observed image Task, and generated artifact `res_1snxo5d` |

The post-removal run used seven Tool calls, of which two failed visibly and were
recovered through the ordinary Agent loop:

1. generic `Read` rejected the isolated fixture because its physical root was a
   system temporary directory; the Agent used the workspace document path rather
   than bypassing the path policy;
2. the first generated-image observation passed an incorrectly shaped
   `resourceRef` to `ReadImage`; the Tool rejected it, and the Agent retried from
   the stable returned reference instead of using a cache path, task id, or URL.

The actual output review found that the image preserved Mara, the red umbrella,
rainy station, and unlit train, but the depicted clock was not `23:47`. The Agent
classified the result as partially acceptable and proposed a bounded repair
instead of claiming that Task completion proved the reference final. This is
useful real-result behavior evidence, but no external Judge was run.

### Scaffold disposition

The experiment had no production consumer outside its own public exports and
tests. The focused real path succeeded both while it was unconnected and after it
was deleted, and no context omission or wrong production-technique selection was
observed for the covered action. Therefore:

- task 2.3 removes `capability-planning.ts`, its projection/validator/tests, the
  planning fields added to `AgentArtifactExecutionCapabilityContribution`, and
  the planning index/discovery/selected-injection methods;
- task 2.4 is complete as **not adopted**: no evidence justifies a reduced derived
  view, and adding one would create a second Agent-readable catalog without a
  demonstrated need;
- task 3.1 remains open because one action does not cover multi-technique
  animation selection, and the Evaluation facts still report zero input/output
  tokens, so token/context cost cannot yet be measured;
- the two recovered Tool-schema/path errors belong to current file/resource
  grounding and Tool guidance, not to a missing planning catalog. They should be
  addressed through canonical `Read`/`ReadImage` context and later continuation
  cases rather than restoring the scaffold.

Focused deterministic validation after removal passed 25/25 tests in
`agent-capability-injection-runtime.test.ts` and
`agent-execution-context.test.ts`. Full `agent-types` and `agent` TypeScript
checks remain blocked by unrelated existing test-contract drift, including old
`AgentContextPayload`, retired `stageTracking`/`stagePersona`, missing authoring
`projectRef`, and other pre-existing fixture errors; no remaining planning
scaffold import or symbol error was reported.

## 17. Canonical Tool Semantic Correction Baseline

Task 2.5 corrects the existing Tool contribution path rather than adding a
creative catalog:

- shared `createTool()` and `buildTool()` now preserve the existing
  `ToolRuntimeRequirements` contract instead of silently dropping it;
- `GenerateImage`, `TransformImage`, `GenerateVideo`, `GenerateMusic`, and
  `GenerateTTS` declare the existing `mediaService` requirement, and
  source/reference-bound transforms also declare `contentAccess`;
- those Tools use existing `Tool.safetyKind` and `Tool.traits` to expose
  non-destructive generated-draft mutation, network locality, reversibility,
  impact, and cost without inventing a planning DTO;
- Image and Video descriptions now distinguish generative execution from
  deterministic editing and from Puppet/frame/layered/scene/compositing
  alternatives; they require current Provider/model/reference/control validation
  before dispatch;
- Tool text states that queued Task ids are not results, generated media is a
  draft rather than project/asset/timeline/deliverable completion, and actual
  media plus applicable Quality evidence must be observed before acceptance;
- the core Chinese Tool-definition fallback was aligned with the same
  provider/model argument names and draft/completion boundary.

The executable schema remains the current Tool schema, Task dispatch remains the
normal media service, and results remain ordinary queued Task projections followed
by the existing task-result/generated-asset path. No selected-schema resolver,
capability-purpose allowlist, or Tool result wrapper was added.

Focused validation passed:

- `packages/neko-types`: `base.test.ts` 16/16;
- `packages/neko-agent/packages/platform`: `media-agent-tools.test.ts` 24/24.

Later tasks 6.1-6.15 still own per-domain operation support, reference roles,
Provider/model/version/profile limits, request evidence, and exact result lineage.
Task 2.5 establishes the canonical Tool semantic path they must extend.

## 18. Canonical Context Architecture Poison Guards

Tasks 2.6 and 2.7 add fail-visible architecture guards around the accepted
ordinary Agent ReAct path. The guards reject production introductions of:

- a parallel creative Tool/capability catalog, Provider-purpose allowlist,
  planning runtime, required planning-projection handshake, or restoration of
  the removed planning-projection files;
- a global creative model capability matrix, model-marketing or model-name
  support promotion, historical/example-based support promotion, a creative
  Prompt execution manager/catalog, or Prompt-example retrieval as an ordinary
  execution prerequisite.

The guards intentionally do not ban the repository's general Prompt composition
and management facilities. They target only new creative execution authorities
that would duplicate Tool registration, current Provider/model contribution, or
the ordinary Tool lifecycle. Multiple legitimate owning technique candidates
remain available for Agent comparison.

Focused validation passed:

- `packages/neko-agent/packages/agent`:
  `architecture-boundary-guards.test.ts` 53/53.

## 19. Canonical Context Selection Evaluation

### Evaluation authoring decision

- **Behavior:** select or block an illustration-to-animation technique after
  reading an actual layered source and current Tool/Skill context, without
  defaulting to generative video.
- **Disposition:** `update` the owning `skill.media-production` suite with the
  public regression case `illustration-technique-selection`.
- **Canonical path:** builtin `media-production` Skill -> current `Read` source
  evidence -> current `GetContext` -> Agent technique comparison ->
  capability-aware selected/degraded/unavailable conclusion.
- **Forbidden fallback:** automatic `GenerateImage`/`GenerateVideo`, invented
  Puppet/frame/3D/layered authoring support, planning projection, parallel
  creative catalog, IDC, or legacy Workflow runtime.
- **Fixture:** a licensed synthetic layered SVG with independent Mara, red
  umbrella, unlit train, clock, rain, and background groups.

### Observability and Evaluation infrastructure correction

The TUI already maintains a live context-token estimate independently from
Provider-reported usage. Debug facts and Evaluation result usage now expose that
estimate as optional `contextTokens`; this is a neutral runtime fact, not an
Evaluation-only product switch. Provider input/output token fields remain the
actual Provider-reported values and are not replaced by the estimate.

The first real run also proved that Evaluation's default `os.tmpdir()` fixture
workspace contradicted the product path policy: both absolute and relative
`Read` resolved into a denied system-temporary path. The external runner now
creates isolated, auto-cleaned workspaces under gitignored
`reports/agent-eval/.workspaces/`. Product `Read` policy was not relaxed and the
Agent received no Evaluation-specific file permission.

### Runs and measurements

| Run                                            | Result                                       | Selection/path evidence                                                                                                                                                                | Tool/schema and context evidence                                                                                              |
| ---------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `illustration-technique-selection-20260715`    | case fail                                    | Six-technique comparison and no generation call, but source read did not complete                                                                                                      | `GetContext` success; `ReadDocument` rejected SVG and two `Read` calls were denied by the Evaluation temp path; context 4,863 |
| `illustration-technique-selection-r2-20260715` | case fail on an over-literal output field    | Correctly preferred layered 2D and blocked unsupported authoring; no generation call                                                                                                   | `Read`/`GetContext` 2/2 success, zero Tool errors; context 5,281                                                              |
| `illustration-technique-selection-r3-20260715` | case fail on an over-literal Chinese heading | Same correct strategy and current-support boundary                                                                                                                                     | `Read`/`GetContext` 2/2 success, zero Tool errors; context 5,324                                                              |
| `illustration-technique-selection-r4-20260715` | provider/model execution failure             | No Agent behavior evidence: model returned two empty completions                                                                                                                       | Zero Tool calls; context 2,218; retained separately from target behavior                                                      |
| `illustration-technique-selection-r5-20260715` | case fail on a forced `blocked` literal      | Correct technique decision and no generation, with one recoverable SVG/document-reader mismatch                                                                                        | `GetContext` and `Read` succeeded; `ReadDocument` rejected SVG; context 5,368                                                 |
| `illustration-technique-selection-r6-20260715` | **pass**                                     | `Read` -> `GetContext` -> six-technique comparison -> layered 2D selected as degraded with a concrete missing SVG-layer authoring capability; no Image/Video generation or legacy path | 2/2 Tool calls succeeded, zero Tool failures, context 5,233                                                                   |

Task 3.1 measurements therefore show:

- **capability omission:** no currently callable Puppet, frame-authoring, 3D
  scene/camera, or SVG-layer authoring capability was found; the Agent surfaced
  the missing owning capability instead of inventing it;
- **wrong-technique selection:** none in the passing sample; layered 2D was
  preferred for low-motion shape preservation and generative video was rejected
  as the default;
- **schema confusion:** the original path failures belonged to Evaluation
  workspace placement and were fixed externally; an SVG-to-document-reader
  mismatch appeared in one sample and was recovered by canonical `Read`;
- **token/context cost:** the passing turn ended at 5,233 estimated context
  tokens. The selected Provider reported no input/output usage and no cost, so
  those values remain explicitly unavailable rather than being inferred.

The case also exposed the next task 3.2 gap: `GetContext.toolCategories` reports
global registered category counts while `GetContext.tools` reports current
callable tools. This distinction is only explained in notes and can cause a
model to describe a category as executable before checking the callable list.

## 20. GetContext Scope Correction and Canonical Execution Proof

Task 3.2 corrects the existing `GetContext` result instead of adding a creative
domain index or selected-schema protocol:

- `toolCategories` remains a view of the existing Tool-group registry, but each
  row now reports `registeredToolCount`, overlap-only `callableToolCount`, and
  `callableExposure=none|partial|all`;
- `toolCategoryScope=registered-inventory-with-current-callable-overlap` makes
  the row authority explicit;
- `tools` remains the current category-registry Tool-name list and is explicitly
  labeled `toolListScope=current-callable`;
- result notes and the localized Tool definition state that registered inventory
  is not executable support, and even callable overlap does not prove a specific
  input, Provider, model, reference, or control is supported.

This remains a bounded read of the existing ToolGroupRegistry and
ToolCategoryRegistry. It introduces no creative catalog, support matrix,
capability-purpose allowlist, resolver, executor, or planning handshake.

Focused deterministic validation passed:

- `meta-tools.test.ts` and `agent-runtime-shell-policy.test.ts`: 24/24;
- TUI `tui-default-capabilities.test.ts`: 4/4.

The post-correction real run
`illustration-technique-selection-get-context-scope-20260715` passed all ten hard
Gates with effective chat model `nekoapi-chat/gpt-5.6-luna` and configuration
digest `sha256:6aac69e46af98988734484e219796be193414cbec15eb12baddfe42a6aec7a23`.
It observed `callableExposure=none` for animation keyframes,
effects/transitions, and AI generation; the Agent therefore selected layered 2D
as the preferred intent but marked execution blocked. `Read` and `GetContext`
were the only calls, both succeeded, and Image/Video generation remained absent.
The final context estimate was 5,606 tokens; Provider token/cost usage remained
unavailable. This single-sample difference from the earlier 5,233-token run is
not an isolated token ablation and is recorded only as observed cost.

Task 3.3 is proved by the earlier provider-backed
`capability-context-character-reference` run: selection formed the current
`GenerateImage` Tool call, normal media Tool execution created the
`image_generation` Task, normal task observation delivered the generated
revision, and the Agent read the actual result. The removed planning projection
has no executor, while architecture guards poison planning resolvers and required
handshakes. No planning-specific execution path participated.

Task 3.6 is complete as **not adopted**. The selection cases exposed an authority
labeling defect that was fixed in `GetContext`; they did not prove a need for a
compact derived capability view. Ordinary Tool selection and execution therefore
remain independent of any optional planning summary.

## 21. Removal of Broad Creative History Snapshots

Task 4.1 is complete by removal, existing canonical reads, and poison evidence:

- the rejected broad creative observation DTO/session assembler, recursive
  Tool-payload history scan, Extension turn snapshot plumbing, Approval decision
  history projection, and central target-completion evaluator are absent from
  production code;
- the real `illustration-technique-selection` case reads the current source file
  on demand through canonical `Read` and does not derive the SVG from chat or a
  prior snapshot;
- the real `capability-context-character-reference` case consumes the current
  terminal Task result, durable generated ResourceRef/revision, and actual image
  observation rather than treating prior assistant text or task submission as
  result evidence;
- ordinary Agent observations, Task-result observation records, Journal history,
  and multimodal evidence remain intact for their existing bounded roles. They
  are not combined into a new creative project-state store and do not replace
  owning revisions or current Quality facts.

The architecture guard now rejects the removed broad snapshot/assembler,
recursive history collector, Approval-history projection, and central creative
completion evaluator names/files while leaving canonical task and perception
observations legal. `architecture-boundary-guards.test.ts` passes 54/54.

## 22. Historical Owner-Specific Stale-Mutation Analysis

The earlier task list left owner-specific stale mutation work open, but the
proposal no longer treats one blanket shared
expected-project-revision contract as the default solution. Revision authority
stays with each owning document/project domain; Agent only reads and passes an
opaque revision/digest when an action depends on a potentially stale premise:

| Analysis layer | Current finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | For mutation based on a prior read, asynchronous result, approval, resumed turn, or another stale-risk premise, the owner must compare its current revision/digest immediately before write, reject mismatch, commit atomically, and return the exact resulting project reference/revision. Agent may only pass and consume those opaque facts. New-project creation has no base revision; a synchronous atomic operation against the owner's current live model may use that current state.          |
| Dependency     | `NekoProjectAuthoringTarget` has no expected revision, and that is not itself a shared-contract defect. Canvas has a separate `expectedRevision`; Cut, Sketch, Audio, and Model have different document/project ownership and must reuse or add only the owner-specific concurrency contract their stale-risk paths require. Ordinary files already have VS Code/file version and patch conflict semantics; generated outputs have `ResourceRef`, digest, lineage, and generated revision.            |
| Interface      | Adding Agent-side `currentRevision`, an Agent Revision Store, or a uniform `expectedProjectRevision` on every `.nk*` operation would duplicate project truth and over-couple domains. The canonical interface is each owner's existing revision/digest contract, minimally extended only where a real stale-write boundary is proven, with fail-visible diagnostics and exact resulting reference/revision.                                                                                           |
| Extension      | Active-editor Canvas/Sketch/Cut/Puppet/Model Tools may remain valid when they synchronously mutate the owner's current live document model atomically. Async writeback, cross-turn/resume, approved batch, transactional authoring, Quality, or Export paths that cannot prove their target/current premise must route through an owner-specific stale Gate or remain degraded/unavailable. Returning only node/element/runtime ids is insufficient when downstream work requires a project revision. |
| Test           | For each affected stale-risk owner path, change the file/project after the observed base and prove rejection before write, then prove success returns the exact resulting owner reference/revision. Separately prove live synchronous operations use current owner state, ordinary file patches surface context/version conflicts, generated outputs retain digest/lineage, and Agent does not own or advance revisions.                                                                              |

Implementing only an Agent request wrapper would create the forbidden second
revision authority and leave real writes unguarded. Completing this task requires
auditing actual stale-risk authoring paths and making bounded owner-side changes
only where their existing revision/digest semantics are insufficient; it does not
require one cross-owner DTO or blanket changes to Canvas, Cut, Sketch, Audio, and
Model. The narrowed task list now tracks this owning-boundary verification as
Task 6.3; it is not part of the completed legacy Workflow removal.

## 23. Minimal Agent Runtime And Native Approval Cleanup

Tasks 4.2–4.5 remove the remaining dormant fixed media workflow and creative
approval policy instead of adapting them into the capability-aware path:

- deleted the shared `media-production-workflow` DTO/validators and their tests;
- deleted Agent fixed-stage, project-authoring, pre-export, workflow-recovery,
  Task-backed workflow-state implementations, tests, and public exports;
- deleted the unused cross-domain Extension project-authoring resolver that
  existed only to satisfy the retired orchestrator tests;
- removed `ApprovalBinding` and `creator-replan-policy`; creator review now uses
  generic `ApprovalRequest.context`, while the actual Tool request still passes
  its own current policy independently;
- removed the architecture-test legacy whitelist and poisoned the retired files
  and symbols so they cannot be reintroduced as a dormant success path.

Focused verification on 2026-07-15:

- Agent Approval, generic Task persistence, and architecture guards: 4 files,
  103 tests passed;
- `@neko/shared` full Vitest suite: 181 files, 1576 tests passed;
- production-source search found no remaining retired workflow or creative
  approval-policy symbol.

The earlier Task 4.2 owner-revision analysis above is superseded by the narrowed
task list: stale-risk owner revision work is now Task 6.3. The deleted fixed
workflow is not a valid place to implement that concern.

Formal prompt-chain observation/creation metadata was also confirmed dead:
`ConversationSkillRuntime` had no production observation port, validation had no
production creation-feedback sink, and slash Skill execution already uses the
ordinary Skill lifecycle before submitting a normal Agent turn. The unused
observation DTO, creation metadata/kind, validation sink, tests, and exports were
removed. Capability `promptChainFragments` remain as read-only injected guidance;
native Task-result observation/continuation and generic perception evidence remain
unchanged. Focused verification passed 5 Agent files/181 tests, 2 Extension
files/80 tests, 11 Agent-types files/95 tests, and 5 Task/perception files/27 tests.

Quality review then found two TUI Host call sites still importing the deleted
creation-metadata helpers. The cleanup now also removes slash-result
`executionOverrides` plumbing that existed only for `agentCreation`, submits the
ordinary prompt after canonical Skill lifecycle activation, and merges current
media/understanding model selections as generic execution metadata without a
creation helper. The architecture poison now scans TUI and Extension production
sources and rejects both deleted helper names plus `agentCreation`. Five focused
TUI files/86 tests and the 55-test Agent architecture guard pass. TUI package
typecheck still reports unrelated existing config/test fixture and Agent/platform
contract drift, but no deleted creation helper or slash execution-override error.

The same review removed `CREATIVE_MEDIA_WORKFLOW_STAGES` and its public descriptor,
exports, tests, and `mediaWorkflow.operations` projection. The constant had no
executor, but its ordered stage ids and the unregistered
`media.production-orchestration` reference still advertised a fixed process to
the catalog. `media-production` now describes adaptive selection from current
owning capabilities in both supported catalog languages. The architecture guard
scans `@neko/skills` and poisons restoration of that fixed-stage surface.

## 24. Minimal Runtime Cleanup Evaluation and Quality-Gate Disposition

The 2026-07-15 cleanup uses the smallest existing Evaluation owners and does not
add a creative trace contract, test-only runtime switch, or replacement workflow:

| Affected behavior                                                          | Disposition                                                             | Evidence and rationale                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit builtin Skill identity and prompt injection                       | **Update** `agent-runtime.skill-runtime`                                | The indexed `storyboard` case retained the pre-2026-07-15 Host fingerprint after the committed Skill content changed. The case was updated to the current Host-computed fingerprint; source, provenance, root, relative path, injection, and no-fallback hard Gates remain exact.                                                              |
| Current-capability technique selection                                     | **Reuse** `skill.media-production` / `illustration-technique-selection` | The existing case already requires canonical `Read` and `GetContext`, compares six animation techniques, forbids Image/Video generation and all planning/IDC/legacy workflow fallbacks, and requires a current supported/degraded/unavailable conclusion.                                                                                      |
| Fixed media Workflow DTO, orchestrators, Task state, and recovery deletion | **Excluded** from a new provider-backed case                            | Production search found no caller; compile-time removal plus architecture poison and focused Agent/task tests deterministically reject reintroduction. The two reused real cases prove ordinary Skill/session/Tool context continues without that runtime. A separate creative Workflow suite would recreate the retired ownership vocabulary. |
| Creative `ApprovalBinding` and deterministic replan policy deletion        | **Excluded** from a new model-quality case                              | No production caller remained. Generic ApprovalEngine tests prove creator-review context reaches the user prompt and a later destructive Tool still receives its independent execution-policy decision. Approval correctness is deterministic and is not strengthened by model prose.                                                          |
| Dead prompt-chain observation/creation metadata deletion                   | **Excluded** from a new real case                                       | No production observation port or feedback sink existed. Skill lifecycle injection and native Task-result/perception continuation remain independently covered; architecture guards poison the deleted creation-state symbols.                                                                                                                 |

### Focused real runs

| Suite / case / run                                                                                              | Result   | Path and no-fallback evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Residual risk                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `agent-runtime.skill-runtime` / `explicit-builtin-injection` / `minimal-agent-skill-runtime-20260715-v3`        | **pass** | Re-run after removing the residual TUI creation-metadata call sites. Effective model `nekoapi-chat/gpt-5.6-luna`; runtime, exact builtin Skill identity/injected fragment, and no `comic-to-storyboard` fallback hard Gates passed. Report: `reports/agent-eval/agent-runtime.skill-runtime/explicit-builtin-injection/minimal-agent-skill-runtime-20260715-v3/`.                                                                                                                                                                                                     | No output-content Judge was configured; this case proves runtime identity/injection, not creative answer quality.                 |
| `skill.media-production` / `illustration-technique-selection` / `minimal-agent-technique-selection-20260715-v5` | **pass** | Re-run from a rebuilt canonical TUI after fixed-stage metadata removal, bound to Host fingerprint `sha256:48049d177c8262a3f5526d15342c0696137be8516509a41c5c8f37ea02e45592`. Effective model `nekoapi-chat/gpt-5.6-luna`; all ten hard Gates passed, including current `Read`/`GetContext`, structured Chinese technique comparison, absent Image/Video generation, terminal idle, and no planning/IDC/legacy workflow fallback. Report: `reports/agent-eval/skill.media-production/illustration-technique-selection/minimal-agent-technique-selection-20260715-v5/`. | One provider sample and no Judge; it proves the selected canonical path and support boundary, not stability or aesthetic quality. |

`pnpm test:agent:eval` passed 40 files/272 tests and strict discovery of 23
suites/42 cases. `openspec validate --strict`, `git diff --check`, and focused
Agent architecture/Approval/Task/perception/Skill-boundary tests (10 files/136
tests), Extension slash handling (1 file/33 tests), and Agent types tests passed.

Repository-wide debt gates remain red for unrelated existing inventory:
`pnpm check:legacy-debt` reports 141 blocking `migrate-now`/`needs-review`
occurrences, and `pnpm check:unused` reports 3 files, 6 dependencies, 5 unlisted
dependencies, 81 exports, and 1 duplicate export. Neither report identifies a
remaining deleted media Workflow, creative Approval binding/policy, or removed
prompt-chain observation export. These baselines are not repaired in this change
because doing so would broaden the scoped prelaunch cleanup into unrelated Home,
TUI, package dependency, and repository quality debt.

The first post-Skill-edit run (`minimal-agent-technique-selection-20260715-v3`)
correctly failed the identity Gate because the canonical TUI bundle still
contained the old Skill snapshot; the suite was not weakened. After rebuilding,
`v4` was interrupted by an unrelated Markdown streaming `stable prefix regressed`
exception and controller EPIPE. An unchanged infrastructure retry (`v5`) passed.
These failures remain separate from target behavior evidence.

## 25. L3 Quality Review and Five-Layer Findings

Risk is **L3** because the change removes public Agent/shared workflow contracts,
changes Skill/Tool context, and affects the TUI Skill invocation path. No scoped
blocking architecture finding remains after the TUI and Skill-stage residuals
above were removed.

| Layer          | Finding                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Agent owns only session/turn reasoning, generic Approval, current Tool calls, and native Task continuation. Files, generated resources, project revisions, Quality, and Export remain with their existing owners. No creative run, stage, approval scope, revision store, or completion state remains in Agent core.                                                  |
| Dependency     | Deleting the shared workflow DTO and unused Extension resolver reduces cross-domain coupling. TUI now uses public Skill lifecycle activation and ordinary prompt submission; no Host imports a retired creation helper. No new Webview/VS Code, React/Extension, Rust duplication, cache, path, or cross-feature dependency was introduced.                           |
| Interface      | The surviving contracts are existing generic `ApprovalRequest.context`, Tool/runtime requirements, Task results, ResourceRef/digest/lineage, and owner-specific revisions. `GetContext` distinguishes registered inventory from current callable Tools. No replacement workflow DTO, plan compiler, creative approval schema, or uniform revision protocol was added. |
| Extension      | New production techniques continue to register through their owning Tool/capability boundaries. The Agent and Skill need no code change to accept a new legitimate candidate, while missing deterministic Image, character-reference dependency, Animatic/Cut, Quality, or Export operations remain explicit owning-package gaps rather than Agent facades.           |
| Testing        | Compile-time deletion and poison guards prove retired paths cannot return success; focused unit tests cover generic Approval, slash activation, Task/perception continuation, Tool semantics, and Skill protocol boundaries. Real TUI cases prove exact Skill identity/injection and current-capability technique selection with no legacy fallback.                  |

The Agent architecture overview was also corrected to remove its remaining
Creation Profile/stage/iteration, IDC, recovery-signal table, and legacy Workflow
projection claims. Registration/injection, Skill lifecycle, Prompt layers, TUI
Host ownership, and recovery now describe the same current-turn ReAct boundary as
the accepted ADR.

## 26. Domain-Neutral Core Audit

The stricter 2026-07-15 boundary treats Agent and generic Platform as minimal,
domain-neutral extension hosts. The audit found additional non-Workflow creative
specializations that were not covered by the earlier fixed-media cleanup:

| Residual                                           | Current path                                                                                                                    | Disposition                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creation profile/stage contracts and registry      | `@neko/shared` creation-profile types; Agent profile/runtime composition; Extension/TUI registry bootstrap                      | **Delete.** This is the retired IDC/staged-creation model under another profile surface, not a generic Agent profile. Preserve Artifact and Provider expression profiles only.                                                                                                |
| `creationGuidance` runtime plane                   | Agent runtime/session/Extension/TUI bootstrap; currently carries only `autohealChainFactory`                                    | **Genericize without alias.** Move the factory into the existing validation/recovery plane and remove the creation-named bootstrap contract.                                                                                                                                  |
| Creative context compression                       | Agent `CreativeSummarizer`, `MessageClassifier`, `creativeCompression`, and category budgets for story/character/visual content | **Delete from core.** Retain generic `ConversationCompressor` / `LLMSummarizer`; any domain-priority method belongs to an injected Skill or context adapter.                                                                                                                  |
| Hard-coded media Skill matching                    | Agent `KeywordSkillMatcher` media/stage vocabularies and fixed focused-artifact preferences                                     | **Genericize.** Candidate discovery may compare registered Skill metadata, but core must not enumerate storyboard, comic, animation, Cut, or media-production concepts.                                                                                                       |
| Storyboard output validation/retry prose           | Agent `OutputValidator` local registry and `ValidationHooks` storyboard-specific retry branch                                   | **Move to owning contribution.** Keep a generic output-validator adapter boundary; Storyboard schema and repair guidance belong to the Storyboard/Skill capability owner.                                                                                                     |
| Media/creative task projection                     | Agent/agent-types task result handling for `creativeEntity` and `generated-storyboard`; Platform media projectors               | **Move to owning contribution.** Core Task continuation transports stable generic results; media/Entity interpretation belongs to media and Entity owners. No new creative facade is allowed.                                                                                 |
| Platform media/perception/provider implementations | `@neko/platform/src/media` and creative media-understanding prompt assembly                                                     | **Owning-package extraction required.** Generic Platform may host Provider adapters and contribution registration, but it must not own media production semantics. Extraction must reuse existing Media/Content/Entity packages rather than create another Agent media layer. |

This completes Task 4.8 as an inventory and ownership decision. Tasks 4.9–4.12
remain implementation requirements. The cleanup order is creation profile/guidance,
generic context/Skill routing, owning validators/projections, and finally architecture
poison plus real core-ablation evidence. Existing generated files, projects, Skills,
settings, Task records, ResourceRefs, and user documents remain protected.

### 2026-07-15 implementation follow-up

Tasks 4.9 and 4.10 are implemented: creation profile/guidance and creative compression
are absent from the generic runtime, while Skill candidate matching no longer owns
hard-coded media vocabularies and now uses registered catalog text. Storyboard output validation is
an owning `@neko/skills` adapter injected through the generic validation plane, and
Agent Task/result projection no longer interprets `creativeEntity` or branches on a
`generated-storyboard` result.

Task 4.11 is not complete. A second Canvas-specific execution path remains across
`agent-entry-intent-runtime.ts`, `storyboard-action-task-runtime.ts`,
`creative-ai-run-runtime.ts`, and the Extension command
`neko.agent.creativeAi.invokeExternal`. It owns Canvas action decisions, Storyboard
Task projection, creative run identity, media lanes, candidate generation/apply, and
judge continuation in Agent core. This is a parallel creative scheduler, not a generic
Task continuation. Tasks 4.13–4.15 therefore require an owning Canvas capability path
through the ordinary Agent turn/Tool approval/Task lifecycle before the old path is
deleted and poisoned. No compatibility scheduler or generic creative facade is
permitted.

Applicable validation: TUI full Vitest 95 files/584 tests; focused Agent tests 10
files/136 tests plus the updated 55-test architecture guard; Extension slash 33
tests; `@neko/skills` 32 focused tests; Agent Evaluation harness 40 files/272
tests and 23 suites/42 cases; strict OpenSpec and `git diff --check`. The TUI
typecheck remains blocked by existing broad fixture/Agent/platform errors, and
`check:agent-boundaries` remains red only for two expired failure-level and five
warning-level pre-existing compatibility exceptions. No Webview behavior, Rust,
Proto, project format, or user data changed, so Extension Development Host,
Engine, and migration smoke are not applicable to this scoped cleanup.
