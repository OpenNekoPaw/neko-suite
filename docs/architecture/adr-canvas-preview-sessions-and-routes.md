# ADR: Canvas Preview Sessions And Multi-Route Playback

- **Status**: Proposed
- **Date**: 2026-06-10
- **Scope**: neko-canvas, @neko/shared Canvas playback contracts
- **Related**: `adr-canvas-preview-boundary.md`, `adr-canvas-interactive-narrative.md`, `adr-canvas-connection-projection.md`, `local-resource-access.md`

---

## Context

Canvas Preview is evolving from a narrative-only preview into a general playback surface for storyboard scenes and shots, media sequences, script references, text, images, audio, video, and generic Canvas nodes.

The current implementation has two important limitations:

1. Preview panel state is effectively singleton. A single `NarrativePreviewBridge` owns one `WebviewPanel`, one active `sourceCanvasUri`, one pending-message queue, and one ready flag.
2. Playback route selection is single-entry. The Preview UI starts from `CanvasPlaybackPlan.entryUnitIds[0]` and follows the first sorted outgoing transition unless an interactive branch requires user choice.

This is sufficient for a single active Canvas and a single linear route, but it is ambiguous for:

- Multiple Canvas documents opened side by side.
- A user opening Preview for more than one Canvas.
- A Canvas containing multiple disconnected playable chains.
- A Canvas containing several scenes, groups, or independent storyboard sequences.
- A single selected node that should be previewed directly.
- Branching graphs where route choice and branch choice are different concepts.

## Decision

Separate the design into two orthogonal layers:

1. **Preview Session Layer**: manages one or more Preview webview panels and isolates each panel by source Canvas document.
2. **Playback Route Layer**: projects one Canvas playback plan into one or more route candidates and lets the Preview UI switch the active route.

The layers are intentionally independent:

```text
Canvas document
  -> Preview session(s)
      -> CanvasPlaybackPlan
          -> CanvasPlaybackRouteCandidate[]
              -> active route
                  -> branch choices during playback
```

Opening multiple Preview panels must not change how routes are computed. Having multiple routes in one Canvas must not require multiple Preview panels.

## Preview Session Model

### Default Policy

The default policy is **one Preview session per Canvas document**.

| User action | Behavior |
| --- | --- |
| Open Preview from Canvas A, no session exists | Create a Preview panel for Canvas A. |
| Open Preview from Canvas A again | Reveal and refresh Canvas A's existing Preview panel. |
| Open Preview from Canvas B | Create or reveal Canvas B's own Preview panel. |
| Close Canvas A Preview | Dispose only Canvas A's Preview session resources. |
| Close Canvas A editor | Dispose or mark stale Canvas A's Preview session according to existing editor lifecycle policy. |

This preserves the common VSCode mental model: the Preview belongs to the document that opened it.

### Session State

`NarrativePreviewBridge` should evolve from single-panel fields into a session manager:

```ts
interface CanvasPreviewSession {
  readonly sessionId: string;
  readonly sourceCanvasUri: string;
  readonly panel: vscode.WebviewPanel;
  readonly createdAt: number;
  readonly revision: number;
  webviewReady: boolean;
  pendingMessages: CanvasToPreviewMessage[];
  activeRouteId?: string;
}
```

Suggested storage:

```ts
private readonly sessionsByCanvasUri = new Map<string, CanvasPreviewSession>();
private readonly sessionsByPanel = new WeakMap<vscode.WebviewPanel, CanvasPreviewSession>();
```

The bridge should no longer keep panel-wide `sourceCanvasUri`, `pendingMessages`, or `previewWebviewReady` fields outside a session.

Session revision is controlled only by the session manager. Callers must not mutate it directly. A refresh creates a new session state object or uses a dedicated manager method such as `acceptRevision(session, revision)`, which returns the next immutable session snapshot. This prevents unrelated message handlers from accidentally accepting stale Preview state.

