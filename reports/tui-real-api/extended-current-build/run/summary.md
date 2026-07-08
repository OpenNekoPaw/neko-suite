# extended-current-build-real-api-validation

Extended current-build real API validation for baseline prompts, media generation, skill fixtures, and long-running multi-step workflows.

## Summary

- Output Dir: /Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run
- Passed: 10
- Failed: 1
- Skipped: 0
- Interactive TUI Coverage: not covered by run-mode suite

## Cases

| Case | Verdict | Provider | Model | Duration | Artifacts |
| --- | --- | --- | --- | ---: | --- |
| prompt-cn-brief | pass | nekoapi-chat | gpt-5.5 | 10017 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-cn-brief.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-cn-brief.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-cn-brief.result.json) | |
| prompt-json-contract | pass | nekoapi-chat | gpt-5.5 | 3888 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-json-contract.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-json-contract.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-json-contract.result.json) | |
| prompt-tool-restraint | pass | nekoapi-chat | gpt-5.5 | 2885 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-tool-restraint.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-tool-restraint.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/prompt-tool-restraint.result.json) | |
| workspace-file-reference | pass | nekoapi-chat | gpt-5.5 | 15552 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/workspace-file-reference.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/workspace-file-reference.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/workspace-file-reference.result.json) | |
| media-image-generation-submit | fail | nekoapi-chat | gpt-5.5 | 19386 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/media-image-generation-submit.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/media-image-generation-submit.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/media-image-generation-submit.result.json) | |
| epub-vision-two-pages | pass | nekoapi-chat | gpt-5.5 | 72734 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/epub-vision-two-pages.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/epub-vision-two-pages.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/epub-vision-two-pages.result.json) | |
| skill-direct-strict-format | pass | nekoapi-chat | gpt-5.5 | 4685 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-direct-strict-format.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-direct-strict-format.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-direct-strict-format.result.json) | |
| skill-tool-reading | pass | nekoapi-chat | gpt-5.5 | 27875 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-tool-reading.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-tool-reading.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-tool-reading.result.json) | |
| skill-command-artifact | pass | nekoapi-chat | gpt-5.5 | 3218 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-command-artifact.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-command-artifact.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-command-artifact.result.json) | |
| skill-disabled-visible-error | pass | nekoapi-chat | gpt-5.5 | 5 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-disabled-visible-error.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-disabled-visible-error.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/skill-disabled-visible-error.result.json) | |
| long-multistep-workflow | pass | nekoapi-chat | gpt-5.5 | 34305 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/long-multistep-workflow.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/long-multistep-workflow.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/extended-current-build/run/cases/long-multistep-workflow.result.json) | |

## Deterministic Checks

### prompt-cn-brief

- pass: exit-code - exitCode=0, expected=0
- pass: non-empty-output - assistant output must be non-empty
- pass: output-contains - output contains "BASIC_PROMPT_CN_OK"

### prompt-json-contract

- pass: exit-code - exitCode=0, expected=0
- pass: output-contains - output contains "BASIC_PROMPT_JSON_OK"
- pass: output-not-contains - output does not contain "```"

### prompt-tool-restraint

- pass: exit-code - exitCode=0, expected=0
- pass: output-contains - output contains "NO_TOOL_PROMPT_OK"
- pass: output-not-contains - output does not contain "[tool]"

### workspace-file-reference

- pass: exit-code - exitCode=0, expected=0
- pass: content-evidence - content evidence contains "Read"
- pass: output-contains - output contains "WORKSPACE_FILE_OK"

### media-image-generation-submit

- pass: exit-code - exitCode=0, expected=0
- pass: content-evidence - content evidence contains "GenerateImage"
- fail: output-contains - output contains "MEDIA_IMAGE_SUBMIT_OK"
- pass: output-contains - output contains "taskId"

### epub-vision-two-pages

- pass: model-capability - model capability vision=true, expected=true
- pass: exit-code - exitCode=0, expected=0
- pass: model-capability - model capability vision=true, expected=true
- pass: content-evidence - content evidence contains "ReadDocument"
- pass: content-evidence - content evidence contains "ReadImage"
- pass: output-contains - output contains "EPUB_VISION_OK"

### skill-direct-strict-format

- pass: exit-code - exitCode=0, expected=0
- pass: output-contains - output contains "SKILL_STRICT_FORMAT_ACTIVE"

### skill-tool-reading

- pass: exit-code - exitCode=0, expected=0
- pass: content-evidence - content evidence contains "Read"
- pass: output-contains - output contains "SKILL_TOOL_READING_ACTIVE"
- pass: output-contains - output contains "SKILL_FIXTURE_FILE_OK"

### skill-command-artifact

- pass: exit-code - exitCode=0, expected=0
- pass: output-contains - output contains "COMMAND_ARTIFACT_ACTIVE"

### skill-disabled-visible-error

- pass: exit-code - exitCode=1, expected=1
- pass: error-contains - error contains "disabled"

### long-multistep-workflow

- pass: exit-code - exitCode=0, expected=0
- pass: content-evidence - content evidence contains "Read"
- pass: content-evidence - content evidence contains "Write"
- pass: output-contains - output contains "LONG_TASK_OK"
- pass: output-contains - output contains "LONG_SOURCE_FIXTURE_OK"
- pass: output-contains - output contains "LONG_TASK_REPORT_OK"


## AI-Assisted Summary

AI summary was not requested. Deterministic verdicts are the source of truth.

## Residual Risk

- `neko run` validates non-interactive Agent execution only. Terminal input, autocomplete, slash UI, queue controls, i18n rendering, and focus behavior need PTY/manual smoke evidence.

