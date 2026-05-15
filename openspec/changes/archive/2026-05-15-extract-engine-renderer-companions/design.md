## Context

P0/P1 have already extracted shared pipeline contracts, GPU core infrastructure, codec, audio, and export/preview backend boundaries. The remaining high-coupling area is renderer ownership: `engine-kernel/src/gpu` still contains scene, puppet, and panoramic renderers, while `engine-kernel/src/export/gpu_export_pipeline.rs` still combines export orchestration with GPU render pipeline implementation.

Current implementation facts:

- Scene renderer lives under `engine-kernel/src/gpu/scene_renderer` and is roughly 5.5K lines.
- Puppet renderer lives under `engine-kernel/src/gpu/puppet_renderer` and is roughly 1K lines.
- Panoramic renderer lives in `engine-kernel/src/gpu/panoramic_renderer.rs` and is roughly 465 lines.
- Export GPU pipeline lives in `engine-kernel/src/export/gpu_export_pipeline.rs` and is roughly 1.5K lines.
- `runtime-scene` and `runtime-puppet` are pure runtime/domain crates and should not gain `wgpu`.
- `engine-gpu` owns reusable GPU infrastructure but intentionally does not own domain-specific renderers.

五层分析：

- 职责：renderer 是领域渲染实现，不是 kernel 编排，也不是通用 GPU core。
- 依赖：renderer 应依赖 `engine-gpu` 与对应 runtime，不应被 `engine-gpu` 或 host 反向依赖。
- 接口：kernel 应通过明确 renderer output/request 合同消费 renderer，而不是暴露整个 `gpu::*`。
- 扩展：新增 scene/puppet/panoramic renderer 功能应落在 companion crate 内，可独立测试。
- 测试：每个 renderer companion 需要独立 cargo test 与架构门禁，kernel 只验证集成行为。

## Goals / Non-Goals

**Goals:**

- Create focused renderer companion crate boundaries for scene, puppet, and panoramic rendering.
- Keep pure runtime crates free of `wgpu` and GPU side effects.
- Keep `engine-gpu` free of renderer internals and orchestration dependencies.
- Move or isolate export-facing GPU render pipeline implementation when it is rendering infrastructure rather than export orchestration.
- Preserve zero-copy GPU frame output, PipelineSink contracts, and unsupported-capability behavior.
- Keep short-term compatibility imports through explicit kernel re-exports while preparing P3 public facade narrowing.

**Non-Goals:**

- Do not change TypeScript, HTTP, WebSocket, N-API, or persisted project formats.
- Do not put renderer code directly into `runtime-scene` or `runtime-puppet`.
- Do not redesign scene, puppet, panoramic, preview, or export user-facing behavior.
- Do not introduce CPU readback fallback for realtime preview/export paths.
- Do not narrow the full host-facing kernel public facade; that is P3.

## Decisions

### Decision 1: Use companion crates instead of runtime crates

Renderer implementation will move to companion crates such as:

- `neko-engine-scene-renderer`
- `neko-engine-puppet-renderer`
- `neko-engine-panoramic-renderer`

These crates depend on `neko-engine-gpu`, `neko-engine-types`, and the relevant pure runtime crate. Pure runtime crates remain state/computation owners and do not depend on `wgpu`.

Alternative considered: move renderer code into `runtime-scene` and `runtime-puppet`. This was rejected because it would pollute runtime crates with GPU dependencies and weaken the current domain/runtime split.

### Decision 2: Keep GPU core renderer-agnostic

`engine-gpu` remains the infrastructure crate for context, resources, platform interop, compositor, effect, readback, and budget. It must not import scene, puppet, panoramic, preview, export orchestration, services, or host modules.

Alternative considered: move all renderer modules into `engine-gpu`. This was rejected because it would recreate a large mixed-responsibility crate and make GPU core depend on domain-specific renderer concepts.

### Decision 3: Treat `GpuExportPipeline` as an ownership decision point

`GpuExportPipeline` should be audited and split by responsibility:

- rendering/export-rendering implementation moves to a renderer/export companion crate;
- job orchestration, cancellation, progress, and sink factory wiring remain in `engine-kernel::export`.

If a single extraction would be too risky, the first implementation step may introduce an adapter trait and move only the rendering implementation behind that boundary.

Alternative considered: leave `GpuExportPipeline` in kernel until P3. This was rejected as the default because it keeps `wgpu` rendering implementation inside the orchestration crate and blocks meaningful kernel slimming.

### Decision 4: Preserve compatibility through explicit re-exports

During P2, `engine-kernel::gpu` may continue to re-export moved renderer types, but those re-exports must be explicit. P3 will remove broad/glob compatibility surfaces after host callers move to facade paths.

Alternative considered: immediately break all old imports. This was rejected because it would entangle renderer extraction with host facade migration and increase blast radius.

### Decision 5: Add architecture tests before or with migration

The change should add source/Cargo dependency checks that enforce:

- renderer companion crates do not depend on `neko-engine-kernel` or host crates;
- `engine-gpu` does not depend on renderer companions;
- pure runtime crates do not depend on `wgpu`;
- kernel retained `gpu` module is compatibility-only for renderer paths;
- renderer/export migration does not introduce CPU readback fallback.

Alternative considered: rely on manual review. This was rejected because P0/P1 already showed architecture tests are cheap and effective for preventing boundary regressions.

## Risks / Trade-offs

- Shader/resource path movement may break runtime asset lookup -> keep shader modules colocated with each renderer crate and add compile/load tests for shader creation paths.
- Export GPU pipeline may mix orchestration and rendering too tightly -> introduce an adapter trait first, then move render implementation once responsibilities are separated.
- Compatibility re-exports can hide remaining coupling -> require explicit re-exports and add a P3 task to remove broad/glob surfaces.
- Renderer crates may need many shared GPU helper imports -> prefer adding narrow APIs to `engine-gpu` over depending back on `engine-kernel`.
- Zero-copy regressions can be subtle -> add tests or smoke checks for GPU handle output and unsupported-capability paths; no CPU readback fallback is allowed for realtime paths.

## Migration Plan

1. Create renderer companion crates with minimal `lib.rs`, Cargo dependencies, and architecture tests.
2. Move scene renderer implementation and keep `engine-kernel::gpu::scene_renderer` as an explicit compatibility shim.
3. Move puppet renderer implementation and keep `engine-kernel::gpu::puppet_renderer` as an explicit compatibility shim.
4. Move panoramic renderer implementation and keep explicit kernel re-exports.
5. Audit and split `GpuExportPipeline` into orchestration and render implementation; move render implementation to the chosen companion boundary.
6. Update kernel/export/preview call sites to consume companion crates or renderer backend traits.
7. Run renderer crate tests, kernel architecture tests, and targeted preview/export tests.

## Open Questions

- Should panoramic rendering live in a dedicated `neko-engine-panoramic-renderer` crate or a broader preview-renderer companion crate? Default: use a dedicated crate for clear ownership.
- Should export rendering use a standalone `neko-engine-render-pipeline` crate or live in scene/panoramic companions behind traits? Default: introduce a focused export render pipeline crate only if shared export rendering code remains after splitting orchestration.
