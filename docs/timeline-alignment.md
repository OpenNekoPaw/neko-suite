# Timeline 工程定义统一方案

> 最后更新：2026-03-03
> 状态：Phase 0-5 ✅ 已完成，仅剩引擎渲染缺口和转场 pipeline 集成

## 1. 权威层次

| 层 | 包 | 角色 |
|---|---|---|
| L0 | `packages/neko-proto/timeline.proto` | IDL 定义（唯一权威源） |
| L1 | `neko-engine` (Rust) | 引擎实现，完全对齐 Proto |
| L2 | `neko-types` (TS) | 共享类型，对齐引擎 |
| L3 | `neko-cut` (TS) | 编辑器 UI 扩展 |

---

## 2. 实施进度

<details>
<summary>✅ Phase 0-5 已完成 (点击展开详情)</summary>

**Phase 0**: Proto → TS 自动生成管道 ✅
- 自定义 protobufjs parser + codegen 脚本 (`scripts/proto-gen-ts.mjs`)
- 编译时漂移检测 (`__engine-check.ts`)
- `toEngineElement/toEngineTrack` 改为白名单模式
- Proto AudioElementData 字段 6-9 标记 DEPRECATED

**Phase 1 (P0)**: 变速 → Proto + Rust + TS 全链路 ✅
- SpeedProperties / TimeRemapData / TimeRemapKeyframe
- 引擎 `get_source_time()` 支持 constant speed + reverse + time remap

**Phase 2 (P1)**: 文本/字幕增强 + 转场接入 ✅
- TextElementData 新增 6 字段 + TextShadow message
- SubtitleElementData 新增 6 字段
- Element 新增 `transition_in/out` + Transition message
- 引擎 `text_renderer.rs` → `rasterize_styled()` 全面接入

**Phase 3 (P1)**: 音频增强 ✅
- AudioProperties 新增 `fade_in_curve / fade_out_curve / gain`
- `audio_mixer.rs` 从线性改为 `Easing::evaluate()` 淡入淡出

**Phase 4 (P2)**: TS 层清理 ✅
- TextElement 移除 deprecated x/y/rotation
- AudioProperties 移除 AnimatableProperty 联合类型
- SubtitleElement 移除 language/isDefault（迁移到 UI 层）

**Phase 5 (P2)**: UI 类型迁移 ✅
- 5 组 UI 类型（ui-state/animation/colorCorrection/mask/keyframe）迁移到 `neko-cut/webview/src/types/`
- `utils/animation.ts` 迁移到 `neko-cut/webview/src/utils/`
- neko-types 5 个文件标记 @deprecated

</details>

---

## 3. 待完成项

### 转场系统接入 export pipeline

`GpuTransitionProcessor` 是 buffer-based，export pipeline 是 texture-based，架构不匹配。

需要设计：给 transition processor 添加 texture-based API 或在 compositor 层面集成。

### 引擎渲染缺口

| 功能 | 定义 | 存储 | 渲染 | 说明 |
|---|---|---|---|---|
| Text: letter_spacing | ✅ | ✅ | ❌ | cosmic-text 无直接 API，需手动调整 glyph |
| Subtitles 渲染 | ✅ | ✅ | ❌ | 已定义，可复用 TextRenderer |
| Transitions 18 types | ✅ | ✅ | ❌ | GPU shader 已实现，待 pipeline 集成 |
| Shapes | ✅ | ✅ | ❌ | 未实现 |
| Effects (blur, color) | ✅ | ✅ | ❌ | 未实现 |
| Keyframes/Animation | ✅ | ✅ | ❌ | 未 evaluate |

### Proto 冗余

`AudioElementData` 字段 6-9（volume/pan/fade_in/fade_out）与 `AudioProperties audio` 语义重叠，已标记 DEPRECATED，应使用 `AudioProperties` 为唯一权威。

---

## 4. 字段对照表

### 已完全同步的字段

Timeline 级别（duration/resolution/fps/tracks/defaults）、Track 级别（id/name/type/elements/muted/locked/hidden/isMain）、Element 基础字段（id/name/type/duration/startTime/trimStart/trimEnd/transform/opacity/blendMode/effects/muted/hidden/locked/speed/transitionIn/transitionOut）、AudioProperties（volume/pan/muted/fadeIn/fadeOut/fadeInCurve/fadeOutCurve/gain）、TextElement 14 字段、SubtitleElement 9 字段、MediaElement、AudioElement、ShapeElement — **全部 Proto ↔ Rust ↔ TS 三层同步** ✅

### 仅 TS 层的字段

| 字段 | 位置 | 说明 |
|---|---|---|
| `version`, `name` | ProjectData | 文件格式版本/项目名称，TS only |
| `eq` | AudioProperties | UI 和引擎都未实现，保留 UI 层 |
| `AnimatableProperty` | neko-cut/webview | 可动画属性，随关键帧系统迁移 |

---

## 5. 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| AnimatableAudioState 独立定义 | 不 extends AudioProperties | 扩展 volume 类型违反里氏替换 |
| UI 类型位置 | neko-cut/webview/src/types/ | 仅被 neko-cut 消费（28 files/167 refs），SRP + 依赖方向 |
| 转场放在 Element | transition_in/out | 业界惯例（Premiere/DaVinci），迁移成本低 |
| SubtitleData vs TextData | 保持独立 | 虽有 6 个重叠字段，避免过早抽象 |
