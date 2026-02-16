//! Hardware-accelerated decoder - FFmpeg outputs NV12 GPU textures for wgpu
//!
//! This module implements true zero-copy hardware decoding where:
//! 1. FFmpeg decodes video using hardware acceleration (VideoToolbox/VAAPI/D3D11VA)
//! 2. Decoded frames stay in GPU memory as NV12 textures
//! 3. wgpu imports these textures directly without CPU copy
//!
//! Platform support:
//! - macOS: VideoToolbox → CVPixelBuffer → IOSurface → Metal → wgpu
//! - Linux: VAAPI → VASurface → DMA-BUF → Vulkan → wgpu
//! - Windows: D3D11VA → ID3D11Texture2D → SharedHandle → wgpu

use super::common::{get_best_hw_accel, init_ffmpeg, HwAccelType, HwDeviceContext};
use super::traits::{DecodedFrame, Decoder, FrameData, GpuTextureHandle, MediaInfo, PixelFormat};
use crate::error::{Error, Result};

use ffmpeg_next as ffmpeg;
use ffmpeg_next::format::{input, Pixel};
use ffmpeg_next::media::Type;
use ffmpeg_next::util::frame::video::Video as VideoFrame;

use std::path::Path;

// CoreVideo framework for CVPixelBufferGetIOSurface
#[cfg(target_os = "macos")]
#[link(name = "CoreVideo", kind = "framework")]
extern "C" {
    fn CVPixelBufferGetIOSurface(pixelBuffer: *const std::ffi::c_void)
        -> *const std::ffi::c_void;
    fn CVPixelBufferRetain(pixelBuffer: *const std::ffi::c_void) -> *const std::ffi::c_void;
    fn CVPixelBufferRelease(pixelBuffer: *const std::ffi::c_void);
}

/// RAII guard that retains a CVPixelBuffer (reference count +1).
///
/// When dropped, releases the CVPixelBuffer, allowing VideoToolbox to reclaim it.
/// This ensures the backing IOSurface data remains valid for the lifetime of this guard.
///
/// Without this guard, the CVPixelBuffer returned by VideoToolbox is released when the
/// AVFrame is unreffed (in `decode_next_gpu`), and VideoToolbox may reclaim the
/// backing IOSurface and zero its contents — resulting in black frames.
#[cfg(target_os = "macos")]
pub(crate) struct RetainedPixelBuffer(usize);

#[cfg(target_os = "macos")]
impl RetainedPixelBuffer {
    /// Retain a CVPixelBuffer. The pointer must be a valid CVPixelBufferRef.
    ///
    /// # Safety
    /// `pixel_buffer` must be a valid CVPixelBufferRef cast to usize.
    unsafe fn retain(pixel_buffer: usize) -> Self {
        CVPixelBufferRetain(pixel_buffer as *const std::ffi::c_void);
        Self(pixel_buffer)
    }
}

#[cfg(target_os = "macos")]
impl Drop for RetainedPixelBuffer {
    fn drop(&mut self) {
        if self.0 != 0 {
            unsafe {
                CVPixelBufferRelease(self.0 as *const std::ffi::c_void);
            }
        }
    }
}

#[cfg(target_os = "macos")]
impl std::fmt::Debug for RetainedPixelBuffer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "RetainedPixelBuffer({:#x})", self.0)
    }
}

// Safety: CVPixelBuffer is reference-counted and thread-safe (CoreFoundation type)
#[cfg(target_os = "macos")]
unsafe impl Send for RetainedPixelBuffer {}
#[cfg(target_os = "macos")]
unsafe impl Sync for RetainedPixelBuffer {}

/// NV12 GPU texture output from hardware decoder
#[derive(Debug)]
pub struct Nv12GpuTexture {
    /// Texture width
    pub width: u32,
    /// Texture height
    pub height: u32,
    /// Platform-specific GPU handle
    pub handle: GpuTextureHandle,
    /// Presentation timestamp
    pub pts: i64,
    /// Whether this is a keyframe
    pub is_keyframe: bool,
    /// Color space (FFmpeg AVColorSpace value)
    pub color_space: i32,
    /// Keeps the CVPixelBuffer retained so IOSurface data stays valid.
    /// When this guard is dropped, the CVPixelBuffer is released back to VideoToolbox's pool.
    #[cfg(target_os = "macos")]
    _pixel_buffer_guard: RetainedPixelBuffer,
}

