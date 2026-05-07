## Context

`neko-preview` currently owns video, audio, and document preview surfaces, but panoramic images and 360 videos do not have a first-class viewer. Panoramic/HDR assets are increasingly important because AI providers can generate equirectangular skyboxes and `neko-model` can consume HDRI as IBL/environment input.

The latest architecture decisions establish two key constraints:

- `neko-preview` owns interactive panoramic viewing. `neko-canvas` and `neko-agent` remain lightweight and consume engine-generated preview assets.
- Neko preview content is engine-first. Webviews consume `PreviewManifest`, token URLs, tile templates, proxy variants, or stream descriptors. Webviews do not maintain a separate direct local-file media loading path for Neko-owned preview surfaces.

Existing infrastructure already supports part of the shape: document preview registers local paths with the engine preview file server and serves them through Range-capable token URLs. Video/audio preview already uses `PreviewService`, `H264StreamClient`, `AudioStreamClient`, and `FrameScheduler`.

Five-layer analysis:

- Responsibilities: `neko-engine` owns media I/O/probe/proxy/variant/stream lifecycle; `neko-preview` owns professional viewing UI; `neko-model` owns environment placement; Canvas/Agent own only lightweight orchestration/confirmation.
- Dependencies: cross-extension calls use commands or local minimal API interfaces; shared contracts belong in `@neko/shared` or `@neko/proto`; Webviews do not import `vscode`.
- Interfaces: `PreviewManifest`, `PreviewVariant`, `PanoramaViewState`, and `EnvironmentPlacement` are the contract surface.
- Extension: image preview lands first, video reuses the same manifest/control model, built-in preview optimization delegates into the same path rather than creating another loader.
- Tests: cover manifest policy, viewer state boundaries, stream cleanup, route registration, preview variants, and dependency boundaries.

## Goals / Non-Goals

**Goals:**

- Add `neko-preview` panoramic image preview for SDR equirectangular images and HDR/HDRI candidates.
- Add panoramic video preview using the same engine-first manifest and viewer-control model.
- Provide engine-backed manifest/proxy/range/stream contracts so Webview does not directly read local media content through `asWebviewUri`.
- Keep high-frequency `yaw/pitch/fov` interaction in the Webview while sending only low-frequency semantic requests to engine/shared contracts.
- Add Send-to-Model environment placement without confusing preview camera orientation with model environment rotation.
- After the panoramic preview path exists, optimize built-in/native preview routing so panoramic candidates open in `neko-preview` and reuse the same manifest path.

**Non-Goals:**

- Canvas or Agent embedded WebGL panoramic viewers.
- Full Deep Zoom/tile pyramid for 16K+ assets in the first implementation wave.
- VR/WebXR or headset preview.
- Spherical video editing, timeline scrubbing, or panoramic video export.
- AI spherical ROI/inpaint workflows beyond carrying enough metadata for future use.
- Replacing existing video/audio/document preview UI unrelated to panoramic preview.

## Decisions

### 1. Engine-first preview manifest is the only Neko media content entry

`neko-preview` will register a source path through a preview service and receive a `PreviewManifest`:

```text
local path
  -> registerPreviewAsset(path)
  -> engine probe + policy
  -> PreviewManifest
  -> webview loads token URL / proxy / tile / stream descriptor
```

The engine may return a passthrough Range URL for small SDR images, but Webview code does not branch into a separate direct `asWebviewUri` media loader.

Rationale: direct Webview loading cannot govern Range, tile, HDR decode, transcoding, proxy generation, cache, or lifecycle consistently. A single engine-first entry avoids maintaining two content paths.

Alternative considered: direct Webview fast path for small JPG/PNG/MP4. Rejected as a Neko-owned path because it would force every consumer to duplicate fallback, size thresholds, codec policy, and cleanup behavior.

### 2. Viewer state is split from semantic control

`PanoramaViewState` describes how a user is looking at the panorama: mode, yaw, pitch, roll, FOV, exposure, and tone mapping. Drag/wheel/inertia updates remain local to the Webview and render at frame rate.

Only low-frequency events cross the boundary:

- persist/restore default view
- request FOV crop thumbnail
- request screenshot/export
- request tile/LOD/proxy variant
- send environment placement to `neko-model`

Rationale: engine-first media does not mean engine-owned interactive camera. Sending every drag delta through Extension Host or engine would add latency and conflate display state with media truth.

Alternative considered: engine-owned panoramic camera state. Rejected for viewer interaction; reserved only for future server-side rendering or tile/variant requests.

