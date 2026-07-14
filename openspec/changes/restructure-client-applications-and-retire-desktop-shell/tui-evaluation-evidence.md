# TUI application-root evaluation evidence

Date: 2026-07-14

## Scope

- Canonical executable: `node apps/neko-tui/dist/main.js`
- Forbidden executable: `packages/neko-agent/packages/cli-tui/dist/cli.js`
- Provider/model observed: `nekoapi-chat` / `gpt-5.5`
- Effective configuration digest: `sha256:cab5b8af9235db02b5823061743327c25fef5a7d60289f712b26188214758ca6`

## Results

- `agent-runtime.single-message-tui/canonical-answer/app-root-migration-20260714`: canonical runtime, idle, turn, and non-empty answer hard gates passed. Overall infrastructure failure because `NEKO_AGENT_EVAL_JUDGE_ENDPOINT` was unavailable.
- `agent-runtime.workflow-controller/queue-during-run/app-root-queue-during-run-20260714`: passed runtime, queued, drained, ordering, terminal, and answer assertions.
- `agent-runtime.workflow-controller/cancel-resume-recovery/app-root-cancel-resume-recovery-20260714`: passed cancelled, recovered, terminal, and answer assertions.
- `agent-runtime.skill-runtime/explicit-builtin-injection/app-root-explicit-builtin-injection-20260714`: failed because the selected model returned two empty completions and the expected builtin Skill Host identity was not observed. The forbidden-fallback assertion passed.
- `agent-runtime.workflow-controller/task-continuation/app-root-task-continuation-20260714`: exceeded the scenario execution window without producing a result and was terminated.

## Decision

The previous runs accidentally used the legacy `packages/neko-agent/neko` binary because the Evaluation runner retained that default. The runner now defaults to `node apps/neko-tui/dist/main.js`; path-level tests reject the old binary and package-local executable paths.

- `agent-runtime.skill-runtime/explicit-builtin-injection/app-root-explicit-builtin-injection-20260714-canonical-app`: passed runtime, exact builtin storyboard Host identity/injection, and forbidden-fallback assertions through the app executable. A locale-dependent builtin fingerprint defect was fixed by retaining locale-neutral portable package identity during localized prompt projection.
- `agent-runtime.workflow-controller/task-continuation/app-root-task-continuation-20260714-canonical-app`: executed through the app executable and failed before any task or tool call because `nekoapi-chat/gpt-5.6-luna` returned two empty completions. Terminal-idle and all forbidden-fallback assertions passed; task completion, generated-output artifact, continuation order, `ReadImage`, and final answer remain unverified.
- Key-free harness after the canonical-path correction: 40 test files / 271 tests passed; strict discovery validated 26 suites / 38 cases.

Task 4.5 records the real canonical path, queue/cancel/recovery evidence, exact Skill injection evidence, the attempted artifact path, and forbidden-old-path evidence. The artifact behavior remains a target/provider failure and residual release risk; it is not reported as passing. Task 4.6 removes package-local product ownership because the app executable is now the sole tested and supported path, and retaining the old binary would violate the no-fallback requirement rather than mitigate the provider failure.

## Full source relocation decision

The repository dependency audit found that `apps/neko-tui` is the only production consumer of `@neko/cli`; the package root exports, component exports, and wildcard source exports have no other consumers. Evaluation already drives `apps/neko-tui/dist/main.js` at the process boundary. CI, change selection, architecture scans, and cross-host fixtures are tooling/test callers and do not justify a second product ownership root.

Evaluation authoring dispositions for the source relocation are `reuse`:

- `session-workflows` reuses `agent-runtime.workflow-controller` for queue, cancel, resume, persistence, and continuation behavior.
- `tui-debug-facts` reuses `agent-runtime.single-message-tui` plus workflow cases for the same evaluation-neutral fact contract.
- `tui-event-projection` reuses `agent-runtime.stream-delivery` and `agent-runtime.tui-markdown` for terminal projection behavior.

The user-visible behavior and evidence contracts do not change. The canonical path becomes `apps/neko-tui source -> input queue -> AgentSession`; forbidden fallbacks include `@neko/cli`, `packages/neko-agent/packages/cli-tui`, the removed `packages/neko-agent/neko`, and direct Agent runners. Key-free validation and focused real cases must be rerun after the move before tasks 4.4 and 4.5 are completed.

## Full source relocation results

- Key-free harness: 40 files / 271 tests passed; strict discovery validated 26 suites / 38 cases after Evaluation source selectors moved to `apps/neko-tui` and launch-contract coverage was strengthened.
- `agent-runtime.workflow-controller/cancel-resume-recovery/full-source-relocation-cancel-resume-20260714`: passed cancelled, recovered, terminal, and answer assertions through `apps/neko-tui/dist/main.js`.
- `agent-runtime.skill-runtime/explicit-builtin-injection/full-source-relocation-skill-20260714`: passed runtime, exact Skill injection, and forbidden-fallback assertions through the relocated app source.
- `agent-runtime.workflow-controller/queue-during-run/full-source-relocation-queue-20260714`: canonical runtime, queued, ordering, terminal, and answer assertions passed, but the case failed because one queued message remained at idle. The failure is retained as a workflow regression; the case was not retried into success.
- `agent-runtime.workflow-controller/task-continuation/full-source-relocation-task-20260714`: task completion, generated-output identity, durable artifact ref `res_1g8kgf0`, `ReadImage`, continuation identity/order, terminal state, and all forbidden-fallback assertions passed. The overall case failed because the generated asset source could not be resolved for native multimodal projection and the final answer was empty.

The relocation itself is path-complete: build, executable selection, Skill identity, cancel/resume, task/artifact continuation, and forbidden-old-path evidence all originate from the app root. Queue drain and generated-source projection remain real target/runtime failures and are not reported as passing behavior.

## Deterministic launch and focused-selection hardening

Authoring disposition: `excluded` from real provider-backed Evaluation. This follow-up changes only external Evaluation selection and process-launch contracts; it does not change Agent prompts, runtime, Skills, Tools, provider configuration, workflow behavior, or TUI fact projection.

- Canonical path: changed TUI app entry/build/debug/workflow/task/projection path -> coverage-index ownership -> focused suite selection -> `node apps/neko-tui/dist/main.js debug automation`.
- Forbidden fallback: an empty focused selection for TUI app entry/build changes, a partial owning-suite set, `@neko/cli`, `packages/neko-agent/packages/cli-tui`, or `packages/neko-agent/neko`.
- The selector now consumes coverage-index suite ownership and retains the existing primary suite only for the authoring-decision contract.
- Direct-prompt and v2 runners share one launch resolver while retaining explicit debug-command and isolated executable-prefix overrides.
- Focused deterministic tests passed: 5 files / 37 tests.
- Canonical TUI entry tests passed: 1 file / 2 tests.
- Full key-free Evaluation passed: 40 files / 271 tests; strict discovery validated 26 suites / 38 cases.
- No real case was rerun because the target Agent behavior and existing case contracts are unchanged. The previously recorded queue-drain and generated-source projection behavior failures remain release risks and were not weakened or retried into success.
