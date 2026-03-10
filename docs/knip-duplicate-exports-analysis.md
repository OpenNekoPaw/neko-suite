# Knip 重复导出分析

**日期**: 2026-03-10

## 问题概述

Knip 检测到 6 个重复导出问题，即同一模块同时使用了命名导出和默认导出（或多个命名导出指向同一实体）。

## 重复导出详情

### 1. `packages/neko-agent/packages/cli-tui/src/core/config.ts`

**问题**: `saveUserConfig` 和 `saveGlobalConfig` 是同一函数的两个导出名

```typescript
// Line 335
export function saveUserConfig(config: Partial<UnifiedConfig>): void {
  // ...
}

// Line 342
export const saveGlobalConfig = saveUserConfig;  // 别名导出
```

**类型**: 向后兼容别名

**建议**:
- **保留**: 这是有意的向后兼容设计，允许旧代码使用 `saveGlobalConfig`
- **文档化**: 在注释中明确说明 `saveGlobalConfig` 是废弃的别名
- **迁移计划**: 在代码库中搜索使用 `saveGlobalConfig` 的地方，逐步迁移到 `saveUserConfig`

```typescript
// 推荐做法
export function saveUserConfig(config: Partial<UnifiedConfig>): void {
  // ...
}

/**
 * @deprecated Use saveUserConfig instead
 * @alias saveUserConfig
 */
export const saveGlobalConfig = saveUserConfig;
```

---

### 2. `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/UsageIndicator.tsx`

**问题**: 同时有命名导出和默认导出

```typescript
// Line 49
export function UsageIndicator({ ... }) {
  // ...
}

// Line 148
export default UsageIndicator;
```

**类型**: 命名导出 + 默认导出

**建议**: **移除默认导出**，统一使用命名导出

```typescript
// 修改前
import UsageIndicator from './UsageIndicator';  // 默认导入

// 修改后
import { UsageIndicator } from './UsageIndicator';  // 命名导入
```

**理由**:
- 项目规范倾向于命名导出（更明确、更易重构）
- React 组件使用命名导出更符合现代实践

---

### 3. `packages/neko-cut/packages/webview/src/components/ShapeElementContent.tsx`

**问题**: 同时有命名导出和默认导出

```typescript
// Line 70
export const ShapeElementContent = memo(function ShapeElementContent({ ... }) {
  // ...
});

// Line 181
export default ShapeElementContent;
```

**类型**: 命名导出 + 默认导出

**建议**: **移除默认导出**

```typescript
// 只保留命名导出
export const ShapeElementContent = memo(function ShapeElementContent({ ... }) {
  // ...
});
```

---

### 4. `packages/neko-cut/packages/webview/src/services/mediaProxyFactory.ts`

**问题**: `getMediaProxy` 和 `getRemoteMediaProxy` 是同一函数的两个导出名

```typescript
// Line 25
export function getMediaProxy(): IMediaRequestProxy {
  // ...
}

// Line 35
export const getRemoteMediaProxy = getMediaProxy;  // 别名导出
```

**类型**: 向后兼容别名

**建议**:
- **保留**: 这是有意的向后兼容设计
- **文档化**: 添加 `@deprecated` 注释

```typescript
export function getMediaProxy(): IMediaRequestProxy {
  // ...
}

/**
 * @deprecated Use getMediaProxy instead
 * @alias getMediaProxy
 */
export const getRemoteMediaProxy = getMediaProxy;
```

---

### 5. `packages/neko-cut/packages/webview/src/services/PreviewModeController.ts`

**问题**: 同时有命名导出（类）和默认导出

```typescript
// 类定义（假设有命名导出）
export class PreviewModeController {
  // ...
}

// Line 232
export default PreviewModeController;
```

**类型**: 命名导出 + 默认导出

**建议**: **移除默认导出**

```typescript
// 只保留命名导出
export class PreviewModeController {
  // ...
}
```

---

### 6. `packages/neko-types/src/vscode/api.ts`

**问题**: `vscodeApi` 对象同时有命名导出和默认导出

