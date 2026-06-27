## Context

The accepted ADR `docs/architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md` establishes that Canvas owns semantic playback order, Cut owns video editing timeline truth, and Agent only displays, confirms, and dispatches high-level actions. The latest decision further narrows Canvas preview to one Webview: editing and playback preview must live inside the same `neko.canvasEditor` Webview through a `PlaybackWorkspace`.

Current code has pieces of the desired model:

- `CanvasPlaybackPlan` already projects Canvas nodes, containers, connections, entries, transitions, route candidates, and diagnostics.
- Canvas already has an `openNarrativePreview` path and `NarrativePreviewBridge` that hosts a separate preview panel.
- Cut already has `neko.cut.importStoryboard` and a storyboard import path.
- Canvas/Cut already have `CanvasTimelineSyncPayload` for minimal Cut-to-Canvas metadata.
- Agent capability providers already expose Canvas and Cut import-related tools, but not the final same-Webview playback workspace contract.

This change turns those pieces into one canonical flow:

```text
CanvasData / .nkc
  -> CanvasPlaybackPlan
  -> Canvas Editor Webview PlaybackWorkspace
  -> Agent route card / confirmation
  -> CanvasCutDraftPayload
  -> Cut .nkv draft
```

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Canvas owns `.nkc`, playback plan projection, playback workspace UI, route session, route strip, and route-to-draft projection. Cut owns `.nkv`, clips, tracks, preview after import, and export. Agent owns route summaries, confirmation cards, and capability dispatch. Extension Host owns Webview reveal, file/resource authorization, stale diagnostics, and cross-package commands. |
| Dependency | `@neko/shared`/`neko-types` can define DTOs and pure projection helpers. Canvas Webview cannot import Cut internals or VS Code API. Cut Webview cannot import Canvas internals. Extension Host coordinates via commands/contracts, not high-frequency UI proxying. Agent runtime stays host-agnostic and uses capability providers. |
| Interface | Contracts are `CanvasPlaybackPlan`, `CanvasCutDraftPayload`, `CanvasTimelineSyncPayload`, Canvas Webview messages such as `playback:revealWorkspace`, and Agent/Cut capabilities such as `canvas.revealPlaybackWorkspace` and `cut.importCanvasDraft`. Unknown schema/version/namespace keys fail visibly. |
| Extension | Future Canvas playback modes add adapters to `CanvasPlaybackPlan` or route-strip renderers. Future Cut import modes consume `CanvasCutDraftPayload` through adapters. Future shared UI primitives can be extracted only when they remain domain-neutral. |
| Testing | Shared contract tests cover plan/cache/draft/sync validation. Canvas Webview tests cover route strip/session/focus/keyboard/media lifecycle. Extension tests cover same-Webview reveal and stale detection. Cut tests cover draft import and source mapping. Agent tests cover read-only vs confirmation-gated capabilities. Runtime smoke uses VS Code Extension Development Host. |
| Proportionality | No new daemon, server, cloud sync, collaborative editing, or generalized timeline protocol is introduced. The abstractions are limited to one local Webview workspace, one draft DTO, and capability dispatch. |
| Fail-visible behavior | Stale plan revision, missing route, invalid route, missing media source, illegal extension namespace, unknown draft version, unavailable Canvas editor, missing Cut target, and legacy separate-preview path hit must return diagnostics or throw in tests, not silently fall back. |

## Goals / Non-Goals

**Goals:**

- Merge Canvas editing and playback preview into one `neko.canvasEditor` Webview.
- Add `PlaybackWorkspace` with independent visibility for Canvas pane, playback stage, and route strip.
- Keep `CanvasPlaybackPlan` as the single order projection.
- Replace default separate Canvas Preview Webview reveal/open with same-Webview workspace reveal/focus.
- Define `CanvasCutDraftPayload` and route-to-draft projection.
- Allow Agent to display route summaries and dispatch reveal/import/reorder actions without owning playback.
- Preserve Cut timeline authority after draft import.
- Validate keyboard/focus, resource lifecycle, and media authorization in VS Code Webview runtime.

**Non-Goals:**

- Add Cut-style editing tools to Canvas route strip.
- Add multi-track editing, trim handles, transition editing, subtitle editing, or export settings to Canvas.
- Make Agent play videos or own playhead state.
- Implement live bidirectional Canvas/Cut timeline sync.
- Move preview playback into a generic browser-only runtime.
- Support arbitrary external draft extension keys.

## Decisions

1. **Single Canvas Editor Webview for editing and preview**
   - `PlaybackWorkspace` lives inside `CanvasApp`/Canvas Webview and can be revealed from toolbar, Agent, commands, or route actions.
   - The previous separate preview Webview becomes a migration source, not a runtime destination.
   - Alternative considered: keep both same-Webview and separate preview paths. Rejected because it leaves two playback lifecycles and weakens focus/route consistency.

