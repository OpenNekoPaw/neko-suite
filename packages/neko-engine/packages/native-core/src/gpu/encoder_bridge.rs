//! GPU Encoder Integration - wgpu → FFmpeg Hardware Encoder
//!
//! This module provides zero-copy encoding by passing GPU buffers directly
//! to FFmpeg hardware encoders without CPU readback.
//!
//! Supported paths:
//! - macOS: wgpu (Metal) → VideoToolbox encoder
//! - Linux: wgpu (Vulkan) → VAAPI/NVENC encoder
//! - Windows: wgpu (D3D12) → D3D11VA/NVENC encoder

use crate::error::{Error, Result};
use crate::gpu::rgba_to_nv12::{Nv12OutputBuffers, RgbaToNv12Converter};
use crate::gpu::GpuContext;

#[cfg(target_os = "macos")]
use crate::gpu::macos_export::{MacOsTextureExporter, IOSurfaceBackingStore};
#[cfg(target_os = "linux")]
use crate::gpu::linux_export::{LinuxTextureExporter, LinuxExportBackingStore};
#[cfg(target_os = "windows")]
use crate::gpu::windows_export::{WindowsTextureExporter, WindowsExportBackingStore};

use std::sync::Arc;

/// GPU frame ready for encoding (always GPU texture)
pub struct GpuEncoderFrame {
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Presentation timestamp (in time_base units)
    pub pts: i64,
    /// GPU buffer handles (required)
    pub gpu_handles: GpuBufferHandles,
}

/// Platform-specific GPU buffer handles for encoder
#[derive(Debug)]
pub struct GpuBufferHandles {
    /// Y plane handle
    pub y_handle: GpuBufferHandle,
    /// UV plane handle
    pub uv_handle: GpuBufferHandle,
}

/// Platform-specific GPU buffer handle
#[derive(Debug)]
pub enum GpuBufferHandle {
    /// macOS: IOSurface
    #[cfg(target_os = "macos")]
    IOSurface {
        surface: usize,
        plane: u32,
    },
    /// Linux: DMA-BUF file descriptor
    #[cfg(target_os = "linux")]
    DmaBuf {
        fd: i32,
        offset: u32,
        stride: u32,
    },
    /// Windows: D3D11 shared handle
    #[cfg(target_os = "windows")]
    D3d11Shared {
        handle: usize,
        array_index: u32,
    },
    /// CUDA device pointer
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    Cuda {
        device_ptr: usize,
        pitch: usize,
    },
}

/// GPU encoder bridge - connects wgpu output to FFmpeg encoder input (zero-copy only)
pub struct GpuEncoderBridge {
    #[allow(dead_code)]
    ctx: Arc<GpuContext>,
    converter: RgbaToNv12Converter,
    output_buffers: Option<Nv12OutputBuffers>,
    width: u32,
    height: u32,
    /// Platform-specific exporter and backing store
    #[cfg(target_os = "macos")]
    macos_backing: Option<IOSurfaceBackingStore>,
    #[cfg(target_os = "linux")]
    linux_backing: Option<LinuxExportBackingStore>,
    #[cfg(target_os = "windows")]
    windows_backing: Option<WindowsExportBackingStore>,
}

impl GpuEncoderBridge {
    /// Create a new GPU encoder bridge
    pub fn new(ctx: Arc<GpuContext>, width: u32, height: u32) -> Result<Self> {
        let converter = RgbaToNv12Converter::new(ctx.clone())?;
        let output_buffers = Some(converter.create_output_buffers(width, height));

        tracing::info!("GPU encoder bridge: zero-copy mode only");

        Ok(Self {
            ctx,
            converter,
            output_buffers,
            width,
            height,
            #[cfg(target_os = "macos")]
            macos_backing: None,
            #[cfg(target_os = "linux")]
            linux_backing: None,
            #[cfg(target_os = "windows")]
            windows_backing: None,
        })
    }

    /// Process RGBA texture and prepare for encoding
    ///
    /// This converts RGBA to NV12 and exports GPU handles for encoding.
    /// Returns error if zero-copy export fails.
    pub fn process_frame(
        &self,
        rgba_texture: &wgpu::TextureView,
        pts: i64,
        color_space: u32,
    ) -> Result<GpuEncoderFrame> {
        let output = self
            .output_buffers
            .as_ref()
            .ok_or_else(|| Error::Other("Output buffers not initialized".to_string()))?;

        // Convert RGBA to NV12 on GPU
        self.converter.convert(rgba_texture, output, color_space)?;

        // Wait for GPU to complete
        self.converter.wait_for_completion();

        // Zero-copy path only: export GPU handles
        let handles = self.export_gpu_handles(output)?;
        Ok(GpuEncoderFrame {
            width: self.width,
            height: self.height,
            pts,
            gpu_handles: handles,
        })
    }

    /// Export GPU buffer handles for zero-copy encoding
    #[allow(unused_variables)]
    fn export_gpu_handles(&self, output: &Nv12OutputBuffers) -> Result<GpuBufferHandles> {
        // Platform-specific handle export
        #[cfg(target_os = "macos")]
        {
            self.export_macos_handles(output)
        }

        #[cfg(target_os = "linux")]
        {
            self.export_linux_handles(output)
        }

        #[cfg(target_os = "windows")]
        {
            self.export_windows_handles(output)
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err(Error::Other("Platform not supported for zero-copy".to_string()))
        }
    }

