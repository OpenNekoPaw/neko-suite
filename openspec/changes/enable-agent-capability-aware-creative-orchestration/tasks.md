> **Implementation dependency (2026-07-14):** apply [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) first. Existing planning-projection and `CapabilityIntent` scaffolds are not accepted architecture: remove them or keep them unconnected unless focused evaluation proves a minimal derived read view is necessary. Plan/TODO/Markdown continue through the no-IDC ordinary Agent turn and typed Tool-call boundary; there is no Apply runtime, global current revision, target-completion evaluator, or asset-promotion prerequisite.

## 1. Baseline Audit and Contract Mapping

- [x] 1.1 Inventory Agent capability registration/injection, artifact facets, `mediaWorkflow` metadata, provider operation support, permission requirements, recovery diagnostics, prompt-chain fragments, and existing catalog query paths.
- [x] 1.2 Inventory Story, Canvas, Image/Video Media, Sketch, Puppet, Model/Scene, Cut, Audio, Quality, Export, Asset, Engine, and External Processor owning capabilities, recording accepted/produced files or project results, mutation owner, applicable revision result, support/limits, and transactional gaps.
- [x] 1.3 Trace current `media-production` from Skill activation through Agent turn assembly, capability selection, async task completion, authoring writeback, quality review, and continuation; identify every location that relies on fixed stage order, chat text, active Webview state, or legacy workflow runtime.
- [x] 1.4 Produce a field-source/reuse table showing which planning semantics derive from existing capability contributions and which minimal shared fields are genuinely missing; record why no parallel creative tool catalog or broad Creation/Workflow DTO is required.
- [x] 1.5 Add architecture boundary tests that poison new `WorkflowRuntime`, `WorkflowRun`, `WorkflowNode`, `WorkflowTransition`, fixed creative stage executors, and prompt-chain executable-plan schema introductions.
- [x] 1.6 Audit every canonical Image operation from tool/capability entry through its final executor and Provider validation, distinguishing editor/writeback availability from deterministic, perception, generative, or hybrid production support; record current false-positive/degraded/unavailable declarations.
- [x] 1.7 Audit Entity/Asset/Character revision, Storyboard shot reference, project dependency, Quality stale-state, preflight, export lineage, and deliverable verification contracts that can support character dependencies and direct deliverable checks without a new Agent-owned state model.
- [x] 1.8 Audit current Plan Mode, plan approval, `brief.md`/`plan.md`, bounded TODO, document analysis, ordinary approved execution, and replan paths; identify any direct execution of Markdown, stale approval reuse, hidden workflow state, or planning-time executor/schema capture.

## 2. Canonical Tool Context And Experimental Scaffold Cleanup

- [x] 2.1 Characterize the existing `CreativeCapabilityPlanningProjection` scaffold, its consumers, duplicated fields, and parity tests; record that it is experimental rather than an accepted public or execution contract.
- [x] 2.2 Audit its validators and fields for duplicated Tool schema/support authority, runtime/cache/Webview identity leakage, Provider handles, project truth, or plan-runtime semantics.
- [ ] 2.3 Remove the scaffold and related exports/tests if current Tool definitions, registry, Skill context, `GetContext`, and owning diagnostics pass the focused capability-selection evaluations.
- [ ] 2.4 If and only if ablation proves a material context omission, mis-selection, or token-budget failure, reduce the scaffold to a bounded read-only summary derived from the same registry; it must remain optional, disposable, and incapable of execution.
- [ ] 2.5 Correct canonical Tool descriptions/schema/results first so creative purpose, input/output, mutation, execution kind, support/limits, permissions, diagnostics, and quality expectations come from the owning contribution.
- [ ] 2.6 Add architecture tests rejecting a parallel creative catalog, Provider-purpose allowlist, duplicate support matrix, planning runtime, or required planning-projection handshake.

## 3. Capability Context Evaluation And Optional Optimization

