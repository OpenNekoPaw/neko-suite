# media-processor-rs 测试文档

本文档包含 CLI、Server 和 NAPI 三种接口的测试用例。

---

## CLI 接口测试

**二进制名称**: `vedit-server`

### 1. serve 命令测试

#### 1.1 基本启动测试

```bash
# 测试：默认端口启动
vedit-server serve

# 预期：服务器在 8765 端口启动，输出类似：
# [INFO] Starting server on 127.0.0.1:8765
```

#### 1.2 自定义端口测试

```bash
# 测试：指定端口启动
vedit-server serve --port 9000

# 预期：服务器在 9000 端口启动
```

#### 1.3 详细日志测试

```bash
# 测试：启用详细日志
vedit-server serve --verbose

# 预期：输出包含 DEBUG 级别日志
```

#### 1.4 端口冲突测试

```bash
# 测试：端口被占用时的行为
# 先启动一个服务占用端口，再启动 vedit-server
vedit-server serve --port 8765

# 预期：报错提示端口已被占用
```

---

### 2. export 命令测试

#### 2.1 基本导出测试

```bash
# 测试：导出 .jvi 项目文件
vedit-server export \
  --jvi-file test.jvi \
  --output output.mp4

# 预期：成功导出视频文件，显示进度信息
```

#### 2.2 编码器参数测试

```bash
# 测试：指定编码器和比特率
vedit-server export \
  --jvi-file test.jvi \
  --output output.mp4 \
  --codec h264 \
  --bitrate 8000000 \
  --preset fast

# 预期：使用 H.264 编码器，8Mbps 比特率，fast 预设
```

#### 2.3 硬件编码器测试

```bash
# 测试：指定硬件编码器
vedit-server export \
  --jvi-file test.jvi \
  --output output.mp4 \
  --hw-encoder videotoolbox  # macOS

# 预期：使用 VideoToolbox 硬件加速编码
```

#### 2.4 不同编码格式测试

```bash
# H.265 编码
vedit-server export --jvi-file test.jvi --output output_h265.mp4 --codec h265

# VP9 编码
vedit-server export --jvi-file test.jvi --output output_vp9.webm --codec vp9

# ProRes 编码
vedit-server export --jvi-file test.jvi --output output_prores.mov --codec prores
```

#### 2.5 错误处理测试

```bash
# 测试：不存在的输入文件
vedit-server export --jvi-file nonexistent.jvi --output output.mp4

# 预期：报错提示文件不存在

# 测试：无效的编码器
vedit-server export --jvi-file test.jvi --output output.mp4 --codec invalid

# 预期：报错提示不支持的编码器
```

---

### 3. probe 命令测试

#### 3.1 文本格式输出测试

```bash
# 测试：探测视频文件（文本格式）
vedit-server probe --input video.mp4

# 预期输出：
# File: video.mp4
# Format: mov,mp4,m4a,3gp,3g2,mj2
# Duration: 120.5s
#
# Video:
#   Codec: h264
#   Resolution: 1920x1080
#   FPS: 30.0
#   Bitrate: 5000000 bps
#
# Audio:
#   Codec: aac
#   Sample Rate: 48000 Hz
#   Channels: 2
#   Bitrate: 128000 bps
```

#### 3.2 JSON 格式输出测试

```bash
# 测试：探测视频文件（JSON 格式）
vedit-server probe --input video.mp4 --format json

# 预期：输出结构化 JSON 数据
```

#### 3.3 纯音频文件测试

```bash
# 测试：探测音频文件
vedit-server probe --input audio.mp3

# 预期：只显示音频信息，无视频信息
```

#### 3.4 带字幕文件测试

```bash
# 测试：探测带字幕的视频
vedit-server probe --input video_with_subs.mkv --format json

# 预期：JSON 输出包含 subtitles 数组
```

---

### 4. extract 命令测试

#### 4.1 基本帧提取测试

```bash
# 测试：提取第 5 秒的帧
vedit-server extract \
  --input video.mp4 \
  --output frame.jpg \
  --time 5.0

# 预期：生成 frame.jpg 文件
```

#### 4.2 质量参数测试

```bash
# 测试：指定 JPEG 质量
vedit-server extract \
  --input video.mp4 \
  --output frame_hq.jpg \
  --time 5.0 \
  --quality 95

# 预期：生成高质量 JPEG（文件较大）
```

#### 4.3 缩放测试

```bash
# 测试：提取并缩放
vedit-server extract \
  --input video.mp4 \
  --output thumbnail.jpg \
  --time 10.0 \
  --width 320 \
  --height 180

# 预期：生成 320x180 的缩略图
```

#### 4.4 边界条件测试

```bash
# 测试：提取第 0 秒（首帧）
vedit-server extract --input video.mp4 --output first.jpg --time 0.0

# 测试：提取超出时长的时间点
vedit-server extract --input video.mp4 --output last.jpg --time 9999.0

# 预期：提取最后一帧或报错
```

---

## Server 接口测试

**基础 URL**: `http://127.0.0.1:8765`

### 1. 健康检查测试

```bash
# 测试：健康检查端点
curl http://127.0.0.1:8765/health

# 预期响应：200 OK，内容 "OK"
```

---

### 2. 导出 API 测试

#### 2.1 启动导出任务

```bash
# 测试：启动导出任务
curl -X POST http://127.0.0.1:8765/export/start \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "test-job-001",
    "outputPath": "/tmp/output.mp4",
    "settings": {
      "width": 1920,
      "height": 1080,
      "fps": 30.0,
      "videoCodec": "h264",
      "videoBitrate": 5000000,
      "audioCodec": "aac",
      "audioBitrate": 128000
    },
    "timeline": {
      "duration": 10.0,
      "tracks": []
    }
  }'

# 预期响应：
# {"jobId": "test-job-001", "totalFrames": 300}
```

#### 2.2 查询导出状态

```bash
# 测试：查询任务状态
curl http://127.0.0.1:8765/export/status/test-job-001

# 预期响应：包含 progress 对象的 JSON
```

#### 2.3 取消导出任务

```bash
# 测试：取消任务
curl -X POST http://127.0.0.1:8765/export/cancel/test-job-001

# 预期响应：{"success": true}
```

#### 2.4 WebSocket 进度订阅

```javascript
// 测试：WebSocket 实时进度
const ws = new WebSocket('ws://127.0.0.1:8765/export/progress');

ws.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  console.log(`Job ${progress.jobId}: ${progress.progress}%`);
};

// 预期：收到实时进度更新消息
```

---

### 3. 关键帧缓存 API 测试

#### 3.1 预热缓存

```bash
# 测试：预缓存关键帧
curl -X POST http://127.0.0.1:8765/keyframes/warmup \
  -H "Content-Type: application/json" \
  -d '{
    "playhead": 10.5,
    "maxFrames": 10,
    "sources": [{"path": "/path/to/video.mp4", "priority": 1}]
  }'

# 预期响应：{"cachedCount": 8, "totalRequested": 10}
```

#### 3.2 查询缓存状态

```bash
# 测试：获取缓存状态
curl http://127.0.0.1:8765/keyframes/status

# 预期响应：包含 totalCached, cacheSize, sources 的 JSON
```

#### 3.3 Seek 查询

```bash
# 测试：查找最近缓存帧
curl -X POST http://127.0.0.1:8765/keyframes/seek \
  -H "Content-Type: application/json" \
  -d '{
    "sourcePath": "/path/to/video.mp4",
    "targetTime": 15.5
  }'

# 预期响应：{"cacheHit": true, "keyframeTime": 15.0, ...}
```

#### 3.4 获取 IDR 帧列表

```bash
# 测试：获取 IDR 帧列表
curl "http://127.0.0.1:8765/keyframes/idr?source=/path/to/video.mp4"

# 预期响应：{"idrFrames": [{"time": 0.0, "pts": 0}, ...]}
```

#### 3.5 清空缓存

```bash
# 测试：清空所有缓存
curl -X POST http://127.0.0.1:8765/keyframes/clear

# 预期响应：200 OK
```

---

### 4. 帧提取 API 测试

#### 4.1 提取单帧

```bash
# 测试：提取帧为 JPEG
curl "http://127.0.0.1:8765/frame/extract?source=/path/to/video.mp4&time=5.0&quality=90" \
  --output frame.jpg

# 预期：下载 JPEG 图片
```

#### 4.2 合成多层帧

```bash
# 测试：合成多个视频层
curl -X POST http://127.0.0.1:8765/frame/composite \
  -H "Content-Type: application/json" \
  -d '{
    "width": 1920,
    "height": 1080,
    "layers": [
      {"source": "/path/to/video1.mp4", "time": 5.0, "opacity": 1.0},
      {"source": "/path/to/video2.mp4", "time": 10.0, "opacity": 0.5, "blendMode": "overlay"}
    ],
    "quality": 85
  }' \
  --output composite.jpg

# 预期：下载合成后的 JPEG 图片
```

---

### 5. 媒体探测 API 测试

#### 5.1 JSON 格式探测测试

```bash
# 测试：探测视频文件（JSON 格式，默认）
curl "http://127.0.0.1:8765/probe?source=/path/to/video.mp4"

# 预期响应：
# {
#   "duration": 120.5,
#   "format": "mov,mp4,m4a,3gp,3g2,mj2",
#   "video": {
#     "codec": "h264",
#     "width": 1920,
#     "height": 1080,
#     "fps": 30.0,
#     "bitrate": 5000000
#   },
#   "audio": {
#     "codec": "aac",
#     "sampleRate": 48000,
#     "channels": 2,
#     "bitrate": 128000
#   }
# }
```

#### 5.2 文本格式探测测试

```bash
# 测试：探测视频文件（文本格式）
curl "http://127.0.0.1:8765/probe?source=/path/to/video.mp4&format=text"

# 预期响应：
# File: /path/to/video.mp4
# Format: mov,mp4,m4a,3gp,3g2,mj2
# Duration: 120.50s
#
# Video:
#   Codec: h264
#   Resolution: 1920x1080
#   FPS: 30.00
#   Bitrate: 5000000 bps
#
# Audio:
#   Codec: aac
#   Sample Rate: 48000 Hz
#   Channels: 2
#   Bitrate: 128000 bps
```

#### 5.3 纯音频文件探测测试

```bash
# 测试：探测音频文件
curl "http://127.0.0.1:8765/probe?source=/path/to/audio.mp3"

# 预期响应：JSON 中只有 audio 字段，无 video 字段
# {
#   "duration": 180.5,
#   "format": "mp3",
#   "audio": {
#     "codec": "mp3",
#     "sampleRate": 44100,
#     "channels": 2,
#     "bitrate": 320000
#   }
# }
```

#### 5.4 带字幕文件探测测试

