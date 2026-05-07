## 1. Shared Contracts And Client Surface

- [x] 1.1 Add shared DTOs for `PreviewManifest`, `PreviewVariant`, `PanoramaViewState`, `EnvironmentPlacement`, and panoramic projection metadata without DOM/React/VSCode dependencies.
- [x] 1.2 Add `@neko/neko-client` types and methods for `registerPreviewAsset`, `requestPreviewVariant`, `unregisterPreviewAsset`, and manifest/token URL consumption.
- [x] 1.3 Add local minimal extension API interfaces for cross-extension preview/model calls and avoid importing API types from extension packages.
- [x] 1.4 Add unit tests proving shared DTOs are importable from non-Webview and Webview-facing packages without layer violations.

## 2. Engine Preview Manifest Foundation

- [x] 2.1 Extend the existing Range-capable preview file server or adjacent route with manifest registration for image/video preview assets.
- [x] 2.2 Implement image/video probe output for projection type, confidence, dimensions, HDR state, file size, and format/codec metadata.
- [x] 2.3 Implement manifest policy for small SDR passthrough, large-image proxy placeholder, HDR/EXR unsupported/handled status, compatible video route, and incompatible video stream route.
- [x] 2.4 Implement token unregister and cleanup behavior for preview assets, including stale token and source-change cases.
- [x] 2.5 Add Rust/host API tests for manifest registration, Range URL exposure, projection metadata, unsupported HDR/EXR behavior, and unregister cleanup.

## 3. Panoramic Image Preview Provider

- [x] 3.1 Add `PanoramicImagePreviewProvider` as a `CustomReadonlyEditorProvider` with viewType and activation/contribution wiring behind `viewer.panoramic.enabled`.
- [x] 3.2 Extend `neko-preview` Webview build entries and HTML/CSP helpers for the panoramic image viewer bundle.
- [x] 3.3 Register image sources through the engine manifest path and send only manifest/metadata to the Webview.
- [x] 3.4 Add route handling for explicit "Open as Panorama" commands and high-confidence panoramic image candidates.
- [x] 3.5 Add provider tests for ready/init flow, manifest error states, token cleanup on dispose, and route command behavior.

## 4. Panoramic Image Webview

- [x] 4.1 Implement `PanoramicViewer` with sphere, flat, and little-planet modes using WebGL2/WebGPU-capable rendering with flat fallback.
- [x] 4.2 Implement `ViewStateController` for local yaw/pitch/roll/FOV/exposure/tone-mapping state without per-frame Extension Host or engine messages.
- [x] 4.3 Implement metadata UI for projection, confidence, dimensions, HDR/SDR, file size, and unsupported format states.
- [x] 4.4 Implement heuristic confirmation flow for low-confidence 2:1 images and persist the user's projection decision through sidecar/metadata plumbing.
- [x] 4.5 Add Webview tests for local view-state updates, mode switching, fallback behavior, and absence of high-frequency `postMessage` traffic.

## 5. Preview Variants And Send-to-Model

- [x] 5.1 Implement `requestPreviewVariant` for thumbnail and FOV crop roles, including `PanoramaViewState` inputs and manifest-linked output variants.
- [x] 5.2 Implement default view persistence/restore using `PanoramaViewState`.
- [x] 5.3 Add screenshot/export request plumbing with semantic view state, using engine output for production-grade exports where available.
- [x] 5.4 Add `EnvironmentPlacement` handoff from `neko-preview` to `neko-model` through allowed command/API boundaries.
- [x] 5.5 Add tests ensuring preview yaw/pitch does not mutate model environment rotation unless explicitly mapped to `EnvironmentPlacement.rotationDeg`.

## 6. Panoramic Video Preview

- [x] 6.1 Add panoramic video manifest detection and route/contribution wiring behind `viewer.panoramic.video`.
- [x] 6.2 Add `PanoramicVideoPreviewProvider` or shared panoramic provider dispatch for video manifest kinds.
- [x] 6.3 Reuse the panoramic viewer presentation layer with video frame sources and flat fallback.
- [x] 6.4 Use the engine-backed H.264/PCM streaming path when source codec/audio support is unreliable for native Webview playback.
- [x] 6.5 Implement playback cleanup for stop, end, source change, Webview dispose, and partial startup failure.
- [x] 6.6 Add tests for stream descriptor handling, `stopStreams` cleanup, flat fallback, and no Extension Host frame relay.

## 7. Built-in Preview Optimization

- [x] 7.1 Add explicit "Open as Panorama" commands for supported image and video files.
- [x] 7.2 Add high-confidence routing for `.hdr`, `.exr`, GPano metadata, and trusted `_pano` / `_360` / `_equirect` filename hints.
- [x] 7.3 Add confirmation or explicit-only behavior for low-confidence aspect-ratio heuristics so ordinary flat 2:1 art is not hijacked.
- [x] 7.4 Ensure built-in/native preview optimizations delegate to the manifest-backed panoramic viewer and do not introduce direct Webview media loading.
- [x] 7.5 Add route/contribution tests for high-confidence, heuristic, explicit command, and non-panoramic cases.

## 8. Canvas, Agent, And Boundary Integration

- [x] 8.1 Update Canvas panoramic asset handling to consume engine-generated flat/proxy thumbnails and delegate spherical viewing to `neko-preview`.
- [x] 8.2 Update Agent panoramic media cards to consume engine-generated FOV crop thumbnails and delegate interactive viewing to `neko-preview`.
- [x] 8.3 Add boundary tests or dependency checks proving Canvas/Agent do not import or mount the panoramic WebGL viewer.
- [x] 8.4 Add shared preview asset cleanup/lifecycle handling for Canvas/Agent generated variants where applicable.

## 9. Documentation And Validation

- [x] 9.1 Update architecture docs if final viewType names, DTO names, engine route names, or ablation keys differ from the proposal.
- [x] 9.2 Run `pnpm build:neko-preview` for preview extension/webview changes.
- [x] 9.3 Run targeted `neko-preview` provider and Webview tests.
- [x] 9.4 Run `pnpm --filter @neko/neko-client test` for client manifest/stream DTO changes.
- [ ] 9.5 Run `cd packages/neko-engine && cargo test` for engine manifest/probe/preview route changes.
- [ ] 9.6 Run `pnpm check` to verify dependency-cruiser and package boundary rules.
- [x] 9.7 Run `pnpm build` before marking the change ready to archive.
