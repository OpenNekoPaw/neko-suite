//! Reusable render target pool for scene RenderGraph textures.
//!
//! The pool is intentionally scoped to the scene renderer. Public outputs can
//! still consume a texture permanently, while transient render targets return to
//! the pool on drop.

use std::collections::HashMap;
use std::ops::Deref;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RenderTargetPoolSnapshot {
    pub texture_allocations: u64,
    pub pooled_textures: usize,
    pub active_leases: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct RenderTargetKey {
    width: u32,
    height: u32,
    format: wgpu::TextureFormat,
    usage_bits: u32,
}

impl RenderTargetKey {
    fn new(
        width: u32,
        height: u32,
        format: wgpu::TextureFormat,
        usage: wgpu::TextureUsages,
    ) -> Self {
        Self {
            width,
            height,
            format,
            usage_bits: usage.bits(),
        }
    }

    fn usage(self) -> wgpu::TextureUsages {
        wgpu::TextureUsages::from_bits_truncate(self.usage_bits)
    }
}

#[derive(Debug, Default)]
struct RenderTargetPoolInner {
    available: HashMap<RenderTargetKey, Vec<wgpu::Texture>>,
    texture_allocations: u64,
    active_leases: usize,
}

impl RenderTargetPoolInner {
    fn release(&mut self, key: RenderTargetKey, texture: wgpu::Texture) {
        self.active_leases = self.active_leases.saturating_sub(1);
        self.available.entry(key).or_default().push(texture);
    }

    fn consume(&mut self) {
        self.active_leases = self.active_leases.saturating_sub(1);
    }

    fn snapshot(&self) -> RenderTargetPoolSnapshot {
        RenderTargetPoolSnapshot {
            texture_allocations: self.texture_allocations,
            pooled_textures: self.available.values().map(Vec::len).sum(),
            active_leases: self.active_leases,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct RenderTargetPool {
    inner: Arc<Mutex<RenderTargetPoolInner>>,
}

impl RenderTargetPool {
    pub fn acquire(
        &self,
        device: &wgpu::Device,
        label: &str,
        width: u32,
        height: u32,
        format: wgpu::TextureFormat,
        usage: wgpu::TextureUsages,
    ) -> RenderTargetLease {
        let key = RenderTargetKey::new(width, height, format, usage);
        let texture = {
            let mut inner = self.inner.lock().expect("render target pool lock poisoned");
            inner.active_leases = inner.active_leases.saturating_add(1);
            if let Some(texture) = inner.available.get_mut(&key).and_then(Vec::pop) {
                texture
            } else {
                inner.texture_allocations = inner.texture_allocations.saturating_add(1);
                drop(inner);
                device.create_texture(&wgpu::TextureDescriptor {
                    label: Some(label),
                    size: wgpu::Extent3d {
                        width,
                        height,
                        depth_or_array_layers: 1,
                    },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format,
                    usage: key.usage(),
                    view_formats: &[],
                })
            }
        };

        RenderTargetLease {
            texture: Some(texture),
            pool: Some(Arc::clone(&self.inner)),
            key,
        }
    }

    pub fn snapshot(&self) -> RenderTargetPoolSnapshot {
        self.inner
            .lock()
            .expect("render target pool lock poisoned")
            .snapshot()
    }
}

#[derive(Debug)]
pub struct RenderTargetLease {
    texture: Option<wgpu::Texture>,
    pool: Option<Arc<Mutex<RenderTargetPoolInner>>>,
    key: RenderTargetKey,
}

impl RenderTargetLease {
    pub fn create_view(&self, desc: &wgpu::TextureViewDescriptor<'_>) -> wgpu::TextureView {
        self.texture().create_view(desc)
    }

    pub fn format(&self) -> wgpu::TextureFormat {
        self.texture().format()
    }

    pub fn into_texture(mut self) -> wgpu::Texture {
        let texture = self
            .texture
            .take()
            .expect("render target lease already consumed");
        if let Some(pool) = self.pool.take() {
            if let Ok(mut inner) = pool.lock() {
                inner.consume();
            }
        }
        texture
    }

    fn texture(&self) -> &wgpu::Texture {
        self.texture
            .as_ref()
            .expect("render target lease already consumed")
    }
}

impl AsRef<wgpu::Texture> for RenderTargetLease {
    fn as_ref(&self) -> &wgpu::Texture {
        self.texture()
    }
}

impl Deref for RenderTargetLease {
    type Target = wgpu::Texture;

    fn deref(&self) -> &Self::Target {
        self.texture()
    }
}

impl Drop for RenderTargetLease {
    fn drop(&mut self) {
        let Some(texture) = self.texture.take() else {
            return;
        };
        let Some(pool) = self.pool.take() else {
            return;
        };
        if let Ok(mut inner) = pool.lock() {
            inner.release(self.key, texture);
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_pool_snapshot_is_zeroed() {
        let pool = RenderTargetPool::default();
        assert_eq!(
            pool.snapshot(),
            RenderTargetPoolSnapshot {
                texture_allocations: 0,
                pooled_textures: 0,
                active_leases: 0,
            }
        );
    }
}
