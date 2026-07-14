## Why

> **Superseded follow-up (2026-07-14):** 本变更已删除 Workflow runtime 与 composer IDC controls，但遗留的固定 `IdcStage`、stage planner/tracker/guardian、stage persona、IDC run/artifact coupling 由 [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) 继续删除。该 follow-up 不保留 `idc.default` 或动态 creation stage 作为 runtime/profile 成功路径；Plan Mode、Markdown、TODO、Approval 和普通 Agent ReAct 取代其产品职责。

Agent creation is currently split between IDC runs, workflow runtime traces, Skill lifecycle records, prompt-chain guidance, validators, and creation iteration proposals. This makes the Agent feel like it is executing hidden workflow machinery instead of using its own native reasoning, feedback, validation, approval, and capability-invocation abilities.

This change implements the accepted ADR [`docs/architecture/adr-agent-native-creation-capability-boundary.md`](../../../docs/architecture/adr-agent-native-creation-capability-boundary.md): all creative lifecycle, stage, feedback, state, approval, and next-action decisions belong to Agent-native creation capability; IDC and Skill only constrain or extend that capability, and workflow is only Skill-authored prompt-chain guidance.

## What Changes

- **BREAKING**: Stop treating `AgentWorkflowRuntime`, `AgentWorkflowRun`, `AgentWorkflowNode`, and `AgentWorkflowTransition` as canonical Agent creation concepts. New Agent creation paths must not create workflow runs or nodes.
- **BREAKING**: Do not replace workflow/IDC with a new creation runtime or session/iteration DTO layer. Agent session/turn, validation, feedback, approval, artifacts, and capability invocation remain the native mechanism.
- **BREAKING**: Remove composer-level IDC start/resume/stop controls and the `showIdcWorkflowControls` UI gate. Stage state is projected through the conversation/status/artifact surfaces, not input toolbar buttons.
- Keep only narrow shared contracts that are actually needed at package boundaries: explicit legacy workflow trace metadata and prompt-chain observations.
- Feed validator diagnostics back to the Agent after streaming completes, allowing the Agent to revise or continue without silently replacing the streamed answer.
- Reframe Skill workflow as prompt-chain guidance only. Prompt-chain observations may record checkpoint/skip/reorder/complete events, but must not create executable nodes or transitions.
- Rename or deprecate misleading `workflowSkill` semantics toward `methodSkill`/`promptChainSkill` without adding another runtime.
- Mark existing workflow runtime types and APIs as legacy projection/trace, then remove default successful call paths from new Agent creation flows.
- Update docs, tests, and poison-path guards so future changes cannot reintroduce executable Agent workflow runtime concepts.

## Capabilities

### New Capabilities

- `agent-native-creation-boundary`: Defines that Agent-native session/turn/capability behavior owns lifecycle decisions; prompt-chain observations are metadata only, and legacy workflow execution concepts are prohibited.

### Modified Capabilities

- `agent-command-skill-trigger-boundary`: Stage/profile activation and prompt-chain Skill use must be visible Agent-native activation, not workflow start/resume commands.
- `agent-mode-configuration`: Composer/runtime mode controls must not imply or expose IDC/workflow start/resume/stop controls.

## Impact

- `packages/neko-agent/packages/agent-types`: prompt-chain observation DTOs, explicit legacy trace DTO, and removal of workflow/IDC runtime DTOs.
- `packages/neko-agent/packages/agent`: removal or isolation of `agent-workflow-runtime.ts`, removal of IDC/runtime snapshot stores, validator feedback loop hooks, prompt-chain observation emission, and tests.
- `packages/neko-agent/packages/webview`: removal of IDC composer controls, projection updates for Agent-native stages/diagnostics/review actions, i18n updates, and Webview tests.
- `packages/neko-agent/packages/extension`: removal or fail-closed handling of UI-routed IDC workflow control paths that imply a runtime workflow engine.
- `packages/neko-types`: Skill lifecycle lifetime/slot naming migration from IDC/workflow-specific terms toward Agent stage/profile and prompt-chain method semantics.
- `docs/architecture` and active OpenSpec changes: align older IDC/workflow wording with the new ADR and stop describing workflow runtime as a bootstrap plane.

Existing local conversations and test fixtures that only contain legacy workflow trace ids may be ignored or rebuilt during prelaunch. Valuable user files, generated media, resource refs, and Skill files must not be deleted; only Agent runtime trace/projection contracts are in scope for breaking cleanup.
