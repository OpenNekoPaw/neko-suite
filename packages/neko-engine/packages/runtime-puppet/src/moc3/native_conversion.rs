//! MOC3 to native `.nkp` v2 draft conversion.

use crate::animation::AnimationClip;
use crate::moc3::expression::{ExpressionBlendMode, ExpressionDef};
use crate::moc3::loader;
use crate::moc3::parser::{self, DeformerType, Moc3Data};
use crate::moc3::physics::PhysicsResult;
use glam::Vec2;
use neko_engine_types::puppet::{
    AnimationClip2D, NkpAnimationModel, NkpAutoRigMetadata, NkpBlendShapeDef, NkpBlendShapeLibrary,
    NkpBlendShapeTrack, NkpBone2D, NkpControlDriver, NkpControlSource, NkpControlTarget,
    NkpDriverBlendMode, NkpDriverCurve, NkpImportSource, NkpImportSourceKind, NkpLayer,
    NkpLayerMesh, NkpPuppetSource, NkpScalarKeyframe, NkpSkeleton2D, NkpSpringBone2D,
    NkpViewportState,
};
use std::collections::{BTreeMap, BTreeSet};

/// Diagnostic severity for partial MOC3 conversion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConversionDiagnosticSeverity {
    Info,
    Warning,
    Unsupported,
}

/// Machine-readable conversion diagnostic.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversionDiagnostic {
    pub severity: ConversionDiagnosticSeverity,
    pub code: String,
    pub message: String,
}

/// Optional auxiliary Live2D JSON documents for richer conversion.
#[derive(Debug, Default)]
pub struct Moc3ConversionAuxiliary {
    pub expressions: Vec<ExpressionDef>,
    pub motions: Vec<AnimationClip>,
    pub physics: Option<PhysicsResult>,
}

/// Conversion output.
#[derive(Debug)]
pub struct Moc3ToNativeDraft {
    pub project: neko_engine_types::puppet::NkpProjectData,
    pub diagnostics: Vec<ConversionDiagnostic>,
}

