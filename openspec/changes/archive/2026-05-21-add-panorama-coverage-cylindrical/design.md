## Context

`neko-preview` already has an engine-first panoramic preview path: the Extension Host registers media with the engine, sends a `PreviewManifest` to the Webview, and the Webview renders high-frequency yaw/pitch/FOV interactions locally. The current contract and implementation assume panoramic image content is either flat or 360 degree equirectangular. This works for GPano/360/HDRI assets, but it fails for wide stitched panoramas that cover only part of the horizon and use cylindrical projection.

The relevant architecture constraints are:

- Shared preview DTOs live in `packages/neko-types` and remain platform-neutral.
- Webview code cannot read local media files directly and must consume engine-issued manifest URLs or variants.
- Projection detection, GPano parsing, sidecar persistence, and CPU image variants belong in `runtime-media`.
- `host-api` and `EngineClient` own preview asset registration, metadata updates, and variant request transport.
- High-frequency view controls stay in the Webview; only semantic operations cross the Extension Host / engine boundary.
- Projection metadata is asset state; `PanoramaViewState` is view state and must not become the source of truth for asset projection.

Five-layer analysis:

- Responsibilities: `neko-types` defines contracts, `runtime-media` owns metadata and variant rendering, `host-api` orchestrates manifest updates, `neko-preview` owns UI and WebGL rendering.
- Dependencies: TypeScript UI and extension code depend on shared DTOs; Rust code mirrors the same JSON contracts; Webview never imports VSCode or Node APIs.
- Interfaces: metadata updates and variant requests carry explicit projection and coverage fields through narrow preview APIs.
- Extension: future fisheye/cubemap/video cylindrical support can add projection-specific sampling without changing the coverage contract.
- Testing: each layer has deterministic tests for contract round-trip, metadata inference, sidecar persistence, controller clamping, and variant output behavior.

## Goals / Non-Goals

**Goals:**

- Add `cylindrical` as a first-class panoramic image projection.
- Add validated `PanoramaCoverageAngle` metadata across manifest, sidecar, metadata update, and variant request contracts.
- Preserve existing 360 equirectangular behavior when coverage is absent.
- Parse GPano cropped-area metadata into coverage angles for partial equirectangular assets.
- Render cylindrical images with a projection-specific WebGL sampling path that avoids spherical polar distortion.
- Make FOV crop and export output match current preview even when a user has not saved the projection choice yet.
- Persist projection type, coverage angle, and default view state atomically when the user saves defaults.
- Keep cylindrical video out of the first implementation scope.

**Non-Goals:**

- Automatically classify arbitrary wide images as cylindrical panoramas.
- Add MP4 `sv3d` spherical video parsing.
- Add fisheye or cubemap rendering.
- Change `EnvironmentPlacement` semantics or treat preview yaw/pitch as model environment rotation.
- Introduce a Webview-side local file loader or bypass the preview manifest/token path.

## Decisions

### Decision 1: Store coverage as projection metadata

`PanoramaCoverageAngle` is added to `PreviewProjectionMetadata`, `UpdatePreviewAssetMetadataRequest`, `PreviewVariantRequest`, and `PreviewAssetSidecar`. It is not added to `PanoramaViewState`.

Rationale: coverage describes what the source asset contains, while view state describes how a user is looking at it. Keeping these separate preserves the existing engine-first preview contract and avoids treating a temporary camera state as asset truth.

Alternatives considered:

- Add coverage to `PanoramaViewState`: simpler Webview plumbing, but mixes asset facts with transient camera state.
- Encode partial coverage only in sidecar: persistent, but missing from manifests and variant requests.

### Decision 2: Normalize coverage at every boundary

Both TypeScript and Rust expose normalization helpers. Invalid or missing values fall back to `{ horizontalDeg: 360, verticalDeg: 180 }`; positive values clamp to `360` and `180`.

Rationale: coverage values can originate from XMP text parsing, old sidecars, Webview messages, or generated defaults. Normalizing close to every boundary prevents NaN/zero/overflow values from leaking into shader uniforms or Rust render loops.

Alternatives considered:

- Trust only Rust validation: catches engine writes, but Webview rendering can still receive bad manifest/message values.
- Reject invalid sidecars entirely: safer but brittle for user-edited metadata.

### Decision 3: Keep cylindrical detection manual-first

Automatic detection remains limited to sidecar/manual overrides, GPano, HDR/EXR, trusted filename hints, and 2:1 equirectangular heuristics. Wide aspect ratios alone do not mark an asset as cylindrical.

Rationale: wide banners, film frames, collages, and stitched non-panoramic images are common. A manual-first path avoids replacing normal image preview with a false positive. Filename hints add only pano-bearing combinations such as `halfpano`, `180pano`, and `pano180`; bare `180` is not trusted.

Alternatives considered:

- Auto-detect `ratio > 2.5` as cylindrical: convenient for the sample case, but high false-positive risk.
- Use `dc:subject` as an automatic signal: useful metadata, but too weak and inconsistent for high-confidence routing.

### Decision 4: Use projection-specific sampling, not a constrained sphere shader

The WebGL renderer gains `uCoverage` and `uMode=2` for cylindrical sampling. Equirectangular vertical UV uses spherical latitude (`asin`); cylindrical vertical UV uses perspective-plane mapping:

```
tanV = dir.y / length(dir.xz)
v = 0.5 - tanV / (2 * tan(verticalCoverage / 2))
```

