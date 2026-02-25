# Timeline 工程定义统一方案

> 分析 neko-types、neko-engine (Rust)、packages/neko-proto/timeline.proto、neko-cut 之间 timeline 定义的不一致，并提出修复方案。

## 1. 现状概述

### 权威层次

| 层 | 包 | 角色 |
|---|---|---|
| L0 | `packages/neko-proto/timeline.proto` | IDL 定义（唯一权威源） |
| L1 | `neko-engine` (Rust) | 引擎实现，完全对齐 Proto |
| L2 | `neko-types` (TS) | 共享类型，理论对齐但有偏离 |
| L3 | `neko-cut` (TS) | 编辑器 UI 扩展 |

### 核心问题

1. **neko-types 混入 UI 字段**：TextElement、SubtitleElement、AudioProperties 中包含引擎不认识的字段
2. **部分引擎级字段缺失**：TS 定义了影响渲染输出的功能（变速、转场、文字描边等），但 Proto/Rust 未支持
3. **序列化边界模糊**：`toEngineElement()` 使用黑名单（展开排除）而非白名单，UI 字段会泄漏到引擎
4. **Proto 层存在冗余定义**：`AudioElementData` 同时拥有 `AudioProperties audio` 和独立的 `volume/pan/fade_in/fade_out` 字段（字段 6-9），语义重叠，消费端无法确定以谁为准
5. **三层手动同步无保障**：Proto → Rust → TS 全靠人工对齐，缺乏自动化生成管道，是当前不一致问题的根因

---

## 2. 需要补充到 Proto/Rust 的字段

### 分类判断标准

- **应提升到引擎层**：字段影响最终视频渲染输出（导出 MP4 时必须生效）
- **应保留在 UI 层**：字段仅用于编辑器交互展示（不影响导出结果）

### A1. TextElementData — 文本渲染增强

| 字段 | TS 类型 | 理由 | 优先级 |
|---|---|---|---|
| `textDecoration` | `'none' \| 'underline' \| 'line-through'` | 文本装饰是渲染属性，导出视频中应可见 | P2 |
| `lineHeight` | `number` | 行高影响多行文本布局，cosmic-text 支持 | P1 |
| `letterSpacing` | `number` | 字间距影响文本排版，cosmic-text 支持 | P2 |
| `strokeColor` | `string` (hex) | 文字描边是常见视频特效，需 GPU 渲染 | P1 |
| `strokeWidth` | `number` | 配合 strokeColor | P1 |
| `shadow` | `{color, offsetX, offsetY, blur}` | 文字阴影是常见视频特效，需 GPU 渲染 | P1 |

**Proto 变更：**

```protobuf
message TextElementData {
  string content = 1;
  string font_family = 2;
  float font_size = 3;
  string color = 4;
  string background_color = 5;
  string text_align = 6;
  string font_weight = 7;
  string font_style = 8;
  // ---- 新增字段 ----
  string text_decoration = 9;     // "none" | "underline" | "line-through"
  float line_height = 10;         // 行高倍数，default: 1.2
  float letter_spacing = 11;      // 字间距(px)，default: 0.0
  string stroke_color = 12;       // 描边颜色(hex)，default: "transparent"
  float stroke_width = 13;        // 描边宽度(px)，default: 0.0
  optional TextShadow shadow = 14; // 阴影
}

message TextShadow {
  string color = 1;    // default: "rgba(0,0,0,0.5)"
  float offset_x = 2;  // default: 0.0
  float offset_y = 3;  // default: 0.0
  float blur = 4;       // default: 0.0
}
```

**Rust 变更：**

```rust
pub struct TextElementData {
    // ... 现有字段 ...

    #[serde(default = "default_text_decoration")]
    pub text_decoration: String,
    #[serde(default = "default_line_height")]
    pub line_height: f32,
    #[serde(default)]
    pub letter_spacing: f32,
    #[serde(default = "default_transparent")]
    pub stroke_color: String,
    #[serde(default)]
    pub stroke_width: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<TextShadow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextShadow {
    #[serde(default = "default_shadow_color")]
    pub color: String,
    #[serde(default)]
    pub offset_x: f32,
    #[serde(default)]
    pub offset_y: f32,
    #[serde(default)]
    pub blur: f32,
}
```

