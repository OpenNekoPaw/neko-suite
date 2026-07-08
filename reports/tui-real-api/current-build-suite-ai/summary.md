# default-tui-real-api-validation

Default opt-in TUI real API validation matrix. Expensive or fixture-specific cases are disabled until explicitly enabled in a copied manifest.

## Summary

- Output Dir: /Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai
- Passed: 3
- Failed: 0
- Skipped: 3
- Interactive TUI Coverage: not covered by run-mode suite

## Cases

| Case | Verdict | Provider | Model | Duration | Artifacts |
| --- | --- | --- | --- | ---: | --- |
| baseline-chinese | pass | nekoapi-chat | gpt-5.5 | 3121 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/baseline-chinese.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/baseline-chinese.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/baseline-chinese.result.json) | |
| workspace-context | pass | nekoapi-chat | gpt-5.5 | 9107 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/workspace-context.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/workspace-context.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/workspace-context.result.json) | |
| invalid-model-visible-error | pass | nekoapi-chat | __neko_invalid_real_api_suite_model__ | 0 | [stdout](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/invalid-model-visible-error.stdout.md) [stderr](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/invalid-model-visible-error.stderr.log) [result](/Users/feng/Git/neko-suite/reports/tui-real-api/current-build-suite-ai/cases/invalid-model-visible-error.result.json) | |
| media-library-variable | skipped |  |  |  | Enable in a copied manifest after confirming the workspace defines ${A}. | |
| epub-vision | skipped |  |  |  | Enable with a vision-capable model and a local EPUB fixture. | |
| timeout-visible-error | skipped |  |  |  | Enable only when intentionally testing timeout handling. | |

## Deterministic Checks

### baseline-chinese

- pass: exit-code - exitCode=0, expected=0
- pass: non-empty-output - assistant output must be non-empty

### workspace-context

- pass: exit-code - exitCode=0, expected=0
- pass: non-empty-output - assistant output must be non-empty

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

本次 `default-tui-real-api-validation` 真实 API 验证结果：**3 个通过，0 个失败，3 个跳过**。按确定性判定来看，整体结论是 **通过**，没有失败用例。

通过用例包括：

- `baseline-chinese`：通过。进程退出码为 `0`，输出非空，说明基础中文响应链路可用。
- `workspace-context`：通过。退出码为 `0`，输出非空，且回答没有伪造工作目录内容，符合上下文约束。
- `invalid-model-visible-error`：通过。退出码为 `1`，错误信息包含 `"not found"`，无效模型错误能被明确暴露。

跳过用例包括：

- `media-library-variable`
- `epub-vision`
- `timeout-visible-error`

评审备注：`workspace-context` 的输出明显比其他用例更长，并且包含“创作文档契约”“creation-document 服务”等上下文说明。虽然该用例的确定性检查只要求退出码正确且输出非空，因此判定仍然是通过，但从人工评审角度看，这段输出可能混入了与 TUI 真实 API 验证目标不直接相关的宿主环境规则，应作为可疑输出继续观察。

## Residual Risk

- `neko run` validates non-interactive Agent execution only. Terminal input, autocomplete, slash UI, queue controls, i18n rendering, and focus behavior need PTY/manual smoke evidence.

