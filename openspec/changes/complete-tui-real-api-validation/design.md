## Context

The TUI currently has enough pieces to call real providers: `neko run`, `neko experiment`, `loadConfig(workDir)`, platform-backed services, and a limited `real-api-tui-projection` harness. Those pieces do not yet form a repeatable acceptance loop for prompt behavior, model behavior, content access, long-running turns, or error handling. The current real API harness also leans on a test-specific profile, while the production TUI resolves provider/model configuration from `~/.neko/config.toml`, workspace `.neko/config.toml`, environment credentials, and CLI overrides.

The validation surface is local and developer-facing. It should not introduce remote test orchestration, another credential store, or a cloud-style test service. The suite should exercise the same CLI path users run, capture raw evidence, and produce a report that a developer can audit.

### Current Gap Summary

- Real API coverage is smoke-level and not tied to a case matrix.
- `neko run --format json|markdown` is not a clean machine-output channel when normal output streams to stdout before the final formatted result.
- No unified runner records stdout, stderr, exit code, timing, selected provider/model, config provenance, and rule-based verdicts.
- No curated suite covers baseline prompt behavior, workspace references, media library references, EPUB/image perception, multiple model capabilities, long-running tasks, timeout handling, and visible errors.
- AI-generated summaries are not available as a reproducible second-stage report over raw artifacts.
- Interactive TUI behavior remains separate from `run` behavior and needs explicit residual risk when not covered.

### Five-Layer Analysis

- Responsibility: `packages/neko-agent/packages/cli-tui` owns CLI/TUI validation orchestration and report formatting. `@neko/platform` and existing config readers own provider/model resolution. Content access, assets, search, entity, and media library behavior remain owned by their domain packages and host adapters.
- Dependency: The suite calls the CLI or TUI runner through public package entry points. It must not import VSCode APIs, React UI internals, or feature-package private implementations. It may depend on Node filesystem/process APIs because it is a local developer validation tool.
- Interface: Case manifests and results are local JSON/Markdown contracts. They should be minimal, versioned, redacted, and stable enough for scripts and AI summarization. Provider/model selection remains the existing TUI config contract.
- Extension: New cases and model matrices should be added by data files, not by editing runner control flow. New evaluation checks should be small named predicates over structured result records.
- Testing: Unit tests cover manifest parsing, result capture, redaction, rule evaluation, and report generation. Mock service tests cover timeout/error handling. Real API execution is opt-in and produces artifact evidence.

## Goals / Non-Goals

**Goals:**
- Provide a repeatable TUI real API suite that uses production `~/.neko/config.toml` by default.
- Preserve the canonical `neko run --cd <workDir> "<prompt>"` execution path for non-interactive validation.
- Capture raw evidence and structured result metadata for every case.
- Add rule-based pass/fail before AI summarization.
- Support a model matrix that can compare configured chat, vision-capable, and text-only models when available.
- Include failure-path cases that verify fail-visible configuration, missing source, unsupported capability, timeout, and provider errors.
- Generate a Markdown report suitable for human review and PR/test evidence.

**Non-Goals:**
- Do not add new API credential storage or a test-only config source as the default path.
- Do not automate full terminal input/focus/UI rendering acceptance in this change.
- Do not move content, asset, entity, search, OAuth, market, engine, or media implementations into `neko-agent`.
- Do not treat AI summary text as the source of pass/fail truth.
- Do not require real API tests in default CI, because they depend on local credentials, provider availability, quota, latency, and cost.

## Decisions

### Decision 1: Use production config by default

The suite will load provider/model settings through the same TUI config path as `neko run`: `~/.neko/config.toml`, workspace `.neko/config.toml`, environment credentials, and explicit CLI overrides. Reports will record config file presence and selected provider/model identity, but secrets must be redacted.

Alternatives considered:
- Test-specific `NEKO_AGENT_TEST_CONFIG`: useful for harness isolation, but it does not prove production CLI configuration works and can hide user-facing config bugs.
- Inline API keys in suite manifests: rejected because it duplicates credential storage and increases leak risk.

