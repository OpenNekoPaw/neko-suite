## 1. Profile And Config Foundation

- [x] 1.1 Add a harness config model for `mock.toml` and `config.toml` test runs with explicit environment/command parsing and no automatic fallback between files.
- [x] 1.2 Add file-path injection for the file-backed user config manager, preserving the default `~/.neko/config.toml` behavior when no explicit test path is provided.
- [x] 1.3 Add redacted example `mock.toml` and `config.toml` fixtures/docs, without real credentials.
- [x] 1.4 Add tests proving explicit config selection records mode/config path and fails visibly when `config.toml` is missing.
- [x] 1.5 Add tests proving real config selection does not fall back to mock, another config file, another provider, or another model after config/provider/model failure.

## 2. Shared Harness Utilities

- [x] 2.1 Add `packages/neko-agent/test-utils/src/real-api/` helpers for mock/real config loading, timeout options, and run evidence metadata.
- [x] 2.2 Add a Platform harness factory that returns a real `Platform` service for real profiles and a scripted service for mock profiles.
- [x] 2.3 Add an Agent harness factory that creates temp workspaces, safe tool registries, runtime/session dependencies, and cleanup hooks.
- [x] 2.4 Add an event recorder that captures Agent events, provider/model identity, profile, diagnostics, artifacts, tool calls, task/media updates, status, and timing.
- [x] 2.5 Add shared assertions for streamed content, expected tool calls, tool results, validator diagnostics, recovery/escalation, timeout/cancel status, and final success/failure.

## 3. Platform Real API Lane

- [x] 3.1 Promote the existing Platform real API integration into an explicit `test:agent:real:platform` lane that is excluded from default `pnpm test`.
- [x] 3.2 Replace skip-on-missing-config semantics with fail-visible behavior for explicit real platform commands.
- [x] 3.3 Add real chat and chatStream smoke cases that assert selected provider/model identity and non-empty streamed or structured results.
- [x] 3.4 Add negative cases for missing provider, disabled provider, missing model, mismatched model type, and unavailable credentials, proving no fallback provider/model is invoked.
- [x] 3.5 Confirm media is not a separate real harness profile in this change; media/task projection remains covered by Agent/TUI/GUI event assertions.

## 4. Agent Real Workflow Lane

- [x] 4.1 Add `test:agent:real:workflow` script and test include pattern that runs only explicit real Agent workflow cases.
- [x] 4.2 Add a safe tool-call case where the real model must call a registered read-only or temp-workspace tool and use the result before completion.
- [x] 4.3 Add a validator diagnostic repair case that records the initial diagnostic and asserts repair, recovery escalation, or visible failure.
- [x] 4.4 Add an IDC creation case that records Draft/Plan/Apply evidence without treating review/evaluation as a new IDC stage.
- [x] 4.5 Add a failing-tool recovery case that asserts retry, repair, escalation, or final failure using structured events.
- [x] 4.6 Fix or guard any runner/harness path that currently converts error, timeout, or cancellation into `success: true`.

## 5. TUI Real Runtime Lane

- [x] 5.1 Add `test:agent:real:tui` script targeting `packages/neko-agent/packages/cli-tui`, not the deprecated CLI path.
- [x] 5.2 Add a TUI real stream projection test that submits through the supported TUI session path and asserts streamed output appears in TUI state/projection.
- [x] 5.3 Add TUI projection tests for real or harness-generated tool call, tool result, error, timeout, cancellation, recovery, and task/media progress events.
- [x] 5.4 Clean stale deprecated CLI script/include references that would misdirect real harness execution, or convert them to explicit diagnostics.
- [x] 5.5 Add focused mock TUI tests proving the same projection assertions work without real API for default CI.

## 6. GUI Real Runtime Lane

- [x] 6.1 Add `test:agent:real:gui` or documented equivalent that runs through VS Code Extension Development Host and the `vscode-extension-debugger` Skill path.
- [x] 6.2 Add GUI runtime evidence collection for visible Agent Webview target, selected profile, provider/model identity, and message bridge activity.
- [x] 6.3 Add GUI real stream projection validation for assistant text, tool timeline rows, task cards, media cards, diagnostics, cancellation, and recovery.
- [x] 6.4 Ensure GUI real validation does not accept browser-only, jsdom-only, Chrome-only, Playwright-only, or Vite localhost evidence as VS Code runtime acceptance.
- [x] 6.5 Record residual risk and closing steps when VS Code runtime smoke cannot run on a developer machine.

## 7. Optional Evaluator Hooks

