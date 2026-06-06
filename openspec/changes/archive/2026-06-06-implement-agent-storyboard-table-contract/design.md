## Context

`neko-agent` currently supports `neko-composite` fenced JSON blocks and a `storyboard-table` template. The existing shape is display-oriented: `CompositeBlockData` stores ordered `sections`, each section may include `mediaRefs`, and Webview presenters infer Canvas/Cut storyboard payloads from section text and resolved image media.

This has been enough for rich rendering and send-to integration, but it leaves the semantic storyboard plan implicit. Current gaps include:

- no shared `StoryboardTableV1` contract owned by `@neko/shared`;
- no validator/normalizer with structured diagnostics or bounded repair input;
- no stable distinction between source media, generated media, and display aggregation;
- no runtime-owned `imageStrategy` interpretation;
- no profile-aware flexibility for different storyboard workflows;
- no storyboard-level result backfill path.

The target architecture is documented in `docs/architecture/adr-agent-storyboard-table-schema.md`: Agent remains prompt-first and agent-first, while the runtime adds guardrails for validation, routing, provider availability, and ref backfill.

## Goals / Non-Goals

**Goals:**

- Define `StoryboardTableV1` and related media/profile/diagnostic contracts in `@neko/shared`.
- Add a validator/normalizer that preserves LLM flexibility while producing reliable stable-core semantics.
- Support legacy `storyboard-table` composite sections during migration.
- Route Canvas/Cut projection through validated semantic data instead of display-section inference.
- Add an image strategy interpreter that turns `imageStrategy` into executable, blocked, or diagnostic runtime plans.
- Keep Agent decoupled from subpackage Webviews and private editor models.
- Update skills/prompts so LLM outputs text plans and does not claim media generation completion before provider backfill.

**Non-Goals:**

- Do not replace Canvas as the formal shot-level storyboard workspace.
- Do not make Agent a unified image/video/audio/character editor.
- Do not require all creative subpackages to be installed before Agent can produce and render a storyboard plan.
- Do not implement full image/video/audio provider migrations in this change.
- Do not remove legacy composite `sections` rendering in the first implementation.
- Do not turn prompt chains into a machine-scheduled pipeline DSL.

## Decisions

### Decision 1: Put the semantic contract in `@neko/shared`

`StoryboardTableV1`, `StoryboardSceneRowV1`, `StoryboardShotRowV1`, `StoryboardMediaRefV1`, `StoryboardTableProfileV1`, diagnostics, stable-core constants, and validator/normalizer contracts will live in `@neko/shared`.

Rationale:

- Canvas/Cut projection needs the same semantic input as Agent validation.
- `@neko/agent-types` can keep `CompositeBlockData` and adapters, but projector functions must not depend on Agent Webview or agent-specific presentation types.
- This follows the existing pattern where cross-package DTOs such as `CanvasStoryboardPayload` live in shared contracts.

Alternative considered: Keep the schema in `@neko/agent-types`.

- Rejected because Canvas/Cut projectors would either depend on Agent-specific packages or duplicate the schema.

### Decision 2: Treat `StoryboardTableV1` as stable core plus profiles and extensions

The validator will distinguish stable-core required fields from profile-specific recommendations.

Stable core is the minimum needed to display, validate, and project:

- table: `schemaVersion`, `kind`, `title`, `scenes`;
- scene: `sceneId`, `sceneTitle`, `shots`;
- shot: `shotNumber`, `duration`, `visualDescription`, `characterAction`, `imageStrategy`.

Profiles such as `script-breakdown`, `manga-to-video`, `ad-storyboard`, and `character-design` add hints and suggested fields without becoming hard requirements. Namespaced `extensions` allow JSON-serializable `neko.*` metadata for workflow-specific detail.

Rationale:

- Keeps LLM creative flexibility.
- Prevents every workflow from needing the same oversized table.
- Gives repair prompts and UI hints structured, testable diagnostics.

Alternative considered: Make all storyboard fields required.

- Rejected because it would make the LLM behave like a rigid form filler and would fail valid workflows that do not need dialogue, sound, camera angle, or media refs.

### Decision 3: Use graded diagnostics instead of binary validation

Validation will produce diagnostics with severities:

- `error`: unsafe or unprojectable, blocks Send-to and triggers repair/failure handling.
- `warning`: projectable but inconsistent or low-confidence.
- `suggestion`: optional quality improvement.
- `profileHint`: missing field recommended by the active profile.

Rationale:

- Only structural failures should block projection.
- Profile-specific missing data should guide refinement without forcing unnecessary repair.
- Diagnostics become a shared input for UI, repair prompts, and tests.

### Decision 4: Normalize legacy composite data into semantic data where possible

Legacy `CompositeBlockData` with `sections` and `mediaRefs` remains renderable. During migration, storyboard-table blocks may be normalized into `StoryboardTableV1` using section heading/content as scene/shot text and media ref roles to populate source/generated refs.

Rationale:

