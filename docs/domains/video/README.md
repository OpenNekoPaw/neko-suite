# 视频创作领域

本目录记录面向视频产物的创作领域架构，包括素材组织、剧本/分镜、画布编排、时间线剪辑、预览、导出、自动后期和审阅闭环。

## 范围

- 视频素材导入、媒体探测、预览和质量审阅。
- 剧本、场景、分镜表、画布路线与时间线之间的创作流。
- 剪辑、轨道、关键帧、特效、导出和自动后期。
- Agent 视频理解、分镜生成、自动后期建议和质量反馈。

## 不负责范围

- Engine、Proto、Client、GPU、stream 的通用约束：见 `docs/architecture/package-boundaries.md`。
- 通用 UI、状态栏、Webview 沙箱和 Extension Host 边界：见 `docs/architecture/package-boundaries.md`。
- 音频后期、图像绘制、场景/角色编辑和互动画布：见对应创作领域。

## 参与包与横切能力

| 类型       | 参与者                                                    |
| ---------- | --------------------------------------------------------- |
| 主要创作包 | `neko-cut`, `neko-story`, `neko-canvas`, `neko-preview`   |
| 支撑包     | `neko-tools`, `neko-assets`, `neko-entity`, `neko-search` |
| 横切能力   | Agent、Engine、Proto、Client、UI、Assets/Entity/Search    |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
