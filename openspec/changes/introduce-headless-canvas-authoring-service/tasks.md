## 1. Contracts And Planner Foundations

- [x] 1.1 Add shared headless Canvas authoring DTOs for target resolution, operation batches, diagnostics, created node results, reveal policy, and document URI output.
- [x] 1.2 Add or refine shared Canvas operation planners for node creation, composite creation, connections, basic block updates, and storyboard scene/shot creation without importing VSCode, DOM, React, or `neko-canvas` internals.
- [x] 1.3 Add stable ID, layout, and scene/shot composite planning helpers that produce deterministic `CanvasData` mutations for `scene.basic` and `shot.basic` nodes.
- [x] 1.4 Add durable resource identity guards for Canvas authoring data that reject Webview URI, blob URL, temp path, cache path, Engine token, preview URL, stream id, and legacy `cachePath` values before save.
- [x] 1.5 Add shared planner tests covering composite creation, storyboard scene/shot planning, stable resource refs, runtime-handle rejection, and invalid node/preset diagnostics.

## 2. Extension Host Authoring Service

- [x] 2.1 Implement `CanvasProjectAuthoringService` in `neko-canvas` extension using `ProjectFileStore`, the `.nkc` codec, Canvas source policy, and host file adapter.
- [x] 2.2 Implement target resolution for explicit `documentUri`, active selected Canvas document, and new `.nkc` creation when no target exists.
- [x] 2.3 Implement `reveal` handling so Webview opening/focusing happens only after successful writes and only when explicitly requested.
- [x] 2.4 Implement headless `applyOperations`, `createComposite`, and `createStoryboardFromMarkdown` service methods with typed diagnostics and target document URI in results.
- [x] 2.5 Implement project-file save/reopen validation so headless-created Canvas facts persist without VS Code editor state, Webview state, cache files, or runtime handles.

## 3. Canvas API And Agent Routing

- [x] 3.1 Route `NekoCanvasAPI.nodes.create`, `createComposite`, `createConnection`, `updateBlock`, and production `applyAgentContent` document-authoring calls through `CanvasProjectAuthoringService` when they do not require interactive editor state.
- [x] 3.2 Route `canvas.createStoryboardFromMarkdown(mode=create-nodes)` through the headless authoring service and keep lifecycle approval enforcement.
- [x] 3.3 Keep `canvas.ingestMarkdown` review-first and prevent it from reporting production scene/shot creation success.
- [x] 3.4 Update Agent capability descriptions and tool execution wiring so production Send to Canvas uses headless target resolution and optional reveal instead of opening a Canvas editor as a prerequisite.
- [x] 3.5 Update storyboard import flow to create or mutate `.nkc` through the authoring service and report created document URI plus scene/shot node IDs.
- [x] 3.6 Route `neko.canvas.importAsset`, `NekoCanvasAPI.importAsset()`, and UI-originated generated asset drops through `CanvasProjectAuthoringService` as media node authoring.

## 4. Webview Synchronization

- [x] 4.1 Add typed Extension-to-Webview message(s) for host-applied Canvas operation batches, document revision updates, or document reload requests.
- [x] 4.2 Update Canvas Webview store handling so an already-open Webview reflects host-side headless writes.
- [x] 4.3 Preserve interactive editor behavior for selection, keyboard, viewport, drag/drop, and inspector actions that explicitly require Webview state.
- [x] 4.4 Add Webview/extension contract tests for open-document synchronization after a headless mutation.

## 5. Legacy Path Cleanup

- [x] 5.1 Remove or fail-close `ensureCanvasEditorForStoryboardImport`, `ensureCanvasEditorForAssetImport`, and `ensureCanvasEditorForMarkdownMutation` as production write prerequisites; keep only explicit reveal helpers if still needed.
- [x] 5.2 Stop using `CanvasEditorProvider.createNode/createComposite/updateBlock/applyAgentContent` as the default executor for production Agent/headless writes.
- [x] 5.3 Classify remaining Canvas commands as `document-authoring` or `interactive-editor` and make interactive-only commands return fail-visible diagnostics when invoked without required Webview state.
- [x] 5.4 Remove compatibility fallback code that silently downgrades blocked production storyboard creation to review table creation.
- [x] 5.5 Remove the Webview-only `importGeneratedAsset` / `postImportAsset` compatibility path so asset imports cannot create persisted nodes inside Webview state.

## 6. Tests And Validation

- [x] 6.1 Add extension unit tests for target resolution: explicit document, active selected Canvas, no target creates new `.nkc`, and no arbitrary background editor mutation.
- [x] 6.2 Add headless creation tests that run with no active Webview and assert `.nkc` nodes/connections/storyboard data are saved and reopenable.
- [x] 6.3 Add poisoned legacy path tests where Webview executor methods throw and `canvas.createStoryboardFromMarkdown(mode=create-nodes)` still succeeds through the headless service.
- [x] 6.4 Add tests proving `reveal=false` does not call `vscode.openWith` and `reveal=true` opens/focuses only after successful file write.
- [x] 6.5 Add resource identity tests proving Webview URI, blob URL, cache path, temp path, Engine token, preview URL, stream id, and legacy `cachePath` are rejected before `.nkc` persistence.
- [x] 6.6 Update existing Canvas markdown/storyboard tests to assert production creation hits the headless authoring service and review ingestion remains review-only.
- [x] 6.7 Run targeted validation: shared planner tests, Canvas extension tests, Canvas compile, and any affected agent capability tests.
- [ ] 6.8 Run a real VS Code Webview functional scenario for reveal/synchronization behavior and record a blocking condition plus residual risk if the scenario is unavailable.
- [x] 6.9 Add headless media import tests for workspace path normalization, pure document resource refs, and legacy Webview import path absence.

## 7. Documentation And Cleanup

- [x] 7.1 Update Canvas domain or package documentation to state that Webview is an interactive projection and `CanvasProjectAuthoringService` is the production `.nkc` write path.
- [x] 7.2 Update Agent/Canvas authoring docs or skill text so Send to Canvas uses production headless creation for storyboard nodes and does not treat review table ingestion as delivery success.
- [x] 7.3 Run legacy-debt or static guard checks for removed `createStoryboardDraftFromMarkdown`, production `ensureCanvasEditorFor*Mutation`, and Webview URI/cache path persistence patterns.

## Validation Notes

- 5.1: `ensureCanvasEditorForAssetImport` has been removed. Asset import may still be triggered by UI or cross-extension commands, but any `.nkc` media node write now goes through `CanvasProjectAuthoringService`.
- 6.8: CDP preflight confirmed a visible `neko.neko-canvas` Webview target and no Canvas console errors beyond a VS Code feature warning. Manual `MessageEvent` injection is not equivalent to a host-originated write, so full reveal/synchronization runtime smoke remains pending.
- 7.3: `pnpm run check:legacy-debt` was executed and failed on broader existing repository debt surfaces outside this Canvas authoring change. Targeted static checks for removed storyboard draft capability, production `ensureCanvasEditorFor*Mutation`, and headless runtime-handle persistence passed with only expected tests/guard patterns remaining.
