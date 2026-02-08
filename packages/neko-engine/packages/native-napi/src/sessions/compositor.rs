//! Compositor session class - CompositorSession

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Arc, Mutex};

use crate::types::{JsCompositeLayer, JsCompositeResult};
use neko_native_core::gpu::{GpuCompositor, GpuContext};

/// GPU compositor session for multi-layer compositing
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct CompositorSession {
    compositor: Mutex<GpuCompositor>,
}

#[napi]
impl CompositorSession {
    /// Create a new compositor session
    #[napi(factory)]
    pub async fn create() -> Result<Self> {
        // Initialize GPU context
        let gpu_ctx = GpuContext::new()
            .await
            .map_err(|e| Error::from_reason(format!("GPU initialization failed: {}", e)))?;

        let gpu_ctx = Arc::new(gpu_ctx);

        // Create GPU compositor
        let compositor = GpuCompositor::new(gpu_ctx)
            .map_err(|e| Error::from_reason(format!("Compositor creation failed: {}", e)))?;

        tracing::info!("CompositorSession created");

        Ok(Self {
            compositor: Mutex::new(compositor),
        })
    }

    /// Composite multiple layers into a single output
    #[napi]
    pub fn composite(
        &self,
        layers: Vec<JsCompositeLayer>,
        output_width: u32,
        output_height: u32,
        background_color: Option<Vec<f64>>,
    ) -> Result<JsCompositeResult> {
        let compositor = self
            .compositor
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock compositor"))?;

        // Convert layers
        let rust_layers: Vec<_> = layers.into_iter().map(Into::into).collect();

        // Parse background color
        let bg = background_color.unwrap_or_else(|| vec![0.0, 0.0, 0.0, 1.0]);
        let bg_color = [
            bg.first().copied().unwrap_or(0.0) as f32,
            bg.get(1).copied().unwrap_or(0.0) as f32,
            bg.get(2).copied().unwrap_or(0.0) as f32,
            bg.get(3).copied().unwrap_or(1.0) as f32,
        ];

        // Composite
        let result = compositor
            .composite(&rust_layers, output_width, output_height, bg_color)
            .map_err(|e| Error::from_reason(format!("Compositing failed: {}", e)))?;

        Ok(JsCompositeResult::from(result))
    }

    /// Composite a single layer (convenience method)
    #[napi]
    pub fn composite_single(
        &self,
        layer: JsCompositeLayer,
        output_width: u32,
        output_height: u32,
    ) -> Result<JsCompositeResult> {
        self.composite(vec![layer], output_width, output_height, None)
    }
}
