# 角色创作领域

本目录记录面向角色模型、表情、动作和实时驱动的创作领域架构，包括 Live2D、Neko Puppet、未来 avatar/VRM 边界、tracking 映射和角色素材包。主要项目格式为 `.nkp`。

## 范围

- `.nkp profile: live2d` 的 Live2D/MOC3/model3 bundle 导入、预览和参数驱动。
- `.nkp profile: neko-puppet` 的 Neko 原生 Puppet 骨骼、网格、BlendShape、参数、动作和表情。
- 表情、motion、physics、lip-sync、tracking 映射和 Live 驱动配置。
- 向 Scene/Live Stage、Interactive Canvas、Video 和 Agent 暴露角色表现能力。

## 不负责范围

- 绘制角色立绘和图层资产：见 [`../image/`](../image/)。
- 2D Scene、舞台、灯光、camera、actor 编排和 Live profile：见 [`../scene/`](../scene/)；这些由 `.nkm`/`neko-model` 承接，不写入 `.nkp`。
- 互动画布节点和流程编排：见 [`../interactive/`](../interactive/)。

## 参与包与横切能力

| 类型       | 参与者                                                       |
| ---------- | ------------------------------------------------------------ |
| 主要创作包 | `neko-puppet`                                                |
| 关联创作包 | `neko-model`, `neko-live`, `neko-sketch`                     |
| 支撑包     | `neko-engine`, `neko-client`, `neko-assets`, `neko-market`   |
| 横切能力   | Agent、Engine、Client、Proto、UI、Assets/Entity/Search       |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
