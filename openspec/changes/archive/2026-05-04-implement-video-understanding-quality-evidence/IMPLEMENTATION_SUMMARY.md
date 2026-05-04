## Implementation Summary

Change: `implement-video-understanding-quality-evidence`

### Implemented Shape

- P0 normalized quality evidence lives in `packages/neko-agent/packages/agent/src/validation/quality-evidence-normalizer.ts`.
- `QualityReviewEvidence` enriches Agent-first `PerceptionEvidence.data` with `normalizedIssues`, `sourceIssues`, `normalizationDiagnostics`, and optional `continuityEdgeCandidates`.
- P0 `VideoContentIndex` lives in `packages/neko-agent/packages/agent/src/validation/video-content-index.ts` as a schema, builder, and validator boundary.
- `QualityCheck` is read-only analysis and forces runtime retries to `0`; repair/regeneration uses `QualityRepairCheck`, which is non-read-only and requires confirmation.
- `VIDEO_CONTENT_ANALYZER_PLACEHOLDERS` records future Engine analyzer capability names only. The P0 builder does not invoke analyzers or infer deterministic media analysis output.

### Open Question Resolution

- Contract placement: keep normalized quality evidence and `VideoContentIndex` in `neko-agent` for P0. Promote to shared/proto only when `neko-cut` or another package consumes the contracts directly.
- Global semantic QA issues: keep them as Agent evidence/diagnostics by default in P0. Do not emit L0 `BasicQualityIssue` records unless usable local timing/adjacency evidence exists.
- Repair behavior: split repair into `QualityRepairCheck` now. `QualityCheck` remains a read-only evidence tool.

### Follow-up Review Tightening

- `jitter` now maps to `flicker` only for temporal luminance evidence such as flicker, brightness pulses, flash, or strobe.
- Unmapped `jitter` emits `ambiguous-jitter` diagnostics so Agents can ask for stronger temporal evidence instead of treating it as an unsupported category.
- Style drift `color-pop` uses `STYLE_DRIFT_COLOR_POP_THRESHOLD = 40` with boundary coverage.
- Deterministic hashes use two 32-bit accumulators plus input length to reduce large-index collision risk while staying synchronous and stable.
- The read-only `QualityCheck` schema no longer exposes noop `maxRetries`; runtime compatibility still ignores it when provided.

### Production Wiring Follow-up

- `AgentSession` now observes `QualityCheck`, `QualityRepairCheck`, and `QualityCheckConsistency` tool results through the quality feedback/evidence path.
- `QualityCheck` and `QualityRepairCheck` pass tool-call scene ranges into normalization, so mappable issues can become `normalizedIssues` in production instead of only `missing-time-range` diagnostics.
- Video evaluations expose a clip-level `{ start: 0, end: duration }` fallback range when issue-local timing is absent.
- `QualityRepairCheck` evidence uses `mode: 'repair'` and repair-attempt summary text, and is recorded into the Agent-first Journal evidence graph.
- `QualityCheckConsistency` reports are adapted into `mode: 'consistency'` quality evidence and can emit `continuityEdgeCandidates` when adjacent scene ranges are available.
- Repair evaluation source metadata now preserves `finalPath` as `mediaPath` and attempt count on normalized issue sources.
- Retry result construction preserves `audioMetrics` when present, preventing repair paths from dropping audio evidence if retry policy changes later.

### Known Follow-up Boundaries

- Tool name comparisons still use explicit quality tool string names in the session and feedback contracts. A follow-up should bind them to `TOOL_NAMES_QUALITY` as the single source of truth.
- Duration-only scene arguments are interpreted as asset-local zero-based ranges (`0..duration`), not timeline-anchored clip ranges. Timeline placement still requires explicit `timeRange` or `start`/`end`.
- Consistency-mode confidence still reuses quality-review pass/fail summary semantics. A follow-up should compute confidence from `overallConsistency` directly and format perfect consistency as a relation-level summary rather than `passed 0/0`.
- Repair evaluations preserve final media path and attempt count, but do not yet preserve before/after issue deltas. A follow-up should add `previousIssues` or explicit repair attempt history when P1 edit planning needs delta reasoning.

### Verification

- `pnpm exec vitest --config vitest.config.ts --run packages/agent/src/validation/__tests__/quality-evidence-normalizer.test.ts packages/agent/src/validation/__tests__/video-content-index.test.ts packages/agent/src/feedback/__tests__/quality-review-evidence.test.ts packages/agent/src/validation/__tests__/quality-check-tools.test.ts`
  - Result: passed, 4 files / 30 tests.
- `pnpm exec vitest --config vitest.config.ts --run packages/agent/src/session/__tests__/agent-session.test.ts packages/agent/src/feedback/__tests__/quality-review-evidence.test.ts packages/agent/src/feedback/__tests__/feedback-coordinator.test.ts packages/agent/src/validation/__tests__/quality-check-tools.test.ts packages/agent/src/validation/__tests__/quality-evidence-normalizer.test.ts packages/agent/src/validation/__tests__/video-content-index.test.ts`
  - Result: passed after production wiring follow-up, 6 files / 129 tests.
- `pnpm exec vitest --config packages/extension/vitest.config.ts --run packages/extension/src/tools/__tests__/qualityCheckTools.test.ts`
  - Result: passed, 1 file / 27 tests.
- `openspec validate --all --strict`
  - Result: passed after archive/spec sync, 9 items.
- `openspec validate implement-video-understanding-quality-evidence --strict`
  - Result: passed.
- `git diff --check`
  - Result: passed.
- `pnpm exec tsc -p packages/neko-agent/packages/agent/tsconfig.json --noEmit`
  - Result: repository currently reports unrelated existing test/mock type errors. Filtering for touched quality/video evidence files produced no touched-file diagnostics.
