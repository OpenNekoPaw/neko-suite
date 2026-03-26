//! Whisper STT inference pipeline.
//!
//! Pipeline:
//!   1. Load audio via FFmpeg → resample to 16 kHz mono f32 PCM.
//!   2. Compute log-mel spectrogram (80 mel bins, 3000 frames for 30 s).
//!   3. Run encoder session: mel [1, 80, 3000] → hidden states [1, 1500, D].
//!   4. Run decoder session in an autoregressive loop until <|endoftext|> or max tokens.
//!   5. Decode token IDs to UTF-8 text via a vocab file bundled with the model.
//!
//! Expected model layout (HuggingFace optimum ONNX export):
//!   <model_dir>/encoder_model.onnx
//!   <model_dir>/decoder_model_merged.onnx   (or decoder_model.onnx)
//!   <model_dir>/vocab.json
//!
//! The `session` parameter refers to the encoder session. The decoder session
//! path is derived by replacing `encoder_model.onnx` with `decoder_model_merged.onnx`
//! (or `decoder_model.onnx`) in the same directory.

use crate::error::{Error, Result};
use ndarray::Array2;
use ort::value::Tensor as OrtTensor;
use rustfft::{num_complex::Complex, FftPlanner};
use std::collections::HashMap;
use std::path::Path;

// --- Whisper constants ---

const SAMPLE_RATE: usize = 16_000;
const N_FFT: usize = 512;
const HOP_LENGTH: usize = 160;   // 10 ms
const WIN_LENGTH: usize = 400;   // 25 ms
const N_MELS: usize = 80;
const N_SAMPLES: usize = 480_000; // 30 s × 16 kHz
const N_FRAMES: usize = 3_000;    // (N_SAMPLES - N_FFT) / HOP_LENGTH + 1 ≈ 3000
const MAX_TOKENS: usize = 448;

// Special token IDs (multilingual Whisper vocabulary).
const SOT: i64 = 50258;           // <|startoftranscript|>
const EOT: i64 = 50257;           // <|endoftext|>
const TRANSCRIBE: i64 = 50359;    // <|transcribe|>
const TIMESTAMP_BEGIN: i64 = 50364; // <|0.00|> — first timestamp token

/// A timestamped segment produced by the decoder.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TranscribeSegment {
    /// Start time in seconds.
    pub start: f64,
    /// End time in seconds.
    pub end: f64,
    /// Transcribed text for this segment.
    pub text: String,
}

/// Transcription result.
#[derive(Debug, serde::Serialize)]
pub struct TranscribeResult {
    pub text: String,
    pub segments: Vec<TranscribeSegment>,
    pub language: Option<String>,
    pub duration_secs: Option<f64>,
}

/// Transcribe an audio file using a Whisper ONNX encoder session.
///
/// `session` must be the *encoder* session loaded from `encoder_model.onnx`.
/// The decoder session is opened automatically from the same directory.
/// `language`: BCP-47 code e.g. `"en"`, `"zh"`. Pass `None` for auto-detect.
pub fn transcribe(
    encoder_session: &mut ort::session::Session,
    audio_path: &str,
    language: Option<&str>,
) -> Result<TranscribeResult> {
    if !Path::new(audio_path).exists() {
        return Err(Error::FileNotFound(audio_path.to_string()));
    }

    // 1. Load audio.
    let samples = load_audio_16khz(audio_path)?;
    let duration_secs = samples.len() as f64 / SAMPLE_RATE as f64;
    tracing::debug!(path = %audio_path, duration_secs, samples = samples.len(), "Audio loaded");

    // 2. Compute log-mel spectrogram → [1, 80, 3000].
    let mel = log_mel_spectrogram(&samples);

    // 3. Run encoder.
    let encoder_out = run_encoder(encoder_session, &mel)?;

    // 4. Find decoder model in the same directory as the encoder model.
    // We derive the path from the session's model path via ort's metadata.
    // Fallback: use the `WHISPER_DECODER_PATH` env var.
    let decoder_path = find_decoder_model(encoder_session)?;

    // 5. Load decoder session.
    // We load without EP here — the caller controls EP via the primary session's
    // device. A separate decoder session reuses the same ort environment.
    let mut decoder_session = ort::session::Session::builder()
        .map_err(|e| Error::Other(format!("Decoder session builder: {}", e)))?
        .commit_from_file(&decoder_path)
        .map_err(|e| Error::Other(format!("Load decoder '{}': {}", decoder_path, e)))?;

    // 6. Autoregressive decoding.
    let lang_id = language.map(lang_to_token_id);
    let token_ids = decode(&mut decoder_session, &encoder_out, lang_id)?;

    // 7. Detokenise with timestamps.
    let vocab = load_vocab_near(encoder_session)?;
    let (text, segments) = detokenise_with_timestamps(&token_ids, &vocab);

    Ok(TranscribeResult {
        text,
        segments,
        language: language.map(str::to_string),
        duration_secs: Some(duration_secs),
    })
}

