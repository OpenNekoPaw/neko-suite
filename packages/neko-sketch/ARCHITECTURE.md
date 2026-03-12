# neko-sketch Architecture

## Overview

neko-sketch is the 2D creation module of neko-suite, providing drawing, painting, and animation capabilities within VSCode. It operates independently (no dependency on neko-canvas), symmetric to neko-model (3D).

Detailed capability analysis: [docs/architecture/2d-capability-analysis.md](../../docs/architecture/2d-capability-analysis.md)

## Package Structure

```
packages/neko-sketch/
├── package.json              # VSCode extension manifest (.nks custom editor)
├── l10n/                     # Localization bundles (en, zh-cn)
├── ARCHITECTURE.md
├── packages/
│   ├── extension/            # Extension Host (Node.js, esbuild CJS)
│   │   └── src/
│   │       ├── extension.ts          # Activation: provider + views + commands
│   │       ├── types.ts              # NksDocument, NksLayerData, ExportOptions
│   │       ├── editor/
│   │       │   └── sketchEditorProvider.ts  # CustomEditorProvider for .nks
│   │       ├── views/
│   │       │   ├── layerOutlineProvider.ts  # TreeDataProvider (layer hierarchy)
│   │       │   └── sketchStatusBar.ts      # 4 status bar items
│   │       ├── commands/
│   │       │   └── index.ts                # 13 commands + keyboard forwarding
│   │       └── utils/
│   │           ├── logger.ts               # Global logger registry
│   │           └── errorHandler.ts         # Global error handler
│   └── webview/              # React 18 + Vite + WebGL2
│       └── src/
│           ├── App.tsx               # Root: layout + message handling
│           ├── engine/               # WebGL2 rendering core
│           │   ├── webgl-context.ts      # GL2 context + DPR-aware resize
│           │   ├── shaders.ts            # GLSL: quad, blit, blend (12 modes), stroke, checker
│           │   ├── shader-manager.ts     # Compile + cache 4 built-in programs
│           │   ├── texture-manager.ts    # RGBA8 texture/FBO lifecycle
│           │   ├── render-pipeline.ts    # Ping-pong compositing + stroke rendering
│           │   └── sketch-renderer.ts    # Facade (init/render/dispose)
│           ├── brush/
│           │   ├── brush-engine.ts       # IBrushEngine: begin/add/end stroke
│           │   ├── brush-profiles.ts     # 7 brush types with defaults
│           │   ├── stroke-interpolator.ts # Catmull-Rom spline smoothing
│           │   └── pressure-mapper.ts    # 4 curves: linear/soft/firm/sCurve
│           ├── layer/
│           │   └── layer-manager.ts      # Pure functions: CRUD, group, flatten
│           ├── selection/
│           │   └── selection-manager.ts  # Uint8Array bitmask: rect/all/invert
│           ├── history/
│           │   └── history-manager.ts    # Region snapshots, 100-step limit
│           ├── tools/
│           │   └── tool-manager.ts       # Cursor mapping per tool type
│           ├── stores/
│           │   ├── sketch-store.ts       # Combined Zustand store (7 slices)
│           │   └── slices/               # document, layer, tool, brush, viewport, history, UI
│           ├── components/
│           │   ├── SketchCanvas.tsx       # WebGL canvas + pointer input + brush engine
│           │   ├── Toolbar.tsx            # 9 tool buttons
│           │   ├── BrushPanel.tsx         # Type/size/opacity controls
│           │   ├── ColorPanel.tsx         # Color picker + 16-color palette
│           │   ├── LayerPanel.tsx         # Layer list + visibility/lock toggles
│           │   └── StatusBar.tsx          # Zoom/size/tool/layer count
│           ├── hooks/
│           │   └── usePointerInput.ts    # Pointer events with pressure/tilt
│           ├── utils/
│           │   ├── document-serializer.ts # .nks ↔ store state conversion
│           │   ├── keyboard-dispatcher.ts # Extension keyboard action → store ops
│           │   └── image-import.ts        # Base64 → ImageBitmap → new layer
│           ├── i18n/                     # I18nService + en/zh-cn bundles
│           ├── types/                    # All type definitions
│           ├── animation/    # S.2 placeholder
│           ├── effects/      # S.3 placeholder
│           └── scene/        # S.3 placeholder
```

## Communication Protocol

