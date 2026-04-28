# neko-sketch Roadmap

> Tracks completed milestones and planned P2 features.
> Source ADRs: [sketch-2d-lighting.md](../../docs/architecture/sketch-2d-lighting.md), [sketch-feature-gap-analysis.md](../../docs/architecture/sketch-feature-gap-analysis.md)
> Dev doc: [sketch-phase-next.md](../../docs/development/sketch-phase-next.md)
> PSD + AI dev plan: [neko-sketch-psd-ai-development-plan.md](../../docs/development/neko-sketch-psd-ai-development-plan.md)

---

## Completed

### P0 — Core Painting Tools

- [x] 2D Lighting System — point light + ambient, LightPass with additive accumulation
- [x] Adjustment Layers — brightness-contrast / hue-saturation / exposure / temperature via FilterPipeline reuse
- [x] Layer Mask / Clipping Mask — GLSL mask shaders in composite loop
- [x] Free Transform — 8 scale handles + rotate, affine matrix, Canvas2D resample
- [x] Lasso Selection — scanline fill polygon mask
- [x] Magic Wand Selection — BFS flood fill with color tolerance
- [x] Alpha Lock — blendFuncSeparate preserves alpha during painting

### P1 — Professional Tools

- [x] Normal Map Lighting — N·L diffuse + Blinn-Phong specular + Sobel height-to-normal
- [x] Symmetry Painting — vertical / horizontal / both / radial mirror in BrushEngine
- [x] Brush Hardness UI — slider exposed, hardcode removed
- [x] Brush Tilt — tiltX/tiltY vertex attribute, elliptical dab in STROKE_FRAG
- [x] Gradient Tool — linear gradient rendering wired to canvas interaction and history
- [x] Text Layer — Canvas2D renderTextToImageData + editing overlay with history
- [x] Clone Stamp — Alt+click source selection + drag interaction with history
- [x] Reference Image Overlay — draggable floating panels + opacity + context menu add entry
- [x] Ruler / Guides — SVG overlay, ruler drag-to-create, guide drag/double-click-remove
- [x] Filter Presets / LUT — 4 built-in Looks, .cube parser, FilterPanel preset buttons
- [x] .nks v1.1 Serialization — scenes, filters, normalData, adjustmentFilter/Params persistence

### P2 — Advanced Features

- [x] Viewport Rotation — rotation-aware render matrix, pointer mapping, guides, transform overlay, zoom anchoring, context menu, status bar
- [x] Halftone / Dot Pattern — GLSL stylize filter registered in `FilterRegistry` with cell size, angle, and amount controls
- [x] Gradient Map — luminance remap filter with reusable `color` parameter UI and vec4 uniform support
- [x] Directional / Spot Lights — LightPass branches, flat/normal-map shaders, type selector, cone controls, and viewport overlay hints
- [x] Custom Palettes — local custom palettes, brush-color append, `.aco` / `.ase` import, `.ase` export
- [x] SSAO — screen-space ambient occlusion filter using alpha/luminance depth hints
- [x] Perspective Grid MVP — 1/2/3 point SVG overlay, draggable vanishing points, divisions/opacity controls
- [x] Pattern Fill MVP — fill tool supports solid, checker, dots, and diagonal pattern fills with undo-safe ImageData path
- [x] Perspective Grid Snap — optional shape snapping to nearest perspective construction ray
- [x] Texture Stamp MVP — stamp brush type with built-in procedural alpha textures, spacing control, GPU stroke rendering, and undo history reuse
- [x] Texture Stamp Assets — image import flow, session stamp asset library, active asset removal, and WebGL stamp texture sampling
- [x] Vector Layer Model Foundation — persisted `vectorData`, node references, node hit-test/move helpers, and `.nks` round-trip tests
- [x] Bezier Node Editing MVP — vector layer creation, shape-to-vector path landing, node overlay, drag-to-update `PathSegment`, history integration, multi-node editing, handle modes, and higher-level path commands
- [x] PSD Import MVP — extension-side `ag-psd` adapter, wire tree contract, import limits, compatibility issues, report output, and kill switch
- [x] AI Result Apply MVP — layer / selection / palette / brushPreset result applier, cancellable sessions, cancelled-apply rollback, and bounded run history
- [x] .nks v1.2 Migration Scaffold — `@neko/shared/nks` current version + 1.0/1.1 → 1.2 no-op migration chain

---

## Planned Work

Active backlog now lives in [TODO.md](./TODO.md). Keep this roadmap focused on completed milestones; new planned work should be added to TODO first, then moved here after implementation is verified.
