# Neko Sketch

> 绘图增强：注入 Canvas 的 Krita 级改图工具，支持压感手绘

## Context Summary

- **项目**：Neko Creator Suite - VS Code 全能内容创作工作站
- **角色**：绘图工具，压感手绘增强
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Sketch** 是 Neko Creator Suite 的绘图增强模块，为 NekoCanvas 注入 Krita 级别的绘图能力。支持压感手写板、多种笔刷、图层混合，让创作者可以直接在视频帧上进行手绘创作。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **压感支持** | 支持 Wacom 等手写板的压感输入 |
| **多种笔刷** | 铅笔、钢笔、画笔、喷枪、橡皮擦 |
| **笔刷调节** | 大小、硬度、流量、间距 |
| **颜色拾取** | 吸管工具、调色板 |
| **图层混合** | 与 Canvas 图层无缝融合 |

---

## 笔刷类型

| 笔刷 | 说明 |
|------|------|
| `pencil` | 铅笔 - 硬边缘，适合线稿 |
| `pen` | 钢笔 - 平滑边缘，适合描边 |
| `brush` | 画笔 - 柔和边缘，适合上色 |
| `airbrush` | 喷枪 - 渐变效果，适合阴影 |
| `eraser` | 橡皮擦 - 擦除内容 |

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.sketch.pressureSensitivity` | `true` | 启用压感 |
| `neko.sketch.defaultBrush` | `brush` | 默认笔刷 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Sketch: Enable Sketch Mode` | 启用绘图模式 |
| `Neko Sketch: Select Brush` | 选择笔刷 |
| `Neko Sketch: Adjust Brush Size` | 调整笔刷大小 |
| `Neko Sketch: Pick Color` | 拾取颜色 |

---

## 工作流

```
NekoCanvas 画布
    │
    └─→ 启用 Sketch Mode
            │
            ├─→ 选择笔刷
            │
            ├─→ 调整参数
            │
            └─→ 手绘创作
                    │
                    └─→ 路径数据 → GPU 渲染
```

---

## 依赖关系

```
neko-sketch
    ├── neko-canvas (扩展依赖)
    └── @uniedit/shared (类型)
```

---

## 技术栈

- **输入**：Pointer Events API (压感)
- **渲染**：Canvas 2D / GPU Pipeline
- **类型**：@uniedit/shared

---

## License

MIT
