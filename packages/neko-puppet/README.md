# Neko Puppet

> Inochi2D 骨骼动画编辑器：参数驱动 + bevy_animation 回放 + 60fps WebSocket 实时流

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host（CustomEditorProvider .nkp/.inp）+ Webview（React 18）+ neko-engine（native-puppet sidecar）
- 规范：[CLAUDE.md](../../CLAUDE.md)
- 2D 绘画：独立子插件 [neko-sketch](../neko-sketch/)

## Quick Reference

- **职责**：Inochi2D 立绘预览、参数滑块驱动、骨骼动画回放、WebSocket 实时流（供 neko-live）
- **入口**：`packages/extension/src/extension.ts`
- **依赖**：`@neko/shared`、`@neko/neko-client`（通过 EngineClient 访问 native-puppet）
- **激活依赖**：`neko-engine`（extensionDependency，native-puppet sidecar）
- **文件格式**：`.nkp`（JSON 项目）、`.inp`（Inochi2D 二进制）

## Architecture

```
Webview（React 18）
  ├── 参数面板（ParameterPanel — 滑块驱动 puppet 参数）
  ├── 动画面板（AnimationPanel — clip 列表 + 播放控制）
  ├── 节点树（PuppetNodeTree — 骨骼层级可视化）
  └── Inochi2D 控制器
        ├── 参数驱动（POST /v1/puppets/param）
        ├── bevy_animation 回放（POST /v1/puppets/anim/play）
        └── WebSocket 实时流（WS /v1/puppets/stream，供 neko-live）
              │ EngineClient HTTP + WebSocket
              ▼
Extension Host（Node.js）
  └── PuppetEditorProvider（CustomEditorProvider .nkp/.inp）
        └── EngineClient → neko-engine native-puppet
              ├── 变形计算（bevy_ecs + inox2d）
              └── 动画曲线（bevy_animation ParameterCurve）
```

## Communication Protocol

```
Extension → Webview:
  loadPuppet       { data: string }          # Base64-encoded .inp binary
  enginePort       { port: number }          # neko-engine HTTP port
  loadState        { parameters: Record }    # Saved parameter overrides
  noPuppetSource                             # .nkp has no puppet.src linked
  puppetImported   { name: string }          # .inp file was linked
  setLocale        { locale: string }        # Runtime locale switch

Webview → Extension:
  ready                                      # Webview loaded
  requestEnginePort                          # Request engine port discovery
  state:save       { parameters: Record }    # Debounced parameter persistence
  puppet:import                              # Request .inp file dialog
```

## Engine HTTP/WS Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/puppets/load` | Load .inp binary → PuppetSnapshot |
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
| native-puppet in neko-engine | Symmetric to native-scene; no WASM (size/threading limits); full bevy_ecs + bevy_animation |
| bevy_animation over inox2d anim | inox2d animation not yet implemented upstream; bevy_animation ParameterCurve bridges the gap |
| inox2d over Spine/Live2D | BSD 2-Clause license; Spine Runtimes License rejected (ADR-2D-004); Live2D rejected (ADR-2D-001) |
| WS /v1/puppets/stream | Real-time face-tracking (neko-live) requires <2ms latency; HTTP round-trip not sufficient at 60fps |
| Split from neko-sketch | Independent install granularity; sketch is pure frontend, puppet needs engine + @neko/neko-client |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Zustand + Tailwind CSS |
| Engine Communication | EngineClient HTTP + WebSocket（@neko/neko-client） |
| Backend | neko-engine native-puppet（bevy_ecs + inox2d + bevy_animation） |
| Extension | VSCode Extension API + TypeScript + esbuild |
