# Timeline 工程定义统一方案

> 分析 neko-types、neko-engine (Rust)、proto/timeline.proto、neko-cut 之间 timeline 定义的不一致，并提出修复方案。

## 1. 现状概述

### 权威层次

| 层 | 包 | 角色 |
|---|---|---|
| L0 | `proto/timeline.proto` | IDL 定义（唯一权威源） |
| L1 | `neko-engine` (Rust) | 引擎实现，完全对齐 Proto |
| L2 | `neko-types` (TS) | 共享类型，理论对齐但有偏离 |
| L3 | `neko-cut` (TS) | 编辑器 UI 扩展 |

### 核心问题

1. **neko-types 混入 UI 字段**：TextElement、SubtitleElement、AudioProperties 中包含引擎不认识的字段
2. **部分引擎级字段缺失**：TS 定义了影响渲染输出的功能（变速、转场、文字描边等），但 Proto/Rust 未支持
3. **序列化边界模糊**：`toEngineElement()` 使用黑名单（展开排除）而非白名单，UI 字段会泄漏到引擎

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

引擎 `transition_processor.rs` 已有 18 种 GPU 转场实现，但 Element 模型中无转场字段，导致无法使用。

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

```
Layer 1: Engine Types（严格对齐 Proto）
  neko-types/element.ts → 只包含引擎认可的字段

Layer 2: UI State Types（编辑器扩展）
  neko-types/ui-state.ts → ElementEditState

Layer 3: Editor Combined Types
  neko-cut/editor-types.ts → EditorElement = TimelineElement & Partial<ElementEditState>
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

// 可动画版本独立定义，用于 UI 层
export interface AnimatableAudioProperties extends AudioProperties {
  volume: number | AnimatableProperty;
  pan: number | AnimatableProperty;
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
Phase 1 (P0): speed 变速 → Proto + Rust + TS 全链路
  ├─ 修改 Proto: 新增 SpeedProperties
  ├─ 修改 Rust: Element 新增 speed 字段
  ├─ 修改 TS: speed 从 ElementEditState 迁移到 TimelineElement
  └─ 引擎实现: 解码器时间映射 + 音频变速

Phase 2 (P1): 文本/字幕增强 + 转场接入
  ├─ Proto + Rust: TextElementData 新增 6 字段
  ├─ Proto + Rust: SubtitleElementData 新增 6 字段
  ├─ Proto + Rust: Element 新增 transition_in/out
  ├─ 引擎: text_renderer.rs 接入新字段
  └─ 引擎: 转场系统接入 export pipeline

Phase 3 (P1): 音频增强
  ├─ Proto + Rust: AudioProperties 新增 fade curve + gain
  ├─ 引擎: audio_mixer.rs 支持 easing 淡入淡出
  └─ 引擎: gain (dB→linear) 转换

Phase 4 (P2): TS 层清理
  ├─ neko-types: 清理 AudioProperties（移除 AnimatableProperty）
  ├─ neko-types: 清理 ProjectDefaults（对齐 Proto）
  ├─ neko-types: SubtitleElement 移除 language/isDefault
  ├─ neko-types: TextElement 移除 deprecated x/y/rotation
  └─ neko-cut: toEngineElement() 改为白名单模式
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
| `speed` | ✗ | ✗ | ✅ (UI) | **待提升 (P0)** |
| `transitionIn` | ✗ | ✗ | ✅ (UI) | **待提升 (P1)** |
| `transitionOut` | ✗ | ✗ | ✅ (UI) | **待提升 (P1)** |

### AudioProperties

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `volume` | ✅ | ✅ | ⚠️ number\|AnimatableProperty | TS 扩展 |
| `pan` | ✅ | ✅ | ⚠️ number\|AnimatableProperty | TS 扩展 |
| `muted` | ✅ | ✅ | ✅ | 同步 |
| `fadeIn` | ✅ | ✅ | ✅ | 同步 |
| `fadeOut` | ✅ | ✅ | ✅ | 同步 |
| `fadeInCurve` | ✗ | ✗ | ✅ | **待提升 (P1)** |
| `fadeOutCurve` | ✗ | ✗ | ✅ | **待提升 (P1)** |
| `gain` | ✗ | ✗ | ✅ | **待提升 (P2)** |
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
| `textDecoration` | ✗ | ✗ | ✅ | **待提升 (P2)** |
| `lineHeight` | ✗ | ✗ | ✅ | **待提升 (P1)** |
| `letterSpacing` | ✗ | ✗ | ✅ | **待提升 (P2)** |
| `strokeColor` | ✗ | ✗ | ✅ | **待提升 (P1)** |
| `strokeWidth` | ✗ | ✗ | ✅ | **待提升 (P1)** |
| `shadow` | ✗ | ✗ | ✅ | **待提升 (P1)** |
| `x` | ✗ | ✗ | ⚠️ @deprecated | 删除 |
| `y` | ✗ | ✗ | ⚠️ @deprecated | 删除 |
| `rotation` | ✗ | ✗ | ⚠️ @deprecated | 删除 |

### SubtitleElement

| 字段 | Proto | Rust | TS | 状态 |
|---|---|---|---|---|
| `text` | ✅ | ✅ | ✅ | 同步 |
| `fontSize` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |
| `color` | ✅ | ✅ | ❌ 缺失 | **TS 需补全** |
| `fontFamily` | ✗ | ✗ | ✗ | **待提升 (P1)** |
| `backgroundColor` | ✗ | ✗ | ✗ | **待提升 (P2)** |
| `textAlign` | ✗ | ✗ | ✗ | **待提升 (P2)** |
| `strokeColor` | ✗ | ✗ | ✗ | **待提升 (P1)** |
| `strokeWidth` | ✗ | ✗ | ✗ | **待提升 (P1)** |
| `shadow` | ✗ | ✗ | ✗ | **待提升 (P2)** |
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
| Text: background_color, text_align | ✅ | ✅ | ✗ (未实现) |
| Text: decoration, spacing, stroke, shadow | ✗ | ✗ | ✗ |
| Audio: volume, pan, fade_in, fade_out | ✅ | ✅ | ✅ |
| Audio: gain, eq, fade_curve | ✗ | ✗ | ✗ |
| Subtitles: basic rendering | ✅ | ✅ | ✗ (未实现) |
| Transitions: 18 types GPU | ✅ | ✅ | ✗ (未接入 pipeline) |
| Media: transform, opacity, blend | ✅ | ✅ | ✅ |
| Media: speed/variable rate | ✗ | ✗ | ✗ |
| Shapes | ✅ | ✅ | ✗ (未实现) |
| Effects (blur, color, etc.) | ✅ | ✅ | ✗ (未实现) |
| Keyframes/Animation | ✅ | ✅ | ✗ (未 evaluate) |
| Blend Modes | ✅ | ✅ | ✅ |
