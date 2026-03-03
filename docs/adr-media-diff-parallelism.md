# 音视频 Diff 并行与 Lazy Loading 分析

> 日期：2026-03-01（Phase 1），2026-03-02（架构更新 + Phase 2 实施 + Phase 2.5 前端阻塞修复），2026-03-03（Phase 2.6 后续修复）
> 状态：Phase 1 已完成，Phase 2 已完成（#4-#7），Phase 2.5 已完成（#8-#10），Phase 2.6 已完成（3 个修复），Phase 3 待实施
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

## 八、后续修复（Phase 2.6 - 2026-03-03）

### 修复 1：切换 Git Ref 时停止旧流 — ✅ 已修复

**问题**：`mediaDiff:changeRef` 只取消分析（`cancelCurrentAnalysis()`），不停止 Rust 引擎中的活跃流。

**影响**：
- 每次切换 ref 都创建新流，旧流未释放 → 引擎资源泄漏
- 多次切换后可能导致引擎性能下降

**修复**（`MediaDiffMessageHandler.ts:456-461`）：
```typescript
case 'mediaDiff:changeRef':
    // Stop any active streams before switching refs to prevent resource leaks
    await this.handleStopStreaming();
    await this.handleStopAudioStreaming();
    await this.initializeDiff(message.payload.ref);
    break;
```

**验证**：切换 ref 时会先停止所有视频和音频流，然后重新初始化分析。

---

### 修复 2：早期波形添加取消机制 — ✅ 已修复

**问题**：`startEarlyWaveform()` 无 `AbortSignal` 参数，用户取消分析时早期波形请求仍在后台运行。

**影响**：
- 浪费引擎资源（~500ms 波形提取）
- 取消后可能仍发送 `mediaDiff:waveformData` 消息

**修复**（`MediaDiffMessageHandler.ts:529-551`）：
```typescript
private startEarlyWaveform(
    engine: EngineClient,
    currentPath: string,
    previousPath: string,
    signal: AbortSignal,  // ← 新增
): Promise<void> {
    return Promise.all([...]).then(([wfA, wfB]) => {
        if (this.isDisposed || signal.aborted) return;  // ← 检查取消
        this.sendMessage({ ... });
    }).catch((err) => {
        if (signal.aborted) return;  // ← 静默忽略取消
        console.warn(...);
    });
}
```

**调用点更新**：
- `runAnalysisPipeline` (L295): `this.startEarlyWaveform(..., abortController.signal)`
- `runLocalAnalysisPipeline` (L361): `this.startEarlyWaveform(..., abortController.signal)`

**验证**：用户点击取消后，早期波形请求会被中止，不再发送消息。

---

### 修复 3：删除音频 Task A 的空波形冗余 — ✅ 已修复

**问题**：Preliminary result 无 `visualization` 字段，`sendVisualizationData` 发送空波形 `{ currentWaveform: [], previousWaveform: [] }`，立即被 Task B 的早期波形覆盖。

**影响**：无意义的消息传递，用户无感知。

**修复**（`MediaDiffMessageHandler.ts:564-578, 631-645`）：
```typescript
case 'audio':
    // Skip sending empty waveform for preliminary results.
    // Task B (startEarlyWaveform) will send real waveform data in ~500ms.
    if (result.visualization) {  // ← 仅当有真实数据时才发送
        this.sendMessage({
            type: 'mediaDiff:waveformData',
            payload: { ... },
        });
    }
    break;
```

**验证**：Preliminary result 不再发送空波形，Task B 的早期波形（~500ms）是用户看到的第一个波形数据。

---

### 修复总结

| 修复 | 优先级 | 文件 | 行号 | 状态 |
|------|--------|------|------|------|
| 切换 Ref 停止旧流 | P0 | `MediaDiffMessageHandler.ts` | 456-461 | ✅ |
| 早期波形取消机制 | P1 | `MediaDiffMessageHandler.ts` | 529-551, 295, 361 | ✅ |
| 删除空波形冗余 | P2 | `MediaDiffMessageHandler.ts` | 564-578, 631-645 | ✅ |

