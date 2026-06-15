# 互动创作领域架构

更新日期：2026-06-15

互动创作领域关注用户能“运行、探索、操控”的创作体验，而不是单一静态产物。它跨 Canvas、Live、Story、Model、Audio、Preview、Engine 和 Agent。

## 模块职责

| 参与者        | 职责                                                   |
| ------------- | ------------------------------------------------------ |
| `neko-canvas` | 节点、容器、连接、互动叙事结构和预览 route             |
| `neko-live`   | 实时合成、设备输入、OSC/VMC、live 控制面               |
| `neko-story`  | 叙事结构、角色/场景索引、互动脚本来源                  |
| `neko-model`  | 3D Viewport、Scene、XR/3D 互动预览                     |
| `neko-audio`  | 实时音频、设备和音频反馈                               |
| `neko-engine` | Scene/runtime/device/audio/media 权威与 stream/control |
| Agent         | 互动流程生成、状态解释、自动连接、审阅与修复建议       |

## 稳定边界

- Canvas 和 Live 是互动创作的主要 Webview 入口，但运行态权威能力来自 Engine 或领域 contract。
- 设备枚举、连接、事件流和高频媒体/scene/control 数据走 Engine/client，不由 Webview 直接访问宿主设备。
- 互动叙事引用 Story、Assets、Entity/Search 的稳定事实，不复制它们的私有存储。
- Webview 保持交互状态，持久事实通过 project data、ResourceRef、Entity/Search 或领域格式保存。
- Agent 可以生成和审阅互动结构，但通过能力 provider 和 contract 进入领域，不直接耦合 Webview 实现。

## 历史 ADR 归并

- Canvas interactive narrative、preview sessions/routes、node/container、connection projection：归并到本领域。
- Device management、XR authoring/runtime split、viewport semantic control：稳定横切约束可提升到 `docs/architecture/`，具体创作流保留在本领域。
- Canvas role boundary、live/audio/device 评估和实现计划进入 status。
