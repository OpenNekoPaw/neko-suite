## Why

The existing panoramic preview architecture is contract-complete but implementation-incomplete: SDR images can open through a manifest-backed WebGL viewer, while HDR/EXR sources are marked unsupported, preview variants are passthrough descriptors, and panoramic video does not yet render streamed frames as a spherical view.

Completing this path unlocks reliable review of AI-generated skyboxes, HDRI asset inspection, Canvas/Agent thumbnail consumption, and `neko-preview` to `neko-model` environment handoff without adding direct local-media loaders or WebGL viewers to unrelated surfaces.

## What Changes

- Complete engine-backed panoramic image support for SDR passthrough, large-image proxy generation, HDR `.hdr` tone-mapped proxy output, and typed `.exr` graceful degradation.
- Generate real `PreviewVariant` outputs for `proxy`, `thumbnail`, `fov-crop`, and `screenshot` instead of returning source-file passthrough descriptors.
- Extend projection probing so GPano/XMP metadata, trusted filename hints, explicit user overrides, and 2:1 heuristics produce consistent manifest metadata.
- Replace the panoramic video placeholder Webview with a playable spherical video viewer that reuses the Neko H.264/PCM stream path and keeps `yaw/pitch/fov` local.
- Preserve the engine-first media boundary: Webviews consume manifest token URLs, generated variants, tile descriptors, or stream descriptors only.
- Persist low-frequency projection/default-view decisions through metadata or sidecar state rather than ephemeral VSCode context.
- Keep Canvas and Agent lightweight by consuming generated preview variants and delegating interactive viewing to `neko-preview`.
- Add lifecycle cleanup and regression tests for preview tokens, generated variants, video streams, and cross-extension model placement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `panoramic-preview-engine-first`: Complete the existing panoramic image/video preview contract with real proxy/variant generation, HDR proxy handling, persisted view state, and spherical video playback.
- `webview-engine-control-surface`: Tighten the Webview/Extension/Engine boundary for panoramic video frames, generated preview resources, low-frequency semantic controls, and cleanup ownership.

## Impact

- Affected packages:
  - `packages/neko-preview`: panoramic image viewer refinement, new panoramic video player, provider lifecycle cleanup, i18n strings, Send-to-Model behavior.
  - `packages/neko-engine`: preview manifest policy, projection probing, proxy/variant generation, HDR `.hdr` decode or conversion, stream descriptors, file-token cleanup.
  - `packages/neko-client`: typed client coverage for preview manifest and variant APIs if gaps remain.
  - `packages/neko-types`: shared DTO refinements for projection confidence, variant roles, HDR/proxy metadata, and view-state persistence.
  - `packages/neko-canvas` and `packages/neko-agent`: consume generated preview variants without embedding panoramic viewers.
  - `packages/neko-model`: consume `EnvironmentPlacement` through the command/API boundary if not already implemented.
- Affected architecture documents:
  - `docs/architecture/adr-panoramic-image-preview.md`
  - `docs/architecture/adr-canvas-preview-boundary.md`
- Validation scope:
  - `pnpm build:neko-preview`
  - targeted `pnpm test` for `neko-preview`, `neko-client`, `neko-types`, Canvas/Agent preview routing
  - Rust preview-file and media tests under `packages/neko-engine`
  - broader `pnpm check` / `pnpm build` as integration risk requires