### A2. AudioProperties — 音频处理增强

| 字段 | TS 类型 | 理由 | 优先级 |
|---|---|---|---|
| `fadeInCurve` | `EasingType` | 当前引擎仅线性淡入，需支持曲线。EasingType 已在 Proto 定义 | P1 |
| `fadeOutCurve` | `EasingType` | 同上 | P1 |
| `gain` | `number` (dB) | 增益是音频混音的基本功能，影响导出音量 | P2 |

注意：`eq`（均衡器）UI 和引擎都未实际使用，暂不提升。`AnimatableProperty`（可动画 volume/pan）属于关键帧系统整体未接入，暂不纳入。

**Proto 变更：**

```protobuf
message AudioProperties {
  double volume = 1;
  double pan = 2;
  bool muted = 3;
  double fade_in = 4;
  double fade_out = 5;
  // ---- 新增字段 ----
  EasingType fade_in_curve = 6;   // default: LINEAR
  EasingType fade_out_curve = 7;  // default: LINEAR
  double gain = 8;                // dB, default: 0.0 (-20 to +20)
}
```

**Rust 变更：**

```rust
pub struct AudioProperties {
    // ... 现有字段 ...

    #[serde(default)]
    pub fade_in_curve: EasingType,
    #[serde(default)]
    pub fade_out_curve: EasingType,
    #[serde(default)]
    pub gain: f64,
}
```

需同步更新 `audio_mixer.rs` 淡入淡出计算，从线性改为使用 easing 函数。

### A3. SubtitleElementData — 字幕渲染增强

> **注意**：新增 6 字段后 SubtitleElementData 与 TextElementData 高度重叠（font_family、background_color、text_align、stroke_color、stroke_width、shadow 完全相同）。未来可考虑提取公共 `TextStyleProperties` message 供两者复用，减少 Proto 维护成本。

| 字段 | TS 类型 | 理由 | 优先级 |
|---|---|---|---|
| `fontFamily` | `string` | 字幕字体是渲染属性 | P1 |
| `backgroundColor` | `string` | 字幕背景色（如半透明黑底） | P2 |
| `textAlign` | `string` | 字幕对齐方式 | P2 |
| `strokeColor` | `string` | 字幕描边（视频字幕标配） | P1 |
| `strokeWidth` | `number` | 配合 strokeColor | P1 |
| `shadow` | `TextShadow` | 字幕阴影 | P2 |

**Proto 变更：**

```protobuf
message SubtitleElementData {
  string text = 1;
  float font_size = 2;
  string color = 3;
  // ---- 新增字段 ----
  string font_family = 4;
  string background_color = 5;
  string text_align = 6;
  string stroke_color = 7;
  float stroke_width = 8;
  optional TextShadow shadow = 9;
}
```

### A4. Element — 变速播放 (P0)

当前 TS 将 `speed` 放在 `ElementEditState`（UI 层），但变速直接影响视频解码帧率、音频重采样、导出时长计算，必须由引擎处理。

> **语义约定**：当 `speed != 1.0` 时，`element.duration` 始终表示**时间轴时长**（即观众看到的时长），源素材实际播放范围通过 `duration * speed` 推导。此约定需在 Proto 注释中明确。

**Proto 变更：**

```protobuf
message Element {
  // ... 现有字段 1-18 ...
  optional SpeedProperties speed = 19;
}

message SpeedProperties {
  double speed = 1;            // 0.1 - 4.0, default: 1.0
  bool reverse = 2;            // default: false
  bool preserve_pitch = 3;     // default: true
  optional TimeRemapData time_remap = 4;
}

message TimeRemapData {
  bool enabled = 1;
  repeated TimeRemapKeyframe keyframes = 2;
}

message TimeRemapKeyframe {
  string id = 1;
  double output_time = 2;
  double input_time = 3;
  EasingType easing = 4;
}
```

