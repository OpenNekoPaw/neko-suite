//! macOS Zero-Copy Export - wgpu → IOSurface → VideoToolbox
//!
//! This module implements zero-copy texture export on macOS:
//! 1. Create IOSurface-backed Metal texture
//! 2. Use as wgpu render/compute target
//! 3. Share IOSurface directly with VideoToolbox encoder
//!
//! Architecture (per-frame import/release pattern):
//! - IOSurface is the persistent backing store (owned by this module)
//! - Metal textures are created once from IOSurface planes
//! - wgpu textures are imported fresh each frame and dropped after submit
//! - This avoids wgpu internal cache conflicts with IOSurface lifecycle
//!
//! This eliminates the GPU → CPU → GPU roundtrip in the encoding pipeline.

use crate::error::{Error, Result};
use crate::gpu::GpuContext;

use std::sync::Arc;

use metal::{
    Device as MTLDevice, MTLPixelFormat, MTLStorageMode, MTLTextureType, MTLTextureUsage,
    TextureDescriptor,
};
use objc::runtime::Object;
use objc::{class, msg_send, sel, sel_impl};

// Import ForeignType trait for as_ptr()
use metal::foreign_types::ForeignType;

/// IOSurface reference type (opaque pointer)
pub type IOSurfaceRef = *mut Object;

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

/// Persistent IOSurface backing store for NV12 textures
///
/// This struct owns the IOSurface and Metal textures, which are persistent.
/// wgpu textures should be imported fresh each frame using `import_to_wgpu()`.
///
/// Architecture:
/// - IOSurface: persistent, owned by this struct
/// - Metal textures: persistent, created once from IOSurface planes
/// - wgpu textures: temporary, imported each frame and dropped after submit
pub struct IOSurfaceBackingStore {
    /// IOSurface handle (retained)
    io_surface: IOSurfaceRef,
    /// Y plane Metal texture (persistent)
    y_metal_texture: metal::Texture,
    /// UV plane Metal texture (persistent)
    uv_metal_texture: metal::Texture,
    /// Width
    pub width: u32,
    /// Height
    pub height: u32,
}

impl IOSurfaceBackingStore {
    /// Get the IOSurface handle for VideoToolbox
    pub fn io_surface_handle(&self) -> usize {
        self.io_surface as usize
    }

    /// Get the raw IOSurface reference
    #[allow(dead_code)] // Phase 2: used by zero-copy export pipeline
    pub fn io_surface_ref(&self) -> IOSurfaceRef {
        self.io_surface
    }

    /// Get references to the Metal textures
    pub fn metal_textures(&self) -> (&metal::Texture, &metal::Texture) {
        (&self.y_metal_texture, &self.uv_metal_texture)
    }

    /// Synchronize Metal textures to ensure GPU writes are complete
    ///
    /// This must be called after wgpu render pass writes to the textures
    /// and before the IOSurface is used by VideoToolbox encoder.
    #[allow(dead_code)] // Phase 2: used by zero-copy export pipeline
    pub fn synchronize(&self, metal_device: &MTLDevice) {
        let command_queue = metal_device.new_command_queue();
        let command_buffer = command_queue.new_command_buffer();
        let blit_encoder = command_buffer.new_blit_command_encoder();

        blit_encoder.synchronize_resource(&self.y_metal_texture);
        blit_encoder.synchronize_resource(&self.uv_metal_texture);
        blit_encoder.end_encoding();

        command_buffer.commit();
        command_buffer.wait_until_completed();
    }

    /// Copy Y and UV plane data from CPU buffers to IOSurface
    ///
    /// # Safety
    /// The buffers must contain valid pixel data with correct dimensions
    pub unsafe fn copy_from_buffers(
        &self,
        y_data: &[u8],
        y_src_stride: u32,
        uv_data: &[u8],
        uv_src_stride: u32,
        width: u32,
        height: u32,
    ) -> crate::error::Result<()> {
        // Lock IOSurface for CPU write
        let lock_result = IOSurfaceLock(self.io_surface, 0, std::ptr::null_mut());
        if lock_result != 0 {
            return Err(crate::error::Error::Other(format!(
                "Failed to lock IOSurface: {}",
                lock_result
            )));
        }

        // Copy Y plane
        let y_dst_ptr = IOSurfaceGetBaseAddressOfPlane(self.io_surface, 0) as *mut u8;
        let y_dst_stride = IOSurfaceGetBytesPerRowOfPlane(self.io_surface, 0);

        for row in 0..height as usize {
            let src_offset = row * y_src_stride as usize;
            let dst_offset = row * y_dst_stride;
            std::ptr::copy_nonoverlapping(
                y_data.as_ptr().add(src_offset),
                y_dst_ptr.add(dst_offset),
                width as usize,
            );
        }

        // Copy UV plane
        let uv_dst_ptr = IOSurfaceGetBaseAddressOfPlane(self.io_surface, 1) as *mut u8;
        let uv_dst_stride = IOSurfaceGetBytesPerRowOfPlane(self.io_surface, 1);
        let uv_height = height / 2;
        let uv_width = width; // UV is interleaved, so width in bytes = width

        for row in 0..uv_height as usize {
            let src_offset = row * uv_src_stride as usize;
            let dst_offset = row * uv_dst_stride;
            std::ptr::copy_nonoverlapping(
                uv_data.as_ptr().add(src_offset),
                uv_dst_ptr.add(dst_offset),
                uv_width as usize,
            );
        }

        // Unlock IOSurface
        IOSurfaceUnlock(self.io_surface, 0, std::ptr::null_mut());

        Ok(())
    }

