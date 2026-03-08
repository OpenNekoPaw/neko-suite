# Neko Agent UI 对齐设计方案

**日期**: 2026-03-08
**状态**: 草稿
**关联分析**: TUI (opencode/claude-code) vs Webview (neko-agent) 对比研究

---

## 背景

基于对 opencode TUI、claude-code TUI 和 neko-agent webview 的横向对比分析，三者在**信息架构和交互模型上高度同构**，但跨层共享代码尚未提取：

- `computeDiff()` 在 webview 中实现，CLI 完全没有 diff 显示能力
- Diff / Git 色彩 token 在 `tokens.ts` 中缺失，webview 直接硬编码 VSCode CSS 变量
- CLI 的 `chalk.green/red` 颜色硬编码，与 webview 的语义 token 命名脱节
- 工具调用在 CLI 中仅有 `console.log` 纯文本，webview 有完整的两级展示方案

---

## 共享组件放置策略

### 核心原则

按现有依赖方向放置，**不引入新的循环依赖**：

```
@neko/shared (neko-types)        ← 纯算法 + 色彩 token（零依赖）
    ↑
@neko/agent                      ← Agent 逻辑层工具（依赖 @neko/shared）
    ↑
@neko/cli           @neko-agent/webview    ← 使用层（各自渲染）
```

### 放置决策表

| 共享内容 | 放置位置 | 原因 |
|---------|---------|------|
| `computeDiff()` + `DiffLine` 类型 | `@neko/shared/utils/diff` | 纯算法，零依赖，CLI + webview 均可用 |
| Diff / Git 色彩 token | `@neko/shared/theme/tokens.ts` | 已有 VSCode CSS 变量映射表，扩展即可 |
| 工具调用摘要生成函数 | `@neko/agent/src/utils/tool-summary.ts` | Agent 特定逻辑，extension + CLI 共用 |
| CLI Markdown 渲染 | `@neko/cli/src/formatter.ts` | CLI 特定渲染，不进 shared |
| CLI Todo 状态渲染 | `@neko/cli/src/formatter.ts` | CLI 特定，chalk 着色，不进 shared |

---

## 模块 1：`@neko/shared/utils/diff`

**文件**: `packages/neko-types/src/utils/diff.ts`

### 提取来源

从 `packages/neko-agent/packages/webview/src/components/ChatView/DiffBlock.tsx` 提取，该文件中 `computeDiff()` 和 `computeLCS()` 均为**纯 TypeScript，零 React / DOM 依赖**。

### 类型定义

```typescript
export type DiffLineType = 'add' | 'remove' | 'context';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffStats {
  added: number;
  removed: number;
}
```

### 函数签名

```typescript
/**
 * Compute line-level diff using Longest Common Subsequence algorithm.
 * Pure function, no side effects, no framework dependencies.
 */
export function computeDiff(oldContent: string, newContent: string): DiffLine[]

/**
 * Compute diff statistics from a DiffLine array.
 */
export function computeDiffStats(lines: DiffLine[]): DiffStats
```

### 导出路径

在 `packages/neko-types/src/utils/index.ts` 追加：

```typescript
export { computeDiff, computeDiffStats, type DiffLine, type DiffLineType, type DiffStats } from './diff';
```

可通过以下路径导入：
- `import { computeDiff } from '@neko/shared/utils'`  （via `./*` 通配符）
- `import { computeDiff } from '@neko/shared'`        （需加入主 index.ts）

### webview 侧变更

`DiffBlock.tsx` 改为从 `@neko/shared` 导入，删除本地实现：

```typescript
// Before
function computeDiff(oldContent: string, newContent: string): DiffLine[] { ... }

// After
import { computeDiff, type DiffLine } from '@neko/shared/utils';
```

---

## 模块 2：`@neko/shared/theme/tokens.ts` 扩展

**文件**: `packages/neko-types/src/theme/tokens.ts`

当前 `tokens.ts` 有 55 个 VSCode CSS token（editor / panel / sidebar / list / input / button），**缺少 diff 和 git 语义色**。

### 追加的 Token 分组

```typescript
// Diff editor colors
'vscode-diff-inserted':    'var(--vscode-diffEditor-insertedLineBackground)',
'vscode-diff-removed':     'var(--vscode-diffEditor-removedLineBackground)',
'vscode-diff-inserted-fg': 'var(--vscode-gitDecoration-addedResourceForeground)',
'vscode-diff-removed-fg':  'var(--vscode-gitDecoration-deletedResourceForeground)',
'vscode-diff-modified-fg': 'var(--vscode-gitDecoration-modifiedResourceForeground)',

// Charts (for status color encoding)
'vscode-chart-green':  'var(--vscode-charts-green)',
'vscode-chart-red':    'var(--vscode-charts-red)',
'vscode-chart-blue':   'var(--vscode-charts-blue)',
'vscode-chart-yellow': 'var(--vscode-charts-yellow)',
'vscode-chart-purple': 'var(--vscode-charts-purple)',
```

