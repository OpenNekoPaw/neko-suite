# local-v1-eval-smoke-pass

## Summary

- Status: pass
- Exit Code: 0
- Output Dir: /Users/feng/Git/neko-suite/reports/neko-eval/local-v1-smoke-pass-20260709-1440
- Started At: 2026-07-09T06:38:41.474Z
- Completed At: 2026-07-09T06:39:16.743Z
- Passed: 3
- Case Failed: 0
- Infrastructure Failed: 0
- Manifest/Config Invalid: 0

## Cases

| Case | Mode | Status | Exit | Target Model | Turns | Checks |
| --- | --- | --- | ---: | --- | ---: | --- |
| single-baseline | single | pass | 0 | nekoapi-chat/gpt-5.5 | 1 | 2/2 |
| sequence-history | sequence | pass | 0 | nekoapi-chat/gpt-5.5 | 2 | 1/1 |
| feedback-lite-brief | feedback-lite | pass | 0 | nekoapi-chat/gpt-5.5 | 2 | 1/1 |

## Check Details

### single-baseline

- PASS success: all turns passed
- PASS model-used: target model nekoapi-chat/gpt-5.5

### sequence-history

- PASS success: all turns passed

### feedback-lite-brief

- PASS judge-pass: judge passed=true: 第二轮输出比第一轮更具体，明确列出了主题“在失落中守住微光”、视觉方向、3 个具体镜头、结尾情绪，以及可执行的下一步制作动作“绘制关键视觉概念图”，完全满足 rubric。


## Residual Risk

- This report is produced by real API eval runs only. Parser/check/report unit tests do not satisfy real behavior evidence by themselves.
