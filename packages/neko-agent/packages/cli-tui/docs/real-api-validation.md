# TUI Real API Validation

This document describes the opt-in validation path for Neko Agent TUI against real API providers.

## Configuration

The suite uses the same configuration chain as production TUI commands:

1. User config: `~/.neko/config.toml`
2. Workspace config: `<workDir>/.neko/config.toml`
3. Environment credentials supported by the normal TUI config loader
4. Explicit CLI overrides such as `--provider` and `--model`

Do not put API keys in suite manifests, reports, or shell scripts. Result artifacts redact secret-bearing config fields.

## Single Case

Use `neko run --cd <dir> "<prompt>"` for direct prompt validation:

```bash
./packages/neko-agent/neko run \
  --cd /Users/feng/Git/neko-test \
  --max-iterations 10 \
  --timeout 600000 \
  --result-file reports/tui-real-api/single.result.json \
  "请用中文总结当前工作区的用途。"
```

`--result-file` writes clean structured JSON. Standard output remains human-readable and may contain streamed text, tool lines, or thinking lines.

Do not use:

```bash
neko <dir> <prompt>
```

The default command treats both positional values as prompt text. Use `--cd`, `--cwd`, or `--work-dir` to select the workspace.

## Suite

Run the default opt-in suite:

```bash
cd packages/neko-agent/packages/cli-tui
pnpm test:real-api:tui -- --cd /Users/feng/Git/neko-test
```

Or run the built binary:

```bash
./packages/neko-agent/neko real-api-suite \
  --cd /Users/feng/Git/neko-test \
  --output-dir reports/tui-real-api/manual
```

Use a copied JSON manifest for project-specific media or long-running cases:

```bash
./packages/neko-agent/neko real-api-suite \
  --cd /Users/feng/Git/neko-test \
  --manifest reports/tui-real-api/my-suite.json \
  --output-dir reports/tui-real-api/my-run
```

Add `--ai-summary` only after deterministic checks are working. AI summaries are reviewer notes; deterministic case verdicts remain the source of truth.

## Report Evidence

Each run writes:

- `manifest.json`: suite-level metadata and case artifact paths
- `summary.md`: human-readable test report
- `cases/*.stdout.md`: raw stdout per case
- `cases/*.stderr.log`: raw stderr per case
- `cases/*.result.json`: structured per-case result

Record the generated `summary.md` path in implementation or PR notes.

## Interactive TUI Smoke

`real-api-suite` validates non-interactive `neko run` behavior. It does not prove terminal input, autocomplete rendering, slash UI, queue controls, i18n rendering, focus, or resize behavior.

For those behaviors, attach separate PTY or manual smoke evidence and mention it in the report or delivery notes.
