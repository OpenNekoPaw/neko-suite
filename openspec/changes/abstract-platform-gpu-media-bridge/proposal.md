## Why

macOS preview/export zero-copy is wired through IOSurface-specific paths, while Linux and Windows interop code exists but is not routed through the same pipeline abstraction. A platform GPU media bridge lets preview/export call a shared contract and add DMA-BUF/DXGI support without duplicating orchestration or weakening unsupported-capability behavior.

## What Changes

- Introduce a `PlatformGpuMediaBridge` or equivalent importer/exporter trait for native GPU media handles.
- Implement the bridge for macOS IOSurface as the reference path without changing the current zero-copy hot path.
- Add Linux DMA-BUF/VA-API and Windows DXGI/D3D handle bridge stubs or gated implementations that report explicit capability status.
- Update preview/export pipelines to call the bridge contract instead of hardcoding macOS-specific orchestration in shared code.
- Add tests for platform capability selection, unsupported-capability behavior, and macOS zero-copy path preservation.

## Capabilities

### New Capabilities
- `platform-gpu-media-bridge`: Defines cross-platform GPU import/export bridge contracts, capability detection, zero-copy preservation, and unsupported-platform behavior.

### Modified Capabilities
- `engine-gpu-core-extraction`: Extends GPU core extraction requirements with platform bridge boundaries for preview/export media interop.

## Impact

- Affected Rust crates:
  - `packages/neko-engine/packages/engine-gpu`
  - `packages/neko-engine/packages/engine-kernel`
  - `packages/neko-engine/packages/engine-codec`
  - renderer/export/preview companion crates if their imports touch native GPU handles.
- Affected behavior:
  - preview/export GPU media path selection.
  - platform capability reporting for macOS/Linux/Windows.
- No CPU fallback should be introduced into realtime zero-copy paths.
