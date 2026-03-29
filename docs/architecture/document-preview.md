# 文档预览策略

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [format-strategy.md](./format-strategy.md) · [panel-placement.md](./panel-placement.md)

---

## 一、背景

neko-assets 已支持 Word、EPUB、PPTX 等 9 种文档格式的**分类与元数据提取**，但 neko-preview 目前仅实现了 Video/Audio 两种媒体预览，文档类资产尚无统一预览方案。

**已支持的文档格式**（`@neko/shared` `detectMediaType()`）：

| 格式 | 扩展名 | 分类 |
|------|--------|------|
| PDF | `.pdf` | document |
| Word | `.doc` / `.docx` | document |
| PowerPoint | `.ppt` / `.pptx` | document |
| Excel | `.xls` / `.xlsx` | document |
| eBook | `.epub` | document |
| Comic | `.cbz` | document |
| Script | `.fdx` | document |

---

## 二、VSCode 市场现有扩展实现分析

> 以下基于本地已安装版本源码逆向分析（`~/.vscode/extensions/`）。

### 2.1 Book Reader（lindacong.vscode-book-reader-1.2.8）

**支持格式**：EPUB、MOBI、AZW3、FB2、CBZ、PDF（多格式合一）

**架构**：Vue 3 + Vite SPA 打包为单 HTML，CustomEditor + Sidebar 双入口。

```
Extension Host: bookViewerProvider → 传递 webview URI → postMessage { type: 'init', ... }
Webview: Vue 3 + Element Plus SPA
  ├─ vue-reader（EPUB → epub.js）
  ├─ vue-book-reader（MOBI/AZW3/FB2/CBZ）
  ├─ pdfjs-dist（PDF）
  └─ localforage（书签/阅读进度持久化）
```

- `retainContextWhenHidden: true`（保留阅读位置）
- 消息协议：`init / style / flow / animation / download / title / active`

### 2.2 Office Viewer（cweijan.vscode-office-3.5.4）

**支持格式**：DOCX、XLSX、PDF、HTML、Markdown、ZIP/RAR、TTF/WOFF、Java .class

**架构**：单一 `OfficeEditorProvider` 路由 7 种 CustomEditor，React 18 + Vite SPA。

```
Extension Host: OfficeEditorProvider → 按扩展名路由 → 加载 out/webview/index.html
Webview: React 18 + Vite SPA
  ├─ DOCX/DOTX → docx-preview（DOM 直接渲染）
  ├─ XLSX/XLS/ODS → x-data-spreadsheet + xlsx（SheetJS 社区版）
  ├─ PDF → pdf-lib（embedded viewer.html）
  ├─ ZIP/RAR → adm-zip + node-unrar-js（文件树 + 按需解压）
  ├─ TTF/WOFF/OTF → opentype.js
  └─ Markdown → vditor（WYSIWYG 编辑器）
```

- Markdown → PDF 导出依赖 Puppeteer（外部 Chromium，**非离线**）

### 2.3 vscode-pdf（tomoki1207.pdf-1.2.2）

**不再单独列为委托目标**：PDF 已由 Book Reader 覆盖（同为 pdfjs-dist 底层）；自建时直接引入 `pdfjs-dist` 即可。其 CustomEditorProvider 最小实现模式已内化到第四节架构设计。

### 2.4 综合对比

| 格式 | 覆盖扩展 | 渲染库 | 离线 |
|------|---------|--------|------|
| PDF | Book Reader / Office Viewer | pdfjs-dist / pdf-lib | ✅ |
| EPUB / MOBI / AZW3 / CBZ | Book Reader | epub.js / vue-book-reader | ✅ |
| DOCX | Office Viewer | **docx-preview** | ✅ |
| XLSX | Office Viewer | **x-data-spreadsheet + xlsx** | ✅ |
| PPTX | 无 | — | — |

---

## 三、渲染策略

采用**分格式差异化策略**，按使用频率和自建收益决定是自建还是委托：

| 格式 | 渲染库 | 策略 | 理由 |
|------|--------|------|------|
| **PDF** | `pdfjs-dist` | B：自建 | 使用频率最高，不应依赖第三方 |
| **DOCX** | `docx-preview` | B：自建 | 资产库常见，Office Viewer 已验证可行 |
| **EPUB** | `epub.js` | B：自建 | neko-story 剧本场景强需求 |
| **XLSX** | `x-data-spreadsheet` + `xlsx` | B：自建 | 表格数据在资产库中常见 |
| **MOBI / AZW3 / CBZ** | vue-book-reader | D：提示安装 Book Reader | 小众格式，自建收益低 |
| **PPTX** | LibreOffice headless | C：Rust 引擎转 PDF | 无现有扩展，复杂布局需系统级渲染 |
| **FDX** | 自建 XML 解析 | A：自建 | Final Draft XML 结构简单 |