2. **PlaybackWorkspace owns session state, not order truth**
   - `PlaybackSession` stores current route, current unit, playhead, isPlaying, visibility, and focus.
   - `.nkc` stores durable playback intent through existing playback metadata and ordering fields.
   - Alternative considered: persist selected route id as route-strip state. Rejected because it creates another order/session fact unless implemented as explicit playback intent metadata.

3. **Route strip is a playback navigator, not a timeline editor**
   - Route strip supports route display, current segment highlight, click-to-jump, diagnostics, branch markers, and optional route selection.
   - Reorder, if implemented, dispatches Canvas graph reorder commands and regenerates `CanvasPlaybackPlan`.
   - Alternative considered: direct segment array mutation. Rejected because it creates `timelineOrder`.

4. **Draft handoff uses a narrow snapshot DTO**
   - `CanvasCutDraftPayload` contains source canvas URI/revision, route id, ordered units, source mapping, durations, media references, cues, and namespaced extensions.
   - It does not contain Cut tracks, clips, effects, export settings, Webview URIs, or runtime tokens.
   - Alternative considered: pass `CanvasPlaybackPlan` directly to Cut. Rejected because it leaks Canvas branching/preview diagnostics into Cut timeline semantics.

5. **Agent dispatches owning surfaces**
   - Agent route cards can show summaries, thumbnails, diagnostics, and buttons.
   - Buttons call reveal/import/reorder capabilities; Canvas/Cut/Preview own playback.
   - Alternative considered: embed a video player in Agent Chat. Rejected because it duplicates media authorization, focus, stream, and playhead lifecycle.

6. **Stale and resource lifecycle are first-class**
   - Plan/draft must carry source revision/hash and resource/projection revision where enriched metadata is used.
   - `PlaybackWorkspace` hides/loses focus/stale session must pause, release, or downgrade media resources.
   - Alternative considered: rely on Webview disposal. Rejected because the merged Webview can hide playback without disposing.

## Risks / Trade-offs

- [Risk] Merging preview into Canvas Webview increases keyboard/focus complexity. -> Mitigation: explicit focus owner, shortcut suppression/passthrough tests, and VS Code runtime smoke.
- [Risk] Existing `NarrativePreviewBridge` code is large and tempting to keep as fallback. -> Mitigation: poison legacy path in new acceptance tests and migrate reusable rendering logic into Webview components or pure helpers.
- [Risk] Route strip evolves into a mini Cut timeline. -> Mitigation: specs prohibit track/clip/trim/effect/subtitle/export editing and require graph reorder commands for ordering changes.
- [Risk] Draft DTO lacks future Cut import metadata. -> Mitigation: namespaced extension bag with strict key validation for low-risk metadata, while timeline semantics require explicit fields.
- [Risk] Plan cache becomes stale due to external media changes. -> Mitigation: base plan caches only durable references; preview enrichment caches include ResourceRef/Asset/ContentAccess revision keys.
- [Risk] Agent confirmation policy is too vague. -> Mitigation: capability tests distinguish read-only reveal/query, confirmation-gated import, and explicit-user-instruction reorder.
- [Risk] Runtime media cleanup is missed when workspace is hidden but Webview remains alive. -> Mitigation: explicit lifecycle hooks for hidden, blur, route change, stale session, and dispose.

## Migration Plan

1. Add shared DTOs and tests for `CanvasCutDraftPayload`, namespaced extensions, source mapping, stale revision, and route projection.
2. Extract or recreate same-Webview playback components from the existing preview runtime:
   - `PlaybackWorkspace`
   - `PlaybackStage`
   - `PlaybackRouteStrip`
   - `PlaybackSession`
3. Wire Canvas toolbar and command handling to reveal/focus `PlaybackWorkspace` inside the active Canvas Editor Webview.
4. Migrate preview resource resolution and media playback requests into the same-Webview message path.
5. Replace default `openNarrativePreview` behavior with `revealPlaybackWorkspace`; keep any old command only as a fail-visible migration shim until all callers move.
6. Add Canvas route-to-draft projection and Cut import adapter for `CanvasCutDraftPayload`.
7. Add Agent capability provider entries and route-card projections.
8. Remove or disable separate Canvas Preview Webview runtime as a success path.
9. Validate with focused unit/contract tests and VS Code Webview runtime smoke.

Rollback is package-local before deletion: the old separate preview command can be restored only if no project data migration has occurred. Once the legacy path is poisoned/removed, rollback means reverting this change. No `.nkc` or `.nkv` project-file migration should be required.

## Open Questions

- Should selected default route become a new durable playback metadata field, or should durable intent remain only entry/order/edge priority for this change?
- Should the first implementation support drag reorder in the route strip, or defer reorder to command/Agent flows until preview navigation is stable?
- Should `CanvasCutDraftPayload` initially replace `neko.cut.importStoryboard`, or should Cut expose `neko.cut.importCanvasDraft` while storyboard import remains as a compatibility command?
