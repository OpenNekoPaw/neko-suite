# 2D 创作领域

本目录记录面向 2D 视觉产物的创作领域架构，包括绘画、图层、PSD、Puppet、Live2D/Inochi2D、2D 动画素材和 AI 辅助图像处理。

## 范围

- 2D 绘画、图层、PSD 导入和图像编辑。
- Puppet / Live2D / Inochi2D 制作与绑定。
- 2D 光照、形变、表情、口型和动画素材准备。
- 与 Agent、Assets、Engine、UI 的集成边界。

## 不负责范围

- 3D 模型和 Scene：见 `docs/domains/model/`。
- 视频时间线剪辑和导出：见 `docs/domains/video/`。
- 通用 UI 和 Engine 规则：见 `docs/architecture/package-boundaries.md`。

## 参与包与横切能力

| 类型       | 参与者                                          |
| ---------- | ----------------------------------------------- |
| 主要创作包 | `neko-sketch`, `neko-puppet`                    |
| 支撑包     | `neko-assets`, `neko-preview`                   |
| 横切能力   | Agent、Engine、Client、Proto、UI、Assets/Entity |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
