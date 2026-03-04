//! Effects service implementation

use crate::error::{Error, Result};
use crate::gpu::custom_shader_processor::{CustomShaderProcessor, ParamDef, PresetShaderMeta};
use crate::gpu::GpuContext;
use crate::services::effects::IEffectsService;
use std::sync::{Arc, Mutex};

/// Effects service — wraps `CustomShaderProcessor` for the API layer.
pub struct EffectsService {
    processor: Mutex<CustomShaderProcessor>,
}

impl EffectsService {
    /// Create a new EffectsService (requires GPU).
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Result<Self> {
        let processor = CustomShaderProcessor::new(gpu_ctx)?;
        Ok(Self {
            processor: Mutex::new(processor),
        })
    }
}

impl IEffectsService for EffectsService {
    fn list_presets(&self) -> Vec<PresetShaderMeta> {
        let proc = self
            .processor
            .lock()
            .map_err(|e| Error::GpuError(format!("Failed to acquire processor lock: {}", e)));
        match proc {
            Ok(p) => p.list_all().into_iter().cloned().collect(),
            Err(_) => Vec::new(),
        }
    }

    fn get_shader_info(&self, shader_id: &str) -> Option<PresetShaderMeta> {
        let proc = self
            .processor
            .lock()
            .map_err(|e| Error::GpuError(format!("Failed to acquire processor lock: {}", e)));
        match proc {
            Ok(p) => p.get_shader_info(shader_id).cloned(),
            Err(_) => None,
        }
    }

    fn apply_effect(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        shader_id: &str,
        params: &serde_json::Value,
    ) -> Result<Vec<u8>> {
        let proc = self
            .processor
            .lock()
            .map_err(|e| Error::GpuError(format!("Failed to acquire processor lock: {}", e)))?;
        proc.apply(input, width, height, shader_id, params)
    }

    fn register_shader(
        &self,
        id: &str,
        wgsl_source: &str,
        param_defs: Vec<ParamDef>,
    ) -> Result<()> {
        let mut proc = self
            .processor
            .lock()
            .map_err(|e| Error::GpuError(format!("Failed to acquire processor lock: {}", e)))?;
        proc.register_custom_shader(id, wgsl_source, param_defs)
    }
}
