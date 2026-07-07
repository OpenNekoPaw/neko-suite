# Semantic Prompt Storyboard Authoring Audit

## Scope

Task 1.1 audited the current storyboard shot data model, prompt projection helpers, scene table presentation, prompt editing panels, Canvas authoring catalog, Agent async task/result contracts, Markdown ingest, and legacy `generationPrompt` call sites.

## Findings

- `ShotCanvasNode.data` in `packages/neko-types/src/types/canvas.ts` still stores storyboard prompt authority as plain shot fields: `visualDescription`, `characterAction`, `generationPrompt`, `promptSlots`, media refs, `generationStatus`, and generated assets. There is no persisted prompt-block object for image/video/voice semantic prompt documents yet.
- `packages/neko-types/src/utils/canvasGeneration.ts` projects shot prompts through `projectCanvasShotPrompt`; it treats `generationPrompt` as an explicit override and assembles a prompt from durable fields otherwise. This is the main shared legacy prompt-authority helper.
- `packages/neko-canvas/packages/webview/src/components/content/creatorPresentation.ts` renders the scene table as a broad creator/professional table with columns such as camera, visual-action, characters, tags-style, image-prep, storyboard-prompt, media-refs, diagnostics, and status. It reads `generationPrompt`, `shotImagePrepPlan.generationPrompt`, `generatedVideoAsset.prompt`, and `generationStatus`.
- `SceneShotReviewSurface` in `packages/neko-canvas/packages/webview/src/components/content/ContainerRenderer.tsx` consumes the creator table projection directly. The state column currently reflects generation status and missing image/dialogue facts rather than next creative operation.
- `ContentOverlay` in `packages/neko-canvas/packages/webview/src/components/panels/ContentOverlay.tsx` contains `ShotCreatorPromptEditor`, which edits a plain textarea and writes back `/generationPrompt`. This is a direct legacy authoring path.
- `GenerationPromptPanel` in `packages/neko-canvas/packages/webview/src/components/panels/GenerationPromptPanel.tsx` receives `initialPrompt`, edits a plain prompt textarea, and sends generation params through `generateForNode`. It also displays provider-progress-oriented behavior in the Canvas panel.
- The Canvas authoring catalog in `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts` already exposes `semanticPrompts`, field profiles, targetable fields, recipes, diagnostics, and the `canvas-authoring` Skill, but target fields and apply examples still mention `/generationPrompt` as a normal prompt path.
- `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts` imports storyboard Markdown rows into `generationPrompt` and `promptSlots`. This must become migration/import input for semantic prompt documents, not a new canonical success path.
- Agent async task/result ownership already has shared contracts: `DashboardTaskRef`, `AgentTaskResultRef`, `TaskLifecycleMetadata`, media task progress delivery, and task UI components. Canvas should persist task/result refs and next state only, not provider progress.
- `@neko/markdown` owns syntax/projection only. Its semantic prompt span support is read-only rendering/handoff metadata and should not become Canvas validation or storyboard authority.

## Implementation Boundary

- Add storyboard-specific DTOs and validators in `@neko/shared`, reusing `CanvasAuthoringSemanticPromptDocument`, `CanvasAuthoringDiagnostic`, `StoryboardMediaRef`, `DashboardTaskRef`, and `AgentTaskResultRef`.
- Persist new shot authority under a namespaced prompt state on `ShotCanvasNode.data`, leaving legacy fields as migration/import data until later cleanup tasks remove or fail-close new writes.
- Keep first-slice projection pure and testable before replacing Canvas Webview rendering.
- Treat Agent progress as task refs/result refs in Canvas projections. Do not duplicate provider progress in Canvas scene table state.
