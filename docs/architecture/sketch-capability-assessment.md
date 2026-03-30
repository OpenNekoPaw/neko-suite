# neko-sketch Capability Assessment

> Date: 2026-03-30
> Status: Analysis
> Scope: Feature inventory, drag-drop gap, Photoshop comparison

---

## 1. Current Positioning

neko-sketch is a **lightweight 2D creation tool** embedded in VSCode, closer to **Krita / Clip Studio Paint / Procreate** than Photoshop. Its core value lies in integration with the IDE, AI, and neko-engine ecosystem.

---

## 2. Implemented Feature Matrix

| Category | Features | Status |
|----------|----------|--------|
| **Brush System** | Pencil / Pen / Watercolor / Airbrush / Marker / Pixel / Eraser (7 types) | ✅ Complete |
| **Pressure Sensitivity** | 4 pressure curves (linear / soft / firm / sCurve) + Catmull-Rom interpolation | ✅ Complete |
| **Layer System** | Raster / Vector / Fill / Group layers + 12 blend modes + clipping mask | ✅ Complete |
| **Selection Tools** | Rectangle / Lasso / Magic Wand | ✅ Complete |
| **Vector Tools** | Rectangle / Ellipse / Line + Bezier path editing | ✅ Complete |
| **Filter Pipeline** | 10+ GLSL filters (blur, sharpen, color adjustment, etc.) | ✅ Complete |
| **Particle System** | Atmosphere presets (rain / snow / stars / fireflies, etc.) | ✅ Complete |
| **Frame Animation** | Onion skin preview + Sprite Sheet import/export | ✅ Complete |
| **Skeletal Animation** | Inochi2D via native-puppet crate (bevy_ecs 0.15 + inox2d) | ✅ Complete |
| **2D Scenes** | Parallax scrolling + scene templates (platformer / RPG / visual-novel) | ✅ Complete |
| **AI Generation** | sketch.generate MCP tool | ✅ Complete |
| **Undo/Redo** | 100-step limit, region snapshots | ✅ Complete |
| **Rendering Engine** | Self-built WebGL2 (no Three.js), ping-pong compositing | ✅ Complete |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Rendering | WebGL2 (self-built: ShaderManager + TextureManager + RenderPipeline) |
| UI | React 18 + Zustand 4 (12 slices) + Tailwind CSS |
| Build | Vite 5 + TypeScript 5.3 |
| Engine Integration | native-puppet crate (bevy_ecs + inox2d) via HTTP/WS |
| File Format | `.nks` (JSON + base64 pixel data), `.nkp` (puppet) |

---

## 3. Drag-and-Drop Image Support

### Current State: Implemented (2026-03-30)

Three import methods are now supported in addition to the file dialog (Ctrl+I):

| Operation | Status | Implementation |
|-----------|--------|----------------|
| Ctrl+V paste clipboard image | ✅ | Webview `paste` event → `clipboardData.items` → `importImageFromBlob()` |
| Drag from OS file manager | ✅ | Webview `drop` event → `dataTransfer.files` → `importImageFromBlob()` |
| Drag from VSCode Explorer | ✅ | Webview `drop` → `text/uri-list` → `file:dropRequest` msg → Extension reads file → `file:imported` |

**Architecture:**

```
                     ┌─────────────────────────────┐
                     │        Webview (React)       │
                     │                              │
  Ctrl+V paste ─────>│  paste event                 │
                     │  → clipboardData.items       │
  OS file drag ─────>│  drop event                  │──> importImageFromBlob()
                     │  → dataTransfer.files         │     → createImageBitmap()
                     │                              │     → new LayerData
  VSCode drag ──────>│  drop event                  │
                     │  → text/uri-list (no files)  │
                     │  → postMessage(dropRequest)  │
                     └──────────┬───────────────────┘
                                │ file:dropRequest
                                ▼
                     ┌─────────────────────────────┐
                     │     Extension Host (Node)    │
                     │  → vscode.workspace.fs.read  │
                     │  → base64 encode             │
                     │  → postMessage(file:imported) │
                     └─────────────────────────────┘
```

**Key files:**
- `packages/neko-sketch/packages/webview/src/utils/image-import.ts` — `importImageFromBlob()`, `isImageMimeType()`
- `packages/neko-sketch/packages/webview/src/App.tsx` — paste/drag/drop event listeners + drop overlay
- `packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts` — `file:dropRequest` handler + `isImageUri()`
- `packages/neko-sketch/packages/webview/src/types/index.ts` — `file:dropRequest` message type

---

## 4. Comparison with Photoshop

### Capability Comparison

