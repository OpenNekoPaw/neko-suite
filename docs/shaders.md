# neko-engine Shader 系统分析

> 最后更新：2026-02-24

## 结论：接口已定义，但运行时动态 Shader 实现未完成

neko-engine 在 TypeScript 接口层和 Rust 类型层已为自定义 shader 预留了扩展点，但 Rust 核心层尚未实现运行时动态 shader 编译和执行。现有 shader 系统以**编译期静态嵌入**为核心，提供了完整的视频处理能力。

---

## 1. 整体架构

```
TypeScript 接口层 (neko-types)
  ↓ 定义效果类型 + 参数契约
N-API 桥接层 (neko-engine/native-napi)
  ↓ napi-rs 跨语言调用
Rust 类型层 (neko-engine/types)
  ↓ EffectType 枚举 + EffectParams
GPU 处理器层 (neko-engine/native-core/src/gpu/)
  ↓ 创建 pipeline + dispatch compute
WGSL Shader 层 (shaders/*.wgsl + 内联 shader)
  ↓ include_str!() 编译期嵌入
wgpu 硬件加速 (Metal / Vulkan / DirectX)
```

---

## 2. 已有的基础设施

### 2.1 TypeScript 接口层 — 契约已就绪

**文件**: `packages/neko-types/src/types/mediaEngine/effects.ts`

自定义效果参数（第 116-120 行）：

```typescript
export interface CustomEffectParams {
    type: 'custom';
    shaderId: string;
    uniforms?: Record<string, number | number[] | boolean>;
}
```

`IEffectProcessor` 接口预留了注册方法（第 254 行）：

```typescript
registerCustomShader?(id: string, shaderCode: string): Promise<void>;
```

> 注意 `?` — 这是可选方法，说明当前实现者尚未提供。

支持的效果类型联合（第 135-142 行）：

```typescript
export type GpuEffectParams =
    | ColorCorrectionParams   // 13 个参数：brightness, contrast, saturation, exposure, gamma, hueShift, vibrance, temperature, tint, highlights, shadows, whites, blacks
    | BlurParams              // radius, quality
    | SharpenParams           // amount, radius
    | ChromaKeyParams         // keyColor, similarity, smoothness, spillSuppression
    | LutParams               // lutData, intensity
    | CustomEffectParams      // shaderId, uniforms（未实现）
    | VignetteEffectParams;   // intensity, radius, softness
```

### 2.2 Rust 类型层 — 枚举已预留

**文件**: `packages/neko-engine/packages/types/src/effects.rs`

效果类型枚举（第 76-90 行）：

```rust
pub enum EffectType {
    Blur,
    Sharpen,
    ColorCorrection,
    Brightness,
    Contrast,
    Saturation,
    Hue,
    Exposure,
    Gamma,
    Vignette,
    ChromaticAberration,
    FilmGrain,
    Custom,  // ← 自定义类型已预留
}
```

效果参数结构（第 93-107 行）：

```rust
pub struct EffectParams {
    pub effect_type: EffectType,
    pub intensity: f64,
    pub params: serde_json::Value,  // ← JSON 动态参数，具备扩展性
    pub enabled: bool,
}
```

其他 Rust 类型：

- `BlendMode` — 16 种混合模式（Normal, Multiply, Screen, Overlay 等）
- `TransitionType` — 9 种转场类型 + `Custom(String)` 自定义转场
- `EasingType` — 25 种缓动函数

### 2.3 GPU 处理器架构

**目录**: `packages/neko-engine/packages/native-core/src/gpu/`

所有现有处理器遵循统一模式：

```
WGSL shader (include_str! 编译时嵌入 或 内联 const &str)
  → device.create_shader_module()
  → device.create_compute_pipeline()
  → bind group (input + output + uniform_buffer)
  → dispatch compute workgroups (16×16)
```

#### 现有处理器清单

| 处理器 | 文件 | 功能 |
|--------|------|------|
| `GpuProcessor` | `processor.rs` | 色彩校正（13 参数完整管线） |
| `BlurProcessor` | `blur_processor.rs` | 模糊（box / gaussian / directional / radial / zoom） |
| `StyleProcessor` | `style_processor.rs` | 风格效果（vignette / film grain / glow / chromatic aberration） |
| `TransitionProcessor` | `transition_processor.rs` | 18 种转场效果 |
| `TextureCompositor` | `texture_compositor.rs` | 纹理格式多层合成 |
| `Compositor` | `compositor.rs` | 多层合成（最多 32 层，27 种混合模式，Porter-Duff alpha） |
| `NV12Renderer` | `nv12_renderer.rs` | NV12 格式渲染 |
| `RgbaToNv12` | `rgba_to_nv12.rs` / `rgba_to_nv12_texture.rs` | RGBA → NV12 格式转换 |
| `TextRenderer` | `text_renderer.rs` | GPU 文本渲染 |