    /// Export handles on macOS (IOSurface)
    #[cfg(target_os = "macos")]
    fn export_macos_handles(&self, _output: &Nv12OutputBuffers) -> Result<GpuBufferHandles> {
        // Use MacOsTextureExporter to create IOSurface backing store
        // and export the IOSurface handle for VideoToolbox
        let exporter = MacOsTextureExporter::new(self.ctx.clone())?;
        let backing = exporter.create_backing_store(self.width, self.height)?;
        let surface = backing.io_surface_handle();

        Ok(GpuBufferHandles {
            y_handle: GpuBufferHandle::IOSurface {
                surface,
                plane: 0,
            },
            uv_handle: GpuBufferHandle::IOSurface {
                surface,
                plane: 1,
            },
        })
    }

    /// Export handles on Linux (DMA-BUF)
    #[cfg(target_os = "linux")]
    fn export_linux_handles(&self, _output: &Nv12OutputBuffers) -> Result<GpuBufferHandles> {
        let exporter = LinuxTextureExporter::new(self.ctx.clone())?;
        let backing = exporter.create_backing_store(self.width, self.height)?;
        let exported = backing.export_as_dmabuf()?;

        // Transfer fd ownership to GpuBufferHandle.
        // Prevent ExportedNv12Frame::drop from closing fds by extracting them.
        let y_fd = exported.y_plane.fd;
        let y_stride = exported.y_plane.stride;
        let uv_fd = exported.uv_plane.fd;
        let uv_stride = exported.uv_plane.stride;
        std::mem::forget(exported); // fds now owned by GpuBufferHandle

        Ok(GpuBufferHandles {
            y_handle: GpuBufferHandle::DmaBuf {
                fd: y_fd,
                offset: 0,
                stride: y_stride,
            },
            uv_handle: GpuBufferHandle::DmaBuf {
                fd: uv_fd,
                offset: 0,
                stride: uv_stride,
            },
        })
    }

    /// Export handles on Windows (D3D11 shared)
    #[cfg(target_os = "windows")]
    fn export_windows_handles(&self, _output: &Nv12OutputBuffers) -> Result<GpuBufferHandles> {
        let exporter = WindowsTextureExporter::new(self.ctx.clone())?;
        let backing = exporter.create_backing_store(self.width, self.height)?;
        let exported = backing.export_as_shared_handles()?;

        // Transfer handle ownership to GpuBufferHandle
        let y_handle_raw = exported.y_plane.handle.0 as usize;
        let uv_handle_raw = exported.uv_plane.handle.0 as usize;
        std::mem::forget(exported); // handles now owned by GpuBufferHandle

        Ok(GpuBufferHandles {
            y_handle: GpuBufferHandle::D3d11Shared {
                handle: y_handle_raw,
                array_index: 0,
            },
            uv_handle: GpuBufferHandle::D3d11Shared {
                handle: uv_handle_raw,
                array_index: 0,
            },
        })
    }

    /// Get the NV12 output buffers for direct access
    pub fn output_buffers(&self) -> Option<&Nv12OutputBuffers> {
        self.output_buffers.as_ref()
    }

    /// Resize output buffers for new dimensions
    pub fn resize(&mut self, width: u32, height: u32) {
        if self.width != width || self.height != height {
            self.width = width;
            self.height = height;
            self.output_buffers = Some(self.converter.create_output_buffers(width, height));
            // Clear platform backing stores — they'll be recreated on next export
            #[cfg(target_os = "macos")]
            { self.macos_backing = None; }
            #[cfg(target_os = "linux")]
            { self.linux_backing = None; }
            #[cfg(target_os = "windows")]
            { self.windows_backing = None; }
            tracing::debug!("GPU encoder bridge resized to {}x{}", width, height);
        }
    }
}

/// FFmpeg hardware encoder wrapper with GPU input support
pub struct GpuHwEncoder {
    bridge: GpuEncoderBridge,
    // FFmpeg encoder would be stored here
    // encoder: Option<HwAccelEncoder>,
}

impl GpuHwEncoder {
    /// Create a new GPU hardware encoder
    pub fn new(ctx: Arc<GpuContext>, width: u32, height: u32) -> Result<Self> {
        let bridge = GpuEncoderBridge::new(ctx, width, height)?;

        Ok(Self { bridge })
    }

    /// Encode a frame from RGBA texture
    ///
    /// This is the main entry point for GPU-accelerated encoding.
    pub fn encode_frame(
        &self,
        rgba_texture: &wgpu::TextureView,
        pts: i64,
        color_space: u32,
    ) -> Result<GpuEncoderFrame> {
        // Process frame (RGBA → NV12) and export GPU handles
        self.bridge.process_frame(rgba_texture, pts, color_space)
    }

    /// Get bridge for direct access
    pub fn bridge(&self) -> &GpuEncoderBridge {
        &self.bridge
    }
}
