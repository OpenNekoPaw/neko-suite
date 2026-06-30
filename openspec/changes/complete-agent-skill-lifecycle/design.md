## Context

`neko-agent` currently mixes three concepts that need separate ownership:

- `SkillService` is intentionally stateless and prepares `SkillInjection` payloads.
- `ConversationSkillRuntime` stores one active Skill per conversation.
- `SkillInjectionCoordinator` is the single active injection owner and mutates prompt sections, permission allow rules, ToolGuard state, and ToolSet activation.

This works for one user-selected domain Skill, but it does not cover the lifecycle now required by IDC and richer Agent workflows:

- IDC stage persona and domain Skill are different semantic slots.
- A user may explicitly invoke a domain Skill while Agent also needs a turn-scoped helper Skill.
- Some Skills should expire after a turn, stage, workflow, inactivity window, or explicit user clear.
- Deactivation needs to know whether the record is user-clearable, runtime-owned, or locked by IDC/approval state.
- Multiple active records can conflict through prompt semantics, `allowedTools`, model override, run/stage ownership, or slot exclusivity.

The design must preserve the accepted Agent-first boundary: natural-language requests are not routed by Extension/Webview keyword matching. The main Agent can inspect catalog metadata through `GetContext` and explicitly call `ActivateSkill`; user-visible `$skill` / `invokeSkill` remains explicit.

## Goals / Non-Goals

**Goals:**

- Make active Skill lifecycle a typed per-conversation state model.
- Compose every Agent turn from lifecycle state instead of treating prompt/tool mutations as canonical state.
- Support multiple active records only through typed slots and deterministic conflict policy.
- Allow automatic dynamic injection and cancellation through runtime-owned events: stage transition, turn expiry, inactivity expiry, workflow completion, and explicit deactivation.
- Make deactivation policy visible and fail-visible.
- Preserve current Skill files and Skill catalog behavior.
- Add path-level tests proving canonical lifecycle projection is hit and legacy single-slot success paths do not mask failures.

**Non-Goals:**

- Do not restore Extension/Webview natural-language Skill candidate routing.
- Do not make Skill a workflow engine or replace IDC Draft/Plan/Apply.
- Do not support arbitrary unordered multi-Skill prompt concatenation.
- Do not introduce cloud-scale policy services, distributed state, or remote tenancy abstractions.
- Do not change Rust engine or Protobuf contracts.
- Do not require existing `SKILL.md` files to add new frontmatter.

## Decisions

### Decision 1: Active Skill state becomes `SkillLifecycleRecord[]`

Introduce a host-agnostic lifecycle state in `@neko/shared` or `@neko/agent` public runtime types:

```ts
type SkillLifecycleSlot =
  | 'stagePersona'
  | 'domainSkill'
  | 'referenceSkill'
  | 'ephemeralSkill'
  | 'workflowSkill';

type SkillLifecycleOwner = 'user' | 'agent' | 'idc' | 'runtime';

type SkillLifecycleLifetime =
  | { kind: 'turn'; turnId: string }
  | { kind: 'conversation'; untilCleared: true }
  | { kind: 'idc-stage'; runId: string; stage: IdcStage }
  | { kind: 'workflow'; runId: string }
  | { kind: 'inactivity'; maxIdleTurns: number };

interface SkillLifecycleRecord {
  id: string;
  conversationId: string;
  skillName: string;
  slot: SkillLifecycleSlot;
  owner: SkillLifecycleOwner;
  lifetime: SkillLifecycleLifetime;
  injection: SkillInjection;
  skillSummary: SkillContextSummary;
  status: 'active' | 'expiring' | 'expired' | 'blocked';
  deactivation: {
    clearableByUser: boolean;
    clearableByAgent: boolean;
    clearableByRuntime: boolean;
    lockedReason?: string;
  };
  createdAt: number;
  lastUsedTurn: number;
  source: 'explicit-user' | 'explicit-agent' | 'idc-stage' | 'runtime-expiry';
}
```

Rationale: The record is the source of truth. Prompt sections, tool policy, and UI indicators are projections. This avoids symmetric cleanup bugs where previous mutations must be perfectly reversed.

Rejected alternative: keep `SkillInjectionCoordinator` as the single mutable state owner and add a stack. That would preserve mutation coupling and make prompt/tool cleanup order fragile.

### Decision 2: Request-time projection is the canonical path

Every Agent turn SHALL build a `SkillLifecycleProjection` from active records:

```ts
interface SkillLifecycleProjection {
  promptSections: readonly PromptSectionInput[];
  toolPolicy: SkillToolPolicyProjection;
  modelOverride?: SkillModelOverrideProjection;
  diagnostics: readonly SkillLifecycleDiagnostic[];
  visibleIndicators: readonly ActiveSkillIndicatorProjection[];
}
```

Projection rules:

- `stagePersona` renders before `domainSkill`.
- `domainSkill` is single by default unless records are explicitly mergeable.
- `referenceSkill` can be multiple and contributes read-only guidance.
- `ephemeralSkill` expires at the end of the turn unless renewed.
- `workflowSkill` is scoped to a run/workflow and removed on completion or cancellation.
- Prompt section IDs include record ID and slot, for example `skill:domainSkill:quality-review:<recordId>`.
- Tool policy is recomputed from all active records each turn.

Rationale: Agent provider requests already need per-turn assembly for history, IDC stage, memory, environment, and tool schemas. Skill state should enter through that same assembly boundary.

Rejected alternative: re-run Skill discovery and injection on each natural-language request. This violates Agent-first Skill authority, wastes I/O/tokens, and causes multi-turn Skill drift.

### Decision 3: Activation is still explicit, but cancellation can be automatic

Valid activation sources:

- user explicit `$skill` / Webview `invokeSkill`;
- Agent explicit `ActivateSkill`;
- runtime-owned IDC stage activation for `stagePersona`;
- runtime-owned ephemeral activation requested by a typed internal path.

Automatic cancellation sources:

- turn end for `turn` lifetime records;
- IDC stage exit for `idc-stage` records;
- run/workflow completion or cancellation for `workflow` records;
- inactivity threshold for records whose lifetime allows inactivity expiry;
- explicit user/Agent deactivation when the record policy allows it.

Rationale: "Automatic dynamic injection/cancellation" means runtime lifecycle transitions, not pre-turn natural-language keyword matching.

Rejected alternative: have Webview decide which Skill to inject or clear based on typed text or UI candidate chips. That reintroduces the removed candidate-routing path.

### Decision 4: Deactivation is policy-checked

Add a deactivation evaluator:

```ts
interface SkillDeactivationRequest {
  conversationId: string;
  recordId?: string;
  slot?: SkillLifecycleSlot;
  skillName?: string;
  actor: 'user' | 'agent' | 'runtime';
  reason: 'explicit-clear' | 'turn-ended' | 'stage-exited' | 'workflow-ended' | 'inactive' | 'conflict-resolution';
}
```

It returns either records to remove or a fail-visible diagnostic.

Rules:

- User clear MAY remove `domainSkill`, `referenceSkill`, and user-owned `workflowSkill` records when unlocked.
- User clear SHALL NOT remove `stagePersona` records owned by IDC.
- Agent `DeactivateSkill` SHALL NOT remove runtime-owned records unless its actor policy allows it.
- Runtime expiry MAY remove records only when the lifetime matches the event.
- Clearing by `skillName` that matches multiple records SHALL fail and require record ID or slot.
- Unknown record ID or missing active record SHALL return an explicit no-active-record diagnostic for user/API paths, while internal expiry may be idempotent only when tied to an already completed event.

Rationale: Deactivation affects prompt and tool policy, so no-op success hides lifecycle bugs.

### Decision 5: Multi-Skill conflicts are slot-scoped and fail-visible

Conflict evaluation runs before activation and before projection:

- Same-slot rules:
  - `stagePersona`: one per active stage.
  - `domainSkill`: one by default.
  - `workflowSkill`: one per workflow role unless mergeable.
  - `ephemeralSkill` and `referenceSkill`: multiple allowed subject to token budget and explicit incompatibility.
- Cross-slot rules:
  - `stagePersona` and `domainSkill` are composable.
  - `domainSkill` and `workflowSkill` conflict if both declare incompatible operations or model overrides and no resolution strategy exists.
  - Tool restrictions conflict when the resulting policy cannot be expressed deterministically.
  - Model overrides conflict unless the higher-priority slot owns the model or runtime asks the user/Agent to choose.

Resolution strategies:

- `replace`: deactivate an existing clearable record and activate the new one.
- `merge`: create a deterministic projection from compatible records.
- `reject`: keep current records and return diagnostic.
- `ask`: require user or Agent to choose.

Rationale: Existing `SkillConflictResolver` can be reused as an implementation helper, but the canonical conflict contract must understand lifecycle slots and deactivation policy.

### Decision 6: Tool policy is projected, not incrementally mutated

The projection layer computes effective tool policy every turn:

- `allowedTools` from Skill records define Skill-scoped capability boundaries.
- Plan Mode, approval mode, IDC stage, workspace trust, and tool/provider availability remain higher-priority gates.
- Policy conflicts produce diagnostics instead of silently widening access.
- Existing PermissionHooks/ToolGuard integration becomes an adapter that receives the projected policy snapshot for the current turn.

Rationale: Incremental allow-rule add/remove is the highest-risk part of current cleanup. Recomputing from records makes cancellation deterministic.

Rejected alternative: union all `allowedTools` across Skills. That can accidentally widen permissions when a restrictive Skill is combined with a broad Skill.

### Decision 7: UI shows lifecycle records, not one active Skill string

Webview and CLI/TUI receive a projection:

