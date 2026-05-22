## Context

The ADR `docs/architecture/adr-2d-bone-blendshape-animation.md` changes the 2D puppet direction from a Live2D/MOC3 parameter runtime to a Neko-native `Bone2D + BlendShape + ControlDriver` model. Existing code already has MOC3 parsing/playback, a puppet renderer that consumes CPU-deformed vertices, `.nkp` legacy contracts, `.nkentity` v1 export contracts, and recent Live2D ZIP bundle import support. The missing layer is a native editable puppet format and runtime that can be generated from PSD/PNG/Live2D sources, edited in Neko Suite, driven by Agent/VTuber inputs, and exported to game/video formats.

This work crosses shared TypeScript contracts, Rust runtime-puppet systems, engine renderer input paths, import/conversion code, AssetLibrary/Search/entity binding, neko-puppet editor UI, and Agent tools. It must preserve project architecture constraints:

- `packages/neko-types` owns shared TS DTOs and guards, not runtime implementation.
- Rust engine crates own authoritative runtime computation and render extraction.
- TypeScript and Rust DTOs align through schema/proto/golden fixtures rather than importing each other.
- Webviews cannot access Node or VSCode APIs directly.
- Existing MOC3 assets remain readable until conversion quality is proven by golden render tests.

## Goals / Non-Goals

**Goals:**

- Define `.nkp` v2 native puppet contracts and `.nkentity` v2 `puppet-bone` binding metadata.
- Implement runtime-puppet ECS components and systems for skeleton, skinning, BlendShapes, expressions, ControlDrivers, IK, and spring bones.
- Preserve a CPU-deformed vertices path first, then add GPU BlendShape+Skinning as a renderer optimization/fidelity path.
- Convert Live2D/MOC3 assets one-way into Neko Native Puppet with measurable golden render quality gates.
- Provide automatic creation entry points for PSD, PNG, and Live2D sources with user preview/micro-adjustment as the expected workflow.
- Expose Agent tools at preset, component, and generation levels.
- Keep puppet editor integration compatible with the unified Viewport proposal without making this change own ViewportShell or ViewportProtocol.

**Non-Goals:**

- Do not write back to MOC3 or claim MOC3 as the internal source of truth.
- Do not remove the legacy MOC3 playback path until golden conversion quality and migration UX are proven.
- Do not require engine-stream ViewportShell for early runtime math or conversion work.
- Do not implement production-quality ML segmentation, pose estimation, or expression generation as part of the first runtime contract pass; provide service seams and fixtures first.
- Do not make runtime-puppet depend on wgpu or renderer internals.

## Decisions

### Decision 1: Native puppet is the source of truth; Live2D is an import source

`.nkp` v2 / `.nkentity` v2 will represent native puppets as structured JSON with skeletons, layers, skin weights, BlendShapes, expressions, ControlDrivers, animations, and import metadata. Live2D/MOC3 ZIPs remain readable inputs and compatibility fallbacks, but authoring and persistence use native fields.

Alternative considered: keep Live2D parameters as the internal runtime model and compile to bones only at export time. Rejected because it keeps authoring dependent on an opaque external model, makes game export lossy, and blocks direct skeleton editing.

### Decision 2: ControlDriver is explicit data, not a hidden compile layer

`ControlDriver` maps named sources such as BlendShape weights, expression weights, tracking parameters, or Live2D parameters to explicit bone transforms or BlendShape weights. Multiple drivers targeting the same output must declare blend mode and priority.

Alternative considered: introduce a runtime parameter-to-bone compiler. Rejected because driver conflicts, bake parity, and debugging become opaque. Explicit drivers are serializable, inspectable, and testable.

### Decision 3: Default deformation order is ControlDriver -> pre-skin BlendShape -> skinning

BlendShape deltas apply in bind pose space before skeleton skinning, matching glTF/VRM/Unity expectations. Optional post-skin corrective BlendShapes can be marked for extreme pose correction without changing default semantics.

Alternative considered: apply BlendShapes after skinning by default. Rejected because facial expressions would not naturally follow head/body bone motion and editing deltas would be harder to reason about.

### Decision 4: Runtime-puppet computes independently of renderer backend

Phase 0/1 keep CPU computation that writes `DeformedVertices`, allowing the existing SpriteBatch renderer path to remain usable. Phase 2 adds GPU BlendShape+Skinning through render-extract data: bind vertices, joint matrices, deltas, and weights. Runtime-puppet remains free of wgpu dependencies.

