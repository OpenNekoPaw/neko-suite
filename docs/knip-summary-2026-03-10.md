# Knip 代码质量分析总结

**日期**: 2026-03-10
**分析工具**: Knip v5.x
**分析范围**: packages/ 目录

---

## 执行摘要

| 指标 | 修复前 | 修复后 | 改进 |
|------|--------|--------|------|
| **配置提示** | 21 | 5 | ✅ -76% |
| **未使用文件** | 97 | 97 | ⚠️ 需决策 |
| **未使用依赖** | 21 | 21 | ⚠️ 需验证 |
| **重复导出** | 6 | 6 | ⚠️ 需修复 |

---

## ✅ 已完成修复

### 1. Package Entry 错误 (3个)

**问题**: Extension 包的 package.json 声明了不存在的入口文件

**修复**:
```json
// neko-engine/extension/package.json
- ".": "./src/index.ts"
+ ".": "./src/extension.ts"

// neko-cut/extension/package.json
- ".": "./src/index.ts"
+ ".": "./src/extension.ts"

// neko-tools/extension/package.json
- ".": "./src/index.ts"
+ ".": "./src/asset-diff/index.ts"
+ "./asset-diff": "./src/asset-diff/index.ts"
+ "./media-diff": "./src/media-diff/index.ts"
+ "./media-lsp": "./src/media-lsp/index.ts"
```

### 2. 冗余 Entry 声明 (7个)

**问题**: Webview 包显式声明了 Vite 能自动检测的入口

**修复**: 从 knip.config.ts 移除所有 webview 的 `entry: ['src/main.tsx']` 声明

**原理**: Vite 通过 `rollupOptions.input` 中的 HTML 文件自动检测 TypeScript 入口

### 3. 过时的 Ignore 规则 (3个)

**问题**:
- `examples/**` 目录已删除
- `**/*` 过于宽泛

**修复**:
```typescript
// knip.config.ts
- 'packages/neko-agent/packages/platform': { ignore: ['examples/**'] }
+ 'packages/neko-agent/packages/platform': {}

- 'packages/neko-proto': { ignore: ['**/*'] }
+ 'packages/neko-proto': { entry: ['package.json'] }

- 'packages/neko-suite': { ignore: ['**/*'] }
+ 'packages/neko-suite': { entry: ['package.json'] }

- 'packages/neko-engine/packages/native-cli': { ignore: ['**/*'] }
+ 'packages/neko-engine/packages/native-cli': { entry: ['package.json'] }
```

### 4. neko-types 冗余 Entry (2个)

**问题**: 显式声明了 package.json exports 已定义的入口

**修复**:
```typescript
// knip.config.ts
- entry: ['src/index.ts', 'src/vscode/extension/index.ts']
+ // Knip auto-detects entries from package.json exports
```

---

## ⚠️ 待处理问题

### 1. 未使用文件 (97个)

**分布**:
- `neko-cut/webview`: 56 个
  - AssetLibrary 组件 (12 个)
  - ColorCorrection 组件 (5 个)
  - Effects/Mask/Subtitles (15+ 个)
  - PropertyPanel 独立版本 (4 个)
  - Tools/Utils (10+ 个)
- `neko-agent/webview`: 2 个
- `neko-canvas/webview`: 2 个
- `neko-tools/webview`: 若干
- `neko-preview/webview`: 若干

**决策选项**:

**选项 A**: 保留（如果是待实现功能）
```typescript
// knip.config.ts
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
```

**选项 B**: 删除（如果是废弃代码）
```bash
# 需要逐个确认后删除
rm -rf packages/neko-cut/packages/webview/src/components/AssetLibrary
```

**选项 C**: 添加 TODO 注释并保留
```typescript
// TODO(P2): Implement AssetLibrary feature
// Currently unused, planned for v2.0
```

**建议**: 先在 knip.config.ts 中 ignore，标记为 TODO，在下个迭代中决定是否实现或删除

---

### 2. 未使用依赖 (21个)

#### 根依赖 (2个)
```json
"d3-array": "^3.2.4",    // 数据可视化
"d3-shape": "^3.2.0"     // 图形绘制
```
**建议**: 检查是否用于时间轴缩略图或波形显示

#### neko-agent/webview (10个)
```json
// Markdown 渲染相关
"remark-parse": "^11.0.0",
"remark-rehype": "^11.1.0",
"unified": "^11.0.4",
"vfile": "^6.0.1",
"mdast-util-gfm": "^3.0.0",
"micromark-extension-gfm": "^3.0.0",
"hast-util-to-jsx-runtime": "^2.3.0",
"html-url-attributes": "^3.0.0",

// 工具
"clsx": "^2.1.0",
"devlop": "^1.1.0"
```
**建议**: 检查 Markdown 渲染功能是否通过动态导入使用

