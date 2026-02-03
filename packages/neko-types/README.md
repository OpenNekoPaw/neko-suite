# Neko Types (@neko/shared)

> 交互契约：跨包共享的类型定义与通信协议

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：共享类型包，跨包类型定义
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Types** (包名 `@neko/shared`) 是 Neko Suite 的共享类型定义包，提供跨包使用的 TypeScript 类型定义和常量。它是所有其他包的基础依赖，确保类型一致性。

---

## 核心职责

| 职责 | 说明 |
|------|------|
| **消息协议** | Extension ↔ Webview 通信消息类型 |
| **项目结构** | .jvi / .jvc 项目文件数据结构 |
| **时间线类型** | 轨道、元素、关键帧等核心类型 |
| **特效类型** | 特效、转场、动画等功能类型 |

---

## 目录结构

```
src/
├── index.ts            # 入口导出
│
└── types/              # 类型定义
    ├── index.ts        # 类型汇总导出
    │
    ├── project.ts      # 项目结构类型
    ├── element.ts      # 元素类型
    ├── track.ts        # 轨道类型
    │
    ├── message.ts      # 消息协议类型
    ├── config.ts       # 配置类型
    │
    ├── animation.ts    # 动画类型
    ├── keyframe.ts     # 关键帧类型
    ├── easing.ts       # 缓动函数类型
    │
    ├── effects.ts      # 特效类型
    ├── transition.ts   # 转场类型
    ├── mask.ts         # 遮罩类型
    ├── shape.ts        # 形状类型
    │
    ├── audio.ts        # 音频类型
    ├── subtitle.ts     # 字幕类型
    │
    └── aiAction.ts     # AI 动作类型
```

---

## 核心类型

### 项目结构

```typescript
interface VideoProject {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  tracks: TimelineTrack[];
}
```

### 时间线元素

```typescript
interface TimelineElement {
  id: string;
  type: 'video' | 'image' | 'text' | 'audio' | 'shape';
  trackId: string;
  startTime: number;
  duration: number;
}
```

### 消息协议

```typescript
// Extension → Webview
interface ExtensionToWebviewMessage {
  type: 'loadProject' | 'updateElement' | 'aiResponse';
  payload: unknown;
}

// Webview → Extension
interface WebviewToExtensionMessage {
  type: 'saveProject' | 'requestAI' | 'exportVideo';
  payload: unknown;
}
```

---

## 使用方式

```typescript
// 导入全部类型
import type { VideoProject, TimelineElement } from '@neko/shared';

// 导入特定模块类型
import type { TransitionType } from '@neko/shared/types/transition';
```

---

## 依赖关系

```
@neko/shared (被所有包依赖)
    ├── neko-engine
    ├── neko-story
    ├── neko-cut
    ├── neko-canvas
    ├── neko-sketch
    ├── neko-audio
    ├── neko-agent
    ├── neko-live
    ├── neko-assets
    └── neko-tools
```

---

## 设计原则

| 原则 | 说明 |
|------|------|
| **纯类型** | 不包含运行时代码，只有 TypeScript 类型定义 |
| **单一来源** | 所有共享类型集中在此包定义 |
| **版本同步** | 类型变更需同步更新所有依赖包 |
| **文档化** | 每个类型都应有 JSDoc 注释 |

---

## 注意事项

1. **修改影响大**：类型变更会影响所有依赖包
2. **向后兼容**：尽量保持向后兼容，使用可选属性
3. **类型测试**：重要类型变更需验证编译正确性

---

## License

MIT
