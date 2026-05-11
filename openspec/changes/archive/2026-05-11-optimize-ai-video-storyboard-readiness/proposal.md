## Why

`neko-story` and `neko-canvas` both expose storyboard-oriented surfaces, but they currently answer different creator questions only implicitly. AI video creators need an explicit scene-level readiness view before generation, plus a shot-level execution summary after Canvas handoff, so they can see missing character visuals, duration, Canvas progress, and next actions without confusing Story with a full storyboard editor.

## What Changes

- Upgrade the Story lightweight storyboard table into an AI video scene readiness table focused on scene-level review, missing inputs, and handoff actions.
- Add explicit character visual readiness in Story, including bound/generated/missing/unknown states and thumbnail-backed affordances.
- Add a shared storyboard execution summary contract so Story and Agent can read Canvas scene/shot progress without depending on Canvas internal node structure.
- Preserve Canvas as the only formal shot-level storyboard workspace for ShotNode editing, GalleryNode candidates, large previews, generation, and Cut handoff.
- Extend Agent context handoff so character and scene actions can include stable IDs and visual asset references when available, not just plain text labels.
- Keep Fountain parsing, script entity detection, and scene-level diagnostics owned by Story.

## Capabilities

### New Capabilities

- `story-video-readiness-table`: Defines Story's scene-level AI video readiness table, including scene duration, character visual readiness, missing-input indicators, creator status, and allowed actions.
- `storyboard-execution-summary`: Defines cross-module scene/shot summary contracts between Story, Canvas, and Agent, including Canvas shot execution progress, thumbnail/asset summary fields, and context handoff payloads.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-story/packages/extension` script indexing, scene state store, PreviewPanel message payloads, and Agent/Canvas handoff commands.
- Affects `packages/neko-story/packages/webview` `ScriptTableView` readiness columns, character visual state rendering, thumbnails, and action affordances.
- Affects `packages/neko-types` shared contracts for Story readiness and Canvas execution summaries.
- Affects `packages/neko-canvas/packages/extension` and Webview-side Canvas API extraction paths that expose scene/shot execution summaries without leaking internal node details.
- Affects `neko-agent` context payload consumption for Story scene and character actions when visual asset references are available.
- Uses existing `neko-assets` character thumbnail and registry bindings where possible; no direct Story-to-Canvas or Webview-to-Extension imports are introduced.