### A5. Element — 转场效果 (P1)

引擎 `transition_processor.rs` 已有 18 种 GPU 转场实现（文件头 `#![allow(dead_code)]` 表明尚未被调用），但 Element 模型中无转场字段，导致无法使用。

> **设计备注**：转场本质是两个相邻元素之间的关系，放在 Element 上需要两侧协调（A 的 transition_out 与 B 的 transition_in）。另一种方案是在 Track 级别维护 `transitions` 列表，每个 transition 引用 from/to element_id。当前方案（放在 Element 上）是业界惯例（Premiere/DaVinci 均如此），可以接受。
>
> **注意**：TS 侧 `TransitionType` 枚举（18 种含 wipe-left/right/up/down、iris-in/out 等复合命名）与 Rust 侧 `TransitionType` enum（使用 direction 参数区分方向）并非一一对应，接入时需建立映射表。

**Proto 变更：**

```protobuf
message Element {
  // ... 现有字段 ...
  optional Transition transition_in = 20;
  optional Transition transition_out = 21;
}

message Transition {
  TransitionType transition_type = 1;
  double duration = 2;
  EasingType easing = 3;
  float feather = 4;  // default: 0.0
}
```

---

## 3. 应保留在 UI 层的字段

| 字段 | 当前位置 | 理由 | 处理方式 |
|---|---|---|---|
| `language` | SubtitleElement | 纯元数据，轨道标签显示 | 迁移到 ElementEditState.subtitleMeta |
| `isDefault` | SubtitleElement | 纯元数据，字幕轨选择 | 迁移到 ElementEditState.subtitleMeta |
| `eq` | AudioProperties | UI 和引擎都未实现 | 保留在 UI 层，待需求明确 |
| `AnimatableProperty` | AudioProperties | 关键帧系统整体未接入 | 保留，随关键帧系统迁移 |
| `x/y/rotation` | TextElement | 已标记 @deprecated | 删除 |

---

## 4. UI 层扩展字段的处理方案

### 目标架构

> **决策 (2026-02-25)**：UI 类型应从 neko-types 迁移到 neko-cut/webview。
> 原因见 §8 关键设计决策 #5。

```
Layer 1: Engine Types（严格对齐 Proto）
  neko-types/element.ts → 只包含引擎认可的字段
  neko-types 不再导出任何 UI-only 类型

Layer 2: UI State Types（编辑器应用层）
  neko-cut/webview/src/types/ → ElementEditState, AnimatableProperty,
    ColorCorrection, MaskInstance, KeyframeTrack 等纯 UI 类型

Layer 3: Editor Combined Types
  neko-cut/webview/src/types/editor-types.ts → EditorElement = TimelineElement & Partial<ElementEditState>
```

### Step 1: 清理 neko-types/element.ts

- TextElement：提升到引擎后保留 textDecoration 等字段；删除废弃的 x/y/rotation
- SubtitleElement：新增引擎字段 fontFamily 等；移除 language/isDefault 到 UI 层
- AudioProperties：移除 AnimatableProperty 联合类型，回归纯 number

### Step 2: 扩展 ElementEditState

```typescript
export interface ElementEditState {
  animTransform?: ElementTransform;
  colorCorrection?: ColorCorrection;
  masks?: MaskInstance[];
  keyframes?: KeyframeTrack[];
  // speed / transitionIn / transitionOut 在引擎支持后迁移为引擎字段
  subtitleMeta?: {
    language?: string;
    isDefault?: boolean;
  };
}
```

### Step 3: 清理 AudioProperties