**策略说明**：
- **A**（自建简单格式）：格式结构简单，直接在 Webview 中实现，无需引入库
- **B**（JS 库本地渲染）：成熟库，Webview 沙箱内运行，零外部依赖，零网络
- **C**（Rust 引擎转换）：复杂布局依赖系统级工具，通过 neko-engine sidecar 调用
- **D**（委托第三方 + 提示安装）：小众格式，检测扩展是否已安装，未安装时提示

---

## 四、架构设计

### 4.1 可选安装提示流程（策略 D）

对 MOBI/AZW3/CBZ 等小众格式，采用「检测 → 通知 → 一键安装」模式：

```typescript
// DocumentPreviewRegistry.ts
async function openWithFallback(uri: vscode.Uri, extId: string, extName: string) {
  const ext = vscode.extensions.getExtension(extId);
  if (ext) {
    // 已安装：直接委托
    await vscode.commands.executeCommand('vscode.open', uri);
  } else {
    // 未安装：提示
    const action = await vscode.window.showInformationMessage(
      `预览 ${path.extname(uri.fsPath).toUpperCase()} 文件需要 ${extName} 扩展`,
      '安装', '取消'
    );
    if (action === '安装') {
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension', extId
      );
    }
  }
}

// 注册小众格式
// CBZ / MOBI / AZW3 → Book Reader
openWithFallback(uri, 'lindacong.vscode-book-reader', 'Book Reader');
```

**何时不提示**：
- 用户在同一会话中已选择「取消」→ 本次会话不再重复提示（内存标记）
- 格式对应的自建 Provider 已实现时 → 直接使用自建，不触发提示流程

### 4.2 接口契约（契约优先）

复用 neko-preview 现有的 Provider 模式（参考 `VideoPreviewProvider`）：

```typescript
// packages/neko-preview/packages/extension/src/providers/IDocumentPreviewProvider.ts
interface IDocumentPreviewProvider extends vscode.CustomReadonlyEditorProvider {
  /** 生成首页缩略图（用于资产库卡片） */
  generateThumbnail(uri: vscode.Uri): Promise<Uint8Array>;
  /** 提取文档元数据（页数/字数/幻灯片数等） */
  extractMetadata(uri: vscode.Uri): Promise<DocumentMetadata>;
}

interface DocumentMetadata {
  pageCount?: number;
  wordCount?: number;
  slideCount?: number;
  sheetNames?: string[];   // XLSX
  title?: string;
  author?: string;
}
```

### 4.3 模块结构

```
packages/neko-preview/packages/extension/src/providers/
  ├─ document/
  │   ├─ PdfPreviewProvider.ts       # pdfjs-dist（策略 B）
  │   ├─ DocxPreviewProvider.ts      # docx-preview（策略 B）
  │   ├─ EpubPreviewProvider.ts      # epub.js（策略 B）
  │   ├─ XlsxPreviewProvider.ts      # x-data-spreadsheet + xlsx（策略 B）
  │   ├─ PptxPreviewProvider.ts      # Rust 引擎 → PDF → pdfjs-dist（策略 C）
  │   ├─ FdxPreviewProvider.ts       # XML 解析（策略 A）
  │   └─ DocumentPreviewRegistry.ts  # 格式路由 + 策略 D 提示逻辑
  └─ DocumentPreviewService.ts       # 缩略图缓存 + 元数据聚合
```

### 4.4 缩略图集成（资产库）

文档 Provider 额外实现 `generateThumbnail()`，将首页渲染结果缓存为 PNG：

```
Extension Host
  └─ DocumentPreviewService.generateThumbnail(uri)
       ├─ 检查缓存（.neko/thumbnails/<hash>.png）
       ├─ 命中 → 直接返回
       └─ 未命中 → 调用对应 Provider 渲染首页 → 写入缓存
```

neko-assets 资产卡片通过 `neko.assets.getThumbnail` 命令获取缩略图，与媒体文件缩略图走同一路径。

---

## 五、实施计划

### P1（核心格式）

> **决策（2026-03-28）**：暂缓自建，委托第三方扩展（Book Reader / Office Viewer）。当用户需求积累到足够规模时再推进。

