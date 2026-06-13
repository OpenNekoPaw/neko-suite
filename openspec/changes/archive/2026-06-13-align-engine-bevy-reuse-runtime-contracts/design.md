## Context

The current engine ADRs converge on a layered runtime architecture:

- `bevy_ecs` is the ECS foundation, but Neko Engine owns service lifecycle, scheduling, rendering, viewport streams, export, and command acknowledgements.
- `runtime-puppet` owns native 2D puppet evaluation and must remain GPU-free.
- `runtime-scene` owns 3D scene runtime behavior.
- `engine-gpu` owns reusable GPU infrastructure and domain-neutral GPU primitives.
- Renderer companion crates adapt runtime extract data to GPU layouts.
- `runtime-stage` is planned for interactive composition, but it is not implemented by this change.

The Bevy gap analysis identified useful direct reuse (`bevy_tasks`, possibly `bevy_color`, cautious `bevy_math`) and useful design references (AnimationGraph, morph shaders, picking/gizmos, shadows, post-processing). The 2D ADR identified `AnimationClip2D` as a future graph leaf and highlighted CPU BlendShape/skinning as an early `bevy_tasks` beneficiary. The runtime layering ADR keeps Live2D high-fidelity playback in an optional adapter and treats the current MOC3 parser in `runtime-puppet` as a transitional exception.

This design converts those ADR decisions into contracts that can be implemented before broader Phase 2 animation and GPU deformation work.

## Goals / Non-Goals

**Goals:**

- Define a Bevy reuse governance contract that allows narrow infrastructure reuse without adopting full Bevy runtime architecture.
- Assign Phase 1C ownership:
  - AnimationGraph leaf sampler DTOs: `engine-types` or equivalent zero-Bevy contract crate.
  - Runtime sampler adapters: `runtime-scene` and `runtime-puppet`.
  - Shared Morph/BlendShape GPU primitive: `engine-gpu`.
  - Renderer layout adapters: scene and puppet renderer companion crates or current renderer modules.
- Add `bevy_tasks`-backed parallel CPU puppet deformation with serial fallback, parity tests, and benchmark thresholds.
- Prevent duplicate 2D/3D morph shader implementations.
- Preserve current public behavior, durable formats, and runtime boundaries.

**Non-Goals:**

- Do not introduce Bevy `App`, Bevy-owned `Schedule`, Bevy Renderer, Bevy Window, Bevy AssetServer, or Bevy plugin runtime.
- Do not implement full `runtime-stage` or a playable scene editor workflow.
- Do not integrate the Live2D Cubism SDK in this change.
- Do not merge scene and puppet ECS systems.
- Do not change `.nkp`, scene project formats, HTTP routes, WebSocket protocols, N-API surfaces, or Webview UI.
- Do not adopt `bevy_math` until `glam` versions are aligned across runtime and renderer crates.

## Five-Layer Analysis

### Responsibility

- `engine-types` owns pure cross-runtime contracts: animation leaf sample DTOs, track identity, duration/sample metadata, and compatibility helpers.
- `runtime-puppet` owns 2D clip sampling, ControlDriver evaluation, CPU BlendShape/skinning evaluation, serial fallback, and native puppet ECS components.
- `runtime-scene` owns 3D clip sampling and scene-specific animation interpretation.
- `engine-gpu` owns domain-neutral GPU compute primitives for weighted vertex delta accumulation and GPU-local errors.
- Scene and puppet renderers own layout adaptation from extract data into `engine-gpu` primitive inputs.
- Kernel or service layers own orchestration, command sequencing, revision checks, diagnostics, and fallback policy.

### Dependency

- Shared DTOs must remain independent of Bevy App/Renderer, renderer crates, runtime internals, host crates, VSCode, and Webview.
- `runtime-puppet` may depend on `bevy_ecs` and `bevy_tasks`, but not `wgpu`, `engine-gpu`, or renderer crates for CPU evaluation.
- `engine-gpu` must not import scene, puppet, kernel service, host, Live2D/MOC3, or ECS component internals.
- Renderer companion crates may depend on `engine-gpu` and runtime extract contracts, but runtime crates do not depend back on renderer implementation.
- `bevy_math` is blocked until `glam` alignment removes cross-crate dual math boundaries.

### Interface

- Animation leaf sampler interfaces expose sampled values, track identities, sample time, duration, and metadata needed by a future graph layer.
- Domain adapters convert `AnimationClip2D` and 3D animation clips into leaf samples without changing clip storage.
- Shared morph compute interfaces expose base vertex buffers, delta ranges, weights, output buffers, and numeric/feature capability information.
- CPU deformation options expose serial/parallel selection, tolerance fixtures, diagnostics, and benchmark evidence without changing `DeformedVertices` renderer input.

### Extension

- Future AnimationGraph work can add state machines, transitions, blend trees, additive blend, and events above leaf samplers without rewriting clip formats.
- Spine, Live2D adapter playback, or other domain runtimes can later implement the same leaf sampler or deformation extract contracts if they need graph integration.
- Additional Bevy crates require an allowlist update and targeted proposal rather than ad hoc dependency drift.
- GPU deformation improvements can expand the `engine-gpu` primitive while scene and puppet renderers keep domain-specific layout adapters.

### Testing

