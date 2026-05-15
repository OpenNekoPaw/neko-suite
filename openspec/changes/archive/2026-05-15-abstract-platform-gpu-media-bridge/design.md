## Context

The current macOS hot path is strong: VideoToolbox/CVPixelBuffer/IOSurface imports to Metal/wgpu, GPU render passes process the frame, and NV12 IOSurface output feeds VideoToolbox encode. Linux and Windows interop modules have partial import/export infrastructure, but preview/export orchestration still assumes macOS IOSurface in the shared path.

五层分析：

- 职责：engine-gpu owns platform interop; kernel/export/preview own orchestration; codec owns encoder/decoder consumption.
- 依赖：platform bridge traits must live at GPU/contract level, not in kernel services.
- 接口：import/export operations need capability detection and typed native handles.
- 扩展：new platforms should add bridge implementations without editing preview/export control flow.
- 测试：macOS zero-copy must be protected; unsupported platforms must fail explicitly.

## Goals / Non-Goals

**Goals:**

- Define a platform GPU media bridge contract for importing decoded native handles and exporting encoder-ready native handles.
- Make macOS IOSurface the reference implementation.
- Route preview/export orchestration through the bridge contract.
- Expose capability detection for IOSurface, DMA-BUF/VA-API, and DXGI/D3D paths.
- Preserve existing macOS zero-copy behavior and explicit unsupported-capability semantics.

**Non-Goals:**

- Do not complete full Linux or Windows zero-copy encode support unless existing primitives are already sufficient.
- Do not introduce CPU readback fallback in realtime preview/export hot paths.
- Do not change user-facing preview/export APIs.
- Do not merge codec and GPU crates; codec remains responsible for encoder/decoder APIs.

## Decisions

### Decision 1: Use a bridge trait instead of platform `cfg` in orchestration

Preview/export should depend on a trait such as:

- `supports(handle_kind, direction) -> PlatformGpuBridgeCapability`
- `import_decoded_frame(...) -> GpuImportedFrame`
- `export_nv12_frame(...) -> GpuOutputHandle`

Platform-specific code remains behind engine-gpu implementations.

Alternative considered: keep adding `#[cfg(target_os)]` branches in preview/export. This was rejected because it duplicates pipeline orchestration and makes Linux/Windows support a control-flow rewrite.

### Decision 2: Native handles remain typed at the contract edge

Use `GpuOutputHandle` and platform-specific metadata DTOs from `engine-types` where possible, but keep unsafe native pointer/resource handling inside engine-gpu bridge implementations. Bare handles must remain lifetime-sensitive and protected by leases where safe paths require them.

Alternative considered: expose raw platform pointers broadly. This was rejected because the IOSurface handle review already identified lifetime fragility when bare handles cross worker boundaries.

### Decision 3: Unsupported capability beats CPU fallback

If a platform bridge cannot provide the required zero-copy import/export path, realtime preview/export returns unsupported capability. CPU fallback can exist only in explicitly non-realtime diagnostic or offline paths with clear naming.

Alternative considered: fallback to CPU readback to maximize compatibility. This was rejected because it violates the GPU residency contract and can hide severe performance regressions.

### Decision 4: Capability-driven muxing

The bridge should report capabilities per direction and format: import NV12, export NV12, wrap encoder handle, and synchronization support. Preview/export orchestration selects paths from capabilities rather than OS strings.

Alternative considered: select solely by `target_os`. This was rejected because driver/hardware support can vary within the same OS.

## Risks / Trade-offs

- Trait may overfit macOS -> define capabilities around formats/directions, not IOSurface names.
- Linux/Windows implementation gaps -> add explicit unsupported stubs and tests first.
- Lifetime safety of native handles -> keep `GpuFrameLease` alive through safe submission paths and document any bare-handle boundaries.
- Cross-platform tests may be limited on one developer machine -> use unit tests for capability selection and cfg-gated platform integration tests.

## Migration Plan

1. Inventory current macOS, Linux, and Windows import/export functions and handle DTOs.
2. Define platform bridge trait and capability DTOs in engine-gpu or engine-types as appropriate.
3. Implement macOS IOSurface bridge by wrapping existing working code.
4. Add Linux/Windows bridge stubs or implementations behind capability gates.
5. Route preview/export orchestration through the bridge.
6. Add tests for capability selection, unsupported behavior, and macOS path preservation.
7. Document remaining platform gaps.

## Open Questions

- Should the bridge live entirely in `engine-gpu` or expose a pure trait in `engine-types`? Default: keep the trait in `engine-gpu` because methods traffic in `wgpu` resources; keep only DTOs/handle enums in `engine-types`.
- Should codec own encoder-ready handle wrapping? Default: engine-gpu exports `GpuOutputHandle`; engine-codec consumes it through existing encoder APIs.
