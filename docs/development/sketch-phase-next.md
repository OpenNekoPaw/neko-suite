# neko-sketch Phase Next: 2D Lighting + Feature Gap Implementation

## Status

**M1 + M2 Implemented** — M3 in progress

## Source ADRs

- [sketch-2d-lighting.md](../architecture/sketch-2d-lighting.md) — 2D lighting system design
- [sketch-feature-gap-analysis.md](../architecture/sketch-feature-gap-analysis.md) — feature gap analysis vs. professional 2D tools

---

## 1. Executive Summary

This document consolidates two ADRs into a single phased development plan. It covers:

- **Stream A**: 2D Lighting System (P0-P2 from lighting ADR)
- **Stream B**: Core Feature Gap (P0-P2 from gap analysis ADR)

Both streams share infrastructure (render pipeline modifications, type extensions, `.nks` serialization), so interleaving them reduces rework. The plan is organized into **6 milestones**, each independently shippable and verifiable.

---

## 2. Current Codebase State (Verified)

### 2.1 Render Pipeline (`engine/render-pipeline.ts`)

```
compositeLayerStack(layers, viewport, filterFn?, layerTransforms?)
  ├── ensureCompBuffers(cw, ch)           // ping-pong FBO
  ├── renderCheckerboard()                 // background
  ├── for each visible layer:
  │     blend(baseTex, layer.texture)      // BLEND_FRAG, 12 modes
  │     ping-pong swap
  ├── if filterFn → outputTex = filterFn(compositeTex, w, h)
  └── blit(outputTex) to screen            // with viewport transform
```

**Key injection point**: Line 160-163 — `filterFn` callback processes composite texture before final blit. The `lightingFn` will be injected as a **second callback** at the same level, between `filterFn` and blit.

### 2.2 Shader System (`engine/shader-manager.ts`)

- Registry pattern: `programs: Map<string, WebGLProgram>`
- 4 built-in programs: `blit`, `blend`, `stroke`, `checker`
- `compileAndCache(name, vert, frag)` for on-demand registration

### 2.3 Filter Pipeline (`engine/filter-pipeline.ts`)

- Independent ping-pong FBO pair (`filterTexA/B`, `filterFboA/B`)
- Sequential filter chain with program caching
- 10 built-in filters via `FilterRegistry`

### 2.4 Type System

| Type | File | Current State |
|------|------|---------------|
| `SceneObjectType` | `types/scene.ts:9` | Includes `'light'` — **stub only** |
| `SceneObject.properties` | `types/scene.ts:19` | `Record<string, unknown>` — **untyped** |
| `Scene` | `types/scene.ts:74` | No `ambientLight`, no `lightingEnabled` |
| `LayerData` | `types/index.ts:52` | No `normalTexture`, no `alphaLock`, no `clippingMask` rendering logic |
| `LayerType` | `types/index.ts:47` | Includes `'adjustment'` — **stub only** |
| `ToolType` | `types/index.ts:74` | Includes `select-lasso`, `select-wand`, `transform` — **stubs** |
| `SelectionManager` | `selection/selection-manager.ts` | `selectRect()` only, no lasso/wand |

### 2.5 Store Slices

- `filterSlice.ts`: Global `AppliedFilter[]`, no layer-level binding
- `sceneSlice.ts`: Full scene CRUD, no lighting-specific state
- `layerSlice.ts`: Standard layer tree CRUD
- `brushSlice.ts`: Has `hardness` field, **not exposed in UI**, `u_hardness` hardcoded 0.7

---

## 3. Milestone Plan

### Dependency Graph

```
M1 (Infrastructure)
 ├── M2 (Lighting P0)         ── parallel ──  M3 (Core Editing P0)
 │                                              │
 │                                              ├── M4 (Advanced Selection + Alpha Lock)
 │                                              │
 └── M5 (Lighting P1: Normal Maps)
                                                │
                                      M6 (Professional Tools P1)
```

### Overview

| Milestone | Name | Stream | Est. Scope | Dependencies |
|-----------|------|--------|------------|--------------|
| **M1** | Pipeline Infrastructure | Shared | 8 files | None |
| **M2** | Flat Point Light | A (Lighting) | 6 files | M1 |
| **M3** | Core Editing Fundamentals | B (Gap) | 10 files | M1 |
| **M4** | Advanced Selection + Alpha Lock | B (Gap) | 5 files | M3 |
| **M5** | Normal Map Lighting | A (Lighting) | 5 files | M2 |
| **M6** | Professional Tools | B (Gap) | 12 files | M3, M4 |

---

## 4. Milestone Details

### M1: Pipeline Infrastructure

**Goal**: Extend render pipeline and type system to support both lighting and adjustment layers without breaking existing flows.

