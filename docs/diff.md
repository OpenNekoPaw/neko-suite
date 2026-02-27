# 音视频 Diff 技术文档

## 一、架构概览

```
VSCode Extension Host
├─ MediaDiffService (Facade)
│  ├─ GitMediaService (Git 版本获取)
│  └─ AnalyzerRegistry (分析器注册表)
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

通信链路: Webview ←postMessage→ Extension Host ←IPC→ Rust Engine ←CLI→ FFmpeg

设计模式:

| 模式 | 应用 |
|------|------|
| Facade | MediaDiffService 统一入口 |
| Adapter | EngineMediaService 适配 Rust 引擎 |
| Strategy | IMediaDiffAnalyzer 不同媒体类型策略 |
| Registry | AnalyzerRegistry 动态注册分析器 |

---

## 二、后端算法实现 (Rust)

### 2.1 音频 Diff (`audio_diff.rs`)

核心参数:
- 对比采样率: 48kHz Mono (统一基准)
- 分段窗口: 100ms
- 差异阈值: SNR < 20dB
- 波形降采样: 800 个峰值点

处理流程:
1. FFmpeg 解码两个音频文件 → F32 Mono PCM (48kHz)
2. 计算整体 SNR: `10 * log10(signal_power / noise_power)`
3. 100ms 分段分析，SNR < 20dB 的段标记为差异
4. 合并相邻差异区域
5. 提取波形峰值 (降采样到 800 点传给前端)
6. 时长不一致时，自动补充尾部差异区域

数据结构:

```rust
AudioContentDiff {
    snr: f64,                          // 整体信噪比 (dB)
    duration_a / duration_b: f64,      // 时长
    compare_sample_rate: u32,          // 48000
    total_samples: u64,
    diff_segment_count / total_segments: usize,
    diff_percent: f64,
    diff_regions: Vec<AudioDiffRegion>,  // 差异区域列表
    waveform_peaks_a / _b: Vec<f32>,    // 波形峰值 (800点)
}

AudioDiffRegion {
    start / end: f64,   // 时间 (秒)
    snr: f64,           // 区域 SNR
    rms_diff: f64,      // RMS 差异
}
```

### 2.2 视频 Diff (`video_diff.rs`)

基于 FFmpeg 的 SSIM/PSNR filter 实现逐帧对比:

1. FFmpeg SSIM filter: `[1:v][0:v]scale2ref=flags=bicubic[scaled][ref];[ref][scaled]ssim`
2. FFmpeg PSNR filter: 同上结构，替换为 psnr filter
3. 自动分辨率对齐: scale2ref 将 B 缩放到 A 的分辨率
4. 合并 SSIM + PSNR 逐帧数据
5. 差异区域构建: SSIM < 0.95 的连续帧合并 (0.5s 间隔内合并)
6. 可选: 生成差异视频 (blend=difference)
7. 可选: 同时执行音频 Diff

数据结构:

```rust
VideoContentDiff {
    // 全局指标
    avg_ssim / min_ssim: f64,
    avg_psnr / min_psnr: f64,
    // 元数据
    duration_a / _b, fps_a / _b: f64,
    width_a / height_a, width_b / height_b: u32,
    // 帧级分析
    total_frames_compared / diff_frame_count: u64,
    diff_frame_percent: f64,
    frame_metrics: Vec<FrameMetric>,     // 每帧 SSIM/PSNR
    diff_regions: Vec<VideoDiffRegion>,  // 差异区域
    // 可选
    audio_diff: Option<AudioContentDiff>,
    diff_video_path: Option<String>,
}

FrameMetric { frame: u64, timestamp: f64, ssim: f64, psnr: f64 }

