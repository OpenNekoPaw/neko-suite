> **Implementation dependency (2026-07-14):** apply [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) first. Existing planning-projection and `CapabilityIntent` scaffolds are not accepted architecture. Plan/TODO/Markdown continue through the no-IDC ordinary Agent turn and typed Tool-call boundary; there is no Apply runtime, global current revision, target-completion evaluator, plan authorization token, or asset-promotion prerequisite.

## 1. Baseline Audit and Contract Mapping

- [x] 1.1 Inventory Agent capability registration/injection, artifact facets, `mediaWorkflow` metadata, provider operation support, permission requirements, recovery diagnostics, prompt-chain fragments, and existing catalog query paths.
- [x] 1.2 Inventory Story, Canvas, Image/Video Media, Sketch, Puppet, Model/Scene, Cut, Audio, Quality, Export, Asset, Engine, and External Processor owning capabilities, recording accepted/produced files or project results, mutation owner, applicable revision result, support/limits, and transactional gaps.
- [x] 1.3 Trace current `media-production` from Skill activation through Agent turn assembly, capability selection, async task completion, authoring writeback, quality review, and continuation; identify every location that relies on fixed stage order, chat text, active Webview state, or legacy workflow runtime.
- [x] 1.4 Produce a field-source/reuse table showing which planning semantics derive from existing capability contributions and which minimal shared fields are genuinely missing; record why no parallel creative tool catalog or broad Creation/Workflow DTO is required.
- [x] 1.5 Add architecture boundary tests that poison new `WorkflowRuntime`, `WorkflowRun`, `WorkflowNode`, `WorkflowTransition`, fixed creative stage executors, and prompt-chain executable-plan schema introductions.
- [x] 1.6 Audit every canonical Image operation from tool/capability entry through its final executor and Provider validation, distinguishing editor/writeback availability from deterministic, perception, generative, or hybrid production support; record current false-positive/degraded/unavailable declarations.
- [x] 1.7 Audit Entity/Asset/Character revision, Storyboard shot reference, project dependency, Quality stale-state, preflight, export lineage, and deliverable verification contracts that can support character dependencies and direct deliverable checks without a new Agent-owned state model.
- [x] 1.8 Audit current Plan Mode, plan approval, `brief.md`/`plan.md`, bounded TODO, document analysis, ordinary approved execution, and replan paths; identify any direct execution of Markdown, stale approval reuse, hidden workflow state, or planning-time executor/schema capture.
- [x] 1.9 Audit model-independent creative intent, reference roles, Provider/model/version/profile support, session effective configuration, actual request evidence, result lineage, and Quality ownership; identify any static model matrix, marketing-derived support, or historical-result fallback.

## 2. Canonical Tool Context And Experimental Scaffold Cleanup

- [x] 2.1 Characterize the existing `CreativeCapabilityPlanningProjection` scaffold, its consumers, duplicated fields, and parity tests; record that it is experimental rather than an accepted public or execution contract.
- [x] 2.2 Audit its validators and fields for duplicated Tool schema/support authority, runtime/cache/Webview identity leakage, Provider handles, project truth, or plan-runtime semantics.
- [x] 2.3 Remove the scaffold and related exports/tests if current Tool definitions, registry, Skill context, `GetContext`, and owning diagnostics pass the focused capability-selection evaluations.
- [x] 2.4 If and only if ablation proves a material context omission, mis-selection, or token-budget failure, reduce the scaffold to a bounded read-only summary derived from the same registry; it must remain optional, disposable, and incapable of execution. (Not adopted: focused before/after real-Agent evidence found no need for a derived view.)
- [x] 2.5 Correct canonical Tool descriptions/schema/results first so creative purpose, input/output, mutation, execution kind, support/limits, permissions, diagnostics, and quality expectations come from the owning contribution.
- [x] 2.6 Add architecture tests rejecting a parallel creative catalog, Provider-purpose allowlist, duplicate support matrix, planning runtime, or required planning-projection handshake.
- [x] 2.7 Add architecture tests rejecting a global model capability matrix, Prompt Manager/execution catalog, model-marketing support inference, or Prompt-example retrieval as a prerequisite for ordinary Agent execution.

## 3. Capability Context Evaluation And Optional Optimization

