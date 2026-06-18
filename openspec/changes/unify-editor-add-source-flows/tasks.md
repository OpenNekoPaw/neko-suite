## 1. Shared Contract and Helper Baseline

- [x] 1.1 Extend shared message types with canonical `project:sourceRejected` and ensure `project:addSource` / `project:sourceAdded` use `ProjectSourceAddRequest` / `ProjectSourceAddResult` without package-local DTO copies.
- [x] 1.2 Add a shared Webview add-source client/hook for request id generation, timeout, result matching, cancellation, browser `File` metadata, byte create-asset conversion, and diagnostic projection.
- [x] 1.3 Add shared Extension Host add-source adapter utilities for validating requests, attaching document/source policy context, invoking project-file ingest, posting success/rejection results, and logging safe diagnostics.
- [x] 1.4 Add unit tests for shared Webview client behavior: successful result, rejected result, timeout, unrelated request id, browser `File` create-asset payload, and no durable mutation before success.
- [x] 1.5 Add unit tests for shared Extension Host adapter behavior: link source, create-asset bytes, unmanaged source rejection, runtime/blob rejection, cache/proxy/thumbnail rejection, and diagnostic payload shape.

## 2. Cut Reference Extraction

- [x] 2.1 Refactor Cut's existing `project:addSource` Webview logic to use the shared Webview add-source client without changing timeline behavior.
- [x] 2.2 Refactor Cut Extension add-source handling to use the shared host adapter while preserving `cutProjectSourceIngest` policy and command surfaces.
- [x] 2.3 Keep Cut tests proving dragged workspace media saves and reloads, browser-file create-asset works or fails diagnostically, and unmanaged external paths do not save as bare filenames.
- [x] 2.4 Add a regression test proving Cut add-source followed by save uses `ProjectFileStore` and does not rely on VS Code/Webview/cache state.

## 3. Canvas Migration and First-Add Fix

- [x] 3.1 Replace Canvas Webview native `File` drop handling that calls `URL.createObjectURL(file)` with the shared add-source client.
- [x] 3.2 Replace or internalize Canvas `resolveDroppedFiles` so VS Code URI/asset-library drops also flow through canonical `project:addSource` handling.
- [x] 3.3 Update Canvas domain add adapter to create media nodes only after `sourceAdded.ok` and a durable source ref exist, keeping runtime preview fields separate.
- [x] 3.4 Ensure Canvas save source descriptors reject runtime preview, thumbnail, proxy, blob, Webview URI, and cache paths as durable source identity.
- [x] 3.5 Add Canvas tests for first video add, second add, save, close/reopen, no absolute/runtime path persistence, and add rejection leaving canvas data unchanged.
- [x] 3.6 Add a Canvas open/load test proving opening a `.nkc` file does not call save, delete/recreate the file, or mark dirty solely from preview materialization.

## 4. Audio Migration

- [x] 4.1 Replace Audio Webview `project:dropImportAudio` drop protocol with the shared add-source client.
- [x] 4.2 Update Audio Extension handling so successful add-source results create audio tracks/elements through a domain adapter and save through `ProjectFileStore`.
- [x] 4.3 Remove or fail-close the old `project:dropImportAudio` default handler and update message unions/tests accordingly.
- [x] 4.4 Add Audio tests for URI drop, browser file create-asset or rejection, unmanaged path diagnostics, save/reopen, and no legacy handler hit in the canonical path.

## 5. Model and Puppet Migration

- [x] 5.1 Replace Model Webview `model:dropFile` byte-drop protocol with the shared add-source client.
- [x] 5.2 Update Model Extension domain adapter so successful add-source updates `.nkm` through the ProjectFileStore-backed document path and loads Engine runtime from the durable source projection.
- [x] 5.3 Remove or fail-close the old `model:dropFile` default handler and add tests proving it cannot silently mutate `.nkm`.
- [x] 5.4 Replace Puppet Webview `puppet:dropFile` byte-drop protocol with the shared add-source client.
- [x] 5.5 Update Puppet Extension domain adapter so successful add-source updates `.nkp` through the ProjectFileStore-backed document path and loads puppet runtime from the durable source projection.
- [x] 5.6 Remove or fail-close the old `puppet:dropFile` default handler and add tests proving it cannot silently mutate `.nkp`.

## 6. Sketch Migration

- [x] 6.1 Replace Sketch Webview OS-file blob import entry for durable source acquisition with the shared add-source client.
- [x] 6.2 Replace or internalize Sketch `file:dropRequest` so URI drops flow through canonical add-source handling before image/PSD conversion.
- [x] 6.3 Update Sketch domain adapter so successful add-source can run image/PSD import/conversion while keeping acquisition diagnostics shared.
- [x] 6.4 Add Sketch tests proving blob/cache/runtime handles are not persisted, image/PSD import still works from durable source, and rejected adds leave document state unchanged.

## 7. Legacy Cleanup and Guardrails

- [x] 7.1 Remove package-local add-source DTO copies, duplicate request/timeout code, and default legacy message handlers made obsolete by the shared client/adapter.
- [x] 7.2 Add static guard tests that fail on production default add-source usage of `URL.createObjectURL(file)` for durable records, `project:dropImportAudio`, `puppet:dropFile`, `model:dropFile`, `file:dropRequest`, and private Canvas source-ingest bypasses.
- [x] 7.3 Add contract tests across migrated editors proving open/load project must not call save, delete/recreate files, or set dirty solely from runtime preview setup.
- [x] 7.4 Add save-reason/log assertions where available so manual, autosave, vscode-save, import, migration, and add-source saves are distinguishable in diagnostics.
- [x] 7.5 Update docs or architecture notes only where the canonical add-source flow becomes a stable cross-editor contract.

## 8. Validation

- [x] 8.1 Run focused shared project-file/add-source tests for `@neko/shared`.
- [x] 8.2 Run focused package tests for Cut, Canvas, Audio, Model, Puppet, and Sketch add-source/save behavior.
- [x] 8.3 Run `pnpm build:neko-cut` and package-level builds/checks for migrated editors; record any unrelated existing failures.
- [x] 8.4 Run boundary checks proving Webviews do not import VSCode/Node APIs and Extension Host code does not import React.
- [x] 8.5 Use `vscode-extension-debugger` in Extension Development Host to smoke Cut, Canvas, and Audio add-source, save, close/reopen, dirty-state clearing, and editor survival after save.
- [x] 8.6 Use `vscode-extension-debugger` or focused extension smoke to verify Model/Puppet source add and Sketch image/PSD acquisition where practical.
- [x] 8.7 Run `openspec validate unify-editor-add-source-flows` and record residual risks before implementation is considered ready.
