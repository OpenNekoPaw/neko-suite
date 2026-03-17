# PropertyPanel 渲染管线分析

## 概述

PropertyPanel 是 neko-cut 视频编辑器的属性面板，管理元素的所有可编辑属性。本文档分析各属性从 UI 到引擎渲染的完整数据流，以及当前完成度。

---

## 1. 指令序列操作架构

PropertyPanel 的属性修改通过 **EditOperation 指令序列** 驱动，实现实时预览 + 可撤销的双通道架构：

### 1.1 双回调模式

```
PropertyPanel UI 操作
├─ onChange（实时预览）→ updateElement() → zustand set → 立即渲染
└─ onCommit（操作入栈）→ pushOperation(EditOperation) → undo/redo 历史
```

- **onChange**: 拖拽滑块时每帧触发，直接写入 store，**不记录历史**
- **onCommit**: 释放/blur 时触发，创建 `EditOperation` 推入 undo 栈

### 1.2 指令流转路径

```
WebView                    Extension Host              Rust Engine
───────                    ──────────────              ───────────
pushOperation(op)
    │
    ├─ undoStack.push(op)
    │
    └─ syncOperationToExtension(op)
         │ postMessage('operationApplied')
         ▼
    messageHandler.handleOperationApplied()
         │
         ├─ applyOperation(model, op)  ← Extension 本地同步
         │
         └─ RUST_FAST_PATH_OPS.has(op.type)?
              │
              ├─ YES → dispatch('streams:applyOperation', op)
              │         │
              │         ▼
              │    StreamController.applyOperation()
              │         │
              │         ▼
              │    Timeline.try_apply_operation()
              │         │
              │         ├─ Applied → update_timeline() → stream loop 下帧自动更新
              │         └─ Unsupported → 返回 false
              │
              └─ NO / 失败 → fallback: dispatch('streams:update', fullTimeline)
```

### 1.3 快速路径操作类型

以下 14 种操作走增量快速路径（`streams:applyOperation`），无需全量 Timeline 重建：

| 优先级 | 操作类型 | 说明 |
|--------|---------|------|
| P0 | `element.update` | **属性修改**（transform/opacity/effects/masks 等） |
| P0 | `track.toggle` | 轨道启用/禁用 |
| P0 | `element.toggle` | 元素 hidden/muted 切换 |
| P1 | `track.update` | 轨道属性修改 |
| P1 | `element.splitKeepLeft` | 分割保留左侧 |
| P1 | `element.splitKeepRight` | 分割保留右侧 |
| P1 | `project.update` | 项目属性修改 |
| P2 | `element.add` | 添加元素 |
| P2 | `element.remove` | 删除元素 |
| P2 | `element.move` | 移动元素 |
| P2 | `element.splitAt` | 在指定位置分割 |
| P2 | `element.linkAudio` | 音频关联 |

### 1.4 Stream Loop 自动更新

```rust
// apply_operation_to_stream() 成功后：
self.playback.update_timeline(stream_id, timeline_arc).await?;
// ↓
active_streams.update_state(stream_id, |s| {
    s.timeline_update = Some(timeline);  // 信号通知 decode loop
    s.timeline_seq += 1;                 // 版本递增
});
// ↓
// stream loop 检测 timeline_seq 变化 → 下一帧使用更新后的 Timeline
```

**结论**: PropertyPanel 的属性修改通过 `element.update` 指令序列操作引擎，走增量快速路径，stream loop 自动拾取更新，**无需全量 Timeline 重建**。

---

## 2. 预览管线双路径

### 2.1 播放路径（H.264 流）

```
Engine stream loop → Timeline.elements_at_time(t)
                   → element.get_source_time(t)     ← 正确处理 speed/timeRemap
                   → decode + EffectDispatcher       ← 特效处理
                   → MaskRasterizer                  ← 蒙版光栅化
                   → GpuCompositor.composite()       ← GPU 合成（含 blendMode）
                   → H.264 encode → WebSocket → WebView
```

### 2.2 暂停 Composite 路径（RGBA 帧）

```
WebView buildCompositeLayers(project, time)
  → CompositeLayerConfig[] { source, sourceTime, transform, opacity, effects, masks, transition }
  → postMessage('media:renderCompositeFrame')
  → Extension buildTimelineForComposite()
  → dispatch('timelines:composite')
  → Engine composite() → decode + effects + masks → RGBA → base64 → WebView canvas
```

