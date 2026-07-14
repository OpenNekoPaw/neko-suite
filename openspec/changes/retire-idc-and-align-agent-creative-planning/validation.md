# Validation Notes

## Risk and canonical path

- Risk: L3. The change crosses Agent contracts, session/runtime assembly, Approval, Task continuation, Skill/prompt injection, Extension/Webview/TUI projection, and real provider behavior.
- Canonical path under review: ordinary conversation/turn ReAct reads current files, applies optional domain Skill guidance, resolves current Tools, passes policy/Approval/validation, observes synchronous or asynchronous results, and delivers owning files/ResourceRefs/project revisions.
- Forbidden fallback: fixed IDC stage/run/persona, Draft/ExecutionPlan runtime, Plan-to-Apply compiler, creation-task projection, `EnterPlanMode`/`ExitPlanMode` Tool success, TodoManager/PlanProgressStore, or Markdown-triggered execution.

## Focused contract and integration verification

- Agent package: 226 files, 2556 tests passed, 1 skipped.
- Extension package: 74 files, 713 tests passed.
- TUI package after WorkItem-to-TODO production wiring: 92 files, 570 tests passed; the full TUI bundle build also passed.
- Focused Agent planning/runtime coverage: 3 files, 80 tests passed.
- Builtin Skill and retired-path poison coverage:

  ```bash
  pnpm exec vitest run packages/neko-skills/src/builtins/builtin-skills.test.ts packages/neko-skills/src/builtins/creative-media.test.ts packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts
  ```

  Result: 3 files, 81 tests passed. The builtin catalog has no Plan Mode Tool group, `EnterPlanMode`, or `ExitPlanMode`; the architecture guard rejects retired IDC/stage/persona/executable-plan production paths.

- Extension command/router/protocol coverage: 4 files, 131 tests passed.
- Webview migration and command presentation: 2 files, 7 tests passed; affected Webview typecheck passed.
- TUI Plan-review removal and bounded TODO projection: 4 files, 72 tests passed.
- Migration fixtures preserve user Markdown, Skill files, generated outputs, `.nk*` projects, settings, trust state, selected models, `executionMode`, and LLM settings while discarding runtime-only `promptMode`, IDC run, stage persona, and checkpoint fields.

## Repository gates

- `pnpm build`: passed, 33/33 Turbo tasks.
- `pnpm test`: passed, 48/48 Turbo tasks in about 3m42s.
- `git diff --check`: passed.
- Scoped production search found no matches for `IdcStage`, `stageTracking`, `StagePersonaBinding`, stage persona builtins, `EnterPlanMode`, `ExitPlanMode`, `planModeToolSet`, `PlanApprovalStore`, `TodoManager`, or `PlanProgressStore` in Agent/Extension/Webview/TUI/Skill production sources.
- `pnpm check:agent-boundaries`: this change's stale LCD references were removed and `lcdFindings` is now empty. The command remains failed on repository baseline: two expired failure-level compatibility exceptions, five expired warning-level exceptions, and an unrelated `cachePath` test finding.
- `pnpm check:unused` / `pnpm check`: failed on repository baseline: 3 unused files, 6 unused dependencies, 5 unlisted dependencies, 81 unused exports, and 1 duplicate export.
- `pnpm check:legacy-debt`: failed on repository baseline: 130 blocking findings, including 119 `migrate-now` and 11 `needs-review` findings.

Task 10.4 records the required scans as executed; these baseline failures are not represented as passing gates.

## VS Code Extension Development Host

Command:

```bash
pnpm test:webview:functional --owner neko-agent --debug-port 9222
```

- `agent.view-submit.p0`: passed. Evidence: `reports/webview-functional/agent.view-submit.p0/2026-07-14T18-21-57-921Z/result.json`.
- `agent.lifecycle-reload.p0`: all 12 operations and all 4 business/lifecycle assertions passed, including hide/reveal, reload, fresh-realm input, and stale projection removal. The final `no-runtime-errors` gate failed on host/environment noise, including a missing development path, unrelated marketplace 404s, extension-host warnings, large pre-existing extension state, and Node `punycode` deprecation. Evidence: `reports/webview-functional/agent.lifecycle-reload.p0/2026-07-14T18-21-21-556Z/result.json`.
- A focused Plan Mode Markdown scenario reached the real Webview, selected Plan Mode, submitted the request, invoked `Read` for `README.md` and `plan.md`, and reached a terminal tab state after the fresh-conversation realm race was removed. It then failed visibly because the Tool workspace root remained the attached test workspace, while the isolated scenario files were copied below the runner-owned `.neko/.functional/<run>/agent` fixture root. Evidence: `reports/webview-functional/agent.plan-markdown-review.p1/2026-07-14T21-19-24-510Z/result.json`.
- The Agent correctly reported both files missing and made no mutation. This is a functional-host fixture/workspace integration blocker, not a passing Plan/edit result. The approved Task scenario was not allowed to continue through Tool confirmation because its current relative file and generated-output paths would target the attached non-fixture workspace, violating the isolated synthetic-fixture requirement.
- The unsafe scenario drafts and their added fixture file were removed from scenario discovery after collecting the failure evidence, so the normal Agent functional suite cannot accidentally mutate the attached test workspace or present the blocked path as acceptance.
- Task 8.5 remains open. Closure requires an Extension Development Host whose actual workspace root is the synthetic fixture, or an equivalent host mechanism that binds Agent Tool IO and generated output to that fixture. Browser validation or changing file assertions alone cannot close the gate.

