//! ML service implementation — wraps ModelRegistry + inference pipelines.

use crate::error::Result;
use crate::ml::onnx_runtime::DeviceSelection;
use crate::ml::{self, ModelInfo, ModelRegistry};
use crate::services::ml::IMlService;

/// ML service — manages ONNX model registry and dispatches inference tasks.
pub struct MlService {
    registry: ModelRegistry,
    device: DeviceSelection,
}

impl MlService {
    pub fn new(max_loaded: usize, device: DeviceSelection) -> Self {
        Self {
            registry: ModelRegistry::new(max_loaded),
            device,
        }
    }
}

impl IMlService for MlService {
    fn register_model(&self, name: &str, path: &str, framework: &str, task: &str) -> Result<()> {
        self.registry.register(ModelInfo {
            name: name.to_string(),
            path: path.to_string(),
            framework: framework.to_string(),
            task: task.to_string(),
        })
    }

    fn unregister_model(&self, name: &str) -> Result<()> {
        self.registry.unregister(name)
    }

    fn list_models(&self) -> Vec<serde_json::Value> {
        self.registry
            .list()
            .into_iter()
            .map(|info| serde_json::to_value(&info).unwrap_or_default())
            .collect()
    }

    fn upscale(&self, model: &str, input: &str, output: &str, scale: u32) -> Result<()> {
        self.registry.get_or_load(model, &self.device)?;
        self.registry
            .with_session(model, |session| ml::upscale::upscale(session, input, output, scale))
    }

    fn denoise(&self, model: &str, input: &str, output: &str, strength: f32) -> Result<()> {
        self.registry.get_or_load(model, &self.device)?;
        self.registry.with_session(model, |session| {
            ml::denoise::denoise(session, input, output, strength)
        })
    }

    fn clip_score(&self, _model: &str, _image: &str, _text: &str) -> Result<f32> {
        Err(crate::error::Error::Other(
            "CLIP score not yet implemented (requires dual-session model)".to_string(),
        ))
    }

    fn transcribe(&self, model: &str, audio: &str) -> Result<String> {
        self.registry.get_or_load(model, &self.device)?;
        self.registry.with_session(model, |session| {
            let result = ml::whisper::transcribe(session, audio, None)?;
            Ok(result.text)
        })
    }
}
