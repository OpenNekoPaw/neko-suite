## Why

Canvas Webview already has the Block + Container four-layer base, but the main production path still depends on legacy Shot, Scene, Gallery, Media, and property-panel branches. Because the product has not launched, this change can finish the migration as a breaking cleanup: high-value Canvas nodes use composable content, generic container organization, preview capabilities, and Agent preset operations by default without preserving the old core-node file shape.

## What Changes

- Migrate new Shot, Scene, Gallery, and Media node creation to registered composable presets with `content`, bindings, preview descriptors, and, where applicable, `container` capability.
- Remove legacy Shot, Scene, Gallery, and Media React renderers and reject their removed `*.legacy` presets.
- Make Scene Webview behavior read canonical organization state through container helpers instead of relying on `data.shotIds` or `data.sceneGroupId`.
- Replace duplicate child-node rendering for migrated Scene containers with `ChildNodeSlot` summary rendering and preview descriptors.
- Move Shot, Gallery, and Media preview surfaces toward preview capability declarations instead of node-type-specific preview branches.
- Update Agent derive/composite defaults so migrated core node presets are the only built-in choices for Shot, Scene, Gallery, and Media.
- Remove Scene/Shot legacy membership mirrors from the Canvas node data contract.
- Add tests proving legacy core presets are absent, composable rendering is used, and canonical container membership is authoritative.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canvas-layered-node-model`: Migrated Webview production paths must treat four-layer fields and helpers as canonical without Scene/Shot legacy membership mirrors.
- `canvas-composable-content`: Shot, Scene, Gallery, and Media presets must provide production-ready composable content trees, binding metadata, and generated property-panel support.
- `canvas-container-organization`: Scene and Group UI/store behavior must use generic container membership and child slots rather than ad hoc legacy containment reads.
- `canvas-preview-capabilities`: Shot, Gallery, and Media migrated presets must declare lightweight preview and generation-candidate capabilities instead of owning preview behavior solely in monolithic node components.
- `canvas-agent-composite-operations`: Agent derive, composite creation, update-block, and structured extraction must prefer migrated presets and expose their bindings and summaries consistently.

## Impact

- Affects `packages/neko-types/src/types/canvas*.ts`, layered helpers, validators, and migration tests where preset metadata or canonical organization behavior changes.
- Affects `packages/neko-canvas/packages/webview/src/utils/nodeFactory.ts`, `canvasPresetRegistry.ts`, container utilities, preview utilities, store actions, and Agent operation helpers.
- Affects Canvas Webview renderers under `components/content`, legacy node dispatcher paths, deleted `SceneGroupNode`, `ShotNode`, `GalleryNode`, `MediaNode`, and `PropertyPanel`.
- Affects `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts` and Canvas API tests for preset metadata and tool schema defaults.
- Requires targeted Webview tests, snapshot coverage for migrated presets, and regression tests that removed legacy core presets are rejected.
