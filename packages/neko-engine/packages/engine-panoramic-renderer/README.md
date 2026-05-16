# neko-engine-panoramic-renderer

Panoramic renderer companion crate for `neko-engine`.

This crate owns GPU panoramic projection rendering implementation that depends
on `wgpu`, `neko-engine-gpu`, `neko-engine-types`, and projection metadata from
`runtime-media`. It must not depend on `neko-engine-kernel` or host crates.

Callers inside engine-kernel import panoramic renderer types directly from
`neko_engine_panoramic_renderer`; host-facing compatibility belongs in explicit
kernel contracts when needed.
