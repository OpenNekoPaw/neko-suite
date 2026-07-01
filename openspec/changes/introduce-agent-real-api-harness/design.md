## Context

`neko-agent` already has strong unit and mock integration coverage across runtime, prompt, skill, validator, platform, extension, webview, and TUI surfaces. It also has a small real API Platform integration test that reads `~/.neko/config.toml` and calls `chat` / `chatStream`, but that test is excluded from the default Vitest config and does not drive the Agent runtime.

The missing quality signal is the real-model autonomous path: a real provider must stream through `AgentSession`, choose tools, follow IDC-oriented instructions, react to validator diagnostics, and produce observable events that TUI and GUI surfaces can project. Mock tests remain essential for deterministic CI, but they cannot prove that current prompts, tool schemas, Skill instructions, and recovery guidance work with real models.

This change is a local test harness and validation change. It does not add a cloud orchestration service, a new production workflow engine, or a new public user-facing entry point. TUI and GUI remain the only user entry surfaces; `platform` and `agent` are internal core validation layers.

## Goals / Non-Goals

**Goals:**

- Add explicit file-backed harness modes for `mock.toml` and `config.toml` only.
- Keep default CI mock-only and key-free.
- Add real API harnesses for Platform provider smoke and Agent autonomous workflow validation.
- Add real API validation paths for TUI projection and GUI VS Code Webview runtime.
- Make explicit real API lanes fail visibly when `config.toml`, provider, model, credentials, streaming, tool calls, validator repair, or task assumptions are not met.
- Reuse the same event recorder and assertion helpers across mock and real runs where possible.
- Support an explicit real harness `config.toml` path so real harness runs do not mutate or implicitly depend on the user's default config.
- Record promptfoo and DeepEval as optional evaluator layers, not as replacements for internal flow assertions.

**Non-Goals:**

- Do not run real API tests in default `pnpm test` or ordinary PR CI.
- Do not test the deprecated CLI as a validation surface.
- Do not make Agent runtime automatically choose mock or real providers based on availability.
- Do not add automatic fallback from real API to mock, another config file, or another provider/model when `config.toml` fails.
- Do not add a remote test service, multi-tenant runner, queue service, or durable external evaluation database.
- Do not add additional harness config lanes beyond `mock.toml` and `config.toml`.
- Do not store real provider credentials, API keys, or user-specific config in repository fixtures.

## Decisions

### Decision 1: Treat config-file selection as a harness bootstrap concern

The harness will choose one of these file-backed modes before constructing Platform or Agent dependencies:

```text
mock.toml   -> optional file-backed mock config / scripted IService / deterministic tools
config.toml -> real provider config / real Platform service
```

The selected file determines the user config manager, Platform service, timeout budget, and run evidence. Runtime code receives explicit dependencies and does not inspect environment variables to decide whether to use mock or real providers.

Rationale: this preserves fail-visible behavior and keeps production runtime free of test fallback logic.

Rejected alternative: let Agent runtime try `config.toml`, then `mock.toml`, then defaults. That would make a real API test pass without testing the requested provider and would hide provider/config breakage.

### Decision 2: Add explicit `config.toml` path injection instead of mutating config

The existing `FileUserConfigManager` is hard-wired to the normal user config location. The real harness needs an explicit `config.toml` path input, either by adding an options object such as `new FileUserConfigManager({ filePath })` or by adding a narrowly scoped factory such as `createUserConfigManagerFromFile(filePath)`.

The normal runtime default remains `~/.neko/config.toml`. Test examples live as redacted templates, while real secrets live under a user-owned `config.toml` path.

Rationale: this avoids writing test defaults into a user's durable production config while keeping the harness surface small: only `mock.toml` and `config.toml` are supported.

Rejected alternative: copy test config into `~/.neko/config.toml` before each run. That is risky for user settings and makes parallel harness runs unsafe.

### Decision 3: Split Platform smoke from Agent workflow harness

Platform real API tests prove provider/config/service wiring:

- config file is readable and valid;
- selected provider/model exists and is configured;
- `chat` works;
- `chatStream` yields streamed content;
- invalid selection and unavailable credentials fail visibly;

Agent real API tests prove autonomous behavior:

- real model stream enters `AgentSession`;
- the model calls a safe test tool when required;
- tool results return to the model and affect the final response;
- IDC metadata and activity expectations are recorded;
- validator diagnostics can be observed and repaired;
- tool failure, validator failure, timeout, cancellation, and recovery states are observable;
- result assertions use `AgentEvent`, tool calls, diagnostics, artifacts, task/media events, and final status rather than final prose alone.

Rationale: Platform failures and Agent behavior failures require different diagnostics. Keeping them separate makes failures actionable.

Rejected alternative: only run TUI/GUI real tests. That would make provider/runtime defects harder to isolate and would overuse expensive UI runtime validation.

### Decision 4: Keep real tools safe and local

The Agent real harness should use a controlled `ToolRegistry` with test-scoped tools:

- read-only echo/inspect tool;
- temp workspace file write tool;
- intentionally failing tool;
- validator/check tool;
- optional fake task/media progress event tool for projection tests.

These tools operate only inside a harness work directory and use explicit paths. High-cost or external-side-effect tools require explicit focused tests and approval behavior coverage.

