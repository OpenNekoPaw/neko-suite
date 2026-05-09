## Why

Canvas Webview already has the Block + Container four-layer compatibility base, but the main production path still depends on legacy Shot, Scene, Gallery, Media, and property-panel branches. This change continues the migration so high-value Canvas nodes use composable content, generic container organization, preview capabilities, and Agent preset operations by default while preserving existing `.nkc` files.

## What Changes

- Migrate new Shot, Scene, Gallery, and Media node creation to registered composable presets with `content`, bindings, preview descriptors, and, where applicable, `container` capability.
- Keep legacy nodes without `content` rendering unchanged, but route migrated-node rendering, property editing, and Agent updates through composable content contracts.
- Make Scene and Group Webview behavior read canonical organization state through container helpers instead of directly relying on `data.shotIds`, `data.childIds`, or `data.sceneGroupId`.
- Replace duplicate child-node rendering for migrated Scene containers with `ChildNodeSlot` summary rendering and preview descriptors.
- Move Shot, Gallery, and Media preview surfaces toward preview capability declarations instead of node-type-specific preview branches.
- Update Agent derive/composite defaults so migrated core node presets are first-class choices while legacy presets remain available for compatibility.
- Add migration and parity tests that prove legacy files continue to load and migrated presets preserve visible behavior for the covered nodes.
- No breaking file-format change: legacy data mirrors remain during this phase.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canvas-layered-node-model`: Migrated Webview production paths must treat four-layer fields and helpers as canonical while preserving legacy mirrors for compatibility.
- `canvas-composable-content`: Shot, Scene, Gallery, and Media presets must provide production-ready composable content trees, binding metadata, and generated property-panel support.
- `canvas-container-organization`: Scene and Group UI/store behavior must use generic container membership and child slots rather than ad hoc legacy containment reads.
- `canvas-preview-capabilities`: Shot, Gallery, and Media migrated presets must declare lightweight preview and generation-candidate capabilities instead of owning preview behavior solely in monolithic node components.
- `canvas-agent-composite-operations`: Agent derive, composite creation, update-block, and structured extraction must prefer migrated presets and expose their bindings and summaries consistently.

## Impact

- Affects `packages/neko-types/src/types/canvas*.ts`, layered helpers, validators, and migration tests where preset metadata or canonical organization behavior changes.
- Affects `packages/neko-canvas/packages/webview/src/utils/nodeFactory.ts`, `canvasPresetRegistry.ts`, container utilities, preview utilities, store actions, and Agent operation helpers.
- Affects Canvas Webview renderers under `components/content`, legacy node dispatcher paths, `SceneGroupNode`, `ShotNode`, `GalleryNode`, `MediaNode`, and `PropertyPanel`.
- Affects `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts` and Canvas API tests for preset metadata and tool schema defaults.
- Requires targeted Webview tests, snapshot/parity coverage for migrated presets, and compatibility tests for existing `.nkc` legacy nodes.