```typescript
// 引擎层：纯值类型，严格对齐 Proto
export interface AudioProperties {
  volume: number;       // 纯 number，不再支持 AnimatableProperty
  pan: number;
  muted?: boolean;
  fadeIn: number;
  fadeOut: number;
  fadeInCurve?: EasingType;
  fadeOutCurve?: EasingType;
  gain: number;
}

// UI 层：独立接口，不继承 AudioProperties
// 注意：不使用 extends，因为将 volume 从 number 变为 number | AnimatableProperty
// 会违反里氏替换原则（消费端无法安全地将 AnimatableAudioState 当作 AudioProperties 使用）
export interface AnimatableAudioState {
  volume: AnimatableProperty;
  pan: AnimatableProperty;
  eq?: { lowGain: number; midGain: number; highGain: number };
}
```

### Step 4: 清理 ProjectDefaults 对齐 Proto

```typescript
export interface ProjectDefaults {
  text: {
    fontSize: number;
    fontFamily: string;
    color: string;
    // 移除：backgroundColor, textAlign, fontWeight, fontStyle, textDecoration
  };
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    // 移除：opacity
  };
  audio: {
    volume: number;
    pan: number;
    fadeIn: number;
    fadeOut: number;
    // 移除：gain（待引擎支持后再加回）
  };
}
```

### Step 5: toEngineElement() 改为白名单模式

```typescript
export function toEngineElement(element: EditorElement): TimelineElement {
  const base = {
    id: element.id,
    name: element.name,
    duration: element.duration,
    startTime: element.startTime,
    trimStart: element.trimStart,
    trimEnd: element.trimEnd,
    transform: element.transform,
    opacity: element.opacity,
    blendMode: element.blendMode,
    effects: element.effects,
    muted: element.muted,
    hidden: element.hidden,
    locked: element.locked,
    audio: element.audio,
  };

  switch (element.type) {
    case 'media':
      return { ...base, type: 'media', src: element.src,
               resourceId: element.resourceId, mediaType: element.mediaType,
               linkedAudioId: element.linkedAudioId };
    case 'audio':
      return { ...base, type: 'audio', src: element.src,
               resourceId: element.resourceId, linkedVideoId: element.linkedVideoId };
    case 'text':
      return { ...base, type: 'text', content: element.content,
               fontSize: element.fontSize, fontFamily: element.fontFamily,
               color: element.color, backgroundColor: element.backgroundColor,
               textAlign: element.textAlign, fontWeight: element.fontWeight,
               fontStyle: element.fontStyle, textDecoration: element.textDecoration,
               lineHeight: element.lineHeight, letterSpacing: element.letterSpacing,
               strokeColor: element.strokeColor, strokeWidth: element.strokeWidth,
               shadow: element.shadow };
    case 'shape':
      return { ...base, type: 'shape', shapeType: element.shapeType,
               fill: element.fill, stroke: element.stroke,
               strokeWidth: element.strokeWidth };
    case 'subtitle':
      return { ...base, type: 'subtitle', text: element.text };
  }
}
```

---

## 5. 实施路线图