### 与 opencode TUI 主题 Token 的命名对齐

| opencode JSON token | neko-agent CSS token | 语义 |
|--------------------|--------------------|------|
| `diffAdded` | `vscode-diff-inserted-fg` | 新增行文字色 |
| `diffRemoved` | `vscode-diff-removed-fg` | 删除行文字色 |
| `diffAddedBg` | `vscode-diff-inserted` | 新增行背景 |
| `diffRemovedBg` | `vscode-diff-removed` | 删除行背景 |
| `warning` | `vscode-chart-yellow` | 警告/进行中 |
| `success` / `diffAdded` | `vscode-chart-green` | 成功/完成 |
| `error` / `diffRemoved` | `vscode-chart-red` | 失败/拒绝 |

**命名原则**：webview 继续使用 `vscode-*` 前缀（绑定 VSCode 环境），CLI 使用 chalk 着色但通过语义 token 名称对齐（见模块 4）。

---

## 模块 3：`@neko/agent/src/utils/tool-summary.ts`

**文件**: `packages/neko-agent/packages/agent/src/utils/tool-summary.ts`

### 职责

从工具名称 + 参数提取可读的单行摘要（40 字截断），供 CLI 和 extension 共用。

### 函数签名

```typescript
/**
 * Generate a short human-readable summary for a tool call.
 * Used by CLI (single-line collapsed display) and extension (tool card header).
 *
 * @param toolName - The tool function name
 * @param args     - Tool arguments object
 * @param maxLen   - Max character length (default 40)
 */
export function getToolSummary(
  toolName: string,
  args: Record<string, unknown>,
  maxLen = 40,
): string
```

### 摘要规则（参考 webview ToolCallDisplay 实现）

| 工具类型 | 摘要提取字段 | 示例输出 |
|---------|------------|---------|
| `read_file`, `write_file`, `edit_file` | `args.path` | `src/foo.ts` |
| `bash`, `execute_command` | `args.command`（前 40 字） | `npm install react` |
| `web_search`, `search` | `args.query` | `opencode TUI design` |
| `grep`, `search_files` | `args.pattern` + `args.path` | `"computeDiff" in src/` |
| 其他 | JSON 序列化（截断） | `{ model: "claude-3-5"... }` |

---

## 模块 4：CLI `formatter.ts` / `runner.ts` 增强

这部分**不进入 shared**，保留在 `@neko/cli` 内部，但参考 opencode / webview 的设计对齐视觉呈现。

### 4.1 语义色彩 theme 对象

**文件**: `packages/neko-agent/packages/cli/src/theme.ts`（新建）

```typescript
import chalk from 'chalk';

/**
 * CLI semantic color theme.
 * Token names aligned with opencode TUI and neko-agent webview conventions.
 * Swap chalk calls here (not scattered across formatter/runner).
 */
export const theme = {
  // Diff
  diffAdded:   (s: string) => chalk.green(s),
  diffRemoved: (s: string) => chalk.red(s),
  diffContext: (s: string) => chalk.gray(s),
  diffLineNum: (s: string) => chalk.dim(s),

  // Status (aligned with vscode-chart-* tokens)
  success:    (s: string) => chalk.green(s),
  warning:    (s: string) => chalk.yellow(s),
  error:      (s: string) => chalk.red(s),
  info:       (s: string) => chalk.blue(s),
  muted:      (s: string) => chalk.dim(s),

  // Todo states (aligned with opencode TUI TodoItem)
  todoPending:    (s: string) => chalk.gray(s),
  todoInProgress: (s: string) => chalk.yellow(s),
  todoCompleted:  (s: string) => chalk.green(s),
  todoFailed:     (s: string) => chalk.red(s),
} as const;
```

### 4.2 工具调用折叠显示（参考 webview 两级策略）

**文件**: `packages/neko-agent/packages/cli/src/formatter.ts` 增强

```typescript
// Tool call rendering (two-tier: collapsed by default, expanded with --verbose)
function formatToolCall(toolCall: ToolCallEvent, verbose: boolean): string {
  const summary = getToolSummary(toolCall.name, toolCall.args);
  const icon = toolCall.status === 'success' ? theme.success('✓')
             : toolCall.status === 'error'   ? theme.error('✗')
             : theme.info('◐');

  // Collapsed (default): single line
  const line = `  ${icon} ${chalk.bold(toolCall.name)} ${theme.muted(summary)}`;
  if (!verbose || !toolCall.result) return line;

  // Expanded (--verbose): + args + result
  return [
    line,
    theme.muted('    Args:   ') + JSON.stringify(toolCall.args, null, 2).replace(/\n/g, '\n    '),
    theme.muted('    Result: ') + JSON.stringify(toolCall.result, null, 2).replace(/\n/g, '\n    '),
  ].join('\n');
}
```

