## 1. CLI Result Capture Contract

- [x] 1.1 Audit current `neko run` stdout/stderr behavior for `text`, `json`, `markdown`, streamed output, tool events, errors, and timeouts.
- [x] 1.2 Define a clean structured result contract for real API suite case artifacts, including schema version, case id, prompt id, provider/model, workDir, command, exit code, duration, stdout path, stderr path, result path, verdict, checks, and redacted config provenance.
- [x] 1.3 Implement a non-interactive structured result capture path that does not mix streamed human output with machine JSON.
- [x] 1.4 Add focused tests proving successful, failed, and timed-out `run` executions produce clean structured result data without losing raw stdout/stderr.

## 2. Suite Manifest And Runner

- [x] 2.1 Add a typed case manifest contract for TUI real API validation cases, model selectors, prompt text, workDir, timeout, iteration limits, required capabilities, and deterministic checks.
- [x] 2.2 Implement manifest loading and validation with fail-visible diagnostics for missing workDir, missing prompt, invalid model selector, invalid timeout, unsupported check type, and unsafe output paths.
- [x] 2.3 Implement the suite runner that executes cases through the production-equivalent TUI path using `~/.neko/config.toml`, workspace `.neko/config.toml`, environment credentials, and explicit overrides.
- [x] 2.4 Persist per-case raw stdout, raw stderr, structured result JSON, and a suite-level `manifest.json` under `reports/tui-real-api/<timestamp>/` or an explicitly configured output directory.
- [x] 2.5 Add unit tests for manifest parsing, redaction, output directory creation, case execution orchestration, and failure classification.

## 3. Deterministic Evaluation

- [x] 3.1 Implement deterministic checks for exit code, non-empty output, required/forbidden output text, expected diagnostic code/text, timeout status, tool evidence, model capability mismatch, and content access evidence.
- [x] 3.2 Add evaluator tests for pass, fail, timeout, provider error, invalid config, missing file, missing media variable, unsupported vision, and partial-output cases.
- [x] 3.3 Ensure failed or timed-out cases cannot be marked successful because partial stdout exists.
- [x] 3.4 Ensure content/media cases can assert canonical TUI content access or projection evidence instead of accepting result-only success.

## 4. Default Real API Case Matrix

- [x] 4.1 Add baseline prompt cases that verify Chinese response behavior, concise task understanding, and basic system prompt adherence.
- [x] 4.2 Add workspace access cases that reference files under the selected workDir and verify the Agent uses workspace context correctly.
- [x] 4.3 Add media library cases that reference configured `${A}` paths and verify fail-visible behavior when variables or files are missing.
- [x] 4.4 Add EPUB/image perception cases that require a vision-capable model and verify visible diagnostics for text-only models.
- [x] 4.5 Add long-running and timeout cases with bounded `maxIterations` and timeout settings.
- [x] 4.6 Add provider/configuration error cases for missing API key, invalid model, invalid provider, and unsupported capability where they can run without leaking secrets.

## 5. AI-Assisted Report Generation

- [x] 5.1 Implement Markdown report generation over deterministic case results, including environment, config provenance, case matrix, pass/fail summary, raw artifact links, interactive coverage caveat, and residual risks.
- [x] 5.2 Implement optional AI-assisted summarization over raw artifacts and deterministic verdicts, using the selected report model or a documented override.
- [x] 5.3 Ensure AI summaries cannot override deterministic verdicts and are clearly labeled as qualitative reviewer notes.
- [x] 5.4 Add tests for report rendering, redaction, skipped AI summary, AI summary disagreement, and raw artifact linking.

## 6. Command And Documentation

- [x] 6.1 Add an opt-in developer command or package script for running the suite, documenting required local config and examples using `~/.neko/config.toml`.
- [x] 6.2 Document recommended commands for single-case validation using `neko run --cd <dir> "<prompt>"` and for suite validation using the new runner.
- [x] 6.3 Document that `neko <dir> <prompt>` is not the validation command because the default entry treats both values as prompt text.
- [x] 6.4 Document when to attach PTY/manual interactive TUI smoke evidence for input, autocomplete, slash UI, queue controls, i18n rendering, and focus behavior.

## 7. Validation

- [x] 7.1 Run focused unit tests for CLI result formatting, suite manifest parsing, evaluator behavior, redaction, and report generation.
- [x] 7.2 Run `cd packages/neko-agent && node_modules/.bin/vitest --run packages/cli-tui/src` or the nearest focused TUI suite and record results.
- [x] 7.3 Run `cd packages/neko-agent/packages/cli-tui && node_modules/.bin/tsup` and `sh scripts/build-exe.sh`.
- [x] 7.4 Run at least one real API suite against `/Users/feng/Git/neko-test` using `~/.neko/config.toml` and record the generated report path, or record why credentials/quota/network prevented it.
- [x] 7.5 Run a targeted media library/EPUB smoke case proving `${A}` and document-entry image projection reach the selected model, or record residual risk if no vision-capable model is available.
- [x] 7.6 Record remaining repo-wide TypeScript strict failures separately from this change if `tsc --noEmit -p packages/neko-agent/packages/cli-tui/tsconfig.json` is still blocked by existing unrelated errors.
