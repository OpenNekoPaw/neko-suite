## 1. Export Support Ownership

- [x] 1.1 Move `engine-export-renderer/src/lib.rs` support types into `engine-gpu/src/export_support.rs`.
- [x] 1.2 Re-export `GpuPipelineTiming`, `Nv12FrameResult`, and `LayerTexturePool` from `engine-gpu`.
- [x] 1.3 Update engine-kernel export and preview imports to use `neko_engine_gpu`.
- [x] 1.4 Remove `engine-export-renderer` from workspace members, Cargo.lock, and engine-kernel dependencies.
- [x] 1.5 Delete the `engine-export-renderer` crate directory after call sites move.

## 2. Host HTTP Scene Contracts

- [x] 2.1 Add `engine-kernel::contracts::scene` with explicit re-exports for scene control/modeling DTOs.
- [x] 2.2 Update `host-http` scene routes to import DTOs from `neko_engine_kernel::contracts::scene`.
- [x] 2.3 Remove `neko-runtime-scene` from `host-http/Cargo.toml`.
- [x] 2.4 Add or update architecture tests rejecting direct `host-http` imports/dependencies on `neko-runtime-scene`.

## 3. Documentation And Guards

- [x] 3.1 Update engine-gpu documentation or module docs for export support ownership.
- [x] 3.2 Update kernel architecture tests for the removed export renderer crate and new scene contract path.
- [x] 3.3 Keep P3 services implementation splitting documented as follow-up only.

## 4. Validation

- [x] 4.1 Run `cargo fmt -p neko-engine-gpu -p neko-engine-kernel -p neko-host-http`.
- [x] 4.2 Run `cargo test -p neko-engine-gpu --lib`.
- [x] 4.3 Run `cargo test -p neko-engine-kernel architecture --lib --no-default-features`.
- [x] 4.4 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 4.5 Run `cargo check -p neko-host-http --lib --no-default-features`.
- [x] 4.6 Run `openspec validate tighten-engine-p2-boundaries --strict`.
