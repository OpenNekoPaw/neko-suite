# 媒体 Diff + LSP 技术文档

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [engine.md](./engine.md)
>
> **合并自**：`diff.md` · `lsp.md`

---

## 一、架构概览

### Diff 基础设施

```
VSCode Extension Host
├─ MediaDiffService (Facade)
│  ├─ GitMediaService (Git 版本获取)
│  └─ AnalyzerRegistry
│     ├─ ImageDiffAnalyzer
│     ├─ AudioDiffAnalyzer
│     ├─ VideoDiffAnalyzer
│     └─ TimelineDiffAnalyzer
├─ EngineMediaService (Adapter)
│  └─ vscode.commands → neko-engine
└─ MediaDiffMessageHandler (Webview 通信)

neko-engine (Rust)
├─ diff.rs (统一入口)
├─ audio_diff.rs (SNR/波形)
├─ video_diff.rs (FFmpeg SSIM/PSNR)
├─ image_diff.rs (SSIM/PSNR/热力图)
└─ timeline_diff.rs (JVI 结构对比)
```

通信链路：Webview ←postMessage→ Extension Host ←IPC→ Rust Engine ←CLI→ FFmpeg

### LSP 功能层（构建于 Diff 之上）

```
将"多媒体素材"视为"源代码"，将"Prompt/参数"视为"编译器指令"。

L1 - LSP Core (Rust)：物理算法基础诊断，响应时间 < 100ms，不启动 AI
L2 - LSP AI Extension：用户开启"深度分析"时，后台启动 ort（ONNX Runtime）
L3 - LSP Indexer：向量索引支持跨文件引用查找和相似素材推荐
```

---

## 二、Diff — 后端算法实现 (Rust)

<details>
<summary>✅ 已完成的优化（Phase 1-2B）</summary>

**Phase 1**：波形发送 bug 修复、进度报告、帧提取竞态修复  
**Phase 2**：EngineClient 迁移、音频波形并行调度、SSIM/PSNR 并行（30-50% 提速）  
**Phase 2.5**：ProgressOverlay 非阻塞化、消息队列 fire-and-forget  
**Phase 2.6**：Git Ref 切换停止旧流、早期波形取消机制  
**Phase 2.7**：视频对比帧率采样（`sample_fps` 参数），60 分钟视频 30s → 1-2s（15-30x 提升）  
**Phase 2.8**：时长不匹配自动优化（probe + endTime），120s vs 5s 视频 50s → 5s（10x 提升）  
**Phase 2B**：TimelineDiffViewer + 音频三轨波形（A/B/Diff）+ 视频 H264+PCM 双流 WebGL 渲染器（curtain/heatmap/flicker/side-by-side）+ DiffRegionOverlay + FramePairBuffer PTS 配对 + 波形 64x 缩放  
**Probe 冗余修复**：`lastDiffResult` 缓存 metadata，消除每次 streaming 启动时冗余的 2×probe（~400ms 节省/次）  
**Timeline Diff 范围 UI**：DiffControls 新增 TimeRangeControl + `mediaDiff:setTimeRange` 协议

</details>

### 2.1 音频 Diff (`audio_diff.rs`)

核心参数：对比采样率 48kHz Mono、分段窗口 100ms、差异阈值 SNR < 20dB、波形降采样 800 点。

```rust
AudioDiffOptions {
    start_time: Option<f64>,   // None = 从头开始
    end_time: Option<f64>,     // None = 到结尾
}

AudioContentDiff {
    snr: f64,                          // 整体信噪比 (dB)
    duration_a / duration_b: f64,
    diff_regions: Vec<AudioDiffRegion>,
    waveform_peaks_a / _b: Vec<f32>,   // 800 点
}
```

处理流程：FFmpeg 解码 → F32 Mono PCM 48kHz → 计算整体 SNR → 100ms 分段分析（SNR < 20dB 标记差异）→ 合并相邻区域 → 提取 800 点波形峰值。

### 2.2 视频 Diff (`video_diff.rs`)

基于 FFmpeg SSIM/PSNR filter，自动分辨率对齐（scale2ref），差异区域构建（SSIM < 0.95 连续帧合并，0.5s 间隔内合并）。