- [x] 3.1 Run focused real-Agent selection cases against the existing Tool/Skill/`GetContext` path and measure capability omission, wrong-technique selection, schema confusion, and token/context cost.
- [x] 3.2 Improve existing Tool injection/filtering and `GetContext` output where the cases expose concrete gaps; do not require a domain-index/discovery/selected-schema prompt chain.
- [x] 3.3 Prove the selected operation always executes through the normal Tool/lifecycle registry and its current schema, with no planning-specific resolver or executor.
- [x] 3.4 Ensure disabled, uninstalled, untrusted, incompatible, or unsupported capabilities are omitted from executable candidates or exposed as unavailable, never projected as a likely success path.
- [x] 3.5 Add collision diagnostics for duplicate canonical capability ownership and selected-executor ambiguity while preserving multiple legitimate technique candidates for Agent comparison.
- [x] 3.6 If task 3.1 proves a compact derived view necessary, measure it on the real PromptComposer path and keep a test proving disabling it leaves ordinary Tool selection and execution functional. (Not adopted: the measured gap was fixed in canonical `GetContext`; no derived view was justified.)

## 4. Minimal Agent Runtime And Native Approval Cleanup

- [x] 4.1 Replace the broad history-scanning creative snapshot with bounded, on-demand reads of current files/ResourceRefs, generated results, Task results, and applicable owning facts relevant to the current Agent goal.
- [x] 4.2 Delete the fixed `MediaProductionWorkflowRunState` shared DTO, Agent stage orchestrators, Task-backed workflow state store, recovery coordinator, public exports, and tests; preserve user files/projects/settings and ordinary Task data.
- [x] 4.3 Remove the architecture-test whitelist for legacy media workflow files and poison their filenames, exported symbols, fixed stage ids, workflow state store, recovery, and authoring/pre-export orchestrator paths.
- [x] 4.4 Remove creative-plan-specific `ApprovalBinding` and `creator-replan-policy` from Agent core; keep creator review on the generic `ApprovalRequest.context`/user-prompt path and keep every actual Tool operation under its current permission/cost/mutation/delivery policy.
- [x] 4.5 Add focused Approval tests proving permission, creator-review, and quality-gate channels work through the generic ApprovalEngine without creative scope fields, and a prior creator review cannot bypass a current Tool approval.
- [x] 4.6 Audit formal prompt-chain observation consumers; do not extend checkpoint state for this capability, and remove only genuinely dead observation code in a separately bounded cleanup if another lifecycle still owns it.
- [x] 4.7 Preserve native Task-result observation/continuation and generic perception evidence; prove they report one task/result to the current conversation without deciding the next creative action or recreating workflow state.
- [x] 4.8 Inventory residual non-core creative semantics in `agent`, `agent-types`, and generic `platform`, including creation profile/guidance, creative summarization, hard-coded Skill routing, domain validators, and media-specific Task/result projection; assign each to delete, genericize, or owning extension.
- [x] 4.9 Remove creation profile and creation guidance runtime contracts from Agent/Platform core; keep genuinely generic autoheal/recovery under the existing validation/runtime plane without a compatibility alias.
- [x] 4.10 Remove the creative-specific context summarizer and hard-coded media Skill routing from Agent core; preserve only metadata-driven generic context compression and Skill discovery/activation.
- [ ] 4.11 Move Storyboard/media-specific validation and Task/result interpretation out of Agent core into existing owning validator/capability contribution boundaries; do not create a generic creative facade.
- [ ] 4.12 Add architecture poison tests rejecting creative profiles, creative guidance, creative summarizers, hard-coded domain routing, domain validators/projectors, `CreativeAgent`, and `MediaPlanner` in Agent/Platform core.
- [ ] 4.13 Replace the direct Canvas `CreativeAiRunRuntime`/lane/apply command path with a Canvas-owned capability contribution that enters the ordinary Agent turn, Tool approval, Task, and result-continuation lifecycle; remove `creative-ai-run-runtime.ts`, `storyboard-action-task-runtime.ts`, and the Canvas-specific command executor without adding a compatibility scheduler.
- [ ] 4.14 Remove hard-coded file-to-video, retry-creation, prompt/script media command, and Canvas Storyboard action intent builders from `agent-entry-intent-runtime.ts`; any retained shortcut must come from the invoking Host or owning capability metadata and enter the ordinary Agent request path.
- [ ] 4.15 Mark the earlier Canvas creative invocation/run ADRs as superseded or narrowly owning-package-only, then extend architecture poison and core-ablation evidence so the direct creative run/lane scheduler and Agent-owned Storyboard action runtime cannot return success.

## 5. Prompt, Skill, Markdown, And Dynamic Agent Behavior