/// Hardware-accelerated decoder configuration
#[derive(Debug, Clone)]
pub struct HwAccelDecoderConfig {
    /// Preferred hardware acceleration (Auto = best available)
    pub hw_accel: HwAccelType,
    /// GPU device index (for multi-GPU systems)
    pub gpu_index: u32,
}

impl Default for HwAccelDecoderConfig {
    fn default() -> Self {
        Self {
            hw_accel: HwAccelType::Auto,
            gpu_index: 0,
        }
    }
}

/// Hardware-accelerated decoder
///
/// Decodes video frames directly to GPU memory, outputting NV12 textures
/// that can be imported by wgpu without CPU copy.
///
/// This decoder does NOT fall back to software decoding. If hardware
/// acceleration fails, errors are returned immediately. Use this decoder
/// only when GPU textures are required.
pub struct HwAccelDecoder {
    input_ctx: Option<ffmpeg::format::context::Input>,
    decoder: Option<ffmpeg::decoder::Video>,
    stream_index: usize,
    media_info: Option<MediaInfo>,
    current_position: f64,
    time_base: f64,
    config: HwAccelDecoderConfig,
    hw_device_ctx: Option<HwDeviceContext>,
    active_hw_type: Option<HwAccelType>,
}

impl HwAccelDecoder {
    /// Create a new zero-copy decoder
    pub fn new() -> Self {
        init_ffmpeg();
        Self {
            input_ctx: None,
            decoder: None,
            stream_index: 0,
            media_info: None,
            current_position: 0.0,
            time_base: 1.0,
            config: HwAccelDecoderConfig::default(),
            hw_device_ctx: None,
            active_hw_type: None,
        }
    }

    /// Create with specific hardware acceleration type
    pub fn with_hw_accel(hw_accel: HwAccelType) -> Self {
        let mut decoder = Self::new();
        decoder.config.hw_accel = hw_accel;
        decoder
    }

    /// Set configuration
    pub fn with_config(mut self, config: HwAccelDecoderConfig) -> Self {
        self.config = config;
        self
    }

    /// Check if hardware decoding is active
    pub fn is_hw_active(&self) -> bool {
        self.active_hw_type.is_some()
    }

    /// Get the active hardware acceleration type
    pub fn active_hw_type(&self) -> Option<HwAccelType> {
        self.active_hw_type
    }

    /// Decode next frame as NV12 GPU texture
    ///
    /// Returns the raw hardware frame without CPU transfer.
    /// The texture handle can be imported into wgpu.
    pub fn decode_next_gpu(&mut self) -> Result<Option<Nv12GpuTexture>> {
        if self.decoder.is_none() || self.input_ctx.is_none() {
            return Err(Error::DecoderNotInitialized);
        }

        let stream_index = self.stream_index;

        // Try to receive frame from decoder
        {
            let decoder = self.decoder.as_mut().unwrap();
            let mut hw_frame = VideoFrame::empty();

            match decoder.receive_frame(&mut hw_frame) {
                Ok(_) => {
                    return self.extract_gpu_texture(&hw_frame);
                }
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                    // Need more packets
                }
                Err(ffmpeg::Error::Eof) => {
                    return Ok(None);
                }
                Err(e) => {
                    return Err(Error::DecodeFailed(e.to_string()));
                }
            }
        }