- Architecture checks guard excluded Bevy crates and dependency direction.
- Contract tests validate animation leaf sample round-trips for puppet and scene fixtures.
- CPU tests compare serial and parallel puppet deformation with ordinary and extreme fixtures.
- GPU tests compare shared Morph/BlendShape primitive output with CPU references for 2D and 3D fixtures.
- Benchmarks determine when parallel CPU deformation should be enabled by default.

## Decisions

### Decision 1: Govern Bevy by allowlist instead of importing feature crates freely

Only narrowly scoped infrastructure crates are allowed directly. `bevy_ecs` stays foundational, `bevy_tasks` is allowed for CPU parallel work, `bevy_color` can be evaluated, and `bevy_math` waits for `glam` alignment.

**Rationale:** Neko Engine already owns rendering, viewport, export, service lifecycle, host integration, and project formats. Importing broad Bevy runtime crates would create competing ownership.

**Alternative considered:** Adopt full Bevy and bridge Neko services into it. Rejected because it would duplicate or replace established engine-kernel, renderer, GPU, streaming, and command-ack boundaries.

### Decision 2: Put AnimationGraph leaf DTOs in `engine-types`

`engine-types` is the right home for pure DTOs and compatibility helpers. Runtime crates implement domain adapters; the future graph layer owns state and transition behavior.

**Rationale:** This keeps clip assets stable and lets 2D and 3D runtimes meet at a small shared boundary.

**Alternative considered:** Put the graph leaf contract in `runtime-scene` because Bevy animation is mostly 3D-oriented. Rejected because it would make puppet depend on scene concepts or duplicate an equivalent DTO.

### Decision 3: Put shared Morph/BlendShape compute in `engine-gpu`

The weighted-delta operation is mathematically shared by 2D BlendShapes and 3D morph targets. `engine-gpu` owns the primitive; renderers adapt domain layouts.

**Rationale:** This prevents duplicate shader implementations while preserving runtime-puppet's zero-GPU invariant.

**Alternative considered:** Let scene-renderer and puppet-renderer each implement their own shader. Rejected because both would implement the same accumulation primitive and drift in precision, features, and validation.

### Decision 4: Parallelize puppet CPU deformation with serial fallback

`bevy_tasks` can parallelize mesh/vertex batches for BlendShape and skinning evaluation, but the serial path remains the reference and fallback.

**Rationale:** Parallel floating-point accumulation can reorder operations. A deterministic serial reference gives stable diagnostics and preserves small-workload behavior.

**Alternative considered:** Enable parallel deformation unconditionally. Rejected because small meshes can lose performance to scheduling overhead and numeric drift needs fixture-based validation.

### Decision 5: Keep Live2D SDK out of this proposal

Live2D high-fidelity playback belongs in an optional `Live2dRuntimeAdapter` with feature/license isolation. This proposal only prepares shared runtime contracts that such an adapter could later consume.

**Rationale:** The current question is Bevy reuse and Phase 1C runtime contracts. Cubism SDK adoption has separate licensing, packaging, platform, and fidelity decisions.

**Alternative considered:** Fold Live2D playback into `runtime-puppet`. Rejected because `runtime-puppet` is the native 2D bone/BlendShape runtime and should not inherit third-party SDK lifecycle or license constraints.

## Risks / Trade-offs

- **Bevy dependency drift** -> Add architecture checks for disallowed Bevy crates and keep the allowlist explicit.
- **`glam` mismatch blocks useful math helpers** -> Defer `bevy_math` and track it as a coordinated math-boundary migration.
- **Parallel CPU output differs from serial output** -> Use extreme fixtures, diagnostics, and optional compensated or wider accumulation if tolerance fails.
- **Shared GPU primitive becomes too domain-specific** -> Keep the primitive domain-neutral and put layout adaptation in renderer crates.
- **Animation leaf DTO underfits future graph needs** -> Keep the DTO focused on sampled outputs and metadata; graph topology can evolve separately.
- **Phase 1C owner ambiguity returns** -> Encode owner mapping in tasks and validation criteria.

## Migration Plan

1. Add Bevy governance architecture checks and document the current allowlist.
2. Add animation leaf sampler DTOs and fixture tests in the shared contract layer.
3. Implement runtime-scene and runtime-puppet sampler adapters behind current public names or compatibility wrappers.
4. Add the `engine-gpu` shared Morph/BlendShape compute primitive and CPU reference parity fixtures.
5. Adapt scene and puppet renderer GPU deformation paths to the shared primitive where GPU deformation is present.
6. Add `bevy_tasks` dependency usage in runtime-puppet CPU deformation, keeping serial fallback as the reference.
7. Add benchmarks and default-selection policy for parallel puppet deformation.
8. Run OpenSpec validation, Rust format/check/test commands, architecture checks, targeted parity tests, and benchmark evidence.

Rollback is straightforward because no public protocol or file format changes are introduced: keep serial CPU deformation active, remove or disable renderer adapters to the shared primitive, and leave the new shared contracts unused until corrected.

## Open Questions

- Should `bevy_color` be adopted in the same implementation pass, or only recorded in the governance allowlist for later evaluation?
- Should the initial shared morph primitive support normals/tangents immediately, or start with positions and add renderer-specific attribute support in follow-up work?
- What exact default threshold should enable parallel puppet deformation for production workloads after benchmark data is collected?
