//! Hardware-accelerated encoder using FFmpeg hwaccel
//!
//! Supports:
//! - macOS: VideoToolbox (h264_videotoolbox, hevc_videotoolbox)
//! - Linux: VAAPI (h264_vaapi, hevc_vaapi)
//! - NVIDIA: NVENC (h264_nvenc, hevc_nvenc)
//! - Intel: Quick Sync Video (h264_qsv, hevc_qsv)
//!
//! ## Input Requirements
//!
//! This encoder expects **NV12 format** input data. The GPU pipeline should
//! perform RGBA→NV12 conversion using compute shaders before encoding.
//! No CPU-based format conversion is performed (zero-copy design).

use super::traits::{EncodedPacket, Encoder, EncoderConfig, HwEncoderType};
#[cfg(test)]
use super::traits::VideoCodec;
use crate::error::{Error, Result};

use ffmpeg_next as ffmpeg;
use ffmpeg_next::format::Pixel;
use ffmpeg_next::util::color::Range as ColorRange;
use ffmpeg_next::util::frame::video::Video as VideoFrame;
use ffmpeg_next::{Dictionary, Rational};

#[cfg(any(target_os = "linux", target_os = "windows"))]
use std::path::Path;
use std::sync::Once;

static FFMPEG_INIT: Once = Once::new();

/// Initialize FFmpeg (thread-safe, called once)
fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });
}

// =============================================================================
// Hardware Encoder Detection
// =============================================================================

/// Detect available hardware encoders on the current platform
pub fn detect_hw_encoders() -> Vec<HwEncoderType> {
    let mut available = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // VideoToolbox is always available on macOS
        available.push(HwEncoderType::VideoToolbox);
    }

    #[cfg(target_os = "linux")]
    {
        // Check for NVIDIA GPU (NVENC)
        if Path::new("/dev/nvidia0").exists() {
            available.push(HwEncoderType::Nvenc);
        }

        // Check for VAAPI (Intel/AMD)
        if Path::new("/dev/dri/renderD128").exists() {
            available.push(HwEncoderType::Vaapi);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check for NVIDIA (NVENC)
        if std::env::var("CUDA_PATH").is_ok() || Path::new("C:\\Windows\\System32\\nvEncodeAPI64.dll").exists() {
            available.push(HwEncoderType::Nvenc);
        }

        // Intel QSV is generally available on Windows with Intel GPUs
        // This is a simplified check
        available.push(HwEncoderType::Qsv);
    }

    available
}

/// Get the best available hardware encoder
pub fn get_best_hw_encoder() -> HwEncoderType {
    let available = detect_hw_encoders();
    available.into_iter().next().unwrap_or(HwEncoderType::None)
}

// =============================================================================
// Hardware-Accelerated Encoder
// =============================================================================

/// Hardware-accelerated FFmpeg encoder (GPU-only)
///
/// ## Input Format
///
/// This encoder requires **NV12** pixel format input. The caller must ensure
/// data is in NV12 format before calling `encode_frame()`. Use the GPU-based
/// `RgbaToNv12Converter` for format conversion to avoid CPU overhead.
pub struct HwAccelEncoder {
    /// FFmpeg encoder context
    encoder: Option<ffmpeg::encoder::Video>,
    /// Encoder configuration
    config: Option<EncoderConfig>,
    /// Frame counter
    frame_count: i64,
    /// Time base for timestamps
    time_base: Rational,
    /// Resolved hardware encoder type
    hw_type: HwEncoderType,
    /// Whether hardware encoding is active
    hw_active: bool,
}

impl HwAccelEncoder {
    /// Create a new hardware-accelerated encoder
    pub fn new() -> Self {
        init_ffmpeg();
        Self {
            encoder: None,
            config: None,
            frame_count: 0,
            time_base: Rational::new(1, 1000),
            hw_type: HwEncoderType::None,
            hw_active: false,
        }
    }

    /// Check if hardware encoding is active
    pub fn is_hw_active(&self) -> bool {
        self.hw_active
    }

    /// Get the active hardware encoder type
    pub fn active_hw_type(&self) -> HwEncoderType {
        if self.hw_active {
            self.hw_type
        } else {
            HwEncoderType::None
        }
    }