Alternative considered: move skinning directly into the renderer first. Rejected because it would couple authoring math to GPU backend work and make unit tests harder.

### Decision 5: MOC3 conversion uses parser reuse plus golden render gates

Existing MOC3 parser/deformer/motion/expression/physics code becomes the conversion front-end. Conversion must handle RotationDeformer to Bone2D, WarpDeformer/KeyForm to BlendShapes, parameters/motions/expressions to tracks/presets, and physics to SpringBone/ControlDriver where possible. Draw order, mask, and clipping either convert explicitly or mark partial fallback. Phase 1 cannot be considered complete without golden render comparisons.

Alternative considered: best-effort conversion without visual golden tests. Rejected because a native runtime that silently regresses existing Live2D models would undermine migration trust.

### Decision 6: Automatic creation is contract-first with fixtures before full AI quality

The automatic creation flow stores `autoRig` metadata, confidence, template identity, generated-by version, and user adjustments. Initial implementation can use template/fixture-backed generation and service interfaces for PSD/PNG/AI analysis, then improve model quality in later phases.

Alternative considered: block native puppet until full AI auto-rigging is production quality. Rejected because the runtime and authoring contracts are useful earlier and fixtures can validate the contract before the AI layer is mature.

### Decision 7: Viewport integration is a consumer dependency

PuppetController will implement `ISceneController` and use `scene:puppet:*` commands through the unified Viewport protocol. This change may provide adapter code and puppet overlays, but it does not define Viewport DTOs or ViewportShell. Final engine-stream editor integration depends on the unified viewport change reaching V-1/V0 and engine command routing.

Alternative considered: define a puppet-specific viewport shell in this change. Rejected because it would duplicate shared viewport ownership and recreate cross-editor divergence.

## Risks / Trade-offs

- [Risk] Native format scope is large. -> Mitigation: phase contracts first, CPU runtime second, conversion third, editor/AI/export later.
- [Risk] MOC3 conversion loses visual fidelity for complex parameter spaces. -> Mitigation: require SSIM golden tests, diff heatmaps, partial-conversion diagnostics, and legacy fallback retention.
- [Risk] GPU skinning may diverge from CPU results. -> Mitigation: synthetic mesh tests compare CPU and GPU outputs within tolerance before enabling the GPU path by default.
- [Risk] Auto-rig confidence varies by art style. -> Mitigation: store confidence and user adjustment metadata, require preview/micro-adjustment, and keep template fallback paths.
- [Risk] `.nkentity` v2 changes can break existing exports. -> Mitigation: add v1-to-v2 migration, preserve legacy `live2d` binding role, and validate with round-trip contract tests.
- [Risk] ControlDriver cycles or priority conflicts can create unstable animation. -> Mitigation: detect driver graph cycles, require deterministic blend/priority evaluation, and reject invalid graphs at load time.
- [Risk] Editor interaction latency increases after engine-stream migration. -> Mitigation: rely on unified Viewport overlay prediction and require a <=16ms drag-feedback acceptance target.

## Migration Plan

1. Add shared `.nkp` v2, `.nkentity` v2, animation, ControlDriver, autoRig, and native puppet DTOs with JSON Schema/golden fixtures.
2. Add Rust `engine-types` DTO mirrors and schema/proto/fixture checks for TS/Rust parity.
3. Add runtime-puppet ECS components and CPU systems for ControlDriver, BlendShape, skinning, IK, and spring bones while keeping existing renderer input.
4. Implement MOC3-to-native conversion in phases and gate completion on golden render tests.
5. Add native puppet editor tools over local Canvas2D/fallback preview for early authoring.
6. Add GPU BlendShape+Skinning renderer path and compare against CPU synthetic meshes.
7. Integrate PuppetController with ViewportShell once the unified viewport contracts and shell are available.
8. Add PSD/PNG/Live2D automatic creation entry points, fixture-backed validation, Agent tools, and export paths.

Rollback strategy: native fields are additive during migration. If a native path fails, keep legacy `.nkp`/MOC3 loading and hide native authoring commands behind capability flags while preserving existing puppet playback.

## Open Questions

- What is the first production-quality PSD parser/segmentation provider for automatic creation, and which parts should remain local/offline?
- Should GPU BlendShape buffers be stored as dense per-shape deltas initially, or use sparse/compressed morph targets for large puppets?
- How many public MOC3 fixtures are acceptable for golden testing under licensing constraints?
- Should `puppet-bone` be the final binding role name, or should a broader `puppet` role carry `animationModel` metadata?
