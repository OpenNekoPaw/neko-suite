# 视频流卡顿与音视频不同步问题分析

## 问题 1：视频播放每隔几秒卡顿一次

### 根因：编码器 pipeline delay + FramePacer 的 Delay 策略

**关键代码**：`video.rs:405-503`（解码循环）

```
每次 pacer tick:
  1. spawn_blocking { decode_next_gpu() + encode_frame_gpu() }
  2. 如果 encoder 返回空（EAGAIN）→ continue（跳过本 tick）
  3. 如果 encoder 返回多个 packet → 一次性全部 send
```

**问题链**：

1. **编码器 pipeline delay**：H.264 编码器内部有缓冲，`encode_frame_gpu()` 不是每次都返回 packet。前几帧可能返回空（EAGAIN），然后某一帧突然返回多个 packet。这导致帧到达客户端是**突发式**的。

2. **Keyframe 编码耗时不均匀**：GOP size = 30，每 30 帧一个 keyframe。Keyframe 数据量远大于 delta frame（从日志看 keyframe ~165KB vs delta ~88B-50KB），编码耗时更长。

3. **FramePacer 的 `MissedTickBehavior::Delay`**：当 decode+encode 耗时超过 tick 间隔（33ms@30fps）时，下一个 tick 被延迟而非跳过。这意味着：
   - 正常帧：decode+encode < 33ms → 按时推送
   - Keyframe：decode+encode > 33ms → tick 延迟 → 后续帧堆积
   - 堆积释放时一次性推送多帧 → 客户端看到"卡一下然后快进"

4. **spawn_blocking 开销**：每帧都 `spawn_blocking` 获取/释放 Mutex，有线程调度开销。

### 修复方案

```
方案 A：解耦 decode 和 encode（推荐）
┌──────────┐    channel    ┌──────────┐    channel    ┌──────────┐
│ Decoder  │ ──────────→  │ Encoder  │ ──────────→  │ Pacer+TX │
│ (尽快解码)│              │ (尽快编码)│              │ (按fps发送)│
└──────────┘              └──────────┘              └──────────┘

- Decoder 和 Encoder 各自在独立线程全速运行
- Pacer 只控制最终发送速率，从 encoded buffer 中按 fps 取帧
- Keyframe 编码慢不会阻塞 pacer tick
```

```
方案 B：最小改动 — 改用 MissedTickBehavior::Skip
- 当 tick 被错过时跳过而非延迟
- 避免帧堆积，但可能丢帧
- 适合实时预览场景
```

```
方案 C：预编码 buffer
- 维护一个小的 encoded frame ring buffer（如 5-10 帧）
- Pacer tick 从 buffer 取帧发送
- Decode+encode 在后台持续填充 buffer
- Buffer 满时暂停解码，空时恢复
```

---

## 问题 2：音视频不同步，音频滞后数十秒

### 根因：视频流和音频流完全独立，无时钟同步

**架构现状**：

```
用户点击 Play
  ├→ videos:stream  → VideoService::start_stream()  → 独立 FramePacer(fps=30)
  └→ audios:stream  → AudioService::start_stream()  → 独立 FramePacer(fps=50)
```

两个流的问题：

1. **启动时间不同步**：用户分别触发 video:stream 和 audio:stream，两个 API 调用有时间差（几十到几百毫秒）。

2. **推进速率不同步**：
   - 视频：每 tick 做 GPU decode + H.264 encode，耗时不固定（keyframe 慢）
   - 音频：每 tick 做 FFmpeg audio decode，耗时很短且稳定
   - 视频实际推进速度 < 1x（因为编码开销），音频 ≈ 1x
   - 随时间推移，音频逐渐超前视频

3. **无共享时钟**：两个流没有任何同步机制（如 PTS 对齐、主时钟参考等）。

4. **Webview 端也无同步**：
   - `VideoPlayer.tsx` 用 `performance.now()` 估算播放时间
   - `AudioPlayer.tsx` 用 `AudioContext.currentTime` 跟踪时间
   - 两者完全独立，没有交叉参考

### 修复方案

```
方案 A：统一流模式（推荐）
┌─────────────────────────────────────────────┐
│ MediaStreamService (新增)                     │
│                                               │
│  ┌──────────┐  ┌──────────┐                  │
│  │ Video    │  │ Audio    │                  │
│  │ Decoder  │  │ Decoder  │                  │
│  └────┬─────┘  └────┬─────┘                  │
│       │              │                        │
│       └──────┬───────┘                        │
│              │                                │
│       ┌──────▼──────┐                         │
│       │ Master Clock│  ← 以视频 PTS 为主时钟   │
│       │ (PTS-based) │                         │
│       └──────┬──────┘                         │
│              │                                │
│    ┌─────────┼─────────┐                      │
│    │         │         │                      │
│  ┌─▼──┐  ┌──▼──┐  ┌──▼──┐                   │
│  │ V   │  │ A   │  │Sync │                   │
│  │ TX  │  │ TX  │  │Info │                   │
│  └─────┘  └─────┘  └─────┘                   │
│                                               │
└─────────────────────────────────────────────┘

- 单个 API 调用同时启动视频和音频流
- 共享 Master Clock（以视频 PTS 为基准）
- 音频根据视频 PTS 调整推送节奏
- 返回 videoStreamId + audioStreamId 给客户端
```

```
方案 B：PTS 对齐（中等改动）
- 保持两个独立流
- 音频流参考视频流的当前 PTS
- 音频 pacer 根据视频 PTS 动态调整速率
- 需要共享状态（如 Arc<AtomicI64> 存储视频当前 PTS）
```

```
方案 C：客户端同步（最小改动）
- 服务端不变
- Webview 端根据视频帧的 PTS 调整音频播放位置
- 当音视频 PTS 差异 > 阈值时，跳过/重复音频帧
- 类似视频播放器的 A/V sync 逻辑
```

---

## 建议优先级

| 优先级 | 问题 | 方案 | 工作量 |
|--------|------|------|--------|
| P0 | 视频卡顿 | 方案 B（Skip） | 1 行代码 |
| P0 | 视频卡顿 | 方案 C（预编码 buffer） | ~50 行 |
| P1 | 音视频同步 | 方案 A（统一流） | ~200 行 |
| P2 | 视频卡顿 | 方案 A（解耦 pipeline） | ~150 行 |