    /// Copy NV12 frame data from buffer to VideoFrame
    ///
    /// Input data must be in NV12 format: Y plane followed by interleaved UV plane.
    /// Optimized with fast path when stride == width (uses memcpy instead of row-by-row copy).
    fn copy_nv12_to_frame(data: &[u8], frame: &mut VideoFrame, width: u32, height: u32) {
        let w = width as usize;
        let h = height as usize;

        // Y plane
        let y_stride = frame.stride(0);
        let y_data = frame.data_mut(0);

        if y_stride == w {
            // Fast path: stride matches width, use single memcpy
            // This is ~3-5x faster due to better cache utilization and SIMD optimization
            let y_size = w * h;
            y_data[..y_size].copy_from_slice(&data[..y_size]);
        } else {
            // Slow path: stride mismatch, copy row by row
            for y in 0..h {
                let src_offset = y * w;
                let dst_offset = y * y_stride;
                y_data[dst_offset..dst_offset + w].copy_from_slice(&data[src_offset..src_offset + w]);
            }
        }

        // UV plane (interleaved)
        let uv_offset = w * h;
        let uv_stride = frame.stride(1);
        let uv_data = frame.data_mut(1);
        let uv_h = h / 2;

        if uv_stride == w {
            // Fast path: stride matches width
            let uv_size = w * uv_h;
            uv_data[..uv_size].copy_from_slice(&data[uv_offset..uv_offset + uv_size]);
        } else {
            // Slow path: stride mismatch, copy row by row
            for y in 0..uv_h {
                let src_offset = uv_offset + y * w;
                let dst_offset = y * uv_stride;
                uv_data[dst_offset..dst_offset + w].copy_from_slice(&data[src_offset..src_offset + w]);
            }
        }
    }

    /// Receive encoded packets from encoder
    fn receive_packets(&mut self) -> Result<Vec<EncodedPacket>> {
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        let mut packets = Vec::new();
        let mut packet = ffmpeg::Packet::empty();

        loop {
            match encoder.receive_packet(&mut packet) {
                Ok(_) => {
                    packets.push(EncodedPacket {
                        data: packet.data().unwrap_or(&[]).to_vec(),
                        pts: packet.pts().unwrap_or(0),
                        dts: packet.dts().unwrap_or(0),
                        is_keyframe: packet.is_key(),
                        duration: packet.duration(),
                        stream_index: 0,
                    });
                }
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                    break;
                }
                Err(ffmpeg::Error::Eof) => {
                    break;
                }
                Err(e) => {
                    return Err(Error::EncodeFailed(e.to_string()));
                }
            }
        }

