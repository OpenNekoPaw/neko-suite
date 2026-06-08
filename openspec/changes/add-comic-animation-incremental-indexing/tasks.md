## 1. Shared Contracts

- [ ] 1.1 Add shared incremental indexing contracts for `IndexedRangeState`, `IndexTaskState`, indexing statuses, range refs, and diagnostics.
- [ ] 1.2 Add shared `VisualOccurrence` contract, stable-ref validation, unsafe runtime handle diagnostics, and tests.
- [ ] 1.3 Add shared `PerceptionCapabilityFacet` contract with source, tasks, media kinds, execution mode, device tier, concurrency, cache policy, confidence kind, and approval fields.
- [ ] 1.4 Add shared story continuity contracts for `PlotEvent`, `CharacterStateChange`, `ContinuityConstraint`, `StoryContinuityQuery`, and `StoryContinuitySnapshot`.
- [ ] 1.5 Add shared `BatchExecutionPlan`, item, approval policy, execution policy, cost estimate, target domain, and status contracts.
- [ ] 1.6 Export the new contracts from the shared package entry points and add focused contract tests.

## 2. Validation And Projection

- [ ] 2.1 Implement validators for indexed range states, visual occurrences, perception facets, continuity records, continuity snapshots, and batch execution plans.
- [ ] 2.2 Add confidence handling so `confidenceKind: "none"` outputs are projected as `needs-review` and cannot enter automatic high-confidence binding.
- [ ] 2.3 Add projector helpers from PerceptionCard or semantic evidence into indexed range and visual occurrence records.
- [ ] 2.4 Add projector helpers from visual occurrence and character memory refs into ShotImagePrepPlan reference bundles.
- [ ] 2.5 Add CompositeArtifact/GenericTable projection helpers for visual evidence review, continuity diagnostics, and batch execution review tables.

## 3. Capability Registry And Local Provider Facets

- [ ] 3.1 Extend capability contribution typing to include `PerceptionCapabilityFacet` without creating a parallel registry.
- [ ] 3.2 Add local/engine facet registration helpers for OCR, panel detection, reading order, and speech balloon mask.
- [ ] 3.3 Add provider availability, device tier, confidence kind, default concurrency, and cache policy diagnostics.
- [ ] 3.4 Ensure pure validators/projectors do not require provider registration.
- [ ] 3.5 Add tests for facet injection, provider unavailable handling, and confidence-less provider review gating.

## 4. Runtime Services

- [ ] 4.1 Add an incremental indexing runtime skeleton that registers assets immediately and creates pending IndexedRangeState records.
- [ ] 4.2 Add on-demand/idle task planning that reuses complete tasks and schedules only pending or stale tasks.
- [ ] 4.3 Add a StoryContinuity query runtime that returns bounded StoryContinuitySnapshot values with default scene/chapter lookback limits.
- [ ] 4.4 Add MentionResolver integration points for continuity snapshots without merging entity facts directly.
- [ ] 4.5 Add BatchExecutionPlan construction for asset-indexing and shot-image-prep flows.
- [ ] 4.6 Add BatchExecutionPlan adaptation to provider-specific requests, execution summary backfill, cancellation, retry, and partial-result behavior.

## 5. Persistence And Search Projection

- [ ] 5.1 Define sidecar paths and record formats for semantic-index evidence, memory facts, run artifacts, approval records, and batch summaries.
- [ ] 5.2 Implement sidecar write/read ports or skeletons that keep source assets separate from AI conclusions.
- [ ] 5.3 Add rebuildable SQLite/FTS/vector projection hooks or interfaces without making SQLite the source of truth.
- [ ] 5.4 Add stale detection based on asset hash, provider/model version, schema version, and user refresh.
- [ ] 5.5 Add tests showing cache deletion does not delete sidecar evidence.

## 6. Webview And Canvas Review

- [ ] 6.1 Add Agent Webview rendering support for visual evidence and batch execution review artifacts.
- [ ] 6.2 Add Canvas review sections for visual occurrence refs, character candidates, continuity diagnostics, and batch approval state.
- [ ] 6.3 Ensure Webviews consume host-projected/paged data and never read sidecar or cache files directly.
- [ ] 6.4 Add unavailable provider, device requirement, cost unknown, low confidence, and conflict diagnostics to review surfaces.
- [ ] 6.5 Add tests for paged rendering and disabled execution actions when validation or provider diagnostics are blocking.

## 7. Verification

- [ ] 7.1 Run focused shared type and validator tests for the new contracts.
- [ ] 7.2 Run focused agent runtime tests for indexing planning, continuity query, batch plan execution, retry, cancellation, and recovery.
- [ ] 7.3 Run focused webview/Canvas tests for review rendering and disabled actions.
- [ ] 7.4 Run `pnpm check` or the smallest affected package checks after implementation.
- [ ] 7.5 Update ADR or implementation notes if final package boundaries differ from the proposal.
