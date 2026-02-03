//! macOS Zero-Copy Import - IOSurface → Metal → wgpu
//!
//! This module implements zero-copy texture import on macOS:
//! 1. Get IOSurface from CVPixelBuffer (VideoToolbox output)
//! 2. Create MTLTexture from IOSurface
//! 3. Import MTLTexture into wgpu using wgpu_hal
//!
//! Reference:
//! - https://developer.apple.com/documentation/metal/mtldevice
//! - https://developer.apple.com/documentation/iosurface

#![allow(dead_code)]

use crate::decoder::Nv12GpuTexture;
use crate::error::{Error, Result};
use crate::gpu::nv12_import::{ColorSpace, ImportedNv12Texture};
use crate::gpu::GpuContext;

use std::sync::Arc;

use metal::{Device as MTLDevice, MTLPixelFormat, MTLTextureType, MTLTextureUsage, TextureDescriptor};
use objc::runtime::Object;
use objc::{msg_send, sel, sel_impl};

// Import ForeignType trait for as_ptr()
use metal::foreign_types::ForeignType;

/// IOSurface reference type (opaque pointer)
type IOSurfaceRef = *mut Object;

// External C functions for IOSurface
#[link(name = "IOSurface", kind = "framework")]
extern "C" {
    fn IOSurfaceGetWidth(surface: IOSurfaceRef) -> usize;
    fn IOSurfaceGetHeight(surface: IOSurfaceRef) -> usize;
    fn IOSurfaceGetPlaneCount(surface: IOSurfaceRef) -> usize;
    fn IOSurfaceGetWidthOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
    fn IOSurfaceGetHeightOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
    fn IOSurfaceGetBytesPerRowOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
}

// External C functions for CoreVideo
#[link(name = "CoreVideo", kind = "framework")]
extern "C" {
    fn CVPixelBufferGetIOSurface(pixelBuffer: *mut Object) -> IOSurfaceRef;
}

/// macOS zero-copy texture importer
pub struct MacOsTextureImporter {
    ctx: Arc<GpuContext>,
    metal_device: MTLDevice,
}

impl MacOsTextureImporter {
    /// Create a new macOS texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        // Get Metal device from wgpu
        let metal_device = MTLDevice::system_default()
            .ok_or_else(|| Error::Other("No Metal device available".to_string()))?;

