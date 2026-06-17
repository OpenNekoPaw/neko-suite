# 角色创作领域架构

更新日期：2026-06-17

角色创作领域以 `.nkp` 为参数驱动角色真值。`.nkp` 使用 `profile` 区分 `live2d`、`neko-puppet` 和未来 avatar profile；Scene/Live Stage 通过 actor 引用消费角色，不复制角色参数、motion、expression 或 physics 真值。

`neko-puppet` 是 `.nkp profile: live2d` 和 `.nkp profile: neko-puppet` 的创作入口所有者。它不承担 generic 2D Scene authoring；sprite/tilemap/2D light/parallax/particle/camera/scene graph 属于 `.nkm profile: 2d`，由 `neko-model` 负责。

## 模块职责

| 参与者        | 职责                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `neko-puppet` | Live2D/MOC3 预览、参数面板、动作回放、Puppet 编辑 UI 和导出          |
| `neko-engine` | `runtime-puppet`、puppet renderer、stream、motion/expression runtime |
| `neko-client` | Engine HTTP/WS 客户端、puppet stream/control 消费                    |
| `neko-live`   | 实时 tracking、audio lip-sync、Agent/live 控制对角色参数的驱动       |
| Agent         | 角色素材整理、参数映射建议、表情/动作生成和质量检查                  |

## `.nkp` profile

```text
.nkp
├─ profile: live2d
│  ├─ source: model3.json / moc3 / bundled refs
│  ├─ parameters / expressions / motions / physics
│  └─ tracking mapping
└─ profile: neko-puppet
   ├─ meshes / bones / blendShapes
   ├─ parameters / motions / expressions
   └─ tracking mapping
```

## 稳定边界

- `.nkp` 保存角色模型源、参数、motion、expression、physics 和 tracking 映射，不保存舞台 camera、灯光、actor 编排或 scene switching。
- `.nkp` 不保存 tilemap、2D light、parallax、particle、scene camera 或 generic scene graph；这些属于 `.nkm profile: 2d`。
- Live2D 是 `.nkp profile: live2d`，不是独立项目格式。
- Live 舞台通过 `.nkm profile: live` 引用 `.nkp` actor；Live 驱动参数可以进入 `.nkm` routing，但角色参数定义和默认映射归 `.nkp`。
- Live2D/Cubism SDK 类型不得穿透到 `engine-types`、`neko-client` 或领域项目格式；需要接入时通过 adapter id/version、source refs 和可复建 import settings 表达。
- Sketch/Image 输出可以作为角色源图或参考图，但 `.nks` 不直接成为 Puppet runtime 状态。

## 基础模式与专业模式

Puppet/Live2D 编辑器按“让角色快速动起来”和“完整 rig/参数/动画精修”区分模式。两种模式共享 `.nkp` 参数、motion、expression、physics 和 tracking 映射真值。

| 模式     | 定位                       | 能力边界                                                                                                                     |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | 导入、预览、表演和快速导出 | 模型导入、快速预览、表情/动作模板、口型建议、姿态建议、tracking/lip-sync 基础设置、一键导出或录制                            |
| 专业模式 | Rig、参数、驱动和动画编辑  | 节点树、参数滑杆、Control Driver、Animation clips、关键帧、驱动曲线、motion/expression/physics 参数精修、tracking 映射和诊断 |

右侧 Dock 在基础模式显示导入状态、表情/动作模板、基础参数和 AI 建议；专业模式显示 Node Tree、Parameter Panel、Control Driver、Animation、Keyframe 和诊断。AI 生成的表情、动作或映射建议必须落到 `.nkp` 的可审计参数、motion、expression 或 tracking 映射中。

## Engine 边界

- `runtime-puppet` 表示 Neko 原生 puppet/参数/mesh/motion 核心。
- MOC3/Live2D 兼容能力可作为 `runtime-puppet` 内部模块或 feature-gated adapter，但不能污染 native puppet core。
- `engine-puppet-renderer` 消费 runtime snapshot/delta 或 deformed mesh 输入，避免渲染器长期锁住 live world。