辅助模块：

| 模块 | 文件 | 功能 |
|------|------|------|
| `GpuContext` | `context.rs` | wgpu Device/Queue/Adapter 管理 |
| `BufferPool` | `buffer_pool.rs` | GPU Buffer 对象池 |
| `GpuLayer` | `gpu_layer.rs` | 图层数据结构 |
| `GpuPipeline` | `gpu_pipeline.rs` | 渲染管线编排 |
| `HalImport` | `hal_import.rs` | 硬件抽象层纹理导入 |
| 平台导入/导出 | `macos_*.rs` / `linux_*.rs` / `windows_*.rs` | 平台特定纹理共享 |

### 2.4 WGSL Shader 文件

**外部 Shader 文件**（`packages/neko-engine/packages/native-core/shaders/`）：

通过 `include_str!()` 在 `src/gpu/shaders/mod.rs` 中编译期嵌入。

| 文件 | 大小 | 内容 |
|------|------|------|
| `common.wgsl` | 5.3 KB | 通用工具函数（rgb_to_hsl, luminance, saturate3 等） |
| `blend_modes.wgsl` | 7.8 KB | 26 种 Photoshop 兼容混合模式函数 |
| `color_correction.wgsl` | 7.3 KB | 色彩校正函数（exposure, contrast, HSL, temperature 等） |
| `effects.wgsl` | 9.0 KB | 视频效果函数（blur, sharpen, vignette 等） |
| `transitions.wgsl` | 8.3 KB | 视频转场效果函数 |
| `easing.wgsl` | 12.2 KB | 30+ 种缓动函数（含 cubic-bezier） |

**内联 Compute Shader**（定义在 `src/gpu/shaders/mod.rs`）：

| 常量 | 用途 | Uniform 结构 |
|------|------|-------------|
| `COLOR_CORRECTION_COMPUTE_SHADER` | 纹理格式色彩校正 | 8 个 f32 参数 |
| `COLOR_CORRECTION_SHADER` | 存储缓冲区格式色彩校正（Legacy） | 16 个字段完整管线 |
| `BLEND_MODE_COMPUTE_SHADER` | 纹理格式混合模式 | blend_mode(u32) + opacity(f32) |
| `BLUR_COMPUTE_SHADER` | 5 种模糊算法 | blur_type + radius + direction + center + strength |
| `SHARPEN_COMPUTE_SHADER` | Unsharp Mask 锐化 | amount + radius + threshold |
| `VIGNETTE_COMPUTE_SHADER` | 暗角效果 | amount + radius + softness + roundness |
| `FILM_GRAIN_COMPUTE_SHADER` | 胶片颗粒噪声 | amount + size + time + color_amount |
| `GLOW_COMPUTE_SHADER` | 辉光/泛光效果 | intensity + threshold + radius |
| `CHROMATIC_ABERRATION_COMPUTE_SHADER` | 色差效果 | amount + angle + center |
| `TRANSITION_COMPUTE_SHADER` | 18 种转场（双帧输入） | transition_type + progress + feather + center + angle |
| `COMPOSITOR_SHADER` | 多层合成（RGBA + YUV420P） | 最多 32 层，含 Transform2D + 混合模式 + 遮罩 |

Shader 组合辅助函数：

```rust
get_color_correction_shader() → COMMON + COLOR_CORRECTION + COMPUTE
get_blend_mode_shader()       → COMMON + BLEND_MODES + COMPUTE
get_transition_shader()       → COMMON + TRANSITIONS
get_effects_shader()          → COMMON + EFFECTS
get_easing_shader()           → EASING
get_animation_shader()        → COMMON + EASING
```

---

## 3. 未实现的部分

| 缺失环节 | 说明 |
|---------|------|
| **运行时 shader 编译** | 所有 shader 通过 `include_str!()` 或内联 `const &str` 在编译期嵌入，无运行时 `create_shader_module` 接受外部 WGSL |
| **GpuCustomProcessor** | 不存在专门管理自定义 pipeline 的动态处理器 |
| **Shader 注册表** | 无 `HashMap<String, ShaderModule>` 之类的运行时 shader 存储和查找机制 |
| **Uniform 动态绑定** | 现有 uniform 结构均为编译期固定的 `#[repr(C)]` Rust struct，无法动态匹配用户自定义参数 |
| **安全验证** | 未使用 naga validator 进行 WGSL 语法/安全检查，直接编译恶意 shader 可能导致 GPU hang |
| **Shader 模板系统** | 无标准化的 I/O 契约和 binding 模板注入机制 |

---

## 4. 可行性评估

技术上完全可行，wgpu 原生支持运行时 shader 编译。实现路径：