/// Convert parsed MOC3 data into a loadable native puppet project draft.
pub fn convert_moc3_to_native_project(
    moc3: &Moc3Data,
    source_path: Option<String>,
    auxiliary: Moc3ConversionAuxiliary,
) -> Moc3ToNativeDraft {
    let mut diagnostics = Vec::new();
    let mut bones = vec![NkpBone2D {
        id: "bone-root".to_string(),
        name: "root".to_string(),
        parent: None,
        position: [0.0, 0.0],
        rotation: Some(0.0),
        scale: Some([1.0, 1.0]),
        length: Some(0.0),
    }];
    let mut control_drivers = Vec::new();
    let mut rotation_bone_by_deformer = BTreeMap::new();

    for (deformer_index, deformer) in moc3.deformers.iter().enumerate() {
        if deformer.deformer_type != DeformerType::Rotation {
            continue;
        }
        let specific_index = deformer.specific_index.max(0) as usize;
        let Some(rotation) = moc3.rotation_deformers.get(specific_index) else {
            diagnostics.push(diagnostic(
                ConversionDiagnosticSeverity::Warning,
                "rotation-deformer-missing-specific",
                format!("Rotation deformer '{}' has no specific data", deformer.id),
            ));
            continue;
        };

        let bone_id = format!("bone-{}", deformer.id);
        let parent = if deformer.parent_deformer_index >= 0 {
            rotation_bone_by_deformer
                .get(&(deformer.parent_deformer_index as usize))
                .cloned()
                .unwrap_or_else(|| "bone-root".to_string())
        } else {
            "bone-root".to_string()
        };
        bones.push(NkpBone2D {
            id: bone_id.clone(),
            name: deformer.id.clone(),
            parent: Some(parent),
            position: [0.0, 0.0],
            rotation: Some(rotation.base_angle),
            scale: Some([1.0, 1.0]),
            length: Some(1.0),
        });
        rotation_bone_by_deformer.insert(deformer_index, bone_id.clone());

        if let Some(param_name) =
            find_binding_parameter(moc3, rotation.keyform_binding_sources_index)
        {
            control_drivers.push(NkpControlDriver {
                id: format!("driver-{}-rotation", deformer.id),
                source: NkpControlSource::Live2dParam {
                    name: param_name.clone(),
                },
                target: NkpControlTarget::BoneRotation {
                    bone: bone_id,
                    axis: neko_engine_types::puppet::NkpAxis2D::Z,
                },
                curve: rotation_curve(moc3, rotation.keyform_binding_sources_index, rotation),
                blend_mode: NkpDriverBlendMode::Override,
                priority: 0,
            });
        } else {
            diagnostics.push(diagnostic(
                ConversionDiagnosticSeverity::Warning,
                "rotation-deformer-missing-parameter",
                format!(
                    "Rotation deformer '{}' converted to a bone without a driver",
                    deformer.id
                ),
            ));
        }
    }

    let mut layers = Vec::new();
    let mut shapes = Vec::new();
    let mut implemented = BTreeSet::new();

    for (mesh_index, art_mesh) in moc3.art_meshes.iter().enumerate() {
        let vertex_count = art_mesh.vertex_count as usize;
        let key_forms = loader::build_art_mesh_key_forms(moc3, mesh_index, vertex_count);
        let base_vertices = key_forms
            .iter()
            .find(|key_form| key_form.param_value.abs() < 1e-6)
            .or_else(|| key_forms.first())
            .map(|key_form| key_form.vertices.clone())
            .unwrap_or_else(|| vec![Vec2::ZERO; vertex_count]);
        let uvs = read_mesh_uvs(moc3, art_mesh.uv_sources_begin, vertex_count);
        let triangles = read_mesh_triangles(
            moc3,
            art_mesh.position_index_sources_begin,
            art_mesh.position_index_sources_count,
        );

        layers.push(NkpLayer {
            id: format!("layer-{}", art_mesh.id),
            name: Some(art_mesh.id.clone()),
            texture_ref: format!("texture://{}", art_mesh.texture_index),
            mesh: NkpLayerMesh {
                id: art_mesh.id.clone(),
                vertices: base_vertices
                    .iter()
                    .map(|vertex| [vertex.x, vertex.y])
                    .collect(),
                uvs: uvs.iter().map(|uv| [uv.x, uv.y]).collect(),
                triangles,
            },
            blend_mode: Some(format!(
                "{:?}",
                parser::blend_mode_from_flags(art_mesh.drawable_flags)
            )),
            opacity: Some(if art_mesh.is_visible { 1.0 } else { 0.0 }),
            z_order: Some(mesh_index as f32),
            skin_weights: None,
        });

        if key_forms.len() > 1 {
            let param_name = find_binding_parameter(moc3, art_mesh.keyform_binding_sources_index)
                .unwrap_or_else(|| format!("ParamMesh{}", mesh_index));
            for key_form in key_forms {
                if key_form.param_value.abs() < 1e-6
                    || key_form.vertices.len() != base_vertices.len()
                {
                    continue;
                }
                let shape_name = format!("{}@{}", param_name, key_form.param_value);
                let deltas = key_form
                    .vertices
                    .iter()
                    .zip(base_vertices.iter())
                    .map(|(vertex, base)| {
                        let delta = *vertex - *base;
                        [delta.x, delta.y]
                    })
                    .collect();
                implemented.insert(shape_name.clone());
                shapes.push(NkpBlendShapeDef {
                    id: Some(format!("shape-{}-{}", art_mesh.id, key_form.param_value)),
                    name: shape_name,
                    mesh_id: art_mesh.id.clone(),
                    vertex_deltas: deltas,
                    post_skin: Some(false),
                });
            }
        }

        if art_mesh.drawable_flags != 0 {
            diagnostics.push(diagnostic(
                ConversionDiagnosticSeverity::Info,
                "drawable-flags-preserved-as-diagnostic",
                format!(
                    "Drawable '{}' has flags {}; exact mask/clipping parity requires golden render validation",
                    art_mesh.id, art_mesh.drawable_flags
                ),
            ));
        }
    }

    for deformer in &moc3.deformers {
        if deformer.deformer_type == DeformerType::Warp {
            diagnostics.push(diagnostic(
                ConversionDiagnosticSeverity::Unsupported,
                "warp-deformer-sampled-as-mesh-blendshape",
                format!(
                    "Warp deformer '{}' requires multi-parameter sampling for full fidelity",
                    deformer.id
                ),
            ));
        }
    }
    if moc3.counts.drawable_masks > 0 || moc3.counts.draw_order_groups > 0 {
        diagnostics.push(diagnostic(
            ConversionDiagnosticSeverity::Unsupported,
            "mask-or-draw-order-needs-fallback",
            "Dynamic masks, clipping, or draw order require explicit fallback or golden validation"
                .to_string(),
        ));
    }

    let expressions = convert_expressions(&auxiliary.expressions);
    let animations = auxiliary
        .motions
        .iter()
        .map(convert_motion_clip)
        .collect::<Vec<_>>();
    let mut spring_bones = Vec::new();
    if let Some(physics) = &auxiliary.physics {
        for (param_name, physics_node) in &physics.physics_nodes {
            spring_bones.push(NkpSpringBone2D {
                id: format!("spring-{}", param_name),
                bone: "bone-root".to_string(),
                stiffness: physics_node.frequency,
                damping: physics_node.angle_damping.max(physics_node.length_damping),
                gravity_scale: Some(physics_node.gravity),
                wind_influence: None,
            });
            control_drivers.push(NkpControlDriver {
                id: format!("driver-physics-{}", param_name),
                source: NkpControlSource::Live2dParam {
                    name: param_name.clone(),
                },
                target: NkpControlTarget::BoneRotation {
                    bone: "bone-root".to_string(),
                    axis: neko_engine_types::puppet::NkpAxis2D::Z,
                },
                curve: NkpDriverCurve::Linear {
                    scale: Some(physics_node.output_scale[0]),
                    offset: Some(0.0),
                },
                blend_mode: NkpDriverBlendMode::Add,
                priority: 10,
            });
        }
    }

    let project = neko_engine_types::puppet::NkpProjectData {
        version: "2.0".to_string(),
        name: "Converted MOC3 Native Draft".to_string(),
        puppet: NkpPuppetSource {
            src: None,
            format: Some(neko_engine_types::puppet::PuppetFormat::Native),
            animation_model: Some(NkpAnimationModel::BoneBlendshape),
            import_source: Some(NkpImportSource {
                kind: NkpImportSourceKind::Moc3,
                path: source_path,
                content_hash: None,
                metadata: None,
            }),
            bundle: None,
        },
        layers,
        skeleton: Some(NkpSkeleton2D {
            bones,
            ik_constraints: vec![],
            path_constraints: vec![],
            spring_bones,
        }),
        blend_shapes: Some(NkpBlendShapeLibrary {
            standard: Some(neko_engine_types::puppet::NkpBlendShapeStandard::Custom),
            implemented: implemented.into_iter().collect(),
            shapes,
            custom: vec![],
            aliases: BTreeMap::new(),
        }),
        control_drivers,
        expressions,
        animations,
        auto_rig: Some(NkpAutoRigMetadata {
            template: "custom".to_string(),
            generated_by: "moc3-native-converter/initial".to_string(),
            confidence: 0.5,
            model_version: None,
            user_adjusted: vec![],
            source_kind: Some(NkpImportSourceKind::Moc3),
        }),
        parameters: moc3
            .parameters
            .iter()
            .map(|parameter| (parameter.id.clone(), parameter.default_value))
            .collect(),
        face_parameters: BTreeMap::new(),
        viewport: NkpViewportState { zoom: 1.0 },
    };

    Moc3ToNativeDraft {
        project,
        diagnostics,
    }
}