        Ok(packets)
    }

    /// Try to open a hardware encoder
    fn try_open_hw_encoder(&mut self, config: &EncoderConfig, hw_type: HwEncoderType) -> Result<bool> {
        let encoder_name = match hw_type.encoder_name(config.codec) {
            Some(name) => name,
            None => {
                tracing::debug!("Hardware encoder {:?} does not support codec {:?}", hw_type, config.codec);
                return Ok(false);
            }
        };

        tracing::info!("Attempting to open hardware encoder: {}", encoder_name);

        // Find encoder by name
        let codec = match ffmpeg::encoder::find_by_name(encoder_name) {
            Some(c) => c,
            None => {
                tracing::debug!("Hardware encoder {} not found", encoder_name);
                return Ok(false);
            }
        };

        // Create encoder context
        let context = ffmpeg::codec::context::Context::new_with_codec(codec);
        let mut encoder = context.encoder().video()?;

        // Set encoding parameters
        encoder.set_width(config.width);
        encoder.set_height(config.height);

        // Set frame rate and time base
        let fps_num = (config.fps * 1000.0) as i32;
        let fps_den = 1000;
        encoder.set_frame_rate(Some(Rational::new(fps_num, fps_den)));

        self.time_base = Rational::new(fps_den, fps_num);
        encoder.set_time_base(self.time_base);

        // Set bitrate
        encoder.set_bit_rate(config.bitrate as usize);

        // Hardware encoders use NV12 format
        encoder.set_format(Pixel::NV12);

        // Set color range - VideoToolbox requires explicit color range
        encoder.set_color_range(ColorRange::MPEG); // Limited range (16-235) - standard for video

        // Set GOP size if specified
        if let Some(gop) = config.gop_size {
            encoder.set_gop(gop);
        } else {
            // Default GOP = 1 second
            encoder.set_gop((config.fps as u32).max(1));
        }

        // Set max B-frames if specified
        if let Some(max_b) = config.max_b_frames {
            encoder.set_max_b_frames(max_b as usize);
        }

        // Build encoder options based on hardware type
        let mut opts = Dictionary::new();

        match hw_type {
            HwEncoderType::VideoToolbox => {
                // VideoToolbox specific options
                opts.set("allow_sw", "0"); // Disable software fallback within VT
                opts.set("realtime", "0"); // Prioritize quality over realtime
                // Use "main" profile for better compatibility (avoid "baseline")
                if config.profile.is_none() {
                    opts.set("profile", "main");
                }
            }
            HwEncoderType::Nvenc => {
                // NVENC specific options
                opts.set("preset", "p4"); // Balanced preset (p1=fastest, p7=slowest)
                opts.set("tune", "hq"); // High quality tuning
                opts.set("rc", "vbr"); // Variable bitrate
            }
            HwEncoderType::Vaapi => {
                // VAAPI specific options
                opts.set("low_power", "0"); // Use full quality mode
            }
            HwEncoderType::Qsv => {
                // QSV specific options
                opts.set("preset", "medium");
            }
            _ => {}
        }

        if let Some(ref profile) = config.profile {
            opts.set("profile", profile);
        }

        // Try to open encoder
        match encoder.open_with(opts) {
            Ok(encoder) => {
                self.encoder = Some(encoder);
                self.config = Some(config.clone());
                self.hw_type = hw_type;
                self.hw_active = true;
                self.frame_count = 0;

                tracing::info!(
                    "Hardware encoder opened: {} ({}x{} @ {:.2} fps, NV12 input)",
                    encoder_name,
                    config.width,
                    config.height,
                    config.fps
                );

                Ok(true)
            }
            Err(e) => {
                tracing::debug!("Failed to open hardware encoder {}: {}", encoder_name, e);
                Ok(false)
            }
        }
    }

}

impl Default for HwAccelEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl Encoder for HwAccelEncoder {
    fn open(&mut self, config: &EncoderConfig) -> Result<()> {
        // Determine which hardware encoder to try
        let hw_types_to_try: Vec<HwEncoderType> = match config.hw_encoder {
            HwEncoderType::Auto => {
                // Try all available hardware encoders
                detect_hw_encoders()
                    .into_iter()
                    .filter(|t| *t != HwEncoderType::None)
                    .collect()
            }
            HwEncoderType::None => {
                // None now means Auto (always require hardware)
                detect_hw_encoders()
                    .into_iter()
                    .filter(|t| *t != HwEncoderType::None)
                    .collect()
            }
            specific => {
                // Try only the specified hardware encoder
                vec![specific]
            }
        };

        if hw_types_to_try.is_empty() {
            return Err(Error::Other(
                "No hardware encoder available on this platform".into(),
            ));
        }

        // Try hardware encoders
        let mut last_error = None;
        for hw_type in &hw_types_to_try {
            match self.try_open_hw_encoder(config, *hw_type) {
                Ok(true) => return Ok(()),
                Ok(false) => continue,
                Err(e) => {
                    tracing::warn!("Hardware encoder {:?} failed: {}", hw_type, e);
                    last_error = Some(e);
                    continue;
                }
            }
        }

        // All hardware encoders failed
        Err(last_error.unwrap_or_else(|| {
            Error::Other(format!(
                "No hardware encoder supports codec {:?} (tried: {:?})",
                config.codec, hw_types_to_try
            ))
        }))
    }

