## 1. Shared Contracts And Routing

- [x] 1.1 Extend `PreviewProjectionType`, `PanoramaViewMode`, `PreviewProjectionMetadata`, `UpdatePreviewAssetMetadataRequest`, and `PreviewVariantRequest` in `packages/neko-types/src/types/preview.ts` for `cylindrical` and `PanoramaCoverageAngle`.
- [x] 1.2 Add `DEFAULT_PANORAMA_COVERAGE_ANGLE`, `normalizeCoverageAngle()`, and projection/mode compatibility normalization helpers in the shared preview contract layer.
- [x] 1.3 Update panoramic filename routing to accept `halfpano`, `180pano`, and `pano180` while rejecting bare `180` hints.
- [x] 1.4 Update shared preview contract and panoramic routing tests for coverage round-trip, invalid coverage normalization, projection/mode normalization, and filename hint behavior.

## 2. Engine Metadata And Sidecar

- [x] 2.1 Add Rust `PreviewProjectionType::Cylindrical`, `PanoramaViewMode::Cylindrical`, `PanoramaCoverageAngle`, and normalization support in `runtime-media/src/image_analysis.rs`.
- [x] 2.2 Extend `PreviewProjectionMetadata` and `ProjectionInferenceInput` so sidecar/manual metadata can carry projection type and normalized coverage together.
- [x] 2.3 Implement GPano coverage extraction from full-pano and cropped-area pixel fields while preserving existing GPano detection behavior.
- [x] 2.4 Extend `PreviewAssetSidecar` and `write_sidecar_update()` to read/write normalized `coverage_angle` without breaking existing sidecars.
- [x] 2.5 Extend `host-api/src/preview.rs` metadata update structs and manifest building so coverage flows through update, sidecar, and returned manifests.
- [x] 2.6 Add Rust tests for GPano partial coverage, default coverage fallback, sidecar round-trip, manual override precedence, and invalid coverage normalization.

## 3. Engine Variant Generation

- [x] 3.1 Extend host-api and runtime-media preview variant request structs to accept optional non-persistent `projection_type` and `coverage_angle` overrides.
- [x] 3.2 Resolve variant projection by request override, then manifest projection, then defaults before invoking runtime-media variant generation.
- [x] 3.3 Update `render_fov_crop()` to branch between coverage-aware equirectangular sampling and cylindrical perspective sampling.
- [x] 3.4 Normalize illegal projection/mode combinations before FOV crop or screenshot generation.
- [x] 3.5 Add Rust tests for cylindrical FOV crop sampling, partial equirectangular coverage sampling, and request override precedence.

## 4. Webview Rendering And State

- [x] 4.1 Add `uCoverage` and `uMode=2` support to `webglPanoramaRenderer.ts`, including coverage-aware `sphereUv()` and cylindrical UV sampling.
- [x] 4.2 Update WebGL texture wrapping so 360 equirectangular uses horizontal repeat and partial/cylindrical projections clamp to edge.
- [x] 4.3 Update `ViewStateController` to accept coverage and viewport aspect, clamp yaw using horizontal FOV, and clamp pitch using vertical FOV.
- [x] 4.4 Update controller reset, drag, wheel, resize, and coverage changes to re-normalize local state without crossing the Extension Host boundary.
- [x] 4.5 Add webview tests for controller clamping, aspect-aware yaw bounds, full-coverage wrap behavior, and illegal mode normalization.

## 5. Preview UI And Extension Protocol

- [x] 5.1 Extend webview message types with `panorama:updateAsset` and variant request projection/coverage override fields.
- [x] 5.2 Add `panorama:updateAsset` handling in `PanoramicImagePreviewProvider`, including projection type parsing, coverage normalization, and atomic metadata update.
- [x] 5.3 Keep deprecated `panorama:saveDefaultView` and `panorama:confirmProjection` paths working by routing them through the same metadata update path.
- [x] 5.4 Update `PanoramicViewer.tsx` to show legal mode tabs for the current projection, support temporary Cylinder mode, show non-default coverage metadata, and send current projection/coverage on FOV Crop and Export.
- [x] 5.5 Add extension/webview tests for atomic update messages, deprecated message compatibility, variant override parsing, and UI mode availability.

## 6. Validation And Documentation

- [x] 6.1 Update or cross-link architecture documentation from the ADR to the OpenSpec change where appropriate.
- [x] 6.2 Run focused TypeScript tests for shared contracts and `neko-preview` webview/extension packages.
- [x] 6.3 Run focused Rust tests for `runtime-media` and `host-api` preview paths.
- [x] 6.4 Manually validate `shanghai-morning.jpg`: explicit open, switch to Cylinder, save default, reopen, and export/FOV crop parity.
- [x] 6.5 Run broader checks if touched surfaces expand beyond preview contracts, runtime-media, host-api, and neko-preview.