fn rotation_curve(
    moc3: &Moc3Data,
    binding_index: i32,
    rotation: &parser::Moc3RotationDeformer,
) -> NkpDriverCurve {
    let keys = get_binding_key_values(moc3, binding_index);
    let angles = read_rotation_angles(moc3, rotation);
    if keys.len() >= 2 && angles.len() >= 2 {
        let key_delta = keys[keys.len() - 1] - keys[0];
        let angle_delta = angles[angles.len() - 1] - angles[0];
        if key_delta.abs() > 1e-6 {
            return NkpDriverCurve::Linear {
                scale: Some(angle_delta / key_delta),
                offset: Some(angles[0] - keys[0] * angle_delta / key_delta),
            };
        }
    }
    NkpDriverCurve::Linear {
        scale: Some(1.0),
        offset: Some(rotation.base_angle),
    }
}

fn convert_expressions(expressions: &[ExpressionDef]) -> BTreeMap<String, BTreeMap<String, f32>> {
    expressions
        .iter()
        .map(|expression| {
            let weights = expression
                .parameters
                .iter()
                .filter_map(|parameter| match parameter.blend {
                    ExpressionBlendMode::Add | ExpressionBlendMode::Override => {
                        Some((parameter.id.clone(), parameter.value))
                    }
                    ExpressionBlendMode::Multiply => None,
                })
                .collect();
            (expression.name.clone(), weights)
        })
        .collect()
}

