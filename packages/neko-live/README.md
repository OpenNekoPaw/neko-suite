# Neko Live

> 虚拟制片：摄像头驱动 3D 虚拟形象、动作捕捉与 AR 直播（规划中，Phase 5）

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview（规划中，尚未实现）
- 规范：[CLAUDE.md](../../CLAUDE.md)
- 前置依赖：neko-audio（Phase 4，实时音频采集与处理）

## Quick Reference

- **职责**：实时面部/动作追踪 → 驱动 3D 虚拟形象 → AR 直播/录制
- **入口**：`src/extension.ts`（单包结构，Webview 尚未创建）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-engine、neko-tools
- **状态**：🚧 规划中（5%，仅扩展骨架）

## Architecture

```
摄像头输入
  │
  ▼
Webview（规划中，React + Zustand）
  ├── MediaPipe     → 面部表情 + 上半身动作追踪（浏览器本地推理）
  │
  └── VMC 帧数据   ← postMessage（来自 Extension Host）
        │
        ▼
3D 虚拟形象驱动
  ├── 渲染策略 A：Three.js / WebGL（复用 neko-model 已有 @pixiv/three-vrm）
  └── 渲染策略 B：neko-engine wgpu 流（复用 PBR/后处理/粒子管线）
        │
        ▼
输出
  ├── 实时预览（Webview Canvas）
  ├── 录制输出（复用 neko-engine ExportService）
  └── AR 推流（待调研：OBS / 虚拟摄像头）
```

### VMC 协议（关键架构约束）

> ⚠️ VSCode Webview 沙箱禁止直接访问 UDP Socket。

VMC 数据必须经由 Extension Host 中转：

```
外部动捕软件（VSeeFace / VMagicMirror）
  │  UDP OSC  port:39539
  ▼
Extension Host（Node.js dgram）
  │  postMessage
  ▼
Webview React → 骨骼/BlendShape 更新
```

Extension Host 需实现 `VmcReceiver`（`dgram.createSocket('udp4')`），解析 OSC 消息后通过 `panel.webview.postMessage` 推送给 Webview。

### 追踪模式

| 模式 | 数据来源 | 延迟目标 |
|------|----------|----------|
| `mediapipe` | 本地摄像头，浏览器 ML 推理 | ~33ms（30fps） |
| `vmc` | 外部动捕设备，Extension Host UDP 中转 | ~16ms（60fps） |
| `hybrid` | mediapipe 面部 + VMC 全身 | ~16ms |

### 渲染策略：混合（已确定）

Two.js 和 wgpu **不互斥**，分别服务不同场景：

| 场景 | 渲染路径 | 延迟 | 原因 |
|------|----------|------|------|
| 面部追踪实时预览 | Three.js + @pixiv/three-vrm（Webview 直接 WebGL） | <1ms | 追踪帧率 30fps，需要最低预览延迟；@pixiv/three-vrm 已在 neko-model 集成 |
| 录制 / AR 推流输出 | neko-engine wgpu pipeline → H.264 | ~8-11ms | 复用 PBR/IBL/后处理/粒子；ExportService FIFO 队列已有 |

> 实测 H.264 编码延迟 ~8-11ms（macOS Metal + IOSurface 零拷贝），总追踪→渲染延迟约 20-40ms，满足直播体感要求。

**Rust 侧已有骨骼基础设施**（runtime-scene）：
- `Skeleton { joint_entities }` ECS 组件 + glTF 两遍解析
- `MorphWeights { weights: Vec<f32> }` BlendShape 控制
- Transform SLERP/LERP 动画系统

Three.js 层负责实时预览，wgpu 层负责高质量输出，无需在 Phase 5.1 做取舍。

## 基础设施就绪情况

| 能力 | 状态 | 提供方 |
|------|------|--------|
| 60fps PuppetDelta WebSocket | ✅ 已有 | runtime-puppet（neko-sketch S.2） |
| 3D PBR 渲染管线 | ✅ 已有 | runtime-scene（Phase 3） |
| VRM 加载 + 骨骼/BlendShape | ✅ 已有 | neko-model（@pixiv/three-vrm） |
| 录制队列（ExportService） | ✅ 已有 | neko-engine（neko-cut 已用） |
| Extension Host UDP 接收 | ❌ 待实现 | Node.js dgram |
| MediaPipe 集成 | ❌ 待实现 | Webview（~20MB 模型） |
| 实时音频采集 | ❌ 待 Phase 4 | neko-audio |
| 虚拟摄像头推流 | ❌ 待调研（非跨平台：macOS ReplayKit / Win DirectShow / Linux v4l2loopback） | OS 级驱动 |

## 开发计划（参考）

> 前提：neko-audio（Phase 4）完成后再开工。

```
Phase 5.1 — 核心追踪（P0）
  ├── Webview 脚手架（React + Zustand，参考 neko-sketch 结构）
  ├── Extension Host VmcReceiver（Node.js dgram + OSC 解析）
  ├── MediaPipe 集成（Face Landmarks + Pose）
  └── Three.js + @pixiv/three-vrm 虚拟形象预览

Phase 5.2 — 录制与输出（P1）
  ├── 追踪标定系统
  ├── 录制管道（复用 ExportService）
  └── 音视频同步（依赖 neko-audio）

Phase 5.3 — 高级功能（P2）
  ├── 渲染策略评估（A vs B）
  ├── OBS / 虚拟摄像头推流
  └── 与 neko-sketch 2D puppet 联动
```

## 技术栈

- **追踪**：MediaPipe（Web），VMC 协议（OSC over UDP）
- **渲染**：@pixiv/three-vrm + Three.js（策略 A）
- **构建**：esbuild（单包）→ 后续拆分 webview 子包
- **通信**：postMessage IPC（Webview ↔ Extension Host）
