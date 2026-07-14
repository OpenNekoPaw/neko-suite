## Context

`neko-audio` already has the correct host shape for a VS Code-integrated audio editor:

- top transport bar for playback, BPM, meter, speed, volume, and zoom;
- left toolbar for command shortcuts;
- central multi-track timeline;
- compact bottom mixer band;
- right dock with basic/professional modes;
- existing Engine-backed audio probe, waveform, stream, recording, analysis, effect, mix stream, and mix export paths.

The gap is the creator workflow layer. A lightweight AI DAW needs the common editing, AI repair, inspection, review, and export controls to be visible at the point of action. It should not copy openDAW's full browser, device ecosystem, MIDI editor, plugin host, and large mixer surface because `neko-audio` is embedded inside VS Code and shares space with Explorer, Agent, command palette, and local project files.

### Five-layer analysis

Responsibility:

- `neko-audio` Webview owns visual selection state, timeline tool mode, panel focus, compact component layout, and user interaction.
- `audioProjectStore` remains the authority for editable `.nka` project facts already represented as `AudioProjectData`, timeline tracks/elements, track mix, automation, markers, undo/redo, and AI highlights.
- Extension Host remains the authority for document sessions, file picker/import routing, dirty/save lifecycle, command registration, and Engine request orchestration.
- Rust Engine remains the authority for probe, waveform, PCM stream, recording, loudness/silence analysis, DSP/effects, mix stream, and mix export.
- Agent and audio tools may request edits, but applied project mutations still enter through the existing Extension-owned project session gateway and `project:sync` path.

Dependency:

- New Webview components stay in `packages/neko-audio/packages/webview`.
- Components reuse `@neko/ui` primitives, icons, workbench shell, context menu, focus, and property row patterns where available.
- Domain state stays typed in `neko-audio`; `@neko/ui` must not learn audio track, clip, effect, marker, loudness, or AI operation semantics.
- Webview does not import `vscode`, read local files directly, or construct project mix configs.
- Extension does not import React; it may only focus panels or route existing commands/messages.

Interface:

- Component actions target existing project operations (`track.*`, `element.*`, `track.mix.*`, `audio.effect.*`, `audio.marker.*`) or existing `audio:*` / `project:*` messages where possible.
- New UI-only state uses explicit local store fields such as selected clip/region ids, active timeline tool, active right-dock panel, pending AI review item, and selected inspector scope.
- If a new Webview/Extension message is needed, it must be narrowly scoped, typed, guarded, and fail visibly for unknown actions or invalid payloads.
- AI result review tracks stable affected track, element, effect, marker, or operation ids. It must not store Webview URIs, blob URLs, cache paths, or temporary absolute paths as durable identity.

Extension:

- Adding another common audio action should require adding one action descriptor and one handler path, not duplicating buttons across toolbar, selection action bar, context menu, and AI panel.
- Right dock panels should compose small typed audio panels rather than route everything through a generic schema adapter.
- Basic and professional modes share the same project facts; mode changes only alter component visibility and detail level.
- Components can later be promoted to `@neko/ui` only when they become low-semantic visual primitives useful across creative domains.

Testing:

- Unit tests cover selectors, action descriptors, mode gating, invalid selection diagnostics, AI review state, and operation routing.
- Component tests cover empty/import strip, selection action bar, inspector scope switching, AI panel queue/review, effects mini rack, markers panel, and master/loudness strip.
- Existing project store tests cover operation application and undo/redo effects.
- Webview functional acceptance uses Extension Development Host plus `vscode-extension-debugger` for layout, keyboard/focus, dock resizing, VS Code theme behavior, authoritative results, and runtime error gates.

## Goals / Non-Goals

**Goals:**

- Make `neko-audio` feel like a focused lightweight AI DAW without leaving the VS Code host model.
- Add the components users need most often: selection actions, inspector, AI operation panel, timeline tool mode bar, add/import strip, markers/regions, effects mini rack, compact master/loudness, and AI result compare.
- Keep common actions reachable from the timeline or right dock, not hidden only in command palette or toolbar icons.
- Preserve one canonical `.nka` project state and one Engine-backed processing path.
- Keep basic mode quick and approachable while letting professional mode expose more precise controls.

**Non-Goals:**

- Do not clone openDAW's full standalone DAW layout.
- Do not add a full plugin browser, plugin hosting runtime, large device graph, MIDI piano roll, multi-window mixer, routing matrix, marketplace browser, or sample library manager.
- Do not add new `.nka` schema fields unless an existing project operation cannot represent the behavior.
- Do not add new Rust Engine actions for UI-only workbench organization.
- Do not route local file reads or device access directly through Webview.

## Decisions

### Decision 1: Component set is action-first, not browser-first

Add these components:

| Component | Placement | Mode | Purpose |
| --------- | --------- | ---- | ------- |
| `SelectionActionBar` | floating or pinned above timeline selection | basic + professional | Split, trim, fade, gain, denoise, normalize, silence removal, transcribe/alignment entry, send to AI |
| `TimelineToolModeBar` | compact row near timeline ruler or left rail extension | professional, reduced basic subset | Select, split, trim, fade, gain, marker, automation |
| `AudioInspectorPanel` | right dock | basic + professional | Clip, track, region, marker, and master properties based on current selection |
| `AudioAiOperationPanel` | right dock | basic + professional | AI quick actions, natural language input, operation queue, affected item highlights |
| `AddSourceStrip` | empty timeline and track footer | basic + professional | Import file, record, add track, add from VS Code selection, generate with AI |
| `MarkersRegionsPanel` | right dock and timeline marker lane | professional, read-only summary in basic | Structure navigation and issue/review regions |
| `EffectsMiniRack` | inspector/right dock | basic + professional | Common track/master effects chain with presets and compact parameter rows |
| `MasterLoudnessStrip` | compact mixer/master area and export panel summary | basic + professional | Peak/LUFS/clipping/export readiness |
| `AiResultCompare` | right dock review area or modal-like panel | basic + professional | A/B original vs processed result, apply/revert, diff listen where available |

