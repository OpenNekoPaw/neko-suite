# i18n/

国际化模块，提供多语言支持。

## 职责

管理 UI 文本的多语言翻译。

## 结构

```
i18n/
├── index.ts              # i18n 初始化
└── locales/              # 语言包
    ├── en.json           # 英文
    └── zh-CN.json        # 简体中文
```

## 依赖

```
→ 无外部依赖
← components/     # UI 文本
← App.tsx         # 初始化
```

## 使用示例

```typescript
import { useTranslation } from './i18n';

function MyComponent() {
  const { t } = useTranslation();
  return <button>{t('export.button')}</button>;
}
```
