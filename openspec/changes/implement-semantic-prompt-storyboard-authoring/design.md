## Context

The Canvas authoring catalog and Markdown creative table work established the right ownership boundaries: Canvas owns node schemas, field/profile validation, semantic prompt contracts, resource binding, and diagnostics; Agent owns reasoning, tool choice, approval, async execution, and repair loops; `@neko/markdown` owns syntax/projection only.

The remaining product gap is the Canvas storyboard table itself. It still behaves like a projection over shot node fields and plain prompt strings. Long-video creation needs scene-scoped shot tables where users review prompts and parameters, trigger next creative actions, and let Agent manage asynchronous image/video/audio work.

The selected product model is:

```text
Long Video Project
  Scene[]
    Shot[]
      referenceMedia
        imageRefs[]
        videoRefs?   // capability-driven extension
        audioRefs?   // capability-driven extension
      imagePromptDocument?  // only when preparing/generating image/keyframe media
      videoPromptDocument?  // core video generation/editing prompt
      voicePromptDocument?
      generationParams
      nextCreativeState
      executionRefs
```

The primary scene table is:

```text
Shot | Reference Media | Image Prompt | Video Prompt | Duration | Dialogue | State | Action
```

`scene`, `character`, `action`, `camera`, `style`, and voice/emotion data remain available as semantic prompt spans, field projections, optional detail rows, or filters. They do not become required primary columns.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Canvas owns semantic prompt documents, prompt span persistence, field projection validation, reference media binding, scene-scoped table projection, next creative state, and Canvas-visible result refs. Agent owns optimization, generation, review, async tasks, provider progress, approval, and optional worker/subagent orchestration. `@neko/markdown` remains read-only syntax/projection. Generation providers remain behind Agent/domain capabilities. |
| Dependency | Prompt document DTOs and pure validators belong in `@neko/shared` because Canvas Webview, Canvas Extension, and Agent writeback need them. Canvas Webview renders/edit prompts but does not import VS Code or provider APIs. Canvas Extension exposes action intents and catalog descriptors but does not import React. Agent receives intents through typed Extension routes/capabilities and must not import Canvas Webview internals. |
| Interface | Public interfaces are semantic prompt document DTOs, prompt span descriptors, field projections, reference media refs, next creative state projection, storyboard action intent, async task/result refs, and migration diagnostics. Interfaces are not raw `.nkc` JSON patches, direct provider calls from Canvas, or hidden command aliases. |
| Extension | New model-specific inputs are exposed through capability descriptors and detail panels, not primary table columns. Future video-reference, audio-reference, camera-control, negative prompt, or seed support can be added by capability metadata and action schemas without reshaping the core table. |
| Testing | Contract tests validate prompt documents, next creative states, action intents, and migration diagnostics. Canvas Webview tests validate table projection, prompt editing, color/span rendering, and next action dispatch. Agent Extension tests validate intent-to-task routing, approval gates, provider progress ownership, and structured writeback. Path-level tests poison legacy `generationPrompt` acceptance for new canonical requests. A real VS Code Webview functional scenario validates the prompt editor/action loop. |
| Proportionality | This is still a local VS Code client design. It uses existing Extension Host capabilities, Agent task plumbing, and Canvas Webview stores. It does not introduce a remote workflow engine, distributed job orchestrator, or standalone MCP server as the source of truth. |
| Fail-visible behavior | Unknown prompt document versions, unresolved resource refs, unsupported model parameters, missing approval, ambiguous migration mappings, unknown action ids, stale shot refs, and legacy-only prompt success paths return diagnostics or fail tests. They do not fall back to no-op success or direct `generationPrompt` projection. |

## Goals / Non-Goals

**Goals:**

- Make Semantic Prompt Document the Canvas-owned storyboard shot authoring authority.
- Render scene-scoped Canvas storyboard tables from prompt documents, reference media, duration/dialogue parameters, and next creative state.
- Keep primary table columns focused on core creative review: shot, reference media, image prompt, video prompt, duration, dialogue, state, action.
- Make image prompts optional and only required for reference-image preparation, keyframe generation, or image repair flows.
- Make video prompts the core executable input for video generation/editing.
- Move generation progress, queue state, logs, and provider progress to Agent async task UI.
- Route storyboard action buttons through Agent action intents and approval/task management.
- Provide an explicit migration path from legacy `generationPrompt` and related shot fields.

**Non-Goals:**

- Do not make Canvas storyboard table a production job dashboard.
- Do not expose Agent subagents/workers as Canvas concepts.
- Do not make every semantic span a fixed table column.
- Do not implement a universal prompt reverse parser that silently overwrites fields.
- Do not add model-specific parameters to the primary table unless they are core across the supported action family.
- Do not make `@neko/markdown` validate Canvas fields, resources, or execution readiness.
- Do not replace Agent async task management with Canvas-local task execution.

