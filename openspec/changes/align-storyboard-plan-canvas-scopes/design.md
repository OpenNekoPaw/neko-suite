## Context

Neko Suite already has the core pieces for long-form video and interactive-video creation:

- `StoryboardTable` is the semantic scene/shot planning contract and can project to Canvas/Cut.
- Canvas `.nkc` files contain nodes, connections, Scene containers, Shot nodes, playback metadata, and narrative subsystem metadata.
- Canvas narrative already treats `.nkc` as the branching graph SSOT for interactive stories.
- Agent skills already mention AnimationPlan, but there is no first-class shared overlay contract or rich rendering path, so plans risk becoming duplicate raw JSON tables.

The architectural issue is not a missing monolithic format. It is a missing alignment layer between creative shot content, execution intent, scoped Canvas workspaces, and interactive playback graphs.

### Five-layer analysis

| Layer | Analysis |
|---|---|
| Responsibility | StoryboardTable owns creative shot content. Plan overlays own provider-neutral execution intent. Agent async tasks own runtime state. Canvas owns visual board and narrative graph state. Cut/Assets own timeline and media artifacts. |
| Dependency | Shared contracts live in `@neko/shared` as Layer 0. Extension Host adapters expose commands and APIs. Webviews render and edit through typed messages only. Feature packages do not directly depend on each other. |
| Interface | Add optional DTOs and refs: storyboard plan overlay, Canvas creative scope, Canvas board navigation refs, and narrative scene production bindings. Do not add required base fields or runtime URLs. |
| Extension | Future AudioPlan, InteractionGenerationPlan, XRPlan, or provider-specific prompt adapters can attach as overlays without expanding StoryboardTable stable core or replacing Canvas narrative. |
| Testing | Contract tests validate DTO guards/projectors. Webview tests verify merged storyboard rendering and navigation summaries. Extension tests verify import/context summaries. Narrative playback tests verify bindings do not change graph traversal authority. |

## Goals / Non-Goals

**Goals:**

- Make AnimationPlan a `shotId` overlay on StoryboardTable, not a second creative table.
- Let Agent generate plan overlays and provider prompts from StoryboardTable while keeping runtime execution state in async task/execution summary contracts.
- Add Canvas scope metadata for episode, sequence, scene, shot-cluster, and interactive-narrative boards.
- Add navigation/index behavior between scoped Canvas documents without forcing one `.nkc` to contain a whole episode.
- Bind Canvas narrative nodes to storyboard scenes/shots, Canvas nodes, Cut clips, and generated video assets through durable references.
- Preserve existing Canvas playback and narrative graph SSOT behavior.

**Non-Goals:**

- Do not replace StoryboardTable with AnimationPlan.
- Do not add variables, branch conditions, hotspots, or narrative graph topology to StoryboardTable.
- Do not make Canvas file kind mutually exclusive; a Canvas may still mix storyboard, narrative, media, and reference nodes.
- Do not persist Webview URIs, blob URLs, provider runtime handles, async task progress, or DOM playback state in StoryboardTable, plan overlays, or Canvas scope metadata.
- Do not require a destructive migration of existing `.nkc` or StoryboardTable payloads.

## Decisions

### Decision 1: Plan overlays are shot-scoped deltas

`AnimationPlan` and future execution plans will reference a source StoryboardTable and provide shot-level overlay records keyed by `shotId` plus optional scene-level or artifact-level metadata. Overlay rows store only execution intent: motion, camera, prompt intent, image prep, audio intent, target providers/capabilities, approval hints, and source/output refs.

Rejected alternatives:

- **Duplicate AnimationPlan table**: simpler to display but repeats scene/shot/story fields and creates sync conflicts.
- **Put all animation fields into StoryboardTable**: convenient initially but turns StoryboardTable into a provider/task/timeline catch-all.
- **Only keep Agent memory**: loses reproducibility across sessions and makes retries/variants hard to reason about.

### Decision 2: Execution state stays in Agent tasks and summaries

Plan overlays may describe whether execution is required or gated, but they do not own `running`, `failed`, `completed`, progress, attempt, seed, or provider run state. Those remain in Agent async task lifecycle and execution summaries. UI can merge task state into storyboard rows as a derived view.

Rejected alternatives:

- **Store status in StoryboardTable**: pollutes creative facts with transient runtime state.
- **Store status in AnimationPlan**: conflates reusable execution intent with one specific run.

