# media-processor-rs

High-performance media processor with GPU acceleration for UniEdit.

## Context Summary

- 项目：UniEdit - VSCode 视频编辑器
- 职责：提供视频/音频编解码、GPU 加速特效处理
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Features

- **GPU-accelerated effects**: Complete color correction (13 parameters), blur/sharpen, style effects, transitions using wgpu compute shaders
- **Hardware-accelerated decoding**: VideoToolbox (macOS), VAAPI (Linux), CUDA, D3D11VA (Windows)
- **FFmpeg video encoding**: H.264, H.265, VP9, ProRes with configurable presets
- **FFmpeg audio codec**: AAC, MP3, Opus, FLAC, PCM encoding/decoding
- **Container muxing**: MP4, MKV, WebM, MOV output support
- **Cross-platform**: Supports macOS (Metal), Linux (Vulkan), Windows (DX12)
- **N-API bindings**: Native Node.js addon for Extension Host integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Node.js (Extension)                        │
├─────────────────────────────────────────────────────────────┤
│                      N-API Bindings                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Decoder  │  │ Encoder  │  │  Audio   │  │   GPU    │    │
│  │ (FFmpeg) │  │ (FFmpeg) │  │  Codec   │  │ Processor│    │
│  │ +HwAccel │  │ +Muxer   │  │          │  │          │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │             │             │             │           │
│       └─────────────┴─────────────┴─────────────┘           │
│                          │                                   │
│                    wgpu (GPU)                               │
└─────────────────────────────────────────────────────────────┘
```

## Module Structure

```
src/
├── lib.rs              # Library entry point
├── error.rs            # Error types
├── decoder/            # Video decoding
│   ├── traits.rs       # Decoder trait
│   ├── ffmpeg.rs       # Software decoder
│   └── hwaccel.rs      # Hardware-accelerated decoder
├── encoder/            # Video encoding
│   ├── traits.rs       # Encoder trait, VideoCodec, ContainerFormat
│   ├── ffmpeg.rs       # Software encoder (H.264/H.265/VP9/ProRes)
│   └── muxer.rs        # Container muxing (MP4/MKV/WebM/MOV)
├── audio/              # Audio processing
│   ├── traits.rs       # AudioCodec, SampleFormat, AudioEncoder/Decoder
│   ├── decoder.rs      # Audio decoder
│   └── encoder.rs      # Audio encoder (AAC/MP3/Opus/FLAC)
├── gpu/                # GPU processing
│   ├── context.rs      # wgpu context
│   ├── processor.rs    # Color correction processing
│   ├── blur_processor.rs   # Blur/sharpen effects
│   ├── style_processor.rs  # Vignette, film grain, glow, chromatic aberration
│   ├── transition_processor.rs  # 18 transition effects
│   ├── compositor.rs   # Multi-layer compositing
│   ├── texture.rs      # Texture management
│   ├── buffer_pool.rs  # Buffer pooling
│   └── shaders/        # WGSL compute shaders
└── napi/               # Node.js bindings
    ├── types.rs        # JS type definitions
    └── media_processor.rs  # MediaProcessor class
```

## Prerequisites

### macOS

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install FFmpeg
brew install ffmpeg pkg-config
```

### Linux

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install FFmpeg and dependencies
sudo apt-get install -y libavcodec-dev libavformat-dev libavutil-dev libswscale-dev libswresample-dev pkg-config
```

## Building

```bash
# Install Node.js dependencies
npm install

# Build release version
npm run build

# Build debug version
npm run build:debug
```

## Usage

### Video Decoding

```typescript
import { MediaProcessor } from '@vedit/media-processor-rs';

const processor = await MediaProcessor.create();

// Get GPU info
console.log('GPU:', processor.getGpuInfo());

// Detect hardware acceleration
console.log('HW Accel:', processor.detectHwAccel());

// Decode a frame (with optional hardware acceleration)
const frame = processor.decodeFrame(
  { path: 'video.mp4', hwAccel: 'auto' },
  5.0  // time in seconds
);

