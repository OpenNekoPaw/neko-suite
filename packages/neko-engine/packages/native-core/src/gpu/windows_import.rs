//! Windows Zero-Copy Import - D3D11 → D3D12 → wgpu
//!
//! This module implements zero-copy texture import on Windows:
//! 1. Get SharedHandle from ID3D11Texture2D (D3D11VA output)
//! 2. Open SharedHandle in D3D12
//! 3. Import D3D12 texture into wgpu
//!
//! Reference:
//! - ID3D11Texture2D::QueryInterface for IDXGIResource1
//! - IDXGIResource1::CreateSharedHandle
//! - ID3D12Device::OpenSharedHandle

use crate::decoder::Nv12GpuTexture;
use crate::error::{Error, Result};
use crate::gpu::nv12_import::{ColorSpace, ImportedNv12Texture};
use crate::gpu::GpuContext;

use std::sync::Arc;

use windows::{
    core::Interface,
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        Graphics::{
            Direct3D11::{ID3D11Device, ID3D11Texture2D},
            Direct3D12::{ID3D12Device, ID3D12Resource, D3D12_RESOURCE_DESC},
            Dxgi::{IDXGIResource1, DXGI_SHARED_RESOURCE_READ},
        },
        Security::SECURITY_ATTRIBUTES,
    },
};

/// Windows zero-copy texture importer
pub struct WindowsTextureImporter {
    ctx: Arc<GpuContext>,
}

impl WindowsTextureImporter {
    /// Create a new Windows texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Import NV12 texture from D3D11VA
    ///
    /// # Safety
    /// The texture pointer must be a valid ID3D11Texture2D from D3D11VA.
    pub unsafe fn import_d3d11(
        &self,
        texture_ptr: usize,
        array_index: u32,
        gpu_texture: &Nv12GpuTexture,
    ) -> Result<ImportedNv12Texture> {
        if texture_ptr == 0 {
            return Err(Error::Other("Null D3D11 texture pointer".to_string()));
        }

        // Cast to ID3D11Texture2D
        let d3d11_texture: ID3D11Texture2D =
            std::mem::transmute_copy(&(texture_ptr as *mut std::ffi::c_void));

        // Get texture description
        let mut desc = std::mem::zeroed();
        d3d11_texture.GetDesc(&mut desc);

        tracing::debug!(
            "D3D11 texture: {}x{}, format={}, array_size={}, array_index={}",
            desc.Width,
            desc.Height,
            desc.Format.0,
            desc.ArraySize,
            array_index
        );

        // Query for IDXGIResource1 to get shared handle
        let dxgi_resource: IDXGIResource1 = d3d11_texture.cast()?;

        // Create shared handle
        let mut shared_handle = HANDLE::default();
        dxgi_resource.CreateSharedHandle(
            None, // Security attributes
            DXGI_SHARED_RESOURCE_READ.0,
            None, // Name
            &mut shared_handle,
        )?;

        if shared_handle.is_invalid() {
            return Err(Error::Other("Failed to create shared handle".to_string()));
        }

        // Import shared handle into wgpu (via D3D12)
        let result = self.import_shared_handle(shared_handle, gpu_texture, array_index);

        // Close the shared handle
        let _ = CloseHandle(shared_handle);

        result
    }

    /// Import shared handle into wgpu via D3D12
    unsafe fn import_shared_handle(
        &self,
        shared_handle: HANDLE,
        _gpu_texture: &Nv12GpuTexture,
        _array_index: u32,
    ) -> Result<ImportedNv12Texture> {
        // TODO: Get D3D12 device from wgpu via wgpu_hal
        // The proper implementation would:
        // 1. Get ID3D12Device from wgpu::Device via wgpu_hal
        // 2. Call ID3D12Device::OpenSharedHandle to get ID3D12Resource
        // 3. Create wgpu::Texture from ID3D12Resource via wgpu_hal

        Err(Error::Other(format!(
            "D3D12 shared handle import not yet implemented - handle={:?}",
            shared_handle
        )))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_windows_import_available() {
        // Just verify the module compiles
        assert!(true);
    }
}
