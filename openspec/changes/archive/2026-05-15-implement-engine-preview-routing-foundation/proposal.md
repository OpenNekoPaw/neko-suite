## Why

Preview asset logic is currently spread through HTTP routes, mixing file analysis, sidecar metadata, variant generation, token registration, and file serving. CPU preview analysis and JSON commands can be decoupled from GPU rendering work and moved behind reusable domain/provider contracts.

## What Changes

- Move GPANO detection, projection inference, sidecar metadata, thumbnail/proxy generation, and HDR detection into `runtime-media`.
- Add `PreviewProvider`, `PreviewProviderRegistry`, `PreviewRequest`, and `PreviewArtifact` contracts.
- Add `PreviewsController` and migrate preview JSON commands to ActionRouter.
- Keep Range file serving and EPUB file access as direct HTTP transport routes.
- Add image and document preview providers that delegate CPU work to `runtime-media`.

## Capabilities

### New Capabilities

- `engine-preview-routing-foundation`: Defines CPU preview analysis ownership, preview provider registry, ActionRouter preview commands, and transport-only file serving boundaries.

### Modified Capabilities

- None.

## Impact

- Affects `runtime-media`, `engine-kernel/src/preview/`, `host-api` routing, `host-http` preview routes, and TS `EngineClient` preview methods.
- Can be implemented after P0 without waiting for GPU budget or PipelineSink because PR6a/PR6b are CPU and routing work.
