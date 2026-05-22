//! Contract-first native puppet draft creation for PSD, PNG, and Live2D sources.

use crate::moc3::native_conversion::{
    convert_moc3_to_native_project, Moc3ConversionAuxiliary, Moc3ToNativeDraft,
};
use crate::moc3::parser::Moc3Data;
use glam::Vec2;
use neko_engine_types::puppet::{
    NkpAnimationModel, NkpAutoRigMetadata, NkpBlendShapeDef, NkpBlendShapeLibrary,
    NkpControlDriver, NkpControlSource, NkpControlTarget, NkpDriverBlendMode, NkpDriverCurve,
    NkpImportSource, NkpImportSourceKind, NkpLayer, NkpLayerMesh, NkpProjectData, NkpPuppetSource,
    NkpSkeleton2D, NkpSkinWeights2D, NkpViewportState, PuppetFormat,
};
use std::collections::BTreeMap;

/// Supported native puppet creation source kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativePuppetCreationSourceKind {
    Psd,
    Png,
    Live2d,
}

/// High-level source metadata passed to the draft creator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativePuppetCreationSource {
    pub kind: NativePuppetCreationSourceKind,
    pub path: Option<String>,
    pub content_hash: Option<String>,
}

/// PSD layer analysis provided by a parser or AI analyzer.
#[derive(Debug, Clone, PartialEq)]
pub struct PsdLayerDraftInput {
    pub id: String,
    pub name: String,
    pub bounds: [f32; 4],
    pub semantic_tag: Option<String>,
}

/// PSD creation input after layer-aware analysis.
#[derive(Debug, Clone, PartialEq)]
pub struct PsdPuppetDraftInput {
    pub name: String,
    pub canvas_size: [f32; 2],
    pub layers: Vec<PsdLayerDraftInput>,
    pub source: NativePuppetCreationSource,
}

/// PNG creation input after segmentation or fixture fallback.
#[derive(Debug, Clone, PartialEq)]
pub struct PngPuppetDraftInput {
    pub name: String,
    pub image_size: [f32; 2],
    pub segments: Vec<PsdLayerDraftInput>,
    pub source: NativePuppetCreationSource,
}

/// Live2D creation input backed by parsed MOC3 plus optional auxiliary data.
#[derive(Debug)]
pub struct Live2dPuppetDraftInput {
    pub name: Option<String>,
    pub source: NativePuppetCreationSource,
    pub moc3: Moc3Data,
    pub auxiliary: Moc3ConversionAuxiliary,
}

/// Diagnostic severity for native draft creation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativePuppetCreationDiagnosticSeverity {
    Info,
    Warning,
    Error,
}

/// Machine-readable diagnostic emitted by draft creation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativePuppetCreationDiagnostic {
    pub severity: NativePuppetCreationDiagnosticSeverity,
    pub code: String,
    pub message: String,
}

/// Output of automatic native puppet creation.
#[derive(Debug, Clone)]
pub struct NativePuppetDraft {
    pub project: NkpProjectData,
    pub diagnostics: Vec<NativePuppetCreationDiagnostic>,
}

pub fn create_native_puppet_draft_from_psd(input: PsdPuppetDraftInput) -> NativePuppetDraft {
    let template = classify_template(&input.layers, input.canvas_size);
    let mut diagnostics = Vec::new();
    if input.layers.is_empty() {
        diagnostics.push(diagnostic(
            NativePuppetCreationDiagnosticSeverity::Warning,
            "psd-empty-layer-analysis",
            "PSD analysis contained no character layers; using a generated body layer",
        ));
    } else if is_partial_character_analysis(&input.layers) {
        diagnostics.push(diagnostic(
            NativePuppetCreationDiagnosticSeverity::Warning,
            "psd-partial-layer-analysis",
            "PSD analysis is missing a head or body layer; using the closest template fallback",
        ));
    }
    let analyzed_layers = if input.layers.is_empty() {
        generated_segments(input.canvas_size)
    } else {
        input.layers
    };
    let confidence = if diagnostics.is_empty() { 0.72 } else { 0.45 };

    NativePuppetDraft {
        project: build_template_project(
            input.name,
            input.canvas_size,
            analyzed_layers,
            input.source,
            template,
            confidence,
            "neko-auto-rig/psd-fixture",
        ),
        diagnostics,
    }
}

