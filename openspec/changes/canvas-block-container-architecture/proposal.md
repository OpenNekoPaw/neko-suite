## Why

Canvas currently models creative work as a closed set of hardcoded node types with monolithic data bags, monolithic React node components, ad hoc Scene/Group containment, and node-specific preview logic. This makes new media formats, composable controls, nested organization, Agent-created composites, and consistent preview behavior expensive to add and hard to test.

This change introduces a layered, contract-first Canvas architecture so nodes can be assembled from reusable content, preview, organization, and relationship capabilities while preserving existing `.nkc` files and legacy rendering during migration.

## What Changes

- Add a four-layer Canvas node model that keeps spatial, content, organization, and relationship responsibilities decoupled.
- Add composable content primitives for block/section rendering, field binding, collections, projections, child-node slots, and preset-based node construction.
- Add a generic container capability with policy-driven behavior for Scene, Group, Artboard, and future container types.
- Add composable preview capabilities for asset identity, preview variants, lightweight playback, delegation to specialized extensions, generation candidates, collection previews, and node summaries.
- Add migration and validation contracts for container consistency, absolute coordinates, field bindings, preview runtime state boundaries, and connection endpoint references.
- Add Agent-facing and Webview-facing creation paths for deriving nodes and creating container composites without requiring multi-call non-transactional sequences.
- Preserve legacy node rendering and existing `.nkc` shape through optional fields, compatibility helpers, and phased dual-path rendering.

## Capabilities

### New Capabilities

- `canvas-layered-node-model`: Defines the decoupled spatial, content, organization, and relationship layers for Canvas nodes, including authority boundaries and invariants.
- `canvas-composable-content`: Defines block/section content rendering, field bindings, collections, projections, child-node slots, presets, and dual-path legacy compatibility.
- `canvas-container-organization`: Defines generic container capability, container policy behavior, child membership invariants, composite creation, and Scene/Group/Artboard migration rules.
- `canvas-preview-capabilities`: Defines preview capability composition, preview variant resolution, runtime-only playback state, delegate actions, and node summary previews.
- `canvas-agent-composite-operations`: Defines Agent-accessible derive/composite/structured-content operations over the same Canvas contracts used by the Webview.

### Modified Capabilities

- `panoramic-preview-engine-first`: Canvas lightweight panoramic consumption is aligned with the composable preview capability model while retaining engine-first preview variants and delegated spherical interaction.

## Impact

- Affects `packages/neko-types/src/types/canvas.ts` and new shared Canvas contracts for blocks, bindings, containers, preview variants, and validators.
- Affects `packages/neko-canvas/packages/webview` rendering, node factory, store actions, property panel generation, viewport filtering, clipboard behavior, and tests.
- Affects `packages/neko-canvas/packages/extension` Canvas node API and Agent capability provider tool schemas.
- Affects `packages/neko-agent` tool usage and structured Canvas context extraction.
- Depends on existing engine-first preview boundaries for generated thumbnails/proxies/turntables/waveforms and does not add cross-extension imports.
- Requires migration tests for v1 `.nkc` compatibility and invariant tests for container membership, endpoint resolution, field binding, and preview cleanup.
