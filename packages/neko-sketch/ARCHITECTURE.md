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
│           │   ├── sketch-store.ts       # Combined Zustand store (8 slices)
│           │   └── slices/               # document, layer, tool, brush, viewport, history, UI, animation
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
│           ├── animation/    # S.2: Inochi2D puppet animation
│           │   ├── types.ts              # PuppetSnapshot, PuppetDelta, DeformedMesh
│           │   ├── inochi2d-controller.ts # IInochi2DController → EngineClient HTTP
│           │   └── index.ts              # Public exports
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

Note: Puppet/animation communication goes directly via EngineClient HTTP/WS,
      not through the extension postMessage protocol.
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
| native-puppet in neko-engine | Symmetric to native-scene; no WASM (size/threading limits); full bevy_ecs + bevy_animation |
| bevy_animation over inox2d anim | inox2d animation not yet implemented upstream; bevy_animation ParameterCurve bridges the gap |
| inox2d over Spine/Live2D | BSD 2-Clause license; Spine Runtimes License rejected (ADR-2D-004); Live2D rejected (ADR-2D-001) |
| WS /v1/puppets/stream | Real-time face-tracking (neko-live) requires <2ms latency; HTTP round-trip not sufficient at 60fps |

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

### S.2: Puppet Animation — MOSTLY COMPLETE (frame-by-frame pending)

| Module | Status | Details |
|--------|--------|---------|
| native-puppet crate | ✅ | bevy_ecs 0.15 + inox2d + bevy_animation, INP loading → ECS World |
| ECS components | ✅ | PuppetNode, Transform2D, DeformRegion, DrawOrder, Param, PhysicsConfig, AnimationTarget |
| Hierarchy management | ✅ | Parent-child tree traversal, subtree collect |
| PuppetWorld trait | ✅ | load_model / set_param / tick / snapshot / get_deformed_meshes |
| INP loader | ✅ | Stub (inox2d API TBD), returns PuppetLoadResult |
| Deformation system | ✅ | Rotation + warp mesh deform, param → vertex pipeline |
| PuppetService | ✅ | native-core integration, world lifecycle management |
| PuppetsController | ✅ | HTTP actions via ActionRouter (load/param/tick/meshes/snapshot/params) |
| Frontend controller | ✅ | IInochi2DController → EngineClient HTTP dispatch |
| Animation Zustand slice | ✅ | puppet state, param cache, loading/playing status |
| bevy_animation bridge | ✅ | animation.rs: ParameterCurve keyframe curves → inox2d param values; anim_play/anim_stop/anim_seek/anims endpoints |
| WebSocket stream | ✅ | WS /v1/puppets/stream — 60fps PuppetDelta push for neko-live |
| Animation UI | ✅ | AnimationPanel.tsx: clip list + playback controls; animationSlice extended |
| Frame-by-frame animation | 📋 | Onion skin + frame timeline |
| ~~Spine integration~~ | ❌ | Rejected (ADR-2D-004): Spine Runtimes License + overlap with inox2d |

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

## Remaining TODOs

| Location | TODO | Priority |
|----------|------|----------|
| `animation/` | Frame-by-frame editor (onion skin + frame timeline) | S.2 |
| `effects/` | S.3 full implementation | S.3 |
| `scene/` | S.3 full implementation | S.3 |
