# default-tui-real-api-validation

Default opt-in TUI real API validation matrix. Expensive or fixture-specific cases are disabled until explicitly enabled in a copied manifest.

## Summary

- Output Dir: /Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run
- Passed: 1
- Failed: 2
- Skipped: 3
- Interactive TUI Coverage: not covered by run-mode suite

## Cases

| Case | Verdict | Provider | Model | Duration | Artifacts |
| --- | --- | --- | --- | ---: | --- |
| baseline-chinese | fail | nekoapi-chat | gpt-5.5 | 16560 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/baseline-chinese.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/baseline-chinese.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/baseline-chinese.result.json) | |
| workspace-context | fail | nekoapi-chat | gpt-5.5 | 10368 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/workspace-context.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/workspace-context.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/workspace-context.result.json) | |
| invalid-model-visible-error | pass | nekoapi-chat | __neko_invalid_real_api_suite_model__ | 1 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/invalid-model-visible-error.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/invalid-model-visible-error.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/codex-default-run/cases/invalid-model-visible-error.result.json) | |
| media-library-variable | skipped |  |  |  | Enable in a copied manifest after confirming the workspace defines ${A}. | |
| epub-vision | skipped |  |  |  | Enable with a vision-capable model and a local EPUB fixture. | |
| timeout-visible-error | skipped |  |  |  | Enable only when intentionally testing timeout handling. | |

## Deterministic Checks

### baseline-chinese

- pass: exit-code - exitCode=0, expected=0
- pass: non-empty-output - assistant output must be non-empty
- fail: output-contains - output contains "TUI"

### workspace-context

- pass: exit-code - exitCode=0, expected=0
- fail: non-empty-output - assistant output must be non-empty

### invalid-model-visible-error

- pass: exit-code - exitCode=1, expected=1
- pass: error-contains - error contains "not found"

### media-library-variable

- skipped: Enable in a copied manifest after confirming the workspace defines ${A}.

### epub-vision

- skipped: Enable with a vision-capable model and a local EPUB fixture.

### timeout-visible-error

- skipped: Enable only when intentionally testing timeout handling.


## AI-Assisted Summary

AI summary was not requested. Deterministic verdicts are the source of truth.

## Residual Risk

- `neko run` validates non-interactive Agent execution only. Terminal input, autocomplete, slash UI, queue controls, i18n rendering, and focus behavior need PTY/manual smoke evidence.

