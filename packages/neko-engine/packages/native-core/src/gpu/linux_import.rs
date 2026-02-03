//! Linux Zero-Copy Import - DMA-BUF → Vulkan → wgpu
//!
//! This module implements zero-copy texture import on Linux:
//! 1. Export VASurface to DMA-BUF file descriptor
//! 2. Import DMA-BUF into Vulkan using VK_EXT_external_memory_dma_buf
//! 3. Import Vulkan texture into wgpu
//!
//! Reference:
//! - VK_EXT_external_memory_dma_buf
//! - VK_KHR_external_memory_fd
//! - VA-API vaExportSurfaceHandle

use crate::decoder::Nv12GpuTexture;
use crate::error::{Error, Result};
use crate::gpu::nv12_import::{ColorSpace, ImportedNv12Texture};
use crate::gpu::GpuContext;

use std::os::unix::io::RawFd;
use std::sync::Arc;

/// DMA-BUF plane information
#[derive(Debug, Clone)]
pub struct DmaBufPlane {
    /// File descriptor for the DMA-BUF
    pub fd: RawFd,
    /// Offset within the DMA-BUF
    pub offset: u32,
    /// Stride (bytes per row)
    pub stride: u32,
    /// DRM format modifier
    pub modifier: u64,
}

/// DMA-BUF frame information
#[derive(Debug, Clone)]
pub struct DmaBufFrame {
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
    /// DRM fourcc format (e.g., DRM_FORMAT_NV12)
    pub fourcc: u32,
    /// Plane information
    pub planes: Vec<DmaBufPlane>,
}

impl DmaBufFrame {
    /// Create a new DMA-BUF frame descriptor
    pub fn new(width: u32, height: u32, fourcc: u32) -> Self {
        Self {
            width,
            height,
            fourcc,
            planes: Vec::new(),
        }
    }

    /// Add a plane to the frame
    pub fn add_plane(&mut self, fd: RawFd, offset: u32, stride: u32, modifier: u64) {
        self.planes.push(DmaBufPlane {
            fd,
            offset,
            stride,
            modifier,
        });
    }

    /// Check if this is a valid NV12 frame
    pub fn is_valid_nv12(&self) -> bool {
        self.fourcc == DRM_FORMAT_NV12 && self.planes.len() == 2
    }
}

// DRM format constants
pub const DRM_FORMAT_NV12: u32 = 0x3231564E; // 'NV12'
pub const DRM_FORMAT_P010: u32 = 0x30313050; // 'P010' (10-bit)
pub const DRM_FORMAT_MOD_LINEAR: u64 = 0;
pub const DRM_FORMAT_MOD_INVALID: u64 = 0x00ffffffffffffff;

/// Linux zero-copy texture importer using DMA-BUF
pub struct LinuxTextureImporter {
    ctx: Arc<GpuContext>,
}

impl LinuxTextureImporter {
    /// Create a new Linux texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Import NV12 texture from VAAPI surface via DMA-BUF
    ///
    /// # Safety
    /// The surface_id and display must be valid VAAPI handles.
    pub unsafe fn import_vaapi(
        &self,
        surface_id: u32,
        display: usize,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        // Export VAAPI surface to DMA-BUF
        let dma_buf = self.export_vaapi_to_dmabuf(surface_id, display, gpu_texture)?;

        // Import DMA-BUF into wgpu
        self.import_dmabuf(&dma_buf, gpu_texture)
    }

