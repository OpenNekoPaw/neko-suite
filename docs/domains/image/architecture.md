# 图像创作领域架构

更新日期：2026-07-15

图像创作领域以 `.nks` 为绘画和逐帧图像真值。`neko-sketch` 负责 Webview 内的绘画交互、图层状态、帧动画和精灵表工作流；Engine 只提供图像处理、滤镜、导出、ML/GPU 加速等可复用能力，不拥有 `.nks` 创作真值。

## 模块职责

| 参与者        | 职责                                                      |
| ------------- | --------------------------------------------------------- |
| `neko-sketch` | 绘画、图层、画笔、调色板、选区、逐帧动画、精灵表导入/导出 |
| `neko-engine` | 图像处理、滤镜、导出、ML/GPU 加速和必要的媒体能力         |
| `neko-assets` | 图像素材、PSD、精灵表和生成结果管理                       |
| Agent         | 图像准备、分层建议、局部增强、调色板和质量检查            |
| UI            | 绘画工具、属性面板、workbench 和键盘边界的复用层          |

## 稳定边界

- `.nks` 保存像素/图层/帧/调色板/绘画状态，不保存场景编排或角色驱动真值。
- Sketch 与 Character 之间通过导出图层、asset/entity 引用或明确 bridge 连接，不直接读写 Puppet 私有状态。
- 精灵表属于图像/帧动画工作流；Scene 或 Video 可以引用导出结果，但不成为精灵表编辑真值。
- PSD 是导入源或中间素材，不替代 `.nks` 的编辑真值。
- 若未来高分辨率画布、GPU 笔刷或 PSD 大文档需要 Engine 常驻状态，应先通过 OpenSpec 设计 `runtime-canvas` 或等价能力，不隐式塞入 `runtime-scene`。
- Agent 可使用当前图片 capability 完成参考图启发的新内容生成、多视图角色卡和镜头参考准备，但 Skill 只描述创作判断；Provider 支持、参考输入、尺寸/布局、语言/文字限制、成本和 diagnostics 由 owning capability 声明。
- 参考图 Remix 不根据猜测的来源模型选择 Provider，不建立固定 Phase、私有输出目录或通用 fallback。生成后必须读取实际结果并检查需要保留的构图/形式、风格/色彩/质感、氛围/光影/叙事与新内容目标。
- 当前 Provider 明确支持单张多视图时可以一次生成角色设定卡；拆分视图是实际结果不合格后的修复策略，不是图像领域固定流水线。
- `promptLocale` 不决定生成内容语言。生成指令语言、画面文字语言和需要原样保留的专有名词按当前 Provider 能力和创作目标分别处理；不支持时必须返回明确 diagnostic。
- 普通生成结果写入 `generated/` 并返回 ResourceRef/digest/lineage；只有用户需要正式实体绑定或跨项目复用时才进入 Asset/Entity/Character owner，不要求先导入资产库才能使用。
- 主体、角色不变量、布局、多视图要求、参考图语义角色、内容语言、禁止项和验收条件属于模型无关 intent；输入数量/格式、参考传递、多视图与文字可靠性、Prompt 方言、尺寸和成本属于当前 Provider/model/version/profile capability。模型/profile 变化后必须重新 resolve，不能复用旧支持快照。
- identity、costume、prop、style、composition、structure-only 和 product-preservation 等参考角色应保留在请求/lineage 语义中；adapter 不支持对应角色时在 dispatch 前返回 diagnostic，不得降级成无角色的通用参考图。
- 社区 Prompt 或成功结果图可以作为带 provenance 的研究/Evaluation 样本，但不能注册模型 support、选择 executor 或证明当前输出完成；默认不批量注入 Image Skill 或 Tool context。

## 基础模式与专业模式

Sketch 基础模式面向 AI 辅助绘画和常用图像编辑，专业模式面向完整图层、矢量、滤镜、帧动画和精灵表工作流。两种模式共享同一 `.nks` 真值，基础模式隐藏复杂面板而不是生成不可编辑的扁平结果。

| 模式     | 定位                     | 能力边界                                                                                                                                                                |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | AI 绘画和低门槛图像创作  | 文生图、局部重绘、扩图、上色、风格化、基础画笔、基础图层、调色板、参考图、结果预览、应用和回滚                                                                          |
| 专业模式 | 图像、图层和逐帧动画精修 | 高级画笔参数、完整 layer tree、blend mode、selection/mask、vector、fill、filter、perspective grid、particles、scene/parallax、frame timeline、spritesheet import/export |

右侧 Dock 的当前实现按 Inspector stack 裁剪：基础模式显示 Brush/Eraser、Vector/Fill 上下文面板、Palette、Layers 和 AI 操作；专业模式在此基础上开放 Frames、Spritesheet、Filter、Perspective、Particles 和 Scene 面板。AI 结果必须能作为图层、选区或帧变更进入历史栈并可回滚。

## 格式边界

```text
.nks
├─ canvas
├─ layers
├─ brushes / palette
├─ frame animation
└─ spritesheet import/export metadata
```

`.nks` 可以导出 PNG、PSD、SVG、sprite sheet 或视频序列，但这些导出物不是 `.nks` 的替代项目格式。
