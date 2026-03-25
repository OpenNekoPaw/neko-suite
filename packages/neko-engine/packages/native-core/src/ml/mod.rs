//! ML inference module — ONNX Runtime model management and inference pipelines.
//!
//! # Architecture
//! - `ModelRegistry` — in-memory model registry with lazy load + LRU eviction
//! - `onnx_runtime` — ort Session wrapper with device selection
//! - Task modules (upscale, denoise, clip, whisper) — domain-specific inference pipelines
//!
//! Gated behind `onnx` feature flag.

pub mod clip;
pub mod denoise;
pub mod onnx_runtime;
pub mod upscale;
pub mod whisper;

use ort::session::Session;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use crate::error::{Error, Result};

// =============================================================================
// Model Info (metadata for registered models)
// =============================================================================

/// Metadata for a registered model (not yet loaded).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub framework: String,
    pub task: String,
}

// =============================================================================
// Loaded Model (ort Session + usage tracking)
// =============================================================================

/// A loaded ONNX model session with usage tracking for LRU eviction.
pub struct LoadedModel {
    pub info: ModelInfo,
    pub session: Session,
    pub last_used: Instant,
}

// =============================================================================
// Model Registry
// =============================================================================

/// In-memory model registry with lazy loading and LRU eviction.
pub struct ModelRegistry {
    models: Mutex<HashMap<String, ModelInfo>>,
    loaded: Mutex<HashMap<String, LoadedModel>>,
    max_loaded: usize,
}

impl ModelRegistry {
    pub fn new(max_loaded: usize) -> Self {
        Self {
            models: Mutex::new(HashMap::new()),
            loaded: Mutex::new(HashMap::new()),
            max_loaded,
        }
    }

    pub fn register(&self, info: ModelInfo) -> Result<()> {
        let path = PathBuf::from(&info.path);
        if !path.exists() {
            return Err(Error::FileNotFound(info.path.clone()));
        }
        let mut models = self
            .models
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
        models.insert(info.name.clone(), info);
        Ok(())
    }

    pub fn unregister(&self, name: &str) -> Result<()> {
        let mut models = self
            .models
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
        models.remove(name);

        let mut loaded = self
            .loaded
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
        loaded.remove(name);
        Ok(())
    }

    pub fn list(&self) -> Vec<ModelInfo> {
        let models = self.models.lock().unwrap_or_else(|e| e.into_inner());
        models.values().cloned().collect()
    }

    /// Ensure model is loaded. Evicts LRU if at capacity.
    pub fn get_or_load(&self, name: &str, device: &onnx_runtime::DeviceSelection) -> Result<()> {
        {
            let mut loaded = self
                .loaded
                .lock()
                .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
            if let Some(model) = loaded.get_mut(name) {
                model.last_used = Instant::now();
                return Ok(());
            }
        }

        let info = {
            let models = self
                .models
                .lock()
                .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
            models
                .get(name)
                .cloned()
                .ok_or_else(|| Error::NotFound(format!("Model '{}' not registered", name)))?
        };

        self.evict_lru_if_needed()?;

        let session = onnx_runtime::create_session(&info.path, device)?;

        let loaded_model = LoadedModel {
            info: info.clone(),
            session,
            last_used: Instant::now(),
        };

        let mut loaded = self
            .loaded
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
        loaded.insert(name.to_string(), loaded_model);
        Ok(())
    }

    /// Access a loaded model's session for inference (mutable — ort requires &mut self for run).
    pub fn with_session<F, R>(&self, name: &str, f: F) -> Result<R>
    where
        F: FnOnce(&mut Session) -> Result<R>,
    {
        let mut loaded = self
            .loaded
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
        let model = loaded
            .get_mut(name)
            .ok_or_else(|| Error::NotFound(format!("Model '{}' not loaded", name)))?;
        model.last_used = Instant::now();
        f(&mut model.session)
    }

    fn evict_lru_if_needed(&self) -> Result<()> {
        let mut loaded = self
            .loaded
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;

        while loaded.len() >= self.max_loaded {
            let lru_name = loaded
                .iter()
                .min_by_key(|(_, m)| m.last_used)
                .map(|(name, _)| name.clone());

            if let Some(name) = lru_name {
                tracing::info!(model = %name, "Evicting LRU model");
                loaded.remove(&name);
            } else {
                break;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_list() {
        let registry = ModelRegistry::new(3);
        let info = ModelInfo {
            name: "test".to_string(),
            path: ".".to_string(),
            framework: "onnx".to_string(),
            task: "upscale".to_string(),
        };
        registry.register(info).unwrap();
        assert_eq!(registry.list().len(), 1);
    }

    #[test]
    fn test_register_nonexistent_path() {
        let registry = ModelRegistry::new(3);
        let info = ModelInfo {
            name: "bad".to_string(),
            path: "/nonexistent/model.onnx".to_string(),
            framework: "onnx".to_string(),
            task: "upscale".to_string(),
        };
        assert!(registry.register(info).is_err());
    }

    #[test]
    fn test_unregister() {
        let registry = ModelRegistry::new(3);
        let info = ModelInfo {
            name: "m1".to_string(),
            path: ".".to_string(),
            framework: "onnx".to_string(),
            task: "upscale".to_string(),
        };
        registry.register(info).unwrap();
        registry.unregister("m1").unwrap();
        assert_eq!(registry.list().len(), 0);
    }
}