fn convert_motion_clip(clip: &AnimationClip) -> AnimationClip2D {
    AnimationClip2D {
        name: clip.name.clone(),
        duration_ms: clip.duration_ms,
        bone_tracks: vec![],
        blendshape_tracks: clip
            .curves
            .iter()
            .map(|curve| NkpBlendShapeTrack {
                blendshape: curve.param_name.clone(),
                weight_keys: curve
                    .keyframes
                    .iter()
                    .map(|keyframe| NkpScalarKeyframe {
                        time_ms: keyframe.time_ms,
                        value: keyframe.value,
                        easing: None,
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn read_mesh_uvs(moc3: &Moc3Data, begin: i32, vertex_count: usize) -> Vec<Vec2> {
    if begin < 0 {
        return vec![Vec2::ZERO; vertex_count];
    }
    let begin = begin as usize;
    if begin + vertex_count <= moc3.uvs.len() {
        moc3.uvs[begin..begin + vertex_count].to_vec()
    } else {
        vec![Vec2::ZERO; vertex_count]
    }
}

fn read_mesh_triangles(moc3: &Moc3Data, begin: i32, count: i32) -> Vec<[u32; 3]> {
    if begin < 0 || count <= 0 {
        return Vec::new();
    }
    let begin = begin as usize;
    let count = count as usize;
    if begin + count > moc3.position_indices.len() {
        return Vec::new();
    }
    moc3.position_indices[begin..begin + count]
        .chunks(3)
        .filter_map(|chunk| {
            if chunk.len() == 3 {
                Some([chunk[0] as u32, chunk[1] as u32, chunk[2] as u32])
            } else {
                None
            }
        })
        .collect()
}

fn read_rotation_angles(moc3: &Moc3Data, rotation: &parser::Moc3RotationDeformer) -> Vec<f32> {
    if rotation.keyform_angles_begin < 0 || rotation.keyform_sources_count <= 0 {
        return Vec::new();
    }
    let begin = rotation.keyform_angles_begin as usize;
    let count = rotation.keyform_sources_count as usize;
    if begin + count <= moc3.rotation_deformer_keyform_angles.len() {
        moc3.rotation_deformer_keyform_angles[begin..begin + count].to_vec()
    } else {
        Vec::new()
    }
}

fn find_binding_parameter(moc3: &Moc3Data, binding_index: i32) -> Option<String> {
    if binding_index < 0 {
        return None;
    }
    let binding_index = binding_index as usize;
    moc3.parameters.iter().find_map(|parameter| {
        if parameter.binding_sources_begin < 0 || parameter.binding_sources_count <= 0 {
            return None;
        }
        let begin = parameter.binding_sources_begin as usize;
        let end = begin + parameter.binding_sources_count as usize;
        if binding_index >= begin && binding_index < end {
            Some(parameter.id.clone())
        } else {
            None
        }
    })
}

fn get_binding_key_values(moc3: &Moc3Data, binding_index: i32) -> Vec<f32> {
    if binding_index < 0 {
        return Vec::new();
    }
    let binding_index = binding_index as usize;
    let Some(binding) = moc3.keyform_bindings.get(binding_index) else {
        return Vec::new();
    };
    if binding.band_sources_begin < 0 || binding.band_sources_count <= 0 {
        return Vec::new();
    }
    let Some(band) = moc3
        .parameter_bindings
        .get(binding.band_sources_begin as usize)
    else {
        return Vec::new();
    };
    if band.keys_sources_begin < 0 || band.keys_sources_count <= 0 {
        return Vec::new();
    }
    let begin = band.keys_sources_begin as usize;
    let count = band.keys_sources_count as usize;
    if begin + count <= moc3.key_values.len() {
        moc3.key_values[begin..begin + count].to_vec()
    } else {
        Vec::new()
    }
}

fn diagnostic(
    severity: ConversionDiagnosticSeverity,
    code: impl Into<String>,
    message: impl Into<String>,
) -> ConversionDiagnostic {
    ConversionDiagnostic {
        severity,
        code: code.into(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::moc3::parser::{
        DeformerType, ElementCounts, Moc3ArtMesh, Moc3Deformer, Moc3KeyformBinding,
        Moc3KeyformPositionSource, Moc3Parameter, Moc3ParameterBinding, Moc3RotationDeformer,
    };
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn converts_rotation_deformer_to_bone_and_driver() {
        let draft = convert_moc3_to_native_project(
            &fixture_moc3_with_rotation(),
            Some("model.moc3".into()),
            Default::default(),
        );

        let skeleton = draft.project.skeleton.as_ref().unwrap();
        assert!(skeleton.bones.iter().any(|bone| bone.id == "bone-RotHead"));
        assert!(draft
            .project
            .control_drivers
            .iter()
            .any(|driver| driver.id == "driver-RotHead-rotation"));
        assert!(draft.diagnostics.is_empty());
    }

    #[test]
    fn converts_artmesh_keyforms_to_blendshapes() {
        let draft =
            convert_moc3_to_native_project(&fixture_moc3_with_rotation(), None, Default::default());
        let blend_shapes = draft.project.blend_shapes.as_ref().unwrap();

        assert_eq!(blend_shapes.shapes.len(), 1);
        assert_eq!(blend_shapes.shapes[0].mesh_id, "MeshFace");
        assert_eq!(blend_shapes.shapes[0].vertex_deltas[1], [0.0, 1.0]);
    }

    #[test]
    fn converted_project_loads_in_native_runtime() {
        let draft =
            convert_moc3_to_native_project(&fixture_moc3_with_rotation(), None, Default::default());
        let mut world = bevy_ecs::prelude::World::new();

        crate::native::load_native_project(&mut world, &draft.project).unwrap();
    }

    #[test]
    fn warp_deformer_records_partial_conversion_diagnostic() {
        let mut moc3 = fixture_moc3_with_rotation();
        moc3.deformers.push(Moc3Deformer {
            id: "WarpFace".to_string(),
            deformer_type: DeformerType::Warp,
            is_visible: true,
            is_enabled: true,
            parent_part_index: -1,
            parent_deformer_index: -1,
            specific_index: 0,
        });

        let draft = convert_moc3_to_native_project(&moc3, None, Default::default());

        assert!(draft
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "warp-deformer-sampled-as-mesh-blendshape"));
    }

    #[test]
    fn converts_motion_and_expression_auxiliary() {
        let auxiliary = Moc3ConversionAuxiliary {
            expressions: vec![ExpressionDef {
                name: "smile".to_string(),
                fade_in_time: 0.2,
                fade_out_time: 0.2,
                parameters: vec![crate::moc3::expression::ExpressionParameter {
                    id: "ParamAngleX".to_string(),
                    value: 0.75,
                    blend: ExpressionBlendMode::Override,
                }],
            }],
            motions: vec![AnimationClip {
                name: "idle".to_string(),
                duration_ms: 1000.0,
                loop_default: true,
                curves: vec![crate::animation::ParameterCurve {
                    param_name: "ParamAngleX".to_string(),
                    keyframes: vec![crate::animation::Keyframe::new(0.0, 0.0)],
                }],
            }],
            physics: None,
        };

        let draft = convert_moc3_to_native_project(&fixture_moc3_with_rotation(), None, auxiliary);

        assert_eq!(draft.project.expressions["smile"]["ParamAngleX"], 0.75);
        assert_eq!(draft.project.animations[0].name, "idle");
        assert_eq!(
            draft.project.animations[0].blendshape_tracks[0].blendshape,
            "ParamAngleX"
        );
    }

    #[test]
    fn converts_physics_auxiliary_to_spring_and_driver() {
        let auxiliary = Moc3ConversionAuxiliary {
            expressions: vec![],
            motions: vec![],
            physics: Some(PhysicsResult {
                physics_nodes: vec![(
                    "ParamHair".to_string(),
                    crate::components::SimplePhysics {
                        param_name: "ParamHair".to_string(),
                        model: crate::components::PhysicsModel::RigidPendulum,
                        map_mode: crate::components::PhysicsMapMode::AngleLength,
                        gravity: 1.0,
                        length: 10.0,
                        frequency: 0.5,
                        angle_damping: 0.25,
                        length_damping: 0.2,
                        output_scale: [3.0, 3.0],
                        local_only: false,
                        inputs: vec![],
                    },
                )],
            }),
        };

        let draft = convert_moc3_to_native_project(&fixture_moc3_with_rotation(), None, auxiliary);
        let skeleton = draft.project.skeleton.as_ref().unwrap();

        assert_eq!(skeleton.spring_bones.len(), 1);
        assert!(draft
            .project
            .control_drivers
            .iter()
            .any(|driver| driver.id == "driver-physics-ParamHair"));
    }

    #[test]
    fn moc3_conversion_golden_render_harness_passes_generated_public_fixtures() {
        let fixtures = generated_public_golden_fixtures();
        assert!(
            fixtures.len() >= 3,
            "golden render gate requires at least three public fixtures"
        );

        let mut failures = Vec::new();
        for fixture in fixtures {
            assert_eq!(
                fixture.license, "CC0/generated",
                "golden fixture '{}' must be redistributable",
                fixture.id
            );
            let draft = convert_moc3_to_native_project(
                &fixture.moc3,
                Some(format!("fixtures/moc3-golden/{}.moc3", fixture.id)),
                Default::default(),
            );
            let reference = render_moc3_reference(&fixture.moc3, fixture.sample);
            let native = render_native_project_reference(&draft.project, fixture.sample);
            let ssim = compute_luma_ssim(&reference, &native);

            if ssim < GOLDEN_SSIM_THRESHOLD {
                let artifact_dir = write_golden_diff_artifacts(
                    fixture.id,
                    ssim,
                    &reference,
                    &native,
                    &diff_image(&reference, &native),
                )
                .expect("write golden render diff artifacts");
                failures.push(format!(
                    "{}: SSIM {:.6} < {:.3}; artifacts: {}",
                    fixture.id,
                    ssim,
                    GOLDEN_SSIM_THRESHOLD,
                    artifact_dir.display()
                ));
            }
        }

        assert!(
            failures.is_empty(),
            "MOC3 conversion golden render failures:\n{}",
            failures.join("\n")
        );
    }

    fn fixture_moc3_with_rotation() -> Moc3Data {
        Moc3Data {
            version: 3,
            counts: ElementCounts {
                parts: 0,
                deformers: 1,
                warp_deformers: 0,
                rotation_deformers: 1,
                art_meshes: 1,
                parameters: 1,
                part_keyforms: 0,
                warp_deformer_keyforms: 0,
                rotation_deformer_keyforms: 2,
                art_mesh_keyforms: 2,
                keyform_positions: 2,
                parameter_binding_indices: 0,
                keyform_bindings: 1,
                parameter_bindings: 1,
                keys: 2,
                uvs: 2,
                position_indices: 0,
                drawable_masks: 0,
                draw_order_groups: 0,
                draw_order_group_objects: 0,
            },
            parameters: vec![Moc3Parameter {
                id: "ParamAngleX".to_string(),
                min_value: 0.0,
                max_value: 1.0,
                default_value: 0.0,
                is_repeat: false,
                binding_sources_begin: 0,
                binding_sources_count: 1,
            }],
            parts: vec![],
            deformers: vec![Moc3Deformer {
                id: "RotHead".to_string(),
                deformer_type: DeformerType::Rotation,
                is_visible: true,
                is_enabled: true,
                parent_part_index: -1,
                parent_deformer_index: -1,
                specific_index: 0,
            }],
            warp_deformers: vec![],
            rotation_deformers: vec![Moc3RotationDeformer {
                base_angle: 0.0,
                keyform_sources_begin: 0,
                keyform_sources_count: 2,
                keyform_angles_begin: 0,
                keyform_binding_sources_index: 0,
            }],
            art_meshes: vec![Moc3ArtMesh {
                id: "MeshFace".to_string(),
                texture_index: 0,
                drawable_flags: 0,
                vertex_count: 2,
                is_visible: true,
                is_enabled: true,
                parent_deformer_index: 0,
                parent_part_index: -1,
                uv_sources_begin: 0,
                position_index_sources_begin: 0,
                position_index_sources_count: 0,
                keyform_position_sources_begin: 0,
                keyform_sources_begin: 0,
                keyform_sources_count: 2,
                keyform_binding_sources_index: 0,
            }],
            parameter_bindings: vec![Moc3ParameterBinding {
                keyform_binding_index: 0,
                keys_sources_begin: 0,
                keys_sources_count: 2,
            }],
            keyform_bindings: vec![Moc3KeyformBinding {
                band_sources_begin: 0,
                band_sources_count: 1,
            }],
            warp_deformer_keyform_position_sources: vec![],
            rotation_deformer_keyform_angles: vec![0.0, 30.0],
            art_mesh_keyform_position_sources: vec![
                Moc3KeyformPositionSource {
                    xys_begin: 0,
                    xys_count: 4,
                },
                Moc3KeyformPositionSource {
                    xys_begin: 4,
                    xys_count: 4,
                },
            ],
            key_values: vec![0.0, 1.0],
            uvs: vec![Vec2::ZERO, Vec2::ONE],
            position_indices: vec![],
            keyform_position_xys: vec![0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0],
        }
    }

    const GOLDEN_SIZE: u32 = 64;
    const GOLDEN_SSIM_THRESHOLD: f64 = 0.995;

    #[derive(Debug)]
    struct GoldenFixture {
        id: &'static str,
        license: &'static str,
        sample: f32,
        moc3: Moc3Data,
    }

    #[derive(Debug, Clone)]
    struct RasterImage {
        width: u32,
        height: u32,
        pixels: Vec<[u8; 4]>,
    }

    fn generated_public_golden_fixtures() -> Vec<GoldenFixture> {
        vec![
            GoldenFixture {
                id: "generated-public-face-smile",
                license: "CC0/generated",
                sample: 0.5,
                moc3: fixture_moc3_artmesh(
                    "MeshSmile",
                    vec![
                        Vec2::new(0.20, 0.72),
                        Vec2::new(0.50, 0.28),
                        Vec2::new(0.80, 0.72),
                    ],
                    vec![
                        Vec2::new(0.20, 0.68),
                        Vec2::new(0.50, 0.20),
                        Vec2::new(0.80, 0.68),
                    ],
                    vec![0, 1, 2],
                ),
            },
            GoldenFixture {
                id: "generated-public-upper-body-sway",
                license: "CC0/generated",
                sample: 0.75,
                moc3: fixture_moc3_artmesh(
                    "MeshTorso",
                    vec![
                        Vec2::new(0.28, 0.22),
                        Vec2::new(0.72, 0.22),
                        Vec2::new(0.76, 0.82),
                        Vec2::new(0.24, 0.82),
                    ],
                    vec![
                        Vec2::new(0.34, 0.22),
                        Vec2::new(0.78, 0.22),
                        Vec2::new(0.70, 0.82),
                        Vec2::new(0.18, 0.82),
                    ],
                    vec![0, 1, 2, 0, 2, 3],
                ),
            },
            GoldenFixture {
                id: "generated-public-chibi-mouth-open",
                license: "CC0/generated",
                sample: 1.0,
                moc3: fixture_moc3_artmesh(
                    "MeshMouth",
                    vec![
                        Vec2::new(0.30, 0.42),
                        Vec2::new(0.70, 0.42),
                        Vec2::new(0.68, 0.58),
                        Vec2::new(0.32, 0.58),
                    ],
                    vec![
                        Vec2::new(0.28, 0.36),
                        Vec2::new(0.72, 0.36),
                        Vec2::new(0.70, 0.68),
                        Vec2::new(0.30, 0.68),
                    ],
                    vec![0, 1, 2, 0, 2, 3],
                ),
            },
        ]
    }

    fn fixture_moc3_artmesh(
        mesh_id: &str,
        base_vertices: Vec<Vec2>,
        deformed_vertices: Vec<Vec2>,
        indices: Vec<u16>,
    ) -> Moc3Data {
        assert_eq!(base_vertices.len(), deformed_vertices.len());
        let vertex_count = base_vertices.len();
        let mut keyform_position_xys = Vec::with_capacity(vertex_count * 4);
        for vertex in &base_vertices {
            keyform_position_xys.push(vertex.x);
            keyform_position_xys.push(vertex.y);
        }
        for vertex in &deformed_vertices {
            keyform_position_xys.push(vertex.x);
            keyform_position_xys.push(vertex.y);
        }

        Moc3Data {
            version: 3,
            counts: ElementCounts {
                parts: 0,
                deformers: 0,
                warp_deformers: 0,
                rotation_deformers: 0,
                art_meshes: 1,
                parameters: 1,
                part_keyforms: 0,
                warp_deformer_keyforms: 0,
                rotation_deformer_keyforms: 0,
                art_mesh_keyforms: 2,
                keyform_positions: 2,
                parameter_binding_indices: 0,
                keyform_bindings: 1,
                parameter_bindings: 1,
                keys: 2,
                uvs: vertex_count as u32,
                position_indices: indices.len() as u32,
                drawable_masks: 0,
                draw_order_groups: 0,
                draw_order_group_objects: 0,
            },
            parameters: vec![Moc3Parameter {
                id: "ParamBlend".to_string(),
                min_value: 0.0,
                max_value: 1.0,
                default_value: 0.0,
                is_repeat: false,
                binding_sources_begin: 0,
                binding_sources_count: 1,
            }],
            parts: vec![],
            deformers: vec![],
            warp_deformers: vec![],
            rotation_deformers: vec![],
            art_meshes: vec![Moc3ArtMesh {
                id: mesh_id.to_string(),
                texture_index: 0,
                drawable_flags: 0,
                vertex_count: vertex_count as u32,
                is_visible: true,
                is_enabled: true,
                parent_deformer_index: -1,
                parent_part_index: -1,
                uv_sources_begin: 0,
                position_index_sources_begin: 0,
                position_index_sources_count: indices.len() as i32,
                keyform_position_sources_begin: 0,
                keyform_sources_begin: 0,
                keyform_sources_count: 2,
                keyform_binding_sources_index: 0,
            }],
            parameter_bindings: vec![Moc3ParameterBinding {
                keyform_binding_index: 0,
                keys_sources_begin: 0,
                keys_sources_count: 2,
            }],
            keyform_bindings: vec![Moc3KeyformBinding {
                band_sources_begin: 0,
                band_sources_count: 1,
            }],
            warp_deformer_keyform_position_sources: vec![],
            rotation_deformer_keyform_angles: vec![],
            art_mesh_keyform_position_sources: vec![
                Moc3KeyformPositionSource {
                    xys_begin: 0,
                    xys_count: (vertex_count * 2) as i32,
                },
                Moc3KeyformPositionSource {
                    xys_begin: (vertex_count * 2) as i32,
                    xys_count: (vertex_count * 2) as i32,
                },
            ],
            key_values: vec![0.0, 1.0],
            uvs: base_vertices.clone(),
            position_indices: indices,
            keyform_position_xys,
        }
    }

    fn render_moc3_reference(moc3: &Moc3Data, sample: f32) -> RasterImage {
        let mut image = RasterImage::new(GOLDEN_SIZE, GOLDEN_SIZE);
        for (mesh_index, art_mesh) in moc3.art_meshes.iter().enumerate() {
            let key_forms =
                loader::build_art_mesh_key_forms(moc3, mesh_index, art_mesh.vertex_count as usize);
            let vertices = crate::moc3::interpolation::interpolate_1d(&key_forms, sample)
                .or_else(|| key_forms.first().map(|key_form| key_form.vertices.clone()))
                .unwrap_or_default();
            let triangles = read_mesh_triangles(
                moc3,
                art_mesh.position_index_sources_begin,
                art_mesh.position_index_sources_count,
            );
            rasterize_mesh(&mut image, &vertices, &triangles, color_for_mesh(mesh_index));
        }
        image
    }

    fn render_native_project_reference(
        project: &neko_engine_types::puppet::NkpProjectData,
        sample: f32,
    ) -> RasterImage {
        let mut image = RasterImage::new(GOLDEN_SIZE, GOLDEN_SIZE);
        let shapes = project
            .blend_shapes
            .as_ref()
            .map(|library| library.shapes.as_slice())
            .unwrap_or(&[]);

        for (layer_index, layer) in project.layers.iter().enumerate() {
            let mut vertices: Vec<Vec2> = layer
                .mesh
                .vertices
                .iter()
                .map(|vertex| Vec2::new(vertex[0], vertex[1]))
                .collect();
            for shape in shapes.iter().filter(|shape| shape.mesh_id == layer.mesh.id) {
                let weight = native_shape_weight(&shape.name, sample);
                if weight.abs() <= f32::EPSILON {
                    continue;
                }
                for (vertex, delta) in vertices.iter_mut().zip(shape.vertex_deltas.iter()) {
                    *vertex += Vec2::new(delta[0], delta[1]) * weight;
                }
            }
            rasterize_mesh(
                &mut image,
                &vertices,
                &layer.mesh.triangles,
                color_for_mesh(layer_index),
            );
        }
        image
    }

    fn native_shape_weight(shape_name: &str, sample: f32) -> f32 {
        let Some((_, value)) = shape_name.rsplit_once('@') else {
            return sample.clamp(0.0, 1.0);
        };
        let Ok(key_value) = value.parse::<f32>() else {
            return sample.clamp(0.0, 1.0);
        };
        if key_value.abs() <= f32::EPSILON {
            0.0
        } else {
            (sample / key_value).clamp(0.0, 1.0)
        }
    }

    fn rasterize_mesh(
        image: &mut RasterImage,
        vertices: &[Vec2],
        triangles: &[[u32; 3]],
        color: [u8; 4],
    ) {
        for triangle in triangles {
            let Some(a) = vertices.get(triangle[0] as usize).copied() else {
                continue;
            };
            let Some(b) = vertices.get(triangle[1] as usize).copied() else {
                continue;
            };
            let Some(c) = vertices.get(triangle[2] as usize).copied() else {
                continue;
            };
            rasterize_triangle(image, a, b, c, color);
        }
    }

    fn rasterize_triangle(image: &mut RasterImage, a: Vec2, b: Vec2, c: Vec2, color: [u8; 4]) {
        let a = to_pixel(a, image.width, image.height);
        let b = to_pixel(b, image.width, image.height);
        let c = to_pixel(c, image.width, image.height);
        let min_x = a.x.min(b.x).min(c.x).floor().max(0.0) as u32;
        let max_x = a.x.max(b.x).max(c.x).ceil().min((image.width - 1) as f32) as u32;
        let min_y = a.y.min(b.y).min(c.y).floor().max(0.0) as u32;
        let max_y = a.y.max(b.y).max(c.y).ceil().min((image.height - 1) as f32) as u32;
        let area = edge(a, b, c);
        if area.abs() <= f32::EPSILON {
            return;
        }

        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let p = Vec2::new(x as f32 + 0.5, y as f32 + 0.5);
                let w0 = edge(b, c, p);
                let w1 = edge(c, a, p);
                let w2 = edge(a, b, p);
                if (w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0)
                    || (w0 <= 0.0 && w1 <= 0.0 && w2 <= 0.0)
                {
                    image.set_pixel(x, y, color);
                }
            }
        }
    }

    fn to_pixel(point: Vec2, width: u32, height: u32) -> Vec2 {
        Vec2::new(
            point.x.clamp(0.0, 1.0) * (width - 1) as f32,
            point.y.clamp(0.0, 1.0) * (height - 1) as f32,
        )
    }

    fn edge(a: Vec2, b: Vec2, c: Vec2) -> f32 {
        (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)
    }

    fn color_for_mesh(index: usize) -> [u8; 4] {
        const COLORS: [[u8; 4]; 3] = [
            [224, 120, 136, 255],
            [96, 180, 214, 255],
            [178, 214, 112, 255],
        ];
        COLORS[index % COLORS.len()]
    }

    impl RasterImage {
        fn new(width: u32, height: u32) -> Self {
            Self {
                width,
                height,
                pixels: vec![[18, 18, 20, 255]; (width * height) as usize],
            }
        }

        fn set_pixel(&mut self, x: u32, y: u32, color: [u8; 4]) {
            let index = (y * self.width + x) as usize;
            if let Some(pixel) = self.pixels.get_mut(index) {
                *pixel = color;
            }
        }
    }

    fn compute_luma_ssim(left: &RasterImage, right: &RasterImage) -> f64 {
        assert_eq!((left.width, left.height), (right.width, right.height));
        let count = left.pixels.len() as f64;
        let left_luma = left.pixels.iter().map(luma).collect::<Vec<_>>();
        let right_luma = right.pixels.iter().map(luma).collect::<Vec<_>>();
        let mean_left = left_luma.iter().sum::<f64>() / count;
        let mean_right = right_luma.iter().sum::<f64>() / count;

        let mut variance_left = 0.0;
        let mut variance_right = 0.0;
        let mut covariance = 0.0;
        for (left, right) in left_luma.iter().zip(right_luma.iter()) {
            let dl = left - mean_left;
            let dr = right - mean_right;
            variance_left += dl * dl;
            variance_right += dr * dr;
            covariance += dl * dr;
        }
        variance_left /= count;
        variance_right /= count;
        covariance /= count;

        let c1 = (0.01_f64 * 255.0).powi(2);
        let c2 = (0.03_f64 * 255.0).powi(2);
        let numerator = (2.0 * mean_left * mean_right + c1) * (2.0 * covariance + c2);
        let denominator =
            (mean_left.powi(2) + mean_right.powi(2) + c1) * (variance_left + variance_right + c2);
        (numerator / denominator).clamp(0.0, 1.0)
    }

    fn luma(pixel: &[u8; 4]) -> f64 {
        0.299 * pixel[0] as f64 + 0.587 * pixel[1] as f64 + 0.114 * pixel[2] as f64
    }

    fn diff_image(left: &RasterImage, right: &RasterImage) -> RasterImage {
        assert_eq!((left.width, left.height), (right.width, right.height));
        let pixels = left
            .pixels
            .iter()
            .zip(right.pixels.iter())
            .map(|(left, right)| {
                let diff = left[0]
                    .abs_diff(right[0])
                    .max(left[1].abs_diff(right[1]))
                    .max(left[2].abs_diff(right[2]));
                [diff, 0, 255_u8.saturating_sub(diff), 255]
            })
            .collect();
        RasterImage {
            width: left.width,
            height: left.height,
            pixels,
        }
    }

    fn write_golden_diff_artifacts(
        fixture_id: &str,
        ssim: f64,
        reference: &RasterImage,
        native: &RasterImage,
        diff: &RasterImage,
    ) -> std::io::Result<PathBuf> {
        let artifact_dir = golden_artifact_root().join(fixture_id);
        fs::create_dir_all(&artifact_dir)?;
        write_ppm(&artifact_dir.join("reference.ppm"), reference)?;
        write_ppm(&artifact_dir.join("native.ppm"), native)?;
        write_ppm(&artifact_dir.join("diff.ppm"), diff)?;
        fs::write(
            artifact_dir.join("summary.json"),
            format!(
                "{{\n  \"fixture\": \"{}\",\n  \"ssim\": {:.8},\n  \"threshold\": {:.8}\n}}\n",
                fixture_id, ssim, GOLDEN_SSIM_THRESHOLD
            ),
        )?;
        Ok(artifact_dir)
    }

    fn golden_artifact_root() -> PathBuf {
        std::env::var_os("CARGO_TARGET_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target"))
            .join("golden-render-diffs")
    }

    fn write_ppm(path: &Path, image: &RasterImage) -> std::io::Result<()> {
        let mut bytes = format!("P6\n{} {}\n255\n", image.width, image.height).into_bytes();
        for pixel in &image.pixels {
            bytes.extend_from_slice(&pixel[..3]);
        }
        fs::write(path, bytes)
    }
}
