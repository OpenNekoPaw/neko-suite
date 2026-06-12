## 1. Shared Contracts And Validation

- [x] 1.1 Add shared `StoryGenre`, `NarrativeSceneMetadata`, `NarrativeEndingMetadata`, `VariableEffect`, `NarrativeGraphSnapshot`, and narrative preview message envelope types.
- [x] 1.2 Add `NarrativeAssetRef` and `NarrativeAssetResolver` contracts aligned with existing `ResourceRef` and `ContentAccessIntent` types.
- [x] 1.3 Extend Canvas node type unions and registered node constants with `narrative-start` and `narrative-ending`.
- [x] 1.4 Split narrative activation node types from `NARRATIVE_TRAVERSAL_NODE_TYPES`, keeping `narrative-note` out of runtime traversal.
- [x] 1.5 Add validators for one `narrative-start`, no incoming runtime edges to start, no outgoing runtime edges from endings, durable narrative asset refs, and `.fountain` scene refs.
- [x] 1.6 Add shared tests covering graph entry fallback, valid ending terminals, note exclusion, deprecated `.nks` / `.story` / standalone `.nkstory` rejection as graph sources, and runtime handle persistence rejection.

## 2. Canvas Webview Narrative Authoring

- [x] 2.1 Add `narrative-start` and `narrative-ending` node descriptors, presets, icons, default sizes, palette entries, and fallback-safe renderers.
- [x] 2.2 Update narrative subsystem manifest trigger node types to include `narrative-start` and `narrative-ending`.
- [x] 2.3 Update Canvas FlowTraversal to use traversal-only node types, prefer `narrative-start` entry, and classify endings separately from accidental dead ends.
- [x] 2.4 Update Canvas connection rules to prevent start incoming runtime edges and ending outgoing runtime edges.
- [x] 2.5 Update `narrative-scene` node UI to show compact `.fountain` scene summaries and missing-scene remediation without mounting Narrative Preview runtime.
- [x] 2.6 Add double-click or edit action routing from `narrative-scene` nodes to the Story/Fountain editor for referenced `.fountain` files.
- [x] 2.7 Add Canvas Webview tests for node activation, node rendering, traversal note exclusion, start/end connection constraints, compact previews, and Story edit delegation messages.

## 3. Canvas Extension Preview Bridge

- [x] 3.1 Add a narrow Canvas editor provider API for read-only in-memory narrative snapshot extraction and highlight message posting.
- [x] 3.2 Implement `NarrativePreviewBridge` in `neko-canvas/packages/extension/` with Preview panel lifecycle, Canvas-to-Preview routing, Preview-to-Canvas routing, disposal, and error reporting.
- [x] 3.3 Generate `requestId` values and attach monotonically increasing Canvas document `revision` values to graph-loading, refresh, and jump messages.
- [x] 3.4 Extract `NarrativeGraphSnapshot` from the open Canvas document model, including unsaved nodes, connections, metadata, variables, scene refs, and character binding references.
- [x] 3.5 Add stale-message handling tests for out-of-order refresh, jump, and variable update messages.
- [x] 3.6 Add bridge lifecycle tests for opening, revealing, closing, disposing, and re-opening Narrative Preview without leaking VSCode disposables.

## 4. Story Fountain Parsing And Scene Loading

- [x] 4.1 Extend `neko-story/packages/parser/` with `FountainPlayParser` that emits ordered `PlayDirective` records from standard Fountain elements.
- [x] 4.2 Add parser support for scene headings, action, dialogue, parentheticals, transitions, and notes without introducing custom branch or variable syntax.
- [x] 4.3 Add character and background binding normalization from `characters.yaml` into `NarrativeAssetRef` values while preserving project-relative shorthand authoring.
- [x] 4.4 Add parser and scene-loading tests for Chinese and English Fountain samples, parenthetical expression hints, missing files, unsupported content, and standard-Fountain-only behavior.
- [x] 4.5 Wire Story save/writeback refresh events so edited `.fountain` scenes can refresh open Narrative Preview snapshots through the bridge.

## 5. Preview Runtime And Player

