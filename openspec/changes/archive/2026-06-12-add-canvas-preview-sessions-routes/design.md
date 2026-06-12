## Context

The existing Canvas playback layer projects `CanvasData` into `CanvasPlaybackPlan` through adapter-specific rules for storyboard, narrative, media-sequence, and generic graphs. The Preview bridge can now load a playback plan, but its panel lifecycle is still effectively singleton and the Preview runtime uses a single default route derived from `entryUnitIds[0]`.

This creates two separate problems:

- Preview panel lifecycle is coupled to one mutable bridge-level panel state, so different Canvas documents cannot own independent Preview sessions.
- Playback route selection is coupled to one default entry path, so a Canvas with multiple scenes, disconnected chains, or a selected single node cannot expose those choices in the Preview panel.

The design must preserve the existing boundaries:

- `@neko/shared` owns serializable playback contracts and pure projection helpers.
- VSCode-specific panel lifecycle and resource projection remain in the Extension Host.
- Preview webviews consume messages and runtime URLs but cannot call VSCode or read files directly.
- Runtime Preview URLs, media handles, active routes, timers, and branch selections must not be persisted to `.nkc`.

## Goals / Non-Goals

**Goals:**

- Support one isolated Preview session per Canvas document by default.
- Scope Preview webview readiness, pending messages, accepted revision, source Canvas URI, resource projections, and media handles to the owning session.
- Reject stale or cross-session messages through `sessionId`, `sourceCanvasUri`, and revision checks.
- Add route candidate contracts to `CanvasPlaybackPlan` without breaking existing `entryUnitIds` consumers.
- Add a shared effective-route resolver that centralizes compatibility behavior.
- Support route switching in the Preview panel for multiple scenes, groups, disconnected chains, and selected-node routes.
- Treat branch choice as runtime state inside the active route, not as pre-enumerated route candidates.
- Make Canvas editor close behavior explicit for visible, hidden, and stale Preview sessions.

**Non-Goals:**

- Do not persist route candidates, active route state, Preview URLs, media handles, or branch selections in `.nkc`.
- Do not support duplicate Preview panels for the same Canvas document by default.
- Do not replace the existing Canvas toolbar graph traversal controls.
- Do not enumerate every possible branch path ahead of time.
- Do not introduce `.nks`, `.story`, `.nkstory`, or any standalone story graph format.

## Decisions

### Decision 1: Manage Preview as Per-Canvas Sessions

`NarrativePreviewBridge` will evolve from singleton panel state into a session manager keyed by source Canvas URI.

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

Opening Preview for a Canvas reveals and refreshes that Canvas's session. Opening Preview for another Canvas creates or reveals a separate session.

Alternatives considered:

- Keep a single global Preview panel. Rejected because opening Preview from another Canvas overwrites source state and makes resource roots/media streams ambiguous.
- Always create a new Preview panel. Rejected because repeated opens for the same Canvas would create duplicate panels and duplicate media ownership without user intent.

### Decision 2: Session Manager Owns Revision Acceptance

Session revision is immutable from outside the session manager. Refreshing a session creates a new session snapshot or calls a dedicated manager method such as `acceptRevision(session, revision)`.

`acceptRevision` must be idempotent:

- Lower revisions are rejected.
- Equal revisions return the existing snapshot.
- Higher revisions produce a new accepted session snapshot.

Alternatives considered:

- Mutate `session.revision` directly from message handlers. Rejected because it lets unrelated handlers accidentally accept stale state and makes concurrent refresh tests harder.

### Decision 3: Add Session-Aware Message Envelopes

Canvas-to-Preview and Preview-to-Canvas messages that replace or route state should carry:

```ts
interface CanvasPreviewMessageEnvelope {
  readonly requestId: string;
  readonly sessionId: string;
  readonly sourceCanvasUri: string;
  readonly revision: number;
}
```

The Extension Host drops messages when identity does not match the owning session or when revision is stale for state-replacing messages.

Alternatives considered:

- Rely only on requestId and last accepted revision. Rejected because requestId does not prove which panel or Canvas document produced the message.

### Decision 4: Scope Resource Projection and Media Handles Per Session

Preview-specific plans must be generated for the target session webview. Runtime `previewUrl` values are webview-scoped and must not be shared between sessions.

Each session owns:

- `localResourceRoots` configured for its source Canvas.
- Webview URI projections.
- Pending resource variant requests.
- Active media playback handles.
- Disposal cleanup.

When an existing session is revealed, the Extension Host reconfigures resource access before generating the next Preview-specific plan.

Alternatives considered:

- Reuse a base playback plan containing projected URLs. Rejected because Webview URLs are scoped to a specific webview and can be invalid or unauthorized in another Preview panel.

### Decision 5: Add Route Candidates as an Additive Plan Contract

`CanvasPlaybackPlan` gains optional route candidates:

```ts
type CanvasPlaybackRouteSourceKind =
  | 'selection'
  | 'entry'
  | 'container'
  | 'scene'
  | 'component'
  | 'single-unit';

interface CanvasPlaybackRouteCandidate {
  readonly id: string;
  readonly title: string;
  readonly entryUnitId: string;
  readonly unitIds: readonly string[];
  readonly sourceKind: CanvasPlaybackRouteSourceKind;
  readonly sourceNodeId?: string;
  readonly totalDurationMs?: number;
  readonly diagnostics?: readonly CanvasPlaybackDiagnostic[];
}
```

