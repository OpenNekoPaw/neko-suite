//! GPU Texture management for zero-copy frame transfer
//!
//! This module provides:
//! - GPU texture creation and management
//! - Texture handle export for WebGPU interop
//! - Shared memory buffer for cross-process texture sharing
//! - LRU texture pool for efficient reuse

#![allow(dead_code)]

use std::sync::Arc;
use std::time::Instant;

/// Texture format for frame data
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextureFormat {
    /// RGBA 8-bit per channel
    Rgba8,
    /// BGRA 8-bit per channel (common for display)
    Bgra8,
    /// NV12 (Y plane + interleaved UV) - common hardware decoder output
    Nv12,
    /// YUV420P (Y + U + V separate planes) - FFmpeg default output
    Yuv420p,
}

impl TextureFormat {
    /// Convert to wgpu texture format
    pub fn to_wgpu(&self) -> wgpu::TextureFormat {
        match self {
            TextureFormat::Rgba8 => wgpu::TextureFormat::Rgba8Unorm,
            TextureFormat::Bgra8 => wgpu::TextureFormat::Bgra8Unorm,
            TextureFormat::Nv12 => wgpu::TextureFormat::R8Unorm, // Y plane only, UV handled separately
            TextureFormat::Yuv420p => wgpu::TextureFormat::R8Unorm, // Each plane is R8
        }
    }

    /// Bytes per pixel (for single-plane formats)
    pub fn bytes_per_pixel(&self) -> u32 {
        match self {
            TextureFormat::Rgba8 | TextureFormat::Bgra8 => 4,
            TextureFormat::Nv12 | TextureFormat::Yuv420p => 1, // Y plane only
        }
    }

    /// Total bytes for a frame of given dimensions
    pub fn frame_size(&self, width: u32, height: u32) -> usize {
        match self {
            TextureFormat::Rgba8 | TextureFormat::Bgra8 => (width * height * 4) as usize,
            TextureFormat::Nv12 => (width * height * 3 / 2) as usize, // Y + UV interleaved
            TextureFormat::Yuv420p => (width * height * 3 / 2) as usize, // Y + U + V
        }
    }
}

/// GPU texture handle that can be shared with WebGPU
#[derive(Debug, Clone)]
pub struct TextureHandle {
    /// Unique texture ID
    pub id: u64,
    /// Texture width
    pub width: u32,
    /// Texture height
    pub height: u32,
    /// Texture format
    pub format: TextureFormat,
    /// Shared memory key (for cross-process sharing)
    pub shared_memory_key: Option<String>,
    /// Texture generation (incremented on update)
    pub generation: u64,
}

/// GPU texture wrapper with associated resources
pub struct GpuTexture {
    /// wgpu texture
    texture: wgpu::Texture,
    /// Texture view for sampling
    view: wgpu::TextureView,
    /// Texture dimensions
    width: u32,
    height: u32,
    /// Texture format
    format: TextureFormat,
    /// Unique ID
    id: u64,
    /// Generation counter
    generation: u64,
    /// Whether texture is currently in use
    in_use: bool,
    /// Last time texture was used (for LRU eviction)
    last_used: Instant,
}

impl GpuTexture {
    /// Create a new GPU texture
    pub fn new(
        device: &wgpu::Device,
        width: u32,
        height: u32,
        format: TextureFormat,
        id: u64,
    ) -> Self {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(&format!("Frame Texture {}", id)),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: format.to_wgpu(),
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        Self {
            texture,
            view,
            width,
            height,
            format,
            id,
            generation: 0,
            in_use: false,
            last_used: Instant::now(),
        }
    }

    /// Upload frame data to texture
    pub fn upload(&mut self, queue: &wgpu::Queue, data: &[u8]) {
        let bytes_per_row = self.width * self.format.bytes_per_pixel();

        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &self.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(self.height),
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );

        self.generation += 1;
        self.last_used = Instant::now();
    }

    /// Get texture handle for sharing
    pub fn handle(&self) -> TextureHandle {
        TextureHandle {
            id: self.id,
            width: self.width,
            height: self.height,
            format: self.format,
            shared_memory_key: None, // Will be set when using shared memory
            generation: self.generation,
        }
    }

    /// Get texture view for rendering
    pub fn view(&self) -> &wgpu::TextureView {
        &self.view
    }

    /// Get underlying wgpu texture
    pub fn texture(&self) -> &wgpu::Texture {
        &self.texture
    }

    /// Get texture dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    /// Get texture ID
    pub fn id(&self) -> u64 {
        self.id
    }

    /// Check if texture is currently in use
    pub fn is_in_use(&self) -> bool {
        self.in_use
    }

    /// Mark texture as in use
    pub fn mark_in_use(&mut self) {
        self.in_use = true;
        self.last_used = Instant::now();
    }

    /// Mark texture as free (available for reuse)
    pub fn mark_free(&mut self) {
        self.in_use = false;
    }

    /// Get last used time
    pub fn last_used(&self) -> Instant {
        self.last_used
    }

    /// Check if texture matches the specified dimensions and format
    pub fn matches(&self, width: u32, height: u32, format: TextureFormat) -> bool {
        self.width == width && self.height == height && self.format == format
    }
}

/// Texture pool for efficient texture reuse with LRU eviction
///
/// Supports multiple textures of the same size, tracks usage status,
/// and evicts least-recently-used textures when pool exceeds capacity.
pub struct TexturePool {
    device: Arc<wgpu::Device>,
    queue: Arc<wgpu::Queue>,
    textures: Vec<GpuTexture>,
    next_id: u64,
    /// Maximum number of textures to keep in pool
    max_textures: usize,
}

impl TexturePool {
    /// Create a new texture pool with default max size (64 textures)
    pub fn new(device: Arc<wgpu::Device>, queue: Arc<wgpu::Queue>) -> Self {
        Self::with_capacity(device, queue, 64)
    }

    /// Create a new texture pool with specified max size
    pub fn with_capacity(device: Arc<wgpu::Device>, queue: Arc<wgpu::Queue>, max_textures: usize) -> Self {
        Self {
            device,
            queue,
            textures: Vec::with_capacity(max_textures),
            next_id: 1,
            max_textures,
        }
    }

    /// Acquire a texture with the specified dimensions
    ///
    /// Prioritizes reusing a free texture with matching dimensions.
    /// Creates a new texture if no suitable free texture is available.
    /// Evicts LRU textures if pool exceeds capacity.
    pub fn acquire(&mut self, width: u32, height: u32, format: TextureFormat) -> &mut GpuTexture {
        // First, try to find a FREE texture with matching dimensions
        let free_match_idx = self.textures.iter().position(|t| {
            !t.is_in_use() && t.matches(width, height, format)
        });

        if let Some(idx) = free_match_idx {
            let texture = &mut self.textures[idx];
            texture.mark_in_use();
            return texture;
        }

        // No free matching texture, need to create a new one
        // First, evict LRU textures if we're at capacity
        self.evict_if_needed();

        // Create new texture
        let id = self.next_id;
        self.next_id += 1;

        let mut texture = GpuTexture::new(&self.device, width, height, format, id);
        texture.mark_in_use();
        self.textures.push(texture);

        self.textures.last_mut().unwrap()
    }

    /// Release a texture back to the pool (mark as free for reuse)
    pub fn release(&mut self, texture_id: u64) {
        if let Some(texture) = self.textures.iter_mut().find(|t| t.id() == texture_id) {
            texture.mark_free();
        }
    }

    /// Release a texture by reference
    pub fn release_texture(&mut self, texture: &GpuTexture) {
        self.release(texture.id());
    }

    /// Evict least-recently-used free textures if pool exceeds capacity
    fn evict_if_needed(&mut self) {
        while self.textures.len() >= self.max_textures {
            // Find the oldest FREE texture (LRU eviction)
            let lru_idx = self.textures
                .iter()
                .enumerate()
                .filter(|(_, t)| !t.is_in_use())
                .min_by_key(|(_, t)| t.last_used())
                .map(|(idx, _)| idx);

            if let Some(idx) = lru_idx {
                // Remove the LRU texture (wgpu::Texture is dropped automatically)
                self.textures.swap_remove(idx);
            } else {
                // All textures are in use, can't evict any
                // Allow pool to grow beyond max temporarily
                break;
            }
        }
    }

