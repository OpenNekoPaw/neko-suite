## Why

Cut already proves the safer pattern for adding media: Webview sends an add-source intent, Extension Host resolves the durable file identity, and only then does the editor write project facts. Other editors still keep private drag/drop/import branches, including runtime blob URLs and byte-only shortcuts, so added files can appear in the Webview but fail to persist, reload, or save through the unified project-file path.

This change migrates editor add-media/add-source flows to one Cut-style contract and removes the old default paths so `.nkv`, `.nkc`, `.nka`, `.nkm`, `.nkp`, and `.nks` do not keep parallel save/add facts.

## What Changes

- Introduce a shared editor add-source flow that every participating editor uses by default:
  - Webview emits `project:addSource` with a typed `ProjectSourceAddRequest`.
  - Extension Host resolves link/create-asset through `project-file-io` ingest and path policy.
  - Extension Host replies with `project:sourceAdded` or `project:sourceRejected`.
  - The owning editor applies a domain add operation only after a durable source ref is returned.
- Add a shared Webview add-source client/hook for request ids, timeout, browser `File` byte conversion, result matching, diagnostics, and cancellation.
- Add a shared Extension Host add-source handler/adapter shape so Canvas, Audio, Model, Puppet, Sketch, and Cut can reuse message validation and result projection while keeping domain-specific document edits local.
- **BREAKING** Remove package-local default add/drop/import message paths that bypass the canonical add-source flow:
  - Canvas native `File` branch that creates `blob:` media with `URL.createObjectURL`.
  - Audio `project:dropImportAudio` as the primary drop protocol.
  - Puppet `puppet:dropFile` byte-drop as the primary protocol.
  - Model `model:dropFile` byte-drop as the primary protocol.
  - Sketch `file:dropRequest` / Webview blob import as the durable project-add protocol.
  - Canvas `resolveDroppedFiles` as an editor-private ingest protocol, unless retained only as an internal bridge that immediately normalizes to `project:addSource`.
- Keep domain semantics separate:
  - Cut/Canvas/Audio persist durable references to media/audio/image/video files.
  - Model/Puppet persist durable references to model or puppet source packages/assets.
  - Sketch may still convert images/PSD into editable raster document data, but the source acquisition and diagnostics must go through the shared add-source flow before conversion.
- Add migration/guard tests proving old paths are not hit by default and cannot mask a broken canonical path.
- Add VS Code Webview runtime smoke coverage with `vscode-extension-debugger` for add, save, close, reopen, and reload behavior.

Non-goals:

- Do not merge editor document schemas or timeline/canvas/audio/model/sketch domain operations into one generic editor model.
- Do not make Webviews access Node, VSCode APIs, or local files directly.
- Do not silently copy unmanaged `Downloads`, `Desktop`, or temp files into projects.
- Do not treat cache/proxy/thumbnail/blob/Webview URI/runtime Engine handles as durable project identity.
- Do not redesign editor panels beyond the add-source diagnostics needed for this migration.

## Capabilities

### New Capabilities

- `editor-add-source-flows`: Defines the canonical cross-editor add/link/create-asset message flow, domain adapter responsibilities, legacy path cleanup, diagnostics, save/reopen expectations, and runtime validation for editor-added sources.

### Modified Capabilities

- None.

## Impact

- Shared contracts and helpers:
  - `packages/neko-types/src/project-file-io/ingest.ts`
  - `packages/neko-types/src/types/message.ts`
  - `packages/neko-types/src/components/useFileDrop.ts`
  - New shared Webview add-source client/hook and Extension Host adapter utilities in `@neko/shared`.
- Editor migrations:
  - `packages/neko-cut`: keep the existing canonical flow as the reference and extract shared pieces.
  - `packages/neko-canvas`: replace native blob drop and private dropped-file ingest with canonical add-source result handling before adding media nodes.
  - `packages/neko-audio`: replace drop/import audio protocol with canonical add-source plus audio-track domain add.
  - `packages/neko-model`: replace private model byte-drop with canonical create-asset/link before updating `.nkm`.
  - `packages/neko-puppet`: replace private puppet byte-drop with canonical create-asset/link before updating `.nkp`.
  - `packages/neko-sketch`: route URI/file/blob acquisition through canonical add-source before image/PSD raster import or durable source references.
- Compatibility:
  - Prelaunch cleanup intentionally removes old default Webview messages and package-local fallback branches where they bypass the project-file store or ingest policy.
  - Valuable existing project files are not deleted; unsupported legacy runtime/cache/blob references fail closed with diagnostics and relink/create-asset recovery.
- Success criteria:
  - Adding a workspace/project/asset-library media file in Cut, Canvas, and Audio saves a portable source ref, clears dirty state after save, and reloads after closing/reopening VS Code.
  - Adding Model/Puppet source files updates `.nkm`/`.nkp` through durable refs and reloads without direct engine-save or private byte-drop paths.
  - Sketch imports an image/PSD through the same source acquisition contract before domain conversion, and does not persist blob/cache/runtime source identity.
  - Loading/opening a project never triggers save, delete/add rewrite, or dirty-state churn.
  - Static and contract tests fail if a migrated editor reintroduces default `URL.createObjectURL(file)` add-media, `project:dropImportAudio`, `puppet:dropFile`, `model:dropFile`, `file:dropRequest`, or other private source-ingest bypasses.
