# P0 修复计划：视频卡顿 + 音视频同步

## 修改 1：视频卡顿 — 预编码 buffer + Skip 策略

**文件**: `native-core/src/services/impls/video.rs` (start_stream 方法)

**思路**：
- 将 decode+encode 从 pacer tick 中解耦
- 后台线程全速 decode+encode，产出帧放入 ring buffer
- Pacer tick 只从 buffer 取帧发送，不做重计算
- Buffer 满时后台暂停，空时恢复

**具体改动**：

```rust
// 当前（有问题）：
loop {
    pacer.tick() => {
        // 在 tick 内做 decode + encode（阻塞）
        spawn_blocking { decode_next_gpu() + encode_frame_gpu() }
        tx.send(frame);
    }
}

// 改为：
// 1. 后台 producer 线程：全速 decode+encode → 写入 mpsc channel
// 2. 前台 consumer 循环：pacer.tick() → 从 channel 取帧 → tx.send()
```

实现要点：
- 用 `tokio::sync::mpsc::channel(buffer_size)` 作为中间 buffer（如 10 帧）
- Producer 是 spawn 的 blocking task，持续 decode+encode
- Consumer 是 async 循环，按 pacer 节拍从 mpsc 取帧
- mpsc 满时 producer 自然背压暂停
- 支持 pause/seek/speed 控制信号传递给 producer

## 修改 2：音视频同步 — 统一流 + PTS 主时钟

**文件**: `native-core/src/services/impls/video.rs` (start_stream 方法)

**思路**：
- VideoService::start_stream 同时启动音频解码
- 用视频 PTS 作为主时钟
- 音频帧根据视频 PTS 对齐推送
- 返回两个 stream_id（video + audio）

但这改动太大，更实际的方案是：

**方案 B（PTS 对齐，最小改动）**：
- 保持两个独立流
- 在 VideoController::stream action 中同时启动 video 和 audio 流
- 音频 pacer 不用固定 50fps，而是根据音频帧自身的 timestamp 控制推送时机
- 两个流共享同一个"播放起始时间"参考点

实际上更根本的问题是：**音频 pacer 用固定 50fps 是错误的**。
- 音频每次 decode_next 返回 1024 samples @ 44100Hz = 23.2ms
- 以 50fps（20ms/tick）推送，音频推进速度 = 23.2/20 = 1.16x（快 16%）
- 应该根据音频帧的实际 duration 来 pace

**修复方案**：
1. 音频 pacer 改为根据 `frame.samples / sample_rate` 动态调整 tick 间隔
2. VideoController 的 stream action 同时启动 audio stream（如果有音频轨道）
3. 两个流同时启动，消除启动时间差

## 需要修改的文件

| 文件 | 变更 |
|------|------|
| `native-core/src/services/impls/video.rs` | start_stream: 解耦 decode/encode 为 producer-consumer |
| `native-core/src/services/impls/audio.rs` | start_stream: 音频 pacer 改为基于帧 duration |
| `native-api/src/controllers/video.rs` | stream action: 同时启动音频流 |

## 验证

1. cargo build
2. cargo test
3. 启动服务器，用 test_stream.html 测试 RWBY1Red.mp4
4. 检查视频是否流畅（无周期性卡顿）
5. 检查音视频是否同步（音频不再滞后）
