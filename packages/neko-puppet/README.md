# Neko Puppet

> Live2D MOC3 骨骼动画编辑器：参数驱动 + bevy_animation 回放 + 60fps WebSocket 实时流

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host（CustomEditorProvider .nkp）+ Webview（React 18）+ neko-engine（runtime-puppet sidecar）
- 规范：[CLAUDE.md](../../CLAUDE.md)
- 2D 绘画：独立子插件 [neko-sketch](../neko-sketch/)

## Quick Reference

- **职责**：Live2D MOC3 立绘预览、参数滑块驱动、骨骼动画回放、WebSocket 实时流（供 neko-live）
- **入口**：`packages/extension/src/extension.ts`
- **依赖**：`@neko/shared`、`@neko/neko-client`（通过 EngineClient 访问 runtime-puppet）
- **激活依赖**：`neko-engine`（extensionDependency，runtime-puppet sidecar）
- **文件格式**：`.nkp`（JSON 项目）、`.moc3`（Live2D MOC3 二进制）
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
              ├── 变形计算（bevy_ecs + MOC3 clean-room parser）
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
  puppet:import                              # Request .moc3 file dialog
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
| bevy_animation for animation | MOC3 clean-room parser handles static data; bevy_animation ParameterCurve drives runtime playback |
| MOC3 clean-room parser | Zero external dependency; clean-room implementation based on OpenL2D spec |
| WS /v1/puppets/stream | Real-time face-tracking (neko-live) requires <2ms latency; HTTP round-trip not sufficient at 60fps |
| Split from neko-sketch | Independent install granularity; sketch is pure frontend, puppet needs engine + @neko/neko-client |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Zustand + Tailwind CSS |
| Engine Communication | EngineClient HTTP + WebSocket（@neko/neko-client） |
| Backend | neko-engine runtime-puppet（bevy_ecs + MOC3 clean-room parser + bevy_animation） |
| Extension | VSCode Extension API + TypeScript + esbuild |