### 4.3 Todo 任务状态显示（参考 opencode TUI TodoItem）

```typescript
// Aligned with opencode: [ ] [•] [✓] [✗]
const STATUS_ICONS = {
  pending:    theme.todoPending('[ ]'),
  inProgress: theme.todoInProgress('[•]'),
  completed:  theme.todoCompleted('[✓]'),
  failed:     theme.todoFailed('[✗]'),
} as const;

function formatTodoList(todos: TodoItem[]): string {
  return todos.map(t => `${STATUS_ICONS[t.status]} ${t.content}`).join('\n');
}
```

### 4.4 Diff 显示（使用提取的 `computeDiff()`）

```typescript
import { computeDiff, computeDiffStats } from '@neko/shared/utils';

function formatDiff(oldContent: string, newContent: string): string {
  const lines = computeDiff(oldContent, newContent);
  const stats = computeDiffStats(lines);
  const header = `${theme.diffAdded(`+${stats.added}`)} ${theme.diffRemoved(`-${stats.removed}`)}`;

  const body = lines.map(line => {
    switch (line.type) {
      case 'add':     return theme.diffAdded(`+${line.content}`);
      case 'remove':  return theme.diffRemoved(`-${line.content}`);
      case 'context': return theme.diffContext(` ${line.content}`);
    }
  }).join('\n');

  return `${header}\n${body}`;
}
```

### 4.5 Spinner 帧升级（参考 opencode braille frames）

```typescript
// In runner.ts or cli.ts, upgrade ora spinner frames
const spinner = ora({
  spinner: {
    frames: [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'],
    interval: 80,
  },
  text: 'Running agent...',
});
```

---

## 执行计划

### Track A：纯提取，零功能变更（低风险）

1. **提取 `computeDiff`** → `packages/neko-types/src/utils/diff.ts`
   - 复制算法函数（`computeDiff`, `computeLCS`）和类型定义
   - 导出加入 `utils/index.ts`
   - webview `DiffBlock.tsx` 改为 import from `@neko/shared/utils`
   - 删除 webview 中的本地实现

2. **扩展 `tokens.ts`** → 追加 diff + charts token 分组
   - 不影响现有 token，仅追加
   - webview 中硬编码的 `--vscode-gitDecoration-*` 替换为 Tailwind token class

### Track B：CLI 视觉增强（中风险，不影响 agent 逻辑）

3. **新建 `theme.ts`** → `packages/neko-agent/packages/cli/src/theme.ts`
   - 集中所有 chalk 调用，用语义命名替换

4. **新建 `tool-summary.ts`** → `packages/neko-agent/packages/agent/src/utils/tool-summary.ts`
   - 提取摘要生成逻辑，提供给 CLI + extension 使用

5. **增强 `formatter.ts`** → 工具折叠显示 + todo 状态 + diff 渲染
   - 使用 Track A 提取的 `computeDiff`
   - 使用 Track B 新建的 `theme.ts`

6. **升级 spinner 帧** → braille 字符，80ms 间隔

### 测试要求

| 模块 | 测试类型 | 要点 |
|------|---------|------|
| `computeDiff` | 单元测试（Vitest） | 纯函数，测试 add/remove/context 行，空输入，相同内容 |
| `getToolSummary` | 单元测试 | 每种工具类型 + 截断边界 |
| `theme.ts` | 无需测试 | 纯 chalk 包装，视觉验证即可 |
| `tokens.ts` 扩展 | 快照测试 | 确保新 token key 格式一致 |

---

## 文件变更清单

```
新建:
  packages/neko-types/src/utils/diff.ts
  packages/neko-agent/packages/cli/src/theme.ts
  packages/neko-agent/packages/agent/src/utils/tool-summary.ts

修改:
  packages/neko-types/src/utils/index.ts       (追加 diff 导出)
  packages/neko-types/src/theme/tokens.ts      (追加 diff + charts token)
  packages/neko-agent/packages/webview/src/components/ChatView/DiffBlock.tsx
                                               (改为 import from @neko/shared/utils)
  packages/neko-agent/packages/cli/src/formatter.ts
                                               (工具折叠 + todo + diff 渲染)
  packages/neko-agent/packages/cli/src/runner.ts
                                               (spinner 帧升级，引用 theme.ts)

不变:
  packages/neko-agent/packages/agent/src/     (核心 agent 逻辑不变)
  packages/neko-agent/packages/platform/src/  (LLM routing 不变)
  packages/neko-agent/packages/extension/src/ (Extension Host 不变)
```

---

## 不在本方案范围内

- **CLI 换 Ink/TUI 框架**：当前 readline 满足需求，不引入 Ink 复杂度
- **CLI Markdown 渲染**：低优先级，不影响功能正确性
- **opencode 式侧边栏**：需要 TUI 框架，超出当前范围
- **多主题支持**（JSON 主题文件）：CLI 单用户场景，不需要 36 个主题
