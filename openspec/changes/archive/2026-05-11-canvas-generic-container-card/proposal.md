## Why

Canvas containers already use policy-driven organization, but child-node card rendering still depends on a monolithic `ChildNodeCard` with node-type branches. This makes new Canvas node summaries, preview roles, and card-level actions harder to add safely as composable content expands.

## What Changes

- Introduce a webview-local `NodeCardPolicy` registry that produces pure card view models for preview, metadata, badges, and typed actions.
- Replace child-node slot rendering with a generic `NodeCard` composed from preview, metadata, and action slots while preserving the current compact visual behavior.
- Represent card preview input as a discriminated `CardPreviewSource` that reuses `PreviewSourceDescriptor`, fixed render forms, and role-matched safe variants.
- Add typed `NodeCardActionId`, `ContainerActionId`, `ActionCondition`, and dispatcher contexts for card and container actions.
- Move Scene/Gallery/Table container actions out of hardcoded content button switches into declarative preset descriptors and typed dispatchers.
- Preserve existing `.nkc`, `@neko/shared`, protobuf, and extension host message contracts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canvas-composable-content`: Child-node slots render through generic node cards and card policies instead of monolithic `ChildNodeCard` branches.
- `canvas-preview-capabilities`: Compact node-card previews reuse preview source descriptors, fixed render forms, and runtime URL boundaries.
- `canvas-container-organization`: Container-specific actions are declared by presets and dispatched through typed action contexts rather than hardcoded Scene branches.

## Impact

- Affected webview modules: composable content renderers, node-card components and policies, preset registry utilities, preview hooks, and focused tests.
- Affected stores: reuses existing `canvasStore`, `historyStore`, and `clipboardStore`; no new persisted state model.
- Affected extension messaging: reuses existing `openMediaPreview`, `openDocument`, `sendToAgent`, and preview variant resolution handlers; no new extension host handler is required.
- Test impact: adds focused unit tests for policy purity, preview source construction, action condition evaluation, dispatcher behavior, and rendering parity.