#### M1.1 — Type Extensions

**File**: `types/light.ts` (NEW)

```typescript
export type LightType = 'point' | 'directional' | 'spot';

export interface LightProperties {
  readonly lightType: LightType;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly radius: number;
  readonly height: number;
  readonly direction: number;
  readonly coneAngle: number;
  readonly coneSoftness: number;
  readonly ambient: number;
}

export interface AmbientLightConfig {
  readonly color: readonly [number, number, number];
  readonly intensity: number; // [0-1], default 0.3
}

export const DEFAULT_AMBIENT_LIGHT: AmbientLightConfig = {
  color: [1, 1, 1],
  intensity: 0.3,
};

export const DEFAULT_LIGHT_PROPERTIES: LightProperties = {
  lightType: 'point',
  color: [1, 1, 1],
  intensity: 1.0,
  radius: 300,
  height: 200,
  direction: 0,
  coneAngle: Math.PI / 4,
  coneSoftness: 0.3,
  ambient: 0,
};
```

**File**: `types/scene.ts` (MODIFY)

```diff
+ import type { LightProperties, AmbientLightConfig } from './light';
+ import { DEFAULT_AMBIENT_LIGHT } from './light';

+ export interface LightSceneObject extends Omit<SceneObject, 'type' | 'properties'> {
+   readonly type: 'light';
+   readonly properties: LightProperties;
+ }

+ export function isLightObject(obj: SceneObject): obj is LightSceneObject {
+   return obj.type === 'light';
+ }

  export interface Scene {
    // ... existing fields ...
+   readonly ambientLight: AmbientLightConfig;
+   readonly lightingEnabled: boolean;
  }
```

**File**: `types/index.ts` (MODIFY)

```diff
  export interface LayerData {
    // ... existing fields ...
+   /** P1: Normal map texture, RGB encodes (nx*0.5+0.5, ny*0.5+0.5, nz*0.5+0.5) */
+   normalTexture?: WebGLTexture | null;
+   /** P1: Base64 normal map data from .nks file, consumed on first render */
+   pendingNormalData?: string;
+   /** Alpha lock: paint without altering transparency */
+   alphaLock: boolean;
  }
```

#### M1.2 — Render Pipeline `lightingFn` Injection

**File**: `engine/render-pipeline.ts` (MODIFY)

Add a second optional callback parameter to `compositeLayerStack`:

```diff
  compositeLayerStack(
    layers: ReadonlyArray<LayerData>,
    viewport: ViewportState,
    filterFn?: (compositeTex: WebGLTexture, w: number, h: number) => WebGLTexture,
+   lightingFn?: (filteredTex: WebGLTexture, w: number, h: number) => WebGLTexture,
    layerTransforms?: ReadonlyMap<string, Float32Array>,
  ): void {
    // ... existing compositing loop ...

    let outputTex = texs[current]!;
    if (filterFn) {
      outputTex = filterFn(outputTex, cw, ch);
    }
+   if (lightingFn) {
+     outputTex = lightingFn(outputTex, cw, ch);
+   }

    // blit outputTex to screen ...
  }
```

This is a **zero-risk** change — `lightingFn` defaults to `undefined`, no behavior change for existing callers.

#### M1.3 — Scene Slice Extension

**File**: `stores/slices/sceneSlice.ts` (MODIFY)

```diff
+ import { DEFAULT_AMBIENT_LIGHT } from '../../types/light';
+ import type { AmbientLightConfig } from '../../types/light';

  export interface SceneSlice {
    // ... existing state/actions ...
+   updateAmbientLight: (sceneId: string, config: Partial<AmbientLightConfig>) => void;
+   toggleLighting: (sceneId: string) => void;
  }

  // createScene default:
  const scene: Scene = {
    id, name, layers: [],
    camera: DEFAULT_CAMERA,
    atmosphere: DEFAULT_ATMOSPHERE,
+   ambientLight: DEFAULT_AMBIENT_LIGHT,
+   lightingEnabled: false,
  };
```

#### M1.4 — Layer Manager Extension

**File**: `layer/layer-manager.ts` (MODIFY)

```diff
  export function createLayer(...): LayerData {
    return {
      // ... existing fields ...
      texture: null,
+     alphaLock: false,
    };
  }
```

#### Verification

- [ ] `pnpm build` passes — no type errors
- [ ] Existing render pipeline behavior unchanged (filterFn-only path)
- [ ] New types importable from `types/light.ts`

---

### M2: Flat Point Light (Lighting P0)

**Goal**: Interactive point light sources with distance attenuation, no normal maps.

#### M2.1 — Light Shaders

**File**: `engine/light-shaders.ts` (NEW)

