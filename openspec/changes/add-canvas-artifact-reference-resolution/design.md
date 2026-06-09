## Context

Canvas, Agent artifacts, entity memory, and media providers currently express references with several local conventions: Canvas node fields such as `referenceImageResourceRef`, Canvas generation `referenceRefs`, Agent `ShotImagePrepPlan.referenceBundle`, `sourceMediaRefs`, `maskRefs`, and provider tool arguments such as `referenceImageUri` or `referenceImageBase64`.

Those conventions solve local problems but do not form one cross-package protocol. A stable reference stored in a Canvas node or artifact is not the same thing as a Webview preview URI or a provider-ready input. The implementation must preserve that boundary because Webviews cannot access Node.js or VSCode APIs, provider adapters must not depend on Canvas internals, and persisted project data must not store blob/data/file/Webview/runtime handles.

The architecture source for this change is `docs/architecture/adr-canvas-artifact-reference-resolution.md`.

## Goals / Non-Goals

**Goals:**

- Define a shared, testable `ReferenceDescriptor` model for stable Canvas / Artifact / Entity / Media references.
- Register pure reference collectors through a capability registry typed facet instead of a standalone registry.
- Normalize current internal reference fields into `ReferenceDescriptor` through adapters while avoiding long-term legacy migration complexity before product launch.
- Provide severity-aware diagnostics where severity is computed from code, target capability, purpose, and phase.
- Provide host-side resolver contracts for preview materialization and provider input materialization.
- Support batch resolution with dedupe, cache keys, dry-run/estimate mode, cancellation, partial results, and per-reference diagnostics.
- Integrate resolved reference bundles with Canvas previews, Agent shot image prep execution, and media provider input assembly.

**Non-Goals:**

- Do not replace `CompositeArtifact` or `GenericTable` as artifact/table payload contracts.
- Do not create confirmed entities or character facts from reference resolution.
- Do not introduce a new persistence backend; JSON sidecars/project cache remain acceptable until structured persistence work lands.
- Do not require destructive migration of development-time `.nkc` fixtures or artifacts.
- Do not make Webview code read files, encode base64, or call provider adapters directly.

## Decisions

### Decision 1: `ReferenceDescriptor` Is the Execution Reference SSOT

`CompositeArtifact` and `GenericTable` remain the source of truth for display payloads. `ReferenceDescriptor` becomes the source of truth for cross-package reference resolution, provider execution, and output lineage.

Alternative considered: make `GenericTable` media/resource cell payloads the universal reference protocol. This would overfit execution semantics to table rendering and would not cover Canvas nodes, entity memory, or provider preflight cleanly.

### Decision 2: Contributors Are Capability Facets

Each package registers `ReferenceContributorManifest` / `ReferenceContributor` through the existing capability contribution model. A contributor is a pure projector from a source object into reference descriptors.

Alternative considered: build a dedicated reference registry. This would duplicate the capability registry and create another injection/discovery mechanism. A typed facet keeps Agent discovery, package contribution, and permission boundaries aligned with existing architecture.

### Decision 3: Current Fields Are Normalized, Not Long-Term Legacy Supported

The project has not launched, so existing internal fields are treated as transitional inputs. Adapters will read fields such as `referenceImageResourceRef`, `referenceResourceRef`, `referenceImagePath`, `runtimeReferenceImagePath`, Canvas `referenceRefs`, `sourceMediaRefs`, `maskRefs`, and `generatedMediaRefs`, then project them into descriptors. New writes should converge on the standard descriptor shape once the capability is implemented.

Alternative considered: define a full legacy compatibility and migration window. That would add needless versioning work before the file format is stable.

### Decision 4: Host Resolver Splits Preview and Provider Materialization

The resolver exposes separate purposes for preview projection and provider input materialization. A Webview preview URI must never be reused as a provider input, and provider-ready URL/base64/IP-Adapter/keyframe inputs must not be persisted.

Alternative considered: return a single resolved URL for every reference. This would mix display, execution, permissions, and provider format constraints into one unsafe value.

### Decision 5: Diagnostics Are Severity-Aware at Creation

Reference diagnostics include severity and are created by a factory that receives `targetCapability`, `purpose`, and `phase`. For example, `entity-representation-missing` is a warning for read-only Canvas display but an error before `GenerateImage` execution.

Alternative considered: let each consumer interpret diagnostic code severity. That would drift across Canvas, Agent, Cut, and provider code.

### Decision 6: Batch Resolution Is Required

The resolver must support batch requests with dedupe, cache keys, concurrency limits, cancellation, dry-run/estimate mode, partial results, and per-reference diagnostics. Long storyboards and comic-to-animation workflows can contain hundreds of references; one-by-one IO would be slow and hard to recover.

Alternative considered: only expose single-reference resolution initially. That would force callers to invent their own dedupe/cache/error fan-out behavior.

### Decision 7: Provider Injection Consumes Resolved Bundles

`GenerateImage`, `TransformImage`, `GenerateVideo`, TTS, and future OCR/ASR/Perception providers receive resolved input bundles assembled by the host/provider adapter layer. Agent and Canvas submit stable refs and intent; they do not construct provider-specific base64 or URL fields.

Alternative considered: let Agent tools accept both stable refs and provider fields. That keeps the current ambiguity and makes unsafe runtime handle persistence likely.

## Risks / Trade-offs

- Reference descriptor becomes too broad -> Keep roles, modalities, and source kinds closed where practical; use domain metadata only for non-execution hints.
- Contributor registration drifts from capability registry -> Define it as a typed facet and test contribution discovery.
- Host resolver becomes a bottleneck -> Add batch resolution, dedupe, cache keys, dry-run mode, and partial result handling in the first implementation.
- Existing Canvas fields remain in use too long -> Treat them as internal transitional inputs and stop adding new scattered reference fields.
- Provider-specific formats leak upward -> Keep provider input materialization behind host/provider adapters and test that persisted descriptors reject runtime handles.
- Entity references are mistaken for visual inputs -> Require representation resolution and emit `entity-representation-missing` diagnostics when no usable visual/voice asset exists.

## Migration Plan

1. Add shared reference descriptor, diagnostics, contributor manifest, validators, and adapter helpers.
2. Register contributors for the highest-value current sources: Shot nodes, Gallery nodes, Media/Document/Storyboard nodes, generated assets, `ShotImagePrepPlan`, and `GenericTable` media/resource cells.
3. Introduce host resolver contracts and implement preview/provider materialization over existing resource/document/generated-asset paths.
4. Route existing Canvas `referenceRefs` and shot image prep references through the resolver before provider execution.
5. Update Canvas panels/cards to display reference summaries and diagnostics from descriptors.
6. Stop adding new scattered reference fields; converge new writes on descriptors before public format stabilization.

Rollback is low risk because initial implementation can be additive: if resolver output is unavailable, existing preview and generation paths can continue to show current fields while emitting diagnostics and skipping provider execution.

## Open Questions

- Which package should own the first host resolver service implementation once the shared contract lands: `neko-canvas` Extension Host, `neko-agent` platform, or a shared host service?
- Which provider input kinds should be included in P1 beyond image URI/base64, mask URI, and IP-Adapter refs?
- Should descriptor cache keys include content hash immediately, or start with source revision/path metadata and let structured persistence add hashes later?