```
Phase 0 (前置): 建立 Proto → TS 自动生成管道 ✅ 已完成 (2026-02-24)
  ├─ ✅ 自定义 protobufjs parser + codegen 脚本 (scripts/proto-gen-ts.mjs)
  ├─ ✅ 从 timeline.proto 自动生成 TS 类型定义 (generated/timeline.engine.ts)
  ├─ ✅ 编译时漂移检测 (__engine-check.ts + element.ts/transform.ts 内联检查)
  ├─ ✅ toEngineElement/toEngineTrack 改为基于生成 key 常量的白名单模式
  └─ ✅ Proto 层 AudioElementData 字段 6-9 标记 DEPRECATED

Phase 1 (P0): speed 变速 → Proto + Rust + TS 全链路 ✅ 已完成 (2026-02-25)
  ├─ ✅ Proto: 新增 SpeedProperties / TimeRemapData / TimeRemapKeyframe
  ├─ ✅ Rust: Element 新增 speed 字段 + SpeedProperties 等 struct
  ├─ ✅ TS: speed 从 ElementEditState 迁移到 BaseTimelineElement (引擎字段)
  ├─ ✅ 引擎实现: get_source_time() 支持 constant speed + reverse + time remap 关键帧插值
  │   音频变速（重采样/pitch-preserving）待后续接入 audio_mixer
  └─ ✅ duration 语义约定已在 Proto 注释中明确

Phase 2 (P1): 文本/字幕增强 + 转场接入 ✅ 已完成 (2026-02-25)
  ├─ ✅ Proto + Rust: TextElementData 新增 6 字段 + TextShadow message
  ├─ ✅ Proto + Rust: SubtitleElementData 新增 6 字段
  ├─ ✅ Proto + Rust: Element 新增 transition_in/out + Transition message
  ├─ ✅ TS: TextElement 字段从 @ui-only 升级为引擎字段
  ├─ ✅ TS: SubtitleElement 补全 6 个引擎字段
  ├─ ✅ 引擎: text_renderer.rs 接入新字段 — rasterize_styled() 支持 line_height, stroke, shadow, background_color, text_decoration
  │   gpu_export_pipeline.rs render_text_to_gpu_layer() 已更新为传递 TextStyle
  └─ 🔲 引擎: 转场系统接入 export pipeline
      → 需要架构设计：GpuTransitionProcessor 是 buffer-based，export pipeline 是 texture-based
      → 方案：给 transition processor 添加 texture-based API 或在 compositor 层面集成

Phase 3 (P1): 音频增强 ✅ 已完成 (2026-02-25)
  ├─ ✅ Proto + Rust: AudioProperties 新增 fade_in_curve / fade_out_curve / gain
  ├─ ✅ Rust: audio_mixer.rs 从线性插值改为 Easing::evaluate() 淡入淡出
  └─ ✅ Rust: gain dB→linear 转换 (10^(dB/20))

Phase 4 (P2): TS 层清理 ✅ 已完成 (2026-02-25)
  ├─ ✅ neko-types: TextElement 移除 deprecated x/y/rotation
  ├─ ✅ neko-types: ProjectDefaults 标注 @ui-only 字段（对齐 Proto）
  ├─ ✅ neko-types: 清理 AudioProperties（移除 AnimatableProperty 联合类型，volume/pan 回归纯 number）
  │   neko-types/audio.ts: 移除 AnimatableProperty import，Omit 仅保留 fadeInCurve/fadeOutCurve
  │   webview/types/audio.ts: volume/pan 改为 number，createDefaultAudioProperties 返回纯标量
  │   keyframeSlice.ts: 移除 audio 分支，仅支持 transform 关键帧
  │   PropertyPanel.tsx: audio volume/pan 标记 animatable: false
  └─ ✅ neko-types: SubtitleElement 移除 language/isDefault
      elementOpsSlice.ts 中对应赋值已同步移除

Phase 5 (P2): UI 类型从 neko-types 迁移到 neko-cut/webview ✅
  ├─ 前置：Phase 4 AudioProperties 清理完成（解除 AnimatableProperty 与引擎类型的耦合）
  ├─ ✅ 迁移 ui-state.ts → neko-cut/webview/src/types/
  ├─ ✅ 迁移 animation.ts (AnimatableProperty, ElementTransform) → neko-cut/webview/src/types/
  ├─ ✅ 迁移 colorCorrection.ts → neko-cut/webview/src/types/ (与现有扩展文件合并)
  ├─ ✅ 迁移 mask.ts → neko-cut/webview/src/types/ (与现有扩展文件合并)
  ├─ ✅ 迁移 keyframe.ts → neko-cut/webview/src/types/
  ├─ ✅ neko-types 5 个 UI 文件标记 @deprecated（保留供内部消费）
  ├─ ✅ 迁移 utils/animation.ts → neko-cut/webview/src/utils/（含 shapeAnimation.ts import 更新）
  ├─ ⏭️ utils/colorCorrectionMapping.ts — 无消费者，跳过
  ├─ ⏭️ operations/apply-keyframe.ts — Extension 侧逻辑，不属于 webview 迁移范围
  ├─ ⏳ neko-cut/extension 仅 1 处 DEFAULT_COLOR_CORRECTION，neko-types 未删除前不影响
  └─ ⏳ 清理 neko-types 导出 — 受 Phase 4 AudioProperties 阻塞（内部仍依赖 UI 类型）
  依据：这些 UI 类型仅被 neko-cut 消费（28 files/167 occurrences），
        其他包（neko-agent, neko-canvas 等）零类型引用，详见 §8 #5
```

