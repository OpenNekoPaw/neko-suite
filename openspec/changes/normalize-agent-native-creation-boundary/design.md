## Context

The accepted ADR `docs/architecture/adr-agent-native-creation-capability-boundary.md` makes Agent-native creation the only owner of creative lifecycle, stage, iteration, validation feedback, review, approval, state, artifact provenance, and capability invocation decisions. IDC becomes a creation profile. Skill workflow becomes prompt-chain guidance. Executable workflow runtime concepts are forbidden as future canonical Agent creation architecture.

Current code and active design artifacts still conflict with that boundary:

- `packages/neko-agent/packages/agent/src/runtime/agent-workflow-runtime.ts` implements `createRun`, `transition`, `cancel`, `complete`, and an IDC workflow definition.
- `packages/neko-agent/packages/agent-types/src/workflow.ts` exposes `AgentWorkflowDefinition`, `AgentWorkflowRun`, `AgentWorkflowNode`, and `AgentWorkflowTransition`.
- `packages/neko-agent/packages/agent-types/src/stage.ts` fixes `IdcStage` to `draft | plan | apply`.
- `packages/neko-types/src/types/skill-lifecycle.ts` mirrors fixed IDC stages and workflow lifetime terms.
- Webview composer controls recently exposed IDC start/resume/stop affordances under the input area.
- `introduce-agent-creation-iteration-contracts` moves in the right direction but still treats fixed IDC stages and workflow runtime as compatibility/bootstrap surfaces.

This change is a prelaunch breaking cleanup. It can break internal Agent DTOs, tests, fixtures, and runtime trace payloads, but it must not delete valuable user project files, media resources, Skill files, or generated assets.

## Goals / Non-Goals

**Goals:**

- Establish Agent-native creation contracts for dynamic creation profiles, stages, iterations, validation feedback, review decisions, and prompt-chain observations.
- Make `idc.default` a built-in profile data definition rather than a type-level stage boundary.
- Remove composer IDC controls and prohibit future global start/resume/stop workflow-style UI.
- Prove Skill prompt-chain observations do not create workflow runs/nodes/transitions.
- Downgrade or remove `agent-workflow-runtime.ts` and workflow DTO successful paths from new Agent creation behavior.
- Rename or deprecate `workflowSkill` semantics toward method/prompt-chain wording.
- Align active docs and tests with the new ADR.

**Non-Goals:**

- Build a general workflow/DAG engine.
- Build a visual workflow editor.
- Add a new domain-specific runtime for storyboard, Canvas, Cut, Model, or IDC.
- Move capability execution into Skill prompt text.
- Define a complete UI redesign for creation review cards beyond removing wrong controls and exposing projection contracts.
- Migrate durable project media/resource data; this change targets Agent runtime contracts and projections.

## Decisions

### Decision 1: Do not replace workflow with another creation runtime

Agent-native creation is not a new class, store, session DTO, or scheduler. It means the existing Agent session/turn loop, validator feedback, approval gates, artifact services, and capability lifecycle own creative lifecycle decisions. `@neko-agent/types` should not expose broad `AgentCreationSession`, `AgentCreationIteration`, `AgentCreationProfile`, validation, or review DTOs unless a concrete boundary needs them.

The only narrow shared contracts kept by this cleanup are:

- `AgentLegacyCreationTrace`, which quarantines old workflow ids as trace-only metadata.
- `AgentPromptChainObservation`, which records Skill method guidance adoption without defining executable nodes.

Rejected alternative: add a new `AgentNativeCreationRuntime` plus profile/session/iteration DTOs. That repeats the problem under a friendlier name.

### Decision 2: Workflow runtime becomes fail-closed legacy trace, then removable

New Agent creation paths must not call `AgentWorkflowRuntime.createRun`, `transition`, `activateNode`, or depend on `workflowRunId` for canonical identity. Where the old runtime remains temporarily, it must be labelled legacy and tests must poison it for new creation paths.

Rejected alternative: keep workflow runtime as a bootstrap plane. The ADR explicitly forbids independent runtimes before Agent-native creation, and a bootstrap plane would keep old architecture alive as a default fallback.

### Decision 3: Skill prompt-chain is observation-only

Skill prompt-chain use records observations such as:

- `started`
- `checkpoint`
- `skipped`
- `reordered`
- `completed`

Each observation links to `creationId`, `iterationId`, `skillName` or `skillRecordId`, and a `promptChainId`. It does not define executable nodes, transitions, retry policies, or a DSL interpreter.

Rejected alternative: define a prompt-chain plan schema. That recreates workflow under a friendlier name and contradicts the requirement that Agent autonomously decides the next action.