```bash
# 测试：探测带字幕的视频
curl "http://127.0.0.1:8765/probe?source=/path/to/video_with_subs.mkv"

# 预期响应：JSON 包含 subtitles 数组
# {
#   "duration": 7200.0,
#   "format": "matroska,webm",
#   "video": { ... },
#   "audio": { ... },
#   "subtitles": [
#     {
#       "index": 2,
#       "codec": "subrip",
#       "language": "eng",
#       "title": "English",
#       "isDefault": true,
#       "isForced": false
#     },
#     {
#       "index": 3,
#       "codec": "ass",
#       "language": "chi",
#       "title": "Chinese",
#       "isDefault": false,
#       "isForced": false
#     }
#   ]
# }
```

#### 5.5 错误处理测试

```bash
# 测试：探测不存在的文件
curl "http://127.0.0.1:8765/probe?source=/nonexistent/video.mp4"

# 预期响应：404 错误
# {"error": "File not found: /nonexistent/video.mp4", "code": 404}

# 测试：探测无效文件
curl "http://127.0.0.1:8765/probe?source=/path/to/invalid.txt"

# 预期响应：500 错误
# {"error": "Failed to open file: ...", "code": 500}
```

---

### 6. H.264 流式传输测试

```javascript
// 测试：WebSocket H.264 NAL 单元流
const ws = new WebSocket('ws://127.0.0.1:8765/ws/h264');
ws.binaryType = 'arraybuffer';

ws.onmessage = (event) => {
  const buffer = new Uint8Array(event.data);
  const view = new DataView(buffer.buffer);

  const pts = view.getBigInt64(0, true);
  const dts = view.getBigInt64(8, true);
  const isKeyframe = buffer[16];
  const nalData = buffer.slice(17);

  console.log(`Frame: pts=${pts}, keyframe=${isKeyframe}, size=${nalData.length}`);
};

// 预期：收到二进制 NAL 单元数据
```

---

## NAPI 接口测试

**包名**: `@vedit/media-processor-rs`

### 1. MediaProcessor 创建测试

```typescript
import { MediaProcessor } from '@vedit/media-processor-rs';

// 测试：创建实例
const processor = await MediaProcessor.create();
console.log('MediaProcessor created');

// 预期：成功创建实例，无报错
```

### 2. GPU 信息测试

```typescript
// 测试：获取 GPU 信息
const gpuInfo = processor.getGpuInfo();
console.log('GPU:', gpuInfo);

// 预期输出示例：
// { name: "Apple M1", vendor: "Apple", backend: "Metal", deviceType: "IntegratedGpu" }
```

### 3. 硬件加速检测测试

```typescript
// 测试：检测硬件加速能力
const hwAccel = processor.detectHwAccel();
console.log('HW Accel:', hwAccel);

// 预期输出示例：
// { decoders: ["videotoolbox"], encoders: ["h264_videotoolbox"], ... }
```

---

### 4. 媒体探测测试

#### 4.1 探测视频文件

```typescript
import { probeMedia } from '@vedit/media-processor-rs';

// 测试：探测视频文件
const info = probeMedia('/path/to/video.mp4');
console.log('Media Info:', info);

// 预期输出示例：
// {
//   duration: 120.5,
//   width: 1920,
//   height: 1080,
//   fps: 30.0,
//   codec: "h264",
//   format: "mov,mp4,m4a,3gp,3g2,mj2",
//   bitrate: 5000000,
//   hasAudio: true,
//   audioCodec: "aac",
//   audioSampleRate: 48000,
//   audioChannels: 2,
//   audioBitrate: 128000,
//   hasSubtitles: false,
//   subtitleStreams: []
// }
```

#### 4.2 探测纯音频文件

```typescript
// 测试：探测音频文件
const audioInfo = probeMedia('/path/to/audio.mp3');
console.log('Audio Info:', audioInfo);

// 预期输出：
// {
//   duration: 180.5,
//   width: 0,
//   height: 0,
//   fps: 0,
//   codec: "unknown",
//   format: "mp3",
//   hasAudio: true,
//   audioCodec: "mp3",
//   audioSampleRate: 44100,
//   audioChannels: 2,
//   audioBitrate: 320000,
//   hasSubtitles: false,
//   subtitleStreams: []
// }
```

#### 4.3 探测带字幕的视频

```typescript
// 测试：探测带字幕的 MKV 文件
const mkvInfo = probeMedia('/path/to/video_with_subs.mkv');
console.log('MKV Info:', mkvInfo);
console.log('Subtitles:', mkvInfo.subtitleStreams);

// 预期输出：
// subtitleStreams: [
//   { index: 2, codec: "subrip", language: "eng", title: "English", isDefault: true, isForced: false },
//   { index: 3, codec: "ass", language: "chi", title: "Chinese", isDefault: false, isForced: false }
// ]
```

#### 4.4 错误处理测试

```typescript
// 测试：探测不存在的文件
try {
  probeMedia('/nonexistent/video.mp4');
} catch (e) {
  console.log('Expected error:', e.message);
}

// 预期：抛出文件不存在错误
```

---

### 5. 视频解码测试

#### 5.1 解码单帧

```typescript
// 测试：解码指定时间点的帧
const frame = processor.decodeFrame(
  { path: '/path/to/video.mp4', hwAccel: 'auto', outputFormat: 'rgba' },
  5.0  // 5 秒处
);

console.log(`Frame: ${frame.width}x${frame.height}, format=${frame.format}`);
console.log(`Data size: ${frame.data.length} bytes`);

// 预期：返回 JsFrameData 对象，包含像素数据
```

#### 4.2 解码帧范围

```typescript
// 测试：批量解码帧
const frames = processor.decodeFrameRange(
  { path: '/path/to/video.mp4' },
  0.0,   // 开始时间
  1.0,   // 结束时间
  30.0   // FPS
);

console.log(`Decoded ${frames.length} frames`);

// 预期：返回约 30 帧数据
```

#### 4.3 零拷贝解码（macOS）

```typescript
// 测试：零拷贝解码
const frame = processor.decodeFrameZerocopy(
  { path: '/path/to/video.mp4' },
  5.0
);

// 预期：返回帧数据，性能优于普通解码
```

#### 4.4 解码到 GPU 纹理

```typescript
// 测试：解码到纹理
const texture = processor.decodeToTexture(
  { path: '/path/to/video.mp4' },
  5.0
);

console.log(`Texture: id=${texture.id}, ${texture.width}x${texture.height}`);

// 预期：返回 JsTextureHandle 对象
```

---

### 5. GPU 特效测试

#### 5.1 颜色校正

```typescript
// 测试：应用颜色校正
const corrected = processor.applyEffects(frame, {
  brightness: 0.1,
  contrast: 1.2,
  saturation: 1.1,
  exposure: 0.5,
  gamma: 1.0
});

// 预期：返回处理后的帧数据
```

#### 5.2 模糊效果

```typescript
// 测试：高斯模糊
const blurred = processor.applyBlur(frame, {
  blurType: 'gaussian',
  radius: 10
});

// 测试：方向模糊
const directionalBlur = processor.applyBlur(frame, {
  blurType: 'directional',
  radius: 20,
  directionX: 1.0,
  directionY: 0.0
});

// 测试：径向模糊
const radialBlur = processor.applyBlur(frame, {
  blurType: 'radial',
  radius: 15,
  centerX: 0.5,
  centerY: 0.5
});
```

#### 5.3 锐化效果

```typescript
// 测试：锐化
const sharpened = processor.applySharpen(frame, {
  amount: 1.5,
  radius: 1.0,
  threshold: 0.1
});
```

#### 5.4 暗角效果

```typescript
// 测试：暗角
const vignetted = processor.applyVignette(frame, {
  amount: 0.5,
  radius: 1.0,
  softness: 0.5
});
```

#### 5.5 胶片颗粒

```typescript
// 测试：胶片颗粒
const grainy = processor.applyFilmGrain(frame, {
  amount: 0.3,
  size: 1.5,
  colorAmount: 0.2
});
```

#### 5.6 辉光效果

```typescript
// 测试：辉光
const glowing = processor.applyGlow(frame, {
  intensity: 1.0,
  threshold: 0.7,
  radius: 20
});
```

#### 5.7 色差效果

```typescript
// 测试：色差
const aberrated = processor.applyChromaticAberration(frame, {
  amount: 0.02,
  angle: 0,
  centerX: 0.5,
  centerY: 0.5
});
```

---

### 6. 转场效果测试

```typescript
// 准备两帧
const fromFrame = processor.decodeFrame({ path: '/path/to/video1.mp4' }, 5.0);
const toFrame = processor.decodeFrame({ path: '/path/to/video2.mp4' }, 0.0);

// 测试：淡入淡出
const fade = processor.applyTransition(fromFrame, toFrame, {
  transitionType: 'fade',
  progress: 0.5
});

// 测试：擦除
const wipe = processor.applyTransition(fromFrame, toFrame, {
  transitionType: 'wipe_left',
  progress: 0.5,
  feather: 0.1
});

// 测试：光圈
const iris = processor.applyTransition(fromFrame, toFrame, {
  transitionType: 'iris_circle',
  progress: 0.5,
  centerX: 0.5,
  centerY: 0.5
});

// 测试：故障效果
const glitch = processor.applyTransition(fromFrame, toFrame, {
  transitionType: 'glitch',
  progress: 0.5
});
```

---

### 7. 视频编码测试

#### 7.1 创建编码器

```typescript
// 测试：创建 H.264 编码器
const encoder = processor.createVideoEncoder({
  width: 1920,
  height: 1080,
  fps: 30,
  bitrate: 5000000,
  codec: 'h264',
  preset: 'medium',
  hwEncoder: 'auto'
});

console.log('HW Encoder active:', encoder.isHwActive());
```

#### 7.2 编码帧

```typescript
// 测试：编码帧
const packets = encoder.encodeFrame(frame, 0);  // pts = 0

for (const packet of packets) {
  console.log(`Packet: pts=${packet.pts}, keyframe=${packet.isKeyframe}, size=${packet.data.length}`);
}
```

#### 7.3 刷新编码器

```typescript
// 测试：刷新缓冲区
const remainingPackets = encoder.flush();
console.log(`Flushed ${remainingPackets.length} packets`);

// 关闭编码器
encoder.close();
```

---

### 8. 音频处理测试

#### 8.1 获取音频信息

```typescript
// 测试：获取音频信息
const audioInfo = processor.getAudioInfo('/path/to/audio.mp3');
console.log('Audio:', audioInfo);

// 预期输出：
// { sampleRate: 48000, channels: 2, duration: 180.5, codec: "mp3", ... }
```

#### 8.2 解码音频帧

```typescript
// 测试：解码音频帧
const audioFrame = processor.decodeAudioFrame('/path/to/audio.mp3', 5.0);
console.log(`Audio frame: ${audioFrame.samples} samples, ${audioFrame.channels} channels`);
```

#### 8.3 音频解码器会话

```typescript
// 测试：创建音频解码器会话
const audioDecoder = processor.createAudioDecoder('/path/to/audio.mp3');

// 获取信息
const info = audioDecoder.getInfo();
console.log('Audio info:', info);

// Seek 到指定位置
audioDecoder.seek(10.0);

// 解码下一帧
let frame;
while ((frame = audioDecoder.decodeNext()) !== null) {
  console.log(`Frame at ${frame.timestamp}s`);
  if (frame.timestamp > 11.0) break;
}

// 关闭
audioDecoder.close();
```