### 2.3 两条路径的差异

| 能力 | 播放路径 | Composite 路径 | 说明 |
|------|---------|---------------|------|
| Speed/TimeRemap | ✅ `get_source_time()` | ⚠️ 直接 `trimStart + delta` | composite 路径未评估 speed |
| BlendMode | ✅ `element.blend_mode` | ⚠️ 未传入 | CompositeLayerConfig 缺少字段 |
| Effects | ✅ EffectDispatcher | ✅ EffectDispatcher | 两条路径均已接入 |
| Masks | ✅ MaskRasterizer | ✅ MaskRasterizer | 两条路径均已接入 |
| Transitions | ✅ TransitionProcessor | ✅ GpuTransitionProcessor | composite() 检测 transition pair → GPU 混合 |
| ColorCorrection | ✅ element.effects 同步 | ✅ colorCorrectionToCompositeEffect | PropertyPanel 自动合并到 effects[] |

**注意**: 暂停 scrub 时两条路径**同时触发** — `streams:seek` 产生 H.264 帧 + `renderCompositeFrame` 产生 RGBA 帧。Composite 路径用于高质量无损预览。

---

## 3. 属性完成度矩阵

### 3.1 全链路完成（UI → Store → Undo → Engine）

| 属性区域 | 组件 | 关键帧 | 引擎渲染 | 状态 |
|---------|------|--------|---------|------|
| Transform (x/y/scale/rotation) | PropertyRow × 6 | ✅ | ✅ | ✅ 完成 |
| Opacity | PropertyRow | ✅ | ✅ | ✅ 完成 |
| Effects (blur/style/shader) | EffectsPanel | ❌ | ✅ EffectDispatcher | ✅ 完成 |
| Masks (rect/ellipse/polygon/bezier) | MaskPanel + MaskEditor | ❌ | ✅ MaskRasterizer | ✅ 完成 |
| Transitions (in/out) | TransitionPicker × 2 | ❌ | ✅ TransitionProcessor | ✅ 完成 |
| Blend Mode | BlendMode select (27 modes) | ❌ | ✅ GpuCompositor | ✅ 完成 |
| Speed (speed/reverse/preservePitch) | SpeedControl | ❌ | ✅ get_source_time | ✅ 完成 |
| Audio (volume/pan/muted/fade/gain) | PropertyRow × 6 + NormalizeLoudness | ❌ | ✅ AudioMixer | ✅ 完成 |
| Hidden/Muted 切换 | Timeline UI | ❌ | ✅ is_visible_at / is_audio_muted | ✅ 完成 |
| Text (content/font/color/align) | PropertyRow × 9 | ❌ | ✅ TextRenderer | ✅ 完成 |
| Basic Properties (name/startTime/duration) | PropertyRow × 3 | ❌ | ✅ | ✅ 完成 |

### 3.2 未完成项

| 功能 | 问题 | 优先级 | 状态 |
|------|------|--------|------|
| **Color Correction → Engine** | TS ColorCorrection → `color-correction` EffectInstance 转换层 + Rust GPU shader | P1 | ✅ 已完成 |
| **P2.3 TransitionProcessor 接入 composite** | composite() 检测 transition layer pair → GpuTransitionProcessor 混合帧 | P1 | ✅ 已完成 |
| **元素级 Blend Mode UI** | PropertyPanel 混合模式选择器 + CompositeLayerConfig blendMode 传递 | P2 | ✅ 已完成 |

### 3.3 Composite 路径独有的 Gap（低优先级）

| Gap | 说明 | 影响 |
|-----|------|------|
| speed 未评估 | sourceTime 用 `trimStart + delta` | `streams:seek` 同时触发，Engine 侧正确渲染 |

---

## 4. 关键文件索引

### WebView（UI + Store）