Contains 3 fragment shader source strings:

1. **LIGHT_POINT_FRAG** — Point light with quadratic distance attenuation
2. **LIGHT_AMBIENT_FRAG** — Ambient light (scene × ambientColor × ambientIntensity)
3. **LIGHT_BLIT_VERT** — Shared fullscreen quad vertex shader (reuse `QUAD_VERT`)

```glsl
// LIGHT_POINT_FRAG — P0 flat point light
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform vec2 u_lightPos;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_radius;

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec2 fragPos = v_texCoord * u_resolution;

  float dist = length(fragPos - u_lightPos);
  float attenuation = 1.0 - smoothstep(0.0, u_radius, dist);
  attenuation *= attenuation; // quadratic falloff

  vec3 light = u_lightColor * u_intensity * attenuation;
  fragColor = vec4(scene.rgb * light, scene.a);
}
```

#### M2.2 — LightPass Class

**File**: `engine/light-pass.ts` (NEW)

```typescript
export class LightPass {
  private litTex: WebGLTexture | null = null;
  private litFbo: WebGLFramebuffer | null = null;
  private pointProgram: WebGLProgram | null = null;
  private ambientProgram: WebGLProgram | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly textures: ITextureManager,
    private readonly shaders: IShaderManager,
  ) {}

  /**
   * Runs the light pass: accumulates all light sources + ambient.
   * Returns the lit texture.
   */
  apply(
    sceneTex: WebGLTexture,
    width: number,
    height: number,
    lights: readonly LightSceneObject[],
    ambient: AmbientLightConfig,
  ): WebGLTexture { ... }

  dispose(): void { ... }
}
```

**Accumulation strategy** (from ADR section 4.4):

```
1. Bind litFBO, clear to black
2. Enable additive blend: gl.blendFunc(ONE, ONE)
3. For each light:
   a. Bind u_scene = sceneTex (same source every pass)
   b. Set light uniforms (position, color, intensity, radius)
   c. drawQuad() → light contribution accumulates in litFBO
4. Add ambient pass:
   a. Bind ambient program, u_scene = sceneTex
   b. drawQuad() (additive accumulation)
5. Disable additive blend
6. Return litTex
```

#### M2.3 — Sketch Renderer Integration

**File**: `engine/sketch-renderer.ts` (MODIFY)

```diff
+ import { LightPass } from './light-pass';
+ import type { LightSceneObject, AmbientLightConfig } from '../types/light';

  export class SketchRenderer implements ISketchRenderer {
    // ... existing fields ...
+   private _lightPass!: LightPass;

    init(canvas, width, height): void {
      // ... existing init ...
+     this._lightPass = new LightPass(gl, this._textures, this._shaders);
    }

+   get lightPass(): LightPass { return this._lightPass; }

    renderWithEffects(
      layers, viewport, filters, emitters, particlePreview, dt,
-     layerTransforms?,
+     layerTransforms?,
+     lightingConfig?: {
+       enabled: boolean;
+       lights: readonly LightSceneObject[];
+       ambient: AmbientLightConfig;
+     },
    ): void {
      // ... existing filter callback ...

+     const lightingFn = lightingConfig?.enabled && lightingConfig.lights.length > 0
+       ? (tex: WebGLTexture, w: number, h: number) =>
+           this._lightPass.apply(tex, w, h, lightingConfig.lights, lightingConfig.ambient)
+       : undefined;

      this._pipeline.compositeLayerStack(
        layers, viewport,
        filterFn,
+       lightingFn,
        layerTransforms,
      );
      // ... particles ...
    }

    dispose(): void {
      // ... existing ...
+     this._lightPass.dispose();
    }
  }
```

#### M2.4 — Shader Manager Registration

**File**: `engine/shader-manager.ts` (MODIFY)

```diff
+ import { LIGHT_POINT_FRAG, LIGHT_AMBIENT_FRAG } from './light-shaders';

  initBuiltinPrograms(): void {
    // ... existing 4 programs ...
+   this.compileAndCache('light-point', QUAD_VERT, LIGHT_POINT_FRAG);
+   this.compileAndCache('light-ambient', QUAD_VERT, LIGHT_AMBIENT_FRAG);
  }
```

#### M2.5 — Light Tool UI

**File**: `components/LightPanel.tsx` (NEW)

Light source property inspector with controls for:
- Light type selector (point only in M2)
- Color picker (RGB)
- Intensity slider [0-10]
- Radius slider [0-2000px]
- Height slider [0-500]
- Per-light enable/disable toggle

**File**: `components/ScenePanel.tsx` (MODIFY)

