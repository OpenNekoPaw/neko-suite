## Why

Canvas, Preview, Cut, Audio, Story, Assets, and Engine clients can all carry media paths, but they do not consistently agree on what an unqualified path such as `cases/1080P.mp4` means after a document is reopened or a message crosses a Webview/Extension/engine boundary. This creates failures where image display works through a Webview projection while audio/video playback sends unresolved relative or malformed root paths to `neko-client`/engine.

We need a cross-package path contract so workspace-root-relative media references remain portable in project files while every runtime boundary resolves them with the correct document/workspace context before display, probing, playback, export, or indexing.

## What Changes

- Introduce a `workspace-relative-media-paths` capability that defines canonical storage, read compatibility, runtime resolution, and multi-root workspace behavior for media-like local file references.
- Treat unqualified relative media paths as owning-workspace-root-relative for workspace-scoped documents, with legacy document-relative fallback only when needed for existing files.
- Accept `${WORKSPACE}/...` and `${PROJECT}/...` as read-compatible and boundary-safe forms, but do not require new durable project data to write those variables when a plain workspace-relative path is sufficient.
- Require Extension/host layers to resolve media paths with a document-bound context before calling `neko-client`, `neko-engine`, Webview projection, resource cache, or metadata/probe services.
- Require Webviews to consume runtime descriptors, safe URLs, media sessions, or host-resolved handles instead of constructing filesystem paths or choosing a workspace root.
- Add focused coverage across Canvas Preview, Engine file access, media import, Audio/Cut project state, and Story/Storyboard resource identity to prevent package-specific path semantics from drifting.

No breaking changes are expected. Existing absolute paths, document-relative paths, malformed slash-prefixed portable paths, and `${WORKSPACE}`/`${PROJECT}` paths remain migration/read inputs.

## Capabilities

### New Capabilities

- `workspace-relative-media-paths`: Defines the shared contract for storing, resolving, transferring, and executing workspace-relative media paths across Neko packages.

### Modified Capabilities

- `canvas-preview-capabilities`: Canvas Preview and inline playback must use the shared workspace-relative path contract for media source display and playback.
- `engine-file-access`: Engine-facing APIs must receive registered local files, source refs, or host-resolved existing local paths rather than unresolved workspace-relative or variable paths.
- `unified-media-import-dispatch`: Import planning must produce durable workspace-relative project references and keep runtime absolute paths separate from saved refs.
- `audio-project-state-contract`: Audio project save/load/playback must preserve portable paths while resolving them through the shared contract before probing or playback.
- `storyboard-resource-identity`: Storyboard and Story-to-Canvas media refs must distinguish durable source identity from preview/runtime handles and apply the shared path semantics for local media refs.

## Impact

- `packages/neko-types/src/path/` and shared content/resource contracts
- `packages/neko-client/src/EngineClient.ts`
- `packages/neko-canvas/packages/extension` and Canvas Preview media runtime protocols
- `packages/neko-preview/packages/extension` document/media preview path resolution
- `packages/neko-assets` path variable, media import, and asset registration services
- `packages/neko-cut` project load/save, media proxy, export, thumbnail, and engine file-access paths
- `packages/neko-audio` project load/save and playback/probe paths
- `packages/neko-story` storyboard/media reference transfer and preview paths
- Focused tests for reopened documents, multi-root workspaces, `${WORKSPACE}` compatibility, and engine-bound media calls
