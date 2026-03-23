# 媒体 LSP 功能规划

> 将"多媒体素材"视为"源代码"，将"Prompt/参数"视为"编译器指令"，通过 LSP 协议提供诊断、跳转、预览等能力。

## 现状：已实现的媒体 Diff 基础设施

当前项目已具备完整的媒体 Diff 系统，这是 LSP 功能的核心基础：

### 架构概览

```
Webview (React) ←postMessage→ Extension Host (TS) ←vscode.commands→ Rust Engine ←CLI→ FFmpeg
```

### 已实现的分析器

| 分析器 | 媒体类型 | 核心算法 |
|--------|---------|---------|
| AudioDiffAnalyzer | mp3/wav/ogg/flac/aac/m4a | SNR (100ms窗口) + 波形提取 (800点) |
| VideoDiffAnalyzer | mp4/mov/avi/mkv/webm/m4v | FFmpeg SSIM/PSNR + 差异区域合并 |
| ImageDiffAnalyzer | png/jpg/gif/webp/bmp/svg | SSIM/PSNR + 像素差异热力图 |
| TimelineDiffAnalyzer | jvi | JSON 结构对比 (轨道/元素级) |

### 已实现的能力

- Git 集成：自动检测媒体文件变更，支持 ref 对比
- Custom Editor：VSCode 自定义编辑器 (`neko.mediaDiff`)
- Webview 通信协议：InitDiff / DiffResult / Progress / Waveform / Frame
- Rust 原生高性能算法：FFmpeg SSIM/PSNR/SNR

## LSP 功能规划

### 1. 单文件诊断 (Diagnostics)

将媒体文件的"技术问题"映射为 LSP 诊断信息，在时间轴或滚动条上显示红色/黄色标记。

| 媒体类型 | 诊断项 | 技术手段 | 是否需要 AI |
|---------|--------|---------|------------|
| 视频 | 黑场、掉帧、噪点 | FFmpeg SSIM/像素差值 | 否 |
| 音频 | 爆音、静音、相位抵消 | SNR/FFT 频率分析 | 否 |
| 图片 | 低分辨率、色彩断层、曝光异常 | 直方图/SSIM | 否 |
| Timeline | 轨道冲突、素材缺失、时长不匹配 | JVI 结构校验 | 否 |
| 剧本 (Fountain) | 角色名拼写、场景编号、对话字数 | pest/nom 语法解析 | 否 |

基础诊断完全基于信号处理，不依赖 AI，可在 Rust 侧用现有 FFmpeg 管线实现。

### 2. 悬停预览 (Hover)

鼠标悬停时返回素材的元数据和 Diff 增量：

- 图片/视频：EXIF 信息、Prompt 参数、与上一版的 SSIM 差异
- 音频：采样率、时长、SNR、波形缩略图
- Timeline 元素：关联的物理素材路径、变更历史

### 3. 符号定义 (Symbol Definition)

将媒体内容结构化为可索引的符号：

- 视频：场景 (按关键帧分割)、音轨
- 音频：片段 (按静音分割)、人声/背景音区域
- 图片：主体区域 (需 AI)
- Timeline：轨道、元素、属性节点

### 4. 跨文件联动

这是 LSP 的核心价值——通过全局索引打通所有素材。

**A. 剧本 ↔ 时间轴 (Go to Definition)**

在剧本中点击一行对白，Timeline 跳转到对应的音频/视频片段。

实现路径：Whisper.cpp (Rust) 音频转文字 → 与剧本模糊匹配 → 建立 ScriptLine → TimeRange 索引。

**B. Prompt ↔ 素材 (Find All References)**

在剧本的视觉描述上查找所有符合该描述的 AI 生成素材。

实现路径：CLIP Text-to-Image 相似度计算，将 Prompt 作为"变量名"，素材作为"实例值"。需要 AI。

**C. Timeline ↔ 物理素材 (Rename)**

在 Timeline 修改素材名称，底层文件系统同步重命名，并更新所有引用。

