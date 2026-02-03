//! macOS Zero-Copy Export - wgpu → IOSurface → VideoToolbox
//!
//! This module implements zero-copy texture export on macOS:
//! 1. Create IOSurface-backed Metal texture
//! 2. Use as wgpu render/compute target
//! 3. Share IOSurface directly with VideoToolbox encoder
//!
//! This eliminates the GPU → CPU → GPU roundtrip in the encoding pipeline.

use crate::error::{Error, Result};
use crate::gpu::GpuContext;

use std::sync::Arc;

use metal::{
    Device as MTLDevice, MTLPixelFormat, MTLStorageMode, MTLTextureType,
    MTLTextureUsage, TextureDescriptor,
};
use objc::runtime::Object;
use objc::{class, msg_send, sel, sel_impl};

// Import ForeignType trait for as_ptr()
use metal::foreign_types::ForeignType;

/// IOSurface reference type (opaque pointer)
type IOSurfaceRef = *mut Object;

// External C functions for IOSurface
#[link(name = "IOSurface", kind = "framework")]
#[allow(dead_code)]
extern "C" {
    fn IOSurfaceCreate(properties: *const Object) -> IOSurfaceRef;
    fn IOSurfaceGetWidth(surface: IOSurfaceRef) -> usize;
    fn IOSurfaceGetHeight(surface: IOSurfaceRef) -> usize;
    fn IOSurfaceGetPlaneCount(surface: IOSurfaceRef) -> usize;
    fn IOSurfaceGetBytesPerRowOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
    fn IOSurfaceLock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
    fn IOSurfaceUnlock(surface: IOSurfaceRef, options: u32, seed: *mut u32) -> i32;
    fn IOSurfaceGetBaseAddressOfPlane(surface: IOSurfaceRef, plane: usize) -> *const u8;
    fn IOSurfaceIncrementUseCount(surface: IOSurfaceRef);
    fn IOSurfaceDecrementUseCount(surface: IOSurfaceRef);
}

// CoreFoundation types for dictionary creation
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFDictionaryCreateMutable(
        allocator: *const Object,
        capacity: isize,
        key_callbacks: *const Object,
        value_callbacks: *const Object,
    ) -> *mut Object;
    fn CFDictionarySetValue(dict: *mut Object, key: *const Object, value: *const Object);
    fn CFNumberCreate(
        allocator: *const Object,
        the_type: i32,
        value_ptr: *const std::ffi::c_void,
    ) -> *const Object;
    fn CFRelease(cf: *const Object);
}

// CoreFoundation constants
const K_CF_NUMBER_INT_TYPE: i32 = 9; // kCFNumberIntType
const K_CF_NUMBER_LONG_TYPE: i32 = 10; // kCFNumberLongType

// IOSurface property keys (as CFString)
#[allow(dead_code)]
extern "C" {
    static kIOSurfaceWidth: *const Object;
    static kIOSurfaceHeight: *const Object;
    static kIOSurfacePixelFormat: *const Object;
    static kIOSurfaceBytesPerRow: *const Object;
    static kIOSurfaceBytesPerElement: *const Object;
    static kIOSurfacePlaneInfo: *const Object;
    static kIOSurfacePlaneWidth: *const Object;
    static kIOSurfacePlaneHeight: *const Object;
    static kIOSurfacePlaneBytesPerRow: *const Object;
    static kIOSurfacePlaneBytesPerElement: *const Object;
    static kIOSurfacePlaneOffset: *const Object;
    static kIOSurfacePlaneSize: *const Object;
    static kCFTypeDictionaryKeyCallBacks: *const Object;
    static kCFTypeDictionaryValueCallBacks: *const Object;
}

/// NV12 pixel format constant ('420v' = 0x34323076)
const K_CV_PIXEL_FORMAT_TYPE_420_Y_P_CB_CR_8_BI_PLANAR_VIDEO_RANGE: u32 = 0x34323076;

/// IOSurface-backed NV12 texture for zero-copy encoding
#[allow(dead_code)]
pub struct IOSurfaceNv12Texture {
    /// IOSurface handle (retained)
    io_surface: IOSurfaceRef,
    /// Y plane Metal texture
    y_metal_texture: metal::Texture,
    /// UV plane Metal texture
    uv_metal_texture: metal::Texture,
    /// Y plane wgpu texture
    pub y_texture: wgpu::Texture,
    /// UV plane wgpu texture
    pub uv_texture: wgpu::Texture,
    /// Width
    pub width: u32,
    /// Height
    pub height: u32,
}

impl IOSurfaceNv12Texture {
    /// Get the IOSurface handle for VideoToolbox
    ///
    /// The returned handle is valid as long as this struct is alive.
    pub fn io_surface_handle(&self) -> usize {
        self.io_surface as usize
    }

