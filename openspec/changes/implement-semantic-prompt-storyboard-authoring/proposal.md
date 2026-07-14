## Why

Canvas storyboard authoring has the right capability foundation, but the product path still behaves like a field table plus plain prompt overrides. Long-video creation needs a prompt-first surface where each scene contains shots with reviewable reference media, image/video prompts, duration, dialogue, current creative state, and next actions, while generation progress remains in Agent async task management.

This change makes the Semantic Prompt Document the Canvas-owned creative authority for storyboard shots. It keeps the table as a review and next-action projection instead of a production job dashboard or a wide field database.

## What Changes

- Add a Canvas semantic storyboard authoring model where each shot may contain `imagePromptDocument`, `videoPromptDocument`, and `voicePromptDocument` prompt blocks with text, semantic spans, references, field projections, diagnostics, and alignment state.
- Rework Canvas scene storyboard tables into scene-scoped review projections with the primary columns: shot number, reference media, image prompt, video prompt, duration, dialogue, current state, and next action.
- Treat image prompts as optional preparation inputs for reference-image processing, keyframe generation, or image repair; shots with directly usable reference media do not require an image prompt.
- Treat video prompts as the core input for video generation or video editing; video reference and audio reference support are capability-driven extensions, not mandatory core columns.
- Define `nextCreativeState` as the table status source. It describes the current blocker or next useful operation, not background generation progress.
- Route action buttons such as process reference, optimize prompt, generate video, review result, fix alignment, accept result, and retry through Agent action intents. Canvas does not call media providers directly from the table.
- Keep Agent subagents/workers internal to Agent async task orchestration. Canvas stores task refs, result refs, diagnostics, and next state only.
- Move generation progress, provider logs, queue state, and batch execution progress into Agent async task UI instead of Canvas storyboard table columns.
- **BREAKING**: The old `generationPrompt`-as-authority path for storyboard shots is demoted to migration/import input or derived display. New canonical authoring and table projection must use semantic prompt documents.
- **BREAKING**: Review/plan/execution table fields such as `nextAction`, `actionId`, `resultRef`, and `executionStatus` are no longer primary storyboard content columns. They move to next-action intent, task/result refs, execution history, or diagnostics.

## Capabilities

### New Capabilities

- `semantic-prompt-storyboard-authoring`: Defines Canvas-owned semantic prompt documents for storyboard shots, scene-scoped review tables, next creative state, Agent action intents, and async task boundaries for long-video creation.

### Modified Capabilities

- None. Existing Canvas authoring catalog and creative table ingest changes remain foundation work; this change introduces the product-level semantic storyboard authoring behavior that will later be promoted to stable architecture docs.

## Impact

- `packages/neko-types`: Canvas node/storyboard prompt contracts, validators, projection helpers, migration helpers, and shared Agent action-intent/result DTOs.
- `packages/neko-canvas/packages/webview`: scene storyboard table projection, prompt-first editor UI, semantic span rendering, next-action controls, result diagnostics, i18n, keyboard/focus behavior.
- `packages/neko-canvas/packages/extension`: Canvas capability catalog updates, field/profile descriptors, action intent routing, active context summaries, and structured result feedback.
- `packages/neko-agent/packages/extension`: Agent action-intent routing, async task creation, capability approval boundaries, result writeback, and repair loops.
- `packages/neko-agent/packages/webview`: task/result presentation may link back to Canvas shots, but generation progress stays in Agent task UI.
- `packages/neko-markdown`: no new authority; it may continue to provide read-only syntax/projection DTOs consumed by Canvas/Agent.
- Project data: prelaunch storyboard shot data may need a migration or rebuild path from `generationPrompt`, `promptSlots`, `visualDescription`, and related fields into semantic prompt documents.
- Validation: contract tests, Canvas Webview tests, Agent route/task tests, path-level legacy poisoning, OpenSpec strict validation, and a real VS Code Webview functional scenario for prompt editing/action controls.
