## Context

`neko-agent` now has multiple capability systems with their own lifecycle rules:

- Skill lifecycle records and projection (`domainSkill`, `stagePersona`, `referenceSkill`, etc.).
- IDC workflow runs and stage transitions (`draft`, `plan`, `apply`).
- Agent execution modes (`plan`, `ask`, `auto`).
- Webview/Extension command surfaces (`/`, `$`, `@`, mode selector, clear buttons).

The current runtime still contains hidden activation paths:

- `AgentMessageTurnHandler.beforePrepareAgentTurn` calls `autoActivateSkillForTurn`, which can turn natural-language Skill discovery into an active Skill lifecycle record before the Agent reasons.
- `AgentSession.execute` starts an IDC run whenever a run store exists and no run is active.
- `AgentSession` can wire stage tracking whenever capability runtime provides Skill services, so stage persona records can appear without an explicit user-visible workflow start.
- Execution mode is a session setting that can be treated as a runtime default instead of a visible activation decision.

These paths make activation state observable only after it has already changed. The correct boundary is Agent-first and user-visible: initial activation of capabilities must be caused by explicit user intent or by the Agent calling a typed tool.

## Goals / Non-Goals

**Goals:**

- Make initial activation of Skill, IDC workflow, IDC stage, and execution mode explicit and auditable.
- Preserve Agent autonomy by exposing typed Agent tools for capability activation, not by host-side natural-language matching.
- Allow runtime-owned continuation only after a lifecycle has been explicitly started.
- Remove default hidden activation from normal Agent turns.
- Produce observable activation events for UI and tests, including source, target, requested actor, and reason.
- Fail visibly when old implicit activation paths are reached.
- Keep the design local-client scoped; no remote policy service or distributed state.

**Non-Goals:**

- Do not remove IDC itself, stage personas, or Skill lifecycle projection.
- Do not prevent the Agent from choosing to activate a Skill or start IDC; it must do so through tools.
- Do not reintroduce Extension/Webview natural-language candidate chips.
- Do not add cloud governance, tenant policy, or remote orchestration.
- Do not migrate Rust engine or Protobuf contracts.

## Decisions

### Decision 1: Introduce a canonical activation intent contract

Add a shared host-agnostic contract, likely in `@neko/shared` or `@neko-agent/types` if existing Agent contracts fit better:

```ts
type AgentCapabilityActivationSource = 'user-explicit' | 'agent-tool';

type AgentCapabilityActivationTarget =
  | 'skill'
  | 'idc-workflow'
  | 'idc-stage'
  | 'execution-mode';

interface AgentCapabilityActivationIntent {
  conversationId: string;
  source: AgentCapabilityActivationSource;
  target: AgentCapabilityActivationTarget;
  action: 'activate' | 'deactivate' | 'set' | 'resume';
  name: string;
  requestedBy: 'user' | 'agent';
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

Runtime methods that create initial lifecycle state must receive this intent or an equivalent typed source field. The intent is an audit and path-level validation boundary, not a policy service.

Rejected alternative: infer intent from call stack or message text. That repeats the current hidden-routing problem and cannot be tested reliably.

### Decision 2: Normal Agent turns do not start IDC

`AgentSession.execute` SHALL NOT call `startIdcRun` for ordinary turns just because a run store exists. IDC starts only when:

- the user explicitly selects a workflow/start/resume command;
- the Agent calls a typed workflow activation tool;
- a migration or restore path explicitly asks to resume a persisted IDC run and emits a visible event.

After IDC is active, ReAct loop stage planning may continue to advance stages and `StagePersonaBinding` may activate/expire stage persona records.

Rejected alternative: keep auto-start but show a banner. That explains the surprise after the fact but still mutates state without a trigger.

### Decision 3: Skill discovery becomes context only, never activation

Natural-language Skill discovery may remain available to the Agent via catalog metadata or non-activating context summaries, but it SHALL NOT call `SkillService.apply`, create lifecycle records, emit `skillInjection`, or update `_activeSkills`.

Explicit paths remain valid:

- `$skill` and Webview `invokeSkill` are user-explicit activation intents.
- `ActivateSkill` is an Agent-tool activation intent.
- Runtime expiry/clear is allowed only for records that already exist.

Rejected alternative: allow high-confidence artifact validators to auto-activate. This was useful for validation routing but violates the trigger boundary and duplicates Agent reasoning.

### Decision 4: Execution mode changes are explicit and observable

Execution mode (`plan`, `ask`, `auto`) remains user-selectable from the runtime toolbar. Agent-requested mode changes must be represented by a typed tool/result and surfaced to UI before changing durable/session state when user confirmation is required.

Mode affects how an active turn executes; it is not an IDC start command by itself. Selecting `ask` should not imply IDC, and selecting `plan` should not silently enter IDC unless the user also starts a workflow or the Agent requests one through the trigger boundary.

Rejected alternative: keep mode and workflow coupled because both affect stages. It makes UI labels misleading and explains the reported "IDC started with no operation" failure.

### Decision 5: Runtime follow-up transitions require an active owner

Runtime-owned events may advance or expire state only after explicit activation:

- IDC stage transitions require an active IDC workflow/run.
- Stage persona lifecycle requires an active IDC stage.
- Skill expiration requires an existing Skill lifecycle record.
- Workflow cleanup requires an active workflow/run id.

If a runtime event tries to create initial state without an activation intent, it returns a fail-visible diagnostic or emits an assertable log failure in development/test paths.

### Decision 6: UI shows activation provenance

Webview and CLI/TUI projections should show why a capability is active:

- source: user-explicit or agent-tool;
- target and action;
- reason string when available;
- current lifecycle owner and clearability;
- whether the capability was restored and requires explicit resume.

For example, `IDC Apply` should render as "Started by Agent: StartIDCWorkflow" or "Started by user: Resume workflow", not as a context-free badge.

### Decision 7: Activation progress is host-visible, not prompt-visible

Skill activation progress SHALL be represented as host/runtime events, not as extra instructions inside the Skill prompt. The Agent may see tool results and active lifecycle summaries when those are useful for reasoning, but the procedural steps used to validate, load, project, and display a Skill are not part of the Skill's system prompt.

The activation event stream should include stable steps such as:

- `requested`: user action or Agent tool requested activation;
- `validated`: runtime accepted the typed intent and resolved the target Skill;
- `loaded`: Skill content and referenced resources were loaded;
- `prepared`: Skill injection, tool policy, model override, and lifecycle metadata were prepared;
- `record-created`: lifecycle record was created or renewed;
- `projected`: prompt sections, tool policy, model override, and UI indicators were projected;
- `active` or `failed`: activation became effective or ended with diagnostics.

The UI should render this as a collapsed status row by default and expose a detailed event timeline on expansion. The collapsed row is a product affordance; it must not be assembled by asking the model to narrate the activation process.

Rejected alternative: inject activation progress into the Skill prompt so the Agent can explain it. That pollutes task instructions, increases token cost, and makes UI observability depend on model behavior.

### Decision 8: Skill activation is a lifecycle transaction, not prompt-only injection

Activating a Skill is not only adding Skill text to the system prompt. A successful activation may affect multiple projected surfaces:

- lifecycle record creation or renewal, including slot, owner, lifetime, clearability, and provenance;
- prompt section projection from the rendered `SkillInjection`;
- allowed tool policy and ToolGuard state;
- ToolSet activation when a Skill contributes tools;
- model override selection when the Skill declares one;
- permission allow rules where existing runtime policy requires them;
- visible Skill indicators and activation event timeline;
- conflict handling, replacement, renewal, expiry, and deactivation eligibility.

These effects SHALL be applied from canonical lifecycle projection. Webview and Extension routing must not duplicate prompt injection, tool guards, permissions, or model selection. If any part of the transaction fails before becoming active, the runtime SHALL emit a failed activation event with diagnostics and SHALL NOT leave a partially active Skill.

## Five-Layer Analysis

### Responsibility

- Layer 0/shared contracts define activation intents, sources, targets, results, and diagnostics.
- Agent runtime validates and applies intents to Skill lifecycle, IDC workflow, stage tracking, and execution mode, and emits activation progress events.
- Extension bridges user commands and Agent tool results into intents, then forwards activation progress without interpreting Skill internals.
- Webview displays controls, collapsed activation status, expanded activation timelines, and activation provenance; it does not infer capability activation from text.
- CLI/TUI maps explicit commands to the same intent contract.

### Dependency

- Webview does not call VSCode APIs directly; it sends typed messages.
- Extension owns VSCode command and Webview message routing.
- Agent runtime remains host-agnostic for lifecycle validation.
- No feature package imports another feature package internals.
- Rust engine is unaffected.

### Interface

- Add `AgentCapabilityActivationIntent`, activation progress events, activation result diagnostics, and UI event projection.
- Add or update Agent tools for workflow/mode activation if no suitable tools exist.
- Update existing `$skill`, `invokeSkill`, `ActivateSkill`, and `DeactivateSkill` paths to pass source/intent metadata.
- Update IDC start/resume paths to require an explicit intent.

### Extension

- New capabilities can register trigger targets without adding host-side natural-language routing.
- Additional workflows can reuse the same start/resume/stop intent shape.
- Future policy can be layered locally as validation around activation intent without changing Webview message semantics.

### Testing

- Unit tests for activation intent validation and fail-closed hidden activation.
- Integration tests proving normal Agent turns do not auto-start IDC or pre-activate Skills.
- Agent tool tests proving `ActivateSkill` and workflow activation still work.
- Webview protocol tests for user explicit messages, visible activation events, collapsed activation rows, and expanded activation timelines.
- Transaction tests proving failed activation does not leave partial prompt/tool/model/lifecycle state.
- Real VS Code Webview functional scenarios for mode selector, workflow start/resume controls, active lifecycle indicators, and runtime error gates.

## Risks / Trade-offs

- [Risk] Removing auto-start makes workflows require one extra explicit action. -> Mitigation: provide clear UI affordances and let Agent request workflow start with an explainable tool call.
- [Risk] Existing artifact validation depended on pre-activated Skills. -> Mitigation: move validation routing into Agent context/tool planning or explicit workflow activation.
- [Risk] Persisted IDC state could disappear from UI. -> Mitigation: show a restore/resume diagnostic instead of silently resuming or discarding state.
- [Risk] More typed activation plumbing touches many modules. -> Mitigation: keep the contract small and route existing entry points through it incrementally with path-level tests.
- [Risk] Agent tool-triggered mode changes can be surprising. -> Mitigation: surface Agent-requested changes and require approval for changes that alter tool execution risk.

## Migration Plan

1. Add activation intent/result contracts and diagnostics.
2. Add characterization tests for current hidden activation paths.
3. Fail-close natural-language Skill auto-activation and remove pre-turn Skill injection.
4. Stop normal Agent turns from auto-starting IDC runs.
5. Require explicit start/resume intent for IDC workflow and persisted IDC runtime state.
6. Route `$skill`, `invokeSkill`, `ActivateSkill`, `DeactivateSkill`, mode changes, and workflow start/resume through activation intents.
7. Add visible activation provenance to Webview/CLI projections.
8. Remove stale tests that assert natural-language pre-activation or default IDC start.

Rollback: this is prelaunch internal behavior. Rollback means restoring the prior implicit activation paths and tests, but no durable user project data migration is required.

## Temporary Compatibility Shims

- `AgentSession.startIdcRun(runKind, runId?)`
  - Owner: `packages/neko-agent/packages/agent`.
  - Current behavior: fail-closed diagnostic only. It emits activation progress with code `legacy-idc-start-rejected` and returns `null`; it does not create an IDC run, enter a stage, or activate stage persona state.
  - Replacement path: `AgentSession.startIdcRunWithIntent({ runKind, runId, intent })`, `StartIDCWorkflow` Agent tool, or a future explicit Webview resume/start command.
  - Validation command: `cd packages/neko-agent && ./node_modules/.bin/vitest --run packages/agent/src/session/__tests__/agent-session-boundary-characterization.test.ts packages/agent/src/session/__tests__/agent-session.test.ts packages/agent/src/tools/core/__tests__/meta-tools.test.ts`.
  - Removal condition: all internal callers and test fixtures use typed activation intents, and no external prelaunch integration imports `startIdcRun` directly.

## Open Questions

- Should Agent-requested execution mode changes require user confirmation in all cases, or only when moving to `auto`?
- Should persisted IDC state default to "resume available" or "inactive with diagnostic" on conversation restore?
- Should workflow start be a new Agent tool (`StartIDCWorkflow`) or a more generic `ActivateCapability` tool with target `idc-workflow`?
- Should UI expose IDC start as a distinct button or as an action in the Agent command menu?