#### 8.4 音频编码器会话

```typescript
// 测试：创建音频编码器
const audioEncoder = processor.createAudioEncoder({
  sampleRate: 48000,
  channels: 2,
  bitrate: 128000,
  codec: 'aac'
});

// 编码音频帧
const audioPackets = audioEncoder.encodeFrame(audioFrame);

// 刷新并关闭
const remaining = audioEncoder.flush();
audioEncoder.close();
```

---

## 错误处理测试

### 1. 文件不存在

```typescript
// 测试：解码不存在的文件
try {
  processor.decodeFrame({ path: '/nonexistent/video.mp4' }, 0);
} catch (e) {
  console.log('Expected error:', e.message);
}

// 预期：抛出文件不存在错误
```

### 2. 无效参数

```typescript
// 测试：无效的时间点
try {
  processor.decodeFrame({ path: '/path/to/video.mp4' }, -1.0);
} catch (e) {
  console.log('Expected error:', e.message);
}

// 测试：无效的编码器配置
try {
  processor.createVideoEncoder({
    width: 0,  // 无效宽度
    height: 1080,
    fps: 30,
    codec: 'h264'
  });
} catch (e) {
  console.log('Expected error:', e.message);
}
```

### 3. 不支持的格式

```typescript
// 测试：不支持的编码器
try {
  processor.createVideoEncoder({
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'unsupported_codec'
  });
} catch (e) {
  console.log('Expected error:', e.message);
}
```

---

## 性能测试

### 1. 解码性能

```typescript
// 测试：解码性能
const start = performance.now();
const frames = processor.decodeFrameRange(
  { path: '/path/to/video.mp4', hwAccel: 'auto' },
  0, 10, 30  // 10 秒，30fps = 300 帧
);
const elapsed = performance.now() - start;

console.log(`Decoded ${frames.length} frames in ${elapsed}ms`);
console.log(`Average: ${elapsed / frames.length}ms per frame`);
console.log(`FPS: ${frames.length / (elapsed / 1000)}`);
```

### 2. 编码性能

```typescript
// 测试：编码性能
const encoder = processor.createVideoEncoder({
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'h264',
  hwEncoder: 'auto'
});

const encodeStart = performance.now();
let totalPackets = 0;

for (const frame of frames) {
  const packets = encoder.encodeFrame(frame, totalPackets);
  totalPackets += packets.length;
}

const encodeElapsed = performance.now() - encodeStart;
console.log(`Encoded ${frames.length} frames in ${encodeElapsed}ms`);
console.log(`Encoding FPS: ${frames.length / (encodeElapsed / 1000)}`);
```

### 3. 特效性能

```typescript
// 测试：特效处理性能
const effectStart = performance.now();

for (let i = 0; i < 100; i++) {
  processor.applyEffects(frame, {
    brightness: 0.1,
    contrast: 1.2,
    saturation: 1.1
  });
}

const effectElapsed = performance.now() - effectStart;
console.log(`100 effect passes in ${effectElapsed}ms`);
console.log(`Average: ${effectElapsed / 100}ms per pass`);
```

---

## 输出质量检测测试

### 1. 视频帧黑屏检测

#### 1.1 CLI 黑屏检测

```bash
# 使用 ffmpeg 检测黑屏帧
# 提取帧后检测平均亮度

# 提取帧
vedit-server extract --input output.mp4 --output frame_check.jpg --time 5.0

# 使用 ImageMagick 检测平均亮度
convert frame_check.jpg -colorspace Gray -format "%[fx:mean]" info:

# 预期：mean > 0.01 表示非黑屏（0.0 = 纯黑，1.0 = 纯白）
# 如果 mean < 0.01，可能是黑屏帧
```

#### 1.2 NAPI 黑屏检测

```typescript
import { MediaProcessor } from '@vedit/media-processor-rs';

/**
 * 检测帧是否为黑屏
 * @param frame 帧数据
 * @param threshold 亮度阈值（默认 0.01，即 1%）
 * @returns true 表示黑屏
 */
function detectBlackFrame(frame: JsFrameData, threshold: number = 0.01): boolean {
  const data = frame.data;
  let totalBrightness = 0;
  const pixelCount = frame.width * frame.height;

  // RGBA 格式：计算每个像素的亮度
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // 使用 ITU-R BT.709 亮度公式
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    totalBrightness += luminance;
  }

  const avgBrightness = totalBrightness / pixelCount;
  console.log(`Average brightness: ${(avgBrightness * 100).toFixed(2)}%`);

  return avgBrightness < threshold;
}

// 测试：检测导出视频的多个帧
const processor = await MediaProcessor.create();
const testTimes = [0, 1, 5, 10, 30];  // 检测多个时间点

for (const time of testTimes) {
  const frame = processor.decodeFrame({ path: '/path/to/output.mp4' }, time);
  const isBlack = detectBlackFrame(frame);
  console.log(`Frame at ${time}s: ${isBlack ? 'BLACK SCREEN DETECTED!' : 'OK'}`);
}
```

#### 1.3 批量黑屏检测

```typescript
/**
 * 批量检测视频中的黑屏帧
 * @param videoPath 视频路径
 * @param sampleInterval 采样间隔（秒）
 * @param threshold 黑屏阈值
 * @returns 黑屏帧的时间点列表
 */
async function detectBlackFrames(
  processor: MediaProcessor,
  videoPath: string,
  sampleInterval: number = 1.0,
  threshold: number = 0.01
): Promise<number[]> {
  const info = probeMedia(videoPath);
  const duration = info.duration;
  const blackFrames: number[] = [];

  for (let time = 0; time < duration; time += sampleInterval) {
    const frame = processor.decodeFrame({ path: videoPath }, time);
    if (detectBlackFrame(frame, threshold)) {
      blackFrames.push(time);
    }
  }

  return blackFrames;
}

// 测试
const blackFrames = await detectBlackFrames(processor, '/path/to/output.mp4', 0.5);
if (blackFrames.length > 0) {
  console.log(`WARNING: Black frames detected at: ${blackFrames.join(', ')}s`);
} else {
  console.log('No black frames detected');
}
```

---

### 2. 视频图像撕裂检测

#### 2.1 NAPI 撕裂检测

```typescript
/**
 * 检测帧是否存在图像撕裂（水平线不连续）
 * 通过检测相邻行之间的突变来判断
 * @param frame 帧数据
 * @param threshold 撕裂检测阈值（默认 50，像素差值）
 * @returns 撕裂检测结果
 */
function detectTearing(
  frame: JsFrameData,
  threshold: number = 50
): { hasTearing: boolean; tearLines: number[] } {
  const data = frame.data;
  const width = frame.width;
  const height = frame.height;
  const tearLines: number[] = [];

  // 逐行检测
  for (let y = 1; y < height; y++) {
    let lineDiscontinuity = 0;
    let discontinuousPixels = 0;

    for (let x = 0; x < width; x++) {
      const currentIdx = (y * width + x) * 4;
      const prevIdx = ((y - 1) * width + x) * 4;

      // 计算当前行与上一行的像素差
      const diffR = Math.abs(data[currentIdx] - data[prevIdx]);
      const diffG = Math.abs(data[currentIdx + 1] - data[prevIdx + 1]);
      const diffB = Math.abs(data[currentIdx + 2] - data[prevIdx + 2]);
      const avgDiff = (diffR + diffG + diffB) / 3;

      if (avgDiff > threshold) {
        discontinuousPixels++;
      }
    }

    // 如果超过 80% 的像素在该行有突变，可能是撕裂
    const discontinuityRatio = discontinuousPixels / width;
    if (discontinuityRatio > 0.8) {
      tearLines.push(y);
    }
  }

  return {
    hasTearing: tearLines.length > 0,
    tearLines
  };
}

// 测试：检测导出视频的撕裂
const frame = processor.decodeFrame({ path: '/path/to/output.mp4' }, 5.0);
const tearResult = detectTearing(frame);

if (tearResult.hasTearing) {
  console.log(`TEARING DETECTED at lines: ${tearResult.tearLines.join(', ')}`);
} else {
  console.log('No tearing detected');
}
```

#### 2.2 帧间撕裂检测

```typescript
/**
 * 检测连续帧之间的撕裂（帧混合问题）
 * @param frame1 前一帧
 * @param frame2 后一帧
 * @param threshold 检测阈值
 */
function detectInterframeTearing(
  frame1: JsFrameData,
  frame2: JsFrameData,
  threshold: number = 100
): { hasTearing: boolean; tearRegions: { startY: number; endY: number }[] } {
  const width = frame1.width;
  const height = frame1.height;
  const tearRegions: { startY: number; endY: number }[] = [];

  let inTearRegion = false;
  let regionStart = 0;

  for (let y = 0; y < height; y++) {
    let frame1Similarity = 0;
    let frame2Similarity = 0;

    // 计算该行与两帧的相似度
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // ... 计算相似度逻辑
    }

    // 检测是否在撕裂区域
    // 如果某些行更像 frame1，某些行更像 frame2，则存在撕裂
  }

  return {
    hasTearing: tearRegions.length > 0,
    tearRegions
  };
}
```

---

### 3. 视频文件大小检测

#### 3.1 CLI 文件大小检测

```bash
# 检测导出视频文件大小
OUTPUT_FILE="output.mp4"

# 获取文件大小（字节）
FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE")
echo "File size: $FILE_SIZE bytes"

# 获取视频时长
DURATION=$(vedit-server probe --input "$OUTPUT_FILE" --format json | jq '.duration')
echo "Duration: $DURATION seconds"

# 计算比特率
BITRATE=$((FILE_SIZE * 8 / DURATION))
echo "Actual bitrate: $BITRATE bps"

# 检测是否在预期范围内（±20%）
EXPECTED_BITRATE=5000000
MIN_BITRATE=$((EXPECTED_BITRATE * 80 / 100))
MAX_BITRATE=$((EXPECTED_BITRATE * 120 / 100))

if [ "$BITRATE" -ge "$MIN_BITRATE" ] && [ "$BITRATE" -le "$MAX_BITRATE" ]; then
  echo "PASS: Bitrate within expected range"
else
  echo "FAIL: Bitrate outside expected range ($MIN_BITRATE - $MAX_BITRATE)"
fi
```

#### 3.2 NAPI 文件大小检测