- [ ] 3.1 Run focused real-Agent selection cases against the existing Tool/Skill/`GetContext` path and measure capability omission, wrong-technique selection, schema confusion, and token/context cost.
- [ ] 3.2 Improve existing Tool injection/filtering and `GetContext` output where the cases expose concrete gaps; do not require a domain-index/discovery/selected-schema prompt chain.
- [ ] 3.3 Prove the selected operation always executes through the normal Tool/lifecycle registry and its current schema, with no planning-specific resolver or executor.
- [x] 3.4 Ensure disabled, uninstalled, untrusted, incompatible, or unsupported capabilities are omitted from executable candidates or exposed as unavailable, never projected as a likely success path.
- [x] 3.5 Add collision diagnostics for duplicate canonical capability ownership and selected-executor ambiguity while preserving multiple legitimate technique candidates for Agent comparison.
- [ ] 3.6 If task 3.1 proves a compact derived view necessary, measure it on the real PromptComposer path and keep a test proving disabling it leaves ordinary Tool selection and execution functional.

## 4. Current-File And Project-Grounded Agent Replanning

- [ ] 4.1 Replace the broad history-scanning creative snapshot with bounded, on-demand reads of current files/ResourceRefs, applicable owning project revisions, generated results, Task results, and Quality facts relevant to the current Agent goal.
- [ ] 4.2 Ensure each consequential `.nk*` project mutation carries and deterministically validates current/base revision after async task or capability completion; ordinary files use file/ResourceRef plus digest/lineage, and no global revision or second Creation/workflow state store may be introduced.
- [ ] 4.3 Update next-action guidance so the existing Agent loop queries current facts, compares real capability candidates, and proposes the normal typed Tool call while deterministic resolve, validation, approval, policy, and execution remain in existing runtimes.
- [ ] 4.4 Add continuation tests proving context compaction, session resume, or a new turn reads current files, ResourceRefs, and applicable owning project revisions instead of replaying assistant text, TODO state, legacy trace, or stale active-editor context.
- [ ] 4.5 Add path tests proving a returned project revision invalidates prior observations and stale QualityEvidence before downstream mutation, export, or delivery.
- [ ] 4.6 Record minimal capability-selection/replan trace evidence for evaluation and audit without using trace rows as recovery state or project truth.
- [ ] 4.7 Include owning character/reference revision dependencies and target completion evidence in transient observation when available; prove Agent state does not duplicate Entity, Asset, Storyboard, Cut, Audio, Quality, or Export truth.
- [ ] 4.8 Ground comic, novel, screenplay, PDF, illustration, image-sequence, and existing-project plans in actual files and owning structured source evidence; add fail-visible diagnostics for missing page/panel/scene/character/source-trace or project inputs.
- [ ] 4.9 Integrate Plan Mode with the existing read-only Tool/capability context so generated Markdown plans expose supported/degraded/unavailable/partial paths as concrete work units without creating tasks or mutations.
- [ ] 4.10 Remove or keep unconnected any `CapabilityIntent` graph/plan contract; approved execution must form an ordinary typed Tool call in the current Agent turn and must not persist resolved executors, Provider handles, cache/Webview identities, or full schemas in Markdown/frontmatter.
- [ ] 4.11 Bind plan approval to plan content digest, critical input file/ResourceRef or applicable project revision, target, and explicit cost/risk/mutation/delivery scope using the existing Approval owner; do not introduce a Plan Manager or approval store.
- [ ] 4.12 Implement current-turn re-read and re-resolve for Markdown, input files/projects, capability support/schema, Provider/model limits and policy before each consequential action; do not add an Apply runtime.
- [ ] 4.13 Invalidate or replan when documents, project revisions, capabilities or Provider support change; require renewed approval for material target/technique/cost-risk/mutation/delivery changes and trace bounded replans that remain inside the approved scope.
- [ ] 4.14 Add poison tests proving Markdown/TODO edits cannot trigger side effects, old executor/schema snapshots cannot run, and Plan Mode cannot create media tasks, project mutations, asset-library imports or exports.

## 5. Prompt-Chain and Creative Media Skill Convergence

- [ ] 5.1 Revise `media-production` guidance from a mandatory linear stage sequence into optional/repeatable production milestones and method checkpoints governed by current artifacts, diagnostics, approvals, and target deliverables.
- [ ] 5.2 Update `storyboard`, `image`, `video`, `video-editing`, and `media-quality-review` guidance to state selection, handoff, completion, and recovery invariants without naming package tools or embedding execution schemas.
- [ ] 5.3 Keep prompt-chain observations limited to started/checkpoint/skipped/reordered/completed with explicit reasons, and add tests proving they do not satisfy Artifact validators or Quality/Export Gates.
- [ ] 5.4 Add tests proving an existing valid Storyboard revision can cause a recorded skip, a diagnostic can cause a recorded reorder/repeat, and neither action creates workflow nodes or transitions.
- [ ] 5.5 Extend builtin/custom Skill protocol-backflow tests so capability planning metadata cannot be copied into natural-language Skill content as tool names, parameters, polling, path, Webview, or package authoring instructions.

