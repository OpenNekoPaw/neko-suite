//! GPU Context - wgpu device management

use crate::error::{Error, Result};
use crate::gpu::buffer_pool::BufferPool;
use std::sync::Arc;
use wgpu::BufferUsages;

/// GPU device information
#[derive(Debug, Clone)]
pub struct GpuInfo {
    /// Device name
    pub name: String,
    /// Vendor name
    pub vendor: String,
    /// Backend type (metal, vulkan, dx12, etc.)
    pub backend: String,
    /// Device type (discrete, integrated, etc.)
    pub device_type: String,
}

/// GPU context holding wgpu device and queue
pub struct GpuContext {
    /// wgpu adapter
    #[allow(dead_code)]
    adapter: wgpu::Adapter,
    /// wgpu device
    device: Arc<wgpu::Device>,
    /// wgpu queue
    queue: Arc<wgpu::Queue>,
    /// GPU information
    info: GpuInfo,
    /// Staging buffer pool for efficient GPU readback
    staging_buffer_pool: BufferPool,
}

impl GpuContext {
    /// Create a new GPU context
    pub async fn new() -> Result<Self> {
        // Create wgpu instance with all backends
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
            flags: wgpu::InstanceFlags::default(),
            gles_minor_version: wgpu::Gles3MinorVersion::Automatic,
        });

        // Request high-performance adapter
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| Error::GpuInit("No suitable GPU adapter found".to_string()))?;

        // Get adapter info
        let adapter_info = adapter.get_info();
        let info = GpuInfo {
            name: adapter_info.name.clone(),
            vendor: format!("{:?}", adapter_info.vendor),
            backend: format!("{:?}", adapter_info.backend),
            device_type: format!("{:?}", adapter_info.device_type),
        };

        tracing::info!(
            "GPU initialized: {} ({:?})",
            adapter_info.name,
            adapter_info.backend
        );

        // Request device with default limits
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("MediaProcessor Device"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                },
                None,
            )
            .await?;

        // Set up error handler
        device.on_uncaptured_error(Box::new(|error| {
            tracing::error!("GPU uncaptured error: {:?}", error);
        }));

        let device = Arc::new(device);
        let queue = Arc::new(queue);

        // Create staging buffer pool for efficient GPU readback
        // Usage: MAP_READ | COPY_DST for reading GPU data back to CPU
        let staging_buffer_pool = BufferPool::new(
            device.clone(),
            BufferUsages::MAP_READ | BufferUsages::COPY_DST,
            16, // Keep up to 16 staging buffers
        );

        Ok(Self {
            adapter,
            device,
            queue,
            info,
            staging_buffer_pool,
        })
    }

    /// Get GPU information
    pub fn info(&self) -> &GpuInfo {
        &self.info
    }

    /// Get wgpu device
    pub fn device(&self) -> &Arc<wgpu::Device> {
        &self.device
    }

    /// Get wgpu queue
    pub fn queue(&self) -> &Arc<wgpu::Queue> {
        &self.queue
    }

    /// Create a storage buffer with initial data
    pub fn create_buffer_with_data(&self, data: &[u8], usage: wgpu::BufferUsages) -> wgpu::Buffer {
        use wgpu::util::DeviceExt;
        self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Storage Buffer"),
            contents: data,
            usage: usage | wgpu::BufferUsages::COPY_DST,
        })
    }

    /// Create an empty buffer
    pub fn create_buffer(&self, size: u64, usage: wgpu::BufferUsages) -> wgpu::Buffer {
        self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Buffer"),
            size,
            usage,
            mapped_at_creation: false,
        })
    }

    /// Read buffer contents back to CPU
    pub async fn read_buffer(&self, buffer: &wgpu::Buffer) -> Result<Vec<u8>> {
        let size = buffer.size();

        // Create staging buffer for readback
        let staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Staging Buffer"),
            size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Copy to staging buffer
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Read Buffer Encoder"),
            });
        encoder.copy_buffer_to_buffer(buffer, 0, &staging_buffer, 0, size);
        self.queue.submit(Some(encoder.finish()));

        // Map and read
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = tokio::sync::oneshot::channel();

        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });

        self.device.poll(wgpu::Maintain::Wait);

        rx.await
            .map_err(|_| Error::BufferError("Channel closed".to_string()))?
            .map_err(|e| Error::BufferError(format!("Map failed: {:?}", e)))?;

        let data = buffer_slice.get_mapped_range().to_vec();
        staging_buffer.unmap();

        Ok(data)
    }

    /// Read texture contents back to CPU synchronously
    ///
    /// Automatically detects the texture format and uses the correct bytes-per-pixel.
    /// For Rgba8Unorm: 4 bytes/pixel. For Rgba16Float: 8 bytes/pixel. Etc.
    pub fn read_texture_sync(
        &self,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        let bytes_per_pixel = texture.format().block_copy_size(None).unwrap_or(4);
        let bytes_per_row = width * bytes_per_pixel;
        // wgpu requires rows to be aligned to 256 bytes
        let padded_bytes_per_row = (bytes_per_row + 255) & !255;
        let buffer_size = (padded_bytes_per_row * height) as u64;

        let staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Texture Readback Staging"),
            size: buffer_size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Texture Readback Encoder"),
            });

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &staging_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        self.queue.submit(std::iter::once(encoder.finish()));

        // Map and read synchronously
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();

        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });

        self.device.poll(wgpu::Maintain::Wait);

        rx.recv()
            .map_err(|_| Error::BufferError("Channel closed".to_string()))?
            .map_err(|e| Error::BufferError(format!("Map failed: {:?}", e)))?;

        // Copy data, stripping row padding if needed
        let mapped = buffer_slice.get_mapped_range();
        let data = if padded_bytes_per_row == bytes_per_row {
            mapped.to_vec()
        } else {
            let mut result = Vec::with_capacity((bytes_per_row * height) as usize);
            for row in 0..height {
                let start = (row * padded_bytes_per_row) as usize;
                let end = start + bytes_per_row as usize;
                result.extend_from_slice(&mapped[start..end]);
            }
            result
        };

        drop(mapped);
        staging_buffer.unmap();

        Ok(data)
    }

    /// Synchronous version of read_buffer using pollster
    /// Uses pooled staging buffers to reduce allocation overhead
    pub fn read_buffer_sync(&self, buffer: &wgpu::Buffer) -> Result<Vec<u8>> {
        let size = buffer.size();

        // Acquire staging buffer from pool (avoids per-call allocation)
        let pooled_staging = self.staging_buffer_pool.acquire(size);
        let staging_buffer = pooled_staging.buffer();

        // Copy to staging buffer
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Read Buffer Encoder"),
            });
        encoder.copy_buffer_to_buffer(buffer, 0, staging_buffer, 0, size);
        self.queue.submit(Some(encoder.finish()));

        // Map and read synchronously
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();

        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });

        self.device.poll(wgpu::Maintain::Wait);

        rx.recv()
            .map_err(|_| Error::BufferError("Channel closed".to_string()))?
            .map_err(|e| Error::BufferError(format!("Map failed: {:?}", e)))?;

        let data = buffer_slice.get_mapped_range().to_vec();
        staging_buffer.unmap();

        // pooled_staging is dropped here, returning buffer to pool

        Ok(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_context_creation() {
        // This test requires a GPU, skip in CI
        if std::env::var("CI").is_ok() {
            return;
        }

        let ctx = pollster::block_on(GpuContext::new());
        assert!(ctx.is_ok(), "GPU context creation failed: {:?}", ctx.err());

        let ctx = ctx.unwrap();
        assert!(!ctx.info().name.is_empty());
    }
}
