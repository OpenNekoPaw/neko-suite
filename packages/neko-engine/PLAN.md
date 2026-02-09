# 内容级 Diff 实现方案

## 目标
- 图片：像素级对比，输出 SSIM/PSNR 指标 + 差异热力图（RGBA base64）
- 音频：波形对比，输出 SNR + 差异区间

## 实现

### 1. `media_service/diff.rs` 扩展

**图片 diff**：`diff_image_content(path_a, path_b) -> ImageDiffResult`
- 用 `image` crate 解码两张图片为 RGBA
- 如果分辨率不同，将 B 缩放到 A 的尺寸
- 逐像素计算 SSIM（结构相似性）和 PSNR（峰值信噪比）
- 生成差异热力图（每像素 abs diff → 伪彩色 RGBA）
- 热力图编码为 JPEG base64 返回

**音频 diff**：`diff_audio_content(path_a, path_b) -> AudioDiffResult`
- 用 `FfmpegAudioDecoder` 解码两个音频为 F32 PCM（统一 48kHz/mono）
- 计算 SNR（信噪比）
- 逐段对比（每 0.1s 一段），标记差异区间
- 输出差异区间列表 `[{start, end, snr}]`

### 2. DiffResult 扩展

在现有 `DiffResult` 中新增可选字段：
- `content: Option<ContentDiff>` — 内容级对比结果
  - `ImageContentDiff { ssim, psnr, heatmap_width, heatmap_height, heatmap_data }`
  - `AudioContentDiff { snr, duration_a, duration_b, diff_regions }`

### 3. Controller 层

- `images:diff` 自动执行内容级对比
- `audios:diff` 自动执行内容级对比
- 其他分组保持元数据级

## 依赖
- `image` crate — 图片解码/编码（已有）
- `FfmpegAudioDecoder` — 音频解码（已有）
- 无新增外部依赖
