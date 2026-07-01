## Why

`neko-agent` currently has broad mock/unit coverage and a small Platform real API smoke, but it does not have a real-model Agent harness that proves autonomous flows can call tools, follow IDC, recover from validator failures, and surface reliable TUI/GUI projections. Real API testing is the only meaningful quality signal for model-driven behavior, while default CI still needs to stay stable, cheap, and key-free.

## What Changes

- Introduce an explicit Agent real API harness test capability with only `mock.toml` and `config.toml` file-backed modes.
- Add formal real API test lanes for Platform provider smoke, Agent workflow harness, TUI projection, and GUI runtime.
- Keep default CI mock-only; real API lanes are explicit, fail-visible, and never silently fall back to mock, another config file, or another provider/model.
- Add test harness utilities for config loading, real Platform service bootstrap, Agent event recording, safe test tools, and shared assertions.
- Allow real harness configuration to use an explicit `config.toml` path without mutating or implicitly depending on the user's default config.
- Treat the deprecated CLI as out of scope for validation; only clean stale CLI references that would mislead the new harness.
- Position promptfoo/DeepEval as optional evaluator integrations only; they do not replace the internal harness assertions.

## Capabilities

### New Capabilities
- `agent-real-api-harness`: Defines the explicit `mock.toml` / `config.toml` semantics, real API Agent harness requirements, Platform/Agent/TUI/GUI coverage boundaries, fail-visible behavior, and evidence expected from real-model test runs.

### Modified Capabilities
- None.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/platform`: profile-aware config injection and real provider/API smoke tests.
  - `packages/neko-agent/packages/agent`: real Agent workflow harness tests covering tool calls, IDC, validator diagnostics, quality review, and recovery.
  - `packages/neko-agent/packages/cli-tui`: TUI real harness entry/projection tests; deprecated CLI paths are not expanded.
  - `packages/neko-agent/packages/extension` and `packages/neko-agent/packages/webview`: GUI runtime smoke hooks and evidence through VS Code Extension Development Host.
  - `packages/neko-agent/test-utils`: reusable harness utilities.
- Affected scripts:
  - Add explicit `test:agent:real:*` scripts while keeping default `pnpm test` mock-only.
- Affected configuration:
  - Support only `mock.toml` and `config.toml` through explicit harness inputs/env vars.
  - Do not store secrets in repository fixtures; checked-in examples are templates only.
- Compatibility:
  - No user project format migration.
  - Existing `~/.neko/config.toml` remains supported as the normal runtime default and may be used explicitly as the real harness `config.toml`.
  - Any config file name other than `mock.toml` for mock mode or `config.toml` for real mode fails visibly.