### Decision 3: Canvas scope is optional document metadata, not file kind

Add optional `CanvasCreativeScope` metadata to `CanvasData` or a compatible extension section. Scope describes what this board is about: episode overview, sequence, scene, shot-cluster, or interactive narrative. Scope helps navigation, import naming, Agent context, and Dashboard organization, but does not restrict node types or subsystem activation.

Rejected alternatives:

- **One Canvas per scene only**: too fragmented for long-form creative flow.
- **One Canvas per episode only**: too heavy and noisy for detailed visual editing.
- **Canvas kind discriminator**: conflicts with existing multi-purpose Canvas ADR and mixed subsystem design.

### Decision 4: Navigation is a board index over durable refs

Scoped Canvas documents can expose `relatedBoards` and source refs. The navigation layer links episode overview, sequence boards, scene boards, shot clusters, and interactive narrative graphs through workspace-relative paths or resource refs. The board index can be stored in Dashboard/project metadata or derived from opened Canvas files.

Rejected alternatives:

- **Embed all boards in one `.nkc`**: makes large projects hard to load and edit.
- **Hard-code filesystem paths in nodes**: violates portable path rules.

### Decision 5: Canvas narrative remains interactive graph SSOT

Interactive-video branching remains in Canvas narrative nodes, connections, variables, and playback metadata. `narrative-scene` may bind to production artifacts such as storyboard shots or generated video clips, but the binding does not make StoryboardTable the owner of branches or variables.

Rejected alternatives:

- **InteractionPlan as StoryboardTable overlay**: branch graphs are not naturally shot-row data and would overload the table.
- **Cut timeline as interactive graph SSOT**: Cut owns linear or assembled timeline facts, while narrative owns branching logic.

### Decision 6: Narrative production bindings use durable artifact refs

Introduce a small binding shape for narrative scenes:

```text
narrativeScene.productionRefs[]
  kind: storyboard-scene | storyboard-shot | canvas-node | cut-clip | generated-video | asset
  ref: durable id/path/resource ref
  role: primary | fallback | preview | source
```

These refs support interactive-film nodes that play generated or edited video segments while preserving existing Fountain scene refs and narrative asset refs.

## Risks / Trade-offs

- **Risk: Overlay contracts drift from StoryboardTable shot IDs** -> Validators report missing or stale shot refs; renderers show orphan overlay diagnostics instead of silently applying them.
- **Risk: Canvas scope becomes a hidden kind lock** -> Specs require scope to be advisory and validation to accept mixed node types.
- **Risk: Users see too many technical layers** -> Webviews merge StoryboardTable, overlays, and task summaries into one creator-facing storyboard view while keeping raw details inspectable.
- **Risk: Interactive-video binding competes with existing `sceneRef`** -> Keep `sceneRef` for Fountain/story content and add production refs as a separate durable media/storyboard binding.
- **Risk: Long episodes still become huge boards** -> Navigation/index tasks make sequence boards first-class and keep episode overview lightweight.
- **Risk: Existing Agent skills keep emitting raw AnimationPlan blocks** -> Add parser/renderer compatibility for current `domainKind: "AnimationPlan"` payloads while steering prompts toward overlay semantics.

## Migration Plan

1. Add optional shared contracts and validators without changing existing required fields.
2. Teach Agent rich content to detect current AnimationPlan domain payloads and render them as storyboard overlays when a source storyboard/shot IDs are present.
3. Add Canvas scope metadata and preserve it through load/save/migration without requiring older Canvas files to change.
4. Extend Canvas import/context summaries to include scope and related-board refs when present.
5. Extend narrative scene metadata/snapshots to include production refs and keep existing sceneRef behavior unchanged.
6. Update skills and docs so Agent emits plan overlays rather than duplicate tables.

Rollback is straightforward because fields are optional: renderers and adapters can ignore overlays/scope/bindings while preserving them as unknown optional data.

## Open Questions

- Should `CanvasCreativeScope` live as a top-level `CanvasData.scope` field or under a namespaced extension metadata section for NKC v2.1 compatibility?
- Should interactive-video production refs prefer a generic `ResourceRef` envelope or a dedicated union with `storyboardRef`, `cutClipRef`, and `generatedAssetRef` variants?
- Should the first implementation include a Dashboard board index, or only expose enough Canvas metadata for Dashboard to add the index later?