pub fn create_native_puppet_draft_from_png(input: PngPuppetDraftInput) -> NativePuppetDraft {
    let mut diagnostics = Vec::new();
    if input.segments.is_empty() {
        diagnostics.push(diagnostic(
            NativePuppetCreationDiagnosticSeverity::Warning,
            "png-segmentation-fallback",
            "PNG analysis contained no segments; using template fallback segments",
        ));
    }
    let segments = if input.segments.is_empty() {
        generated_segments(input.image_size)
    } else {
        input.segments
    };
    let template = classify_template(&segments, input.image_size);
    let confidence = if diagnostics.is_empty() { 0.62 } else { 0.38 };

    NativePuppetDraft {
        project: build_template_project(
            input.name,
            input.image_size,
            segments,
            input.source,
            template,
            confidence,
            "neko-auto-rig/png-fixture",
        ),
        diagnostics,
    }
}

pub fn create_native_puppet_draft_from_live2d(input: Live2dPuppetDraftInput) -> NativePuppetDraft {
    let display_name = input.name.clone();
    let Moc3ToNativeDraft {
        mut project,
        diagnostics: conversion_diagnostics,
    } = convert_moc3_to_native_project(&input.moc3, input.source.path.clone(), input.auxiliary);
    if let Some(name) = display_name {
        project.name = name;
    }
    project.puppet.import_source = Some(import_source(&input.source));
    project.auto_rig = Some(NkpAutoRigMetadata {
        template: "live2d_conversion".to_string(),
        generated_by: "neko-auto-rig/live2d-converter".to_string(),
        confidence: if conversion_diagnostics.is_empty() {
            0.68
        } else {
            0.52
        },
        model_version: None,
        user_adjusted: vec![],
        source_kind: Some(NkpImportSourceKind::Live2dBundle),
    });

    NativePuppetDraft {
        project,
        diagnostics: conversion_diagnostics
            .into_iter()
            .map(|diagnostic| NativePuppetCreationDiagnostic {
                severity: NativePuppetCreationDiagnosticSeverity::Warning,
                code: diagnostic.code,
                message: diagnostic.message,
            })
            .collect(),
    }
}

pub fn record_auto_rig_user_adjustment(project: &mut NkpProjectData, element: impl Into<String>) {
    let auto_rig = project.auto_rig.get_or_insert_with(|| NkpAutoRigMetadata {
        template: "custom".to_string(),
        generated_by: "manual".to_string(),
        confidence: 0.0,
        model_version: None,
        user_adjusted: vec![],
        source_kind: project
            .puppet
            .import_source
            .as_ref()
            .map(|source| source.kind),
    });
    let element = element.into();
    if !auto_rig.user_adjusted.iter().any(|item| item == &element) {
        auto_rig.user_adjusted.push(element);
    }
}

