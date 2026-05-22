## Why

Neko Suite currently treats Live2D/MOC3 parameter playback as the primary 2D puppet model, which blocks in-suite authoring, game-friendly reuse, and AI-driven rig generation. We need a native 2D character standard that preserves Live2D-quality facial deformation while making skeletons, BlendShapes, drivers, and generated assets explicit, testable, and exportable.

## What Changes

- Introduce Neko Native Puppet as the 2D authoring/runtime standard: `Bone2D + BlendShape + ControlDriver`.
- Add `.nkp` v2 native puppet project data and `.nkentity` v2 bindings for `puppet-bone` character representations.
- Add runtime-puppet ECS components and systems for skeletons, skin weights, IK, spring bones, BlendShape weights, expressions, and control drivers.
- Use the default vertex pipeline `ControlDriver -> BlendShape in bind pose -> Skinning`, with optional post-skin corrective BlendShapes.
- Convert Live2D/MOC3 sources one-way into native puppets, including deformer, parameter, motion, expression, physics, draw order, mask, and clipping handling or explicit partial-conversion fallback.
- Add automatic creation flows for PSD, PNG, and Live2D sources that generate skeletons, skin weights, BlendShapes, ControlDrivers, metadata, and previewable `.nkentity` output.
- Add native puppet Agent tools for creation, expression control, direct bone/BlendShape/driver edits, and animation generation.
- Keep legacy MOC3 runtime readable during migration, but freeze new MOC3 runtime feature work until golden render conversion quality is proven.
- Add contract, math, golden render, auto-rig fixture, round-trip, and overlay alignment tests.

## Capabilities

### New Capabilities

- `native-puppet-authoring`: Defines Neko Native Puppet format, runtime semantics, automatic creation, Live2D conversion, ControlDriver behavior, and editor/Agent authoring contracts.

### Modified Capabilities

- `engine-puppet-control-and-renderer`: Add native puppet runtime components, CPU/GPU BlendShape+Skinning execution, ControlDriver command handling, and MOC3 conversion quality gates.
- `creative-entity-asset-composition`: Add native `puppet-bone` entity binding semantics and `.nkentity` v2 metadata for rig template and BlendShape capabilities.
- `asset-export-consistency`: Add native puppet export consistency rules for `.nkp` v2, `.nkentity` v2, Spine JSON, spritesheet, Lottie, and legacy Live2D fallback references.
- `agent-capability-injection`: Add puppet authoring and editing Agent tools with target requirements, query-before-mutate guidance, and safe generation boundaries.

## Impact

- Affected shared contracts include `packages/neko-types/src/types/puppet.ts`, `.nkentity` export contracts, JSON Schema/golden fixtures, and Agent tool metadata.
- Affected Rust engine areas include runtime-puppet ECS components/systems, MOC3 parser/converter reuse, `engine-types` DTOs, and `engine-puppet-renderer` CPU/GPU render-extract paths.
- Affected webview/editor areas include neko-puppet authoring panels, local Canvas2D prototype paths, later ViewportShell integration, overlay prediction, keyframe timeline adapters, and generated puppet preview flows.
- Affected asset/export areas include AssetLibrary/Search metadata, `puppet-bone` binding resolution, character-pack export, and native puppet export commands.
- This change depends on the unified viewport change for the final engine-stream editor shell, but early runtime and conversion work can proceed with local preview/fallback rendering.
