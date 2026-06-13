## Bevy Reuse Facts

- `bevy_ecs = 0.15` remains the ECS foundation for runtime World,
  Component, Entity, Query, Resource, and change-detection data access.
- `bevy_tasks = 0.15` is already present in the dependency graph through
  `bevy_ecs`; runtime-puppet now declares it directly where CPU deformation
  uses parallel slice evaluation.
- `glam = 0.29` remains the current public math boundary for runtime-scene,
  runtime-puppet, engine-types, and renderer-facing contracts.
- `bevy_math` stays blocked behind the TODO(P1) glam-alignment gate in
  `packages/neko-engine/BEVY_REUSE_POLICY.md`.

## Shared Morph GPU Parity

`engine-gpu` owns the domain-neutral weighted-delta primitive. The shared
primitive now includes:

- CPU reference accumulation for Position2 and Position3 fixtures.
- GPU Position2 parity against CPU reference for ordinary 2D BlendShape data.
- GPU Position3 parity against CPU reference for ordinary 3D morph target data.
- An extreme CPU fixture with more than 20 active shapes, large deltas, and
  unusual weight distribution.

Scene renderer still reports an explicit unsupported/fallback diagnostic because
the current scene morph GPU layout is not yet represented at the renderer
extract boundary. Puppet renderer adapts its native GPU BlendShape path through
the shared Position2 primitive before/after skinning.

## Runtime Puppet CPU Deformation Policy

The implementation adds explicit native deformation benchmark fixture sizes:

- 1k vertices
- 10k vertices
- 50k vertices

The current production default is conservative:

- Auto mode uses the serial path for all workload sizes by default.
- The `bevy_tasks` parallel path remains available through explicit
  `NativeCpuDeformationConfig::parallel()` or a finite Auto threshold.
- Serial fallback remains forceable through `NativeCpuDeformationConfig::serial()`.

Local timing evidence from
`cargo test -p neko-runtime-puppet bench_native_cpu_deformation_serial_vs_parallel --lib -- --ignored --nocapture`:

| Vertices | Shapes | Iterations | Serial ms | Parallel ms | Speedup |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 24 | 3 | 0.122 | 0.147 | 0.829 |
| 10,000 | 24 | 3 | 1.302 | 3.534 | 0.368 |
| 50,000 | 24 | 3 | 8.489 | 11.898 | 0.713 |

Parallel deformation reuses a module-level `TaskPool` so these numbers no longer
include per-pass thread-pool construction. It is still slower for this fixture on
this machine, so the default does not enable it automatically yet. Target
hardware or larger production fixtures can opt in after recording better
evidence.

## Numeric Stability

Serial and parallel CPU deformation preserve shape accumulation order per vertex.
The parallel path only splits vertices into chunks, so f32 reorder risk is limited
to task scheduling order of independent vertices rather than per-vertex shape
summation. The many-shapes with large-delta fixture covers more than 20 active
BlendShapes and records mesh id, vertex id, active shape count, max error, and
stage when parity fails.

No Kahan or f64 accumulator has been introduced because the current design keeps
per-vertex accumulation order identical between serial and parallel paths. If
future parallelization splits the active shape loop, compensated accumulation
must be re-evaluated.

## Validation

Passed:

- `cargo fmt -p neko-engine-types -p neko-runtime-puppet -p neko-runtime-scene -p neko-engine-gpu -p neko-engine-puppet-renderer -p neko-engine-scene-renderer -p neko-engine-kernel`
- `cargo fmt -p neko-runtime-puppet`
- `cargo fmt -p neko-engine-types -p neko-runtime-puppet -p neko-runtime-scene -p neko-engine-gpu -p neko-engine-puppet-renderer -p neko-engine-scene-renderer -p neko-engine-kernel -- --check`
- `cargo test -p neko-engine-types animation --lib`
- `cargo test -p neko-runtime-puppet native::tests --lib`
- `cargo test -p neko-runtime-puppet bench_native_cpu_deformation_serial_vs_parallel --lib -- --ignored --nocapture`
- `cargo test -p neko-runtime-scene scene_animation_clip_samples_as_graph_leaf --lib`
- `cargo test -p neko-engine-gpu morph_compute --lib`
- `cargo test -p neko-engine-gpu --lib`
- `cargo test -p neko-engine-puppet-renderer native_extract --lib`
- `cargo test -p neko-engine-scene-renderer scene_morph_adapter --lib`
- `cargo test -p neko-engine-kernel architecture_tests --lib`
- `openspec validate align-engine-bevy-reuse-runtime-contracts --strict`

