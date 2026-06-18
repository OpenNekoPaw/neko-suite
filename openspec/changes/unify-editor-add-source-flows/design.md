## Context

`unify-nk-project-file-io` established the shared project-file store, source path policy, and host-side ingest boundary. The remaining inconsistency is above that layer: editor Webviews still decide, in different ways, how a user-added file becomes a domain object.

Current shape:

- Cut is the reference path. Webview sends `project:addSource`; Extension Host returns `project:sourceAdded`; the timeline adds clips only after it has a durable path.
- Canvas is split. VS Code URI drops go through host ingest, but native Webview `File` drops still create `blob:` object URLs and add media nodes before durable identity exists.
- Audio uses shared ingest internally, but Webview still sends private `project:dropImportAudio` instead of the generic add-source contract.
- Model and Puppet create durable assets for bytes in Extension Host, but their Webviews use private `model:dropFile` / `puppet:dropFile` messages and duplicate base64 plumbing.
- Sketch imports OS files directly as blobs/pixels in the Webview and uses `file:dropRequest` for URI drops. That is a valid domain conversion only after source acquisition is authorized and diagnosable.

This change is an L3 cross-editor contract migration. It touches shared Layer 0 DTOs/helpers, Extension Host adapters, and Layer 2 Webview hooks. It must preserve the Webview sandbox, package boundaries, project-file record/data separation, and the rule that runtime/cache handles are never durable source identity.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Shared add-source owns request/response contract, durable source resolution, diagnostics, and browser `File`/byte materialization. Each editor owns how a successful durable source becomes a clip, node, track, model, puppet, or sketch layer/document edit. ProjectFileStore remains the only durable save entry for `nk*` records. |
| Dependency | Layer 0 defines DTOs and pure helper types. Extension Host adapters own VSCode URI/file access, `ContentIngestService`, `PathResolver`, and `ProjectFileStore` integration. Webviews use a shared hook/client and never import Node, VSCode, or Extension modules. Feature packages do not directly depend on other feature packages; Cut is a pattern source, not a dependency. |
| Interface | The canonical Webview-to-Host protocol is `project:addSource` followed by `project:sourceAdded` or `project:sourceRejected`. The domain adapter interface receives `ProjectSourceAddResult` plus target metadata and returns a domain edit operation. Private legacy messages are removed as default public paths. |
| Extension | A future editor adds support by registering allowed source roles, destination policy, and a domain add adapter. It reuses request id/timeouts/diagnostics in Webview and result projection in Extension Host instead of copying drag/drop plumbing. |
| Testing | Contract tests cover DTO validation and old-path guardrails. Package tests cover each editor's add-source adapter. Save/reopen tests prove durable project facts. VS Code runtime smoke with `vscode-extension-debugger` verifies Webview messaging, dirty state, and editor survival after save. |

## Goals / Non-Goals

**Goals:**

- Make Cut's add-source flow the default cross-editor path.
- Remove default package-local add/drop/import paths that bypass shared ingest or create runtime-only project facts.
- Keep record/data separation: project files store portable refs and domain records; binary data lives in workspace/project files, asset libraries, configured roots, OSS assets, or explicit durable assets.
- Ensure a source can be previewed immediately without saving preview/blob/cache/runtime handles into project files.
- Make unmanaged local paths and byte-only inputs fail with consistent diagnostics until the user chooses a durable action.
- Prove open/load project does not call save or rewrite files.
- Prove add-source followed by save writes the editor project file and reloads correctly.

**Non-Goals:**

- Do not unify editor document schemas or domain editing APIs.
- Do not force every editor to store external files by reference. Sketch may convert sources into raster document data after canonical source acquisition.
- Do not silently import or copy arbitrary external local files.
- Do not implement a complete asset-library UI in this change.
- Do not redesign the right-side panel or timeline interactions, except for diagnostics required by add-source failure handling.

## Decisions

