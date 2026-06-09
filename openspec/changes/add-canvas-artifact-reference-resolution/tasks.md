## 1. Shared Contracts

- [x] 1.1 Add `ReferenceSourceKind`, `ReferenceRole`, `ReferenceModality`, `ReferenceDescriptor`, `ReferenceDescriptorPayload`, and lineage metadata types in the shared type layer.
- [x] 1.2 Add `ReferenceDiagnosticCode`, `ReferenceDiagnosticSeverity`, `ReferenceDiagnostic`, and `createReferenceDiagnostic()` with `targetCapability` / `purpose` / `phase` severity rules.
- [x] 1.3 Add `ReferenceContributorManifest`, `ReferenceContributor`, `ReferenceCollectionInput`, and `ReferenceCollectionContext` contracts as a typed capability facet.
- [x] 1.4 Add host resolver request/result contracts for preview projection, provider input materialization, batch resolution, dry-run/estimate mode, cancellation, partial results, and per-reference diagnostics.
- [x] 1.5 Add shared validators for stable reference descriptors, unsafe runtime handle rejection, source kind alignment, role/modality validation, and serializable payload limits.
- [x] 1.6 Export the new reference-resolution contracts from the relevant shared package barrel files.
- [x] 1.7 Add shared unit tests for descriptor validation, unsafe handle diagnostics, severity factory behavior, and `ReferenceSourceKind` reuse by manifests and collection inputs.

## 2. Adapter And Contributor Projection

- [x] 2.1 Implement adapter helpers that project Canvas fields `referenceImageResourceRef`, `referenceResourceRef`, `referenceImagePath`, `runtimeReferenceImagePath`, and `referenceRefs` into reference descriptors.
- [x] 2.2 Implement adapter helpers that project `ShotImagePrepPlan` fields `sourceMediaRefs`, `maskRefs`, `referenceBundle`, `generatedMediaRefs`, and `outputMediaRefs` into reference descriptors.
- [x] 2.3 Implement `GenericTable` / `CompositeArtifact` projection helpers for `media-preview`, `resource`, and profile-constrained JSON cells.
- [x] 2.4 Add contributor manifests and pure collector implementations for Shot, Gallery, Media, Document, Storyboard, entity, and generated-asset node sources.
- [x] 2.5 Add contributor manifests and pure collector implementations for `ShotImagePrepPlan`, `GenericTable`, `CompositeArtifact`, and `StoryboardTable` sources.
- [x] 2.6 Add tests proving contributors only perform pure projection and do not materialize Webview URIs, read files, or construct provider inputs.
- [x] 2.7 Add tests covering unregistered source fallback: display is allowed, provider execution actions are not exposed.

## 3. Host Resolver And Materialization

- [x] 3.1 Add a host-side reference resolver service interface that accepts descriptor collections and returns preview or provider materialization results.
- [x] 3.2 Implement preview materialization for resource refs, document/archive refs, generated assets, and current Canvas reference image projections without persisting runtime values.
- [x] 3.3 Implement provider input materialization for image URI/base64, mask URI, IP-Adapter refs, and image-to-video keyframe inputs over the existing resource/document/generated-asset paths.
- [x] 3.4 Implement `resolveBatch()` with stable-key deduplication, purpose-specific cache keys, concurrency limits, cancellation, timeout handling, and partial result fan-out.
- [x] 3.5 Implement dry-run/estimate mode that reports availability and diagnostics without reading or encoding every large resource.
- [x] 3.6 Add tests for preview/provider purpose isolation so Webview preview URIs are never reused as provider inputs.
- [x] 3.7 Add tests for batch dedupe, partial failure preservation, cancellation, cache-key separation, and dry-run behavior.

## 4. Agent And Provider Integration

- [x] 4.1 Route `ShotImagePrepPlan` execution through reference descriptor collection before building `GenerateImage` or `TransformImage` tool requests.
- [x] 4.2 Inject resolved source image, mask, character, scene, style, previous-shot, and source-panel inputs into `TransformImage` and `GenerateImage` requests at execution time.
- [x] 4.3 Route prepared keyframe and shot output refs through provider input materialization before `GenerateVideo` handoff.
- [x] 4.4 Add entity representation resolution preflight for character and voice references, producing `entity-representation-missing` diagnostics when no usable visual or voice input exists.
- [x] 4.5 Ensure Agent artifacts and tool args do not persist URL/base64/runtime handles returned by preview or provider materialization.
- [x] 4.6 Add Agent runtime tests for successful provider input injection, missing representation blocking, unsafe runtime handle rejection, and output lineage backfill.

## 5. Canvas, Cut, And Review Surfaces

- [x] 5.1 Add Canvas reference summary projection for Shot nodes grouped by source, mask, character, scene, previous-shot, generated output, and keyframe roles.
- [x] 5.2 Add Canvas reference summary projection for Gallery and generated-asset nodes, including subject/style/output roles and diagnostics.
- [x] 5.3 Update Canvas card/property panel rendering to display lightweight reference summaries and per-reference diagnostics without dumping raw descriptor JSON.
- [x] 5.4 Bridge existing Canvas generation `referenceRefs` through the contributor/resolver path while preserving current user-facing generation commands.
- [x] 5.5 Ensure Canvas persists only stable descriptor data and review state, not `runtimeReferenceImagePath`, Webview URI, provider URL, or base64 payload.
- [x] 5.6 Update Cut handoff to consume prepared keyframe/video reference descriptors and request host resolution instead of reparsing raw comic/source media.
- [x] 5.7 Add Canvas/Cut tests for reference summary rendering, persisted data safety, generation bridge behavior, and keyframe handoff readiness.

## 6. Documentation And Validation

- [x] 6.1 Update related architecture docs or README references to point to `adr-canvas-artifact-reference-resolution.md` for stable reference resolution behavior.
- [x] 6.2 Add implementation notes for contributors explaining that Webview collectors must stay pure and host resolver owns IO/materialization.
- [x] 6.3 Run targeted shared type and runtime tests covering the new reference-resolution contracts.
- [x] 6.4 Run targeted Canvas/Agent tests for reference summary, generation bridge, provider input injection, and persistence safety.
- [x] 6.5 Run repository quality checks appropriate to the touched packages and document any remaining provider IO limitations.
