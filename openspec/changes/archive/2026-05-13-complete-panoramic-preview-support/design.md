## Context

`neko-preview` now has the visible shell of panoramic support: custom editor contributions, explicit open commands, shared DTOs, an engine-first manifest route, and a WebGL2 still-image viewer for SDR equirectangular images. The implementation is not yet complete enough for production workflows: HDR/EXR assets are typed as unsupported, proxy/FOV/screenshot variants are passthrough descriptors, panoramic video does not render frames, and projection/default-view persistence is only an ephemeral VSCode context update.

The target architecture is already established by `panoramic-preview-engine-first` and `webview-engine-control-surface`: preview Webviews consume engine-issued manifests, token URLs, generated variants, tile descriptors, or stream descriptors; high-frequency panoramic camera state stays local to the Webview; Canvas and Agent remain lightweight consumers; `neko-model` receives environment placement through an allowed command/API boundary.

Five-layer analysis:

- Responsibilities: `neko-engine` owns media probe, decode/conversion policy, variant generation, token lifecycle, and streaming. `neko-preview` owns professional viewing UI, local camera interaction, and low-frequency semantic commands. Canvas/Agent own only thumbnails/delegation. `neko-model` owns environment placement semantics.
- Dependencies: shared DTOs remain in `@neko/shared`; `@neko/neko-client` exposes typed HTTP methods; Webviews do not import `vscode`; extensions communicate by commands, `vscode.openWith`, or minimal local interfaces.
- Interfaces: `PreviewManifest`, `PreviewVariant`, `PreviewProjectionMetadata`, `PanoramaViewState`, and `EnvironmentPlacement` are the implementation contracts. Engine internals must not leak local paths or renderer objects into Webviews.
- Extension: image proxy/variant generation and video spherical playback are separate services behind the same manifest contract, so future tile pyramids, cubemap conversion, or EXR decode can extend policy without changing consumers.
- Tests: cover Rust manifest/variant policy, projection detection, token cleanup, Webview local-state behavior, panoramic video playback lifecycle, Canvas/Agent variant consumption, and model placement command shape.

## Goals / Non-Goals

**Goals:**

- Replace variant passthrough with real engine-generated `proxy`, `thumbnail`, `fov-crop`, and `screenshot` outputs for panoramic images.
- Support SDR panoramic images through passthrough or generated proxy according to size and texture-safety policy.
- Support `.hdr` panoramic images by producing a tone-mapped SDR proxy/variant and carrying HDR metadata for the viewer.
- Keep `.exr` as a typed unsupported or capability-gated format until single-layer EXR decode is deliberately implemented.
- Implement panoramic video playback using the existing Neko H.264/PCM stream clients and a spherical WebGL presentation path.
- Persist projection overrides and default `PanoramaViewState` through sidecar or engine-backed metadata, not transient UI context.
- Keep Canvas and Agent on generated thumbnail/FOV/proxy variants and delegated open commands.

**Non-Goals:**

- Full 16K deep-zoom tile pyramid generation in this change.
- Cubemap cross/strip conversion or six-face export.
- VR/WebXR preview, stereoscopic preview, or 360 video editing/export.
- Agent spherical ROI/inpaint workflows.
- Embedding the panoramic WebGL viewer in Canvas or Agent.
- Replacing ordinary video/audio/document preview behavior outside panoramic routes.

## Decisions

### 1. Use a dedicated engine preview asset service behind the existing manifest route

The current `host-http` preview file registry can remain the HTTP boundary, but variant generation should move behind a dedicated internal service or helper layer rather than staying as ad hoc route functions. The service owns:

- source registration and policy evaluation
- metadata/sidecar read and write
- projection probing
- proxy/thumbnail/FOV/screenshot generation
- token registration for generated files
- cleanup of source and variant tokens

Rationale: the route file already mixes registry, wire types, MIME policy, probing, and variant placeholders. Pulling behavior into a service keeps HTTP thin and makes Rust tests target the domain rules directly.

Alternative considered: keep expanding `preview_file.rs`. Rejected because HDR decode, image resampling, FOV projection, and cleanup policy will make the route too coupled and hard to test.

### 2. Generate image variants as short-lived engine-managed files

`PreviewVariant` responses for `proxy`, `thumbnail`, `fov-crop`, and `screenshot` will point to generated files registered under engine tokens. The source token remains available only when policy allows passthrough. Generated files are stored in an engine preview cache under a temporary/cache location and are deleted or made unreachable when the owning asset is unregistered.

Rationale: Webviews and Canvas/Agent need opaque URLs with deterministic dimensions and MIME types. Returning the source token with requested dimensions is misleading and prevents UI tests from verifying actual crop behavior.

Alternative considered: return data URLs from engine. Rejected because large previews bloat messages, bypass Range/cache behavior, and do not match the existing token URL model.

### 3. Implement FOV/screenshot projection in CPU first, with GPU as a later optimization

For P1, engine can decode SDR or tone-mapped proxy pixels and generate perspective FOV crops using a deterministic CPU equirectangular sampler. This is sufficient for thumbnails, screenshots, and tests. GPU/WGPU compute can replace it later behind the same service interface.

