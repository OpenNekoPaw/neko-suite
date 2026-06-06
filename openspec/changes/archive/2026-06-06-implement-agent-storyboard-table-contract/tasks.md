## 1. Shared Contract Foundation

- [x] 1.1 Add `StoryboardTableV1`, scene, shot, character, media ref, profile, extension, and strategy types to `@neko/shared`.
- [x] 1.2 Add stable-core required field constants for table, scene, and shot validation.
- [x] 1.3 Add storyboard validation diagnostic types with `error`, `warning`, `suggestion`, and `profileHint` severities.
- [x] 1.4 Export the new storyboard table contracts from shared package entry points without introducing Agent/Webview dependencies.
- [x] 1.5 Add shared unit tests proving the contracts compile under strict TypeScript settings.

## 2. Validator And Normalizer

- [x] 2.1 Implement a pure `validateStoryboardTableV1` function that checks stable-core fields, scenes, shots, image strategies, media refs, and extension serialization.
- [x] 2.2 Implement a pure `normalizeStoryboardTableV1` function that preserves valid semantic tables and returns normalized display refs.
- [x] 2.3 Implement legacy `CompositeBlockData.sections` to `StoryboardTableV1` compatibility normalization.
- [x] 2.4 Implement legacy `mediaRefs` splitting into `sourceMediaRefs` and `generatedMediaRefs` by role.
- [x] 2.5 Add validator tests for required field errors, non-blocking profile hints, unsafe refs, role consistency, legacy normalization, and non-serializable extensions.

## 3. Composite Content Integration

- [x] 3.1 Extend `CompositeBlockData` or its storyboard adapter to carry optional validated storyboard table semantic data while preserving legacy `sections`.
- [x] 3.2 Update `extractCompositeContentBlocks` / composite parsing to detect v1 storyboard tables and attach validation diagnostics.
- [x] 3.3 Ensure invalid semantic storyboard tables produce bounded diagnostics instead of disappearing silently.
- [x] 3.4 Update Webview composite projection to prefer semantic storyboard data and fall back to legacy sections.
- [x] 3.5 Add presenter tests for valid v1 blocks, invalid v1 diagnostics, legacy section rendering, and mixed semantic-plus-legacy precedence.

## 4. Canvas And Cut Projection

- [x] 4.1 Add `projectStoryboardTableV1ToCanvasPayload` as a pure projector using semantic scenes and shots.
- [x] 4.2 Add `projectStoryboardTableV1ToCutPayload` as a pure projector preserving media-backed shots and audio/dialogue metadata.
- [x] 4.3 Update existing storyboard transfer presenters to call semantic projectors before legacy section-based inference.
- [x] 4.4 Ensure Send-to actions are hidden or disabled when validation has `error` diagnostics or required provider/plugin capability is missing.
- [x] 4.5 Add tests covering scene/shot order, duration, prompt metadata, dialogue, voice-over, sound cues, media refs, and plugin absence.

## 5. Strategy Interpreter

- [x] 5.1 Add `StoryboardImageStrategyInterpreterInputV1`, override, tool capability, action, blocked action, and diagnostic result types.
- [x] 5.2 Implement pure interpretation for `reuse-original`, `use-as-reference`, `generate-new`, and `transform-original`.
- [x] 5.3 Apply `generationPolicy` override before provider routing.
- [x] 5.4 Return missing capability diagnostics when required provider/tool capability is unavailable.
- [x] 5.5 Add tests proving `reuse-original` never schedules generation, `generate-new` requires prompt, source-based strategies require source refs, and denied generation is blocked.

## 6. Runtime Execution And Backfill

- [x] 6.1 Wire strategy interpreter output into Agent runtime without hard-depending on Canvas/Cut/Sketch/Model Webview code.
- [x] 6.2 Route executable generation/transform actions through available provider or tool capability surfaces.
- [x] 6.3 Add storyboard-level backfill mapping from completed tool/media results to shot `generatedMediaRefs`.
- [x] 6.4 Ensure failed or missing provider executions keep the validated storyboard visible and do not create fake refs.
- [x] 6.5 Add runtime tests for generated ref backfill, failed task diagnostics, and provider absence degradation.

## 7. Prompt And Skill Updates

- [x] 7.1 Update storyboard-related prompt/skill guidance to request `StoryboardTableV1` semantic output.
- [x] 7.2 Add profile-specific field templates for script breakdown, manga-to-video, image sequence, ad storyboard, short video, and character design workflows.
- [x] 7.3 Instruct LLM to output plan fields only and never claim generated media before runtime/tool completion.
- [x] 7.4 Update prompt golden snapshots or skill tests affected by the new guidance.

## 8. Verification And Migration

- [x] 8.1 Run focused tests for shared storyboard contracts and validator/normalizer.
- [x] 8.2 Run focused tests for agent composite parsing and Webview presenters.
- [x] 8.3 Run focused tests for Canvas/Cut storyboard transfer projectors.
- [x] 8.4 Run focused tests for strategy interpreter and runtime backfill behavior.
- [x] 8.5 Run `pnpm check` or the narrowest available package-level typecheck covering touched packages.
- [x] 8.6 Document legacy `sections` compatibility and migration behavior in the ADR or package docs if implementation details differ from the proposal.
