# 领域文档

`docs/domains/` 用于管理面向创作目标的领域文档。领域按用户要完成的创作产物划分，例如视频创作、音频创作、模型创作、2D 创作和互动创作；一个领域通常会跨多个子包、横切能力和运行平面。

不要按子包、技术层或横切能力划分领域。Agent、Engine、UI、Assets、Entity、Search、Market、Auth、Quality 等是支撑能力或系统边界，应放在 `docs/architecture/`、`docs/research/`、`docs/status/`、`quality/` 或包私有文档中，而不是作为 `docs/domains/<domain>/` 的一等目录。

## 目录规则

领域文档放在：

```text
docs/domains/<creative-goal>/
```

领域架构文档放在：

```text
docs/domains/<creative-goal>/architecture.md
```

不要把领域内部架构放到 `docs/architecture/<domain>/`。`docs/architecture/` 只保存系统级约束和跨领域不变量。

## 当前创作领域入口

| 创作领域                       | 创作目标                                               | 典型参与包与横切能力                                                                                               |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [`video/`](video/)             | 视频、分镜、剪辑、预览、导出、自动后期                 | `neko-cut`, `neko-story`, `neko-canvas`, `neko-preview`, `neko-tools`, `neko-engine`, Agent, Assets, Entity/Search |
| [`audio/`](audio/)             | 音频编辑、后期、效果链、录制、实时音频                 | `neko-audio`, `neko-live`, `neko-engine`, `neko-client`, Agent, Assets                                             |
| [`model/`](model/)             | 3D 模型、场景、LookDev、材质、Viewport、XR/3D 互动预览 | `neko-model`, `neko-engine`, `neko-client`, `neko-proto`, Agent, Assets                                            |
| [`2d/`](2d/)                   | 2D 绘画、PSD、Puppet、Live2D/Inochi2D、2D 动画素材     | `neko-sketch`, `neko-puppet`, `neko-engine`, `neko-ui`, Agent, Assets                                              |
| [`interactive/`](interactive/) | 互动叙事、画布交互、实时合成、设备输入、创作运行态     | `neko-canvas`, `neko-live`, `neko-story`, `neko-model`, `neko-engine`, Agent, UI                                   |

只在有明确创作目标和正文需要时创建领域目录，避免维护空目录。

## 横切支撑能力

| 横切能力                                                 | 文档位置                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 子包边界、UI 层、公共代码、Extension/Webview/Engine 约束 | [`../architecture/package-boundaries.md`](../architecture/package-boundaries.md) |
| Agent 工作流、Prompt、Skill、Memory、Tool、Provider 边界 | `docs/architecture/` 或具体创作领域的 `integration.md`                           |
| Engine、Proto、Client、GPU、stream、zero-copy 约束       | `docs/architecture/` 或具体创作领域的 `integration.md`                           |
| Assets、Entity、Search、Market、缓存和路径               | `docs/architecture/` 或具体创作领域的 `data-flow.md`                             |
| 调研、竞品、技术对标                                     | `docs/research/`                                                                 |
| gap、迁移、审计、实施计划                                | `docs/status/` 或 `openspec/changes/`                                            |

## 推荐文件

| 文件                | 内容                                                     |
| ------------------- | -------------------------------------------------------- |
| `README.md`         | 创作目标、范围、不负责范围、参与包/横切能力、阅读路径    |
| `architecture.md`   | 领域内部架构、核心抽象、模块边界                         |
| `capability-map.md` | 能力地图和扩展点                                         |
| `data-flow.md`      | 用户意图、项目数据、预览、导出、回写路径                 |
| `integration.md`    | 与 Agent、Engine、Proto、Assets、Search 等横切能力的边界 |

## 提升规则

领域文档中的约束如果开始影响多个创作领域，应该提升到 `docs/architecture/`；领域文档保留简短摘要并链接系统级文档。
