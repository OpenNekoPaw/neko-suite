## Why

Generated image `thumbnail` and `preview` requests currently copy the durable source file into ResourceCache without resizing or transcoding it. This consumes duplicate disk space while weakening the contract that cache entries are rebuildable derivatives with a concrete interaction benefit.

## What Changes

- Require cached image thumbnails to be real bounded-size derivatives rather than byte-for-byte source copies.
- Distinguish full-image source projection from derived `thumbnail` and `preview` variants.
- Route generated image derivative requests through an injected image variant generator owned by the Host/media boundary.
- Fail visibly when a generated image derivative is requested without a generator or when generation produces no artifact.
- Preserve document page extraction and video frame/proxy caching; this change does not disable derivative caching for container or temporal media.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `resource-cache-derived-variants`: Define that cached image thumbnail and preview variants must be materially derived for their requested role and that untransformed image sources remain outside ResourceCache.

## Impact

- Shared ResourceCache provider contracts and implementation in `packages/neko-types`.
- Generated image content-access runtime assembly in Agent Extension and TUI hosts.
- Provider and integration tests proving that source-copy fallback cannot return success.
- Cache artifacts remain rebuildable; no project format, generated source, AssetLibrary record, Engine protocol, or user data migration is required.
