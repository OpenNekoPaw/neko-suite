# neko-engine-puppet-renderer

Puppet renderer companion crate for `neko-engine`.

This crate owns GPU puppet rendering implementation that depends on `wgpu`,
`neko-engine-gpu`, `neko-engine-types`, and pure `runtime-puppet` data. It must
not depend on `neko-engine-kernel` or host crates.

Callers inside engine-kernel import puppet renderer types directly from
`neko_engine_puppet_renderer`; host-facing compatibility belongs in explicit
kernel contracts when needed.
