# 场景创作领域

本目录记录面向 2D/3D 场景和 Live 舞台的创作领域架构，包括 scene graph、camera、light、actor、环境、Viewport、LookDev 和 Live profile。主要项目格式为 `.nkm`。

## 范围

- 2D Scene：sprite、tilemap、2D light、parallax、particle 和 camera；`.nkm profile: 2d` 的创作入口由 `neko-model` 负责。
- 3D Scene：mesh、material、PBR/LookDev、light、camera、animation 和 viewport。
- Live Stage：actor 引用、camera/audio/tracking/agent routing、scene switching 和合成。
- Engine Scene/Viewport Route A stream、scene control、低延迟交互和诊断。

## 不负责范围

- 图像绘画、PSD 和逐帧精灵表编辑：见 [`../image/`](../image/)。
- Live2D/Puppet/角色参数和动作真值：见 [`../character/`](../character/)。
- 互动画布节点图：见 [`../interactive/`](../interactive/)。

## 参与包与横切能力

| 类型       | 参与者                                                       |
| ---------- | ------------------------------------------------------------ |
| 主要创作包 | `neko-model`（2D/3D Scene authoring）、`neko-live`（Live operation） |
| 支撑包     | `neko-preview`, `neko-assets`, `neko-engine`, `neko-client`  |
| 横切能力   | Agent、Engine、Client、Proto、UI、Assets/Entity/Search       |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`adr-model-viewport-camera-zoom.md`](adr-model-viewport-camera-zoom.md)
3. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
4. `scripts/check-3d-route-a-boundaries.mjs`
