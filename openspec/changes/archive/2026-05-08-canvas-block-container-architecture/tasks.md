## 1. Shared Contracts And Validation

- [x] 1.1 Add shared Canvas layer contracts for optional `content`, `parentId`, container capability, layout state, field bindings, child-node slots, preview capabilities, preview variants, and node preview descriptors.
- [x] 1.2 Add compatibility helpers for reading container children and parent IDs from both legacy fields and new fields.
- [x] 1.3 Add Canvas data validators for absolute-coordinate assumptions, single parent membership, bidirectional child references, container cycles, dangling child IDs, invalid bindings, and dangling connection endpoints.
- [x] 1.4 Add `.nkc` migration infrastructure and a conservative v1-to-v2 migration that mirrors `sceneGroupId`, `shotIds`, and group child IDs into the new organization fields without removing legacy data.
- [x] 1.5 Add unit tests for migration and validator success/failure cases.

## 2. Composable Content Infrastructure

- [x] 2.1 Add content renderer contracts and a `NodeContentDispatcher` that selects composable rendering when `node.content` exists and legacy rendering otherwise.
- [x] 2.2 Implement `ContainerRenderer` with section layouts, slots, selection-gated visibility, collapsible sections, and depth protection.
- [x] 2.3 Implement block renderer registry wrappers for existing inline controls, editable text, status badges, tags, basic asset preview surfaces, buttons, lists, and key-value blocks.
- [x] 2.4 Implement `FieldBinding` read/write utilities for JSON Pointer-style paths into `node.data`.
- [x] 2.5 Add preset registry and low-risk initial presets for annotation/text before migrating complex Shot/Scene/Gallery presets.
- [x] 2.6 Add tests for dual-path rendering, field binding updates, missing binding diagnostics, and preset validation.

## 3. Container Organization

- [x] 3.1 Add `ContainerPolicyRegistry` with built-in `scene`, `group`, and `artboard` policies.
- [x] 3.2 Implement generic container actions for add child, remove child, move/reorder child, release children, delete subtree, and create composite.
- [x] 3.3 Refactor existing Scene and Group store actions to delegate to generic container actions while preserving current UI behavior.
- [x] 3.4 Implement `ChildNodeSlot` rendering through `NodePreviewDescriptor` so containers show child summaries without mounting child nodes twice.
- [x] 3.5 Implement `findFreePosition` and `autoArrangeContainer` with overlap avoidance, layout locks, and Scene grid/sequence defaults.
- [x] 3.6 Add tests for nested containers, heterogeneous children, cycle rejection, child release/delete semantics, layout behavior, and clipboard subtree remapping.

## 4. Preview Capability Runtime

- [x] 4.1 Add preview capability contracts, preview resolver interface, preview renderer registry, and preview runtime owner in the Canvas Webview.
- [x] 4.2 Implement lightweight image, text, document, fallback, audio waveform, video poster/proxy, turntable/clip, and generation-candidate preview renderers.
- [x] 4.3 Integrate engine/extension-host preview variant resolution without persisting runtime URLs or engine tokens into `.nkc`.
- [x] 4.4 Add delegate action handling for image/document/model/video/audio/panoramic preview routes using allowed cross-extension command/API mechanisms.
- [x] 4.5 Add single-active playback and cleanup behavior for source changes, playback stop, Webview dispose, and preview startup failures.
- [x] 4.6 Add tests for preview persistence boundaries, runtime cleanup, fallback rendering, candidate selection, and panoramic delegation.

## 5. Agent And API Operations

- [x] 5.1 Extend the Canvas extension API with derive, create-composite, update-block, and structured-content operations while keeping existing list/get/create/update/generate tools compatible.
- [x] 5.2 Move Webview derive behavior onto shared preset, placement, and connection utilities.
- [x] 5.3 Implement atomic composite creation through the container action path with policy validation and rollback on failure.
- [x] 5.4 Add structured content extraction for JSON, markdown, and prompt formats with optional recursive child inclusion.
- [x] 5.5 Update Agent tool schemas to use registered presets and derive targets instead of duplicated hardcoded type enums.
- [x] 5.6 Add API and tool tests for derive placement, composite atomicity, unknown preset rejection, legacy tool compatibility, and structured extraction.

## 6. Migration Rollout And Quality Gates

- [x] 6.1 Keep legacy nodes rendering unchanged by default and gate composable creation/migration per preset.
- [x] 6.2 Add visual or snapshot coverage for the first composable preset and define the parity criteria for later Shot migration.
- [x] 6.3 Add documentation updates linking this OpenSpec change to `docs/architecture/adr-canvas-block-container.md` and `adr-canvas-preview-boundary.md`.
- [x] 6.4 Run targeted TypeScript checks and Canvas Webview tests for shared contracts, store actions, renderers, and extension API changes.
- [x] 6.5 Run full quality gates appropriate to changed modules: `pnpm check`, `pnpm test`, and relevant package builds.
