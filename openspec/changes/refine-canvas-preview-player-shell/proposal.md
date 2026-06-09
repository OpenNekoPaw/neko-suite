## Why

Canvas Preview can now consume `CanvasPlaybackPlan`, but its panel still reads like an inspector: top toolbar controls, duplicated progress rows, a large unit card, and a permanent detail column. This makes storyboard, media, script, and generic node playback feel inconsistent with the existing video/audio Preview experience, where the content stage is primary and playback controls live at the bottom.

This change refines Canvas Preview into a player-style shell so users can preview images, video, audio, text, Fountain-derived script excerpts, storyboard shots, and generic nodes with one consistent layout.

## What Changes

- Replace the current Canvas playback panel layout with a stage-first player shell:
  - the main panel renders the active playback unit content;
  - the bottom area owns transport controls, time, and a segmented progress/timeline rail;
  - technical metadata, branches, diagnostics, and settings are secondary overlays or drawers.
- Keep a fixed top narrow bar out of the default layout. Current unit title, kind, warnings, and branch/status affordances may appear as lightweight overlays inside the stage.
- Merge the separate stage progress row and numeric unit timeline into one segmented progress/timeline component.
- Define stage renderer responsibilities for media, image, text/script, storyboard shot/scene, narrative, and generic node units.
- Keep Preview state transient and host-owned resource resolution unchanged; the panel consumes `CanvasPlaybackPlan` and durable resource identities but does not persist runtime URLs or playback state.
- Preserve existing Narrative Runtime boundaries and Canvas playback projection behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `canvas-preview-capabilities`: Adds requirements for a Canvas playback Preview player shell, bottom playback controls, segmented progress, stage overlays, secondary inspector surfaces, and multi-kind stage rendering.

## Impact

- Canvas extension Preview bridge HTML/CSS/JS:
  - `packages/neko-canvas/packages/extension/src/editor/narrativePreviewBridge.ts`
- Canvas playback tests:
  - `packages/neko-canvas/packages/extension/src/editor/narrativePreviewBridge.test.ts`
- Shared preview concepts remain compatible with existing `CanvasPlaybackPlan` contracts in `packages/neko-types`.
- No persistence format migration is required.
- No change to resource cache/source identity semantics; resource resolution fixes remain a separate change.
