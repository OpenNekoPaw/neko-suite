# Neko Puppet

> `.nkp` Live2D/native Puppet 角色编辑器：参数驱动 + motion/expression + tracking + 60fps WebSocket 实时流

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host（CustomEditorProvider .nkp/.moc3）+ Webview（React 18）+ neko-engine（PuppetService/runtime-puppet）
- 2D 绘画：独立子插件 [neko-sketch](../neko-sketch/)
- 2D Scene：由 [neko-model](../neko-model/) 的 `.nkm profile: 2d` 负责；Puppet 不保存 tilemap、scene camera、2D light、parallax、particle 或 generic scene graph 真值。

## Quick Reference

- **职责**：`.nkp profile: live2d` 的 Live2D-style MOC3 compatibility 预览、参数滑块驱动、motion/expression/physics/tracking 映射，以及 `.nkp profile: neko-puppet` 的 native Puppet rig/BlendShape/动画编辑
- **入口**：`packages/extension/src/extension.ts`
- **依赖**：`@neko/shared`、`@neko/neko-client`（通过 EngineClient 访问 runtime-puppet）
- **激活依赖**：`neko-engine`（extensionDependency，runtime-puppet sidecar）
- **文件格式**：`.nkp`（Character/Puppet JSON 项目）、`.moc3`（Live2D MOC3 二进制）；generic 2D Scene 使用 `.nkm profile: 2d`
- **Runtime adapter**：`neko-puppet-native`、`live2d-moc3-compat`、optional `live2d-cubism`。当前 MOC3 路径是 clean-room compatibility，不是官方 Cubism SDK；官方 SDK 未启用时必须显示 unavailable diagnostic。
- **布局**：Webview 使用 Creative Workbench Shell：左侧工具栏承接导入、适配视图、洋葱皮开关等常用命令，并通过底部显隐组控制右侧面板；viewport 展示表面保持长显，不再单独渲染横向 viewport 工具条；右侧 NodeTree / Parameters / ControlDrivers / Animation 面板栈使用可持久化 ResizeHandle，默认 280px，宽度约束为 200-400px。当前没有独立被动状态投影，也不在 Webview 重建状态栏或顶栏。

## Architecture

```
Webview（React 18）
  ├── 参数面板（ParameterPanel — 滑块驱动 puppet 参数）
  ├── 动画面板（AnimationPanel — clip 列表 + 播放控制）
  ├── 节点树（PuppetNodeTree — 骨骼层级可视化）
  └── MOC3 控制器
        ├── 参数驱动（POST /v1/puppets/param）
        ├── bevy_animation 回放（POST /v1/puppets/anim/play）
        └── WebSocket 实时流（WS /v1/puppets/stream，供 neko-live）
              │ EngineClient HTTP + WebSocket
              ▼
Extension Host（Node.js）
  └── PuppetEditorProvider（CustomEditorProvider .nkp）
        └── EngineClient → neko-engine runtime-puppet
              ├── PuppetService / adapter descriptor
              ├── 变形计算（bevy_ecs + MOC3 clean-room compatibility parser）
              └── 动画曲线（bevy_animation ParameterCurve）
```

## Communication Protocol

```
Extension → Webview:
  loadPuppet       { data: string }          # Base64-encoded .moc3 binary
  enginePort       { port: number }          # neko-engine HTTP port
  loadState        { parameters: Record }    # Saved parameter overrides
  noPuppetSource                             # .nkp has no puppet.src linked
  puppetImported   { name: string }          # .moc3 file was linked
  setLocale        { locale: string }        # Runtime locale switch

Webview → Extension:
  ready                                      # Webview loaded
  requestEnginePort                          # Request engine port discovery
  state:save       { parameters: Record }    # Debounced parameter persistence
  project:addSource { request }              # Add/link/create .moc3 or Live2D bundle source
```

## Engine HTTP/WS Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/puppets/load` | Load .moc3 binary → PuppetSnapshot |
| POST | `/v1/puppets/param` | Set parameter value |
| POST | `/v1/puppets/tick` | Advance simulation → PuppetDelta |
| GET | `/v1/puppets/meshes` | Get deformed mesh data |
| GET | `/v1/puppets/snapshot` | Full puppet state |
| GET | `/v1/puppets/params` | Parameter info list |
| POST | `/v1/puppets/anim/play` | Play animation clip |
| POST | `/v1/puppets/anim/stop` | Stop animation |
| POST | `/v1/puppets/anim/seek` | Seek to time |
| GET | `/v1/puppets/anim/list` | List animation clips |
| WS | `/v1/puppets/stream` | 60fps PuppetDelta push |

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| runtime-puppet in neko-engine | Symmetric to runtime-scene; no WASM (size/threading limits); full bevy_ecs + bevy_animation |
| bevy_animation for animation | MOC3 clean-room compatibility handles static data; bevy_animation ParameterCurve drives runtime playback |
| MOC3 clean-room compatibility | Zero external dependency; clean-room implementation based on public format understanding. It is labeled `live2d-moc3-compat`, not official Live2D Cubism SDK |
| Optional Cubism adapter | Future official SDK playback must register as `live2d-cubism` and remain feature-gated/SDK-neutral at public boundaries |
| WS /v1/puppets/stream | Real-time face-tracking (neko-live) requires <2ms latency; HTTP round-trip not sufficient at 60fps |
| Split from neko-sketch | Independent install granularity; sketch is pure frontend, puppet needs engine + @neko/neko-client |
| 2D Scene stays in neko-model | `.nkm profile: 2d` owns sprite/tilemap/light/camera/parallax/particle scene truth; `.nkp` owns character parameters, motion, expression, physics, and tracking |

## Domain Boundary

- `.nkp` persists profile, adapter id/version, stable source refs, import settings, parameters, motions, expressions, physics and tracking mappings.
- `.nkp` must not persist Cubism SDK native handles, Webview URLs, Engine session IDs, stream IDs or cache-only paths as durable identity.
- The right inspector is Puppet-specific: runtime/profile status, parameters, BlendShapes, node tree, control drivers, animation and keyframes. It must not present tilemap, scene camera, scene light, parallax, particle, actor staging or generic scene graph creation as Puppet tools.
- `.nkm` Scenes may reference `.nkp` actors by stable refs and drive exposed parameters at runtime, but Puppet truth remains owned by `.nkp`.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Zustand + Tailwind CSS |
| Engine Communication | EngineClient HTTP + WebSocket（@neko/neko-client） |
| Backend | neko-engine runtime-puppet（bevy_ecs + MOC3 clean-room compatibility + bevy_animation） |
| Extension | VSCode Extension API + TypeScript + esbuild |