VideoDiffRegion {
    start / end: f64,
    avg_ssim / min_ssim: f64,
    frame_count: u64,
}
```

### 2.3 图像 Diff (`image_diff.rs`)

- SSIM: 8x8 块 RGB 三通道计算
- PSNR: MSE → PSNR 转换
- 像素差异统计: 阈值过滤后计数
- 热力图: 渐变色映射 → JPEG Base64 输出
- 分辨率自适应: Lanczos3 缩放对齐

### 2.4 Timeline Diff (`timeline_diff.rs`)

- JVI (JSON Video Index) 结构对比
- 轨道级: Added / Removed / Modified
- 元素级: 属性变更检测 (src 路径、时间偏移等)
- 支持懒加载内容 Diff (按需对比媒体文件)

---

## 三、前端适配层 (TypeScript)

### 3.1 音频 (`AudioDiffAnalyzer.ts`)

- SNR → 相似度转换: `min(1, snr / 60)` (60dB+ 视为基本相同)
- 时长差异惩罚: `similarity *= 1 - (durationDiff / maxDuration) * 0.5`
- 波形数据通过 `mediaDiff:waveformData` 消息传给 Webview

### 3.2 视频 (`VideoDiffAnalyzer.ts`)

- 帧指标 → KeyframeDiff 映射: `{ time: timestamp, similarity: ssim }`
- 相似度基于 avgSsim，附加惩罚:
  - 时长差异: `similarity *= 1 - (durationDiff / maxDuration) * 0.3`
  - 分辨率差异: `similarity *= 0.9`
- 帧提取通过 `neko.engine.extractFrame` 命令

### 3.3 通信协议 (`mediaDiffProtocol.ts`)

请求消息:

| 类型 | 说明 |
|------|------|
| `mediaDiff:init` | Git 模式初始化 (fileUri + ref) |
| `mediaDiff:initLocal` | 本地文件对比 (currentUri + previousUri) |
| `mediaDiff:getFrame` | 视频帧提取 (time + version) |

响应消息:

| 类型 | 说明 |
|------|------|
| `mediaDiff:result` | Diff 结果 (DiffResult) |
| `mediaDiff:progress` | 进度回调 (progress + stage) |
| `mediaDiff:waveformData` | 音频波形 (800点 × 2) |
| `mediaDiff:frameData` | 视频帧图像 (JPEG ArrayBuffer) |

---

## 四、前端渲染方案 (Webview)

### 4.0 Webview 架构 (React)

neko-tools 使用独立的 React webview 包 (`packages/neko-tools/packages/webview/`)，替代了原先内联 vanilla JS。

技术栈: React 18 + Vite + Tailwind CSS + postMessage IPC

```
packages/neko-tools/packages/webview/
├── mediaDiff.html                          # Vite 入口
├── vite.config.ts                          # base './', single entry
└── src/
    ├── mediaDiff.tsx                        # ReactDOM.createRoot
    ├── hooks/useMediaDiffProtocol.ts        # Extension↔Webview IPC 核心 hook
    ├── styles/index.css                     # Tailwind directives
    └── components/MediaDiff/
        ├── types.ts                         # 组件 Props 类型
        ├── MediaDiffApp.tsx                 # 顶层组件 (状态管理 + GitRefSelector + ProgressOverlay)
        ├── MediaDiffViewer.tsx              # 媒体类型分发器
        ├── DiffControls.tsx                 # 模式切换 + 相似度显示
        ├── ImageDiffViewer.tsx              # side-by-side/slider/overlay/onion-skin
        ├── AudioDiffViewer.tsx              # 波形 Canvas 渲染
        ├── VideoDiffViewer.tsx              # 帧图片模式 (Blob URL from engine)
        └── TimelineDiffViewer.tsx           # 轨道/元素变更树 (TODO)
```

数据流:
```
Extension Host                          Webview (React)
MediaDiffMessageHandler                 useMediaDiffProtocol hook
  │                                       │
  │── mediaDiff:progress ──────────────→  setState(progress)
  │── mediaDiff:result ────────────────→  setState(diffResult)
  │── mediaDiff:imageData (ArrayBuffer) → URL.createObjectURL → Blob URL
  │── mediaDiff:waveformData ──────────→  setState(waveform[])
  │── mediaDiff:frameData (ArrayBuffer) → URL.createObjectURL → Blob URL
  │                                       │
  │←── mediaDiff:init ─────────────────── sendInit()
  │←── mediaDiff:getFrame ─────────────── sendGetFrame(time, version)
  │←── mediaDiff:changeRef ────────────── sendChangeRef(ref)
