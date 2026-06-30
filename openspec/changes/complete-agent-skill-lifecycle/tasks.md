## 1. Contract And Characterization

- [x] 1.1 Add shared Skill lifecycle DTOs, slot enums, deactivation request/result types, projection types, and diagnostics in the appropriate Layer 0 or agent public contract module.
- [x] 1.2 Add characterization tests for current single-Skill `$skill`, `invokeSkill`, `ActivateSkill`, `DeactivateSkill`, prompt section injection, ToolGuard, and allow-rule behavior.
- [x] 1.3 Add failing path-level tests proving lifecycle records must become the source of truth for prompt/tool projection.
- [x] 1.4 Add tests for deactivation policy: clearable domain Skill, locked IDC stage persona, ambiguous Skill name, unknown record id, and internal expiry.
- [x] 1.5 Add tests for multi-Skill conflict cases: same-slot domain conflict, stage persona plus domain Skill coexistence, incompatible tool policy, and model override conflict.

## 2. Lifecycle Runtime

- [x] 2.1 Implement a conversation-scoped Skill lifecycle store with create, renew, list, expire, and remove operations.
- [x] 2.2 Implement lifecycle activation service that loads Skills through `SkillService`, validates enabled/content/subpackage/tool references, and creates lifecycle records.
- [x] 2.3 Implement deactivation evaluator with actor, slot, record id, lifetime, and lock checks.
- [x] 2.4 Implement expiry handlers for turn end, IDC stage exit, workflow/run completion or cancellation, and inactivity threshold.
- [x] 2.5 Integrate or replace existing `SkillConflictResolver` with slot-aware lifecycle conflict policy.

## 3. Request-Time Projection

- [x] 3.1 Implement Skill lifecycle prompt projection with deterministic slot ordering and stable section IDs.
- [x] 3.2 Implement Skill lifecycle tool policy projection without unsafe allow-list widening.
- [x] 3.3 Implement model override projection and conflict diagnostics.
- [x] 3.4 Update Agent turn assembly to pass lifecycle projection into every turn before provider execution.
- [x] 3.5 Replace lifecycle state ownership in `SkillInjectionCoordinator` with a request-time projection bridge and fail-closed legacy guards.
- [x] 3.6 Add runtime tests proving deactivation updates the next turn prompt/tool policy without relying on previous incremental cleanup.

## 4. Entry Points And Meta Tools

- [x] 4.1 Map `$skill` and command-backed Skill invocation to lifecycle activation requests.
- [x] 4.2 Map Webview `invokeSkill` to lifecycle activation requests without Webview-side Skill file access or slot inference.
- [x] 4.3 Update `ActivateSkill` to activate or renew lifecycle records and return lifecycle diagnostics.
- [x] 4.4 Update `DeactivateSkill` to support default domain Skill clearing and scoped lifecycle diagnostics.
- [x] 4.5 Update `GetContext` to include active lifecycle summaries and omit candidate hints.
- [x] 4.6 Add tests proving natural-language messages still do not pre-activate Skills through Extension/Webview routing.

## 5. IDC And Runtime-Owned Lifecycles

- [x] 5.1 Add IDC stage persona activation through lifecycle records.
- [x] 5.2 Add stage exit cleanup for IDC-owned records.
- [x] 5.3 Add workflow/run scoped lifecycle record cleanup on completion and cancellation.
- [x] 5.4 Add Plan Mode and approval gate tests proving Skill tool policy cannot bypass higher-priority runtime policy.
- [x] 5.5 Add diagnostics for attempts to clear IDC-owned locked stage persona records.

## 6. Webview And CLI/TUI Projection

- [x] 6.1 Replace single active Skill Webview projection with active lifecycle record projection.
- [x] 6.2 Update active Skill indicators to show slot, owner, clearability, lock reason, and expiry where available.
- [x] 6.3 Update Webview clear actions to target record id or slot-scoped deactivation requests.
- [x] 6.4 Update CLI/TUI Skill status and clear flows to handle multiple lifecycle records and ambiguity diagnostics.
- [x] 6.5 Update i18n/help text to distinguish activation, active lifecycle records, locked records, expiring records, and clearable records.

## 7. Legacy Cleanup

- [x] 7.1 Identify obsolete single active Skill state paths and mark the target replacement boundary.
- [x] 7.2 Remove or fail-close legacy single-slot activation/status success paths after lifecycle projection is wired.
- [x] 7.3 Add poisoned legacy-path tests proving lifecycle records are the canonical state source.
- [x] 7.4 Remove stale tests, fixtures, and projections that assume a single active Skill string.
- [x] 7.5 Document any temporary compatibility shim with owner, replacement path, validation command, and removal condition.
- [ ] 7.6 Replace the Agent turn projection-to-legacy `applySkillInjection` bridge with direct lifecycle prompt-section and tool-policy consumption in `AgentSession`.
- [ ] 7.7 Collapse `ConversationSkillRuntime._activeSkills` into a derived lifecycle projection or remove it after all consumers read lifecycle records.
- [ ] 7.8 Resolve `referenceSkill` tool-policy participation semantics and add slot-level tests for the chosen combination rule.
- [ ] 7.9 Retire or explicitly deprecate the legacy `ISkillConflictResolver` string-list API after lifecycle conflict consumers are migrated.

## 8. Validation

- [ ] 8.1 Run targeted Vitest suites for Skill lifecycle, Skill service, Agent turn runtime, meta tools, Webview message routing, and CLI/TUI Skill commands.
- [ ] 8.2 Run `pnpm check` and record any residual type/lint risks.
- [ ] 8.3 Run `pnpm test -- --run` or the repository-equivalent affected test command and record residual risk if full test is too large.
- [ ] 8.4 Run `pnpm smoke:webview:runtime` or equivalent `vscode-extension-debugger` validation for Webview active Skill indicators and clear actions.
- [ ] 8.5 Run `pnpm check:legacy-debt` or confirm equivalent coverage from `pnpm check:quality`.
- [x] 8.6 Update `packages/neko-agent/docs/skill-authoring.md` or architecture docs if lifecycle slots, clearability, or Skill manifest guidance becomes user-facing.
