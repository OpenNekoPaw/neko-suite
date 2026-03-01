# 音视频 Diff 并行与 Lazy Loading 分析

> 日期：2026-03-01
> 状态：分析完成，待实施
> 关联：docs/diff.md, docs/adr-video-diff-streaming.md

## 背景

当前音视频 diff 的分析管线（Engine 层）几乎完全串行，导致用户在 5-30s 内看不到任何中间结果。本文分析并行化和渐进式加载的可行性。

## 一、音频 Diff 当前流程

```
t=0ms   detectMediaType → send preliminary result → UI 立即显示
        (零 I/O, ~5ms)

t=5ms   ensurePreviousFilePath(ref) ← Git 拉取前版本
        ⏳ 阻塞 3-30s

t=3s    areFilesIdentical() → MD5 并行哈希两文件 ← ✅ 唯一的并行点

t=3.1s  sendVisualizationData(dummy) → 发送空波形 ← ❌ BUG（已知）

t=3.2s  diffService.analyze() → AudioDiffAnalyzer
        └─ engineMediaService.diff('audios', pathA, pathB)
           └─ Rust: FFmpeg 解码 → 48kHz mono → SNR + 波形峰值
           ⏳ 阻塞 1-30s（取决于文件大小）

t=30s   send mediaDiff:result（含完整分析结果）
        ⚠️ 跳过 audio 的 waveformData 发送 ← ❌ BUG（已知）

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

t=3.1s  handleSeek(0) → 提取 t=0 帧 ← ✅ Promise.all 并行
        ├─ handleGetFrame(0, 'current')
        └─ handleGetFrame(0, 'previous')

t=3.3s  diffService.analyze() → VideoDiffAnalyzer
        └─ engineMediaService.diff('videos', pathA, pathB)
           Rust 内部串行：
           ├─ Probe A → Probe B （串行）
           ├─ FFmpeg SSIM （串行）
           ├─ FFmpeg PSNR （串行）
           ├─ 合并帧指标 + 识别差异区域
           ├─ 音频 diff（如有音轨）（串行）
           └─ 生成差异视频（可选）（串行）
        ⏳ 阻塞 5-60s

t=30s   send mediaDiff:result
        ⚠️ 跳过 audio waveformData 发送 ← ❌ 同样的 BUG

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
| SSIM + PSNR | Rust 内串行 | **可并行**（两个独立 FFmpeg 进程） | 节省 30-50% 分析时间 |
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
Probe A → Probe B → FFmpeg SSIM → FFmpeg PSNR
→ 合并帧指标 → 差异区域识别 → 音频 diff（可选） → 差异视频（可选）
→ 一次性返回 VideoContentDiff
```

### 可并行但未并行的关键点

| 可并行组 | 当前耗时 | 并行后耗时 | 节省 |
|---------|---------|-----------|------|
| Probe A \|\| Probe B | ~200ms | ~100ms | 50% |
| SSIM \|\| PSNR | 主瓶颈，各 5-30s | max(SSIM,PSNR) | **30-50%** |
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

### Phase 1：短期修复（修 Bug + 低成本）

| # | 优化 | 工作量 | 收益 |
|---|------|-------|------|
| 1 | **修复波形数据发送 bug**：分析完成后对 audio 类型也发送 waveformData | ~5 行 | 波形恢复显示 |
| 2 | **视频分析中音频波形也发送**：videos:diff 返回的 audio_diff 波形推送到 webview | ~10 行 | 视频 diff 有音频波形 |
| 3 | **启用 audio/video 进度报告**：移除 `mediaType !== 'audio'` 过滤 | 删 2 行 | 用户看到分析进度 |

### Phase 2：Engine 拆分与并行

| # | 优化 | 工作量 | 收益 |
|---|------|-------|------|
| 4 | **Engine 新增 `audios:probe`**：快速返回 duration/sampleRate | Rust 中等 | Probe 提前，UI 立即显示时间轴 |
| 5 | **Engine 新增 `audios:waveform`**：只生成波形峰值不计算 SNR | Rust 中等 | 波形可在 SNR 之前渲染 |
| 6 | **Engine `videos:diff` 内 SSIM \|\| PSNR 并行**：两个 FFmpeg 进程并行 | Rust 中等 | **分析时间减少 30-50%** |
| 7 | **Extension 层并行调度**：Probe + 波形 \|\| 精确分析 | TS 中等 | 波形提前 5-30s 显示 |

### Phase 3：流式/渐进式

| # | 优化 | 工作量 | 收益 |
|---|------|-------|------|
| 8 | **Engine 流式帧指标返回**：SSIM 每处理 N 帧回调一次 | Rust 大 | 视频帧相似度渐进显示 |
| 9 | **高精度波形（zoom 按需加载）**：800 点不够时 zoom 再请求更多 | 全栈 中等 | 深度 zoom 下波形不失真 |

## 六、已确认的 Bug

### BUG-1：波形数据发送逻辑错误

**位置**：`MediaDiffMessageHandler.ts` 第 157-159 行

```typescript
// Send visualization data for non-video/audio types (video/audio already sent above)
if (mediaType !== 'video' && mediaType !== 'audio') {
    await this.sendVisualizationData(result, ref);
}
```

**问题**：
1. 第 124 行用 dummy DiffResult（无 visualization）调用 `sendVisualizationData` → 发送空波形
2. 分析完成后显式跳过 audio/video 的二次发送
3. webview 只从 `mediaDiff:waveformData` 读取波形，不从 `mediaDiff:result` 提取

**影响**：音频波形永远为空数组，触发随机数 fallback。

### BUG-2：initializeLocalDiff 同样问题

**位置**：`MediaDiffMessageHandler.ts` 第 260-263 行，同样的跳过逻辑。
