# 互动创作领域

本目录记录面向互动体验和创作运行态的领域架构，包括互动叙事、画布交互、实时合成、设备输入、XR/Viewport 控制和 live authoring。

## 范围

- 互动叙事和多路径预览。
- 画布节点、连接、容器和运行态 route。
- 实时合成、设备输入、OSC/VMC、live 控制。
- 与模型、音频、视频、Agent、Engine、UI 的集成边界。

## 不负责范围

- 单纯视频导出：见 `docs/domains/video/`。
- 单纯音频后期：见 `docs/domains/audio/`。
- 单纯模型编辑：见 `docs/domains/model/`。

## 参与包与横切能力

| 类型       | 参与者                                                   |
| ---------- | -------------------------------------------------------- |
| 主要创作包 | `neko-canvas`, `neko-live`                               |
| 关联创作包 | `neko-story`, `neko-model`, `neko-audio`, `neko-preview` |
| 横切能力   | Agent、Engine、Client、Proto、UI、Assets/Entity/Search   |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