```typescript
import * as fs from 'fs';

interface FileSizeCheckResult {
  fileSize: number;
  duration: number;
  actualBitrate: number;
  expectedBitrate: number;
  isWithinRange: boolean;
  deviation: number;  // 偏差百分比
}

/**
 * 检测视频文件大小是否符合预期
 * @param filePath 视频文件路径
 * @param expectedBitrate 预期比特率（bps）
 * @param tolerance 容差百分比（默认 20%）
 */
function checkVideoFileSize(
  filePath: string,
  expectedBitrate: number,
  tolerance: number = 0.2
): FileSizeCheckResult {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  const info = probeMedia(filePath);
  const duration = info.duration;

  const actualBitrate = (fileSize * 8) / duration;
  const deviation = Math.abs(actualBitrate - expectedBitrate) / expectedBitrate;
  const isWithinRange = deviation <= tolerance;

  return {
    fileSize,
    duration,
    actualBitrate: Math.round(actualBitrate),
    expectedBitrate,
    isWithinRange,
    deviation: Math.round(deviation * 100)
  };
}

// 测试
const result = checkVideoFileSize('/path/to/output.mp4', 5000000);
console.log(`File size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`Duration: ${result.duration.toFixed(2)}s`);
console.log(`Actual bitrate: ${(result.actualBitrate / 1000000).toFixed(2)} Mbps`);
console.log(`Expected bitrate: ${(result.expectedBitrate / 1000000).toFixed(2)} Mbps`);
console.log(`Deviation: ${result.deviation}%`);
console.log(`Result: ${result.isWithinRange ? 'PASS' : 'FAIL'}`);
```

#### 3.3 视频流大小检测

```typescript
/**
 * 检测视频流的编码效率
 */
function checkVideoStreamSize(
  filePath: string,
  expectedVideoSize: number,  // 预期视频流大小（字节）
  tolerance: number = 0.2
): { videoSize: number; audioSize: number; overheadSize: number; isValid: boolean } {
  const info = probeMedia(filePath);
  const stats = fs.statSync(filePath);
  const totalSize = stats.size;

  // 估算视频流大小
  const videoBitrate = info.bitrate || 0;
  const audioBitrate = info.audioBitrate || 0;
  const duration = info.duration;

  const estimatedVideoSize = (videoBitrate * duration) / 8;
  const estimatedAudioSize = (audioBitrate * duration) / 8;
  const overheadSize = totalSize - estimatedVideoSize - estimatedAudioSize;

  const deviation = Math.abs(estimatedVideoSize - expectedVideoSize) / expectedVideoSize;

  return {
    videoSize: Math.round(estimatedVideoSize),
    audioSize: Math.round(estimatedAudioSize),
    overheadSize: Math.round(overheadSize),
    isValid: deviation <= tolerance
  };
}
```

---

### 4. 音频文件大小检测

#### 4.1 CLI 音频大小检测

```bash
# 检测音频流大小
OUTPUT_FILE="output.mp4"

# 使用 ffprobe 获取音频流信息
AUDIO_INFO=$(ffprobe -v quiet -select_streams a:0 -show_entries stream=bit_rate,duration -of json "$OUTPUT_FILE")

AUDIO_BITRATE=$(echo "$AUDIO_INFO" | jq -r '.streams[0].bit_rate')
AUDIO_DURATION=$(echo "$AUDIO_INFO" | jq -r '.streams[0].duration')

# 计算预期音频大小
EXPECTED_AUDIO_SIZE=$((AUDIO_BITRATE * AUDIO_DURATION / 8))
echo "Expected audio size: $EXPECTED_AUDIO_SIZE bytes"

# 检测实际音频流大小
ACTUAL_AUDIO_SIZE=$(ffprobe -v quiet -select_streams a:0 -show_entries packet=size -of csv=p=0 "$OUTPUT_FILE" | awk '{sum+=$1} END {print sum}')
echo "Actual audio size: $ACTUAL_AUDIO_SIZE bytes"
```

#### 4.2 NAPI 音频大小检测

```typescript
interface AudioSizeCheckResult {
  expectedSize: number;
  actualBitrate: number;
  expectedBitrate: number;
  duration: number;
  isWithinRange: boolean;
  deviation: number;
}

/**
 * 检测音频流大小是否符合预期
 */
function checkAudioSize(
  filePath: string,
  expectedBitrate: number = 128000,  // 默认 128kbps
  tolerance: number = 0.15
): AudioSizeCheckResult {
  const info = probeMedia(filePath);

  const duration = info.duration;
  const actualBitrate = info.audioBitrate || 0;
  const expectedSize = (expectedBitrate * duration) / 8;

  const deviation = Math.abs(actualBitrate - expectedBitrate) / expectedBitrate;

  return {
    expectedSize: Math.round(expectedSize),
    actualBitrate,
    expectedBitrate,
    duration,
    isWithinRange: deviation <= tolerance,
    deviation: Math.round(deviation * 100)
  };
}

// 测试
const audioResult = checkAudioSize('/path/to/output.mp4', 128000);
console.log(`Audio bitrate: ${audioResult.actualBitrate / 1000} kbps`);
console.log(`Expected: ${audioResult.expectedBitrate / 1000} kbps`);
console.log(`Deviation: ${audioResult.deviation}%`);
console.log(`Result: ${audioResult.isWithinRange ? 'PASS' : 'FAIL'}`);
```

---

### 5. 音频音量检测

#### 5.1 CLI 音量检测

```bash
# 使用 ffmpeg 检测音频音量
OUTPUT_FILE="output.mp4"

# 检测音量统计信息
ffmpeg -i "$OUTPUT_FILE" -af "volumedetect" -f null /dev/null 2>&1 | grep -E "mean_volume|max_volume"

# 预期输出：
# [Parsed_volumedetect_0 @ 0x...] mean_volume: -20.5 dB
# [Parsed_volumedetect_0 @ 0x...] max_volume: -3.2 dB

# 检测是否存在静音
# 如果 mean_volume < -60 dB，可能是静音
```

#### 5.2 NAPI 音量检测

```typescript
interface VolumeAnalysisResult {
  peakLevel: number;      // 峰值电平 (0.0 - 1.0)
  rmsLevel: number;       // RMS 电平 (0.0 - 1.0)
  peakDb: number;         // 峰值 dB
  rmsDb: number;          // RMS dB
  isSilent: boolean;      // 是否静音
  isClipping: boolean;    // 是否削波
  dynamicRange: number;   // 动态范围 dB
}

/**
 * 分析音频帧的音量
 * @param audioFrame 音频帧数据
 * @param silenceThreshold 静音阈值 dB（默认 -60dB）
 */
function analyzeVolume(
  audioFrame: JsAudioFrame,
  silenceThreshold: number = -60
): VolumeAnalysisResult {
  const data = audioFrame.data;
  const samples = audioFrame.samples;
  const channels = audioFrame.channels;

  let peak = 0;
  let sumSquares = 0;

  // 假设 16-bit PCM 格式
  const view = new Int16Array(data.buffer);

  for (let i = 0; i < view.length; i++) {
    const sample = Math.abs(view[i]) / 32768;  // 归一化到 0-1
    peak = Math.max(peak, sample);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / view.length);

  // 转换为 dB
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

  return {
    peakLevel: peak,
    rmsLevel: rms,
    peakDb: Math.round(peakDb * 10) / 10,
    rmsDb: Math.round(rmsDb * 10) / 10,
    isSilent: rmsDb < silenceThreshold,
    isClipping: peak >= 0.99,
    dynamicRange: Math.round((peakDb - rmsDb) * 10) / 10
  };
}

// 测试：分析导出视频的音频音量
const processor = await MediaProcessor.create();
const audioDecoder = processor.createAudioDecoder('/path/to/output.mp4');

let totalPeak = 0;
let totalRms = 0;
let frameCount = 0;
let silentFrames = 0;
let clippingFrames = 0;

let frame;
while ((frame = audioDecoder.decodeNext()) !== null) {
  const analysis = analyzeVolume(frame);
  totalPeak = Math.max(totalPeak, analysis.peakLevel);
  totalRms += analysis.rmsLevel;
  frameCount++;

  if (analysis.isSilent) silentFrames++;
  if (analysis.isClipping) clippingFrames++;
}

audioDecoder.close();

console.log(`Peak level: ${(totalPeak * 100).toFixed(1)}% (${(20 * Math.log10(totalPeak)).toFixed(1)} dB)`);
console.log(`Average RMS: ${((totalRms / frameCount) * 100).toFixed(1)}%`);
console.log(`Silent frames: ${silentFrames} / ${frameCount} (${(silentFrames / frameCount * 100).toFixed(1)}%)`);
console.log(`Clipping frames: ${clippingFrames}`);

if (silentFrames / frameCount > 0.9) {
  console.log('WARNING: Audio appears to be mostly silent!');
}
if (clippingFrames > 0) {
  console.log('WARNING: Audio clipping detected!');
}
```

#### 5.3 音量一致性检测

```typescript
/**
 * 检测音频音量是否在整个视频中保持一致
 * @param filePath 视频文件路径
 * @param sampleInterval 采样间隔（秒）
 * @param maxDeviation 最大允许偏差 dB
 */
