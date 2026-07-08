## Why

Neko Agent TUI can run real API smoke tests, but it does not yet have a repeatable validation suite that proves prompt behavior, model behavior, workspace/media-library access, long-running turns, and failure handling against the same `~/.neko/config.toml` path used by the production CLI. Recent TUI fixes around media library variables and EPUB image projection need end-to-end evidence that the selected vision-capable model actually receives usable multimodal inputs rather than only tool metadata.

## What Changes

- Add a TUI real API validation capability with a scripted runner that executes case manifests through the production `neko run --cd <workDir>` path.
- Record raw stdout, stderr, exit code, duration, selected provider/model identity, redacted config provenance, and per-case pass/fail results in a timestamped report directory.
- Add curated validation cases for baseline system prompt behavior, workspace file access, media library and EPUB/image references, model capability differences, long-running turns, timeout handling, and visible configuration/provider errors.
- Add an AI-assisted report summarizer that reads raw case artifacts and produces a Markdown test report without replacing rule-based pass/fail checks.
- Ensure real API tests use the canonical production config chain: `~/.neko/config.toml`, workspace `.neko/config.toml`, environment credentials, and explicit CLI provider/model overrides. Test-specific API config files are not the default validation path.
- Normalize CLI output behavior needed for reliable machine collection, including a clean structured result path for non-interactive validation.
- Non-goals:
  - Do not replace unit tests, mock service tests, or Webview runtime smoke.
  - Do not add another API key storage mechanism.
  - Do not move provider, asset, entity, search, or content implementations into `neko-agent` core.
  - Do not attempt to fully automate visual TUI input/focus validation in this change; interactive PTY or manual smoke remains separate evidence.

## Capabilities

### New Capabilities
- `tui-real-api-validation`: Defines production-config-backed TUI real API validation, case manifests, raw artifact capture, rule-based evaluation, AI-assisted report summaries, and failure handling expectations.

### Modified Capabilities
- `quality-validation-release-loop`: Adds TUI real API validation as optional targeted evidence for TUI prompt, provider, content access, and long-running Agent workflow changes.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/cli-tui`: runner command behavior, real API validation scripts, case manifest fixtures, result/report formatting, and focused tests.
  - `packages/neko-agent/packages/agent` only if existing session result metadata is insufficient for clean CLI reporting.
- Affected commands:
  - `neko run` remains the canonical execution path for non-interactive real API validation.
  - A new script or command wrapper may be added for suite execution, for example `pnpm --filter @neko/cli test:real-api:tui` or a repo script under `scripts/`.
- Affected configuration:
  - Reads production config from `~/.neko/config.toml` plus workspace `.neko/config.toml`.
  - Reports config provenance with secrets redacted.
- Affected validation:
  - Adds raw artifact directories under `reports/tui-real-api/<timestamp>/` or an explicitly configured output directory.
  - Adds focused mock/unit coverage for manifest parsing, result capture, report generation, and clean CLI structured output.
