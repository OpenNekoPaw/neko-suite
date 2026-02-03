# @neko-engine/effects-runtime

GPU effect runtime for video editing. Provides zero-copy texture processing with WebGPU/WebGL backends.

## Context Summary

- **Project**: Neko Suite - VSCode 视频编辑器
- **Architecture**: IEffectRunner 接口 + WebGPU/WebGL/wgpu 实现
- **Design**: Zero-copy 纹理传递，与 GPURenderEngine 集成
- **Spec**: [CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**: GPU 特效执行运行时
- **入口**: `createEffectRunner()` / `createWebGPUEffectRunner()` / `createWgpuEffectRunner()`
- **依赖**: `@neko-engine/effects-core` (类型), `@neko/shared` (接口), `@neko-engine/native-napi` (wgpu 后端)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    IEffectRunner Interface                       │
│  - run(input, effects, time) → EffectRunResult                  │
│  - Zero-copy texture passing                                    │
│  - Backend-agnostic                                             │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│ WebGPUEffectRunner│  │ WgpuEffectRunner  │  │ WebGLEffectRunner │
│ (Browser WebGPU)  │  │ (Node.js wgpu)    │  │ (Fragment Shaders)│
│ ✅ Implemented    │  │ ✅ Implemented    │  │ 🔜 TODO           │
└───────────────────┘  └───────────────────┘  └───────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ media-processor-rs│
                    │ (Rust + wgpu)     │
                    └───────────────────┘
```

## Usage

### Basic Usage (Browser)

```typescript
import { createEffectRunner } from '@neko-engine/effects-runtime';

// Create runner
const runner = createEffectRunner();

// Initialize with GPU context
await runner.initialize(context);

// Process effects (zero-copy)
const result = await runner.run(inputTexture, effects, localTime);

// Use result texture for rendering
compositor.drawLayer({ texture: result.texture, ... });

// Cleanup if needed
if (result.isNewTexture) {
  context.deleteTexture(result.texture);
}
```

### Extension Host (Node.js with wgpu)

```typescript
import { createWgpuEffectRunner } from '@neko-engine/effects-runtime';

// Create wgpu runner for Extension Host
const runner = createWgpuEffectRunner();
await runner.initialize();

// Check GPU info
console.log(runner.gpuInfo);
// { deviceName: 'Apple M1', vendor: 'Apple', backend: 'wgpu', ... }

// Process effects
const result = await runner.run(inputTexture, effects, localTime);

// Run transitions between frames
const transitionResult = await runner.runTransition(
  fromTexture,
  toTexture,
  'fade',
  0.5,  // progress
  { feather: 0.02 }
);
```

### With GPURenderEngine

```typescript
import { createWebGPUEffectRunner } from '@neko-engine/effects-runtime';

class GPURenderEngine {
  private _effectRunner: IEffectRunner;

  async initialize() {
    this._effectRunner = createWebGPUEffectRunner();
    await this._effectRunner.initialize(this._createEffectContext());
  }

  private async _applyEffects(element, texture) {
    if (!element.effects?.length) {
      return { texture, isNewTexture: false };
    }

    return this._effectRunner.run(texture, element.effects, element.localTime);
  }
}
```

## Supported Effects

| Effect Type | WebGPU | wgpu (Node.js) | WebGL |
|-------------|--------|----------------|-------|
| colorCorrection | ✅ | ✅ | 🔜 |
| gaussianBlur | ✅ | ✅ | 🔜 |
| boxBlur | ✅ | ✅ | 🔜 |
| motionBlur | ✅ | ✅ | 🔜 |
| radialBlur | ✅ | ✅ | 🔜 |
| zoomBlur | ✅ | ✅ | 🔜 |
| sharpen | ✅ | ✅ | 🔜 |
| vignette | ✅ | ✅ | 🔜 |
| filmGrain | ✅ | ✅ | 🔜 |
| glow | ✅ | ✅ | 🔜 |
| chromaticAberration | ✅ | ✅ | 🔜 |

## Supported Transitions (wgpu only)

| Transition Type | Description |
|-----------------|-------------|
| fade | Crossfade |
| wipeLeft/Right/Up/Down | Directional wipe |
| irisCircle/Rectangle | Iris transition |
| clock | Clock wipe |
| slideLeft/Right | Slide transition |
| zoomIn/Out | Zoom transition |
| dissolve | Random dissolve |
| pixelate | Pixelation transition |
| ripple | Ripple effect |
| swirl | Swirl effect |
| glitch | Glitch effect |
| flash | Flash white |

## Color Correction Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| brightness | -1.0 ~ 1.0 | Brightness adjustment |
| contrast | 0.0 ~ 3.0 | Contrast adjustment |
| saturation | 0.0 ~ 3.0 | Saturation adjustment |
| exposure | -3.0 ~ 3.0 | Exposure adjustment |
| gamma | 0.1 ~ 3.0 | Gamma correction |
| hueShift | -180 ~ 180 | Hue rotation |
| vibrance | -1.0 ~ 1.0 | Vibrance (smart saturation) |
| temperature | -100 ~ 100 | Color temperature |
| tint | -100 ~ 100 | Tint adjustment |
| highlights | -1.0 ~ 1.0 | Highlights recovery |
| shadows | -1.0 ~ 1.0 | Shadows recovery |
| whites | -1.0 ~ 1.0 | White point |
| blacks | -1.0 ~ 1.0 | Black point |

## Zero-Copy Design

```
传统方式 (IEffectProcessor):
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ CPU     │────▶│ GPU     │────▶│ GPU     │────▶│ CPU     │
│ (input) │ 拷贝 │ (process)│     │ (output)│ 拷贝 │ (result)│
└─────────┘     └─────────┘     └─────────┘     └─────────┘

新方式 (IEffectRunner):
┌─────────┐     ┌─────────┐     ┌─────────┐
│ GPU     │────▶│ GPU     │────▶│ GPU     │
│ (input) │ 引用 │ (process)│ 引用 │ (output)│
└─────────┘     └─────────┘     └─────────┘
              Zero-Copy!
```

## API Reference

### IEffectRunner

```typescript
interface IEffectRunner {
  // State
  readonly state: EffectRunnerState;
  readonly gpuInfo: EffectRunnerGpuInfo | null;
  readonly isReady: boolean;
  readonly backend: EffectRunnerBackend;

  // Lifecycle
  initialize(context: IEffectContext): Promise<void>;
  dispose(): Promise<void>;

  // Effect Execution
  run(input: ITexture, effects: EffectInstance[], localTime: number): Promise<EffectRunResult>;
  runSingle(input: ITexture, effect: EffectInstance, localTime: number): Promise<EffectRunResult>;

  // Effect Support
  isEffectSupported(effectType: string): boolean;
  getSupportedEffects(): string[];
}
```

### ICrossProcessEffectRunner (WgpuEffectRunner)

```typescript
interface ICrossProcessEffectRunner extends IEffectRunner {
  // Texture sharing
  importTexture(handle: TextureHandle): Promise<ITexture>;
  exportTexture(texture: ITexture): Promise<TextureHandle>;

  // Transitions
  runTransition(
    fromTexture: ITexture,
    toTexture: ITexture,
    transitionType: TransitionType,
    progress: number,
    options?: TransitionOptions
  ): Promise<EffectRunResult>;

  // Transition Support
  isTransitionSupported(transitionType: string): boolean;
  getSupportedTransitions(): string[];
}
```

### EffectRunResult

```typescript
interface EffectRunResult {
  texture: ITexture;      // Output texture
  isNewTexture: boolean;  // Whether caller should delete
  processingTime: number; // Processing time in ms
}
```

## Platform-specific Texture Handles

Reserved for cross-process texture sharing:

| Platform | Handle Type |
|----------|-------------|
| macOS | IOSurface |
| Windows | D3D11 shared handle |
| Linux | DMA-BUF |
