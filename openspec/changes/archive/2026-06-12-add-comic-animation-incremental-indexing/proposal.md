## Why

Comic-to-animation workflows need more than one-off video generation: long-form manga projects require stable local evidence, incremental character/appearance memory, continuity context, and recoverable batch execution. Current storyboard and shot image prep contracts can plan shots, but they do not yet define how new media is incrementally indexed, how visual/plot evidence is persisted and queried, or how local perception work enters approval and recovery flows.

## What Changes

- Add shared contracts for comic/media range indexing, including `IndexedRangeState`, `IndexTaskState`, and `VisualOccurrence`.
- Add a `PerceptionCapabilityFacet` so local, engine, plugin, MCP, and cloud perception providers can advertise OCR, ASR, panel detection, reading order, speech balloon mask, visual occurrence, embedding, and VLM review support through the capability registry.
- Add story continuity contracts for `PlotEvent`, `CharacterStateChange`, `ContinuityConstraint`, `StoryContinuityQuery`, and `StoryContinuitySnapshot`.
- Add a generic `BatchExecutionPlan` contract for asset indexing and shot image prep approval, cost/device/provider diagnostics, retry/cancel behavior, and execution summary handoff.
- Define sidecar/JSON SSOT and SQLite/FTS/vector query projection boundaries for comic-to-animation evidence while staying aligned with existing structured persistence and entity memory ADRs.
- Add projector/runtime integration points so PerceptionCard evidence, semantic index entries, StoryboardTable rows, ShotImagePrepPlan rows, and CompositeArtifact/GenericTable review surfaces can reference the same stable evidence.

No breaking changes are intended for existing StoryboardTable, ShotImagePrepPlan, CompositeArtifact, or PerceptionCard consumers.

## Capabilities

### New Capabilities

- `comic-animation-incremental-indexing`: Defines local perception capability facets, range indexing states, visual occurrence evidence, sidecar persistence, and local/engine provider registration for comic-to-animation evidence.
- `comic-animation-continuity-index`: Defines plot event, character state change, continuity constraint, and query snapshot contracts for incremental story continuity retrieval.
- `comic-animation-batch-execution-plan`: Defines a generic batch execution approval plan for asset indexing and shot image prep, including provider availability, device tier, cost, retry, cancel, and execution summary behavior.

### Modified Capabilities

None.

## Impact

- `packages/neko-types/src/types/`: new shared contracts, validators, guards, and tests for indexing, visual evidence, continuity, perception facets, and batch execution plans.
- `packages/neko-agent/packages/agent`: MentionResolver integration, continuity query runtime, artifact/projector helpers, BatchExecutionPlan construction, and tests.
- `packages/neko-agent/packages/platform` and Extension Host integration: local/engine perception provider registration, provider availability/device-tier diagnostics, and stable ref materialization boundaries.
- `packages/neko-agent/packages/webview` and `neko-canvas`: review rendering for visual evidence, candidate entity review, continuity diagnostics, and batch execution approval tables.
- `.neko/semantic-index`, `.neko/memory`, `.neko/runs`, and `.neko/.cache`: sidecar/JSON facts and rebuildable SQLite/FTS/vector projection wiring.
- Documentation and ADR references for comic-to-animation incremental indexing and provider/fallback behavior.