```typescript
// Line 254
export const vscodeApi: IVSCodeApiWrapper = {
  get: getVSCodeAPI,
  isVSCodeContext,
  postMessage,
  getState,
  setState,
  sendRequest,
  cancelRequest,
  getPendingRequestCount,
};

// Line 265
export default vscodeApi;
```

**类型**: 命名导出 + 默认导出

**建议**: **移除默认导出**

```typescript
// 只保留命名导出
export const vscodeApi: IVSCodeApiWrapper = {
  // ...
};

// 同时导出所有单独的函数（已有）
export {
  getVSCodeAPI,
  isVSCodeContext,
  postMessage,
  getState,
  setState,
  sendRequest,
  cancelRequest,
  getPendingRequestCount,
};
```

---

## 修复优先级

### 高优先级（建议立即修复）

**移除默认导出**（3 个文件）:
1. `UsageIndicator.tsx` - React 组件
2. `ShapeElementContent.tsx` - React 组件
3. `PreviewModeController.ts` - 类
4. `vscodeApi` - API 对象

**理由**:
- 统一导出风格，符合项目规范
- 提高代码可维护性和重构安全性
- 现代 TypeScript/React 最佳实践

### 低优先级（可保留）

**向后兼容别名**（2 个文件）:
1. `saveGlobalConfig` → `saveUserConfig`
2. `getRemoteMediaProxy` → `getMediaProxy`

**理由**:
- 有明确的向后兼容目的
- 添加 `@deprecated` 注释即可
- 可以在未来版本中逐步移除

---

## 修复步骤

### 步骤 1: 搜索使用情况

```bash
# 搜索默认导入
rg "import.*from.*UsageIndicator" --type ts
rg "import.*from.*ShapeElementContent" --type ts
rg "import.*from.*PreviewModeController" --type ts
rg "import.*from.*vscode/api" --type ts

# 搜索别名使用
rg "saveGlobalConfig" --type ts
rg "getRemoteMediaProxy" --type ts
```

### 步骤 2: 更新导入语句

```typescript
// 修改前
import UsageIndicator from './UsageIndicator';
import ShapeElementContent from './ShapeElementContent';
import PreviewModeController from './PreviewModeController';
import vscodeApi from '@neko/shared/vscode/api';

// 修改后
import { UsageIndicator } from './UsageIndicator';
import { ShapeElementContent } from './ShapeElementContent';
import { PreviewModeController } from './PreviewModeController';
import { vscodeApi } from '@neko/shared/vscode/api';
```

### 步骤 3: 移除默认导出

```typescript
// 从 4 个文件中删除 `export default ...` 行
```

### 步骤 4: 添加废弃注释

```typescript
// 为 2 个别名添加 @deprecated 注释
/**
 * @deprecated Use saveUserConfig instead
 * @alias saveUserConfig
 */
export const saveGlobalConfig = saveUserConfig;

/**
 * @deprecated Use getMediaProxy instead
 * @alias getMediaProxy
 */
export const getRemoteMediaProxy = getMediaProxy;
```

### 步骤 5: 验证

```bash
# 重新运行 Knip
pnpm knip

# 构建测试
pnpm build
pnpm test
```

---

## 预期结果

修复后，Knip 的 "Duplicate exports" 应该从 **6 个降至 2 个**（保留向后兼容别名）或 **0 个**（如果移除所有别名）。

---

## 项目规范建议

### 导出风格指南

**推荐**: 统一使用命名导出

```typescript
// ✅ 推荐：命名导出
export function MyComponent() { ... }
export class MyService { ... }
export const myApi = { ... };

// ❌ 避免：默认导出
export default MyComponent;
```

**例外**: 仅在以下情况使用默认导出
- 动态导入的路由组件（Next.js/React Router）
- 配置文件（如 `vite.config.ts`）

**向后兼容别名**:
- 必须添加 `@deprecated` 注释
- 在主要版本更新时移除

---

## 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目开发规范
- [knip-analysis-2026-03-10.md](./knip-analysis-2026-03-10.md) - 完整 Knip 分析报告