    fn encode_frame(&mut self, data: &[u8], pts: i64) -> Result<Vec<EncodedPacket>> {
        let config = self.config.as_ref().ok_or(Error::EncoderNotInitialized)?.clone();

        // Validate input data size (NV12: width * height * 1.5)
        let expected_size = (config.width * config.height * 3 / 2) as usize;
        if data.len() < expected_size {
            return Err(Error::InvalidParameter(format!(
                "NV12 data too small: expected {} bytes, got {}",
                expected_size,
                data.len()
            )));
        }

        // Create NV12 frame and copy data directly (no format conversion)
        let mut frame = VideoFrame::new(Pixel::NV12, config.width, config.height);
        Self::copy_nv12_to_frame(data, &mut frame, config.width, config.height);

        // Set PTS and color range (VideoToolbox requires explicit color range)
        frame.set_pts(Some(pts));
        frame.set_color_range(ColorRange::MPEG); // Limited range (16-235) - standard for video

        // Send frame to encoder
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        if let Err(e) = encoder.send_frame(&frame) {
            // Return error so pipeline knows the frame was dropped
            return Err(Error::EncodeFailed(format!(
                "Frame {} send failed: {}",
                pts, e
            )));
        }

        self.frame_count += 1;

        // Receive encoded packets
        self.receive_packets()
    }

    fn flush(&mut self) -> Result<Vec<EncodedPacket>> {
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        // Send EOF to encoder
        encoder.send_eof()?;

        // Receive remaining packets
        self.receive_packets()
    }

    fn close(&mut self) {
        self.encoder = None;
        self.config = None;
        self.frame_count = 0;
        self.hw_active = false;
    }

    fn config(&self) -> Option<&EncoderConfig> {
        self.config.as_ref()
    }

    /// Encode a frame from GPU texture handle (zero-copy path)
    ///
    /// On macOS, this accepts an IOSurface handle and directly maps its memory
    /// to an AVFrame for VideoToolbox encoding without copying data.
    #[cfg(target_os = "macos")]
    fn encode_frame_gpu(&mut self, gpu_handle: usize, pts: i64) -> Result<Vec<EncodedPacket>> {
        use objc::runtime::Object;

        type IOSurfaceRef = *mut Object;

        #[link(name = "IOSurface", kind = "framework")]
        extern "C" {
            fn IOSurfaceLock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
            fn IOSurfaceUnlock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
            fn IOSurfaceGetBaseAddressOfPlane(surface: IOSurfaceRef, plane: usize) -> *mut u8;
            fn IOSurfaceGetBytesPerRowOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
        }

        const K_IO_SURFACE_LOCK_READ_ONLY: u32 = 1;

        let config = self.config.as_ref().ok_or(Error::EncoderNotInitialized)?.clone();
        let io_surface = gpu_handle as IOSurfaceRef;

        // Lock IOSurface for CPU read (VideoToolbox will read via CPU mapping)
        let lock_result = unsafe {
            IOSurfaceLock(io_surface, K_IO_SURFACE_LOCK_READ_ONLY, std::ptr::null_mut())
        };
        if lock_result != 0 {
            return Err(Error::Other(format!("Failed to lock IOSurface: {}", lock_result)));
        }

        // Get IOSurface plane addresses and strides
        let (y_ptr, y_stride, uv_ptr, uv_stride) = unsafe {
            let y_ptr = IOSurfaceGetBaseAddressOfPlane(io_surface, 0);
            let y_stride = IOSurfaceGetBytesPerRowOfPlane(io_surface, 0);
            let uv_ptr = IOSurfaceGetBaseAddressOfPlane(io_surface, 1);
            let uv_stride = IOSurfaceGetBytesPerRowOfPlane(io_surface, 1);
            (y_ptr, y_stride, uv_ptr, uv_stride)
        };

        // Create empty frame and point data directly to IOSurface memory (zero-copy)
        let mut frame = VideoFrame::empty();
        frame.set_pts(Some(pts));
        frame.set_color_range(ColorRange::MPEG);

        unsafe {
            let frame_ptr = frame.as_mut_ptr();
            let nv12_format: ffmpeg::ffi::AVPixelFormat = Pixel::NV12.into();
            (*frame_ptr).format = nv12_format as i32;
            (*frame_ptr).width = config.width as i32;
            (*frame_ptr).height = config.height as i32;
            // Point to IOSurface memory directly (no copy!)
            (*frame_ptr).data[0] = y_ptr;
            (*frame_ptr).data[1] = uv_ptr;
            (*frame_ptr).linesize[0] = y_stride as i32;
            (*frame_ptr).linesize[1] = uv_stride as i32;
        }

        // Send frame to encoder
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        let send_result = encoder.send_frame(&frame);

        // Unlock IOSurface after encoder has read the data
        unsafe {
            IOSurfaceUnlock(io_surface, K_IO_SURFACE_LOCK_READ_ONLY, std::ptr::null_mut());
        }

        // Handle send errors
        if let Err(e) = send_result {
            return Err(Error::EncodeFailed(format!(
                "Frame {} send failed: {}",
                pts, e
            )));
        }

        self.frame_count += 1;

        // Receive encoded packets
        self.receive_packets()
    }