```

构建链路:
```
pnpm build → turbo → @neko-tools/webview#build (vite) → dist/assets/mediaDiff.js + style.css
           → neko-tools#compile → compile:extension (esbuild) + copy:webview
           → 最终: dist/webview/assets/mediaDiff.js + style.css
```

MediaDiffEditorProvider.getHtmlForWebview() 仅生成 ~15 行 HTML shell，通过 `window.initialState` 注入配置，加载 React bundle。

### 4.1 视频对比: 帧图片模式 + WebGL 渲染器 (TODO)

当前实现: Extension 通过 `neko.engine.extractFrame` 提取 JPEG 帧 → ArrayBuffer → Blob URL → `<img>` 渲染。支持 side-by-side 和 slider 模式。

计划增强 (WebGL):
- 帧数据 (JPEG Blob URL) → Canvas `drawImage` → WebGL 纹理
- Fragment Shader 三种模式:
  - Curtain: `uv.x < sliderPos ? textureA : textureB`
  - Heatmap: `abs(colorA - colorB)` → 色谱映射
  - Flicker: `requestAnimationFrame` 交替 A/B

### 4.2 音频对比: Canvas 波形 + 三轨增强 (TODO)

当前实现: Canvas 绘制 A/B 两轨波形 (800 点峰值)，支持 side-by-side 和 overlay 模式。

计划增强 (三轨):
```
┌─────────────────────────────────┐
│  A Track (Previous) — 红色       │
├─────────────────────────────────┤
│  B Track (Current) — 绿色       │
├─────────────────────────────────┤
│  Diff Track (|A-B|) — 黄色      │
│  差异区域半透明红色背景高亮       │
└─────────────────────────────────┘
```

### 4.3 AI 结果可视化: SVG 矢量层

AI 语义信息叠加在视频层之上:
- 目标框 (Bounding Box): SVG 或 Canvas 2D 叠加，AI 发现新增物体时用闪烁红框标记
- 文本 Diff 面板: monaco-editor Diff 模式展示 Whisper 识别的对白差异
- 关联跳转: 点击差异文字 → postMessage 通知 Extension Host → 驱动视频跳转到指定时间

### 4.4 Timeline 可视化对比 (TODO)

TimelineDiffViewer 组件:
- Summary 统计 (tracks added/removed/modified, elements added/removed/modified)
- Track 变更列表 (可折叠，按 changeType 分组)
- Element 变更 (带缩略图懒加载 via `mediaDiff:inspectElement`)

未来增强 — 多轨道布局 (参考 Premiere/Resolve):

```
┌─────────────────────────────────────────────────┐
│  Global Minimap (全局鸟瞰图)                      │
│  ▓▓░░░▓▓▓░░░░▓░░░░░░▓▓▓▓░░░░░░░░▓▓░░          │
├─────────────────────────────────────────────────┤
│  Video Diff Track   ── 像素级变化强度曲线         │
│  Audio Diff Track   ── A-B 波形差值 / 分轨差异    │
│  AI Metadata Track  ── 文本差异 / 物体变动标记     │
├─────────────────────────────────────────────────┤
│  Annotation Layer (SVG 标记层)                    │
│  ● 冲突点标记，密集时聚合为带数字的气泡            │
└─────────────────────────────────────────────────┘
```

交互设计:

| 交互 | 视觉响应 | 解决的问题 |
|------|----------|-----------|
| Hover 差异点 | Popover 显示 A/B 帧缩略图 | 无需跳转即可快速预览 |
| Range Select | 高亮选区，A/B 循环交替播放 | 细节差异对比 |
| Sync Scroll | 双轨道同步滚动 | 音画同步检查 |
| Filter | 勾选"仅显示人声差异"等 | 过滤无意义的背景噪音干扰 |

---

## 五、AI 增强能力

### 5.1 Timeline AI 分析

AI 将"原始像素/采样对比"升级为"语义事件比对"，在 Timeline 上自动生成具有理解力的标签。

时间轴对齐 (Temporal Alignment):
- 解决"剪辑错位"问题 — 视频 B 中间多插了片段导致后续全部飘红
- 算法: CLIP 提取每帧特征向量 → 动态时间规整 (DTW) 建立非线性映射
- Timeline 体现: 自动识别"视频 B 的 10s 对应视频 A 的 12s"，消除位移导致的假差异

视觉语义 Diff:
- 目标检测 (YOLOv10): 标注从"像素变化"变为"物体消失/替换"
- OCR / 字幕对比 (PaddleOCR): Timeline 直接显示"字幕 A → 字幕 B"，标记拼写/翻译不一致

音频语义 Diff:
- ASR 文本比对 (Whisper.cpp): 转文字后 Text Diff，精准标记"哪一秒改了台词"
- 声纹/背景音分离 (Demucs): 分离人声和背景音乐，区分"换了配音"还是"背景音乐也改了"

异常检测与质量评估 (QA):
- 黑场/静音/冻结帧检测: 轻量级 CNN 识别视频故障
- 无参考质量评估 (No-Reference VQA): 无需原片即可判断压缩伪影/噪点，Timeline 标记"画质风险区"

### 5.2 AI 生成视频抽卡筛选

AI 视频生成 (Sora/Kling/Runway) 需要大量人工抽卡，Diff 插件可从"被动对比"转变为"主动筛选器"。

语义一致性自动剔除 (Consistency Diff):
- 算法: CLIP/DINOv2 提取帧特征 → 计算相邻帧语义距离
- 筛选逻辑: 短时间内特征向量大幅波动 = 炸帧/物体崩坏
- Timeline 体现: 自动标记"崩溃点"，波动率超阈值的候选视频直接过滤

Prompt-视频语义对齐:
- CLIP 评分: Prompt → Text Embedding，视频帧 → Image Embedding，计算余弦相似度
- Timeline 展示"指令符合度曲线"，低于 0.5 = 画面"跑题"
- 目标锚点校验 (Grounding DINO): 处理数量/位置关系的 Prompt，自动检测缺失或错位
- 负向 Prompt 过滤: Negative Prompt 向量化，与负向描述重合的帧用红色阴影覆盖

参考图相似度评分 (Image-to-Video):
- 参考原图作为 A，视频每帧作为 B
- 计算 SSIM 或 LPIPS，自动打分排序，只推送最像原图的 Top N

反向 Prompt 生成:
- 多模态大模型 (Llava) 对优质素材进行 Video Captioning
- 对比"用户写的 Prompt" vs "AI 看到的内容"，建议修改 Prompt

自动化筛选流水线:
```
批量导入 (Rust 并发读取生成目录)
  → CLIP 语义评分 + Grounding DINO 目标检测 (ort 异步推理)
    → WebView 素材矩阵展示
       绿色: 动作流畅、物体稳定 (推荐)
       黄色: 部分帧跑题 (需人工确认)
       红色: 闪烁/形变/内容不符 (自动过滤)