Add lighting section:
- Global `lightingEnabled` toggle
- Ambient light color + intensity controls
- "Add Point Light" button → `addSceneObject(sceneId, layerId, { type: 'light', properties: DEFAULT_LIGHT_PROPERTIES })`
- Light object list with select/delete

#### Verification

- [ ] Create canvas → Add point light → Drag light → Real-time brightness change
- [ ] 0 lights + lighting enabled → Scene renders with ambient only
- [ ] Toggle `lightingEnabled` off → Scene renders identically to before
- [ ] Performance: 1 light < 2ms, 10 lights < 8ms (60fps headroom)

---

### M3: Core Editing Fundamentals (Feature Gap P0)

**Goal**: Adjustment layers, layer mask rendering, free transform.

#### M3.1 — Adjustment Layer Data Model

**File**: `types/adjustment.ts` (NEW)

```typescript
export type AdjustmentType =
  | 'curves'
  | 'levels'
  | 'exposure'
  | 'white-balance'
  | 'hue-saturation'
  | 'vibrance'
  | 'color-balance'
  | 'brightness-contrast';

export interface AdjustmentParams {
  readonly type: AdjustmentType;
  readonly enabled: boolean;
  readonly params: Record<string, number | number[]>;
}

// Per-type parameter schemas
export interface CurvesParams {
  /** Control points per channel: [[x,y], ...] */
  readonly red: readonly (readonly [number, number])[];
  readonly green: readonly (readonly [number, number])[];
  readonly blue: readonly (readonly [number, number])[];
  readonly master: readonly (readonly [number, number])[];
}

export interface LevelsParams {
  readonly inputBlack: number;   // [0-255]
  readonly inputWhite: number;   // [0-255]
  readonly gamma: number;        // [0.1-10]
  readonly outputBlack: number;  // [0-255]
  readonly outputWhite: number;  // [0-255]
}

// ... similar for each AdjustmentType
```

**File**: `types/index.ts` (MODIFY)

```diff
  export interface LayerData {
    // ... existing ...
+   /** Adjustment layer parameters (only when type === 'adjustment') */
+   adjustment?: AdjustmentParams;
  }
```

#### M3.2 — Adjustment Shaders

**File**: `engine/adjustment-shaders.ts` (NEW)

Implements GLSL fragment shaders for each adjustment type:

- **ADJUST_CURVES_FRAG**: 1D LUT texture lookup per channel
- **ADJUST_LEVELS_FRAG**: Input remap → gamma → output remap
- **ADJUST_EXPOSURE_FRAG**: `pow(2.0, u_exposure) * color`
- **ADJUST_WHITE_BALANCE_FRAG**: Temperature + tint shift in LMS space
- **ADJUST_HSL_FRAG**: RGB→HSL→modify→RGB
- **ADJUST_VIBRANCE_FRAG**: Saturation boost weighted by inverse saturation
- **ADJUST_COLOR_BALANCE_FRAG**: Shadow/midtone/highlight RGB offsets
- **ADJUST_BRIGHTNESS_CONTRAST_FRAG**: Linear brightness + S-curve contrast

#### M3.3 — Adjustment Pass in Render Pipeline

The key design decision: adjustment layers act **on all layers below them** (like Photoshop). Integration in `compositeLayerStack`:

```diff
  for (const layer of layers) {
    if (!layer.visible) continue;
+
+   // Adjustment layer: apply effect to current composite
+   if (layer.type === 'adjustment' && layer.adjustment?.enabled) {
+     const adjustedTex = this.applyAdjustment(
+       texs[current]!, cw, ch, layer.adjustment
+     );
+     // Copy adjusted result back into ping-pong chain
+     this.blitToFbo(adjustedTex, fbos[current]!);
+     continue;
+   }

    if (!layer.texture) continue;
    // ... existing blend logic ...
  }
```

**File**: `engine/render-pipeline.ts` (MODIFY) — Add `applyAdjustment()` private method

#### M3.4 — Layer Mask / Clipping Mask Rendering

**Current state**: `LayerData.clippingMask` and `maskLayerId` fields exist and serialize, but `compositeLayerStack` does NOT implement masking logic.

**File**: `engine/render-pipeline.ts` (MODIFY)

```diff
  for (const layer of layers) {
    if (!layer.visible || !layer.texture) continue;

+   // Clipping mask: restrict alpha to base layer below
+   let effectiveTexture = layer.texture;
+   if (layer.clippingMask && previousLayerTex) {
+     effectiveTexture = this.applyClippingMask(layer.texture, previousLayerTex, cw, ch);
+   }
+
+   // Layer mask: multiply alpha by grayscale mask
+   if (layer.maskLayerId) {
+     const maskLayer = layers.find(l => l.id === layer.maskLayerId);
+     if (maskLayer?.texture) {
+       effectiveTexture = this.applyLayerMask(effectiveTexture, maskLayer.texture, cw, ch);
+     }
+   }

    // ... existing blend with effectiveTexture instead of layer.texture ...
  }
```