// =============================================================================
// Audio loading (FFmpeg → 16 kHz mono f32)
// =============================================================================

fn load_audio_16khz(path: &str) -> Result<Vec<f32>> {
    use ffmpeg_next as ff;

    ff::init().map_err(|e| Error::Other(format!("FFmpeg init: {}", e)))?;

    let mut ictx = ff::format::input(&path)
        .map_err(|e| Error::Other(format!("Open audio '{}': {}", path, e)))?;

    let stream = ictx
        .streams()
        .best(ff::media::Type::Audio)
        .ok_or_else(|| Error::Other(format!("No audio stream in '{}'", path)))?;
    let stream_idx = stream.index();

    let codec = ff::codec::context::Context::from_parameters(stream.parameters())
        .map_err(|e| Error::Other(format!("Codec context: {}", e)))?;
    let mut decoder = codec
        .decoder()
        .audio()
        .map_err(|e| Error::Other(format!("Audio decoder: {}", e)))?;

    // Resampler: any input → 16 kHz mono f32 (packed).
    let mut resampler = decoder
        .resampler(
            ff::format::Sample::F32(ff::format::sample::Type::Packed),
            ff::ChannelLayout::MONO,
            SAMPLE_RATE as u32,
        )
        .map_err(|e| Error::Other(format!("Build resampler: {}", e)))?;

    let mut samples: Vec<f32> = Vec::with_capacity(SAMPLE_RATE * 30);

    for (stream, packet) in ictx.packets() {
        if stream.index() != stream_idx {
            continue;
        }
        decoder
            .send_packet(&packet)
            .map_err(|e| Error::Other(format!("Send packet: {}", e)))?;

        let mut decoded = ff::frame::Audio::empty();
        while decoder.receive_frame(&mut decoded).is_ok() {
            let mut resampled = ff::frame::Audio::empty();
            resampler
                .run(&decoded, &mut resampled)
                .map_err(|e| Error::Other(format!("Resample: {}", e)))?;
            push_f32_frames(&resampled, &mut samples);
        }
    }

    // Flush.
    decoder.send_eof().ok();
    let mut decoded = ff::frame::Audio::empty();
    while decoder.receive_frame(&mut decoded).is_ok() {
        let mut resampled = ff::frame::Audio::empty();
        if resampler.run(&decoded, &mut resampled).is_ok() {
            push_f32_frames(&resampled, &mut samples);
        }
    }

    Ok(samples)
}

#[inline]
fn push_f32_frames(frame: &ffmpeg_next::frame::Audio, out: &mut Vec<f32>) {
    if frame.samples() == 0 {
        return;
    }
    let data: &[f32] = unsafe {
        std::slice::from_raw_parts(
            frame.data(0).as_ptr() as *const f32,
            frame.samples(),
        )
    };
    out.extend_from_slice(data);
}

// =============================================================================
// Log-mel spectrogram
// =============================================================================

/// Compute Whisper log-mel spectrogram → Array2 shape [N_MELS, N_FRAMES].
fn log_mel_spectrogram(audio: &[f32]) -> Array2<f32> {
    // Pad or trim to exactly N_SAMPLES.
    let mut padded = vec![0.0f32; N_SAMPLES];
    let copy = audio.len().min(N_SAMPLES);
    padded[..copy].copy_from_slice(&audio[..copy]);

    let window = hann_window(WIN_LENGTH);
    let mel_fb = mel_filterbank();

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(N_FFT);

    let n_frames_actual = (N_SAMPLES - WIN_LENGTH) / HOP_LENGTH + 1;
    let n_freqs = N_FFT / 2 + 1;

    // Power spectrogram [n_freqs × n_frames].
    let mut power = vec![0.0f32; n_freqs * N_FRAMES];

    for (fi, frame_start) in (0..N_SAMPLES - WIN_LENGTH).step_by(HOP_LENGTH).enumerate() {
        if fi >= N_FRAMES {
            break;
        }
        let mut buf: Vec<Complex<f32>> = padded[frame_start..frame_start + WIN_LENGTH]
            .iter()
            .zip(window.iter())
            .map(|(&s, &w)| Complex { re: s * w, im: 0.0 })
            .chain(std::iter::repeat(Complex::default()).take(N_FFT - WIN_LENGTH))
            .collect();
        fft.process(&mut buf);
        for k in 0..n_freqs {
            power[k * N_FRAMES + fi] = buf[k].re * buf[k].re + buf[k].im * buf[k].im;
        }
    }
    let _ = n_frames_actual; // silence unused warning

    // Mel projection: [N_MELS × n_freqs] × [n_freqs × N_FRAMES] → [N_MELS × N_FRAMES].
    let mut mel_spec = Array2::<f32>::zeros((N_MELS, N_FRAMES));
    for m in 0..N_MELS {
        for f in 0..N_FRAMES {
            let mut val = 0.0f32;
            for k in 0..n_freqs {
                val += mel_fb[m * n_freqs + k] * power[k * N_FRAMES + f];
            }
            mel_spec[[m, f]] = val.max(1e-10).ln() / std::f32::consts::LN_10; // log10
        }
    }

    // Whisper-specific normalisation: clamp to (max - 8), shift to [-1, 1].
    let max_val = mel_spec.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    mel_spec.mapv_inplace(|v| ((v.max(max_val - 8.0)) + 4.0) / 4.0);

    mel_spec
}

