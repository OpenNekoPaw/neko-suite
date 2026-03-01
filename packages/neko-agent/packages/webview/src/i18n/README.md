# i18n/

> 国际化模块，使用 `@neko/shared` 的 `I18nService` 统一框架

## Quick Reference

| 文件 | 说明 |
|------|------|
| `index.ts` | 创建 I18nService 实例，注册所有命名空间 bundles，导出 `t()` / `setLocale()` |
| `I18nContext.tsx` | Re-export `@neko/shared/i18n/react` 的 Provider + hooks |
| `locales/en/` | 英文翻译（按命名空间拆分为独立文件） |
| `locales/zh-cn/` | 简体中文翻译（按命名空间拆分为独立文件） |

## 架构

采用 **Model B 透明命名空间扁平模式**：
- 翻译格式：`MessageBundle`（`Record<string, string>`），key 保留完整 dot-path
- 文件组织：按顶层前缀拆分（`common.ts`、`settings.ts` 等）
- 运行时：`I18nService.findInBundles()` 遍历所有命名空间，对组件透明
- 详见 [ADR](../../../../../docs/architecture/adr-cross-cutting-concerns.md)

## 使用方式

```typescript
// 组件中使用（最常见）
import { useTranslation } from '@/i18n/I18nContext';

function MyComponent() {
  const { t, locale } = useTranslation();
  return <button>{t('common.cancel')}</button>;
}

// 非 React 上下文中使用
import { t } from '@/i18n';
const label = t('common.save');
```

## 添加新翻译

1. 在 `locales/en/<namespace>.ts` 和 `locales/zh-cn/<namespace>.ts` 中添加 key
2. 如果是新的命名空间，创建文件并在 `locales/en/index.ts` 和 `locales/zh-cn/index.ts` 中注册
