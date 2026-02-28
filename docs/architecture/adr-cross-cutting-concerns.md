# ADR: 统一横切关注点基础设施

> 日期：2026-02-28
> 状态：已实施（Phase 1）

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
- [ ] Phase 2: 各 webview tailwind.config.js 改用共享 preset
- [ ] Phase 3: 逐包迁移 console.log → logger
- [ ] Phase 4: 统一 i18n 实现
- [ ] Phase 5: 推广 ErrorBoundary + VSCodeErrorHandler

## 构建注意

- `detectWebviewLocale()` 依赖 DOM，不能从主入口导出，需通过 `@neko/shared/i18n/webview` 子路径导入
- `Map` 迭代使用 `forEach` 而非 `for...of`，避免 `--downlevelIteration` 要求