---

## 6. 完整字段对照表

### Timeline 级别

| 字段 | Proto | Rust | TS (ProjectData) | 状态 |
|---|---|---|---|---|
| `duration` | ✅ | ✅ | 💭 通过 tracks 计算 | 同步 |
| `resolution` | ✅ | ✅ | ✅ | 同步 |
| `fps` | ✅ | ✅ | ✅ | 同步 |
| `tracks` | ✅ | ✅ | ✅ | 同步 |
| `defaults` | ✅ | ✅ | ✅ | 同步（TS 有 UI 污染） |
| `version` | ✗ | ✗ | ✅ | TS only（文件格式版本） |
| `name` | ✗ | ✗ | ✅ | TS only（项目名称） |

### Track 级别

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `id` | ✅ | ✅ | ✅ | 同步 |
| `name` | ✅ | ✅ | ✅ | 同步 |
| `type` | ✅ | ✅ | ✅ | 同步 |
| `elements` | ✅ | ✅ | ✅ | 同步 |
| `muted` | ✅ | ✅ | ✅ | 同步 |
| `locked` | ✅ | ✅ | ✅ | 同步 |
| `hidden` | ✅ | ✅ | ✅ | 同步 |
| `isMain` | ✅ | ✅ | ✅ | 同步 |

### Element 级别（BaseElement）

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `id` | ✅ | ✅ | ✅ | 同步 |
| `name` | ✅ | ✅ | ✅ | 同步 |
| `type` | ✅ | ✅ | ✅ | 同步 |
| `duration` | ✅ | ✅ | ✅ | 同步 |
| `startTime` | ✅ | ✅ | ✅ | 同步 |
| `trimStart` | ✅ | ✅ | ✅ | 同步 |
| `trimEnd` | ✅ | ✅ | ✅ | 同步 |
| `transform` | ✅ | ✅ | ✅ | 同步 |
| `opacity` | ✅ | ✅ | ✅ | 同步 |
| `blendMode` | ✅ | ✅ | ✅ | 同步 |
| `effects` | ✅ | ✅ | ✅ | 同步 |
| `muted` | ✅ | ✅ | ✅ | 同步 |
| `hidden` | ✅ | ✅ | ✅ | 同步 |
| `locked` | ✅ | ✅ | ✅ | 同步 |
| `speed` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 1) |
| `transitionIn` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `transitionOut` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |

### AudioProperties

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `volume` | ✅ | ✅ | ⚠️ number\|AnimatableProperty | TS 扩展 |
| `pan` | ✅ | ✅ | ⚠️ number\|AnimatableProperty | TS 扩展 |
| `muted` | ✅ | ✅ | ✅ | 同步 |
| `fadeIn` | ✅ | ✅ | ✅ | 同步 |
| `fadeOut` | ✅ | ✅ | ✅ | 同步 |
| `fadeInCurve` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 3) |
| `fadeOutCurve` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 3) |
| `gain` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 3) |
| `eq` | ✗ | ✗ | ✅ | 保留 UI 层 |

### TextElement

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `content` | ✅ | ✅ | ✅ | 同步 |
| `fontFamily` | ✅ | ✅ | ✅ | 同步 |
| `fontSize` | ✅ | ✅ | ✅ | 同步 |
| `color` | ✅ | ✅ | ✅ | 同步 |
| `backgroundColor` | ✅ | ✅ | ✅ | 同步 |
| `textAlign` | ✅ | ✅ | ✅ | 同步（引擎未实现渲染） |
| `fontWeight` | ✅ | ✅ | ✅ | 同步 |
| `fontStyle` | ✅ | ✅ | ✅ | 同步 |
| `textDecoration` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `lineHeight` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `letterSpacing` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `strokeColor` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `strokeWidth` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `shadow` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `x` | ✗ | ✗ | ⚠️ @deprecated | 删除 |
| `y` | ✗ | ✗ | ⚠️ @deprecated | 删除 |
| `rotation` | ✗ | ✗ | ⚠️ @deprecated | 删除 |

