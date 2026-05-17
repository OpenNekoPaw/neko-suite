## 1. Engine File Access Foundation

- [x] 1.1 Add file access DTOs to `engine-types` for file sources, source references, file purposes, registered files, ranges, entry paths, and file access errors.
- [x] 1.2 Introduce `FileAccessRegistry` in `host-api` with token registration, canonical path lookup, allowed-root validation, MIME/size metadata, and explicit unregister.
- [x] 1.3 Rework `PreviewFileRegistry` to delegate to or wrap `FileAccessRegistry` so existing preview routes use the same token store.
- [x] 1.4 Add Rust tests for registration, allowed-root rejection, symlink/path traversal rejection, lookup, unregister, and compatibility with existing preview registry behavior.

## 2. Engine Routes And Actions

- [x] 2.1 Add `files` ActionRouter controller actions for register, unregister, stat, and resolve where they do not transfer binary response bodies through ActionRouter.
- [x] 2.2 Add HTTP routes for `/v1/files/:token` with Range support and `/v1/files/:token/entries/*path` for ZIP/container entry reads.
- [x] 2.3 Keep `/v1/preview/register`, `/v1/preview/file/:token`, `/v1/preview/epub/:token/*path`, and `previews:*token` behavior as aliases backed by the shared registry.
- [x] 2.4 Add host-http tests proving preview compatibility routes and general files routes return equivalent bytes, headers, and errors.

## 3. Client-Side Shared File Access

- [x] 3.1 Add `EngineFileAccessClient` or equivalent `EngineClient` helpers in `@neko/neko-client` for register, unregister, read range, read entry, and scoped `withRegisteredFile`.
- [x] 3.2 Update `neko-preview` `PreviewFileServer` to use the shared client helper internally while preserving the existing provider-facing methods.
- [x] 3.3 Add TS tests for scoped cleanup on success and failure, range reads, entry reads, stale port retry behavior, and compatibility with current preview provider tests.

## 4. Package Migrations

- [x] 4.1 Migrate `neko-cut` subtitle `readFileRange` handling from Extension Host `fs.open` to engine file access range reads.
- [x] 4.2 Add `puppets:load_source` / client helper support for loading `.inp` from source references inside engine.
- [x] 4.3 Migrate `neko-puppet` editor loading to send source metadata and call engine source-load instead of base64 puppet binary data through Webview.
- [x] 4.4 Migrate `neko-live` puppet loading to use engine source-load instead of `fs.readFileSync` and byte forwarding.
- [x] 4.5 Add `sourceRef` compatibility to video/audio capture, waveform, and stream entry points while keeping existing `source` string inputs.
- [x] 4.6 Add `sourceRef` support to scene/model load and keep legacy path loading compatible.
- [x] 4.7 Prepare `neko-model` Webview loading for engine-managed resource URLs or manifests for external glTF/VRM resources.

## 5. Boundaries, Documentation, And Cleanup

- [x] 5.1 Add architecture tests that ban Extension-side binary source reads for media/document/model/puppet/subtitle paths outside an explicit allowlist.
- [x] 5.2 Document allowed Extension reads: project JSON CustomDocuments, workspace settings, preferences, sidecar text, lyrics, tests, and generated export writes.
- [x] 5.3 Remove or deprecate package-local binary file read helpers that are replaced by engine file access.
- [x] 5.4 Update architecture docs to show the unified file access flow, source references, compatibility aliases, and migration rules.
- [x] 5.5 Run targeted TS/Rust verification for `neko-engine`, `neko-client`, `neko-preview`, `neko-cut`, `neko-puppet`, `neko-live`, and `neko-model`.
