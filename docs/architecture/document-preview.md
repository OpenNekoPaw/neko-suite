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

## 五、实施方案

> **决策更新（2026-04-02）**：启动自建实现。核心需求：**用户在预览中选中文本/区域 → 发送到 AI 分析**。三方扩展为黑盒 Webview，无法获取用户选区，因此必须自建。

### 5.1 开发顺序

**PDF → CBZ → EPUB → DOCX**，其他格式（XLSX/PPTX/FDX/MOBI）放入 TODO。

### 5.2 共享基础设施（首先实现）

#### AgentContextType 扩展

`packages/neko-types/src/types/agent-context.ts` 添加 `'document-selection'`：

```typescript
export type AgentContextType =
  | 'canvas-node' | 'cut-clip' | 'story-selection'
  | 'sketch-layer' | 'model-scene' | 'audio-clip'
  | 'file' | 'image'
  | 'document-selection';  // NEW
```

#### 文档消息协议

新建 `packages/neko-preview/packages/extension/src/types/document-messages.ts`：

```typescript
// Extension → Webview
interface DocumentDataMessage {
  type: 'document:data';
  payload: { data: string; fileName: string; fileSize: number };  // base64
}

// Webview → Extension
interface DocumentReadyMessage { type: 'ready' }
interface DocumentSendToAiMessage {
  type: 'document:sendToAi';
  payload: {
    selectedText?: string;
    pageNumber?: number;
    chapterTitle?: string;
    imageDataUrl?: string;  // CBZ 区域截图
  };
}
```

#### Selection → AI 桥接（统一模式）

所有 Provider 共享同一处理逻辑（参考 `neko-story.sendToAgent` 模式）：

```typescript
// Extension 侧 onMessage handler（每个 Provider 共用）
case 'document:sendToAi': {
  const { selectedText, pageNumber, chapterTitle, imageDataUrl } = msg.payload;
  const label = `${fileName}${pageNumber ? ` p.${pageNumber}` : ''}${chapterTitle ? ` · ${chapterTitle}` : ''}`;
  const payload: AgentContextPayload = {
    type: 'document-selection',
    id: `doc:${filePath}:${pageNumber ?? 0}:${Date.now()}`,
    label,
    summary: selectedText?.slice(0, 400) ?? 'Image selection',
    data: { filePath, selectedText, pageNumber, chapterTitle, imageDataUrl },
    intent: selectedText ? '请分析这段内容：' : '请分析这张图片：',
  };
  await vscode.commands.executeCommand('neko.agent.sendContext', payload);
}
```

Webview 侧共享 `useDocumentSelection` hook：

1. 监听 `selectionchange` 事件，300ms 防抖
2. 非空选区 → 显示 `DocumentSelectionFab`（定位在选区附近）
3. 点击 FAB → `postMessage({ type: 'document:sendToAi', payload })`
4. 选区清空 → 隐藏 FAB

#### 构建配置变更

| 文件 | 变更 |
|------|------|
| `packages/neko-preview/packages/webview/vite.config.ts` | 新增 4 个入口：`pdf.html`, `cbz.html`, `epub.html`, `docx.html` + pdfjs Worker 复制插件 |
| `packages/neko-preview/packages/webview/tailwind.config.js` | content 添加 4 个 HTML 文件 |
| `packages/neko-preview/packages/extension/src/utils/html.ts` | entry 类型扩展 + PDF 入口 `worker-src blob:` CSP |
| `packages/neko-preview/packages/extension/src/extension.ts` | 注册 4 个 Provider（不依赖 PreviewService） |

#### Webview 新增依赖

`packages/neko-preview/packages/webview/package.json`：

```json
"pdfjs-dist": "^4.0.0",
"@zip.js/zip.js": "^2.7.0",
"epubjs": "^0.3.93",
"docx-preview": "^0.3.0"
```

#### package.json — customEditors 注册

`packages/neko-preview/package.json` 添加（`"priority": "option"` 不抢占默认打开方式）：

| viewType | filenamePattern | displayName |
|----------|----------------|-------------|
| `neko.pdfPreview` | `*.pdf` | Neko PDF Preview |
| `neko.cbzPreview` | `*.cbz` | Neko CBZ Preview |
| `neko.epubPreview` | `*.epub` | Neko EPUB Preview |
| `neko.docxPreview` | `*.{docx,doc}` | Neko DOCX Preview |

同步添加 4 个 `neko.preview.open*` 命令。

#### 共享 Webview 组件

新建 `packages/neko-preview/packages/webview/src/shared/`：

| 文件 | 职责 |
|------|------|
| `useDocumentSelection.ts` | Hook：监听 selectionchange，防抖，捕获文本选区 |
| `DocumentSelectionFab.tsx` | 浮动按钮：靠近选区显示 "Send to AI"，点击发 postMessage |
| `DocumentToolbar.tsx` | 通用工具栏：页码、缩放、适应宽度等通用控件 |

