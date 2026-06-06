## 1. Contract Migration

- [x] 1.1 Extend `packages/neko-types` puppet contracts with `.nkp` v2 native fields for `format: native`, `animationModel`, `importSource`, `autoRig`, `skeleton`, `blendShapes`, `controlDrivers`, `expressions`, and `animations`.
- [x] 1.2 Extend `.nkentity` contracts with v2 support, native puppet binding role metadata, v1 migration/adaptation, and type guards.
- [x] 1.3 Add `AnimationClip2D`, `BoneTrack`, `BlendShapeTrack`, `Keyframe<T>`, ControlDriver, autoRig, and native puppet DTO exports with JSON Schema fixtures.
- [x] 1.4 Add Rust `engine-types` DTO mirrors and schema/proto/golden fixture checks for TypeScript/Rust parity.
- [x] 1.5 Add contract tests for `.nkp` v2 and `.nkentity` v2 serialization/deserialization round-trip and legacy compatibility.

## 2. Runtime Puppet Native Components

- [x] 2.1 Add runtime-puppet `Bone2D`, `Skeleton2D`, `SkinWeights2D`, IK, path constraint, and spring bone components with loader validation.
- [x] 2.2 Add `BlendShapeSet`, `BlendShapeWeights`, `ExpressionPresets`, `ControlDriverSet`, and validation for names, indices, and delta counts.
- [x] 2.3 Implement deterministic ControlDriver evaluation with blend mode, priority, target conflict handling, and cycle detection tests.
- [x] 2.4 Implement CPU `blendshape_apply` system in bind pose space with missing-shape-as-zero behavior.
- [x] 2.5 Implement CPU `skinning_2d` system that consumes morphed vertices and writes `DeformedVertices`.
- [x] 2.6 Integrate native runtime order as `ControlDriver -> BlendShape -> Skinning` and add math fixtures for representative meshes.
- [x] 2.7 Implement native IK and spring bone evaluation enough for authored constraints and conversion fixtures.

## 3. MOC3 To Native Conversion

- [x] 3.1 Add conversion front-end that reuses existing MOC3 parser/bundle loading and emits native project draft data.
- [x] 3.2 Convert RotationDeformer hierarchy and angle semantics into Bone2D structures and driver ranges.
- [x] 3.3 Convert WarpDeformer and KeyForm samples into BlendShape delta sets, including multi-parameter sampling diagnostics.
- [x] 3.4 Convert MOC3 motion and expression JSON into native animation clips and expression presets.
- [x] 3.5 Convert physics and parameter outputs into SpringBone2D and ControlDriver data where representable.
- [x] 3.6 Handle DrawOrder, mask, and clipping through explicit conversion or partial-conversion fallback diagnostics.
- [x] 3.7 Add golden render comparison harness with at least three public fixtures, SSIM threshold checks, and diff artifact output.

## 4. Renderer Integration

- [x] 4.1 Keep the existing SpriteBatch CPU-deformed-vertices path working for native puppet fixtures.
- [x] 4.2 Define render-extract DTOs for GPU native deformation: bind vertices, joint indices, weights, bone matrices, BlendShape deltas, and weights.
- [x] 4.3 Implement optional GPU BlendShape+Skinning path in `engine-puppet-renderer` without introducing runtime-puppet wgpu dependencies.
- [x] 4.4 Add synthetic mesh tests comparing CPU and GPU native deformation within tolerance.
- [x] 4.5 Add fallback selection and diagnostics for low-end or unsupported GPU deformation paths.

## 5. Editor And Viewport Integration

- [x] 5.1 Add native puppet command models for bone, weight, BlendShape, driver, expression, and animation edits with base revision and correlation id.
- [x] 5.2 Implement early neko-puppet local preview/editor paths for native bone and BlendShape editing without requiring ViewportShell.
- [x] 5.3 Implement `PuppetController` adapter for `ISceneController` after unified viewport V-1/V0 and engine viewport routing are available.
- [x] 5.4 Add overlay prediction for native bone drag and vertex/BlendShape editing with ack/rollback behavior.
- [x] 5.5 Add overlay coordinate matrix tests using known bone positions and `ViewportFrameMeta.viewTransform` with <=0.5px tolerance.
- [x] 5.6 Add editor UI for skeleton tree, bone handles, BlendShape sliders, ControlDriver curves, and keyframe timeline adapter.

## 6. Automatic Creation Flow

- [x] 6.1 Add native puppet creation service contracts for PSD, PNG, and Live2D sources with generated draft output and diagnostics.
- [x] 6.2 Implement PSD layer-aware draft generation using layer/group metadata, bounds, draw order, and template fallback.
- [x] 6.3 Implement PNG draft generation using segmentation/landmark/template adapter seams and fixture-backed fallback data.
- [x] 6.4 Implement Live2D native draft creation by invoking the MOC3 conversion path and preserving source metadata.
- [x] 6.5 Generate initial skeleton, skin weights, BlendShape templates, ControlDrivers, and autoRig confidence metadata.
- [x] 6.6 Record user adjustments to generated bones, weights, BlendShapes, and drivers in `autoRig.userAdjusted`.
- [x] 6.7 Add autoRig fixtures for full-body humanoid, upper-body humanoid, chibi, and at least one partial/unsupported case.

## 7. Agent And Asset Integration

- [x] 7.1 Register native puppet Agent tools for create, set expression, set BlendShape, set bone, set ControlDriver, play animation, auto-rig, and generate animation.
- [x] 7.2 Add target requirements, safety metadata, and query-before-mutate guidance to native puppet Agent tools.
- [x] 7.3 Update AssetLibrary/Search metadata projection for native puppet capabilities and implemented BlendShape subsets.
- [x] 7.4 Update representation resolution so native puppet bindings are preferred for native puppet animation/game/video targets.
- [x] 7.5 Add unavailable/legacy-only diagnostics when native puppet tools are invoked against MOC3-only assets.

## 8. Export And Packaging

- [x] 8.1 Implement native `.nkp` v2 export and `.nkentity` v2 export without mutating source PSD/PNG/Live2D assets.
- [x] 8.2 Implement Spine JSON export from native skeleton, mesh, skin weight, and animation data.
- [x] 8.3 Implement spritesheet export fallback for targets that cannot consume native rig data.
- [x] 8.4 Add Lottie-compatible export planning or explicit unsupported diagnostics for native puppet animation.
- [x] 8.5 Update character-pack export to include native puppet packages and optional legacy Live2D fallback references.

## 9. Validation And Documentation

- [x] 9.1 Run focused TypeScript contract tests for puppet types, entity export types, Agent tool metadata, and asset/search projections.
- [x] 9.2 Run focused Rust runtime tests for ControlDriver, BlendShape, skinning, IK/spring, conversion, and renderer synthetic meshes.
- [x] 9.3 Run golden render tests for MOC3 conversion fixtures and review diff output for failures.
- [x] 9.4 Run architecture boundary checks confirming runtime-puppet has no wgpu dependency and Webviews do not import VSCode/Node APIs.
- [x] 9.5 Update Chinese architecture/user documentation and affected English references after implementation behavior lands.
