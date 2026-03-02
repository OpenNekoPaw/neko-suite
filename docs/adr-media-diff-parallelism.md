# 音视频 Diff 并行与 Lazy Loading 分析

> 日期：2026-03-01（Phase 1），2026-03-02（架构更新 + Phase 2 实施 + Phase 2.5 前端阻塞修复）
> 状态：Phase 1 已完成，Phase 2 已完成（#4-#7），Phase 2.5 已完成（#8-#10），Phase 3 待实施
> 关联：docs/diff.md, docs/adr-video-diff-streaming.md, docs/adr-unified-engine.md

## 背景

当前音视频 diff 的分析管线（Engine 层）几乎完全串行，导致用户在 5-30s 内看不到任何中间结果。本文分析并行化和渐进式加载的可行性。

## 一、音频 Diff 当前流程

```
t=0ms   detectMediaType → send preliminary result → UI 立即显示
        (零 I/O, ~5ms)

t=5ms   ensurePreviousFilePath(ref) ← Git 拉取前版本
        ⏳ 阻塞 3-30s

t=3s    areFilesIdentical() → MD5 并行哈希两文件 ← ✅ 并行

t=3.1s  sendVisualizationData(dummy) → 发送空波形（占位）

t=3.2s  diffService.analyze() → AudioDiffAnalyzer
        └─ engineMediaService.diff('audios', pathA, pathB)
           └─ Rust: FFmpeg 解码 → 48kHz mono → SNR + 波形峰值
           ⏳ 阻塞 1-30s（取决于文件大小）

t=30s   send mediaDiff:result（含完整分析结果）
        send mediaDiff:waveformData（真实波形） ← ✅ Phase 1 已修复

t=30s+  用户点击 Play → 才创建 AudioStreamClient ← ✅ Lazy
```

### 并行度评估

| 步骤 | 当前 | 是否可并行 | 潜在收益 |
|------|------|-----------|---------|
| Audio Probe | 无独立步骤（包含在 engine diff 中） | 可拆出 | 提前获取 duration/sampleRate |
| 加载 A+B+Diff 波形 | 与 SNR 计算绑定在一个 Rust 命令中 | Rust 内部可拆 | 波形可提前返回 |
| 相似度计算 | 同上，与波形绑定 | 同上 | - |
| 播放 | ✅ 已 lazy（点击才创建流） | 已实现 | - |

**结论**：音频 diff 几乎 0 并行。Engine 的 `audios:diff` 是一个黑盒，内部串行执行：解码 → SNR → 波形峰值 → 一次性返回。

## 二、视频 Diff 当前流程

```
t=0ms   detectMediaType → send preliminary result → UI 立即显示

t=5ms   ensurePreviousFilePath(ref) ← Git 拉取
        ⏳ 阻塞 3-30s

t=3s    MD5 并行哈希 ← ✅

t=3.1s  sendVisualizationData(dummy) → 跳过帧提取（engine 未就绪） ← ✅ Phase 1 已修复

t=3.3s  diffService.analyze() → VideoDiffAnalyzer
        └─ engineMediaService.diff('videos', pathA, pathB)
           Rust 内部：
           ├─ Probe A → Probe B （串行）
           ├─ FFmpeg SSIM ┐
           │  FFmpeg PSNR ┘ ← ✅ 并行（std::thread::scope）
           ├─ 合并帧指标 + 识别差异区域
           ├─ 音频 diff（如有音轨）（串行）
           └─ 生成差异视频（可选）（串行）
        ⏳ 阻塞 5-60s

t=30s   send mediaDiff:result
        send mediaDiff:waveformData（音频波形） ← ✅ Phase 1 已修复
        + 进度报告全程可见 ← ✅ Phase 1 已修复

t=30s+  用户点击 Play → handleStartStreaming()
        ├─ Probe A + B ← ✅ Promise.all
        ├─ 创建视频流 A+B ← ✅ Promise.all
        └─ 创建音频流 A+B ← ✅ Promise.allSettled（容错）
        ~300-500ms 后开始播放
```

### 并行度评估

