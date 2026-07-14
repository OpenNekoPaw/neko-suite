## 1. Residual IDC And Planning Audit

- [x] 1.1 Inventory every production and test caller of `IdcStage`, stage activation matrix/planner/registry/tracker/guardian/dispatcher, `StagePersonaBinding`, IDC run identity, start/resume/restore, and stage events; classify each as delete, migrate, diagnostic-only, or test poison.
- [x] 1.2 Trace `AgentSession` bootstrap without IDC and record every Approval, preferences, logging, autoheal, validation, artifact/document, Task, and continuation dependency currently hidden inside `stageTracking`.
- [x] 1.3 Inventory `Draft`, `ExecutionPlan`, staged `Task`, creation artifact service/watcher/index, work-item projection, Markdown helpers, and UI callers; identify user-authored documents to preserve versus runtime-only state to remove.
- [x] 1.4 Inventory `creation-persona`, `execution-persona`, `iteration-persona`, `stagePersona` lifecycle, and creative-process helpers; record which guidance moves to system prompt, domain Skills, runtime, or deletion.
- [x] 1.5 Audit Plan Mode prompt, execution-mode guards, document writes, capability/tool availability, Approval, Webview/TUI mode projection, and current tests; record every software-only, IDC-coupled, side-effectful, or generic-plan behavior.
- [x] 1.6 Audit existing TaskManager, conversation task/progress projection, Webview task cards, TUI projection, async media Task view, and TODO-like state; choose the single reusable progress path and record why no TodoManager/PlanProgressStore is required.
- [x] 1.7 Add architecture boundary and poison tests that reject new IDC/stage/run/persona/executable-plan runtime concepts and fail if any retired path can return success for a new Agent request.

## 2. Decouple General Agent Services From Stage Tracking

- [x] 2.1 Refactor session bootstrap so EventBus and conversation/turn/tool/task event projection initialize from their owning configuration without `stageTracking` or an IDC run.
- [x] 2.2 Move ApprovalEngine, Tool traits/policy, confirmation, and preferences strategy loading out of the stage bootstrap; add tests proving normal sessions still ask/deny/allow correctly with all IDC paths poisoned.
- [x] 2.3 Move audit/step logging and workspace sinks to conversation/turn/tool/task identity; remove stage/run identity requirements and verify persisted logs remain isolated per conversation.
- [x] 2.4 Move autoheal and structured recovery diagnostics out of stage bootstrap; remove stage escalation dependencies while preserving bounded retry/recovery and fail-visible outcomes.
- [x] 2.5 Move validation coordinator, Tool-result validators, Quality feedback, and document/artifact watcher startup out of stage bootstrap; verify validation runs without stage identity.
- [x] 2.6 Verify async Task result observation, pending-message delivery, original-conversation wakeup, and ordinary ReAct continuation operate without active IDC, stage persona, or active Webview.
- [x] 2.7 Add regression tests for no-IDC Agent sessions covering read-only turns, normal Tool calls, high-cost approval, Tool failure recovery, Quality failure, async result continuation, and user cancellation.

## 3. Remove Fixed IDC Contracts And Runtime

- [x] 3.1 Remove fixed `IdcStage`, stage task-shape/entry-signal/activation decision contracts and exports from `@neko-agent/types`; migrate remaining non-IDC callers to conversation/turn/task or ordinary execution-mode contracts.
- [x] 3.2 Delete stage activation matrix, planner, registry, tracker, guardian, dispatcher, persona binding, and their production exports after replacement tests pass.
- [x] 3.3 Remove `stageTracking` from session/runtime/factory/config projection and delete `_stageTracker`, `_stageGuardian`, stage activation hooks, stage events, stage diagnostics, and cleanup paths.
- [x] 3.4 Remove IDC-specific run/start/resume/restore and persisted-stage success paths; retained migration boundaries must emit retired-state diagnostics and never recreate state.
- [x] 3.5 Remove `stagePersona` lifecycle slot, creation-stage lifetime, locked IDC record policy, and stage-enter/exit expiry; preserve domain/reference Skill lifecycle behavior.
- [x] 3.6 Migrate event, trace, work-item, narrator, task and UI contracts away from canonical IDC/run/stage identity; retain historical identifiers only under explicit diagnostic/test-history naming where unavoidable.
- [x] 3.7 Update architecture/debt scanners so unclassified production IDC/stage/persona/run terminology fails, while documentation history and poison fixtures remain explicit non-executable exceptions.

