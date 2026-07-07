## 1. Contracts And Migration Surface

- [x] 1.1 Audit current ShotCanvasNode data fields, Canvas prompt projection helpers, creator table projection, GenerationPromptPanel, ContentOverlay prompt editor, Canvas authoring catalog descriptors, Agent async task/result contracts, and legacy `generationPrompt` call sites.
- [x] 1.2 Define shared semantic storyboard DTOs in `@neko/shared` by reusing/extending existing Canvas authoring semantic prompt contracts for prompt blocks, reference media, next creative state, action intent, task refs, result refs, migration provenance, and diagnostics.
- [x] 1.3 Add validators/type guards for semantic prompt documents, reference media refs, next creative states, action intents, task/result refs, and migration diagnostics.
- [x] 1.4 Add contract tests proving malformed prompt documents, unresolved refs, runtime-only media identities, unsupported action ids, unsupported model parameters, and unknown document versions fail visibly.
- [x] 1.5 Add migration helpers that map safe legacy `generationPrompt`, `promptSlots`, `visualDescription`, `characters`, `dialogue`, `duration`, source media refs, and generated media refs into semantic prompt documents and review projections.
- [x] 1.6 Add migration tests proving safe legacy shots migrate with provenance and ambiguous/runtime-only legacy data returns diagnostics without claiming semantic prompt success.

## 2. Canonical Projection And Legacy Poisoning

- [x] 2.1 Implement semantic storyboard row projection from prompt documents, reference media, duration, dialogue, next creative state, task refs, result refs, and diagnostics.
- [x] 2.2 Replace or wrap `projectCanvasShotPrompt` for storyboard authoring so the canonical path reads semantic prompt documents first and treats `generationPrompt` as migration/import-only input.
- [x] 2.3 Update Canvas scene table presenter tests to assert primary columns are shot, reference media, image prompt, video prompt, duration, dialogue, state, and action.
- [x] 2.4 Add path-level tests that poison legacy `generationPrompt` projection and prove the new storyboard table acceptance uses semantic prompt documents.
- [x] 2.5 Remove or fail-close new-request success paths that write storyboard prompt authority only to `/generationPrompt`.

## 3. Canvas Webview Prompt-First UI

- [x] 3.1 Replace the current shot prompt textarea authority in ContentOverlay with a semantic prompt editor surface that can show image, video, and voice prompt documents.
- [x] 3.2 Add read-only or first-slice editable colored semantic span rendering for scene, character/entity, action, camera, style, voice, and resource refs, with diagnostics and alignment state.
- [x] 3.3 Implement prompt edit behavior where tagged span edits update field projections and free-form edits preserve prompt text while producing suggestions or alignment diagnostics.
- [x] 3.4 Update GenerationPromptPanel to consume semantic prompt documents and action context instead of treating a plain `initialPrompt` as durable shot authority.
- [x] 3.5 Add i18n strings, keyboard/focus behavior, and accessibility labels for prompt documents, span chips, reference media status, next state, and action controls.
- [x] 3.6 Add Webview component tests for prompt document rendering, free-form edit diagnostics, span projection display, missing/usable reference state, and absence of generation progress UI in the storyboard table.

## 4. Scene Storyboard Table And Next Creative State

- [x] 4.1 Rework `SceneShotReviewSurface` and table rows to use semantic storyboard row projections.
- [x] 4.2 Implement next creative state resolution for missing reference, needs reference processing, image prompt ready/skipped, missing video prompt, ready to generate video, needs result review, prompt conflict, waiting confirmation, failed retry, and accepted states.
- [x] 4.3 Render the state column as current blocker/next creative operation, with compact severity and optional link to Agent task queue.
- [x] 4.4 Render fixed action buttons for process reference, optimize image prompt, optimize video prompt, generate video, review result, fix alignment, accept result, and retry based on next creative state.
- [x] 4.5 Keep pure UI actions such as open details, locate shot, reveal reference media, and view queue handled locally by Canvas Webview.
- [x] 4.6 Add Canvas Webview tests proving running provider progress is not displayed as table state and completed task writeback changes the next creative state.

## 5. Canvas Extension Capability And Catalog Updates

