# 文档格式支持

NekoAgent 的 `ReadDocument` 用于把创作者已有资料转成 Agent 可继续处理的文本、结构和图片页路径。实现上使用扩展内部的 TypeScript/JavaScript/WASM 解析库，不要求创作者安装 Python、unzip、sips、unrar、7z 等命令行程序。

## 必须支持的格式

这些格式会出现在 VSCode 文档动作、素材库和 `ReadDocument` 工具链中，属于 P0 支持范围：

| 类型 | 格式 | 当前读取能力 |
| --- | --- | --- |
| 常规文档 | PDF | 读取文本、页数和元数据；支持按页范围读取 |
| Office 文档 | DOC/DOCX | 读取正文；DOCX 会提取内嵌图片到临时路径 |
| 演示文稿 | PPT/PPTX | 读取幻灯片文本；PPTX 会提取内嵌图片到临时路径 |
| 表格 | XLS/XLSX | 读取工作表数据；XLSX 会提取内嵌图片到临时路径 |
| 电子书 | EPUB | 读取章节文本；图像型漫画 EPUB 会提取页面图片到临时路径 |
| 漫画档案 | CBZ/CBR | 读取图片页，按阅读顺序返回临时图片路径 |
| 剧本 | FDX | 读取 Final Draft 场景、动作和对白 |
| 文本剧本 | TXT/Markdown/Fountain | 读取纯文本；Markdown 会识别本地图片引用 |
| 工具输入 | HTML/URL/JSON/YAML | 读取网页或结构化文本；HTML/URL 会识别图片引用 |

## 创作者可预期行为

- 图像型 EPUB、CBZ、CBR 会返回 `imagePaths`，这些路径是 Agent 后续视觉分析可直接读取的本地临时文件；同时返回 `imageInfo`，包含路径、宽高、MIME 类型、字节大小和可用的文档 locator。
- 文本型 EPUB、PDF、DOCX、FDX、Markdown 等会优先返回 `text`，并在可用时附带 `metadata`。
- 大文档优先使用 `mode: "manifest"` 查看结构，再用 `mode: "range"` 读取指定页、章节、幻灯片或文本范围。
- 如果 `mode: "range"` 没有传入 `range`，工具会基于 manifest 读取开头一段，图片数量受 `image_path_limit` 限制，避免创作者只想预览时误触发整本读取。
- `ReadDocument` 不负责直接读取单张 `.jpg/.png/.webp` 图片文件；图片分析应使用图像类工具。

## 图片能力边界

图片路径提取是按格式能力提供的：

| 格式 | 图片处理 |
| --- | --- |
| EPUB | 解析章节 HTML 中的图片引用，并从 EPUB 包内写出临时图片文件 |
| CBZ | 从 ZIP 包内按文件名自然排序写出临时图片文件 |
| CBR | 使用扩展内部 RAR/WASM 读取器写出临时图片文件 |
| DOCX/PPTX/XLSX | 从 Office Open XML 包的 media 目录写出内嵌图片 |
| HTML/Markdown/URL | 返回文档中出现的图片引用 |
| PDF | 当前读取文本层；扫描版或纯图片 PDF 需要后续接入渲染/OCR 后端 |

图片基础元数据由内部 TypeScript 头部解析器生成，覆盖 JPEG、PNG、WebP、GIF、BMP。Skill 应直接使用 `ReadDocument.imageInfo` 判断分辨率、页比例和格式，不应调用 Python/PIL、系统 `file`、`sips`、`identify` 等外部命令补探测。

## 结构化读取

`ReadDocument` 保留全文读取模式，也支持结构化模式：

```typescript
await readDocument({ file_path: '/path/to/book.epub', mode: 'manifest' });

await readDocument({
  file_path: '/path/to/book.epub',
  mode: 'range',
  range: { locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 } },
  image_path_limit: 10,
});

await readDocument({ file_path: '/path/to/book.epub', mode: 'next', cursor });
```

预览面板传入的 `DocumentSourceRef`、`DocumentLocator` 和 excerpt 可以让 Agent 从同一页、同一章或同一条目继续，而不是重新读取并截断整个文件。

## 法律与版权边界

NekoAgent 只处理 DRM-free 内容：

- DRM 保护的 EPUB/PDF 会被拒绝。
- 用户必须拥有文件的合法使用权。
- 本工具只做本地处理，不分发内容，不绕过 DRM。
- 不支持盗版内容、未授权分发或规避版权限制的用途。

## 已知限制

- 超大文件可能带来性能压力，优先用 manifest/range 分段读取。
- 复杂 PDF 版式可能只得到文本层结果；扫描版 PDF 没有 OCR 文本时暂不能提取正文。
- 密码保护文件不支持。
- 临时图片文件写入系统临时目录，例如 `os.tmpdir()/neko_epub_*`、`neko_cbz_*`、`neko_cbr_*`。

## 开发者实现说明

- 格式解析集中在 `@neko/platform/document`，Extension 工具层只负责参数、schema 和结果适配。
- 运行时依赖通过 `DocumentReaderRuntimeDeps.loadModule()` 注入，保持平台层可测试，不直接依赖 VSCode API。
- 不通过 shell 调用外部解析程序；禁止把 Python、系统 `unzip`、`sips`、`unrar` 等命令作为生产读取路径。
- 新增格式时先扩展共享契约和 manifest/range 能力，再补具体解析器和单元测试。

当前内部库包括 `pdf-parse`、`mammoth`、`officeparser`、`epub2`、`adm-zip`、`node-unrar-js`、`node-fetch`、`cheerio`、`xlsx`、`fast-xml-parser`。这些是扩展构建依赖，不应出现在创作者操作说明里。

## 相关工作流

- Document -> Script -> Video：读取文档文本，生成剧本，再转换为视频时间线。
- Comic -> Storyboard -> Video：读取漫画页图片，做视觉分析，再生成分镜和视频。

参考：

- [Agent 统一工作流](../../docs/architecture/agent-unified-workflow.md)
- [Agent 媒体资产架构](../../docs/architecture/agent-media-architecture.md)
