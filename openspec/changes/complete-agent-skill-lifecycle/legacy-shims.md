## Temporary Legacy Shims

### SkillInjectionCoordinator Projection Bridge

- Owner: `packages/neko-agent/packages/agent`.
- Replacement path: `SkillLifecycleRuntime` owns `SkillLifecycleRecord[]`; every Agent turn projects records into prompt sections, tool policy, model override, and visible indicators.
- Temporary boundary: `SkillInjectionCoordinator` remains for explicit activation compatibility and older single-payload runner paths, but Agent provider turns no longer use it to apply lifecycle projection.
- Current integration state: `agent-turn-runtime.ts` consumes `SkillLifecycleProjection`, checks blocking diagnostics, and calls `agentRunner.applySkillLifecycleProjection`. `AgentSession.applySkillLifecycleProjection` writes prompt sections, permission allow rules, ToolGuard state, and ToolSet activation directly from the projection snapshot, then clears any previous `SkillInjectionCoordinator` active state so it cannot mask lifecycle projection.
- Forbidden use: new activation, deactivation, conflict policy, UI status, or clearability state must not be stored in `SkillInjectionCoordinator`.
- Validation: targeted lifecycle suites plus CLI/TUI Skill command tests; poison tests in `agent-turn-runtime.test.ts` prove lifecycle projection is applied through `applySkillLifecycleProjection` and does not call `applySkillInjection`.
- Removal condition: remaining explicit activation and CLI/TUI compatibility callers no longer need the single-payload adapter for prompt/tool guard wiring.

### ConversationSkillRuntime Active Skill Map

- Owner: `packages/neko-agent/packages/agent`.
- Replacement path: lifecycle records and `ActiveSkillLifecycleProjection` are the source of truth for active state, clearability, slot, owner, and expiry.
- Temporary boundary: the `_activeSkills` map has been removed. `getActiveSkill` now derives a compatibility `ActiveSkillState` from lifecycle records, preferring `domainSkill` and then the first active record.
- Forbidden use: new lifecycle decisions must not read the derived single-active compatibility view as authority; conflict, deactivation, Webview status, CLI/TUI status, and turn projection must read lifecycle records.
- Validation: lifecycle deactivation tests prove the derived active Skill disappears when the lifecycle record is removed.
- Removal condition: remaining callers of `getActiveSkill`, `getActiveSkillState`, `clearActiveSkill`, and `SkillApplicationResult` single-active state are migrated to lifecycle summaries or scoped deactivation.

### Legacy SkillConflictResolver Interface

- Owner: `packages/neko-agent/packages/agent`.
- Replacement path: lifecycle activation uses slot-aware `resolveSkillLifecycleActivationConflict` over `SkillLifecycleRecord` and lifecycle slot policy.
- Temporary boundary: `ISkillConflictResolver`, `SkillConflict`, `SkillConflictResolver`, and `createSkillConflictResolver` are explicitly marked `@deprecated` as a compatibility bridge for string-list callers.
- Forbidden use: new lifecycle activation or projection code must not add dependencies on the string-list resolver API.
- Validation: lifecycle conflict tests cover same-slot replacement/rejection, stage persona plus domain coexistence, tool policy conflict, and model override conflict. `rg` shows no production consumer of `ISkillConflictResolver`/`SkillConflict` outside the resolver implementation and public re-exports.
- Removal condition: compatibility resolver tests are converted to lifecycle-only coverage and the public re-export window closes.

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

- `referenceSkill` is read-only prompt guidance: it renders prompt/indicator state, but it does not contribute `allowedTools` to effective tool policy and cannot narrow or widen executable Skill tool access.
- Renewals update `lastUsedTurn`; no `renewedAt` wall-clock field is currently part of the lifecycle contract. If wall-clock inactivity becomes a requirement, add an explicit field and tests rather than carrying unused timestamps.
