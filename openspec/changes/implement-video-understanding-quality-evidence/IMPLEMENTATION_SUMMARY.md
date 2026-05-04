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

### Verification

- `pnpm exec vitest --config vitest.config.ts --run packages/agent/src/validation/__tests__/quality-evidence-normalizer.test.ts packages/agent/src/validation/__tests__/video-content-index.test.ts packages/agent/src/feedback/__tests__/quality-review-evidence.test.ts packages/agent/src/validation/__tests__/quality-check-tools.test.ts`
  - Result: passed, 4 files / 30 tests.
- `pnpm exec vitest --config packages/extension/vitest.config.ts --run packages/extension/src/tools/__tests__/qualityCheckTools.test.ts`
  - Result: passed, 1 file / 27 tests.
- `openspec validate implement-video-understanding-quality-evidence --strict`
  - Result: passed.
- `git diff --check`
  - Result: passed.
- `pnpm exec tsc -p packages/neko-agent/packages/agent/tsconfig.json --noEmit`
  - Result: repository currently reports unrelated existing test/mock type errors. Filtering for touched quality/video evidence files produced no touched-file diagnostics.
