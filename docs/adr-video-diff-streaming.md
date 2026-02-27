# 视频 Diff 传输方案架构决策

> 决策日期: 2026-02-27
> 状态: 已批准
> 关联: docs/diff.md §4.1

## 问题

视频 diff 当前使用帧提取模式，每次 seek 走完整管线:

```
Rust HwAccelDecoder → NV12(GPU) → RGBA(GPU) → RGBA(CPU) → JPEG encode
→ Base64 → JSON → NAPI → Extension → postMessage → Blob URL → WebGL
```

问题:
- 单帧延迟 ~100ms，拖动时间轴卡顿
- 无法流畅播放 (达不到 24fps)
- 每次 seek 创建新 HwAccelDecoder，频繁导致 VideoToolbox 硬件解码器耗尽
- 无音频能力
- 7 次格式转换，CPU/GPU 开销大

## 决策

采用 H264+PCM 流传输方案 (decode→encode)，通过 WebSocket 直连 webview。

## 方案对比

### A: 帧提取 (当前)

```
User seek → postMessage → Extension → Rust decode → JPEG → Base64 → postMessage → Blob → WebGL
```

- 延迟: ~100ms/帧
- 播放: ❌
- WebGL: ✅ (JPEG→Image→texture)
- 音频: ❌
- 格式: ✅ 任意
- 资源: 高 (每帧 decode+encode+Base64)

### B: H264+PCM 流 (推荐)

```
Rust FFmpeg decode → VideoToolbox H264 encode → WebSocket → WebCodecs decode → VideoFrame → WebGL
```

- 延迟: 首帧 ~200ms (预缓冲)，后续 <16ms
- 播放: ✅ 60fps 硬件解码
- WebGL: ✅ (VideoFrame→texture, 零拷贝)
- 音频: ✅ (PCM→Web Audio)
- 格式: ✅ 任意 (Rust 转码)
- 资源: 低 (Rust 仅 encode，浏览器硬件 decode)

### C: 直接文件访问

```
webview.asWebviewUri → <video src="..."> → 浏览器原生播放
```

- 延迟: 最低
- 播放: ✅
- WebGL: ⚠️ CSP tainted canvas
- 音频: ✅
- 格式: ⚠️ 仅浏览器支持格式 (ProRes/DNxHR ❌)
- Seek: ⚠️ 非帧精确

致命问题: ProRes/DNxHR 等专业格式不支持，seek 非帧精确，CSP 限制像素读取。

## 为什么 decode→encode 而非 demux-only

源文件可能是各种格式:

| 格式 | WebCodecs 支持 | 专业场景常见度 |
|------|---------------|--------------|
| H.264 | ✅ | 高 |
| H.265 | ✅ (部分) | 高 |
| VP9/AV1 | ✅ | 中 |
| ProRes | ❌ | 极高 (Apple 生态) |
| DNxHR/DNxHD | ❌ | 高 (Avid 生态) |
| MJPEG | ❌ | 中 (相机) |
| FFV1 | ❌ | 低 (存档) |

Demux-only 仅提取原始编码数据，WebCodecs 无法解码 ProRes/DNxHR。

必须 decode→encode H264:
- macOS VideoToolbox 零拷贝路径: IOSurface → encode，~3ms/帧 (delta)
- GOP=1 All-Intra: 每帧都是关键帧，seek 零延迟
- 现有 `VideoService.start_stream()` 已实现完整管线

## 数据流

```
方案 A (当前, 7 次格式转换):
  Rust: Container → FFmpeg Decode → NV12(GPU) → RGBA(GPU) → RGBA(CPU) → JPEG(CPU) → Base64
  JS:   Base64 → Buffer → ArrayBuffer → Blob → Image → WebGL Texture

方案 B (推荐, 1 次格式转换):
  Rust: Container → FFmpeg Decode → NV12(GPU) → VideoToolbox H264 Encode → NALUs
  传输: WebSocket Binary [25B header + NAL data]
  JS:   NALUs → WebCodecs VideoDecoder → VideoFrame → WebGL Texture (零拷贝)
```

## 传输架构

```
Rust Engine                         Webview
  │                                   │
  │ start_stream(source, session_id)  │
  │ → HwAccelDecoder (任意格式)        │
  │ → HwAccelEncoder (H264, GOP=1)    │
  │ → broadcast::channel              │
  │ → StreamRegistry.register()       │
  │                                   │
  │   ws://127.0.0.1:PORT/v1/streams/:stream_id
  │ ──────────────────────────────────→│
  │                                   │
  │ Video: [pts:i64][dts:i64][key:u8] │
  │        [duration:i64][H264 NALs]  │ → H264StreamClient → VideoDecoder
  │                                   │
  │ Audio: [pts:i64][dur:i64][sr:u32] │
  │        [ch:u16][PCM f32le data]   │ → AudioStreamClient → Web Audio
  │                                   │
  │                                   │ FrameScheduler (A/V 同步)
  │                                   │ → Canvas / WebGL 渲染
```

## WebGL Shader 集成

VideoFrame 直接作为 WebGL 纹理源 (Chromium 原生支持):

```javascript
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame);
videoFrame.close();
```

Fragment Shader 三种对比模式 (与帧提取方案完全相同):
- Curtain: `uv.x < sliderPos ? texture(A, uv) : texture(B, uv)`
- Heatmap: `abs(texture(A, uv) - texture(B, uv))` → 色谱映射
- Flicker: requestAnimationFrame 交替绑定 A/B 纹理

双流同步: FramePairBuffer 按 PTS 配对两路 VideoFrame，配对成功才触发渲染。

## 可复用基础设施

| 组件 | 路径 | 复用方式 |
|------|------|----------|
| H264StreamClient | `neko-client/src/H264StreamClient.ts` | 添加 feedPacket() 方法适配 WebSocket |
| AudioStreamClient | `neko-client/src/AudioStreamClient.ts` | 添加 feedPacket() 方法适配 WebSocket |
| FrameScheduler | `neko-client/src/FrameScheduler.ts` | 直接复用 |
| VideoService.start_stream | `native-core/src/services/impls/video.rs:311` | 直接复用 |
| StreamRegistry | `native-api/src/registry/stream.rs` | 直接复用 |
| WebSocket endpoint | `native-http/src/routes/streaming.rs` | 直接复用 |
| pack_preview_frame | `native-core/src/preview/pipeline.rs:207` | 参考打包格式 |

## 风险与缓解

| 风险 | 评估 | 缓解 |
|------|------|------|
| postMessage 带宽 | H264 压缩率高，1080p@30fps ~5Mbps | WebSocket 二进制传输，无 Base64 开销 |
| Seek 延迟 | GOP=1 每帧关键帧 | 零延迟 seek |
| 双流同步 | 两路视频需帧精确同步 | FramePairBuffer PTS 配对 |
| WebCodecs 兼容性 | VSCode webview 基于 Chromium | 完整支持，无风险 |
| Webview CSP | WebSocket 连接需要 CSP 允许 | connect-src ws://127.0.0.1:* |

## 实施路径

1. neko-client 适配: H264StreamClient/AudioStreamClient 添加 feedPacket() 或 WebSocket 直连
2. Extension 层: MediaDiffMessageHandler 启动双流 (current + previous)
3. Webview 层: 双流 FramePairBuffer + WebGL shader 渲染
4. 帧提取降级: 保留为静态截图功能 (缩略图、关键帧预览)