- [ ] 5.1 Update supported-language core default/Plan Prompt variants with semantically equivalent observe-decide-act-observe discipline, current-result completion states, native Approval usage, and instruction/content language separation.
- [x] 5.2 Revise `media-production` guidance from mandatory stages into optional/repeatable milestones selected from current evidence; update `storyboard`, `image`, `video`, `video-editing`, and `media-quality-review` only where focused evaluation exposes a method gap.
- [x] 5.3 Keep `brief.md` and `plan.md` as optional ordinary Markdown naming conventions written through existing file tools; add no plan schema, parser, manager, special button, authorization token, or Markdown-to-Tool compiler.
- [ ] 5.4 Ground plans in current Read/document/perception evidence and require structured page/panel/scene/character artifacts only when the selected downstream owning Tool requires them.
- [ ] 5.5 Add capability-neutral image/reference guidance for deterministic vs generative editing, reference remix, and multi-view character sheets; use one generation when current support permits and repair only observed defects.
- [ ] 5.6 Keep Prompt examples outside execution, keep model-independent creative intent separate from Provider/model support, and preserve target content language/protected strings across localized guidance.
- [ ] 5.7 Extend prompt/Skill protocol-backflow and bilingual behavior tests without introducing Provider names, Tool tutorials, Prompt dialect tables, polling, output-path protocols, fixed pipelines, or model-fingerprint routing in Skill content.

## 6. Owning Capability Boundary And Follow-Ups

- [ ] 6.1 Ensure Agent strategy selection compares only currently registered Tool/capability semantics and current diagnostics across Storyboard, Image/Video, Canvas, Sketch, Puppet, Scene, Cut, Audio, Quality, Export, and managed processors.
- [ ] 6.2 Record missing or unsafe authoring, character/reference dependency, Quality, preflight, Export, Provider-control, or image-executor support as owning-package gaps; create focused owning OpenSpecs instead of implementing facades, orchestrators, shared workflow DTOs, or fallback behavior in Agent.
- [ ] 6.3 Verify stale-risk project mutation uses only owner-specific revision/digest validation, ordinary text uses VS Code document/file conflict semantics, generated output uses ResourceRef/digest/lineage, and Agent only passes opaque owner facts.
- [ ] 6.4 Ensure unavailable/degraded capability, validator, approval denial, Task failure, stale evidence, and Quality/Export results return through ordinary Tool/Task results so the next Agent turn can reason from them without a recovery coordinator.
- [ ] 6.5 Verify target completion is reasoned from direct owning files/results/validators and current Quality/Export evidence; do not add an Agent target-completion evaluator or pre-export orchestrator.

## 7. Focused Agent Evaluation

- [x] 7.1 Reuse the existing `media-production` suite and current facts wherever they already expose Tool calls, Tasks, diagnostics, approvals, files/ResourceRefs, and forbidden fallback; do not add creative trace fields solely for Evaluation.
- [ ] 7.2 Add or update a canonical case proving source analysis -> current capability choice -> ordinary Tool call -> Task/result observation -> next Agent decision works after fixed media workflow deletion.
- [ ] 7.3 Add a boundary case poisoning all retired media workflow imports/exports and proving no stage, workflow state store, recovery coordinator, project-authoring orchestrator, pre-export orchestrator, or prompt-chain checkpoint state participates.
- [ ] 7.4 Add a creator-review/approved-execution case proving generic ApprovalEngine handles review while the actual costly or mutating Tool still passes its own current approval.
- [ ] 7.5 Reuse or update focused illustration-technique and character-reference cases for dynamic technique selection, actual generated output observation, bilingual content constraints, and no Provider-specific/fallback pipeline.
- [ ] 7.6 Add a core-ablation case proving the same creative Skill/Tool/subagent path works with all creative-core specializations absent, and fails visibly only when the owning extension itself is unavailable.

## 8. Documentation, Validation, And Quality Review

- [x] 8.1 Align the Agent-directed orchestration ADR, Plan Mode/Agent architecture, and relevant domain documents with minimal Agent ownership, native Approval, optional Markdown, removed fixed workflow runtime, and owning-package follow-ups.
- [ ] 8.2 Run focused `@neko/shared`/Agent contract and Approval tests, affected package typechecks/builds, and `openspec validate --strict`.
- [x] 8.3 Run `pnpm check:legacy-debt`, `pnpm check:unused`, and architecture/protocol-backflow guards; prove removed workflow and creative approval-policy paths cannot return success.
- [ ] 8.4 Run `pnpm test:agent:eval` as harness validation and the focused real Agent cases selected in section 7; record model/provider identity, canonical path, forbidden fallback, outputs, blocked evidence, and residual risk.
- [ ] 8.5 Run applicable repository `pnpm check`, `pnpm test`, and `pnpm build` gates proportional to the cross-package L3 change; run Extension Development Host scenarios only if user-visible Webview behavior changes.
- [x] 8.6 Run `neko-quality-review`, record five-layer ownership findings and remaining owning-domain capability gaps, and do not declare the whole creative capability complete while those external gaps remain.