### SubtitleElement

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `text` | ✅ | ✅ | ✅ | 同步 |
| `fontSize` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 0 补全) |
| `color` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 0 补全) |
| `fontFamily` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `backgroundColor` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `textAlign` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `strokeColor` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `strokeWidth` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `shadow` | ✅ | ✅ | ✅ | ✅ 同步 (Phase 2) |
| `language` | ✗ | ✗ | ✅ | 保留 UI 层 |
| `isDefault` | ✗ | ✗ | ✅ | 保留 UI 层 |

### MediaElement

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `src` | ✅ | ✅ | ✅ | 同步 |
| `resourceId` | ✅ | ✅ | ✅ | 同步 |
| `audio` | ✅ | ✅ | ✅ | 同步 |
| `mediaType` | ✅ | ✅ | ✅ | 同步 |
| `linkedAudioId` | ✅ | ✅ | ✅ | 同步 |
| `volume` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |

### AudioElement

> **Proto 设计问题**：`AudioElementData` 同时拥有 `optional AudioProperties audio = 3`（嵌套消息）和独立的 `volume = 6 / pan = 7 / fade_in = 8 / fade_out = 9` 字段，两者语义完全重叠。Phase 0 中应明确以 `AudioProperties` 为唯一权威，移除冗余的顶层字段。

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `src` | ✅ | ✅ | ✅ | 同步 |
| `resourceId` | ✅ | ✅ | ✅ | 同步 |
| `audio` | ✅ | ✅ | ✅ | 同步 |
| `linkedVideoId` | ✅ | ✅ | ✅ | 同步 |
| `audioSettings` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |
| `volume` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |
| `pan` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |
| `fadeIn` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |
| `fadeOut` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |

### ShapeElement

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `shapeType` | ✅ | ✅ | ✅ | 同步 |
| `fill` | ✅ | ✅ | ✅ | 同步 |
| `stroke` | ✅ | ✅ | ✅ | 同步 |
| `strokeWidth` | ✅ | ✅ | ✅ | 同步 |

---

## 7. 引擎渲染现状参考

| 功能 | 定义 | 存储 | 实际渲染 |
|---|---|---|---|
| Text: content, font, color, weight, style | ✅ | ✅ | ✅ |
| Text: background_color, text_align | ✅ | ✅ | ✅ (rasterize_styled 已接入) |
| Text: decoration, line_height, stroke, shadow | ✅ | ✅ | ✅ (rasterize_styled 已接入) |
| Text: letter_spacing | ✅ | ✅ | ✗ (cosmic-text 无直接 API，需手动调整 glyph 位置) |
| Audio: volume, pan, fade_in, fade_out | ✅ | ✅ | ✅ |
| Audio: fade_curve (easing), gain (dB) | ✅ | ✅ | ✅ (Phase 3 已接入 audio_mixer) |
| Audio: eq | ✗ | ✗ | ✗ |
| Subtitles: basic + enhanced rendering | ✅ | ✅ | ✗ (已定义，待渲染接入，可复用 TextRenderer) |
| Transitions: 18 types GPU | ✅ | ✅ | ✗ (GPU shader 已实现，待 pipeline 集成，需 buffer→texture 架构设计) |
| Media: transform, opacity, blend | ✅ | ✅ | ✅ |
| Media: speed/variable rate | ✅ | ✅ | ✅ (get_source_time 已支持 constant speed + reverse + time remap) |
| Shapes | ✅ | ✅ | ✗ (未实现) |
| Effects (blur, color, etc.) | ✅ | ✅ | ✗ (未实现) |
| Keyframes/Animation | ✅ | ✅ | ✗ (未 evaluate) |
| Blend Modes | ✅ | ✅ | ✅ |