```bash
# 范围 diff 示例
ffmpeg -ss 10 -i A.mp4 -ss 10 -i B.mp4 -t 10 \
  -filter_complex "[1:v][0:v]scale2ref[scaled][ref];[ref][scaled]ssim=stats_file=/tmp/ssim.log" \
  -f null -
```

```rust
VideoDiffOptions {
    ssim_threshold: f64,          // 默认 0.95
    generate_diff_video: bool,
    include_audio: bool,
    start_time: Option<f64>,
    end_time: Option<f64>,
}
```

### 2.3 图像 Diff (`image_diff.rs`)

SSIM（8x8 块 RGB 三通道）+ PSNR（MSE → PSNR 转换）+ 像素差异统计 + 热力图（渐变色映射 → JPEG Base64）+ 分辨率自适应（Lanczos3 缩放对齐）。

### 2.4 Timeline Diff (`timeline_diff.rs`)

JVI (JSON Video Index) 结构对比，轨道级（Added/Removed/Modified），元素级（属性变更检测：src 路径、时间偏移等），支持懒加载内容 Diff。

---

## 三、Diff — 前端适配层 (TypeScript)

### 通信协议 (`mediaDiffProtocol.ts`)

**请求消息**：

| 类型 | 说明 |
|------|------|
| `mediaDiff:init` | Git 模式初始化（fileUri + ref） |
| `mediaDiff:initLocal` | 本地文件对比（currentUri + previousUri） |
| `mediaDiff:getFrame` | 视频帧提取（time + version） |
| `mediaDiff:streamControl` | 流控制（play/pause/seek） |
| `mediaDiff:audioStreamControl` | 音频流控制 |
| `mediaDiff:setTimeRange` | 设置时间范围并重新 diff |
| `mediaDiff:changeRef` | 切换 Git ref 并重新 diff |

**响应消息**：

| 类型 | 说明 |
|------|------|
| `mediaDiff:result` | Diff 结果（DiffResult） |
| `mediaDiff:progress` | 进度回调（progress + stage） |
| `mediaDiff:waveformData` | 音频波形（800点 × 2） |
| `mediaDiff:frameData` | 视频帧图像（JPEG ArrayBuffer） |
| `mediaDiff:streamConfig` | 视频双流配置（port + streamId × 2） |
| `mediaDiff:fetchState` | Git 拉取状态（`fetching`\|`ready`） |

### Webview 架构（React）

```
packages/neko-tools/packages/webview/
├── mediaDiff.html
└── src/
    ├── hooks/useMediaDiffProtocol.ts
    └── components/MediaDiff/
        ├── MediaDiffApp.tsx        # 状态管理 + GitRefSelector + ProgressOverlay
        ├── MediaDiffViewer.tsx     # 媒体类型分发器
        ├── DiffControls.tsx        # 模式切换 + 相似度 + 时间范围选择器
        ├── ImageDiffViewer.tsx     # side-by-side/slider/overlay/onion-skin
        ├── AudioDiffViewer.tsx     # 波形 Canvas 渲染
        ├── VideoDiffViewer.tsx     # H264+PCM 流 + WebGL
        └── TimelineDiffViewer.tsx  # 轨道/元素变更树
```

---

## 四、Diff — 视频渲染：H264+PCM 流 + WebGL

### 方案选型

| 维度 | A: 帧提取（已完成） | B: H264+PCM 流（推荐）| C: 直接文件访问 |
|------|------------------|---------------------|---------------|
| 流畅播放 | ❌ | ✅ 60fps 硬件解码 | ✅ 原生 |
| WebGL 对比 | ✅ JPEG→texture | ✅ VideoFrame→texture（零拷贝） | ⚠️ CSP tainted canvas |
| 格式兼容 | ✅ 任意（Rust 解码） | ✅ 任意（Rust 转码） | ⚠️ 仅浏览器支持格式 |
| Seek 精度 | ✅ 帧精确 | ✅ GOP=1 帧精确 | ⚠️ 受关键帧间隔影响 |

