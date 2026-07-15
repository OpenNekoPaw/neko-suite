# Verification

Date: 2026-07-16

## Execution Policy

All repository-wide commands were rerun serially after terminating stale Turbo/Cargo process groups. No build, test, or check command below overlapped another repository command.

## Focused Contract And Runtime Tests

- `pnpm exec vitest run <18 focused shared/platform/agent/canvas/cut/tui test files>`: passed, 18 files and 84 tests.
- `node --test scripts/webview-functional/pilot-boundaries.test.mjs scripts/webview-functional/scenario-selection.test.mjs scripts/webview-functional/vscode-host.test.mjs`: passed, 15 tests.
- `pnpm exec vitest run packages/neko-types/src/types/__tests__/canvas-board-boundary.test.ts`: passed, 3 tests. The test now checks the canonical public API/projector path and poisons the deleted coordinator/index/resolver/delivery paths.

The focused matrix covered the shared Workspace Board request/result and planner, generated-output lifecycle/adoption, Agent Host projection, migration cleanup/retain behavior, Canvas authoring/projector, explicit Cut target validation, and TUI artifact/Board projection facts.

## VS Code Extension Development Host

- Scenario: `canvas.workspace-board-projection.p0`
- Result: pass, including durable generated source, ordinary Inbox Group/Media nodes, stable generated resource identity, one-child idempotent replay, user placement preservation after reopen/replay, and no runtime errors.
- Report: `reports/webview-functional/canvas.workspace-board-projection.p0/2026-07-15T16-40-54-926Z/result.json`

## Agent Evaluation

- Authoring disposition: `evaluation-decision.json`; the smallest mapped workflow suite was updated with canonical and forbidden-path evidence.
- `pnpm test:agent:eval`: passed, 40 files and 274 tests; dry-run validation passed for 23 suites and 43 cases. This is harness validation only.
- Real case: `agent-runtime.creative-media-workflow/generated-output-workspace-board`.
- Runtime/model: real TUI workflow with `nekoapi-chat/gpt-5.6-luna`.
- Outcome: pass; all 8 hard gates passed for runtime, tool, task, resource, Workspace Board, terminal state, forbidden paths, and generated file.
- Artifact: stable resource `res_4wkx71` validated; one media task completed with no failed task.
- Forbidden fallback: no Asset identity/import, multi-Board resolver/active Board selection, runtime generated draft, or direct Agent turn runner participated.
- Report: `reports/agent-eval/agent-runtime.creative-media-workflow/generated-output-workspace-board/run-mrmbxb8k/result.json`.
- Cost was unavailable. Judge and baseline stages were skipped, so this result is canonical-path acceptance rather than subjective media-quality evidence.

## Repository Gates

- `pnpm exec turbo run build --concurrency=1`: passed, 33/33 tasks (28 cached), in 5m11s. No Cargo lock conflict occurred.
- `pnpm exec turbo run test --concurrency=1`: failed after 28 successful package tasks. The prior load-sensitive 4,000-chunk test passed in this serial run, but `@neko/agent` had 3 deterministic failures: two CreativeTable validation/retry expectations and one incomplete `categoryRegistry.listCategories` test-double contract. Focused rerun reproduced all 3 failures (18 tests passed, 3 failed).
- `pnpm check`: failed in `check:unused`. The new Workspace Board debug command export was removed and disappeared on rerun; the remaining report contains 3 unused files, 6 unused dependencies, 5 unlisted dependencies, 82 unused exports, and 1 duplicate export from the wider branch.
- `pnpm check:deps`: failed with 2 existing `@neko/content` document/read-image circular dependency violations.
- `pnpm check:legacy-debt`: failed with 202 blocking occurrences (`migrate-now` and `needs-review`) across the wider branch.
- `git diff --check`: passed.
- `openspec validate simplify-agent-creative-output-destinations --strict`: passed.

## Quality Review And Residual Risk

Risk is L4 because the change affects the core creative workflow, shared project contracts, VS Code Extension APIs, Agent/TUI asynchronous delivery, Canvas persistence, and Cut authoring targets.

The architecture review found the intended ownership split intact: generated-output persistence belongs to the media Host, spatial projection belongs to Canvas, durable Cut mutation requires an explicit `.nkv` target, and Agent core owns none of those destination states. Public shared contracts carry stable identities while Host paths remain private. New-path tests poison the removed Board routing and runtime-draft paths.

Repository readiness remains blocked by the deterministic Agent test failures and the existing unused/dependency-cycle/legacy-debt gates above. The real workflow and VS Code scenario reduce canonical-path and persistence risk, but they do not prove subjective output quality or clear unrelated branch-wide debt. No user project migration that deletes or moves existing `.nkc` or generated files was exercised; retained migration paths preserve files in place and fail visibly on unavailable records.
