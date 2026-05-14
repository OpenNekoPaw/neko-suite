## 1. Advanced Preview Providers

- [x] 1.1 Add `VideoPreviewProvider` with ordinary poster frame and panoramic video stream support.
- [x] 1.2 Add `ScenePreviewProvider` using SceneRenderer snapshots.
- [x] 1.3 Add `PuppetPreviewProvider` using PuppetRenderer snapshots.
- [x] 1.4 Register advanced providers in `PreviewProviderRegistry`.

## 2. Panoramic Video

- [x] 2.1 Wire HwAccelDecoder output into PanoramicRenderer.
- [x] 2.2 Stream projected panoramic frames through StreamSink.
- [x] 2.3 Add runtime view-state updates without restarting decode.
- [x] 2.4 Add GPU budget integration for panoramic video provider work.

## 3. Puppet Stream And Export

- [x] 3.1 Add puppet H.264 stream option in puppet stream routing.
- [x] 3.2 Update puppet webview playback to use H264StreamClient where supported.
- [x] 3.3 Integrate PuppetRenderer output with export composition and MuxerSink.
- [x] 3.4 Keep JSON/debug stream available when H.264 is not requested.

## 4. ML GPU Bridge

- [x] 4.1 Add `MlGpuBridge` trait for texture-to-ORT and ORT-to-texture conversion.
- [x] 4.2 Add platform-gated bridge implementations or explicit unsupported errors.
- [x] 4.3 Ensure CPU ONNX remains limited to offline preprocessing and not hot path fallback.

## 5. Transition Effects

- [x] 5.1 Add two-input GPU transition effect trait or variant.
- [x] 5.2 Register compatible built-in transitions through the effect registry.
- [x] 5.3 Add tests for transition lookup and progress parameter handling.

## 6. Verification

- [x] 6.1 Verify panoramic video preview and view-state updates in webview.
- [x] 6.2 Verify scene and puppet provider snapshot generation.
- [x] 6.3 Verify puppet H.264 stream and export output files.
- [x] 6.4 Run affected Rust and TS tests.
