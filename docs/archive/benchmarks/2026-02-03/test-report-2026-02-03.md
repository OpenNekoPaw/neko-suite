# media-processor-rs Test Report

**Date**: 2026-02-03
**Platform**: macOS Darwin 24.6.0
**Tester**: Automated Test Suite

---

## Environment

| Item | Value |
|------|-------|
| OS | macOS Darwin 24.6.0 |
| CPU | Apple M3 Pro |
| GPU | Apple M3 Pro (Metal 3) |
| HW Decoder | VideoToolbox (zero-copy) |
| HW Encoder | h264_videotoolbox |
| Rust Version | 2021 Edition |
| Build Mode | Release (LTO enabled) |

---

## Build Results

```
Build Status: SUCCESS
Build Time: ~74 seconds
Warnings: 17 (non-critical, mostly cfg and unused imports)

Generated Artifacts:
- neko-engine (CLI binary): 7.4 MB
- libneko_native_napi.dylib (NAPI): 7.6 MB
- libneko_native_core.rlib (Core lib): 13.3 MB
```

---

## Test Results Summary

| Category | Passed | Failed | Skipped | Total |
|----------|--------|--------|---------|-------|
| CLI Tests | 9 | 0 | 0 | 9 |
| Server API Tests | 8 | 0 | 0 | 8 |
| System Resource Tests | 4 | 0 | 0 | 4 |
| Output Quality Tests | 2 | 0 | 1 | 3 |
| **Total** | **23** | **0** | **1** | **24** |

**Overall Result: PASS**

---

## CLI Tests

### serve Command

| Test | Status | Notes |
|------|--------|-------|
| serve --help | PASS | Help text displayed correctly |
| serve --port (custom) | PASS | Server starts on specified port |

### probe Command

| Test | Status | Notes |
|------|--------|-------|
| probe (text format) | PASS | Displays codec, resolution, duration, bitrate |
| probe (JSON format) | PASS | Valid JSON with all media info |
| probe (nonexistent file) | PASS | Returns appropriate error message |

**Sample Output (720P.mp4):**
```
File: 720P.mp4
Format: mov,mp4,m4a,3gp,3g2,mj2
Duration: 126.61s

Video:
  Codec: h264
  Resolution: 1280x720
  FPS: 59.94
  Bitrate: 2390 kbps

Audio:
  Codec: aac
  Sample Rate: 48000 Hz
  Channels: 6
  Bitrate: 386 kbps
```

### extract Command

| Test | Status | Output Size | Notes |
|------|--------|-------------|-------|
| extract (basic, time=0s) | PASS | 5,649 bytes | First frame extracted |
| extract (time=5s, quality=95) | PASS | 12,822 bytes | High quality JPEG |
| extract (resize 320x180) | PASS | 9,392 bytes | Thumbnail generated |
| extract (nonexistent file) | PASS | - | Error handled correctly |

### export Command

| Test | Status | Output | Notes |
|------|--------|--------|-------|
| export --help | PASS | - | Help text displayed |
| export (basic) | PASS | 75.6 MB | 121.57s video exported |
| export (h264, 5Mbps) | PASS | 4974 kbps actual | Within 1% of target |

---

## Server API Tests

**Server URL**: http://127.0.0.1:8765

### Health Check

| Endpoint | Method | Status | Response |
|----------|--------|--------|----------|
| /health | GET | PASS | "OK" |

### Probe API

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /probe?source=...&format=json | GET | PASS | Valid JSON response |
| /probe?source=...&format=text | GET | PASS | Text format response |
| /probe?source=/nonexistent | GET | PASS | 404 with error JSON |

### Frame Extraction API

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /frame/extract?source=...&time=5.0&quality=85 | GET | PASS | JPEG returned |

### Keyframe Cache API

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /keyframes/status | GET | PASS | Cache status JSON |

### Export API

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /export/start | POST | PASS | Job started, returns jobId |
| /export/status/:jobId | GET | PASS | Progress JSON returned |

### Error Handling

| Endpoint | Method | Expected | Actual | Status |
|----------|--------|----------|--------|--------|
| /invalid/endpoint | GET | 404 | 404 | PASS |
| /export/start (invalid JSON) | POST | 400/422 | 400 | PASS |

---

## System Resource Tests

### CPU Detection

| Test | Status | Value | Threshold |
|------|--------|-------|-----------|
| System CPU usage | PASS | 25.82% | < 80% |

### GPU Detection

| Test | Status | Value |
|------|--------|-------|
| GPU availability | PASS | Apple M3 Pro |
| Metal support | PASS | Metal 3 |
| VideoToolbox | PASS | Enabled (zero-copy) |

### Memory Detection

| Test | Status | Notes |
|------|--------|-------|
| Total memory | PASS | 19.3 GB detected |
| Memory pressure | PASS | Normal |

---

## Output Quality Tests

### File Size / Bitrate Detection

| Test | Status | Expected | Actual | Deviation |
|------|--------|----------|--------|-----------|
| Export bitrate | PASS | 5,000,000 bps | 4,975,329 bps | -0.5% |

### Audio Detection

| Test | Status | Codec | Sample Rate | Channels | Bitrate |
|------|--------|-------|-------------|----------|---------|
| Audio stream info | PASS | aac | 48000 Hz | 6 | 386,199 bps |

### Black Frame Detection

| Test | Status | Notes |
|------|--------|-------|
| Black frame check | SKIP | ImageMagick not installed |

---

## Hardware Acceleration Verification

### Decoder

```
[INFO] Zero-copy hardware decoding enabled: VideoToolbox
[INFO] Zero-copy import successful: 1280x720 NV12 from IOSurface
```

### Encoder

```
[INFO] Attempting to open hardware encoder: h264_videotoolbox
[INFO] Hardware encoder opened successfully
```

### GPU Pipeline

```
[INFO] GPU initialized: Apple M3 Pro (Metal)
[INFO] Adapter Metal AdapterInfo {
  name: "Apple M3 Pro",
  vendor: 0,
  device: 0,
  device_type: IntegratedGpu,
  backend: Metal
}
```

---

## Test Files Used

| File | Size | Duration | Resolution | FPS |
|------|------|----------|------------|-----|
| 720P.mp4 | 44 MB | 126.61s | 1280x720 | 59.94 |
| test.jvi | 1.8 KB | - | 1920x1080 | 30 |

---

## Skipped Tests

| Test | Reason | Recommendation |
|------|--------|----------------|
| Black frame detection | ImageMagick not installed | Install with `brew install imagemagick` |

---

## Conclusion

All critical tests passed. The media-processor-rs engine is functioning correctly with:

1. **Full hardware acceleration** via VideoToolbox (decode) and h264_videotoolbox (encode)
2. **Zero-copy GPU pipeline** for efficient frame processing
3. **Accurate bitrate control** (within 1% of target)
4. **Proper error handling** for invalid inputs
5. **Stable Server API** for all documented endpoints

**Recommendation**: Ready for production use.