- [x] 5.1 Update Canvas authoring catalog field/profile descriptors to advertise semantic storyboard prompt blocks, reference media, next creative states, and action intent support.
- [x] 5.2 Update `canvas-authoring` Skill text to describe prompt-first storyboard authoring, scene-scoped tables, image prompt optionality, video prompt core usage, Agent action intents, and Agent async progress ownership.
- [x] 5.3 Add or update Canvas Extension routes/API surfaces for receiving storyboard action intents from the Webview and forwarding them to Agent without directly invoking providers.
- [x] 5.4 Ensure Canvas validates structured Agent writeback against shot id, prompt document id/version, task ref, result ref, and resource identity before persisting updates.
- [x] 5.5 Add Canvas provider tests for catalog sections, action intent metadata, capability-driven advanced parameters, unsupported parameter diagnostics, and structured writeback validation.

## 6. Agent Action Intent And Async Task Integration

- [x] 6.1 Define Agent-side routing for storyboard action intents, including optimize prompt, process reference, generate video, review result, fix alignment, accept result, retry, and batch scene actions if included in the slice.
- [x] 6.2 Implement Agent decision flow that queries Canvas/model capabilities, checks missing inputs, requests approval for mutating/provider-consuming actions, and rejects unsupported intents with repairable diagnostics.
- [x] 6.3 Create or reuse Agent async task records for image/video/audio generation and reference processing, with progress/logs/provider metadata shown in Agent task UI.
- [x] 6.4 Implement structured task writeback to Canvas with result refs, diagnostics, prompt document updates, and next creative state updates.
- [x] 6.5 Keep worker/subagent orchestration internal to Agent and ensure Canvas only receives task refs, result refs, diagnostics, and next state.
- [x] 6.6 Add Agent Extension/Webview tests for intent routing, approval-required generation, task progress ownership, writeback validation, rejection diagnostics, and result review actions.

## 7. Model Capability And Advanced Parameters

- [x] 7.1 Define the minimal model capability projection needed for storyboard actions: image preparation support, image generation/edit support, video generation/edit support, duration limits, reference image/video/audio support, and advanced parameter support.
- [x] 7.2 Gate video reference, audio reference, seed, negative prompt, camera control, motion strength, aspect ratio, and similar parameters behind capability descriptors and details/confirmation UI.
- [x] 7.3 Add tests proving unsupported parameters are hidden or diagnosed and never sent as executable provider inputs.
- [x] 7.4 Add tests proving supported advanced parameters appear outside the primary table and are included only in action payloads that support them.

## 8. Legacy Cleanup And Data Safety

- [x] 8.1 Remove or quarantine obsolete storyboard table fields that made review/plan/execution fields primary content columns, while preserving diagnostics/result/history access in the appropriate surfaces.
- [x] 8.2 Update creative table ingest so imported Markdown storyboard rows create semantic prompt documents or migration diagnostics rather than only writing prompt content into `generationPrompt`.
- [x] 8.3 Add failure tests for old Markdown/Canvas paths that attempt to report new semantic storyboard success through generic table fallback, plugin-transfer payloads, or legacy generation prompt projection.
- [x] 8.4 Document old-data strategy for existing local `.nkc` storyboard drafts: migrate, rebuild from imported Markdown/reference metadata, preserve read-only diagnostic data, or intentionally ignore unrecoverable legacy-only fields.

## 9. Documentation And Validation

- [x] 9.1 Update package or architecture docs after implementation stabilizes to describe Canvas semantic storyboard authority, Agent async task boundary, and `@neko/markdown` read-only projection boundary.
- [x] 9.2 Run focused `@neko/shared` contract tests for semantic prompt documents, next creative state, action intent, migration, and model capability validation.
- [x] 9.3 Run focused Canvas extension tests for catalog/action intent/writeback behavior.
- [x] 9.4 Run focused Canvas Webview tests for prompt editor, scene table projection, state/action controls, i18n, and keyboard/focus behavior.
- [x] 9.5 Run focused Agent Extension/Webview tests for action intent routing, approval, async task progress ownership, and result writeback.
- [x] 9.6 Run `openspec validate implement-semantic-prompt-storyboard-authoring --strict`.
- [x] 9.7 Run affected package typechecks/builds for `@neko/shared`, `neko-canvas`, `neko-agent`, and `@neko/markdown` if touched.
- [ ] 9.8 Run VS Code Webview runtime smoke with `vscode-extension-debugger` for the prompt editor, storyboard table next-action button, Agent task handoff, and Canvas writeback loop.
