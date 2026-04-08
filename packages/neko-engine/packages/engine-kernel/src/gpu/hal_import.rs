//! wgpu HAL Integration - Zero-copy texture import via wgpu_hal
//!
//! This module provides the low-level integration with wgpu's HAL layer
//! to enable true zero-copy texture import from platform-specific sources:
//! - macOS: Metal textures from IOSurface
//! - Linux: Vulkan images from DMA-BUF
//! - Windows: D3D12 textures from shared handles
//!
//! Note: This requires the `wgpu_core` feature and access to internal wgpu APIs.

#![allow(dead_code)]

use crate::error::{Error, Result};
use crate::gpu::GpuContext;
use std::sync::Arc;

/// Check if wgpu_hal integration is available
pub fn is_hal_available() -> bool {
    // wgpu_core feature is required for HAL access
    cfg!(wgpu_core)
}

/// HAL texture wrapper for cross-platform zero-copy import
pub struct HalTextureImport {
    ctx: Arc<GpuContext>,
}

impl HalTextureImport {
    /// Create a new HAL texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Self {
        Self { ctx }
    }

    /// Check if the current backend supports external texture import
    pub fn supports_external_textures(&self) -> bool {
        let backend = &self.ctx.info().backend;
        match backend.as_str() {
            "metal" => true,  // Metal supports IOSurface
            "vulkan" => true, // Vulkan supports external memory
            "dx12" => true,   // D3D12 supports shared handles
            _ => false,
        }
    }
}

/// macOS Metal texture import from IOSurface
#[cfg(target_os = "macos")]
pub mod metal_import {
    use super::*;
    use ::metal as mtl;
    use mtl::foreign_types::ForeignType;

    /// Import a Metal texture into wgpu
    ///
    /// # Safety
    /// - `metal_texture` must be a valid MTLTexture
    /// - The texture must remain valid for the lifetime of the returned wgpu::Texture
    pub unsafe fn import_metal_texture(
        _ctx: &GpuContext,
        metal_texture: &mtl::Texture,
        _desc: &wgpu::TextureDescriptor,
    ) -> Result<wgpu::Texture> {
        // Get the raw Metal texture pointer
        let _raw_texture = metal_texture.as_ptr();

        // To properly import, we need to:
        // 1. Access wgpu's internal Metal device via as_hal
        // 2. Create a wgpu_hal::metal::Texture from the MTLTexture
        // 3. Use Device::create_texture_from_hal to wrap it

        // This requires wgpu to expose the hal_api feature
        // For now, return an error indicating the limitation
        Err(Error::Other(
            "Metal texture import requires wgpu hal_api feature".to_string(),
        ))
    }

    /// Create Metal textures from IOSurface for NV12 import
    ///
    /// # Safety
    /// - `io_surface` must be a valid IOSurfaceRef
    pub unsafe fn create_nv12_textures_from_iosurface(
        metal_device: &mtl::Device,
        io_surface: *mut objc::runtime::Object,
        width: u32,
        height: u32,
    ) -> Result<(mtl::Texture, mtl::Texture)> {
        use mtl::{MTLPixelFormat, MTLTextureUsage, TextureDescriptor};
        use objc::{msg_send, sel, sel_impl};

        if io_surface.is_null() {
            return Err(Error::Other("IOSurface is null".to_string()));
        }

        // Create Y plane texture descriptor (R8Unorm, full resolution)
        let y_desc = TextureDescriptor::new();
        y_desc.set_pixel_format(MTLPixelFormat::R8Unorm);
        y_desc.set_width(width as u64);
        y_desc.set_height(height as u64);
        y_desc.set_usage(MTLTextureUsage::ShaderRead);

        // Create UV plane texture descriptor (RG8Unorm, half resolution)
        let uv_desc = TextureDescriptor::new();
        uv_desc.set_pixel_format(MTLPixelFormat::RG8Unorm);
        uv_desc.set_width((width / 2) as u64);
        uv_desc.set_height((height / 2) as u64);
        uv_desc.set_usage(MTLTextureUsage::ShaderRead);

        // Create Metal textures from IOSurface planes
        let metal_device_ptr = metal_device.as_ptr();

        let y_texture: *mut objc::runtime::Object = msg_send![
            metal_device_ptr,
            newTextureWithDescriptor: y_desc.as_ptr()
            iosurface: io_surface
            plane: 0usize
        ];

        if y_texture.is_null() {
            return Err(Error::Other(
                "Failed to create Metal Y texture from IOSurface".to_string(),
            ));
        }

        let uv_texture: *mut objc::runtime::Object = msg_send![
            metal_device_ptr,
            newTextureWithDescriptor: uv_desc.as_ptr()
            iosurface: io_surface
            plane: 1usize
        ];

        if uv_texture.is_null() {
            let _: () = msg_send![y_texture, release];
            return Err(Error::Other(
                "Failed to create Metal UV texture from IOSurface".to_string(),
            ));
        }

        // Wrap raw pointers as metal::Texture
        // Note: This transfers ownership, so we don't need to release manually
        let y_metal = mtl::Texture::from_ptr(y_texture as *mut mtl::MTLTexture);
        let uv_metal = mtl::Texture::from_ptr(uv_texture as *mut mtl::MTLTexture);

        Ok((y_metal, uv_metal))
    }
}

