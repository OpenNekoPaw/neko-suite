# ADR: 媒体流播放关键 Bug 修复记录

> 记录非显而易见的设计决策，避免未来重蹈覆辙。

---

## 1. AAC 非标准声道配置导致音频解码器无法打开

**问题**：`avformat_find_stream_info` 在内部解码 AAC 探测包时，遇到 "channel element 2.7 is not allocated" 返回 `AVERROR_INVALIDDATA`，导致 `FfmpegAudioDecoder::open()` 整体失败（波形无法生成、时间线无音频）。

**根本原因**：`ffmpeg_next::format::input(&path)` 内部依次调用：
1. `avformat_open_input` — 读取容器头
2. `avformat_find_stream_info` — 解码探测包以确认编解码器参数

第 2 步对 MP4/M4A 文件是多余的（容器头已有完整参数），但对非标准 AAC 会失败。

**修复**（`native-core/src/audio/decoder.rs`）：
- `open()` 先尝试完整 `input(&path)`
- 若返回 `Error::InvalidData`，回退到 `open_input_no_probe()`：仅调用 `avformat_open_input`，跳过 `find_stream_info`
- 容器格式（MP4/M4A/MOV/MKV）的编解码参数已在容器头中，无需探测

**注意**：每帧解码时 `send_packet()` 仍可能返回 `AVERROR_INVALIDDATA`（"channel element" 错误）。`decode_next()` 对此类包执行 `continue`（跳过）而非传播错误，使解码继续正常推进。

---

## 2. Seek 后 H264 连续解码错误累积导致流关闭

**问题**：快速拖动播放头时，旧 seek 遗留的解码错误计数 `consecutive_decode_errors` 未清零。新 seek 后的前几帧若解码失败，累积计数超阈值（5 次），触发流关闭。

**修复**（`native-core/src/services/impls/video.rs`）：
- 在 seek 处理块中检测到新 `seek_seq` 时，立即重置 `consecutive_decode_errors = 0`
- 每次 seek 获得独立的错误预算，与上一次 seek 的错误无关

---

## 3. 播放期间每帧触发解码器重置（30fps Seek 循环）

**问题**：时间线播放时视频永远无法渲染。

**根本原因**（两个组件的交互）：

```
App.tsx rAF tick（每帧 ~33ms）
  → seek(newTime)  # 更新 store.currentTime 用于播放头 UI

PreviewPanel useEffect([currentTime, isPlaying, ...])
  → resetDecoder()               # H264 客户端重置
  → postMessage(resume, {startTime: currentTime})  # 服务器从新位置重启流
```

每帧都重置解码器 + 重启服务器流 → 解码器等待关键帧 → 关键帧到达 → currentTime 再次更新 → 循环。

**修复**（`PreviewPanel.tsx`）：

在 seek useEffect 中区分"正常播放推进"和"实际 Seek"：
- `isPlaying && delta > 0 && delta ≤ 0.5s` → 正常播放帧推进，**跳过**重置和流重启
- 其余情况（后退、大幅跳转 >0.5s、暂停时）→ 执行完整的重置流程

**不变式**：`lastRenderedTimeRef` 在两种情况下都更新，防止 TIME_TOLERANCE 检查退化。

---

## 关联文件

| 文件 | 变更 |
|------|------|
| `native-core/src/audio/decoder.rs` | open() 探测失败回退、decode_next() 跳过 InvalidData 包 |
| `native-core/src/services/impls/video.rs` | seek 时重置 consecutive_decode_errors |
| `neko-cut/webview/src/components/PreviewPanel.tsx` | 播放推进不触发解码器重置 |