async function checkVolumeConsistency(
  processor: MediaProcessor,
  filePath: string,
  sampleInterval: number = 1.0,
  maxDeviation: number = 6.0
): Promise<{ isConsistent: boolean; samples: { time: number; rmsDb: number }[] }> {
  const info = probeMedia(filePath);
  const duration = info.duration;
  const samples: { time: number; rmsDb: number }[] = [];

  const audioDecoder = processor.createAudioDecoder(filePath);

  for (let time = 0; time < duration; time += sampleInterval) {
    audioDecoder.seek(time);
    const frame = audioDecoder.decodeNext();
    if (frame) {
      const analysis = analyzeVolume(frame);
      samples.push({ time, rmsDb: analysis.rmsDb });
    }
  }

  audioDecoder.close();

  // 计算音量标准差
  const avgRms = samples.reduce((sum, s) => sum + s.rmsDb, 0) / samples.length;
  const variance = samples.reduce((sum, s) => sum + Math.pow(s.rmsDb - avgRms, 2), 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  return {
    isConsistent: stdDev <= maxDeviation,
    samples
  };
}

// 测试
const consistency = await checkVolumeConsistency(processor, '/path/to/output.mp4');
console.log(`Volume consistency: ${consistency.isConsistent ? 'PASS' : 'FAIL'}`);
```

---

### 6. 综合质量检测脚本

```typescript
/**
 * 综合输出质量检测
 */
interface QualityCheckResult {
  video: {
    blackFrames: number[];
    tearingDetected: boolean;
    fileSizeValid: boolean;
    actualBitrate: number;
  };
  audio: {
    silentRatio: number;
    clippingDetected: boolean;
    volumeConsistent: boolean;
    actualBitrate: number;
  };
  overall: {
    passed: boolean;
    issues: string[];
  };
}

async function runQualityCheck(
  processor: MediaProcessor,
  filePath: string,
  expectedVideoBitrate: number,
  expectedAudioBitrate: number
): Promise<QualityCheckResult> {
  const issues: string[] = [];

  // 1. 黑屏检测
  const blackFrames = await detectBlackFrames(processor, filePath, 1.0);
  if (blackFrames.length > 0) {
    issues.push(`Black frames at: ${blackFrames.join(', ')}s`);
  }

  // 2. 撕裂检测（采样检测）
  let tearingDetected = false;
  for (const time of [0, 5, 10, 30]) {
    const frame = processor.decodeFrame({ path: filePath }, time);
    const tearResult = detectTearing(frame);
    if (tearResult.hasTearing) {
      tearingDetected = true;
      issues.push(`Tearing at ${time}s`);
      break;
    }
  }

  // 3. 视频文件大小检测
  const videoSizeResult = checkVideoFileSize(filePath, expectedVideoBitrate);
  if (!videoSizeResult.isWithinRange) {
    issues.push(`Video bitrate deviation: ${videoSizeResult.deviation}%`);
  }

  // 4. 音频检测
  const audioResult = checkAudioSize(filePath, expectedAudioBitrate);
  if (!audioResult.isWithinRange) {
    issues.push(`Audio bitrate deviation: ${audioResult.deviation}%`);
  }

  // 5. 音量检测
  const volumeConsistency = await checkVolumeConsistency(processor, filePath);
  if (!volumeConsistency.isConsistent) {
    issues.push('Audio volume inconsistent');
  }

  // 检测静音和削波
  let silentRatio = 0;
  let clippingDetected = false;
  // ... 音量分析逻辑

  return {
    video: {
      blackFrames,
      tearingDetected,
      fileSizeValid: videoSizeResult.isWithinRange,
      actualBitrate: videoSizeResult.actualBitrate
    },
    audio: {
      silentRatio,
      clippingDetected,
      volumeConsistent: volumeConsistency.isConsistent,
      actualBitrate: audioResult.actualBitrate
    },
    overall: {
      passed: issues.length === 0,
      issues
    }
  };
}

// 运行综合检测
const qualityResult = await runQualityCheck(
  processor,
  '/path/to/output.mp4',
  5000000,  // 5 Mbps 视频
  128000    // 128 kbps 音频
);

console.log('\n=== Quality Check Report ===');
console.log(`Video bitrate: ${(qualityResult.video.actualBitrate / 1000000).toFixed(2)} Mbps`);
console.log(`Audio bitrate: ${(qualityResult.audio.actualBitrate / 1000).toFixed(0)} kbps`);
console.log(`Black frames: ${qualityResult.video.blackFrames.length}`);
console.log(`Tearing: ${qualityResult.video.tearingDetected ? 'YES' : 'NO'}`);
console.log(`Volume consistent: ${qualityResult.audio.volumeConsistent ? 'YES' : 'NO'}`);
console.log(`\nOverall: ${qualityResult.overall.passed ? 'PASSED' : 'FAILED'}`);

if (qualityResult.overall.issues.length > 0) {
  console.log('\nIssues:');
  qualityResult.overall.issues.forEach(issue => console.log(`  - ${issue}`));
}
```

---

## 系统资源检测测试

### 1. CPU 利用率检测

#### 1.1 CLI CPU 检测

```bash
# macOS: 获取 CPU 利用率
top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//'

# Linux: 获取 CPU 利用率
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//'

# 跨平台脚本：检测 CPU 利用率并在过高时报错
CPU_THRESHOLD=80

if [[ "$OSTYPE" == "darwin"* ]]; then
  CPU_USAGE=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
else
  CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
fi

if (( $(echo "$CPU_USAGE > $CPU_THRESHOLD" | bc -l) )); then
  echo "ERROR: CPU usage too high: ${CPU_USAGE}% (threshold: ${CPU_THRESHOLD}%)"
  echo "CPU-intensive operations (preview, export, composite) are disabled."
  exit 1
fi
```

#### 1.2 NAPI CPU 检测

```typescript
import * as os from 'os';

interface CpuUsageResult {
  usage: number;           // CPU 利用率百分比 (0-100)
  cores: number;           // CPU 核心数
  loadAverage: number[];   // 1/5/15 分钟负载
  isOverloaded: boolean;   // 是否过载
}

/**
 * 获取 CPU 利用率
 * @param sampleDuration 采样时长（毫秒）
 * @param threshold 过载阈值（默认 80%）
 */
async function getCpuUsage(
  sampleDuration: number = 1000,
  threshold: number = 80
): Promise<CpuUsageResult> {
  const cpus1 = os.cpus();

  await new Promise(resolve => setTimeout(resolve, sampleDuration));

  const cpus2 = os.cpus();

  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < cpus1.length; i++) {
    const cpu1 = cpus1[i].times;
    const cpu2 = cpus2[i].times;

    const idle = cpu2.idle - cpu1.idle;
    const total = (cpu2.user - cpu1.user) + (cpu2.nice - cpu1.nice) +
                  (cpu2.sys - cpu1.sys) + (cpu2.idle - cpu1.idle) +
                  (cpu2.irq - cpu1.irq);

    totalIdle += idle;
    totalTick += total;
  }

  const usage = 100 - (totalIdle / totalTick * 100);
  const loadAverage = os.loadavg();

  return {
    usage: Math.round(usage * 10) / 10,
    cores: cpus1.length,
    loadAverage,
    isOverloaded: usage > threshold
  };
}

// 测试：检测 CPU 利用率
const cpuResult = await getCpuUsage();
console.log(`CPU Usage: ${cpuResult.usage}%`);
console.log(`CPU Cores: ${cpuResult.cores}`);
console.log(`Load Average: ${cpuResult.loadAverage.join(', ')}`);

if (cpuResult.isOverloaded) {
  throw new Error(`CPU overloaded: ${cpuResult.usage}% - operations disabled`);
}
```

---

### 2. GPU 信息检测

#### 2.1 NAPI GPU 检测

```typescript
import { MediaProcessor } from '@vedit/media-processor-rs';

interface GpuCheckResult {
  available: boolean;
  name: string;
  vendor: string;
  backend: string;
  deviceType: string;
  vramEstimate?: number;  // 估算显存（字节）
}

/**
 * 检测 GPU 可用性和信息
 */
async function checkGpu(): Promise<GpuCheckResult> {
  try {
    const processor = await MediaProcessor.create();
    const gpuInfo = processor.getGpuInfo();

    return {
      available: true,
      name: gpuInfo.name,
      vendor: gpuInfo.vendor,
      backend: gpuInfo.backend,
      deviceType: gpuInfo.deviceType,
      vramEstimate: gpuInfo.vramEstimate
    };
  } catch (e) {
    return {
      available: false,
      name: 'N/A',
      vendor: 'N/A',
      backend: 'N/A',
      deviceType: 'N/A'
    };
  }
}

// 测试：检测 GPU
const gpuResult = await checkGpu();
console.log(`GPU Available: ${gpuResult.available}`);
console.log(`GPU Name: ${gpuResult.name}`);
console.log(`GPU Vendor: ${gpuResult.vendor}`);
console.log(`GPU Backend: ${gpuResult.backend}`);
console.log(`Device Type: ${gpuResult.deviceType}`);

if (!gpuResult.available) {
  console.log('WARNING: GPU not available, falling back to CPU rendering');
}
```

#### 2.2 CLI GPU 检测 (macOS)

```bash
# macOS: 获取 GPU 信息
system_profiler SPDisplaysDataType | grep -E "Chipset Model|VRAM|Metal"

# 预期输出：
# Chipset Model: Apple M1
# Metal Support: Metal 3
```

---

### 3. 内存检测

#### 3.1 NAPI 内存检测

```typescript
import * as os from 'os';

interface MemoryCheckResult {
  totalMemory: number;      // 总内存（字节）
  freeMemory: number;       // 可用内存（字节）
  usedMemory: number;       // 已用内存（字节）
  usagePercent: number;     // 使用率百分比
  isLow: boolean;           // 内存是否不足
  processMemory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
}

/**
 * 检测系统内存状态
 * @param lowThreshold 低内存阈值（默认 90%）
 */
function checkMemory(lowThreshold: number = 90): MemoryCheckResult {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercent = (usedMemory / totalMemory) * 100;

  const processMemory = process.memoryUsage();

  return {
    totalMemory,
    freeMemory,
    usedMemory,
    usagePercent: Math.round(usagePercent * 10) / 10,
    isLow: usagePercent > lowThreshold,
    processMemory: {
      heapUsed: processMemory.heapUsed,
      heapTotal: processMemory.heapTotal,
      external: processMemory.external,
      rss: processMemory.rss
    }
  };
}

