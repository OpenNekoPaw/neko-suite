# Neko Sketch

> 2D 绘画套件：压感手绘 + 逐帧动画 + 滤镜/粒子/场景/像素/矢量 + 中英双语 i18n

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host（CustomEditorProvider .nks）+ Webview（React 18 + WebGL2）
- 规范：[CLAUDE.md](../../CLAUDE.md)
- 骨骼动画：已拆分为独立子插件 [neko-puppet](../neko-puppet/)

## Quick Reference

- **职责**：2D 绘画创作、逐帧动画编辑、高级 2D 特效
- **入口**：`packages/extension/src/extension.ts`
- **依赖**：`@neko/shared`
- **国际化**：I18nProvider + useTranslation hook，130 翻译 key，中英双语 13 组件全覆盖
- **状态**：S.1 ✅ 绘画基础 | S.3 ✅ 高级 2D + i18n
- **布局**：Webview 使用 Creative Workbench Shell：左侧工具栏保留 Brush/Eraser/Select 等绘画主工具选择，底部显隐组承接逐帧时间线与右侧面板显隐；画布保持长显，逐帧时间线作为主面板底部控件可折叠；Brush、Layer、Palette、AI、Filter 等属性与局部操作保留在右侧面板；zoom/tool/layer 等被动状态通过 `status:update` 投射到 VSCode 原生 StatusBar。

## Architecture

```
Pointer Events API（压感/倾斜输入）
  │
  ▼
Webview（React 18 + WebGL2）
  ├── 绘画引擎（RAF 连续渲染 + ping-pong FBO + 12 GLSL 混合模式）
  ├── 画笔系统（7 种笔刷 + Catmull-Rom 插值 + 4 压感曲线）
  ├── 图层系统（CRUD + 分组 + 混合模式）
  ├── 选区系统（Uint8Array bitmask）
  ├── 历史系统（区域快照，100 步）
  ├── 滤镜管线（FilterPipeline ping-pong FBO + 6 内置 GLSL 滤镜）
  ├── 粒子系统（ParticleSimulation 对象池 + WebGL2 实例化渲染）
  ├── 场景系统（视差渲染 + 4 模板 + 氛围效果 5 预设）
  ├── 像素/矢量绘制（Bresenham + 贝塞尔路径 + SVG 导出）
  ├── 国际化（I18nProvider + useTranslation，130 key 中英双语）
  └── 逐帧动画编辑器
        │ postMessage
        ▼
Extension Host（Node.js）
  └── SketchEditorProvider（CustomEditorProvider .nks）
```

## 工具栏

| 工具 | 快捷键 | 功能 |
|------|--------|------|
| Brush | B | 压感手绘（7 种笔刷） |
| Eraser | E | 压感擦除 |
| Select | S | 矩形选区（拖拽预览 + bitmask） |
| Move | M | 移动图层偏移（offsetX/offsetY） |
| Shape | V | 矢量形状（矩形/椭圆/多边形/星形） |
| Transform | T | 图层变换（翻转 H/V、旋转 90°、清空） |
| Eyedropper | I | 拾取画布像素颜色 → 自动切回 Brush |
| Fill | G | 洪水填充（stack-based flood fill, tolerance=32） |
| Zoom | Z | 点击放大 1.5×，Alt+click 缩小 |

## 画布右键菜单

```
Undo / Redo
──────────
Select All / Deselect
──────────
Flip Horizontal / Flip Vertical / Rotate 90° CW
──────────
Clear Layer (danger)
──────────
Zoom In / Zoom Out / Reset Zoom
```

## 笔刷类型

| 笔刷 | 特点 |
|------|------|
| `pencil` | 硬边缘，压感 → 透明度 |
| `pen` | 平滑，压感 → 线宽 |
| `watercolor` | 混色，湿纸效果 |
| `airbrush` | 柔和喷射 |
| `eraser` | 压感擦除 |
| `marker` | 平头，倾斜 → 形状 |
| `pixel` | 无抗锯齿像素画 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端渲染 | WebGL2（自建引擎，RAF 连续渲染 + ping-pong FBO 合成） |
| 状态管理 | Zustand（12+ slices） |
| 国际化 | @neko/shared I18nService + I18nProvider + useTranslation |
| 输入 | Pointer Events API（pressure / tiltX / tiltY） |
| Extension | VSCode Extension API + TypeScript + esbuild |

### EditOperation 集成

Webview 端通过 `sketchOperationStore` 桥接层记录编辑操作：

- **操作类型**：`sketch.layer.*`（图层 CRUD/移动/分组）、`sketch.stroke.*`（笔画应用）、`sketch.canvas.*`（画布配置）
- **Store**：`stores/sketchOperationStore.ts` — 记录操作 → postMessage 同步
- **layerSlice 集成**：5 个图层操作方法在执行后自动调用 operationStore 记录
- **Extension 同步**：`operationApplied` 消息 → SketchEditorProvider dirty 事件
