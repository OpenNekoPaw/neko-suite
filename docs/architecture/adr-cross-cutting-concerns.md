# ADR: 统一横切关注点基础设施

> 日期：2026-02-28
> 状态：已实施（Phase 1-5 全部完成）

## 决策

将日志、国际化、主题、错误处理四个横切关注点的统一基础设施放入 `@neko/shared`（neko-types），而非 `neko-tools`。

## 背景

| 关注点 | 之前状况 |
|--------|---------|
| 日志 | 815 处 `console.*` 散落 171 文件，仅 neko-engine 有 OutputChannel |
| i18n | Webview 层 3 套不兼容实现 |
| 主题 | 4 个 tailwind.config.js 重复 40+ 色彩映射 |
| 错误 | Extension 层直接拼字符串 showErrorMessage |

## 理由

1. **neko-tools 是终端消费者**——它是"媒体差异对比"扩展，非共享基础设施包
2. **@neko/shared 已有运行时代码先例**——errors/、utils/、config/、core/ 都含运行时代码
3. **依赖方向正确**——@neko/shared 被 11 个包代码依赖，是最底层基础设施
4. **子路径隔离机制成熟**——`./vscode/extension` 子路径已用于隔离 VSCode API

## 三层分层

```
Layer 0 - Core        import from '@neko/shared'               零依赖
Layer 1 - VSCode      import from '@neko/shared/vscode/extension'  依赖 vscode API
Layer 2 - Webview     import from '@neko/shared/i18n/webview'      依赖 DOM
```

## 新增模块

| 模块 | Layer 0 接口 | Layer 0 默认实现 | Layer 1 VSCode 实现 |
|------|-------------|-----------------|-------------------|
| Logger | `ILogger`, `ILogTransport` | `ConsoleLogger` | `OutputChannelTransport`, `createVSCodeLogger()` |
| i18n | `II18nService` | `I18nService` | `getVSCodeLocale()`, `injectLocaleAttribute()` |
| Theme | `ThemeKind` | `vscodeCSSTokens`, `nekoTailwindPreset` | — |
| Error | `IErrorHandler` | `toBaseError()`, `getDefaultDisplayOptions()` | `VSCodeErrorHandler` |

## 实施计划

- [x] Phase 1: 基础设施搭建（纯新增，无破坏性变更）
- [x] Phase 2: 各 webview tailwind.config.js 改用共享 preset
- [x] Phase 3: 逐包迁移 console.log → logger（~400 处，8 个包）
- [x] Phase 4: 统一 i18n 实现（Model B 透明命名空间扁平模式）
- [x] Phase 5: 推广 ErrorBoundary + VSCodeErrorHandler

## 构建注意

- `detectWebviewLocale()` 依赖 DOM，不能从主入口导出，需通过 `@neko/shared/i18n/webview` 子路径导入
- `Map` 迭代使用 `forEach` 而非 `for...of`，避免 `--downlevelIteration` 要求

## Phase 5 实施记录

已在 5 个 webview 包中推广 `ErrorBoundary` 组件：

| 包 | 路径 | 说明 |
|----|------|------|
| neko-story | `packages/webview/src/components/ErrorBoundary.tsx` | 轻量版，使用 `console.error` |
| neko-canvas | `packages/webview/src/components/ErrorBoundary.tsx` | 使用 `@neko/shared` ConsoleLogger |
| neko-agent | `packages/webview/src/components/ErrorBoundary.tsx` | 使用 `@neko/shared` ConsoleLogger |
| neko-preview | `packages/webview/src/components/ErrorBoundary.tsx` | 使用 `@neko/shared` ConsoleLogger |
| neko-cut | `packages/webview/src/components/ErrorBoundary/ErrorBoundary.tsx` | 增强版，支持自定义 fallback + HOC |

所有组件均已适配 TypeScript strict 模式（`override` 修饰符、`ILogger` 接口签名）。

## Phase 4 实施记录

统一 3 个 webview 包的 i18n 实现到 `@neko/shared` 的 `I18nService`，采用 **Model B 透明命名空间扁平模式**。

### 方案要点

- **翻译格式**：扁平 `MessageBundle`（`Record<string, string>`），key 保留完整 dot-path
- **文件组织**：按顶层前缀拆分为独立命名空间文件（`common.ts`、`settings.ts` 等）
- **运行时**：`I18nService.findInBundles()` 遍历所有命名空间，对组件完全透明
- **React 绑定**：共享 `I18nProvider` + `useTranslation()` 位于 `@neko/shared/i18n/react`
- **组件零改动**：`t('dotted.key')` 调用方式不变，`import` 路径不变

### 新增共享模块

| 模块 | 路径 | 说明 |
|------|------|------|
| React Provider | `@neko/shared/i18n/react` | I18nProvider、useI18n、useTranslation |
| Webview 检测 | `@neko/shared/i18n/webview` | detectWebviewLocale()（Layer 2，依赖 DOM） |

### 各包迁移

| 包 | 命名空间数 | 翻译键数 | 入口文件 |
|----|-----------|---------|---------|
| neko-canvas | 1（canvas） | ~50 | CanvasApp |
| neko-agent | ~26 | ~1100 | main.tsx |
| neko-cut | ~27 | ~1465 | main.tsx、propertyPanel.tsx、assetLibrary.tsx |

### 修复的问题

- neko-canvas Extension 的 `<html lang="en">` 硬编码 → 改用 `injectLocaleAttribute()`
- neko-canvas 位置参数 `{0}` → 命名参数 `{count}`、`{level}`、`{x}`、`{y}`
