## Why

Canvas Shot AI controls need to optimize prompts and generate or edit images/videos without routing through `Send to Agent`, old `generateForNode` data URLs, or Canvas-owned provider calls. The current architecture has Agent creative invocation and run/workItem foundations, but the Canvas button path still needs a canonical candidate-first integration that protects user edits and formalizes progress, concurrency, and promotion.

## What Changes

- Add Canvas creative AI action requests for prompt optimization, image generation/editing, and video generation/editing that are separate from `sendToAgent`.
- Require every Canvas AI action to provide explicit target fill refs, candidate target refs, revision preconditions, idempotency, and structured creative parameters before Agent execution starts.
- Apply all AI results as candidates first; only user acceptance or a passing judge workItem may promote a candidate to the mutating target, and promotion re-checks target revision.
- Collapse new video/voice prompt handling onto `videoPromptDocument`; new flows do not create or depend on a separate `voicePromptDocument`.
- Route execution through Agent run/workItem scheduling with visible background Agent session projection, per-media lane concurrency limits, ResourceRef/artifact outputs, and Canvas-owned apply.
- Remove migrated button dependence on `neko.agent.generateForNode`, `generationProgress`, `dataUrl` writeback, or foreground Agent conversation context.

## Capabilities

### New Capabilities

- `canvas-creative-ai-candidate-actions`: Defines Canvas Shot/Scene AI actions, typed action requests, target fill refs, candidate-first writeback, video prompt authority, promotion, and UI progress/diagnostics.
- `agent-creative-run-lane-scheduling`: Defines Agent creative run/workItem execution for Canvas AI actions, visible background session projection, lane concurrency limits, per-workItem progress, aggregate snapshots, judge workItems, and package-owned apply orchestration.

### Modified Capabilities

None. Existing generated asset lifecycle, content access, project file IO, and Agent creative invocation boundaries remain foundations; this change consumes and specializes them for Canvas AI buttons.

## Impact

- `packages/neko-types`
  - Add or refine shared DTOs for Canvas creative action requests, candidate refs, promotion requests, lane snapshots, action diagnostics, and model capability projections.
- `packages/neko-canvas/packages/webview`
  - Add or rewire AI buttons for optimize prompt, generate/edit image, and generate/edit video.
  - Show parameter diagnostics, Agent availability, candidate status, aggregate progress, and promotion controls.
  - Stop using `sendToAgent` for these buttons.
- `packages/neko-canvas/packages/extension`
  - Resolve shot/scene creative parameters, prompt document refs, reference media, target/candidate refs, revisions, and idempotency.
  - Invoke Agent through explicit creative envelopes and apply candidate/promotion results through Canvas-owned adapters.
  - Poison or remove migrated `generateForNode`/`dataUrl` success paths for these buttons.
- `packages/neko-agent`
  - Execute accepted Canvas creative invocations through run/workItem lifecycle.
  - Add lane concurrency limits for image/audio/video/text or equivalent media categories.
  - Resolve non-creative runtime/model/provider details from Agent config and capability catalogs.
  - Project background creative sessions into the Agent conversation list for inspection.
- Tests and validation
  - Add contract, Canvas, Agent runtime, and legacy poison tests.
  - Add real VS Code Webview functional scenarios for button state, diagnostics, candidate/progress UI, Agent session projection, and runtime errors.