| 步骤 | 当前 | 是否可并行 | 潜在收益 |
|------|------|-----------|---------|
| 音视频 Probe | Rust 内串行 Probe A → Probe B | 可并行 | 节省 ~100ms |
| 音频波形 A+B+Diff | 包含在 `videos:diff` 的 audio_diff 中 | 可拆出独立任务 | 波形提前渲染 |
| 视频帧渲染 | ✅ t=0 帧并行提取；streaming 按需 | 已实现 | - |
| SSIM + PSNR | ✅ Rust 内并行 | **已实现**（`std::thread::scope`） | 节省 30-50% 分析时间 |
| 分块/关键帧相似度 | 包含在 SSIM 结果中一次性返回 | 可分段返回 | 渐进式显示 |
| 音视频播放 | ✅ lazy + 流创建并行 | 已实现 | - |

**结论**：视频 diff 在播放层做了良好的并行（流创建、帧提取），但分析层（Engine）完全串行。SSIM 和 PSNR 本可并行但没有。

## 三、Engine 内部瓶颈

### Rust 端执行顺序

**`audios:diff`**：
```
FFmpeg decode A → FFmpeg decode B → Resample 48kHz mono
→ SNR (全局) → 0.1s 分段 SNR → 差异区域合并 → 800 点波形峰值
→ 一次性返回 AudioContentDiff
```

**`videos:diff`**：
```
Probe A → Probe B → ┌─ FFmpeg SSIM ─┐ → 合并帧指标
                     └─ FFmpeg PSNR ─┘   ← std::thread::scope 并行
→ 差异区域识别 → 音频 diff（可选） → 差异视频（可选）
→ 一次性返回 VideoContentDiff
```

### 可并行但未并行的关键点

| 可并行组 | 当前耗时 | 并行后耗时 | 节省 |
|---------|---------|-----------|------|
| Probe A \|\| Probe B | ~200ms | ~100ms | 50% |
| SSIM \|\| PSNR | 主瓶颈，各 5-30s | max(SSIM,PSNR) | **30-50%** ✅ 已实施 |
| 视频分析 \|\| 音频波形 | 串行叠加 | max(视频,音频) | 取决于音频时长 |

## 四、波形分段加载分析

### 当前波形数据特征

- Engine 固定返回 **800 个峰值点**（无论文件多长）
- 数据量：800 × 4 bytes × 2（A+B） ≈ **6.4 KB**
- 传输：一次性 postMessage
- 渲染：Canvas 一次绘制 800 点，< 1ms

### 是否需要分段加载？

| 维度 | 分析 |
|------|------|
| 数据量 | 6.4KB 极小，**不需要分段传输** |
| 计算瓶颈 | 波形生成绑定在 SNR 计算中，无法独立提前返回 |
| 渲染性能 | Canvas 一次绘制 800 点 < 1ms，**不需要分段渲染** |
| 用户体验 | 用户等待 5-30s 后一次性看到完整波形 |

**结论**：问题不在分段，而在**时机**——波形绑定在完整分析中，无法提前展示。

### 理想流程 vs 当前流程

```
理想流程（三阶段渐进）：
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  快速 Probe   │   │  波形提取     │   │  SNR 精确计算  │
│  获取 duration │──▶│  800 峰值点   │──▶│  相似度/差异区 │
│  ~100ms      │   │  ~500ms      │   │  5-30s       │
└──────────────┘   └──────────────┘   └──────────────┘
       ↓                  ↓                  ↓
    显示时间轴          渲染波形          更新相似度分数

当前流程（一次性）：
┌───────────────────────────────────────────────────┐
│  全部绑定在一个 audios:diff 命令中                    │
│  Probe + 波形 + SNR + 差异区域 → 一次性返回           │
│  ~5-30s                                           │
└───────────────────────────────────────────────────┘
                         ↓
              一次性渲染所有内容
```

## 五、优化路线图

### Phase 1：短期修复（修 Bug + 低成本）— ✅ 已完成

| # | 优化 | 状态 | 改动 |
|---|------|------|------|
| 1 | **修复波形数据发送 bug**：分析完成后对 audio 类型也发送 waveformData | ✅ | `sendWaveformFromResult()` 新方法 |
| 2 | **视频分析中音频波形也发送**：`VideoDiffAnalyzer` 从 `videoDiff.audioDiff` 提取波形峰值到 `visualization` | ✅ | `VideoDiffAnalyzer.ts` + `sendWaveformFromResult()` |
| 3 | **启用 audio/video 进度报告**：移除 `mediaType !== 'audio'` 过滤 | ✅ | 删除两处 if 过滤 |
| 4 | **修复视频帧提取竞态**：preliminary 调用跳过 `handleSeek(0)`，避免 engine 未激活时报错 | ✅ | `sendVisualizationData` + `sendVisualizationDataForLocal` |

