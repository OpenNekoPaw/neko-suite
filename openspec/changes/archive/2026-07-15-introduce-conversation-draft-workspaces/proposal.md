## Why

Neko Agent currently keeps useful creative results in conversation/task projections until the user explicitly sends them to Canvas, even though `.nkc` Canvas already supports the foundational file, Markdown, image, audio, video, reference, layout, and resource behaviors needed for rapid creation. Creating a separate Board model, file type, profile, or upgrade lifecycle would duplicate Canvas and expose unnecessary product concepts.

The product only needs one Canvas model with one Agent working-directory convention: when no target is specified, Agent searches `neko/boards/` for a suitable existing `.nkc` and reuses it or creates a new `.nkc`; eligible creative outputs are then written through the canonical Canvas authoring path. Canvas Basic mode should present only foundational elements so creators start quickly without specialized storyboard/table/production nodes crowding the default surface.

## What Changes

- Treat every `neko/boards/*.nkc` file as an ordinary Canvas document. Do not introduce Draft Workspace, Draft Board, Board profile, restricted `.nkc` schema, parallel persistence, or a Board-to-Canvas conversion/upgrade lifecycle.
- Add deterministic Agent target resolution for unspecified creative work: query the Canvas-owned index for `.nkc` files under `neko/boards/`, reuse the conversation/task binding or one unambiguous compatible Board Canvas, otherwise create a new `.nkc` under `neko/boards/` through `CanvasProjectAuthoringService`.
- Require every turn/task delivery to freeze explicit conversation, Canvas document, revision, task/run, and source identities. Missing, stale, deleted, ambiguous, or cross-conversation targets fail visibly and never fall back to a globally active or professional-directory Canvas.
- Automatically write creator-useful Markdown documents, selected references/files, and completed image/audio/video outputs to the resolved Board Canvas. Ordinary answers, hidden reasoning, raw tool logs, provider scratch, unselected search hits, duplicate retries, and runtime/cache handles do not become Canvas content.
- Keep generated media bytes in the existing `neko/generated/<kind>/` roots and store only stable references in `.nkc`. Board Canvas membership, professional-project usage, and Asset Library registration remain independent.
- Update the existing Canvas right dock so Basic mode shows only foundational creation entries: file/reference, text/Markdown document, script document, image, audio, video, and existing neutral layout/group elements. It must not show specialized storyboard table, Scene/Shot, timeline, workflow, provider, Agent, Tool, Skill, or other professional subsystem creation entries.
- Keep `.nkc` semantics unchanged. Basic mode is only a right-dock/catalog presentation and default Agent authoring policy; it is not persisted in the file and does not reject existing nodes when a Canvas containing them is opened.
- Update Storyboard behavior so an unspecified storyboard/planning request produces a normal Markdown document in the resolved Board Canvas. A specialized structured Storyboard/table is created only through an explicit non-Basic professional action and is not a Basic panel entry.
- Retire generic `Send to Canvas` as the normal retention path for new Agent creative outputs. Historical/external content may still use an explicit Add to Board Canvas action, while current typed results auto-deliver.
- **BREAKING**: unspecified Agent creative requests must not mutate the currently active Canvas, a professional-directory Canvas, legacy storyboard compiler, generic structured Canvas fallback, or specialized storyboard node path merely because no Board target was supplied.
- Add deterministic producer/consumer/path tests, focused real Agent Evaluation, and isolated Extension Development Host scenarios for Board-directory resolution, reuse/create, auto-delivery, Basic catalog projection, stale-target rejection, async completion, and restart recovery.

## Capabilities

### New Capabilities

- `agent-board-canvas-routing`: Defines Canvas-owned `neko/boards/` discovery and deterministic reuse/create/binding for Agent work without active-Canvas or semantic-guess fallback.
- `agent-board-canvas-delivery`: Defines which typed Agent/task results automatically author into the resolved Board Canvas, immutable async targets, idempotency, provenance, exclusions, and failure behavior.
- `canvas-basic-element-catalog`: Defines the foundational entries visible in Canvas Basic right-dock mode and excludes specialized storyboard/production/system entries from that default catalog without changing `.nkc` schema.

### Modified Capabilities

- `generated-asset-lifecycle`: Board Canvas auto-delivery retains generated outputs under the existing `neko/generated/<kind>/` roots without falsely creating Asset Library membership.
- `canvas-markdown-capabilities`: Creator-useful Markdown is automatically authored as normal Canvas document content in the resolved Board Canvas; specialized Storyboard/table authoring remains explicit and outside Basic catalog behavior.
- `storyboard-source-normalization`: Unspecified Storyboard/planning requests produce flexible Markdown documents in the resolved Board Canvas; structured Storyboard output requires explicit professional intent.

## Impact

- `packages/neko-canvas`: Board-directory index/query, `CanvasProjectAuthoringService` target creation and authoring, existing `.nkc` revision/source policies, right-dock Basic catalog composition, reveal behavior, and Webview functional scenarios.
- `packages/neko-agent`: conversation/task Canvas binding, target resolver adapter, typed artifact/generated-result delivery, async backfill, bounded Canvas context, Webview protocol/projection, Storyboard Skill guidance, capability routing, runtime facts, and Agent Evaluation.
- `packages/neko-types`: only minimal shared resolver/write-target/provenance DTOs or existing Canvas catalog descriptors if current contracts are insufficient; no new Board format or Canvas profile.
- Generated output/content foundations: reuse `WORKSPACE_GENERATED_ASSET_ROOT = 'neko/generated'`, ResourceRef/content access, render projections, cleanup, and recovery diagnostics; do not add root-level `generated/`, `.neko/generated/`, or Board-local media storage.
- Assets and professional domains: Asset Library remains a curated catalog; Canvas/Cut/Audio may use stable generated sources without forced Asset registration. No generic promotion/upgrade framework is added.
- Existing valuable conversations, `.nkc` files, generated outputs, project assets, settings, trust state, and installed content must not be deleted. Existing Canvas files remain valid because `.nkc` schema does not change for Basic mode.
- No Rust Engine or Protobuf change is expected unless existing media projection contracts prove insufficient.
- Success means a creator can start or continue an Agent conversation without naming a Canvas, have Agent deterministically reuse or create `neko/boards/*.nkc`, receive Markdown/files/images/audio/video there automatically, and see only foundational entries in the default Basic panel while explicit professional workflows remain available elsewhere.