**New shaders needed**:
- **CLIPPING_MASK_FRAG**: `fragColor = vec4(layer.rgb, min(layer.a, base.a))`
- **LAYER_MASK_FRAG**: `fragColor = vec4(layer.rgb, layer.a * luminance(mask.rgb))`

#### M3.5 — Free Transform Tool

**File**: `tools/transform-tool.ts` (NEW)

```typescript
export interface TransformState {
  readonly layerId: string;
  readonly matrix: DOMMatrix;        // Affine: scale + rotate + skew
  readonly bounds: DOMRect;          // Original layer bounds
  readonly handles: TransformHandle[];
}

export type HandleType = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br' | 'rotate';
```

**Interaction model** (mirrors `neko-canvas` `useNodeResize.ts` + `useNodeRotate.ts`):
1. Activate tool → Show 8 scale handles + rotation handle on active layer
2. Drag handle → Compute affine matrix (scale/rotate/skew)
3. Real-time preview via `layerTransforms` Map passed to `compositeLayerStack`
4. Confirm → Apply matrix to layer pixels via WebGL FBO resample
5. Cancel → Discard transform

**File**: `components/TransformOverlay.tsx` (NEW) — SVG overlay for transform handles

#### M3.6 — UI: Adjustment Layer Panel

**File**: `components/AdjustmentPanel.tsx` (NEW)

- "Add Adjustment Layer" dropdown (select type)
- Parameter controls per type (sliders, curve editor for Curves)
- Enable/disable toggle per adjustment layer
- Before/After toggle (temporarily disable to compare)

#### Verification

- [ ] Add `brightness-contrast` adjustment layer → Slider changes brightness in real-time
- [ ] Add layer mask → Painting white/black on mask shows/hides regions
- [ ] Clipping mask → Layer clips to shape of layer below
- [ ] Free transform → Scale/rotate layer with handles, confirm applies
- [ ] All existing features (brush, filters, particles) still work unchanged

---

### M4: Advanced Selection + Alpha Lock (Feature Gap P0)

**Goal**: Lasso/wand selection, alpha lock for painting.

#### M4.1 — Lasso Selection

**File**: `selection/selection-manager.ts` (MODIFY)

```diff
+ selectLasso(points: readonly { x: number; y: number }[], width: number, height: number): void {
+   const mask = new Uint8Array(width * height);
+   // Scanline fill algorithm for closed polygon
+   scanlineFill(points, mask, width, height);
+   this.mask = { width, height, data: mask };
+ }
```

**Algorithm**: Record drag path points → Close polygon on mouse-up → Scanline fill to generate `SelectionMask` bitmap.

#### M4.2 — Magic Wand Selection

**File**: `selection/selection-manager.ts` (MODIFY)

```diff
+ selectWand(
+   imageData: Uint8Array,  // RGBA pixel data from active layer
+   startX: number,
+   startY: number,
+   tolerance: number,
+   width: number,
+   height: number,
+   contiguous: boolean,
+ ): void {
+   // BFS flood fill with color tolerance (reuse pixel-tool.ts BFS pattern)
+   // If !contiguous: scan entire image for matching colors
+ }
```

#### M4.3 — Alpha Lock

**File**: `engine/render-pipeline.ts` (MODIFY)

In `renderStrokeSegment`, when the target layer has `alphaLock: true`:

```diff
  renderStrokeSegment(points, color, size, targetFBO, targetWidth, targetHeight,
-   hardness, eraser):
+   hardness, eraser, alphaLock):
  {
    // ... existing setup ...
+   if (alphaLock) {
+     gl.blendFuncSeparate(
+       gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,  // RGB: normal blend
+       gl.ZERO, gl.ONE                          // Alpha: keep existing
+     );
+   }
    // ... draw points ...
+   if (alphaLock) {
+     gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);  // Restore default
+   }
  }
```

**File**: `components/LayerPanel.tsx` (MODIFY)

Add lock icon toggle per layer for `alphaLock`.

#### M4.4 — Tool Integration

**File**: `tools/tool-manager.ts` (MODIFY)

Wire `select-lasso` and `select-wand` tool types to their implementations:
- Lasso: `onPointerDown` starts path, `onPointerMove` adds points, `onPointerUp` closes and selects
- Wand: `onPointerDown` reads pixel color at click point, runs BFS/global tolerance scan

#### Verification

- [ ] Lasso: Draw closed shape → Selection mask matches drawn area
- [ ] Wand: Click on uniform color region → Region selected with tolerance
- [ ] Alpha Lock: Paint on layer → Colors change, transparency unchanged
- [ ] All selections work with existing invert/clear operations

