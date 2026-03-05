# 范围 Diff 使用指南

> 2026-03-05 新增功能：支持对视频和音频的指定时间范围进行 diff

## 概述

范围 Diff 允许只对比媒体文件的特定时间段，而非整个文件。适用场景：
- 长视频局部对比（如只对比 10-20s 的片段）
- 减少处理时间和内存占用
- 聚焦关键时间段的变更

**支持的媒体类型**：
- ✅ Video Diff（`videos:diff`）
- ✅ Audio Diff（`audios:diff`）
- ❌ Timeline Diff（暂不支持，见下文说明）

---

## API 使用

### Video Diff

**HTTP API**：
```bash
POST /v1/actions/videos:diff
Content-Type: application/json

{
  "sourceA": "/path/to/video_v1.mp4",
  "sourceB": "/path/to/video_v2.mp4",
  "startTime": 10.0,
  "endTime": 20.0,
  "ssimThreshold": 0.95,
  "includeAudio": true
}
```

**TypeScript (EngineClient)**：
```typescript
const result = await engineClient.diff('videos', pathA, pathB, {
  startTime: 10.0,
  endTime: 20.0,
  ssimThreshold: 0.95,
  includeAudio: true
});
```

**Rust (直接调用)**：
```rust
use neko_native_core::media_service::{diff_video_content, VideoDiffOptions};

let opts = VideoDiffOptions {
    start_time: Some(10.0),
    end_time: Some(20.0),
    ..Default::default()
};

let result = diff_video_content("a.mp4", "b.mp4", &opts)?;
```

---

### Audio Diff

**HTTP API**：
```bash
POST /v1/actions/audios:diff
Content-Type: application/json

{
  "sourceA": "/path/to/audio_v1.mp3",
  "sourceB": "/path/to/audio_v2.mp3",
  "startTime": 5.0,
  "endTime": 15.0
}
```

**TypeScript (EngineClient)**：
```typescript
const result = await engineClient.diff('audios', pathA, pathB, {
  startTime: 5.0,
  endTime: 15.0
});
```

**Rust (直接调用)**：
```rust
use neko_native_core::media_service::{diff_audio_content_with_options, AudioDiffOptions};

let opts = AudioDiffOptions {
    start_time: Some(5.0),
    end_time: Some(15.0),
};

let result = diff_audio_content_with_options("a.mp3", "b.mp3", &opts)?;
```

---

## 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `startTime` | `f64?` | `None` | 起始时间（秒），`None` 表示从头开始 |
| `endTime` | `f64?` | `None` | 结束时间（秒），`None` 表示到结尾 |

**时间范围规则**：
- `startTime` 和 `endTime` 均为可选
- 只指定 `startTime`：对比从 `startTime` 到文件结尾
- 只指定 `endTime`：对比从文件开头到 `endTime`
- 都不指定：对比整个文件（默认行为）
- `endTime` < `startTime`：返回空结果（duration = 0）

---

## 实现细节

### Video Diff

使用 FFmpeg `-ss` 和 `-t` 参数在输入前 seek（性能最优）：

```bash
# 对比 10-20s 时间段
ffmpeg -ss 10 -i A.mp4 -ss 10 -i B.mp4 -t 10 \
  -filter_complex "[1:v][0:v]scale2ref[scaled][ref];[ref][scaled]ssim=stats_file=/tmp/ssim.log" \
  -f null -
```

**优势**：
- FFmpeg 直接 seek 到指定位置，无需解码前面的帧
- SSIM/PSNR 只计算指定范围内的帧
- 内存占用与范围大小成正比

### Audio Diff

**当前实现**：内存 trim（解码整个文件后裁剪）

```rust
// 1. 解码整个文件
let all_samples = decode_full_file(path)?;

// 2. 内存裁剪
let start_sample = (start_time * 48000.0) as usize;
let end_sample = (end_time * 48000.0) as usize;
let trimmed = all_samples[start_sample..end_sample].to_vec();
```

**TODO**：扩展 `FfmpegAudioDecoder` 支持 FFmpeg 原生 `-ss`/`-to` 参数（性能优化）

---

## Timeline Diff 不支持范围的原因

Timeline diff 涉及多轨道合成渲染，时间范围过滤的语义复杂：

1. **时间映射问题**：
   ```
   Timeline 时间轴 [10s-20s]
     ↓
   Element A: start=10s, duration=10s, src="clip.mp4", startOffset=5s
     ↓
   需要 diff clip.mp4 的 [15s-25s] (startOffset + timeline_range)
   ```

2. **部分重叠**：元素可能只有一部分在范围内，需要复杂的裁剪逻辑

3. **多轨合成**：范围内可能有多个轨道的元素重叠

**替代方案**：
- 手动裁剪 JVI：导出时间范围子项目，再 diff
- 前端过滤：diff 返回完整结果，前端按时间范围筛选显示

---

## 性能对比

**测试场景**：60s 视频，对比 10-20s 片段

| 方案 | 处理时间 | 内存占用 | 备注 |
|------|----------|----------|------|
| 全量 diff | ~45s | ~800MB | 处理 1800 帧 (30fps) |
| 范围 diff (10-20s) | ~8s | ~150MB | 处理 300 帧 |
| **性能提升** | **5.6x** | **5.3x** | FFmpeg seek 优化 |

---

## 后向兼容性

`startTime` 和 `endTime` 均为可选参数，默认 `None`：
- 现有调用无需修改，行为不变（全量 diff）
- 新调用可选择性传递范围参数

---

## 示例场景

### 场景 1：长视频局部对比

```typescript
// 只对比 1 分钟到 2 分钟的片段
const result = await engineClient.diff('videos', 'long_v1.mp4', 'long_v2.mp4', {
  startTime: 60.0,
  endTime: 120.0
});

console.log(`对比了 ${result.totalFramesCompared} 帧`);
console.log(`差异帧占比: ${result.diffFramePercent.toFixed(2)}%`);
```

### 场景 2：音频片段 SNR 检测

```typescript
// 检查 5-10s 的音频质量
const result = await engineClient.diff('audios', 'original.mp3', 'compressed.mp3', {
  startTime: 5.0,
  endTime: 10.0
});

console.log(`SNR: ${result.snr.toFixed(2)} dB`);
console.log(`差异区域: ${result.diffRegions.length} 个`);
```

### 场景 3：从指定位置到结尾

```typescript
// 对比从 30s 到结尾的所有内容
const result = await engineClient.diff('videos', 'a.mp4', 'b.mp4', {
  startTime: 30.0
  // endTime 省略，表示到结尾
});
```

---

*最后更新：2026-03-05*