## 6. Cross-Domain Production Strategy Selection

- [ ] 6.1 Correct Agent-visible Tool/capability semantics for canonical Storyboard, Image, Video, Canvas, Cut, and Quality capabilities using only owning package contributions and current file/project identities.
- [ ] 6.2 Correct the same semantics for Sketch/frame animation, Puppet, Model/Scene, Audio, Export, optional Asset-library import, Engine media operations, and managed External Processors; expose missing production support as explicit diagnostics rather than stubs.
- [ ] 6.3 Implement capability-neutral shot/scene strategy guidance that compares generative video, keyframe video, Puppet, frame animation, layered 2D, 3D scene/camera, and compositing when those capabilities are registered.
- [ ] 6.4 Add tests proving illustration animation does not default to generative video when another declared technique better matches source/target requirements, and unavailable techniques are explained rather than silently substituted.
- [ ] 6.5 Add provider path tests proving end-frame, reference video, duration, motion/camera, enhancement, extension, or other unsupported controls fail before dispatch and trigger a compatible Agent replan.
- [ ] 6.6 Identify authoring intents that cannot safely use existing low-level operations; for each real gap, either add a small owning-package transactional capability returning an exact revision or split it into a separate owning-package OpenSpec instead of implementing it in Agent.
- [ ] 6.7 Correct Image operation registration/support so deterministic crop/resize/rotate/mask/layer/composite paths, perception OCR/segmentation/depth/pose paths, generative inpaint/outpaint/colorize/redraw paths, and hybrid multi-operation paths expose their actual executors and constraints.
- [ ] 6.8 Add path tests proving deterministic comic panel edits do not invoke image generation, generative edits preserve source/mask/unmodified-region/lineage semantics, and UI-only or Provider-incompatible tools remain degraded/unavailable.
- [ ] 6.9 Add comic/illustration preparation selection tests for logical panel interpretation, physical crop, semantic layering, text removal/background repair, optional colorization, and direct-source reuse without enforcing one fixed preparation sequence.
- [ ] 6.10 Integrate or adapt owning character/reference revision dependency projections needed by shot planning and quality stale-state; if the audit finds missing Character domain schemas, create a separate animation-production OpenSpec rather than adding them to Agent runtime.

## 7. Transactional Authoring and Quality Feedback Paths

- [ ] 7.1 Verify Storyboard-to-Canvas, accepted-shot-to-Cut, generated files, optional asset-library import, audio authoring, project quality, preflight, and export paths return actual files/ResourceRefs/digests or exact owning project revisions suitable for the next Agent turn.
- [ ] 7.2 Implement or adapt the minimal Cut-owned Animatic authoring operation if the audit proves existing headless APIs cannot atomically create a revision from accepted Storyboard timing and temporary audio.
- [ ] 7.3 Add failure/rollback tests proving transactional authoring never leaves a success projection for partial project mutations and never falls back to active Webview state or direct `.nk*` assembly.
- [ ] 7.4 Wire unavailable/degraded, validator, approval denial, task failure, stale evidence, and Quality Gate results back into the next Agent turn as structured recovery evidence.
- [ ] 7.5 Enforce deterministic approval and cost policies before expensive batch generation, external processors, project mutation, export, and delivery; test denial-to-smaller-batch or alternative-technique replanning.
- [ ] 7.6 Complete or explicitly depend on owning preflight/export/deliverable verification requirements needed to prove stale project evidence cannot authorize final delivery; do not simulate missing release gates inside Agent.
- [ ] 7.7 Add direct-deliverable checks for Storyboard, Animatic, pilot/sample, and final outputs by composing existing owning validators, Quality, and Export results; do not add a central target-completion evaluator, and return a missing-capability/partial-deliverable result when required outputs cannot be created or validated.
- [ ] 7.8 Create the follow-up animation-production domain OpenSpec for any confirmed gaps in adaptation, Character/Style/Color Bible, Animatic, multi-shot dependency, post-production completeness, or final-deliverable profile contracts; keep those implementations outside Agent runtime.

## 8. Agent Evaluation Scenarios

