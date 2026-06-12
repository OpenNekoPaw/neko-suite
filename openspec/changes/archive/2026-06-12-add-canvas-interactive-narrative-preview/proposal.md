## Why

Neko Suite already has Fountain script editing, Canvas narrative nodes, media generation, and preview/export infrastructure, but there is no end-to-end way to author, play-test, and package a branching interactive narrative. This change turns the existing Canvas narrative subsystem into the authoring surface for branching stories while keeping scene text as standard `.fountain` content and keeping immersive playback in a separate Preview panel.

## What Changes

- Add Canvas-native interactive narrative graph support using `.nkc` as the branching story graph SSOT.
- Add `narrative-start` and `narrative-ending` node types and update narrative traversal so `narrative-note` remains an editor-only note, not a runtime node.
- Add shared `NarrativeGraphSnapshot`, runtime message, asset-reference, scene metadata, ending metadata, condition-evaluator, and preview state contracts.
- Add a `NarrativePreviewBridge` owned by `neko-canvas/packages/extension/` that extracts snapshots from the in-memory Canvas editor document model and routes revisioned messages between Canvas and Preview.
- Add a Narrative Preview webview entry that can play branching stories with choices, variables, history, renderer selection, and scene rendering.
- Extend the existing Fountain parser package with `FountainPlayParser` for PlayDirective extraction without adding non-standard Fountain syntax.
- Add preview renderers for illustrated text and visual novel core paths, with interactive film renderer and HTML5 export following after the core loop is proven.
- Add `NarrativeAssetRef` and `NarrativeAssetResolver` contracts that align with `ResourceRef` and intent-aware content access. Runtime Webview URIs remain non-persistent.
- Add HTML5 export plumbing that packages the Preview runtime, graph snapshot, Fountain scene content, and resolved assets through `final-export`/`package` intents.
- Explicitly exclude `.nks`, `.story`, and independent `.nkstory` story graph formats from the new workflow. Scene content is standard `.fountain`; branching structure is `.nkc`.

No breaking changes are intended for existing Canvas files or Story Fountain editing. Deprecated Story language extensions can be removed in a later cleanup, but this feature will not depend on them.

## Capabilities

### New Capabilities

- `canvas-interactive-narrative-preview`: Defines Canvas-native branching narrative authoring, shared graph snapshots, runtime playback, Canvas/Preview bridge messaging, Fountain scene parsing, renderer behavior, asset resolution, and export requirements.

### Modified Capabilities

- `canvas-subsystem-activation`: Add narrative start/end trigger node types and split narrative runtime traversal node types from editor-only narrative node types.
- `canvas-preview-capabilities`: Add narrative scene preview/delegation behavior and runtime-state boundaries for Narrative Preview surfaces.
- `intent-aware-content-access`: Require Narrative Preview and export to resolve narrative assets through explicit preview/export/package intents.

## Impact

- `packages/neko-types/src/types/`: Canvas node unions, narrative metadata, traversal constants, `narrative-preview` contracts, `narrative-asset` contracts, condition evaluator contracts, validators, and tests.
- `packages/neko-canvas/packages/webview/`: start/end node descriptors and renderers, narrative node library entries, traversal/highlight behavior, toolbar entry for opening Narrative Preview, and tests.
- `packages/neko-canvas/packages/extension/`: `NarrativePreviewBridge`, in-memory snapshot extraction, revision/request routing, preview panel lifecycle, content access integration, and tests.
- `packages/neko-story/packages/parser/`: `FountainPlayParser` extensions and parser tests.
- `packages/neko-story/packages/webview/src/preview/`: Narrative runtime, player, renderers, controls, resource-injected rendering, and webview tests.
- `packages/neko-story/packages/extension/`: Narrative export orchestration, Fountain scene loading, asset packaging, and command integration.
- `packages/neko-agent` and shared Canvas Agent tools: optional branch coverage, missing ending, variable reference, and consistency diagnostics after the core preview path lands.
- Documentation and ADR references for Canvas interactive narrative, Fountain-only scene content, and deprecated `.nks` / `.story` exclusion.