**编译验证**：✅ 通过（`pnpm compile:extension` → `dist/extension.js 179.7kb`）

---

### 待修复问题

| 问题 | 优先级 | 复杂度 | 说明 |
|------|--------|--------|------|
| Git 拉取期间播放失败 | P0 | 中 | `ensurePreviousFilePath` 阻塞 3-30s，期间 `previousFilePath = null` → 用户点击 Play 报错 |
| 视频无早期预览 | P1 | 中 | 需实现 `startEarlyFrameExtraction(time=0)` 提前提取 t=0 帧 |
| Probe 重复执行 | P2 | 低 | `videos:diff` 已返回 duration/width/fps，`handleStartStreaming` 重复 probe |
| 早期波形覆盖权威波形 | P3 | 低 | 理论竞态（实际不会发生），可添加时间戳或序列号 |

---

## 九、待修复问题详细分析

### 问题 1：Git 拉取期间播放失败 (P0)

**现象**：
```
用户操作流程：
1. 打开媒体 diff 编辑器 → 发送 preliminary result → UI 显示播放器
2. 后台执行 ensurePreviousFilePath(ref) → git show HEAD:file → 写入 /tmp/prev.mp4 (3-30s)
3. 用户在 git 拉取期间点击 Play 按钮
4. handleStartStreaming() 检查 previousFilePath → null
5. 抛出错误："No previous file available for streaming"
```

**根本原因**：
```typescript
// MediaDiffMessageHandler.ts:84-141
async initializeDiff(ref: string = 'HEAD'): Promise<void> {
    // 1. 发送 preliminary result → UI 立即渲染播放器
    sendMessage({
        type: 'mediaDiff:result',
        payload: { mediaType: 'audio', similarity: -1, analysisInProgress: true }
    });

    // 2. ⚠️ 阻塞 3-30s，但 previousFilePath 仍为 null
    await ensurePreviousFilePath(ref);  // git show HEAD:file → /tmp/prev.mp3

    // 3. 启动后台管线（fire-and-forget）
    runAnalysisPipeline(...);
}

// 用户在步骤 2 期间点击 Play
async handleStartStreaming(): Promise<void> {
    const previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
    if (!previousPath) {
        throw new Error('No previous file available for streaming');  // ❌ 报错
    }
    // ...
}
```

**时序图**：
```
t=0ms    preliminary result → UI 显示播放器（Play 按钮可能可点击）
t=5ms    ensurePreviousFilePath() 开始 → git show HEAD:file
         ⏳ previousFilePath = null
t=100ms  用户点击 Play → handleStartStreaming() → 检查 previousFilePath → null → 报错
         ...
t=3-30s  git 拉取完成 → previousFilePath 设置
t=3-30s+ runAnalysisPipeline() 启动
```

**影响**：
- 用户体验差：需要等待 git 拉取完成后重试播放
- 错误消息不友好：用户不理解为什么"文件不可用"
- 时序依赖脆弱：依赖用户不在 git 拉取期间点击 Play

**修复方案**：

**方案 A：状态机管理（推荐）**
```typescript
// 新增状态枚举
enum DiffState {
    IDLE = 'idle',
    FETCHING_PREVIOUS = 'fetching_previous',  // git 拉取中
    ANALYZING = 'analyzing',                   // 分析中
    READY = 'ready',                           // 可播放
    ERROR = 'error',
}

private diffState: DiffState = DiffState.IDLE;

async initializeDiff(ref: string = 'HEAD'): Promise<void> {
    // 1. 发送 preliminary result + 状态标志
    this.diffState = DiffState.FETCHING_PREVIOUS;
    sendMessage({
        type: 'mediaDiff:result',
        payload: {
            mediaType: 'audio',
            similarity: -1,
            analysisInProgress: true,
            gitFetchInProgress: true,  // ← 新增标志
        }
    });

    // 2. git 拉取（仍然阻塞，但状态已标记）
    await ensurePreviousFilePath(ref);

    // 3. 更新状态 + 发送新消息
    this.diffState = DiffState.ANALYZING;
    sendMessage({
        type: 'mediaDiff:gitFetchComplete',  // ← 新消息类型
        payload: { previousPath: this.previousFilePath }
    });

    // 4. 启动后台管线
    runAnalysisPipeline(...);
}

async handleStartStreaming(): Promise<void> {
    // 检查状态
    if (this.diffState === DiffState.FETCHING_PREVIOUS) {
        throw new Error('Fetching previous version from Git, please wait...');
    }

    const previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
    if (!previousPath) {
        throw new Error('No previous file available for streaming');
    }
    // ...
}
```

