## Why

Binary media and asset reads are currently split across several paths: some previews use neko-engine token/range endpoints, video/audio streams pass raw file paths to engine actions, and other packages still read large binaries in the VSCode Extension Host before forwarding bytes or base64 to Webviews and engine APIs. This creates inconsistent permission boundaries, duplicated path resolution, unnecessary full-file reads, and multiple ad hoc IPC contracts for the same class of work.

This change introduces a single engine-owned file access contract so media, document, model, puppet, subtitle, and agent attachment data can be resolved, authorized, registered, and read on demand through neko-engine.

## What Changes

- Add a general engine file access capability for registering local file sources into opaque tokens with purpose, TTL, metadata, and allowed-root enforcement.
- Add range and ZIP/container entry reads under the general file access surface, reusing the existing preview file server behavior as the first implementation.
- Add client-side helpers in `@neko/neko-client` so extension packages consume file access through one typed interface instead of package-local helpers.
- Allow engine media actions to accept source references (`path` or `token`) while keeping raw `source: string` compatibility during migration.
- Move high-risk binary reads away from the Extension Host:
  - `neko-cut` subtitle range reads use engine range reads.
  - `neko-puppet` and `neko-live` load `.inp` through an engine source-load action instead of base64 through Webview.
  - `neko-model` moves toward engine-managed model source references and token-scoped asset URLs for Webview resources.
- Keep small text/config/project document reads in the Extension Host where they are part of VSCode document editing semantics.
- Add architecture tests that distinguish allowed text/config reads from disallowed media/document/model/puppet binary reads.

No breaking changes are intended. Existing `/v1/preview/file/:token`, `/v1/preview/epub/:token/*path`, and `source: string` action inputs remain compatibility aliases while consumers migrate to the new file access contract.

## Capabilities

### New Capabilities

- `engine-file-access`: Engine-owned path resolution, token registration, range/entry reading, source references, and binary-read boundary rules.

### Modified Capabilities

- `engine-preview-routing-foundation`: Preview document and panoramic metadata reads should use the general file access contract while preserving existing preview routes as compatibility aliases.
- `engine-puppet-control-and-renderer`: Puppet loading should support engine source references so `.inp` data no longer needs to be read and base64-forwarded by the Extension/Webview path.
- `engine-scene-dual-api-split`: Scene/model loading should accept source references and expose engine-managed asset URLs where Webview rendering still needs model-side resources.

## Impact

- `packages/neko-engine/packages/engine-types`: new DTOs for file sources, tokens, read ranges, file purposes, and source references.
- `packages/neko-engine/packages/host-api`: file access registry/controller and compatibility wiring from preview registry.
- `packages/neko-engine/packages/host-http`: general `/v1/files/*` routes plus aliases for existing preview routes.
- `packages/neko-client`: `EngineFileAccessClient`/`EngineClient` helpers for register/read/unregister and source references.
- `packages/neko-preview`: migrate `PreviewFileServer` to the shared file access client while keeping provider behavior.
- `packages/neko-cut`: replace Extension-side `readFileRange` with engine range reads.
- `packages/neko-puppet` and `packages/neko-live`: replace `.inp` base64 Webview transport with engine source-load.
- `packages/neko-model`: prepare model source references and token-scoped resource URLs for glTF/VRM assets.
- Tests: Rust route/registry tests, TS client/provider tests, and architecture boundary guards for binary reads.
