## Context

Neko Suite already has a unified creative entity foundation:

- `CreativeEntityRef` identifies characters, locations, objects, scenes, and styles.
- `CreativeEntityCandidate` captures source-derived candidates and provenance.
- `EntityAssetBinding` and `RepresentationResolver` connect entities to portraits, references, voice, motion, video, and other representation assets.
- `CharacterRecord` remains the compatibility source for character registry data.

The missing layer is long-form memory. A comic-to-animation workflow can observe a character in page 3, infer clothes in page 6, notice an injury in page 12, generate a voice in scene 4, and later need all of that state when generating scene 20. Agent context cannot reliably hold that full history. The system needs durable, bounded, reviewable character observations and time-scoped state that can be loaded on demand.

Current storyboard and media paths also lose some character semantics. `StoryboardShotCharacter` already has role, action, emotion, and continuity notes, but Canvas shot characters currently carry only the character id/name/reference/emotion shape. Cut metadata cues carry dialogue text but not speaker entity or voice binding.

## Goals / Non-Goals

**Goals:**

- Add a progressive memory layer that records observations from scripts, comics, videos, generated assets, and user edits without rewriting confirmed entity facts automatically.
- Reuse unified entity identity and representation resolution rather than creating a second character system.
- Support time-scoped state snapshots and change events for appearance, costume, injuries, relationships, knowledge boundaries, and voice traits.
- Preserve character participation and structured voice cues from storyboard through Canvas, Cut, and generation contexts.
- Make extracted facts reviewable with confidence, provenance, conflict diagnostics, and approval status.
- Keep contracts host-agnostic in shared types and keep file/URI/media loading in host adapters.

**Non-Goals:**

- No automatic destructive rewrite of `characters.json`, asset metadata, or bound representation packages.
- No production ML lip-sync driver or voice cloning implementation.
- No attempt to fully solve semantic character matching with a new embedding service in this change.
- No new cross-package direct dependency between Story, Canvas, Cut, Agent, or Assets.
- No requirement that every project immediately migrates existing character metadata into the new memory files.

## Decisions

### Decision 1: Add memory as a layer above unified entity identity

Progressive memory will reference `CreativeEntityRef` when an entity is known, and `CreativeEntityCandidate` or an unresolved mention when it is not. It will not introduce a new canonical character id space.

Alternative considered: store character profiles directly as new entity records. That would conflate confirmed facts with extracted evidence and make hallucinated or low-confidence observations too easy to persist as truth.

### Decision 2: Use append-only observations plus derived current-state snapshots

The durable base is `CharacterObservation`: a bounded, JSON-serializable record with source segment, extracted traits, confidence, provenance, optional entity/candidate link, and review status. `CharacterStateSnapshot` is derived or explicitly approved current-state data for a story range, scene range, shot range, or asset range.

Alternative considered: keep only the latest profile. That is simpler, but it loses why a trait was believed, cannot explain conflicts, and cannot represent long-form changes.

### Decision 3: Represent changes explicitly

Long-form characters change. Hair, clothes, injuries, relationships, secrets, age, and voice can evolve. `CharacterChangeEvent` records a change with source range, before/after summary, affected dimensions, confidence, and approval status.

Alternative considered: encode all changes as notes in snapshots. That is hard to test and hard for generation preflight to reason about.

### Decision 4: Keep observation extraction source-neutral

Scripts, comics, video perception, generated images, manual edits, and Agent analysis all become extractors that produce the same observation contract. Extraction can happen during existing workflows and does not require processing the entire project at once.

Alternative considered: create a comic-only character analyzer. That would solve the immediate workflow but would not reuse evidence from scripts or videos.

### Decision 5: Preserve structured participation through projection

Storyboard character participation should carry stable identity, display name, role, action, emotion, continuity notes, and optional appearance hints into Canvas. Dialogue and voice-over should have an optional structured cue form with speaker/entity/voice binding while keeping existing string fields backward compatible.

Alternative considered: put richer information only in `extensions`. Extensions are useful for experimental data, but role/action/continuity and speaker binding are core projection semantics for comic-to-animation.

### Decision 6: Generation uses snapshots as constraints, not hidden mutation

Before image, video, or TTS generation, Agent or the host runtime can assemble a `CharacterGenerationContext` from entity refs, resolved representations, active snapshots, and approved constraints. Generation results can produce new observations or draft updates, but they do not overwrite confirmed facts without approval.

Alternative considered: let generation tools update character records directly. That would make provider output too authoritative and complicate undo/review.

## Five-Layer Analysis

### Responsibilities

