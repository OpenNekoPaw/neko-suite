## Temporary Legacy Shims

### SkillInjectionCoordinator Projection Bridge

- Owner: `packages/neko-agent/packages/agent`.
- Replacement path: `SkillLifecycleRuntime` owns `SkillLifecycleRecord[]`; every Agent turn projects records into prompt sections, tool policy, model override, and visible indicators.
- Temporary boundary: `SkillInjectionCoordinator` still applies the already-projected lifecycle payload to legacy `AgentSession` and CLI runner paths that expect one injected prompt/tool-guard payload.
- Current integration state: `agent-turn-runtime.ts` consumes `SkillLifecycleProjection`, checks blocking diagnostics, folds `projection.promptSections` and `projection.toolPolicy` into a synthetic single `lifecycle-projection` injection, and hands that payload to `agentRunner.applySkillInjection`. This makes lifecycle records/projection the canonical state boundary for the turn, but Track A prompt writes, permission allow rules, ToolGuard state, and ToolSet activation still flow through the legacy bridge.
- Forbidden use: new activation, deactivation, conflict policy, UI status, or clearability state must not be stored in `SkillInjectionCoordinator`.
- Validation: targeted lifecycle suites plus CLI/TUI Skill command tests; poison tests in `agent-turn-runtime.test.ts` must prove lifecycle projection blocks legacy active Skill fallback.
- Removal condition: direct `AgentSession.execute` consumes lifecycle projection before provider execution, and CLI/TUI no longer needs the single-payload adapter for prompt/tool guard wiring.

### ConversationSkillRuntime Active Skill Map

- Owner: `packages/neko-agent/packages/agent`.
- Replacement path: lifecycle records and `ActiveSkillLifecycleProjection` are the source of truth for active state, clearability, slot, owner, and expiry.
- Temporary boundary: `_activeSkills` remains a compatibility projection for older callers that still request one active `SkillApplicationResult` or legacy active Skill state. `_applySkill` currently activates/renews the lifecycle record and then updates `_activeSkills` through `applySkillInjection`.
- Forbidden use: new lifecycle decisions must not read `_activeSkills` as authority; conflict, deactivation, Webview status, CLI/TUI status, and turn projection must read lifecycle records.
- Validation: lifecycle deactivation tests must prove the next turn projection changes after record removal; compatibility tests may still assert the derived single active field until consumers are migrated.
- Removal condition: all remaining callers of `getActiveSkill`, `getActiveSkillState`, `clearActiveSkill`, and `SkillApplicationResult` single-active state are migrated to lifecycle summaries or scoped deactivation.

### Legacy SkillConflictResolver Interface

- Owner: `packages/neko-agent/packages/agent`.
- Replacement path: lifecycle activation uses slot-aware `resolveSkillLifecycleActivationConflict` over `SkillLifecycleRecord` and lifecycle slot policy.
- Temporary boundary: `ISkillConflictResolver`, `SkillConflict`, and string-list strategies remain for existing tests and any old Skill service consumers that have not yet moved to lifecycle records.
- Forbidden use: new lifecycle activation or projection code must not add dependencies on the string-list resolver API.
- Validation: lifecycle conflict tests must cover same-slot replacement/rejection, stage persona plus domain coexistence, tool policy conflict, and model override conflict.
- Removal condition: `rg` shows no production consumer of `ISkillConflictResolver`/`SkillConflict` outside the compatibility resolver tests, then the old API and tests can be removed or converted to lifecycle-only coverage.

### CLI/TUI Compatibility Fields

- Owner: `packages/neko-agent/packages/cli-tui`.
- Replacement path: `activeSkillLifecycleRecords` is the status source. `activeSkill` remains only a derived compatibility field for old selectors.
- Temporary boundary: the store may derive the first record name into `activeSkill`; command parsing and status rendering must use lifecycle records.
- Validation: `/skill off` ambiguity and scoped clear tests must show record/slot/name targeting rather than single active string clearing.
- Removal condition: all TUI components and menus consume lifecycle records directly.

### CLI Skill Command Handler

- Owner: `packages/neko-agent/packages/cli-tui`.
- Replacement path: `$skill` and command-backed slash handlers validate/load the Skill and return a lifecycle activation hint; `SkillLifecycleRuntime.activate` is the only path that renders the Skill injection.
- Temporary boundary: the CLI handler still owns command parsing and IDC execution metadata for prompt-chain Skill runs.
- Forbidden use: CLI handlers must not call `skillService.apply` as an independent success path for explicit Skill activation.
- Validation: `slash-commands.test.ts` asserts `$skill` no longer calls `skillService.apply`; TUI command tests assert `$skill` and command-backed slash commands activate lifecycle records before submitting prompt args.
- Removal condition: command parsing moves to a shared lifecycle-aware command runtime used by CLI, TUI, and Extension.

## Open Migration Questions

- Tool policy combination currently uses a conservative intersection for multiple restricted records. This preserves fail-closed behavior but can over-constrain composable Skills. `referenceSkill` may need a slot-specific rule so read-only guidance does not accidentally remove domain Skill tools.
- Renewals update `lastUsedTurn`; no `renewedAt` wall-clock field is currently part of the lifecycle contract. If wall-clock inactivity becomes a requirement, add an explicit field and tests rather than carrying unused timestamps.
