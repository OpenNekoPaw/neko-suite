## 1. Shared Contracts And Validation

- [x] 1.1 Add shared `ShotImagePrepPlan`, `ShotImagePrepOperation`, `ShotReferenceBundle`, character/scene reference wrappers, plan status, cost estimate, and batch request types in `packages/neko-types`.
- [x] 1.2 Add validation guards for prep plan status, required source refs by strategy, operation values, stable media refs, safe JSON, bounded payloads, and unsafe runtime handle rejection.
- [x] 1.3 Add reference bundle validation that reuses `CreativeEntityRef`, rejects invalid entity kinds for character/scene references, and treats memory/semantic/perception refs as stable ids only.
- [x] 1.4 Add unit tests for valid prep plans, unsafe refs, missing source refs, invalid status, invalid entity kinds, oversized JSON, and missing perception diagnostics.

## 2. comic-shot-asset-prep Profile

- [x] 2.1 Register or define the `comic-shot-asset-prep` profile descriptor with required `shotId`, `imageStrategy`, `operationPlan`, and `status` columns.
- [x] 2.2 Add profile shape rules for `maskRefs` and `referenceBundle` JSON cells and ensure profile status projects `ShotImagePrepPlan.status` rather than a separate approval status.
- [x] 2.3 Add profile actions for `approve-shot-prep`, `reject-shot-prep`, `edit-shot-prep`, `estimate-batch-cost`, `run-shot-prep`, and `run-approved-shot-prep-batch`.
- [x] 2.4 Add profile validation tests for missing required columns, invalid cell types, output refs before execution, and action gating.

## 3. Agent Derivation And Runtime

- [x] 3.1 Add pure helpers that derive `ShotImagePrepPlan` records from validated storyboard shots and preserve scene/shot identity, source refs, prompts, image strategy, and diagnostics.
- [x] 3.2 Add strategy mapping for `reuse-original`, `transform-original`, `use-as-reference`, and `generate-new` to prep-plan operation defaults without mutating the source `StoryboardTable`.
- [x] 3.3 Add Agent artifact projection that renders derived prep plans as `CompositeArtifact` / `GenericTable(profile="comic-shot-asset-prep")` with stable refs only.
- [x] 3.4 Add approval state transitions for `planned`, `needs-approval`, `approved`, `queued`, `running`, `succeeded`, `failed`, and `skipped`.
- [x] 3.5 Add tests for storyboard-to-prep derivation, provider unavailable diagnostics, status transitions, and no fake generated refs on failure.

## 4. TransformImage Facade And Execution

- [x] 4.1 Register a `TransformImage` facade capability or runtime tool descriptor with source image, optional mask, edit instruction, target aspect ratio/style, and reference inputs.
- [x] 4.2 Map approved `transform-original` prep plans to provider request fields where supported by existing image generation/edit backends.
- [x] 4.3 Preserve transform lineage in execution summaries and backfill generated/derived output refs without overwriting source refs.
- [x] 4.4 Add cost-estimate plumbing for single-shot and batch prep requests, including explicit unknown-cost diagnostics.
- [x] 4.5 Add tests for facade availability detection, unsupported provider degradation, transform request mapping, backfill lineage, and unknown-cost blocking.

## 5. Batch Execution And Recovery

- [x] 5.1 Add bounded batch execution helpers for approved prep plans with `maxConcurrency`, retry policy, budget limits, failure policy, and cancellation support.
- [x] 5.2 Ensure batch execution requires a current cost estimate before running and blocks plans with schema/ref/provider diagnostics.
- [x] 5.3 Backfill each shot independently and emit an `ArtifactExecutionSummary` with succeeded, failed, skipped, cancelled, and unavailable counts.
- [x] 5.4 Add tests for concurrency limits, budget blocking, retry on transient failures only, cancellation behavior, and preserving successful outputs after single-shot failure.

## 6. Canvas And Cut Integration

- [x] 6.1 Extend Canvas storyboard/shot property rendering to show image prep sections: source/output refs, operation plan, masks, reference bundle, prompts, diagnostics, status, and before/after view.
- [x] 6.2 Add Canvas action dispatch or disabled-action diagnostics for approve, skip, estimate, run single shot, and run approved batch according to registered capabilities.
- [x] 6.3 Ensure Cut handoff consumes approved generated keyframe refs and video prompt metadata without re-parsing source comic images.
- [x] 6.4 Add Canvas rendering tests and Cut projection tests for prepared keyframes, missing outputs, and safe-ref preservation.

## 7. Skill And Documentation

- [x] 7.1 Update comic-to-animation / comic-to-storyboard Skill guidance to fill prep-plan fields conservatively and avoid claiming outputs were generated before execution.
- [x] 7.2 Add prompt guidance for choosing `GenerateImage` versus `TransformImage`, using reference bundles, and reporting missing perception or entity evidence.
- [x] 7.3 Keep Skill metadata limited to registered artifact profiles and generated output tendencies; do not add runtime capability registration through Skill content.
- [x] 7.4 Update ADR or architecture references if implementation decisions diverge from `adr-comic-to-animation-image-prep.md`.

## 8. Validation And Quality Gates

- [x] 8.1 Run focused `neko-types` tests for prep plan validators, profile descriptors, and storyboard derivation helpers.
- [x] 8.2 Run focused `neko-agent` tests for artifact projection, capability routing, approval/cost gates, and backfill.
- [x] 8.3 Run focused `neko-canvas` tests for shot property rendering and action gating.
- [x] 8.4 Run focused Cut/projector tests for prepared keyframe handoff.
- [x] 8.5 Run `openspec validate --all` and `git diff --check`.
