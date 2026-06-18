# 场景创作领域架构

更新日期：2026-06-17

场景创作领域以 `.nkm` 为 2D/3D 场景和 Live 舞台真值。`.nkm` 使用 `profile` 区分 `2d`、`3d` 和 `live`，但共享 scene graph、asset refs、camera、timeline、viewport 和 routing 等核心抽象。

`neko-model` 是 `.nkm profile: 2d` 和 `.nkm profile: 3d` 的创作入口所有者；2D Scene 不通过 `neko-puppet` 创建或维护。`neko-live` 可以运行和编排 Live profile，但 Live profile 的 durable scene/stage 真值仍属于 `.nkm`。

Runtime 上，`.nkm profile: 2d | 3d | live` 通过 `SceneService` 和 Scene profile descriptors 进入 `runtime-scene`。`.nkm profile: 2d` 即使首批 2D 面板尚未完整实现，也必须显示明确 degraded/unavailable diagnostics，不能回退成 `.nkp` 或 `neko-puppet` workflow。

## 模块职责

| 参与者        | 职责                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| Webview       | `neko-model` Scene 编辑 UI、Viewport overlay、面板输入、授权 stream/control 消费 |
| Extension     | Custom editor、StatusBar、资源授权、Engine 端口和 command bridge          |
| Engine client | Scene command、stream descriptor、scene control socket、model preprocess  |
| Engine        | `runtime-scene`、Viewport renderer、GPU render、H.264 stream、diagnostics |
| Agent         | 场景理解、编辑建议、LookDev、Live 舞台编排和验证                          |

## `.nkm` profile

```text
.nkm
├─ profile: 2d
│  ├─ sprite / tilemap / 2D light / parallax
│  └─ 2D camera and scene preview owned by neko-model
├─ profile: 3d
│  ├─ mesh / material / skeleton / PBR light
│  └─ 3D viewport and LookDev
└─ profile: live
   ├─ actors: .nkp / .nkm / .nks / external asset refs
   ├─ camera / scene switching
   ├─ audio / tracking / agent routing
   └─ compositor and output settings
```

## Route A 边界

- Webview 直接消费授权后的 Engine canvas/stream/control。
- Extension Host 不代理视频帧、PCM 包或高频 scene delta。
- Authoring panels 生成 Engine commands，不直接改 Webview 私有 scene truth。
- `VideoViewport` 等主路径不挂载重复的 R3F model runtime。
- 低延迟交互 Scene stream 优先短 GOP，必要时 GOP=1；非交互导出或其他流不继承这个全局假设。

## 基础模式与专业模式

Scene 编辑器按“快速搭建可预览场景”和“完整 Scene/LookDev authoring”区分模式。两种模式共享 `.nkm` scene graph、asset refs、camera、light、timeline 和 Engine scene runtime。

| 模式     | 定位                            | 能力边界                                                                                                                                                     |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 基础模式 | AI 辅助场景搭建和快速预览       | 场景模板、素材摆放、基础 camera/light/environment、AI LookDev 建议、构图/镜头建议、角色或道具快速摆放、快速预览                                              |
| 专业模式 | Scene graph、LookDev 和建模精修 | Outliner、Transform、Light、Environment、Material、动画时间线、viewport quality、selection workflow、Sculpt、CSG、Text、Shape、角色控制、诊断和 Route A 状态 |

右侧 Dock 的当前实现按同一 Inspector 路由裁剪：基础模式显示 Scene2D profile 摘要、Expression Presets 或 Transform；专业模式在此基础上开放 Outliner、Latency Tester、Face/Bone expression、Shape、Text、CSG、Sculpt、Light、Environment 和 Selection Target 检查器。基础模式操作必须编译为 Engine scene commands 或 `.nkm` 可恢复字段，不能只保存在 Webview 私有状态。

## 稳定边界

- `.nkm` 可以引用 `.nks` 图像素材和 `.nkp` 角色，但不复制它们的编辑真值。
- `.nkm` 放置 Puppet actor 时只保存 stable `.nkp` project/asset/resource refs，以及 Scene-owned placement、routing、timeline 或 stage control；不得复制 `.nkp` parameters、motions、expressions、physics 或 tracking mapping truth。
- `.nkm profile: 2d` 是 generic 2D Scene 的唯一 durable authoring profile；tilemap、scene camera、2D light、parallax、particle 和 scene graph 不保存到 `.nkp`。
- Live 是 `.nkm profile: live`，不是独立 `.nklive` 格式。
- Live profile 保存舞台、actor、routing、camera、合成和 session 可复建配置；角色参数和动作真值仍归 `.nkp`。
- Engine 侧当前通过 Scene profile descriptors 暴露 `2d`、`3d` 和 `live`；未来即使抽出 `runtime-stage`，领域格式仍保持 `.nkm` Scene/Stage truth，不随内部 runtime 拆分而变化。

## 验证

```bash
pnpm check:3d-route-a-boundaries
pnpm --filter @neko-model/webview test
```
