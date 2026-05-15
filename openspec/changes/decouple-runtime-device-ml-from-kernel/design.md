## Context

The P0-P3 engine decoupling work extracted GPU, codec, audio, renderer, and facade boundaries, but `runtime-device` and `runtime-ml` still list `neko-engine-kernel` in their `Cargo.toml`. This creates a layering inversion:

- runtime crates should sit below kernel and expose reusable capabilities;
- kernel should orchestrate runtimes and map their errors to host-facing categories;
- host crates should receive services through the kernel facade or approved runtime contracts.

五层分析：

- 职责：runtime-device owns hardware I/O; runtime-ml owns local inference; kernel owns orchestration, lifecycle, and host error mapping.
- 依赖：runtime crates must depend on `engine-types` and third-party implementation crates, not on kernel.
- 接口：device/ML service traits and DTOs need a lower-level contract home.
- 扩展：future hosts or tests should instantiate runtime-device/runtime-ml without kernel.
- 测试：Cargo and source-level architecture checks must block dependency regression.

## Goals / Non-Goals

**Goals:**

- Remove `neko-engine-kernel` dependency from `runtime-device` and `runtime-ml`.
- Relocate shared runtime service traits, DTOs, and error contracts to `engine-types` or runtime-local public contract modules.
- Preserve kernel facade behavior by adapting lower-level runtime errors into existing kernel errors at the kernel boundary.
- Keep host-api imports on approved facade/contract paths.
- Add regression tests for Cargo dependencies and source imports.

**Non-Goals:**

- Do not redesign device discovery, mic capture, MIDI, gamepad, camera, ONNX, CLIP, Whisper, upscale, or denoise behavior.
- Do not split runtime-device or runtime-ml into additional crates.
- Do not change transport payloads, TypeScript client APIs, or persisted project formats.
- Do not make runtime-device/runtime-ml depend on host-api as an alternative to kernel.

## Decisions

### Decision 1: Contracts move down, adapters stay in kernel

Device and ML service contracts that are needed across crate boundaries move to a lower layer. Kernel keeps adapter code that maps runtime results into `neko_engine_kernel::Error` and exposes facade service handles.

Alternative considered: keep traits in kernel and allow runtime crates to depend upward. This was rejected because it preserves the layering violation and blocks independent runtime testing.

### Decision 2: Prefer `engine-types` only for pure DTOs and traits

Only implementation-free DTOs, small service traits, and error enums should move into `engine-types`. Any code that requires cpal, gilrs, midir, ort, ndarray, ffmpeg, tokio runtime ownership, or filesystem/model loading stays in runtime crates.

Alternative considered: create a new `runtime-common` crate immediately. This was rejected for this change because the current issue is limited to contract ownership; a new crate is only justified if multiple runtime domains need non-trivial shared implementation.

### Decision 3: Keep kernel facade as the host construction boundary

Host-api should not start constructing runtime-device/runtime-ml directly as a side effect of the inversion fix. The facade remains the entry point for the default service graph, and it can inject runtime implementations behind trait objects.

Alternative considered: move host-api directly to runtime crates. This was rejected for default orchestration because it would bypass the recently narrowed kernel facade.

### Decision 4: Validate both Cargo and source dependencies

Architecture tests must inspect `Cargo.toml` and source imports. Cargo checks catch direct dependencies; source checks catch accidental compatibility imports or re-export shortcuts.

Alternative considered: rely on `cargo tree`. This was rejected because runtime crates can regain source-level coupling through path re-exports even when direct dependencies appear clean.

## Risks / Trade-offs

- Error type churn -> keep conversion impls in kernel and preserve user-facing error categories.
- Trait move can create import churn -> provide compatibility re-exports where needed for one migration window, but do not let runtime crates consume those re-exports.
- `engine-types` pollution risk -> add tests that forbid implementation dependencies in `engine-types`.
- Optional `onnx` feature complexity -> validate both default and `onnx` relevant paths where the workspace supports it.

## Migration Plan

1. Inventory runtime-device/runtime-ml imports from kernel and classify them as DTO, trait, error, or implementation dependency.
2. Move pure contracts to `engine-types` or runtime-local public contract modules.
3. Replace runtime crate imports from kernel with lower-level contract imports.
4. Add kernel adapter conversions from runtime errors/contracts into kernel facade services.
5. Update host-api imports only if public contract paths changed.
6. Add architecture tests for forbidden runtime-to-kernel dependencies.
7. Run targeted runtime, kernel, and host-api validation.

## Open Questions

- Should ML-specific service traits live in `engine-types::ml` or `runtime-ml::service_trait`? Default: keep implementation-free public traits in runtime-ml unless kernel and host both need the trait without the runtime implementation dependency.
- Should device service traits be grouped by device type or under one aggregate contract? Default: keep camera, mic, MIDI, and gamepad contracts separate to avoid a broad device god trait.
