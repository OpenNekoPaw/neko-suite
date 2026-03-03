# ADR: 统一横切关注点基础设施

> 日期：2026-02-28
> 状态：✅ 已完成（Phase 1-5 全部完成）

## 决策

将日志、国际化、主题、错误处理四个横切关注点的统一基础设施放入 `@neko/shared`（neko-types），而非 `neko-tools`。

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

## 模块清单

| 模块 | Layer 0 接口 | Layer 0 默认实现 | Layer 1 VSCode 实现 |
|------|-------------|-----------------|-------------------|
| Logger | `ILogger`, `ILogTransport` | `ConsoleLogger` | `OutputChannelTransport`, `createVSCodeLogger()` |
| i18n | `II18nService` | `I18nService` | `getVSCodeLocale()`, `injectLocaleAttribute()` |
| Theme | `ThemeKind` | `vscodeCSSTokens`, `nekoTailwindPreset` | — |
| Error | `IErrorHandler` | `toBaseError()`, `getDefaultDisplayOptions()` | `VSCodeErrorHandler` |

## 构建注意

- `detectWebviewLocale()` 依赖 DOM，不能从主入口导出，需通过 `@neko/shared/i18n/webview` 子路径导入
- `Map` 迭代使用 `forEach` 而非 `for...of`，避免 `--downlevelIteration` 要求

## i18n 方案要点（Model B 透明命名空间扁平模式）

- **翻译格式**：扁平 `MessageBundle`（`Record<string, string>`），key 保留完整 dot-path
- **文件组织**：按顶层前缀拆分为独立命名空间文件（`common.ts`、`settings.ts` 等）
- **运行时**：`I18nService.findInBundles()` 遍历所有命名空间，对组件完全透明
- **React 绑定**：共享 `I18nProvider` + `useTranslation()` 位于 `@neko/shared/i18n/react`

## ErrorBoundary 推广记录

已在 5 个 webview 包中推广：neko-story、neko-canvas、neko-agent、neko-preview（轻量版），neko-cut（增强版，支持自定义 fallback + HOC）。

## i18n 迁移记录

| 包 | 命名空间数 | 翻译键数 |
|----|-----------|---------|
| neko-canvas | 1 | ~50 |
| neko-agent | ~26 | ~1100 |
| neko-cut | ~27 | ~1465 |
