> **Superseded follow-up (2026-07-14):** completed work here is historical input to [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/). Do not extend `idc.default`, dynamic creation profiles/stages, stage personas, or prompt-chain observations as runtime state; the follow-up removes those residual paths while preserving ordinary Agent validation, approval, Skill, Task, and Tool behavior.

## 1. Contract Audit And Failing Tests

- [x] 1.1 Add architecture/contract tests that fail if new Agent creation paths call `AgentWorkflowRuntime.createRun`, `transition`, `activateNode`, `complete`, or `fail`.
- [x] 1.2 Add tests proving Agent creation/iteration identity works without `workflowRunId` or `workflowNodeId`.
- [x] 1.3 Add tests proving non-`draft/plan/apply` stage ids are valid when declared by a registered creation profile.
- [x] 1.4 Add tests proving Skill prompt-chain observations do not create workflow runs, workflow nodes, or workflow transitions.
- [x] 1.5 Add Webview tests proving normal Agent composer output does not render IDC/staged-creation start/resume/stop controls.

## 2. Agent-Native Creation Contracts

- [x] 2.1 Define Agent-native creation profile, stage definition, session, iteration, validation feedback, review decision, and prompt-chain observation DTOs in `@neko-agent/types`.
- [x] 2.2 Add type guards/validators for dynamic stage ids, profile ids, iteration payloads, validation feedback, review decisions, and prompt-chain observations.
- [x] 2.3 Add built-in `idc.default` profile data that declares `draft`, `plan`, and `apply` without exporting them as the global stage union for new code.
- [x] 2.4 Add a test fixture profile such as `storyboard.creation` with custom stages to prove profile extensibility.
- [x] 2.5 Update exports so new code imports Agent-native creation contracts instead of `workflow.ts` or fixed `IdcStage` where applicable.

## 3. Prompt-Chain And Skill Semantics

- [x] 3.1 Implement prompt-chain observation helpers for started, checkpoint, skipped, reordered, and completed events.
- [x] 3.2 Wire explicit Skill invocation paths to record prompt-chain observations when Skill execution metadata is present.
- [x] 3.3 Ensure prompt-chain observations link to creation id, iteration id, prompt-chain id, Skill identity, and optional reason/checkpoint metadata.
- [x] 3.4 Add or update Skill authoring validation to warn on executable workflow/DAG/runtime language unless it is clearly documented as prompt-chain guidance.
- [x] 3.5 Choose and document the canonical replacement term for `workflowSkill` (`methodSkill` or `promptChainSkill`) and add temporary migration aliases only where needed.

## 4. Validation Feedback And Review Loop

- [x] 4.1 Add Agent-native validation feedback records that are produced after an assistant message or artifact stream completes.
- [x] 4.2 Wire validators so failed profile output produces diagnostics that can be fed back to the Agent for revise/continue/ask-user behavior.
- [x] 4.3 Add review decision records for accept, reject, revise, continue, and regress actions.
- [x] 4.4 Ensure capability lifecycle results can attach diagnostics, review artifacts, changed refs, and next actions to the current Agent creation iteration.
- [x] 4.5 Add tests proving validator failure does not silently rewrite stream output or report success.

## 5. Remove Composer IDC Controls

- [x] 5.1 Remove `showIdcWorkflowControls` and related props from `InputArea`, `ChatView`, tests, and any caller.
- [x] 5.2 Remove composer-rendered IDC/staged-creation start/resume/stop button group and related CSS/i18n entries if unused.
- [x] 5.3 Remove or fail-close Webview-to-Extension routes that exist only to manually start/resume/stop IDC workflow controls from the composer.
- [x] 5.4 Add projection tests for staged creation status outside the composer toolbar, or record a residual UI projection task if no projection surface exists yet.

## 6. Legacy Workflow Runtime Isolation

