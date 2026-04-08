//! Common types and utilities for hardware-accelerated decoding
//!
//! This module provides shared components used by decoders:
//! - `HwAccelType`: Hardware acceleration type enumeration
//! - `HwDeviceContext`: FFmpeg hardware device context wrapper
//! - `init_ffmpeg()`: Thread-safe FFmpeg initialization

use crate::error::{Error, Result};
use ffmpeg_next as ffmpeg;
use ffmpeg_next::format::Pixel;
#[cfg(target_os = "linux")]
use std::path::Path;
use std::ptr;
use std::sync::Once;

static FFMPEG_INIT: Once = Once::new();

/// Initialize FFmpeg (thread-safe, called once)
pub fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });
}

/// Hardware acceleration type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HwAccelType {
    /// macOS VideoToolbox
    VideoToolbox,
    /// Linux VAAPI (Intel/AMD)
    Vaapi,
    /// NVIDIA CUDA
    #[allow(dead_code)]
    Cuda,
    /// Windows D3D11VA
    #[allow(dead_code)]
    D3d11va,
    /// Auto-detect best available
    Auto,
}

impl HwAccelType {
    /// Get FFmpeg hwaccel name
    pub fn ffmpeg_name(&self) -> Option<&'static str> {
        match self {
            HwAccelType::VideoToolbox => Some("videotoolbox"),
            HwAccelType::Vaapi => Some("vaapi"),
            HwAccelType::Cuda => Some("cuda"),
            HwAccelType::D3d11va => Some("d3d11va"),
            HwAccelType::Auto => None,
        }
    }

    /// Get the pixel format for hardware frames
    pub fn hw_pixel_format(&self) -> Option<Pixel> {
        match self {
            HwAccelType::VideoToolbox => Some(Pixel::VIDEOTOOLBOX),
            HwAccelType::Vaapi => Some(Pixel::VAAPI),
            HwAccelType::Cuda => Some(Pixel::CUDA),
            HwAccelType::D3d11va => Some(Pixel::D3D11),
            HwAccelType::Auto => None,
        }
    }

    /// Get FFmpeg AVHWDeviceType
    pub fn av_hw_device_type(&self) -> ffmpeg::ffi::AVHWDeviceType {
        match self {
            HwAccelType::VideoToolbox => ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_VIDEOTOOLBOX,
            HwAccelType::Vaapi => ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_VAAPI,
            HwAccelType::Cuda => ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_CUDA,
            HwAccelType::D3d11va => ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_D3D11VA,
            HwAccelType::Auto => {
                // Platform-specific default
                #[cfg(target_os = "macos")]
                return ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_VIDEOTOOLBOX;
                #[cfg(target_os = "linux")]
                return ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_VAAPI;
                #[cfg(target_os = "windows")]
                return ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_D3D11VA;
                #[cfg(not(any(
                    target_os = "macos",
                    target_os = "linux",
                    target_os = "windows"
                )))]
                return ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_NONE;
            }
        }
    }
}

/// Detect available hardware acceleration on the current platform
pub fn detect_hw_accel() -> Vec<HwAccelType> {
    let mut available = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // VideoToolbox is always available on macOS
        available.push(HwAccelType::VideoToolbox);
    }

    #[cfg(target_os = "linux")]
    {
        // Check for NVIDIA GPU
        if Path::new("/dev/nvidia0").exists() {
            available.push(HwAccelType::Cuda);
        }

        // Check for VAAPI (Intel/AMD)
        if Path::new("/dev/dri/renderD128").exists() {
            available.push(HwAccelType::Vaapi);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // D3D11VA is generally available on Windows
        available.push(HwAccelType::D3d11va);

        // Check for NVIDIA
        if std::env::var("CUDA_PATH").is_ok() {
            available.push(HwAccelType::Cuda);
        }
    }

    available
}

/// Get the best available hardware acceleration
pub fn get_best_hw_accel() -> HwAccelType {
    let available = detect_hw_accel();
    available.into_iter().next().unwrap_or(HwAccelType::Auto)
}

/// Hardware device context wrapper for safe resource management
pub struct HwDeviceContext {
    ctx: *mut ffmpeg::ffi::AVBufferRef,
    #[allow(dead_code)]
    hw_type: HwAccelType,
}

impl HwDeviceContext {
    /// Create a new hardware device context
    pub fn new(hw_type: HwAccelType) -> Result<Self> {
        Self::with_device(hw_type, None)
    }

    /// Create a new hardware device context with specific device
    pub fn with_device(hw_type: HwAccelType, device: Option<&str>) -> Result<Self> {
        let hw_type_av = hw_type.av_hw_device_type();

        if hw_type_av == ffmpeg::ffi::AVHWDeviceType::AV_HWDEVICE_TYPE_NONE {
            return Err(Error::Ffmpeg(
                "No hardware acceleration available".to_string(),
            ));
        }

        let mut hw_device_ctx: *mut ffmpeg::ffi::AVBufferRef = ptr::null_mut();

        let device_cstr = device.map(|d| std::ffi::CString::new(d).unwrap());
        let device_ptr = device_cstr
            .as_ref()
            .map(|c| c.as_ptr())
            .unwrap_or(ptr::null());

        unsafe {
            let ret = ffmpeg::ffi::av_hwdevice_ctx_create(
                &mut hw_device_ctx,
                hw_type_av,
                device_ptr,
                ptr::null_mut(),
                0,
            );

            if ret < 0 || hw_device_ctx.is_null() {
                return Err(Error::Ffmpeg(format!(
                    "Failed to create hardware device context for {:?}: error code {} \
                     (this may happen in sandboxed environments — software decoding will be used)",
                    hw_type, ret
                )));
            }
        }

        Ok(Self {
            ctx: hw_device_ctx,
            hw_type,
        })
    }

    /// Get the raw context pointer
    pub fn as_ptr(&self) -> *mut ffmpeg::ffi::AVBufferRef {
        self.ctx
    }

    /// Get the hardware acceleration type
    #[allow(dead_code)]
    pub fn hw_type(&self) -> HwAccelType {
        self.hw_type
    }
}

impl Drop for HwDeviceContext {
    fn drop(&mut self) {
        unsafe {
            if !self.ctx.is_null() {
                ffmpeg::ffi::av_buffer_unref(&mut self.ctx);
            }
        }
    }
}

// Safety: HwDeviceContext is only accessed from a single thread
unsafe impl Send for HwDeviceContext {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_hw_accel() {
        let available = detect_hw_accel();
        // Should have at least one option on supported platforms
        #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
        assert!(!available.is_empty());
    }

    #[test]
    fn test_hw_accel_type_names() {
        assert_eq!(
            HwAccelType::VideoToolbox.ffmpeg_name(),
            Some("videotoolbox")
        );
        assert_eq!(HwAccelType::Vaapi.ffmpeg_name(), Some("vaapi"));
        assert_eq!(HwAccelType::Cuda.ffmpeg_name(), Some("cuda"));
        assert_eq!(HwAccelType::D3d11va.ffmpeg_name(), Some("d3d11va"));
        assert_eq!(HwAccelType::Auto.ffmpeg_name(), None);
    }
}
