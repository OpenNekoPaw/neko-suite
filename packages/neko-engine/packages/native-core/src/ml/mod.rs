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

    /// Unload sessions that have not been used for `idle_secs` seconds.
    ///
    /// Called after each inference to reclaim GPU/CPU memory from idle models.
    /// Sessions are dropped here (RAII), which releases ONNX Runtime resources.
    pub fn evict_idle(&self, idle_secs: u64) -> Result<()> {
        let threshold = std::time::Duration::from_secs(idle_secs);
        let mut loaded = self
            .loaded
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;

        let now = std::time::Instant::now();
        let stale: Vec<String> = loaded
            .iter()
            .filter(|(_, m)| now.duration_since(m.last_used) >= threshold)
            .map(|(name, _)| name.clone())
            .collect();

        for name in stale {
            tracing::info!(model = %name, idle_secs, "Evicting idle model");
            loaded.remove(&name);
        }
        Ok(())
    }
}

// =============================================================================
// Test helpers (test builds only)
// =============================================================================

#[cfg(test)]
impl ModelRegistry {
    /// Number of currently-loaded sessions.
    pub fn loaded_count(&self) -> usize {
        self.loaded.lock().unwrap().len()
    }

    /// Load an ONNX model from raw bytes without going through the file-based
    /// registry. Requires the ort dynamic library to be present at runtime.
    pub fn load_from_memory_for_test(&self, name: &str, bytes: &[u8]) -> Result<()> {
        let session = ort::session::Session::builder()
            .map_err(|e| Error::Other(e.to_string()))?
            .commit_from_memory(bytes)
            .map_err(|e| Error::Other(e.to_string()))?;
        let mut loaded = self
            .loaded
            .lock()
            .map_err(|e| Error::Other(format!("Lock error: {}", e)))?;
        loaded.insert(
            name.to_string(),
            LoadedModel {
                info: ModelInfo {
                    name: name.to_string(),
                    path: "<memory>".to_string(),
                    framework: "onnx".to_string(),
                    task: "test".to_string(),
                },
                session,
                last_used: Instant::now(),
            },
        );
        Ok(())
    }

    /// Backdate `last_used` for a loaded model (eviction timing tests).
    pub fn set_last_used_for_test(&self, name: &str, time: Instant) {
        if let Ok(mut loaded) = self.loaded.lock() {
            if let Some(m) = loaded.get_mut(name) {
                m.last_used = time;
            }
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------------------
    // Registry: register / list / unregister
    // ------------------------------------------------------------------

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

    // ------------------------------------------------------------------
    // evict_idle — timing logic
    // ------------------------------------------------------------------

    /// Minimal ONNX Identity model (52 bytes):
    ///   ir_version=7, opset=17, graph: float x → Identity → float y
    const MINIMAL_ONNX: &[u8] = &[
        0x08, 0x07, 0x42, 0x04, 0x0a, 0x00, 0x10, 0x11, 0x3a, 0x2a, 0x0a,
        0x12, 0x0a, 0x01, 0x78, 0x12, 0x01, 0x79, 0x22, 0x08, 0x49, 0x64,
        0x65, 0x6e, 0x74, 0x69, 0x74, 0x79, 0x2a, 0x00, 0x5a, 0x09, 0x0a,
        0x01, 0x78, 0x12, 0x04, 0x0a, 0x02, 0x08, 0x01, 0x62, 0x09, 0x0a,
        0x01, 0x79, 0x12, 0x04, 0x0a, 0x02, 0x08, 0x01,
    ];

    /// evict_idle on an empty registry is always a no-op.
    #[test]
    fn test_evict_idle_empty_registry() {
        let registry = ModelRegistry::new(3);
        assert!(registry.evict_idle(300).is_ok());
        assert_eq!(registry.loaded_count(), 0);
    }

    /// A session backdated beyond the threshold must be evicted.
    ///
    /// Requires `ORT_DYLIB_PATH` (or the ort dynamic library on the system
    /// library path) to load the embedded minimal ONNX model.
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH or libonnxruntime installed"]
    fn test_evict_idle_removes_stale_sessions() {
        let registry = ModelRegistry::new(3);
        registry
            .load_from_memory_for_test("stale", MINIMAL_ONNX)
            .expect("load minimal ONNX");
        assert_eq!(registry.loaded_count(), 1);

        // Backdate last_used to 400 s ago — beyond the 300 s threshold.
        let past = Instant::now() - std::time::Duration::from_secs(400);
        registry.set_last_used_for_test("stale", past);

        registry.evict_idle(300).unwrap();
        assert_eq!(registry.loaded_count(), 0, "stale session must be evicted");
    }

    /// A session used recently must survive eviction.
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH or libonnxruntime installed"]
    fn test_evict_idle_keeps_fresh_sessions() {
        let registry = ModelRegistry::new(3);
        registry
            .load_from_memory_for_test("fresh", MINIMAL_ONNX)
            .expect("load minimal ONNX");
        assert_eq!(registry.loaded_count(), 1);

        // last_used defaults to now — well within the 300 s threshold.
        registry.evict_idle(300).unwrap();
        assert_eq!(registry.loaded_count(), 1, "fresh session must be kept");
    }

    /// Mixed: stale session is evicted, fresh session is kept.
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH or libonnxruntime installed"]
    fn test_evict_idle_mixed() {
        let registry = ModelRegistry::new(4);
        registry
            .load_from_memory_for_test("stale", MINIMAL_ONNX)
            .expect("load minimal ONNX for stale");
        registry
            .load_from_memory_for_test("fresh", MINIMAL_ONNX)
            .expect("load minimal ONNX for fresh");
        assert_eq!(registry.loaded_count(), 2);

        let past = Instant::now() - std::time::Duration::from_secs(400);
        registry.set_last_used_for_test("stale", past);

        registry.evict_idle(300).unwrap();
        assert_eq!(registry.loaded_count(), 1, "only fresh session must remain");
    }
}