## 4. Retire Stage Personas And Converge Guidance

- [x] 4.1 Delete `creation-persona` and `execution-persona` automatic builtins and catalog/localization projections, or convert a proven user-explicit persona use case into a normal non-stage Skill with independent tests.
- [x] 4.2 Remove stage handoff, Draft-first, Apply-only, checklist-walking, stage autoheal escalation, and hidden creation-document instructions from all retained Skill content.
- [x] 4.3 Move the general rule “execution requests must not stop at a plan and completion requires Tool/runtime results” into the base system prompt with English/Chinese prompt tests.
- [x] 4.4 Move content analysis, creator decision, character consistency, technical selection, local repair, and review methods into the owning creative Skills without adding Tool names or protocols to natural-language Skill content.
- [x] 4.5 Update Skill lifecycle conflict, activation, deactivation, expiry, catalog, Webview/TUI presentation, and protocol-backflow tests after stage persona removal.

## 5. Creator-Review Documents And Creative Execution Plans

- [x] 5.1 Define reusable prompt/Skill guidance that separates observed content facts, Agent interpretation, creator decisions, and executable actions for document, image, audio/video, and existing-project sources.
- [x] 5.2 Define optional `brief.md` guidance for target, source evidence, interpretation confidence, alternatives, unresolved questions, creator decisions, and approval scope; do not add a new Draft DTO or required file path.
- [x] 5.3 Define optional living `plan.md` guidance for deliverables, current inputs, approved decisions, actionable work units, acceptance, recovery, approval boundaries, progress, discoveries, decisions, and actual outputs.
- [x] 5.4 Add plan validation/guidance tests proving every applicable work unit identifies object, trigger/skip conditions, inputs, capability intent, constraints, output, acceptance, failure branch, dependencies, and approval requirement.
- [x] 5.5 Add negative tests proving broad phase lists, unsupported capability claims, resolved executor/schema/handle persistence, Workflow node fields, and Markdown-triggered side effects are rejected or diagnosed.
- [x] 5.6 Update Host document/file integration so creator-review and plan documents remain ordinary authorized workspace Markdown with content digest when approval needs it; preserve existing user documents during runtime cleanup.
- [x] 5.7 Add scenarios proving simple low-risk operations bypass plan-file creation and existing approved domain documents are reused rather than duplicated.

## 6. Plan Mode, TODO Projection, And Approval Scope

- [x] 6.1 Replace the software-architect Plan Mode prompt with domain-neutral read-only planning guidance that can analyze actual creative content and produce execution-ready detail without side effects.
- [x] 6.2 Update Plan Mode Tool policy and tests so permitted reads/analysis and authorized document edits work, while media tasks, project/asset mutation, export, delivery, implicit Skill/persona activation, and IDC state remain impossible.
- [x] 6.3 Reuse the selected existing Task/progress projection for bounded TODO items with `pending`, `in_progress`, `completed`, and `blocked`; enforce at most one `in_progress` per executing Agent task.
- [x] 6.4 Add TODO path tests proving status edits do not invoke Tools, `completed` cannot satisfy file/project/Quality completion, deletion/rebuild is harmless, and session resume queries owning results instead of TODO text.
- [x] 6.5 Keep large shot/project progress in owning Storyboard/Cut/generated-output/Task results and project it into a bounded TODO view; prohibit copying full domain graphs into Agent progress state.
- [x] 6.6 Audit and minimally extend existing Approval contracts only if needed to bind plan digest/content, critical input identity, creative scope, cost/risk ceiling, mutation scope, and delivery boundary; do not add a PlanApprovalStore.
- [x] 6.7 Implement creator approval and replan rules: bounded reorder/batch split/equivalent capability/local repair remain in scope, while story/character/core style or sound/primary technique/cost-risk/mutation/delivery changes require renewed approval.
- [x] 6.8 Add Apply/continue tests proving the Agent re-reads current Markdown and files, resolves current Tools, and executes through normal lifecycle; no Plan-to-Apply compiler, old schema replay, or stage transition may participate.

## 7. Creative Skill And Tool Grounding