    #[cfg(not(target_os = "macos"))]
    fn encode_frame_gpu(&mut self, _gpu_handle: usize, _pts: i64) -> Result<Vec<EncodedPacket>> {
        Err(Error::Other(
            "GPU frame encoding not yet implemented for this platform".to_string(),
        ))
    }

    fn supports_gpu_input(&self) -> bool {
        // macOS VideoToolbox supports true zero-copy via IOSurface → CVPixelBuffer
        cfg!(target_os = "macos") && self.hw_type == HwEncoderType::VideoToolbox
    }
}

#[cfg(target_os = "macos")]
impl HwAccelEncoder {
    /// Create CVPixelBuffer from IOSurface for zero-copy encoding
    ///
    /// Returns the CVPixelBufferRef as usize. Caller must release with release_cv_pixel_buffer.
    unsafe fn create_cv_pixel_buffer_from_iosurface(
        &self,
        io_surface: usize,
        _width: u32,
        _height: u32,
    ) -> Result<usize> {
        use objc::runtime::Object;
        use std::ptr;

        type IOSurfaceRef = *mut Object;
        type CVPixelBufferRef = *mut Object;

        #[link(name = "CoreVideo", kind = "framework")]
        extern "C" {
            fn CVPixelBufferCreateWithIOSurface(
                allocator: *const Object,       // kCFAllocatorDefault = NULL
                surface: IOSurfaceRef,
                pixel_buffer_attributes: *const Object, // NULL for default
                pixel_buffer_out: *mut CVPixelBufferRef,
            ) -> i32; // CVReturn, 0 = success
        }

        let io_surface_ref = io_surface as IOSurfaceRef;
        let mut cv_pixel_buffer: CVPixelBufferRef = ptr::null_mut();

        let result = CVPixelBufferCreateWithIOSurface(
            ptr::null(),
            io_surface_ref,
            ptr::null(),
            &mut cv_pixel_buffer,
        );

        if result != 0 || cv_pixel_buffer.is_null() {
            return Err(Error::Other(format!(
                "CVPixelBufferCreateWithIOSurface failed: {}",
                result
            )));
        }

        Ok(cv_pixel_buffer as usize)
    }

    /// Release CVPixelBuffer
    unsafe fn release_cv_pixel_buffer(&self, cv_pixel_buffer: usize) {
        use objc::runtime::Object;

        type CVPixelBufferRef = *mut Object;

        #[link(name = "CoreFoundation", kind = "framework")]
        extern "C" {
            fn CFRelease(cf: *const Object);
        }

        if cv_pixel_buffer != 0 {
            CFRelease(cv_pixel_buffer as CVPixelBufferRef as *const Object);
        }
    }

