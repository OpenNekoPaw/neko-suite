# neko-story Non-AI Features Design

**Date**: 2026-03-06
**Scope**: 错误诊断 / 时间线生成 / PDF 导出
**Status**: Approved

---

## Background

neko-story 当前进度 55%，剩余三项功能（错误诊断、时间线生成、PDF 导出）均无需 AI 即可实现，可独立于 neko-agent 进度推进至 80%+。

AI 增强版功能（智能时间线、分镜生成）列入未来开发目标，不在本设计范围内。

---

## Feature 1: 错误诊断（DiagnosticsProvider）

### 架构

```
WorkspaceIndexService（已有 FountainDocument AST）
  └─ getDocument(uri) → FountainDocument
       ↓
FountainDiagnosticsProvider
  └─ analyzeSyntax(doc) → Diagnostic[]
  └─ analyzeSemantics(doc, index) → Diagnostic[]
       ↓
vscode.DiagnosticCollection → 编辑器红/黄波浪线
```

### 新增文件

- `packages/neko-story/packages/extension/src/providers/diagnostics.ts`

### 错误规则

| 规则 | 严重级别 | 检测方式 |
|------|----------|---------|
| 未闭合 `[[note` | Error | 扫描原始文本，`[[` 出现次数 > `]]` |
| 未闭合 `/*boneyard*/` | Error | 扫描原始文本，`/*` 出现次数 > `*/` |
| 孤立括注 `(...)` | Error | parenthetical 元素前后无 character/dialogue |
| 空转场 `>` | Warning | transition 元素 text 为空 |
| 单次出现的角色 | Warning | 全工作区索引中只出现一次的角色名 |
| 无角色的对话 | Warning | dialogue 元素出现在非 character 之后 |

### 触发时机

- `onDidOpenTextDocument`：打开时立即分析
- `onDidChangeTextDocument`：300ms 防抖后分析
- `onDidCloseTextDocument`：清空诊断

### 集成点

`extension.ts` 激活时：
```typescript
const diagnosticsProvider = new FountainDiagnosticsProvider(indexService);
context.subscriptions.push(diagnosticsProvider);
```

---

## Feature 2: 时间线生成（TimelineConverter）

### 架构

```
FountainDocument（已解析 AST）
  ↓
TimelineConverter.convert(doc) → ProjectData
  ↓
QuickPick 预览摘要
  ↓
showSaveDialog → .neko 文件
  ↓
vscode.openWith('neko.cut.editor', uri)
```

### 新增文件

- `packages/neko-story/packages/extension/src/converters/TimelineConverter.ts`

### Fountain → Timeline 映射规则

| Fountain 元素 | Timeline 轨道 | 元素类型 | 时长估算 |
|--------------|--------------|---------|---------|
| SceneHeading | "场景标记"（text track） | TextElement（深色背景，显示场景编号+标题） | 同场景总时长 |
| Dialogue | "字幕"（subtitle track） | SubtitleElement（"角色名：台词"） | 每行 1.5s |
| Action | 仅用于时长计算 | — | 每段 2.0s |
| Transition | 当前场景 TextElement 的 transitionOut | — | — |

**场景最小时长**：3s

**轨道结构**：
```
Track 0: "场景标记" (text)   ← TextElement per scene
Track 1: "字幕"     (subtitle) ← SubtitleElement per dialogue line
```

### 用户流程

```
1. 命令: neko.story.toTimeline
2. QuickPick 显示：
   "发现 N 个场景 · 预计 ~X分Y秒 · P 个角色  [新建项目] [取消]"
3. showSaveDialog（默认：剧本同目录，同名 .neko）
4. 写入 ProjectData JSON
5. vscode.commands.executeCommand('vscode.openWith', uri, 'neko.cut.editor')
```

### ProjectData 初始值

```typescript
const project: ProjectData = {
  version: '1.0.0',
  name: doc.titlePage?.title ?? path.basename(uri, '.fountain'),
  resolution: { width: 1920, height: 1080 },
  fps: 24,
  tracks: [sceneTrack, subtitleTrack],
};
```

### 不实现

- 注入到当前 neko-cut 项目（跨扩展操作复杂度过高，留待未来）
- 资产链接（AssetLinker，属于 AI 辅助功能范围）

---

## Feature 3: PDF 导出（Print CSS）

### 架构

```
Extension: neko.story.exportPdf 命令
  └─ postMessage({ type: 'print' }) → Webview
       ↓
Webview: window.print()
  └─ @media print 样式生效
       ↓
系统打印对话框（用户选择"另存为 PDF"）
```

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `webview/src/styles/print.css` | 新增 @media print 规则（新文件） |
| `webview/src/App.tsx` | 引入 print.css，处理 `print` 消息 |
| `webview/src/components/ScriptRenderer.tsx` | 添加打印按钮（屏幕上可见，打印时隐藏） |
| `extension/src/extension.ts` | 注册 `neko.story.exportPdf` 命令 |
| `extension/src/panels/PreviewPanel.ts` | 转发 `print` 消息到 webview |

### 标准 Fountain 印刷规格（US Letter）

```css
@media print {
  @page { size: letter; margin: 1in 1in 1in 1.5in; }

  .scene-heading  { font-weight: bold; margin-left: 0; text-transform: uppercase; }
  .character      { margin-left: 2.2in; }
  .dialogue       { margin-left: 1.0in; margin-right: 1.5in; }
  .parenthetical  { margin-left: 1.6in; margin-right: 2.0in; }
  .action         { margin-left: 0; }
  .transition     { text-align: right; text-transform: uppercase; }

  .print-button   { display: none; }
  .title-page     { page-break-after: always; }
  .scene-heading  { page-break-after: avoid; }
}
```

### 已知限制

用户必须在系统打印对话框中手动选择"另存为 PDF"，无法静默保存文件。这是 VSCode Webview 沙箱限制，与选择的零依赖方案一致。

---

## 实现顺序

1. **错误诊断**（最独立，无外部依赖）
2. **PDF 导出**（纯 CSS + 少量消息协议）
3. **时间线生成**（依赖 neko-types ProjectData 类型系统，工作量最大）

---

## 不在本次范围内（未来 AI 功能）

- 智能时间线（基于剧情节奏的时长推断）
- 分镜生成（`neko.story.generateStoryboard`，需图像生成 AI）
- 资产自动链接（AssetLinker，需 neko-agent AI 分类能力）
- 自动配乐建议

---

## 文件变更清单

### 新增
- `extension/src/providers/diagnostics.ts`
- `extension/src/converters/TimelineConverter.ts`
- `webview/src/styles/print.css`

### 修改
- `extension/src/extension.ts`（注册 DiagnosticsProvider + exportPdf 命令）
- `extension/src/panels/PreviewPanel.ts`（转发 print 消息）
- `webview/src/App.tsx`（处理 print 消息）
- `webview/src/components/ScriptRenderer.tsx`（添加打印按钮）