---

## 8. 架构评审备注

> 以下内容基于 2026-02-24 对实际代码库的验证结果。

### 代码验证结果

| 文档描述 | 验证文件 | 结论 |
|---|---|---|
| Proto TextElementData 14 字段 | `timeline.proto` TextElementData | Phase 2 已完成 |
| Proto SubtitleElementData 9 字段 | `timeline.proto` SubtitleElementData | Phase 2 已完成 |
| Proto AudioProperties 8 字段 (含 fade curve/gain) | `timeline.proto` AudioProperties | Phase 3 已完成 |
| Proto Element 含 speed/transition_in/transition_out | `timeline.proto` Element (字段 19-21) | Phase 1-2 已完成 |
| Rust 完全对齐 Proto | `native-core/src/domain/timeline.rs` | cargo check 通过 |
| TS 自动生成对齐 Proto | `generated/timeline.engine.ts` | 编译时漂移检测通过 |
| audio_mixer.rs 使用 easing 淡入淡出 + gain | `effective_volume()` 使用 `Easing::evaluate()` | Phase 3 已完成 |
| TS speed/transitionIn/Out 已迁移到引擎层 | `element.ts` BaseTimelineElement | Phase 1-2 已完成 |
| toEngineElement 使用白名单模式 | `editor-types.ts` pickKeys + ENGINE_*_KEYS | Phase 0 已完成 |

### 关键设计决策记录

1. **AnimatableAudioState 独立定义而非 extends AudioProperties**：`extends` 后将 `volume: number` 扩展为 `number | AnimatableProperty` 违反里氏替换原则，消费端代码无法安全地将子类型当作父类型使用。改为独立接口更安全。

2. **Phase 0 的必要性**：当前三层手动同步（Proto → Rust → TS）是所有不一致问题的根因。引入代码生成管道（buf / protobuf-ts）可在编译期保证对齐，后续 Phase 1-4 每次修改 Proto 都能自动同步到 TS 层。

3. **SubtitleElementData 与 TextElementData 的复用**：两者在新增字段后高度重叠（6 个相同字段）。当前阶段保持独立定义，避免过早抽象。当字段进一步趋同时再提取公共 `TextStyleProperties`。

4. **转场放在 Element 而非 Track 上**：虽然转场是元素间关系，但 Element 级别的 `transition_in/out` 是业界惯例，且与现有 `ElementEditState` 中的设计一致，迁移成本最低。

5. **UI 类型应从 neko-types 迁移到 neko-cut/webview** (2026-02-25 代码库验证)：

   `neko-types` 的定位是"共享类型，对齐 Proto/引擎"，但当前混入了 5 组纯 UI 类型（`ui-state.ts`、`animation.ts`、`colorCorrection.ts`、`mask.ts`、`keyframe.ts`）。这些类型：
   - **仅被 neko-cut 消费**：28 个文件、167 次引用全部在 neko-cut/webview 内
   - **其他包零类型引用**：neko-agent 中 3 处仅为工具名称字符串 `'SetColorCorrection'`，非类型导入；neko-canvas、neko-audio 等完全不使用
   - **neko-types 自身 57 次引用**均为定义及内部交叉引用

   放在共享层违反两个原则：
   - **SRP**：共享类型包不应承担应用层 UI 状态定义的职责
   - **依赖方向**：UI 类型是 L3 应用层概念，定义在 L2 共享层意味着共享层知道了应用层需求

   迁移目标：
   ```
   neko-types/src/types/     → 纯引擎对齐（element, transform, audio, speed, transition...）
   neko-cut/webview/src/types/ → UI 类型归属应用层（已有 editor-types.ts 在此）
   ```

   连带迁移：`utils/animation.ts`、`utils/colorCorrectionMapping.ts`、`operations/apply-keyframe.ts`。
   前置条件：Phase 4 AudioProperties 清理（解除 `AnimatableProperty` 与引擎 `AudioProperties` 的耦合）。
