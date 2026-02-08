# 跨语言架构分析：以 neko-engine 为权威来源

> 日期：2025-01
> 状态：架构决策
> 范围：neko-types / neko-engine / neko-cut

---

## 核心原则

**neko-engine（Rust）是数据模型和计算逻辑的唯一权威来源。**
**TypeScript 端是 UI 层，对齐引擎，不定义独立的数据模型。**

理由：

1. Rust 引擎负责最终渲染，它定义的模型就是"真实"的模型
2. 引擎通过 WebSocket 直连 Webview（< 2ms 延迟），可以统一承担所有计算
3. 两端各自定义模型必然产生不一致，且维护成本随功能增长线性增加

---

## 问题一：Timeline 数据结构应以引擎为标准

### 1.1 当前问题：TS 端自行定义了一套不同的模型

TS 端（neko-types）和 Rust 端（native-core）各自独立定义了 Timeline 数据结构，
导致了坐标系不同、字段集合不同、参数范围不同，需要 **849 行手动映射代码** 来弥合。

**这 849 行映射代码本身就是架构问题的症状，不应该存在。**

### 1.2 差异根源：TS 端不应该有独立的数据语义

#### Transform：不应该有两套坐标系

| | TypeScript（当前） | Rust 引擎 | 问题 |
|--|-------------------|-----------|------|
| x, y | 0-1 归一化, 0.5=中心 | f32, 像素或归一化 | TS 自行发明了归一化语义 |
| 默认值 | `{x:0.5, y:0.5}` | `{x:0, y:0}` | 默认值不同 |
| opacity | 在 Transform 内 | 不在 Transform 内 | TS 自行扩展了结构 |

**应该怎样：** TS 端直接使用引擎的 Transform 定义。坐标系语义由引擎决定，
TS 端不发明自己的归一化方案。`coordinateTransform.ts`（228 行）不应该存在。

#### Track：不应该混入 UI 字段

| 字段 | Rust 引擎 | TS 额外添加的 | 性质 |
|------|----------|-------------|------|
| id, name, type, elements, muted, locked, hidden, isMain | ✅ | — | 数据模型 |
| — | — | solo, color, height, opacity, blendMode, transitions | 纯 UI 状态 |

**应该怎样：** 数据模型与引擎一致。UI 状态（solo、轨道颜色、轨道高度）
存放在 UI Store 中，不污染数据模型。

```typescript
// 数据模型：与引擎完全一致（由 Proto 生成）
interface Track {
  id: string;
  name: string;
  type: TrackType;
  elements: Element[];
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  isMain: boolean;
}

// UI 状态：仅存在于前端 Store
interface TrackUIState {
  solo: boolean;
  color: string;
  height: number;
}
```

#### Element：不应该有引擎不认识的字段

TS 端的 `BaseTimelineElement` 包含 15 个字段，其中引擎只认识 12 个。
`animTransform`、`colorCorrection`（独立结构）、`masks`、`keyframes`、`speed`
等字段要么引擎不认识，要么引擎用不同的方式表达（如色彩校正通过 effects）。

**应该怎样：** Element 的字段集合以引擎为准。如果引擎需要支持关键帧动画、
蒙版、速度控制，应该在引擎端先定义模型，TS 端再对齐。

#### 色彩校正：不应该有两套参数范围

| 参数 | TS 范围 | Rust 范围 | 映射公式 |
|------|--------|----------|---------|
| exposure | -5 ~ 5 | -3 ~ 3 | `rust = web * 0.6` |
| contrast | -100 ~ 100 | 0 ~ 2 | `rust = (web+100)/100` |
| saturation | -100 ~ 100 | 0 ~ 2 | `rust = (web+100)/100` |
| highlights | -100 ~ 100 | -1 ~ 1 | `rust = web/100` |

**应该怎样：** 参数范围以引擎为准。TS 端的 UI 滑块可以显示任何刻度，
但存储和传输的值必须是引擎��范围。`colorCorrectionMapping.ts`（313 行）不应该存在。

#### 转场效果：不应该有引擎不支持的类型

TS 端定义了 24 种转场，引擎只支持 18 种。`transitionMapping.ts`（308 行）
做的事情就是把 6 种引擎不支持的转场"降级"。

**应该怎样：** 转场类型以引擎为准，只有 18 种。如果未来需要更多转场，
在引擎端先实现，TS 端再跟进。UI 层不应该定义引擎无法渲染的转场类型。

### 1.3 方案：Proto 从引擎模型生成

Proto 的作用不是"协调两端"，而是**从引擎模型自动生成 TS 类型**，
确保 TS 端不可能偏离引擎。

```
neko-engine (Rust)          ← 权威来源
    │
    ▼ 提取模型
proto/timeline.proto        ← 反映引擎的真实模型
    │
    ├──→ 生成 Rust 代码     ← 引擎直接使用
    └──→ 生成 TS 代码       ← Web 端直接使用，不允许修改
```

#### Proto 定义（反映引擎现有模型）

