## Why

Neko currently has no first-class panoramic image or 360 video preview path, so HDRI skyboxes, equirectangular images, and panoramic videos either fall back to flat previews or depend on ad-hoc viewer behavior. This blocks AI-generated skybox review, asset quality inspection, and clean handoff from `neko-preview` to `neko-model`.

Large panoramic assets also make a direct Webview file path strategy fragile: Webviews cannot provide the Range, tile, proxy, transcoding, and lifecycle controls needed for 8K/16K images, HDR/EXR, or incompatible 360 video. The preview content path should therefore be engine-first before improving built-in preview integrations.

## What Changes

- Add an engine-first panoramic preview pipeline for `neko-preview`.
- Add `PreviewManifest`, `PreviewVariant`, `PanoramaViewState`, and `EnvironmentPlacement` contracts in shared/API-facing types.
- Extend `neko-engine` preview serving so `neko-preview` consumes token URLs, tile templates, proxy variants, or stream descriptors rather than local file paths or direct `asWebviewUri` media content.
- Add a panoramic image viewer in `neko-preview` with sphere, flat, and little-planet modes; viewer-local high-frequency `yaw/pitch/fov` control; and low-frequency semantic requests for bookmarks, FOV crops, screenshots, tile requests, and model handoff.
- Add panoramic video preview support after the image pipeline, using the same manifest and control model while routing playback through the Neko streaming path when direct browser playback would be unreliable.
- Add Send-to-Model integration that passes environment placement semantics without mixing preview camera yaw/pitch with model environment rotation.
- After the dedicated panoramic preview path is in place, optimize built-in preview behavior so VSCode/native preview entry points delegate panoramic candidates to `neko-preview` without duplicating content-loading logic.
- Keep Canvas and Agent lightweight: they consume engine-generated thumbnails/proxy previews and delegate interactive panoramic viewing to `neko-preview`.

## Capabilities

### New Capabilities

- `panoramic-preview-engine-first`: Engine-first panoramic image and video preview, including manifest contracts, viewer state semantics, variant generation, and preview/model handoff.

### Modified Capabilities

- `webview-engine-control-surface`: Webviews that preview panoramic media must consume engine-provided manifests, token URLs, tile templates, and stream descriptors instead of direct local media paths; high-frequency viewer state remains local while semantic preview requests cross the engine/control boundary.

## Impact

- Affected packages:
  - `packages/neko-preview`: new panoramic custom editor/viewer entries, manifest loading, viewer controls, Send-to-Model command surface.
  - `packages/neko-engine`: preview manifest/proxy/tile/range/stream policy, panoramic image probe, optional video projection detection and transcoding path reuse.
  - `packages/neko-client`: typed client methods and shared DTOs for preview manifests and variants.
  - `packages/neko-model`: environment placement contract consumption for HDRI/equirectangular assets.
  - `packages/neko-canvas` and `packages/neko-agent`: consume generated preview assets only; no WebGL panoramic viewer embedding.
- Affected architecture:
  - Refines `docs/architecture/adr-panoramic-image-preview.md`.
  - Follows `docs/architecture/adr-canvas-preview-boundary.md` for Canvas/Agent delegation.
  - Reuses the existing Range-capable preview file server pattern from document preview.
- Quality gates:
  - `pnpm build:neko-preview`
  - `pnpm build`
  - `pnpm test`
  - `pnpm check`
  - Rust changes: `cd packages/neko-engine && cargo test`
