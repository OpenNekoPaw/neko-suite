## 1. Runtime Scene Text Mesh Ownership

- [ ] 1.1 Move `engine-kernel/src/generators/text_mesh.rs` into `runtime-scene` with module exports and unchanged serde-facing parameter names.
- [ ] 1.2 Update `SceneService::create_text_mesh()` to call the runtime-scene text mesh API and map runtime errors into kernel errors.
- [ ] 1.3 Move or recreate existing text mesh unit tests under `runtime-scene`.
- [ ] 1.4 Remove `engine-kernel/src/generators` and kernel module declarations once no call sites remain.

## 2. Runtime Media Toolbox Ownership

- [ ] 2.1 Compare `engine-kernel/src/media_service` and `runtime-media/src` implementations and keep the latest behavior for duplicate modules.
- [ ] 2.2 Move kernel-only `diff.rs` high-level `diff_media` API into `runtime-media`.
- [ ] 2.3 Move `timeline_diff.rs` into `runtime-media`.
- [ ] 2.4 Move `engine-kernel/src/jvi` project parser/DTO modules into `runtime-media`.
- [ ] 2.5 Update runtime-media exports so probe, subtitle, JPEG, content diff, timeline diff, and JVI parsing are available from one crate.
- [ ] 2.6 Update kernel services, host controllers, and contract re-exports to source media toolbox APIs from `runtime-media`.
- [ ] 2.7 Remove `engine-kernel/src/media_service` and `engine-kernel/src/jvi` after compatibility imports are redirected.

## 3. Kernel Shell Cleanup

- [ ] 3.1 Remove unused top-level kernel shell modules `animation`, `audio`, `decoder`, and `gpu` when no imports require them.
- [ ] 3.2 Replace any remaining compatibility needs with explicit `contracts.rs` or `services/mod.rs` re-exports.
- [ ] 3.3 Confirm `engine-kernel/src/lib.rs` only declares active orchestration, service, preview/export, contract, facade, error, and telemetry modules.

## 4. Architecture Guards

- [ ] 4.1 Add runtime-media architecture tests that reject dependencies on kernel, host, GPU, renderer, and service orchestration crates.
- [ ] 4.2 Add kernel architecture tests that reject reintroduced helper directories (`media_service`, `jvi`, `generators`, top-level `animation`, `audio`, `decoder`, `gpu`) unless explicitly allowlisted.
- [ ] 4.3 Update existing kernel boundary tests so media compatibility exports are explicit runtime-media re-exports.
- [ ] 4.4 Add or update runtime-scene architecture tests to keep text mesh generation below kernel and GPU-free.

## 5. Validation

- [ ] 5.1 Run `cargo fmt -p neko-runtime-media -p neko-runtime-scene -p neko-engine-kernel -p neko-host-api`.
- [ ] 5.2 Run `cargo test -p neko-runtime-media --lib`.
- [ ] 5.3 Run `cargo test -p neko-runtime-scene --lib`.
- [ ] 5.4 Run `cargo test -p neko-engine-kernel architecture --lib --no-default-features`.
- [ ] 5.5 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [ ] 5.6 Run `cargo check -p neko-host-api --lib --no-default-features`.
- [ ] 5.7 Run `openspec validate shrink-engine-kernel-domain-helpers --strict`.