### Canvas Editor Lifecycle

When the owning Canvas editor is closed, the Preview session must not continue pretending to be live.

Default behavior:

1. If the Preview panel is visible, mark the session as stale and show a non-blocking stale-state message in the Preview UI.
2. If the Preview panel is hidden, dispose it immediately.
3. If the stale Preview is not reattached to a reopened Canvas document within a short grace period, dispose it and release media streams.

The initial grace period should be conservative, for example 30 seconds, and should be implemented through the session manager so tests can inject a deterministic clock.

### Message Envelope

Preview messages should carry session identity and source identity:

```ts
interface CanvasPreviewMessageEnvelope {
  readonly requestId: string;
  readonly sessionId: string;
  readonly sourceCanvasUri: string;
  readonly revision: number;
}
```

The Extension Host must drop stale or mismatched messages when:

- `sessionId` does not match the receiving panel.
- `sourceCanvasUri` does not match the session's Canvas document.
- `revision` is older than the session's accepted revision for state-replacing messages.

### Resource And Media Isolation

Preview URLs are webview-scoped. A `previewUrl` generated for one Preview panel must not be reused by another panel.

Each session must own:

- Its own `localResourceRoots`.
- Its own `webview.asWebviewUri()` projections.
- Its own pending variant requests.
- Its own active media playback handles.
- Its own cleanup path on panel disposal.

When an existing session is revealed and refreshed, the Extension Host must reconfigure the webview resource access for the session's `sourceCanvasUri` before generating a new Preview-specific `CanvasPlaybackPlan`.

This keeps the Canvas editor resource path, cache path, document archive path, and engine media stream ownership aligned with the Preview panel that consumes them.

### Optional Future: Duplicate Preview For One Canvas

The default is one Preview per Canvas. A future explicit command may support duplicate Preview panels for the same Canvas, for example "Open Preview To Side". That requires session keys to include both `sourceCanvasUri` and `sessionId`.

This is not the default because it complicates branch state, media stream ownership, and resource cleanup without solving the primary workflow.

## Playback Route Model

### Route Candidate Contract

`CanvasPlaybackPlan` should support optional route candidates. This is additive and does not break consumers that only understand `entryUnitIds`.

```ts
export type CanvasPlaybackRouteSourceKind =
  | 'selection'
  | 'entry'
  | 'container'
  | 'scene'
  | 'component'
  | 'single-unit';

export interface CanvasPlaybackRouteCandidate {
  readonly id: string;
  readonly title: string;
  readonly entryUnitId: string;
  readonly unitIds: readonly string[];
  readonly sourceKind: CanvasPlaybackRouteSourceKind;
  readonly sourceNodeId?: string;
  readonly totalDurationMs?: number;
  readonly diagnostics?: readonly CanvasPlaybackDiagnostic[];
}

export interface CanvasPlaybackPlan {
  readonly routeCandidates?: readonly CanvasPlaybackRouteCandidate[];
}
```

The route candidate is a playback projection, not persisted Canvas state. It should be recomputed from `CanvasData`, playback metadata, adapter behavior, selected node context, and deterministic ordering rules.

Consumers should not hand-roll fallback precedence between `routeCandidates` and `entryUnitIds`. Shared code must expose a pure helper:

```ts
export function resolveEffectiveCanvasPlaybackRoutes(
  plan: CanvasPlaybackPlan,
): readonly CanvasPlaybackRouteCandidate[];
```

Resolution rules:

1. If `plan.routeCandidates` is present and non-empty, return it after validation and deterministic sorting.
2. If `plan.routeCandidates` is present but empty, return an empty list and surface a diagnostic.
3. If `plan.routeCandidates` is absent, derive one compatibility route from `entryUnitIds[0]` using the current first-transition traversal behavior.

Preview UI, Story Preview, tests, and future exporters should consume this helper rather than reimplementing compatibility behavior.

### Candidate Generation

Route candidates are generated in this order:

1. **Selection route**: if a selected node or selected container can be played, create a route starting from it.
2. **Explicit entries**: each valid `entryUnitIds` item creates a route.
3. **Container routes**: scenes, groups, and other playable containers create routes for their playable descendants.
4. **Connected components**: disconnected playable subgraphs create independent route candidates.
5. **Single-unit fallback**: a single playable node creates a one-unit route.

The route resolver should not enumerate every possible branch combination. Branching is handled at runtime by the active route state.

Candidate generation should cap the number of returned routes. The default cap is 50 route candidates per plan. If more routes are discovered, the resolver keeps the first 50 after deterministic ordering and emits a diagnostic that reports the truncated count. This prevents large canvases with many disconnected playable components from overwhelming the Preview UI.

### Route Ordering

Route ordering must be deterministic:

1. Selection route first.
2. Explicit playback metadata order.
3. Start node or zero in-degree playable node.
4. Container child order.
5. Spatial order, top to bottom then left to right.
6. Stable `id` lexical order.

This mirrors Canvas's existing principle: metadata wins, then structure, then spatial fallback, then stable id fallback.

### Route Resolution

For each candidate:

- `linear` mode follows the highest-priority enabled transition.
- `manual` mode builds the same route but requires user input to advance.
- `interactive` mode starts at the candidate entry and stops when multiple enabled outgoing transitions require a choice.
- `media-ended` advance policy waits for media completion before advancing.
- Cycles are guarded by a visited set and reported as diagnostics instead of infinite playback.

### Single Node Behavior

A single playable node is a valid route:

- `routeCandidates.length === 1`.
- `unitIds.length === 1`.
- Previous and Next controls are disabled.
- Play runs until `durationMs`, media-ended, or user stop.
- If the node has no renderable media source, the stage shows its text, script, metadata, or diagnostics.

This avoids special-case Preview code for selected shots, selected media nodes, script nodes, or generated/reference image nodes.

## Branch Choice Versus Route Choice

Route choice and branch choice are different UI concepts:

| Concept | Scope | Example | UI |
| --- | --- | --- | --- |
| Route choice | Select one playable chain in the Canvas | Scene 1, Scene 2, Shot list A, Media sequence B | Route switcher |
| Branch choice | Select one outgoing transition during playback | Choice A or Choice B from the current node | Branch buttons |

The route switcher changes the active route and resets playback state. Branch buttons append or rewrite the active route history from the current unit.

Runtime state:

```ts
interface PreviewPlaybackState {
  readonly activeRouteId: string;
  readonly activeUnitId: string;
  readonly route: readonly string[];
  readonly branchSelections: Readonly<Record<string, string>>;
}
```

`branchSelections` maps `sourceUnitId` to the selected transition id. This lets the Preview reconstruct a user-chosen path without mutating the underlying `CanvasPlaybackPlan`.

## Preview UI Layout

Playback controls belong in the Preview panel, not in the Canvas toolbar.

Recommended layout:

```text
Top narrow bar:
  Canvas title / Route switcher / Adapter + mode badges

Main stage:
  Image, video surface, audio visualization, script text, shot metadata, node content

Bottom transport:
  Previous / Play-Pause / Next
  Current time / total time
  Segmented route progress

Branch area:
  Visible only when the current unit has multiple enabled outgoing transitions
```

The route switcher is conditional:

- Hidden when there is zero or one route candidate.
- Shown when there are multiple route candidates.
- Labels come from route candidate `title`, localized by the Preview UI when generated from system-owned labels.

The Canvas toolbar may keep a lightweight graph traversal control for node highlighting, but immersive playback, timing, branch choices, media state, and route switching belong to the Preview panel.

## Compatibility

Existing consumers can continue using:

- `CanvasPlaybackPlan.entryUnitIds`
- `CanvasPlaybackPlan.units`
- `CanvasPlaybackPlan.transitions`

