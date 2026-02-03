# Neko Live

> 虚拟制片：摄像头驱动 3D 虚拟形象，支持动捕与 AR 直播

## Context Summary

- **项目**：Neko Creator Suite - VS Code 全能内容创作工作站
- **角色**：虚拟直播，VTuber 动捕
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Live** 是 Neko Creator Suite 的虚拟制片模块，通过摄像头驱动 3D 虚拟形象，支持面部追踪、动作捕捉、AR 直播等功能。让创作者可以轻松进行 VTuber 直播或虚拟角色录制。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **面部追踪** | 实时面部表情捕捉 |
| **动作捕捉** | 上半身动作追踪 |
| **虚拟形象** | 3D 角色驱动 |
| **AR 直播** | 虚拟背景、AR 特效 |
| **录制功能** | 录制虚拟角色视频 |
| **VMC 协议** | 支持外部动捕设备 |

---

## 追踪模式

| 模式 | 说明 |
|------|------|
| `mediapipe` | 使用 MediaPipe 进行本地追踪 |
| `vmc` | 使用 VMC 协议接收外部追踪数据 |
| `hybrid` | 混合模式，本地 + 外部 |

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.live.camera` | `""` | 首选摄像头 |
| `neko.live.vmcPort` | `39539` | VMC 协议端口 |
| `neko.live.trackingMode` | `mediapipe` | 追踪模式 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Live: Start Live Session` | 开始直播会话 |
| `Neko Live: Stop Live Session` | 停止直播会话 |
| `Neko Live: Select Avatar` | 选择虚拟形象 |
| `Neko Live: Calibrate Tracking` | 校准追踪 |
| `Neko Live: Start Recording` | 开始录制 |
| `Neko Live: Start Streaming` | 开始推流 |

---

## 工作流

```
摄像头输入
    │
    ▼
┌─────────────────┐
│   MediaPipe     │
│   面部/动作追踪  │
└─────────────────┘
    │
    ├─→ 面部表情数据
    │
    └─→ 动作骨骼数据
            │
            ▼
    ┌─────────────────┐
    │   3D 虚拟形象    │
    │   (Avatar)      │
    └─────────────────┘
            │
            ├─→ 实时预览
            │
            ├─→ 录制视频
            │
            └─→ 推流直播
```

---

## VMC 协议集成

支持与外部动捕软件（如 VSeeFace、VMagicMirror）通过 VMC 协议通讯：

```
外部动捕软件 ──VMC Protocol──→ Neko Live
                (UDP:39539)
```

---

## 依赖关系

```
neko-live (独立)
    └── @uniedit/shared (类型)
```

---

## 技术栈

- **追踪**：MediaPipe
- **协议**：VMC (Virtual Motion Capture)
- **渲染**：WebGL / Three.js
- **类型**：@uniedit/shared

---

## License

MIT
