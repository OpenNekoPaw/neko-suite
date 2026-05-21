## 1. Scope Re-Audit

- [x] 1.1 Audit current scene and puppet animation blend wrappers and quantify remaining duplicated wrapper boilerplate.
- [x] 1.2 Confirm `engine-types` already provides shared `AnimationBlendLayer`, `AnimationBlendLayerInfo`, `AnimationBlendState`, `AnimationCrossfadeRequest`, `AnimationDuration`, and `AnimationDurationUnit` contracts.
- [x] 1.3 Confirm transform propagation already uses the shared `propagate_transform_hierarchy` algorithm core from `engine-types`.
- [x] 1.4 Confirm PuppetService already uses `PuppetComputation` with `creative<R>()` / `data<R>()` / `lock_world()` closure APIs.
- [x] 1.5 Confirm Scene3D + Puppet GPU export co-rendering is already wired through injected render ports, Puppet collection, Puppet-to-`GpuLayer` adaptation, and `TextureCompositor`.
- [x] 1.6 Confirm TypeScript domain metadata, Tool domain fields, operation-domain mapping, and registry projection are already present.

## 2. Animation Wrapper Deduplication

- [x] 2.1 Add a shared wrapper adapter, helper, or focused macro in `engine-types` that captures the repeated blend-layer, blend-info, and crossfade time-unit behavior without adding Bevy/runtime dependencies.
- [x] 2.2 Replace runtime-scene animation wrapper boilerplate with the shared adapter while preserving `SceneBlendLayer`, `SceneBlendLayerInfo`, `SceneAnimationBlendState`, `SceneCrossfadeRequest`, and `SceneAnimationPlaybackState`.
- [x] 2.3 Replace runtime-puppet animation wrapper boilerplate with the shared adapter while preserving `BlendLayer`, `BlendLayerInfo`, `AnimationBlendState`, and `CrossfadeRequest`.
- [x] 2.4 Preserve scene seconds APIs and `elapsed` serde field compatibility.
- [x] 2.5 Preserve puppet milliseconds APIs and `elapsed_ms` serde field compatibility.
- [x] 2.6 Add or update tests covering scene/puppet duration equivalence, serde round-trip compatibility, public compatibility names, and shared DTO construction.
- [x] 2.7 Add or update an architecture guard that pure animation wrapper adapter support in `engine-types` does not depend on Bevy, runtime-scene, runtime-puppet, or a future ECS-specific crate.

## 3. Domain Metadata And Engine Tool Registration

- [x] 3.1 Annotate existing engine `AgentCapabilityProvider` tools with normalized `CreativeDomainMetadata` values where their domain is known.
- [x] 3.2 Register initial scene agent tools through the engine provider surface with `domain.id = "scene"` and a stable scene service-port identity.
- [x] 3.3 Register initial puppet agent tools through the engine provider surface with `domain.id = "puppet"` and a stable puppet service-port identity.
- [x] 3.4 Ensure registered scene/puppet tools use serializable metadata only and do not expose runtime-scene, runtime-puppet, Bevy, ECS world handles, or concrete service objects.
- [x] 3.5 Add provider or registry tests proving engine tool domains project into LLM-facing `ToolDefinition.domain` without entering provider parameter schemas.
- [x] 3.6 Document the remaining follow-up boundary for full DomainRouter policy, Rust `ActionRequest` domain hints, and Agent-side routing decisions.

## 4. Regression Guardrails For Already-Landed Foundation

- [x] 4.1 Keep focused runtime-scene and runtime-puppet transform propagation golden tests passing against `propagate_transform_hierarchy`.
- [x] 4.2 Keep PuppetService computation-boundary tests covering lock error mapping, read operations, mutation operations, and command/revision compatibility.
- [x] 4.3 Keep GPU export orchestration tests covering mixed Scene3D + Puppet layer collection, z-index ordering, opacity/transform propagation, and failure handling.
- [x] 4.4 Keep architecture checks preventing `GpuExportPipeline` from constructing SceneService or PuppetService directly.
- [x] 4.5 Keep architecture checks preventing DomainRouter/domain routing contracts from importing runtime-scene, runtime-puppet, Bevy, or ECS world types.

## 5. Documentation

- [x] 5.1 Update ADR analysis to reflect that transform propagation, PuppetService computation boundary, and Scene3D + Puppet co-rendering are audit-confirmed complete.
- [x] 5.2 Update OpenSpec proposal/design to focus implementation scope on animation wrapper deduplication and engine tool domain registration.
- [x] 5.3 Update domain taxonomy notes after scene/puppet tool registration if service-port identities or domain labels change.
- [x] 5.4 Record any deferred `ArtifactSnapshot`, full DomainRouter, Rust `ActionRequest` domain hint, or `engine-ecs-core` decisions as follow-up OpenSpec changes rather than hidden TODOs.

## 6. Validation

- [x] 6.1 Run focused Rust tests for `engine-types`, `runtime-scene`, and `runtime-puppet` animation behavior.
- [x] 6.2 Run focused Rust tests for `runtime-scene` and `runtime-puppet` transform propagation behavior to verify the already-landed shared core remains intact.
- [x] 6.3 Run focused Rust tests for `engine-kernel` PuppetService and GPU export orchestration behavior to verify already-landed boundaries remain intact.
- [x] 6.4 Run focused TypeScript tests for engine provider tool registration and shared Tool/domain metadata projection.
- [x] 6.5 Run architecture tests covering shared DTO boundaries, export service injection, and domain routing dependency rules.
- [x] 6.6 Run broader `pnpm check` / `pnpm test` or `pnpm build` only if touched surfaces expand beyond the focused engine/runtime/tool contracts. Not required: touched surfaces stayed within the focused engine/runtime/tool contracts.