- [x] 5.1 Add `neko-story/packages/webview/src/preview/` runtime module structure without importing VSCode APIs.
- [x] 5.2 Implement `NarrativeRuntime` load, start, advance, stepBack, jumpTo, reset, variable access, history, status transitions, and ending statistics.
- [x] 5.3 Implement a whitelist-based condition evaluator for simple comparisons and structured unsupported-condition diagnostics.
- [x] 5.4 Implement `NarrativePlayer` shell with toolbar controls, playback controls, variables panel, history panel, full-screen viewport state, and bridge adapter ports.
- [x] 5.5 Implement Preview message handling for `preview:loadGraph`, `preview:refresh`, `preview:jumpTo`, `preview:setVariables`, and `preview:setGenre` with stale revision drops.
- [x] 5.6 Emit `canvas:highlightNode`, `canvas:highlightPath`, and `canvas:choiceMade` messages from runtime transitions.
- [x] 5.7 Add runtime and player tests for graph load, choice advancement, variable effects, locked choices, step back, jump, stale revisions, and ending state.

## 6. Preview Renderers And Assets

- [x] 6.1 Add a `PlayRenderer` registry keyed by `StoryGenre` with explicit unsupported-renderer fallback.
- [x] 6.2 Implement `IllustratedTextRenderer` as the first end-to-end renderer for Fountain directives, inline choices, variables display hooks, and missing asset states.
- [x] 6.3 Implement `VisualNovelRenderer` core path with background layer, static character image layers, ADV/NVL text modes, typewriter effect, and L0/L1 CSS performance options.
- [x] 6.4 Implement `InteractiveFilmRenderer` core path with HTML video playback, subtitle/dialogue overlay, end-of-clip choice presentation, and unavailable-media fallback.
- [x] 6.5 Implement injected `NarrativeAssetResolver` usage in all renderers for `interactive-preview` content and cleanup of runtime URLs or handles.
- [x] 6.6 Add renderer tests for genre dispatch, `.fountain` directive rendering, disabled choices, asset resolver calls, runtime URL non-persistence, and fallback states.

## 7. Export Pipeline

- [x] 7.1 Implement `NarrativeExporter` orchestration in `neko-story/packages/extension/` using the same runtime and renderer kernel as Narrative Preview.
- [x] 7.2 Resolve export assets through `final-export` and package assets through `package` intent rather than reusing Preview URLs or cache-only paths.
- [x] 7.3 Package graph snapshot, parsed Fountain scene content, normalized character bindings, runtime bundle, renderer bundle, and relative asset outputs into HTML5 export artifacts.
- [x] 7.4 Add export validation for missing source assets, unsupported runtime handles, non-portable absolute paths, unsupported conditions, and missing endings.
- [x] 7.5 Add export tests proving Preview and exported HTML5 runtime share graph traversal, choice, variable, and ending semantics.

## 8. Agent Diagnostics And Documentation

- [x] 8.1 Add Agent-facing narrative graph diagnostics for missing entry, unreachable nodes, accidental dead ends, missing endings, invalid scene refs, unresolved variables, and unsupported conditions.
- [x] 8.2 Add structured Agent context extraction for narrative node summaries without resolved Preview URLs or renderer state.
- [x] 8.3 Update architecture docs and README references for Canvas interactive narrative, `.nkc` graph SSOT, `.fountain` scene content, start/end nodes, Preview separation, and deprecated `.nks` / `.story` exclusion.
- [x] 8.4 Add user workflow documentation for creating a branching narrative, editing `.fountain` scenes, opening Narrative Preview, and exporting HTML5.
- [x] 8.5 Run `pnpm check` and fix TypeScript, lint, dependency-boundary, and Webview sandbox violations.
- [x] 8.6 Run targeted Vitest suites for shared contracts, Canvas Webview, Canvas Extension bridge, Story parser, Story Preview runtime, renderers, and export.
- [x] 8.7 Run `pnpm build` after targeted tests pass.
- [x] 8.8 Complete the Neko quality review gate from `docs/architecture/adr-code-review-quality-gates.md` and document residual risks before implementation delivery.