| 文件 | 职责 |
|------|------|
| `components/PropertyPanel/PropertyPanel.tsx` | 属性面板主组件，区域编排 |
| `components/PropertyPanel/PropertyPanelInline.tsx` | Store 桥接，beforeSnapshot + pushOperation |
| `components/PropertyPanel/PropertyRow.tsx` | 属性行（slider/input/select/color） |
| `components/Effects/EffectsPanel.tsx` | 特效管理 UI |
| `components/Mask/MaskPanel.tsx` | 蒙版管理 UI + MaskEditor |
| `components/SpeedControl/SpeedControl.tsx` | 速度/倒放/保持音高 |
| `components/TransitionPicker/TransitionPicker.tsx` | 转场选择 + 时长/缓动 |
| `components/ColorCorrection/ColorCorrectionPanel.tsx` | 色彩校正（Basic/Curves/ColorWheels） |
| `components/PreviewPanel.tsx` | buildCompositeLayers + 预览渲染 |
| `stores/slices/operationHistorySlice.ts` | undo/redo 栈 + syncOperationToExtension |
| `stores/slices/dispatchSlice.ts` | dispatch(EditOperation) → applyOperation + pushOperation |
| `utils/composite-helpers.ts` | buildCompositeMasks + applyTransitions |

### Extension Host

| 文件 | 职责 |
|------|------|
| `editor/video/messageHandler.ts` | 接收 operationApplied → 本地 apply |
| `editor/video/videoEditorProvider.ts` | RUST_FAST_PATH_OPS 决策 → streams:applyOperation |
| `services/MediaService.ts` | dispatch 到 Engine + buildTimelineForComposite |

### Rust Engine

| 文件 | 职责 |
|------|------|
| `domain/timeline.rs` | Timeline/Element 数据模型 + try_apply_operation |
| `services/impls/timeline.rs` | composite() + apply_operation_to_stream + stream management |
| `services/impls/stream_loop.rs` | H.264 流循环 + timeline_seq 自动更新 |
| `export/gpu_export_pipeline.rs` | EffectDispatcher（blur/style/custom-shader） |
| `gpu/mask_rasterizer.rs` | MaskRasterizer（SDF GPU 光栅化） |
| `gpu/compositor.rs` | GpuCompositor（多层 GPU 合成） |
| `gpu/transition_processor.rs` | TransitionProcessor（18 种转场 GPU shader） |

---

## 5. 架构图

### 属性修改端到端流程

```
┌─────────────────────────────────────────────────────────┐
│                    WebView (React)                       │
│                                                         │
│  PropertyPanel                                          │
│    ├─ onChange ──→ updateElement() ──→ zustand store ──┐ │
│    │                                                  │ │
│    └─ onCommit ──→ pushOperation(EditOperation) ──────┤ │
│                      │                                │ │
│                      ├─ undoStack.push(op)            │ │
│                      │                                │ │
│                      └─ syncOperationToExtension(op)  │ │
│                           │                           │ │
│  PreviewPanel ◄───────────┘ (subscribes to store)     │ │
│    ├─ isPlaying: H.264 stream (Engine 自主渲染)       │ │
│    └─ isPaused:  buildCompositeLayers → composite     │ │
└───────────────────────│───────────────────────────────┘ │
                        │ postMessage                      │
┌───────────────────────▼───────────────────────────────┐ │
│                Extension Host (Node.js)                │ │
│                                                        │ │
│  messageHandler.handleOperationApplied(op)             │ │
│    ├─ applyOperation(model, op)  ← 本地同步            │ │
│    └─ RUST_FAST_PATH? ──→ streams:applyOperation ──┐   │ │
│                                                    │   │ │
│  MediaService.dispatch() ◄─────────────────────────┘   │ │
└────────────────────────│──────────────────────────────┘ │
                         │ HTTP                            │
┌────────────────────────▼──────────────────────────────┐ │
│                  Rust Engine (Sidecar)                  │ │
│                                                        │ │
│  StreamController.applyOperation()                     │ │
│    └─ Timeline.try_apply_operation()                   │ │
│         └─ update_timeline() → stream_loop 自动更新    │ │
│                                                        │ │
│  Stream Loop (per frame):                              │ │
│    Timeline → elements_at_time(t)                      │ │
│    → get_source_time (speed/timeRemap)                 │ │
│    → HwAccelDecoder.decode_gpu_at()                    │ │
│    → EffectDispatcher.apply_effects()                  │ │
│    → MaskRasterizer.rasterize_masks()                  │ │
│    → GpuCompositor.composite()                         │ │
│    → H.264 encode → WebSocket → WebView                │ │
└────────────────────────────────────────────────────────┘ │
```

---

*最后更新: 2026-03-17*