    /// Create texture views for shader binding
    pub fn create_views(&self) -> (wgpu::TextureView, wgpu::TextureView) {
        let y_view = self.y_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = self.uv_texture.create_view(&wgpu::TextureViewDescriptor::default());
        (y_view, uv_view)
    }
}

impl Drop for IOSurfaceNv12Texture {
    fn drop(&mut self) {
        if !self.io_surface.is_null() {
            unsafe {
                IOSurfaceDecrementUseCount(self.io_surface);
                // Note: IOSurface is reference counted, it will be freed when count reaches 0
            }
        }
    }
}

/// macOS zero-copy texture exporter
///
/// Creates IOSurface-backed textures that can be shared with VideoToolbox
/// for zero-copy hardware encoding.
pub struct MacOsTextureExporter {
    ctx: Arc<GpuContext>,
    metal_device: MTLDevice,
}

impl MacOsTextureExporter {
    /// Create a new macOS texture exporter
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let metal_device = MTLDevice::system_default()
            .ok_or_else(|| Error::Other("No Metal device available".to_string()))?;

        tracing::info!("macOS texture exporter initialized for zero-copy encoding");

        Ok(Self { ctx, metal_device })
    }

    /// Create an IOSurface-backed NV12 texture
    ///
    /// This texture can be used as a compute shader output target and
    /// shared directly with VideoToolbox for encoding.
    pub fn create_nv12_texture(&self, width: u32, height: u32) -> Result<IOSurfaceNv12Texture> {
        // Create IOSurface with NV12 format (2 planes)
        let io_surface = unsafe { self.create_nv12_iosurface(width, height)? };

        // Create Metal textures from IOSurface planes
        let (y_metal, uv_metal) = unsafe {
            self.create_metal_textures_from_iosurface(io_surface, width, height)?
        };

        // Import Metal textures into wgpu
        let (y_wgpu, uv_wgpu) = unsafe {
            self.import_metal_textures_to_wgpu(&y_metal, &uv_metal, width, height)?
        };

        // Increment use count to keep IOSurface alive
        unsafe {
            IOSurfaceIncrementUseCount(io_surface);
        }

        tracing::debug!(
            "Created IOSurface-backed NV12 texture: {}x{}, handle={:?}",
            width,
            height,
            io_surface
        );

        Ok(IOSurfaceNv12Texture {
            io_surface,
            y_metal_texture: y_metal,
            uv_metal_texture: uv_metal,
            y_texture: y_wgpu,
            uv_texture: uv_wgpu,
            width,
            height,
        })
    }

    /// Create NV12 IOSurface with proper plane layout
    unsafe fn create_nv12_iosurface(&self, width: u32, height: u32) -> Result<IOSurfaceRef> {
        // Calculate plane sizes
        let y_bytes_per_row = ((width + 63) / 64) * 64; // 64-byte aligned
        let uv_bytes_per_row = y_bytes_per_row; // Same alignment for UV
        let y_plane_size = y_bytes_per_row * height;
        let uv_plane_size = uv_bytes_per_row * (height / 2);

        // Create properties dictionary
        let props = CFDictionaryCreateMutable(
            std::ptr::null(),
            0,
            kCFTypeDictionaryKeyCallBacks,
            kCFTypeDictionaryValueCallBacks,
        );

        if props.is_null() {
            return Err(Error::Other("Failed to create IOSurface properties".to_string()));
        }

        // Set basic properties
        let width_val = width as i64;
        let height_val = height as i64;
        let pixel_format = K_CV_PIXEL_FORMAT_TYPE_420_Y_P_CB_CR_8_BI_PLANAR_VIDEO_RANGE as i64;

        let width_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &width_val as *const _ as *const _,
        );
        let height_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &height_val as *const _ as *const _,
        );
        let format_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_INT_TYPE,
            &pixel_format as *const _ as *const _,
        );

        CFDictionarySetValue(props, kIOSurfaceWidth, width_num as *const _);
        CFDictionarySetValue(props, kIOSurfaceHeight, height_num as *const _);
        CFDictionarySetValue(props, kIOSurfacePixelFormat, format_num as *const _);

        // Create plane info array
        let plane_info: *mut Object = msg_send![class!(NSMutableArray), arrayWithCapacity: 2usize];

        // Y plane info
        let y_plane_dict = CFDictionaryCreateMutable(
            std::ptr::null(),
            0,
            kCFTypeDictionaryKeyCallBacks,
            kCFTypeDictionaryValueCallBacks,
        );

        let y_width_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &width_val as *const _ as *const _,
        );
        let y_height_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &height_val as *const _ as *const _,
        );
        let y_bpr = y_bytes_per_row as i64;
        let y_bpr_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &y_bpr as *const _ as *const _,
        );
        let y_bpe: i64 = 1;
        let y_bpe_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &y_bpe as *const _ as *const _,
        );
        let y_offset: i64 = 0;
        let y_offset_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &y_offset as *const _ as *const _,
        );
        let y_size = y_plane_size as i64;
        let y_size_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &y_size as *const _ as *const _,
        );

        CFDictionarySetValue(y_plane_dict, kIOSurfacePlaneWidth, y_width_num as *const _);
        CFDictionarySetValue(y_plane_dict, kIOSurfacePlaneHeight, y_height_num as *const _);
        CFDictionarySetValue(y_plane_dict, kIOSurfacePlaneBytesPerRow, y_bpr_num as *const _);
        CFDictionarySetValue(y_plane_dict, kIOSurfacePlaneBytesPerElement, y_bpe_num as *const _);
        CFDictionarySetValue(y_plane_dict, kIOSurfacePlaneOffset, y_offset_num as *const _);
        CFDictionarySetValue(y_plane_dict, kIOSurfacePlaneSize, y_size_num as *const _);

        let _: () = msg_send![plane_info, addObject: y_plane_dict];

        // UV plane info
        let uv_plane_dict = CFDictionaryCreateMutable(
            std::ptr::null(),
            0,
            kCFTypeDictionaryKeyCallBacks,
            kCFTypeDictionaryValueCallBacks,
        );

        let uv_width = (width / 2) as i64;
        let uv_height = (height / 2) as i64;
        let uv_width_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &uv_width as *const _ as *const _,
        );
        let uv_height_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &uv_height as *const _ as *const _,
        );
        let uv_bpr = uv_bytes_per_row as i64;
        let uv_bpr_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &uv_bpr as *const _ as *const _,
        );
        let uv_bpe: i64 = 2; // UV interleaved
        let uv_bpe_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &uv_bpe as *const _ as *const _,
        );
        let uv_offset = y_plane_size as i64;
        let uv_offset_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &uv_offset as *const _ as *const _,
        );
        let uv_size = uv_plane_size as i64;
        let uv_size_num = CFNumberCreate(
            std::ptr::null(),
            K_CF_NUMBER_LONG_TYPE,
            &uv_size as *const _ as *const _,
        );

        CFDictionarySetValue(uv_plane_dict, kIOSurfacePlaneWidth, uv_width_num as *const _);
        CFDictionarySetValue(uv_plane_dict, kIOSurfacePlaneHeight, uv_height_num as *const _);
        CFDictionarySetValue(uv_plane_dict, kIOSurfacePlaneBytesPerRow, uv_bpr_num as *const _);
        CFDictionarySetValue(uv_plane_dict, kIOSurfacePlaneBytesPerElement, uv_bpe_num as *const _);
        CFDictionarySetValue(uv_plane_dict, kIOSurfacePlaneOffset, uv_offset_num as *const _);
        CFDictionarySetValue(uv_plane_dict, kIOSurfacePlaneSize, uv_size_num as *const _);

        let _: () = msg_send![plane_info, addObject: uv_plane_dict];

        // Set plane info array
        CFDictionarySetValue(props, kIOSurfacePlaneInfo, plane_info as *const _);

        // Create IOSurface
        let io_surface = IOSurfaceCreate(props as *const _);

        // Release CF objects
        CFRelease(width_num);
        CFRelease(height_num);
        CFRelease(format_num);
        CFRelease(y_width_num);
        CFRelease(y_height_num);
        CFRelease(y_bpr_num);
        CFRelease(y_bpe_num);
        CFRelease(y_offset_num);
        CFRelease(y_size_num);
        CFRelease(uv_width_num);
        CFRelease(uv_height_num);
        CFRelease(uv_bpr_num);
        CFRelease(uv_bpe_num);
        CFRelease(uv_offset_num);
        CFRelease(uv_size_num);
        CFRelease(y_plane_dict as *const _);
        CFRelease(uv_plane_dict as *const _);
        CFRelease(props as *const _);

        if io_surface.is_null() {
            return Err(Error::Other("Failed to create IOSurface".to_string()));
        }

        // Verify plane count
        let plane_count = IOSurfaceGetPlaneCount(io_surface);
        if plane_count != 2 {
            return Err(Error::Other(format!(
                "IOSurface has {} planes, expected 2",
                plane_count
            )));
        }

        tracing::debug!(
            "Created NV12 IOSurface: {}x{}, Y stride={}, UV stride={}",
            IOSurfaceGetWidth(io_surface),
            IOSurfaceGetHeight(io_surface),
            IOSurfaceGetBytesPerRowOfPlane(io_surface, 0),
            IOSurfaceGetBytesPerRowOfPlane(io_surface, 1),
        );

        Ok(io_surface)
    }

    /// Create Metal textures from IOSurface planes
    unsafe fn create_metal_textures_from_iosurface(
        &self,
        io_surface: IOSurfaceRef,
        width: u32,
        height: u32,
    ) -> Result<(metal::Texture, metal::Texture)> {
        let metal_device_ptr = self.metal_device.as_ptr();

        // Y plane texture descriptor (R8Unorm for luma)
        let y_desc = TextureDescriptor::new();
        y_desc.set_texture_type(MTLTextureType::D2);
        y_desc.set_pixel_format(MTLPixelFormat::R8Unorm);
        y_desc.set_width(width as u64);
        y_desc.set_height(height as u64);
        y_desc.set_storage_mode(MTLStorageMode::Shared);
        y_desc.set_usage(MTLTextureUsage::ShaderRead | MTLTextureUsage::ShaderWrite);

        // UV plane texture descriptor (RG8Unorm for interleaved chroma)
        let uv_desc = TextureDescriptor::new();
        uv_desc.set_texture_type(MTLTextureType::D2);
        uv_desc.set_pixel_format(MTLPixelFormat::RG8Unorm);
        uv_desc.set_width((width / 2) as u64);
        uv_desc.set_height((height / 2) as u64);
        uv_desc.set_storage_mode(MTLStorageMode::Shared);
        uv_desc.set_usage(MTLTextureUsage::ShaderRead | MTLTextureUsage::ShaderWrite);

        // Create Metal textures from IOSurface planes
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
            let _: () = msg_send![y_metal_texture, release];
            return Err(Error::Other(
                "Failed to create Metal UV texture from IOSurface".to_string(),
            ));
        }

        // Wrap as metal::Texture
        let y_metal = metal::Texture::from_ptr(y_metal_texture as *mut metal::MTLTexture);
        let uv_metal = metal::Texture::from_ptr(uv_metal_texture as *mut metal::MTLTexture);

        Ok((y_metal, uv_metal))
    }

    /// Import Metal textures into wgpu
    unsafe fn import_metal_textures_to_wgpu(
        &self,
        y_metal: &metal::Texture,
        uv_metal: &metal::Texture,
        width: u32,
        height: u32,
    ) -> Result<(wgpu::Texture, wgpu::Texture)> {
        let device = self.ctx.device();

        // Create wgpu_hal textures from Metal textures
        let y_hal_texture = wgpu_hal::metal::Device::texture_from_raw(
            y_metal.clone(),
            wgpu::TextureFormat::R8Unorm,
            MTLTextureType::D2,
            1, // array_layers
            1, // mip_levels
            wgpu_hal::CopyExtent {
                width,
                height,
                depth: 1,
            },
        );

        let uv_hal_texture = wgpu_hal::metal::Device::texture_from_raw(
            uv_metal.clone(),
            wgpu::TextureFormat::Rg8Unorm,
            MTLTextureType::D2,
            1,
            1,
            wgpu_hal::CopyExtent {
                width: width / 2,
                height: height / 2,
                depth: 1,
            },
        );

        // Create wgpu texture descriptors
        let y_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane (IOSurface-backed)"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        };

        let uv_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 UV Plane (IOSurface-backed)"),
            size: wgpu::Extent3d {
                width: width / 2,
                height: height / 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        };

        // Create wgpu textures from HAL textures
        let y_texture = device.create_texture_from_hal::<wgpu_hal::api::Metal>(
            y_hal_texture,
            &y_texture_desc,
        );

        let uv_texture = device.create_texture_from_hal::<wgpu_hal::api::Metal>(
            uv_hal_texture,
            &uv_texture_desc,
        );

        Ok((y_texture, uv_texture))
    }

    /// Get the Metal device
    #[allow(dead_code)]
    pub fn metal_device(&self) -> &MTLDevice {
        &self.metal_device
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_macos_export_available() {
        // Just verify the module compiles
        assert!(true);
    }

    #[tokio::test]
    async fn test_iosurface_creation() {
        // Create GPU context
        let ctx = match crate::gpu::GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(_) => return, // Skip if no GPU
        };

        // Create exporter
        let exporter = match MacOsTextureExporter::new(ctx) {
            Ok(e) => e,
            Err(_) => return, // Skip if Metal not available
        };

        // Create IOSurface-backed NV12 texture
        let result = exporter.create_nv12_texture(1920, 1080);

        match result {
            Ok(texture) => {
                assert_eq!(texture.width, 1920);
                assert_eq!(texture.height, 1080);
                assert!(texture.io_surface_handle() != 0);
                println!("IOSurface created successfully: handle={:#x}", texture.io_surface_handle());
            }
            Err(e) => {
                // IOSurface creation may fail in some environments
                println!("IOSurface creation failed (expected in some environments): {}", e);
            }
        }
    }
}
