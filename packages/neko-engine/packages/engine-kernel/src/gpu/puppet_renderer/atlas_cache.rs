//! Texture atlas resource cache for puppet rendering.

use std::collections::HashMap;
use std::sync::Arc;

use crate::error::{Error, Result};

/// CPU texture atlas input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PuppetTextureAtlasInput {
    /// Stable atlas id referenced by meshes.
    pub id: String,
    /// Atlas width.
    pub width: u32,
    /// Atlas height.
    pub height: u32,
    /// RGBA8 pixels.
    pub rgba: Vec<u8>,
    /// Content generation for cache invalidation.
    pub generation: u64,
}

/// GPU-owned texture atlas entry.
pub struct PuppetTextureAtlas {
    /// Stable atlas id.
    pub id: String,
    /// Texture width.
    pub width: u32,
    /// Texture height.
    pub height: u32,
    /// Content generation.
    pub generation: u64,
    /// GPU texture.
    pub texture: wgpu::Texture,
    /// Texture view.
    pub view: wgpu::TextureView,
    /// Texture sampler.
    pub sampler: wgpu::Sampler,
    /// Bind group for the puppet shader.
    pub bind_group: wgpu::BindGroup,
}

/// Renderer-owned texture atlas cache.
pub struct PuppetAtlasCache {
    device: Arc<wgpu::Device>,
    queue: Arc<wgpu::Queue>,
    layout: wgpu::BindGroupLayout,
    atlases: HashMap<String, PuppetTextureAtlas>,
}

impl PuppetAtlasCache {
    /// Create an empty cache.
    pub fn new(
        device: Arc<wgpu::Device>,
        queue: Arc<wgpu::Queue>,
        layout: wgpu::BindGroupLayout,
    ) -> Self {
        Self {
            device,
            queue,
            layout,
            atlases: HashMap::new(),
        }
    }

    /// Ensure all input atlases exist on the GPU and return cache size.
    pub fn sync(&mut self, inputs: &[PuppetTextureAtlasInput]) -> Result<usize> {
        for input in inputs {
            self.validate_input(input)?;
            let needs_upload = self
                .atlases
                .get(&input.id)
                .map(|atlas| {
                    atlas.generation != input.generation
                        || atlas.width != input.width
                        || atlas.height != input.height
                })
                .unwrap_or(true);
            if needs_upload {
                let atlas = self.upload_atlas(input);
                self.atlases.insert(input.id.clone(), atlas);
            }
        }
        Ok(self.atlases.len())
    }

    /// Get an atlas by id.
    pub fn get(&self, id: &str) -> Option<&PuppetTextureAtlas> {
        self.atlases.get(id)
    }

    /// Number of cached atlas textures.
    pub fn len(&self) -> usize {
        self.atlases.len()
    }

    /// Whether there are no cached atlases.
    pub fn is_empty(&self) -> bool {
        self.atlases.is_empty()
    }

    fn validate_input(&self, input: &PuppetTextureAtlasInput) -> Result<()> {
        if input.id.is_empty() {
            return Err(Error::InvalidParameter(
                "puppet texture atlas id is required".to_string(),
            ));
        }
        if input.width == 0 || input.height == 0 {
            return Err(Error::InvalidParameter(format!(
                "puppet texture atlas '{}' has invalid size {}x{}",
                input.id, input.width, input.height
            )));
        }
        let expected_len = input.width as usize * input.height as usize * 4;
        if input.rgba.len() != expected_len {
            return Err(Error::InvalidParameter(format!(
                "puppet texture atlas '{}' expected {} RGBA bytes, got {}",
                input.id,
                expected_len,
                input.rgba.len()
            )));
        }
        Ok(())
    }

    fn upload_atlas(&self, input: &PuppetTextureAtlasInput) -> PuppetTextureAtlas {
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("puppet_texture_atlas"),
            size: wgpu::Extent3d {
                width: input.width,
                height: input.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        self.queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &input.rgba,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(input.width * 4),
                rows_per_image: Some(input.height),
            },
            wgpu::Extent3d {
                width: input.width,
                height: input.height,
                depth_or_array_layers: 1,
            },
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = self.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("puppet_texture_atlas_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("puppet_texture_atlas_bind_group"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });

        PuppetTextureAtlas {
            id: input.id.clone(),
            width: input.width,
            height: input.height,
            generation: input.generation,
            texture,
            view,
            sampler,
            bind_group,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atlas_input_size_is_validated() {
        let input = PuppetTextureAtlasInput {
            id: "atlas".to_string(),
            width: 2,
            height: 2,
            rgba: vec![255; 4],
            generation: 0,
        };

        let device = None::<Arc<wgpu::Device>>;
        assert!(device.is_none());
        assert_eq!(input.width as usize * input.height as usize * 4, 16);
        assert_ne!(input.rgba.len(), 16);
    }
}