// 测试：检测内存
const memResult = checkMemory();
console.log(`Total Memory: ${(memResult.totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`Free Memory: ${(memResult.freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`Memory Usage: ${memResult.usagePercent}%`);
console.log(`Process Heap: ${(memResult.processMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

if (memResult.isLow) {
  throw new Error(`Memory low: ${memResult.usagePercent}% used - operations may fail`);
}
```

#### 3.2 CLI 内存检测

```bash
# macOS: 获取内存信息
vm_stat | perl -ne '/page size of (\d+)/ and $size=$1; /Pages free:\s+(\d+)/ and print "Free: " . $1 * $size / 1024 / 1024 . " MB\n"'

# Linux: 获取内存信息
free -m | awk 'NR==2{printf "Total: %s MB, Used: %s MB, Free: %s MB, Usage: %.2f%%\n", $2, $3, $4, $3*100/$2}'

# 跨平台：检测内存并在不足时报错
MEMORY_THRESHOLD=90

if [[ "$OSTYPE" == "darwin"* ]]; then
  TOTAL_MEM=$(sysctl -n hw.memsize)
  FREE_MEM=$(vm_stat | awk '/Pages free/ {print $3}' | sed 's/\.//')
  PAGE_SIZE=$(vm_stat | awk '/page size/ {print $8}')
  FREE_BYTES=$((FREE_MEM * PAGE_SIZE))
  USAGE=$((100 - FREE_BYTES * 100 / TOTAL_MEM))
else
  USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
fi

if [ "$USAGE" -gt "$MEMORY_THRESHOLD" ]; then
  echo "ERROR: Memory usage too high: ${USAGE}% (threshold: ${MEMORY_THRESHOLD}%)"
  exit 1
fi
```

---

### 4. 显存 (VRAM) 检测

#### 4.1 NAPI 显存检测

```typescript
interface VramCheckResult {
  available: boolean;
  totalVram?: number;       // 总显存（字节）
  usedVram?: number;        // 已用显存（字节）
  freeVram?: number;        // 可用显存（字节）
  usagePercent?: number;    // 使用率百分比
  isLow: boolean;           // 显存是否不足
}

/**
 * 检测 GPU 显存状态
 * 注意：显存检测依赖于平台和 GPU 驱动支持
 * @param lowThreshold 低显存阈值（默认 90%）
 */
async function checkVram(lowThreshold: number = 90): Promise<VramCheckResult> {
  try {
    const processor = await MediaProcessor.create();
    const gpuInfo = processor.getGpuInfo();

    // 注意：实际显存使用量可能需要通过 Metal/Vulkan API 获取
    // 这里使用估算值
    if (gpuInfo.vramEstimate) {
      return {
        available: true,
        totalVram: gpuInfo.vramEstimate,
        isLow: false  // 需要实际 API 支持才能准确判断
      };
    }

    return {
      available: true,
      isLow: false
    };
  } catch (e) {
    return {
      available: false,
      isLow: true
    };
  }
}

// 测试：检测显存
const vramResult = await checkVram();
console.log(`VRAM Available: ${vramResult.available}`);
if (vramResult.totalVram) {
  console.log(`Total VRAM: ${(vramResult.totalVram / 1024 / 1024 / 1024).toFixed(2)} GB`);
}

if (vramResult.isLow) {
  console.log('WARNING: VRAM may be insufficient for GPU operations');
}
```

#### 4.2 CLI 显存检测 (macOS)

```bash
# macOS: 获取 GPU 显存信息
system_profiler SPDisplaysDataType | grep -i "VRAM"

# 对于 Apple Silicon，统一内存架构，显存与系统内存共享
# 可以通过 Metal 性能统计获取更详细信息
```

---

### 5. 资源守卫：禁用 CPU 密集型操作

#### 5.1 资源守卫类

```typescript
interface ResourceLimits {
  maxCpuUsage: number;      // 最大 CPU 利用率（默认 80%）
  maxMemoryUsage: number;   // 最大内存利用率（默认 90%）
  minFreeMemory: number;    // 最小可用内存（字节，默认 1GB）
  requireGpu: boolean;      // 是否要求 GPU 可用
}

interface ResourceCheckResult {
  canPreview: boolean;      // 是否可以预览
  canExport: boolean;       // 是否可以导出
  canComposite: boolean;    // 是否可以渲染合成帧
  blockedReasons: string[]; // 被阻止的原因
}

/**
 * 资源守卫：检测系统资源并决定是否允许执行操作
 */
class ResourceGuard {
  private limits: ResourceLimits;

  constructor(limits: Partial<ResourceLimits> = {}) {
    this.limits = {
      maxCpuUsage: limits.maxCpuUsage ?? 80,
      maxMemoryUsage: limits.maxMemoryUsage ?? 90,
      minFreeMemory: limits.minFreeMemory ?? 1024 * 1024 * 1024, // 1GB
      requireGpu: limits.requireGpu ?? false
    };
  }

  /**
   * 检查是否可以执行资源密集型操作
   */
  async check(): Promise<ResourceCheckResult> {
    const blockedReasons: string[] = [];

    // 1. 检测 CPU
    const cpuResult = await getCpuUsage();
    if (cpuResult.isOverloaded || cpuResult.usage > this.limits.maxCpuUsage) {
      blockedReasons.push(`CPU usage too high: ${cpuResult.usage}% (max: ${this.limits.maxCpuUsage}%)`);
    }

    // 2. 检测内存
    const memResult = checkMemory(this.limits.maxMemoryUsage);
    if (memResult.isLow) {
      blockedReasons.push(`Memory usage too high: ${memResult.usagePercent}% (max: ${this.limits.maxMemoryUsage}%)`);
    }
    if (memResult.freeMemory < this.limits.minFreeMemory) {
      blockedReasons.push(`Free memory too low: ${(memResult.freeMemory / 1024 / 1024).toFixed(0)} MB (min: ${(this.limits.minFreeMemory / 1024 / 1024).toFixed(0)} MB)`);
    }

    // 3. 检测 GPU
    const gpuResult = await checkGpu();
    if (this.limits.requireGpu && !gpuResult.available) {
      blockedReasons.push('GPU not available');
    }

    // 4. 检测显存
    const vramResult = await checkVram();
    if (vramResult.isLow) {
      blockedReasons.push('VRAM insufficient');
    }

    const canOperate = blockedReasons.length === 0;

    return {
      canPreview: canOperate,
      canExport: canOperate,
      canComposite: canOperate,
      blockedReasons
    };
  }

  /**
   * 断言可以执行操作，否则抛出错误
   */
  async assertCanOperate(operation: 'preview' | 'export' | 'composite'): Promise<void> {
    const result = await this.check();

    const canOperate =
      operation === 'preview' ? result.canPreview :
      operation === 'export' ? result.canExport :
      result.canComposite;

    if (!canOperate) {
      throw new Error(
        `Cannot ${operation}: System resources insufficient.\n` +
        `Reasons:\n${result.blockedReasons.map(r => `  - ${r}`).join('\n')}`
      );
    }
  }
}

// 测试：使用资源守卫
const guard = new ResourceGuard({
  maxCpuUsage: 80,
  maxMemoryUsage: 90,
  minFreeMemory: 1024 * 1024 * 1024,  // 1GB
  requireGpu: true
});

// 检查资源状态
const resourceStatus = await guard.check();
console.log('Can Preview:', resourceStatus.canPreview);
console.log('Can Export:', resourceStatus.canExport);
console.log('Can Composite:', resourceStatus.canComposite);

if (resourceStatus.blockedReasons.length > 0) {
  console.log('Blocked Reasons:');
  resourceStatus.blockedReasons.forEach(r => console.log(`  - ${r}`));
}

// 尝试执行操作（会在资源不足时抛出错误）
try {
  await guard.assertCanOperate('export');
  console.log('Export operation allowed');
} catch (e) {
  console.error(e.message);
}
```

---

### 6. CPU 高利用率报错反馈

#### 6.1 实时 CPU 监控

```typescript
interface CpuMonitorOptions {
  checkInterval: number;    // 检查间隔（毫秒）
  threshold: number;        // 报警阈值（百分比）
  consecutiveCount: number; // 连续超标次数才报警
}

type CpuAlertCallback = (usage: number, message: string) => void;

/**
 * CPU 利用率监控器
 */
class CpuMonitor {
  private options: CpuMonitorOptions;
  private timer: NodeJS.Timer | null = null;
  private consecutiveOverloads: number = 0;
  private onAlert: CpuAlertCallback;

  constructor(
    onAlert: CpuAlertCallback,
    options: Partial<CpuMonitorOptions> = {}
  ) {
    this.options = {
      checkInterval: options.checkInterval ?? 2000,
      threshold: options.threshold ?? 80,
      consecutiveCount: options.consecutiveCount ?? 3
    };
    this.onAlert = onAlert;
  }

  /**
   * 开始监控
   */
  start(): void {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      const cpuResult = await getCpuUsage(500);

      if (cpuResult.usage > this.options.threshold) {
        this.consecutiveOverloads++;

        if (this.consecutiveOverloads >= this.options.consecutiveCount) {
          this.onAlert(
            cpuResult.usage,
            `CPU usage critically high: ${cpuResult.usage}% (threshold: ${this.options.threshold}%). ` +
            `CPU-intensive operations (preview, export, composite) have been disabled. ` +
            `Please close other applications or wait for CPU usage to decrease.`
          );
        }
      } else {
        this.consecutiveOverloads = 0;
      }
    }, this.options.checkInterval);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// 测试：启动 CPU 监控
const cpuMonitor = new CpuMonitor(
  (usage, message) => {
    console.error(`[CPU ALERT] ${message}`);
    // 可以在这里触发 UI 通知或禁用操作
  },
  {
    checkInterval: 2000,
    threshold: 80,
    consecutiveCount: 3
  }
);

cpuMonitor.start();

// 模拟运行一段时间后停止
setTimeout(() => {
  cpuMonitor.stop();
  console.log('CPU monitoring stopped');
}, 30000);
```

#### 6.2 操作前 CPU 检查

```typescript
/**
 * 在执行操作前检查 CPU 利用率
 * @param operation 操作名称
 * @param threshold CPU 阈值
 */
async function checkCpuBeforeOperation(
  operation: string,
  threshold: number = 80
): Promise<void> {
  const cpuResult = await getCpuUsage(1000);

  if (cpuResult.usage > threshold) {
    throw new Error(
      `Cannot perform ${operation}: CPU usage is ${cpuResult.usage}% (threshold: ${threshold}%).\n` +
      `Please wait for CPU usage to decrease or close other applications.\n` +
      `Current load average: ${cpuResult.loadAverage.map(l => l.toFixed(2)).join(', ')}`
    );
  }
}

// 测试：预览前检查
try {
  await checkCpuBeforeOperation('preview', 80);
  console.log('CPU check passed, starting preview...');
  // processor.startPreview(...);
} catch (e) {
  console.error(e.message);
}

// 测试：导出前检查
try {
  await checkCpuBeforeOperation('export', 70);  // 导出使用更严格的阈值
  console.log('CPU check passed, starting export...');
  // processor.export(...);
} catch (e) {
  console.error(e.message);
}

// 测试：合成帧前检查
try {
  await checkCpuBeforeOperation('composite', 80);
  console.log('CPU check passed, starting composite...');
  // processor.composite(...);
} catch (e) {
  console.error(e.message);
}
```

---

### 7. 综合系统资源检测

```typescript
interface SystemResourceReport {
  timestamp: Date;
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
    status: 'ok' | 'warning' | 'critical';
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
    status: 'ok' | 'warning' | 'critical';
  };
  gpu: {
    available: boolean;
    name: string;
    backend: string;
    status: 'ok' | 'unavailable';
  };
  vram: {
    available: boolean;
    total?: number;
    status: 'ok' | 'warning' | 'unavailable';
  };
  operations: {
    previewEnabled: boolean;
    exportEnabled: boolean;
    compositeEnabled: boolean;
  };
  issues: string[];
}

/**
 * 生成完整的系统资源报告
 */
async function generateResourceReport(): Promise<SystemResourceReport> {
  const issues: string[] = [];

  // CPU 检测
  const cpuResult = await getCpuUsage();
  const cpuStatus = cpuResult.usage > 90 ? 'critical' :
                    cpuResult.usage > 70 ? 'warning' : 'ok';
  if (cpuStatus !== 'ok') {
    issues.push(`CPU usage ${cpuStatus}: ${cpuResult.usage}%`);
  }

  // 内存检测
  const memResult = checkMemory();
  const memStatus = memResult.usagePercent > 95 ? 'critical' :
                    memResult.usagePercent > 85 ? 'warning' : 'ok';
  if (memStatus !== 'ok') {
    issues.push(`Memory usage ${memStatus}: ${memResult.usagePercent}%`);
  }

  // GPU 检测
  const gpuResult = await checkGpu();
  if (!gpuResult.available) {
    issues.push('GPU not available');
  }

  // VRAM 检测
  const vramResult = await checkVram();

  // 判断操作是否可用
  const canOperate = cpuStatus !== 'critical' && memStatus !== 'critical';

  return {
    timestamp: new Date(),
    cpu: {
      usage: cpuResult.usage,
      cores: cpuResult.cores,
      loadAverage: cpuResult.loadAverage,
      status: cpuStatus
    },
    memory: {
      total: memResult.totalMemory,
      free: memResult.freeMemory,
      used: memResult.usedMemory,
      usagePercent: memResult.usagePercent,
      status: memStatus
    },
    gpu: {
      available: gpuResult.available,
      name: gpuResult.name,
      backend: gpuResult.backend,
      status: gpuResult.available ? 'ok' : 'unavailable'
    },
    vram: {
      available: vramResult.available,
      total: vramResult.totalVram,
      status: vramResult.available ? (vramResult.isLow ? 'warning' : 'ok') : 'unavailable'
    },
    operations: {
      previewEnabled: canOperate && gpuResult.available,
      exportEnabled: canOperate,
      compositeEnabled: canOperate && gpuResult.available
    },
    issues
  };
}

// 测试：生成资源报告
const report = await generateResourceReport();

console.log('\n=== System Resource Report ===');
console.log(`Timestamp: ${report.timestamp.toISOString()}`);
console.log(`\nCPU:`);
console.log(`  Usage: ${report.cpu.usage}% [${report.cpu.status.toUpperCase()}]`);
console.log(`  Cores: ${report.cpu.cores}`);
console.log(`  Load: ${report.cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}`);
console.log(`\nMemory:`);
console.log(`  Total: ${(report.memory.total / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`  Free: ${(report.memory.free / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`  Usage: ${report.memory.usagePercent}% [${report.memory.status.toUpperCase()}]`);
console.log(`\nGPU:`);
console.log(`  Available: ${report.gpu.available}`);
console.log(`  Name: ${report.gpu.name}`);
console.log(`  Backend: ${report.gpu.backend}`);
console.log(`\nOperations:`);
console.log(`  Preview: ${report.operations.previewEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log(`  Export: ${report.operations.exportEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log(`  Composite: ${report.operations.compositeEnabled ? 'ENABLED' : 'DISABLED'}`);

if (report.issues.length > 0) {
  console.log(`\nIssues:`);
  report.issues.forEach(issue => console.log(`  - ${issue}`));
}
```

---

### 8. 进程 CPU 使用率检测（GPU 加速验证）

#### 8.1 进程 CPU 使用率监控

```typescript
import { execSync } from 'child_process';

interface ProcessCpuResult {
  pid: number;
  cpuPercent: number;       // 进程 CPU 使用率
  memoryMB: number;         // 进程内存使用（MB）
  isHighCpu: boolean;       // CPU 使用率是否过高
  gpuAccelIssue: boolean;   // 是否存在 GPU 加速问题
}

/**
 * 获取当前进程的 CPU 使用率
 * 用于检测是否存在 CPU-GPU 数据传输或 CPU 回退
 * @param threshold CPU 使用率阈值（默认 10%，全流程 GPU 加速操作应低于此值）
 */
function getProcessCpuUsage(threshold: number = 10): ProcessCpuResult {
  const pid = process.pid;
  let cpuPercent = 0;
  let memoryMB = 0;

  try {
    if (process.platform === 'darwin') {
      // macOS: 使用 ps 命令获取进程 CPU 使用率
      const output = execSync(`ps -p ${pid} -o %cpu,%mem`, { encoding: 'utf-8' });
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const [cpu, mem] = lines[1].trim().split(/\s+/);
        cpuPercent = parseFloat(cpu) || 0;
        memoryMB = (parseFloat(mem) || 0) * os.totalmem() / 100 / 1024 / 1024;
      }
    } else {
      // Linux: 使用 /proc 文件系统
      const stat = execSync(`cat /proc/${pid}/stat`, { encoding: 'utf-8' });
      const fields = stat.split(' ');
      const utime = parseInt(fields[13], 10);
      const stime = parseInt(fields[14], 10);
      const starttime = parseInt(fields[21], 10);
      const uptime = parseFloat(execSync('cat /proc/uptime', { encoding: 'utf-8' }).split(' ')[0]);
      const clkTck = 100; // 通常是 100
      const totalTime = utime + stime;
      const seconds = uptime - (starttime / clkTck);
      cpuPercent = 100 * ((totalTime / clkTck) / seconds);
    }
  } catch (e) {
    // 回退到 Node.js 内置方法
    const usage = process.cpuUsage();
    cpuPercent = (usage.user + usage.system) / 1000000 * 100;
  }

  return {
    pid,
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memoryMB: Math.round(memoryMB),
    isHighCpu: cpuPercent > threshold,
    gpuAccelIssue: cpuPercent > threshold
  };
}

// 测试：检测进程 CPU 使用率
const procCpu = getProcessCpuUsage(10);
console.log(`Process PID: ${procCpu.pid}`);
console.log(`Process CPU: ${procCpu.cpuPercent}%`);
console.log(`Process Memory: ${procCpu.memoryMB} MB`);

if (procCpu.gpuAccelIssue) {
  console.error(
    `ERROR: High process CPU usage detected (${procCpu.cpuPercent}%).\n` +
    `This indicates CPU-GPU data transfer or CPU fallback is occurring.\n` +
    `Expected: Full GPU acceleration with minimal CPU usage (<10%).`
  );
}
```

#### 8.2 GPU 操作期间的 CPU 监控

```typescript
interface GpuOperationCpuCheck {
  operationName: string;
  startCpu: number;
  peakCpu: number;
  avgCpu: number;
  samples: number[];
  isFullyGpuAccelerated: boolean;
  issues: string[];
}

/**
 * 在 GPU 操作期间监控 CPU 使用率
 * 用于验证操作是否完全在 GPU 上执行
 * @param operationName 操作名称
 * @param operation 要执行的异步操作
 * @param cpuThreshold CPU 阈值（默认 10%）
 * @param sampleInterval 采样间隔（毫秒）
 */
async function monitorCpuDuringGpuOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  cpuThreshold: number = 10,
  sampleInterval: number = 100
): Promise<{ result: T; cpuCheck: GpuOperationCpuCheck }> {
  const samples: number[] = [];
  let monitoring = true;

  // 启动 CPU 采样
  const sampler = setInterval(() => {
    if (!monitoring) return;
    const usage = getProcessCpuUsage();
    samples.push(usage.cpuPercent);
  }, sampleInterval);

  const startCpu = getProcessCpuUsage().cpuPercent;

  try {
    // 执行 GPU 操作
    const result = await operation();

    monitoring = false;
    clearInterval(sampler);

    // 分析结果
    const peakCpu = Math.max(...samples, startCpu);
    const avgCpu = samples.length > 0
      ? samples.reduce((a, b) => a + b, 0) / samples.length
      : startCpu;

    const issues: string[] = [];

    if (peakCpu > cpuThreshold) {
      issues.push(
        `Peak CPU usage (${peakCpu.toFixed(1)}%) exceeded threshold (${cpuThreshold}%). ` +
        `Possible CPU-GPU data transfer detected.`
      );
    }

    if (avgCpu > cpuThreshold * 0.7) {
      issues.push(
        `Average CPU usage (${avgCpu.toFixed(1)}%) is high. ` +
        `Operation may not be fully GPU accelerated.`
      );
    }

    const isFullyGpuAccelerated = issues.length === 0;

    return {
      result,
      cpuCheck: {
        operationName,
        startCpu,
        peakCpu,
        avgCpu: Math.round(avgCpu * 10) / 10,
        samples,
        isFullyGpuAccelerated,
        issues
      }
    };
  } catch (e) {
    monitoring = false;
    clearInterval(sampler);
    throw e;
  }
}

// 测试：监控解码操作的 CPU 使用率
const { result: frame, cpuCheck } = await monitorCpuDuringGpuOperation(
  'decodeFrame',
  async () => processor.decodeFrame({ path: '/path/to/video.mp4', hwAccel: 'auto' }, 5.0),
  10,  // CPU 阈值 10%（全流程 GPU 处理）
  50   // 每 50ms 采样一次
);

console.log(`\n=== GPU Operation CPU Check: ${cpuCheck.operationName} ===`);
console.log(`Start CPU: ${cpuCheck.startCpu}%`);
console.log(`Peak CPU: ${cpuCheck.peakCpu}%`);
console.log(`Average CPU: ${cpuCheck.avgCpu}%`);
console.log(`Samples: ${cpuCheck.samples.length}`);
console.log(`Fully GPU Accelerated: ${cpuCheck.isFullyGpuAccelerated ? 'YES' : 'NO'}`);

if (!cpuCheck.isFullyGpuAccelerated) {
  console.error('\nGPU Acceleration Issues:');
  cpuCheck.issues.forEach(issue => console.error(`  - ${issue}`));
}
```

#### 8.3 批量 GPU 操作验证

```typescript
interface GpuAccelerationReport {
  timestamp: Date;
  operations: {
    name: string;
    isGpuAccelerated: boolean;
    avgCpu: number;
    peakCpu: number;
    issues: string[];
  }[];
  overallGpuAccelerated: boolean;
  summary: string;
}

/**
 * 验证多个 GPU 操作是否完全使用 GPU 加速
 */
async function verifyGpuAcceleration(
  processor: MediaProcessor,
  videoPath: string
): Promise<GpuAccelerationReport> {
  const operations: GpuAccelerationReport['operations'] = [];

  // 1. 测试解码操作
  const decodeCheck = await monitorCpuDuringGpuOperation(
    'decode',
    async () => processor.decodeFrame({ path: videoPath, hwAccel: 'auto' }, 5.0)
  );
  operations.push({
    name: 'decode',
    isGpuAccelerated: decodeCheck.cpuCheck.isFullyGpuAccelerated,
    avgCpu: decodeCheck.cpuCheck.avgCpu,
    peakCpu: decodeCheck.cpuCheck.peakCpu,
    issues: decodeCheck.cpuCheck.issues
  });

  // 2. 测试特效处理
  const effectCheck = await monitorCpuDuringGpuOperation(
    'applyEffects',
    async () => processor.applyEffects(decodeCheck.result, {
      brightness: 0.1,
      contrast: 1.2,
      saturation: 1.1
    })
  );
  operations.push({
    name: 'applyEffects',
    isGpuAccelerated: effectCheck.cpuCheck.isFullyGpuAccelerated,
    avgCpu: effectCheck.cpuCheck.avgCpu,
    peakCpu: effectCheck.cpuCheck.peakCpu,
    issues: effectCheck.cpuCheck.issues
  });

  // 3. 测试模糊效果
  const blurCheck = await monitorCpuDuringGpuOperation(
    'applyBlur',
    async () => processor.applyBlur(decodeCheck.result, {
      blurType: 'gaussian',
      radius: 10
    })
  );
  operations.push({
    name: 'applyBlur',
    isGpuAccelerated: blurCheck.cpuCheck.isFullyGpuAccelerated,
    avgCpu: blurCheck.cpuCheck.avgCpu,
    peakCpu: blurCheck.cpuCheck.peakCpu,
    issues: blurCheck.cpuCheck.issues
  });

  // 4. 测试编码操作
  const encoder = processor.createVideoEncoder({
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    hwEncoder: 'auto'
  });

  const encodeCheck = await monitorCpuDuringGpuOperation(
    'encode',
    async () => encoder.encodeFrame(decodeCheck.result, 0)
  );
  operations.push({
    name: 'encode',
    isGpuAccelerated: encodeCheck.cpuCheck.isFullyGpuAccelerated,
    avgCpu: encodeCheck.cpuCheck.avgCpu,
    peakCpu: encodeCheck.cpuCheck.peakCpu,
    issues: encodeCheck.cpuCheck.issues
  });

  encoder.close();

  const overallGpuAccelerated = operations.every(op => op.isGpuAccelerated);
  const failedOps = operations.filter(op => !op.isGpuAccelerated);

  let summary: string;
  if (overallGpuAccelerated) {
    summary = 'All operations are fully GPU accelerated.';
  } else {
    summary = `${failedOps.length} operation(s) have CPU-GPU issues: ${failedOps.map(op => op.name).join(', ')}`;
  }

  return {
    timestamp: new Date(),
    operations,
    overallGpuAccelerated,
    summary
  };
}

// 测试：验证 GPU 加速
const gpuReport = await verifyGpuAcceleration(processor, '/path/to/video.mp4');

console.log('\n=== GPU Acceleration Verification Report ===');
console.log(`Timestamp: ${gpuReport.timestamp.toISOString()}`);
console.log(`Overall GPU Accelerated: ${gpuReport.overallGpuAccelerated ? 'YES' : 'NO'}`);
console.log(`Summary: ${gpuReport.summary}`);

console.log('\nOperation Details:');
gpuReport.operations.forEach(op => {
  const status = op.isGpuAccelerated ? '✓' : '✗';
  console.log(`  ${status} ${op.name}: avg=${op.avgCpu}%, peak=${op.peakCpu}%`);
  if (op.issues.length > 0) {
    op.issues.forEach(issue => console.log(`      - ${issue}`));
  }
});

if (!gpuReport.overallGpuAccelerated) {
  throw new Error(
    `GPU acceleration verification failed!\n` +
    `${gpuReport.summary}\n` +
    `High CPU usage indicates CPU-GPU data transfer or CPU fallback.\n` +
    `Please ensure full GPU pipeline is being used.`
  );
}
```

#### 8.4 CLI 进程 CPU 监控

```bash
#!/bin/bash
# 监控 vedit-server 进程的 CPU 使用率

PROCESS_NAME="vedit-server"
CPU_THRESHOLD=10  # 全流程 GPU 处理应低于 10%
CHECK_INTERVAL=0.5

echo "Monitoring $PROCESS_NAME CPU usage (threshold: ${CPU_THRESHOLD}%)..."
echo "High CPU during GPU operations indicates CPU-GPU transfer issues."
echo ""

while true; do
  # 获取进程 PID 和 CPU 使用率
  if [[ "$OSTYPE" == "darwin"* ]]; then
    PROC_INFO=$(ps aux | grep "$PROCESS_NAME" | grep -v grep | head -1)
    if [ -n "$PROC_INFO" ]; then
      PID=$(echo "$PROC_INFO" | awk '{print $2}')
      CPU=$(echo "$PROC_INFO" | awk '{print $3}')
    fi
  else
    PROC_INFO=$(ps aux | grep "$PROCESS_NAME" | grep -v grep | head -1)
    if [ -n "$PROC_INFO" ]; then
      PID=$(echo "$PROC_INFO" | awk '{print $2}')
      CPU=$(echo "$PROC_INFO" | awk '{print $3}')
    fi
  fi

  if [ -n "$CPU" ]; then
    # 检查是否超过阈值
    OVER_THRESHOLD=$(echo "$CPU > $CPU_THRESHOLD" | bc -l)

    if [ "$OVER_THRESHOLD" -eq 1 ]; then
      echo "[$(date '+%H:%M:%S')] WARNING: PID $PID CPU=${CPU}% - Possible CPU-GPU transfer!"
      echo "  -> High CPU usage during GPU operations indicates:"
      echo "     1. Data being copied between CPU and GPU memory"
      echo "     2. CPU fallback for some operations"
      echo "     3. Not using full GPU acceleration pipeline"
    else
      echo "[$(date '+%H:%M:%S')] OK: PID $PID CPU=${CPU}%"
    fi
  else
    echo "[$(date '+%H:%M:%S')] Process $PROCESS_NAME not found"
  fi

  sleep $CHECK_INTERVAL
done
```

#### 8.5 GPU 加速断言函数

```typescript
/**
 * 断言操作使用了完整的 GPU 加速
 * 如果检测到高 CPU 使用率，抛出详细错误
 */
async function assertFullGpuAcceleration<T>(
  operationName: string,
  operation: () => Promise<T>,
  cpuThreshold: number = 30
): Promise<T> {
  const { result, cpuCheck } = await monitorCpuDuringGpuOperation(
    operationName,
    operation,
    cpuThreshold
  );

  if (!cpuCheck.isFullyGpuAccelerated) {
    const errorMessage = [
      `GPU Acceleration Error: ${operationName}`,
      ``,
      `Expected: Full GPU acceleration with CPU usage < ${cpuThreshold}%`,
      `Actual: Peak CPU ${cpuCheck.peakCpu}%, Average CPU ${cpuCheck.avgCpu}%`,
      ``,
      `This indicates one or more of the following issues:`,
      `  1. CPU-GPU data transfer is occurring (memory copy overhead)`,
      `  2. Some operations are falling back to CPU execution`,
      `  3. GPU pipeline is not fully utilized`,
      `  4. Hardware acceleration may not be properly enabled`,
      ``,
      `Recommendations:`,
      `  - Ensure hwAccel is set to 'auto' or specific hardware encoder`,
      `  - Check if GPU supports the required operations`,
      `  - Verify data stays in GPU memory throughout the pipeline`,
      `  - Use decodeToTexture() instead of decodeFrame() for GPU-only workflows`,
      ``,
      `Detailed Issues:`,
      ...cpuCheck.issues.map(issue => `  - ${issue}`)
    ].join('\n');

    throw new Error(errorMessage);
  }

  return result;
}

// 测试：断言解码使用完整 GPU 加速
try {
  const frame = await assertFullGpuAcceleration(
    'Video Decode',
    () => processor.decodeFrame({ path: '/path/to/video.mp4', hwAccel: 'auto' }, 5.0),
    30
  );
  console.log('Video decode: Full GPU acceleration verified');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// 测试：断言特效处理使用完整 GPU 加速
try {
  const processed = await assertFullGpuAcceleration(
    'GPU Effects',
    () => processor.applyEffects(frame, { brightness: 0.1 }),
    20  // 特效处理应该更低的 CPU 使用率
  );
  console.log('GPU effects: Full GPU acceleration verified');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// 测试：断言编码使用完整 GPU 加速
try {
  const packets = await assertFullGpuAcceleration(
    'Video Encode',
    () => encoder.encodeFrame(frame, 0),
    30
  );
  console.log('Video encode: Full GPU acceleration verified');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
```

#### 8.6 完整 GPU 流水线验证

```typescript
/**
 * 验证完整的 GPU 流水线（解码 -> 处理 -> 编码）
 * 确保数据始终在 GPU 内存中，无 CPU 回传
 */
async function verifyFullGpuPipeline(
  processor: MediaProcessor,
  inputPath: string,
  outputPath: string
): Promise<{ success: boolean; report: string }> {
  const issues: string[] = [];
  const cpuSamples: { stage: string; cpu: number }[] = [];

  console.log('Verifying full GPU pipeline...\n');

  // Stage 1: GPU 解码
  console.log('Stage 1: GPU Decode');
  const { result: texture, cpuCheck: decodeCheck } = await monitorCpuDuringGpuOperation(
    'GPU Decode',
    () => processor.decodeToTexture({ path: inputPath, hwAccel: 'auto' }, 5.0),
    25
  );
  cpuSamples.push({ stage: 'decode', cpu: decodeCheck.avgCpu });
  if (!decodeCheck.isFullyGpuAccelerated) {
    issues.push(`Decode: ${decodeCheck.issues.join('; ')}`);
  }
  console.log(`  CPU: ${decodeCheck.avgCpu}% (${decodeCheck.isFullyGpuAccelerated ? 'OK' : 'FAIL'})\n`);

  // Stage 2: GPU 特效处理（在纹理上直接操作）
  console.log('Stage 2: GPU Effects');
  const { result: processedTexture, cpuCheck: effectCheck } = await monitorCpuDuringGpuOperation(
    'GPU Effects',
    () => processor.applyEffectsToTexture(texture, {
      brightness: 0.1,
      contrast: 1.1
    }),
    20
  );
  cpuSamples.push({ stage: 'effects', cpu: effectCheck.avgCpu });
  if (!effectCheck.isFullyGpuAccelerated) {
    issues.push(`Effects: ${effectCheck.issues.join('; ')}`);
  }
  console.log(`  CPU: ${effectCheck.avgCpu}% (${effectCheck.isFullyGpuAccelerated ? 'OK' : 'FAIL'})\n`);

  // Stage 3: GPU 编码
  console.log('Stage 3: GPU Encode');
  const encoder = processor.createVideoEncoder({
    width: texture.width,
    height: texture.height,
    fps: 30,
    codec: 'h264',
    hwEncoder: 'auto'
  });

  const { result: packets, cpuCheck: encodeCheck } = await monitorCpuDuringGpuOperation(
    'GPU Encode',
    () => encoder.encodeTexture(processedTexture, 0),
    25
  );
  cpuSamples.push({ stage: 'encode', cpu: encodeCheck.avgCpu });
  if (!encodeCheck.isFullyGpuAccelerated) {
    issues.push(`Encode: ${encodeCheck.issues.join('; ')}`);
  }
  console.log(`  CPU: ${encodeCheck.avgCpu}% (${encodeCheck.isFullyGpuAccelerated ? 'OK' : 'FAIL'})\n`);

  encoder.close();

  // 生成报告
  const avgCpu = cpuSamples.reduce((sum, s) => sum + s.cpu, 0) / cpuSamples.length;
  const success = issues.length === 0;

  const report = [
    '=== GPU Pipeline Verification Report ===',
    '',
    'CPU Usage by Stage:',
    ...cpuSamples.map(s => `  ${s.stage}: ${s.cpu}%`),
    '',
    `Average CPU: ${avgCpu.toFixed(1)}%`,
    `Full GPU Pipeline: ${success ? 'YES' : 'NO'}`,
    '',
    success
      ? 'All stages executed on GPU with minimal CPU involvement.'
      : [
          'Issues Detected:',
          ...issues.map(i => `  - ${i}`),
          '',
          'High CPU usage indicates data is being transferred between CPU and GPU.',
          'This breaks the GPU pipeline and significantly impacts performance.',
          '',
          'To fix:',
          '  1. Use texture-based APIs (decodeToTexture, encodeTexture)',
          '  2. Ensure hardware acceleration is enabled',
          '  3. Keep all intermediate data in GPU memory'
        ].join('\n')
  ].join('\n');

  return { success, report };
}

// 测试：验证完整 GPU 流水线
const pipelineResult = await verifyFullGpuPipeline(
  processor,
  '/path/to/input.mp4',
  '/path/to/output.mp4'
);

console.log(pipelineResult.report);

if (!pipelineResult.success) {
  throw new Error('GPU pipeline verification failed - CPU-GPU transfer detected');
}