//! Factory for creating audio effects from JSON configuration.

use crate::error::{Error, Result};
pub use neko_engine_types::{AudioEffectConfig, SUPPORTED_AUDIO_EFFECT_TYPES};

use super::biquad::{BiquadFilter, FilterType};
use super::chorus::Chorus;
use super::compressor::Compressor;
use super::delay::Delay;
use super::distortion::{Distortion, parse_distortion_type};
use super::effect_chain::EffectChain;
use super::gain::Gain;
use super::limiter::LimiterEffect;
use super::noise_gate::{NoiseGateConfig, NoiseGateEffect};
use super::parametric_eq::{EqBand, ParametricEq};
use super::reverb::Reverb;
use super::traits::AudioEffect;

pub use neko_engine_types::SUPPORTED_AUDIO_EFFECT_TYPES as SUPPORTED_EFFECT_TYPES;

fn f(v: &serde_json::Value, key: &str, default: f32) -> f32 {
    v.get(key)
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .unwrap_or(default)
}

fn f64v(v: &serde_json::Value, key: &str, default: f64) -> f64 {
    v.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
}

fn s<'a>(v: &'a serde_json::Value, key: &str, default: &'a str) -> &'a str {
    v.get(key).and_then(|v| v.as_str()).unwrap_or(default)
}

fn b(v: &serde_json::Value, key: &str, default: bool) -> bool {
    v.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}

/// Create a single audio effect from its configuration.
pub fn create_effect(config: &AudioEffectConfig) -> Result<Box<dyn AudioEffect>> {
    let p = &config.params;
    let effect: Box<dyn AudioEffect> = match config.effect_type.as_str() {
        "gain" => Box::new(Gain::new(f(p, "gainDb", f(p, "gain", 0.0)))),

        "high-pass" => Box::new(BiquadFilter::new(
            FilterType::HighPass,
            f64v(p, "frequency", 80.0),
            f64v(p, "q", f64v(p, "resonance", 0.707)),
            0.0,
        )),

        "low-pass" => Box::new(BiquadFilter::new(
            FilterType::LowPass,
            f64v(p, "frequency", 8000.0),
            f64v(p, "q", f64v(p, "resonance", 0.707)),
            0.0,
        )),

        "band-pass" => Box::new(BiquadFilter::new(
            FilterType::BandPass,
            f64v(p, "frequency", 1000.0),
            f64v(p, "q", f64v(p, "bandwidth", 1.0)),
            0.0,
        )),

        "notch" => Box::new(BiquadFilter::new(
            FilterType::Notch,
            f64v(p, "frequency", 1000.0),
            f64v(p, "q", 1.0),
            0.0,
        )),

        "peaking" => Box::new(BiquadFilter::new(
            FilterType::Peaking,
            f64v(p, "frequency", 1000.0),
            f64v(p, "q", 1.0),
            f64v(p, "gainDb", f64v(p, "gain", 0.0)),
        )),

        "low-shelf" => Box::new(BiquadFilter::new(
            FilterType::LowShelf,
            f64v(p, "frequency", 200.0),
            f64v(p, "q", 0.707),
            f64v(p, "gainDb", f64v(p, "gain", 0.0)),
        )),

        "high-shelf" => Box::new(BiquadFilter::new(
            FilterType::HighShelf,
            f64v(p, "frequency", 4000.0),
            f64v(p, "q", 0.707),
            f64v(p, "gainDb", f64v(p, "gain", 0.0)),
        )),

        "parametric-eq" => {
            let bands: Vec<EqBand> = p
                .get("bands")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            Box::new(ParametricEq::new(&bands))
        }

        "compressor" => Box::new(Compressor::new(
            f(p, "threshold", -24.0),
            f(p, "ratio", 4.0),
            f(p, "attack", 10.0),
            f(p, "release", 100.0),
            f(p, "knee", 6.0),
            f(p, "makeupGain", 0.0),
        )),

        "noise-gate" => Box::new(NoiseGateEffect::new(NoiseGateConfig {
            threshold_db: f(p, "threshold", -40.0),
            attack_ms: f(p, "attack", 1.0),
            hold_ms: f(p, "hold", 50.0),
            release_ms: f(p, "release", 100.0),
        })),

        "limiter" => Box::new(LimiterEffect::new(
            f(p, "threshold", 0.95),
            f(p, "ceiling", 1.0),
            f(p, "release", 50.0),
        )),

        "reverb" => Box::new(Reverb::new(
            f(p, "roomSize", 0.5),
            f(p, "damping", 0.5),
            f(p, "wetDry", 0.3),
            f(p, "width", 1.0),
            f(p, "preDelay", 0.0),
        )),

        "delay" => Box::new(Delay::new(
            f(p, "delayMs", f(p, "delayTime", 250.0)),
            f(p, "feedback", 0.4),
            f(p, "wetDry", 0.3),
            b(p, "pingPong", false),
        )),

        "chorus" => Box::new(Chorus::new(
            f(p, "rate", 1.5),
            f(p, "depth", 3.0),
            f(p, "delay", 7.0),
            f(p, "feedback", 0.2),
            f(p, "wetDry", 0.5),
        )),

        "distortion" => {
            let dtype = parse_distortion_type(s(p, "type", "soft"));
            Box::new(Distortion::new(
                f(p, "drive", 12.0),
                f(p, "outputGain", -6.0),
                dtype,
            ))
        }

        other => {
            return Err(Error::InvalidParameter(format!(
                "Unsupported audio effect type: {}",
                other
            )));
        }
    };
    Ok(effect)
}

/// Build an EffectChain from a list of configurations.
pub fn build_effect_chain(configs: &[AudioEffectConfig]) -> Result<EffectChain> {
    let mut chain = EffectChain::new();
    for config in configs {
        let effect = create_effect(config)?;
        chain.push(config.id.clone(), config.enabled, effect);
    }
    Ok(chain)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_all_builtin_effects() {
        for t in SUPPORTED_EFFECT_TYPES {
            let config = AudioEffectConfig {
                id: format!("test-{}", t),
                effect_type: t.to_string(),
                enabled: true,
                params: serde_json::json!({}),
            };
            let result = create_effect(&config);
            assert!(result.is_ok(), "Failed to create effect: {}", t);
        }
    }

    #[test]
    fn test_build_chain() {
        let configs = vec![
            AudioEffectConfig {
                id: "hp".into(),
                effect_type: "high-pass".into(),
                enabled: true,
                params: serde_json::json!({"frequency": 80}),
            },
            AudioEffectConfig {
                id: "comp".into(),
                effect_type: "compressor".into(),
                enabled: true,
                params: serde_json::json!({"threshold": -18, "ratio": 3}),
            },
            AudioEffectConfig {
                id: "lim".into(),
                effect_type: "limiter".into(),
                enabled: false,
                params: serde_json::json!({}),
            },
        ];
        let chain = build_effect_chain(&configs).unwrap();
        assert_eq!(chain.len(), 3);
    }

    #[test]
    fn test_unknown_effect_returns_error() {
        let config = AudioEffectConfig {
            id: "missing".into(),
            effect_type: "spectral-wizard".into(),
            enabled: true,
            params: serde_json::json!({}),
        };

        let message = match create_effect(&config) {
            Ok(_) => panic!("unknown effect should fail"),
            Err(err) => err.to_string(),
        };

        assert!(message.contains("Unsupported audio effect type"));
    }
}
