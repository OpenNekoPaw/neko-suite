## 1. Implementation

- [x] 1.1 Add a shared Canvas media local-file resolver that handles resource refs, `${VAR}` paths, document-relative paths, existing absolute files, and slash-prefixed portable Canvas paths.
- [x] 1.2 Route Canvas load media projection, `media:probe`, `media:play`, `media:captureFrame`, `openMediaPreview`, and Preview variant fallback through the shared resolver.
- [x] 1.3 Ensure Preview plan enrichment attaches `previewPlayableAssetPath` for resource-projected media whenever a local file is available.
- [x] 1.4 Keep media picker/drop/import durable `assetPath` separate from runtime `webview.asWebviewUri()` display URLs.
- [x] 1.5 Normalize saved media paths through the shared existing-file resolver before contracting to portable storage.

## 2. Tests

- [x] 2.1 Add regression coverage proving `/../cases/test.mp4` is not passed directly to media playback.
- [x] 2.2 Update protocol/source tests to require shared resolver usage for Canvas and Preview playback paths.
- [x] 2.3 Run focused Canvas extension/webview tests and compile `neko-canvas` for VSCode runtime use.
- [x] 2.4 Add regression coverage for plain imports using `originalPath` as durable storage and webview URLs only as runtime paths.
- [x] 2.5 Update storage contract so new local media paths persist as owning-workspace-root-relative paths while retaining legacy read compatibility.
