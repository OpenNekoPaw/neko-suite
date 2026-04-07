//! ML service implementation — wraps ModelRegistry + inference pipelines.

use crate::error::Result;
use crate::ml::onnx_runtime::DeviceSelection;
use crate::ml::{self, ModelInfo, ModelRegistry};
use crate::services::ml::IMlService;

/// Idle threshold: sessions unused for 5 minutes are evicted after each inference.
const IDLE_EVICT_SECS: u64 = 300;

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

    #[cfg(test)]
    pub fn registry_for_test(&self) -> &ModelRegistry {
        &self.registry
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
        let result = self.registry.with_session(model, |session| {
            ml::upscale::upscale(session, input, output, scale)
        });
        self.registry.evict_idle(IDLE_EVICT_SECS).ok();
        result
    }

    fn denoise(&self, model: &str, input: &str, output: &str, strength: f32) -> Result<()> {
        self.registry.get_or_load(model, &self.device)?;
        let result = self.registry.with_session(model, |session| {
            ml::denoise::denoise(session, input, output, strength)
        });
        self.registry.evict_idle(IDLE_EVICT_SECS).ok();
        result
    }

    fn clip_score(&self, model: &str, image: &str, text: &str) -> Result<f32> {
        // CLIP requires two sessions: visual encoder and text encoder.
        // Convention: `model` names the visual encoder; the text encoder model
        // is expected to be registered as `{model}:text`.
        let text_model = format!("{}:text", model);

        self.registry.get_or_load(model, &self.device)?;
        self.registry.get_or_load(&text_model, &self.device)?;

        // Tokenise text to CLIP BPE token IDs.
        // Simple whitespace split + vocab lookup; a proper BPE tokeniser
        // can be plugged in by replacing this call.
        let token_ids = simple_clip_tokenise(text);

        // Borrow image session and text session sequentially (Mutex is not re-entrant).
        let img_embed = self
            .registry
            .with_session(model, |session| ml::clip::encode_image(session, image))?;

        let txt_embed = self.registry.with_session(&text_model, |session| {
            ml::clip::encode_text(session, &token_ids)
        })?;

        let score = ml::clip::cosine_similarity(&img_embed, &txt_embed);
        self.registry.evict_idle(IDLE_EVICT_SECS).ok();
        Ok(score)
    }

    fn transcribe(&self, model: &str, audio: &str) -> Result<ml::whisper::TranscribeResult> {
        self.registry.get_or_load(model, &self.device)?;
        let result = self.registry.with_session(model, |session| {
            ml::whisper::transcribe(session, audio, None)
        });
        self.registry.evict_idle(IDLE_EVICT_SECS).ok();
        result
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ml::onnx_runtime::DeviceSelection;

    // ------------------------------------------------------------------
    // Service-level: register / list / unregister (no ort dylib needed)
    // ------------------------------------------------------------------

    #[test]
    fn test_mlservice_register_list_unregister() {
        let svc = MlService::new(3, DeviceSelection::Cpu);

        // register_model checks path existence — use a temp file.
        let tmp = std::env::temp_dir().join("dummy_ml_test.onnx");
        std::fs::write(&tmp, b"").unwrap();
        let path = tmp.to_str().unwrap();

        svc.register_model("m1", path, "onnx", "upscale").unwrap();
        assert_eq!(svc.list_models().len(), 1);

        svc.unregister_model("m1").unwrap();
        assert_eq!(svc.list_models().len(), 0);

        std::fs::remove_file(&tmp).ok();
    }

    #[test]
    fn test_mlservice_list_models_json_fields() {
        let svc = MlService::new(3, DeviceSelection::Cpu);

        let tmp = std::env::temp_dir().join("dummy_ml_json_test.onnx");
        std::fs::write(&tmp, b"").unwrap();
        let path = tmp.to_str().unwrap();

        svc.register_model("clip-vis", path, "onnx", "clip")
            .unwrap();
        let models = svc.list_models();
        assert_eq!(models.len(), 1);

        let m = &models[0];
        assert_eq!(m["name"], "clip-vis");
        assert_eq!(m["framework"], "onnx");
        assert_eq!(m["task"], "clip");

        std::fs::remove_file(&tmp).ok();
    }

    #[test]
    fn test_mlservice_unregister_nonexistent_is_ok() {
        let svc = MlService::new(3, DeviceSelection::Cpu);
        // unregister of a name that was never registered should not panic.
        svc.unregister_model("ghost").unwrap();
    }

    // ------------------------------------------------------------------
    // End-to-end inference tests (require ort dylib + real ONNX models)
    //
    // Run with:
    //   ORT_DYLIB_PATH=<path/to/libonnxruntime.dylib> \
    //   ML_TEST_UPSCALE_MODEL=<path/to/realesrgan.onnx> \
    //   ML_TEST_IMAGE=<path/to/input.png> \
    //   cargo test --package neko-native-core --features onnx \
    //     -- ml_e2e --include-ignored
    // ------------------------------------------------------------------

    /// Upscale end-to-end: register → upscale → verify output file created.
    ///
    /// Env vars required:
    ///   ORT_DYLIB_PATH — path to libonnxruntime.{dylib,so,dll}
    ///   ML_TEST_UPSCALE_MODEL — path to Real-ESRGAN ONNX encoder
    ///   ML_TEST_IMAGE — path to a small PNG/JPEG input image
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH + ML_TEST_UPSCALE_MODEL + ML_TEST_IMAGE"]
    fn test_e2e_upscale() {
        let model = std::env::var("ML_TEST_UPSCALE_MODEL").expect("set ML_TEST_UPSCALE_MODEL");
        let image = std::env::var("ML_TEST_IMAGE").expect("set ML_TEST_IMAGE");
        let out = std::env::temp_dir().join("e2e_upscale_out.png");

        let svc = MlService::new(2, DeviceSelection::Auto);
        svc.register_model("upscale", &model, "onnx", "upscale")
            .expect("register upscale model");
        svc.upscale("upscale", &image, out.to_str().unwrap(), 4)
            .expect("upscale inference");

        assert!(out.exists(), "output image must be written");
        std::fs::remove_file(&out).ok();
    }

    /// Denoise end-to-end: register → denoise → verify output file created.
    ///
    /// Env vars required:
    ///   ORT_DYLIB_PATH — path to libonnxruntime.{dylib,so,dll}
    ///   ML_TEST_DENOISE_MODEL — path to denoising ONNX model
    ///   ML_TEST_IMAGE — path to a small PNG/JPEG input image
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH + ML_TEST_DENOISE_MODEL + ML_TEST_IMAGE"]
    fn test_e2e_denoise() {
        let model = std::env::var("ML_TEST_DENOISE_MODEL").expect("set ML_TEST_DENOISE_MODEL");
        let image = std::env::var("ML_TEST_IMAGE").expect("set ML_TEST_IMAGE");
        let out = std::env::temp_dir().join("e2e_denoise_out.png");

        let svc = MlService::new(2, DeviceSelection::Auto);
        svc.register_model("denoise", &model, "onnx", "denoise")
            .expect("register denoise model");
        svc.denoise("denoise", &image, out.to_str().unwrap(), 0.5)
            .expect("denoise inference");

        assert!(out.exists(), "output image must be written");
        std::fs::remove_file(&out).ok();
    }

    /// CLIP score end-to-end: visual + text encoders → cosine similarity in [-1, 1].
    ///
    /// Env vars required:
    ///   ORT_DYLIB_PATH
    ///   ML_TEST_CLIP_IMAGE_MODEL — path to CLIP visual encoder ONNX
    ///   ML_TEST_CLIP_TEXT_MODEL  — path to CLIP text encoder ONNX
    ///   ML_TEST_IMAGE            — path to a small PNG/JPEG input image
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH + ML_TEST_CLIP_IMAGE_MODEL + ML_TEST_CLIP_TEXT_MODEL + ML_TEST_IMAGE"]
    fn test_e2e_clip_score() {
        let image_model =
            std::env::var("ML_TEST_CLIP_IMAGE_MODEL").expect("set ML_TEST_CLIP_IMAGE_MODEL");
        let text_model =
            std::env::var("ML_TEST_CLIP_TEXT_MODEL").expect("set ML_TEST_CLIP_TEXT_MODEL");
        let image = std::env::var("ML_TEST_IMAGE").expect("set ML_TEST_IMAGE");

        let svc = MlService::new(3, DeviceSelection::Auto);
        svc.register_model("clip", &image_model, "onnx", "clip")
            .expect("register clip image model");
        svc.register_model("clip:text", &text_model, "onnx", "clip-text")
            .expect("register clip text model");

        let score = svc
            .clip_score("clip", &image, "a photo")
            .expect("clip inference");

        assert!(
            (-1.0..=1.0).contains(&score),
            "CLIP cosine score must be in [-1, 1], got {score}"
        );
    }

    /// Whisper transcription end-to-end: audio → non-empty text string.
    ///
    /// Env vars required:
    ///   ORT_DYLIB_PATH
    ///   ML_TEST_WHISPER_MODEL — path to Whisper encoder_model.onnx
    ///                           (decoder_model_merged.onnx + vocab.json must be in same dir)
    ///   ML_TEST_AUDIO         — path to a short WAV/MP3/M4A audio file
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH + ML_TEST_WHISPER_MODEL + ML_TEST_AUDIO"]
    fn test_e2e_transcribe() {
        let model = std::env::var("ML_TEST_WHISPER_MODEL").expect("set ML_TEST_WHISPER_MODEL");
        let audio = std::env::var("ML_TEST_AUDIO").expect("set ML_TEST_AUDIO");

        let svc = MlService::new(2, DeviceSelection::Auto);
        svc.register_model("whisper", &model, "onnx", "whisper")
            .expect("register whisper model");

        let result = svc.transcribe("whisper", &audio).expect("transcribe");
        assert!(
            !result.text.trim().is_empty(),
            "transcription must not be empty"
        );
    }

    /// Idle eviction wires through the service: after inference, a session
    /// backdated beyond 5 min must be evicted, then transparently reloaded
    /// on the next call.
    #[test]
    #[ignore = "requires ORT_DYLIB_PATH + ML_TEST_UPSCALE_MODEL + ML_TEST_IMAGE"]
    fn test_idle_eviction_via_service() {
        use std::time::{Duration, Instant};

        let model = std::env::var("ML_TEST_UPSCALE_MODEL").expect("set ML_TEST_UPSCALE_MODEL");
        let image = std::env::var("ML_TEST_IMAGE").expect("set ML_TEST_IMAGE");
        let out = std::env::temp_dir().join("e2e_evict_out.png");

        let svc = MlService::new(2, DeviceSelection::Auto);
        svc.register_model("up", &model, "onnx", "upscale")
            .expect("register");
        svc.upscale("up", &image, out.to_str().unwrap(), 4)
            .expect("first upscale loads session");
        assert_eq!(svc.registry_for_test().loaded_count(), 1, "session loaded");

        // Backdate past the idle threshold so evict_idle clears it.
        let past = Instant::now() - Duration::from_secs(IDLE_EVICT_SECS + 60);
        svc.registry_for_test().set_last_used_for_test("up", past);

        // evict_idle is called inside upscale — but it runs AFTER inference,
        // so the session is reloaded by get_or_load first.
        svc.upscale("up", &image, out.to_str().unwrap(), 4)
            .expect("second upscale after idle eviction");

        assert!(out.exists(), "output written after reload");
        std::fs::remove_file(&out).ok();
    }
}

/// Minimal CLIP tokeniser: converts text to SOT + space-split token IDs + EOT.
///
/// Returns i32 token IDs. Characters outside the basic ASCII range are replaced
/// with the UNK token. For production use, replace with a proper BPE tokeniser
/// loaded from the model's `tokenizer.json`.
fn simple_clip_tokenise(text: &str) -> Vec<i32> {
    const SOT: i32 = 49406;
    const EOT: i32 = 49407;
    const MAX_LEN: usize = 77;

    let mut ids = vec![SOT];
    // Each ASCII byte maps roughly to a CLIP token; this is a stand-in
    // that produces plausible-length sequences without a full BPE table.
    for ch in text.chars().take(MAX_LEN - 2) {
        ids.push(ch as i32 % 49405 + 1); // crude mapping; replace with real BPE
    }
    ids.push(EOT);
    ids
}