---

### M5: Normal Map Lighting (Lighting P1)

**Goal**: Per-layer normal maps, N·L diffuse + Blinn-Phong specular.

#### M5.1 — Normal Map Light Shader

**File**: `engine/light-shaders.ts` (MODIFY — add)

```glsl
// LIGHT_NORMAL_FRAG — P1 normal-mapped lighting
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_normalMap;
uniform vec2 u_resolution;
uniform vec2 u_lightPos;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_radius;
uniform float u_height;
uniform float u_specularPower;
uniform float u_specularIntensity;

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec3 normal = normalize(texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0);

  vec2 fragPos = v_texCoord * u_resolution;
  vec3 lightDir = normalize(vec3(u_lightPos - fragPos, u_height));

  float attenuation = 1.0 - smoothstep(0.0, u_radius, length(u_lightPos - fragPos));
  attenuation *= attenuation;

  float diffuse = max(dot(normal, lightDir), 0.0);

  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), u_specularPower) * u_specularIntensity;

  vec3 light = u_lightColor * u_intensity * attenuation * (diffuse + specular);
  fragColor = vec4(scene.rgb * light, scene.a);
}
```

#### M5.2 — Normal Composite Stack

**File**: `engine/light-pass.ts` (MODIFY)

```diff
+ /**
+  * Composites per-layer normal maps into a single global normal map.
+  * Uses Reoriented Normal Mapping (RNM) for physically correct blending.
+  * Layers without normalTexture contribute flat normal (0, 0, 1).
+  * Result is cached — only recomputed when layer visibility/content changes.
+  */
+ compositeNormals(
+   layers: ReadonlyArray<LayerData>,
+   width: number,
+   height: number,
+ ): WebGLTexture { ... }
```

Cache invalidation: Track a hash of `[layerId, visible, normalTexture !== null]` — recomposite only when changed.

#### M5.3 — Grayscale-to-Normal Inference

**File**: `engine/light-shaders.ts` (MODIFY — add)

```glsl
// NORMAL_FROM_HEIGHT_FRAG — Sobel operator, real-time preview
uniform sampler2D u_heightMap;
uniform vec2 u_resolution;
uniform float u_strength;

void main() {
  vec2 texel = 1.0 / u_resolution;
  float left  = texture(u_heightMap, v_texCoord - vec2(texel.x, 0.0)).r;
  float right = texture(u_heightMap, v_texCoord + vec2(texel.x, 0.0)).r;
  float up    = texture(u_heightMap, v_texCoord - vec2(0.0, texel.y)).r;
  float down  = texture(u_heightMap, v_texCoord + vec2(0.0, texel.y)).r;

  vec3 normal = normalize(vec3(
    (left - right) * u_strength,
    (up - down) * u_strength,
    1.0
  ));
  fragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
```

#### M5.4 — Normal Map Import + Layer Binding

**File**: `layer/layer-manager.ts` (MODIFY)

```diff
+ importNormalMap(layerId: string, base64Data: string): void {
+   // Decode base64 → Image → WebGLTexture → set layer.normalTexture
+ }
```

**File**: `components/LayerPanel.tsx` (MODIFY)

Add "Bind Normal Map" button per layer (file picker or generate-from-grayscale).

#### M5.5 — LightPass Upgrade

**File**: `engine/light-pass.ts` (MODIFY)

```diff
  apply(
    sceneTex: WebGLTexture,
    width: number, height: number,
    lights: readonly LightSceneObject[],
    ambient: AmbientLightConfig,
+   normalMapTex?: WebGLTexture | null,
  ): WebGLTexture {
    // If normalMapTex provided → use LIGHT_NORMAL_FRAG
    // Otherwise → use LIGHT_POINT_FRAG (P0 fallback)
  }
```

#### Verification

- [ ] Import character diffuse + normal map → Add point light → Surface bumps respond to light angle
- [ ] Generate normal from grayscale → Preview matches Sobel output
- [ ] Multiple layers with different normals → Composite normal produces correct combined lighting
- [ ] Fallback: No normal maps → Flat lighting (M2 behavior unchanged)
- [ ] Performance: 10 lights + normal compositing < 16ms

---

### M6: Professional Tools (Feature Gap P1)

**Goal**: Symmetry painting, gradient tool, brush hardness exposure, text layers.

#### M6.1 — Symmetry Painting

**File**: `brush/brush-engine.ts` (MODIFY)