Attempted full engine test:

- `cd packages/neko-engine && cargo test`

The full test run compiled and passed earlier crates including engine-audio,
engine-codec, engine-gpu, and most engine-kernel tests, but failed in existing
`live_compositor` fixture deserialization tests:

- `live_layer_planning_filters_hidden_layers_and_clamps_opacity`
- `live_layers_plan_into_generic_compositor_primitives`
- `live_scene_adapter_accepts_authorized_camera_puppet_and_tracking_overlay`
- `live_scene_adapter_reports_unauthorized_camera_without_device_url_fallback`
- `live_scene_adapter_reports_unsupported_puppet_model_and_scene_sources`

Failure reason: fixtures still expect the old `preview-non-authoritative` reason
and/or omit the newer `fallbackPolicy` field. This is outside the Bevy reuse,
animation leaf, morph compute, and runtime-puppet CPU deformation scope of this
change. Targeted passing evidence above covers the affected crates and
architecture rules for this change.

Warnings observed during validation are existing warnings:

- Deprecated `RawWorldAccess` migration warnings in runtime-scene/runtime-puppet.
- Existing unused/dead-code warnings in engine-kernel/host-api/host-http.

## Quality Review

Risk level: L3, because this change affects Rust engine contracts, GPU compute,
renderer adapters, and runtime-puppet CPU deformation behavior.

Architecture review:

- Responsibility: Bevy policy is documented at engine root; shared animation
  DTOs live in engine-types; domain samplers stay in runtime-scene/runtime-puppet;
  shared Morph/BlendShape compute lives in engine-gpu; renderer layout adaptation
  remains renderer-owned.
- Dependency: runtime-puppet adds only `bevy_tasks` for CPU work and remains
  GPU-free; engine-gpu remains domain-neutral; shared DTOs stay free of runtime,
  renderer, host, VSCode, Webview, and Bevy runtime dependencies.
- Interface: Animation leaf samples expose stateless sampled values and metadata;
  morph compute exposes base vertices, delta sets, weights, tolerance metadata,
  and GPU-local errors without importing scene or puppet internals.
- Extension: Future AnimationGraph, scene morph layout adapters, or Live2D/Spine
  adapters can consume these contracts without merging scene and puppet runtimes.
- Testing: Targeted unit, GPU parity, architecture, OpenSpec, and benchmark
  evidence cover the change surface; full workspace cargo test is blocked by the
  documented live_compositor fixture mismatch.

Findings:

- Fixed during review: runtime-puppet parallel CPU deformation initially created
  a fresh `TaskPool` per BlendShape/skinning call. It now reuses a module-level
  `LazyLock<TaskPool>`, and `parallel_cpu_deformation_reuses_task_pool` guards
  against regression.
- Fixed during review: GPU parity initially covered only Position2; Position3 GPU
  parity has been added in `engine-gpu` and validated by
  `gpu_position3_matches_cpu_reference_for_fixture`.

Residual risk:

- Bevy dependency policy is enforced by source/manifest guardrails, but future
  Bevy crate adoption still needs proposal review.
- Numeric tolerance remains f32-based and currently safe because parallel CPU
  work preserves per-vertex shape accumulation order; splitting the active shape
  loop later would require compensated or wider accumulation analysis.
- GPU parity now covers ordinary 2D and 3D fixtures, but normals/tangents and
  scene renderer's real morph layout still need follow-up renderer adaptation.
- Benchmark evidence is local and shows parallel CPU deformation slower for the
  current fixtures, so Auto mode conservatively keeps serial as the default.