fn hann_window(size: usize) -> Vec<f32> {
    (0..size)
        .map(|i| {
            0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / size as f32).cos())
        })
        .collect()
}

/// Build flat [N_MELS × (N_FFT/2+1)] mel filterbank matrix (Slaney normalised).
fn mel_filterbank() -> Vec<f32> {
    let n_freqs = N_FFT / 2 + 1;
    let fmin = 0.0f32;
    let fmax = SAMPLE_RATE as f32 / 2.0;

    let hz_to_mel = |hz: f32| 2595.0 * (1.0 + hz / 700.0).log10();
    let mel_to_hz = |mel: f32| 700.0 * (10.0f32.powf(mel / 2595.0) - 1.0);

    let mel_min = hz_to_mel(fmin);
    let mel_max = hz_to_mel(fmax);

    // N_MELS+2 centre points.
    let mel_pts: Vec<f32> = (0..N_MELS + 2)
        .map(|i| mel_min + (mel_max - mel_min) * i as f32 / (N_MELS + 1) as f32)
        .collect();
    let hz_pts: Vec<f32> = mel_pts.iter().map(|&m| mel_to_hz(m)).collect();

    // FFT frequency bins.
    let fft_freqs: Vec<f32> = (0..n_freqs)
        .map(|k| k as f32 * SAMPLE_RATE as f32 / N_FFT as f32)
        .collect();

    let mut fb = vec![0.0f32; N_MELS * n_freqs];
    for m in 0..N_MELS {
        let (fl, fc, fr) = (hz_pts[m], hz_pts[m + 1], hz_pts[m + 2]);
        let mut norm = 0.0f32;
        for (k, &freq) in fft_freqs.iter().enumerate() {
            let w = if freq < fl || freq > fr {
                0.0
            } else if freq <= fc {
                (freq - fl) / (fc - fl)
            } else {
                (fr - freq) / (fr - fc)
            };
            fb[m * n_freqs + k] = w;
            norm += w;
        }
        // Slaney normalisation.
        if norm > 0.0 {
            for k in 0..n_freqs {
                fb[m * n_freqs + k] /= norm;
            }
        }
    }
    fb
}

// =============================================================================
// Encoder
// =============================================================================

/// Run Whisper encoder. Returns hidden states [1, 1500, D].
fn run_encoder(
    session: &mut ort::session::Session,
    mel: &Array2<f32>,
) -> Result<ndarray::ArrayD<f32>> {
    // Reshape to [1, N_MELS, N_FRAMES].
    let mel3 = mel
        .view()
        .into_shape((1, N_MELS, N_FRAMES))
        .map_err(|e| Error::Other(format!("Mel reshape: {}", e)))?
        .into_dyn()
        .into_owned();

    let mel_tensor = OrtTensor::from_array(mel3)
        .map_err(|e| Error::Other(format!("Create mel tensor: {}", e)))?;
    let outputs = session
        .run(ort::inputs!["input_features" => mel_tensor])
        .map_err(|e| Error::Other(format!("Encoder inference: {}", e)))?;

    let out_view = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|e| Error::Other(format!("Extract encoder output: {}", e)))?;

    Ok(out_view.into_owned())
}

// =============================================================================
// Decoder (autoregressive)
// =============================================================================

