## 1. Runtime-Media Extraction

- [x] 1.1 Add `runtime-media/src/image_analysis.rs` for GPANO and projection inference.
- [x] 1.2 Add `runtime-media/src/image_variant.rs` for thumbnails, proxy generation, and HDR detection.
- [x] 1.3 Add `runtime-media/src/sidecar.rs` for `.nkmeta.json` read/write.
- [x] 1.4 Update host-http preview asset routes to delegate CPU analysis to runtime-media.

## 2. Provider Registry

- [x] 2.1 Add `PreviewProvider`, `PreviewProviderRegistry`, `PreviewRequest`, and `PreviewArtifact` contracts.
- [x] 2.2 Add `ImagePreviewProvider` using runtime-media CPU analysis.
- [x] 2.3 Add `DocumentPreviewProvider` placeholder or implementation using runtime-media document parsing surfaces.

## 3. ActionRouter Migration

- [x] 3.1 Add `PreviewsController` with register-asset, request-variant, update-metadata, unregister, register-token, unregister-token, and generate actions.
- [x] 3.2 Register `previews` as an ActionRouter controller group.
- [x] 3.3 Migrate TS `EngineClient` preview JSON methods to `dispatch()` or `dispatch_action()`.
- [x] 3.4 Keep Range file and EPUB routes as direct HTTP transport.

## 4. Verification

- [x] 4.1 Add runtime-media tests for GPANO detection, projection inference, sidecar IO, and variant generation.
- [x] 4.2 Add parity tests for ActionRouter preview JSON commands versus previous HTTP behavior.
- [x] 4.3 Verify file and EPUB HTTP routes still serve binary content correctly.
- [x] 4.4 Run affected Rust and TS tests.
