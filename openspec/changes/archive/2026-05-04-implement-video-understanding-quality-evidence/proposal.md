## Why

`docs/architecture/video-content-understanding-for-editing.md` and `docs/architecture/media-quality-assessment.md` now agree on the target direction, but the implementation still has two gaps: QA results are not normalized into stable time-coded editing evidence, and `QualityCheck` mixes read-only analysis with retry/regeneration semantics.

This change establishes the P0 contract layer needed before automatic video understanding or post-production planning can safely use QA output.

## What Changes

- Add an Agent-first quality evidence normalization layer that converts `QualityCheck` / `QualityCheckConsistency` results into `PerceptionEvidence` summaries and structured editing evidence.
- Define a stable `QualityIssue → BasicQualityIssue / ContinuityEdge` mapping with explicit category normalization, time ranges, metrics, source references, and evidence ids.
- Add the P0 `VideoContentIndex` foundation contract for assets, timeline renders, and clip ranges without implementing full automatic editing.
- Clarify `QualityCheck` read-only behavior by separating pure assessment from repair/regeneration behavior, or making regeneration an explicit opt-in path.
- Add focused tests for category normalization, evidence shape, deterministic ids, no implicit project mutation, and VideoContentIndex schema validation.
- Keep `qualityGate` as historical/future reviewer integration unless a concrete pipeline stage is reintroduced; current integration should flow through `QualityReviewEvidence` / `PerceptionEvidence`.

## Capabilities

### New Capabilities

- `quality-evidence-normalization`: Normalizes QA tool results into Agent-first evidence and editing-oriented quality issues without letting QA scores directly mutate project state.
- `video-content-index-foundation`: Defines and validates the P0 video content index model for time-coded segments, quality issues, continuity edges, temporal profiles, and evidence references.

### Modified Capabilities

- None. Existing OpenSpec capabilities cover 3D render/runtime concerns and do not define media QA or video content understanding requirements.

## Impact

- `packages/neko-agent/packages/agent/src/validation`: QA result normalization, category mapping, and `QualityCheck` execution semantics.
- `packages/neko-agent/packages/agent/src/feedback`: `QualityReviewEvidence` enrichment and deterministic evidence references for normalized issue data.
- `packages/neko-types/src/types`: shared contracts for video content index and normalized editing evidence if the contracts need cross-package reuse.
- `packages/neko-client` / `packages/neko-engine`: no new hard dependency in this proposal; P0 may add facade placeholders for future deterministic media analysis.
- Docs: keep both architecture documents aligned with Agent-first evidence boundaries.
- Tests: Vitest coverage for normalization, evidence bridge, tool read-only behavior, and schema validation; no frontend or Rust test required unless implementation touches those layers.