    /// Upload frame data and return texture handle
    pub fn upload_frame(
        &mut self,
        width: u32,
        height: u32,
        format: TextureFormat,
        data: &[u8],
    ) -> TextureHandle {
        // Clone queue reference before mutable borrow
        let queue = self.queue.clone();

        let texture = self.acquire(width, height, format);
        texture.upload(&queue, data);
        texture.handle()
    }

    /// Get texture by ID
    pub fn get(&self, id: u64) -> Option<&GpuTexture> {
        self.textures.iter().find(|t| t.id == id)
    }

    /// Get mutable texture by ID
    pub fn get_mut(&mut self, id: u64) -> Option<&mut GpuTexture> {
        self.textures.iter_mut().find(|t| t.id == id)
    }

    /// Clear all textures
    pub fn clear(&mut self) {
        self.textures.clear();
    }

    /// Get number of textures in pool
    pub fn len(&self) -> usize {
        self.textures.len()
    }

    /// Check if pool is empty
    pub fn is_empty(&self) -> bool {
        self.textures.is_empty()
    }

    /// Get number of textures currently in use
    pub fn in_use_count(&self) -> usize {
        self.textures.iter().filter(|t| t.is_in_use()).count()
    }

    /// Get number of free textures available for reuse
    pub fn free_count(&self) -> usize {
        self.textures.iter().filter(|t| !t.is_in_use()).count()
    }

    /// Get pool statistics
    pub fn stats(&self) -> TexturePoolStats {
        TexturePoolStats {
            total: self.textures.len(),
            in_use: self.in_use_count(),
            free: self.free_count(),
            max_capacity: self.max_textures,
        }
    }
}

/// Statistics for texture pool
#[derive(Debug, Clone)]
pub struct TexturePoolStats {
    pub total: usize,
    pub in_use: usize,
    pub free: usize,
    pub max_capacity: usize,
}

/// Shared memory buffer for cross-process texture sharing
/// This allows zero-copy transfer between Extension Host and Webview
pub struct SharedTextureBuffer {
    /// Buffer data
    data: Vec<u8>,
    /// Buffer width
    width: u32,
    /// Buffer height
    height: u32,
    /// Buffer format
    format: TextureFormat,
    /// Unique key for this buffer
    key: String,
    /// Generation counter
    generation: u64,
}

impl SharedTextureBuffer {
    /// Create a new shared texture buffer
    pub fn new(width: u32, height: u32, format: TextureFormat) -> Self {
        let size = (width * height * format.bytes_per_pixel()) as usize;
        let key = format!("vedit_texture_{}_{}", std::process::id(), uuid_simple());

        Self {
            data: vec![0u8; size],
            width,
            height,
            format,
            key,
            generation: 0,
        }
    }

    /// Update buffer with new frame data
    pub fn update(&mut self, data: &[u8]) {
        let expected_size = (self.width * self.height * self.format.bytes_per_pixel()) as usize;
        if data.len() >= expected_size {
            self.data[..expected_size].copy_from_slice(&data[..expected_size]);
            self.generation += 1;
        }
    }

    /// Get buffer data
    pub fn data(&self) -> &[u8] {
        &self.data
    }

    /// Get buffer key
    pub fn key(&self) -> &str {
        &self.key
    }

    /// Get buffer dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    /// Get buffer format
    pub fn format(&self) -> TextureFormat {
        self.format
    }

    /// Get generation counter
    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Create texture handle for this buffer
    pub fn handle(&self) -> TextureHandle {
        TextureHandle {
            id: 0, // Shared buffers don't have GPU texture IDs
            width: self.width,
            height: self.height,
            format: self.format,
            shared_memory_key: Some(self.key.clone()),
            generation: self.generation,
        }
    }
}

/// Generate a simple UUID-like string
fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", timestamp)
}

// =============================================================================
// YUV420P Texture Support
// =============================================================================

/// Color space for YUV conversion
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum YuvColorSpace {
    /// BT.601 - SD video (DVD, broadcast)
    Bt601,
    /// BT.709 - HD video (HDTV, Blu-ray)
    #[default]
    Bt709,
    /// BT.2020 - UHD/4K video (HDR)
    Bt2020,
}