### 3. Image preview lands before video preview

The implementation sequence is:

1. Manifest contracts and engine registration/probe.
2. Panoramic image viewer and manifest consumption.
3. HDR/proxy/tone-mapping path and Send-to-Model.
4. Panoramic video manifest and spherical video playback.
5. Built-in/native preview routing optimization.

Rationale: image preview validates projection metadata, viewer controls, and manifest loading before adding time-based playback and stream cleanup complexity.

Alternative considered: one combined image/video PR. Rejected because video adds codec, audio, and stream lifecycle risks that should not block the image viewer foundation.

### 4. Panoramic video reuses Neko streaming when reliability matters

Panoramic video viewer uses the same spherical presentation layer but obtains media frames through the engine-backed preview policy. Compatible files can be exposed as a stream/range-backed variant; incompatible or audio-sensitive files use the existing H.264 + PCM streaming stack.

Rationale: VSCode Webview native media codec support is limited. Existing `H264StreamClient`, `AudioStreamClient`, and `FrameScheduler` already provide the Neko-supported playback path.

Alternative considered: use DOM `<video>` as the primary path. Rejected for Neko-owned preview because codec/audio support is not reliable enough and would diverge from Agent/Canvas preview constraints.

### 5. Send-to-Model uses environment placement, not preview view state

`EnvironmentPlacement`/`EnvironmentSpec` carries environment rotation, intensity, exposure, and background/IBL mode. It is distinct from `PanoramaViewState`.

Rationale: preview yaw/pitch answers "what is the user looking at"; environment rotation answers "how is the HDRI aligned in the 3D scene." Mixing them would cause surprising scene mutations.

Alternative considered: reuse `PanoramaViewState.yawDeg` as `EnvironmentSpec.rotation`. Rejected because saved viewer bookmarks, screenshots, and model environment alignment have different semantics.

### 6. Built-in preview optimization delegates, not duplicates

After the dedicated panoramic image/video preview works, routing optimizations can detect `.hdr`, `.exr`, GPano metadata, `_pano/_360/_equirect` filenames, or user "Open as Panorama" commands and open `neko.preview.panoramicImage` / `neko.preview.panoramicVideo`.

Rationale: native/built-in preview should become a doorway into the same manifest-backed viewer, not a separate implementation.

Alternative considered: patch each existing preview provider independently. Rejected because it recreates the two-path problem this change is intended to remove.

## Risks / Trade-offs

- Engine manifest work is broader than a pure Webview viewer → Mitigation: start with passthrough Range URL and basic proxy variants, then add tile/HDR depth incrementally.
- Webview and engine GPU paths cannot share textures → Mitigation: engine produces files/streams/variants; Webview owns final interactive presentation.
- HDR/EXR support may slip if native decode is incomplete → Mitigation: deliver SDR/JPEG/PNG image preview first; gate HDR and EXR variants behind capability flags.
- Panoramic video may expose playback sync edge cases → Mitigation: reuse existing H.264/PCM clients and require `stopStreams()` cleanup on disposal, end, and route changes.
- Routing may hijack ordinary 2:1 flat art → Mitigation: only force route high-confidence sources; use explicit "Open as Panorama" or confirmation for heuristic cases.
- Cross-extension APIs can drift → Mitigation: put shared DTOs in `@neko/shared` and use local minimal interfaces for extension exports until contracts stabilize.

## Migration Plan

1. Add shared preview DTOs and typed client methods without changing existing preview providers.
2. Extend engine preview registration/probe to return `PreviewManifest` for image/panorama candidates while preserving existing document Range routes.
3. Add the panoramic image custom editor behind `viewer.panoramic.enabled`.
4. Add Send-to-Model environment placement and low-frequency preview variant requests.
5. Add panoramic video custom editor behind `viewer.panoramic.video`.
6. Optimize built-in/native routing after the dedicated preview path is stable.
7. Keep existing image/video/audio/document previews available as fallback during rollout.

Rollback: disable the panoramic ablation flags and route files back to existing preview behavior. Engine manifest endpoints can remain unused without affecting document/video/audio preview.

## Open Questions

- Should `PreviewManifest` live in `@neko/shared` immediately, or start in `@neko/neko-client` and move once stable?
- What file-size threshold should trigger proxy generation rather than passthrough?
- Should panoramic video get a separate viewType (`neko.preview.panoramicVideo`) or share one media preview viewType with manifest kind dispatch?
- Which HDR formats are P1: `.hdr` only, or `.hdr` plus single-layer `.exr`?