/// Linux Vulkan texture import from DMA-BUF
#[cfg(target_os = "linux")]
pub mod vulkan_import {
    use super::*;
    use std::os::unix::io::RawFd;

    /// DMA-BUF import parameters
    pub struct DmaBufImportParams {
        pub fd: RawFd,
        pub offset: u64,
        pub stride: u32,
        pub modifier: u64,
        pub width: u32,
        pub height: u32,
    }

    /// Import a Vulkan image from DMA-BUF into wgpu
    ///
    /// # Safety
    /// - `fd` must be a valid DMA-BUF file descriptor
    /// - The DMA-BUF must remain valid for the lifetime of the returned texture
    ///
    /// Note: The primary implementation is in `linux_import::LinuxTextureImporter`.
    /// This function delegates to it for the full pipeline.
    pub unsafe fn import_dmabuf_texture(
        _ctx: &GpuContext,
        _params: &DmaBufImportParams,
        _desc: &wgpu::TextureDescriptor,
    ) -> Result<wgpu::Texture> {
        // Use LinuxTextureImporter for the full DMA-BUF → Vulkan → wgpu pipeline.
        // This standalone function is kept for backward compatibility.
        Err(Error::Other(
            "Use LinuxTextureImporter::import_vaapi() for the full zero-copy pipeline".to_string(),
        ))
    }

    /// Check if the Vulkan device supports DMA-BUF import
    pub fn supports_dmabuf_import(ctx: &GpuContext) -> bool {
        // Check if wgpu is using Vulkan backend
        ctx.info().backend.contains("Vulkan")
    }
}

/// Windows D3D12 texture import from shared handles
#[cfg(target_os = "windows")]
pub mod d3d12_import {
    use super::*;
    use windows::Win32::Foundation::HANDLE;

    /// Import a D3D12 texture from a shared handle into wgpu
    ///
    /// # Safety
    /// - `shared_handle` must be a valid DXGI shared handle
    /// - The shared resource must remain valid for the lifetime of the returned texture
    ///
    /// Note: The primary implementation is in `windows_import::WindowsTextureImporter`.
    /// This function is kept for backward compatibility.
    pub unsafe fn import_shared_texture(
        _ctx: &GpuContext,
        _shared_handle: HANDLE,
        _desc: &wgpu::TextureDescriptor,
    ) -> Result<wgpu::Texture> {
        Err(Error::Other(
            "Use WindowsTextureImporter::import_d3d11() for the full zero-copy pipeline"
                .to_string(),
        ))
    }

    /// Check if the D3D12 device supports shared handle import
    pub fn supports_shared_handles(ctx: &GpuContext) -> bool {
        // D3D12 always supports shared handles
        ctx.info().backend.contains("Dx12")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hal_availability() {
        // Just verify the module compiles
        let _ = is_hal_available();
    }
}
