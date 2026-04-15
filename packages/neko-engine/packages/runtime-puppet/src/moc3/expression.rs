//! Expression support — .exp3.json parsing and application
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Parses Live2D expression files (.exp3.json) and converts them into
//! parameter overrides with blend mode support.

use serde::{Deserialize, Serialize};

/// Blend mode for expression parameter overrides
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub enum ExpressionBlendMode {
    /// Add the value to the current parameter value
    #[default]
    Add,
    /// Multiply the current parameter value
    Multiply,
    /// Override the current parameter value entirely
    Override,
}

/// A single parameter override within an expression
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpressionParameter {
    pub id: String,
    pub value: f32,
    pub blend: ExpressionBlendMode,
}

/// A parsed expression definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpressionDef {
    pub name: String,
    pub fade_in_time: f32,
    pub fade_out_time: f32,
    pub parameters: Vec<ExpressionParameter>,
}

/// Expression info for the frontend UI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpressionInfo {
    pub name: String,
    pub parameter_count: usize,
}

// ─── .exp3.json format ───────────────────────────────────────────────────────

/// Raw .exp3.json file structure
#[derive(Debug, Serialize, Deserialize)]
struct Exp3Json {
    #[serde(rename = "Type")]
    r#type: Option<String>,
    #[serde(rename = "FadeInTime", default = "default_fade_time")]
    fade_in_time: f32,
    #[serde(rename = "FadeOutTime", default = "default_fade_time")]
    fade_out_time: f32,
    #[serde(rename = "Parameters", default)]
    parameters: Vec<Exp3Parameter>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Exp3Parameter {
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "Value", default)]
    value: f32,
    #[serde(rename = "Blend", default = "default_blend_str")]
    blend: String,
}

fn default_fade_time() -> f32 {
    0.5
}

fn default_blend_str() -> String {
    "Add".to_string()
}

/// Parse a .exp3.json string into an ExpressionDef.
pub fn parse_expression(name: &str, json_str: &str) -> Result<ExpressionDef, String> {
    let raw: Exp3Json =
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse exp3.json: {}", e))?;

    let parameters = raw
        .parameters
        .into_iter()
        .map(|p| ExpressionParameter {
            id: p.id,
            value: p.value,
            blend: match p.blend.as_str() {
                "Multiply" => ExpressionBlendMode::Multiply,
                "Override" => ExpressionBlendMode::Override,
                _ => ExpressionBlendMode::Add,
            },
        })
        .collect();

    Ok(ExpressionDef {
        name: name.to_string(),
        fade_in_time: raw.fade_in_time,
        fade_out_time: raw.fade_out_time,
        parameters,
    })
}

/// Serialize an ExpressionDef back to .exp3.json format.
pub fn serialize_expression3(expr: &ExpressionDef) -> Result<String, String> {
    let parameters: Vec<Exp3Parameter> = expr
        .parameters
        .iter()
        .map(|p| Exp3Parameter {
            id: p.id.clone(),
            value: p.value,
            blend: match p.blend {
                ExpressionBlendMode::Add => "Add".to_string(),
                ExpressionBlendMode::Multiply => "Multiply".to_string(),
                ExpressionBlendMode::Override => "Override".to_string(),
            },
        })
        .collect();

    let raw = Exp3Json {
        r#type: Some("Live2D Expression".to_string()),
        fade_in_time: expr.fade_in_time,
        fade_out_time: expr.fade_out_time,
        parameters,
    };

    serde_json::to_string_pretty(&raw).map_err(|e| format!("Failed to serialize exp3: {e}"))
}

