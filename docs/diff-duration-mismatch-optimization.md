# 视频/音频 Diff 时长不匹配优化

> 关联：[diff.md](./diff.md) · [diff-range-usage.md](./diff-range-usage.md)

## 问题背景

用户反馈：对比 120s 和 5s 的视频时，即使使用 1fps 采样，仍需要 50+ 秒。

**根本原因**：
- FFmpeg 需要处理整个长视频（120s）
- 即使短视频只有 5 帧，长视频仍有 120 帧需要处理
- 没有智能范围选择，浪费计算资源

## 解决方案

### 智能范围选择策略

当两个媒体文件时长差异 > 20% 时，自动限制对比范围为**较短文件的时长**。

```typescript
// 1. 快速 probe 获取时长
const probeA = await engineMediaService.probe('videos', pathA);
const probeB = await engineMediaService.probe('videos', pathB);
const durA = probeA?.duration ?? 0;
const durB = probeB?.duration ?? 0;

// 2. 计算时长比例
const minDur = Math.min(durA, durB);
const maxDur = Math.max(durA, durB);
const ratio = maxDur > 0 ? minDur / maxDur : 1;

// 3. 如果差异 > 20%，限制范围
if (ratio < 0.8 && minDur > 0) {
  diffOptions.endTime = minDur;
  console.log(`Duration mismatch: ${durA}s vs ${durB}s, limiting to ${minDur}s`);
}
```

### 实现位置

#### 1. TypeScript 层

**VideoDiffAnalyzer.ts**
- 添加 probe 调用获取时长
- 计算智能范围
- 传递 `endTime` 参数给 engine

**AudioDiffAnalyzer.ts**
- 同样的逻辑应用于音频对比

**EngineMediaService.ts**
- 添加 `probe()` 方法支持快速元数据获取

#### 2. Rust 层

已支持（无需修改）：
- `VideoDiffOptions.start_time` / `end_time`
- `AudioDiffOptions.start_time` / `end_time`
- FFmpeg `-ss` / `-to` / `-t` 参数裁剪

## 性能提升

| 场景 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 120s vs 5s 视频 | 50+ 秒 | ~5 秒 | 10x |
| 60min vs 10s 视频 | 数分钟 | ~10 秒 | 数十倍 |

**组合优化效果**：
- `sample_fps=1.0`：帧数减少 30x
- `endTime=minDuration`：处理时长减少 N x（N = 长视频/短视频比例）
- 总提升：30x × N

示例：60min vs 10s
- 原始：3600s × 30fps = 108K 帧
- sample_fps：3600s × 1fps = 3.6K 帧（30x）
- endTime：10s × 1fps = 10 帧（360x）
- **总提升：30 × 360 = 10,800x**

## 使用场景

### 自动触发

以下场景自动启用智能范围选择：
- Git 对比：新提交删除了大部分视频内容
- 版本对比：完整版 vs 预告片
- 测试对比：长视频 vs 短片段

### 手动控制

未来可在 UI 中暴露：
```typescript
// VideoDiffViewer 添加时间范围选择器
<TimeRangeSelector
  durationA={120}
  durationB={5}
  onRangeChange={(start, end) => {
    // 重新触发 diff
    triggerDiff({ startTime: start, endTime: end });
  }}
/>
```

## 注意事项

### 1. Probe 开销

- Probe 操作非常快（< 100ms）
- 相比完整 diff（数十秒），开销可忽略
- 已有缓存机制（TODO: Extension 侧缓存 diff 结果 metadata）

### 2. 语义准确性

智能范围选择的假设：
- **前 N 秒对比有意义**：适用于大部分场景
- **不适用场景**：视频主要内容在后半部分

未来改进：
- 支持用户手动指定对比范围
- 智能检测关键帧分布，选择最有代表性的片段

### 3. 相似度计算

当使用 `endTime` 限制范围时：
- 仅对比重叠部分的 SSIM/SNR
- 时长差异仍会影响最终相似度评分（penalty 机制）

```typescript
// 时长差异惩罚（已有逻辑）
const durationDiff = Math.abs(durationA - durationB);
const maxDuration = Math.max(durationA, durationB);
if (maxDuration > 0) {
  similarity *= 1 - (durationDiff / maxDuration) * 0.3;
}
```

## 相关文件

### 修改的文件
- `packages/neko-tools/packages/extension/src/media-diff/services/analyzers/VideoDiffAnalyzer.ts`
- `packages/neko-tools/packages/extension/src/media-diff/services/analyzers/AudioDiffAnalyzer.ts`
- `packages/neko-tools/packages/extension/src/services/EngineMediaService.ts`

### 已有支持（无需修改）
- `packages/neko-engine/packages/native-core/src/media_service/video_diff.rs`
- `packages/neko-engine/packages/native-core/src/media_service/audio_diff.rs`

## 未来优化

见 [TODO.md](../TODO.md) P2 部分：
- Timeline Diff 范围优化：前端 UI 暴露时间范围选择器
- Probe 冗余执行修复：Extension 侧缓存 diff 结果 metadata
- 智能关键帧采样：根据场景切换选择对比片段
