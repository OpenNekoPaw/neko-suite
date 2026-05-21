## Context

`docs/architecture/adr-2d3d-unified-engine.md` proposes a "shared shell,
separate cores" architecture for 2D puppet and 3D scene runtimes. The updated
analysis in `docs/architecture/adr-2d3d-unified-engine-analysis.md` confirms
that several foundation items have already landed in code:

- `engine-types::transform_propagation::propagate_transform_hierarchy` is the
  shared transform algorithm core used by both scene and puppet runtimes.
- `PuppetService` already owns a private `PuppetComputation` wrapper with
  `creative<R>()`, `data<R>()`, and centralized world locking.
- `GpuExportPipeline` already supports mixed Scene3D + Puppet export through
  injected render ports, `collect_visible_puppet()`,
  `render_puppet_to_gpu_layer()`, and generic `GpuLayer` composition.
- TypeScript domain metadata, Tool domain fields, operation-domain mapping, and
  registry projection are in place.

The true remaining gaps are narrower:

- scene and puppet animation modules still carry near-identical wrapper
  boilerplate around shared `engine-types` animation DTOs;
- engine `AgentCapabilityProvider` tools are not annotated with domain metadata;
- scene and puppet operation tools are not yet registered through the engine
  provider surface.

Five-layer analysis:

- Responsibilities: `engine-types` owns pure animation contracts and adapter
  helpers; runtime crates own Bevy component/system shells and compatibility
  names; engine extension owns capability provider registration; `neko-types`
  owns serializable domain metadata.
- Dependencies: runtime crates may depend on `engine-types`; shared DTOs must
  not depend on Bevy/runtime crates; Agent tool metadata must not import runtime
  worlds or concrete engine services.
- Interfaces: animation wrappers preserve public names and serde fields while
  delegating repeated unit/serde behavior to shared contracts; tool definitions
  carry optional serializable domain metadata.
- Extension: future scene/puppet/sketch tools can register domains through the
  same provider contract without coupling LLM routing to runtime internals.
- Testing: wrapper refactors need duration/serde/name compatibility tests;
  domain registration needs provider/registry projection tests; already-landed
  transform, service, and export paths stay covered by regression tests.

## Goals / Non-Goals

**Goals:**

- Eliminate avoidable animation wrapper drift while preserving existing scene
  and puppet public type names during migration.
- Preserve puppet millisecond and scene second API semantics.
- Preserve puppet `elapsed_ms` and scene `elapsed` serialized field names.
- Annotate engine capability provider tools with normalized domain metadata.
- Register scene and puppet agent tools with domain metadata so the LLM-facing
  tool projection exposes the correct creative domain.
- Keep architecture guardrails for DTO placement, transform propagation, export
  service injection, and domain routing boundaries.

**Audit-confirmed complete:**

- Shared transform propagation algorithm core.
- PuppetService computation boundary.
- Scene3D + Puppet GPU export co-rendering.
- TypeScript base domain metadata and registry projection.

**Non-Goals:**

- Do not merge `Skeleton`, `ParameterBinding`, IK, mesh deformation, GPU
  skinning, or puppet CPU deformation into a unified data type.
- Do not require `engine-ecs-core` for pure DTO or pure algorithm sharing.
- Do not implement full DomainRouter policy, Rust `ActionRequest` domain hints,
  Agent routing decisions, `ArtifactSnapshot`, FeedbackBus, or Layer 4 Control
  integration in this change.
- Do not rewrite `TextureCompositor` or rework the already-landed co-rendering
  path.
- Do not move Agent planning or LLM prompting into runtime crates.

## Decisions

### Decision 1: Keep pure animation contracts in `engine-types`

Blend/crossfade shared structs and `AnimationDurationUnit` already exist in
`engine-types`. This change should add the missing shared wrapper adapter
pattern there rather than creating an ECS crate or leaving duplicate runtime
newtypes to drift.

Rationale: runtime wrappers differ by public names, unit helpers, and serde field
names, not by core data shape. `engine-types` is the correct zero-Bevy home for
that adapter pattern.

Alternatives considered:

- Move blend/crossfade into a new `engine-ecs-core`: rejected because the types
  are pure DTOs and do not need ECS dependencies.
- Leave wrappers as-is: rejected because the duplicated runtime code is
  measurable and drift-prone.

### Decision 2: Treat transform propagation as done except regression coverage

The shared transform logic is already extracted into
`propagate_transform_hierarchy`. Runtime-scene and runtime-puppet should keep
their own Bevy queries, component reads, insertion/update behavior, and tests
around borrow constraints.

Rationale: the remaining duplicated code is runtime shell code. Further
genericizing Bevy query shells would increase complexity without a clear product
benefit.

### Decision 3: Treat co-rendering as done except regression coverage

`GpuExportPipeline` already receives scene and puppet render ports, collects
Puppet elements, adapts puppet output into `GpuLayer`, and reuses
`TextureCompositor`.

Rationale: the original gap is closed. This change should preserve guardrails
and tests instead of reopening the export path.

### Decision 4: Align provider metadata before full DomainRouter

The TypeScript metadata foundation exists, but engine provider tools still need
domain tags and scene/puppet tools need registration.

Rationale: provider metadata is the next smallest useful contract. Full routing
policy and Rust request hints need a separate design because they cross the
Intent/Orchestration/Execution boundary.

### Decision 5: ArtifactSnapshot remains deferred

`ArtifactSnapshot` is a Layer 4 Control dependency. This change should not
define a broad snapshot/diff trait until FeedbackBus and ControlDecision
consumers exist.

## Risks / Trade-offs

- [Risk] Wrapper refactor changes persisted serde shape. -> Mitigation: keep
  explicit tests for scene `elapsed` and puppet `elapsed_ms` fields.
- [Risk] Runtime public names break callers. -> Mitigation: preserve wrapper
  names or compatibility aliases in runtime modules.
- [Risk] Macro-based wrapper generation becomes opaque. -> Mitigation: prefer a
  small adapter helper or focused macro with tests; keep public API explicit in
  runtime modules if readability wins.
- [Risk] Domain labels overreach into routing policy. -> Mitigation: provider
  tools carry serializable metadata only; routing decisions remain follow-up.
- [Risk] Already completed export/service work regresses. -> Mitigation: keep
  architecture tests and focused mixed export tests.

## Migration Plan

1. Add or adjust shared animation wrapper adapter support in `engine-types`.
2. Replace runtime-scene and runtime-puppet wrapper boilerplate with the shared
   adapter while keeping public names and serde compatibility.
3. Add/retain scene and puppet animation tests for duration equivalence, serde
   round-trip compatibility, and shared DTO construction.
4. Annotate existing engine provider tools with suitable domain metadata.
5. Register scene and puppet tools through the engine provider surface with
   `scene` and `puppet` domains.
6. Add provider/registry tests proving domain metadata projects into
   LLM-facing tool definitions.
7. Keep focused regression tests for transform propagation, PuppetService
   computation boundary, and mixed Scene3D + Puppet export.

Rollback strategy:

- Runtime compatibility aliases keep existing callers compiling.
- Domain metadata is additive and can be ignored by providers that do not use
  routing yet.
- Co-rendering and transform propagation code paths are not reworked by this
  scope, limiting rollback to wrapper/provider changes.

## Open Questions

- Should the animation wrapper adapter use a small macro or explicit generic
  helper types plus handwritten public wrapper names?
- Which initial scene/puppet engine tools should be exposed first: read-only
  inspection/snapshot tools, mutation tools, or both?
- Should Rust `ActionRequest` domain hints be a direct field or an execution-plan
  concern owned by a later DomainRouter change?
