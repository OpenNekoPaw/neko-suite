# local-v1-eval-smoke

## Summary

- Status: case-fail
- Exit Code: 1
- Output Dir: /Users/feng/Git/neko-suite/reports/neko-eval/local-v1-smoke-20260709-1438
- Started At: 2026-07-09T06:37:05.269Z
- Completed At: 2026-07-09T06:37:51.976Z
- Passed: 2
- Case Failed: 1
- Infrastructure Failed: 0
- Manifest/Config Invalid: 0

## Cases

| Case | Mode | Status | Exit | Target Model | Turns | Checks |
| --- | --- | --- | ---: | --- | ---: | --- |
| single-baseline | single | pass | 0 | nekoapi-chat/gpt-5.5 | 1 | 2/2 |
| sequence-history | sequence | pass | 0 | nekoapi-chat/gpt-5.5 | 2 | 1/1 |
| feedback-lite-brief | feedback-lite | case-fail | 1 | nekoapi-chat/gpt-5.5 | 2 | 0/1 |

## Check Details

### single-baseline

- PASS success: all turns passed
- PASS model-used: target model nekoapi-chat/gpt-5.5

### sequence-history

- PASS success: all turns passed

### feedback-lite-brief

- FAIL judge-pass: judge passed=false: 最终输出确实比第一轮更具体，补充了主角性格、视觉风格、关键场景、情绪弧线和结尾画面；视觉方向也明确。但它没有明确提炼主题，也没有包含一个可执行的下一步，因此未完全满足 rubric。


## Residual Risk

- This report is produced by real API eval runs only. Parser/check/report unit tests do not satisfy real behavior evidence by themselves.