```
Extension → Webview:
  document:load    { data: NksDocument }     # File opened / ready response
  document:revert                            # Revert to saved state
  document:save                              # Request save (Ctrl+S)
  document:saveAs  { path }                  # Save As
  file:imported    { name, data, path }      # Image imported (base64)
  file:exportResult { success, path?, error? }
  keyboardAction   { action }                # Forwarded keyboard commands
  setLocale        { locale }                # Runtime locale switch

Webview → Extension:
  ready                                      # Webview loaded, request document
  document:save    { data: NksDocument }     # Serialized document for writing
  file:import                                # Request file open dialog
  file:export      { format, data }          # Export canvas (base64)
  status:update    { SketchStatusInfo }      # Update status bar
  layer:outline    { LayerOutlineData }      # Update layer tree view
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| WebGL2 self-built engine | Lightweight, no heavy framework; full control over blend modes |
| Ping-pong FBO compositing | Efficient layer stack with per-layer blend mode |
| Catmull-Rom stroke interpolation | Smooth curves from discrete pointer input |
| Region-based undo/redo | Captures only affected pixel regions, memory efficient |
| Zustand slices composition | Modular state following neko-cut pattern |
| GLSL blend modes from WGSL | 12 modes translated from neko-engine `blend_modes.wgsl` |
| Independent from neko-canvas | Own CustomEditorProvider, no `extensionDependencies` |
| .nks JSON format | Simple, human-readable, version-controlled |

## .nks Document Format

```json
{
  "version": "1.0",
  "canvas": { "width": 1920, "height": 1080, "dpi": 72, "backgroundColor": "#ffffff" },
  "layers": [
    {
      "id": "layer-1", "name": "Background", "type": "fill",
      "visible": true, "locked": false, "opacity": 1, "blendMode": "normal",
      "width": 1920, "height": 1080, "offsetX": 0, "offsetY": 0,
      "clippingMask": false, "maskLayerId": null, "children": [],
      "data": "<base64 pixel data, optional>"
    }
  ],
  "brushPresets": [],
  "palette": ["#000000", "#ffffff"],
  "viewport": { "panX": 0, "panY": 0, "zoom": 1 }
}
```

## Shared Resources

| Resource | Source | Usage |
|----------|--------|-------|
| BlendModeType | `@neko/shared` | Type definitions |
| Logger / ErrorHandler | `@neko/shared` | Logging, error handling |
| I18nService | `@neko/shared` | Localization (L0 + L2 webview) |
| nekoTailwindPreset | `@neko/shared` | Tailwind theme tokens |
| blend_modes.wgsl | `neko-engine` | Translated to GLSL blend.frag |
| CanvasEditorProvider | `neko-canvas` | CustomEditorProvider template |
| editor-store.ts | `neko-cut` | Zustand slices composition pattern |

## Implementation Status

### S.1: Drawing Fundamentals — COMPLETE ✅

| Module | Status | Details |
|--------|--------|---------|
| Package structure | ✅ | Root manifest + extension + webview sub-packages |
| Extension Host | ✅ | SketchEditorProvider, LayerOutline, StatusBar, 13 commands |
| WebGL2 engine | ✅ | Context, shaders (12 blend modes), textures, ping-pong pipeline |
| Brush system | ✅ | 7 brushes, Catmull-Rom interpolation, 4 pressure curves |
| Layer system | ✅ | CRUD, group, flatten, deep find (pure functions) |
| Selection system | ✅ | Rect/all/invert with Uint8Array bitmask |
| History (undo/redo) | ✅ | Region snapshots, 100-step limit |
| Tool manager | ✅ | 11 tools with cursor mapping |
| Zustand store | ✅ | 7 slices composed into single store |
| UI components | ✅ | Canvas, Toolbar, BrushPanel, ColorPanel, LayerPanel, StatusBar |
| Document I/O | ✅ | Serialize/deserialize .nks, save/load/revert |
| Keyboard dispatch | ✅ | undo/redo/tool switch/zoom reset/import/export |
| Image import | ✅ | Base64 → ImageBitmap → new layer |
| i18n locale switch | ✅ | Runtime setLocale via extension message |

### S.2: Skeletal Animation — PLANNED

- Spine integration (`@esotericsoftware/spine-webgl`, MIT)
- Live2D integration (Cubism SDK Web, commercial license TBD)
- Frame-by-frame animation (onion skin + frame timeline)
- Animation Zustand slice

### S.3: Effects & Scenes — PLANNED

- 2D particle system (WebGL instanced rendering)
- 2D filter pipeline (GLSL from neko-engine WGSL shaders)
- Sprite sheet editor
- Scene manager + parallax layers

### S.4: AI Assistance & Cross-Module — PLANNED

- AI MCP Tools in neko-agent (generate/style_transfer/auto_layer/inpaint/upscale)
- Export to neko-cut (PNG sequence / sprite sheet → timeline)
- Export to neko-canvas (PNG/SVG → canvas node)
- Asset registration in neko-assets

## Remaining P2 TODOs

| Location | TODO | Priority |
|----------|------|----------|
| `document-serializer.ts` | Read pixel data from WebGL texture on save | P2 |
| `keyboard-dispatcher.ts` | selectAll — select all pixels on active layer | P2 |
| `keyboard-dispatcher.ts` | deleteSelected — clear selected region | P2 |
| `animation/` | S.2 full implementation | S.2 |
| `effects/` | S.3 full implementation | S.3 |
| `scene/` | S.3 full implementation | S.3 |
