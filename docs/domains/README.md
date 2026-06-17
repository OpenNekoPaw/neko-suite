# 领域文档

`docs/domains/` 用于管理面向创作目标的领域文档。领域按用户要完成的创作产物划分，例如剧本、图像、场景、角色、音频、视频和互动画布；一个领域通常会跨多个子包、横切能力和运行平面。

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

| 创作领域                       | 创作目标                                                             | 典型参与包与横切能力                                                                                               |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`story/`](story/)             | 剧本、叙事结构、角色/场景语义、分镜前置规划                          | `neko-story`, `neko-canvas`, `neko-agent`, Assets/Entity/Search                                                    |
| [`image/`](image/)             | 绘画、图层、PSD、逐帧动画、精灵表，主要格式 `.nks`                   | `neko-sketch`, `neko-engine`, `neko-ui`, Agent, Assets                                                             |
| [`scene/`](scene/)             | 2D/3D 场景、Live 舞台、camera/light/actor 编排，主要格式 `.nkm`      | `neko-model`, `neko-live`, `neko-engine`, `neko-client`, `neko-proto`, Agent, Assets                               |
| [`character/`](character/)     | Live2D、Puppet、角色参数、表情、动作、tracking 映射，主要格式 `.nkp` | `neko-puppet`, `neko-model`, `neko-live`, `neko-engine`, `neko-client`, Agent, Assets                              |
| [`audio/`](audio/)             | 音频编辑、后期、效果链、录制、实时音频                               | `neko-audio`, `neko-live`, `neko-engine`, `neko-client`, Agent, Assets                                             |
| [`video/`](video/)             | 视频、分镜、剪辑、预览、导出、自动后期                               | `neko-cut`, `neko-story`, `neko-canvas`, `neko-preview`, `neko-tools`, `neko-engine`, Agent, Assets, Entity/Search |
| [`interactive/`](interactive/) | 互动画布、节点、连接、触发器、route、preview session                 | `neko-canvas`, `neko-story`, `neko-agent`, `neko-engine`, UI, Assets/Entity/Search                                 |

只在有明确创作目标和正文需要时创建领域目录，避免维护空目录。

## 创作编辑器模式

创作 Webview 按“创作深度”区分基础模式和专业模式，而不是按 AI/非 AI 区分。基础模式用于低门槛多类型创作、模板、快速动作和关键基础属性；专业模式暴露完整结构、精细参数、执行/调试和高级编辑能力。两种模式共享同一份项目数据，不能演化成两套割裂的编辑器或长期兼容层。

| 创作编辑器    | 基础模式                                                                | 专业模式                                                                                            | 领域文档                                                     |
| ------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Canvas 画布   | 多类型 Creative Graph、AI 生成、素材组织、轻量语义连接、基础属性        | Interactive Workflow Graph、更多节点类型、typed ports、变量、route、preview session、执行摘要、调试 | [`interactive/architecture.md`](interactive/architecture.md) |
| 视频剪辑      | AI 快剪、模板、字幕、裁切、基础调色、基础音量、快速导出                 | 多轨 timeline、clip/track 属性、关键帧、遮罩、转场、效果、精确导出                                  | [`video/architecture.md`](video/architecture.md)             |
| 音频 DAW      | 降噪、响度标准化、AI 母带、推荐效果链、简单录音和导出                   | 多轨、mixer、effect chain、automation、preset、频谱/响度分析、录音路由                              | [`audio/architecture.md`](audio/architecture.md)             |
| Sketch 绘画   | AI 绘画、局部重绘、扩图、上色、基础画笔、基础图层、调色板               | 高级画笔、完整图层/混合、vector、fill、filter、perspective、particles、帧动画、spritesheet          | [`image/architecture.md`](image/architecture.md)             |
| Scene 编辑    | 场景模板、素材摆放、基础 camera/light/environment、AI LookDev、快速预览 | Outliner、Transform、Light、Environment、Material、动画时间线、Sculpt、CSG、Text、Shape、诊断       | [`scene/architecture.md`](scene/architecture.md)             |
| Puppet Live2D | 导入模型、快速预览、表情/动作模板、口型/姿态建议、一键导出              | 节点树、参数滑杆、Control Driver、Animation clips、关键帧、驱动曲线、参数精修                       | [`character/architecture.md`](character/architecture.md)     |

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