fn build_template_project(
    name: String,
    size: [f32; 2],
    layers: Vec<PsdLayerDraftInput>,
    source: NativePuppetCreationSource,
    template: String,
    confidence: f32,
    generated_by: &str,
) -> NkpProjectData {
    let bones = template_bones(&template, size);
    let head_bone_index = bones
        .iter()
        .position(|bone| bone.id == "bone-head")
        .unwrap_or(0) as u16;
    let root_bone_index = 0_u16;
    let nkp_layers: Vec<NkpLayer> = layers
        .iter()
        .enumerate()
        .map(|(index, layer)| layer_to_nkp_layer(layer, index, head_bone_index, root_bone_index))
        .collect();
    let face_mesh_id = nkp_layers
        .iter()
        .find(|layer| layer.id.contains("head") || layer.name.as_deref() == Some("head"))
        .map(|layer| layer.mesh.id.clone())
        .or_else(|| nkp_layers.first().map(|layer| layer.mesh.id.clone()))
        .unwrap_or_else(|| "mesh-body".to_string());
    let face_vertex_count = nkp_layers
        .iter()
        .find(|layer| layer.mesh.id == face_mesh_id)
        .map(|layer| layer.mesh.vertices.len())
        .unwrap_or(4);

    NkpProjectData {
        version: "2.0".to_string(),
        name,
        puppet: NkpPuppetSource {
            src: None,
            format: Some(PuppetFormat::Native),
            animation_model: Some(NkpAnimationModel::BoneBlendshape),
            import_source: Some(import_source(&source)),
            bundle: None,
        },
        layers: nkp_layers,
        skeleton: Some(NkpSkeleton2D {
            bones,
            ik_constraints: vec![],
            path_constraints: vec![],
            spring_bones: vec![],
        }),
        blend_shapes: Some(template_blend_shapes(&face_mesh_id, face_vertex_count)),
        control_drivers: vec![jaw_driver()],
        expressions: BTreeMap::from([(
            "happy".to_string(),
            BTreeMap::from([
                ("mouthSmileLeft".to_string(), 0.7),
                ("jawOpen".to_string(), 0.15),
            ]),
        )]),
        animations: vec![],
        auto_rig: Some(NkpAutoRigMetadata {
            template,
            generated_by: generated_by.to_string(),
            confidence,
            model_version: None,
            user_adjusted: vec![],
            source_kind: Some(source_kind_to_import(source.kind)),
        }),
        parameters: BTreeMap::new(),
        face_parameters: BTreeMap::new(),
        viewport: NkpViewportState { zoom: 1.0 },
    }
}

fn layer_to_nkp_layer(
    layer: &PsdLayerDraftInput,
    index: usize,
    head_bone_index: u16,
    root_bone_index: u16,
) -> NkpLayer {
    let [x, y, width, height] = layer.bounds;
    let id = stable_id("layer", &layer.id);
    let mesh_id = stable_id("mesh", &layer.id);
    let vertices = vec![
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
    ];
    let target_bone = if is_head_like(layer) {
        head_bone_index
    } else {
        root_bone_index
    };

    NkpLayer {
        id,
        name: Some(layer.name.clone()),
        texture_ref: format!("source-layer://{}", layer.id),
        mesh: NkpLayerMesh {
            id: mesh_id.clone(),
            vertices,
            uvs: vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            triangles: vec![[0, 1, 2], [0, 2, 3]],
        },
        blend_mode: Some("normal".to_string()),
        opacity: Some(1.0),
        z_order: Some(index as f32),
        skin_weights: Some(NkpSkinWeights2D {
            mesh_id,
            joint_indices: vec![[target_bone, 0, 0, 0]; 4],
            joint_weights: vec![[1.0, 0.0, 0.0, 0.0]; 4],
        }),
    }
}

fn template_bones(template: &str, size: [f32; 2]) -> Vec<neko_engine_types::puppet::NkpBone2D> {
    let half_width = size[0] * 0.5;
    let center_y = size[1] * 0.5;
    let head_y = size[1] * 0.28;
    let limb_scale = if template == "humanoid_chibi" {
        0.12
    } else {
        0.18
    };
    let mut bones = vec![
        bone(
            "bone-root",
            "root",
            None,
            [half_width, center_y],
            size[1] * 0.25,
        ),
        bone(
            "bone-spine",
            "spine",
            Some("bone-root"),
            [0.0, -size[1] * 0.18],
            size[1] * 0.18,
        ),
        bone(
            "bone-head",
            "head",
            Some("bone-spine"),
            [0.0, head_y - center_y],
            size[1] * 0.16,
        ),
    ];
    bones.extend([
        bone(
            "bone-arm-l",
            "arm_L",
            Some("bone-spine"),
            [-size[0] * limb_scale, -size[1] * 0.08],
            size[0] * limb_scale,
        ),
        bone(
            "bone-arm-r",
            "arm_R",
            Some("bone-spine"),
            [size[0] * limb_scale, -size[1] * 0.08],
            size[0] * limb_scale,
        ),
    ]);
    if template == "humanoid_full" {
        bones.extend([
            bone(
                "bone-leg-l",
                "leg_L",
                Some("bone-root"),
                [-size[0] * 0.08, size[1] * 0.18],
                size[1] * 0.22,
            ),
            bone(
                "bone-leg-r",
                "leg_R",
                Some("bone-root"),
                [size[0] * 0.08, size[1] * 0.18],
                size[1] * 0.22,
            ),
            bone(
                "bone-foot-l",
                "foot_L",
                Some("bone-leg-l"),
                [-size[0] * 0.03, size[1] * 0.18],
                size[0] * 0.08,
            ),
            bone(
                "bone-foot-r",
                "foot_R",
                Some("bone-leg-r"),
                [size[0] * 0.03, size[1] * 0.18],
                size[0] * 0.08,
            ),
        ]);
    }
    bones
}