        Ok(Self { ctx, metal_device })
    }

    /// Import NV12 texture from VideoToolbox CVPixelBuffer
    ///
    /// # Safety
    /// The pixel_buffer must be a valid CVPixelBufferRef from VideoToolbox.
    pub unsafe fn import_videotoolbox(
        &self,
        pixel_buffer: usize,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        let cv_pixel_buffer = pixel_buffer as *mut Object;

        // Get IOSurface from CVPixelBuffer
        let io_surface = CVPixelBufferGetIOSurface(cv_pixel_buffer);
        if io_surface.is_null() {
            return Err(Error::Other(
                "Failed to get IOSurface from CVPixelBuffer".to_string(),
            ));
        }

        // Verify plane count (NV12 has 2 planes)
        let plane_count = IOSurfaceGetPlaneCount(io_surface);
        if plane_count != 2 {
            return Err(Error::Other(format!(
                "Expected 2 planes for NV12, got {}",
                plane_count
            )));
        }

        // Get plane dimensions
        let y_width = IOSurfaceGetWidthOfPlane(io_surface, 0);
        let y_height = IOSurfaceGetHeightOfPlane(io_surface, 0);
        let uv_width = IOSurfaceGetWidthOfPlane(io_surface, 1);
        let uv_height = IOSurfaceGetHeightOfPlane(io_surface, 1);

        tracing::debug!(
            "IOSurface planes: Y={}x{}, UV={}x{}",
            y_width,
            y_height,
            uv_width,
            uv_height
        );

        // Try to create Metal textures from IOSurface
        self.create_metal_textures_from_iosurface(
            io_surface,
            y_width,
            y_height,
            uv_width,
            uv_height,
            gpu_texture,
        )
    }

    /// Create Metal textures from IOSurface planes
    unsafe fn create_metal_textures_from_iosurface(
        &self,
        io_surface: IOSurfaceRef,
        y_width: usize,
        y_height: usize,
        uv_width: usize,
        uv_height: usize,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        // Synchronize IOSurface to ensure VideoToolbox has finished writing
        // This is critical for zero-copy to work correctly
        #[link(name = "IOSurface", kind = "framework")]
        extern "C" {
            fn IOSurfaceLock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
            fn IOSurfaceUnlock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
        }

        #[allow(non_upper_case_globals)]
        const kIOSurfaceLockReadOnly: u32 = 1;

        // Lock IOSurface for reading to ensure GPU has finished writing
        let lock_result = IOSurfaceLock(io_surface, kIOSurfaceLockReadOnly, std::ptr::null_mut());
        if lock_result != 0 {
            tracing::warn!("IOSurfaceLock returned {}, continuing anyway", lock_result);
        }

        // Immediately unlock - we just needed to synchronize
        let unlock_result = IOSurfaceUnlock(io_surface, kIOSurfaceLockReadOnly, std::ptr::null_mut());
        if unlock_result != 0 {
            tracing::warn!("IOSurfaceUnlock returned {}", unlock_result);
        }

        // Create Y plane texture descriptor (R8Unorm)
        let y_desc = TextureDescriptor::new();
        y_desc.set_pixel_format(MTLPixelFormat::R8Unorm);
        y_desc.set_width(y_width as u64);
        y_desc.set_height(y_height as u64);
        y_desc.set_usage(MTLTextureUsage::ShaderRead);

        // Create UV plane texture descriptor (RG8Unorm)
        let uv_desc = TextureDescriptor::new();
        uv_desc.set_pixel_format(MTLPixelFormat::RG8Unorm);
        uv_desc.set_width(uv_width as u64);
        uv_desc.set_height(uv_height as u64);
        uv_desc.set_usage(MTLTextureUsage::ShaderRead);

        // Create Metal textures from IOSurface using objc message sending
        // MTLDevice.newTextureWithDescriptor:iosurface:plane:
        let metal_device_ptr = self.metal_device.as_ptr();

        let y_metal_texture: *mut Object = msg_send![
            metal_device_ptr,
            newTextureWithDescriptor: y_desc.as_ptr()
            iosurface: io_surface
            plane: 0usize
        ];

        if y_metal_texture.is_null() {
            return Err(Error::Other(
                "Failed to create Metal Y texture from IOSurface".to_string(),
            ));
        }

        let uv_metal_texture: *mut Object = msg_send![
            metal_device_ptr,
            newTextureWithDescriptor: uv_desc.as_ptr()
            iosurface: io_surface
            plane: 1usize
        ];

        if uv_metal_texture.is_null() {
            // Release Y texture
            let _: () = msg_send![y_metal_texture, release];
            return Err(Error::Other(
                "Failed to create Metal UV texture from IOSurface".to_string(),
            ));
        }

        tracing::debug!(
            "Created Metal textures from IOSurface: Y={:?}, UV={:?}",
            y_metal_texture,
            uv_metal_texture
        );

        // Import Metal textures into wgpu using wgpu_hal
        // This is the zero-copy path - no CPU memory copy needed!

        // Wrap raw pointers as metal::Texture
        let y_metal = metal::Texture::from_ptr(y_metal_texture as *mut metal::MTLTexture);
        let uv_metal = metal::Texture::from_ptr(uv_metal_texture as *mut metal::MTLTexture);

        // Create wgpu_hal textures from Metal textures
        let y_hal_texture = unsafe {
            wgpu_hal::metal::Device::texture_from_raw(
                y_metal.clone(),
                wgpu::TextureFormat::R8Unorm,
                MTLTextureType::D2,
                1, // array_layers
                1, // mip_levels
                wgpu_hal::CopyExtent {
                    width: y_width as u32,
                    height: y_height as u32,
                    depth: 1,
                },
            )
        };

        let uv_hal_texture = unsafe {
            wgpu_hal::metal::Device::texture_from_raw(
                uv_metal.clone(),
                wgpu::TextureFormat::Rg8Unorm,
                MTLTextureType::D2,
                1, // array_layers
                1, // mip_levels
                wgpu_hal::CopyExtent {
                    width: uv_width as u32,
                    height: uv_height as u32,
                    depth: 1,
                },
            )
        };

        // Create wgpu textures from HAL textures
        let device = self.ctx.device();

        let y_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane (Zero-Copy)"),
            size: wgpu::Extent3d {
                width: y_width as u32,
                height: y_height as u32,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        };

        let uv_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 UV Plane (Zero-Copy)"),
            size: wgpu::Extent3d {
                width: uv_width as u32,
                height: uv_height as u32,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        };

        // Use create_texture_from_hal to wrap the HAL textures
        let y_texture = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Metal>(
                y_hal_texture,
                &y_texture_desc,
            )
        };

        let uv_texture = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Metal>(
                uv_hal_texture,
                &uv_texture_desc,
            )
        };

        let y_view = y_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = uv_texture.create_view(&wgpu::TextureViewDescriptor::default());

        tracing::info!(
            "Zero-copy import successful: {}x{} NV12 from IOSurface",
            y_width, y_height
        );

        Ok(ImportedNv12Texture {
            y_texture,
            uv_texture,
            y_view,
            uv_view,
            width: y_width as u32,
            height: y_height as u32,
            pts: gpu_texture.pts,
            color_space: ColorSpace::Bt709,
        })
    }

    /// Import from IOSurface handle directly (for use with FFmpeg)
    ///
    /// # Safety
    /// The io_surface must be a valid IOSurfaceRef.
    pub unsafe fn import_iosurface(
        &self,
        io_surface: usize,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        let io_surface_ref = io_surface as IOSurfaceRef;

        if io_surface_ref.is_null() {
            return Err(Error::Other("IOSurface is null".to_string()));
        }

        let plane_count = IOSurfaceGetPlaneCount(io_surface_ref);
        if plane_count != 2 {
            return Err(Error::Other(format!(
                "Expected 2 planes for NV12, got {}",
                plane_count
            )));
        }

        let y_width = IOSurfaceGetWidthOfPlane(io_surface_ref, 0);
        let y_height = IOSurfaceGetHeightOfPlane(io_surface_ref, 0);
        let uv_width = IOSurfaceGetWidthOfPlane(io_surface_ref, 1);
        let uv_height = IOSurfaceGetHeightOfPlane(io_surface_ref, 1);

        // Use zero-copy Metal texture import
        self.create_metal_textures_from_iosurface(
            io_surface_ref,
            y_width,
            y_height,
            uv_width,
            uv_height,
            gpu_texture,
        )
    }

    /// Import IOSurface via CPU upload (fallback path)
    ///
    /// This reads the IOSurface data to CPU and uploads to wgpu textures.
    /// Less efficient than zero-copy but more reliable.
    unsafe fn import_iosurface_via_cpu(
        &self,
        io_surface: usize,
        y_width: usize,
        y_height: usize,
        uv_width: usize,
        uv_height: usize,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        // Read Y plane data
        let (y_data, _, _, y_bytes_per_row) = read_iosurface_plane(io_surface, 0)?;

        // Read UV plane data
        let (uv_data, _, _, uv_bytes_per_row) = read_iosurface_plane(io_surface, 1)?;

        tracing::debug!(
            "IOSurface CPU read: Y={}x{} (linesize={}), UV={}x{} (linesize={})",
            y_width, y_height, y_bytes_per_row,
            uv_width, uv_height, uv_bytes_per_row
        );

        // Log some pixel values for debugging
        if !y_data.is_empty() {
            let y_sample: Vec<u8> = y_data.iter().take(10).copied().collect();
            tracing::debug!("Y plane first 10 bytes: {:?}", y_sample);
        }
        if !uv_data.is_empty() {
            let uv_sample: Vec<u8> = uv_data.iter().take(10).copied().collect();
            tracing::debug!("UV plane first 10 bytes: {:?}", uv_sample);
        }

        // Create wgpu textures
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        let y_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane (CPU Upload)"),
            size: wgpu::Extent3d {
                width: y_width as u32,
                height: y_height as u32,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let uv_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("NV12 UV Plane (CPU Upload)"),
            size: wgpu::Extent3d {
                width: uv_width as u32,
                height: uv_height as u32,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        // Upload Y plane (handle linesize padding)
        if y_bytes_per_row == y_width {
            // No padding, direct upload
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &y_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &y_data[0..(y_width * y_height)],
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(y_width as u32),
                    rows_per_image: Some(y_height as u32),
                },
                wgpu::Extent3d {
                    width: y_width as u32,
                    height: y_height as u32,
                    depth_or_array_layers: 1,
                },
            );
        } else {
            // Has padding, strip it row by row
            let mut y_stripped = Vec::with_capacity(y_width * y_height);
            for row in 0..y_height {
                let start = row * y_bytes_per_row;
                let end = start + y_width;
                y_stripped.extend_from_slice(&y_data[start..end]);
            }
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &y_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &y_stripped,
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(y_width as u32),
                    rows_per_image: Some(y_height as u32),
                },
                wgpu::Extent3d {
                    width: y_width as u32,
                    height: y_height as u32,
                    depth_or_array_layers: 1,
                },
            );
        }

        // Upload UV plane (handle linesize padding)
        // UV plane is RG8, so 2 bytes per pixel
        let uv_bytes_per_pixel = 2;
        let uv_row_bytes = uv_width * uv_bytes_per_pixel;

        if uv_bytes_per_row == uv_row_bytes {
            // No padding, direct upload
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &uv_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &uv_data[0..(uv_row_bytes * uv_height)],
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(uv_row_bytes as u32),
                    rows_per_image: Some(uv_height as u32),
                },
                wgpu::Extent3d {
                    width: uv_width as u32,
                    height: uv_height as u32,
                    depth_or_array_layers: 1,
                },
            );
        } else {
            // Has padding, strip it row by row
            let mut uv_stripped = Vec::with_capacity(uv_row_bytes * uv_height);
            for row in 0..uv_height {
                let start = row * uv_bytes_per_row;
                let end = start + uv_row_bytes;
                uv_stripped.extend_from_slice(&uv_data[start..end]);
            }
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &uv_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &uv_stripped,
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(uv_row_bytes as u32),
                    rows_per_image: Some(uv_height as u32),
                },
                wgpu::Extent3d {
                    width: uv_width as u32,
                    height: uv_height as u32,
                    depth_or_array_layers: 1,
                },
            );
        }

        let y_view = y_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = uv_texture.create_view(&wgpu::TextureViewDescriptor::default());

        tracing::info!(
            "CPU upload import successful: {}x{} NV12 from IOSurface",
            y_width, y_height
        );

        Ok(ImportedNv12Texture {
            y_texture,
            uv_texture,
            y_view,
            uv_view,
            width: y_width as u32,
            height: y_height as u32,
            pts: gpu_texture.pts,
            color_space: ColorSpace::Bt709,
        })
    }

    /// Get the Metal device
    pub fn metal_device(&self) -> &MTLDevice {
        &self.metal_device
    }
}