If `routeCandidates` is absent, Preview derives a compatibility route from `entryUnitIds[0]` using current behavior through `resolveEffectiveCanvasPlaybackRoutes(plan)`.

If `routeCandidates` exists but is empty, Preview reports a diagnostic and does not enable playback.

## Implementation Plan

The route work and session work are independent and may be implemented in parallel.

Route track:

1. Add shared route candidate contract and `resolveEffectiveCanvasPlaybackRoutes(plan)` in `@neko/shared`.
2. Add the pure route resolver and route candidate cap diagnostics.
3. Extend plan creation to populate `routeCandidates` for storyboard, media-sequence, narrative, and generic adapters.
4. Update Preview HTML/UI to keep `activeRouteId`, render a conditional route switcher, and reset playback when the route changes.
5. Pass selected node context from Canvas to Preview when opening from the Canvas toolbar.

Session track:

1. Refactor `NarrativePreviewBridge` into a per-canvas session manager.
2. Move ready state, pending messages, accepted revision, and source Canvas URI into `CanvasPreviewSession`.
3. Add session-aware message envelopes and stale-message rejection.
4. Ensure Preview-specific resource projection is generated per session webview.
5. Ensure media streams are tracked and disposed per session panel.
6. Implement Canvas editor close handling: visible sessions become stale; hidden sessions dispose; stale sessions expire after the grace period.

## Testing Strategy

Unit tests:

- Route candidates are generated for multiple entry nodes.
- Disconnected playable components become separate route candidates.
- Selected node route is first when selected context is provided.
- Single playable node produces a valid one-unit route.
- Interactive branch choices do not create exponential route candidates.
- Route candidates are capped and produce a truncation diagnostic when the cap is exceeded.
- `resolveEffectiveCanvasPlaybackRoutes(plan)` follows the routeCandidates/entryUnitIds compatibility rules.
- Cycle diagnostics are emitted and playback route generation terminates.

Extension tests:

- Opening Preview for two Canvas documents creates two isolated sessions.
- Reopening Preview for the same Canvas reveals and refreshes the existing session.
- Stale Preview messages are dropped by `sessionId`, `sourceCanvasUri`, and `revision`.
- Preview resource roots are configured per source Canvas.
- Media handles are disposed when only their owning Preview panel closes.
- Closing a Canvas editor marks visible Preview sessions stale and disposes hidden sessions.
- Stale Preview sessions expire after the configured grace period.

Webview tests:

- Route switcher appears only when multiple routes exist.
- Switching route resets active unit, elapsed time, and branch selections.
- Branch selection updates the active route history without changing route candidates.
- Single-node route disables Previous and Next.
- Timer and media-ended policies continue to work after route switching.

Manual validation:

- Open Preview for Canvas A and Canvas B side by side.
- Verify Canvas A Preview shows only Canvas A assets and Canvas B Preview shows only Canvas B assets.
- Verify image, audio, and video resources still load after switching between Canvas editors.
- Verify multiple storyboard scenes can be selected from the route switcher.
- Verify a selected shot can be previewed as a single route.

## Consequences

Benefits:

- Multiple Canvas previews no longer overwrite one another.
- Resource access and media playback ownership are isolated per Preview panel.
- Multi-scene and multi-chain Canvas documents are playable without requiring graph rewrites.
- Single-node preview becomes a first-class behavior.
- Branching remains runtime state, avoiding path explosion.

Costs:

- Bridge lifecycle becomes more complex because it manages sessions rather than a single panel.
- Preview messages require stronger identity fields.
- Route state must be preserved and reset deliberately when plans refresh.
- Tests must cover both session isolation and route projection.

## Non-Goals

- Persisting route candidates into `.nkc`.
- Replacing Canvas graph editing controls with Preview playback controls.
- Enumerating every possible branch path ahead of time.
- Supporting duplicate Preview panels for the same Canvas by default.
- Introducing `.nks`, `.story`, or standalone story graph formats.
