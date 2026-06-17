# 图像创作领域架构

更新日期：2026-06-17

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

## 基础模式与专业模式

Sketch 基础模式面向 AI 辅助绘画和常用图像编辑，专业模式面向完整图层、矢量、滤镜、帧动画和精灵表工作流。两种模式共享同一 `.nks` 真值，基础模式隐藏复杂面板而不是生成不可编辑的扁平结果。

| 模式     | 定位                     | 能力边界                                                                                                                                                                |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | AI 绘画和低门槛图像创作  | 文生图、局部重绘、扩图、上色、风格化、基础画笔、基础图层、调色板、参考图、结果预览、应用和回滚                                                                          |
| 专业模式 | 图像、图层和逐帧动画精修 | 高级画笔参数、完整 layer tree、blend mode、selection/mask、vector、fill、filter、perspective grid、particles、scene/parallax、frame timeline、spritesheet import/export |

右侧 Dock 在基础模式显示 AI 操作、画笔/调色板/基础图层和当前选择基础属性；专业模式显示完整 Brush、Layer、Palette、Vector、Fill、Filter、Perspective、Particle、Scene、Frame 和 Spritesheet 面板。AI 结果必须能作为图层、选区或帧变更进入历史栈并可回滚。

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