选择方案 B：流畅播放 + 精确对比兼得；VideoFrame 零拷贝进 WebGL；复用现有 `start_stream` 管线。

### 数据流

```
方案 A（7 次格式转换）：
  Rust: H264→NV12→RGBA→JPEG  JS: Base64→Buffer→ArrayBuffer→Blob→Image→WebGL Texture

方案 B（1 次格式转换）：
  Rust: Container→FFmpeg Decode→NV12→VideoToolbox H264 Encode→NALUs
  传输: WebSocket Binary（25B header + NAL data）
  JS:   NALUs→WebCodecs VideoDecoder→VideoFrame→WebGL Texture（零拷贝）
```

复用现有基础设施：`H264StreamClient`、`AudioStreamClient`、`FrameScheduler`、Rust `VideoService.start_stream()`（All-Intra, GOP=1）。

### WebGL Shader 模式

VideoFrame 直接作为 WebGL 纹理源（GPU 内直接传递）：

```javascript
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame);
videoFrame.close();
```

三种 Fragment Shader 模式：
- **Curtain**：`uv.x < sliderPos ? texture(A, uv) : texture(B, uv)`
- **Heatmap**：`abs(texture(A, uv) - texture(B, uv))` → 色谱映射
- **Flicker**：`requestAnimationFrame` 交替绑定 A/B 纹理

双流同步：FramePairBuffer 按 PTS 配对两路 VideoFrame，配对成功才触发 WebGL 渲染。

---

## 五、LSP 功能规划

### 5.1 单文件诊断（已实现）

9 个 JVI 诊断规则（`neko-tools/packages/extension/src/media-lsp/`）：

- `invalid-fps` / `invalid-resolution` / `duplicate-track-name` / `duplicate-element-id`
- `broken-element-link` / `empty-track` / `missing-media-ref` / `duration-mismatch` / `resolution-mismatch`

实现：`JviParser`（jsonc-parser AST + 位置信息）→ `JviDiagnosticAnalyzer`（9 条规则）→ `JviDiagnosticsProvider`（VSCode DiagnosticCollection + 300ms debounce）。

各媒体类型诊断能力规划：

| 媒体类型 | 诊断项 | 技术手段 | 是否需要 AI |
|---------|--------|---------|------------|
| 视频 | 黑场、掉帧、噪点 | FFmpeg SSIM/像素差值 | 否 |
| 音频 | 爆音、静音、相位抵消 | SNR/FFT 频率分析 | 否 |
| 图片 | 低分辨率、色彩断层、曝光异常 | 直方图/SSIM | 否 |
| Timeline | 轨道冲突、素材缺失、时长不匹配 | JVI 结构校验 | 否 |
| 剧本（Fountain）| 角色名拼写、场景编号、对话字数 | pest/nom 语法解析 | 否 |

### 5.2 符号与导航（已实现）

- `MediaWorkspaceIndex`：跨文件索引（`**/*.nkv` watcher + 媒体引用 + 元素 ID 派生索引）
- `JviDocumentSymbolProvider`：Outline 视图（Project → Track → Element 三级层次）
- `JviDefinitionProvider`：`src` → 打开媒体文件，`linkedId` → 跳转元素
- `JviReferenceProvider`：Find All References（查找引用相同媒体的所有 `.nkv` 位置）
- `JviHoverProvider`：悬停 `src` 值 → probe 元数据 Markdown 表格
- `MediaProbeCache`：TTL 缓存（60s）避免重复 probe

### 5.3 AI 增强 — 剧本语义搜索（已实现）

```
neko-story 扩展
    WorkspaceIndexService.getScriptIndex(uri)
        ▼
    ScriptIndex { scenes[], characters[], total_lines }
        │
        ├── GetScriptIndex 工具 ─── L1 精确查询（< 10ms）
        │       返回完整结构，Agent 用 line_start 调 Read()
        │
        └── SearchScriptIndex 工具 ─── L3 语义查询
                │
                ├─ ScriptEmbeddingIndex.ensureIndexed()
                │       首次：platform.embed(texts[]) → 缓存 number[][]
                │       命中：直接返回缓存（total_lines 为失效键）
                ├─ platform.embed([query])
                └─ cosineSimilarity → top-K → { scene_id, score, line_start, line_end }
```