| Dimension | Photoshop | neko-sketch | Gap |
|-----------|-----------|-------------|-----|
| **Brush Engine** | 1000+ presets, texture tips, dual brush | 7 basic brushes, no texture tips | 🔴 Large |
| **Layer System** | Smart Objects / Adjustment layers / Masks / Effects / Styles | Basic raster/vector/group, no smart objects | 🔴 Large |
| **Selection & Masks** | Refine Edge + Quick Mask + Channel Mask + AI Select Subject | Rect/Lasso/Wand, no channel masks | 🔴 Large |
| **Typography** | Professional typesetting engine | Type defined but not implemented | 🔴 Large |
| **Color Management** | ICC Profile, CMYK, Lab, HDR | sRGB / RGBA8 only | 🔴 Large |
| **Filters & Effects** | Neural Filters, 100+ built-in | 10+ GLSL filters | 🟡 Medium |
| **Vector Tools** | Pen + Paths + Shape Layers | Basic Bezier + shapes | 🟡 Medium |
| **Transform** | Free Transform / Perspective / Warp / Content-Aware Scale | Basic Transform tool | 🟡 Medium |
| **Image Adjustments** | Curves / Levels / Hue-Saturation / Selective Color | Basic filter pipeline | 🟡 Medium |
| **File Formats** | PSD/PSB + dozens of import/export | `.nks` proprietary + PNG/JPG import | 🔴 Large |
| **Performance / Large Canvas** | 64-bit, GPU accelerated, 300K+ px | WebGL2 single Canvas, Webview memory limit | 🔴 Large |
| **Plugin Ecosystem** | Rich third-party plugins | MCP tools + neko-engine integration | 🟡 Medium |
| **AI Capabilities** | Generative Fill/Expand, Neural Filters | MCP sketch.generate | 🟢 Small (different approach) |
| **Animation** | Timeline + Video layers | Frame + Skeletal + Particle + Scene | 🟢 **Advantage** |

### Fundamental Gaps (Architectural)

These gaps are inherent to the platform choice and difficult to close:

1. **Rendering Precision**
   - PS: Native GPU -> 32-bit float -> unlimited canvas zoom
   - neko-sketch: WebGL2 in Webview -> RGBA8 -> browser texture limit (<=16384px)

2. **Color Space**
   - PS: Full ICC Profile color management pipeline -> print-grade CMYK
   - neko-sketch: sRGB only -> screen display grade

3. **Non-Destructive Editing**
   - PS: Smart Objects + Adjustment Layers + Smart Filters = fully reversible
   - neko-sketch: Direct pixel operations = destructive editing

### Closable Gaps (Feature Iteration)

These can be addressed through incremental development:

- **Brush textures / tip shapes** -> Extend `BrushPreset` with `texture` field
- **Layer styles / effects** -> Extend `LayerData` with `effects` array
- **More filters** -> `FilterPipeline` already supports chaining
- **Better selection** -> `SelectionMask` foundation exists
- **Text tool** -> `LayerType.text` type already defined

### neko-sketch Unique Advantages (PS Lacks)

| Advantage | Description |
|-----------|-------------|
| **IDE Integration** | Embedded in VSCode, seamless with code/assets/AI workflow |
| **Skeletal Animation** | Inochi2D integration, PS has no equivalent |
| **2D Scenes / Parallax** | Scene templates for game dev, PS has no equivalent |
| **Particle System** | Atmosphere presets for game/animation, PS has no equivalent |
| **Sprite Sheet Workflow** | Native support, PS requires plugins |
| **AI Generation (MCP)** | Customizable pipeline, PS Generative Fill is closed |
| **Engine Collaboration** | GPU rendering/export delegated to Rust neko-engine |
| **Puppet Animation** | Inochi2D for VTuber/game 2D characters |

---

## 5. Strategic Summary

```
neko-sketch != Photoshop competitor

Positioning Difference:
  PS       = Professional image processing / photo editing / print publishing
  neko-sketch = Lightweight 2D creation within game/animation creative workflow

Core Value Proposition:
  1. Integrated in IDE -> seamless with code / AI / engine
  2. Skeletal + Frame animation + Particles + Scenes = full game 2D art pipeline
  3. Hybrid strategy: lightweight built-in + MCP bridge PS/ComfyUI for pro needs

Key Gaps to Address (Priority Order):
  P0: Clipboard paste (Ctrl+V) for image import        ✅ Done
  P0: Drag-and-drop (OS file manager + VSCode Explorer) ✅ Done
  P1: Canvas→Sketch→Cut workflow integration             ⏳ Planned
  P1: AI Inpaint / Auto-layer / Style Transfer           ⏳ Planned
  P1: Text tool implementation
  P2: Brush texture/tip system
  P2: Layer styles/effects
  P3: Non-destructive editing foundation (adjustment layers)
```

---

## 6. Related Documents

- [2D Capability Analysis](./2d-capability-analysis.md) - Full architecture design
- [Sketch Enhancement Plan](./sketch-enhancement-plan.md) - Implementation plan for Phase 1-3
- [Device Access](./device-access.md) - Hardware API proxy via Rust sidecar
- [3D Capability Analysis](./3d-capability-analysis.md) - neko-model counterpart
- [Panel Placement](./panel-placement.md) - Editor-bound vs global panels
