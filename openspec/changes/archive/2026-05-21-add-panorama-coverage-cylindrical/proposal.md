## Why

Current panoramic preview assumes every panoramic image/video is a 360 degree equirectangular asset. Wide stitched panoramas without GPano metadata, such as cylindrical city panoramas, either fail detection or render with severe polar distortion when forced through the sphere shader.

This change adds an explicit coverage-angle contract and cylindrical projection path so neko-preview can view, persist, crop, and export partial panoramas without weakening the engine-first preview boundary.

## What Changes

- Add `cylindrical` as a first-class preview projection type for panoramic images.
- Add `PanoramaCoverageAngle` metadata to preview projection manifests, update requests, sidecars, and variant requests.
- Parse GPano cropped-area metadata into equirectangular coverage angles.
- Extend trusted filename routing for half-panorama hints using `halfpano`, `180pano`, and `pano180` combinations without matching bare `180`.
- Add coverage-aware yaw/pitch clamping that accounts for viewport aspect and horizontal FOV.
- Add a WebGL cylindrical sampling path using cylindrical vertical perspective mapping rather than spherical latitude mapping.
- Add atomic `panorama:updateAsset` persistence for projection type, coverage angle, and default view state.
- Allow non-persistent projection/coverage overrides on FOV crop and export requests so unsaved UI mode changes still produce matching output.
- Keep cylindrical handling scoped to panoramic image preview; panoramic video cylindrical rendering remains a future extension.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `panoramic-preview-engine-first`: extend panoramic projection probing, manifest metadata, viewer modes, semantic state requests, and variant generation for partial coverage and cylindrical projection.

## Impact

- Shared contracts: `packages/neko-types/src/types/preview.ts` and panoramic routing helpers.
- Engine/runtime media: projection analysis, GPano parsing, sidecar read/write, preview variant generation.
- Engine host API/client: preview metadata update and preview variant request payloads.
- neko-preview extension/webview: message protocol, projection persistence handler, `PanoramicViewer`, `ViewStateController`, and WebGL panorama renderer.
- Tests: shared contract tests, routing tests, Rust projection/sidecar/variant tests, webview controller tests, and manual panoramic preview validation.