impl YuvColorSpace {
    /// Detect color space based on video resolution
    pub fn from_resolution(width: u32, height: u32) -> Self {
        if width >= 3840 || height >= 2160 {
            YuvColorSpace::Bt2020
        } else if width >= 1280 || height >= 720 {
            YuvColorSpace::Bt709
        } else {
            YuvColorSpace::Bt601
        }
    }

    /// Get color space as integer for shader uniform
    pub fn as_i32(&self) -> i32 {
        match self {
            YuvColorSpace::Bt601 => 0,
            YuvColorSpace::Bt709 => 1,
            YuvColorSpace::Bt2020 => 2,
        }
    }
}

/// YUV420P texture set (Y, U, V planes as separate textures)
///
/// YUV420P layout:
/// - Y plane: full resolution (width × height), 8-bit per pixel
/// - U plane: half resolution (width/2 × height/2), 8-bit per pixel
/// - V plane: half resolution (width/2 × height/2), 8-bit per pixel
pub struct Yuv420pTexture {
    /// Y plane texture (luma, full resolution)
    y_texture: wgpu::Texture,
    y_view: wgpu::TextureView,
    /// U plane texture (chroma Cb, half resolution)
    u_texture: wgpu::Texture,
    u_view: wgpu::TextureView,
    /// V plane texture (chroma Cr, half resolution)
    v_texture: wgpu::Texture,
    v_view: wgpu::TextureView,
    /// Full frame dimensions
    width: u32,
    height: u32,
    /// Color space for YUV→RGB conversion
    color_space: YuvColorSpace,
    /// Unique ID
    id: u64,
    /// Generation counter
    generation: u64,
    /// Last used time
    last_used: Instant,
}

impl Yuv420pTexture {
    /// Create a new YUV420P texture set
    pub fn new(
        device: &wgpu::Device,
        width: u32,
        height: u32,
        id: u64,
    ) -> Self {
        let color_space = YuvColorSpace::from_resolution(width, height);

        // Y plane: full resolution
        let y_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(&format!("YUV420P Y Plane {}", id)),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        // U and V planes: half resolution
        let uv_width = width / 2;
        let uv_height = height / 2;

        let u_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(&format!("YUV420P U Plane {}", id)),
            size: wgpu::Extent3d {
                width: uv_width,
                height: uv_height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let v_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(&format!("YUV420P V Plane {}", id)),
            size: wgpu::Extent3d {
                width: uv_width,
                height: uv_height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let y_view = y_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let u_view = u_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let v_view = v_texture.create_view(&wgpu::TextureViewDescriptor::default());

        Self {
            y_texture,
            y_view,
            u_texture,
            u_view,
            v_texture,
            v_view,
            width,
            height,
            color_space,
            id,
            generation: 0,
            last_used: Instant::now(),
        }
    }

    /// Upload YUV420P frame data
    ///
    /// Data layout: Y plane (width×height) + U plane (width/2×height/2) + V plane (width/2×height/2)
    pub fn upload(&mut self, queue: &wgpu::Queue, data: &[u8]) {
        let y_size = (self.width * self.height) as usize;
        let uv_size = ((self.width / 2) * (self.height / 2)) as usize;
        let expected_size = y_size + uv_size * 2;

        if data.len() < expected_size {
            eprintln!(
                "YUV420P data too small: expected {} bytes, got {}",
                expected_size,
                data.len()
            );
            return;
        }

        // Upload Y plane
        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &self.y_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &data[0..y_size],
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(self.width),
                rows_per_image: Some(self.height),
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );

        // Upload U plane
        let uv_width = self.width / 2;
        let uv_height = self.height / 2;

        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &self.u_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &data[y_size..y_size + uv_size],
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(uv_width),
                rows_per_image: Some(uv_height),
            },
            wgpu::Extent3d {
                width: uv_width,
                height: uv_height,
                depth_or_array_layers: 1,
            },
        );