## Agent Evaluation

### Authoring decision and harness

- `skill.media-production`: updated for plan-only, creator replan, and missing/degraded capability behavior using the committed screenplay fixture.
- `agent-runtime.creative-media-workflow`: updated for approved execution, real image Task rounds, TODO projection, generated artifact validation, and IDC poison evidence.
- `pnpm test:agent:eval`: passed 40 files / 272 tests; strict dry-run passed 23 suites / 37 cases. This is harness validation, not real Agent acceptance.
- Facts were minimally extended with effective `executionMode` and derived per-turn TODO items. The deterministic `todo-projection` assertion is evidence only; it does not create a TODO owner or execution-plan schema.

### Real provider cases

Provider/model: `nekoapi-chat / gpt-5.6-luna`.

- `skill.media-production / animation-production-plan`, `run-mrl0bxng`: 6/6 assertions passed. It proves Plan Mode Skill activation, effective model, content-grounded planning output, no image/video side effect, and no retired fallback.
- `skill.media-production / missing-animation-capability`, `run-mrl0ka45`: 4/4 assertions passed. It proves explicit degraded/blocked behavior without legacy success.
- `skill.media-production / creator-scope-replan`, `run-mrl0r3o3`: 5/5 assertions passed. It proves creator material change and replan behavior.
- Earlier approved-execution runs `run-mrl1395x`, `run-mrl1kur1`, and `run-mrl1vovs` each passed 5/6 assertions. They proved real Tools, asynchronous Tasks, generated files, ResourceRef/digest, owning validator, and no-fallback behavior, but failed TODO because the runtime only projected TODO from model prose.
- The production gap was fixed without extending the Markdown parser: existing `AgentWorkItem` updates embedded in `AgentTurnTimelineAccumulatorUpdate` now flow through `projectAgentWorkItemsToTodo` into `conversation.message.todos`. The projection is capped at six items, exposes four statuses with at most one `in_progress`, is cleared/rebuilt per turn, and remains non-authoritative display state.
- Focused WorkItem/TODO path verification passed 3 files / 27 tests; full TUI verification passed 92 files / 570 tests and the TUI bundle rebuilt successfully.
- `run-mrl48rky` retained the first post-change failure evidence: both real Tasks and artifacts completed, but two provider empty-response errors failed `runtime`, and the first wiring version missed completed WorkItems carried inside timeline accumulator operations.
- Approved execution `run-mrl4hbbf`: 6/6 assertions passed with `nekoapi-chat / gpt-5.6-luna`. Two real image Tasks completed; runtime/order/terminal/TODO/artifact/no-fallback all passed; artifact refs were `res_koaqdz` and `res_o01vtz`; retries were zero.

Task 9.4 and Task 10.5 are complete. The harness and focused real-provider cases cover plan-only, material creator replan, missing/degraded capability, approved real Tool/Task execution, bounded TODO, generated artifacts, and retired-path poison evidence. Ablation remains the separate Task 9.7 gate.

### Ablation

- `media-production-guidance`, `ablation-mrl257q0`: Ask mode passed 2/3 samples; Plan mode passed 0/3, with one infrastructure timeout.
- The samples are not comparable enough to claim that Ask improves on Plan. The external implementation runner requires detached committed source revisions plus source, build-recipe, executable, and optional patch fingerprints. The current working tree contains 414 changed/untracked entries and the relevant Skill, Plan prompt, TODO projection, and creator-approval changes are not isolated committed revisions. Running them from the current checkout, using Evaluation-only flags, or manufacturing identities would violate the ablation contract.
- Creative Skill work-unit guidance, TODO projection, and creator-approval-scope implementation ablations therefore remain unexecuted. The Plan Mode configuration pilot also cannot substitute for those three implementation dimensions. Closure requires isolated committed baseline/variant revisions or reviewed patch targets, followed by repeated real-provider runs with stable model/configuration identity.

Task 9.7 remains open.

## Quality review and residual risk

- Architecture review found no need for a new planner, executor, artifact runtime, revision owner, operation button, TodoManager, or PlanProgressStore. Existing Agent Read/file IO, conversation, execution modes, Approval, Tool lifecycle, Task result observation, Markdown, generated-output, ResourceRef, and owning project revisions form the single path.
- The current change reduces coupling by deleting the IDC/stage/persona/creation-artifact success path and by keeping creative planning guidance in prompt/Skills rather than a second runtime.
- Remaining blockers are visible: focused Extension Host acceptance cannot bind Agent Tool IO to the isolated fixture; the full ablation matrix lacks isolated committed baseline/variant targets; repository `check`, legacy-debt, unused, and agent-boundary gates retain documented baseline failures. The approved real-provider execution now emits bounded structured TODO reliably and is no longer a remaining gap.
- Task 10.6 records the gate execution and L3 classification as complete. The failed repository gates remain explicit blockers to final change completion even though full build/test and the scoped change verification pass.
