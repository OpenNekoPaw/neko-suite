## Why

Long-form video and interactive-video workflows now share the same creative spine: storyboarded scenes and shots that later become generated media, Cut timelines, or branching playback. The current contracts already support StoryboardTable, Canvas Scene/Shot nodes, Canvas playback, and Canvas narrative graphs, but they lack three alignment points: execution plans should be shot overlays rather than duplicate tables, Canvas files need explicit creative scope/navigation metadata, and narrative graphs need durable bindings to storyboard/video segments.

## What Changes

- Define storyboard execution plans, including AnimationPlan, as `shotId`-addressed overlays on StoryboardTable rather than independent duplicate storyboard tables.
- Preserve StoryboardTable as the creative shot-content source while keeping runtime task state in Agent async tasks and execution summaries.
- Add Canvas creative scope and navigation contracts so `.nkc` documents can declare episode, sequence, scene, shot-cluster, or interactive-narrative scope without introducing a file-level Canvas kind lock.
- Add navigation/index behavior for scoped Canvas documents so creators can move between episode overview, sequence boards, scene boards, and related Canvas files without stuffing a full TV episode into one giant board.
- Extend Canvas narrative behavior so `narrative-scene` nodes can bind to storyboard scenes, storyboard shots, Canvas scene/shot nodes, Cut clips, or generated video assets through durable refs.
- Keep Canvas narrative as the interactive graph SSOT; StoryboardTable may expose narrative summaries or links but MUST NOT own variables, branch conditions, or runtime graph topology.
- No breaking change: existing StoryboardTable payloads, Canvas `.nkc` files, Canvas playback, and narrative graphs continue to load without the new optional fields.

## Capabilities

### New Capabilities
- `storyboard-plan-overlays`: Defines provider-neutral execution plan overlays keyed by storyboard identity and shot IDs, including rendering and projection expectations.
- `canvas-creative-scope-navigation`: Defines Canvas creative scope metadata, related-board navigation, and scoped import behavior for long-form video and interactive-video production.

### Modified Capabilities
- `agent-storyboard-table-contract`: Clarify that StoryboardTable remains the creative shot source while execution plans are overlays and task state stays outside StoryboardTable.
- `canvas-interactive-narrative-preview`: Add durable bindings from Canvas narrative scenes to storyboard/video production artifacts while preserving Canvas narrative as the branching graph SSOT.

## Impact

- Affected contracts: `packages/neko-types/src/types/storyboard-table.ts`, future shared plan overlay types, `CanvasData`, Canvas narrative metadata, Canvas playback/narrative snapshots, and related validators/projectors.
- Affected Webviews: Agent rich content renderer, Canvas navigation/overview UI, Canvas narrative node display, Canvas preview/playback diagnostics.
- Affected Extension Host paths: Agent artifact projection, Canvas storyboard import, Canvas active context/execution summary, narrative preview bridge, and capability provider metadata.
- Affected workflows: comic-to-video, storyboard-to-animation-plan, Canvas storyboard import, Cut import, interactive narrative authoring, interactive-film preview/export.
- Compatibility: all new fields are optional and namespaced or versioned; existing persisted `.nkc` and StoryboardTable payloads should remain valid.
