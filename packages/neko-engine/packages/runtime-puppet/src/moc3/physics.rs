//! Physics support — .physics3.json parsing
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Parses Live2D physics files (.physics3.json) and converts them into
//! the format-agnostic SimplePhysics ECS components.
//!
//! Live2D physics uses a chained pendulum model: input parameters drive
//! the anchor, and the pendulum output drives output parameters.

use crate::components::{PhysicsInput, PhysicsMapMode, PhysicsModel, SimplePhysics};
use serde::Deserialize;

// ─── .physics3.json format ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct Physics3Json {
    #[serde(rename = "Meta")]
    meta: Physics3Meta,
    #[serde(rename = "PhysicsSettings", default)]
    physics_settings: Vec<Physics3Setting>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct Physics3Meta {
    #[serde(rename = "PhysicsSettingCount", default)]
    physics_setting_count: u32,
    #[serde(rename = "TotalInputCount", default)]
    total_input_count: u32,
    #[serde(rename = "TotalOutputCount", default)]
    total_output_count: u32,
    #[serde(rename = "VertexCount", default)]
    vertex_count: u32,
    #[serde(rename = "EffectiveForces")]
    effective_forces: Option<EffectiveForces>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct EffectiveForces {
    #[serde(rename = "Gravity")]
    gravity: Option<Physics3Vec2>,
    #[serde(rename = "Wind")]
    wind: Option<Physics3Vec2>,
}

#[derive(Debug, Deserialize)]
struct Physics3Vec2 {
    #[serde(rename = "X", default)]
    x: f32,
    #[serde(rename = "Y", default)]
    y: f32,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct Physics3Setting {
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "Input", default)]
    input: Vec<Physics3Input>,
    #[serde(rename = "Output", default)]
    output: Vec<Physics3Output>,
    #[serde(rename = "Vertices", default)]
    vertices: Vec<Physics3Vertex>,
    #[serde(rename = "Normalization")]
    normalization: Option<Physics3Normalization>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct Physics3Input {
    #[serde(rename = "Source")]
    source: Physics3IdRef,
    #[serde(rename = "Weight", default = "default_weight")]
    weight: f32,
    #[serde(rename = "Type")]
    r#type: String,
    #[serde(rename = "Reflect", default)]
    reflect: bool,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct Physics3Output {
    #[serde(rename = "Destination")]
    destination: Physics3IdRef,
    #[serde(rename = "VertexIndex", default)]
    vertex_index: u32,
    #[serde(rename = "Scale", default = "default_scale")]
    scale: f32,
    #[serde(rename = "Weight", default = "default_weight")]
    weight: f32,
    #[serde(rename = "Type")]
    r#type: String,
    #[serde(rename = "Reflect", default)]
    reflect: bool,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct Physics3Vertex {
    #[serde(rename = "Position")]
    position: Physics3Vec2,
    #[serde(rename = "Mobility", default = "default_mobility")]
    mobility: f32,
    #[serde(rename = "Delay", default)]
    delay: f32,
    #[serde(rename = "Acceleration", default = "default_acceleration")]
    acceleration: f32,
    #[serde(rename = "Radius", default)]
    radius: f32,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct Physics3Normalization {
    #[serde(rename = "Position")]
    position: Option<Physics3NormRange>,
    #[serde(rename = "Angle")]
    angle: Option<Physics3NormRange>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct Physics3NormRange {
    #[serde(rename = "Minimum", default)]
    minimum: f32,
    #[serde(rename = "Default", default)]
    default: f32,
    #[serde(rename = "Maximum", default)]
    maximum: f32,
}

#[derive(Debug, Deserialize)]
struct Physics3IdRef {
    #[serde(rename = "Id")]
    id: String,
}

fn default_weight() -> f32 {
    1.0
}
fn default_scale() -> f32 {
    1.0
}
fn default_mobility() -> f32 {
    1.0
}
fn default_acceleration() -> f32 {
    1.0
}

/// Result of parsing a physics3.json file
#[derive(Debug, Clone)]
pub struct PhysicsResult {
    /// SimplePhysics components to attach to entities.
    /// Each entry is (output_param_name, SimplePhysics).
    pub physics_nodes: Vec<(String, SimplePhysics)>,
}

/// Parse a .physics3.json string into SimplePhysics components.
///
/// Each physics setting with outputs is converted into SimplePhysics nodes
/// driving the output parameters via pendulum simulation.
pub fn parse_physics(json_str: &str) -> Result<PhysicsResult, String> {
    let raw: Physics3Json = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse physics3.json: {}", e))?;

    let gravity_y = raw
        .meta
        .effective_forces
        .as_ref()
        .and_then(|f| f.gravity.as_ref())
        .map(|g| g.y)
        .unwrap_or(-1.0);

    let mut nodes = Vec::new();

    for setting in &raw.physics_settings {
        if setting.output.is_empty() || setting.vertices.is_empty() {
            continue;
        }

        // Compute chain length from vertices
        let chain_length: f32 = setting
            .vertices
            .iter()
            .map(|v| {
                let pos_len = (v.position.x * v.position.x + v.position.y * v.position.y).sqrt();
                pos_len.max(v.radius).max(1.0)
            })
            .sum();

        // Average mobility → frequency
        let avg_mobility: f32 = if setting.vertices.is_empty() {
            1.0
        } else {
            setting.vertices.iter().map(|v| v.mobility).sum::<f32>()
                / setting.vertices.len() as f32
        };
        let frequency = avg_mobility.clamp(0.01, 10.0);

        // Build input parameter list
        let inputs: Vec<PhysicsInput> = setting
            .input
            .iter()
            .map(|inp| PhysicsInput {
                param_name: inp.source.id.clone(),
                weight: inp.weight,
                input_type: inp.r#type.clone(),
            })
            .collect();

        // Create a SimplePhysics for each output parameter
        for output in &setting.output {
            let map_mode = match output.r#type.as_str() {
                "X" => PhysicsMapMode::XY,
                "Y" => PhysicsMapMode::YX,
                "Angle" => PhysicsMapMode::AngleLength,
                _ => PhysicsMapMode::AngleLength,
            };

            let physics = SimplePhysics {
                param_name: output.destination.id.clone(),
                model: PhysicsModel::RigidPendulum,
                map_mode,
                gravity: gravity_y.abs(),
                length: chain_length.max(1.0),
                frequency,
                angle_damping: 0.5,
                length_damping: 0.5,
                output_scale: [output.scale, output.scale],
                local_only: false,
                inputs: inputs.clone(),
            };

            nodes.push((output.destination.id.clone(), physics));
        }
    }

    Ok(PhysicsResult {
        physics_nodes: nodes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_physics_basic() {
        let json = r#"{
            "Meta": {
                "PhysicsSettingCount": 1,
                "TotalInputCount": 1,
                "TotalOutputCount": 1,
                "VertexCount": 2,
                "EffectiveForces": {
                    "Gravity": { "X": 0, "Y": -1 },
                    "Wind": { "X": 0, "Y": 0 }
                }
            },
            "PhysicsSettings": [
                {
                    "Id": "PhysicsSetting1",
                    "Input": [
                        {
                            "Source": { "Id": "ParamAngleX" },
                            "Weight": 1.0,
                            "Type": "X",
                            "Reflect": false
                        }
                    ],
                    "Output": [
                        {
                            "Destination": { "Id": "ParamHairFront" },
                            "VertexIndex": 1,
                            "Scale": 0.5,
                            "Weight": 1.0,
                            "Type": "Angle",
                            "Reflect": false
                        }
                    ],
                    "Vertices": [
                        { "Position": { "X": 0, "Y": 0 }, "Mobility": 1.0, "Delay": 0.1, "Acceleration": 1.0, "Radius": 0 },
                        { "Position": { "X": 0, "Y": 10 }, "Mobility": 0.8, "Delay": 0.2, "Acceleration": 1.0, "Radius": 0 }
                    ],
                    "Normalization": {
                        "Position": { "Minimum": -10, "Default": 0, "Maximum": 10 },
                        "Angle": { "Minimum": -30, "Default": 0, "Maximum": 30 }
                    }
                }
            ]
        }"#;
        let result = parse_physics(json).unwrap();
        assert_eq!(result.physics_nodes.len(), 1);
        assert_eq!(result.physics_nodes[0].0, "ParamHairFront");
        assert_eq!(result.physics_nodes[0].1.model, PhysicsModel::RigidPendulum);
        assert!((result.physics_nodes[0].1.output_scale[0] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_parse_physics_empty() {
        let json = r#"{
            "Meta": {
                "PhysicsSettingCount": 0,
                "TotalInputCount": 0,
                "TotalOutputCount": 0,
                "VertexCount": 0
            },
            "PhysicsSettings": []
        }"#;
        let result = parse_physics(json).unwrap();
        assert!(result.physics_nodes.is_empty());
    }

    #[test]
    fn test_parse_physics_invalid() {
        assert!(parse_physics("not json").is_err());
    }

    #[test]
    fn test_parse_physics_multiple_outputs() {
        let json = r#"{
            "Meta": { "PhysicsSettingCount": 1, "TotalInputCount": 1, "TotalOutputCount": 2, "VertexCount": 2 },
            "PhysicsSettings": [
                {
                    "Id": "PhysicsSetting1",
                    "Input": [{ "Source": { "Id": "ParamAngleX" }, "Weight": 1.0, "Type": "X", "Reflect": false }],
                    "Output": [
                        { "Destination": { "Id": "ParamHairFront" }, "VertexIndex": 1, "Scale": 1.0, "Weight": 1.0, "Type": "Angle", "Reflect": false },
                        { "Destination": { "Id": "ParamHairBack" }, "VertexIndex": 1, "Scale": 0.8, "Weight": 1.0, "Type": "X", "Reflect": false }
                    ],
                    "Vertices": [
                        { "Position": { "X": 0, "Y": 0 }, "Mobility": 1.0, "Delay": 0.0, "Acceleration": 1.0, "Radius": 0 },
                        { "Position": { "X": 0, "Y": 5 }, "Mobility": 1.0, "Delay": 0.0, "Acceleration": 1.0, "Radius": 0 }
                    ]
                }
            ]
        }"#;
        let result = parse_physics(json).unwrap();
        assert_eq!(result.physics_nodes.len(), 2);
        assert_eq!(result.physics_nodes[0].1.map_mode, PhysicsMapMode::AngleLength);
        assert_eq!(result.physics_nodes[1].1.map_mode, PhysicsMapMode::XY);
    }
}