1. **Use `project:addSource` as the only default source acquisition protocol.**
   - Request: `ProjectSourceAddRequest` carries request id, kind, format id, document URI, optional source path/URI, browser file metadata, bytes, generated asset id, target metadata, destination policy, and ingest mode.
   - Responses:
     - `project:sourceAdded` for successful durable source acquisition.
     - `project:sourceRejected` for validation/ingest failures that should not mutate domain state.
   - Rationale: Cut already demonstrates this shape and it fits the project-file I/O base.
   - Alternative considered: keep editor-specific messages and call shared ingest behind each one. Rejected because it preserves duplicate request ids, byte handling, diagnostics, and fallback behavior.

2. **Split source acquisition from domain add/import.**
   - Source acquisition answers: "Can this input become a durable source ref?"
   - Domain add/import answers: "What should this editor do with that durable source?"
   - Examples:
     - Cut: add timeline clip(s) that reference media source.
     - Canvas: create media node(s) with `assetPath` durable ref and separate runtime preview URL.
     - Audio: create track/element(s) with durable `filePath`.
     - Model: update `.nkm` model source and load it in Engine.
     - Puppet: update `.nkp` puppet source and load bundle/assets.
     - Sketch: parse/import image/PSD into editable raster state, optionally preserving provenance, after source acquisition.
   - Rationale: This keeps add-source generic without flattening domain semantics.
   - Alternative considered: make add-source directly mutate every document shape. Rejected because it would create a cross-editor domain service with too much responsibility.

3. **Create a shared Webview add-source client.**
   - Responsibilities:
     - Generate request ids.
     - Convert browser `File` to bytes only for `create-asset` requests.
     - Attach `BrowserFileProjection`.
     - Register result listeners and timeouts.
     - Surface diagnostics and cancellation in a typed result.
     - Reuse `useFileDrop` parsing where appropriate.
   - It must not:
     - Create `URL.createObjectURL(file)` as durable add-media input.
     - Guess relative paths from `File.name`.
     - Store large inline bytes in editor state.
   - Rationale: Webview drag/drop behavior is where most duplication and first-add races currently live.

4. **Create a shared Extension Host add-source adapter.**
   - Responsibilities:
     - Validate and normalize add-source requests.
     - Attach document context and per-editor destination policy.
     - Call `handleProjectSourceAddRequest` / `ingestProjectSourceAddRequest`.
     - Return `sourceAdded` / `sourceRejected`.
     - Optionally project runtime preview access from the durable ref after success.
   - Editor-specific adapters provide:
     - format id,
     - allowed source roles/extensions,
     - destination policy,
     - workspace/source policy context,
     - domain apply operation.
   - Rationale: Shared host behavior stays narrow; editors keep schema ownership.

5. **Remove legacy default paths instead of bridging forever.**
   - Prelaunch cleanup removes old public/default Webview messages once each editor is migrated.
   - A temporary bridge is allowed only inside the same migration step and must immediately convert to the canonical request, emit a diagnostic if used, and have a removal task.
   - Guard tests must fail if migrated production Webview code still defaults to:
     - `URL.createObjectURL(file)` for add-media/source,
     - `project:dropImportAudio`,
     - `puppet:dropFile`,
     - `model:dropFile`,
     - `file:dropRequest`,
     - private `resolveDroppedFiles` as the primary Canvas ingest protocol.
   - Rationale: Legacy fallback made earlier tests pass while real VS Code sessions still used old code.

6. **Make Canvas first-add behavior deterministic.**
   - Canvas must not add a media node until `sourceAdded.ok` and a durable path exist.
   - Runtime preview URL is a projection returned/applied after durable source resolution; missing preview is a non-fatal display diagnostic, not a reason to store a blob URL.
   - Save must write `assetPath` or equivalent durable field, never `runtimeAssetPath`, thumbnail paths, or blob/Webview URIs as source identity.
   - Rationale: This targets the observed "first video add fails, second works" and save/reopen failures.

7. **Keep open/load side-effect free.**
   - Opening an editor may migrate in memory and project runtime previews, but it must not call save, delete/recreate the file, or mark dirty unless an explicit user edit or migration write action occurs.
   - Autosave baseline is established after successful load.
   - Rationale: Users observed files disappearing/reappearing and tabs stuck dirty; load/save coupling hides data loss.