实现路径：基于现有 TimelineDiffAnalyzer 的 JVI 结构解析，纯逻辑实现。

## AI 模型需求分级

| 功能层级 | 技术手段 | 是否必须 AI | 典型场景 |
|---------|---------|------------|---------|
| 基础诊断 | 信号处理 / 像素比对 | 否 | 掉帧、黑屏、爆音检测 |
| 结构分析 | 特征提取 / 聚类 | 可选 | 素材去重、相似图片分组 |
| 语义服务 | CLIP / Whisper / YOLO | 是 | Prompt 对齐、内容搜索、自动打标 |
| 质量评估 | VMAF / NIQE | 是 | AI 生成素材"自然度"评分 |

结论：技术规格校验用现有 Rust 算法即可；内容语义理解必须引入 AI。

## 实现策略：异步分层

为保证 LSP 响应速度，采取分层架构：

```
L1 - LSP Core (Rust)
    物理算法提供基础诊断 (剪辑错位/静音/格式错误)
    不启动 AI，响应时间 < 100ms

L2 - LSP AI Extension (Plugin)
    用户开启"深度分析"时，后台启动 ort (ONNX Runtime)
    语义识别、内容搜索、Prompt 对齐
    异步返回结果，不阻塞基础功能

L3 - LSP Indexer
    向量数据库 (Qdrant 本地版) 为素材建立语义索引
    支持跨文件引用查找和相似素材推荐
```

## 实现路线图

### Phase 1：基础诊断 ✅ 已完成

- [x] JviParser — jsonc-parser AST 解析 .nkv 文件，带位置信息
- [x] JviDiagnosticAnalyzer — 9 个诊断规则（结构检查 + 引用检查）
  - `invalid-fps` / `invalid-resolution` / `duplicate-track-name` / `duplicate-element-id`
  - `broken-element-link` / `empty-track` / `missing-media-ref` / `duration-mismatch` / `resolution-mismatch`
- [x] JviDiagnosticsProvider — VSCode DiagnosticCollection + 300ms debounce
- [x] JviHoverProvider — 悬停 `src` 值 → probe 元数据 Markdown 表格
- [x] MediaProbeCache — TTL 缓存（60s）避免重复 probe
- [x] 34 个单元测试（JviParser 16 + JviDiagnosticAnalyzer 12 + MediaProbeCache 6）

涉及文件：`packages/neko-tools/packages/extension/src/media-lsp/`

### Phase 2：符号与导航 ✅ 已完成

- [x] MediaWorkspaceIndex — 跨文件索引（`**/*.nkv` watcher + 媒体引用 + 元素 ID 派生索引）
- [x] JviDocumentSymbolProvider — Outline 视图（Project → Track → Element 三级层次）
- [x] JviDefinitionProvider — `src` → 打开媒体文件，`linkedId` → 跳转元素
- [x] JviReferenceProvider — Find All References（查找引用相同媒体的所有 .nkv 位置）
- [x] 集成入 extension.ts（共享 EngineMediaService + initializeMediaLsp）
- [x] package.json 注册 `.nkv` 语言（`nekotools-jvi`）+ language-configuration.json

### Phase 3：AI 增强

- 集成 ort (ONNX Runtime) 加载 CLIP/Whisper
- 实现语义搜索和 Prompt 对齐评分
- 实现 Completion Provider (基于风格推荐 Prompt)

## 技术选型

| 组件 | 推荐方案 | 备注 |
|------|---------|------|
| LSP Server | Rust `tower-lsp` 或 Node.js `vscode-languageserver` | 考虑与现有 Rust Engine 复用 |
| 语法解析 | pest / nom (Rust) | Fountain 剧本解析 |
| 信号处理 | FFmpeg (已集成) | 音视频基础诊断 |
| 语义模型 | ort (ONNX Runtime) | CLIP / Whisper / YOLO |
| 向量索引 | Qdrant (本地嵌入式) | 素材语义检索 |