**Webview 侧配合**：
```typescript
// useMediaDiffProtocol.ts
case 'mediaDiff:result':
    setState(prev => ({
        ...prev,
        diffResult: msg.payload,
        gitFetchInProgress: msg.payload.gitFetchInProgress ?? false,  // ← 新状态
    }));
    break;

case 'mediaDiff:gitFetchComplete':
    setState(prev => ({
        ...prev,
        gitFetchInProgress: false,
    }));
    break;

// MediaDiffApp.tsx - 禁用 Play 按钮
<PlayButton
    disabled={gitFetchInProgress || isLoading}  // ← 条件禁用
    onClick={sendStreamControl}
/>
```

**方案 B：将 git 拉取移入后台管线（更彻底）**
```typescript
async initializeDiff(ref: string = 'HEAD'): Promise<void> {
    // 1. 发送 preliminary result
    sendMessage({ ... });

    // 2. 立即启动后台管线（不等待 git 拉取）
    runAnalysisPipeline(mediaType, null, ref, abortController);  // ← previousPath = null
}

private runAnalysisPipeline(
    mediaType: 'video' | 'audio',
    previousPath: string | null,  // ← 允许 null
    ref: string,
    abortController: AbortController,
): void {
    const run = async () => {
        try {
            // Task 0: git 拉取（在后台管线内部）
            if (!previousPath) {
                await this.ensurePreviousFilePath(ref);
                previousPath = this.previousFilePath;

                // 发送 git 拉取完成消息
                this.sendMessage({
                    type: 'mediaDiff:gitFetchComplete',
                    payload: { previousPath }
                });
            }

            // Task A, B, C...
            // ...
        } catch (error) {
            // ...
        }
    };
    void run();
}
```

**复杂度评估**：
- 方案 A：中等（需要新增状态管理 + webview 侧配合）
- 方案 B：中等（需要重构管线启动逻辑 + 处理 null previousPath）

**推荐**：方案 A（状态机管理），因为：
- 更清晰的状态转换
- 更好的用户反馈（可显示"正在拉取旧版本..."）
- 不改变现有管线结构

---

### 问题 2：视频无早期预览 (P1)

**现象对比**：

| 类型 | 早期预览 | 延迟 | 用户体验 |
|------|---------|------|---------|
| 音频 | ✅ Task B 早期波形 | ~500ms | 快速看到波形，分析期间可交互 |
| 视频 | ❌ 无预览 | 5-60s | 黑屏 + 进度条，无视觉反馈 |

**根本原因**：
```typescript
// MediaDiffMessageHandler.ts:287-291 (Task A)
parallelTasks.push(
    this.sendVisualizationData({ mediaType: 'video', similarity: -1 } as DiffResult, ref)
        .catch(err => console.warn('[MediaDiffMessageHandler] Frame extraction failed:', err))
);

// sendVisualizationData 实现
private async sendVisualizationData(result: DiffResult, ref: string = 'HEAD'): Promise<void> {
    switch (result.mediaType) {
        case 'video':
            // ❌ preliminary result 无 visualization 字段 → 跳过
            if (result.visualization) {
                await this.handleSeek(0);
            }
            break;
    }
}
```

**注释中的误解**：
```typescript
// Skip frame extraction for preliminary calls (engine may not be active yet).
```

实际上：
- `engineClient` 在构造时已注入（`MediaDiffEditorProvider.resolveCustomEditor` L160-172）
- `ensureClient()` 会激活 engine（`EngineMediaService.initializeClient` L53-86）
- Task A 与 Task C 并行运行，Task C 会激活 engine，但 Task A 不依赖 Task C 完成

**修复方案**：

