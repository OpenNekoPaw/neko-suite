# 角色创作领域架构

更新日期：2026-07-15

角色创作领域以 `.nkp` 为参数驱动角色真值。`.nkp` 使用 `profile` 区分 `live2d`、`neko-puppet` 和未来 avatar profile；Scene/Live Stage 通过 actor 引用消费角色，不复制角色参数、motion、expression、physics 或 tracking 真值。

`neko-puppet` 是 `.nkp profile: live2d` 和 `.nkp profile: neko-puppet` 的创作入口所有者。它不承担 generic 2D Scene authoring；sprite/tilemap/2D light/parallax/particle/camera/scene graph 属于 `.nkm profile: 2d`，由 `neko-model` 负责。

Runtime 上，`.nkp` 通过 `PuppetService` 和 SDK-neutral `PuppetRuntimeAdapter` 进入 `runtime-puppet`。当前 Live2D-style MOC3 路径标识为 `live2d-moc3-compat`，表示 clean-room compatibility/import support，不是官方 Live2D Cubism SDK。官方 SDK 只能作为 optional `live2d-cubism` adapter 接入；未编译、未安装、未授权或未启用时必须报告 `cubism-adapter-unavailable`，不能把 compatibility path 宣称为 Cubism SDK。

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
- `.nkp` 可以保存 `runtimeAdapter.id/version`、source refs、import settings、parameters、motions、expressions、physics 和 tracking mappings；不得保存 Cubism SDK native handles、Webview URL、engine session id、stream id 或 cache-only path 作为 durable identity。
- Live 舞台通过 `.nkm profile: live` 引用 `.nkp` actor；Live 驱动参数可以进入 `.nkm` routing，但角色参数定义和默认映射归 `.nkp`。
- Live2D/Cubism SDK 类型不得穿透到 `engine-types`、`neko-client` 或领域项目格式；需要接入时通过 adapter id/version、source refs 和可复建 import settings 表达。
- Sketch/Image 输出可以作为角色源图或参考图，但 `.nks` 不直接成为 Puppet runtime 状态。
- 多视图角色设定卡、转面、表情、服装、道具和动作参考首先是 Image/Sketch 生成或编辑的实际文件；当前 Provider 支持单张多视图时可以一次生成，但必须检查视图覆盖、全身裁切、跨视图身份、比例、服装/配色/道具一致性以及禁用文字。
- 生成角色卡不会自动创建第二份角色状态。用户需要将其作为正式参考、跨镜头 revision 依赖或跨项目复用时，由 Entity/Asset/Character owner 审批并登记；Agent 只消费稳定引用和适用 revision。
- `character-visual-reference` 仅是聚焦 Skill 候选。是否成为 builtin 由真实 Agent activation、质量、相邻负例和上下文成本 evaluation 决定；底层执行继续复用 Image capability，不增加角色卡 Workflow runtime。
- 角色身份、外观/服装/配色/道具不变量和正式参考角色是模型无关领域事实；某个 Provider/model/version/profile 能否生成或遵守多视图、identity、costume 或 prop reference 属于 Image capability。模型变化不得改写角色事实，只能触发当前执行策略重新选择和结果复查。

## 基础模式与专业模式

Puppet/Live2D 编辑器按“让角色快速动起来”和“完整 rig/参数/动画精修”区分模式。两种模式共享 `.nkp` 参数、motion、expression、physics 和 tracking 映射真值。

| 模式     | 定位                       | 能力边界                                                                                                                     |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | 导入、预览、表演和快速导出 | 模型导入、快速预览、表情/动作模板、口型建议、姿态建议、tracking/lip-sync 基础设置、一键导出或录制                            |
| 专业模式 | Rig、参数、驱动和动画编辑  | 节点树、参数滑杆、Control Driver、Animation clips、关键帧、驱动曲线、motion/expression/physics 参数精修、tracking 映射和诊断 |

右侧 Dock 的当前实现按 Live2D/Puppet Inspector 裁剪：基础模式显示 Runtime Status 和核心脸部/常用参数；专业模式在此基础上开放完整 Parameter Panel、native blend shapes、Node Tree、Control Driver 和 Animation 面板。AI 生成的表情、动作或映射建议必须落到 `.nkp` 的可审计参数、motion、expression 或 tracking 映射中。

## Engine 边界

- `runtime-puppet` 表示 `.nkp` Live2D/native Puppet character runtime，不表示 generic 2D Scene runtime。
- `neko-puppet-native`、`live2d-moc3-compat` 和 optional `live2d-cubism` 通过 adapter descriptor 暴露能力、状态和 diagnostics。
- MOC3/Live2D 兼容能力可作为 `runtime-puppet` 内部模块或 feature-gated adapter，但不能污染 native puppet core 或 public DTO。
- `engine-puppet-renderer` 消费 runtime snapshot/delta 或 deformed mesh 输入，避免渲染器长期锁住 live world。