```diff
+ import type { SymmetryMode } from '../types';

  addPoint(point: StrokePoint): void {
    this.points.push(point);
+   const mirroredPoints = this.mirrorPoint(point, this.symmetryMode, this.symmetryAxis);
    const segment = this.interpolateRecent();
+   const mirroredSegments = mirroredPoints.map(mp => this.interpolateRecent(mp));
    this.renderPoints(segment);
+   mirroredSegments.forEach(s => this.renderPoints(s));
  }
```

**Types**:
```typescript
export type SymmetryMode = 'none' | 'vertical' | 'horizontal' | 'both' | 'radial';
export interface SymmetryConfig {
  readonly mode: SymmetryMode;
  readonly axisX: number;  // Axis position (pixels from center)
  readonly axisY: number;
  readonly radialCount: number;  // For radial mode: 2-16 axes
}
```

#### M6.2 — Gradient Tool

**File**: `tools/gradient-tool.ts` (NEW)

```typescript
export type GradientType = 'linear' | 'radial';

export interface GradientConfig {
  readonly type: GradientType;
  readonly stops: readonly { offset: number; color: string }[];
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}
```

**Interaction**: Drag start→end to define gradient direction/radius. GLSL shader interpolates stops.

**File**: `engine/gradient-shaders.ts` (NEW)

```glsl
// LINEAR_GRADIENT_FRAG
uniform vec2 u_start;
uniform vec2 u_end;
uniform vec4 u_stops[8];      // rgba per stop
uniform float u_offsets[8];   // offset per stop
uniform int u_stopCount;
```

#### M6.3 — Brush Hardness UI Exposure

**File**: `components/BrushPanel.tsx` (MODIFY)

```diff
+ <Slider
+   label="Hardness"
+   value={brushSettings.hardness}
+   min={0} max={1} step={0.01}
+   onChange={(v) => setBrushHardness(v)}
+ />
```

**File**: `engine/render-pipeline.ts` (MODIFY)

```diff
  // In renderStrokeSegment:
- gl.uniform1f(hardnessLoc, 0.7);  // FIXME: hardcoded
+ gl.uniform1f(hardnessLoc, hardness);
```

#### M6.4 — Text Layer (Basic)

**File**: `tools/text-tool.ts` (NEW)

```typescript
export interface TextLayerData {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly align: 'left' | 'center' | 'right';
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strokeWidth: number;
  readonly strokeColor: string;
}
```

**Rendering approach**: Canvas2D `fillText()`/`strokeText()` → offscreen canvas → `texImage2D` upload to WebGL texture. Text layer is editable (double-click enters edit mode).

#### Verification

- [ ] Symmetry: Vertical mirror painting → Strokes appear mirrored in real-time
- [ ] Gradient: Drag linear gradient → Smooth color interpolation fills layer
- [ ] Hardness slider: Low value = soft edge, high value = hard edge
- [ ] Text: Add text layer → Edit text → Renders correctly with font/size/color

---

## 5. File Change Summary

### New Files (14)

| File | Milestone | Purpose |
|------|-----------|---------|
| `types/light.ts` | M1 | Light types + defaults |
| `types/adjustment.ts` | M1 | Adjustment layer types |
| `engine/light-shaders.ts` | M2 | Light GLSL shaders |
| `engine/light-pass.ts` | M2 | LightPass class (FBO + accumulation) |
| `components/LightPanel.tsx` | M2 | Light property inspector |
| `engine/adjustment-shaders.ts` | M3 | Adjustment GLSL shaders (8 types) |
| `components/AdjustmentPanel.tsx` | M3 | Adjustment layer UI |
| `tools/transform-tool.ts` | M3 | Free transform logic |
| `components/TransformOverlay.tsx` | M3 | Transform handle SVG overlay |
| `tools/gradient-tool.ts` | M6 | Gradient fill tool |
| `engine/gradient-shaders.ts` | M6 | Gradient GLSL shaders |
| `tools/text-tool.ts` | M6 | Text layer tool |
| `engine/mask-shaders.ts` | M3 | Clipping/layer mask GLSL |
| `utils/scanline-fill.ts` | M4 | Polygon scanline fill for lasso |

### Modified Files (12)

| File | Milestone | Changes |
|------|-----------|---------|
| `types/index.ts` | M1 | `LayerData` +`normalTexture`, `pendingNormalData`, `alphaLock`, `adjustment` |
| `types/scene.ts` | M1 | `LightSceneObject`, `Scene.ambientLight`, `Scene.lightingEnabled` |
| `engine/render-pipeline.ts` | M1/M3/M4 | `lightingFn` param, adjustment pass, mask rendering, alpha lock |
| `engine/sketch-renderer.ts` | M2 | `LightPass` integration, `lightingConfig` param |
| `engine/shader-manager.ts` | M2 | Register light + mask + adjustment + gradient programs |
| `stores/slices/sceneSlice.ts` | M1 | Ambient light + lighting toggle actions |
| `layer/layer-manager.ts` | M1/M5 | `createLayer` defaults, `importNormalMap` |
| `selection/selection-manager.ts` | M4 | `selectLasso()`, `selectWand()` |
| `tools/tool-manager.ts` | M4 | Wire lasso/wand tool types |
| `components/ScenePanel.tsx` | M2 | Lighting UI section |
| `components/LayerPanel.tsx` | M4/M5 | Alpha lock toggle, normal map binding |
| `components/BrushPanel.tsx` | M6 | Hardness slider |
| `brush/brush-engine.ts` | M6 | Symmetry mirror point injection |