- [ ] 8.1 Extend the script-driven evaluation manifest and facts contract for capability candidates, selected canonical capability, artifact/revision inputs and outputs, rejection/unavailability reasons, approval, diagnostics, replan reason, and legacy-path poison evidence.
- [ ] 8.2 Add a real Agent case for comic or screenplay to Storyboard/Animatic that reuses an existing valid revision, skips redundant guidance, invokes canonical Canvas/Cut authoring, and proves prompt-chain observations are not completion authority.
- [ ] 8.3 Add a real Agent case for illustration-to-animation that compares available generative video, layered/Sketch, Puppet, or Scene techniques and invokes the selected owning capability.
- [ ] 8.4 Add a real provider-backed case where an unsupported end-frame or reference control is rejected before dispatch and the Agent changes provider, prepares a compatible artifact, chooses another technique, or requests a user-visible scope change.
- [ ] 8.5 Add a recovery case where a mutation creates a new revision, prior QualityEvidence becomes stale, and the Agent reruns the owning review before export/delivery.
- [ ] 8.6 Poison legacy workflow run/node/transition/fixed-stage paths in evaluation and prove the Agent-native session/turn, capability lifecycle, task, approval, validator, and artifact paths complete without them.
- [ ] 8.7 Run ablations for the existing Tool context, any optional derived summary, prompt-chain guidance, file/project grounding, and recovery diagnostics; record whether each component materially affects correct Tool selection and path completion.
- [ ] 8.8 Add a real comic preparation case that chooses deterministic split/crop and perception/OCR before a bounded generative repair, preserves character/source references, and proves generic full-image regeneration is not used for deterministic steps.
- [ ] 8.9 Add a character revision recovery case where an approved appearance or color revision changes, dependent shot evidence becomes stale, and the Agent selects repair/review before acceptance.
- [ ] 8.10 Add target-completion cases proving Animatic may finish at its own deliverable boundary while an animation-final request remains incomplete until accepted shots, final Cut/Audio/subtitle revisions, preflight, export lineage, and verification are current.
- [ ] 8.11 Add a real document-grounded Plan Mode case that analyzes a comic or screenplay into structured source evidence and a Markdown plan, reports unavailable/partial paths, and proves no mutating or provider-consuming execution occurred without its declared policy and approval.
- [ ] 8.12 Add approved-execution/replan cases proving current capability/schema/input re-resolution, stale-plan rejection, bounded recovery inside approval scope, and renewed approval for material production-technique or delivery changes.

## 9. Documentation, Quality Gates, and Release Readiness

- [ ] 9.1 Keep [`docs/architecture/adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](../../../docs/architecture/adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md), Plan Mode/Agent architecture, and video/image/character domain documentation aligned with canonical Tool-context awareness, Markdown/ordinary-Tool separation, current-turn re-resolution, image execution kinds, character revision dependencies, direct deliverable checks, and the prompt-chain/executable-result distinction.
- [ ] 9.2 Update creative Skill authoring guidance and capability contribution documentation with the single-source projection rule and examples that do not leak tool protocol into Skill content.
- [ ] 9.3 Run focused unit/contract/integration tests and affected package typechecks/builds, then run `pnpm check`, `pnpm test`, and `pnpm build` for the cross-package Agent/capability change.
- [ ] 9.4 Run `pnpm check:legacy-debt`, `pnpm check:unused`, and prompt/Skill protocol-backflow checks; prove removed or poisoned workflow paths cannot return success.
- [ ] 9.5 Run `pnpm test:agent:eval` as harness self-validation and execute all focused real Agent/provider cases from section 8 with model/provider identity, capability trace, artifact revisions, and residual risks recorded.
- [ ] 9.6 Run affected Canvas/Cut Extension Development Host functional scenarios through `vscode-extension-debugger` if capability discovery, authoring handoff, approval, task, diagnostic, or revision projection changes visible Webview behavior.
- [ ] 9.7 Run an Extension Development Host Plan Mode scenario covering document analysis, Markdown plan review/edit/approval, zero-side-effect planning, approved-execution re-resolution, and stale-plan/reapproval UI diagnostics.
- [ ] 9.8 Run `neko-quality-review`, classify the L3 architecture/runtime risk, and record unimplemented owning capabilities, provider limitations, optional evaluators, token-budget trade-offs, blocked validations, and remaining release risks before declaring completion.
