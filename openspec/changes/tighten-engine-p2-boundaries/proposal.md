## Why

The recent kernel shrink left two P2 boundary seams unfinished: `engine-export-renderer` is a 262-line crate that only wraps GPU export support types, and `host-http` still imports runtime-scene editing contracts directly instead of using the kernel contract facade. Tightening these boundaries keeps the crate graph simpler and prevents host transport code from bypassing engine contracts.

## What Changes

- Merge `engine-export-renderer` into `engine-gpu` as an `export_support` module.
- Remove `engine-export-renderer` from the workspace, lockfile, and kernel dependencies.
- Update export and preview code to use `neko_engine_gpu::export_support` or root re-exports for `GpuPipelineTiming`, `Nv12FrameResult`, and `LayerTexturePool`.
- Add a `contracts::scene` section in `engine-kernel` that explicitly re-exports host-http scene-control DTOs from runtime-scene.
- Update `host-http` scene WebSocket routes to import scene DTOs through `neko_engine_kernel::contracts::scene`.
- Remove `host-http`'s direct `neko-runtime-scene` dependency and add architecture guards preventing it from returning.
- Keep P3 service implementation file splitting out of this change; that is a readability refactor, not a boundary fix.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `engine-renderer-companion-extraction`: export rendering support types are owned by `engine-gpu` rather than a separate thin companion crate.
- `engine-kernel-boundary-contracts`: host transport crates must consume runtime scene editing contracts through explicit kernel contract re-exports.

## Impact

- Affected Rust crates:
  - `packages/neko-engine/packages/engine-gpu`
  - `packages/neko-engine/packages/engine-kernel`
  - `packages/neko-engine/packages/host-http`
- Removed crate:
  - `packages/neko-engine/packages/engine-export-renderer`
- Workspace membership and `Cargo.lock` change because the thin export renderer crate is removed.
- Public host behavior and WebSocket payload shapes remain unchanged.