#### neko-preview/webview (4个)
```json
"@neko/neko-client": "workspace:*",
"@neko/shared": "workspace:*",
"react": "^18.2.0",
"react-dom": "^18.2.0"
```
**建议**: 检查是否实际使用，或移到使用的地方

#### neko-tools/webview (4个)
```json
"@neko/shared": "workspace:*",
"@neko/neko-client": "workspace:*",
"react": "^18.2.0",
"react-dom": "^18.2.0"
```
**建议**: 同上

#### neko-engine (1个)
```json
"@neko-engine/native-napi": "workspace:*"
```
**建议**: 移到实际使用的子包（extension）

**验证命令**:
```bash
# 检查是否真的未使用（可能是动态导入）
rg "import.*remark-parse" --type ts
rg "require.*remark-parse" --type ts
rg "d3-array" --type ts
```

---

### 3. 重复导出 (6个)

详见 [knip-duplicate-exports-analysis.md](./knip-duplicate-exports-analysis.md)

**分类**:

**向后兼容别名** (2个 - 建议保留):
1. `saveUserConfig | saveGlobalConfig` - config.ts
2. `getMediaProxy | getRemoteMediaProxy` - mediaProxyFactory.ts

**命名+默认导出** (4个 - 建议移除默认导出):
3. `UsageIndicator` - React 组件
4. `ShapeElementContent` - React 组件
5. `PreviewModeController` - 类
6. `vscodeApi` - API 对象

**修复步骤**:
1. 搜索默认导入使用情况
2. 改为命名导入
3. 移除默认导出
4. 为别名添加 `@deprecated` 注释

**预期结果**: 6 → 2 或 0

---

## 📊 改进效果

### 配置质量提升

```
修复前: 21 个配置提示
修复后: 5 个配置提示
改进率: 76%
```

### 配置清晰度提升

**修复前**:
- 混乱的 entry 声明
- 过时的 ignore 规则
- 错误的 package.json exports

**修复后**:
- 自动检测 Vite 入口
- 精确的 ignore 规则
- 正确的 package.json exports
- 清晰的注释说明

---

## 🎯 下一步行动

### 立即执行（已完成）
- [x] 修复 package.json entry 错误
- [x] 移除冗余 entry 声明
- [x] 清理过时 ignore 规则
- [x] 生成分析报告

### 短期（本周）
- [ ] 决定未使用文件的处理方式（保留/删除/TODO）
- [ ] 验证未使用依赖是否真的未使用
- [ ] 修复重复导出（移除默认导出）

### 中期（本月）
- [ ] 建立导出风格指南（统一使用命名导出）
- [ ] 清理废弃代码
- [ ] 移除确认未使用的依赖

### 长期（下季度）
- [ ] 将 Knip 检查集成到 CI/CD
- [ ] 定期运行 Knip 分析
- [ ] 维护代码质量基线

---

## 📝 相关文档

- [knip-analysis-2026-03-10.md](./knip-analysis-2026-03-10.md) - 完整分析报告
- [knip-duplicate-exports-analysis.md](./knip-duplicate-exports-analysis.md) - 重复导出详细分析
- [CLAUDE.md](../CLAUDE.md) - 项目开发规范
- [ARCHITECTURE.md](../ARCHITECTURE.md) - 架构文档

---

## 🔧 验证命令

```bash
# 运行完整检查
pnpm knip

# 检查特定包
pnpm knip --workspace "packages/neko-cut/packages/webview"

# 仅检查配置问题
pnpm knip 2>&1 | grep "Configuration hints"

# 仅检查未使用依赖
pnpm knip 2>&1 | grep "Unused dependencies"

# 仅检查重复导出
pnpm knip 2>&1 | grep "Duplicate exports"

# 生成 JSON 报告
pnpm knip --reporter json > knip-report.json
```

---

## 💡 经验总结

### Knip 配置最佳实践

1. **让工具自动检测**: 优先使用工具的自动检测能力（如 Vite 的 HTML 入口）
2. **精确的 ignore**: 使用具体的路径而非 `**/*`
3. **注释说明**: 为特殊配置添加注释解释原因
4. **定期检查**: 将 Knip 集成到开发流程中

### Monorepo 特殊考虑

1. **依赖位置**: 依赖可能在父包声明但在子包使用
2. **动态导入**: 某些依赖通过动态导入使用，Knip 可能检测不到
3. **运行时依赖**: Native 模块、Peer dependencies 需要特殊处理
4. **构建工具**: esbuild、Vite 等工具的配置文件需要特殊处理

### VSCode 扩展特殊性

1. **Webview 入口**: 是 HTML 文件，不是 TypeScript 文件
2. **Extension 入口**: 通常是 `extension.ts`，不是 `index.ts`
3. **多入口**: 一个扩展可能有多个 webview 入口（main/propertyPanel/assetLibrary）

---

**分析完成时间**: 2026-03-10
**分析工具版本**: Knip v5.x
**项目版本**: neko-suite v0.0.1
