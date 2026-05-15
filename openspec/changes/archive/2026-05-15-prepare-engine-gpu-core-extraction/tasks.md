## 1. GPU Module Classification

- [x] 1.1 Classify `engine-kernel/src/gpu` files into core/resource/HAL, pipeline/effects, budget, and renderer companion groups.
- [x] 1.2 Record the classification in architecture tests, module docs, or a small `gpu/boundary.rs` metadata helper.
- [x] 1.3 Mark `scene_renderer`, `puppet_renderer`, and `panoramic_renderer` as renderer companion modules that are excluded from first GPU core extraction.
- [x] 1.4 Decide whether `budget.rs` is extraction-ready for GPU core or remains kernel-owned for scheduling reasons.
- [x] 1.5 Decide whether shader modules move with pipeline/effects or remain kernel-owned until renderer companions move.

## 2. Dependency Cleanup

- [x] 2.1 Normalize imports in extraction-ready GPU core/resource/HAL modules so they do not depend on services, export, preview, domain, or renderer companion internals.
- [x] 2.2 Normalize imports in extraction-ready GPU pipeline/effect modules so they do not depend on services, export, preview, domain, or renderer companion internals.
- [x] 2.3 Add adapters or DTO conversions where renderer companion modules currently leak into extraction-ready GPU modules.
- [x] 2.4 Keep zero-copy handle and readback ownership semantics unchanged.
- [x] 2.5 Preserve current public `engine-kernel::gpu::*` import paths.

## 3. Compatibility Surface Preparation

- [x] 3.1 Create internal grouping modules or preludes that mirror the future `engine-gpu` module shape without creating the crate.
- [x] 3.2 Ensure kernel and host call sites can continue importing current GPU items through compatibility paths.
- [x] 3.3 Document which modules will become `engine-gpu` re-exports in the follow-up extraction.
- [x] 3.4 Document which modules must wait for renderer companion extraction.

## 4. Architecture Guardrails

- [x] 4.1 Add architecture checks for extraction-ready GPU core/resource/HAL modules forbidding imports of services, export, preview, host crates, and renderer companion internals.
- [x] 4.2 Add architecture checks for extraction-ready GPU pipeline/effect modules forbidding imports of services, export, preview, host crates, and renderer companion internals.
- [x] 4.3 Add explicit allowlist or documentation for renderer companion exceptions.
- [x] 4.4 Add a check confirming this preparation change does not create `packages/engine-gpu`.

## 5. Validation

- [x] 5.1 Run `cargo fmt -p neko-engine-kernel`.
- [x] 5.2 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 5.3 Run targeted GPU core/resource/HAL tests.
- [x] 5.4 Run targeted GPU compositor/effect/budget tests for extraction-ready modules.
- [x] 5.5 Run targeted retained scene renderer, puppet renderer, panoramic renderer, export, preview, and sink tests.
- [x] 5.6 Run `cargo test -p neko-engine-kernel` before merge, or document any platform/tooling blocker with targeted passing evidence.
- [x] 5.7 Run `openspec validate prepare-engine-gpu-core-extraction --strict`.
