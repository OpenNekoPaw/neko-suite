//! ImageService implementation
//!
//! Provides image-related operations: probing and capture.

use crate::decoder::{Decoder, HwAccelDecoder, HwAccelType};
use crate::domain::{CaptureOptions, FrameData};
use crate::error::{Error, Result};
use crate::gpu::{ColorSpace, GpuContext, Nv12Renderer, Nv12TextureImporter};
use crate::media_service::{encode_rgba_to_jpeg, probe_media_info};
use crate::services::IImageService;
use neko_types::{FrameFormat, MediaInfo, ResourceId};
use std::path::Path;
use std::sync::Arc;

/// ImageService implementation
///
/// Wraps decoder and GPU pipeline for image probing and capture.
/// Images are treated as single-frame media (time = 0.0).
pub struct ImageService {
    /// GPU context for hardware acceleration
    gpu_ctx: Option<Arc<GpuContext>>,
}

impl ImageService {
    /// Create a new ImageService
    pub fn new(gpu_ctx: Option<Arc<GpuContext>>) -> Self {
        Self { gpu_ctx }
    }

    /// Convert internal MediaInfo to neko_types::MediaInfo
    fn convert_media_info(info: crate::media_service::MediaInfo) -> MediaInfo {
        MediaInfo {
            duration: info.duration,
            format: info.format,
            file_size: 0,
            video_streams: vec![neko_types::VideoStreamInfo {
                index: 0,
                codec: info.codec,
                width: info.width,
                height: info.height,
                fps: info.fps,
                bitrate: info.bitrate,
                pixel_format: "yuv420p".to_string(),
                hw_accel: None,
                frame_count: None,
                color_space: None,
                color_range: None,
            }],
            audio_streams: if info.has_audio {
                vec![neko_types::AudioStreamInfo {
                    index: 0,
                    codec: info.audio_codec.unwrap_or_default(),
                    sample_rate: info.audio_sample_rate.unwrap_or(0),
                    channels: info.audio_channels.unwrap_or(0) as u16,
                    bitrate: info.audio_bitrate,
                    channel_layout: None,
                    language: None,
                }]
            } else {
                vec![]
            },
            subtitle_streams: info
                .subtitle_streams
                .into_iter()
                .map(|s| neko_types::SubtitleStreamInfo {
                    index: s.index,
                    codec: s.codec,
                    language: s.language,
                    title: s.title,
                })
                .collect(),
        }
    }

    /// Read texture data back to CPU buffer
    fn read_texture_to_buffer(
        ctx: &GpuContext,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        let device = ctx.device();
        let queue = ctx.queue();

        let bytes_per_row = width * 4;
        let padded_bytes_per_row = (bytes_per_row + 255) & !255;

        let buffer_size = (padded_bytes_per_row * height) as u64;
        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Image Texture Readback Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Image Texture Readback Encoder"),
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

        queue.submit(std::iter::once(encoder.finish()));

        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });

        device.poll(wgpu::Maintain::Wait);
        rx.recv()
            .map_err(|_| Error::Other("Buffer map channel closed".to_string()))?
            .map_err(|e| Error::Other(format!("Buffer map error: {:?}", e)))?;

        let data = buffer_slice.get_mapped_range();

        let result = if padded_bytes_per_row == bytes_per_row {
            data.to_vec()
        } else {
            let mut result = Vec::with_capacity((width * height * 4) as usize);
            for row in 0..height {
                let start = (row * padded_bytes_per_row) as usize;
                let end = start + bytes_per_row as usize;
                result.extend_from_slice(&data[start..end]);
            }
            result
        };

        drop(data);
        staging_buffer.unmap();

        Ok(result)
    }
}

impl IImageService for ImageService {
    async fn probe(&self, path: &Path) -> Result<MediaInfo> {
        let path = path.to_path_buf();
        let info = tokio::task::spawn_blocking(move || probe_media_info(&path))
            .await
            .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        Ok(Self::convert_media_info(info))
    }

    async fn capture(
        &self,
        resource_id: &ResourceId,
        options: CaptureOptions,
    ) -> Result<FrameData> {
        let path = resource_id.as_str().to_string();
        let gpu_ctx = self.gpu_ctx.clone();
        let quality = options.quality;
        let format = options.format;

        let result = tokio::task::spawn_blocking(move || -> Result<FrameData> {
            let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);

            let media_info = decoder.open(&path)?;
            let width = media_info.width;
            let height = media_info.height;

            // Images are single-frame, decode at time 0.0
            let gpu_texture = decoder
                .decode_gpu_at(0.0)?
                .ok_or_else(|| Error::Other("No frame in image".to_string()))?;

            if let Some(ctx) = gpu_ctx {
                let importer = Nv12TextureImporter::new(Arc::clone(&ctx));
                let nv12_texture = importer.import(&gpu_texture)?;

                let renderer = Nv12Renderer::new(Arc::clone(&ctx))?;
                let output_texture = renderer.create_output_texture(width, height);
                let output_view =
                    output_texture.create_view(&wgpu::TextureViewDescriptor::default());
                renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

                let rgba_data =
                    Self::read_texture_to_buffer(&ctx, &output_texture, width, height)?;

                let (data, output_format) = match format {
                    FrameFormat::Jpeg => {
                        let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)?;
                        (jpeg_data, FrameFormat::Jpeg)
                    }
                    FrameFormat::Rgba => (rgba_data, FrameFormat::Rgba),
                    _ => {
                        let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)?;
                        (jpeg_data, FrameFormat::Jpeg)
                    }
                };

                Ok(FrameData {
                    data,
                    width,
                    height,
                    format: output_format,
                    timestamp: 0.0,
                })
            } else {
                Err(Error::Other(
                    "GPU context required for capture".to_string(),
                ))
            }
        })
        .await
        .map_err(|e| Error::Other(format!("Capture task failed: {}", e)))??;

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_service() -> ImageService {
        ImageService::new(None)
    }

    #[tokio::test]
    async fn test_image_service_probe_nonexistent() {
        let service = create_test_service();
        let result = service.probe(Path::new("/nonexistent/file.png")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_image_service_capture_no_gpu() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.png".to_string());
        let options = CaptureOptions::default();
        let result = service.capture(&resource_id, options).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_image_service_trait_object() {
        fn _assert_impl<T: IImageService>() {}
        _assert_impl::<ImageService>();
    }
}