        // Read packets and send to decoder
        loop {
            let packet_result = {
                let input_ctx = self.input_ctx.as_mut().unwrap();
                let mut packet_opt = None;
                for (stream, packet) in input_ctx.packets() {
                    if stream.index() == stream_index {
                        packet_opt = Some(packet);
                        break;
                    }
                }
                packet_opt
            };

            match packet_result {
                Some(packet) => {
                    let decoder = self.decoder.as_mut().unwrap();
                    decoder.send_packet(&packet)?;

                    let mut hw_frame = VideoFrame::empty();
                    match decoder.receive_frame(&mut hw_frame) {
                        Ok(_) => {
                            return self.extract_gpu_texture(&hw_frame);
                        }
                        Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                            continue;
                        }
                        Err(ffmpeg::Error::Eof) => {
                            return Ok(None);
                        }
                        Err(e) => {
                            return Err(Error::DecodeFailed(e.to_string()));
                        }
                    }
                }
                None => {
                    let decoder = self.decoder.as_mut().unwrap();
                    decoder.send_eof()?;

                    let mut hw_frame = VideoFrame::empty();
                    match decoder.receive_frame(&mut hw_frame) {
                        Ok(_) => {
                            return self.extract_gpu_texture(&hw_frame);
                        }
                        _ => {
                            return Ok(None);
                        }
                    }
                }
            }
        }
    }

    /// Decode frame at specific time as NV12 GPU texture
    ///
    /// Seeks to the specified time and decodes the frame.
    /// Returns the raw hardware frame without CPU transfer.
    pub fn decode_gpu_at(&mut self, time_seconds: f64) -> Result<Option<Nv12GpuTexture>> {
        // Only seek if we're far from the target time (more than 1 second)
        // This avoids expensive seeks for sequential frame access
        let time_diff = (time_seconds - self.current_position).abs();
        if time_diff > 1.0 {
            self.seek(time_seconds)?;
        }

        // Decode frames until we reach or pass the target time
        let target_pts = (time_seconds / self.time_base) as i64;
        let mut last_frame: Option<Nv12GpuTexture> = None;

        loop {
            match self.decode_next_gpu()? {
                Some(frame) => {
                    if frame.pts >= target_pts {
                        return Ok(Some(frame));
                    }
                    last_frame = Some(frame);
                }
                None => {
                    return Ok(last_frame);
                }
            }
        }
    }

    /// Extract GPU texture handle from hardware frame
    fn extract_gpu_texture(&mut self, hw_frame: &VideoFrame) -> Result<Option<Nv12GpuTexture>> {
        let format = hw_frame.format();
        let width = hw_frame.width();
        let height = hw_frame.height();
        let pts = hw_frame.pts().unwrap_or(0);
        let is_keyframe = hw_frame.is_key();

        // Extract color space from frame
        let color_space = unsafe { (*hw_frame.as_ptr()).colorspace as i32 };

        // Update position
        self.current_position = pts as f64 * self.time_base;

        // Extract platform-specific GPU handle
        let handle = self.extract_platform_handle(hw_frame, format)?;

        // Retain CVPixelBuffer so IOSurface data stays valid after hw_frame is dropped.
        // Without this, VideoToolbox can reclaim the buffer and zero its contents.
        #[cfg(target_os = "macos")]
        let _pixel_buffer_guard = {
            if let GpuTextureHandle::VideoToolbox { pixel_buffer, .. } = &handle {
                unsafe { RetainedPixelBuffer::retain(*pixel_buffer) }
            } else {
                RetainedPixelBuffer(0)
            }
        };

        Ok(Some(Nv12GpuTexture {
            width,
            height,
            handle,
            pts,
            is_keyframe,
            color_space,
            #[cfg(target_os = "macos")]
            _pixel_buffer_guard,
        }))
    }

    /// Extract platform-specific GPU texture handle
    #[allow(unused_variables)]
    fn extract_platform_handle(
        &self,
        hw_frame: &VideoFrame,
        format: Pixel,
    ) -> Result<GpuTextureHandle> {
        unsafe {
            let frame_ptr = hw_frame.as_ptr();

            match format {
                #[cfg(target_os = "macos")]
                Pixel::VIDEOTOOLBOX => {
                    // VideoToolbox: data[3] contains CVPixelBufferRef
                    let pixel_buffer = (*frame_ptr).data[3] as usize;
                    if pixel_buffer == 0 {
                        return Err(Error::DecodeFailed(
                            "VideoToolbox frame has no CVPixelBuffer".to_string(),
                        ));
                    }

                    // Get IOSurface from CVPixelBuffer for Metal interop
                    let io_surface =
                        CVPixelBufferGetIOSurface(pixel_buffer as *const std::ffi::c_void)
                            as usize;

                    if io_surface == 0 {
                        return Err(Error::DecodeFailed(format!(
                            "CVPixelBufferGetIOSurface returned null for pixel_buffer={:#x}. \
                             Zero-copy requires IOSurface-backed CVPixelBuffer.",
                            pixel_buffer
                        )));
                    }

                    Ok(GpuTextureHandle::VideoToolbox {
                        pixel_buffer,
                        io_surface,
                    })
                }

                #[cfg(target_os = "linux")]
                Pixel::VAAPI => {
                    // VAAPI: data[3] contains VASurfaceID
                    let surface_id = (*frame_ptr).data[3] as u32;

                    // Get VADisplay from hardware frames context
                    let hw_frames_ctx = (*frame_ptr).hw_frames_ctx;
                    if hw_frames_ctx.is_null() {
                        return Err(Error::DecodeFailed(
                            "VAAPI frame has no hw_frames_ctx".to_string(),
                        ));
                    }

                    let frames_ctx =
                        (*hw_frames_ctx).data as *mut ffmpeg::ffi::AVHWFramesContext;
                    let device_ctx = (*frames_ctx).device_ctx;
                    let vaapi_ctx =
                        (*device_ctx).hwctx as *mut ffmpeg::ffi::AVVAAPIDeviceContext;
                    let display = (*vaapi_ctx).display as usize;

                    Ok(GpuTextureHandle::Vaapi {
                        surface_id,
                        display,
                    })
                }

                #[cfg(any(target_os = "linux", target_os = "windows"))]
                Pixel::CUDA => {
                    // CUDA: data[0] contains CUdeviceptr
                    let device_ptr = (*frame_ptr).data[0] as usize;
                    let pitch = (*frame_ptr).linesize[0] as usize;

                    Ok(GpuTextureHandle::Cuda { device_ptr, pitch })
                }

                #[cfg(target_os = "windows")]
                Pixel::D3D11 => {
                    // D3D11: data[0] contains ID3D11Texture2D*
                    // data[1] contains the array index
                    let texture = (*frame_ptr).data[0] as usize;
                    let array_index = (*frame_ptr).data[1] as u32;

                    if texture == 0 {
                        return Err(Error::DecodeFailed(
                            "D3D11 frame has no texture".to_string(),
                        ));
                    }

                    Ok(GpuTextureHandle::D3d11 {
                        texture,
                        array_index,
                    })
                }

                _ => {
                    // Not a hardware format or unsupported
                    Err(Error::DecodeFailed(format!(
                        "Unsupported hardware pixel format: {:?}",
                        format
                    )))
                }
            }
        }
    }

    /// Configure hardware acceleration for decoder
    fn configure_hw_accel(&mut self, decoder: &mut ffmpeg::decoder::Video) -> Result<HwAccelType> {
        // Resolve Auto to actual type
        let hw_type = if self.config.hw_accel == HwAccelType::Auto {
            get_best_hw_accel()
        } else {
            self.config.hw_accel
        };

        let hw_type_av = hw_type.av_hw_device_type();
        if hw_type_av == ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_NONE {
            return Err(Error::Ffmpeg(
                "No hardware acceleration available".to_string(),
            ));
        }

        // Create hardware device context with optional device index
        let hw_device_ctx = if self.config.gpu_index > 0 {
            HwDeviceContext::with_device(hw_type, Some(&self.config.gpu_index.to_string()))?
        } else {
            HwDeviceContext::new(hw_type)?
        };

        // Set hardware device context on decoder
        unsafe {
            let decoder_ctx = decoder.as_mut_ptr();
            let hw_ctx_ref = ffmpeg::ffi::av_buffer_ref(hw_device_ctx.as_ptr());
            if hw_ctx_ref.is_null() {
                return Err(Error::Ffmpeg(
                    "Failed to create hardware context reference".to_string(),
                ));
            }
            (*decoder_ctx).hw_device_ctx = hw_ctx_ref;
        }

        self.hw_device_ctx = Some(hw_device_ctx);
        self.active_hw_type = Some(hw_type);

        tracing::info!("Zero-copy hardware decoding enabled: {:?}", hw_type);
        Ok(hw_type)
    }
}