### Phase 2：统一通信 + 并行调度 — ✅ 已完成（#4-#7）

> **实现方案**：在 `@neko/neko-client` 中新增 `EngineClient` HTTP 客户端（见 [adr-unified-engine.md](./adr-unified-engine.md)）
>
> **关键发现**：Engine 已有 `audios:probe`、`audios:waveform` 命令（neko-preview / neko-cut 已在使用），无需 Rust 改动。
> neko-tools 已从 VSCode commands 迁移到 HTTP dispatch。

| # | 优化 | 状态 | 改动 |
|---|------|------|------|
| 4 | **在 `@neko/neko-client` 中添加 `EngineClient`**：HTTP dispatch + WS URL 构建，零 vscode 依赖 | ✅ | `EngineClient.ts` + `engine/types.ts` + `engine/responseTransform.ts` |
| 5 | **neko-tools 迁移到 EngineClient**：替换所有 VSCode commands 调用 | ✅ | `EngineMediaService.ts`（lazy init）+ `MediaDiffMessageHandler.ts`（全部 streaming/extraction 方法） |
| 6 | **音频并行调度 waveform \|\| diff**：波形提前 5-30s 送达 webview | ✅ | `startEarlyWaveform()` 在 `initializeDiff` / `initializeLocalDiff` 中并行启动 |
| 7 | **Engine `videos:diff` 内 SSIM \|\| PSNR 并行**：两个 FFmpeg 进程并行 | ✅ | `video_diff.rs` 使用 `std::thread::scope` 并行执行 SSIM+PSNR，**分析时间减少 30-50%** |
| — | **视频 probe 提前发送**：需新增 `mediaDiff:probeResult` webview 消息处理 | ⏳ 待实施 | 需 webview 侧配合 |

### Phase 2.5：前端阻塞修复 — ✅ 已完成（#8-#10）

> **问题根因**：Phase 2 解决了 Engine 层并行，但前端仍有两类阻塞：
> 1. ProgressOverlay 全屏遮罩阻塞用户交互
> 2. `handleMessage` 中 `await` 长时间管线导致 webview 消息队列串行化

| # | 优化 | 状态 | 改动 |
|---|------|------|------|
| 8 | **ProgressOverlay 非阻塞化**：有 diffResult 时改为右下角小指示器，不再全屏遮罩 | ✅ | `MediaDiffApp.tsx` 条件渲染 |
| 9 | **progress handler 保持 isLoading 状态**：收到进度消息时不再重置 `isLoading: true`（当 diffResult 已存在） | ✅ | `useMediaDiffProtocol.ts` |
| 10 | **handleMessage 消息队列去阻塞**：`initializeDiff` / `initializeLocalDiff` 中分析管线改为 fire-and-forget | ✅ | `MediaDiffMessageHandler.ts` 新增 `runAnalysisPipeline` / `runLocalAnalysisPipeline` |

### Phase 3：流式/渐进式

| # | 优化 | 工作量 | 收益 |
|---|------|-------|------|
| 8 | **Engine 流式帧指标返回**：SSIM 每处理 N 帧回调一次 | Rust 大 | 视频帧相似度渐进显示 |
| 9 | **高精度波形（zoom 按需加载）**：800 点不够时 zoom 再请求更多 | 全栈 中等 | 深度 zoom 下波形不失真 |

## 六、已修复的 Bug（Phase 1）

### BUG-1：波形数据发送逻辑错误 — ✅ 已修复

**原问题**：`initializeDiff` / `initializeLocalDiff` 分析完成后显式跳过 audio/video 的波形发送。

**修复**：新增 `sendWaveformFromResult(result)` 方法，在完整分析完成后发送真实波形数据。同时 `VideoDiffAnalyzer` 从 `videoDiff.audioDiff.waveformPeaksA/B` 提取音频波形到 `visualization` 字段。

### BUG-2：视频帧提取竞态 — ✅ 已修复