- [x] 6.1 Mark `agent-workflow-runtime.ts` and workflow DTOs as legacy trace/projection only, or delete them if no canonical caller remains.
- [x] 6.2 Remove default creation/IDC/Skill code paths that create workflow runs or transitions.
- [x] 6.3 Add poison-path tests showing canonical Agent-native creation succeeds when legacy workflow runtime throws.
- [x] 6.4 Move any still-needed work item correlation fields under explicit legacy trace naming instead of canonical creation identity.
- [x] 6.5 Update `introduce-agent-creation-iteration-contracts` artifacts or mark them superseded where they still assume fixed IDC stages or workflow bootstrap behavior.

## 7. Documentation And Terminology

- [x] 7.1 Update `docs/architecture/agent.md` to align with Agent-native creation profiles and remove workflow runtime ownership language.
- [x] 7.2 Update ADR references that still describe IDC as a runtime or fixed global three-stage boundary.
- [x] 7.3 Update Skill authoring docs to describe method/prompt-chain skills and Agent-native stage profile extension.
- [x] 7.4 Update user-facing i18n/help text so workflow only appears as prompt-chain guidance where unavoidable.

## 8. Validation

- [x] 8.1 Run targeted `@neko-agent/types` tests for prompt-chain observation and legacy trace DTOs.
- [x] 8.2 Run targeted `neko-agent` runtime tests for Skill prompt-chain observations, validation feedback, review behavior, and workflow poison paths.
- [x] 8.3 Run targeted Webview tests for composer control removal and staged creation projection.
- [x] 8.4 Run `pnpm --dir packages/neko-agent run compile`.
- [x] 8.5 Run `rg`/quality checks proving new production code does not introduce `WorkflowRuntime`, `WorkflowRun`, `WorkflowNode`, or `WorkflowTransition` as canonical creation concepts.
- [x] 8.6 Record any remaining legacy workflow/idc naming as explicit residual risk with owner and removal condition.

## Residual Risks / Follow-Up

- UI projection follow-up: define richer Webview projection for validator diagnostics, review actions, artifact cards, and capability actions outside the composer toolbar. Owner: `neko-agent` Webview. Removal condition: task 5.4 can be replaced by a projection test that renders these surfaces without IDC start/resume/stop controls.
- Prompt-chain context follow-up: let explicit Skill invocation surfaces pass prompt-chain observation metadata when available, without creating a creation runtime/session first. Owner: `neko-agent` runtime/extension. Removal condition: explicit Skill invocation surfaces can record observations without manual metadata and without creating workflow runs.
- Artifact correlation follow-up: migrate remaining artifact write indexes and task projections from legacy IDC `runId` naming to Agent turn/artifact scope or `legacyTrace.runId`. Owner: `neko-agent` artifact runtime. Removal condition: artifact writes and task projections no longer imply an active IDC run.
- Output validation follow-up: legacy executor retry mode can still emit `assistant_text_replacement` and cause a second generated answer. Owner: `neko-agent` executor/validation. Removal condition: storyboard/profile validators default to Agent-native validation feedback and Agent revise/continue behavior instead of internal replacement for new creation paths.

## Legacy Naming Classification

- `AgentWorkflowRun`, `AgentWorkflowNode`, and `AgentWorkflowTransition` remain only in legacy trace/projection DTOs and compatibility tests. The concrete `AgentWorkflowRuntime` implementation and tests have been removed. Owner: `neko-agent` runtime. Removal condition: no Webview protocol, prompt schema, or artifact projection needs legacy workflow traces.
- `workflowRunId` / `workflowNodeId` remain only under explicit `AgentLegacyCreationTrace` and legacy fixture/assertion surfaces. Owner: `neko-agent` runtime. Removal condition: those surfaces accept Agent turn/artifact scope identity or no longer need legacy workflow trace metadata.
- `/idc`, `StartIDCWorkflow`, `showIdcWorkflowControls`, `idcWorkflowHandler`, `idc-workflow` activation targets, and `idcWorkflow` ablation toggles have been removed or renamed to creation-native/profile-guidance terms. Owner: `neko-agent` CLI/runtime/Webview.