### Decision 4: Validation feedback is post-stream Agent feedback, not stream interception

The user should see the Agent's streamed draft normally. After the assistant message is complete, validators can run against target artifacts. Failures create Agent-native validation feedback and diagnostics; the Agent can then revise, continue, or ask the user.

Rejected alternative: block or rewrite streaming output before display. It would make behavior feel non-transparent and would still not guarantee the Agent understands why the artifact failed.

### Decision 5: Approval and capability side effects stay in Agent capability lifecycle

Stage profiles and Skills can declare review policies and capability hints, but approval state and side effects remain Agent-native/capability-lifecycle concerns. Canvas/Cut/Model/File adapters execute only through their typed capabilities and approval gates.

Rejected alternative: let Skill prompt-chain imply approval or execution. That hides side effects in prompt text and bypasses deterministic capability validation.

### Decision 6: UI projects Agent-native state, not workflow controls

Webview should show:

- current creation/profile/stage status,
- validator diagnostics,
- review/continue/regress actions,
- artifact cards,
- capability result actions.

It must not show global IDC workflow start/resume/stop controls under the composer. User feedback remains natural conversation, review actions, or explicit command/Skill invocation.

Rejected alternative: keep a hidden `showIdcWorkflowControls` gate. It encodes no product concept and invites future callers to resurrect the wrong UI.

## Five-Layer Analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Agent runtime owns creation state, iteration, validation feedback, review, approval, and capability decisions. Skills own method guidance. Domain packages own concrete capabilities and validators. Webview owns projection only. |
| Dependency | Shared contracts stay in `@neko-agent/types` or `@neko/shared` where needed. Webview must not import runtime. Extension routes messages but does not own stage strategy. Domain adapters must not import Agent internals. |
| Interface | New DTOs must be small, serializable, and validator-backed. Legacy workflow DTOs become non-canonical and must not be accepted as new creation identity. |
| Extension | New stage profiles are data/Skill descriptors. A storyboard profile, OpenSpec-like profile, or image prompt-batch profile can be added without adding a runtime. |
| Testing | Use contract/type-guard tests, poison-path tests for workflow runtime, targeted webview tests for composer control removal, prompt-chain observation tests, validator feedback tests, and compile checks. |

## Migration Plan

1. Delete workflow/IDC runtimes, stores, snapshot readers, explicit composer controls, and command routes that can still succeed as a separate creation engine.
2. Remove any replacement `AgentNativeCreationRuntime`, staged snapshot store, broad creation session/iteration/profile DTOs, and creation evaluation harnesses that recreate the same runtime boundary.
3. Keep prompt-chain observation helpers only as metadata recording; prove they do not create workflow nodes/runs.
4. Keep legacy workflow ids only inside `AgentLegacyCreationTrace`.
5. Migrate Skill lifecycle terminology away from `workflowSkill` and `idc-stage` where practical, with temporary aliases only if needed for current tests.
6. Run targeted tests and compile; record residual legacy surfaces that remain unreachable by canonical paths.

Rollback is limited because this is prelaunch cleanup. If a step breaks broad runtime behavior, keep the new contracts and temporarily fail-close old workflow calls with diagnostics rather than restoring old successful workflow execution paths.

## Risks / Trade-offs

- [Risk] Removing workflow runtime too quickly could break task/work item projection that still carries workflow identity. -> Mitigation: preserve work item correlation fields only as legacy trace, not canonical creation state, and add tests for creation identity without workflow ids.
- [Risk] Dynamic stage profiles can become a hidden DSL. -> Mitigation: profile descriptors are declarative constraints and prompt guidance only; no executable transitions or node handlers.
- [Risk] Skill authors may still use "workflow" language. -> Mitigation: Skill authoring validator and docs should prefer method/prompt-chain terminology and flag executable workflow claims.
- [Risk] Agent may ignore prompt-chain guidance if no runtime enforces it. -> Mitigation: use validator feedback, prompt-chain observations, review actions, and skill prompt clarity rather than a hidden executor.
- [Risk] Existing active change `introduce-agent-creation-iteration-contracts` conflicts with this change. -> Mitigation: update or supersede its design before implementation; do not implement its fixed IDC/workflow bootstrap assumptions.

## Open Questions

- Should legacy `workflowRunId` remain in work item DTOs as `trace.workflowRunId`, or be removed from new projections entirely?
- Should `workflowSkill` be renamed to `methodSkill` or `promptChainSkill` in the first implementation pass? The ADR allows either, but implementation should choose one canonical name.
