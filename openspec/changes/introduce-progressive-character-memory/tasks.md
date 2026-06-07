## 1. Shared Contracts

- [x] 1.1 Add host-agnostic character memory types for source segments, entity mentions, observations, ledger files, profile drafts, state snapshots, change events, and generation context in `packages/neko-types`.
- [x] 1.2 Add structured storyboard voice cue and enriched character participation types while preserving existing storyboard string fields and `characterId` compatibility.
- [x] 1.3 Extend Canvas shot character or projection-compatible contracts to carry role, action, continuity notes, and entity references where supported.
- [x] 1.4 Add validation guards for memory records, confidence values, review status, safe refs, JSON serializability, runtime handle rejection, and bounded payload size.

## 2. Projection And Runtime Integration

- [x] 2.1 Preserve storyboard character role, action, emotion, and continuity notes in storyboard-to-canvas projection.
- [x] 2.2 Preserve structured voice cue speaker/entity metadata in storyboard-to-cut projection while keeping legacy dialogue, voice-over, and sound cue behavior.
- [x] 2.3 Add generation-context assembly helpers that combine storyboard participation, creative entity refs, active state snapshots, and resolved visual/voice representations.
- [x] 2.4 Ensure generated media lineage can reference source cue ids and speaker/entity ids for TTS outputs without requiring lip-sync implementation.

## 3. Agent Skill And Artifact Flow

- [x] 3.1 Update comic-to-animation/storyboard Skill prompts and profile fields to emit optional character observations, appearance hints, voice intent, and continuity notes incrementally.
- [x] 3.2 Add Agent-side projector or helper logic that converts extracted character memory into reviewable `CompositeArtifact` and `GenericTable` blocks.
- [x] 3.3 Add diagnostics for unresolved characters, ambiguous entity matches, missing visual representations, and missing voice representations.
- [x] 3.4 Keep memory extraction draft-only until user approval or source-approved workflow confirmation.

## 4. Persistence And Review

- [x] 4.1 Add project-scoped persistence service or adapter for character evidence ledger files outside runtime-only cache.
- [x] 4.2 Add merge/update operations for accepting, rejecting, superseding, and marking conflicts between observations.
- [x] 4.3 Add state snapshot derivation or persistence helpers with source/evidence traceability.
- [x] 4.4 Expose a minimal review surface through Agent artifact rendering before adding Dashboard-specific UI.

## 5. Tests And Quality Gates

- [x] 5.1 Add unit tests for memory type guards and validator failure cases.
- [x] 5.2 Add storyboard-to-canvas projection tests for enriched character participation preservation.
- [x] 5.3 Add storyboard-to-cut projection tests for structured voice cue preservation and legacy fallback.
- [x] 5.4 Add Agent Skill tests for comic-to-animation character observation output and missing representation diagnostics.
- [x] 5.5 Run `pnpm exec vitest --run` for affected packages, `openspec validate --all`, and `git diff --check`.