// Decode frame range
const frames = processor.decodeFrameRange(
  { path: 'video.mp4' },
  0.0,   // start time
  10.0,  // end time
  30.0   // fps
);
```

### Video Encoding

```typescript
// Create encoder session
const encoder = processor.createVideoEncoder({
  width: 1920,
  height: 1080,
  fps: 30.0,
  bitrate: 5000000,
  codec: 'h264',
  preset: 'medium',
  profile: 'high',
});

// Encode frames
for (const frame of frames) {
  const packets = encoder.encodeFrame(frame, pts++);
  // Write packets to file or muxer
}

// Flush remaining packets
const remaining = encoder.flush();

// Close encoder
encoder.close();
```

### Audio Processing

```typescript
// Get audio info
const audioInfo = processor.getAudioInfo('audio.mp3');
console.log('Sample rate:', audioInfo.sampleRate);
console.log('Channels:', audioInfo.channels);

// Create audio decoder session
const audioDecoder = processor.createAudioDecoder('audio.mp3');
while (true) {
  const frame = audioDecoder.decodeNext();
  if (!frame) break;
  // Process frame
}
audioDecoder.close();

// Create audio encoder session
const audioEncoder = processor.createAudioEncoder({
  sampleRate: 48000,
  channels: 2,
  bitrate: 128000,
  codec: 'aac',
});
```

### GPU Effects - Color Correction

```typescript
// Apply full color correction with 13 parameters
const processed = processor.applyEffects(frame, {
  // Basic adjustments
  brightness: 0.1,      // -1.0 ~ 1.0
  contrast: 1.2,        // 0.0 ~ 3.0
  saturation: 1.1,      // 0.0 ~ 3.0
  exposure: 0.5,        // -3.0 ~ 3.0

  // Tone adjustments
  gamma: 1.0,           // 0.1 ~ 3.0
  hueShift: 0,          // -180 ~ 180
  vibrance: 0.2,        // -1.0 ~ 1.0

  // White balance
  temperature: 10,      // -100 ~ 100
  tint: 0,              // -100 ~ 100

  // Highlights/Shadows
  highlights: -0.2,     // -1.0 ~ 1.0
  shadows: 0.1,         // -1.0 ~ 1.0
  whites: 0,            // -1.0 ~ 1.0
  blacks: 0,            // -1.0 ~ 1.0
});
```

### GPU Effects - Blur/Sharpen

```typescript
// Apply blur effect
const blurred = processor.applyBlur(frame, {
  blurType: 'gaussian',  // 'box' | 'gaussian' | 'directional' | 'radial' | 'zoom'
  radius: 10,
  // For directional blur
  directionX: 1.0,
  directionY: 0.0,
  // For radial/zoom blur
  centerX: 0.5,
  centerY: 0.5,
  strength: 0.5,
  samples: 32,
});

// Apply sharpen effect
const sharpened = processor.applySharpen(frame, {
  amount: 1.5,      // 0.0 ~ 5.0
  radius: 1.0,      // 0.5 ~ 5.0
  threshold: 0.1,   // 0.0 ~ 1.0
});
```

### GPU Effects - Style Effects

```typescript
// Apply vignette
const vignetted = processor.applyVignette(frame, {
  amount: 0.5,      // 0.0 ~ 1.0
  radius: 0.7,      // 0.0 ~ 2.0
  softness: 0.5,    // 0.0 ~ 1.0
  roundness: 1.0,   // 0.0 ~ 1.0
});

// Apply film grain
const grained = processor.applyFilmGrain(frame, {
  amount: 0.3,      // 0.0 ~ 1.0
  size: 1.0,        // 0.5 ~ 3.0
  time: 0.0,        // Animation seed
  colorAmount: 0,   // 0.0 ~ 1.0
});

// Apply glow/bloom
const glowing = processor.applyGlow(frame, {
  intensity: 1.0,   // 0.0 ~ 2.0
  threshold: 0.7,   // 0.0 ~ 1.0
  radius: 10,       // 1.0 ~ 50.0
});

