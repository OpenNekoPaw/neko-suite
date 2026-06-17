# 互动画布领域

本目录记录面向互动画布的领域架构，包括节点、连接、容器、触发器、route、preview session、Agent workflow node 和跨领域资产引用。`interactive` 在本仓库中特指互动画布，不泛指所有 Live、设备或运行态能力。

## 范围

- 节点图、容器、连接、端口、触发器和可执行创作流。
- Storyboard、SceneGroup、Shot、Gallery、Script、Document、Model、CanvasEmbed 等引用节点。
- preview route、preview session、节点执行摘要和 Agent workflow node。
- 与 Story、Image、Scene、Character、Audio、Video、Agent、Engine、UI 的集成边界。

## 不负责范围

- 剧本文本和叙事索引：见 [`../story/`](../story/)。
- 图像绘制、PSD 和精灵表：见 [`../image/`](../image/)。
- 2D/3D 场景和 Live 舞台：见 [`../scene/`](../scene/)。
- 角色、Live2D、Puppet 和 tracking 映射：见 [`../character/`](../character/)。
- 单纯音频后期或视频导出：见 [`../audio/`](../audio/) 与 [`../video/`](../video/)。

## 参与包与横切能力

| 类型       | 参与者                                                   |
| ---------- | -------------------------------------------------------- |
| 主要创作包 | `neko-canvas`                                            |
| 关联创作包 | `neko-story`, `neko-agent`, `neko-preview`, `neko-assets` |
| 横切能力   | Agent、Engine、Client、Proto、UI、Assets/Entity/Search   |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
