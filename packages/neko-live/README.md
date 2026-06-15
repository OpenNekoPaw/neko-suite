# Neko Live

> 虚拟制片与实时互动入口：管理 live session、角色表示、设备输入接入、预览和录制编排。

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview 双子包
- 依赖：`@neko/shared`
- 激活依赖：neko-engine、neko-tools

## Quick Reference

- **职责**：实时会话、角色表示、设备/追踪输入接入、预览面板和录制编排。
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **关键服务**：`LiveSessionService`、`LiveRepresentationService`、`RecordingService`、`LivePanelProvider`

## Architecture

```text
Extension Host
  ├── LiveSessionService          # live session 生命周期与状态
  ├── LiveRepresentationService   # avatar / puppet / model 表示选择
  ├── RecordingService            # 录制请求编排
  └── LivePanelProvider           # Webview 面板和消息桥
        │ postMessage
        ▼
Webview
  ├── session controls
  ├── representation controls
  ├── preview surface
  └── recording controls
```

## Runtime Boundaries

- Webview 只负责实时控制界面、预览显示和用户交互。
- Extension Host 负责 VS Code API、资源授权、会话状态、录制命令和跨扩展协作。
- 设备输入、tracking、scene composition、streaming 和 export 应尽量走 engine/client 契约，避免在 live 包内重复实现媒体权威。
- 持久项目状态只能保存可移植引用，不保存 Webview URI、blob URL、stream token 或本机绝对路径作为事实来源。

## Active Focus

| Area | Direction |
|------|-----------|
| Session model | Keep live session state explicit, serializable, and recoverable across Webview reloads |
| Representation | Align avatar, model, puppet, and generated character assets through shared entity/asset references |
| Device input | Route camera, audio, MIDI, OSC/VMC, and tracking data through host-authorized boundaries |
| Preview and recording | Reuse engine preview/export paths instead of building independent media pipelines in Webview |
| Agent integration | Expose live capabilities through stable provider contracts, not direct Webview coupling |

## Validation

Use package-scoped checks when touching live code:

```bash
pnpm --filter @neko-live/extension build
pnpm --filter @neko-live/webview build
pnpm --filter @neko-live/extension test
pnpm --filter @neko-live/webview test
```