Candidates are transient playback projection output. They are never saved to `.nkc`.

Alternatives considered:

- Replace `entryUnitIds` with `routeCandidates`. Rejected because existing consumers and tests rely on `entryUnitIds`.
- Encode routes only in Preview UI. Rejected because Story Preview, tests, exporters, and future runtimes need one shared route resolution contract.

### Decision 6: Centralize Compatibility in `resolveEffectiveCanvasPlaybackRoutes`

Shared code will expose a pure resolver that returns routes and plan-level diagnostics:

```ts
interface CanvasPlaybackRouteResolution {
  readonly routes: readonly CanvasPlaybackRouteCandidate[];
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
}

function resolveEffectiveCanvasPlaybackRoutes(
  plan: CanvasPlaybackPlan,
): CanvasPlaybackRouteResolution;
```

Rules:

1. Non-empty `routeCandidates` win after validation and deterministic sorting.
2. Empty `routeCandidates` return no routes and a diagnostic.
3. Missing `routeCandidates` derives one compatibility route from `entryUnitIds[0]` using existing first-transition traversal.

Alternatives considered:

- Return only `readonly CanvasPlaybackRouteCandidate[]`. Rejected because empty candidate diagnostics and route truncation diagnostics are plan-level concerns, not route-local concerns.
- Let every consumer choose fallback behavior. Rejected because that would recreate the current mismatch between Canvas Webview, Preview, Story Preview, and tests.

### Decision 7: Generate Bounded, Deterministic Route Candidates

Route generation order:

1. Selected node or selected container route.
2. Explicit entry routes.
3. Playable scene/group/container routes.
4. Disconnected playable component routes.
5. Single-unit fallback route.

Ordering within each category follows metadata, structure, spatial order, then id. The resolver caps returned candidates to 50 by default and emits a truncation diagnostic when it drops additional routes.

Alternatives considered:

- Enumerate all branch combinations as routes. Rejected because branch graphs can grow exponentially; branch choices belong to runtime state.
- Return all disconnected components without a cap. Rejected because large Canvas documents can overwhelm Preview UI and tests.

### Decision 8: Keep Route Choice and Branch Choice Separate

The Preview route switcher selects which playable chain is active. Branch buttons select an outgoing transition from the current active unit during playback.

Runtime state:

```ts
interface PreviewPlaybackState {
  readonly activeRouteId: string;
  readonly activeUnitId: string;
  readonly route: readonly string[];
  readonly branchSelections: Readonly<Record<string, string>>;
}
```

Switching route resets active unit, elapsed time, and branch selections. Selecting a branch appends or rewrites the active route history from the current unit.

Alternatives considered:

- Treat every branch as a separate route candidate. Rejected because it blurs authoring-level route selection with runtime choice and causes path explosion.

### Decision 9: Use Preview Panel Layout for Route Switching

Route switching belongs in the Preview panel, not the Canvas toolbar. The route switcher appears only when more than one effective route exists.

Recommended layout:

- Top narrow bar: Canvas title, route switcher, adapter/mode badges, stale-session badge.
- Main stage: image, media surface, script text, shot metadata, node content.
- Bottom transport: previous, play/pause, next, time, segmented route progress.
- Branch area: visible only when the current unit has multiple enabled outgoing transitions.

Alternatives considered:

- Put route switching in the Canvas toolbar. Rejected because route switching controls playback state and timing inside the Preview panel.
- Use toast for stale Preview state. Rejected because reconnect/close sequences can produce noisy repeated notifications; a top bar badge is stable and non-blocking.

## Risks / Trade-offs

- Session lifecycle complexity -> Keep session manager small and test it with injected clock and panel fakes.
- Cross-session resource leaks -> Key media handles by session panel and dispose them only when the owning session closes.
- Stale messages after rapid refresh -> Require sessionId/sourceCanvasUri/revision checks and idempotent revision acceptance.
- Route resolver divergence -> Make `resolveEffectiveCanvasPlaybackRoutes` the only supported fallback path and cover it in shared tests.
- Large Canvas route noise -> Cap route candidates at 50 and emit diagnostics.
- UI complexity -> Hide route switcher for zero or one route and keep branch controls contextual.

## Migration Plan

No persisted data migration is required.

1. Add optional route candidate contract and resolver helpers in shared code.
2. Populate route candidates at plan creation time while preserving `entryUnitIds`.
3. Update Preview UI to consume effective routes and fall back through the shared resolver.
4. Refactor Preview bridge into per-Canvas sessions.
5. Roll out session-scoped resource/media cleanup.

Rollback strategy: keep `entryUnitIds` compatibility and disable route switcher/session map behind the existing Preview feature gate if needed. Since route candidates are runtime-only, rollback does not require `.nkc` changes.

## Open Questions

- Should the route candidate cap be configurable after the initial default of 50?
- Should duplicate Preview panels for the same Canvas be exposed as a separate command later?
- Should stale sessions be allowed to reconnect only by URI match, or require a saved document identity token if custom editor lifecycles expose one later?
