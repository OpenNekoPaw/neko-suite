# neko-engine-scene-renderer

Scene renderer companion crate for `neko-engine`.

This crate owns GPU scene rendering implementation that depends on `wgpu`,
`neko-engine-gpu`, `neko-engine-types`, and pure `runtime-scene` data. It must
not depend on `neko-engine-kernel` or host crates.

Callers inside engine-kernel import scene renderer types directly from
`neko_engine_scene_renderer`; host-facing compatibility belongs in
`neko_engine_kernel::contracts::gpu` when needed.
