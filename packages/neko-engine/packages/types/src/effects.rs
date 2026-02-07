//! Effect types — blend modes, effect parameters, transitions

use serde::{Deserialize, Serialize};

/// Blend mode for compositing layers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BlendMode {
    #[default]
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl BlendMode {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "normal" => Self::Normal,
            "multiply" => Self::Multiply,
            "screen" => Self::Screen,
            "overlay" => Self::Overlay,
            "darken" => Self::Darken,
            "lighten" => Self::Lighten,
            "color-dodge" | "colordodge" => Self::ColorDodge,
            "color-burn" | "colorburn" => Self::ColorBurn,
            "hard-light" | "hardlight" => Self::HardLight,
            "soft-light" | "softlight" => Self::SoftLight,
            "difference" => Self::Difference,
            "exclusion" => Self::Exclusion,
            "hue" => Self::Hue,
            "saturation" => Self::Saturation,
            "color" => Self::Color,
            "luminosity" => Self::Luminosity,
            _ => Self::Normal,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Multiply => "multiply",
            Self::Screen => "screen",
            Self::Overlay => "overlay",
            Self::Darken => "darken",
            Self::Lighten => "lighten",
            Self::ColorDodge => "color-dodge",
            Self::ColorBurn => "color-burn",
            Self::HardLight => "hard-light",
            Self::SoftLight => "soft-light",
            Self::Difference => "difference",
            Self::Exclusion => "exclusion",
            Self::Hue => "hue",
            Self::Saturation => "saturation",
            Self::Color => "color",
            Self::Luminosity => "luminosity",
        }
    }
}

/// Effect type classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EffectType {
    Blur,
    Sharpen,
    ColorCorrection,
    Brightness,
    Contrast,
    Saturation,
    Hue,
    Exposure,
    Gamma,
    Vignette,
    ChromaticAberration,
    FilmGrain,
    Custom,
}

/// Effect parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectParams {
    /// Effect type
    pub effect_type: EffectType,
    /// Effect intensity (0.0 - 1.0)
    #[serde(default = "default_intensity")]
    pub intensity: f64,
    /// Effect-specific parameters
    #[serde(default)]
    pub params: serde_json::Value,
    /// Whether effect is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_intensity() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

impl Default for EffectParams {
    fn default() -> Self {
        Self {
            effect_type: EffectType::Custom,
            intensity: 1.0,
            params: serde_json::Value::Null,
            enabled: true,
        }
    }
}

/// Transition type for clips
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransitionType {
    None,
    Fade,
    Dissolve,
    Wipe,
    Slide,
    Zoom,
    Push,
    Cover,
    Reveal,
    #[serde(untagged)]
    Custom(String),
}

impl Default for TransitionType {
    fn default() -> Self {
        Self::None
    }
}

/// Transition parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionParams {
    /// Transition type
    #[serde(rename = "type")]
    pub transition_type: TransitionType,
    /// Duration in seconds
    pub duration: f64,
    /// Easing function
    #[serde(default)]
    pub easing: EasingType,
    /// Direction (for directional transitions)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<TransitionDirection>,
}

/// Transition direction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransitionDirection {
    Left,
    Right,
    Up,
    Down,
}

/// Easing type for animations and transitions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EasingType {
    #[default]
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
    EaseInCubic,
    EaseOutCubic,
    EaseInOutCubic,
    EaseInQuart,
    EaseOutQuart,
    EaseInOutQuart,
    EaseInExpo,
    EaseOutExpo,
    EaseInOutExpo,
    EaseInBack,
    EaseOutBack,
    EaseInOutBack,
    EaseInElastic,
    EaseOutElastic,
    EaseInOutElastic,
    EaseInBounce,
    EaseOutBounce,
    EaseInOutBounce,
}
