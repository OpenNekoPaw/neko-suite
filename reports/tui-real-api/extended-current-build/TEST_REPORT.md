# Extended Current Build Real API Test Report

Date: 2026-07-08

Executable under test: `/Users/feng/Git/neko-suite/packages/neko-agent/neko`

## Invocation

Full suite command:

```bash
./packages/neko-agent/neko real-api-suite --manifest reports/tui-real-api/extended-current-build/manifest.json --output-dir reports/tui-real-api/extended-current-build/run
```

Saved command file: `reports/tui-real-api/extended-current-build/suite-command.txt`

Suite stdout/stderr:

- `reports/tui-real-api/extended-current-build/suite.stdout.log`
- `reports/tui-real-api/extended-current-build/suite.stderr.log`

## Test Cases

Case manifest: `reports/tui-real-api/extended-current-build/manifest.json`

Skill and long-task fixtures:

- `reports/tui-real-api/extended-current-build/workspace/.neko/skills/strict-format/SKILL.md`
- `reports/tui-real-api/extended-current-build/workspace/.neko/skills/tool-reading/SKILL.md`
- `reports/tui-real-api/extended-current-build/workspace/.neko/skills/disabled-fixture/SKILL.md`
- `reports/tui-real-api/extended-current-build/workspace/.neko/commands/fixture-review.md`
- `reports/tui-real-api/extended-current-build/workspace/skill-fixture.txt`
- `reports/tui-real-api/extended-current-build/workspace/long-source.md`

## Summary

Suite report: `reports/tui-real-api/extended-current-build/run/summary.md`

Result: 10 passed, 1 failed, 0 skipped.

| Area | Case | Result | Evidence |
| --- | --- | --- | --- |
| Basic prompt | `prompt-cn-brief` | pass | `BASIC_PROMPT_CN_OK` |
| Basic prompt | `prompt-json-contract` | pass | JSON marker without Markdown fence |
| Basic prompt | `prompt-tool-restraint` | pass | `NO_TOOL_PROMPT_OK`, no `[tool]` in output |
| Workspace reference | `workspace-file-reference` | pass | `Read` tool, `WORKSPACE_FILE_OK` |
| Media generation | `media-image-generation-submit` | fail | `GenerateImage` not exposed to Agent runtime |
| EPUB vision | `epub-vision-two-pages` | pass | `ReadDocument -> ReadImage`, `EPUB_VISION_OK` |
| Skill | `skill-direct-strict-format` | pass | `$strict-format`, `SKILL_STRICT_FORMAT_ACTIVE` |
| Skill | `skill-tool-reading` | pass | `$tool-reading`, `Read`, `SKILL_FIXTURE_FILE_OK` |
| Skill | `skill-command-artifact` | pass | `/fixture-review`, `COMMAND_ARTIFACT_ACTIVE` |
| Skill | `skill-disabled-visible-error` | pass | disabled skill fails visibly |
| Long task | `long-multistep-workflow` | pass | `Read`, `Write`, readback, `LONG_TASK_OK` |

## Important Findings

1. Basic prompt behavior is working across Chinese, strict JSON, and no-tool prompts.
2. Workspace and EPUB content access are working. EPUB evidence used the canonical `ReadDocument -> ReadImage` path and stable document-entry `resourceRef`.
3. Workspace skill fixtures load and execute. Direct `$skill`, command artifact `/command`, allowed-tool skill, and disabled-skill diagnostics all behave as expected.
4. Long multi-step processing works in run mode. The long task performed read, path-boundary recovery, write, readback, and final summarization.
5. Media generation through TUI run mode is not working in the current build. The Agent can see an AI generation category, but `GenerateImage` is not exposed as a callable tool. It attempted `ActivateSkill(ai-generate)`, which failed with `Skill "ai-generate" not found`. No taskId was generated and no new generated image file was observed.

## Residual Gaps

- TUI run-mode media generation needs a canonical path that exposes `GenerateImage` when default image media model is configured.
- The media generation case currently exits successfully at CLI level but fails deterministic validation. This is useful evidence but should become a fail-visible diagnostic instead of a conversational "cannot submit" success.
- Skill fixtures without SDD `manifest.json` produce warning logs for missing recommended metadata. This did not block execution, but production skill fixtures should include SDD metadata.
- Long task and tool-reading cases show the model first tried `/workspace/...` absolute paths before recovering to relative paths. The host/tool context should expose clearer working-directory guidance to reduce wasted tool calls.
- This suite validates non-interactive `neko run`; interactive input, autocomplete, slash UI rendering, focus, and queue controls still need PTY/manual TUI evidence.

## Artifact Index

For every case, the suite persisted:

- `*.stdout.md`
- `*.stderr.log`
- `*.result.json`

Directory: `reports/tui-real-api/extended-current-build/run/cases/`

Each `*.result.json` includes the case prompt, command array, provider/model, redacted config snapshot, raw execution result, tool steps, deterministic checks, and final verdict.
