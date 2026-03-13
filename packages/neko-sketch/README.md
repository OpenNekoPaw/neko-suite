# Neko Sketch

> 2D 创作套件：压感手绘 + Inochi2D 骨骼动画 + 逐帧动画

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host（CustomEditorProvider .nks）+ Webview（React 18 + WebGL2）+ neko-engine（native-puppet sidecar）
- 规范：[CLAUDE.md](../../CLAUDE.md)
- 能力分析：[docs/architecture/2d-capability-analysis.md](../../docs/architecture/2d-capability-analysis.md)

## Quick Reference

- **职责**：2D 绘画创作、Inochi2D 立绘动画预览与参数驱动、逐帧动画编辑
- **入口**：`packages/extension/src/extension.ts`
- **依赖**：`@neko/shared`、`@neko/neko-client`（通过 EngineClient 访问 native-puppet）
- **激活依赖**：`neko-engine`（extensionDependency，native-puppet sidecar）
- **状态**：S.1 ✅ 绘画基础完成 | S.2 ⚙️ 骨骼动画进行中

## Architecture

```
Pointer Events API（压感/倾斜输入）
  │
  ▼
Webview（React 18 + WebGL2）
  ├── 绘画引擎（ping-pong FBO + 12 GLSL 混合模式）
  ├── 画笔系统（7 种笔刷 + Catmull-Rom 插值 + 4 压感曲线）
  ├── 图层系统（CRUD + 分组 + 混合模式）
  ├── 选区系统（Uint8Array bitmask）
  ├── 历史系统（区域快照，100 步）
  ├── Inochi2D 动画控制器
  │     ├── 参数滑块驱动（POST /v1/puppets/param）
  │     ├── bevy_animation 动画回放（POST /v1/puppets/anim/play）
  │     └── WebSocket 实时流（WS /v1/puppets/stream，供 neko-live）
  └── 逐帧动画编辑器（S.2）
        │ postMessage / EngineClient HTTP
        ▼
Extension Host（Node.js）
  └── SketchEditorProvider（CustomEditorProvider .nks）
        └── EngineClient → neko-engine native-puppet
              ├── 变形计算（bevy_ecs + inox2d）
              └── 动画曲线（bevy_animation ParameterCurve）
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
| 前端渲染 | WebGL2（自建引擎，ping-pong FBO 合成） |
| 状态管理 | Zustand（8 slices） |
| 输入 | Pointer Events API（pressure / tiltX / tiltY） |
| 2D 骨骼后端 | neko-engine native-puppet（bevy_ecs + inox2d + bevy_animation） |
| 通信 | EngineClient HTTP + WebSocket（@neko/neko-client） |
| Extension | VSCode Extension API + TypeScript + esbuild |
