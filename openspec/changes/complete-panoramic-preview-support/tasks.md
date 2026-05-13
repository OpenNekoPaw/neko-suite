## 1. Shared Contracts And Engine Service Shape

- [ ] 1.1 Audit `@neko/shared` preview DTOs and extend only missing fields for manual projection confidence, generated variant metadata, HDR proxy metadata, and persisted default view state.
- [ ] 1.2 Keep `@neko/neko-client` preview manifest APIs typed and add tests for register, request variant, and unregister error paths.
- [ ] 1.3 Refactor `packages/neko-engine/packages/host-http/src/routes/preview_file.rs` so manifest/variant policy is delegated to a testable preview asset service or helper module.
- [ ] 1.4 Preserve existing `/v1/preview/assets`, `/v1/preview/assets/:id/variants`, `/v1/preview/assets/:id`, and `/v1/preview/file/:token` wire contracts during the refactor.

## 2. Projection Metadata And Persistence

- [ ] 2.1 Implement bounded GPano/XMP metadata detection in engine projection probing for JPEG/PNG/WebP sources where metadata is available.
- [ ] 2.2 Add sidecar or engine-backed metadata read/write for projection overrides and default `PanoramaViewState`.
- [ ] 2.3 Update manifest generation so persisted manual projection metadata takes precedence over filename and 2:1 aspect-ratio heuristics.
- [ ] 2.4 Replace `neko-preview` panoramic projection/default-view `setContext` persistence with the new metadata persistence path.

## 3. Image Proxy And Variant Generation

- [ ] 3.1 Implement SDR image proxy generation for large panoramic sources using deterministic size/texture-memory thresholds.
- [ ] 3.2 Implement CPU equirectangular sampling for `fov-crop` and `screenshot` variants from supported image/proxy pixels.
- [ ] 3.3 Implement thumbnail generation with correct output dimensions, MIME type, quality, and engine-managed token registration.
- [ ] 3.4 Ensure `PreviewVariant` responses for `proxy`, `thumbnail`, `fov-crop`, and `screenshot` reference generated files rather than the unchanged source token.
- [ ] 3.5 Tie generated variant files and tokens to asset unregister cleanup and add best-effort cache cleanup for abandoned resources.

## 4. HDR And Unsupported Format Handling

- [ ] 4.1 Add `.hdr` decode or conversion path that can produce tone-mapped SDR proxy/variant output for preview.
- [ ] 4.2 Preserve HDR metadata and default tone-mapping/exposure information in `PreviewManifest` for `.hdr` sources.
- [ ] 4.3 Keep `.exr` as a typed unsupported state unless a reliable single-layer EXR decoder is introduced in this change.
- [ ] 4.4 Update the panoramic image Webview to display HDR proxy availability, typed unsupported errors, and tone-mapping controls consistently.

## 5. Panoramic Image Viewer Refinement

- [ ] 5.1 Update `PanoramicViewer` to prefer generated proxy/display variants when manifest policy provides them.
- [ ] 5.2 Wire FOV crop and screenshot actions to generated variant responses and show success/error feedback without exposing local paths.
- [ ] 5.3 Keep drag, wheel, FOV, exposure, and mode switching Webview-local with no high-frequency `postMessage` traffic.
- [ ] 5.4 Add keyboard reset/zoom/pan accessibility behavior if not already covered by the viewer.

## 6. Panoramic Video Playback

- [ ] 6.1 Replace the panoramic video placeholder Webview with a viewer that posts `preview:play`, receives stream descriptors, and connects directly to engine stream URLs.
- [ ] 6.2 Reuse `H264StreamClient`, `AudioStreamClient`, and `FrameScheduler` for transport and A/V sync without routing frames through Extension Host.
- [ ] 6.3 Implement WebGL spherical rendering for decoded `VideoFrame` objects with flat fallback when WebGL is unavailable.
- [ ] 6.4 Add basic panoramic video controls for play, pause, stop, current time, errors, and local yaw/pitch/FOV.
- [ ] 6.5 Ensure stop, EOF, source change, startup failure, and Webview disposal call stream cleanup and preview asset unregister.

## 7. Canvas, Agent, And Model Integration

- [ ] 7.1 Verify Canvas preview resolution consumes generated `proxy` or `fov-crop` variants and persists only stable descriptors, not runtime URLs or tokens.
- [ ] 7.2 Verify Agent panoramic rich cards consume generated thumbnail/FOV variants and delegate interactive viewing to `neko-preview`.
- [ ] 7.3 Implement or wire `neko.model.useEnvironment` to consume `EnvironmentPlacement` if the command/API boundary is missing.
- [ ] 7.4 Add tests that preview yaw/pitch are not mapped to model environment rotation unless explicitly provided as placement rotation.

## 8. Tests And Documentation

- [ ] 8.1 Add Rust tests for projection priority, manual metadata override, generated variant dimensions/MIME, HDR proxy behavior, EXR typed unsupported state, and asset unregister cleanup.
- [ ] 8.2 Add `neko-preview` extension/Webview tests for manifest consumption, metadata persistence messages, image variant handling, panoramic video stream lifecycle, and local high-frequency control boundaries.
- [ ] 8.3 Add Canvas/Agent tests proving runtime preview URLs, tokens, stream IDs, and current viewer state are not serialized.
- [ ] 8.4 Update `docs/architecture/adr-panoramic-image-preview.md` and `docs/architecture/adr-canvas-preview-boundary.md` with the completed support boundaries and remaining follow-ups.
- [ ] 8.5 Run targeted validation: `pnpm build:neko-preview`, relevant `pnpm test` filters, and `cd packages/neko-engine && cargo test` for changed Rust crates.
