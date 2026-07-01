# Agent Real API Harness

Neko Agent uses two validation modes:

- default CI: mock-only, deterministic, no network, no provider credentials;
- explicit real API harness: real provider/model calls for Platform, Agent workflow, TUI, and GUI lanes.

Only two file-backed harness configs are supported:

- `mock.toml`: optional file-backed config for mock harness cases;
- `config.toml`: required for explicit real API harness runs.

Real API lanes are intentionally fail-visible. If `config.toml` is missing, unreadable, selects a missing provider/model, has bad credentials, or the provider call fails, the command fails. It must not fall back to mock, another file, another provider, or another model.

## Config Files

Default mock tests do not require a config file:

```bash
pnpm test
pnpm test:agent:mock
```

Explicit real API lanes require `config.toml`:

```bash
NEKO_AGENT_REAL_API=1
NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml"
```

`NEKO_AGENT_REAL_API=1` selects the real harness mode. `NEKO_AGENT_TEST_PROFILE` is optional and may only be `mock` or `real`; `NEKO_AGENT_REAL_API=1` cannot be combined with `NEKO_AGENT_TEST_PROFILE=mock`.

Optional controls:

```bash
NEKO_AGENT_TEST_WORKDIR=/tmp/neko-agent-real
NEKO_AGENT_TEST_TIMEOUT_MS=120000
```

## Commands

```bash
pnpm test                         # default CI, mock only
pnpm test:agent:mock              # harness mock/config tests
pnpm test:agent:real:platform     # real provider chat/chatStream smoke
pnpm test:agent:real:workflow     # real AgentSession workflow harness
pnpm test:agent:real:tui          # supported TUI runner with real Platform service
pnpm test:agent:real:gui          # Agent GUI through VS Code Webview runtime smoke
```

If a local pnpm 11 wrapper stops before test execution with `ERR_PNPM_IGNORED_BUILDS`,
use this only as a developer-machine workaround after dependencies are already installed:

```bash
pnpm_config_verify_deps_before_run=false pnpm test -- --run
```

This does not change harness semantics. Default `pnpm test` must still stay mock-only,
and any test failure after Vitest starts should be treated as a normal product test failure.

Example real run:

```bash
NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml" \
pnpm test:agent:real:platform

NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml" \
pnpm test:agent:real:workflow

NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml" \
pnpm test:agent:real:tui
```

GUI real validation must use VS Code Extension Development Host through the VS Code debugger Skill path. Browser-only, jsdom-only, Chrome-only, Playwright-only, or Vite localhost evidence does not satisfy GUI runtime acceptance.

Example GUI run:

```bash
NEKO_AGENT_REAL_API=1 \
NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml" \
code --inspect=9222 .
# Start the Extension Development Host, reveal the Neko AI webview, then:
NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml" \
pnpm test:agent:real:gui
```

The GUI lane runs `scripts/smoke-agent-real-gui.mjs` with `NEKO_AGENT_REAL_API=1`.
It connects to the VS Code CDP endpoint, requires a visible Agent Webview target, records
the selected config path, provider/model identity from `config.toml`, bridge message activity,
and DOM projection evidence. By default it submits a short prompt through the Agent composer
and requires visible assistant text plus extension-to-webview bridge activity.

The Extension Development Host must be launched with the same `NEKO_AGENT_REAL_API=1` and
`NEKO_AGENT_TEST_CONFIG` environment so Platform bootstrap reads `config.toml` through the
test harness injection path. No GUI command falls back from real API to mock, another config
file, another provider, or another model; mismatched `--expect-provider-id` /
`--expect-model-id` fails before Webview submission.

Additional GUI projection assertions are opt-in so expensive or failure-path cases can be run
as focused smokes:

```bash
NEKO_AGENT_TEST_CONFIG="$HOME/.neko/config.toml" \
node scripts/smoke-agent-real-gui.mjs \
  --require-bridge \
  --require-assistant-text \
  --require-tool-timeline \
  --require-task-card \
  --require-media-card \
  --require-diagnostic \
  --require-cancellation \
  --require-recovery
```

Use `NEKO_AGENT_GUI_PROMPT` or `--prompt` to submit a scenario-specific prompt. Use
`--no-submit` only when another process has already driven the visible Agent turn; the evidence
must still come from VS Code debugger targets, not from a browser or jsdom run.

The deprecated CLI is not a validation surface. Terminal validation targets `packages/neko-agent/packages/cli-tui`.
The explicit TUI real lane runs through the `cli-tui` runner with the selected real Platform
service. TUI projection-only tests stay in the default mock lane; `test:agent:real:tui` fails
visibly when `NEKO_AGENT_TEST_CONFIG` is missing.

## Validation Surfaces

- `platform`: provider/model/config/API smoke. It isolates config and provider failures before Agent workflow assertions.
- `agent`: host-agnostic `AgentSession` workflow harness. It records events, tool calls/results, validator diagnostics, IDC metadata, timeout/interruption, and provider/model identity.
- `cli-tui`: supported terminal UI entry. Focused mock tests assert stream, tool, confirmation, error, and timeout projection; explicit real TUI runs use the same `config.toml`.
- `extension` + `webview`: supported GUI entry. Runtime acceptance requires VS Code Extension Development Host and `vscode-extension-debugger` evidence.

## Example Configs

Redacted examples live under:

```text
packages/neko-agent/test-fixtures/config/mock.toml.example
packages/neko-agent/test-fixtures/config/config.toml.example
```

Copy `config.toml.example` to a user-owned `config.toml` path such as:

```text
~/.neko/config.toml
```

Do not commit real credentials. Use environment-variable placeholders in profile files.

## Evaluators

promptfoo and DeepEval may consume harness evidence as supplemental quality scoring. They do not replace internal assertions over provider/model identity, Agent events, tool calls, validator diagnostics, artifacts, task/media progress, or TUI/GUI projection.

Harness evidence JSON is emitted by `toAgentRunEvidenceJson()` as:

```json
{
  "schemaVersion": 1,
  "kind": "neko.agent.realApiHarness.evidence",
  "evaluatorPolicy": {
    "internalAssertionsRequired": true,
    "supplementalEvaluators": ["promptfoo", "deepeval"]
  },
  "evidence": {}
}
```

Evaluator results are accepted only after the internal harness status and structural assertions pass.

## Residual Risk

Real API lanes require user-owned credentials and network access. If a developer machine does not have
`NEKO_AGENT_TEST_CONFIG` pointing at `config.toml`, the explicit real command must fail visibly.
If VS Code Extension Development Host or the debugger Skill cannot run locally, record that as GUI
runtime residual risk; browser-only or jsdom evidence is not a substitute.
