## 1. Inventory Current Platform Paths

- [x] 1.1 Inventory macOS IOSurface import/export functions used by preview and export.
- [x] 1.2 Inventory Linux VA-API/DMA-BUF/Vulkan interop functions and current gaps.
- [x] 1.3 Inventory Windows D3D/DXGI interop functions and current gaps.
- [x] 1.4 Identify all preview/export call sites that branch on macOS-specific handles.

## 2. Define Bridge Contract

- [x] 2.1 Add platform bridge capability DTOs for direction, format, handle kind, and synchronization support.
- [x] 2.2 Define `PlatformGpuMediaBridge` or equivalent trait in the appropriate GPU contract module.
- [x] 2.3 Keep `wgpu` and unsafe native interop types out of `engine-types` unless represented as pure DTOs.
- [x] 2.4 Document lifetime requirements for raw native handle extraction and `GpuFrameLease` use.

## 3. Implement Platform Bridges

- [x] 3.1 Implement the macOS IOSurface bridge by wrapping existing working import/export code.
- [x] 3.2 Add Linux bridge implementation or explicit unsupported stubs behind capability gates.
- [x] 3.3 Add Windows bridge implementation or explicit unsupported stubs behind capability gates.
- [x] 3.4 Add unit tests for bridge capability reporting on each compiled platform path.

## 4. Route Preview And Export Through Bridge

- [x] 4.1 Update preview GPU media routing to call the bridge contract instead of hardcoding IOSurface orchestration.
- [x] 4.2 Update export GPU media routing to call the bridge contract instead of hardcoding IOSurface orchestration.
- [x] 4.3 Ensure realtime paths return unsupported capability rather than CPU readback fallback when bridge support is missing.
- [x] 4.4 Preserve existing macOS zero-copy VideoToolbox encode/decode behavior.

## 5. Validation

- [x] 5.1 Run `cargo test -p neko-engine-gpu`.
- [x] 5.2 Run targeted preview/export tests in `neko-engine-kernel` or renderer companion crates.
- [x] 5.3 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 5.4 Run cfg-gated macOS IOSurface tests where available.
- [x] 5.5 Run `openspec validate abstract-platform-gpu-media-bridge --strict`.
