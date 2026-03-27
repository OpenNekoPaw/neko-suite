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

## 6. GPU 管线分析：零拷贝状态

### 6.1 导出管线数据流（实际路径）

```
HW Decoder (VideoToolbox/VAAPI/NVENC)
  │ IOSurface / DMA-BUF / DXGI SharedHandle
  ▼ [零拷贝导入] Nv12TextureImporter
NV12 Texture (GPU)
  │ nv12_renderer.rs: render pipeline (BT.601/709/2020)
  ▼
RGBA16Float Texture (GPU)
  │ texture_compositor.rs: 多层合成 + blend mode + transform
  ▼
Composited Frame (GPU)
  │ EffectDispatcher (gpu_export_pipeline.rs): texture-to-texture ping-pong chain
  │   ├─ color-correction → GpuStyleProcessor::apply_color_correction_tex() ← 零拷贝
  │   ├─ blur → GpuBlurProcessor::apply_blur_tex()
  │   ├─ style → GpuStyleProcessor (vignette/glow/grain/aberration)
  │   └─ unknown → apply_custom_tex_fallback() ← 唯一 CPU round-trip
  ▼
Effects Output (GPU)
  │
  ├─ [macOS] rgba_to_nv12_texture.rs → IOSurface → VideoToolbox ← 零拷贝
  └─ [Linux/Windows] rgba_to_nv12.rs → map_async readback → CPU NV12 → Encoder
```

### 6.2 当前 CPU-GPU 拷贝点

| # | 位置 | 方向 | 平台 | 阻塞 | 说明 |
|---|------|------|------|------|------|
| ① | `rgba_to_nv12.rs:500,523` | GPU→CPU | Linux/Windows | **YES** | NV12 Y+UV readback（macOS 已零拷贝） |
| ② | `apply_custom_tex_fallback()` :358 | GPU→CPU→GPU | 全平台 | YES | 未知 effect CPU fallback（仅 custom shader 触发） |
| ③ | `process_frame_to_cpu()` :953 | GPU→CPU | 全平台 | YES | 暂停预览 RGBA 帧（非实时路径） |

**关键结论**：
- **macOS 导出/预览已完全零拷贝**（IOSurface → VideoToolbox）
- **Linux/Windows** 的最终 NV12 readback 是真实瓶颈
- 色彩校正在导出管线已使用 `GpuStyleProcessor` texture-to-texture 路径，**不存在 readback**

### 6.3 平台零拷贝基础设施

| 平台 | 导入 | 导出 | 状态 |
|------|------|------|------|
| macOS | IOSurface → Metal → wgpu | wgpu → IOSurface → VideoToolbox | ✅ 已打通 |
| Linux | DMA-BUF → VkImage → wgpu | DMA-BUF export 代码已写 | ⚠️ 导入零拷贝，导出仍 readback |
| Windows | DXGI SharedHandle → wgpu | DXGI export 代码已写 | ⚠️ 导入零拷贝，导出仍 readback |

### 6.4 Property 能力 GPU 覆盖矩阵

| Property Panel 能力 | Engine Shader | GPU 处理 | CPU-GPU Copy |
|---------------------|-------------|----------|-------------|
| **Transform** (position/scale/rotation) | `texture_compositor.rs` render pipeline | ✅ | 无 |
| **Opacity** | `texture_compositor.rs` alpha blend | ✅ | 无 |
| **Blend Mode** (27种) | `texture_compositor.rs` Photoshop-compatible | ✅ | 无 |
| **Basic Color Correction** (15参数) | `style_processor.rs` texture-to-texture | ✅ | 无 |
| **LUT** | `lut3d.rs` 3D LUT lookup | ✅ | 无（LUT 上传一次） |
| **Gaussian/Motion/Radial Blur** | `blur_processor.rs` 5种模式 | ✅ | 无 |
| **Noise/Film Grain** | `style_processor.rs` | ✅ | 无 |
| **Glow** | `style_processor.rs` | ✅ | 无 |
| **Vignette** | `style_processor.rs` | ✅ | 无 |
| **Chromatic Aberration** | `style_processor.rs` | ✅ | 无 |
| **Custom Shaders** (pixelate/edge/posterize/wave 等) | `custom_shader_processor.rs` preset + runtime | ✅ | 无 |
| **Transitions** (18种) | `transition_processor.rs` | ✅ | 无 |
| **Masks** (rect/ellipse/polygon/bezier) | `mask_rasterizer.rs` SDF | ✅ | 无 |
| **Text** | `text_renderer.rs` | ✅ | ⚠️ 字体光栅化 CPU→GPU（必要开销） |
| **Audio** (volume/pan/fade/gain) | AudioMixer CPU 处理 | N/A | N/A（音频流独立） |
| **Speed/Reverse** | 时间重映射逻辑 | N/A | N/A（解码层处理） |
| **Curves 曲线调色** | ❌ 无 shader | — | — |
| **Color Wheels 三向色轮** | ❌ 无 shader | — | — |
| **HSL 选择性调色** (8色域) | ❌ 无 shader | — | — |
| **Chroma Key** | ❌ 无 shader | — | — |
| **Luma Key** | ❌ 无 shader | — | — |
| **Sharpen** | ❌ 无 shader | — | — |

### 6.5 总结

| 维度 | 数值 |
|------|------|
| UI → Engine 覆盖率 | **~80%**（6 项 UI-only 无 shader） |
| 已实现功能 GPU 处理率 | **~98%**（text rasterize 必要开销 + unknown effect fallback） |
| macOS 端到端零拷贝 | ✅ **已打通**（IOSurface 全链路） |
| Linux/Windows 零拷贝 | ⚠️ 导入已打通，导出 NV12 仍有 readback |

### 6.6 剩余优化路径

| 优先级 | 任务 | 收益 |
|--------|------|------|
| **P1** | 补齐 6 个缺失 shader: Curves / ColorWheels / HSL / ChromaKey / LumaKey / Sharpen | UI→Engine 覆盖率 → 100% |
| **P2** | Linux/Windows NV12 导出零拷贝（激活 DMA-BUF/DXGI export 路径） | 全平台零拷贝 |
| **P2** | 将 `apply_custom_tex_fallback()` CPU round-trip 迁移到 GPU compute | 消除 unknown effect readback |

### 6.7 已清理的死代码（2026-03-27）

| 文件 | 内容 | 原因 |
|------|------|------|
| `gpu/processor.rs` | `GpuProcessor` — buffer-based CC compute + `read_buffer_sync()` | 无调用者，导出管线使用 `GpuStyleProcessor` texture-to-texture 路径 |
| `gpu/gpu_pipeline.rs` | `GpuPipeline` / `ZeroCopyPipelineBuilder` — Phase 2 接口 | 纯接口定义无实际处理逻辑，`GpuExportPipeline` 才是真正管线 |

---

*最后更新: 2026-03-27*
