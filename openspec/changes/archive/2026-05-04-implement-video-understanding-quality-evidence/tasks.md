## 1. Contract Placement

- [x] 1.1 Decide whether P0 normalized evidence and `VideoContentIndex` contracts live in `packages/neko-agent` or `@neko/shared`, and document the chosen ownership in code comments or docs.
- [x] 1.2 Define normalized editing evidence types: `BasicQualityIssueCategory`, `BasicQualityIssue`, `QualityEvidenceSource`, issue location, and validation result.
- [x] 1.3 Define `VideoContentIndex` P0 types: source kind, segment, temporal profile, continuity edge, index metadata, and validation result.
- [x] 1.4 Add deterministic id helper APIs for normalized issues, continuity edges, and video content indexes.

## 2. Quality Evidence Normalization

- [x] 2.1 Implement a pure normalization module that accepts `QualityCheck` evaluation summaries and source context.
- [x] 2.2 Implement the explicit QA category mapping table for `tearing`, `jitter`, `stuttering`, `artifact`, `color-distortion`, `audio-clipping`, and `loudness-off`.
- [x] 2.3 Preserve unmapped semantic categories as evidence source payload instead of emitting L0 `BasicQualityIssue`.
- [x] 2.4 Add source metadata propagation for tool name, tool call id, run id, scene index, source category, source issue id, and source time range.
- [x] 2.5 Add deterministic dedupe behavior for repeated normalization of the same source payload.

## 3. QualityReview Evidence Bridge

- [x] 3.1 Extend `createQualityReviewEvidence()` to include normalized issues when the payload contains mappable QA data.
- [x] 3.2 Preserve the existing `QualityReviewEvidenceSummary` shape for current consumers.
- [x] 3.3 Add evidence data fields for normalized issue ids, original issue source data, and mapping diagnostics.
- [x] 3.4 Ensure `QualityCheckConsistency` recommendations can become continuity edge candidates only when adjacent scene or segment references are available.

## 4. QualityCheck Execution Semantics

- [x] 4.1 Make read-only `QualityCheck` avoid implicit media regeneration by default.
- [x] 4.2 Update retry/regeneration behavior to require explicit opt-in or move it behind a separate non-read-only repair path.
- [x] 4.3 Update tool descriptions and parameter schema so users and policies can distinguish analysis from repair.
- [x] 4.4 Update existing tests that expect retry behavior to pass explicit retry/repair input.

## 5. VideoContentIndex Foundation

- [x] 5.1 Implement a P0 index builder that composes source metadata, caller-provided ranges, segments, normalized issues, continuity edges, and evidence ids.
- [x] 5.2 Implement index validation for time ranges, evidence id presence, source kind, segment ordering, and duration bounds.
- [x] 5.3 Ensure critical issues in an index do not trigger edits, repairs, or media generation during index construction.
- [x] 5.4 Add placeholder extension points for future Engine-backed analyzers without binding Agent code to raw FFmpeg commands.

## 6. Tests

- [x] 6.1 Add unit tests for category mapping, semantic issue non-mapping, and ambiguous artifact handling.
- [x] 6.2 Add unit tests for deterministic normalized issue ids and dedupe behavior.
- [x] 6.3 Add unit tests for `QualityReviewEvidence` enrichment while preserving existing summary fields.
- [x] 6.4 Add tests proving read-only `QualityCheck` does not call `mediaGenerator.generate()` without explicit opt-in.
- [x] 6.5 Add schema/builder tests for valid and invalid `VideoContentIndex` time ranges and missing evidence ids.
- [x] 6.6 Add tests proving index construction does not mutate timeline state or call generation APIs.

## 7. Documentation And Validation

- [x] 7.1 Update `docs/architecture/media-quality-assessment.md` with final implemented names and retry/repair semantics.
- [x] 7.2 Update `docs/architecture/video-content-understanding-for-editing.md` with final normalized evidence type names and package ownership.
- [x] 7.3 Run targeted Vitest suites for validation, feedback evidence, and quality check tools.
- [x] 7.4 Run `pnpm check` or the nearest package-level typecheck if touched packages require it.
- [x] 7.5 Record verification commands and results in the final implementation summary.