### 5.3 PDF 预览（P0）

**渲染库**：`pdfjs-dist` 5.x — 三层架构（Canvas + TextLayer + AnnotationLayer），文本可选中。

**新增文件**：

```
packages/neko-preview/packages/extension/src/providers/document/
  PdfPreviewProvider.ts

packages/neko-preview/packages/webview/
  pdf.html
  src/pdf/
    main.tsx
    PdfViewer.tsx        — pdfjs-dist 渲染 + 翻页 + 缩放
    PdfToolbar.tsx       — 页码导航、缩放、适应宽度/页面
```

**Provider 逻辑**：

```
openCustomDocument(uri) → { uri, dispose() }
resolveCustomEditor(doc, panel):
  1. webview.options = { enableScripts, localResourceRoots }
  2. webview.html = getWebviewHtml({ entry: 'pdf' })
  3. onMessage('ready') → fs.readFile → base64 → postMessage('document:data')
  4. onMessage('document:sendToAi') → AgentContextPayload → sendContext
```

**Webview 逻辑**：

```
document:data → base64 → Uint8Array → pdfjsLib.getDocument({ data })
→ 逐页 page.render() 到 <canvas> + TextLayer 覆盖（原生文本选择）
→ useDocumentSelection hook → 浮动 FAB
→ sendToAi({ selectedText, pageNumber })
```

**CSP**：`worker-src blob: ${cspSource}`，`workerSrc` 指向 `asWebviewUri(pdf.worker.min.mjs)`。

### 5.4 CBZ 预览（P0）

**渲染库**：`@zip.js/zip.js` (~100KB) — ZIP 解压 + `<img>` 展示。

**新增文件**：

```
packages/neko-preview/packages/extension/src/providers/document/
  CbzPreviewProvider.ts

packages/neko-preview/packages/webview/
  cbz.html
  src/cbz/
    main.tsx
    CbzViewer.tsx        — zip 解压 + 图片画廊 + 翻页
    CbzToolbar.tsx       — 页码、单页/双页模式
    CbzRegionSelect.tsx  — 框选区域（拖拽矩形 → canvas 截图）
```

**Webview 逻辑**：

```
document:data → base64 → Uint8Array → ZipReader
→ 过滤图片条目 → 自然排序 → 逐页 Blob URL（IntersectionObserver 懒加载）
→ 用户框选区域 → canvas.toDataURL() → imageDataUrl
→ sendToAi({ imageDataUrl, pageNumber }) → Vision 模型分析
```

**选区方式**：无文本层，走**区域截图**路径 — 用户拖拽画矩形 → FAB → 发送截图给 AI。也可整页发送（toolbar "Analyze Page" 按钮）。

### 5.5 EPUB 预览（P1）

**渲染库**：`epub.js` 0.3.x — DOM 渲染，原生文本可选。

**新增文件**：

```
packages/neko-preview/packages/extension/src/providers/document/
  EpubPreviewProvider.ts

packages/neko-preview/packages/webview/
  epub.html
  src/epub/
    main.tsx
    EpubViewer.tsx       — epub.js 渲染 + 导航
    EpubToolbar.tsx      — 章节导航、字号、主题
    EpubToc.tsx          — 目录侧栏
```

**Webview 逻辑**：

```
document:data → ArrayBuffer → ePub(data) → book.renderTo(container)
→ book.loaded.navigation → TOC 侧栏
→ epub.js 'selected' 事件 → 选中文本 + CFI 定位
→ useDocumentSelection → FAB → sendToAi({ selectedText, chapterTitle })
```

**主题**：`rendition.themes.register('dark', { body: { background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)' } })`

**CSP**：epub.js 内部用 iframe，CSP 需 `frame-src blob:`。已有 Book Reader 验证可行。

### 5.6 DOCX 预览（P1）

**渲染库**：`docx-preview` — 高保真 DOM 渲染（表格/图片/页眉/分页/修订标记）。

**新增文件**：

```
packages/neko-preview/packages/extension/src/providers/document/
  DocxPreviewProvider.ts

packages/neko-preview/packages/webview/
  docx.html
  src/docx/
    main.tsx
    DocxViewer.tsx        — docx-preview 渲染 + 缩放
    DocxToolbar.tsx       — 缩放、滚动位置指示
```

**Webview 逻辑**：

```
document:data → ArrayBuffer → renderAsync(data, container, styleContainer, {
  breakPages: true, ignoreWidth: false
})
→ 标准 HTML DOM → window.getSelection() 原生可用
→ useDocumentSelection → FAB → sendToAi({ selectedText, pageNumber })
```

无特殊 CSP 需求（纯 DOM 渲染）。