## Decisions

1. **Semantic Prompt Document is the authoritative shot prompt model.**
   - Each shot can have separate prompt documents for image, video, and voice.
   - Documents carry text, spans, refs, projections, suggestions, diagnostics, and alignment state.
   - `generationPrompt` is demoted to migration/import input or a derived display string.
   - Alternative rejected: keep `generationPrompt` as the core field and add span chips around it. That preserves the old authority problem and cannot reliably support image/video/voice prompt separation.

2. **The storyboard table is a scene-scoped review projection.**
   - Long video creation is organized by scenes; each scene table shows shots.
   - The table answers what each shot is, what prompt/reference inputs matter, and what to do next.
   - Optional review facts such as character, camera, action, and style come from spans and detail projections.
   - Alternative rejected: a global table containing all scenes and all possible fields. It scales poorly for long videos and pushes production/accounting fields into the creative surface.

3. **Primary fields are limited to model-effective authoring inputs.**
   - Primary columns are `shot`, `reference media`, `image prompt`, `video prompt`, `duration`, `dialogue`, `state`, and `action`.
   - Image prompt is optional because usable reference images can go directly to video prompt/generation.
   - Video prompt is core because video generation/editing needs temporal instruction.
   - Alternative rejected: keep broad review/plan/execution fields in the main table. Those fields are useful, but they should appear as state, actions, diagnostics, or execution history.

4. **Reference media is core; video/audio references are extensions.**
   - The durable model stores reference media generically enough for image, video, and audio refs.
   - The primary table label can remain reference image/media, but advanced support depends on model capability.
   - Unsupported reference types are hidden or diagnosed instead of shown as inert fields.
   - Alternative rejected: define video/audio reference as always-visible primary columns. Current model/provider support varies and those columns would often be meaningless.

5. **State means next creative operation, not generation progress.**
   - `nextCreativeState` includes label, severity, blocker, target area, next action id, and supporting diagnostics.
   - Examples: missing reference, needs reference processing, missing video prompt, ready to generate video, needs result review, prompt conflict, waiting confirmation.
   - Running provider progress lives in Agent async tasks. Canvas may show a compact task link, but not provider progress in the main table.
   - Alternative rejected: reuse `generationStatus` as the primary status. It answers job progress, not creative readiness.

6. **Action buttons are fixed creative intents interpreted by Agent.**
   - Canvas exposes a small vocabulary such as process reference, optimize image prompt, optimize video prompt, generate video, review result, fix alignment, accept result, and retry.
   - Buttons produce typed action intents containing shot target, prompt document refs, reference media refs, current params, and expected next state.
   - Agent decides whether to optimize, ask for missing inputs, request approval, create async tasks, or reject the action.
   - Alternative rejected: Canvas directly calls image/video/audio providers. That bypasses Agent reasoning, approval, async progress, cost visibility, and provider abstraction.

7. **Agent workers/subagents remain internal.**
   - Canvas stores task refs, result refs, diagnostics, and next state.
   - Agent can split scene-level or long-video work into multiple async tasks or workers, but Canvas does not model worker identity.
   - Alternative rejected: expose subagent assignment buttons in Canvas. That leaks implementation detail and confuses creative actions with execution topology.

8. **Migration is prelaunch-breaking but explicit.**
   - Existing legacy fields can be migrated into semantic prompt documents when safe.
   - Ambiguous or runtime-only resource mappings produce diagnostics and preserve visible data.
   - New canonical tests must prove legacy projection does not satisfy prompt-first acceptance.
   - Alternative rejected: dual-read `generationPrompt` forever. That creates two sources of truth and hides missing semantic prompt implementation.

## Data Model Sketch

```ts
interface StoryboardPromptBlocks {
  imagePromptDocument?: CanvasSemanticPromptDocument;
  videoPromptDocument?: CanvasSemanticPromptDocument;
  voicePromptDocument?: CanvasSemanticPromptDocument;
}

interface StoryboardReferenceMedia {
  imageRefs: readonly StableResourceRef[];
  videoRefs?: readonly StableResourceRef[];
  audioRefs?: readonly StableResourceRef[];
  diagnostics?: readonly CanvasDiagnostic[];
}

interface StoryboardNextCreativeState {
  id: string;
  label: string;
  severity: 'info' | 'warning' | 'error' | 'blocked';
  target:
    | 'reference-media'
    | 'image-prompt'
    | 'video-prompt'
    | 'dialogue'
    | 'approval'
    | 'result-review'
    | 'prompt-alignment';
  nextActionId?: StoryboardActionIntentId;
  blocker?: string;
  taskRef?: AgentTaskRef;
  resultRef?: StableResourceRef;
  diagnostics?: readonly CanvasDiagnostic[];
}
```

