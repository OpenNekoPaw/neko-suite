## Context

`GeneratedAssetDerivativeResourceCacheProvider` currently resolves a durable generated image and copies it into `.neko/.cache/resources/generated` for both `thumbnail` and `preview`. The provider labels the copy rebuildable but performs no transformation. Agent `ReadImage` also reaches this provider because `agent-context` is preview-like and generated lifecycle refs may be pathless until the Host resolves their generated-output index record.

The shared cache layer cannot depend on Sharp or a feature package. Extension and TUI hosts already own generated-output resolution and authorized file access, while Extension already owns a Sharp-backed image processor.

## Goals / Non-Goals

**Goals:**

- Keep durable generated image sources outside ResourceCache.
- Serve untransformed full-image `preview` and Agent byte access from the resolved source without copying it.
- Cache only a materially transformed generated image `thumbnail` with bounded dimensions.
- Fail visibly when thumbnail generation is requested without a host image generator.
- Preserve document entry/page caching and temporal-media thumbnail/proxy behavior.

**Non-Goals:**

- Redesign all preview roles or migrate project formats.
- Add a second cache manager, image asset store, or feature-package image pipeline.
- Change video frame extraction, document rendering, AssetLibrary membership, or generated source persistence.
- Add Sharp to `@neko/shared` or require it in the TUI solely for source reads.

## Decisions

### 1. Generated source access and derivative access use separate providers

A generated-source content provider will resolve a `generated-asset` ResourceRef through the Host-owned generated index and return authorized source bytes, local paths, or Webview projections for untransformed `preview`/`agent-context` requests. The ResourceCache generated provider will stop supporting `preview` and will support only `thumbnail`.

This keeps the source path canonical and prevents the cache provider from masquerading a source copy as a derivative. Provider ordering will place generated-source access before generic ResourceCache access for eligible source requests.

Alternative rejected: keep `preview` in ResourceCache and special-case identical paths. That preserves duplicate semantics and makes cache behavior depend on file size or incidental path equality.

### 2. Image transformation is an injected Host port

The generated thumbnail provider will require an `ImageResourceVariantGenerator` that accepts a source path and bounded thumbnail request and returns transformed bytes plus metadata. ResourceCache owns the final cache path and writes the returned bytes atomically through its file operations.

Extension will adapt its existing Sharp dependency. TUI source reads will use generated-source access and will not register a thumbnail provider until it has a real media generator.

Alternative rejected: import Sharp from `@neko/shared`. Native image processing is a Host/media implementation concern and would burden every shared-package consumer.

Alternative rejected: reuse `copyFile` when a generator is absent. Missing transformation capability is an unsupported contract, not a successful thumbnail.

### 3. Thumbnail parameters are part of the generated artifact contract

Generated thumbnails require at least one positive width or height and use `fit: inside` without enlargement. The host generator returns the actual MIME type and dimensions. A request without bounds or a generator result that is not smaller/materially transformed fails visibly and is not recorded as `ready`.

Full-size image display remains a source projection. A future bounded high-quality preview may be added as another explicit generator role; this change does not keep the ambiguous source-copy preview path.

### 4. Existing duplicate cache files are rebuildable and need no migration

Existing `.neko/.cache/resources/generated` files remain disposable cache artifacts. Startup quota GC or manual cache deletion removes them. No generated source, project fact, or user asset is changed.

## Risks / Trade-offs

- [Risk] A caller that incorrectly requests generated `thumbnail` without dimensions will now receive an unsupported diagnostic. -> Tests and callers will use explicit bounded dimensions; fail-visible behavior prevents a hidden full-size fallback.
- [Risk] Provider routing changes can break TUI `ReadImage` for pathless generated refs. -> Add path-level Extension and TUI tests proving the generated index resolver and source bytes path are used while cache copy is poisoned.
- [Risk] Sharp output introduces format/metadata differences. -> Use a deterministic JPEG/WebP policy and assert actual dimensions, MIME type, and non-identical bytes in focused tests.
- [Risk] Existing cache metadata may point to old source copies. -> Fingerprint/provider-version invalidation and cache deletion rebuild variants; old entries are not durable identity.

## Migration Plan

1. Add tests that reject source-copy thumbnail/preview success.
2. Add generated-source content access and route untransformed reads through it.
3. Narrow the generated cache provider to bounded thumbnails and inject the Extension image generator.
4. Update callers/tests and architecture documentation.
5. Clear or allow normal GC to remove existing duplicate cache artifacts; rollback restores provider code without touching source files.

## Open Questions

None for this change. A later media-wide change may standardize JPEG versus WebP thumbnail policy and multi-resolution thumbnail tiers.