- `neko-types` owns contracts and validators.
- Entity runtime owns confirmed entity facts, candidates, bindings, and representation resolution.
- Progressive memory owns observations, evidence ledger records, snapshots, drafts, and change events.
- Agent owns semantic extraction, matching suggestions, generation-context assembly, and review artifact creation.
- Story, Canvas, Cut, and Assets consume or render the contracts through adapters and registered projectors.

### Dependencies

- Shared contracts remain host-agnostic and must not import VSCode, React, Webview, Story, Canvas, Cut, Agent, or Assets implementation modules.
- Host-specific loading, resource resolution, and write operations stay in extension-side adapters.
- Projection uses shared contract types, registry facets, and capability discovery rather than direct extension-to-extension calls.

### Interfaces

- `CharacterObservation` captures source evidence and extracted traits.
- `CharacterEvidenceLedger` stores append-only observations and review state.
- `CharacterProfileDraft` groups proposed trait updates for review.
- `CharacterStateSnapshot` provides active traits for a bounded story/canvas/cut range.
- `CharacterChangeEvent` records approved or proposed long-term changes.
- `EntityMention` links raw names, OCR/dialogue spans, and visual detections to entity candidates or refs.
- `StoryboardVoiceCue` links dialogue/voice-over text to speaker entity and voice representation.
- `CharacterGenerationContext` packages resolved visual/voice state for media generation.

### Extension

- New extractors can register source kinds without changing the ledger schema.
- New trait dimensions can be added through namespaced keys while validators enforce JSON safety and bounded payloads.
- Shared profile descriptors can expose only the fields a Skill needs for a workflow instead of forcing one universal character table.
- Future lip-sync drivers can consume structured voice cue and generated audio lineage without changing the observation ledger.

### Testing

- Shared validators cover unsafe paths, runtime handles, missing source refs, invalid confidence, unknown status, and oversized payloads.
- Projection tests cover storyboard-to-canvas preservation of character role/action/continuity and storyboard-to-cut cue speaker metadata.
- Agent Skill tests cover comic-to-animation output with character observations, table profiles, and voice cues.
- Generation runtime tests cover preflight context assembly and non-mutating post-generation draft observations.

## Data Flow

```text
Script / Comic / Video / Generated Asset / Manual Edit
        |
        v
SourceSegment + EntityMention
        |
        v
CharacterObservation
        |
        v
EntityMatcher -> CreativeEntityRef or CreativeEntityCandidate
        |
        v
EvidenceLedger
        |
        +--> ProfileDraft -> Review -> CharacterRecord / EntityAssetBinding / accepted traits
        |
        +--> CharacterStateSnapshot + CharacterChangeEvent
        |
        v
CharacterGenerationContext
        |
        v
GenerateImage / GenerateVideo / GenerateTTS / Cut / Canvas
        |
        v
GeneratedAsset lineage + new draft observations
```

## Risks / Trade-offs

- **Risk: Memory data grows quickly.** → Keep observations bounded, source-referenced, and pageable; store summaries and stable refs instead of binary payloads.
- **Risk: Extracted traits become accidental truth.** → Use review status and confidence; generated observations remain draft until accepted.
- **Risk: Protocol bloat.** → Keep base observation dimensions small and use namespaced extensions for workflow-specific traits.
- **Risk: Entity matching mistakes merge characters.** → Candidate matching must be suggestive by default and require approval for merge/confirmation.
- **Risk: Voice support looks like full TTS/lip-sync delivery.** → This change only defines cue/entity/voice binding and preflight context; synthesis and lip-sync remain provider/runtime capabilities.
- **Risk: Cross-package coupling increases.** → Shared contracts plus capability/projector registration remain the integration boundary.

## Migration Plan

1. Add shared contracts and validators without changing existing project files.
2. Preserve existing `characters.json`, `StoryboardShotCharacter.characterId`, `dialogue`, `voiceOver`, and `soundCue` fields.
3. Add optional structured fields and projection preservation in a backward-compatible way.
4. Add Agent extraction and review artifacts behind Skill/profile usage.
5. Add persistence only for accepted ledger/snapshot files and keep draft observations safe to discard.

Rollback is straightforward for P0/P1: ignore the optional memory files and structured fields; existing storyboard, Canvas, Cut, and character registry flows remain valid.

## Open Questions

- Should accepted character traits persist as a dedicated character-memory file, as metadata on `CharacterRecord`, or both through a projected view?
- Which source range identifiers should be canonical for comics without stable page/panel IDs before import?
- What is the first UI surface for reviewing conflicts: Agent artifact table, Dashboard character detail, or Story readiness?
