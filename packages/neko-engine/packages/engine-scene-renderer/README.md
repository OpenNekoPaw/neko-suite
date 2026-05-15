# neko-engine-scene-renderer

Scene renderer companion crate for `neko-engine`.

This crate owns GPU scene rendering implementation that depends on `wgpu`,
`neko-engine-gpu`, `neko-engine-types`, and pure `runtime-scene` data. It must
not depend on `neko-engine-kernel` or host crates.

During P2 migration, `neko_engine_kernel::gpu::scene_renderer::*` remains as a
temporary compatibility path. P3 should move host-facing callers to facade or
explicit contract paths and then narrow the kernel compatibility surface.