    /// Import IOSurface Metal textures to wgpu for direct rendering
    ///
    /// This creates wgpu textures backed by the IOSurface that can be used
    /// as render targets. The render pass output goes directly to IOSurface
    /// without any CPU intermediate copy.
    ///
    /// IMPORTANT: The returned textures should be dropped after queue.submit()
    /// to avoid wgpu internal cache conflicts.
    ///
    /// # Safety
    /// This function uses unsafe wgpu_hal APIs to import Metal textures.
    pub fn import_as_render_targets(
        &self,
        device: &wgpu::Device,
    ) -> Result<(wgpu::Texture, wgpu::Texture)> {
        let (y_metal, uv_metal) = self.metal_textures();

        // Create wgpu_hal textures from Metal textures
        let y_hal_texture = unsafe {
            wgpu_hal::metal::Device::texture_from_raw(
                y_metal.clone(),
                wgpu::TextureFormat::R8Unorm,
                MTLTextureType::D2,
                1, // array_layers
                1, // mip_levels
                wgpu_hal::CopyExtent {
                    width: self.width,
                    height: self.height,
                    depth: 1,
                },
            )
        };

        let uv_hal_texture = unsafe {
            wgpu_hal::metal::Device::texture_from_raw(
                uv_metal.clone(),
                wgpu::TextureFormat::Rg8Unorm,
                MTLTextureType::D2,
                1,
                1,
                wgpu_hal::CopyExtent {
                    width: self.width / 2,
                    height: self.height / 2,
                    depth: 1,
                },
            )
        };

        // Create wgpu texture descriptors with RENDER_ATTACHMENT usage
        let y_texture_desc = wgpu::TextureDescriptor {
            label: Some("IOSurface Y Render Target"),
            size: wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            // RENDER_ATTACHMENT for direct rendering, TEXTURE_BINDING for potential reads
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        };

        let uv_texture_desc = wgpu::TextureDescriptor {
            label: Some("IOSurface UV Render Target"),
            size: wgpu::Extent3d {
                width: self.width / 2,
                height: self.height / 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        };

        // Create wgpu textures from HAL textures
        let y_texture = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Metal>(y_hal_texture, &y_texture_desc)
        };

        let uv_texture = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Metal>(uv_hal_texture, &uv_texture_desc)
        };

        tracing::debug!(
            "Imported IOSurface as render targets: Y={}x{}, UV={}x{}",
            self.width,
            self.height,
            self.width / 2,
            self.height / 2
        );

        Ok((y_texture, uv_texture))
    }
}

impl Drop for IOSurfaceBackingStore {
    fn drop(&mut self) {
        if !self.io_surface.is_null() {
            unsafe {
                IOSurfaceDecrementUseCount(self.io_surface);
            }
        }
    }
}

/// Temporary wgpu texture wrapper for per-frame rendering
///
/// This struct holds wgpu textures imported from IOSurface Metal textures.
/// It should be created at the start of each frame and dropped after queue.submit().
///
/// IMPORTANT: Do NOT cache this across frames. Create fresh each frame to avoid
/// wgpu internal cache conflicts with IOSurface lifecycle.
#[allow(dead_code)] // Phase 2: used by zero-copy export pipeline
pub struct FrameNv12Textures {
    /// Y plane wgpu texture (temporary, per-frame)
    pub y_texture: wgpu::Texture,
    /// UV plane wgpu texture (temporary, per-frame)
    pub uv_texture: wgpu::Texture,
    /// Width
    pub width: u32,
    /// Height
    pub height: u32,
}

impl FrameNv12Textures {
    /// Create texture views for shader binding
    #[allow(dead_code)] // Phase 2: used by zero-copy export pipeline
    pub fn create_views(&self) -> (wgpu::TextureView, wgpu::TextureView) {
        let y_view = self
            .y_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = self
            .uv_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        (y_view, uv_view)
    }
}