```

### 5.3 AI 绘画抽卡筛选

AI 绘画 (Midjourney/Stable Diffusion) 抽卡面临海量、同质化、随机性问题。

语义对齐评分 (CLIP-Score):
- ort 加载 CLIP-ViT 模型，Prompt → Text Embedding，图片 → Image Embedding
- 计算余弦相似度，WebView 按评分排序，低于 60 分自动标记"建议舍弃"

反向提示词比对 (Reverse Interrogator):
- BLIP/DeepDanbooru 对生成图片进行反向标签提取
- WebView 展示标签云对比: Input Prompts vs Detected Tags
- 差异高亮: 用户写 `long hair` 但 AI 识别出 `short hair` → 标红

视觉聚类与去重:
- 感知哈希 (pHash): 快速剔除镜像或极度相似的冗余图
- 特征聚类 (K-Means): 根据特征向量分组，相似图折叠只展示代表作
- 差异热力图: 选中两张相似图时 WebGL Shader 展示 SSIM 像素级差异

负向特征拦截:
- 定义"坏图特征库" (多头/多肢体/画面崩坏)
- Grounding DINO 定位人体关键点，检测到"手臂 > 2"或"手指 > 5" → 标记 Defective

交互设计 ("Tinder for Prompts"):
- 左滑/右滑快速标记喜欢/不喜欢
- 点击满意图片 → 自动提取特征 → 反推 Prompt 权重建议
- JuxtaposeJS 风格滑块: 原图与 Img2Img 变体之间滑动对比

### 5.4 推理框架选型

| 框架 | 特点 | 适用场景 |
|------|------|----------|
| ONNX Runtime (ort) | GPU 加速，模型丰富 | 首选方案 |
| Candle | HuggingFace 原生 Rust | 轻量模型/WASM |
| Tract | 纯 Rust，无 GPU | 简单��征提取 |

推荐模型: MobileCLIP 或 CLIP-ViT-B-32 (ONNX)，普通显卡甚至 CPU 即可秒级打分

---

## 六、开发计划

### Phase 1: 基础 Diff 完善 (已完成)

- [x] 音频: FFmpeg 解码、SNR 计算、100ms 分段分析、差异区域检测与合并、波形峰值提取
- [x] 视频: FFmpeg SSIM/PSNR、分辨率自适应、帧级指标、差异区域构建、差异视频生成
- [x] 图像: SSIM/PSNR、像素差异统计、热力图生成
- [x] Timeline: JVI 结构对比、轨道/元素级变更检测
- [x] 通信协议: mediaDiffProtocol 请求/响应消息定义

### Phase 2A: Webview 统一 (已完成)

- [x] React webview 包骨架 (Vite + Tailwind + postMessage IPC)
- [x] useMediaDiffProtocol hook (ArrayBuffer→BlobURL, 消息收发)
- [x] 展示组件: ImageDiffViewer / AudioDiffViewer / VideoDiffViewer / DiffControls
- [x] MediaDiffApp 顶层组件 (GitRefSelector + ProgressOverlay)
- [x] MediaDiffEditorProvider 重写 (1939→293 行 HTML shell)
- [x] 构建链路: turbo + vite + esbuild + copy:webview

### Phase 2B: 前端可视化增强 (进行中)

- [ ] P0 — TimelineDiffViewer 组件 (Summary + Track/Element 变更树)
- [ ] P0 — 音频三轨波形 (A/B/Diff 轨 + 差异区域高亮)
- [ ] P0 — 视频帧 WebGL 渲染器 (curtain/heatmap/flicker)
- [ ] P1 — 差异区域时间轴高亮 (DiffRegionOverlay)
- [ ] P1 — Timeline 多轨道布局 + 全局鸟瞰图
- [ ] P2 — 波形缩放与视频帧同步跳转

### Phase 3: 后端算法增强

- [ ] P1 — 音频静音检测 (Protocol 已定义 `silenceRegions`)
- [ ] P1 — 视频关键帧智能采样 (长视频性能优化)
- [ ] P2 — 音频频谱分析 (频域对比)
- [ ] P2 — 音频响度归一化 (BS.1770 标准)
- [ ] P2 — 音频多声道对比
- [ ] P2 — 视频场景切换检测

### Phase 4: AI 增强 — 语义分析

- [ ] P1 — CLIP 语义评分器 (Prompt-视频/图片对齐)
- [ ] P1 — Whisper ASR 文本 Diff (台词变更检测)
- [ ] P2 — Demucs 音频分轨 (人声/背景音独立对比)
- [ ] P2 — Grounding DINO 目标锚点校验
- [ ] P2 — 时间轴对齐 AI (DTW 消除剪辑错位)

### Phase 5: AI 增强 — 抽卡筛选

- [ ] P1 — 批量 CLIP 评分 + 素材矩阵展示
- [ ] P1 — 语义一致性自动剔除 (闪烁/形变检测)
- [ ] P2 — 反向 Prompt 生成 (Video/Image Captioning)
- [ ] P2 — 视觉聚类去重 (pHash + K-Means)
- [ ] P2 — 负向特征拦截 (坏图/坏帧自动过滤)
- [ ] P3 — "Tinder for Prompts" 交互模式

### Phase 6: AI 增强 — 质量评估

- [ ] P2 — 黑场/静音/冻结帧检测
- [ ] P2 — 无参考质量评估 (No-Reference VQA)
- [ ] P3 — 伪影识别 (块效应/环状伪影)
- [ ] P3 — 智能蒙版 SAM (主体分割后分层 Diff)
