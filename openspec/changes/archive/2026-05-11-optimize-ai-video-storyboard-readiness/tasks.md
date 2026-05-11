## 1. Shared Contracts

- [x] 1.1 Add `StorySceneVideoReadiness`, `StoryCharacterVisualReadiness`, `StoryMissingInput`, and readiness status types in `packages/neko-types`.
- [x] 1.2 Add `CanvasStoryboardExecutionSummary`, `CanvasSceneExecutionSummary`, and `CanvasShotExecutionSummary` contracts in `packages/neko-types`.
- [x] 1.3 Export the new contracts through the existing shared package entry points used by Story, Canvas, and Agent.
- [x] 1.4 Add contract-level tests or compile-time fixtures covering optional fields, empty summaries, and backward-compatible payload shapes.

## 2. Story Readiness Aggregation

- [x] 2.1 Add a Story Extension service that builds `StorySceneVideoReadiness` from `ScriptIndex`, `StorySceneStateStore`, character registry data, and asset thumbnail resolution.
- [x] 2.2 Extend character detection to include conservative action/narrative text mentions matched from `characters.json` canonical names, display names, aliases, and script-facing names.
- [x] 2.3 Implement character visual readiness resolution for bound, generated, missing, unresolved, unknown, and stale-compatible states.
- [x] 2.4 Compute structured missing inputs for unresolved characters, missing character visuals, weak environment/location data, and missing Canvas handoff state.
- [x] 2.5 Add unit tests for standard Fountain character extraction, Chinese narrative registry mention extraction, missing thumbnail handling, unresolved characters, and unavailable asset service fallback.

## 3. Story Webview Readiness Table

- [x] 3.1 Update Story PreviewPanel message payloads to send readiness rows while preserving compatibility with existing `scriptIndex`, `sceneStates`, and thumbnail payloads during migration.
- [x] 3.2 Update `ScriptTableView` to render scene readiness rows, explicit character visual status badges, missing input indicators, duration, creator status, and scene-level actions.
- [x] 3.3 Keep thumbnail display as a readiness affordance with small inline thumbnails and hover previews, without adding candidate gallery or shot-level controls.
- [x] 3.4 Update character click and send-to-Agent actions to use readiness data when available.
- [x] 3.5 Add Webview tests for readiness rendering, empty character states, missing visual state, Canvas progress summary, skipped rows, and action availability.

## 4. Canvas Execution Summary

- [x] 4.1 Add a read-only Canvas API or command to retrieve storyboard execution summaries by source script URI, scene ID, or known scene node binding.
- [x] 4.2 Implement Canvas summary projection using existing SceneGroup container helpers, ShotNode data, selected generated image/asset references, generation status, and timeline import metadata.
- [x] 4.3 Ensure summary projection sanitizes runtime-only URLs, engine tokens, blob URLs, playback state, and Webview-only fields.
- [x] 4.4 Add failure-tolerant responses for no active Canvas editor, missing Canvas file, missing scene binding, and Canvas extension unavailable cases.
- [x] 4.5 Add Canvas extension and Webview store tests for scene correlation, shot counts, generated/failed counts, selected thumbnail references, and timeline import metadata.

## 5. Story / Canvas / Agent Handoff

- [x] 5.1 Integrate Canvas execution summaries into Story readiness aggregation without making Story read raw Canvas nodes directly.
- [x] 5.2 Extend Story scene and character Agent context payloads with optional `sceneId`, `characterId`, asset entity IDs, thumbnail references, readiness status, and missing input summaries.
- [x] 5.3 Preserve existing `story-selection` payload compatibility so older Agent consumers can ignore the new fields.
- [x] 5.4 Add tests for enriched Agent payloads with and without available character visual references.

## 6. Documentation And Architecture Notes

- [x] 6.1 Update Story package documentation to describe the readiness table as a scene-level AI video preparation surface.
- [x] 6.2 Update Canvas documentation or architecture notes to describe execution summaries as read-only projections, not a second source of storyboard truth.
- [x] 6.3 Document the Story/Canvas boundary: Story owns script facts and readiness; Canvas owns shot execution and visual review.

## 7. Verification

- [x] 7.1 Run targeted Story extension and Webview tests for readiness aggregation and table rendering.
- [x] 7.2 Run targeted Canvas extension/Webview tests for execution summary projection.
- [x] 7.3 Run TypeScript checks for affected packages.
- [x] 7.4 Run `openspec status --change optimize-ai-video-storyboard-readiness` and confirm the change is apply-ready.
