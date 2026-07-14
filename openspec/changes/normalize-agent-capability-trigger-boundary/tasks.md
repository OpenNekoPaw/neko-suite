> **Superseded IDC scope (2026-07-14):** Skill activation and execution-mode provenance remain valid. Do not implement or reopen IDC workflow/stage start, resume, advance, persona, restore, UI, CLI, or TUI success tasks below; [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) removes those paths and retains only retired-path diagnostics and poison coverage.

## 1. Contract And Characterization

- [x] 1.1 Add shared activation intent/result/provenance DTOs and diagnostics for `skill`, `idc-workflow`, `idc-stage`, and `execution-mode` targets.
- [x] 1.2 Add shared activation progress event DTOs covering request receipt, validation, loading/preparation, lifecycle record creation or renewal, projection, active completion, failed completion, and diagnostics.
- [ ] 1.3 Add characterization tests proving current natural-language Skill auto-activation can create `domainSkill` records before Agent output.
- [ ] 1.4 Add characterization tests proving current ordinary Agent turns can auto-start IDC runs and activate stage persona records.
- [ ] 1.5 Add characterization tests for current execution mode changes to prove they are mode-only UI actions and identify any hidden workflow coupling.
- [x] 1.6 Add path-level failing tests for the new boundary: ordinary natural-language Agent turns must not create Skill records, IDC runs, IDC stages, stage personas, or execution mode changes.
- [x] 1.7 Add prompt-pollution tests proving activation progress labels/events are not injected into Skill prompt sections.

## 2. Skill Trigger Boundary

- [x] 2.1 Remove or fail-close `AgentMessageTurnHandler.beforePrepareAgentTurn -> autoActivateSkillForTurn` as a pre-turn activation path.
- [x] 2.2 Change `ConversationSkillRuntime.autoActivateSkill` so natural-language discovery cannot call `SkillService.apply`, update `_activeSkills`, create lifecycle records, or emit `skillInjection`.
- [x] 2.3 Route `$skill`, Webview `invokeSkill`, and command-backed explicit Skill invocation through a user-explicit activation intent.
- [x] 2.4 Route `ActivateSkill` and `DeactivateSkill` meta tools through agent-tool activation/deactivation intents.
- [x] 2.5 Emit Skill activation progress events from the canonical runtime path without asking the model to narrate activation.
- [x] 2.6 Apply Skill activation as a transaction: lifecycle record, prompt projection, tool policy, ToolGuard state, ToolSet activation, model override, permission allow rules, visible indicators, and progress events must succeed together or fail without partial active state.
- [x] 2.7 Update Skill lifecycle records or projection to expose trigger provenance for UI and CLI/TUI.
- [x] 2.8 Replace tests that assert high-confidence natural-language Skill activation with tests that assert non-activating Agent context/catalog behavior.

## 3. IDC Workflow Trigger Boundary

- [x] 3.1 Remove or guard the default `AgentSession.execute -> startIdcRun` path for ordinary Agent turns.
- [x] 3.2 Add an explicit IDC workflow start/resume runtime API that requires a user-explicit or agent-tool activation intent.
- [x] 3.3 Add an Agent tool or canonical runtime command for Agent-requested IDC workflow start/resume with visible reason/provenance.
- [x] 3.4 Update ReAct loop stage planning so it only runs stage activation when an IDC workflow/run is active.
- [x] 3.5 Update `StagePersonaBinding` so stage persona activation requires an active IDC stage that belongs to an explicitly started or resumed IDC workflow.
- [x] 3.6 Update persisted IDC runtime restore so it exposes a visible resume/inactive diagnostic instead of silently resuming stage persona records.

## 4. Execution Mode Trigger Boundary

- [x] 4.1 Route Webview execution mode selector changes through an explicit user action message or activation intent.
- [x] 4.2 Ensure changing `plan`, `ask`, or `auto` execution mode does not start IDC, enter an IDC stage, activate a Skill, or activate a stage persona by itself.
- [x] 4.3 Add an Agent-requested execution mode change path only through a typed tool/result with visible UI feedback and confirmation where required.
- [x] 4.4 Update mode configuration tests for the decoupled execution mode and workflow behavior.

## 5. Webview, Extension, And CLI/TUI Projection

- [x] 5.1 Add UI projection for activation provenance: source, target, action, reason, owner, and clearability.
- [x] 5.2 Update active Skill/IDC indicators to explain whether state was triggered by user action, Agent tool, explicit resume, or runtime continuation.
- [x] 5.3 Add collapsed activation status rows and expanded activation event timelines for Skill, IDC workflow, IDC stage, and execution mode activation progress.
- [x] 5.4 Add or update Webview actions for explicit IDC start/resume/stop without overloading execution mode.
- [x] 5.5 Update Extension Webview message routing for new activation progress events and diagnostics.
- [x] 5.6 Update CLI/TUI commands/help for explicit Skill, IDC workflow, and execution mode triggers.
- [x] 5.7 Update i18n strings for trigger source labels, activation progress steps, hidden activation diagnostics, failed activation diagnostics, and resume prompts.

## 6. Legacy Cleanup

- [x] 6.1 Remove stale production references to host-side natural-language Skill activation success paths.
- [x] 6.2 Remove or fail-close legacy tests/fixtures that treat ordinary Agent turns as IDC workflow starts.
- [x] 6.3 Add poisoned legacy-path tests proving hidden Skill auto-activation and IDC auto-start cannot return success.
- [x] 6.4 Document any temporary compatibility shim with owner, replacement path, validation command, and removal condition.

## 7. Validation

- [x] 7.1 Run targeted Vitest suites for Skill handler/runtime, Agent message turn handler, Agent session IDC runtime, ReAct loop runner, mode configuration, and meta tools.
- [x] 7.2 Run Webview protocol/component tests for execution mode selector, explicit IDC controls, activation provenance indicators, collapsed activation rows, expanded activation timelines, and Skill invocation.
- [x] 7.3 Run transaction tests proving failed Skill activation leaves no prompt/tool/model/lifecycle/UI active residue.
- [ ] 7.4 Run `pnpm check` and record any residual type/lint risks.
- [x] 7.5 Run repository affected tests or `pnpm test -- --run` when feasible; record residual risk if full test is too large.
- [ ] 7.6 Run a focused `pnpm test:webview:functional` scenario with `vscode-extension-debugger` evidence for VS Code Webview behavior.
- [x] 7.7 Run `pnpm check:legacy-debt` or confirm equivalent coverage from `pnpm check:quality`.

Validation notes:

- 7.4: `pnpm check` is currently blocked before lint/type/dependency checks by pnpm 11 ignored-build approvals (`ERR_PNPM_IGNORED_BUILDS`). Direct `./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/cli-tui/tsconfig.json` runs but still reports existing/parallel strict TS issues outside the IDC/TUI trigger wiring path.
- 7.5: `cd packages/neko-agent && ./node_modules/.bin/vitest --run` ran 396 files / 4068 tests; 391 files passed and 5 existing/parallel tests failed outside the explicit IDC Webview/Extension/TUI path.
- 7.6: `node scripts/smoke-vscode-targets.mjs --skill vscode-extension-debugger --require-webview` passed and observed VS Code page + neko-agent Webview targets. This is environment preflight only; it does not execute the trigger UI or satisfy functional acceptance, so 7.6 remains open.
- 7.7: `node scripts/check-legacy-debt-surfaces.mjs` still fails on pre-existing blockers in `builtin-prompts.ts`, `validation-hooks.ts`, and `markdownCapabilities.ts`; current IDC/TUI trigger changes no longer add blocking hits.