```protobuf
syntax = "proto3";
package neko.timeline;

// 直接反映 Rust 端 timeline.rs 的定义
message Timeline {
  double duration = 1;
  Resolution resolution = 2;
  double fps = 3;
  repeated Track tracks = 4;
  optional ProjectDefaults defaults = 5;
}

message Track {
  string id = 1;
  string name = 2;
  TrackType type = 3;
  repeated Element elements = 4;
  bool muted = 5;
  bool locked = 6;
  bool hidden = 7;
  bool is_main = 8;
  // 没有 solo, color, height — 这些是 UI 状态，不属于数据模型
}

message Element {
  string id = 1;
  string name = 2;
  double start_time = 3;
  double duration = 4;
  double trim_start = 5;
  double trim_end = 6;
  Transform transform = 7;
  double opacity = 8;          // 默认 1.0
  BlendMode blend_mode = 9;
  repeated EffectParams effects = 10;
  bool muted = 11;
  bool hidden = 12;
  bool locked = 13;
  oneof element_data {
    MediaData media = 20;
    AudioData audio = 21;
    TextData text = 22;
    ShapeData shape = 23;
    SubtitleData subtitle = 24;
  }
}

// 引擎的 Transform，TS 端直接使用，不发明归一化方案
message Transform {
  float x = 1;
  float y = 2;
  float scale_x = 3;          // 默认 1.0
  float scale_y = 4;          // 默认 1.0
  float rotation = 5;
  float anchor_x = 6;
  float anchor_y = 7;
}

// 引擎支持的转场类型，只有 18 种
enum TransitionType {
  FADE = 0;
  WIPE_LEFT = 1;
  WIPE_RIGHT = 2;
  WIPE_UP = 3;
  WIPE_DOWN = 4;
  IRIS_CIRCLE = 5;
  IRIS_RECTANGLE = 6;
  CLOCK = 7;
  SLIDE_LEFT = 8;
  SLIDE_RIGHT = 9;
  ZOOM_IN = 10;
  ZOOM_OUT = 11;
  DISSOLVE = 12;
  PIXELATE = 13;
  RIPPLE = 14;
  SWIRL = 15;
  GLITCH = 16;
  FLASH = 17;
}
```

### 1.4 TS 端需要的变更

| 变更 | 说明 |
|------|------|
| 删除 `coordinateTransform.ts` (228 行) | 不再需要坐标转换，直接用引擎坐标系 |
| 删除 `transitionMapping.ts` (308 行) | 不再需要转场映射，直接用引擎的 18 种 |
| 删除 `colorCorrectionMapping.ts` (313 行) | 不再需要参数范围转换，直接用引擎范围 |
| 重构 `TimelineTrack` 类型 | 移除 UI 字段，与引擎 Track 一致 |
| 重构 `BaseTimelineElement` 类型 | 移除引擎不认识的字段 |
| 重构 `Transform` 类型 | 移除 opacity，与引擎 Transform 一致 |
| 新增 `TrackUIState` / `ElementUIState` | UI 状态独立存放在前端 Store |

**消除的代码：849 行映射代码 + 类型定义中的不一致字段。**

### 1.5 引擎端需要补齐的能力

当前 TS 端有些字段引擎没有，说明引擎模型尚未覆盖全部编辑功能。
这些应该在引擎端补齐，而不是在 TS 端"先行定义"：

| 能力 | TS 端现状 | 引擎端现状 | 行动 |
|------|----------|-----------|------|
| 关键帧动画 (animTransform) | ✅ 有定义和计算 | ✅ 有 AnimationTimeline 系统 | 引擎已支持，TS 端对齐 |
| 蒙版 (masks) | ✅ 有定义和形状插值 | ⚠️ 待确认 GPU 蒙版支持 | 引擎先定义模型 |
| 速度控制 (speed) | ✅ 有定义 | ⚠️ 待确认 | 引擎先定义模型 |
| 色彩校正 | ✅ 独立结构 | ✅ 通过 EffectParams | 以引擎的 EffectParams 为准 |

---

## 问题二：所有计算由引擎统一负责

### 2.1 当前问题：TS 端重新实现了引擎的计算逻辑

Web 端用 TypeScript 重写了引擎已有的计算逻辑，用于"预览"。
这导致了 ~1285 行重复代码，且两端已经出现不一致。

| 模块 | TS 端实现 | 引擎实现 | 已有的不一致 |
|------|----------|---------|-------------|
| 缓动函数 | 13 种 | 30 种 + CubicBezier | TS 缺少 17 种缓动 |
| 关键帧插值 | `getAnimatedValue()` | `KeyframeTrack::evaluate()` | 算法相同但独立维护 |
| 变换计算 | `getComputedTransform()` | `AnimationTimeline::evaluate()` | 坐标系语义不同 |
| 色彩校正 | 444 行 CPU 逐像素 | GPU shader | CPU 与 GPU 浮点行为不同 |
| 蒙版形状插值 | `interpolateMaskShapes()` | 引擎内部实现 | 独立维护 |

**这些 TS 实现不应该存在。引擎已经有了，Web 端不需要重写。**

### 2.2 为什么可以直接用引擎计算

neko-engine 是本地进程，通过 WebSocket 直连 Webview，不经过 Extension Host：