// Apply chromatic aberration
const aberrated = processor.applyChromaticAberration(frame, {
  amount: 0.01,     // 0.0 ~ 0.1
  angle: 0,         // Radians
  centerX: 0.5,
  centerY: 0.5,
});
```

### GPU Effects - Transitions

```typescript
// Apply transition between two frames
const transitioned = processor.applyTransition(fromFrame, toFrame, {
  transitionType: 'fade',  // See transition types below
  progress: 0.5,           // 0.0 ~ 1.0
  feather: 0.02,           // Edge softness
  centerX: 0.5,            // For radial transitions
  centerY: 0.5,
  angle: 0,                // For directional transitions
});
```

**Supported Transition Types:**

| Type | Description |
|------|-------------|
| `fade` | Crossfade |
| `wipe_left` / `wipe_right` | Horizontal wipe |
| `wipe_up` / `wipe_down` | Vertical wipe |
| `iris_circle` / `iris_rectangle` | Iris transition |
| `clock` | Clock wipe |
| `slide_left` / `slide_right` | Slide transition |
| `zoom_in` / `zoom_out` | Zoom transition |
| `dissolve` | Random dissolve |
| `pixelate` | Pixelation |
| `ripple` | Ripple effect |
| `swirl` | Swirl effect |
| `glitch` | Glitch effect |
| `flash` | Flash white |

### Zero-Copy Texture Path

```typescript
// Upload frame to GPU texture
const textureHandle = processor.uploadToTexture(frame);

// Decode directly to texture
const textureHandle = processor.decodeToTexture(
  { path: 'video.mp4' },
  5.0
);

// Read texture back (for debugging)
const frameData = processor.readTexture(textureHandle);

// Clear texture pool
processor.clearTexturePool();
```

### Cleanup

```typescript
processor.dispose();
```

## API Reference

### MediaProcessor

| Method | Description |
|--------|-------------|
| `create()` | Create MediaProcessor instance |
| `getGpuInfo()` | Get GPU information |
| `detectHwAccel()` | Detect hardware acceleration |
| `decodeFrame(config, time)` | Decode single video frame |
| `decodeFrameRange(config, start, end, fps)` | Decode frame range |
| `applyEffects(frame, params)` | Apply color correction (13 params) |
| `applyBlur(frame, params)` | Apply blur effect |
| `applySharpen(frame, params)` | Apply sharpen effect |
| `applyVignette(frame, params)` | Apply vignette effect |
| `applyFilmGrain(frame, params)` | Apply film grain effect |
| `applyGlow(frame, params)` | Apply glow/bloom effect |
| `applyChromaticAberration(frame, params)` | Apply chromatic aberration |
| `applyTransition(from, to, params)` | Apply transition (18 types) |
| `processFrame(config, time, params?)` | Decode + apply effects |
| `createVideoEncoder(config)` | Create video encoder session |
| `createAudioDecoder(path)` | Create audio decoder session |
| `createAudioEncoder(config)` | Create audio encoder session |
| `uploadToTexture(frame)` | Upload to GPU texture |
| `decodeToTexture(config, time)` | Decode to GPU texture |
| `dispose()` | Release resources |

### Video Codecs

| Codec | Description |
|-------|-------------|
| `h264` | H.264 / AVC (libx264) |
| `h265` | H.265 / HEVC (libx265) |
| `vp9` | VP9 (libvpx-vp9) |
| `prores` | Apple ProRes |

### Audio Codecs

| Codec | Description |
|-------|-------------|
| `aac` | AAC (default) |
| `mp3` | MP3 (libmp3lame) |
| `opus` | Opus (libopus) |
| `flac` | FLAC (lossless) |
| `pcm` | PCM (uncompressed) |

### Container Formats

| Format | Supported Codecs |
|--------|------------------|
| `mp4` | H.264, H.265, ProRes, AAC |
| `mkv` | All codecs |
| `webm` | VP9, Opus |
| `mov` | H.264, H.265, ProRes, AAC |

### Encoder Presets

| Preset | Description |
|--------|-------------|
| `ultrafast` | Fastest, lowest quality |
| `fast` | Fast encoding |
| `medium` | Balanced (default) |
| `slow` | Better quality |
| `veryslow` | Best quality |

## Development

```bash
# Run Rust tests
cargo test

# Check compilation
cargo check

# Run with logging
RUST_LOG=info npm run build:debug
```

## License

MIT
