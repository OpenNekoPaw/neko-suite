# 重构计划：统一 Timeline 模型

## 目标

将 `export/types.rs` 中的核心领域类型（`TimelineData`、`TrackData`、`ElementData` 等）
统一到 `domain/timeline.rs` 已有的模型（`Timeline`、`Track`、`Element`），消除两套并行模型。

## 两套模型对比

### domain::Timeline（丰富模型，已有行为方法）
- `Timeline` { duration, resolution, fps, tracks, defaults }
- `Track` { id, name, track_type, elements, muted, locked, hidden, is_main }
- `Element` { id, name, element_type, start_time, duration, trim_start, trim_end, transform, opacity, blend_mode, effects, muted, hidden, locked }
- `ElementType` = Media | Audio | Text | Shape | Subtitle

### export::types（扁平 DTO，用于序列化）
- `TimelineData` { duration, tracks }
- `TrackData` { id, track_type, elements, muted }
- `ElementData` = Media(MediaElementData) | Text(TextElementData) | Audio(AudioElementData)
- `ExportSettings` { width, height, fps, video_codec, ... }
- `ExportProgress`, `ExportState`, `ExportStats`, etc.

## 策略：domain::Timeline 作为唯一模型

`domain::Timeline` 是超集（有 resolution, fps, defaults, locked, hidden 等），
`export::TimelineData` 是子集。统一方向：**所有消费者改用 `domain::Timeline`**。

## 需要保留在 export/ 的类型

以下类型是导出专用的，不属于领域模型，保留在 `export/types.rs`：
- `ExportSettings`（及其 type alias: ExportVideoCodec 等）
- `ExportJobConfig`（引用 Timeline 而非 TimelineData）
- `ExportProgress`, `ExportState`, `ExportStats`, `ExportMetadata`
- `ExportStartResponse`, `ExportCancelResponse`, `ExportStatusResponse`, `ExportErrorResponse`
- `TimeRange`

## 需要删除的类型（被 domain 替代）

- `TimelineData` → 用 `domain::Timeline`
- `TrackData` → 用 `domain::Track`
- `TrackType` → 已在 `neko_types::TrackType`
- `ElementData` → 用 `domain::Element` + `domain::ElementType`
- `MediaElementData` (export) → 用 `domain::MediaElementData`
- `TextElementData` (export) → 用 `domain::TextElementData`
- `AudioElementData` (export) → 用 `domain::AudioElementData`
- `ElementTransform` → 用 `domain::Transform`
- `AudioSettings`, `AudioValue` → 用 `domain::AudioProperties`

## 需要补充到 domain::Timeline 的能力

domain::Element 已有 `source_path()`, `start_time`, `duration`, `end_time()`,
`is_visible_at()`, `get_source_time()` — 与 export::ElementData 的方法完全对应。

需要补充：
1. `domain::MediaElementData` 添加 `to_transform_2d()` → 返回 `gpu::Transform2D`
2. `domain::MediaElementData` 添加 `get_blend_mode()` → 返回 `gpu::BlendMode`
3. `domain::Element` 添加 `effective_volume()` / `effective_pan()` / `is_muted()` 方法

## 修改文件清单

### Phase 1: 增强 domain::Timeline（无破坏性）

1. `domain/timeline.rs` — 添加 GPU 转换方法

### Phase 2: 修改 export/types.rs（删除重复类型，保留导出专用类型）

2. `export/types.rs` — 删除 TimelineData/TrackData/ElementData 等，ExportJobConfig 改用 domain::Timeline

### Phase 3: 更新 export/ 内部引用

3. `export/mod.rs` — 更新 re-export
4. `export/gpu_export_pipeline.rs` — 改用 domain::Timeline
5. `export/service.rs` — 改用 domain::Timeline
6. `export/audio_mixer.rs` — 改用 domain::Element

### Phase 4: 更新外部消费者

7. `jvi/converter.rs` — 输出 domain::Timeline 而非 export::TimelineData
8. `jvi/loader.rs` — 返回 (Timeline, ExportSettings)
9. `preview/pipeline.rs` — 改用 domain::Timeline
12. `frame_server/server.rs` — 无需改（只引用 ExportService + routes）
13. `services/impls/timeline.rs` — 删除 crate::export::ElementData 引用
14. `services/impls/export.rs` — 更新 import
15. `services/export.rs` — 更新 import