/// Apply an expression to parameter values.
///
/// Returns the modified parameter values as (name, new_value) pairs.
/// `weight` controls fade: 0.0 = no effect, 1.0 = full effect.
pub fn apply_expression(
    expression: &ExpressionDef,
    current_params: &[(String, f32)],
    weight: f32,
) -> Vec<(String, f32)> {
    let mut result: Vec<(String, f32)> = current_params.to_vec();

    for ep in &expression.parameters {
        if let Some((_name, current)) = result.iter_mut().find(|(n, _)| *n == ep.id) {
            let target = match ep.blend {
                ExpressionBlendMode::Add => *current + ep.value,
                ExpressionBlendMode::Multiply => *current * ep.value,
                ExpressionBlendMode::Override => ep.value,
            };
            // Blend between current and target based on weight
            *current = *current + (target - *current) * weight;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_expression_basic() {
        let json = r#"{
            "Type": "Live2D Expression",
            "FadeInTime": 0.5,
            "FadeOutTime": 0.3,
            "Parameters": [
                { "Id": "ParamEyeLOpen", "Value": 0.0, "Blend": "Add" },
                { "Id": "ParamMouthForm", "Value": 1.0, "Blend": "Override" }
            ]
        }"#;
        let expr = parse_expression("smile", json).unwrap();
        assert_eq!(expr.name, "smile");
        assert_eq!(expr.fade_in_time, 0.5);
        assert_eq!(expr.fade_out_time, 0.3);
        assert_eq!(expr.parameters.len(), 2);
        assert_eq!(expr.parameters[0].blend, ExpressionBlendMode::Add);
        assert_eq!(expr.parameters[1].blend, ExpressionBlendMode::Override);
    }

    #[test]
    fn test_parse_expression_defaults() {
        let json = r#"{
            "Parameters": [
                { "Id": "Param1", "Value": 0.5 }
            ]
        }"#;
        let expr = parse_expression("test", json).unwrap();
        assert_eq!(expr.fade_in_time, 0.5);
        assert_eq!(expr.fade_out_time, 0.5);
        assert_eq!(expr.parameters[0].blend, ExpressionBlendMode::Add);
    }

    #[test]
    fn test_serialize_expression3_round_trip() {
        let json = r#"{
            "Type": "Live2D Expression",
            "FadeInTime": 0.5,
            "FadeOutTime": 0.3,
            "Parameters": [
                { "Id": "ParamEyeLOpen", "Value": 0.0, "Blend": "Add" },
                { "Id": "ParamMouthForm", "Value": 1.0, "Blend": "Override" }
            ]
        }"#;
        let expr = parse_expression("smile", json).unwrap();
        let exported = serialize_expression3(&expr).unwrap();
        let re_parsed = parse_expression("smile", &exported).unwrap();

        assert_eq!(re_parsed.fade_in_time, 0.5);
        assert_eq!(re_parsed.fade_out_time, 0.3);
        assert_eq!(re_parsed.parameters.len(), 2);
        assert_eq!(re_parsed.parameters[0].id, "ParamEyeLOpen");
        assert!((re_parsed.parameters[0].value - 0.0).abs() < 1e-6);
        assert_eq!(re_parsed.parameters[0].blend, ExpressionBlendMode::Add);
        assert_eq!(re_parsed.parameters[1].id, "ParamMouthForm");
        assert!((re_parsed.parameters[1].value - 1.0).abs() < 1e-6);
        assert_eq!(re_parsed.parameters[1].blend, ExpressionBlendMode::Override);
    }

    #[test]
    fn test_serialize_expression3_defaults_round_trip() {
        let expr = ExpressionDef {
            name: "test".to_string(),
            fade_in_time: 0.5,
            fade_out_time: 0.5,
            parameters: vec![ExpressionParameter {
                id: "Param1".to_string(),
                value: 0.5,
                blend: ExpressionBlendMode::Add,
            }],
        };
        let exported = serialize_expression3(&expr).unwrap();
        let re_parsed = parse_expression("test", &exported).unwrap();
        assert_eq!(re_parsed.parameters.len(), 1);
        assert_eq!(re_parsed.parameters[0].blend, ExpressionBlendMode::Add);
        assert!((re_parsed.parameters[0].value - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_parse_expression_invalid() {
        assert!(parse_expression("bad", "not json").is_err());
    }

    #[test]
    fn test_apply_expression_add() {
        let expr = ExpressionDef {
            name: "test".to_string(),
            fade_in_time: 0.5,
            fade_out_time: 0.5,
            parameters: vec![ExpressionParameter {
                id: "ParamAngleX".to_string(),
                value: 10.0,
                blend: ExpressionBlendMode::Add,
            }],
        };
        let current = vec![("ParamAngleX".to_string(), 5.0)];
        let result = apply_expression(&expr, &current, 1.0);
        assert!((result[0].1 - 15.0).abs() < 1e-6);
    }

    #[test]
    fn test_apply_expression_multiply() {
        let expr = ExpressionDef {
            name: "test".to_string(),
            fade_in_time: 0.5,
            fade_out_time: 0.5,
            parameters: vec![ExpressionParameter {
                id: "Param".to_string(),
                value: 0.5,
                blend: ExpressionBlendMode::Multiply,
            }],
        };
        let current = vec![("Param".to_string(), 10.0)];
        let result = apply_expression(&expr, &current, 1.0);
        assert!((result[0].1 - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_apply_expression_override() {
        let expr = ExpressionDef {
            name: "test".to_string(),
            fade_in_time: 0.5,
            fade_out_time: 0.5,
            parameters: vec![ExpressionParameter {
                id: "Param".to_string(),
                value: 42.0,
                blend: ExpressionBlendMode::Override,
            }],
        };
        let current = vec![("Param".to_string(), 10.0)];
        let result = apply_expression(&expr, &current, 1.0);
        assert!((result[0].1 - 42.0).abs() < 1e-6);
    }

    #[test]
    fn test_apply_expression_weight_half() {
        let expr = ExpressionDef {
            name: "test".to_string(),
            fade_in_time: 0.5,
            fade_out_time: 0.5,
            parameters: vec![ExpressionParameter {
                id: "Param".to_string(),
                value: 20.0,
                blend: ExpressionBlendMode::Override,
            }],
        };
        let current = vec![("Param".to_string(), 10.0)];
        let result = apply_expression(&expr, &current, 0.5);
        // 10 + (20 - 10) * 0.5 = 15
        assert!((result[0].1 - 15.0).abs() < 1e-6);
    }

    #[test]
    fn test_apply_expression_missing_param() {
        let expr = ExpressionDef {
            name: "test".to_string(),
            fade_in_time: 0.5,
            fade_out_time: 0.5,
            parameters: vec![ExpressionParameter {
                id: "NonExistent".to_string(),
                value: 99.0,
                blend: ExpressionBlendMode::Override,
            }],
        };
        let current = vec![("Param".to_string(), 10.0)];
        let result = apply_expression(&expr, &current, 1.0);
        // Non-existent param should not affect result
        assert!((result[0].1 - 10.0).abs() < 1e-6);
    }
}