**原问题**：preliminary `sendVisualizationData` 在 engine 未激活时就调用 `handleSeek(0)` → `neko.engine.extractFrame` not found。

**修复**：preliminary 调用（无 `visualization` 字段）跳过帧提取。帧提取由用户交互（play/seek）触发，此时 engine 已通过 `diff` 命令激活。

## 七、已修复的 Bug（Phase 2.5）

### BUG-3：ProgressOverlay 全屏遮罩阻塞交互 — ✅ 已修复

**现象**：视频/音频 diff 分析过程中，"Analyzing differences... 30%" 全屏半透明遮罩（`absolute inset-0 z-50`，80% 不透明度）覆盖整个 UI，用户无法操作已加载的内容。

**根因**：`MediaDiffApp.tsx` 中 `ProgressOverlay` 无条件渲染为全屏覆盖层，只要有 `progress` 就显示。即使 `diffResult` 已到达、音视频播放器已可用，遮罩仍然阻塞。

**修复**：
- 无 `diffResult` 时：保持全屏 `ProgressOverlay`（首次加载体验）
- 有 `diffResult` 时：改为右下角非阻塞小指示器（`absolute bottom-4 right-4 z-40`），显示进度百分比和取消按钮

**同时修复**：`useMediaDiffProtocol.ts` 中 `mediaDiff:progress` handler 不再在 `diffResult` 已存在时重置 `isLoading: true`，避免已渲染的播放器被 loading 状态覆盖。

### BUG-4：handleMessage 消息队列串行化 — ✅ 已修复

**现象**：本地文件对比和 Git diff 均出现播放卡住（视频 "Starting video streams..."、音频 "0:00 / 0:00"），即使分析已完成。

**根因**：`MediaDiffMessageHandler.handleMessage()` 是 webview 消息的唯一入口。`initializeDiff` 和 `initializeLocalDiff` 内部 `await Promise.all(parallelTasks)` 阻塞 5-30s，期间所有后续 webview 消息（`streamControl`、`audioStreamControl`、`seek` 等）排队等待，无法处理。

```
消息队列阻塞示意：
t=0s    handleMessage('mediaDiff:initialize') → await initializeDiff()
t=0.1s  handleMessage('streamControl:start')  → 排队等待 ⏳
t=0.2s  handleMessage('audioStreamControl')   → 排队等待 ⏳
t=5-30s initializeDiff() 完成 → 才开始处理排队消息
```

**修复**：
1. 提取分析管线为独立方法 `runAnalysisPipeline()` / `runLocalAnalysisPipeline()`
2. 使用 fire-and-forget 模式：`void run()` 立即返回，不阻塞 `handleMessage`
3. 新增 `pipelineOwnsCleanup` 标志：防止 `initializeDiff` 的 `finally` 块在管线仍在运行时清除 `abortController`

```
修复后消息流：
t=0s    handleMessage('mediaDiff:initialize')
        → initializeDiff(): 快速初始化 + void runAnalysisPipeline()
        → 立即返回 ✅
t=0.1s  handleMessage('streamControl:start') → 立即处理 ✅
t=0.2s  handleMessage('audioStreamControl')  → 立即处理 ✅
t=5-30s runAnalysisPipeline() 后台完成 → 发送 mediaDiff:result
```

### 其他 await 路径分析

对 `handleMessage` 中所有 await 路径进行了全面分析，确认以下调用均为快速操作（<2s），不构成阻塞风险：

| 消息类型 | await 操作 | 耗时 | 风险 |
|---------|-----------|------|------|
| `streamControl:start` | `handleStartStreaming()` — probe + 创建流 | ~300-500ms | ✅ 可接受 |
| `streamControl:stop` | `handleStopStreaming()` — 销毁流 | ~50ms | ✅ 无风险 |
| `streamControl:seek` | `handleSeek()` — 帧提取 | ~100-200ms | ✅ 可接受 |
| `audioStreamControl:*` | 音频流创建/销毁/seek | ~100-300ms | ✅ 可接受 |
| `mediaDiff:cancel` | `abortController.abort()` | ~0ms | ✅ 无风险 |
| `mediaDiff:requestWaveform` | `handleWaveformRequest()` — engine 波形提取 | ~500ms-2s | ✅ 可接受 |
