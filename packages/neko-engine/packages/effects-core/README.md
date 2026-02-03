# @neko/effects-core

> Core effects library for video editing - animations, transitions, filters, masks, colors

## Context Summary
- Project: Neko Suite - VSCode video editor
- Purpose: Platform-agnostic effects system shared across WebGL, WebGPU, and wgpu (Rust)
- Spec: [CLAUDE.md](../../CLAUDE.md)

## Quick Reference

**Install:**
```bash
npm install @neko/effects-core
```

**Import:**
```typescript
// Types
import type { Keyframe, Transition, Effect, Mask, BlendModeType } from '@neko/effects-core';

// Algorithms
import { getEasingFunction, blendColors, rgbaToHsla } from '@neko/effects-core';

// Shaders (WGSL) - TS string exports
import { COMMON_WGSL, BLEND_MODE_WGSL } from '@neko/effects-core/shaders';

// Shaders (WGSL) - Load from .wgsl files
import { getCommonWgsl, getBlendModesWgsl } from '@neko/effects-core/shaders';
```

**Rust (wgpu):**
```rust
// Include shared .wgsl files directly
pub const COMMON_WGSL: &str = include_str!("path/to/effects-core/shaders/common.wgsl");
pub const BLEND_MODES_WGSL: &str = include_str!("path/to/effects-core/shaders/blend_modes.wgsl");
```

## Architecture

```
effects-core/
├── src/
│   ├── types/           # Type definitions
│   │   ├── geometry     # Point2D, Rect, RGBA, Transform
│   │   ├── easing       # EasingType, EasingFunction
│   │   ├── animation    # Keyframe, KeyframeTrack, Animation
│   │   ├── transition   # TransitionType, TransitionParams
│   │   ├── effects      # EffectType, EffectParams
│   │   ├── blendMode    # BlendModeType (26 Photoshop modes)
│   │   ├── mask         # MaskShape, MaskMode, TrackMatte
│   │   ├── shape        # Shape, ShapeStyle, ShapeFill
│   │   └── colorCorrection # Curves, Levels, HSL, ColorWheels
│   │
│   ├── algorithms/      # Pure computation functions (JS)
│   │   ├── easing       # 30+ easing functions + cubic bezier
│   │   ├── blendMode    # Blend mode implementations
│   │   └── color        # Color space conversion, adjustments
│   │
│   └── shaders/         # TS string exports (backwards compat)
│
└── shaders/             # Pure .wgsl files (shared with Rust)
    ├── common.wgsl          # Math utilities, color conversion
    ├── blend_modes.wgsl     # All 26 blend mode implementations
    ├── color_correction.wgsl # Professional color grading
    ├── transitions.wgsl     # 50+ transition effects
    └── effects.wgsl         # Blur, sharpen, vignette, etc.
```

## Shader Sharing (WebGPU + wgpu)

The `.wgsl` files in `shaders/` directory are **pure WGSL** that can be shared between:

| Platform | How to Use |
|----------|------------|
| **WebGPU (Browser)** | Import via bundler or `fs.readFileSync` |
| **wgpu (Rust)** | `include_str!("path/to/shader.wgsl")` |

### Data Format: Texture (Unified)

Both platforms use **texture format** for consistency:

```wgsl
// Input/Output as textures (not storage buffers)
@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;

// Sample/Store operations
let color = textureLoad(input_texture, coord, 0);
textureStore(output_texture, coord, result);
```

### Shader Composition

Shaders are designed to be composed:

```rust
// Rust example
fn get_color_correction_shader() -> String {
    format!("{}\n{}\n{}",
        COMMON_WGSL,           // Color conversion, math utils
        COLOR_CORRECTION_WGSL, // Effect functions
        COMPUTE_SHADER         // Entry point with bindings
    )
}
```

## Features

### Types
- **Geometry**: Point2D, Point3D, Rect, Transform2D/3D, RGBA, HSLA, Gradient
- **Animation**: Keyframe system with 30+ easing types
- **Transitions**: 50+ transition types (wipe, slide, zoom, 3D, blur, glitch)
- **Effects**: Color correction, blur, sharpen, glow, vignette, distortion
- **Blend Modes**: All 26 Photoshop blend modes
- **Masks**: Rectangle, ellipse, polygon, bezier, track mattes
- **Shapes**: Vector shapes with fill, stroke, shadow

### Algorithms (JavaScript)
```typescript
// Easing
const ease = getEasingFunction('easeOutCubic');
const value = ease(0.5); // 0.875

// Custom cubic bezier
const customEase = createCubicBezierEasing({ type: 'cubicBezier', x1: 0.4, y1: 0, x2: 0.2, y2: 1 });

// Blend colors
const result = blendColors(baseColor, blendColor, 'multiply', 0.8);

// Color conversion
const hsl = rgbaToHsla({ r: 1, g: 0.5, b: 0, a: 1 });
```

### Shaders (WGSL)
```wgsl
// Include common utilities
// (rgb_to_hsl, luminance, saturate, etc.)

// Use blend mode functions
let blended = blend_multiply(base.rgb, blend.rgb);
let result = apply_blend(base, blend, blended, opacity);

// Use color correction functions
var rgb = apply_exposure(color.rgb, 1.5);
rgb = apply_contrast(rgb, 1.2);
rgb = apply_saturation(rgb, 1.1);
```

## Exports

```typescript
// Main entry - types + algorithms
import { ... } from '@neko/effects-core';

// Subpath exports
import { ... } from '@neko/effects-core/shaders';
import { ... } from '@neko/effects-core/algorithms';
```
