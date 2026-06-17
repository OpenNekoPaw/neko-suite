# 图像创作领域

本目录记录面向图像和逐帧视觉素材的创作领域架构，包括绘画、图层、PSD、逐帧动画、精灵表和 AI 辅助图像处理。主要项目格式为 `.nks`。

## 范围

- 绘画、图层、选区、画笔、调色板、滤镜和图像编辑。
- PSD 导入、图像准备、AI 图像增强和素材整理。
- 逐帧动画、帧时间线和精灵表导入/导出。
- 向 Scene、Character、Video 和 Interactive Canvas 提供可引用图像素材。

## 不负责范围

- 2D/3D 场景和 Live 舞台编排：见 [`../scene/`](../scene/)。
- Live2D/Puppet 角色参数、动作和 tracking 映射：见 [`../character/`](../character/)。
- 互动画布节点和连接编辑：见 [`../interactive/`](../interactive/)。

## 参与包与横切能力

| 类型       | 参与者                                            |
| ---------- | ------------------------------------------------- |
| 主要创作包 | `neko-sketch`                                     |
| 支撑包     | `neko-assets`, `neko-preview`, `neko-engine`      |
| 横切能力   | Agent、UI、Assets/Entity/Search、Engine media/GPU |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