fn bone(
    id: &str,
    name: &str,
    parent: Option<&str>,
    position: [f32; 2],
    length: f32,
) -> neko_engine_types::puppet::NkpBone2D {
    neko_engine_types::puppet::NkpBone2D {
        id: id.to_string(),
        name: name.to_string(),
        parent: parent.map(ToString::to_string),
        position,
        rotation: Some(0.0),
        scale: None,
        length: Some(length),
    }
}

fn template_blend_shapes(mesh_id: &str, vertex_count: usize) -> NkpBlendShapeLibrary {
    NkpBlendShapeLibrary {
        standard: Some(neko_engine_types::puppet::NkpBlendShapeStandard::Arkit52),
        implemented: vec!["jawOpen".to_string(), "mouthSmileLeft".to_string()],
        shapes: vec![
            shape(mesh_id, "jawOpen", vertex_count, Vec2::new(0.0, 2.0)),
            shape(
                mesh_id,
                "mouthSmileLeft",
                vertex_count,
                Vec2::new(-1.0, 0.5),
            ),
        ],
        custom: vec![],
        aliases: BTreeMap::new(),
    }
}

fn shape(mesh_id: &str, name: &str, vertex_count: usize, delta: Vec2) -> NkpBlendShapeDef {
    NkpBlendShapeDef {
        id: Some(format!("shape-{}", name)),
        name: name.to_string(),
        mesh_id: mesh_id.to_string(),
        vertex_deltas: vec![delta.to_array(); vertex_count],
        post_skin: None,
    }
}

fn jaw_driver() -> NkpControlDriver {
    NkpControlDriver {
        id: "driver-jaw-open".to_string(),
        source: NkpControlSource::Blendshape {
            name: "jawOpen".to_string(),
        },
        target: NkpControlTarget::BoneRotation {
            bone: "bone-head".to_string(),
            axis: neko_engine_types::puppet::NkpAxis2D::Z,
        },
        curve: NkpDriverCurve::Linear {
            scale: Some(12.0),
            offset: None,
        },
        blend_mode: NkpDriverBlendMode::Add,
        priority: 0,
    }
}

fn classify_template(layers: &[PsdLayerDraftInput], size: [f32; 2]) -> String {
    if size[1] <= size[0] * 1.2 {
        return "humanoid_chibi".to_string();
    }
    if layers.iter().any(|layer| {
        layer
            .semantic_tag
            .as_deref()
            .or(Some(layer.name.as_str()))
            .map(|name| name.to_ascii_lowercase())
            .is_some_and(|name| name.contains("leg") || name.contains("foot"))
    }) {
        "humanoid_full".to_string()
    } else {
        "humanoid_upper".to_string()
    }
}

fn generated_segments(size: [f32; 2]) -> Vec<PsdLayerDraftInput> {
    vec![
        PsdLayerDraftInput {
            id: "generated-body".to_string(),
            name: "body".to_string(),
            bounds: [size[0] * 0.3, size[1] * 0.35, size[0] * 0.4, size[1] * 0.45],
            semantic_tag: Some("body".to_string()),
        },
        PsdLayerDraftInput {
            id: "generated-head".to_string(),
            name: "head".to_string(),
            bounds: [
                size[0] * 0.32,
                size[1] * 0.1,
                size[0] * 0.36,
                size[1] * 0.28,
            ],
            semantic_tag: Some("head".to_string()),
        },
    ]
}

fn is_head_like(layer: &PsdLayerDraftInput) -> bool {
    let label = layer
        .semantic_tag
        .as_deref()
        .unwrap_or(&layer.name)
        .to_ascii_lowercase();
    label.contains("head") || label.contains("face") || label.contains("hair")
}

