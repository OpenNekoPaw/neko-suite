## Context

The repository already has the building blocks:

- `ContentAccessService` and `ContentIngestService` for intent-based read/write orchestration.
- `ResourceCacheService` for cache lifecycle, variants, manifest, projection, and GC.
- `LocalResourceAccessService` for Webview roots and `asWebviewUri(...)`.
- `PathResolver` and workspace media path helpers for `${VAR}` and workspace-relative paths.
- `EngineClient` and Engine file access for binary/media source reads, Range, probe, decode, stream, preview, proxy, and export.
- Domain packages that already assemble these pieces locally, especially Agent, Canvas, and Cut.

The problem is not missing primitives. The problem is duplicated composition and unclear ownership: some packages build their own cache roots, local resource roots, source providers, thumbnail providers, preview providers, or generated output persistence rules. The shared service must own common rules while domains provide provider/adapter behavior.

## Goals / Non-Goals

**Goals:**

- Provide a shared Host-side runtime/factory for content access and ingest composition.
- Standardize path conversion, permissions, cache lifecycle, Webview projection, Engine source registration, and diagnostics across creative domains.
- Let domains register providers/adapters for their own source semantics and derived artifacts.
- Define direct `@neko/neko-client` usage boundaries for playback, streams, GPU/media compute, probe/decode/export, and model/scene runtime.
- Define no-cache paths for pure text/project facts and final user-selected outputs.
- Reduce duplicated runtime assembly in Agent, Canvas, Cut, Preview, Assets, Audio, Model, and Sketch.

**Non-Goals:**

- Do not merge domain project formats or UI components.
- Do not hide Engine behind a generic file manager for high-frequency streams.
- Do not make `ResourceCacheService` own source identity or final user output.
- Do not introduce speculative cloud, distributed cache, or multi-tenant policy layers.

## Decisions

1. **Create a shared Host content runtime factory, not a universal domain service.**

   Add a shared factory under `@neko/shared/vscode/extension` that can create a consistent bundle: local resource access, resource cache, content access, content ingest, provider registry, and optional Engine source registration hooks. The factory accepts domain provider adapters and environment options; it does not know Canvas nodes, Cut timelines, Preview UI, Model scene semantics, Sketch layer semantics, or Agent tool names.

   Alternative considered: one global singleton service. Rejected because VS Code custom editors, Webview panels, and workspace roots have panel/session-specific Webview resolvers and lifecycle.

2. **Use provider registration for domain semantics.**

   Domains implement small providers:

   - Canvas: document/resource preview, generated asset preview, playback route preview, model node preview.
   - Preview: document page/entry providers, media preview variants, panorama projections.
   - Cut: timeline source resolution, subtitles, proxy, thumbnail, export staging.
   - Model: GLB/GLTF/VRM source and sibling texture/environment providers.
   - Sketch: PSD source, raster source, generated art, layer preview providers.
   - Assets: media library roots, thumbnail/metadata providers, asset source refs.
   - Agent: tool-facing typed runtime adapters over shared content access.

   Alternative considered: hard-code domain cases into shared content access. Rejected because it would invert dependency direction and make shared depend on feature packages.

3. **Direct Engine client usage remains valid for Engine runtime operations.**

   `ContentAccessService` resolves and authorizes source/ref/target intent. `@neko/neko-client` is used directly for stream playback, waveform, decode/probe, export/transcode, model/scene viewport, GPU rendering, and other Engine-owned operations after Extension Host has authorized and registered the source. Webview can consume Engine client/stream descriptors only after Extension authorization.

   Alternative considered: force all Engine actions through `ContentAccessService`. Rejected because stream/control APIs are not file reads and should not be hidden behind cache semantics.

4. **Cache only derived and rebuildable artifacts.**

   Source files, text facts, project files, user-selected final export paths, and official imported assets are not cache entries. Cache providers handle thumbnails, page images, preview variants, proxies, FOV crops, generated previews, OCR/ASR/metadata sidecars, and other rebuildable artifacts.

   Alternative considered: cache every opened source for uniformity. Rejected because it duplicates user data, weakens provenance, and makes cache paths look durable.

5. **Projection remains adapter-bound.**

   Shared services may produce Webview-safe URI projections, but only with an explicit Webview resolver and authorized roots. Domains cannot fall back to raw local paths when projection fails. Webview URI is runtime-only and must not enter durable project facts or cross-package payloads.

   Alternative considered: let domains call `webview.asWebviewUri` directly for convenience. Rejected because it duplicates authorization and creates inconsistent fallback behavior.