```ts
interface ActiveSkillLifecycleProjection {
  conversationId: string;
  records: readonly {
    id: string;
    skillName: string;
    slot: SkillLifecycleSlot;
    owner: SkillLifecycleOwner;
    clearable: boolean;
    lockedReason?: string;
    expires?: string;
  }[];
}
```

Clear buttons target record ID or slot. Locked records are visible but not clearable.

Rationale: Users need to see why a Skill is active and why it may not be clearable.

### Decision 8: Legacy single active injection path fails closed after migration boundary

The change should keep current API surfaces working by mapping them to lifecycle operations:

- `$skill` activates a `domainSkill` lifecycle record.
- `ActivateSkill` activates a `domainSkill` lifecycle record unless the tool arguments later support `slot`.
- `DeactivateSkill` clears clearable `domainSkill` records by default.

However, production code should not leave a parallel single-slot state source. Tests should poison or spy on old paths to prove request projection is canonical.

Rationale: Prelaunch cleanup is allowed here because the old single-slot runtime is unreleased internal behavior and would mask new lifecycle bugs.

## Five-Layer Analysis

### Responsibility

- Skill catalog and loading: `SkillService` / registry remain stateless.
- Lifecycle state: new conversation-scoped runtime owns records and transitions.
- Projection: Agent runtime owns prompt/tool/model projections for each turn.
- IDC stage records: IDC runtime owns stage persona activation and expiry.
- Webview/CLI: display and dispatch typed lifecycle intents only.

### Dependency

- Shared lifecycle DTOs live in Layer 0 if they cross package boundaries.
- Extension adapters do not import React.
- Webview does not read Skill files or call VSCode APIs directly.
- Feature packages do not import other feature package internals.
- Rust engine remains unaffected.

### Interface

- Add typed activation/deactivation requests and lifecycle projection messages.
- Preserve existing `$skill`, `invokeSkill`, `ActivateSkill`, and `DeactivateSkill` entry points by mapping them to lifecycle requests.
- `GetContext` exposes active lifecycle summaries, not hidden candidate hints.
- Unknown slot, ambiguous record target, and locked deactivation return diagnostics.

### Extension

- New slots can be added by registering slot policy and projection ordering.
- New Skill metadata can influence lifecycle defaults without changing Webview routing.
- Future subagent/forked Skill execution can use a `forkedSkill` slot or isolated lifecycle store.

### Testing

- Unit tests for lifecycle state transitions, deactivation policy, conflict resolution, and projection ordering.
- Integration tests for `$skill`, `invokeSkill`, `ActivateSkill`, and `DeactivateSkill`.
- Runtime tests proving every turn recomputes prompt/tool policy from records.
- Webview protocol tests and VS Code Webview runtime smoke for multiple active indicators and clear buttons.
- Legacy path tests proving single-slot state cannot produce success after canonical projection is introduced.

## Risks / Trade-offs

- [Risk] More lifecycle types add complexity. → Mitigation: start with explicit slots and default existing Skills to `domainSkill`; reject unknown slots.
- [Risk] Tool policy projection may initially differ from old incremental allow rules. → Mitigation: characterization tests for current single-Skill behavior before replacing the implementation.
- [Risk] Multi-Skill merge semantics can become too broad. → Mitigation: default `domainSkill` to single active record and require explicit mergeability.
- [Risk] UI can become noisy with multiple indicators. → Mitigation: group by slot and show locked/expiring records compactly.
- [Risk] Agent may repeatedly activate/deactivate Skills. → Mitigation: include active lifecycle summaries and diagnostics in `GetContext`, and reject redundant activation unless renewal is explicitly allowed.
- [Risk] Existing tests expect no-op clear success. → Mitigation: distinguish user/API diagnostics from internal idempotent expiry events and update tests intentionally.

## Migration Plan

1. Add lifecycle contracts and characterization tests around current single-Skill activation/deactivation.
2. Introduce lifecycle runtime behind current entry points without changing UI behavior.
3. Implement request-time projection for prompt sections and tool policy, then make Agent turn assembly consume the projection.
4. Replace `SkillInjectionCoordinator` mutable active state with a projection adapter or remove its stateful ownership inside the target boundary.
5. Update Webview/CLI projections to show lifecycle records and clearability.
6. Enable stage persona/domain Skill coexistence and add locked deactivation diagnostics.
7. Add multi-record conflict handling and expiry events.
8. Remove or fail-close obsolete single active injection success paths.

Rollback strategy: because this is prelaunch internal runtime behavior, rollback means reverting the change and its tests. No durable user Skill files or project files require migration.

## Open Questions

- Should `DeactivateSkill` accept optional `slot` / `recordId` parameters immediately, or should scoped deactivation be a follow-up after default domain Skill behavior lands?
- Should `referenceSkill` be user-visible in the same indicator group as executable domain Skills?
- Should Skill manifest metadata later declare default slot/lifetime, or should only runtime callers choose slot/lifetime?
- What is the exact tool policy combination rule when two mergeable Skills both declare `allowedTools`? The conservative default should be intersection unless a slot policy explicitly chooses union for read-only reference guidance.