**实现 `startEarlyFrameExtraction`（参考 `startEarlyWaveform`）**：
```typescript
/**
 * Start early frame extraction in parallel with diff analysis.
 *
 * Extracts t=0 frames for both versions — resolves in ~200ms,
 * well before the full `videos:diff` completes (5-60s). The early
 * frames are sent immediately for visual feedback.
 *
 * Fire-and-forget: errors are logged but never propagate.
 * Supports cancellation via AbortSignal.
 */
private startEarlyFrameExtraction(
    engine: EngineClient,
    currentPath: string,
    previousPath: string,
    signal: AbortSignal,
): Promise<void> {
    return Promise.all([
        engine.extractFrame(currentPath, 0),
        engine.extractFrame(previousPath, 0),
    ]).then(([frameA, frameB]) => {
        if (this.isDisposed || signal.aborted) return;

        // 发送当前版本帧
        this.sendMessage({
            type: 'mediaDiff:frameData',
            payload: {
                time: 0,
                version: 'current',
                imageBuffer: frameA,
            },
        });

        // 发送旧版本帧
        this.sendMessage({
            type: 'mediaDiff:frameData',
            payload: {
                time: 0,
                version: 'previous',
                imageBuffer: frameB,
            },
        });
    }).catch((err) => {
        if (signal.aborted) return; // Silently ignore cancelled requests
        console.warn('[MediaDiffMessageHandler] Early frame extraction failed (non-fatal):', err);
    });
}
```

**调用点更新**：
```typescript
// runAnalysisPipeline (L293-296)
// Task B: Early frame extraction (video only, ~200ms)
if (mediaType === 'video' && this.engineClient && previousPath) {
    this.startEarlyFrameExtraction(
        this.engineClient,
        this.fileUri.fsPath,
        previousPath,
        abortController.signal
    );
}

// runLocalAnalysisPipeline (L359-362)
// Task B: Early frame extraction (video only)
if (mediaType === 'video' && this.engineClient) {
    this.startEarlyFrameExtraction(
        this.engineClient,
        this.fileUri.fsPath,
        previousUri.fsPath,
        abortController.signal
    );
}
```

**时序对比**：

**修复前**：
```
t=0ms    preliminary result → UI 显示空播放器
t=5ms    Task A 跳过（无 visualization）
t=5ms    Task C 开始 videos:diff (5-60s)
         ⏳ 用户看到黑屏 + 进度条
t=30s    videos:diff 完成 → 发送 result + 帧数据
```

**修复后**：
```
t=0ms    preliminary result → UI 显示空播放器
t=5ms    Task B 开始 extractFrame(A, 0) || extractFrame(B, 0)
t=5ms    Task C 开始 videos:diff (5-60s)
t=200ms  Task B 完成 → 发送 t=0 帧数据 → UI 显示预览帧
         ✅ 用户看到静态预览 + 进度条
t=30s    videos:diff 完成 → 发送 result（帧数据可能被更新）
```

**复杂度评估**：中等
- 新增方法：~30 行代码（参考 `startEarlyWaveform`）
- 调用点更新：2 处（`runAnalysisPipeline` + `runLocalAnalysisPipeline`）
- 测试：需验证 t=0 帧提取不会与 diff 冲突

**收益**：
- 用户体验显著提升：200ms 内看到预览帧 vs 5-60s 黑屏
- 与音频体验对齐：两者都有早期预览

---

### 问题 3：Probe 重复执行 (P2)

**现象**：
```typescript
// Rust videos:diff 内部（串行）
Probe A → Probe B → SSIM || PSNR → 返回 {
    durationA, widthA, heightA, fpsA,
    durationB, widthB, heightB, fpsB,
    ...
}

// 用户点击 Play 后再次 Probe
async handleStartStreaming(): Promise<void> {
    // ❌ 重复 probe，已有数据未复用
    const [currentInfo, previousInfo] = await Promise.all([
        engine.probe('videos', currentPath),  // ~100ms
        engine.probe('videos', previousPath), // ~100ms
    ]);

    const width = Math.max(currentInfo.width, previousInfo.width);
    const height = Math.max(currentInfo.height, previousInfo.height);
    const fps = currentInfo.fps || 30;
    const duration = Math.max(currentInfo.duration, previousInfo.duration);
    // ...
}
```