Rationale: CPU projection is simpler to test, avoids Webview GPU readback, and keeps the immediate goal focused on correctness and contract completion.

Alternative considered: implement WGPU projection first. Deferred because it couples variant generation to GPU availability and increases platform risk.

### 4. Treat `.hdr` and `.exr` differently

Radiance `.hdr` is in scope for P1 as a source that produces tone-mapped SDR proxy variants. `.exr` remains a typed unsupported state unless a reliable decoder path already exists during implementation.

Rationale: HDRI skyboxes commonly arrive as `.hdr`, and tone-mapped review is enough for preview. EXR has more container complexity and should not block image/video completion.

Alternative considered: support both formats together. Rejected because it raises dependency and correctness risk without being necessary for the first complete workflow.

### 5. Build panoramic video as a sibling of the image viewer, not a fork of normal VideoPlayer

The panoramic video Webview should reuse `H264StreamClient`, `AudioStreamClient`, and `FrameScheduler`, but render decoded `VideoFrame` objects into a spherical WebGL texture path rather than a 2D canvas. Controls can be minimal at first: play/pause/stop, current time, basic errors, local drag/wheel FOV, and flat fallback.

Rationale: normal `VideoPlayer` is optimized for 2D playback and A/V sync. Panoramic video needs the same stream source but different presentation. Sharing clients avoids duplicating transport while keeping rendering responsibilities separate.

Alternative considered: use DOM `<video>` and CSS/WebGL sampling from video element. Rejected as the authoritative path because codec support in VSCode Webviews is not stable enough and does not align with Neko streaming.

### 6. Persist semantic state through sidecar metadata

Projection overrides and default view state should be written to sidecar metadata such as `<asset>.nkmeta.json` or an existing project metadata store. The manifest builder reads this state and marks confidence/source as `manual` where applicable.

Rationale: VSCode context is not persistence. Reopening an asset must restore user decisions without requiring the same editor session.

Alternative considered: store defaults only in VSCode workspace/global state. Rejected because the asset metadata should travel with project assets and remain visible to other surfaces.

### 7. Keep model placement separate from preview view state

`neko-preview` sends `EnvironmentPlacement` with explicit rotation/intensity/exposure. It may carry exposure from the current view, but it must not map preview yaw/pitch to model environment rotation unless the user explicitly sets placement rotation.

Rationale: viewer orientation answers "where am I looking"; model environment rotation answers "how is lighting/background aligned." Keeping them separate prevents accidental scene changes.

Alternative considered: use current yaw as environment rotation. Rejected because it makes browsing mutate placement semantics.

## Risks / Trade-offs

- [CPU projection may be slow for 8K inputs] → Generate proxy/downsample first, cap output dimensions, and defer full-resolution screenshots to a follow-up if needed.
- [HDR tone mapping may not match final model IBL lighting] → Label preview as tone-mapped SDR review and preserve HDR metadata/source for `neko-model`.
- [Generated preview files can leak disk/cache space] → Tie files to asset IDs, unregister variant tokens, and add best-effort cache cleanup on asset disposal and engine shutdown.
- [Panoramic video may regress normal video streaming] → Reuse stream clients through a separate viewer and keep normal `VideoPlayer` untouched.
- [Projection heuristics can hijack flat 2:1 artwork] → Only auto-route explicit metadata/trusted names; require confirmation or explicit open for heuristic-only cases.
- [Cross-extension command shape may drift] → Keep `EnvironmentPlacement` in `@neko/shared` and add command-shape tests in `neko-preview`/`neko-model`.

## Migration Plan

1. Refactor engine preview manifest code into a testable preview asset/variant policy while preserving existing HTTP endpoints.
2. Add sidecar metadata read/write for projection overrides and default view state.
3. Implement real image proxy/thumbnail/FOV/screenshot generation for SDR sources.
4. Add `.hdr` tone-mapped proxy support and typed `.exr` unsupported behavior.
5. Update `neko-preview` image viewer to consume generated variants, display typed errors, and remove ephemeral persistence.
6. Implement panoramic video Webview playback over H.264/PCM streams with local spherical controls and cleanup.
7. Verify Canvas/Agent consume real variants without storing runtime URLs or mounting spherical viewers.
8. Add or wire the `neko.model.useEnvironment` command/API boundary if missing.

Rollback: keep the panoramic configuration flags available. If a release blocker appears, disable panoramic image/video custom editors and route back to ordinary preview behavior while leaving unused engine manifest endpoints in place.

## Open Questions

- Should generated preview cache files live under OS temp, workspace `.neko/cache`, or an engine-managed cache directory?
- Is `.hdr` decode implemented best through the Rust `image` stack, FFmpeg, or a small dedicated decoder crate?
- What exact thresholds should trigger proxy generation: file size, decoded dimensions, estimated GPU texture memory, or all three?
- Should screenshots be persisted as user-visible files immediately, or first returned as short-lived preview variants with an explicit save action later?