## Cross-Domain Access Matrix

| Domain | Use `ContentAccessService` for | Direct `@neko/neko-client` for | No cache/direct text for |
| --- | --- | --- | --- |
| Canvas | document images, image/model/media refs, generated assets, thumbnails, preview variants | playback workspace, media streams, model/preview streams | `.nkc` facts, node text, layout |
| Preview | document entries/page images, safe image/resource projection | video/audio/panorama playback, Range/seek, probe/decode | viewer UI state, outline text |
| Cut | timeline media refs, proxy/thumbnail variants, subtitle source refs, export source resolution | playback, frame extraction, waveform, proxy/export encoding | `.nkv` facts, editable cue records, final exports |
| Model | model source refs, sibling textures, environment images, preview variants | viewport/scene stream, GPU render, model preprocess | `.nkm` facts, transforms/material params |
| Sketch | PSD/raster refs, reference images, generated art, layer previews | future Engine-backed PSD/raster decode and GPU filters | `.nks` facts, brush/vector/layer records |
| Agent | tool attachments, documents, perception assets, generated outputs | Engine-backed provider bytes, video preprocessing, media probe | prompts, config, skill metadata |
| Assets | thumbnail and metadata providers, media library source refs | engine thumbnail/probe/extract metadata | asset/entity/library facts |

## Risks / Trade-offs

- [Risk] The shared factory becomes too broad. -> Mitigation: keep it as composition of existing small services and provider registries; domains own semantics.
- [Risk] Different Webview panels need different projection context. -> Mitigation: require per-call Webview resolver tokens or panel-scoped runtime instances.
- [Risk] Migrating all packages at once is too large. -> Mitigation: migrate incrementally with compatibility diagnostics and boundary tests per domain.
- [Risk] Direct Engine client and content access boundaries blur. -> Mitigation: document and test the rule: content access authorizes/resolves sources; Engine client performs Engine-owned stream/compute operations.
- [Risk] Existing package-local caches contain useful data. -> Mitigation: treat them as rebuildable or migrate manifests only when they encode stable source refs; never treat cache files as source facts.

## Migration Plan

1. Add shared factory/types with tests in `@neko/shared/vscode/extension`.
2. Migrate Agent runtime builder to call the shared factory while keeping Agent-specific typed methods.
3. Migrate Canvas resource cache/content access assembly to shared factory with Canvas providers.
4. Migrate Cut source/export/proxy/thumbnail access composition to shared factory.
5. Add Preview document/media provider integration and remove direct raw projection fallbacks.
6. Add Assets thumbnail/metadata provider adapters and classify existing package-local caches.
7. Add Model and Sketch provider adapters for GLB/texture/environment and PSD/raster paths.
8. Add boundary checks and docs to prevent new package-local cache/path/projection systems.

Current implementation classification:

- Preview document providers use shared content access for `engine-source` authorization before Engine token registration. Engine still owns HTTP Range and container entry reads.
- Model GLB/GLTF/VRM and environment image sources use shared content access for `engine-source` authorization before Engine registration. Scene viewport streams remain direct Engine runtime operations.
- Assets exposes ResourceRef-backed thumbnail visuals through `createThumbnailResourceRef()` / `getThumbnailVisual()`. The existing TreeView thumbnail path, media metadata cache, and lightweight filename index are classified as bounded runtime caches, not durable source identity.
- Sketch `.nks` facts and imports use project-file IO/add-source. AI result/context files are extension-private runtime cache only; shared local resource access configures the Webview root, and `SketchAIAssetRef.webviewUri/fileUri` must be cleaned after the AI run.

Rollback strategy: each domain migration should be reversible to its previous adapter wiring while keeping shared contracts. Do not rollback by reintroducing durable cache paths or raw Webview URI fallbacks.

## Open Questions

- Should the first factory cover all provider types immediately, or start with resource cache + source file + Webview projection and add provider groups per domain?
- Should media-library root resolution live entirely in shared Host runtime options or remain supplied by `neko-assets` as a root provider?
- Which existing package-local caches should be deleted, migrated to `ResourceCacheService`, or kept as bounded in-memory/runtime caches?