/// Greedy autoregressive decode loop. Returns raw token IDs (excluding special tokens).
fn decode(
    decoder: &mut ort::session::Session,
    encoder_hidden: &ndarray::ArrayD<f32>,
    lang_id: Option<i64>,
) -> Result<Vec<i64>> {
    // Initial prompt: SOT, [language token], TRANSCRIBE.
    // No NO_TIMESTAMPS token — decoder will produce timestamp tokens naturally.
    let mut tokens: Vec<i64> = vec![SOT];
    if let Some(lid) = lang_id {
        tokens.push(lid);
    }
    tokens.push(TRANSCRIBE);

    let hidden_dyn = encoder_hidden.view().into_dyn().into_owned();

    for _ in 0..MAX_TOKENS {
        let seq_len = tokens.len();
        let ids_arr = Array2::from_shape_vec(
            (1, seq_len),
            tokens.iter().map(|&t| t as i64).collect(),
        )
        .map_err(|e| Error::Other(format!("Token array: {}", e)))?
        .into_dyn();

        let ids_tensor = OrtTensor::from_array(ids_arr)
            .map_err(|e| Error::Other(format!("Create ids tensor: {}", e)))?;
        let hidden_tensor = OrtTensor::from_array(hidden_dyn.clone())
            .map_err(|e| Error::Other(format!("Create hidden tensor: {}", e)))?;
        let outputs = decoder
            .run(ort::inputs![
                "input_ids"             => ids_tensor,
                "encoder_hidden_states" => hidden_tensor
            ])
            .map_err(|e| Error::Other(format!("Decoder step: {}", e)))?;

        // logits: [1, seq_len, vocab_size] — take last position.
        let logits_view = outputs[0]
            .try_extract_array::<f32>()
            .map_err(|e| Error::Other(format!("Extract logits: {}", e)))?;
        let lshape = logits_view.shape().to_vec();
        let vocab_size = lshape[2];
        let last_offset = (lshape[1] - 1) * vocab_size;

        let logits_slice = logits_view.as_slice().ok_or_else(|| {
            Error::Other("Logits not contiguous".to_string())
        })?;
        let last_logits = &logits_slice[last_offset..last_offset + vocab_size];

        // Argmax (greedy).
        let next_token = last_logits
            .iter()
            .enumerate()
            .max_by(|(_, a): &(_, &f32), (_, b): &(_, &f32)| {
                a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(i, _)| i as i64)
            .unwrap_or(EOT);

        if next_token == EOT {
            break;
        }
        tokens.push(next_token);
    }

    // Strip prompt prefix; keep only generated tokens (including timestamp tokens).
    let prompt_len = if lang_id.is_some() { 3 } else { 2 };
    Ok(tokens.into_iter().skip(prompt_len).collect())
}

// =============================================================================
// Vocab / tokeniser
// =============================================================================

/// Map BCP-47 language code to Whisper language token ID.
fn lang_to_token_id(lang: &str) -> i64 {
    // Whisper language tokens start at 50259 in alphabetical order.
    // Only a subset is listed here; extend as needed.
    match lang {
        "en" => 50259,
        "zh" => 50260,
        "de" => 50261,
        "es" => 50262,
        "ru" => 50263,
        "ko" => 50264,
        "fr" => 50265,
        "ja" => 50266,
        "pt" => 50267,
        "tr" => 50268,
        _ => 50259, // default to English
    }
}

/// Find decoder model file next to the encoder session's model file.
///
/// Tries `decoder_model_merged.onnx` then `decoder_model.onnx`.
/// Falls back to `WHISPER_DECODER_PATH` env var.
fn find_decoder_model(encoder_session: &ort::session::Session) -> Result<String> {
    // ort 2.0 exposes model path via metadata.
    if let Some(meta) = encoder_session.metadata().ok() {
        if let Some(model_path) = meta.description() {
            // description may contain "path:<absolute_path>" or just the path.
            let base = extract_model_dir(&model_path);
            for candidate in &["decoder_model_merged.onnx", "decoder_model.onnx"] {
                let p = format!("{}/{}", base, candidate);
                if Path::new(&p).exists() {
                    return Ok(p);
                }
            }
        }
    }

    // Env var fallback.
    if let Ok(p) = std::env::var("WHISPER_DECODER_PATH") {
        if Path::new(&p).exists() {
            return Ok(p);
        }
    }

    Err(Error::Other(
        "Could not locate decoder_model_merged.onnx. \
         Set WHISPER_DECODER_PATH or place it next to encoder_model.onnx."
            .to_string(),
    ))
}

fn extract_model_dir(path: &str) -> String {
    Path::new(path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string())
}

/// Load `vocab.json` from the model directory. Returns token_id → string map.
///
/// vocab.json format: `{ "token_string": token_id, ... }` (HuggingFace convention).
fn load_vocab_near(encoder_session: &ort::session::Session) -> Result<HashMap<i64, String>> {
    let vocab_path = if let Some(meta) = encoder_session.metadata().ok() {
        if let Some(model_path) = meta.description() {
            let base = extract_model_dir(&model_path);
            let p = format!("{}/vocab.json", base);
            if Path::new(&p).exists() {
                Some(p)
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let path = vocab_path
        .or_else(|| std::env::var("WHISPER_VOCAB_PATH").ok())
        .ok_or_else(|| {
            Error::Other(
                "vocab.json not found. Set WHISPER_VOCAB_PATH or place it next to encoder_model.onnx."
                    .to_string(),
            )
        })?;

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| Error::Other(format!("Read vocab '{}': {}", path, e)))?;
    let map: HashMap<String, serde_json::Value> = serde_json::from_str(&raw)
        .map_err(|e| Error::Other(format!("Parse vocab: {}", e)))?;

    let mut vocab: HashMap<i64, String> = HashMap::with_capacity(map.len());
    for (token, id_val) in map {
        if let Some(id) = id_val.as_i64() {
            vocab.insert(id, token);
        }
    }
    Ok(vocab)
}

/// Decode token IDs to text and timestamped segments.
///
/// Whisper timestamp tokens have IDs >= TIMESTAMP_BEGIN (50364).
/// Each timestamp encodes `(id - 50364) * 0.02` seconds.
/// The decoder emits `<|start_ts|> text tokens <|end_ts|>` groups.
fn detokenise_with_timestamps(
    token_ids: &[i64],
    vocab: &HashMap<i64, String>,
) -> (String, Vec<TranscribeSegment>) {
    let b2u = bytes_to_unicode();

    let mut full_text = String::new();
    let mut segments: Vec<TranscribeSegment> = Vec::new();

    // Current segment accumulation state.
    let mut seg_start: Option<f64> = None;
    let mut seg_bytes: Vec<u8> = Vec::new();

    let decode_bytes = |byte_buf: &[u8]| -> String {
        String::from_utf8_lossy(byte_buf).trim().to_string()
    };

    for &id in token_ids {
        if id >= TIMESTAMP_BEGIN {
            // Timestamp token: value = (id - TIMESTAMP_BEGIN) * 0.02 seconds
            let ts = (id - TIMESTAMP_BEGIN) as f64 * 0.02;

            match seg_start {
                None => {
                    // Opening timestamp — start a new segment.
                    seg_start = Some(ts);
                }
                Some(start) => {
                    // Closing timestamp — finish the segment.
                    let text = decode_bytes(&seg_bytes);
                    if !text.is_empty() {
                        if !full_text.is_empty() {
                            full_text.push(' ');
                        }
                        full_text.push_str(&text);
                        segments.push(TranscribeSegment {
                            start,
                            end: ts,
                            text,
                        });
                    }
                    seg_bytes.clear();
                    seg_start = None;
                }
            }
        } else if id >= EOT {
            // Skip other special tokens (SOT, EOT, TRANSCRIBE, language, etc.)
            continue;
        } else if let Some(tok) = vocab.get(&id) {
            // Regular text token — accumulate bytes.
            for ch in tok.chars() {
                if let Some(&byte) = b2u.get(&ch) {
                    seg_bytes.push(byte);
                }
            }
        }
    }

    // Flush any remaining tokens without a closing timestamp.
    if !seg_bytes.is_empty() {
        let text = decode_bytes(&seg_bytes);
        if !text.is_empty() {
            if !full_text.is_empty() {
                full_text.push(' ');
            }
            full_text.push_str(&text);
            // No closing timestamp — use start or 0.
            let start = seg_start.unwrap_or(0.0);
            segments.push(TranscribeSegment {
                start,
                end: start, // unknown end
                text,
            });
        }
    }

    (full_text, segments)
}

/// GPT-2 / Whisper bytes-to-unicode reverse map (unicode char → original byte).
fn bytes_to_unicode() -> HashMap<char, u8> {
    let mut map = HashMap::new();
    let mut n = 0u32;
    for b in 0u8..=255 {
        let ch = if (b >= b'!' && b <= b'~') || (b >= 0xA1 && b != 0xAD) {
            b as char
        } else {
            // Map to high private-use unicode range starting at U+0100.
            let c = char::from_u32(256 + n).unwrap_or('\u{FFFD}');
            n += 1;
            c
        };
        map.insert(ch, b);
    }
    map
}
