## Why

Canvas storyboard scenes and shots now carry enough production, generation, reference, and diagnostic data to power Agent workflows, but the default creator-facing UI exposes too much of that machinery. Creators need a fast storyboard review surface for a whole scene and a focused refinement surface for one shot, with advanced diagnostics available without dominating the workflow.

## What Changes

- Add a creator-facing presentation capability for Canvas content surfaces:
  - Scene expanded/overlay surfaces default to a storyboard table review view.
  - Scene keeps a secondary creative/card view for visual rhythm and image comparison.
  - Shot detail defaults to creator-relevant fields and keeps generation, indexing, media refs, and batch diagnostics collapsed behind advanced sections.
  - Gallery, Group, Table, Script, Document, and Media nodes get presentation guidance that matches their content shape instead of inheriting Shot/Scene assumptions.
- Add view-mode and table-tool requirements for Scene review:
  - storyboard table / creative view switch;
  - field/column visibility profiles;
  - lightweight filters for missing images, missing dialogue, failed generation, ungenerated shots, diagnostics, current character, and scene tags.
- Require storyboard table image cells to reuse Canvas card preview/resource resolution rather than Agent Webview media components or ad hoc file-path logic.
- Keep the change presentation-only:
  - no `.nkc` data migration;
  - no changes to `CanvasNodeBase`;
  - no new `.nks`, `.story`, or standalone storyboard file format;
  - no runtime preview URLs, Webview URIs, object URLs, or cache paths persisted to Canvas data.

## Capabilities

### New Capabilities

- `canvas-creator-facing-presentation`: Defines creator-facing review, refinement, view-switching, field-profile, and advanced-diagnostic presentation behavior for Canvas nodes and containers.

### Modified Capabilities

- None. This capability builds on existing Canvas composable content, container organization, and preview capabilities without changing their core contracts.

## Impact

- Canvas Webview content presentation:
  - `packages/neko-canvas/packages/webview/src/components/content/ContainerRenderer.tsx`
  - `packages/neko-canvas/packages/webview/src/components/panels/ContentOverlay.tsx`
  - `packages/neko-canvas/packages/webview/src/utils/canvasPresetRegistry.ts`
- Canvas node-card preview reuse:
  - `packages/neko-canvas/packages/webview/src/components/content/node-card/*`
- Canvas Webview i18n:
  - `packages/neko-canvas/packages/webview/src/i18n/locales/en.ts`
  - `packages/neko-canvas/packages/webview/src/i18n/locales/zh-cn.ts`
- Focused Canvas Webview tests for scene table projection, field visibility, shot advanced section defaults, preview-source reuse, and long-text overflow.
- Architecture reference:
  - `docs/architecture/adr-canvas-creator-facing-presentation.md`