**关键设计约束**：向量搜索返回值**必须携带 `line_start`**，才能衔接 Read 工具做精准读取。`ScriptEmbeddingIndex` 缓存 key 为 `uri`，失效条件为 `total_lines` 变化。

### 5.4 人物统一索引（已实现，Phase 3.1）

```
CharacterWorkspaceIndexService
  ├─ workspace-root characters.json 加载/热更新
  ├─ canonicalName / displayName / aliases / scriptNames
  └─ registry definition location

CreativeEntityWorkspaceIndexService
  ├─ CharacterWorkspaceIndexService（注册表身份层）
  ├─ WorkspaceIndexService（script 出现点层）
  └─ unified character definition / references / hover query

Fountain Providers
  ├─ Definition  → creative entity → registry first, script fallback
  ├─ References  → registry aliases aggregate script occurrences
  ├─ Rename      → registry-only identity rename（只修改 characters.json）
  ├─ Completion  → registry names + script names
  ├─ Hover       → registry metadata + local/cross-file stats
  └─ WorkspaceSymbol → registry symbols + script symbols
```

`NekoStoryAPI.getCharacterRegistry()` / `resolveCharacter()` 向跨扩展调用暴露统一人物身份层。

### 5.5 跨文件联动（规划中）

**剧本 ↔ 时间轴（Go to Definition）**：Whisper.cpp 音频转文字 → 与剧本模糊匹配 → ScriptLine → TimeRange 索引；在剧本中点击对白，Timeline 跳转到对应音视频片段。

**Prompt ↔ 素材（Find All References）**：CLIP Text-to-Image 相似度，将 Prompt 作为"变量名"，素材作为"实例值"。

**Timeline ↔ 物理素材（Rename）**：基于 JVI 结构解析，修改素材名称时同步重命名文件系统并更新所有引用。

---

## 六、AI 增强能力（diff.md §五 精华）

### 6.1 Timeline AI 分析

**时间轴对齐**：解决"剪辑错位"问题。CLIP 提取每帧特征向量 → DTW 建立非线性映射，自动识别"B 的 10s 对应 A 的 12s"，消除位移导致的假差异。

**视觉语义 Diff**：目标检测（YOLOv10）将"像素变化"升级为"物体消失/替换"；OCR/字幕对比（PaddleOCR）直接显示"字幕 A → 字幕 B"。

**音频语义 Diff**：ASR 文本比对（Whisper.cpp）精准标记"哪一秒改了台词"；Demucs 音频分轨，区分"换了配音"还是"背景音乐改了"。

### 6.2 AI 生成素材抽卡筛选

- **语义一致性自动剔除**：CLIP/DINOv2 提取帧特征 → 相邻帧语义距离，短时大幅波动 = 炸帧
- **Prompt-视频语义对齐**：CLIP 评分（Text Embedding vs Image Embedding 余弦相似度），"指令符合度曲线"低于 0.5 标记"跑题"
- **视觉聚类去重**：pHash（快速剔除冗余）+ K-Means（相似图折叠展示代表作）
- **负向特征拦截**：Grounding DINO 检测人体关键点异常（手臂 > 2 / 手指 > 5 → 标记 Defective）

### 6.3 推理框架选型

| 框架 | 特点 | 适用场景 |
|------|------|----------|
| ONNX Runtime (ort) | GPU 加速，模型丰富 | 首选方案 |
| Candle | HuggingFace 原生 Rust | 轻量模型/WASM |
| Tract | 纯 Rust，无 GPU | 简单特征提取 |

推荐：MobileCLIP 或 CLIP-ViT-B-32（ONNX），普通显卡甚至 CPU 即可秒级打分。

---

## 七、AI 模型需求分级

| 功能层级 | 技术手段 | 是否必须 AI |
|---------|---------|------------|
| 基础诊断 | 信号处理 / 像素比对 | 否 |
| 结构分析 | 特征提取 / 聚类 | 可选 |
| 语义服务 | CLIP / Whisper / YOLO | 是 |
| 质量评估 | VMAF / NIQE | 是 |

