# 修复视频卡顿 + 音视频同步

## 当前状态

后端 `videos:stream` 和 `audios:stream` 的 action、controller、service、StreamRegistry 注册都已完备。
这是 video/audio 独立的流播放问题，与 timeline 无关。

### 问题 1：视频卡顿
`VideoService.start_stream()` 每帧 `spawn_blocking` + `MissedTickBehavior::Delay` 导致周期性延迟累积。

### 问题 2：无音频播放 + 无同步
- `PreviewService.startVideoPlayback()` 只启动了 `videos:stream`，没有启动 `audios:stream`
- 前端没有音频播放逻辑
- 音频流的 wire format 缺少 header — WebSocket 只发送 `frame.data`（裸 PCM），`timestamp/sampleRate/channels` 信息丢失

---

## Part 1：修复视频卡顿

### 1.1 新增 `WallClockPacer`

**文件**: `native-core/src/services/impls/stream_loop.rs`

在现有 `FramePacer` 之后新增，用于 blocking 线程内的帧节奏控制：

```rust
pub struct WallClockPacer {
    start_time: Instant,
    frame_number: u64,
    fps: f64,
    speed: f64,
}
```

- 基于 `Instant` + `std::thread::sleep` 做 wall-clock 对齐
- 落后时立即返回（不跳帧，自然追赶）
- 支持 `update_speed()` 和 `reset()`

### 1.2 重写 `VideoService.start_stream()` 帧循环

**文件**: `native-core/src/services/impls/video.rs`

将当前的 `tokio::spawn { loop { pacer.tick().await; spawn_blocking { decode+encode } } }` 改为整个循环在一个 `spawn_blocking` 中：

- decoder/encoder 直接持有，无需 `Arc<Mutex<>>`
- 用 `WallClockPacer` 做帧节奏
- 通过 `cancel_token.is_cancelled()` 检查取消
- 通过 `state_rx.borrow()` 读取 playback state（watch channel 支持跨线程）

注意：`spawn_blocking` 返回 `JoinHandle<()>` 可直接用于 `StreamLoopHandle`。

### 1.3 同步改造 `AudioService.start_stream()`

**文件**: `native-core/src/services/impls/audio.rs`

同样改为专用 blocking 线程 + `WallClockPacer`，保持一致性。

---

## Part 2：音视频同步

### 2.1 音频流添加 wire format header

**文件**: `native-core/src/services/impls/stream_loop.rs`

新增 `pack_pcm_frame()` 函数，类似 `pack_h264_frame()`：

```
Wire format: [pts_f64: f64 LE (8B)] [sample_rate: u32 LE (4B)] [channels: u32 LE (4B)] [PCM F32 data...]
```

Header = 16 bytes，format 标记为 `FrameFormat::PcmF32`（需要在 neko_types 中新增）。

### 2.2 修改 `AudioService.start_stream()` 使用 `pack_pcm_frame()`

**文件**: `native-core/src/services/impls/audio.rs`

将当前直接构造 FrameData（hack width=sampleRate, height=channels）改为使用 `pack_pcm_frame()`。

### 2.3 `FrameFormat` 新增 `PcmF32` 变体

**文件**: `neko-engine/packages/types/src/frame.rs`（或 `FrameFormat` 定义所在文件）

新增 `PcmF32` 变体，用于区分音频帧和视频帧。

### 2.4 `PreviewService` 同时启动视频和音频流

**文件**: `neko-preview/packages/extension/src/services/PreviewService.ts`

修改 `startVideoPlayback()`：
- 同时 dispatch `videos:stream` 和 `audios:stream`（如果 `mediaInfo.hasAudio`）
- 新增 `_activeAudioStreamId` 字段
- `stopPlayback()` 同时停止两个流
- 返回 `{ videoStreamId, audioStreamId }` 给调用方

### 2.5 `VideoPreviewProvider` 传递音频流 URL

**文件**: `neko-preview/packages/extension/src/providers/VideoPreviewProvider.ts`

修改 `preview:play` handler，将 `audioStreamId` + `audioStreamUrl` 也发送给 webview。

### 2.6 新建 `AudioStreamClient`

**文件**: `neko-preview/packages/webview/src/shared/AudioStreamClient.ts`（新建）

通过 WebSocket 接收带 header 的 PCM F32 数据，用 Web Audio API 播放：
- 解析 wire format header（pts, sampleRate, channels）
- 用 `AudioBufferSourceNode` 调度播放
- 提供 `getCurrentTime(): number` 作为 master clock
- 支持 volume 控制（GainNode）
- 支持 dispose()

### 2.7 `VideoPlayer` 集成音频播放 + A/V 同步

**文件**: `neko-preview/packages/webview/src/video/VideoPlayer.tsx`

- 收到 `preview:streamReady` 时同时创建 `AudioStreamClient`
- 以 `audioClient.getCurrentTime()` 替代 `performance.now()` 驱动时间轴
- volume 控制连接到 `AudioStreamClient`

---

## 需要修改的文件

| # | 文件 | 变更 |
|---|------|------|
| 1 | `native-core/src/services/impls/stream_loop.rs` | 新增 `WallClockPacer` + `pack_pcm_frame()` |
| 2 | `native-core/src/services/impls/video.rs` | 重写 `start_stream()` 帧循环 |
| 3 | `native-core/src/services/impls/audio.rs` | 重写 `start_stream()` + 使用 `pack_pcm_frame()` |
| 4 | `neko-engine/packages/types/src/...` | `FrameFormat` 新增 `PcmF32` |
| 5 | `neko-preview/.../PreviewService.ts` | 同时启动 video + audio stream |
| 6 | `neko-preview/.../VideoPreviewProvider.ts` | 传递 audioStreamUrl |
| 7 | `neko-preview/.../AudioStreamClient.ts` | 新建：WebSocket PCM 播放 + master clock |
| 8 | `neko-preview/.../VideoPlayer.tsx` | 集成音频 + A/V 同步 |

## 实施顺序

1. Part 1.1：新增 WallClockPacer
2. Part 1.2：重写 VideoService.start_stream()
3. Part 2.1 + 2.3：pack_pcm_frame() + FrameFormat::PcmF32
4. Part 1.3 + 2.2：重写 AudioService.start_stream()
5. cargo build + cargo test 验证后端
6. Part 2.4-2.5：PreviewService + VideoPreviewProvider
7. Part 2.6：AudioStreamClient
8. Part 2.7：VideoPlayer 集成
9. 前端编译验证
