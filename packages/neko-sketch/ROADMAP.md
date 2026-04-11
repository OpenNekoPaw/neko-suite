# neko-sketch Roadmap

> Tracks completed milestones and planned P2 features.
> Source ADRs: [sketch-2d-lighting.md](../../docs/architecture/sketch-2d-lighting.md), [sketch-feature-gap-analysis.md](../../docs/architecture/sketch-feature-gap-analysis.md)
> Dev doc: [sketch-phase-next.md](../../docs/development/sketch-phase-next.md)

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
- [x] Gradient Tool — linear + radial GLSL shaders + types (rendering: see TODO.md)
- [x] Text Layer — Canvas2D renderTextToImageData (editing overlay: see TODO.md)
- [x] Clone Stamp — CPU pixel-level cloning algorithm (interaction: see TODO.md)
- [x] Reference Image Overlay — draggable floating panels + opacity + context menu add entry
- [x] Ruler / Guides — SVG overlay, ruler drag-to-create, guide drag/double-click-remove
- [x] Filter Presets / LUT — 4 built-in Looks, .cube parser, FilterPanel preset buttons
- [x] .nks v1.1 Serialization — scenes, filters, normalData, adjustmentFilter/Params persistence

---

## P2 — Advanced Features (Planned)

### Quick Wins (low complexity)

| Feature | Effort | Notes |
|---------|--------|-------|
| Viewport Rotation | Minimal | `ViewportState.rotation` exists; add rotation to `buildViewportTransform` matrix |
| Halftone / Dot Pattern | Minimal | Register one GLSL filter in `FilterRegistry` |
| Directional Light | Low | New shader + `LightPass` branch for `lightType === 'directional'` |
| Spotlight | Low | New shader + cone angle uniforms |
| Gradient Map | Low | Luminance → 1D LUT lookup filter |
| Custom Palettes | Low | UI-only: create/save/import `.aco`/`.ase` palette files |

### Medium Effort

| Feature | Effort | Notes |
|---------|--------|-------|
| Bezier Node Editing | Medium | SVG overlay with anchor + handle drag, update `PathSegment` |
| PSD Import | Medium | `ag-psd` library integration, parse layer tree → LayerData |
| Perspective Grid | Medium | 1/2/3 point SVG overlay + vanishing point drag + snap |
| SSAO | Medium | Screen-space AO post-process pass, register as FilterDef |
| Pattern Fill / Texture Stamp | Medium | Tiling shader + brush alpha texture replacement |

### High Effort

| Feature | Effort | Dependencies |
|---------|--------|-------------|
| Portrait Retouching | High | Selection (done), local mask, skin region detection |
| Shadow Maps (SDF) | High | New SDF distance field infrastructure |
| Liquify / Mesh Warp | High | Mesh vertex displacement engine + interactive brushes |
| AI Outpainting | Medium | ControlNet pipeline (separate ADR) |