/// Helper to read IOSurface plane data to CPU buffer
///
/// # Safety
/// The io_surface must be a valid IOSurfaceRef.
pub unsafe fn read_iosurface_plane(
    io_surface: usize,
    plane: usize,
) -> Result<(Vec<u8>, usize, usize, usize)> {
    let io_surface_ref = io_surface as IOSurfaceRef;

    if io_surface_ref.is_null() {
        return Err(Error::Other("IOSurface is null".to_string()));
    }

    let width = IOSurfaceGetWidthOfPlane(io_surface_ref, plane);
    let height = IOSurfaceGetHeightOfPlane(io_surface_ref, plane);
    let bytes_per_row = IOSurfaceGetBytesPerRowOfPlane(io_surface_ref, plane);

    // Lock the IOSurface for reading
    #[link(name = "IOSurface", kind = "framework")]
    extern "C" {
        fn IOSurfaceLock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
        fn IOSurfaceUnlock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
        fn IOSurfaceGetBaseAddressOfPlane(surface: IOSurfaceRef, plane: usize) -> *const u8;
    }

    #[allow(non_upper_case_globals)]
    const kIOSurfaceLockReadOnly: u32 = 1;

    let lock_result = IOSurfaceLock(io_surface_ref, kIOSurfaceLockReadOnly, std::ptr::null_mut());
    if lock_result != 0 {
        return Err(Error::Other(format!(
            "Failed to lock IOSurface: {}",
            lock_result
        )));
    }

    let base_address = IOSurfaceGetBaseAddressOfPlane(io_surface_ref, plane);
    if base_address.is_null() {
        IOSurfaceUnlock(io_surface_ref, kIOSurfaceLockReadOnly, std::ptr::null_mut());
        return Err(Error::Other("IOSurface plane base address is null".to_string()));
    }

    // Copy data
    let mut data = Vec::with_capacity(bytes_per_row * height);
    for row in 0..height {
        let row_ptr = base_address.add(row * bytes_per_row);
        let row_slice = std::slice::from_raw_parts(row_ptr, bytes_per_row);
        data.extend_from_slice(row_slice);
    }

    IOSurfaceUnlock(io_surface_ref, kIOSurfaceLockReadOnly, std::ptr::null_mut());

    Ok((data, width, height, bytes_per_row))
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_macos_import_available() {
        // Just verify the module compiles
        assert!(true);
    }
}
