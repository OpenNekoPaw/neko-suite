## 1. Preview Shell Layout

- [x] 1.1 Replace the current Canvas playback Preview markup with player-shell landmarks: stage, stage overlay, bottom controls, segmented timeline, and secondary inspector container.
- [x] 1.2 Remove the default fixed top toolbar layout and keep unit title/status/actions as compact stage overlays.
- [x] 1.3 Make the player shell fill the Preview panel, keep loading/empty/error states bounded, and preserve responsive behavior for narrow VSCode editor columns.

## 2. Bottom Controls And Segmented Timeline

- [x] 2.1 Move previous, play/pause, next, current time, total time, and route position into the bottom control area.
- [x] 2.2 Replace separate `stage-progress` and numeric `unit-timeline` rows with one segmented route timeline.
- [x] 2.3 Support segment activation for unit jump/seek while stopping or preserving playback according to the current advance policy.
- [x] 2.4 Keep auto-play disabled for unsupported `user-input` or condition-driven plans and expose reachable next/choice actions.

## 3. Stage Renderers

- [x] 3.1 Add renderer dispatch by `CanvasPlaybackUnit.kind` and `CanvasPlaybackUnit.renderMode` inside the Preview stage.
- [x] 3.2 Render media/image units through host-resolved preview source data or an explicit unavailable state.
- [x] 3.3 Render storyboard shot/scene units with visual candidate, action/dialogue/script text, and stable fallback summary.
- [x] 3.4 Render narrative and generic node/container units with bounded summaries and Canvas source-node highlighting.

## 4. Inspector, Branches, And Diagnostics

- [x] 4.1 Move Info, Branches, Diagnostics, adapter/mode/policy, source node, and resource details into secondary drawer/popover surfaces.
- [x] 4.2 Show branch choices as playback decisions near the stage or controls when interactive playback pauses.
- [x] 4.3 Keep diagnostics visible through an affordance without permanently shrinking the main stage.

## 5. Runtime Boundaries And Bridge Behavior

- [x] 5.1 Preserve existing `preview:loadPlaybackPlan`, `preview:refreshPlaybackPlan`, `preview:jumpTo`, `canvas:highlightNode`, `canvas:highlightPath`, and `canvas:choiceMade` bridge messages.
- [x] 5.2 Ensure player layout state, current time, route history, resolved Webview URLs, object URLs, and media element state are not written back to `.nkc`.
- [x] 5.3 Keep resource resolution and cache materialization fixes out of this change except for explicit unavailable states in stage renderers.

## 6. Tests And Quality Gates

- [x] 6.1 Update `narrativePreviewBridge` tests to assert player-shell landmarks, bottom controls, segmented timeline, and absence of a permanent right inspector in the default layout.
- [x] 6.2 Add tests for interactive branch display, timeline segment activation, unsupported auto-play state, and diagnostics drawer affordance.
- [x] 6.3 Add tests or source assertions that no resolved runtime URLs or playback UI state are serialized into Canvas data.
- [x] 6.4 Run focused Canvas extension tests for the Preview bridge and protocol behavior.
- [x] 6.5 Run the Canvas extension build and copy step needed for local VSCode extension verification.
- [x] 6.6 Perform Neko quality self-review against the repository quality gates and record residual risks.

## 7. Internationalization

- [x] 7.1 Route Canvas playback Preview panel title, controls, status text, inspector labels, empty states, and metadata labels through VSCode localization resources.
- [x] 7.2 Inject locale attributes and a serialized localization dictionary into the Preview Webview without adding Webview-side VSCode API access.
- [x] 7.3 Add focused tests for localized HTML shell text, locale attributes, and runtime localization dictionary injection.
