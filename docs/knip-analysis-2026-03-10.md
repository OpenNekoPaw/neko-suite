# Knip 代码质量分析报告

**日期**: 2026-03-10
**分析范围**: packages/ 目录

## 执行摘要

- **未使用文件**: 97 个
- **未使用依赖**: 21 个
- **未使用 devDependencies**: 20 个
- **配置提示**: 5 个（已从 21 个降至 5 个）
- **重复导出**: 6 个

## 已修复问题 ✅

### 1. Package entry file not found (3个)
**问题**: Extension 包的 package.json 声明了不存在的 `./src/index.ts` 入口

**修复**:
- `neko-engine/extension`: 改为 `./src/extension.ts`
- `neko-cut/extension`: 改为 `./src/extension.ts`
- `neko-tools/extension`: 改为多入口（asset-diff/media-diff/media-lsp）

### 2. Remove redundant entry pattern (7个)
**问题**: Webview 包在 knip.config.ts 中显式声明了 `entry: ['src/main.tsx']`，但 Vite 会自动从 HTML 文件检测入口

**修复**: 移除所有 webview 的显式 entry 声明，让 Knip 自动检测

### 3. Remove from ignore (3个)
**问题**: 过时的 ignore 规则
- `examples/**` 目录已删除
- `**/*` 过于宽泛

**修复**:
- 移除 `examples/**` ignore
- 为 Rust/Protobuf 包使用 `entry: ['package.json']` 替代 `ignore: ['**/*']`

## 剩余问题（需决策）

### 1. Configuration hints (5个) - Webview 未使用文件

**问题**: 5 个 webview 包有大量未使用文件（共 97 个）

**详细分布**:
- `neko-cut/webview`: 56 个未使用文件
  - AssetLibrary 组件（12 个文件）
  - ColorCorrection 组件（5 个文件）
  - Effects/Mask/Subtitles 组件（15+ 个文件）
  - PropertyPanel 独立版本（4 个文件）
  - Tools/Utils（10+ 个文件）

- `neko-agent/webview`: 2 个未使用文件
- `neko-canvas/webview`: 2 个未使用文件
- `neko-tools/webview`: 未统计
- `neko-preview/webview`: 未统计

**建议**:
```typescript
// 选项 A: 在 knip.config.ts 中忽略这些文件（如果是待实现功能）
'packages/neko-cut/packages/webview': {
  ignore: [
    'src/assetLibrary.tsx',
    'src/propertyPanel.tsx',
    'src/components/AssetLibrary/**',
    'src/components/ColorCorrection/**',
    'src/components/Subtitles/**',
    'src/tools/**',
  ],
}

// 选项 B: 删除这些文件（如果是废弃代码）
// 需要确认这些功能是否还需要

// 选项 C: 添加 TODO 注释并保留（如果是计划中的功能）
```

### 2. Unused dependencies (21个)

**根依赖**:
- `d3-array`, `d3-shape` - 可能用于数据可视化，需确认

**neko-agent/webview (10个)**:
- Markdown 相关: `remark-parse`, `remark-rehype`, `unified`, `vfile`, `mdast-util-gfm`, `micromark-extension-gfm`
- HTML 处理: `hast-util-to-jsx-runtime`, `html-url-attributes`
- 工具: `clsx`, `devlop`

**neko-preview/webview (4个)**:
- `@neko/neko-client`, `@neko/shared`, `react`, `react-dom`

**neko-tools/webview (4个)**:
- `@neko/shared`, `@neko/neko-client`, `react`, `react-dom`

**neko-engine**:
- `@neko-engine/native-napi` - 父包中声明但实际在子包使用

**建议**:
1. 检查 Markdown 渲染功能是否真的未使用（可能是动态导入）
2. 将 preview/tools webview 的依赖移到实际使用的地方
3. 移除 neko-engine 父包中的 native-napi 依赖

### 3. Duplicate exports (6个)

**问题**: 同一模块有多个导出方式

```typescript
// 示例：packages/neko-types/src/vscode/api.ts
export const vscodeApi = ...;  // 命名导出
export default vscodeApi;      // 默认导出
```

**建议**: 统一使用命名导出，移除默认导出（符合项目规范）

## 配置优化建议

### knip.config.ts 最终状态

```typescript
workspaces: {
  // Layer 0: 自动检测 exports
  'packages/neko-types': {
    ignoreDependencies: ['react'],
  },

  // Webview: 让 Vite 自动检测 HTML 入口
  'packages/neko-cut/packages/webview': {
    // 可选：忽略待实现功能
    ignore: ['src/assetLibrary.tsx', 'src/propertyPanel.tsx'],
  },

  // Rust/Protobuf: 仅检查 package.json
  'packages/neko-proto': {
    entry: ['package.json'],
  },
}
```

## 行动计划

### 立即执行（已完成）
- [x] 修复 package.json entry 路径错误
- [x] 移除冗余的 entry 声明
- [x] 清理过时的 ignore 规则

### 需要决策
- [ ] 确认 neko-cut/webview 的 56 个未使用文件是否需要保留
- [ ] 检查 Markdown 依赖是否真的未使用
- [ ] 决定是否移除重复导出

### 可选优化
- [ ] 移除未使用的依赖（需谨慎，可能是动态导入）
- [ ] 统一导出风格（命名导出 vs 默认导出）

## 验证命令

```bash
# 检查所有问题
pnpm knip

# 检查特定包
pnpm knip --workspace "packages/neko-cut/packages/webview"

# 仅检查配置问题
pnpm knip 2>&1 | grep "Configuration hints"

# 仅检查未使用依赖
pnpm knip 2>&1 | grep "Unused dependencies"
```

## 注意事项

1. **未使用文件不一定是错误**: 可能是待实现功能或通过动态导入使用
2. **未使用依赖需谨慎删除**: 可能是运行时依赖或 peer dependency
3. **Vite 项目的特殊性**: 入口是 HTML 文件，TypeScript 通过 `<script>` 标签引用
4. **Monorepo 的复杂性**: 依赖可能在父包声明但在子包使用

## 改进效果

- 配置提示从 **21 个降至 5 个** ✅
- 所有 package.json entry 错误已修复 ✅
- 配置更清晰，注释更完善 ✅
- 剩余问题主要是业务决策（保留 vs 删除未使用代码）