Rationale: the purpose is to test real model orchestration, not to let a test mutate arbitrary user projects or spend unbounded provider credits.

Rejected alternative: run the full production tool registry by default. That would increase cost and user-data risk while making tests harder to reproduce.

### Decision 5: GUI real validation uses VS Code runtime, not browser-only validation

GUI real API validation must run through Extension Development Host observed by `vscode-extension-debugger` or an equivalent VS Code debugger Skill smoke. It verifies visible Webview targets, stream projection, task/media cards, and failure/recovery UI. Browser, Chrome, Playwright, or Vite localhost can support browser compatibility work, but they do not replace VS Code Webview runtime evidence.

Rationale: GUI correctness depends on VS Code Webview CSP, `asWebviewUri`, extension/webview messages, focus lifecycle, and host adapters.

Rejected alternative: run only jsdom or regular browser tests for GUI real validation. Those tests miss the host runtime boundary.

### Decision 6: promptfoo and DeepEval are optional evaluators after harness assertions

The harness first records deterministic evidence and applies internal assertions. Optional evaluator integrations can consume the recorded transcript/events:

- promptfoo for prompt regression matrices and structured output checks;
- DeepEval for LLM-as-judge scoring, task completion quality, and behavior comparisons.

These tools cannot replace internal assertions about events, tool calls, diagnostics, artifacts, task status, or Webview projection.

Rationale: external evaluators judge quality; they do not know Neko's runtime contracts unless the harness provides structured evidence.

Rejected alternative: make promptfoo or DeepEval the primary Agent flow test. That would miss runtime regressions and UI/host projection failures.

### Five-Layer Analysis

**Responsibility**

- `platform` owns provider/config/API smoke.
- `agent` owns autonomous workflow harness behavior and assertions over runtime events.
- `test-utils` owns reusable harness setup, profile loading, event recording, safe tools, and assertions.
- `cli-tui` owns TUI projection validation only.
- `extension` and `webview` own GUI runtime projection validation through VS Code host paths.

**Dependency**

- Webview remains dependent on `agent-types` and does not import `@neko/agent`, `@neko/platform`, or provider SDKs.
- Extension may compose runtime/platform adapters but does not own Agent strategy.
- `agent`, `platform`, and `ai-sdk` stay host-agnostic.
- Harness utilities may depend on test-only package surfaces but must not become production fallback paths.

**Interface**

- Profile selection is explicit through command/env/harness options.
- Test config path is explicit and reported in evidence.
- The harness records structured events, provider/model identity, selected mode, config path, timeouts, and result status.
- Real commands fail if required `config.toml` is missing, has the wrong file name, or is invalid.

**Extension**

- New real test cases can reuse the same harness cases with the same `config.toml` contract.
- New provider families can be added by updating `config.toml` examples and Platform smoke coverage, not by changing Agent runtime.
- Optional evaluator adapters can consume recorded evidence without changing core assertions.

**Testing**

- Mock lane covers deterministic unit/integration tests.
- Platform real lane covers provider/config/API smoke.
- Agent real lane covers autonomous workflow, tool use, validator/recovery, and IDC evidence.
- TUI real lane covers terminal projection over real Agent events.
- GUI real lane covers VS Code Webview runtime projection.

## Risks / Trade-offs

- [Risk] Real API tests are non-deterministic and may be flaky. -> Mitigation: keep prompts short, use safe tools with strong instructions, assert structured events, set bounded timeouts, and keep real lanes out of default CI.
- [Risk] Real API costs can grow. -> Mitigation: separate smoke/workflow/UI lanes, require explicit real command invocation, use small token limits and short prompts.
- [Risk] Config confusion may hide failures. -> Mitigation: only `mock.toml` and `config.toml` are accepted; evidence records provider/model/config path; no fallback between files.
- [Risk] Harness config path injection could leak into production runtime semantics. -> Mitigation: keep normal defaults unchanged and inject config path only through explicit constructors/factories.
- [Risk] GUI real smoke may require manual VS Code debugger setup. -> Mitigation: reuse existing `smoke:webview:runtime` debugger Skill path and record residual risk when unavailable.
- [Risk] Testing safe tools may not cover all production tools. -> Mitigation: first prove real model orchestration with safe tools; add targeted production-tool harness cases only when their side effects are bounded and approved.

## Migration Plan

1. Add profile-aware config injection while preserving the default `~/.neko/config.toml` runtime behavior.
2. Add harness utilities under `packages/neko-agent/test-utils`.
3. Formalize mock and real scripts without changing default `pnpm test`.
4. Promote the existing Platform real integration into an explicit real lane with fail-visible `config.toml` semantics.
5. Add Agent real workflow harness tests with safe tools and event assertions.
6. Add focused TUI and GUI real runtime tests that consume the same `config.toml` semantics.
7. Clean stale deprecated CLI script/include references only where they would misdirect the new harness.

Rollback strategy: remove the new real scripts and test utilities. Normal runtime config and default mock tests remain unaffected.

## Open Questions

- Should real harness evidence be written as JSON artifacts under a temp/workspace path for later DeepEval/promptfoo consumption in the initial change, or deferred until the first evaluator integration?