Rationale: these components support the common local AI audio workflow from selection to review/export. They reuse VS Code file navigation and avoid opening a large standalone asset browser.

Rejected alternative: add an openDAW-style left browser and device area first. That would consume scarce VS Code editor width and optimize for plugin/sample exploration before the existing AI cleanup and edit loops are complete.

### Decision 2: Right dock becomes a task stack, not a generic panel bucket

The existing basic/professional right dock remains. It should present a task stack:

- basic mode: AI, Inspector, Presets, Recording, Export;
- professional mode: AI, Inspector, Effects, Markers/Regions, Recording, Export, Presets.

Panel content uses typed audio components. Generic property schemas are only used if a real runtime/provider schema exists.

Rationale: users need task-oriented panels, while the existing mode switch already gives the right level of progressive disclosure.

Rejected alternative: make one large "Professional" panel with all controls. That would recreate openDAW density inside a narrow VS Code dock and make basic mode feel incomplete.

### Decision 3: Selection is the primary command context

Timeline selection drives:

- visible selection actions;
- inspector scope;
- AI quick action target;
- effects target when unambiguous;
- A/B review target;
- command availability diagnostics.

No selected clip or region means actions either target the project/master explicitly or are disabled with visible labels/tooltips.

Rationale: selection-first interaction is the fastest path for a lightweight DAW and allows keyboard shortcuts, toolbar buttons, and context menus to reuse one command availability model.

Rejected alternative: rely on global toolbar actions and command palette. That hides why an operation is enabled, what it targets, and whether an AI result will modify a clip, track, or master chain.

### Decision 4: AI operations are reviewable edits, not invisible background magic

AI quick actions and natural-language requests create visible pending/running/completed/failed operation items. Completed operations that alter audio, effects, markers, or tracks must expose affected ids and allow review before the user commits a destructive or render-affecting change when the flow is previewable.

Rationale: AI DAW behavior must be auditable. Existing AI highlights already point in this direction; the new panel makes the operation lifecycle explicit.

Rejected alternative: run AI actions as one-click mutations only. That is faster for demos but weak for user trust and makes undo/review harder to explain.

### Decision 5: Keep the mixer compact, but strengthen master and selected-track controls

The bottom mixer remains compact. Professional precision lives in selected-track inspector, effects mini rack, and master/loudness strip. A larger mixer can remain a future professional dock only if real routing/send/bus requirements outgrow the compact strip.

Rationale: VS Code editor height is limited, and the common AI DAW tasks are cleanup, edit, review, and export readiness rather than full mix engineering.

Rejected alternative: replace the bottom strip with an openDAW-style vertical mixer. That would dominate the editor and make the timeline harder to use inside VS Code.

### Decision 6: Use fail-visible UI state and message handling

Unknown action ids, invalid selection targets, unsupported effect parameters, stale AI result ids, unknown panel ids, and unregistered timeline tools must fail with visible diagnostics or test failures. They must not silently no-op or return success.

Rationale: this repo is prelaunch and already favors canonical paths over compatibility fallbacks. Workbench components should expose contract mistakes early.

Rejected alternative: hide unavailable actions with broad guards. That can mask missing handlers and make new UI paths appear complete when they are not wired.

## Risks / Trade-offs

- [Risk] Too many new panels can make the right dock crowded. -> Mitigation: task stack ordering, mode gating, compact rows, and selection-driven context keep panels focused.
- [Risk] Selection action bar duplicates toolbar/context menu actions. -> Mitigation: centralize action descriptors and route all surfaces through the same handlers.
- [Risk] AI operation review may require preview data that some Engine/provider paths do not expose yet. -> Mitigation: support review states explicitly: previewable, apply-only, failed, and unsupported; do not fake A/B when no preview exists.
- [Risk] Light theme continues to look less DAW-like than dark openDAW screenshots. -> Mitigation: improve semantic density and audio-specific visual hierarchy while preserving VS Code theme tokens and high-contrast support.
- [Risk] Component scope can drift into a full DAW clone. -> Mitigation: keep the non-goals in task review and defer plugin browser, device graph, piano roll, and routing matrix.
- [Risk] Webview runtime behavior can differ from Vite/browser validation. -> Mitigation: require VS Code Extension Development Host smoke with `vscode-extension-debugger` for layout, focus, theme, and dock behavior.

## Migration Plan

This change is additive. It does not require `.nka` migration or Engine migration.

1. Add typed UI state and shared action descriptors behind the existing `neko-audio` Webview entry.
2. Add components in inactive or mode-gated form first, with tests proving canonical handlers are reached.
3. Wire components to existing project operations and `audio:*` / `project:*` messages.
4. Update i18n strings and package documentation for the lightweight AI DAW component model.
5. Validate with focused Vitest suites and real VS Code Webview functional scenarios.

Rollback is component-level: a panel or action can be hidden while leaving canonical project operations and existing timeline/transport/mixer behavior unchanged.

## Open Questions

- Should `AudioAiOperationPanel` reuse a cross-Agent operation queue projection if one becomes stable, or remain audio-local until another domain consumes the same UI pattern?
- Which AI result types can provide true preview/A-B data in the current provider/Engine paths, and which must be apply-only until preview descriptors exist?
- Should a larger professional mixer dock be introduced later after track send/bus routing has real user-facing requirements?
