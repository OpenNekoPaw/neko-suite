# Neko Live

> 虚拟制片：摄像头驱动 3D 虚拟形象、动作捕捉与 AR 直播（规划中）

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview（规划中，尚未实现）
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：实时面部/动作追踪 → 驱动 3D 虚拟形象 → AR 直播/录制
- **入口**：`src/extension.ts`（单包结构）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-engine、neko-tools
- **状态**：🚧 规划中

## Architecture

```
摄像头输入
  │
  ▼
Webview (规划中)
  ├── MediaPipe   → 面部表情 + 上半身动作追踪
  │
  └── VMC 协议   → 接收外部动捕设备数据（UDP:39539）
        │
        ▼
3D 虚拟形象驱动（Three.js / WebGL）
  ├── 实时预览
  ├── 录制输出
  └── AR 推流
```

### 追踪模式

| 模式 | 说明 |
|------|------|
| `mediapipe` | 本地摄像头追踪（MediaPipe） |
| `vmc` | 外部动捕设备（VMC 协议） |
| `hybrid` | 本地 + 外部混合 |

### VMC 协议

支持与 VSeeFace、VMagicMirror 等外部软件通过 VMC 协议（UDP）通信。

### 技术栈

MediaPipe、VMC（Virtual Motion Capture）、Three.js / WebGL