### Decision 2: Add a clean structured result channel

The suite needs machine-readable result data. `neko run --format json` currently may mix streamed output and final JSON on stdout. The implementation should either add a no-stream structured output mode for `run`, or use a lower-level runner API and persist a structured `result.json` per case while still preserving raw stdout/stderr.

Alternatives considered:
- Parse stdout heuristically: rejected because tool output, streamed text, and Markdown can make parsing brittle.
- Force `--stream false` only: helpful, but the command should still clearly separate raw output from structured result.

### Decision 3: Separate case manifest, execution, evaluation, and report

The validation capability should use four small layers:

1. Case manifest: declarative cases, prompts, workDir, model selectors, timeout, iteration limits, expected checks.
2. Execution runner: invokes `neko run` or `runAgent` through a production-equivalent path and captures artifacts.
3. Evaluator: applies deterministic checks such as exit code, required substrings, tool evidence, structured diagnostics, timeout status, and capability diagnostics.
4. Reporter: writes summary Markdown and optionally invokes AI to summarize raw artifacts.

Alternatives considered:
- One monolithic script: faster to write but hard to extend and test.
- Reuse `experiment` directly: `experiment` is useful for prompt/model ablations, but it lacks pass/fail evidence, error classification, and raw artifact indexing.

### Decision 4: AI summarizes only after deterministic evaluation

The AI report step will read `manifest.json`, `cases/*.result.json`, stdout/stderr logs, and deterministic verdicts. It can summarize quality, compare model behavior, and identify suspicious outputs. It must not override deterministic pass/fail without leaving an explicit reviewer note.

Alternatives considered:
- AI judge as primary verdict: rejected because provider variance and evaluator hallucination would make acceptance non-reproducible.
- No AI summary: safe but misses useful qualitative analysis for prompt/model behavior.

### Decision 5: Keep interactive TUI validation separate

This change validates the non-interactive Agent execution path and reportability. Terminal input, autocomplete rendering, focus, slash UI, and queue controls remain a separate PTY or manual smoke track. The report should explicitly label interactive coverage as not covered unless a PTY smoke artifact is attached.

Alternatives considered:
- Build full PTY automation now: useful but higher risk and not necessary to close the real API/report gap.

## Risks / Trade-offs

- Real provider variance and cost -> Keep tests opt-in, configurable, and small by default; record provider/model/timing so results are auditable.
- Quota, rate limits, and network instability -> Classify provider/network failures separately from TUI failures; preserve stderr and structured diagnostics.
- Secret leakage in reports -> Redact API keys, auth headers, tokens, and config value fields before writing artifacts.
- Vision/model capability mismatch -> Include explicit capability checks and expected visible diagnostics instead of silently skipping cases.
- Long-running task flakiness -> Use bounded timeouts, iteration caps, and deterministic success criteria; do not depend on exact wording for long responses.
- AI summary bias -> Make summaries secondary to rule-based verdicts and include links/paths to raw artifacts.
- Current TypeScript strict debt -> Keep new tests focused and document residual repo-wide `tsc` failures separately from suite validation.

## Migration Plan

1. Add the new suite as an opt-in developer command or script. Existing `neko run` behavior remains available.
2. Add clean structured output support without breaking plain text CLI usage. If command output semantics change, default behavior must remain human-readable.
3. Add default case manifests under the TUI package or repo scripts directory.
4. Add report output under `reports/tui-real-api/<timestamp>/` by default, with a configurable output directory.
5. Document how to run the suite with `~/.neko/config.toml`, workspace `.neko/config.toml`, and optional provider/model overrides.

Rollback is straightforward: remove the opt-in runner/script and keep existing CLI behavior. No durable user data or project file migration is required.

## Open Questions

- Should the suite live as `packages/neko-agent/packages/cli-tui/src/core/real-api-suite.ts`, a repo-level `scripts/` entry, or both?
- Should AI report summarization call the same selected chat model or a separately configured report model?
- Should `experiment` consume the new manifest/evaluator later, or remain independent?