```
用户 WGSL 代码 (TypeScript)
  → N-API 传递到 Rust
  → WGSL 验证 (naga validator)
  → device.create_shader_module (运行时)
  → 缓存到 HashMap<String, CachedPipeline>
  → processFrame 时按 shaderId 查找并执行
```

### 关键实现步骤

**1. Shader 契约规范** — 定义自定义 shader 必须遵循的 I/O 约定：

```wgsl
// 引擎注入的标准 binding 模板
@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> custom_params: CustomParams;

// 用户只需实现 effect 函数
fn custom_effect(color: vec4<f32>, uv: vec2<f32>, params: CustomParams) -> vec4<f32> {
    // user code here
}
```

**2. GpuCustomProcessor (Rust)** — 动态 shader 管理器：

```rust
struct GpuCustomProcessor {
    pipelines: HashMap<String, wgpu::ComputePipeline>,
    context: Arc<GpuContext>,
}

fn register_shader(&mut self, id: &str, wgsl: &str) -> Result<()> {
    // 1. naga 验证
    // 2. 注入 binding 模板
    // 3. create_shader_module + create_compute_pipeline
    // 4. 缓存到 HashMap
}
```

**3. 动态 Uniform Buffer** — 用 `Vec<u8>` + 反射代替固定 struct

**4. 安全沙箱** — naga validator 限制循环次数、禁止无限循环、GPU 超时保护

---

## 5. 建议实施路径

当前架构的扩展性设计良好（`EffectType::Custom` + `registerCustomShader?` + `serde_json::Value` 参数），但从接口到实现的鸿沟较大。建议分两阶段：

### Phase 1: 预定义模板 Shader（低风险）

- 用户只调参数，shader 代码由引擎内置
- 类似现有 `EffectType::Custom` + JSON params 的思路
- 无需运行时编译，安全可控
- 可复用现有的 Uniform 动态参数机制（`serde_json::Value`）

### Phase 2: 完全自定义 WGSL（高价值）

- 支持用户提供完整 WGSL 代码
- 需要完整的 shader 验证、模板注入、动态 pipeline 管理
- 参考 Shadertoy 的沙箱机制
- 需要新增 `GpuCustomProcessor` 和 Shader 注册表

---

## 6. 关键文件索引

| 类别 | 文件路径 | 行号 | 说明 |
|------|---------|------|------|
| TS 接口 | `packages/neko-types/src/types/mediaEngine/effects.ts` | 116-120 | `CustomEffectParams` 定义 |
| | | 254 | `registerCustomShader?` 可选方法 |
| | | 135-142 | `GpuEffectParams` 联合类型 |
| | | 204-260 | `IEffectProcessor` 完整接口 |
| Rust 类型 | `packages/neko-engine/packages/types/src/effects.rs` | 76-90 | `EffectType` 枚举（含 Custom） |
| | | 93-107 | `EffectParams` 结构（含 serde_json::Value） |
| | | 6-26 | `BlendMode` 枚举（16 种） |
| | | 128-143 | `TransitionType` 枚举（含 Custom(String)） |
| | | 178-208 | `EasingType` 枚举（25 种） |
| Shader 模块 | `packages/neko-engine/packages/native-core/src/gpu/shaders/mod.rs` | 9-26 | 外部 .wgsl 文件 include_str! 加载 |
| | | 29-74 | 纹理格式色彩校正 Compute Shader |
| | | 77-129 | 混合模式 Compute Shader |
| | | 133-347 | Legacy 色彩校正 Shader（含完整函数库） |
| | | 387-565 | 模糊 Compute Shader（5 种算法） |
| | | 569-676 | 锐化 Compute Shader（Unsharp Mask） |
| | | 679-749 | 暗角 Compute Shader |
| | | 752-830 | 胶片颗粒 Compute Shader |
| | | 833-927 | 辉光 Compute Shader |
| | | 930-1005 | 色差 Compute Shader |
| | | 1009-1329 | 转场 Compute Shader（18 种） |
| | | 1333-2092 | 合成器 Shader（32 层 + 27 种混合模式 + YUV420P） |
| WGSL 文件 | `packages/neko-engine/packages/native-core/shaders/` | — | 6 个 .wgsl 文件（共 ~50 KB） |
| GPU 处理器 | `packages/neko-engine/packages/native-core/src/gpu/processor.rs` | — | 色彩校正处理器 |
| | `*/blur_processor.rs` | — | 模糊处理器 |
| | `*/style_processor.rs` | — | 风格效果处理器 |
| | `*/transition_processor.rs` | — | 转场处理器 |
| | `*/compositor.rs` | — | 多层合成器 |
| | `*/texture_compositor.rs` | — | 纹理合成器 |
| GPU 基础 | `*/context.rs` | — | wgpu Device/Queue/Adapter |
| | `*/gpu_pipeline.rs` | — | 渲染管线编排 |
| | `*/buffer_pool.rs` | — | GPU Buffer 对象池 |