**根本原因**：
- `videos:diff` 结果包含完整元数据（`VideoDiffAnalyzer.ts:120-127`）
- `handleStartStreaming` 不知道 diff 结果已缓存，重新 probe

**影响**：
- 轻微性能浪费：~200ms（2 个 probe）
- 不影响功能：probe 结果与 diff 结果一致

**修复方案**：

**方案 A：缓存 diff 结果元数据**
```typescript
// MediaDiffMessageHandler.ts
private cachedProbeInfo: {
    current: { width: number; height: number; fps: number; duration: number } | null;
    previous: { width: number; height: number; fps: number; duration: number } | null;
} = { current: null, previous: null };

// runAnalysisPipeline - Task C 完成后缓存
this.diffService.analyze(...).then(result => {
    if (this.isDisposed) return;

    // 缓存元数据
    if (result.mediaType === 'video' && result.details) {
        const details = result.details as VideoDiffDetails;
        this.cachedProbeInfo = {
            current: {
                width: details.resolution.current.width,
                height: details.resolution.current.height,
                fps: details.fps.current,
                duration: details.duration.current,
            },
            previous: {
                width: details.resolution.previous.width,
                height: details.resolution.previous.height,
                fps: details.fps.previous,
                duration: details.duration.previous,
            },
        };
    }

    this.sendMessage({ type: 'mediaDiff:result', payload: result });
    this.sendWaveformFromResult(result);
});

// handleStartStreaming - 优先使用缓存
async handleStartStreaming(requestId?: string): Promise<void> {
    try {
        const engine = this.requireEngine();
        const currentPath = this.fileUri.fsPath;
        const previousPath = this.previousUri?.fsPath ?? this.previousFilePath;

        if (!previousPath) {
            throw new Error('No previous file available for streaming');
        }

        // 优先使用缓存的 probe 信息
        let currentInfo, previousInfo;
        if (this.cachedProbeInfo.current && this.cachedProbeInfo.previous) {
            console.log('[MediaDiffMessageHandler] Using cached probe info');
            currentInfo = this.cachedProbeInfo.current;
            previousInfo = this.cachedProbeInfo.previous;
        } else {
            // Fallback: 重新 probe
            console.log('[MediaDiffMessageHandler] Cache miss, probing files');
            [currentInfo, previousInfo] = await Promise.all([
                engine.probe('videos', currentPath),
                engine.probe('videos', previousPath),
            ]);
        }

        // 使用 probe 信息创建流...
        const width = Math.max(currentInfo.width, previousInfo.width);
        // ...
    } catch (error) {
        // ...
    }
}
```

**方案 B：通过消息传递元数据（更解耦）**
```typescript
// Extension → Webview: 发送 probe 信息
this.sendMessage({
    type: 'mediaDiff:result',
    payload: result,
    probeInfo: {  // ← 新增字段
        current: { width, height, fps, duration },
        previous: { width, height, fps, duration },
    }
});

// Webview → Extension: 播放时回传 probe 信息
sendStreamControl('play', {
    probeInfo: cachedProbeInfo  // ← 从 state 中获取
});

// Extension: 使用回传的 probe 信息
async handleStreamControl(action, payload, requestId) {
    if (action === 'play' && !this.currentStreamId) {
        // 使用 payload.probeInfo 而不是重新 probe
        await this.handleStartStreaming(requestId, payload.probeInfo);
    }
}
```

**复杂度评估**：
- 方案 A：低（仅 Extension 侧修改，~50 行代码）
- 方案 B：中等（需要 Extension + Webview 协同，~100 行代码）

**推荐**：方案 A（Extension 侧缓存），因为：
- 实现简单，不涉及协议变更
- 缓存失效策略清晰（ref 切换时清空）
- 性能提升明显（省略 ~200ms probe）

---

### 问题 4：早期波形覆盖权威波形 (P3)

