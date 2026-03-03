# Neko Sketch

> 绘图增强：为 NekoCanvas 注入 Krita 级压感手绘能力（规划中）

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview（规划中，尚未实现）
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：压感手绘输入 → 路径数据 → 注入 NekoCanvas GPU 渲染管线
- **入口**：`src/extension.ts`（单包结构）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-canvas（extensionDependency）
- **状态**：🚧 规划中

## Architecture

```
Pointer Events API (压感输入)
  │ pointerdown/move/up + pressure
  ▼
Webview (规划中)
  ├── 笔刷引擎       → 将压感数据转为路径点（大小/硬度/流量）
  ├── Canvas 2D 预览 → 实时笔触显示
  └── 路径提交
        │
        ▼
NekoCanvas GPU Pipeline
  └── 矢量路径 → GPU 纹理合成
```

### 笔刷类型

| 笔刷 | 特点 |
|------|------|
| `pencil` | 硬边缘，适合线稿 |
| `pen` | 平滑边缘，适合描边 |
| `brush` | 柔和边缘，适合上色 |
| `airbrush` | 渐变效果，适合阴影 |
| `eraser` | 擦除内容 |

### 技术栈

Pointer Events API（压感）、Canvas 2D、GPU Pipeline（通过 neko-canvas）