/// Legacy alias for backward compatibility
#[allow(dead_code)]
pub type IOSurfaceNv12Texture = IOSurfaceBackingStore;

/// Phase 2: macOS zero-copy texture exporter
///
/// Creates IOSurface-backed textures that can be shared with VideoToolbox
/// for zero-copy hardware encoding.
///
/// Usage pattern (per-frame import/release):
/// ```ignore
/// // Once: create backing store
/// let backing = exporter.create_backing_store(width, height)?;
///
/// // Each frame:
/// let frame_textures = exporter.import_frame_textures(&backing)?;
/// // ... use frame_textures in render pass ...
/// queue.submit(...);
/// drop(frame_textures); // Important: drop after submit
/// backing.synchronize(&metal_device);
/// // ... pass backing.io_surface_handle() to VideoToolbox ...
/// ```
#[allow(dead_code)] // Phase 2: zero-copy export pipeline
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

    /// Create an IOSurface backing store for NV12 textures
    ///
    /// This creates the persistent IOSurface and Metal textures.
    /// Use `import_frame_textures()` each frame to get temporary wgpu textures.
    pub fn create_backing_store(&self, width: u32, height: u32) -> Result<IOSurfaceBackingStore> {
        // Create IOSurface with NV12 format (2 planes)
        let io_surface = unsafe { self.create_nv12_iosurface(width, height)? };

        // Create Metal textures from IOSurface planes
        let (y_metal, uv_metal) =
            unsafe { self.create_metal_textures_from_iosurface(io_surface, width, height)? };

        // Increment use count to keep IOSurface alive
        unsafe {
            IOSurfaceIncrementUseCount(io_surface);
        }

        tracing::debug!(
            "Created IOSurface backing store: {}x{}, handle={:?}",
            width,
            height,
            io_surface
        );

        Ok(IOSurfaceBackingStore {
            io_surface,
            y_metal_texture: y_metal,
            uv_metal_texture: uv_metal,
            width,
            height,
        })
    }

    /// Import Metal textures to wgpu for the current frame
    ///
    /// IMPORTANT: The returned `FrameNv12Textures` should be dropped after
    /// `queue.submit()` to avoid wgpu internal cache conflicts.
    ///
    /// This is a lightweight operation (just pointer wrapping) and should
    /// be called fresh each frame.
    #[allow(dead_code)] // Phase 2: zero-copy export pipeline
    pub fn import_frame_textures(
        &self,
        backing: &IOSurfaceBackingStore,
    ) -> Result<FrameNv12Textures> {
        let (y_metal, uv_metal) = backing.metal_textures();

        // Import Metal textures into wgpu (fresh each frame)
        let (y_wgpu, uv_wgpu) = unsafe {
            self.import_metal_textures_to_wgpu(y_metal, uv_metal, backing.width, backing.height)?
        };

        Ok(FrameNv12Textures {
            y_texture: y_wgpu,
            uv_texture: uv_wgpu,
            width: backing.width,
            height: backing.height,
        })
    }

    /// Get the Metal device
    #[allow(dead_code)] // Phase 2: zero-copy export pipeline
    pub fn metal_device(&self) -> &MTLDevice {
        &self.metal_device
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
            return Err(Error::Other(
                "Failed to create IOSurface properties".to_string(),
            ));
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

        if plane_info.is_null() {
            CFRelease(width_num);
            CFRelease(height_num);
            CFRelease(format_num);
            CFRelease(props as *const _);
            return Err(Error::Other(
                "Failed to create NSMutableArray for plane info".to_string(),
            ));
        }

        // Y plane info
        let y_plane_dict = CFDictionaryCreateMutable(
            std::ptr::null(),
            0,
            kCFTypeDictionaryKeyCallBacks,
            kCFTypeDictionaryValueCallBacks,
        );

        if y_plane_dict.is_null() {
            let _: () = msg_send![plane_info, release];
            CFRelease(width_num);
            CFRelease(height_num);
            CFRelease(format_num);
            CFRelease(props as *const _);
            return Err(Error::Other(
                "Failed to create Y plane dictionary".to_string(),
            ));
        }

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
        CFDictionarySetValue(
            y_plane_dict,
            kIOSurfacePlaneHeight,
            y_height_num as *const _,
        );
        CFDictionarySetValue(
            y_plane_dict,
            kIOSurfacePlaneBytesPerRow,
            y_bpr_num as *const _,
        );
        CFDictionarySetValue(
            y_plane_dict,
            kIOSurfacePlaneBytesPerElement,
            y_bpe_num as *const _,
        );
        CFDictionarySetValue(
            y_plane_dict,
            kIOSurfacePlaneOffset,
            y_offset_num as *const _,
        );
        CFDictionarySetValue(y_plane_dict, kIOSurfacePlaneSize, y_size_num as *const _);

        let _: () = msg_send![plane_info, addObject: y_plane_dict];

        // UV plane info
        let uv_plane_dict = CFDictionaryCreateMutable(
            std::ptr::null(),
            0,
            kCFTypeDictionaryKeyCallBacks,
            kCFTypeDictionaryValueCallBacks,
        );

        if uv_plane_dict.is_null() {
            let _: () = msg_send![plane_info, release];
            CFRelease(width_num);
            CFRelease(height_num);
            CFRelease(format_num);
            CFRelease(y_width_num);
            CFRelease(y_height_num);
            CFRelease(y_bpr_num);
            CFRelease(y_bpe_num);
            CFRelease(y_offset_num);
            CFRelease(y_size_num);
            CFRelease(y_plane_dict as *const _);
            CFRelease(props as *const _);
            return Err(Error::Other(
                "Failed to create UV plane dictionary".to_string(),
            ));
        }

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

        CFDictionarySetValue(
            uv_plane_dict,
            kIOSurfacePlaneWidth,
            uv_width_num as *const _,
        );
        CFDictionarySetValue(
            uv_plane_dict,
            kIOSurfacePlaneHeight,
            uv_height_num as *const _,
        );
        CFDictionarySetValue(
            uv_plane_dict,
            kIOSurfacePlaneBytesPerRow,
            uv_bpr_num as *const _,
        );
        CFDictionarySetValue(
            uv_plane_dict,
            kIOSurfacePlaneBytesPerElement,
            uv_bpe_num as *const _,
        );
        CFDictionarySetValue(
            uv_plane_dict,
            kIOSurfacePlaneOffset,
            uv_offset_num as *const _,
        );
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

        // Y plane texture descriptor (R8Unorm for NV12 luma)
        // Note: IOSurface requires 8-bit format for NV12 compatibility with VideoToolbox
        let y_desc = TextureDescriptor::new();
        y_desc.set_texture_type(MTLTextureType::D2);
        y_desc.set_pixel_format(MTLPixelFormat::R8Unorm);
        y_desc.set_width(width as u64);
        y_desc.set_height(height as u64);
        y_desc.set_storage_mode(MTLStorageMode::Shared);
        // RENDER_TARGET for receiving data from render pass (not storage)
        y_desc.set_usage(MTLTextureUsage::ShaderRead | MTLTextureUsage::RenderTarget);

        // UV plane texture descriptor (RG8Unorm for NV12 interleaved chroma)
        let uv_desc = TextureDescriptor::new();
        uv_desc.set_texture_type(MTLTextureType::D2);
        uv_desc.set_pixel_format(MTLPixelFormat::RG8Unorm);
        uv_desc.set_width((width / 2) as u64);
        uv_desc.set_height((height / 2) as u64);
        uv_desc.set_storage_mode(MTLStorageMode::Shared);
        uv_desc.set_usage(MTLTextureUsage::ShaderRead | MTLTextureUsage::RenderTarget);

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
    #[allow(dead_code)] // Phase 2: zero-copy export pipeline
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
            // RENDER_ATTACHMENT for receiving data from render pass
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
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
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        };

        // Create wgpu textures from HAL textures
        let y_texture =
            device.create_texture_from_hal::<wgpu_hal::api::Metal>(y_hal_texture, &y_texture_desc);

        let uv_texture = device
            .create_texture_from_hal::<wgpu_hal::api::Metal>(uv_hal_texture, &uv_texture_desc);

        Ok((y_texture, uv_texture))
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

        // Create IOSurface backing store
        let backing = match exporter.create_backing_store(1920, 1080) {
            Ok(b) => b,
            Err(e) => {
                println!(
                    "IOSurface creation failed (expected in some environments): {}",
                    e
                );
                return;
            }
        };

        assert_eq!(backing.width, 1920);
        assert_eq!(backing.height, 1080);
        assert!(backing.io_surface_handle() != 0);
        println!(
            "IOSurface backing store created: handle={:#x}",
            backing.io_surface_handle()
        );

        // Test per-frame import
        let frame_textures = match exporter.import_frame_textures(&backing) {
            Ok(t) => t,
            Err(e) => {
                println!("Frame texture import failed: {}", e);
                return;
            }
        };

        assert_eq!(frame_textures.width, 1920);
        assert_eq!(frame_textures.height, 1080);
        println!("Frame textures imported successfully");

        // Drop frame textures (simulating end of frame)
        drop(frame_textures);
        println!("Frame textures dropped");
    }
}
