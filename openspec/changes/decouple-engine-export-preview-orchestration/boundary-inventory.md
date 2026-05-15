## Boundary Inventory

### Export

- `export/service.rs` previously owned job orchestration and directly constructed
  `GpuExportPipeline`, `AudioMixer`, `FfmpegAudioEncoder`, and export sinks.
- `export/sink_factory.rs` already provided the sink seam and is preserved.
- `export/gpu_export_pipeline.rs` remains the concrete GPU render adapter for this
  change because it still owns renderer-specific GPU work pending GPU extraction.
- `AsyncExportPipeline` remains kernel-owned and is exposed through
  `ExportEncodeBackendFactory` as a legacy encode/mux adapter.

### Preview

- `preview/pipeline.rs` remains the concrete production implementation for
  timeline preview rendering and encoded preview packets.
- `preview/provider.rs` keeps provider DTOs and default providers in kernel. The
  new `PreviewProviderBackend` wraps provider routing so tests and later crate
  moves do not construct the default registry directly.
- `TimelineService` now accepts a `PreviewRenderBackendFactory` for stream
  preview rendering while preserving the public constructor.

### DTO Placement

- Existing export and preview request/response DTOs remain kernel-owned for this
  change because they still reference `Timeline`, runtime renderer behavior, or
  provider-specific metadata.
- No new DTO was moved to `engine-types`.
- Runtime handles such as `GpuContext`, `GpuFrameLease`, encoder instances,
  mux/sink workers, and provider registries remain kernel-owned.

### Temporary Exceptions

- `export/gpu_export_pipeline.rs` may import GPU renderer internals until
  `engine-gpu` extraction.
- `preview/pipeline.rs` may wrap `GpuExportPipeline` and encoder internals as
  the default production adapter.
- `preview/provider.rs` may mention renderer names in metadata strings because
  they are user-facing artifact metadata, not direct renderer construction.