- [x] 7.1 Define a stable JSON evidence output format that promptfoo or DeepEval can consume without replacing internal assertions.
- [x] 7.2 Add optional evaluator command placeholders or docs for promptfoo prompt regression and DeepEval quality scoring.
- [x] 7.3 Add tests or fixtures proving evaluator output is treated as supplemental evidence and cannot mark a failed internal harness run as passed.

## 8. Scripts And Documentation

- [x] 8.1 Add root/package scripts for `test:agent:mock`, `test:agent:real`, `test:agent:real:platform`, `test:agent:real:workflow`, `test:agent:real:tui`, and `test:agent:real:gui`.
- [x] 8.2 Document config env vars such as `NEKO_AGENT_TEST_PROFILE`, `NEKO_AGENT_TEST_CONFIG`, `NEKO_AGENT_REAL_API`, `NEKO_AGENT_TEST_WORKDIR`, and timeout controls.
- [x] 8.3 Document that default CI remains mock-only and that explicit real commands fail on missing config, provider, model, credentials, or unsupported media.
- [x] 8.4 Document the supported validation surfaces: Platform and Agent core harnesses, TUI user entry, GUI VS Code Webview runtime, and deprecated CLI exclusion.
- [x] 8.5 Document that Agent development affecting provider/model, prompt/Skill, tool schema, workflow, validator/recovery, or live TUI/GUI projection must attempt the relevant real API lane with explicit `config.toml`, while CI remains mock-only.

## 9. Validation

- [x] 9.1 Run focused config/profile tests for the config manager and harness profile loader.
- [x] 9.2 Run focused mock harness tests for Agent event recorder, safe tools, assertions, validator diagnostics, and recovery cases.
- [ ] 9.3 Run `pnpm test:agent:real:platform` with a valid `config.toml` and record provider/model evidence.
- [ ] 9.4 Run `pnpm test:agent:real:workflow` with a valid `config.toml` and record tool-call, validator, IDC, and recovery evidence.
- [ ] 9.5 Run `pnpm test:agent:real:tui` or record residual risk if terminal runtime constraints prevent execution.
- [x] 9.6 Run `pnpm test:agent:real:gui` or equivalent VS Code debugger Skill smoke, or record residual risk and closing steps.
- [ ] 9.7 Run `pnpm test` to prove default CI remains mock-only and does not require real API credentials.
- [x] 9.8 Run `pnpm check` or a documented narrower quality validation set for the touched packages and scripts.

### Validation Notes

- 2026-06-30: Focused config/profile, mock harness, TUI projection, and Extension bootstrap config-injection tests passed through direct Vitest binaries because the local `pnpm` wrapper performs an install preflight with pnpm 11 and fails on ignored build scripts before running package scripts.
- 2026-06-30: `NEKO_AGENT_REAL_API=1` Platform and Agent workflow lanes fail visibly without `NEKO_AGENT_TEST_CONFIG`, as intended. The harness now supports only `mock.toml` and `config.toml`; 9.3 and 9.4 remain open until a valid real `config.toml` with credentials is available.
- 2026-06-30: TUI projection tests passed for the harness event path. The explicit `pnpm test:agent:real:tui` lane now uses `vitest.real-api.config.ts`, excludes the real TUI file from default Vitest, and fails visibly without `NEKO_AGENT_TEST_CONFIG` instead of passing through mock projection only. A full real API TUI run remains open until a valid `config.toml` is available.
- 2026-06-30: VS Code debugger port `9222` was available and `scripts/smoke-agent-real-gui.mjs` reached a `neko.neko-agent` Webview target, but the target did not expose the Agent shell/bridge/projection DOM required for acceptance. GUI real runtime acceptance remains residual risk until the Extension Development Host is launched with `NEKO_AGENT_REAL_API=1` and `NEKO_AGENT_TEST_CONFIG` pointing at `config.toml`, the Neko AI Webview is visible, and the GUI smoke passes.
- 2026-06-30: `pnpm test -- --run` and `pnpm check` were attempted but stopped before test/check execution because pnpm 11 reported ignored build scripts. Re-running `pnpm_config_verify_deps_before_run=false pnpm test -- --run` reached the normal Turbo/Vitest layer without requiring real API credentials, then failed in `@neko-agent/webview` Canvas Markdown handoff tests from the parallel creative-table/canvas workstream (`ContentBlockItem`, `MessageList`, `CompositeRenderers`, `conversation-ui-presenter`, `canvas-markdown-handoff-presenter`, and role-session presenter tests). Because the root default test command still does not pass end-to-end, 9.7 remains open. Narrower quality gates passed: `node scripts/check-neko-agent-boundaries.mjs`, `node scripts/check-webview-boundaries.mjs`, and `node scripts/check-openspec.mjs`.
