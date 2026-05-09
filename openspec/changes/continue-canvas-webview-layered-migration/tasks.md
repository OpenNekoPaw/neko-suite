## 1. Preset Contracts And Defaults

- [x] 1.1 Add migrated preset names and metadata for `shot.basic`, `scene.basic`, `gallery.basic`, and `media.basic` while keeping all existing `*.legacy` presets registered.
- [x] 1.2 Extend `canvasPresetRegistry.ts` so migrated presets can assemble `content`, `container`, `preview`, default data, ports, derive targets, and node summary metadata.
- [x] 1.3 Update `nodeFactory.ts` to apply migrated presets without duplicating data ownership and to preserve legacy-compatible `node.data` fields.
- [x] 1.4 Add preset validation tests for unknown preset rejection, legacy preset compatibility, and migrated preset output shape.

## 2. Composable Core Node Content

- [x] 2.1 Implement the migrated Shot content tree with status, camera controls, duration, visual prompt, character/emotion tags, generation preview, and selected-only detail fields.
- [x] 2.2 Implement the migrated Scene content tree with scene metadata controls, child-node slot, container actions, and selected-only batch actions.
- [x] 2.3 Implement the migrated Gallery content tree with collection-bound cells, gallery-level fields, and cell candidate summaries.
- [x] 2.4 Implement the migrated Media content tree with asset preview, media metadata, and delegate/open actions.
- [x] 2.5 Add any missing block renderer behavior needed by the migrated presets, including action dispatch, generation candidate display, and richer collection item rendering.

## 3. Container Organization Migration

- [x] 3.1 Refactor Scene rendering and shot ordering to use `getContainerChildIds` and `getNodeParentId` instead of direct `data.shotIds` and `data.sceneGroupId` reads.
- [x] 3.2 Refactor top-level canvas filtering, minimap filtering, and child visibility rules to use organization helpers and container policy metadata.
- [x] 3.3 Refactor PropertyPanel and clipboard child membership reads to use container helpers while preserving legacy mirror writes.
- [x] 3.4 Ensure all Scene and Group membership mutations synchronize `container.childIds`, child `parentId`, and legacy mirror fields through generic container actions.
- [x] 3.5 Add tests for migrated nested containers, heterogeneous Scene children, child release, copy/paste remapping, and legacy mirror synchronization.

## 4. Preview And Summary Capabilities

- [x] 4.1 Add stable `NodePreviewDescriptor` generation for migrated Shot, Scene, Gallery, and Media nodes.
- [x] 4.2 Wire Shot generation candidate previews through preview capability metadata bound to Shot data.
- [x] 4.3 Wire Gallery cell previews through collection preview metadata bound to `/cells`.
- [x] 4.4 Wire Media preview sources through asset identity and preview capabilities bound to media data fields.
- [x] 4.5 Add tests that preview summaries omit runtime URLs, engine tokens, player state, and other non-persistent resources.

## 5. Property Panel And Editing Flow

- [x] 5.1 Add binding-aware property panel enumeration for composable nodes before falling back to legacy type-specific branches.
- [x] 5.2 Add generated editors for scalar bindings, select bindings, textarea bindings, tag/collection bindings, and read-only preview metadata.
- [x] 5.3 Add action handling for composable property-panel actions such as batch generation, delegate open, assign selected children, and auto-layout.
- [x] 5.4 Add tests for migrated Shot, Gallery, Media, and Scene property edits writing through `node.data` without replacing unrelated nested data.

## 6. Agent And API Migration

- [x] 6.1 Update Canvas extension API and Agent tool metadata so migrated presets become defaults after parity while explicit legacy presets remain accepted.
- [x] 6.2 Update derive and composite creation tests to assert migrated nodes include `content`, canonical organization fields, summaries, and legacy-compatible data.
- [x] 6.3 Update structured extraction so migrated Gallery collections, Shot bindings, Scene child order, and Media preview summaries are represented consistently.
- [x] 6.4 Add mixed legacy/composable extraction tests and explicit legacy derive/composite compatibility tests.

## 7. Rollout, Parity, And Quality Gates

- [x] 7.1 Add snapshot or render parity coverage for each migrated preset before switching new-node defaults.
- [x] 7.2 Add fixture-based compatibility tests proving existing `.nkc` files without `content` still load and render through legacy paths.
- [x] 7.3 Add regression tests that migrated defaults can be rolled back to `*.legacy` without corrupting existing composable node data.
- [x] 7.4 Run targeted Canvas Webview tests for presets, content rendering, container actions, property panel, preview runtime, and Agent operations.
- [x] 7.5 Run package-level quality gates for affected modules, including `pnpm check`, relevant `pnpm test` targets, and Canvas package build checks.
