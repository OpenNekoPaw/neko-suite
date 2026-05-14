//! Effect types — blend modes, effect parameters, transitions

use serde::{Deserialize, Serialize};

/// Blend mode for compositing layers — 27 modes aligned with gpu::BlendMode and timeline.proto
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BlendMode {
    // Basic
    #[default]
    Normal,
    Dissolve,
    // Darken Group
    Darken,
    Multiply,
    ColorBurn,
    LinearBurn,
    DarkerColor,
    // Lighten Group
    Lighten,
    Screen,
    ColorDodge,
    LinearDodge, // Add
    LighterColor,
    // Contrast Group
    Overlay,
    SoftLight,
    HardLight,
    VividLight,
    LinearLight,
    PinLight,
    HardMix,
    // Difference Group
    Difference,
    Exclusion,
    Subtract,
    Divide,
    // HSL Group
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl BlendMode {
    pub fn from_name(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            // Basic
            "normal" => Self::Normal,
            "dissolve" => Self::Dissolve,
            // Darken Group
            "darken" => Self::Darken,
            "multiply" => Self::Multiply,
            "color-burn" | "colorburn" => Self::ColorBurn,
            "linear-burn" | "linearburn" => Self::LinearBurn,
            "darker-color" | "darkercolor" => Self::DarkerColor,
            // Lighten Group
            "lighten" => Self::Lighten,
            "screen" => Self::Screen,
            "color-dodge" | "colordodge" => Self::ColorDodge,
            "linear-dodge" | "lineardodge" | "add" => Self::LinearDodge,
            "lighter-color" | "lightercolor" => Self::LighterColor,
            // Contrast Group
            "overlay" => Self::Overlay,
            "soft-light" | "softlight" => Self::SoftLight,
            "hard-light" | "hardlight" => Self::HardLight,
            "vivid-light" | "vividlight" => Self::VividLight,
            "linear-light" | "linearlight" => Self::LinearLight,
            "pin-light" | "pinlight" => Self::PinLight,
            "hard-mix" | "hardmix" => Self::HardMix,
            // Difference Group
            "difference" => Self::Difference,
            "exclusion" => Self::Exclusion,
            "subtract" => Self::Subtract,
            "divide" => Self::Divide,
            // HSL Group
            "hue" => Self::Hue,
            "saturation" => Self::Saturation,
            "color" => Self::Color,
            "luminosity" => Self::Luminosity,
            _ => Self::Normal,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            // Basic
            Self::Normal => "normal",
            Self::Dissolve => "dissolve",
            // Darken Group
            Self::Darken => "darken",
            Self::Multiply => "multiply",
            Self::ColorBurn => "color-burn",
            Self::LinearBurn => "linear-burn",
            Self::DarkerColor => "darker-color",
            // Lighten Group
            Self::Lighten => "lighten",
            Self::Screen => "screen",
            Self::ColorDodge => "color-dodge",
            Self::LinearDodge => "linear-dodge",
            Self::LighterColor => "lighter-color",
            // Contrast Group
            Self::Overlay => "overlay",
            Self::SoftLight => "soft-light",
            Self::HardLight => "hard-light",
            Self::VividLight => "vivid-light",
            Self::LinearLight => "linear-light",
            Self::PinLight => "pin-light",
            Self::HardMix => "hard-mix",
            // Difference Group
            Self::Difference => "difference",
            Self::Exclusion => "exclusion",
            Self::Subtract => "subtract",
            Self::Divide => "divide",
            // HSL Group
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

/// Canonical engine-supported audio effect type names.
pub const SUPPORTED_AUDIO_EFFECT_TYPES: &[&str] = &[
    "gain",
    "high-pass",
    "low-pass",
    "band-pass",
    "notch",
    "peaking",
    "low-shelf",
    "high-shelf",
    "parametric-eq",
    "compressor",
    "noise-gate",
    "limiter",
    "reverb",
    "delay",
    "chorus",
    "distortion",
];

/// High-level effect capability kind exposed by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EffectKind {
    Shader,
    Transition,
    Audio,
    Model,
    Lut,
}

/// Origin of a registered effect capability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EffectSource {
    BuiltIn,
    Plugin,
    User,
}

/// Select-style option metadata for effect parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamOption {
    pub value: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_key: Option<String>,
}

/// Primitive parameter definition for discovered effect capabilities.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamDef {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub default: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_key: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<ParamOption>,
    #[serde(default)]
    pub animatable: bool,
}

/// Queryable metadata for built-in or plugin-provided effect capabilities.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectCapability {
    pub id: String,
    pub kind: EffectKind,
    pub source: EffectSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default)]
    pub gpu_accelerated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry: Option<String>,
    #[serde(default)]
    pub params: Vec<ParamDef>,
}

/// Canonical audio effect render instruction shared across engine layers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEffectConfig {
    /// Unique effect instance ID.
    pub id: String,
    /// Canonical engine-supported effect type, e.g. "noise-gate".
    pub effect_type: String,
    /// Whether the effect should process audio.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Effect-specific parameter object.
    #[serde(default)]
    pub params: serde_json::Value,
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

/// Type-keyed effect instance on a timeline element.
/// Mirrors TypeScript `EffectInstance` from `@neko/shared`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementEffect {
    /// Unique instance ID (e.g., "effect-1234-abc")
    pub id: String,
    /// Effect type string (e.g., "gaussian-blur", "pixelate", "custom")
    #[serde(rename = "type")]
    pub effect_type: String,
    /// Whether the effect is currently active
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Static parameter values keyed by parameter name
    #[serde(default)]
    pub parameters: serde_json::Map<String, serde_json::Value>,
    /// Effect stack order (lower = applied first)
    #[serde(default)]
    pub order: u32,
}

/// Transition type for clips
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransitionType {
    #[default]
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
