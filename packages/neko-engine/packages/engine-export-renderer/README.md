# neko-engine-export-renderer

Export renderer companion support crate for `neko-engine`.

This crate owns export rendering support types that do not require kernel job
orchestration, service wiring, or sink ownership. Full export job setup,
progress, cancellation, sink factory wiring, and error mapping remain in
`engine-kernel::export`.

During P2 migration, `engine-kernel::export` re-exports the timing contract used
by preview/export callers. P3 should move host-facing callers to facade or
explicit contract paths and then narrow the kernel compatibility surface.
