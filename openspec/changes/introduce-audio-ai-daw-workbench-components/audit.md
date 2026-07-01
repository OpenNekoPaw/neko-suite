## Component Reuse Audit

Task: 1.1

Scope: `packages/neko-audio/packages/webview` and shared `@neko/ui` primitives.

## Existing Local Surfaces

- `AudioEditor.tsx` already owns the VS Code Webview shell through
  `CreativeWorkbenchShell`, with top transport, left rail, central audio surface,
  compact mixer band, and right dock.
- `Toolbar.tsx` owns global audio commands in the left rail. It already uses
  `CreativeLeftRail`, `ToolbarButton`, `ToolbarSeparator`, and `ToolbarSpacer`.
- `SidePanel.tsx` owns the right dock panel switcher and basic/professional
  mode filtering. It already renders `EffectsPanel`, `RecordingPanel`,
  `ExportPanel`, and `PresetBrowser`.
- `AudioTimeline.tsx`, `TrackLane.tsx`, `TrackHeader.tsx`, and `AudioClip.tsx`
  already own track/clip rendering, drag/resize, context menu, automation lane,
  playhead, empty track placeholders, and timeline layout constants.
- `MixerPanel.tsx` already owns the compact bottom mixer and master strip.
- `AudioProperties.tsx` already demonstrates fixed audio panel fields using
  `@neko/ui/creative` composition rows.
- `LoudnessPanel.tsx` already projects single-file loudness results in a compact
  display.
- `audioProjectStore.ts` already owns canonical `.nka` project operations,
  track mix, automation, markers, undo/redo, and AI highlight projection.
- `audioStore.ts` already owns single-file selection, playback, UI panel state,
  project mode, loudness, silence regions, and toast state.

## Shared Primitive Reuse Decision

Reuse:

- `@neko/ui/workbench` for the shell and left rail.
- `@neko/ui/primitives` for button, icon button, select, slider, and context menu
  surfaces.
- `@neko/ui/creative` property rows for fixed Inspector controls where they
  reduce local control duplication.
- `@neko/ui/keyboard` for Webview focus reporting.
- `@neko/ui/icons` or codicons for command iconography.

Keep audio-local:

- Audio target selection, timeline tool modes, AI operation review state,
  effects rack semantics, marker/region semantics, and master loudness readiness.
- Action descriptors that map audio targets to `element.*`, `track.*`,
  `track.mix.*`, `audio.effect.*`, `audio.marker.*`, `audio:*`, or `project:*`
  paths.
- Panel-level typed projections for clip, track, marker, master, AI operation,
  and effect-chain state.

## Boundary Conclusion

The new workbench components should stay package-local and compose existing
shared primitives. There is no evidence that a new shared design system, generic
property adapter, standalone browser, or cross-domain DAW registry is needed.

Extraction condition: only low-semantic visual pieces such as a generic compact
meter row, segmented tool strip, or review queue row should move to `@neko/ui`
after another creative domain consumes the same primitive without audio model
fields.