Names above are illustrative; implementation should reuse or extend existing `CanvasAuthoringSemanticPromptDocument`, Canvas refs, diagnostics, ResourceRef, and Agent task/result contracts instead of creating parallel local DTOs.

## Action Flow

```text
Canvas row action
  -> StoryboardActionIntent
  -> Agent route / capability lifecycle
  -> Canvas/catalog/model capability check
  -> optional approval
  -> Agent async task
  -> structured result or diagnostics
  -> Canvas validates writeback
  -> nextCreativeState projection updates
```

Pure UI actions such as open details, locate shot, reveal reference, or view queue stay in Canvas Webview.

## Migration Plan

1. Add shared semantic storyboard DTOs, validators, migration diagnostics, and projection helpers.
2. Add Canvas migration/rebuild helpers from `generationPrompt`, `promptSlots`, `visualDescription`, `characters`, `dialogue`, `duration`, and existing media refs.
3. Add new Canvas scene table projection from semantic prompt documents and next creative state while poisoning legacy-only acceptance in tests.
4. Replace prompt textareas with a prompt-first editor that can render spans, refs, diagnostics, and field projections. Editing span-tagged text updates projections; free-form edits produce suggestions/alignment state.
5. Add next action intent DTOs and Canvas Webview dispatch for row actions.
6. Add Agent route/task handling for prompt optimization, reference processing, video generation, result review, retry, and acceptance.
7. Move running progress to Agent async task UI and keep Canvas table state focused on current state/next action.
8. Update Canvas authoring catalog/Skill guidance to advertise the semantic storyboard model, action intents, and Agent async boundary.
9. Remove or fail-close old `generationPrompt`-authority paths after migration tests pass.
10. Promote stable decisions to architecture/domain docs after implementation stabilizes.

Rollback is possible before data migration by disabling the semantic storyboard projection and retaining read-only legacy display with diagnostics. After migration, rollback must preserve semantic prompt documents and may render them in read-only form; it must not silently recreate `generationPrompt` as authority.

## Existing `.nkc` Storyboard Data Strategy

Neko Suite is still prelaunch, so this change intentionally breaks the legacy prompt-authority path while preserving recoverable user-visible data.

- Safe legacy shot fields are rebuilt into `storyboardPrompt` on import/migration: `generationPrompt` and image prompt slots become image prompt documents, visual/action/camera fields become video prompt documents, dialogue/voice fields become voice prompt documents, and duration/dialogue become `generationParams`.
- Ambiguous legacy prompt sources, conflicting prompt slots, runtime-only media refs, blob/data/cache URLs, and unresolved tool result handles do not report semantic storyboard success. They remain visible as diagnostics or read-only legacy fields until the user or Agent resolves them.
- Production Markdown storyboard import now creates semantic prompt documents directly. A column named `Generation Prompt` or `generationPrompt` is treated as Markdown prompt input, not as permission to write `/generationPrompt`.
- Legacy `generationPrompt`, `promptSlots`, `visualDescription`, and generated media fields may remain in old `.nkc` files as migration input or readable mirrors. New canonical authoring, scene table projection, and Agent writeback must target `/storyboardPrompt`.
- Unrecoverable legacy-only execution/progress fields are intentionally ignored by the storyboard table. Durable result refs and history can be preserved under execution refs when they validate; provider progress and queue state are owned by Agent tasks.

## Risks / Trade-offs

- [Risk] Prompt editor complexity grows quickly. -> Mitigation: start with text + span chips/side panel + diagnostics before rich inline editing, but persist the semantic document contract from the first slice.
- [Risk] Table becomes too sparse when image prompts are optional. -> Mitigation: show clear state labels such as "reference ready" or "image prep not needed" instead of forcing placeholder prompts.
- [Risk] Agent action intents become hidden workflow commands. -> Mitigation: keep action vocabulary small, typed, and capability-checked; return diagnostics instead of fallback execution.
- [Risk] Legacy data migration loses useful prompt text. -> Mitigation: preserve raw legacy fields in migration provenance or diagnostics and keep visible read-only recovery.
- [Risk] Model capability metadata is incomplete. -> Mitigation: unsupported or unknown parameters stay out of primary columns and actions block with repairable diagnostics.
- [Risk] Canvas and Agent race during async writeback. -> Mitigation: include base revision/task refs and let Canvas validate target shot/prompt document identity before persisting updates.

## Open Questions

- Should the first UI slice implement inline colored spans, or a split editor with plain text plus colored span chips and side-panel diagnostics?
- Should `referenceMedia` be added directly to `ShotCanvasNode.data`, or stored under a namespaced `storyboardPrompt`/`promptBlocks` object to isolate the new model during migration?
- Which existing Agent async task primitives should be reused for storyboard action intents, and what minimal task ref shape must Canvas persist?
- Should scene-level batch actions be available in the first slice, or should the first release support only single-shot actions plus Agent-side bulk commands?