**理论竞态**：
```typescript
// Task B: startEarlyWaveform() → ~500ms → 发送早期波形
// Task C: diffService.analyze() → 5-30s → sendWaveformFromResult() → 发送权威波形

// 理论竞态：若 Task C 异常快速完成（< 500ms）
t=0ms    Task B 开始 audios:waveform
t=0ms    Task C 开始 audios:diff
t=400ms  Task C 完成（异常快） → 发送权威波形
t=500ms  Task B 完成 → 发送早期波形 → ❌ 覆盖权威波形
```

**实际情况**：
- `audios:diff` 包含完整 FFmpeg 解码 + SNR 计算，总是比 `audios:waveform` 慢 10 倍以上
- 实测：`audios:waveform` ~500ms，`audios:diff` ~5-30s
- 竞态几乎不可能发生

**影响**：
- 理论问题，实际不会发生
- 如果发生，用户会看到波形"闪烁"（权威 → 早期）

**修复方案**：

**方案 A：添加时间戳或序列号**
```typescript
private waveformSequence = 0;

private startEarlyWaveform(...): Promise<void> {
    const seq = ++this.waveformSequence;
    return Promise.all([...]).then(([wfA, wfB]) => {
        if (this.isDisposed || signal.aborted) return;
        this.sendMessage({
            type: 'mediaDiff:waveformData',
            payload: {
                currentWaveform: wfA.peaks,
                previousWaveform: wfB.peaks,
                sequence: seq,  // ← 序列号
                source: 'early',  // ← 来源标记
            },
        });
    });
}

private sendWaveformFromResult(result: DiffResult): void {
    const seq = ++this.waveformSequence;
    this.sendMessage({
        type: 'mediaDiff:waveformData',
        payload: {
            currentWaveform: result.visualization?.currentWaveform ?? [],
            previousWaveform: result.visualization?.previousWaveform ?? [],
            sequence: seq,  // ← 序列号
            source: 'authoritative',  // ← 来源标记
        },
    });
}
```

**Webview 侧处理**：
```typescript
case 'mediaDiff:waveformData':
    setState(prev => {
        const incoming = msg.payload;
        const current = prev.waveformSequence ?? 0;

        // 只接受更新的序列号
        if (incoming.sequence >= current) {
            return {
                ...prev,
                currentWaveform: incoming.currentWaveform,
                previousWaveform: incoming.previousWaveform,
                waveformSequence: incoming.sequence,
            };
        }

        // 忽略过期数据
        console.warn('[useMediaDiffProtocol] Ignoring stale waveform data', {
            incoming: incoming.sequence,
            current,
        });
        return prev;
    });
    break;
```

**方案 B：取消早期波形（更激进）**
```typescript
// 完全移除 Task B，只依赖权威波形
// 缺点：用户需要等待 5-30s 才能看到波形
```

**复杂度评估**：
- 方案 A：低（~30 行代码，Extension + Webview）
- 方案 B：极低（删除代码），但用户体验变差

**推荐**：暂不修复，因为：
- 实际不会发生（diff 总是比 waveform 慢 10 倍以上）
- 修复成本 > 收益
- 如果未来 diff 性能大幅提升，再考虑方案 A

---

## 十、实施优先级建议

| 问题 | 优先级 | 复杂度 | 推荐方案 | 预计工作量 | 收益 |
|------|--------|--------|---------|-----------|------|
| Git 拉取期间播放失败 | **P0** | 中 | 状态机管理 | 2-3 小时 | 修复用户报错，提升体验 |
| 视频无早期预览 | **P1** | 中 | `startEarlyFrameExtraction` | 1-2 小时 | 5-60s 黑屏 → 200ms 预览 |
| Probe 重复执行 | **P2** | 低 | Extension 侧缓存 | 1 小时 | 省略 ~200ms probe |
| 早期波形覆盖权威波形 | **P3** | 低 | 暂不修复 | - | 理论问题，实际不发生 |

**建议实施顺序**：
1. **P1 - 视频早期预览**（先做，因为实现简单且收益大）
2. **P0 - Git 拉取状态管理**（次之，需要更多设计）
3. **P2 - Probe 缓存**（最后，优化性能）
4. **P3 - 波形竞态**（暂不修复）