---

## 八、关键文件

| 文件 | 职责 |
|------|------|
| `neko-tools/extension/src/media-lsp/JviParser.ts` | jsonc-parser AST 解析 .nkv + 位置信息 |
| `neko-tools/extension/src/media-lsp/JviDiagnosticAnalyzer.ts` | 9 个诊断规则 |
| `neko-tools/extension/src/media-lsp/JviDiagnosticsProvider.ts` | VSCode DiagnosticCollection + 300ms debounce |
| `neko-tools/extension/src/media-lsp/JviHoverProvider.ts` | 悬停 src → probe 元数据 |
| `neko-tools/extension/src/media-lsp/MediaWorkspaceIndex.ts` | 跨文件索引 |
| `neko-story/extension/src/services/types.ts` | ScriptIndex / SceneEntry / CharacterEntry 类型 |
| `neko-story/extension/src/services/WorkspaceIndexService.ts` | getScriptIndex() 实现 |
| `neko-story/extension/src/services/CharacterWorkspaceIndexService.ts` | characters.json 加载/解析/符号查询 |
| `neko-story/extension/src/services/CreativeEntityWorkspaceIndexService.ts` | 统一组合注册表身份与 script occurrences |
| `neko-types/src/types/extension-api.ts` | NekoStoryAPI / getCharacterRegistry / resolveCharacter 跨扩展契约 |
| `neko-agent/extension/src/services/ScriptEmbeddingIndex.ts` | 内存向量缓存 + 余弦搜索 |
| `neko-agent/extension/src/tools/extensionTools.ts` | GetScriptIndex + SearchScriptIndex 工具注册 |

---

## 九、开发计划

### 已完成

- ✅ Phase 1：基础 Diff（音频/视频/图像/Timeline 分析器 + 通信协议）
- ✅ Phase 2A：Webview 统一（React webview 包 + useMediaDiffProtocol hook）
- ✅ Phase 2B：前端可视化增强（H264+PCM 流 + WebGL2 + DiffRegionOverlay + 波形缩放）
- ✅ Phase 2.7：视频关键帧智能采样（sample_fps，60min 视频 30s→1-2s）
- ✅ Phase 2.8：时长不匹配智能优化（自动范围裁剪，10x 提升）
- ✅ LSP Phase 1：基础诊断（JviParser + JviDiagnosticAnalyzer 9 规则 + 34 单元测试）
- ✅ LSP Phase 2：符号与导航（MediaWorkspaceIndex + Definition/Reference/Symbol Providers）
- ✅ LSP Phase 3：剧本语义搜索（ScriptEmbeddingIndex + GetScriptIndex + SearchScriptIndex）
- ✅ LSP Phase 3.1：人物统一索引（CharacterWorkspaceIndexService + CreativeEntityWorkspaceIndexService）

### 待开发

**Diff 后端增强**：
- [ ] P1 — 音频静音检测（`silenceRegions`）
- [ ] P2 — 高精度波形 zoom（按需加载，800 点 → 更多）
- [ ] P2 — 音频多声道对比
- [ ] P2 — 视频场景切换检测
- [ ] P2 — Engine 流式帧指标（渐进式 UI，> 10min 视频）

**AI 语义分析**：
- [ ] P1 — CLIP 语义评分器（Prompt-视频/图片对齐）
- [ ] P1 — Whisper ASR 文本 Diff（台词变更检测）
- [ ] P2 — Demucs 音频分轨（人声/背景音独立对比）
- [ ] P2 — 时间轴对齐 AI（DTW 消除剪辑错位）

**AI 抽卡筛选**：
- [ ] P1 — 批量 CLIP 评分 + 素材矩阵展示
- [ ] P1 — 语义一致性自动剔除（闪烁/形变检测）
- [ ] P2 — 视觉聚类去重（pHash + K-Means）

**LSP 跨文件联动**：
- [ ] 媒体语义增强（CLIP/Whisper Prompt 对齐、音频 Diff ASR）— 按需推进
