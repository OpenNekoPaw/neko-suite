## Agent Evaluation scope

- Change: `introduce-canvas-spatial-asset-groups`
- Decision: update `agent-runtime.creative-media-workflow`.
- TUI-owned behavior: real generated task completion, task-result continuation, stable generated-output artifact identity, terminal idle, and absence of pre-promotion Asset lookup/import, `neko/generated` retention, or active-Canvas fallback.
- VS Code-owned behavior: Canvas runtime review Group, explicit single/batch Save to Assets, frozen Board composite apply, partial failure, stale target, and replay/idempotency.

## Evidence contract

- User behavior: generation completes as a reviewable generated output without implicitly becoming an Asset or project fact.
- Canonical TUI path: approved scope → TUI input queue → real image task → result continuation → generated-output artifact → terminal idle.
- Forbidden fallback: `ListAssets`, `GetAsset`, `ImportAsset`, new `neko/generated` retention, active-Canvas fallback, mock task, or plan completion substituted for delivery.
- Required evidence: task/process order, generated artifact with validator evidence, complete no-fallback fact collections, and terminal idle concerns.
- Expected fail-visible behavior: provider/runtime unavailability is infrastructure-blocked; missing or incomplete path evidence fails rather than falling back.

## Host exclusion

Canonical Agent Evaluation drives `apps/neko-tui`. The TUI does not own a VS Code Webview, Canvas editor panel, runtime generated-Group projection, or frozen Board apply. Its Assets provider intentionally rejects generated-candidate promotion as VS Code-only. Adding a mock promotion tool, a second AgentSession assembly, or Evaluation-only host flag would violate Evaluation ownership.

Therefore the VS Code-owned half of the lifecycle is excluded from TUI Evaluation and must be accepted by the isolated Extension Development Host scenarios in task 6.3. Deterministic Extension/Asset/Canvas service tests remain path-level supporting evidence, not a substitute for the 6.3 runtime scenario.

## Verification

- Focused dry-run passed:
  `node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.creative-media-workflow --case image-quality-feedback-iteration --dry-run`.
- Key-free harness executed: 39/40 files and 271/272 tests passed. The only failure is the shared all-suite count snapshot expecting 40 cases while the parallel working tree currently indexes 42; this proposal does not own the two added cases or their count update.
- Direct all-suite discovery and schema validation passed with 23 suites and 42 cases through `node scripts/agent-eval/all-suite-dry-run.mjs`.
- Focused real case executed as run `canvas-spatial-groups-20260715` with configured `nekoapi-chat/gpt-5.6-luna` and `nekoapi-media/gpt-image-2`; report id `report-canvas-spatial-groups-20260715`.
- Real-case hard gates: process order, both completed image tasks, terminal idle, bounded TODO, and forbidden fallback all passed. Runtime and artifact gates failed: each task-result cycle also produced an empty chat-model response, and the pre-change TUI facts did not project revision-bound task output resources into `artifacts`.
- The artifact observability gap is fixed generically in the TUI App owner by projecting validated task-output `ResourceRef` facts without paths; focused projector/App-port tests pass. The behavior failure is retained rather than rerun into success. Raw reports remain gitignored under `reports/agent-eval/agent-runtime.creative-media-workflow/image-quality-feedback-iteration/canvas-spatial-groups-20260715/`.
- Extension Development Host P0 run passed all four Canvas scenarios on VS Code 1.128.0: `canvas.board-basic-professional.p0`, `canvas.edit-save-reopen.p0`, `canvas.invalid-project.p0`, and `canvas.spatial-groups.p0`. The spatial result is recorded at `reports/webview-functional/canvas.spatial-groups.p0/2026-07-15T04-26-35-350Z/result.json`; raw reports remain gitignored. The spatial scenario covers foundational/structured presentation, contextual Group actions, child and subtree drag, arrange/fit/collapse, nested geometry, keyboard rename, light/dark screenshots, CSP, and runtime error gates.
- Runtime generated-Group promotion UI cannot be constructed by a committed fixture without an Evaluation-only injection path. Single/batch promotion, partial failure, stale target, replay/idempotency, and no-active-Canvas fallback remain covered by Extension/Asset/Canvas integration tests; real Agent-to-VS-Code promotion is the remaining host/provider runtime risk.