### 5.7 文件结构总览

```
packages/neko-preview/
├── package.json                          # +4 customEditors, +4 commands
├── packages/
│   ├── extension/src/
│   │   ├── extension.ts                  # +4 provider 注册
│   │   ├── providers/
│   │   │   ├── VideoPreviewProvider.ts   # 已有
│   │   │   ├── AudioPreviewProvider.ts   # 已有
│   │   │   └── document/                 # NEW
│   │   │       ├── PdfPreviewProvider.ts
│   │   │       ├── CbzPreviewProvider.ts
│   │   │       ├── EpubPreviewProvider.ts
│   │   │       └── DocxPreviewProvider.ts
│   │   ├── types/
│   │   │   ├── api.ts                    # 已有
│   │   │   └── document-messages.ts      # NEW
│   │   └── utils/
│   │       └── html.ts                   # 修改：扩展 entry 类型 + CSP
│   └── webview/
│       ├── package.json                  # +4 依赖
│       ├── vite.config.ts                # +4 入口 + worker 插件
│       ├── tailwind.config.js            # +4 html 文件
│       ├── pdf.html                      # NEW
│       ├── cbz.html                      # NEW
│       ├── epub.html                     # NEW
│       ├── docx.html                     # NEW
│       └── src/
│           ├── pdf/                      # NEW
│           │   ├── main.tsx
│           │   ├── PdfViewer.tsx
│           │   └── PdfToolbar.tsx
│           ├── cbz/                      # NEW
│           │   ├── main.tsx
│           │   ├── CbzViewer.tsx
│           │   ├── CbzToolbar.tsx
│           │   └── CbzRegionSelect.tsx
│           ├── epub/                     # NEW
│           │   ├── main.tsx
│           │   ├── EpubViewer.tsx
│           │   ├── EpubToolbar.tsx
│           │   └── EpubToc.tsx
│           ├── docx/                     # NEW
│           │   ├── main.tsx
│           │   ├── DocxViewer.tsx
│           │   └── DocxToolbar.tsx
│           ├── shared/
│           │   ├── useDocumentSelection.ts  # NEW
│           │   ├── DocumentSelectionFab.tsx  # NEW
│           │   ├── DocumentToolbar.tsx       # NEW
│           │   └── types.ts                 # 修改：+document 消息类型
│           └── i18n/locales/
│               ├── en.ts                    # 修改：+document 键
│               └── zh-cn.ts                 # 修改：+document 键
```

### 5.8 测试策略

**Extension 单元测试**（每个 Provider 一个文件）：

- Mock `vscode.window.registerCustomEditorProvider`
- Mock `fs.readFile` 返回测试 Buffer
- 验证 `openCustomDocument` → `{ uri, dispose }`
- 验证 `resolveCustomEditor` 设置正确 entry HTML
- 模拟 `ready` → 验证发送 `document:data`
- 模拟 `document:sendToAi` → 验证调用 `neko.agent.sendContext`

**构建验证**：

```bash
pnpm build    # 全量构建
pnpm test     # 单元测试
pnpm check    # Knip + dependency-cruiser
```

### 5.9 TODO：未来格式

| 格式 | 策略 | 渲染库 | 备注 |
|------|------|--------|------|
| **XLSX** | B: 自建 | x-data-spreadsheet + xlsx（短期）/ Univer（长期） | x-data-spreadsheet 已 3 年停维，长期需迁移 |
| **PPTX** | C: 引擎转换 | neko-engine → LibreOffice headless → PDF → pdfjs | 需用户安装 LibreOffice；无可靠纯 JS 方案 |
| **FDX** | A: 自建 | fast-xml-parser → styled HTML | Final Draft XML 结构简单，neko-story 场景 |
| **MOBI/AZW3** | D: 委托 | 提示安装 Book Reader 扩展 | 小众格式，自建 ROI 低 |
| **CBR** | D: 委托 | Node 端 node-unrar-js 已支持 AI 提取 | RAR WASM 解压复杂度高，Webview 端不自建 |
| **LaTeX** | 不支持 | LaTeX Workshop（6M+ 下载）已覆盖 | AI 分析可直接读 .tex 源码（纯文本） |

### 5.10 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| pdfjs Worker CSP 被阻止 | PDF 无法渲染 | workerSrc 指向 asWebviewUri 路径，已有扩展验证可行 |
| epub.js 嵌套 iframe 限制 | EPUB 渲染失败 | Book Reader 已验证可行；CSP 添加 frame-src blob: |
| 大文件内存溢出 | Webview 崩溃 | PDF 分页渲染（虚拟滚动），CBZ 懒加载（IntersectionObserver） |
| base64 传输大文件慢 | 打开卡顿 | 分块传输或使用 asWebviewUri 直接引用文件（需评估 CSP） |

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