- [x] 7.1 Rewrite `media-production` from one fixed stage chain into evidence-first, creator-review, actionable-work-unit, execution-continuation, and recovery guidance with optional milestones.
- [x] 7.2 Update storyboard/image/video/video-editing/media-quality-review guidance so plans name real inputs, output kinds, acceptance and recovery semantics without leaking Tool protocol.
- [x] 7.3 Correct `media-production` Tool policy/contributions so activated guidance does not hide required owning capabilities or advertise a complete production path that current Tools cannot execute.
- [x] 7.4 Add explicit blocked/degraded/partial plan behavior for missing panel/OCR, character/reference, Storyboard, Animatic/Cut, Audio, Quality, Export, or other owning capabilities.
- [x] 7.5 Add content-grounded Skill tests for comic, screenplay, novel, illustration, existing Storyboard, and existing project cases; prove existing valid evidence causes skip/reuse rather than fixed document creation.
- [x] 7.6 Run Skill protocol-backflow tests proving creator-plan templates and work-unit examples do not contain Tool names, parameters, polling, Webview/path protocols, runtime handles, or package-private authoring schema.

## 8. UI, TUI, And Data Protection

- [x] 8.1 Remove remaining IDC/stage/persona/run indicators, controls, restore actions, protocol messages, i18n and fixtures that imply a separate creative workflow; normal conversation and execution-mode controls remain.
- [x] 8.2 Reuse existing Markdown editor/review, task/progress, approval/confirmation, diagnostic, generated-output and project-result surfaces; add no new orchestration or TODO management page.
- [x] 8.3 Update Webview/TUI projections so users can distinguish content evidence, creator decisions, plan work units, near-term TODO, approval scope, running Task, blocked diagnostic, and actual delivered files.
- [x] 8.4 Add migration tests proving user Markdown, Skill files, generated assets, `.nk*` projects, settings and trust state survive IDC runtime cleanup; runtime-only run/stage/persona/checkpoint state is rejected or discarded with a diagnostic.
- [ ] 8.5 Run affected Extension Development Host functional scenarios for Plan Mode, Markdown review/edit, creator approval, TODO progress, Tool confirmation, async result continuation, and actual result links; regular browser validation is supplemental only.

## 9. Agent Evaluations

- [x] 9.1 Extend the evaluation facts contract only as needed for source evidence, creator decisions, plan work-unit coverage, TODO projection, approval scope, selected Tool, output refs, diagnostics, replan reason, and IDC poison evidence; do not create an execution-plan runtime schema.
- [x] 9.2 Add a no-IDC plan-only case that reads an actual comic or screenplay and produces creator-review content plus actionable work units instead of an overall phase summary.
- [x] 9.3 Add a creator-review case where the user changes adaptation, character, style, technique, cost, or delivery scope and the Agent updates the Markdown and approval digest without executing side effects.
- [x] 9.4 Add an approved-execution case where the Agent calls real Tools, updates bounded TODO progress, consumes synchronous/asynchronous results, and produces actual files or owning project revisions.
- [x] 9.5 Add missing/degraded capability and Quality failure cases where the Agent records blocked/partial work, selects bounded recovery, or returns for material reapproval instead of claiming completion.
- [x] 9.6 Poison fixed IDC stage/run/persona/Draft/ExecutionPlan paths in every focused case and fail evaluation if any legacy event, fixture, state restore, or compatibility adapter participates.
- [ ] 9.7 Run ablations for creative Skill work-unit guidance, Plan Mode prompt, TODO projection, and creator approval scope; record which components materially improve concrete planning and execution.

## 10. Documentation And Quality Gates

- [x] 10.1 Update `docs/architecture/adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`, Agent/Plan Mode architecture, Skill authoring docs, and relevant media domain docs with the final no-IDC Plan/TODO/Markdown/Approval/Tool boundary.
- [x] 10.2 Update or supersede active OpenSpec artifacts that still describe fixed IDC, stage personas, staged Draft/Plan/Apply execution, mandatory executable-plan DTOs, or a parallel capability planning runtime.
- [x] 10.3 Run focused contract/unit/integration tests and affected TypeScript typechecks/builds; record commands, paths covered, and residual failures.
- [x] 10.4 Run `pnpm check:legacy-debt`, `pnpm check:unused`, prompt/Skill protocol-backflow checks, and scoped repository searches proving retired IDC production paths cannot return success.
- [x] 10.5 Run `pnpm test:agent:eval` as harness validation and all focused real Agent/provider cases with model/provider identity, actual input/output files, Tool path, Approval, diagnostics, and residual risks.
- [x] 10.6 Run `pnpm check`, `pnpm test`, `pnpm build`, applicable Webview functional scenarios, and `neko-quality-review`; classify the L3 risk and record blocked gates before completion.
