## Context

Canvas already owns `.nkc` persistence, infinite layout, text/Markdown, media/reference nodes, related Board navigation, Basic/Professional right-dock composition, portable source validation, Custom Editor integration, and headless `CanvasProjectAuthoringService` writes. Agent already owns conversations, tasks, typed results, asynchronous continuation/backfill, Skill routing, and session isolation. Generated Output already owns durable generated media under `neko/generated/<kind>/` separately from Asset Library membership.

The missing behavior is narrower than a new Draft/Board domain: when a creator does not name a target Canvas, Agent needs a predictable way to find or create a Canvas under `neko/boards/`, bind the task, and automatically write useful foundational content. The existing Basic right dock also needs to stop advertising specialized Storyboard/table and professional subsystem nodes as default creation choices.

## Goals / Non-Goals

**Goals:**

- Keep Board and Canvas identical: each Board is an ordinary `.nkc` owned by Canvas.
- Make `neko/boards/` the default Agent Canvas search/create directory when the user does not specify a target.
- Resolve targets deterministically before work starts and keep asynchronous writes bound to that document/revision.
- Auto-deliver useful Markdown, file/reference, image, audio, and video results through existing Canvas authoring.
- Make Basic right-dock mode show only foundational elements while leaving `.nkc` validation and existing files unchanged.
- Make unspecified Storyboard work a normal Markdown document rather than a specialized Storyboard/table node.
- Preserve generated-output, Asset Library, professional domain, file/path, session, and fail-visible boundaries.

**Non-Goals:**

- Do not introduce Draft Workspace, Draft Board contracts, a new package, new file type, or parallel Board persistence.
- Do not add a persisted Basic/Professional profile or restrict the `.nkc` schema/node union.
- Do not implement Board-to-Canvas conversion, file copy/move upgrade, or a generic promotion framework.
- Do not turn Basic mode into a permission/security boundary; it is a default catalog presentation.
- Do not add specialized Character, Scene, Shot, Storyboard table, Timeline, Workflow, Agent, Tool, Skill, Model, or Provider creation entries to Basic mode.
- Do not make Agent scan/parse raw `.nkc` files, mutate raw JSON, or select targets from free-form similarity alone.
- Do not inject entire Canvases into every Agent turn or persist reasoning/tool logs as creative content.
- Do not move generated media into Board directories or automatically register it in Asset Library.

## Decisions

### 1. Board is a directory convention over ordinary Canvas documents

```text
project/
├── neko/
│   ├── boards/
│   │   ├── concept.nkc
│   │   ├── character-exploration.nkc
│   │   └── storyboard-notes.nkc
│   ├── generated/
│   │   ├── image/
│   │   ├── audio/
│   │   ├── video/
│   │   ├── storyboard/
│   │   └── file/
│   └── <existing professional domain directories>
└── .neko/
    └── <existing metadata, journals, indexes, cache, and runtime projections>
```

`neko/boards/*.nkc` uses the current codec, migrator, `nkcSourcePathPolicy`, Canvas identity, revisions, nodes, edges, Markdown blocks, resource references, and authoring service. Directory membership only scopes Agent default discovery and default UI context. It does not change the file schema or make a second Canvas kind.

Rejected: a Draft Workspace/Board domain or new file format. It duplicates Canvas. Rejected: a persisted Basic profile. Basic is a discoverability/default-creation concern, not different durable semantics.

### 2. Canvas owns indexed Board discovery; Agent never parses Board files

Canvas exposes a bounded query over its Board index for `.nkc` files within `neko/boards/`. Each sanitized result contains stable document identity/ref, Canvas identity, title, revision, safe creative scope/work/project identity, basic node summary, updated time, and conversation bindings where owned by the Host. It does not expose unsafe absolute paths, render URIs, cache paths, or raw `.nkc` payloads.

Agent calls this query only when an explicit target and valid conversation/task binding are absent. Agent may use sanitized summaries for user-facing suggestions, but Canvas/Host owns resolution and authoring.

### 3. Unspecified target resolution uses one canonical order

```text
explicit user target
  -> valid conversation/task Board binding
  -> exactly one compatible indexed neko/boards Canvas
  -> create a new neko/boards/<safe-name>.nkc
```

Compatibility requires stable project/work/scope evidence, not only filename or LLM semantic similarity. If several plausible Boards exist without a unique exact binding, the default is to create a new Board Canvas; Agent may ask the creator to select an old one before starting if reuse would materially help.

The resolver never falls back to:

- the globally active Canvas;
- the most recently opened Canvas;
- a Canvas outside `neko/boards/`;
- a semantically similar filename/content summary without exact binding;
- a Board belonging to another conversation when shared mutation was not explicit.

The resolved target freezes `conversationId`, `canvasId`, document ref/URI, revision, turn/task/run identity, and optional placement region before async work begins. Deleted, stale, relocated, or revision-conflicting targets produce a diagnostic and do not retarget completion.