    /// Export VAAPI surface to DMA-BUF
    ///
    /// This uses vaExportSurfaceHandle to get DMA-BUF file descriptors.
    unsafe fn export_vaapi_to_dmabuf(
        &self,
        surface_id: u32,
        display: usize,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<DmaBufFrame> {
        // VA-API export flags
        const VA_EXPORT_SURFACE_READ_ONLY: u32 = 0x0001;
        const VA_EXPORT_SURFACE_SEPARATE_LAYERS: u32 = 0x0004;

        // VADRMPRIMESurfaceDescriptor structure (simplified)
        #[repr(C)]
        struct VADRMPRIMESurfaceDescriptor {
            fourcc: u32,
            width: u32,
            height: u32,
            num_objects: u32,
            objects: [VADRMPRIMEObject; 4],
            num_layers: u32,
            layers: [VADRMPRIMELayer; 4],
        }

        #[repr(C)]
        struct VADRMPRIMEObject {
            fd: i32,
            size: u32,
            drm_format_modifier: u64,
        }

        #[repr(C)]
        struct VADRMPRIMELayer {
            drm_format: u32,
            num_planes: u32,
            object_index: [u32; 4],
            offset: [u32; 4],
            pitch: [u32; 4],
        }

        // In a real implementation, we would call:
        // vaExportSurfaceHandle(display, surface_id, VA_SURFACE_ATTRIB_MEM_TYPE_DRM_PRIME_2,
        //                       VA_EXPORT_SURFACE_READ_ONLY | VA_EXPORT_SURFACE_SEPARATE_LAYERS,
        //                       &descriptor)

        // For now, return a placeholder that indicates the interface
        tracing::warn!(
            "VAAPI DMA-BUF export not yet implemented - surface_id={}, display={:#x}",
            surface_id,
            display
        );

        // Return placeholder frame info
        Ok(DmaBufFrame {
            width: gpu_texture.width,
            height: gpu_texture.height,
            fourcc: DRM_FORMAT_NV12,
            planes: vec![
                DmaBufPlane {
                    fd: -1, // Invalid FD - would be real FD from vaExportSurfaceHandle
                    offset: 0,
                    stride: gpu_texture.width,
                    modifier: DRM_FORMAT_MOD_LINEAR,
                },
                DmaBufPlane {
                    fd: -1,
                    offset: 0,
                    stride: gpu_texture.width,
                    modifier: DRM_FORMAT_MOD_LINEAR,
                },
            ],
        })
    }

    /// Import DMA-BUF into wgpu via Vulkan
    fn import_dmabuf(
        &self,
        dma_buf: &DmaBufFrame,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        // Check if we have valid file descriptors
        if dma_buf.planes.iter().any(|p| p.fd < 0) {
            return Err(Error::Other(
                "DMA-BUF import failed: no valid file descriptors".to_string(),
            ));
        }

        // TODO: Implement Vulkan DMA-BUF import
        // The proper implementation would:
        // 1. Get VkDevice from wgpu via wgpu_hal
        // 2. Create VkImage with VK_EXTERNAL_MEMORY_HANDLE_TYPE_DMA_BUF_BIT_EXT
        // 3. Import DMA-BUF FD using vkGetMemoryFdPropertiesKHR
        // 4. Allocate memory with VkImportMemoryFdInfoKHR
        // 5. Bind memory to image
        // 6. Create wgpu::Texture from VkImage via wgpu_hal

        self.import_dmabuf_vulkan(dma_buf, gpu_texture)
    }

    /// Import DMA-BUF using Vulkan external memory
    fn import_dmabuf_vulkan(
        &self,
        dma_buf: &DmaBufFrame,
        _gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        // This would use ash (Vulkan bindings) to:
        // 1. vkCreateImage with VkExternalMemoryImageCreateInfo
        // 2. vkGetImageMemoryRequirements
        // 3. vkAllocateMemory with VkImportMemoryFdInfoKHR
        // 4. vkBindImageMemory

        Err(Error::Other(format!(
            "Vulkan DMA-BUF import not yet implemented for {}x{}",
            dma_buf.width, dma_buf.height
        )))
    }
}

/// CUDA texture importer for NVIDIA GPUs
pub struct CudaTextureImporter {
    ctx: Arc<GpuContext>,
}

impl CudaTextureImporter {
    /// Create a new CUDA texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Import NV12 texture from CUDA device memory
    ///
    /// # Safety
    /// The device_ptr must be a valid CUdeviceptr from CUDA.
    pub unsafe fn import_cuda(
        &self,
        device_ptr: usize,
        pitch: usize,
        _gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        // CUDA-Vulkan interop requires:
        // 1. cuMemExportToShareableHandle to get external handle
        // 2. vkAllocateMemory with VkImportMemoryFdInfoKHR (Linux)
        //    or VkImportMemoryWin32HandleInfoKHR (Windows)
        // 3. vkBindImageMemory

        Err(Error::Other(format!(
            "CUDA import not yet implemented - device_ptr={:#x}, pitch={}",
            device_ptr, pitch
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_drm_format_constants() {
        // NV12 fourcc: 'N' 'V' '1' '2' in little-endian
        assert_eq!(DRM_FORMAT_NV12, 0x3231564E);
    }
}