- [ ] `PdfPreviewProvider`（`pdfjs-dist`）
- [ ] `DocxPreviewProvider`（`docx-preview`，参考 Office Viewer 实现）
- [ ] `EpubPreviewProvider`（`epub.js`，neko-story 剧本场景高优）
- [ ] `DocumentPreviewRegistry`（含策略 D 提示逻辑）+ `package.json` customEditors 注册

### P2（补全格式）
- [ ] `XlsxPreviewProvider`（`x-data-spreadsheet` + `xlsx`）
- [ ] 策略 D：CBZ / MOBI / AZW3 → 检测并提示安装 Book Reader
- [ ] 缩略图生成 + neko-assets 集成（首页渲染 → `.neko/thumbnails/` 缓存）

### P3（高质量）
- [ ] `PptxPreviewProvider`（LibreOffice headless via Rust 引擎）
- [ ] `FdxPreviewProvider`（Final Draft XML）

---

## 六、AI 右键菜单（Explorer Context Menu）

### 6.1 跨 Webview 限制

第三方扩展的 Webview（Book Reader、Office Viewer）是独立沙箱 iframe，**不允许跨扩展 DOM 注入或脚本执行**，无法向其内部右键菜单添加条目。

可行方案对比：

| 方案 | 入口 | 限制 |
|------|------|------|
| `explorer/context` | 文件树右键 | 需文件未打开也可触发，最通用 |
| `editor/title` | 编辑器标题栏按钮 | 需文件已打开 |
| `webview/context` | 仅限自建 Webview | 无法注入第三方 Webview |

**决策（2026-03-29）**：优先实现 `explorer/context`，对文档、图片、视频按类型分组挂载 AI 操作。

### 6.2 命令设计

neko-agent 在 `explorer/context` 按媒体类型分组注册以下命令：

| 文件类型 | 命令 | 说明 |
|----------|------|------|
| 文档（PDF/DOCX/EPUB/XLSX 等）| `neko.ai.summarizeDocument` | 提取文本 → AI 摘要 → 发送到 Chat |
| 文档 | `neko.ai.chatWithDocument` | 提取文本 → 注入 Agent 上下文 → 打开对话 |
| 文档 | `neko.pipeline.startFromFile` | 生成视频创意流水线（已有） |
| 图片（PNG/JPG/WEBP 等）| `neko.ai.analyzeImage` | 文件路径 → Agent 工具分析 |
| 图片 | `neko.ai.extractImageText` | OCR 提取图片文字 |
| 视频（MP4/MOV/MKV 等）| `neko.ai.analyzeVideo` | 文件路径 → Agent 工具分析 |
| 视频 | `neko.ai.generateSubtitles` | 生成字幕 → 发送到 Agent |

### 6.3 文档文本提取流程

```
explorer/context 右键
  └─ neko.ai.summarizeDocument / neko.ai.chatWithDocument
       └─ Extension Host
            ├─ DocumentReaderService.read(filePath)   # 已有，支持 16 种格式
            ├─ 文本截断（≤8000 chars，超长附 truncated 提示）
            └─ chatViewProvider.sendMessageToAssistant(prompt, true)
                 └─ Agent Chat Panel 打开并开始对话
```

`DocumentReaderService`（`services/DocumentReaderService.ts`）已支持所有目标格式，无需新增解析逻辑。

### 6.4 进度提示

文档读取通过 `vscode.window.withProgress` 显示通知级进度条，防止大文件无响应感。

---

## 七、约束与注意事项

**Webview 沙箱**：所有 JS 库必须在 Webview 内运行，文件读取通过 Extension Host postMessage 传递 `ArrayBuffer`。

**priority: option**：所有 customEditors 注册时使用 `"priority": "option"`，不抢占用户已安装扩展的默认处理器。

```jsonc
{
  "viewType": "neko.pdfPreview",
  "displayName": "Neko PDF Preview",
  "selector": [{ "filenamePattern": "*.pdf" }],
  "priority": "option"
}
```

**LibreOffice 依赖**：PPTX 策略 C 需用户本地安装 LibreOffice；未安装时降级显示「需安装 LibreOffice 以预览 PPTX」。

**缩略图缓存路径**：`.neko/thumbnails/` 目录，按 `<文件路径哈希>_<修改时间>.png` 命名。

**策略 D 提示去重**：同一会话内用户已选「取消」的格式，不再重复弹出通知（`Set<string>` 内存标记）。