        // Upload V plane
        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &self.v_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &data[y_size + uv_size..],
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(uv_width),
                rows_per_image: Some(uv_height),
            },
            wgpu::Extent3d {
                width: uv_width,
                height: uv_height,
                depth_or_array_layers: 1,
            },
        );

        self.generation += 1;
        self.last_used = Instant::now();
    }

    /// Upload separate Y, U, V planes
    pub fn upload_planes(
        &mut self,
        queue: &wgpu::Queue,
        y_data: &[u8],
        u_data: &[u8],
        v_data: &[u8],
    ) {
        let y_size = (self.width * self.height) as usize;
        let uv_size = ((self.width / 2) * (self.height / 2)) as usize;

        if y_data.len() < y_size || u_data.len() < uv_size || v_data.len() < uv_size {
            eprintln!("YUV420P plane data size mismatch");
            return;
        }

        // Upload Y plane
        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &self.y_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            y_data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(self.width),
                rows_per_image: Some(self.height),
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );

        // Upload U and V planes
        let uv_width = self.width / 2;
        let uv_height = self.height / 2;

        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &self.u_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            u_data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(uv_width),
                rows_per_image: Some(uv_height),
            },
            wgpu::Extent3d {
                width: uv_width,
                height: uv_height,
                depth_or_array_layers: 1,
            },
        );

        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &self.v_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            v_data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(uv_width),
                rows_per_image: Some(uv_height),
            },
            wgpu::Extent3d {
                width: uv_width,
                height: uv_height,
                depth_or_array_layers: 1,
            },
        );

        self.generation += 1;
        self.last_used = Instant::now();
    }

    /// Get Y plane texture view
    pub fn y_view(&self) -> &wgpu::TextureView {
        &self.y_view
    }

    /// Get U plane texture view
    pub fn u_view(&self) -> &wgpu::TextureView {
        &self.u_view
    }

    /// Get V plane texture view
    pub fn v_view(&self) -> &wgpu::TextureView {
        &self.v_view
    }

    /// Get all texture views as tuple (Y, U, V)
    pub fn views(&self) -> (&wgpu::TextureView, &wgpu::TextureView, &wgpu::TextureView) {
        (&self.y_view, &self.u_view, &self.v_view)
    }

    /// Get frame dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    /// Get color space
    pub fn color_space(&self) -> YuvColorSpace {
        self.color_space
    }

    /// Set color space manually
    pub fn set_color_space(&mut self, color_space: YuvColorSpace) {
        self.color_space = color_space;
    }

    /// Get texture ID
    pub fn id(&self) -> u64 {
        self.id
    }

    /// Get generation counter
    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Get last used time
    pub fn last_used(&self) -> Instant {
        self.last_used
    }

    /// Check if texture matches dimensions
    pub fn matches(&self, width: u32, height: u32) -> bool {
        self.width == width && self.height == height
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_texture_format() {
        assert_eq!(TextureFormat::Rgba8.bytes_per_pixel(), 4);
        assert_eq!(TextureFormat::Bgra8.bytes_per_pixel(), 4);
        assert_eq!(TextureFormat::Nv12.bytes_per_pixel(), 1);
        assert_eq!(TextureFormat::Yuv420p.bytes_per_pixel(), 1);
    }

    #[test]
    fn test_texture_format_frame_size() {
        // 1920x1080 RGBA = 1920 * 1080 * 4 = 8,294,400 bytes
        assert_eq!(TextureFormat::Rgba8.frame_size(1920, 1080), 8_294_400);
        // 1920x1080 YUV420P = 1920 * 1080 * 1.5 = 3,110,400 bytes
        assert_eq!(TextureFormat::Yuv420p.frame_size(1920, 1080), 3_110_400);
    }

    #[test]
    fn test_yuv_color_space_detection() {
        // SD resolution -> BT.601
        assert_eq!(YuvColorSpace::from_resolution(720, 480), YuvColorSpace::Bt601);
        // HD resolution -> BT.709
        assert_eq!(YuvColorSpace::from_resolution(1920, 1080), YuvColorSpace::Bt709);
        // 4K resolution -> BT.2020
        assert_eq!(YuvColorSpace::from_resolution(3840, 2160), YuvColorSpace::Bt2020);
    }

    #[test]
    fn test_shared_buffer() {
        let mut buffer = SharedTextureBuffer::new(1920, 1080, TextureFormat::Rgba8);
        assert_eq!(buffer.dimensions(), (1920, 1080));
        assert_eq!(buffer.generation(), 0);

        let data = vec![255u8; 1920 * 1080 * 4];
        buffer.update(&data);
        assert_eq!(buffer.generation(), 1);
    }
}