Rationale: constrained equirectangular sampling still has spherical pole behavior. Cylindrical projection has no poles and needs a different vertical mapping.

Alternatives considered:

- Reuse sphere mode with `coverageAngle`: reduces shader branching, but does not remove polar distortion.
- Use `atan(tanV)` for cylindrical vertical UV: matches spherical latitude again and defeats the purpose of cylindrical projection.

### Decision 5: Keep pitch semantics consistent across modes

`pitchDeg` remains camera pitch in all panoramic modes. The renderer rotates the direction vector with `rotateX` before sampling. Cylindrical mode does not reinterpret pitch as a raw UV offset.

Rationale: one camera model keeps drag, keyboard, reset, FOV crop, and export behavior aligned across WebGL and Rust CPU variant generation.

Alternatives considered:

- Treat cylindrical vertical drag as UV translation: intuitive for flat strips, but diverges from existing `PanoramaViewState` semantics and complicates crop/export parity.

### Decision 6: Clamp partial coverage with actual horizontal FOV

`ViewStateController` uses viewport aspect to derive the actual horizontal FOV from the vertical FOV before clamping yaw. Pitch clamping continues to use vertical FOV.

Rationale: on wide canvases, visible horizontal coverage exceeds `fovDeg`. Clamping with vertical FOV alone can expose partial panorama boundaries even when the controller appears constrained.

Alternatives considered:

- Clamp with vertical FOV only: simpler but inaccurate on non-square viewports.
- Allow discard/black borders intentionally: acceptable as fallback, but not as the primary controller behavior.

### Decision 7: Persist default projection atomically

The Webview adds `panorama:updateAsset`, carrying optional `projectionType`, `coverageAngle`, and `defaultViewState` in one message. Existing `panorama:saveDefaultView` and `panorama:confirmProjection` remain as deprecated compatibility paths that call the same update API.

Rationale: saving cylindrical defaults requires three related fields. Separate messages can leave sidecar state inconsistent or race with manifest refreshes.

Alternatives considered:

- Keep two existing messages: lower protocol churn, but creates inconsistent intermediate states.

### Decision 8: Add non-persistent variant projection overrides

`PreviewVariantRequest` can carry `projectionType` and `coverageAngle` for FOV crop and export. These override manifest projection for that request only and are not written to sidecar.

Rationale: users can preview in Cylinder mode and export before saving defaults. The exported image must match current UI state without forcing a persistent decision.

Alternatives considered:

- Require Save Default before export: safer metadata, worse workflow.
- Infer projection from `viewState.mode` only: ambiguous for `flat` mode and leaves coverage unspecified.

### Decision 9: Enforce projection/mode compatibility

The legal mode matrix is explicit:

- `equirectangular`: `sphere`, `flat`, `little-planet`
- `cylindrical`: `cylindrical`, `flat`
- `flat`: `flat`
- `cubemap`, `fisheye`, `unknown`: current fallback `flat`

Rationale: `ProjectionType` is asset truth and `PanoramaViewMode` is presentation state. Persisting invalid combinations such as `cylindrical + little-planet` creates ambiguous render/export behavior.

Alternatives considered:

- Let UI hide invalid tabs only: avoids most user paths, but does not protect sidecar edits, tests, or direct API requests.

## Risks / Trade-offs

- [Risk] WebGL preview and Rust FOV crop drift mathematically. -> Mitigation: define identical formulas in the design and add paired tests for equirectangular and cylindrical sampling.
- [Risk] Wide images remain undiscovered until users choose "Open as Panorama". -> Mitigation: keep explicit open available and add non-invasive filename hints; leave wide-aspect prompts as a future enhancement.
- [Risk] Coverage inferred from aspect ratio may be approximate. -> Mitigation: treat manual sidecar values as authoritative and allow users to persist corrected coverage.
- [Risk] More fields in preview requests increase contract surface. -> Mitigation: keep fields optional, default to manifest projection, and add round-trip compatibility tests.
- [Risk] Aspect-aware clamping depends on current viewport size. -> Mitigation: default aspect to `1` when unknown and re-normalize state when canvas dimensions change.
- [Risk] Old sidecars can contain invalid mode/projection combinations. -> Mitigation: normalize mode against projection before writing sidecars, building manifests, and rendering variants.

## Migration Plan

1. Add shared TypeScript and Rust contract fields with defaults and compatibility tests.
2. Extend sidecar read/write to carry normalized `coverageAngle` while preserving old sidecars.
3. Extend host-api metadata update and variant request paths to transport coverage/projection overrides.
4. Extend GPano parsing and trusted filename matching.
5. Add Webview coverage-aware controller logic and renderer uniforms.
6. Add cylindrical WebGL and Rust FOV crop sampling branches.
7. Add `panorama:updateAsset` and keep deprecated message compatibility.
8. Update UI mode availability and metadata display.
9. Validate with unit tests and the `shanghai-morning.jpg` manual workflow.

Rollback strategy:

- New manifest, sidecar, metadata, and variant fields are optional.
- Existing assets without `coverageAngle` continue to behave as 360x180 equirectangular or flat assets.
- If cylindrical rendering must be disabled, UI can hide the Cylinder mode while preserving sidecar compatibility.

## Open Questions

- Should the UI expose editable numeric coverage controls in the first implementation, or use inferred defaults plus sidecar persistence only?
- Should wide-aspect images receive a low-confidence status bar hint after explicit open telemetry shows low false-positive risk?