### 4. Automatic delivery is typed runtime policy

Eligible auto-delivery:

- creator-useful Markdown documents, including script, analysis, planning, character/scene notes, and Storyboard Markdown;
- user-selected files/references used by the current task;
- completed image/audio/video generated outputs and reviewable variants;
- temporary task projections for operations expected to produce creator content.

Excluded:

- ordinary conversational answers;
- hidden reasoning;
- raw tool calls, logs, parameters, and diagnostics without creator content;
- provider/parser scratch;
- all unselected search results;
- duplicate retry intermediates;
- cache/render/runtime identities;
- failed tasks without reviewable output.

Classification is based on typed artifact/result contracts and runtime policy, not a Skill instruction asking the model whether to save. Delivery calls the existing Canvas capability/headless authoring path and never writes raw `.nkc`. Replay is idempotent by stable artifact/output/task identity.

### 5. Generated media remains outside `.nkc`

Generated binary lifecycle remains:

```text
provider scratch
  -> runtime candidate
  -> retained output in neko/generated/<kind>/
  -> optionally referenced by one or more .nkc/project files
  -> optionally registered in Asset Library
```

Canvas nodes store stable generated-output/resource refs and current Host render projections only at runtime. Auto-delivery does not create Asset Library membership. Using a generated source in Canvas/Cut/Audio and cataloging it in Assets remain independent.

### 6. Basic mode is only a right-dock catalog projection

When Canvas opens through Board context or when Basic mode is selected, the right dock composes only existing foundational entries:

- file/reference;
- text/Markdown document;
- script document presentation/template;
- image;
- audio;
- video;
- neutral group/frame/layout elements already owned by Canvas.

Basic mode excludes creation entries for:

- specialized Storyboard/creative tables;
- Scene/Shot/Gallery production nodes;
- timeline/track/clip or playback workflow nodes;
- professional subsystem nodes;
- Agent, Tool, Skill, Model, Provider, or executable workflow nodes.

This does not delete or reject existing nodes. If an `.nkc` containing professional nodes is opened in Basic mode, Canvas may render them through existing renderers, but the Basic right dock does not advertise creation of those nodes. Explicit Professional mode continues to compose existing subsystem entries.

The catalog composition must use the current Canvas node/subsystem manifest and existing right-dock mechanism. It must not create a parallel component registry or hard-coded duplicate node definitions.

### 7. Storyboard defaults to Markdown, not a specialized Basic node

The canonical Storyboard Skill remains responsible for source interpretation and creative methodology. When the user asks for Storyboard analysis/planning without explicit structured authoring intent, Agent produces a normal Markdown document/table and auto-authors it into the resolved Board Canvas as document content.

The Basic panel does not contain Storyboard table or Scene/Shot creation entries. Structured Storyboard creation remains available only through explicit professional intent and the existing Canvas/Storyboard validation/authoring path. The Skill content does not contain Board tool names, resolver protocol, commands, target IDs, or path rules; runtime/capability injection owns those details.

### 8. One conversation binding, not one mandatory Canvas

A conversation may bind to a resolved Board Canvas for continuity, but the binding does not make the Canvas conversation-owned or prevent deliberate reuse. Multiple conversations may reference the same Board only through explicit user selection or exact shared scope, and concurrent writes remain revision-checked.

Archiving a conversation removes or archives its binding and runtime projections; it never deletes the `.nkc` or generated sources automatically. Board cleanup is a separate user-visible Canvas/file operation.

### 9. Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Canvas owns `.nkc`, Board index/query, Basic catalog, authoring, save, and revisions; Agent owns task/result classification and target binding; Generated Output owns retained files; Assets owns catalog membership. |
| Dependency     | Agent consumes public Canvas query/capability contracts and never imports Canvas Webview/Extension internals; Canvas does not import Agent internals; shared contracts stay Layer 0.                                  |
| Interface      | Minimal Board query/filter/result, resolution/binding result, immutable write target, delivery provenance, and diagnostics; no new codec, profile, Board DTO hierarchy, or generic promotion API.                     |
| Extension      | Foundational Basic entries reuse current Canvas catalog manifests; future Basic entries extend the existing owning catalog only when creator demand justifies them.                                                   |
| Testing        | Resolver/query unit and integration tests, Canvas catalog tests, `.nkc` authoring/revision tests, Agent Evaluation, generated-output recovery tests, and isolated Extension Development Host functional scenarios.    |

### 10. Agent Evaluation is required

This affects Storyboard Skill output, capability routing, artifact/task delivery, asynchronous completion, session target identity, and Webview facts. The Evaluation coverage index must select the owning suite.

Minimum real-path evidence:

- unspecified Storyboard intent activates the canonical Skill, generates Markdown, resolves/reuses or creates `neko/boards/*.nkc`, and authors the document through Canvas;
- image/audio/video tasks retain stable outputs under `neko/generated/<kind>/` and deliver to their frozen Canvas target;
- ordinary answers/logs/reasoning create no Canvas nodes;
- explicit target wins over resolver search;
- ambiguous/no-match Board queries create a new Board rather than mutate an active/professional Canvas;
- stale/wrong/deleted/revision-conflicting target fails without fallback;
- Basic right dock exposes foundational entries and excludes specialized Storyboard/professional entries;
- legacy generic Send-to-Canvas/compiler/structured fallback is poisoned for unspecified Board requests.

### 11. Implementation boundary discovered for generated-output cleanup

The current product has no public cross-domain usage query that can prove whether one generated output is referenced by Canvas, Cut, Audio, or another professional document, and Agent has no Asset Library membership reader. Agent must not parse raw `.nkc`/professional project files or infer membership from presentation fields. A reference-aware delete path therefore cannot be composed safely in this change.

Task 6.4 remains open until an owning follow-up change defines a host-neutral generated-output usage query, Canvas/professional-domain readers, and an Assets membership adapter with a real user-confirmed cleanup caller. The temporary retention service that had only injected test doubles and no production caller was removed; the safe current behavior is retention without silent deletion. Storage projection may be added with that same owning query and must not become an Agent-only parallel index.

## Risks / Trade-offs

- [Risk] Directory convention is mistaken for a new document kind. → Keep `.nkc` unchanged and describe `neko/boards/` only as Agent discovery/default UI context.
- [Risk] Agent reuses an unrelated old Board. → Require explicit binding or one exact compatible scope; ambiguous similarity creates a new Board or asks the user.
- [Risk] Too many Boards are created. → Persist conversation bindings, expose reuse suggestions, and let creators merge/copy content explicitly; do not sacrifice target predictability.
- [Risk] Basic mode hides content already in the file. → Hide only creation catalog entries; render existing nodes normally and allow explicit Professional mode.
- [Risk] Agent silently overwrites user layout/content. → Use revision-checked authoring and task placement regions; conflicts create diagnostics or reviewable alternatives.
- [Risk] Auto-delivery pollutes Canvases. → Deliver only typed creator artifacts/results, group variants, exclude internal outputs, and provide creator-visible accept/reject/archive controls.
- [Risk] Generated output retention fills storage. → Reuse existing retained-output owner, reference-aware cleanup, storage projection, and explicit user cleanup.
- [Risk] Markdown and structured Storyboard diverge. → Structured creation remains an explicit authoring operation; Markdown does not silently rewrite structured nodes.

## Migration Plan

1. Audit current Canvas Board index/navigation, Basic/Professional right-dock composition, node/subsystem manifests, `CanvasProjectAuthoringService`, `.nkc` source/revision policies, Agent target selection, delivery, generated-output retention, Storyboard Skill, and Evaluation coverage.
2. Add poison tests for global active Canvas fallback, professional-directory mutation, raw `.nkc` writes, legacy Send-to-Canvas/compiler fallback, specialized Storyboard creation for unspecified intent, cache-path persistence, and false Asset membership.
3. Define minimal Board query/resolution/write-target/provenance contracts and extend the Canvas index for sanitized `neko/boards/` results.
4. Implement deterministic reuse/create and conversation/task binding, then validate concurrent/restart/stale/deleted/revision-conflict behavior.
5. Update the existing Basic right-dock catalog composition to foundational entries only, with component/catalog tests proving specialized entries are absent and `.nkc` schema remains unchanged.
6. Implement typed Markdown/file/reference/image/audio/video auto-delivery through existing Canvas authoring, plus async backfill, idempotency, task regions, and generated-output retention.
7. Update Storyboard Skill/runtime routing so unspecified work creates Markdown document content; keep structured Storyboard authoring explicit and poison old default paths.
8. Update/retire retention-oriented Send-to-Canvas UI and related fixtures without removing explicit historical Add to Board Canvas behavior where still needed.
9. Run deterministic tests, focused real Agent Evaluation, affected package/repository gates, and isolated Extension Development Host functional scenarios.
10. Update creator and architecture documentation after behavior stabilizes.

Rollback may remove resolver/auto-delivery/Basic catalog changes as one unit while preserving all `.nkc` and `neko/generated` user data. Rollback must not delete newly created Board Canvases or restore unspecified writes to the active/professional Canvas.

## Open Questions

- Which exact existing Canvas index service should own the `neko/boards/` filter and safe scope summary, or does the current index require a minimal public extension?
- Should one exact project/work/scope match be automatically rebound across conversations, or should cross-conversation reuse always require confirmation? The conservative default is confirmation unless the project explicitly marks the Canvas shared.
- Which existing foundational Canvas node descriptors should represent generic file/reference and script presentation without introducing duplicate node types?
- Which Agent Evaluation suite owns Board resolver/auto-delivery after consulting the repository coverage index?
