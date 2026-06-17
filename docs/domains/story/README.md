# 剧本创作领域

本目录记录面向剧本和叙事结构的创作领域架构，包括剧本文本、场景索引、角色/场景语义、分镜前置规划和 story -> canvas / video 的创作流。

## 范围

- 剧本文本、Fountain 兼容语法、结构化指令和语言服务。
- 场景、角色、动作、对白、镜头和时长等叙事语义解析。
- scene-level readiness、人物形象准备度和 story -> agent -> canvas 语义流水线。
- 向互动画布、视频时间线和资产/实体索引投射稳定引用。

## 不负责范围

- 互动画布节点和连接编辑：见 [`../interactive/`](../interactive/)。
- 图像绘制、PSD 和精灵表：见 [`../image/`](../image/)。
- 场景/Live 舞台和角色模型编辑：见 [`../scene/`](../scene/) 与 [`../character/`](../character/)。

## 参与包与横切能力

| 类型       | 参与者                                                        |
| ---------- | ------------------------------------------------------------- |
| 主要创作包 | `neko-story`                                                  |
| 关联创作包 | `neko-canvas`, `neko-cut`, `neko-agent`                       |
| 横切能力   | Agent、Assets/Entity/Search、Parser、LSP、UI、Quality         |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
