# i18n/

> 国际化模块，提供多语言支持

## Quick Reference

| 文件 | 说明 |
|------|------|
| `index.ts` | 模块导出和语言注册 |
| `I18nContext.tsx` | React Context Provider |
| `locales/en.ts` | 英文语言包 |
| `locales/zh-CN.ts` | 简体中文语言包 |

## 使用方式

```typescript
import { useI18n } from '@/i18n';

function MyComponent() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div>
      <p>{t('common.send')}</p>
      <button onClick={() => setLocale('zh-CN')}>切换中文</button>
    </div>
  );
}
```

## 语言包结构

```typescript
// locales/en.ts
export default {
  common: {
    send: 'Send',
    cancel: 'Cancel',
    save: 'Save',
  },
  chat: {
    placeholder: 'Type a message...',
    thinking: 'Thinking...',
  },
  settings: {
    providers: 'Providers',
    models: 'Models',
  },
};
```

## 添加新语言

1. 在 `locales/` 创建新语言文件（如 `ja.ts`）
2. 复制 `en.ts` 结构并翻译
3. 在 `index.ts` 中注册

```typescript
import ja from './locales/ja';
export const locales = { en, 'zh-CN': zhCN, ja };
```

## 语言检测

默认使用 VSCode 语言设置，回退到浏览器语言：

```typescript
const defaultLocale = vscodeLocale || navigator.language || 'en';
```