impl Default for HwAccelDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl Decoder for HwAccelDecoder {
    fn open(&mut self, path: &str) -> Result<MediaInfo> {
        if !Path::new(path).exists() {
            return Err(Error::FileNotFound(path.to_string()));
        }

        let input_ctx = input(&path)?;

        let stream = input_ctx
            .streams()
            .best(Type::Video)
            .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

        let stream_index = stream.index();
        let codec_params = stream.parameters();
        let time_base = stream.time_base();
        self.time_base = time_base.numerator() as f64 / time_base.denominator() as f64;

        let context = ffmpeg::codec::context::Context::from_parameters(codec_params)?;
        let mut decoder = context.decoder().video()?;

        // Configure hardware acceleration (required for zero-copy)
        self.configure_hw_accel(&mut decoder)?;

        let width = decoder.width();
        let height = decoder.height();

        let duration = if stream.duration() > 0 {
            stream.duration() as f64 * self.time_base
        } else {
            input_ctx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        };

        let fps = stream.avg_frame_rate();
        let fps = if fps.denominator() > 0 {
            fps.numerator() as f64 / fps.denominator() as f64
        } else {
            30.0
        };

        let frame_count = if stream.frames() > 0 {
            stream.frames() as u64
        } else {
            (duration * fps) as u64
        };

        let codec_name = decoder
            .codec()
            .map(|c| c.name().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let media_info = MediaInfo {
            width,
            height,
            duration,
            fps,
            codec: codec_name,
            pixel_format: "nv12".to_string(), // Hardware decoders output NV12
            frame_count,
        };

        self.input_ctx = Some(input_ctx);
        self.decoder = Some(decoder);
        self.stream_index = stream_index;
        self.media_info = Some(media_info.clone());
        self.current_position = 0.0;

        Ok(media_info)
    }

    fn seek(&mut self, time_seconds: f64) -> Result<()> {
        let input_ctx = self.input_ctx.as_mut().ok_or(Error::DecoderNotInitialized)?;
        let decoder = self.decoder.as_mut().ok_or(Error::DecoderNotInitialized)?;

        if time_seconds < 0.0 {
            return Err(Error::InvalidSeek(time_seconds));
        }

        let timestamp = (time_seconds / self.time_base) as i64;
        input_ctx.seek(timestamp, ..timestamp)?;
        decoder.flush();
        self.current_position = time_seconds;

        Ok(())
    }

    fn decode_next(&mut self) -> Result<Option<DecodedFrame>> {
        // Wraps decode_next_gpu() as DecodedFrame for Decoder trait
        let gpu_texture = self.decode_next_gpu()?;

        match gpu_texture {
            Some(tex) => Ok(Some(DecodedFrame {
                width: tex.width,
                height: tex.height,
                format: PixelFormat::Nv12,
                timestamp: self.current_position,
                is_keyframe: tex.is_keyframe,
                data: FrameData::Gpu(tex.handle),
            })),
            None => Ok(None),
        }
    }

    fn position(&self) -> f64 {
        self.current_position
    }

    fn media_info(&self) -> Option<&MediaInfo> {
        self.media_info.as_ref()
    }

    fn close(&mut self) {
        self.decoder = None;
        self.input_ctx = None;
        self.media_info = None;
        self.current_position = 0.0;
        self.active_hw_type = None;
        self.hw_device_ctx = None;
    }
}

impl Drop for HwAccelDecoder {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zerocopy_config_default() {
        let config = HwAccelDecoderConfig::default();
        assert_eq!(config.gpu_index, 0);
        assert_eq!(config.hw_accel, HwAccelType::Auto);
    }

    #[test]
    fn test_zerocopy_decoder_new() {
        let decoder = HwAccelDecoder::new();
        assert!(!decoder.is_hw_active());
        assert!(decoder.active_hw_type().is_none());
    }

    #[test]
    fn test_with_hw_accel() {
        let decoder = HwAccelDecoder::with_hw_accel(HwAccelType::VideoToolbox);
        assert_eq!(decoder.config.hw_accel, HwAccelType::VideoToolbox);
    }
}
