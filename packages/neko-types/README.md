# Neko Types (@neko/shared)

> 共享基础设施：类型定义、通信协议、横切关注点

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：共享基础设施包，被所有 11 个包依赖
- **内容**：类型定义 + 运行时工具（logger / i18n / theme / errors）
- **规范**：[CLAUDE.md](../../CLAUDE.md)

---

## 概述

**Neko Types** (包名 `@neko/shared`) 是 Neko Suite 的共享基础设施包。除了跨包类型定义和通信协议，还提供统一的日志、国际化、主题和错误处理基础设施。

---

## 核心职责

| 职责 | 说明 |
|------|------|
| **类型定义** | 消息协议、项目结构、时间线、特效等核心类型 |
| **错误处理** | BaseError 体系 + IErrorHandler 统一错误展示策略 |
| **日志系统** | ILogger 接口 + ConsoleLogger / OutputChannelTransport |
| **国际化** | II18nService 接口 + I18nService 统一翻译框架 |
| **主题系统** | VSCode CSS Token 映射 + Tailwind 共享 Preset |
| **工具函数** | 动画计算、媒体类型检测、配置读取 |
| **VSCode API** | 隔离的 Extension Host 基础类（通过子路径导入） |

---

## 三层架构

```
Layer 0 - Core        → import from '@neko/shared'
                        零依赖，所有环境可用（Node.js / Browser）

Layer 1 - VSCode      → import from '@neko/shared/vscode/extension'
                        依赖 vscode API，仅 Extension Host

Layer 2 - Webview     → import from '@neko/shared/i18n/webview'
                        依赖 DOM，仅 Webview（Browser）

Layer 2 - React       → import from '@neko/shared/i18n/react'
                        依赖 React，I18nProvider + useTranslation
```

---

## 目录结构

```
src/
├── index.ts                # 主入口（导出 Layer 0）
├── types/                  # 纯类型定义
│   ├── project.ts          # 项目结构
│   ├── element.ts          # 元素
│   ├── track.ts            # 轨道
│   ├── message.ts          # 消息协议
│   ├── animation.ts        # 动画
│   ├── keyframe.ts         # 关键帧
│   ├── effects.ts          # 特效
│   └── ...
├── errors/                 # 错误处理
│   ├── base-error.ts       # BaseError + RetryPolicy + BackoffStrategy
│   ├── error-handler.ts    # IErrorHandler + ErrorDisplayOptions
│   └── index.ts
├── logger/                 # 日志系统
│   ├── types.ts            # ILogger, ILogTransport, LogLevel
│   ├── console-logger.ts   # ConsoleLogger + ConsoleTransport
│   └── index.ts
├── i18n/                   # 国际化
│   ├── types.ts            # II18nService, SupportedLocale, MessageBundle
│   ├── core.ts             # I18nService, interpolate(), normalizeLocale()
│   ├── webview.ts          # detectWebviewLocale()（DOM 依赖，子路径导入）
│   ├── react.tsx           # I18nProvider, useI18n, useTranslation（React 依赖，子路径导入）
│   └── index.ts
├── theme/                  # 主题系统
│   ├── types.ts            # ThemeKind
│   ├── tokens.ts           # vscodeCSSTokens（40+ CSS 变量映射）
│   ├── tailwind-preset.ts  # nekoTailwindPreset（共享 Tailwind 配置）
│   └── index.ts
├── utils/                  # 工具函数
├── config/                 # 配置系统
├── core/                   # 核心工具（ConcurrencyPool）
├── tools/                  # Agent 工具基类
├── operations/             # EditOperation 指令系统
├── generated/              # Protobuf 生成类型
└── vscode/                 # VSCode 专用（Layer 1）
    ├── extension/
    │   ├── baseOutlineProvider.ts
    │   ├── logger.ts           # OutputChannelTransport, createVSCodeLogger()
    │   ├── error-reporter.ts   # VSCodeErrorHandler
    │   └── i18n-bridge.ts      # getVSCodeLocale(), injectLocaleAttribute()
    └── types.ts
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
// Layer 0: 通用类型和工具（所有环境）
import type { VideoProject, TimelineElement } from '@neko/shared';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import { I18nService, normalizeLocale } from '@neko/shared';
import { vscodeCSSTokens } from '@neko/shared';
import { BaseError, toBaseError } from '@neko/shared';

// Layer 1: VSCode Extension Host
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  getVSCodeLocale,
  injectLocaleAttribute,
} from '@neko/shared/vscode/extension';

// Layer 2: Webview（DOM 依赖）
import { detectWebviewLocale } from '@neko/shared/i18n/webview';

// Layer 2: React Provider（React 依赖）
import { I18nProvider, useI18n, useTranslation } from '@neko/shared/i18n/react';

// Tailwind preset（在 tailwind.config.js 中）
import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';
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
| **三层隔离** | Core（零依赖）/ VSCode（vscode API）/ Webview（DOM）分层导出 |
| **单一来源** | 类型、主题 token、i18n 框架集中定义，避免各包重复 |
| **接口优先** | ILogger / II18nService / IErrorHandler 面向抽象编程 |
| **策略模式** | Transport / Bundle / ErrorHandler 可插拔替换 |
| **向后兼容** | 新增模块纯新增导出，不破坏现有 API |

---

## 注意事项

1. **修改影响大**：类型变更会影响所有依赖包
2. **向后兼容**：尽量保持向后兼容，使用可选属性
3. **类型测试**：重要类型变更需验证编译正确性

---

## License

MIT