- Avoids breaking existing generated chats and tests.
- Allows new projectors to be introduced incrementally.
- Keeps `CompositeBlockData` as the rich-content envelope while moving storyboard semantics into a dedicated schema.

### Decision 5: Keep `imageStrategy` interpretation in runtime, not in the LLM text

The LLM outputs a plan containing `imageStrategy`, refs, prompts, and `decisionReason`. The runtime validates the plan and interprets strategies:

- `reuse-original`: no generation;
- `use-as-reference`: route generation using source refs;
- `generate-new`: route generation using `generationPrompt`;
- `transform-original`: route transform/edit using source refs.

The interpreter also applies user override and provider availability. It returns executable tasks, blocked tasks, or diagnostics.

Rationale:

- Prevents fake tool results, fake paths, and false completion claims.
- Keeps prompt-first creative decisions while making external effects auditable.
- Allows provider absence to degrade gracefully.

Alternative considered: Let LLM directly call `GenerateImage` for every row.

- Rejected for storyboard plans because it cannot express reuse/reference/transform policy consistently and cannot backfill results into shot-level refs.

### Decision 6: Backfill generated media through stable refs

Completed generation or transform tasks will keep using tool result backfill for generated assets. Storyboard-level backfill will map completed outputs to shot `generatedMediaRefs` or normalized display `mediaRefs` without persisting webview URIs, base64, blob URLs, or absolute paths.

Rationale:

- Reuses existing media task backfill infrastructure.
- Keeps history and shared contracts host-agnostic.
- Allows Webview to resolve preview URIs at render time.

### Decision 7: Implement in phases

Implementation should land in small, testable phases:

1. Shared contracts and validator/normalizer.
2. Agent composite parser integration and legacy normalization.
3. Webview presenter/projector migration.
4. Strategy interpreter and provider availability diagnostics.
5. Storyboard-level backfill and prompt/skill updates.

Rationale:

- The current rich content path is user-visible and should remain stable.
- Validator and projector behavior can be tested independently before strategy execution adds side effects.

## Risks / Trade-offs

- Schema becomes too rigid → Mitigation: stable core remains small; profile fields are hints unless required for projection or safety.
- Legacy composite normalization loses semantic nuance → Mitigation: mark normalized legacy data as compatibility-derived and keep legacy rendering available.
- `mediaRefs` and layered refs drift → Mitigation: validator enforces `sourceMediaRefs` / `generatedMediaRefs` consistency with `StoryboardMediaRefV1.role`.
- Provider unavailable during strategy execution → Mitigation: interpreter returns missing-capability diagnostics and does not write generated refs.
- Backfill targets wrong shot → Mitigation: require stable shot IDs where possible and record diagnostics for ambiguous mappings.
- Capability routing becomes hardcoded → Mitigation: start with known media tools but keep `StoryboardImageToolCapabilityV1.toolName` extensible and aligned with capability registry discovery.
- Repair retry changes creative content → Mitigation: repair prompts only fix structure, refs, and required fields; they must not reinterpret story intent.

## Migration Plan

1. Add shared contract types, constants, and pure validator/normalizer functions.
2. Add unit tests for valid v1, invalid v1, legacy normalization, diagnostics, and extension serialization.
3. Update composite extraction to recognize v1 storyboard tables while preserving legacy `sections`.
4. Update Webview projection to prefer validated v1 data and fallback to legacy data.
5. Update Canvas/Cut projector tests so v1 semantics preserve scene/shot order, duration, prompt, media refs, and dialogue/audio cue fields.
6. Add strategy interpreter tests before wiring any provider side effects.
7. Wire strategy execution with provider availability and user override diagnostics.
8. Update skills/prompts and golden snapshots.
9. Keep legacy rendering until generated chats and tests no longer rely on section-only storyboard tables.

Rollback strategy:

- Keep legacy `CompositeBlockData.sections` parsing and presenters intact.
- Feature-gate v1 validation/projector use if needed.
- On v1 validation errors, render a diagnostic block and legacy display when available instead of failing the whole message.

## Implementation Notes

- Profile namespace: v1 ships with the built-in `StoryboardTableProfileV1` union only. Custom or provider-owned profile names are deferred to v1.1, likely through a namespaced form such as `custom.${string}` or provider capability metadata.
- Storyboard backfill: the first implementation patches the semantic storyboard table with stable `generatedMediaRefs` derived from completed tool outputs. It does not persist Webview URIs, blob URLs, base64 payloads, or fake paths. A future overlay model can be introduced if persistence policy changes.
- Transform ownership: Agent owns only strategy interpretation and capability routing. `transform-original` routes through the `TransformImage` capability/tool name; concrete edit/transform execution remains provider-owned or package-owned.
- Capability discovery: known tool names start with `GenerateImage`, `TransformImage`, and `ResolveMediaRef`, while `StoryboardImageToolNameV1` remains extensible. Runtime infers reference support conservatively from tool schemas and does not claim `GenerateImage` reference support when only existence is known.
