## Why

`neko-canvas` is still organized as a storyboard-oriented editor even though the product now needs narrative flow, behavior debugging, entity relationship, and memory graph surfaces to share the same infinite-canvas interaction model. Introducing file-level canvas kinds or separate Webviews would duplicate core infrastructure and split mixed creative projects across multiple files.

This change makes Canvas multi-purpose by keeping `.nkc` files freely mixed, activating domain subsystems from actual node types, and preserving existing layered Canvas contracts while adding clear extension points for new node libraries.

## What Changes

- Add a Canvas subsystem manifest and Webview registration model so storyboard, narrative, behavior, entity, and memory capabilities can register node types, connection types, metadata defaults, panels, playback controllers, and auto-arrange strategies without coupling Extension Host to React/Webview code.
- Align `.nkc` format versioning around the NKC migrator authority and add v2.1 optional fields for `projected` Canvas files and subsystem metadata sections.
- Expand Canvas node and connection type contracts for built-in subsystem node libraries while keeping unknown complete nodes loadable through validator warnings and fallback rendering.
- Add node-type scanning that activates and deactivates subsystem UI/controllers on demand, with code splitting for subsystem Webview bundles.
- Replace always-on storyboard-specific editing surfaces with a top toolbar, grouped node library, floating subsystem panels, node inline expanded editing, and inline connection editing.
- Add Agent context fields for `nodeTypeSummary`, `activeSubsystems`, and `selectedNodeTypes` so Canvas tools can choose narrative, storyboard, behavior, entity, or memory operations from the current graph.
- Add projected Canvas support for entity and memory graphs where `.nkc` stores layout/cache state while external JSON remains the source of truth through projection adapters.
- No breaking change is intended for existing v1.0/v2.0 `.nkc` files; files containing new v2.1 node types are not guaranteed to render correctly in older Canvas versions.

## Capabilities

### New Capabilities

- `canvas-subsystem-activation`: Defines subsystem manifests, Webview registrations, node/connection registration, on-demand activation, fallback rendering, and subsystem-aware UI injection.
- `canvas-projected-graphs`: Defines projected `.nkc` behavior for entity and memory graphs, projection adapter boundaries, source-of-truth write-back, cache regeneration, and projected graph status.

### Modified Capabilities

- `canvas-layered-node-model`: Extend the Canvas data contract to preserve subsystem metadata, projected flags, registered node and connection types, and unknown complete nodes without violating layer boundaries.
- `canvas-composable-content`: Replace permanent property-panel reliance with node inline expanded editing, floating subsystem panels, and inline connection editing while preserving `node.data` as the authoritative state.
- `canvas-agent-composite-operations`: Extend active Canvas context and Agent-facing Canvas operations with subsystem summaries and registered node/connection awareness.

## Impact

- Shared contracts: `packages/neko-types/src/types/canvas.ts`, NKC codec/migrator/validator, Canvas Agent operation types, and new subsystem/projection contract types.
- Canvas Webview: `CanvasApp`, node renderer/descriptor registries, node factory, toolbar, node library, floating panels, fallback renderer, connection editing, and subsystem code-splitting.
- Canvas Extension Host: Custom editor message handling, status bar updates, Agent API context, projected Canvas adapter discovery, and low-frequency write-back/error handling.
- Related packages: `neko-assets` and `neko-agent` will provide projection adapters for entity and memory sources through shared contracts rather than direct Canvas imports.
- Tests: NKC migration/validation, unknown-node fallback, subsystem activation/deactivation, Agent context compatibility, projected graph write-back, and existing storyboard regression coverage.