8. **Treat unmanaged external files and byte-only inputs explicitly.**
   - Workspace/project files, configured `${VAR}` roots, asset-library paths, OSS refs, and allowed remotes can link.
   - Browser `File`, blob, paste screenshot, and AI/generated bytes must create a durable asset before domain add.
   - `Downloads`, `Desktop`, temp folders, and arbitrary unmanaged absolute paths are rejected until moved/configured/promoted by an explicit user action.
   - Cache/proxy/thumbnail cannot be promoted implicitly; they need a valid durable source or explicit create-asset input.
   - Rationale: This preserves Git-friendly records and OSS-backed data sync.

## Risks / Trade-offs

- [Risk] Migrating every editor at once is broad. -> Mitigation: implement shared contract first, then migrate Cut extraction, Canvas, Audio, Model/Puppet, and Sketch in focused steps with per-editor tests.
- [Risk] Removing legacy messages breaks existing Webview code during development. -> Mitigation: migrate Webview and Extension in the same task, add compile-time message union updates, and keep bridge branches only when guarded as migration-only.
- [Risk] Byte conversion in Webview can be expensive for large files. -> Mitigation: prefer host URI/sourcePath for VS Code Explorer drops; use byte create-asset only when the browser sandbox provides no durable path, and add size diagnostics if needed.
- [Risk] Sketch import semantics differ from reference-based editors. -> Mitigation: unify acquisition/diagnostics only; keep pixel/PSD conversion in Sketch's domain adapter.
- [Risk] Runtime previews may be unavailable immediately after durable add. -> Mitigation: domain add succeeds with a durable ref and a display diagnostic; preview projection can retry without dirtying project facts.
- [Risk] External unmanaged files frustrate users. -> Mitigation: diagnostics must name the reason and recovery actions: move to workspace/project, add asset-library root, configure `${VAR}`, or cancel.

## Migration Plan

1. Add shared `project:sourceRejected` message type and shared Webview add-source client around existing `ProjectSourceAddRequest` / `ProjectSourceAddResult`.
2. Extract Cut's request/result handling into shared helpers while keeping Cut behavior unchanged.
3. Add shared Extension Host adapter utilities for validating request shape, calling ingest, projecting responses, and logging diagnostics.
4. Migrate Canvas:
   - Replace native `File` object URL branch with shared add-source create-asset/link flow.
   - Convert `resolveDroppedFiles` to internal canonical handling or remove it.
   - Add media nodes only after durable source success.
   - Add tests for first video add, save, close/reopen, and no runtime path persistence.
5. Migrate Audio:
   - Replace `project:dropImportAudio` with `project:addSource`.
   - Keep audio track creation as the domain adapter.
   - Add tests for URI drop, browser file create-asset/rejection, save/reopen.
6. Migrate Model and Puppet:
   - Replace private byte-drop messages with canonical add-source create-asset/link.
   - Keep Engine load and project source update in domain adapters.
   - Add tests proving `.nkm`/`.nkp` save through ProjectFileStore only.
7. Migrate Sketch:
   - Route URI/file/blob image and PSD acquisition through canonical add-source.
   - Run Sketch import/PSD conversion from the durable source or created asset.
   - Add tests proving blob/cache/runtime refs are not persisted.
8. Remove or fail-close old default handlers and update message unions.
9. Add guard/static tests for old-path usage and direct save/add bypasses.
10. Run focused package tests, `pnpm build:neko-cut`, relevant package builds/checks, `openspec validate`, and `vscode-extension-debugger` smoke for Cut/Canvas/Audio at minimum.

Rollback strategy:

- Shared helpers can remain unused if an editor migration is reverted.
- Each editor migration should be revertible independently before old paths are removed for that editor.
- After old-path removal, rollback requires restoring the previous editor-specific message contract and must be treated as explicit legacy reintroduction with diagnostics and tests.

## Open Questions

- Should `project:sourceRejected` carry a full `ProjectSourceAddResult` with `ok: false`, or a smaller diagnostic-only payload? Default recommendation: full result for request id consistency.
- Should browser `File` create-asset have a default size limit before requiring explicit host file selection? This can be added as a policy option if runtime tests show large-file memory pressure.
- Which editors need user-facing recovery UI in this change versus logging/status diagnostics only? Canvas and Cut should surface diagnostics immediately; others can begin with existing notification/error surfaces if tests cover failure.
