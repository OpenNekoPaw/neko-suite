## Context

`engine-kernel` has already been reduced from the original monolithic engine into a service orchestration crate plus focused infrastructure/runtime crates. The remaining oversized areas are not GPU hot-path code; they are domain helpers that predate the split:

- `media_service/` duplicates and extends `runtime-media` CPU-only probe, diff, subtitle, and JPEG utilities.
- `jvi/` owns project parsing DTOs required by timeline diff, which blocks moving timeline diff out of kernel.
- `generators/text_mesh.rs` is scene authoring logic but currently lives in kernel.
- top-level `animation/`, `gpu/`, `decoder/`, and `audio/` modules are compatibility shells or near-empty wrappers.

The architectural target is for `engine-kernel` to remain the orchestration layer: service factory, facade, contracts, services, preview/export orchestration, and telemetry. CPU media tools and scene authoring generators should live below kernel.

## Goals / Non-Goals

**Goals:**

- Move CPU-only media helpers and JVI project parsing into `runtime-media`.
- Move text mesh generation into `runtime-scene`.
- Preserve existing host-facing imports through `neko_engine_kernel::contracts` during migration.
- Remove empty top-level kernel helper shells after call sites move.
- Add architecture tests that prevent helper implementation modules from reappearing in kernel.

**Non-Goals:**

- Do not split `domain/` timeline editing logic in this change.
- Do not merge `engine-export-renderer` into `engine-gpu`.
- Do not remove `host-http`'s direct `runtime-scene` dependency.
- Do not change external REST/WebSocket payload shapes.
- Do not introduce GPU readback or change zero-copy media paths.

## Decisions

### Move media toolbox as a runtime-media API, not a kernel submodule

`runtime-media` already owns CPU-only `audio_diff`, `video_diff`, `image_diff`, `probe`, `subtitle`, `jpeg_encoder`, sidecars, and image variants. The remaining kernel `media_service` helpers should be merged into that crate so callers import from `neko_runtime_media` directly or via kernel compatibility contracts.

Alternative considered: create `engine-media-tools`. Rejected because it would duplicate the purpose of `runtime-media` and add another small crate without solving ownership.

### Move JVI with timeline diff into runtime-media

`timeline_diff.rs` depends on JVI project DTOs (`ProjectData`, `JviTrack`, `JviElement`). Moving only `timeline_diff` would create a new upward or lateral dependency back into kernel. Therefore the JVI parser and DTOs move with the media toolbox.

Alternative considered: move JVI DTOs into `engine-types`. Rejected for now because JVI is file-format parsing, not a cross-engine core DTO used by many crates.

### Keep kernel contract compatibility as re-export only

`host-api` controllers already import media helpers through `neko_engine_kernel::contracts::media`. To avoid a broad host churn, that compatibility path should remain but re-export `neko_runtime_media` symbols instead of kernel implementation modules. Architecture tests should forbid `engine-kernel/src/media_service` after migration.

Alternative considered: update all host callers to `neko_runtime_media` immediately. Rejected because it increases blast radius and weakens the existing facade/contracts migration path.

### Move text mesh into runtime-scene with the same service surface

`create_text_mesh()` remains on `ISceneService`, but the implementation calls `neko_runtime_scene::text_mesh`. Text mesh generation returns `ProceduralMesh`, uses scene procedural mesh types, and is part of scene authoring rather than kernel orchestration.

Alternative considered: move text mesh into `engine-types`. Rejected because it contains algorithmic mesh generation and font shaping behavior, not pure DTOs.

### Remove empty shells after call-site migration

Top-level kernel shells (`animation`, `gpu`, `decoder`, `audio`) should be removed when no module imports them. If a compatibility path is still required, it should be explicit in `contracts.rs` or `services/mod.rs`, not a misleading top-level implementation module.

## Risks / Trade-offs

- **Risk: runtime-media pulls in extra dependencies** → Mitigation: only move CPU-only helpers already using FFmpeg/image/serde dependencies that runtime-media already owns or reasonably should own; keep GPU/codec hot paths outside runtime-media.
- **Risk: host import churn breaks callers** → Mitigation: keep `neko_engine_kernel::contracts::media` re-exports and update architecture tests before removing kernel implementation modules.
- **Risk: timeline diff and JVI migration creates circular dependency** → Mitigation: move JVI parser and timeline diff together into runtime-media; do not depend on kernel domain types from runtime-media.
- **Risk: text mesh migration changes serialized payloads** → Mitigation: preserve `TextMeshParams` serde shape and keep `SceneService::create_text_mesh()` response semantics unchanged.
- **Risk: removing shells breaks downstream imports** → Mitigation: search all workspace imports and provide explicit compatibility re-exports only where host-facing contracts require them.

## Migration Plan

1. Move `text_mesh` implementation to `runtime-scene`, update `SceneService`, and add runtime-scene tests.
2. Move JVI and timeline diff into `runtime-media`; update runtime-media exports.
3. Replace kernel media contracts with `neko_runtime_media` re-exports.
4. Update service implementations and host controllers to use the compatibility contract or runtime crate path.
5. Remove now-empty kernel modules and add architecture tests for forbidden helper directories.
6. Run focused crate checks plus `openspec validate shrink-engine-kernel-domain-helpers --strict`.