    /// Read IOSurface NV12 data to CPU buffer (fallback path)
    ///
    /// This is kept as a fallback for debugging or when zero-copy fails.
    #[allow(dead_code)]
    unsafe fn read_iosurface_to_nv12(
        &self,
        io_surface: usize,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        use objc::runtime::Object;

        type IOSurfaceRef = *mut Object;

        #[link(name = "IOSurface", kind = "framework")]
        extern "C" {
            fn IOSurfaceLock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
            fn IOSurfaceUnlock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
            fn IOSurfaceGetBaseAddressOfPlane(surface: IOSurfaceRef, plane: usize) -> *const u8;
            fn IOSurfaceGetBytesPerRowOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
            fn IOSurfaceGetHeightOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
        }

        const K_IO_SURFACE_LOCK_READ_ONLY: u32 = 1;

        let io_surface_ref = io_surface as IOSurfaceRef;

        // Lock IOSurface for reading
        let lock_result = IOSurfaceLock(io_surface_ref, K_IO_SURFACE_LOCK_READ_ONLY, std::ptr::null_mut());
        if lock_result != 0 {
            return Err(Error::Other(format!("Failed to lock IOSurface: {}", lock_result)));
        }

        // Get plane info
        let y_base = IOSurfaceGetBaseAddressOfPlane(io_surface_ref, 0);
        let y_stride = IOSurfaceGetBytesPerRowOfPlane(io_surface_ref, 0);
        let y_height = IOSurfaceGetHeightOfPlane(io_surface_ref, 0);

        let uv_base = IOSurfaceGetBaseAddressOfPlane(io_surface_ref, 1);
        let uv_stride = IOSurfaceGetBytesPerRowOfPlane(io_surface_ref, 1);
        let uv_height = IOSurfaceGetHeightOfPlane(io_surface_ref, 1);

        // Calculate output size
        let w = width as usize;
        let h = height as usize;
        let y_size = w * h;
        let uv_size = w * (h / 2);
        let total_size = y_size + uv_size;

        let mut nv12_data = Vec::with_capacity(total_size);

        // Copy Y plane (handle stride mismatch)
        if y_stride == w {
            // Fast path: stride matches width
            let y_slice = std::slice::from_raw_parts(y_base, y_size);
            nv12_data.extend_from_slice(y_slice);
        } else {
            // Slow path: copy row by row
            for row in 0..y_height.min(h) {
                let row_ptr = y_base.add(row * y_stride);
                let row_slice = std::slice::from_raw_parts(row_ptr, w);
                nv12_data.extend_from_slice(row_slice);
            }
        }

        // Copy UV plane (handle stride mismatch)
        if uv_stride == w {
            // Fast path: stride matches width
            let uv_slice = std::slice::from_raw_parts(uv_base, uv_size);
            nv12_data.extend_from_slice(uv_slice);
        } else {
            // Slow path: copy row by row
            for row in 0..uv_height.min(h / 2) {
                let row_ptr = uv_base.add(row * uv_stride);
                let row_slice = std::slice::from_raw_parts(row_ptr, w);
                nv12_data.extend_from_slice(row_slice);
            }
        }

        // Unlock IOSurface
        IOSurfaceUnlock(io_surface_ref, K_IO_SURFACE_LOCK_READ_ONLY, std::ptr::null_mut());

        Ok(nv12_data)
    }
}

impl Drop for HwAccelEncoder {
    fn drop(&mut self) {
        self.close();
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_hw_encoders() {
        let available = detect_hw_encoders();
        // Should have platform-specific hardware encoders only
        // On macOS: VideoToolbox, on Linux: Nvenc/Vaapi, on Windows: Nvenc/Qsv
        assert!(!available.contains(&HwEncoderType::None));
    }

    #[test]
    fn test_hw_encoder_type_names() {
        // VideoToolbox
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::H264),
            Some("h264_videotoolbox")
        );
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::H265),
            Some("hevc_videotoolbox")
        );

        // NVENC
        assert_eq!(HwEncoderType::Nvenc.encoder_name(VideoCodec::H264), Some("h264_nvenc"));
        assert_eq!(HwEncoderType::Nvenc.encoder_name(VideoCodec::H265), Some("hevc_nvenc"));

        // VAAPI
        assert_eq!(HwEncoderType::Vaapi.encoder_name(VideoCodec::H264), Some("h264_vaapi"));
        assert_eq!(HwEncoderType::Vaapi.encoder_name(VideoCodec::H265), Some("hevc_vaapi"));

        // QSV
        assert_eq!(HwEncoderType::Qsv.encoder_name(VideoCodec::H264), Some("h264_qsv"));
        assert_eq!(HwEncoderType::Qsv.encoder_name(VideoCodec::H265), Some("hevc_qsv"));

        // None returns None
        assert_eq!(HwEncoderType::None.encoder_name(VideoCodec::H264), None);

        // VP9 and ProRes have no hardware encoders
        assert_eq!(HwEncoderType::VideoToolbox.encoder_name(VideoCodec::Vp9), None);
        assert_eq!(HwEncoderType::Nvenc.encoder_name(VideoCodec::ProRes), None);
    }

    #[test]
    fn test_encoder_config_with_hw() {
        let config = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264)
            .with_hw_encoder(HwEncoderType::Auto);

        assert_eq!(config.hw_encoder, HwEncoderType::Auto);
    }

    #[test]
    fn test_encoder_config_default_no_hw() {
        let config = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264);

        assert_eq!(config.hw_encoder, HwEncoderType::None);
    }
}
