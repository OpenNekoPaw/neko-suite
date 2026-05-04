## Context

The current QA stack can evaluate images, videos, audio, and cross-scene consistency through `QualityCheck`, `QualityCheckConsistency`, `MediaQualityRuntime`, `ConsistencyEvaluator`, and `RemediationPlanner`. Agent-first contracts already exist through `AgentObservation`, `PerceptionEvidence`, `DecisionRationale`, and `QualityReviewEvidence`.

The missing layer is a stable editing-oriented contract between QA output and video understanding. `QualityIssue` is scene/media oriented and lacks mandatory time ranges, metrics, and normalized editing categories. `VideoContentIndex` is described in architecture docs but has no P0 implementation contract. Also, `QualityCheck` is marked read-only while its default retry path can generate replacement media.

This design keeps QA as an evidence provider. It does not make QA scores the authority for edits, gates, or project mutation.

## Goals / Non-Goals

**Goals:**

- Normalize `QualityCheck` and `QualityCheckConsistency` output into Agent-first evidence and editing evidence.
- Introduce explicit `QualityIssueCategory → BasicQualityIssueCategory / ContinuityEdge` mapping with source references.
- Define a P0 `VideoContentIndex` contract that stores time-coded evidence, not free-form QA scores.
- Make `QualityCheck` execution semantics align with tool permission semantics.
- Preserve existing Agent-first boundaries: Agent forms observations and rationales; tools provide evidence.
- Add tests for deterministic normalization and schema validation.

**Non-Goals:**

- Do not implement full automatic editing, `AutoEditPlan`, or `PostProductionPlan`.
- Do not implement full deterministic Engine media analysis such as `detectFreeze()`, `analyzeFlicker()`, or `inspectFrames()` beyond placeholders needed for typing.
- Do not reintroduce pipeline `qualityGate` as a blocking stage.
- Do not make LLM video scoring authoritative for project mutation.
- Do not move Rust media calculations into TypeScript.

## Decisions

### Decision 1: Add a normalization layer instead of reusing `QualityIssue` directly

Create a small normalization module in the Agent validation or feedback boundary. It accepts `QualityCheck` / `QualityCheckConsistency` payloads and emits normalized editing evidence records:

```ts
interface BasicQualityIssue {
  id: string;
  start: number;
  end: number;
  category: BasicQualityIssueCategory;
  severity: IssueSeverity;
  metrics: Record<string, number>;
  source: QualityEvidenceSource;
  location?: IssueLocation;
  evidenceIds: string[];
  suggestedFixes: string[];
}
```

`QualityIssue` remains the QA tool output. `BasicQualityIssue` becomes the editing-oriented input to `VideoContentIndex`.

Alternative considered: extend `QualityIssue` with all editing fields. That would couple QA internals to timeline understanding and make image/audio-only QA carry video-specific fields.

### Decision 2: Keep normalized issue categories narrower than QA categories

P0 mapping only covers categories that can be made time-coded or metric-backed:

- `tearing → tearing`
- `jitter → flicker` when the evidence describes temporal luminance instability such as flicker, brightness pulses, flash, or strobe
- `stuttering → stutter`
- `artifact → blur | compression` only when metrics or descriptions can disambiguate
- `color-distortion → exposure | color-shift`
- `audio-clipping → audio-clipping`
- `loudness-off → loudness-off`

Semantic categories such as `prompt-mismatch`, `script-mismatch`, `style-drift`, `character-inconsistency`, `composition-poor`, and `motion-unnatural` become continuity/aesthetic evidence only when the input includes a usable time range or segment reference. Otherwise they remain in `PerceptionEvidence.data` and Agent-facing summaries.

Alternative considered: one-to-one category copy. That preserves all QA labels but makes automatic editing prone to treating subjective or global scene labels as local fix targets.

### Decision 3: Make evidence ids deterministic and source-linked

Normalized issues and continuity edges must reference `PerceptionEvidence.id` and preserve source tool metadata:

```ts
interface QualityEvidenceSource {
  toolName: 'QualityCheck' | 'QualityCheckConsistency' | string;
  sourceCategory?: string;
  sceneIndex?: number;
  sourceIssueId?: string;
  toolCallId?: string;
  runId?: string;
}
```

IDs should be derived from stable source fields such as tool name, run id, tool call id, scene index, category, and time range. This supports replay, deduplication, and Journal audit.

Alternative considered: random ids. Random ids are simpler but make snapshot tests, evidence dedupe, and repeated analysis harder.

### Decision 4: `QualityCheck` must not silently mutate when used as a read-only tool

P0 should make one of these implementation choices:

- Preferred: default `maxRetries` to `0` for `QualityCheck`, keeping it read-only, and introduce an explicit repair path later.
- Acceptable: keep retries but mark the tool as non-read-only and route regeneration through explicit approval.

The first option is smaller and better matches Agent-first evidence boundaries.

Alternative considered: keep current behavior and document it. That leaves tool permission semantics misleading and makes automated tool policy harder to trust.

### Decision 5: `VideoContentIndex` P0 is a schema and builder boundary, not a full analyzer

P0 introduces contracts and a basic builder that can compose already-available inputs:

- source metadata
- uniform or caller-provided segments
- normalized quality issues
- optional continuity edges
- evidence ids

Future Engine-backed analyzers can fill richer temporal profiles, shot boundaries, freeze/flicker regions, ASR, and emotion profiles without changing the P0 contract.

Alternative considered: wait until deterministic Engine analyzers exist. That blocks Agent/QA integration and keeps current QA output disconnected from the editing architecture.

## Risks / Trade-offs

- [Subjective QA labels become edit targets] → Only map subjective labels when they carry time range or segment evidence; otherwise keep them as Agent evidence.
- [Read-only behavior change affects existing tests] → Update tests to pass `maxRetries` explicitly where regeneration behavior is expected.
- [Normalized categories are lossy] → Preserve original `QualityIssue` and `ConsistencyReport` details in `PerceptionEvidence.data.source`.
- [VideoContentIndex becomes underpowered] → Treat P0 as schema plus composition; add Engine analyzers in later changes.
- [Contracts land in the wrong package] → Keep module-local types inside `neko-agent` unless another package consumes them; promote to `@neko/shared` only when cross-package usage appears.

## Migration Plan

1. Add normalization contracts and pure mapping helpers with tests.
2. Enrich `QualityReviewEvidence` data with normalized issues where available while preserving existing summary fields.
3. Adjust `QualityCheck` retry default or permission metadata and update tests.
4. Add `VideoContentIndex` P0 schema and builder tests.
5. Update docs to point to the implemented contracts.

Rollback is straightforward: normalized evidence can be omitted from `PerceptionEvidence.data` without breaking existing summary consumers.

## Open Questions

- Should P0 `VideoContentIndex` contracts live in `@neko/shared` immediately, or stay in `neko-agent` until `neko-cut` consumes them?
- Should global scene-level semantic QA issues become `AestheticEmotionProfile` entries, `ContinuityEdge` entries, or only Agent evidence in P0?
- Should repair-oriented behavior be split into a new `QualityRepairCheck` tool now, or deferred after making `QualityCheck` strictly read-only?
