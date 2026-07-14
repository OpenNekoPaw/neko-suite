## L3 Quality Review

Risk: L3. The change affects Agent task-result identity, asynchronous continuation routing, generated media resource access, AssetLibrary boundaries, TUI and Extension assembly, Extension delivery, and real Evaluation behavior. It does not change Webview UI code, Engine, Proto, project formats, or user-data migration.

## Findings

No unresolved task-scoped blocking findings.

During review, `MediaTaskDeliveryHost` still exposed an empty `dispose()` after it stopped owning `GeneratedAssetIndex`. The no-op lifecycle method and its only caller were removed; the bootstrap-owned index remains the sole disposal owner.

## Architecture

- Responsibility: generated-output index owns host path/revision resolution; ResourceCache owns derivative materialization; Agent owns typed result/continuation identity; AssetLibrary owns only explicit `AssetEntity` membership.
- Dependency: TUI reuses the existing Platform index and shared content-access provider callback. No Webview, VS Code, Engine, AssetLibrary fallback, parallel store, or package-local cache was introduced.
- Dependency: the host-neutral Platform resolver is now the single index-to-ResourceCache adapter for TUI and Extension. Extension creates its existing workspace index before content access and does not add a second owner or late mutable binding.
- Interface: generic presentation `assets[]` yields only validated resource refs; AssetLibrary identity requires typed `asset`, `assetId`, or `assetIds`. The running queue now preserves the same typed continuation metadata as the idle dispatcher.
- Extension: future generated outputs reuse the existing provider resolver. Future library-producing tasks declare their AssetLibrary identity explicitly.
- Testing: deterministic path tests poison pathful Agent identity, execute real `ReadImage` plus Extension perception loading, real TUI Evaluation proves Tool/task/continuation/artifact order and forbidden fallback, strict AssetLibrary tests prove pre-promotion failure plus post-import success, and the built-in Extension Development Host proves the historical pathless output now loads as actual pixels.

## Verification

Passed:

- Focused Agent/Platform/Extension/Assets/TUI tests recorded in `evaluation-evidence.md`, including 25 TUI tests and the final 58-test Extension group.
- `pnpm test:agent:eval`: 263 tests in 39 files; 26 suites / 38 indexed cases dry-run.
- `pnpm build:neko-agent`: 5/5 build tasks passed, including Extension, Webview, formal TUI executable, and native dependency path.
- `pnpm build`: 33/33 build tasks passed.
- Focused Platform/TUI/Extension content path: 28/28 tests passed.
- Real `agent-runtime.workflow-controller/task-continuation`: `run-mrk2bjpz`, 9/9 hard gates passed.
- Built-in `Debug Dev (All)` plus `vscode-extension-debugger`: attached to `/Users/feng/Git/neko-test`, reopened the exact failing conversation, and verified `ReadImage` success for `res_1bpczcb` with `1024 × 1024` actual image analysis and no new missing-metadata diagnostic.
- `git diff --check`.
- Changed production files produced no matches when package typecheck output was filtered to this change.
- Changed production diff introduced no `legacy`, `fallback`, `deprecated`, `compat`, `shim`, `dirty`, `hack`, `temporary`, `workaround`, `unused`, or `duplicate` terms.

Repository-level blockers outside this change:

- Package-wide `tsc --noEmit` remains blocked by existing errors in unrelated Agent, AI SDK, TUI, Platform, and local-metadata files.
- `pnpm check:agent-boundaries` remains blocked by expired compatibility exceptions and an unchanged `cachePath` test finding; no new boundary finding points to this implementation.
- `pnpm check:legacy-debt` remains blocked by 133 existing migrate-now/needs-review findings; the task-scoped production diff added no debt-term match.
- `pnpm check:unused` remains blocked by the existing repository inventory (one unused Evaluation file, dependency/export findings, and configuration hints); no added resolver, queue contract field, or task-scoped production file was reported unused.
- `pnpm check:deps` remains blocked by two existing `neko-content` document/read-image import cycles; neither cycle traverses the new Platform resolver or Extension assembly.
- `pnpm test` reached 34 successful Turbo tasks before the existing TUI debug-automation test `createTuiAutomationAppPort > accepts submission without waiting for completion and exposes active cancellation` failed because its fixture omitted `options.submitInput`. The focused TUI content tests and all affected Extension/Platform tests passed.

Engine/Rust and Proto validation are not applicable. The Webview source did not change, but Extension Development Host runtime validation was run because the affected user path enters through the Agent Webview.

## Residual Risk

- The real path has one passing sample; it proves correctness for the focused case but not a stability distribution.
- Output-content Judge and baseline stages were intentionally skipped because this change is deterministic identity/routing work, not subjective image-quality optimization.
- Provider token and cost accounting were unavailable in the real report.
- Raw Evaluation reports remain gitignored local evidence under `reports/agent-eval/`.
- Repository-wide test/check gates remain red for the unrelated blockers listed above; they do not invalidate the focused red-to-green repro or the real Extension host acceptance, but they prevent claiming a globally clean worktree.
