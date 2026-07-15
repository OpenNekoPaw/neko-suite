# Verification

Date: 2026-07-15

This record is Chinese-first in the user-facing handoff; command names, suite ids, and diagnostics remain verbatim for reproducibility. Raw reports are gitignored and are not committed evidence.

## Implemented path

- Board remains ordinary Canvas `.nkc` under `neko/boards/`; no Draft DTO, `.nkdraft`, persisted Basic profile, conversion, or Board-local generated store was added.
- Canvas owns sanitized Board query, deterministic explicit/binding/exact/create resolution, revision-checked delivery, `.nkc` persistence, and Basic/Professional catalog composition.
- Agent owns conversation binding, creator-work intent, Markdown/reference/generated-output classification, frozen run/task targets, async delivery coordination, and user-visible diagnostics.
- Generated media stays under `neko/generated/<kind>/`; Canvas use, professional-project use, and Asset Library membership remain independent.
- Unspecified Storyboard creation produces Markdown; structured Storyboard authoring remains explicit and Professional.

## Reuse and migration

- Reused `ProjectFileStore`, the existing `.nkc` codec/source policy, `CanvasProjectAuthoringService`, Canvas node/subsystem descriptors, `ResourceRef`, Generated Asset index, content access, conversation/runtime projection, and existing Webview functional runner.
- The generated index durable projection was renamed from Draft terminology to generated-output terminology. The old manifest is accepted only as migration input and is rewritten through the canonical generated-output projection without deleting retained files.
- Existing `.nkc` schema and professional nodes are unchanged. Existing professional nodes render in Basic while their creation entries remain hidden.
- A proposed generated-output retention service was removed because it had no production caller or real Canvas/professional/Assets readers. Reference-aware cleanup remains task 6.4 and requires a separate cross-domain usage-query owner; current behavior keeps valuable outputs.

## Verification results

Passed:

- `pnpm build`: 33/33 Turbo tasks passed after final formatting and retention-service removal.
- `pnpm test`: 48/48 Turbo tasks passed, 2m52.084s. The later deletion removed only an uncomposed service/test; post-deletion focused tests and full build passed.
- Focused post-deletion tests:
  - Agent Board coordinator/work/classification/reference projection: 4 files, 21 tests.
  - Canvas Board delivery/index/resolver: 3 files, 19 tests.
  - Shared Board routing/boundary contracts: 2 files, 12 tests.
  - Generated Asset index/migration: 1 file, 7 tests.
- `pnpm test:agent:eval`: 40 files / 272 tests; all 23 indexed suites / 40 cases passed key-free dry validation. This is harness evidence, not real Agent acceptance.
- Real TUI Agent Evaluation:
  - `skill.storyboard/canonical-two-shot-storyboard`, run `board-canvas-20260715`: pass; model `nekoapi-chat/gpt-5.6-luna`; runtime, Skill identity/fingerprint, Markdown table, and no-fallback hard gates passed; 65,131 ms, 0 retries; report under `reports/agent-eval/skill.storyboard/canonical-two-shot-storyboard/board-canvas-20260715/`.
  - `skill.storyboard/storyboard-concept-negative`, run `board-canvas-negative-20260715`: pass; same model/config identity; runtime, non-empty answer, and no Storyboard/Canvas/media fallback hard gates passed; 16,333 ms, 0 retries; report under `reports/agent-eval/skill.storyboard/storyboard-concept-negative/board-canvas-negative-20260715/`.
  - Judge and baseline stages were skipped; token/cost values were unavailable. No quality-improvement or stability claim is made.
- VS Code Extension Development Host `1.128.0`: `canvas.board-basic-professional.p0` passed with runtime-error/CSP gate, Basic catalog, hidden Storyboard entry, existing professional-node rendering, explicit Professional switch, and durable `.nkc` assertion. Report under `reports/webview-functional/canvas.board-basic-professional.p0/2026-07-14T23-58-04-381Z/`.
- `openspec validate introduce-conversation-draft-workspaces --strict`: passed.
- `git diff --check`: passed.
- Committed fixtures, scenarios, OpenSpec artifacts, and Agent Evaluation summaries contain no credentials or runtime tokens.

Repository gates attempted but blocked by existing repository state:

- `pnpm check` / `pnpm check:unused`: failed on 3 Home files, 6 unused dependencies, 5 unlisted dependencies, 82 unused exports, and one duplicate export. The change-local unused Canvas Board projection export was removed.
- `pnpm check:deps`: failed on two pre-existing cycles under `packages/neko-content/src/document/`.
- `pnpm check:agent-boundaries`: failed on two expired 2026-07-04 failure exceptions and one old `media-production-workflow-state.test.ts` `cachePath`; the new Board runtime/static rules produced no finding.
- `pnpm check:legacy-debt`: failed on 137 repository-wide blocking occurrences; no delete-now occurrence was reported.
- `pnpm ci:local`: stopped at `format:check` because 239 repository files are currently unformatted. Change-local new Board/Generated/Storyboard/functional files were formatted separately.

## Unexecuted or blocked acceptance

- Task 6.4: no canonical Canvas/Cut/Audio usage-query contract or Assets membership adapter exists, so safe reference-aware deletion/storage projection cannot be composed. Agent raw project-file scanning and a no-caller abstraction are both rejected.
- Tasks 7.6 and 9.2: real TUI proves Storyboard Skill/Markdown and the adjacent negative, but TUI does not load the VS Code Canvas extension. It cannot emit Board resolver source, `.nkc` Canvas/revision identity, Canvas delivery, explicit structured authoring, or durable Board artifacts. No Evaluation-only Canvas runtime was added.
- Tasks 8.3 and 8.4: Extension Host proves Basic/Professional behavior, CSP/runtime health, and `.nkc` persistence, but the full exact/create/ambiguity + Markdown/file/image/audio/video + async switch/restart/conflict/stale-target matrix still needs provider-backed Agent execution inside the Extension host. Unit/path tests cover these branches but are not reported as functional acceptance.
- Task 9.4 privacy clause remains open: committed inputs and Agent Evaluation reports are clean, but the local gitignored Webview raw report/DOM snapshot contains machine-specific absolute extension/workspace resource paths. It must not be shared; the functional evidence writer needs a redacted shareable projection before this clause can pass.

## Remaining risks

- Automatic Board routing is production-composed only in the VS Code host; Home/TUI have no Canvas authoring adapter and must continue to fail unavailable rather than emulate `.nkc` writes.
- The explicit resolver contract is tested, but the current automatic Webview turn path does not yet expose a first-class `CanvasBoardTargetIdentity` picker; unspecified routing and persisted conversation binding are the exercised product path.
- Full provider-backed Extension Host auto-delivery and cross-domain cleanup require the blocked follow-up boundaries above before this change is archive-ready.