```
Webview ──WebSocket (binary)──→ Rust HTTP Server (127.0.0.1:PORT)
           TCP loopback              Axum + Tokio
```

| 指标 | 数值 |
|------|------|
| WebSocket 往返 | < 2ms |
| 引擎计算（缓动+插值+变换） | < 0.1ms |
| 60fps 帧预算 | 16.67ms |
| **剩余给 UI 渲染** | **~14ms** |

缓动函数、关键帧插值、变换计算都是纯数学运算。
引擎算完一帧所有元素的属性值不到 0.1ms，加上通信不到 2ms，
远在 60fps 的 16.67ms 预算之内。

### 2.3 方案：引擎提供 ComputeService

引擎新增一个计算服务，Web 端通过 WebSocket 查询属性值，不再本地计算。

```
Web 端发送 playhead 位置
    │
    ▼
引擎 ComputeService.evaluate_frame(time)        [< 0.1ms]
    ├─ 遍历可见元素
    ├─ AnimationTimeline::evaluate()  (关键帧 + 缓动)
    ├─ 计算 transform / opacity / effects / masks
    │
    ├──→ 属性值 → Web 端更新面板和时间轴 UI      [< 2ms]
    │
    └──→ 同一份值 → GPU Pipeline 渲染预览帧       [~10ms]
         └─ H.264 帧流 → Web 端预览窗口           [< 15ms]
```

**关键：同一份计算结果同时驱动 UI 显示和 GPU 渲染，预览与最终渲染 100% 一致。**

#### 接口定义

```rust
// POST /v1/compute/evaluate_frame
// 请求:
{
    "time": 2.5
}

// 响应:
{
    "elements": [
        {
            "id": "el-001",
            "transform": { "x": 100, "y": 50, "scaleX": 1.2, "rotation": 15 },
            "opacity": 0.7,
            "effects": [{ "type": "gaussian-blur", "radius": 5.2 }],
            "mask_shapes": [{ "type": "ellipse", "cx": 0.5, "cy": 0.5, "rx": 0.3, "ry": 0.2 }]
        }
    ]
}
```

响应的类型同样由 Proto 生成，TS 端直接使用，不需要任何转换。

### 2.4 TS 端删除的代码

| 文件 | 行数 | 原因 |
|------|------|------|
| `neko-types/src/utils/animation.ts` 中的计算函数 | ~200 | 引擎有 `easing.rs` + `keyframe.rs` + `interpolate.rs` |
| `neko-cut/.../utils/colorCorrection.ts` | ~444 | 引擎有 GPU shader (`style_processor.rs`) |
| `neko-cut/.../types/mask.ts` 中的计算函数 | ~100 | 引擎有蒙版计算 |
| `neko-types/src/utils/coordinateTransform.ts` | ~228 | 不再需要坐标转换（问题一已消除） |
| `neko-types/src/utils/colorCorrectionMapping.ts` | ~313 | 不再需要参数映射（问题一已消除） |
| **合计** | **~1285** | |

### 2.5 TS 端保留的代码

| 文件 | 原因 |
|------|------|
| `timelineCalculations.ts` | 纯 UI 计算（时间↔像素、标记间隔），与渲染无关 |
| `viewportCulling.ts` | 纯 UI 优化（视口裁剪），与渲染无关 |
| `snapEngine.ts` | 纯 UI 交互（吸附对齐），与渲染无关 |
| 类型定义（由 Proto 生成） | UI 组件需要类型信息 |

判断标准：**如果这个计算影响最终渲染结果，由引擎做。如果只影响 UI 交互体验，由 Web 端做。**

---

## 总结

### 一句话

**引擎定义模型，引擎执行计算，TS 端只做 UI。**

### 消除的内容

| 类别 | 消除内容 | 行数 |
|------|---------|------|
| 映射代码 | coordinateTransform + transitionMapping + colorCorrectionMapping | 849 |
| 重复计算 | 缓动函数 + 关键帧插值 + 变换计算 + 色彩校正 + 蒙版插值 | 1285 |
| 类型偏差 | TS 独有的坐标系语义、参数范围、转场类型、UI 混入字段 | — |
| **合计** | | **~2134 行** |

### 获得的保证

| 保证 | 机制 |
|------|------|
| 类型不可能不一致 | Proto 从引擎模型生成，TS 端不允许修改 |
| 预览不可能与渲染不一致 | 同一份引擎计算结果驱动 UI 和 GPU |
| 新增功能不需要双端实现 | 引擎实现一次，Proto 自动同步类型，ComputeService 自动暴露 |
| 参数范围不可能不一致 | 只有引擎的范围，UI 滑块做显示映射 |

### 实施顺序

```
Step 1: 从引擎 Rust 模型提取 Proto 定义
        → 生成 TS 类型，替换 neko-types 中的手写类型
        → 删除 849 行映射代码

Step 2: 引擎实现 ComputeService（/v1/compute/evaluate_frame）
        → Web 端调用引擎获取属性值
        → 删除 ~1285 行重复计算代码

Step 3: UI 状态分离
        → Track/Element 的 UI 字段移入前端 Store
        → 数据模型与引擎完全一致
```
