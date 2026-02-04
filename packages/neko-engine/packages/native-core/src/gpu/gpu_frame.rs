//! GPU Frame Input - Bridge between wgpu and FFmpeg encoder
//!
//! This module provides the interface for passing GPU-processed frames
//! to FFmpeg hardware encoders with minimal CPU involvement.
//!
//! Only zero-copy paths are supported:
//! - macOS: wgpu (Metal) → IOSurface → VideoToolbox
//! - Linux: wgpu (Vulkan) → DMA-BUF → VAAPI/NVENC
//! - Windows: wgpu (D3D12) → SharedHandle → D3D11VA/NVENC

#![allow(dead_code)]

use crate::error::{Error, Result};
use crate::gpu::{GpuContext, Nv12OutputBuffers, RgbaToNv12Converter};
use std::sync::Arc;

/// GPU frame ready for encoding
#[derive(Debug)]
pub struct GpuFrame {
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Presentation timestamp (in time_base units)
    pub pts: i64,
    /// Frame data source (always GPU buffer)
    pub source: GpuBufferSource,
}

/// Platform-specific GPU buffer source
#[derive(Debug)]
pub enum GpuBufferSource {
    /// macOS IOSurface
    #[cfg(target_os = "macos")]
    IOSurface {
        /// IOSurface handle
        surface: usize,
    },
    /// Linux DMA-BUF
    #[cfg(target_os = "linux")]
    DmaBuf {
        /// Y plane file descriptor
        y_fd: i32,
        /// UV plane file descriptor
        uv_fd: i32,
        /// Y plane stride
        y_stride: u32,
        /// UV plane stride
        uv_stride: u32,
    },
    /// Windows shared handle
    #[cfg(target_os = "windows")]
    SharedHandle {
        /// DXGI shared handle
        handle: usize,
    },
    /// CUDA device pointer (NVIDIA)
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    Cuda {
        /// Y plane device pointer
        y_ptr: usize,
        /// UV plane device pointer
        uv_ptr: usize,
        /// Pitch in bytes
        pitch: usize,
    },
}

/// GPU frame producer - converts wgpu output to encoder-ready frames
pub struct GpuFrameProducer {
    ctx: Arc<GpuContext>,
    converter: RgbaToNv12Converter,
    output_buffers: Option<Nv12OutputBuffers>,
    width: u32,
    height: u32,
}

impl GpuFrameProducer {
    /// Create a new GPU frame producer
    pub fn new(ctx: Arc<GpuContext>, width: u32, height: u32) -> Result<Self> {
        let converter = RgbaToNv12Converter::new(ctx.clone())?;
        let output_buffers = Some(converter.create_output_buffers(width, height));

        tracing::info!("GPU frame producer: zero-copy mode only");

        Ok(Self {
            ctx,
            converter,
            output_buffers,
            width,
            height,
        })
    }

    /// Produce a frame from RGBA texture
    ///
    /// Converts RGBA to NV12 and exports GPU buffer handles for encoding.
    /// Returns error if zero-copy export fails.
    pub fn produce_frame(
        &self,
        rgba_texture: &wgpu::TextureView,
        pts: i64,
        color_space: u32,
    ) -> Result<GpuFrame> {
        let output = self
            .output_buffers
            .as_ref()
            .ok_or_else(|| Error::Other("Output buffers not initialized".to_string()))?;

        // Convert RGBA to NV12 on GPU
        self.converter.convert_sync(rgba_texture, output, color_space)?;

        // Zero-copy path only: export GPU buffer handles
        self.produce_zero_copy_frame(pts)
    }

    /// Produce a zero-copy frame (platform-specific)
    #[allow(unused_variables)]
    fn produce_zero_copy_frame(&self, pts: i64) -> Result<GpuFrame> {
        #[cfg(target_os = "macos")]
        {
            self.produce_macos_frame(pts)
        }

        #[cfg(target_os = "linux")]
        {
            self.produce_linux_frame(pts)
        }

        #[cfg(target_os = "windows")]
        {
            self.produce_windows_frame(pts)
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err(Error::Other("Zero-copy not supported on this platform".to_string()))
        }
    }

    /// Produce frame for macOS (IOSurface export)
    #[cfg(target_os = "macos")]
    fn produce_macos_frame(&self, _pts: i64) -> Result<GpuFrame> {
        // TODO: Export wgpu buffer as IOSurface
        // This requires:
        // 1. Get MTLBuffer from wgpu via wgpu_hal
        // 2. Create IOSurface from MTLBuffer
        // 3. Return IOSurface handle

        Err(Error::Other(
            "macOS IOSurface export not yet implemented".to_string(),
        ))
    }

    /// Produce frame for Linux (DMA-BUF export)
    #[cfg(target_os = "linux")]
    fn produce_linux_frame(&self, pts: i64) -> Result<GpuFrame> {
        // TODO: Export wgpu buffer as DMA-BUF
        // This requires:
        // 1. Get VkBuffer from wgpu via wgpu_hal
        // 2. Export as DMA-BUF using VK_KHR_external_memory_fd
        // 3. Return DMA-BUF file descriptors

        Err(Error::Other(
            "Linux DMA-BUF export not yet implemented".to_string(),
        ))
    }

    /// Produce frame for Windows (shared handle export)
    #[cfg(target_os = "windows")]
    fn produce_windows_frame(&self, pts: i64) -> Result<GpuFrame> {
        // TODO: Export wgpu buffer as D3D12 shared handle
        // This requires:
        // 1. Get ID3D12Resource from wgpu via wgpu_hal
        // 2. Create shared handle using CreateSharedHandle
        // 3. Return shared handle

        Err(Error::Other(
            "Windows shared handle export not yet implemented".to_string(),
        ))
    }

    /// Resize output buffers for new dimensions
    pub fn resize(&mut self, width: u32, height: u32) {
        if self.width != width || self.height != height {
            self.width = width;
            self.height = height;
            self.output_buffers = Some(self.converter.create_output_buffers(width, height));
            tracing::debug!("GPU frame producer resized to {}x{}", width, height);
        }
    }

    /// Get current dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }
}

/// GPU frame consumer - receives frames from producer and sends to encoder
pub struct GpuFrameConsumer {
    /// Frame queue capacity
    capacity: usize,
    /// Frames waiting to be encoded
    pending_frames: Vec<GpuFrame>,
}

impl GpuFrameConsumer {
    /// Create a new frame consumer
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            pending_frames: Vec::with_capacity(capacity),
        }
    }

    /// Push a frame to the queue
    pub fn push(&mut self, frame: GpuFrame) -> Result<()> {
        if self.pending_frames.len() >= self.capacity {
            return Err(Error::Other("Frame queue full".to_string()));
        }
        self.pending_frames.push(frame);
        Ok(())
    }

    /// Pop a frame from the queue
    pub fn pop(&mut self) -> Option<GpuFrame> {
        if self.pending_frames.is_empty() {
            None
        } else {
            Some(self.pending_frames.remove(0))
        }
    }

    /// Get number of pending frames
    pub fn pending_count(&self) -> usize {
        self.pending_frames.len()
    }

    /// Check if queue is empty
    pub fn is_empty(&self) -> bool {
        self.pending_frames.is_empty()
    }

    /// Clear all pending frames
    pub fn clear(&mut self) {
        self.pending_frames.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_consumer() {
        let consumer = GpuFrameConsumer::new(10);
        assert!(consumer.is_empty());
        assert_eq!(consumer.pending_count(), 0);
    }
}