---

## 6. Performance Budget

| Scenario | Target | Strategy |
|----------|--------|----------|
| 1 point light, no normal | < 2ms | Single drawQuad |
| 10 point lights, no normal | < 8ms | 10 additive drawQuads |
| 10 point lights + normal composite | < 16ms | Normal composite cached; only rebuild on layer change |
| Adjustment layer chain (3 layers) | < 3ms | One drawQuad per adjustment, ping-pong |
| Lasso selection (1000 points) | < 50ms | Scanline fill on Uint8Array |
| Symmetry painting (4-axis) | < 1ms overhead | 4× point mirroring in JS, same render call |

**Optimization strategies**:
- Normal composite texture caching (hash-based invalidation)
- Light culling: Skip lights fully outside viewport AABB
- Light range scissor: `gl.scissor()` for each light based on radius
- Multi-light merge: ≤4 lights → single shader with 4 uniform sets (reduces draw calls)

---

## 7. `.nks` Serialization Impact

### New fields in `.nks` v1.1

```json
{
  "version": "1.1",
  "layers": [
    {
      "id": "layer-1",
      "data": "base64...",
      "normalData": null,
      "alphaLock": false,
      "adjustment": null
    }
  ],
  "scene": {
    "lightingEnabled": true,
    "ambientLight": { "color": [1, 1, 1], "intensity": 0.3 },
    "layers": [
      {
        "objects": [
          {
            "type": "light",
            "x": 400, "y": 300,
            "properties": {
              "lightType": "point",
              "color": [1, 0.9, 0.8],
              "intensity": 1.5,
              "radius": 300,
              "height": 200
            }
          }
        ]
      }
    ]
  }
}
```

**Migration**: `document-serializer.ts` handles v1.0 → v1.1 by defaulting missing fields:
- `normalData` → `null`
- `alphaLock` → `false`
- `adjustment` → `null`
- `lightingEnabled` → `false`
- `ambientLight` → `DEFAULT_AMBIENT_LIGHT`

---

## 8. Risk Mitigation

| Risk | Level | Mitigation |
|------|-------|------------|
| Light Pass adds GPU frame time | Medium | Global `lightingEnabled` toggle; performance budget enforced |
| Adjustment layers increase composite complexity | Medium | Adjustment pass uses same ping-pong pattern; lazy shader compilation |
| Normal maps inflate `.nks` file size | Low | Optional (null when absent); base64 PNG compression |
| Free transform pixel quality loss | Low | Bilinear filtering in WebGL resample; warn user at extreme scales |
| Lasso selection performance on large canvases | Low | Scanline fill is O(n·h); max canvas 8192×8192 is fine |
| `premultipliedAlpha` affects normal data | Low | Normal textures uploaded with `alpha=1.0`; premultiply has no effect |
| Multi-light additive blend overexposure | Low | Clamp in shader; optional tone mapping in P2 |

---

## 9. Items Explicitly Deferred to P2

These features are documented in the gap analysis ADR but intentionally excluded from this plan:

| Feature | Reason for Deferral |
|---------|--------------------|
| Directional / Spot lights | M2 validates point light pipeline; directional/spot are shader additions |
| Shadow maps (SDF soft shadow) | Requires significant new infrastructure |
| SSAO | Post-process addition after lighting pipeline is stable |
| Perspective grid | SVG overlay, independent of render pipeline |
| Liquify / mesh warp | Requires mesh vertex displacement engine |
| Halftone / dot pattern filter | Simple `FilterRegistry` addition |
| AI outpainting | Depends on ControlNet pipeline (separate ADR) |
| PSD import | Library integration (`ag-psd`), no render pipeline changes |
| Clone stamp / healing brush | Requires source-point sampling shader |
| Portrait retouching | Depends on selection + local mask + skin detection |
| Ruler / guides / snap | SVG overlay, independent |
| Viewport rotation | Transform matrix change in `buildViewportTransform` |
| Custom palettes | UI-only, no engine changes |
| Tilt-sensitive brush | Shader modification in `STROKE_FRAG` |
