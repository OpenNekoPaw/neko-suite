## 1. Runtime Scene Text Mesh Ownership

- [x] 1.1 Move `engine-kernel/src/generators/text_mesh.rs` into `runtime-scene` with module exports and unchanged serde-facing parameter names.
- [x] 1.2 Update `SceneService::create_text_mesh()` to call the runtime-scene text mesh API and map runtime errors into kernel errors.
- [x] 1.3 Move or recreate existing text mesh unit tests under `runtime-scene`.
- [x] 1.4 Remove `engine-kernel/src/generators` and kernel module declarations once no call sites remain.

## 2. Runtime Media Toolbox Ownership

- [x] 2.1 Compare `engine-kernel/src/media_service` and `runtime-media/src` implementations and keep the latest behavior for duplicate modules.
- [x] 2.2 Move kernel-only `diff.rs` high-level `diff_media` API into `runtime-media`.
- [x] 2.3 Move `timeline_diff.rs` into `runtime-media`.
- [x] 2.4 Move `engine-kernel/src/jvi` project parser/DTO modules into `runtime-media`.
- [x] 2.5 Update runtime-media exports so probe, subtitle, JPEG, content diff, timeline diff, and JVI parsing are available from one crate.
- [x] 2.6 Update kernel services, host controllers, and contract re-exports to source media toolbox APIs from `runtime-media`.
- [x] 2.7 Remove `engine-kernel/src/media_service` and `engine-kernel/src/jvi` after compatibility imports are redirected.

## 3. Kernel Shell Cleanup

- [x] 3.1 Remove unused top-level kernel shell modules `animation`, `audio`, `decoder`, and `gpu` when no imports require them.
- [x] 3.2 Replace any remaining compatibility needs with explicit `contracts.rs` or `services/mod.rs` re-exports.
- [x] 3.3 Confirm `engine-kernel/src/lib.rs` only declares active orchestration, service, preview/export, contract, facade, error, and telemetry modules.

## 4. Architecture Guards

- [x] 4.1 Add runtime-media architecture tests that reject dependencies on kernel, host, GPU, renderer, and service orchestration crates.
- [x] 4.2 Add kernel architecture tests that reject reintroduced helper directories (`media_service`, `jvi`, `generators`, top-level `animation`, `audio`, `decoder`, `gpu`) unless explicitly allowlisted.
- [x] 4.3 Update existing kernel boundary tests so media compatibility exports are explicit runtime-media re-exports.
- [x] 4.4 Add or update runtime-scene architecture tests to keep text mesh generation below kernel and GPU-free.

## 5. Validation

- [x] 5.1 Run `cargo fmt -p neko-runtime-media -p neko-runtime-scene -p neko-engine-kernel -p neko-host-api`.
- [x] 5.2 Run `cargo test -p neko-runtime-media --lib`.
- [x] 5.3 Run `cargo test -p neko-runtime-scene --lib`.
- [x] 5.4 Run `cargo test -p neko-engine-kernel architecture --lib --no-default-features`.
- [x] 5.5 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 5.6 Run `cargo check -p neko-host-api --lib --no-default-features`.
- [x] 5.7 Run `openspec validate shrink-engine-kernel-domain-helpers --strict`.