fn is_body_like(layer: &PsdLayerDraftInput) -> bool {
    let label = layer
        .semantic_tag
        .as_deref()
        .unwrap_or(&layer.name)
        .to_ascii_lowercase();
    label.contains("body") || label.contains("torso") || label.contains("spine")
}

fn is_partial_character_analysis(layers: &[PsdLayerDraftInput]) -> bool {
    let has_head = layers.iter().any(is_head_like);
    let has_body = layers.iter().any(is_body_like);
    !(has_head && has_body)
}

fn import_source(source: &NativePuppetCreationSource) -> NkpImportSource {
    NkpImportSource {
        kind: source_kind_to_import(source.kind),
        path: source.path.clone(),
        content_hash: source.content_hash.clone(),
        metadata: None,
    }
}

fn source_kind_to_import(kind: NativePuppetCreationSourceKind) -> NkpImportSourceKind {
    match kind {
        NativePuppetCreationSourceKind::Psd => NkpImportSourceKind::Psd,
        NativePuppetCreationSourceKind::Png => NkpImportSourceKind::Png,
        NativePuppetCreationSourceKind::Live2d => NkpImportSourceKind::Live2dBundle,
    }
}

fn stable_id(prefix: &str, value: &str) -> String {
    let slug = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if slug.is_empty() {
        prefix.to_string()
    } else {
        format!("{}-{}", prefix, slug)
    }
}

fn diagnostic(
    severity: NativePuppetCreationDiagnosticSeverity,
    code: &str,
    message: &str,
) -> NativePuppetCreationDiagnostic {
    NativePuppetCreationDiagnostic {
        severity,
        code: code.to_string(),
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::moc3::parser::{
        DeformerType, ElementCounts, Moc3ArtMesh, Moc3Data, Moc3Deformer, Moc3KeyformBinding,
        Moc3KeyformPositionSource, Moc3Parameter, Moc3ParameterBinding, Moc3RotationDeformer,
    };
    use crate::native;
    use glam::Vec2;

    #[test]
    fn creates_psd_layer_aware_native_draft() {
        let draft = create_native_puppet_draft_from_psd(PsdPuppetDraftInput {
            name: "PSD Girl".to_string(),
            canvas_size: [512.0, 768.0],
            layers: vec![
                layer("body", "body", [160.0, 280.0, 180.0, 320.0], "body"),
                layer("head", "head", [170.0, 96.0, 160.0, 180.0], "head"),
            ],
            source: source(NativePuppetCreationSourceKind::Psd),
        });

        assert!(draft.diagnostics.is_empty());
        assert_eq!(draft.project.puppet.format, Some(PuppetFormat::Native));
        assert_eq!(
            draft.project.auto_rig.as_ref().unwrap().template,
            "humanoid_upper"
        );
        assert!(has_bone(&draft.project, "bone-arm-l"));
        assert!(!has_bone(&draft.project, "bone-leg-l"));
        native::validate_native_project(&draft.project).unwrap();
    }

    #[test]
    fn creates_full_body_humanoid_auto_rig_fixture() {
        let draft = create_native_puppet_draft_from_psd(PsdPuppetDraftInput {
            name: "Full Body".to_string(),
            canvas_size: [512.0, 1024.0],
            layers: vec![
                layer("body", "body", [160.0, 320.0, 180.0, 360.0], "body"),
                layer("head", "head", [176.0, 96.0, 160.0, 180.0], "head"),
                layer("leg-l", "left leg", [184.0, 656.0, 56.0, 248.0], "leg"),
                layer("foot-l", "left foot", [160.0, 904.0, 96.0, 48.0], "foot"),
            ],
            source: source(NativePuppetCreationSourceKind::Psd),
        });

        assert!(draft.diagnostics.is_empty());
        assert_eq!(
            draft.project.auto_rig.as_ref().unwrap().template,
            "humanoid_full"
        );
        assert!(has_bone(&draft.project, "bone-leg-l"));
        assert!(has_bone(&draft.project, "bone-foot-l"));
        native::validate_native_project(&draft.project).unwrap();
    }

    #[test]
    fn creates_png_fallback_native_draft_with_diagnostic() {
        let draft = create_native_puppet_draft_from_png(PngPuppetDraftInput {
            name: "PNG Fixture".to_string(),
            image_size: [512.0, 512.0],
            segments: vec![],
            source: source(NativePuppetCreationSourceKind::Png),
        });

        assert!(draft
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "png-segmentation-fallback"));
        assert_eq!(
            draft.project.auto_rig.as_ref().unwrap().template,
            "humanoid_chibi"
        );
        assert!(has_bone(&draft.project, "bone-arm-l"));
        assert!(!has_bone(&draft.project, "bone-leg-l"));
        native::validate_native_project(&draft.project).unwrap();
    }

    #[test]
    fn creates_partial_psd_fallback_with_warning() {
        let draft = create_native_puppet_draft_from_psd(PsdPuppetDraftInput {
            name: "Partial".to_string(),
            canvas_size: [512.0, 768.0],
            layers: vec![layer("hair", "hair", [160.0, 80.0, 192.0, 220.0], "hair")],
            source: source(NativePuppetCreationSourceKind::Psd),
        });

        assert!(draft
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "psd-partial-layer-analysis"));
        assert_eq!(
            draft.project.auto_rig.as_ref().unwrap().template,
            "humanoid_upper"
        );
        native::validate_native_project(&draft.project).unwrap();
    }

    #[test]
    fn creates_live2d_native_draft_through_moc3_conversion() {
        let draft = create_native_puppet_draft_from_live2d(Live2dPuppetDraftInput {
            name: Some("Converted Avatar".to_string()),
            source: NativePuppetCreationSource {
                kind: NativePuppetCreationSourceKind::Live2d,
                path: Some("./models/avatar.zip".to_string()),
                content_hash: Some("sha256:live2d-fixture".to_string()),
            },
            moc3: fixture_moc3_with_rotation(),
            auxiliary: Default::default(),
        });

        assert!(draft.diagnostics.is_empty());
        assert_eq!(draft.project.name, "Converted Avatar");
        assert_eq!(
            draft.project.puppet.import_source.as_ref().unwrap().kind,
            NkpImportSourceKind::Live2dBundle
        );
        assert_eq!(
            draft.project.puppet.import_source.as_ref().unwrap().path,
            Some("./models/avatar.zip".to_string())
        );
        assert_eq!(
            draft.project.auto_rig.as_ref().unwrap().template,
            "live2d_conversion"
        );
        assert!(has_bone(&draft.project, "bone-RotHead"));
        assert!(draft
            .project
            .blend_shapes
            .as_ref()
            .unwrap()
            .shapes
            .iter()
            .any(|shape| shape.mesh_id == "MeshFace"));
        native::validate_native_project(&draft.project).unwrap();
    }

    #[test]
    fn records_auto_rig_user_adjustments_once() {
        let mut draft = create_native_puppet_draft_from_psd(PsdPuppetDraftInput {
            name: "Adjusted".to_string(),
            canvas_size: [512.0, 768.0],
            layers: vec![layer("head", "head", [170.0, 96.0, 160.0, 180.0], "head")],
            source: source(NativePuppetCreationSourceKind::Psd),
        });

        record_auto_rig_user_adjustment(&mut draft.project, "bone:bone-head");
        record_auto_rig_user_adjustment(&mut draft.project, "bone:bone-head");

        assert_eq!(
            draft.project.auto_rig.as_ref().unwrap().user_adjusted,
            vec!["bone:bone-head".to_string()]
        );
    }

    fn layer(id: &str, name: &str, bounds: [f32; 4], semantic: &str) -> PsdLayerDraftInput {
        PsdLayerDraftInput {
            id: id.to_string(),
            name: name.to_string(),
            bounds,
            semantic_tag: Some(semantic.to_string()),
        }
    }

    fn source(kind: NativePuppetCreationSourceKind) -> NativePuppetCreationSource {
        NativePuppetCreationSource {
            kind,
            path: Some("./character.source".to_string()),
            content_hash: Some("sha256:fixture".to_string()),
        }
    }

    fn has_bone(project: &NkpProjectData, id: &str) -> bool {
        project
            .skeleton
            .as_ref()
            .is_some_and(|skeleton| skeleton.bones.iter().any(|bone| bone.id == id))
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
}
